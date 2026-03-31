import { getStore } from '@netlify/blobs'
import fs from 'fs'
import path from 'path'

const LOCAL_LOG_PATH = path.join(process.cwd(), '..', 'training_log.md')

export const BUNDLED_LOG = `# Running Training Log — Lucas Martinelli

**Goal:** 12km @ 6:00/km by June 15, 2026
**Current Phase:** Phase 1 — Rebuild (Weeks 1-4, ending ~April 18, 2026)
**Current Week:** Week 2 (Mar 30 – Apr 5)

---

## Athlete Profile

| Field | Value |
|-------|-------|
| Age | 42 |
| Weight | 80kg |
| Height | 178cm |
| Location | Ipanema, Rio de Janeiro |
| Previous peak | Half marathon 1:55:22 (May 2023) = 5:28/km |
| Break | ~2 years off running |
| Left knee | Meniscus sensitivity in deep yoga only — not in running |

## Training Zones (Calibrated Mar 2026)

| Zone | HR | Est. Pace | Use |
|------|----|-----------|-----|
| Z1 Recovery | <130 | 7:30+/km | Warm-up/cool-down |
| Z2 Easy | 130–142 | 6:45–7:15/km | All Phase 1 running |
| Z3 Tempo | 143–155 | 6:00–6:20/km | Phase 2+ only |
| Z4 Threshold | 156–167 | 5:30–5:50/km | Phase 3 only |
| Z5 VO2max | 168+ | <5:30/km | Not prescribed |

Max HR observed: 179 bpm. Estimated true max: ~182 bpm.

## Weekly Schedule

- **Tue & Thu mornings:** Yoga (90min Iyengar) + 3.2km cycling commute each way (2x1.6km, easy)
- **Mon, Wed, Fri:** Functional training (2-3x/week, variable)
- **Running:** 2x/week, weekday evening + weekend. Lucas confirms each session before going.

---

## Activity Log

| Date | Day | Type | Distance | Avg Pace | Avg HR | Max HR | Avg Cadence | Notes |
|------|-----|------|----------|----------|--------|--------|-------------|-------|
| 2026-03-22 | Sat | Run – 20x1+1 intervals | 6.14 km | 6:31/km (runs: 4:23–4:57) | 157 | 179 | 134 spm* | First run back. Run intervals at 4:23–4:57/km — far too fast. HR climbed from 109 to 179. Walking HR never recovered below 155 after rep 10. |
| 2026-03-24 | Mon | Run – Easy continuous | 3.93 km | 6:41/km | 142 | 160 | 158 spm | Best run of the three. Km 1 at 6:54/HR 124. HR stayed most controlled. Slowed on km 4 as HR rose — right instinct. |
| 2026-03-29 | Sat | Run – Continuous | 5.01 km | 6:16/km | 152 | 169 | 161 spm | 28% volume jump from previous run. Positive effort split: started 6:34 (HR 131) drifted to 5:58 (HR 166). Classic warm-up-and-speed-up pattern. 3 of 5 km above Z2. |
| 2026-03-30 | Sun | Functional training | — | — | — | — | — | — |
| 2026-03-31 | Tue | Yoga – 90min Iyengar + cycling | — | — | — | — | — | Garudassana series, not strenuous. +3.2km easy cycling (2x1.6km commute). |

## Prescribed Sessions

### Next Run: Thursday Apr 2 (evening)
**Session:** Easy Z2 run, 4.5km
- Warm-up: 3-5 min walking
- Run at 6:45–7:00/km, HR target 130–142 bpm (Z2 ceiling)
- If HR exceeds 142 and won't come down by slowing to 7:00/km, walk 60s then resume
- Cool-down: 3-5 min walking
- **HR GOVERNS. Do not speed up when warmed up.**

### Upcoming: Weekend Apr 5-6
TBD after Thursday run review.

---

## Coach Notes

**Primary concern (Phase 1):** Lucas defaults to 4:20–4:55/km on effort intervals and 5:58–6:16/km on continuous runs. His cardiovascular fitness is partially intact from cross-training, but his connective tissue is not ready for that load. Every run so far has been in Z3-Z4. Phase 1 must be Z2 only.

**Positive signals:**
- Mar 24 run showed correct instinct: slowed km 4 as HR rose
- Cadence improving (158 → 161 spm across sessions)

**Rio heat note:** If running in peak heat (noon–4pm), apply a 5–8 bpm downward adjustment to HR targets.

---

## Phase Plan Reference

| Phase | Weeks | Dates | Focus | Volume |
|-------|-------|-------|-------|--------|
| 1 – Rebuild | 1–4 | Mar 22 – Apr 18 | Z2 only, connective tissue | 8–12 km/week |
| 2 – Build | 5–8 | Apr 19 – May 16 | Tempo intervals + long run | 14–20 km/week |
| 3 – Sharpen | 9–11 | May 17 – Jun 15 | Goal-pace work + validation | 18–22 km/week |
`

export async function getLog() {
  if (process.env.NETLIFY) {
    try {
      const store = getStore('training-log')
      const content = await store.get('log.md')
      if (content) return content
    } catch {}
    return BUNDLED_LOG
  }
  try {
    return fs.readFileSync(LOCAL_LOG_PATH, 'utf-8')
  } catch {
    return BUNDLED_LOG
  }
}

export async function saveLog(content) {
  if (process.env.NETLIFY) {
    const store = getStore('training-log')
    await store.set('log.md', content)
  } else {
    fs.writeFileSync(LOCAL_LOG_PATH, content, 'utf-8')
  }
}
