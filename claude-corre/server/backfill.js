import { randomUUID } from 'crypto'

// ── Markdown parsing helpers (duplicated from server.js to keep this self-contained) ──

function getSection(log, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function val(v) { return v && v !== '—' && v !== '-' ? v : null }
function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n }

function parseDistanceMeters(s) {
  if (!s || s === '—' || s === '-') return null
  const m = String(s).match(/([0-9.]+)\s*k/i)
  if (m) return parseFloat(m[1]) * 1000
  const m2 = String(s).match(/([0-9.]+)\s*m/i)
  if (m2) return parseFloat(m2[1])
  return null
}

function parsePaceSeconds(s) {
  // "6:30" or "6:30/km" → 390 seconds
  if (!s || s === '—' || s === '-') return null
  const m = String(s).match(/(\d+):(\d+)/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2])
  return null
}

function parseHeight(s) {
  if (!s) return null
  // "175cm" or "1.75m"
  const cm = s.match(/(\d+)\s*cm/i)
  if (cm) return parseInt(cm[1])
  const m = s.match(/(\d+\.?\d*)\s*m/i)
  if (m) return parseFloat(m[1]) * 100
  return null
}

function parseWeight(s) {
  if (!s) return null
  const kg = s.match(/(\d+\.?\d*)\s*kg/i)
  if (kg) return parseFloat(kg[1])
  return null
}

// ── Main backfill function ──────────────────────────────────────────────────

export function backfillUser(db, userId, logContent) {
  if (!logContent || logContent.includes('Not yet configured')) return false

  // Check if already backfilled
  const existing = db.prepare('SELECT user_id FROM athlete_profiles WHERE user_id = ?').get(userId)
  if (existing) return false

  const now = Date.now()

  // ── Profile ──
  const profileSection = getSection(logContent, 'Athlete Profile')
  const profileRows = parseTable(profileSection)
  const profile = {}
  profileRows.forEach(r => {
    const key = r.Field || r.Metric || r.Item
    const val = r.Value || r.Data
    if (key && val) profile[key] = val
  })

  if (Object.values(profile).some(v => v && v !== '—' && v !== '-')) {
    db.prepare(`INSERT OR IGNORE INTO athlete_profiles
      (user_id, name, age, weight_kg, height_cm, location, previous_peak, injuries, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      userId,
      val(profile.Name) || val(profile.name),
      num(profile.Age || profile.age),
      parseWeight(profile.Weight || profile.weight),
      parseHeight(profile.Height || profile.height),
      val(profile.Location || profile.location),
      val(profile['Previous peak'] || profile['previous peak']),
      val(profile['Injuries/limits'] || profile.Injuries || profile.injuries),
      now
    )
  }

  // ── Goal ──
  const goalMatch = logContent.match(/\*\*Goal\*?\*?:?\s*\*?\*?:?\s*(.+)/) || logContent.match(/\*\*Goal:\*\*\s*(.+)/)
  const goalText = goalMatch?.[1]?.trim()
  let goalId = null
  if (goalText && !goalText.includes('Not yet configured') && !goalText.includes('TBD')) {
    goalId = randomUUID()
    // Try to extract a target date from the goal text
    const dateMatch = goalText.match(/(\d{4}-\d{2}-\d{2})/) || goalText.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s*\d{4})/i)
    db.prepare(`INSERT INTO goals (id, user_id, description, target_date, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)`).run(
      goalId, userId, goalText, dateMatch?.[1] || null, now
    )
  }

  // ── Training Zones ──
  const zones = parseTable(getSection(logContent, 'Training Zones'))
  for (const z of zones) {
    const zoneName = z.Zone || z.zone
    if (!zoneName) continue
    // Parse HR range like "130-142" or "~130–142"
    const hrText = z.HR || z.hr || ''
    const hrMatch = hrText.match(/(\d+)\s*[-–]\s*(\d+)/)
    const hrLow = hrMatch ? parseInt(hrMatch[1]) : null
    const hrHigh = hrMatch ? parseInt(hrMatch[2]) : null
    // Parse pace range
    const paceText = z['Est. Pace'] || z['Est Pace'] || z.pace || ''
    const paceMatch = paceText.match(/(\d+:\d+)\s*[-–]\s*(\d+:\d+)/)

    db.prepare(`INSERT INTO training_zones
      (id, user_id, zone_name, hr_low, hr_high, pace_low, pace_high, description, calibrated_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), userId, zoneName, hrLow, hrHigh,
      paceMatch?.[1] || null, paceMatch?.[2] || null,
      z.Use || z.use || null,
      now, 'backfill'
    )
  }

  // ── Activities ──
  const activities = parseTable(getSection(logContent, 'Activity Log'))
    .map(normalizeActivity)
    .filter(a => a.Date && a.Date !== '—' && a.Date !== '-')

  for (const a of activities) {
    // Try to parse the date
    const d = new Date(a.Date)
    if (isNaN(d.getTime())) continue

    const actType = (a.Type || '').toLowerCase()
    let type = 'run'
    if (actType.includes('yoga')) type = 'yoga'
    else if (actType.includes('strength') || actType.includes('functional')) type = 'strength'
    else if (actType.includes('cycl') || actType.includes('bike')) type = 'cycling'
    else if (actType.includes('walk')) type = 'walk'
    else if (actType.includes('rest')) type = 'rest'
    else if (actType.includes('cross')) type = 'cross_training'

    db.prepare(`INSERT INTO activities
      (id, user_id, activity_date, activity_type, source, distance_m, avg_hr, max_hr, avg_pace, avg_cadence, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), userId,
      d.toISOString().split('T')[0],
      type,
      'backfill',
      parseDistanceMeters(a.Distance),
      num(a['Avg HR']),
      num(a['Max HR']),
      val(a['Avg Pace']),
      num(a['Avg Cadence']),
      val(a.Notes),
      now
    )
  }

  console.log(`Backfilled user ${userId}: profile, ${goalId ? '1 goal' : 'no goal'}, ${zones.length} zones, ${activities.length} activities`)
  return true
}

// Run backfill for all users who have training logs but no structured data
export function backfillAll(db) {
  const users = db.prepare(`
    SELECT tl.user_id, tl.content
    FROM training_logs tl
    LEFT JOIN athlete_profiles ap ON ap.user_id = tl.user_id
    WHERE ap.user_id IS NULL
  `).all()

  let count = 0
  for (const u of users) {
    if (backfillUser(db, u.user_id, u.content)) count++
  }
  if (count > 0) console.log(`Backfill complete: ${count} user(s) migrated to structured data`)
}
