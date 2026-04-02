import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { initDb, getDb } from './server/db.js'
import { encrypt, decrypt } from './server/crypto.js'
import { NEW_USER_LOG } from './server/log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const IS_PROD = process.env.NODE_ENV === 'production'
const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD
  ? (() => { throw new Error('JWT_SECRET env var is required in production') })()
  : 'dev-secret-change-in-production')

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
const rateLimitMap = new Map()
function rateLimit(key, maxAttempts = 5, windowMs = 60_000) {
  const now = Date.now()
  const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs }
  entry.count++
  rateLimitMap.set(key, entry)
  return entry.count > maxAttempts
}
// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of rateLimitMap) if (now > v.resetAt) rateLimitMap.delete(k)
}, 300_000)

const COACH_SYSTEM_PROMPT = `You are a personal running coach. You are scientific, direct, and never sycophantic. You base every recommendation on proven training principles (Daniels, Seiler, Galloway, Hawley).

TONE RULES:
- Direct and specific. Never vague.
- No praise for doing the obvious.
- Name mistakes clearly with their physiological consequence.
- Never open with compliments. Never close with "great job".
- Use data, not feelings.

SCIENCE REQUIREMENT:
Every prescribed session must include a 2-4 sentence explanation of the physiological principle. State the mechanism and cite the source (e.g. Holloszy, 1967; Seiler, 2010).

KEY PRINCIPLES:
1. Connective tissue adapts 3-5x slower than cardiovascular fitness (Magnusson et al., 2010).
2. 80/20 rule: 80% Z2, 20% harder (Seiler, 2010).
3. 10% rule: never increase weekly volume >10-15% (Buist et al., 2010).
4. Adjust HR targets down 5-8 bpm in heat (30C+).

ACTIVITY LOGGING — MANDATORY RULE:
When the user reports completing ANY activity (yoga, run, cycling, functional training, rest day, strength, walk, etc.):
1. Add it to the Activity Log table in the training log. Use the EXACT column order: Date | Day | Type | Distance | Avg Pace | Avg HR | Max HR | Avg Cadence | Notes. Use — for missing fields.
2. Keep existing rows exactly as-is. Only ADD the new row. Do not reformat, truncate, or rearrange existing entries.
3. Acknowledge briefly and note any training implications.
4. YOU MUST ALWAYS include the FULL updated training log in a markdown code block at the END of your response, even if the only change is one new row. No exceptions. Format:
\`\`\`markdown
[FULL UPDATED TRAINING LOG HERE]
\`\`\`

If you do not include this block, the activity will not be saved. Always include it.

ONBOARDING:
If the training log shows "Not yet configured", guide the user through setting up their profile by asking:
- Name, age, weight, height, location
- Running history and best performance
- Time away from running, current injuries
- Goal distance, pace, and target date
- Weekly training availability and cross-training
Then write their full training log in the markdown code block.

The athlete's full training log is provided below. Use it for all responses.`

const UPLOAD_SYSTEM_PROMPT = `You are a personal running coach. You are scientific, direct, and never sycophantic.

TONE RULES:
- Direct and specific. Never vague.
- No praise for doing the obvious.
- Name mistakes clearly with their physiological consequence.
- Never open with compliments. Never close with "great job".
- Use data, not feelings.

When given a Garmin CSV activity file, you must:

1. ANALYZE the run:
   - Parse km splits: pace and HR per km
   - Identify HR drift (km1 HR vs last km HR — >25 bpm drift = went out too hard)
   - Identify max HR vs zone boundaries
   - Identify cadence trend (target 170+ spm)
   - State clearly whether the athlete stayed in the prescribed zone
   - State the physiological consequence of any zone violation

2. PRESCRIBE the next session:
   - Based on this run AND the current training log
   - Include: distance, HR target, estimated pace, execution cue, science rationale (2-4 sentences with citation)
   - Format under a "## NEXT PRESCRIBED SESSION" heading

3. UPDATE the training log:
   - Provide the FULL updated training log in a markdown code block
   - Add this run to the Activity Log table
   - Update Coach Notes
   - Rewrite Prescribed Sessions with the new prescription

Key principles:
- Connective tissue adapts 3-5x slower than cardio (Magnusson et al., 2010)
- 80/20 rule: 80% Z2 (Seiler, 2010)
- 10% weekly volume increase max (Buist et al., 2010)
- Heat: adjust HR targets down 5-8 bpm in 30C+`

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: '4mb' }))
if (!IS_PROD) app.use(cors({ origin: 'http://localhost:5173' }))

// ── Auth middleware ────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ── Auth routes ────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown'
  if (rateLimit(`signup:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' })

  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  const hash = await bcrypt.hash(password, 12)
  const id = randomUUID()
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(id, email.toLowerCase(), hash, Date.now())

  const token = jwt.sign({ sub: id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, email: email.toLowerCase(), id })
})

app.post('/api/auth/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown'
  if (rateLimit(`login:${ip}`, 10)) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' })

  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const db = getDb()
  const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email.toLowerCase())
  if (!user) return res.status(401).json({ error: 'Invalid email or password' })

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, email: user.email, id: user.id })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email, id: req.user.sub })
})

// ── Markdown parser ────────────────────────────────────────────────────────────

function getSection(log, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match ## Heading (with optional trailing text), handle --- separators too
  const match = log.match(new RegExp(`## ${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n---\\n|\\n## |$)`))
  return match ? match[1].trim() : ''
}

function parseTable(text) {
  const lines = text.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 3) return []
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  return lines.slice(2)
    .map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean)
      const obj = {}
      headers.forEach((h, i) => { obj[h] = cells[i] || '' })
      return obj
    })
    .filter(row => Object.values(row).some(v => v && v !== '—' && v !== '-'))
}

// Normalize activity row keys — Claude may use different column names
function normalizeActivity(act) {
  const get = (...keys) => { for (const k of keys) if (act[k]) return act[k]; return '' }
  return {
    Date:       get('Date', 'date'),
    Day:        get('Day', 'day'),
    Type:       get('Type', 'type', 'Activity', 'Session'),
    Distance:   get('Distance', 'distance', 'Dist'),
    'Avg Pace': get('Avg Pace', 'Pace', 'pace', 'Average Pace'),
    'Avg HR':   get('Avg HR', 'HR', 'avg_hr', 'Average HR', 'Heart Rate'),
    'Max HR':   get('Max HR', 'max_hr', 'Max Heart Rate'),
    'Avg Cadence': get('Avg Cadence', 'Cadence', 'cadence'),
    Notes:      get('Notes', 'notes', 'Comment'),
  }
}

function parseLogToDashboard(log) {
  const profileSection = getSection(log, 'Athlete Profile')
  const profileRows = parseTable(profileSection)
  const profile = {}
  profileRows.forEach(r => {
    // Support both "Field/Value" and "Metric/Value" column names
    const key = r.Field || r.Metric || r.Item
    const val = r.Value || r.Data
    if (key && val) profile[key] = val
  })

  // isNewUser only if profile is completely empty AND goal is unconfigured
  const hasProfileData = Object.values(profile).some(v => v && v !== '—' && v !== '-')
  const isNewUser = !hasProfileData && (!goalMatch || goalMatch[1]?.includes('Not yet configured'))

  const zones = parseTable(getSection(log, 'Training Zones'))

  const activities = parseTable(getSection(log, 'Activity Log'))
    .map(normalizeActivity)
    .filter(a => a.Date && a.Date !== '—' && a.Date !== '-')
    .reverse()

  const goalMatch = log.match(/\*\*Goal:\*\*\s*(.+)/)
  const phaseMatch = log.match(/\*\*Current Phase:\*\*\s*(.+)/)
  const weekMatch = log.match(/\*\*Current Week:\*\*\s*(.+)/)

  return {
    isNewUser,
    profile,
    goal: goalMatch?.[1]?.trim() || '—',
    phase: phaseMatch?.[1]?.trim() || '—',
    currentWeek: weekMatch?.[1]?.trim() || null,
    zones,
    activities,
    prescription: getSection(log, 'Prescribed Sessions'),
    coachNotes: getSection(log, 'Coach Notes'),
  }
}

app.get('/api/dashboard', requireAuth, (req, res) => {
  const row = getDb().prepare('SELECT content FROM training_logs WHERE user_id = ?').get(req.user.sub)
  const log = row?.content || NEW_USER_LOG
  const parsed = parseLogToDashboard(log)
  const garmin = getUserGarminTokens(req.user.sub)
  parsed.hasGarminTokens = !!garmin.oauth2?.access_token
  res.json(parsed)
})

// ── Training log ───────────────────────────────────────────────────────────────

app.get('/api/training-log', requireAuth, (req, res) => {
  const row = getDb().prepare('SELECT content FROM training_logs WHERE user_id = ?').get(req.user.sub)
  res.json({ content: row?.content || NEW_USER_LOG })
})

app.post('/api/training-log', requireAuth, (req, res) => {
  const { content } = req.body
  getDb().prepare('INSERT OR REPLACE INTO training_logs (user_id, content, updated_at) VALUES (?, ?, ?)').run(req.user.sub, content, Date.now())
  res.json({ ok: true })
})

// ── Settings ───────────────────────────────────────────────────────────────────

function getSettings(userId) {
  return getDb().prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) || {}
}

function getUserApiKey(userId) {
  const s = getSettings(userId)
  if (!s.anthropic_api_key) return null
  try { return decrypt(s.anthropic_api_key) } catch { return null }
}

function getUserGarminTokens(userId) {
  const s = getSettings(userId)
  const result = {}
  if (s.garmin_oauth1_token) try { result.oauth1 = JSON.parse(decrypt(s.garmin_oauth1_token)) } catch {}
  if (s.garmin_oauth2_token) try { result.oauth2 = JSON.parse(decrypt(s.garmin_oauth2_token)) } catch {}
  return result
}

app.get('/api/settings', requireAuth, (req, res) => {
  const s = getSettings(req.user.sub)
  res.json({
    hasAnthropicKey: !!s.anthropic_api_key,
    hasGarminOauth1: !!s.garmin_oauth1_token,
    hasGarminOauth2: !!s.garmin_oauth2_token,
    email: req.user.email,
  })
})

app.post('/api/settings', requireAuth, (req, res) => {
  const { anthropicApiKey, garminOauth1Token, garminOauth2Token } = req.body
  const s = getSettings(req.user.sub)

  const ak = anthropicApiKey !== undefined ? (anthropicApiKey ? encrypt(anthropicApiKey) : null) : s.anthropic_api_key
  const o1 = garminOauth1Token !== undefined ? (garminOauth1Token ? encrypt(garminOauth1Token) : null) : s.garmin_oauth1_token
  const o2 = garminOauth2Token !== undefined ? (garminOauth2Token ? encrypt(garminOauth2Token) : null) : s.garmin_oauth2_token

  getDb().prepare('INSERT OR REPLACE INTO user_settings (user_id, anthropic_api_key, garmin_oauth1_token, garmin_oauth2_token, updated_at) VALUES (?, ?, ?, ?, ?)').run(req.user.sub, ak, o1, o2, Date.now())
  res.json({ ok: true })
})

// ── Coach chat ─────────────────────────────────────────────────────────────────

app.post('/api/ask-coach', requireAuth, async (req, res) => {
  const apiKey = getUserApiKey(req.user.sub)
  if (!apiKey) return res.status(503).json({ answer: 'No Anthropic API key configured. Go to [SETTINGS] and add your API key.' })

  const { question, history = [] } = req.body
  const logRow = getDb().prepare('SELECT content FROM training_logs WHERE user_id = ?').get(req.user.sub)
  const log = logRow?.content || NEW_USER_LOG
  const client = new Anthropic({ apiKey })

  const safeHistory = []
  for (const m of history) {
    if (safeHistory.length === 0 || safeHistory[safeHistory.length - 1].role !== m.role) {
      safeHistory.push({ role: m.role, content: m.content })
    }
  }

  // Stream via SSE so Railway's 60s proxy timeout doesn't kill long responses
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')

  function send(obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`) }

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      system: COACH_SYSTEM_PROMPT + '\n\n---\nTRAINING LOG:\n' + log,
      messages: [...safeHistory, { role: 'user', content: question }],
    })

    let fullText = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text
        send({ chunk: event.delta.text })
      }
    }

    // Extract and save updated training log
    const logMatch = fullText.match(/```(?:markdown)?\s*\r?\n([\s\S]*?)```/)
    const truncatedMatch = !logMatch && fullText.match(/```(?:markdown)?\s*\r?\n([\s\S]+)$/)
    const extracted = logMatch?.[1] || truncatedMatch?.[1]
    if (extracted) {
      getDb().prepare('INSERT OR REPLACE INTO training_logs (user_id, content, updated_at) VALUES (?, ?, ?)').run(req.user.sub, extracted.trim(), Date.now())
    }

    send({ done: true, logUpdated: !!(logMatch || truncatedMatch) })
    res.end()
  } catch (e) {
    send({ error: e.message })
    res.end()
  }
})

// ── Upload activity (CSV analysis) ────────────────────────────────────────────

app.post('/api/upload-activity', requireAuth, async (req, res) => {
  const apiKey = getUserApiKey(req.user.sub)
  if (!apiKey) return res.status(503).json({ error: 'No Anthropic API key configured. Go to [SETTINGS].' })

  const { csv, filename } = req.body
  if (!csv) return res.status(400).json({ error: 'No CSV data' })

  const logRow = getDb().prepare('SELECT content FROM training_logs WHERE user_id = ?').get(req.user.sub)
  const log = logRow?.content || NEW_USER_LOG
  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: UPLOAD_SYSTEM_PROMPT + '\n\n---\nCURRENT TRAINING LOG:\n' + log,
      messages: [{ role: 'user', content: `Analyze this Garmin CSV activity (filename: ${filename}):\n\n\`\`\`csv\n${csv.slice(0, 8000)}\n\`\`\`` }],
    })

    const text = response.content[0]?.text || ''
    const prescMatch = text.match(/## NEXT PRESCRIBED SESSION([\s\S]*?)(?=##|$)/)
    const logMatch = text.match(/```(?:markdown)?\s*\r?\n([\s\S]*?)```/)
    const truncatedMatch = !logMatch && text.match(/```(?:markdown)?\s*\r?\n([\s\S]+)$/)
    const extracted = logMatch?.[1] || truncatedMatch?.[1]
    if (extracted) {
      getDb().prepare('INSERT OR REPLACE INTO training_logs (user_id, content, updated_at) VALUES (?, ?, ?)').run(req.user.sub, extracted.trim(), Date.now())
    }

    res.json({
      analysis: text.replace(/```(?:markdown)?\s*\r?\n[\s\S]*?```/g, '').replace(/```(?:markdown)?\s*\r?\n[\s\S]+$/, '').trim(),
      prescription: prescMatch ? prescMatch[0].trim() : '',
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Push workout to Garmin ─────────────────────────────────────────────────────

function buildEasyRunWorkout(name, distanceMeters, hrMin, hrMax) {
  const date = new Date().toISOString().split('T')[0]
  return {
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutName: `${name} [${date}]`,
    estimatedDurationInSecs: Math.round(distanceMeters * 0.42),
    estimatedDistanceInMeters: distanceMeters,
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      workoutSteps: [
        { stepOrder: 1, stepType: { stepTypeId: 1, stepTypeKey: 'warmup' }, childStepId: null, description: 'Walk warm-up', endCondition: { conditionTypeId: 2, conditionTypeKey: 'time' }, endConditionValue: 240, targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' }, targetValueOne: null, targetValueTwo: null },
        { stepOrder: 2, stepType: { stepTypeId: 3, stepTypeKey: 'interval' }, childStepId: null, description: `Z2 easy run — HR ${hrMin}-${hrMax} bpm`, endCondition: { conditionTypeId: 3, conditionTypeKey: 'distance' }, endConditionValue: distanceMeters, targetType: { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.zone' }, targetValueOne: hrMin + 100, targetValueTwo: hrMax + 100 },
        { stepOrder: 3, stepType: { stepTypeId: 2, stepTypeKey: 'cooldown' }, childStepId: null, description: 'Walk cool-down', endCondition: { conditionTypeId: 2, conditionTypeKey: 'time' }, endConditionValue: 240, targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' }, targetValueOne: null, targetValueTwo: null },
      ],
    }],
  }
}

app.post('/api/push-workout', requireAuth, async (req, res) => {
  const apiKey = getUserApiKey(req.user.sub)
  if (!apiKey) return res.status(503).json({ error: 'No Anthropic API key configured. Go to [SETTINGS].' })

  const garmin = getUserGarminTokens(req.user.sub)
  if (!garmin.oauth2?.access_token) return res.status(503).json({ error: 'Garmin tokens not configured. Go to [SETTINGS].' })

  const { prescription } = req.body
  const client = new Anthropic({ apiKey })

  const extract = await client.messages.create({
    model: 'claude-haiku-4-5', max_tokens: 200,
    messages: [{ role: 'user', content: `Extract workout parameters from this prescription. Respond with JSON only:\n{"distanceMeters":<number>,"hrMin":<number>,"hrMax":<number>,"name":"<short name>"}\n\n${prescription}` }],
  })

  let params
  try { params = JSON.parse(extract.content[0].text.match(/\{[\s\S]*\}/)[0]) }
  catch { params = { distanceMeters: 4500, hrMin: 130, hrMax: 142, name: 'Z2 Easy Run' } }

  const workout = buildEasyRunWorkout(params.name, params.distanceMeters, params.hrMin, params.hrMax)

  const garminRes = await fetch('https://connectapi.garmin.com/workout-service/workout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${garmin.oauth2.access_token}`, 'Content-Type': 'application/json', 'User-Agent': 'GCM-iOS-5.7.2.1' },
    body: JSON.stringify(workout),
  })

  if (!garminRes.ok) return res.status(502).json({ error: `Garmin API error ${garminRes.status}: ${await garminRes.text()}` })
  const result = await garminRes.json()
  res.json({ workoutId: result.workoutId || result.workout_id })
})

// ── Serve frontend ─────────────────────────────────────────────────────────────

if (IS_PROD) {
  app.use(express.static(join(__dirname, 'dist')))
  app.get('/{*path}', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))
}

// ── Start ──────────────────────────────────────────────────────────────────────

initDb()
app.listen(PORT, () => {
  console.log(`CLAUDE CORRE server running on http://localhost:${PORT}`)
  if (!IS_PROD) console.log('  Frontend dev server: http://localhost:5173 (run npm run dev separately)')
})
