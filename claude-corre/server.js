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
import { backfillAll } from './server/backfill.js'
import { runCoachLoop } from './server/coach-loop.js'

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
   - WALKING vs RUNNING: Prescribed sessions often include a walking warmup and cooldown.
     Separate walking segments (pace >8:00/km or labeled Walk) from running segments.
     Only compare RUNNING distance to the prescribed running distance.
     Never penalize the athlete for total distance exceeding the prescribed running distance
     when the excess comes from walking warmup/cooldown.

2. PRESCRIBE the next session:
   - Based on this run AND the current training log
   - Include: distance, HR target, estimated pace, execution cue, science rationale (2-4 sentences with citation)
   - Format under a "## NEXT PRESCRIBED SESSION" heading

3. UPDATE the training log — CRITICAL:
   - You MUST output the FULL updated training log in a markdown code block at the END of your response.
   - This is how the app saves your analysis. If you skip it, the run will not be recorded.
   - Add this run to the Activity Log table (running distance only, exclude walking warmup/cooldown)
   - Update Coach Notes
   - Rewrite Prescribed Sessions with the new prescription
   - Format: \`\`\`markdown\\n[FULL LOG HERE]\\n\`\`\`

Key principles:
- Connective tissue adapts 3-5x slower than cardio (Magnusson et al., 2010)
- 80/20 rule: 80% Z2 (Seiler, 2010)
- 10% weekly volume increase max (Buist et al., 2010)
- Heat: adjust HR targets down 5-8 bpm in 30C+`

function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

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
    const exists = getDb().prepare('SELECT id FROM users WHERE id = ?').get(req.user.sub)
    if (!exists) return res.status(401).json({ error: 'Account not found' })
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

  // isNewUser if no real profile data AND no recognizable goal set
  const hasProfileData = Object.values(profile).some(v => v && v !== '—' && v !== '-')
  // Flexible goal regex: handles **Goal:** and **Goal**: and **Goal** :
  const goalMatch = log.match(/\*\*Goal\*?\*?:?\s*\*?\*?:?\s*(.+)/) || log.match(/\*\*Goal:\*\*\s*(.+)/)
  const goalSet = goalMatch && !goalMatch[1]?.includes('Not yet configured') && !goalMatch[1]?.includes('TBD')
  const isNewUser = !hasProfileData && !goalSet

  const zones = parseTable(getSection(log, 'Training Zones'))

  const activities = parseTable(getSection(log, 'Activity Log'))
    .map(normalizeActivity)
    .filter(a => a.Date && a.Date !== '—' && a.Date !== '-')
    .reverse()
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
  const s = getSettings(req.user.sub)
  parsed.hasGarminTokens = !!s.garmin_oauth2_token
  parsed.garminTokenDaysOld = s.garmin_oauth2_saved_at ? Math.floor((Date.now() - s.garmin_oauth2_saved_at) / 86_400_000) : null
  res.json(parsed)
})

// ── Training log ───────────────────────────────────────────────────────────────

app.get('/api/training-log', requireAuth, (req, res) => {
  const row = getDb().prepare('SELECT content FROM training_logs WHERE user_id = ?').get(req.user.sub)
  res.json({ content: row?.content || NEW_USER_LOG })
})

app.post('/api/training-log', requireAuth, (req, res) => {
  const { content } = req.body
  if (typeof content !== 'string' || content.trim().length < 50) {
    return res.status(400).json({ error: 'Training log content is too short or invalid. Save cancelled to protect your data.' })
  }
  getDb().prepare('INSERT OR REPLACE INTO training_logs (user_id, content, updated_at) VALUES (?, ?, ?)').run(req.user.sub, content, Date.now())
  res.json({ ok: true })
})

// ── Structured data endpoints (v2) ────────────────────────────────────────────

app.get('/api/athlete-profile', requireAuth, (req, res) => {
  const row = getDb().prepare('SELECT * FROM athlete_profiles WHERE user_id = ?').get(req.user.sub)
  res.json(row || null)
})

app.post('/api/athlete-profile', requireAuth, (req, res) => {
  const db = getDb()
  const fields = req.body
  const now = Date.now()
  db.prepare(`INSERT INTO athlete_profiles
    (user_id, name, age, weight_kg, height_cm, location, max_hr, resting_hr, previous_peak, injuries, weekly_availability, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      name=COALESCE(excluded.name, athlete_profiles.name),
      age=COALESCE(excluded.age, athlete_profiles.age),
      weight_kg=COALESCE(excluded.weight_kg, athlete_profiles.weight_kg),
      height_cm=COALESCE(excluded.height_cm, athlete_profiles.height_cm),
      location=COALESCE(excluded.location, athlete_profiles.location),
      max_hr=COALESCE(excluded.max_hr, athlete_profiles.max_hr),
      resting_hr=COALESCE(excluded.resting_hr, athlete_profiles.resting_hr),
      previous_peak=COALESCE(excluded.previous_peak, athlete_profiles.previous_peak),
      injuries=COALESCE(excluded.injuries, athlete_profiles.injuries),
      weekly_availability=COALESCE(excluded.weekly_availability, athlete_profiles.weekly_availability),
      updated_at=excluded.updated_at
  `).run(
    req.user.sub, fields.name || null, fields.age || null, fields.weight_kg || null,
    fields.height_cm || null, fields.location || null, fields.max_hr || null,
    fields.resting_hr || null, fields.previous_peak || null, fields.injuries || null,
    fields.weekly_availability ? JSON.stringify(fields.weekly_availability) : null, now
  )
  res.json({ ok: true })
})

app.get('/api/goals', requireAuth, (req, res) => {
  const goals = getDb().prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC').all(req.user.sub)
  res.json({ goals })
})

app.get('/api/goals/active', requireAuth, (req, res) => {
  const goal = getDb().prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(req.user.sub)
  res.json(goal || null)
})

app.post('/api/goals', requireAuth, (req, res) => {
  const db = getDb()
  const { race_distance, target_time, target_date, description } = req.body
  if (!description && !race_distance) return res.status(400).json({ error: 'Goal description or race distance required' })
  // Deactivate any current active goal
  db.prepare("UPDATE goals SET status = 'superseded' WHERE user_id = ? AND status = 'active'").run(req.user.sub)
  const id = randomUUID()
  db.prepare('INSERT INTO goals (id, user_id, race_distance, target_time, target_date, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user.sub, race_distance || null, target_time || null, target_date || null, description || null, 'active', Date.now())
  res.json({ id, status: 'active' })
})

app.get('/api/structured-activities', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100)
  const offset = parseInt(req.query.offset) || 0
  const activities = getDb().prepare(
    'SELECT * FROM activities WHERE user_id = ? ORDER BY activity_date DESC LIMIT ? OFFSET ?'
  ).all(req.user.sub, limit, offset)
  res.json({ activities })
})

app.get('/api/structured-activities/:id', requireAuth, (req, res) => {
  const activity = getDb().prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(req.params.id, req.user.sub)
  if (!activity) return res.status(404).json({ error: 'Activity not found' })
  const evaluation = getDb().prepare('SELECT * FROM workout_evaluations WHERE activity_id = ?').get(activity.id)
  res.json({ activity, evaluation })
})

app.get('/api/plan', requireAuth, (req, res) => {
  const db = getDb()
  const plan = db.prepare("SELECT * FROM training_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(req.user.sub)
  if (!plan) return res.json(null)
  const phases = db.prepare('SELECT * FROM plan_phases WHERE plan_id = ? ORDER BY phase_order').all(plan.id)
  const currentPhase = phases.find(p => p.status === 'active') || null
  res.json({ plan, phases, currentPhase })
})

app.get('/api/prescriptions', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 50)
  const status = req.query.status || null // 'pending', 'completed', or null for all
  let query = 'SELECT * FROM prescribed_sessions WHERE user_id = ?'
  const params = [req.user.sub]
  if (status) { query += ' AND status = ?'; params.push(status) }
  query += ' ORDER BY prescribed_date DESC LIMIT ?'
  params.push(limit)
  res.json({ prescriptions: getDb().prepare(query).all(...params) })
})

app.get('/api/weekly-summaries', requireAuth, (req, res) => {
  const weeks = Math.min(parseInt(req.query.weeks) || 8, 52)
  const summaries = getDb().prepare(
    'SELECT * FROM weekly_summaries WHERE user_id = ? ORDER BY week_start DESC LIMIT ?'
  ).all(req.user.sub, weeks)
  res.json({ summaries })
})

app.get('/api/training-load', requireAuth, (req, res) => {
  const db = getDb()
  const now = new Date()
  const d7 = new Date(now - 7 * 86400000).toISOString().split('T')[0]
  const d28 = new Date(now - 28 * 86400000).toISOString().split('T')[0]
  const acute = db.prepare(
    "SELECT COALESCE(SUM(duration_s * CASE WHEN avg_hr > 0 THEN avg_hr / 100.0 ELSE 1 END), 0) as load, COUNT(*) as sessions FROM activities WHERE user_id = ? AND activity_date >= ?"
  ).get(req.user.sub, d7)
  const chronic = db.prepare(
    "SELECT COALESCE(SUM(duration_s * CASE WHEN avg_hr > 0 THEN avg_hr / 100.0 ELSE 1 END), 0) as load, COUNT(*) as sessions FROM activities WHERE user_id = ? AND activity_date >= ?"
  ).get(req.user.sub, d28)
  const acuteLoad = acute.load
  const chronicLoad = chronic.load / 4
  const acwr = chronicLoad > 0 ? parseFloat((acuteLoad / chronicLoad).toFixed(2)) : null
  res.json({
    acute_load: Math.round(acuteLoad),
    chronic_load: Math.round(chronicLoad),
    acwr,
    acute_sessions: acute.sessions,
    chronic_sessions: chronic.sessions,
    risk_level: acwr === null ? 'unknown' : acwr > 1.5 ? 'high' : acwr > 1.3 ? 'elevated' : acwr < 0.8 ? 'detraining' : 'optimal'
  })
})

app.get('/api/training-zones', requireAuth, (req, res) => {
  const zones = getDb().prepare('SELECT * FROM training_zones WHERE user_id = ? ORDER BY zone_name').all(req.user.sub)
  res.json({ zones })
})

app.post('/api/availability-reports', requireAuth, (req, res) => {
  const { report_type, description, severity, affected_duration } = req.body
  if (!description) return res.status(400).json({ error: 'Description required' })
  const id = randomUUID()
  getDb().prepare(
    'INSERT INTO availability_reports (id, user_id, report_date, report_type, description, severity, affected_duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.sub, new Date().toISOString().split('T')[0], report_type || 'general', description, severity || null, affected_duration || null, Date.now())
  res.json({ id })
})

app.get('/api/availability-reports', requireAuth, (req, res) => {
  const reports = getDb().prepare(
    'SELECT * FROM availability_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.user.sub)
  res.json({ reports })
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

// Returns fetch headers for connectapi.garmin.com based on token type.
// DI tokens (from garmin_login.py normal mode) use Bearer auth.
// JWT_WEB tokens (from --browser mode, no refresh_token) use Cookie auth.
function garminFetchHeaders(tokenStr, isDiToken) {
  if (isDiToken) {
    return { 'Authorization': `Bearer ${tokenStr}`, 'User-Agent': 'GCM-Android-5.23', 'Accept': 'application/json' }
  }
  return { 'Cookie': `JWT_WEB=${tokenStr}`, 'NK': 'NT', 'DI-Backend': 'connectapi.garmin.com', 'Origin': 'https://connect.garmin.com', 'Referer': 'https://connect.garmin.com/modern/', 'Accept': 'application/json' }
}

// Auto-refreshes the DI access_token via diauth.garmin.com (NOT Cloudflare-blocked).
// Token format: {access_token, refresh_token, client_id}
// Returns the new access_token string, or null if refresh fails.
async function refreshDiToken(userId) {
  const s = getSettings(userId)
  if (!s.garmin_oauth2_token) return null
  let tok
  try { tok = JSON.parse(decrypt(s.garmin_oauth2_token)) } catch { return null }
  if (!tok?.refresh_token || !tok?.client_id) return null

  const basicAuth = 'Basic ' + Buffer.from(`${tok.client_id}:`).toString('base64')
  try {
    const r = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'GCM-Android-5.23',
        'X-Garmin-Client-Platform': 'Android',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: tok.client_id,
        refresh_token: tok.refresh_token,
      }),
    })
    if (!r.ok) return null
    const data = await r.json()
    if (!data.access_token) return null
    // Save refreshed token back to DB
    const updated = { ...tok, access_token: data.access_token, refresh_token: data.refresh_token || tok.refresh_token }
    getDb().prepare('UPDATE user_settings SET garmin_oauth2_token = ?, garmin_oauth2_saved_at = ?, updated_at = ? WHERE user_id = ?')
      .run(encrypt(JSON.stringify(updated)), Date.now(), Date.now(), userId)
    return data.access_token
  } catch {
    return null
  }
}


app.post('/api/settings', requireAuth, (req, res) => {
  const { anthropicApiKey, garminOauth1Token, garminOauth2Token } = req.body
  const s = getSettings(req.user.sub)
  const now = Date.now()

  const ak = anthropicApiKey !== undefined ? (anthropicApiKey ? encrypt(anthropicApiKey) : null) : s.anthropic_api_key
  const o1 = garminOauth1Token !== undefined ? (garminOauth1Token ? encrypt(garminOauth1Token) : null) : s.garmin_oauth1_token
  const o2 = garminOauth2Token !== undefined ? (garminOauth2Token ? encrypt(garminOauth2Token) : null) : s.garmin_oauth2_token
  // Track when OAuth2 token was last saved (for expiry warnings — tokens last ~30 days)
  const o2SavedAt = garminOauth2Token !== undefined && garminOauth2Token ? now : (s.garmin_oauth2_saved_at || null)

  getDb().prepare('INSERT OR REPLACE INTO user_settings (user_id, anthropic_api_key, garmin_oauth1_token, garmin_oauth2_token, garmin_oauth2_saved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.sub, ak, o1, o2, o2SavedAt, now)
  res.json({ ok: true })
})

app.get('/api/settings', requireAuth, (req, res) => {
  const s = getSettings(req.user.sub)
  const daysOld = s.garmin_oauth2_saved_at ? Math.floor((Date.now() - s.garmin_oauth2_saved_at) / 86_400_000) : null
  res.json({
    hasAnthropicKey: !!s.anthropic_api_key,
    hasGarminOauth1: !!s.garmin_oauth1_token,
    hasGarminOauth2: !!s.garmin_oauth2_token,
    garminTokenDaysOld: daysOld,
    email: req.user.email,
  })
})

// ── Garmin token diagnostics ──────────────────────────────────────────────────

app.get('/api/garmin-debug', requireAuth, (req, res) => {
  const s = getSettings(req.user.sub)
  const info = { hasOauth1: !!s.garmin_oauth1_token, hasOauth2: !!s.garmin_oauth2_token, oauth1Fields: null, oauth2Fields: null }
  if (s.garmin_oauth1_token) {
    try { info.oauth1Fields = Object.keys(JSON.parse(decrypt(s.garmin_oauth1_token))) } catch (e) { info.oauth1Fields = `decrypt error: ${e.message}` }
  }
  if (s.garmin_oauth2_token) {
    try { info.oauth2Fields = Object.keys(JSON.parse(decrypt(s.garmin_oauth2_token))) } catch (e) { info.oauth2Fields = `decrypt error: ${e.message}` }
  }
  res.json(info)
})

// Returns the user's decrypted OAuth2 token so the browser can call Garmin's
// refresh endpoint directly (browser = residential IP, bypasses Cloudflare block).
app.get('/api/garmin-raw-token', requireAuth, (req, res) => {
  const s = getSettings(req.user.sub)
  if (!s.garmin_oauth2_token) return res.status(404).json({ error: 'No Garmin token saved.' })
  try {
    const token = JSON.parse(decrypt(s.garmin_oauth2_token))
    res.json(token)
  } catch (e) {
    res.status(500).json({ error: `Token decrypt failed: ${e.message}` })
  }
})

// ── Onboarding helpers ────────────────────────────────────────────────────────

app.get('/api/onboard-status', requireAuth, (req, res) => {
  const s = getSettings(req.user.sub)
  const logRow = getDb().prepare('SELECT content FROM training_logs WHERE user_id = ?').get(req.user.sub)
  const log = logRow?.content || NEW_USER_LOG
  const parsed = parseLogToDashboard(log)
  res.json({
    hasApiKey: !!s.anthropic_api_key,
    isNewUser: parsed.isNewUser,
    hasGarminTokens: !!s.garmin_oauth2_token,
  })
})

app.post('/api/validate-key', requireAuth, async (req, res) => {
  const { apiKey } = req.body
  if (!apiKey || typeof apiKey !== 'string') return res.status(400).json({ valid: false, error: 'No key provided.' })
  if (!apiKey.startsWith('sk-ant-')) return res.status(400).json({ valid: false, error: 'Key must start with "sk-ant-". Make sure you copied the full key.' })
  try {
    const client = new Anthropic({ apiKey: apiKey.trim() })
    await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] })
    // Key is valid — save it encrypted
    const s = getSettings(req.user.sub)
    const encrypted = encrypt(apiKey.trim())
    getDb().prepare('INSERT OR REPLACE INTO user_settings (user_id, anthropic_api_key, garmin_oauth1_token, garmin_oauth2_token, updated_at) VALUES (?, ?, ?, ?, ?)').run(req.user.sub, encrypted, s.garmin_oauth1_token || null, s.garmin_oauth2_token || null, Date.now())
    res.json({ valid: true })
  } catch (e) {
    const msg = e.status === 401
      ? 'Key rejected by Anthropic. Double-check you copied the full key — it should start with "sk-ant-api03-...".'
      : `Validation failed: ${e.message}`
    res.status(400).json({ valid: false, error: msg })
  }
})

// ── Chat history ───────────────────────────────────────────────────────────────

app.get('/api/chat-history', requireAuth, (req, res) => {
  const row = getDb().prepare('SELECT messages FROM chat_history WHERE user_id = ?').get(req.user.sub)
  res.json({ messages: row ? JSON.parse(row.messages) : [] })
})

app.post('/api/chat-history', requireAuth, (req, res) => {
  const { messages } = req.body
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages must be an array' })
  const trimmed = messages.slice(-50) // store at most 50 messages
  getDb().prepare('INSERT OR REPLACE INTO chat_history (user_id, messages, updated_at) VALUES (?, ?, ?)').run(req.user.sub, JSON.stringify(trimmed), Date.now())
  res.json({ ok: true })
})

// ── Coach chat ─────────────────────────────────────────────────────────────────

app.post('/api/ask-coach', requireAuth, async (req, res) => {
  if (rateLimit(`coach:${req.user.sub}`, 20, 60_000)) return res.status(429).json({ error: 'Rate limit: max 20 messages per minute. Wait a moment and try again.' })
  const apiKey = getUserApiKey(req.user.sub)
  if (!apiKey) return res.status(503).json({ answer: 'No Anthropic API key configured. Go to [SETTINGS] and add your API key.' })

  const { question, history = [] } = req.body

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
    const { toolCalls, finalText } = await runCoachLoop({
      apiKey,
      userId: req.user.sub,
      messages: [...safeHistory, { role: 'user', content: question }],
      isUpload: false,
      onChunk: chunk => send({ chunk }),
      onToolCall: (name, input) => send({ tool: name }),
    })

    const dataUpdated = toolCalls.some(tc =>
      ['record_activity', 'write_workout_evaluation', 'prescribe_session',
       'create_training_plan', 'update_training_plan', 'update_training_zones',
       'update_athlete_profile'].includes(tc.name)
    )

    send({ done: true, logUpdated: dataUpdated })
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

  // Stream via SSE to avoid Railway 60s proxy timeout
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  function send(obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`) }

  try {
    const { toolCalls, finalText } = await runCoachLoop({
      apiKey,
      userId: req.user.sub,
      messages: [{ role: 'user', content: `Analyze this Garmin CSV activity (filename: ${filename}):\n\n\`\`\`csv\n${csv.slice(0, 15000)}\n\`\`\`` }],
      isUpload: true,
      onChunk: chunk => send({ chunk }),
      onToolCall: (name, input) => send({ tool: name }),
    })

    // Find the prescription that was created (if any)
    const prescCall = toolCalls.find(tc => tc.name === 'prescribe_session')
    const prescId = prescCall?.result?.prescription_id
    let prescription = ''
    if (prescId) {
      const row = getDb().prepare('SELECT description, rationale FROM prescribed_sessions WHERE id = ?').get(prescId)
      if (row) prescription = `## NEXT PRESCRIBED SESSION\n\n${row.description}\n\n**Rationale:** ${row.rationale}`
    }

    const dataUpdated = toolCalls.some(tc =>
      ['record_activity', 'write_workout_evaluation', 'prescribe_session'].includes(tc.name)
    )

    send({ done: true, prescription, logUpdated: dataUpdated })
    res.end()
  } catch (e) {
    send({ error: e.message })
    res.end()
  }
})

// ── Push workout to Garmin ─────────────────────────────────────────────────────

// ── Garmin workout builder ────────────────────────────────────────────────────
// Supports: easy runs, tempo, intervals/repeats, pace targets, HR targets, cadence targets.
// HR values use the +100 FIT-protocol offset required by connectapi.garmin.com.
// Pace targets are stored as speed in m/s (Garmin uses speed.between).
//
// Intermediate schema expected from AI extraction:
// {
//   name: string,
//   description: string,
//   warmupSeconds: number,
//   cooldownSeconds: number,
//   main: Array<Step | Repeat>
// }
//
// Step: { kind:"step", stepKey:"interval"|"rest"|"recovery"|"other",
//         endKind:"distance"|"time"|"lapbutton", endValue: number,
//         target: Target, description: string }
// Repeat: { kind:"repeat", reps:number, steps: Step[] }
// Target: { kind:"hr", low:bpm, high:bpm }
//        | { kind:"pace", low:minKmFast, high:minKmSlow }   (decimal min/km)
//        | { kind:"cadence", low:spm, high:spm }
//        | { kind:"none" }

const GARMIN_SPORT = { sportTypeId: 1, sportTypeKey: 'running' }
const TARGET_NONE = { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' }
const STEP_TYPE_MAP = {
  warmup:   { stepTypeId: 1, stepTypeKey: 'warmup' },
  cooldown: { stepTypeId: 2, stepTypeKey: 'cooldown' },
  interval: { stepTypeId: 3, stepTypeKey: 'interval' },
  rest:     { stepTypeId: 4, stepTypeKey: 'rest' },
  recovery: { stepTypeId: 6, stepTypeKey: 'recovery' },
  other:    { stepTypeId: 7, stepTypeKey: 'other' },
}
const END_CONDITION_MAP = {
  time:      { conditionTypeId: 2, conditionTypeKey: 'time' },
  distance:  { conditionTypeId: 3, conditionTypeKey: 'distance' },
  lapbutton: { conditionTypeId: 1, conditionTypeKey: 'lap.button' },
}

function garminTarget(t) {
  if (!t || t.kind === 'none') return TARGET_NONE
  if (t.kind === 'hr') {
    // Garmin Connect API uses BPM + 100 offset (matches FIT binary protocol)
    return { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.between',
      targetValueOne: t.low + 100, targetValueTwo: t.high + 100 }
  }
  if (t.kind === 'pace') {
    // pace in min/km → speed in m/s. low=faster pace, high=slower pace.
    const speedHigh = parseFloat((1000 / (t.low * 60)).toFixed(4))  // faster = higher speed
    const speedLow  = parseFloat((1000 / (t.high * 60)).toFixed(4)) // slower = lower speed
    return { workoutTargetTypeId: 5, workoutTargetTypeKey: 'speed.between',
      targetValueOne: speedLow, targetValueTwo: speedHigh }
  }
  if (t.kind === 'cadence') {
    return { workoutTargetTypeId: 3, workoutTargetTypeKey: 'cadence.between',
      targetValueOne: t.low, targetValueTwo: t.high }
  }
  return TARGET_NONE
}

function garminStep(s, order) {
  return {
    type: 'ExecutableStepDTO',
    stepOrder: order,
    stepType: STEP_TYPE_MAP[s.stepKey] || STEP_TYPE_MAP.interval,
    endCondition: END_CONDITION_MAP[s.endKind] || END_CONDITION_MAP.time,
    endConditionValue: s.endValue || 0,
    targetType: garminTarget(s.target),
    description: s.description || '',
  }
}

function garminRepeat(r, order) {
  return {
    type: 'RepeatGroupDTO',
    stepOrder: order,
    stepType: { stepTypeId: 6, stepTypeKey: 'repeat' },
    numberOfIterations: r.reps,
    workoutSteps: r.steps.map((s, i) => garminStep(s, i + 1)),
  }
}

function buildGarminWorkout(params) {
  const date = new Date().toISOString().split('T')[0]
  const steps = []
  let order = 1

  if ((params.warmupSeconds || 0) > 0) {
    steps.push({
      type: 'ExecutableStepDTO', stepOrder: order++,
      stepType: STEP_TYPE_MAP.warmup,
      endCondition: END_CONDITION_MAP.time, endConditionValue: params.warmupSeconds,
      targetType: TARGET_NONE,
      description: `Walk ${Math.round(params.warmupSeconds / 60)} min — warm up`,
    })
  }

  for (const s of (params.main || [])) {
    if (s.kind === 'repeat') steps.push(garminRepeat(s, order++))
    else steps.push(garminStep(s, order++))
  }

  if ((params.cooldownSeconds || 0) > 0) {
    steps.push({
      type: 'ExecutableStepDTO', stepOrder: order++,
      stepType: STEP_TYPE_MAP.cooldown,
      endCondition: END_CONDITION_MAP.time, endConditionValue: params.cooldownSeconds,
      targetType: TARGET_NONE,
      description: `Walk ${Math.round(params.cooldownSeconds / 60)} min — cool down`,
    })
  }

  return {
    sportType: GARMIN_SPORT,
    workoutName: `${(params.name || 'Run').slice(0, 40)} [${date}]`,
    description: params.description || '',
    workoutSegments: [{ segmentOrder: 1, sportType: GARMIN_SPORT, workoutSteps: steps }],
  }
}

const WORKOUT_EXTRACTION_PROMPT = `You are a Garmin workout builder. Extract structured workout parameters from the coaching prescription below and respond with valid JSON only — no markdown, no explanation.

OUTPUT SCHEMA:
{
  "name": "<short name, max 35 chars>",
  "description": "<1-2 sentences for the watch display>",
  "warmupSeconds": <number, default 300>,
  "cooldownSeconds": <number, default 300>,
  "main": [ <Step or Repeat> ]
}

Step object:
{
  "kind": "step",
  "stepKey": "interval" | "rest" | "recovery" | "other",
  "endKind": "distance" | "time" | "lapbutton",
  "endValue": <meters for distance, seconds for time>,
  "target": <Target>,
  "description": "<what the athlete should do/feel>"
}

Repeat object (for intervals/repeats):
{
  "kind": "repeat",
  "reps": <number>,
  "steps": [ <Step>, ... ]
}

Target variants:
  HR zone:   { "kind": "hr",      "low": <bpm>,             "high": <bpm>             }
  Pace zone: { "kind": "pace",    "low": <fast min/km>,     "high": <slow min/km>     }
  Cadence:   { "kind": "cadence", "low": <spm>,             "high": <spm>             }
  None:      { "kind": "none" }

RULES:
- Use "hr" target when HR zones are mentioned (e.g. Z2, keep HR 130-142, aerobic)
- Use "pace" target when pace is mentioned (e.g. 5:30/km → low:5.5, 6:00/km → low:6.0)
- Use "none" for warmup, cooldown, recovery/walk steps
- For run/walk intervals: use "repeat" with run step (interval) + walk step (recovery)
- For continuous runs: single "step" with "distance" or "time" end condition
- For tempo with sets: use "repeat"
- Default warmup: 300s, cooldown: 300s unless prescription specifies otherwise
- Recovery/walk steps use stepKey "recovery" and target "none"
- Respond with JSON only

PRESCRIPTION:
`

app.post('/api/push-workout', requireAuth, async (req, res) => {
  const apiKey = getUserApiKey(req.user.sub)
  if (!apiKey) return res.status(503).json({ error: 'No Anthropic API key configured. Go to [SETTINGS].' })

  const s = getSettings(req.user.sub)
  if (!s.garmin_oauth2_token) return res.status(503).json({ error: 'Garmin tokens not configured. Go to [SETTINGS].' })
  let garminOauth2
  try {
    garminOauth2 = JSON.parse(decrypt(s.garmin_oauth2_token))
  } catch (e) {
    return res.status(503).json({ error: `Token decrypt failed: ${e.message}. Re-save your Garmin tokens in [SETTINGS].` })
  }
  if (!garminOauth2?.access_token) return res.status(503).json({ error: `Token missing access_token field. Re-paste the full oauth2_token.json content in [SETTINGS]. Keys found: ${Object.keys(garminOauth2 || {}).join(', ')}` })

  const { prescription, prescription_id } = req.body
  if (!prescription && !prescription_id) return res.status(400).json({ error: 'No prescription provided.' })

  let workoutParams = null

  // Try structured prescription first (has workout_json from tool-use coach)
  if (prescription_id) {
    const row = getDb().prepare('SELECT workout_json, description FROM prescribed_sessions WHERE id = ? AND user_id = ?').get(prescription_id, req.user.sub)
    if (row?.workout_json) {
      try { workoutParams = JSON.parse(row.workout_json) } catch {}
    }
  }

  // Fallback: extract from text prescription via AI
  if (!workoutParams) {
    const client = new Anthropic({ apiKey })
    const prescText = prescription || ''
    try {
      const extract = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: WORKOUT_EXTRACTION_PROMPT + prescText }],
      })
      const raw = extract.content[0].text.match(/\{[\s\S]*\}/)?.[0]
      workoutParams = JSON.parse(raw)
    } catch {
      workoutParams = {
        name: 'Easy Run',
        description: 'Easy aerobic run. Stay in Z2.',
        warmupSeconds: 300,
        cooldownSeconds: 300,
        main: [{ kind: 'step', stepKey: 'interval', endKind: 'distance', endValue: 4500,
          target: { kind: 'hr', low: 130, high: 142 }, description: 'Keep HR 130-142 bpm (Z2)' }],
      }
    }
  }

  try {

    const workout = buildGarminWorkout(workoutParams)
    const isDi = !!garminOauth2.refresh_token

    const pushToGarmin = (token) => fetch('https://connectapi.garmin.com/workout-service/workout', {
      method: 'POST',
      headers: { ...garminFetchHeaders(token, isDi), 'Content-Type': 'application/json' },
      body: JSON.stringify(workout),
    })

    let garminRes = await pushToGarmin(garminOauth2.access_token)

    if (!garminRes.ok && garminRes.status === 401) {
      const fresh = await refreshDiToken(req.user.sub)
      if (fresh) garminRes = await pushToGarmin(fresh)
    }

    if (!garminRes.ok) {
      const body = await garminRes.text()
      if (garminRes.status === 401) return res.status(401).json({ error: 'Garmin token expired. Run  python3 garmin_login.py  and paste the token in Settings.' })
      return res.status(502).json({ error: `Garmin API error ${garminRes.status}: ${body}` })
    }
    const result = await garminRes.json()
    res.json({ workoutId: result.workoutId || result.workout_id, workoutName: workout.workoutName })
  } catch (e) {
    res.status(500).json({ error: `Push failed: ${e.message}` })
  }
})

// ── Garmin activity sync ───────────────────────────────────────────────────────

app.get('/api/garmin-activities', requireAuth, async (req, res) => {
  const s = getSettings(req.user.sub)
  if (!s.garmin_oauth2_token) return res.status(503).json({ error: 'Garmin tokens not configured.' })
  let garminOauth2
  try { garminOauth2 = JSON.parse(decrypt(s.garmin_oauth2_token)) } catch (e) {
    return res.status(503).json({ error: `Token decrypt failed: ${e.message}` })
  }

  try {
    const actUrl = 'https://connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=10&activityType=running'
    const isDi = !!garminOauth2.refresh_token
    const garminFetch = (token) => fetch(actUrl, { headers: garminFetchHeaders(token, isDi) })
    let r = await garminFetch(garminOauth2.access_token)
    if (!r.ok && r.status === 401) {
      const fresh = await refreshDiToken(req.user.sub)
      if (fresh) r = await garminFetch(fresh)
    }
    if (!r.ok) return res.status(r.status === 401 ? 401 : 502).json({ error: r.status === 401 ? 'Garmin token expired. Run  python3 garmin_login.py  and paste the token in Settings.' : `Garmin API error ${r.status}: ${await r.text()}` })
    const list = await r.json()
    const activities = (Array.isArray(list) ? list : list.activityList || []).map(a => ({
      activityId: a.activityId,
      name: a.activityName || 'Run',
      date: a.startTimeLocal?.split('T')[0] || '—',
      distance: a.distance ? `${(a.distance / 1000).toFixed(2)} km` : '—',
      duration: a.duration ? `${Math.floor(a.duration / 60)}:${String(Math.round(a.duration % 60)).padStart(2, '0')}` : '—',
      avgHR: a.averageHR ? Math.round(a.averageHR) : null,
    }))
    res.json({ activities })
  } catch (e) {
    res.status(500).json({ error: `Sync failed: ${e.message}` })
  }
})

app.post('/api/import-garmin', requireAuth, async (req, res) => {
  const apiKey = getUserApiKey(req.user.sub)
  if (!apiKey) return res.status(503).json({ error: 'No Anthropic API key configured.' })

  const s = getSettings(req.user.sub)
  if (!s.garmin_oauth2_token) return res.status(503).json({ error: 'Garmin tokens not configured.' })
  let garminOauth2
  try { garminOauth2 = JSON.parse(decrypt(s.garmin_oauth2_token)) } catch (e) {
    return res.status(503).json({ error: `Token decrypt failed: ${e.message}` })
  }

  const { activityId, activityName } = req.body
  if (!activityId) return res.status(400).json({ error: 'activityId required' })

  // Stream via SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  function send(obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`) }

  try {
    // Download CSV from Garmin (auto-refresh DI token on 401)
    const isDiCsv = !!garminOauth2.refresh_token
    const csvFetch = (token) => fetch(`https://connectapi.garmin.com/download-service/export/csv/activity/${activityId}`, {
      headers: garminFetchHeaders(token, isDiCsv),
    })
    let csvRes = await csvFetch(garminOauth2.access_token)
    if (!csvRes.ok && csvRes.status === 401) {
      const fresh = await refreshDiToken(req.user.sub)
      if (fresh) csvRes = await csvFetch(fresh)
    }
    if (!csvRes.ok) {
      send({ error: `Could not download activity CSV from Garmin (${csvRes.status}). Try downloading manually and using [UPLOAD RUN] instead.` })
      return res.end()
    }
    const csv = await csvRes.text()

    const filename = `${activityName || 'activity'}_${activityId}.csv`

    const { toolCalls, finalText } = await runCoachLoop({
      apiKey,
      userId: req.user.sub,
      messages: [{ role: 'user', content: `Analyze this Garmin CSV activity (filename: ${filename}):\n\n\`\`\`csv\n${csv.slice(0, 15000)}\n\`\`\`` }],
      isUpload: true,
      onChunk: chunk => send({ chunk }),
      onToolCall: (name, input) => send({ tool: name }),
    })

    const prescCall = toolCalls.find(tc => tc.name === 'prescribe_session')
    const prescId = prescCall?.result?.prescription_id
    let prescription = ''
    if (prescId) {
      const row = getDb().prepare('SELECT description, rationale FROM prescribed_sessions WHERE id = ?').get(prescId)
      if (row) prescription = `## NEXT PRESCRIBED SESSION\n\n${row.description}\n\n**Rationale:** ${row.rationale}`
    }

    const dataUpdated = toolCalls.some(tc =>
      ['record_activity', 'write_workout_evaluation', 'prescribe_session'].includes(tc.name)
    )

    send({ done: true, prescription, logUpdated: dataUpdated })
    res.end()
  } catch (e) {
    send({ error: e.message })
    res.end()
  }
})

// ── Serve frontend ─────────────────────────────────────────────────────────────

if (IS_PROD) {
  app.use(express.static(join(__dirname, 'dist')))
  app.get('/{*path}', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))
}

// ── Start ──────────────────────────────────────────────────────────────────────

initDb()
backfillAll(getDb())
app.listen(PORT, () => {
  console.log(`CLAUDE CORRE server running on http://localhost:${PORT}`)
  if (!IS_PROD) console.log('  Frontend dev server: http://localhost:5173 (run npm run dev separately)')
})
