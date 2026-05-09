// Fitness model: Jack Daniels' VDOT, Critical Speed (Monod), LTHR-anchored zones.
// Pure functions — no DB, no I/O. Input numbers, output numbers.
//
// References (cite in coach rationale when using these):
//   VDOT     — Daniels' Running Formula, 4th ed. (Daniels & Gilbert 1979 polynomial)
//   CS       — Monod & Scherrer 1965; modern review: Jones et al. 2010
//   LTHR     — Friel, "Total Heart Rate Training" zone definitions

// ── VDOT (single-race aerobic capacity) ──────────────────────────────────────

// VDOT in equivalent ml/kg/min. Returns null for inputs too short to be aerobic.
export function vdotFromRace(distance_m, duration_s) {
  if (!distance_m || !duration_s || distance_m < 800 || duration_s < 120) return null
  const t_min = duration_s / 60
  const v = distance_m / t_min  // m/min
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v
  const pct = 0.8
    + 0.1894393 * Math.exp(-0.012778 * t_min)
    + 0.2989558 * Math.exp(-0.1932605 * t_min)
  return Math.round((vo2 / pct) * 10) / 10
}

// Fraction of VDOT to use for each Daniels training zone.
const VDOT_PACE_FRACTIONS = {
  E: 0.70,  // easy: 65–75% VO2max
  M: 0.83,  // marathon: 75–84%
  T: 0.88,  // threshold/tempo: 86–90%
  I: 0.99,  // interval: 95–100%
  R: 1.10,  // repetition / neuromuscular: > VO2max
}

// Invert Daniels' VO2(v) polynomial to get velocity (m/min) at a given fraction.
function velocityAtFraction(vdot, frac) {
  const targetVO2 = vdot * frac
  // 0.000104 v² + 0.182258 v − (4.60 + targetVO2) = 0
  const a = 0.000104, b = 0.182258, c = -(4.60 + targetVO2)
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  return (-b + Math.sqrt(disc)) / (2 * a)
}

function paceFromVelocity(v_m_per_min) {
  if (!v_m_per_min || v_m_per_min <= 0) return null
  const total = Math.round(60000 / v_m_per_min)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// { E: "5:30", M: "5:00", T: "4:35", I: "4:10", R: "3:50" }
export function pacesFromVdot(vdot) {
  if (!vdot) return null
  const out = {}
  for (const [zone, frac] of Object.entries(VDOT_PACE_FRACTIONS)) {
    out[zone] = paceFromVelocity(velocityAtFraction(vdot, frac))
  }
  return out
}

// ── Critical Speed (multi-effort hyperbolic model) ───────────────────────────

// Fit d = CS·t + D' by OLS over 2+ efforts at distinct durations.
// Returns { cs_mps, d_prime_m, r_squared, n_efforts } or null.
export function criticalSpeed(efforts) {
  if (!Array.isArray(efforts)) return null
  const valid = efforts.filter(e => e.distance_m > 0 && e.duration_s > 0)
  if (valid.length < 2) return null
  const n = valid.length
  let sumT = 0, sumD = 0, sumTT = 0, sumTD = 0
  for (const e of valid) {
    sumT += e.duration_s
    sumD += e.distance_m
    sumTT += e.duration_s * e.duration_s
    sumTD += e.duration_s * e.distance_m
  }
  const denom = n * sumTT - sumT * sumT
  if (denom === 0) return null
  const cs = (n * sumTD - sumT * sumD) / denom
  const dPrime = (sumD - cs * sumT) / n
  let ssRes = 0, ssTot = 0
  const meanD = sumD / n
  for (const e of valid) {
    const pred = cs * e.duration_s + dPrime
    ssRes += (e.distance_m - pred) ** 2
    ssTot += (e.distance_m - meanD) ** 2
  }
  return {
    cs_mps: Math.round(cs * 1000) / 1000,
    d_prime_m: Math.round(dPrime),
    r_squared: ssTot > 0 ? Math.round((1 - ssRes / ssTot) * 1000) / 1000 : null,
    n_efforts: n,
  }
}

// CS pace bands for tempo / threshold / VO2max work.
// Tempo = 90–95% CS, Threshold = 95–100% CS, VO2 = 105–115% CS.
export function pacesFromCs(cs_mps) {
  if (!cs_mps) return null
  const band = (lo, hi) => ({
    fast: paceFromVelocity(cs_mps * hi * 60),
    slow: paceFromVelocity(cs_mps * lo * 60),
  })
  return {
    Easy:      band(0.70, 0.80),
    Tempo:     band(0.90, 0.95),
    Threshold: band(0.95, 1.00),
    VO2max:    band(1.05, 1.15),
  }
}

// ── LTHR-anchored HR zones (Friel) ───────────────────────────────────────────

export function zonesFromLthr(lthr) {
  if (!lthr) return null
  const z = (frac_lo, frac_hi) => ({
    hr_low:  Math.round(lthr * frac_lo),
    hr_high: Math.round(lthr * frac_hi),
  })
  return [
    { zone_name: 'Z1', ...z(0.65, 0.81), description: 'Recovery / very easy aerobic' },
    { zone_name: 'Z2', ...z(0.82, 0.88), description: 'Endurance / easy aerobic' },
    { zone_name: 'Z3', ...z(0.89, 0.93), description: 'Tempo / steady state' },
    { zone_name: 'Z4', ...z(0.94, 0.99), description: 'Lactate threshold' },
    { zone_name: 'Z5a', ...z(1.00, 1.02), description: 'VO2max short intervals' },
  ]
}

// Heuristic LTHR estimate from labeled laps (Garmin metadata format).
// Picks the longest sustained ACTIVE/INTERVAL lap (≥15 min) and uses its avg HR.
export function lthrFromLabeledLaps(laps) {
  if (!Array.isArray(laps)) return null
  const eligible = laps.filter(l =>
    (l.intensityType === 'ACTIVE' || l.intensityType === 'INTERVAL')
    && (l.duration_s || 0) >= 15 * 60
    && (l.avgHr || 0) > 0
  )
  if (eligible.length === 0) return null
  eligible.sort((a, b) => b.duration_s - a.duration_s)
  return Math.round(eligible[0].avgHr)
}

// ── Convenience: package the full model ──────────────────────────────────────

export function buildFitnessSummary({ vdot, cs_mps, d_prime_m, lthr_bpm }) {
  return {
    vdot,
    daniels_paces: pacesFromVdot(vdot),
    critical_speed_mps: cs_mps,
    d_prime_m,
    cs_paces: pacesFromCs(cs_mps),
    lthr_bpm,
    lthr_zones: zonesFromLthr(lthr_bpm),
  }
}
