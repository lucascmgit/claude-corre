import { getStore } from '@netlify/blobs'
import fs from 'fs'
import path from 'path'

// Blank template for new users — no personal data
export const NEW_USER_LOG = `# Running Training Log

**Goal:** Not yet configured — chat with your coach to set up your profile
**Current Phase:** Not started

---

## Athlete Profile

| Field | Value |
|-------|-------|
| Name | — |
| Age | — |
| Weight | — |
| Height | — |
| Location | — |
| Previous peak | — |
| Injuries/limits | — |

## Training Zones

*Not yet calibrated. Complete your first run and upload the CSV to calibrate.*

| Zone | HR | Est. Pace | Use |
|------|----|-----------|-----|
| Z1 Recovery | <130 | 7:30+/km | Warm-up/cool-down |
| Z2 Easy | ~130–142 | ~6:45–7:15/km | All Phase 1 running |
| Z3 Tempo | ~143–155 | ~6:00–6:20/km | Phase 2+ only |
| Z4 Threshold | ~156–167 | ~5:30–5:50/km | Phase 3 only |
| Z5 VO2max | 168+ | <5:30/km | Not prescribed |

## Weekly Schedule

- **Running:** TBD — configure via coach chat
- **Cross-training:** TBD

---

## Activity Log

| Date | Day | Type | Distance | Avg Pace | Avg HR | Max HR | Avg Cadence | Notes |
|------|-----|------|----------|----------|--------|--------|-------------|-------|
| — | — | No activities yet | — | — | — | — | — | New user — start by chatting with your coach |

---

## Prescribed Sessions

*Ask your coach to prescribe your first session.*

---

## Coach Notes

*No activities yet. Start by telling your coach about your running background.*
`

// Local dev: look for training_log.md in the project root
const LOCAL_LOG_PATH = path.join(process.cwd(), '..', 'training_log.md')

export async function getLog(userId) {
  if (process.env.NETLIFY) {
    try {
      const store = getStore('training-log')
      const content = await store.get(userId)
      if (content) return content
    } catch {}
    return NEW_USER_LOG
  }
  // Local dev: use shared local file (single-user dev mode)
  try {
    return fs.readFileSync(LOCAL_LOG_PATH, 'utf-8')
  } catch {
    return NEW_USER_LOG
  }
}

export async function saveLog(userId, content) {
  if (process.env.NETLIFY) {
    const store = getStore('training-log')
    await store.set(userId, content)
  } else {
    fs.writeFileSync(LOCAL_LOG_PATH, content, 'utf-8')
  }
}

export function isNewUser(logContent) {
  return logContent.includes('No activities yet') && logContent.includes('Not yet configured')
}
