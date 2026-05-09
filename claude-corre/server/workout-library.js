// Canonical session catalog. Each entry is a parameterized workout — the
// coach picks one and concretizes it from the athlete's fitness model.
//
// Structure:
//   key:        stable id (used in tool responses)
//   name:       human display
//   purpose:    physiological intent (one short paragraph)
//   prerequisites: free-text gate criteria
//   structure:  Garmin workout-builder JSON template with placeholders
//                 {{T_pace}}, {{I_pace}}, {{R_pace}}, {{E_pace}} etc.
//   citation:   short reference key for the science prompt

export const CANONICAL_WORKOUTS = [
  {
    key: 'easy_run',
    name: 'Easy Aerobic Run',
    session_type: 'easy_run',
    purpose: 'Mitochondrial / capillary density, fat oxidation, low-impact aerobic accumulation. The bedrock of polarized training.',
    prerequisites: 'No injury limitations. Use whenever a non-stimulus day is needed.',
    structure: {
      name: 'Easy Run',
      description: 'Conversational pace. Stay strictly in Z2.',
      warmupSeconds: 300,
      cooldownSeconds: 300,
      main: [{
        kind: 'step', stepKey: 'interval', endKind: 'distance', endValue: 5000,
        target: { kind: 'hr', low: '{{Z2_low}}', high: '{{Z2_high}}' },
        description: 'Hold Z2. Slow if HR drifts.',
      }],
    },
    citation: 'Seiler 2010; polarized training',
  },
  {
    key: 'long_run',
    name: 'Long Aerobic Run',
    session_type: 'long_run',
    purpose: 'Glycogen depletion tolerance, muscular durability, cardiac stroke volume. Single longest session of the week.',
    prerequisites: 'Weekly volume ≥ 3× the long-run distance. No acute fatigue.',
    structure: {
      name: 'Long Run',
      description: 'Steady Z2. Last 20% may drift to high Z2.',
      warmupSeconds: 300,
      cooldownSeconds: 300,
      main: [{
        kind: 'step', stepKey: 'interval', endKind: 'time', endValue: 5400,
        target: { kind: 'hr', low: '{{Z2_low}}', high: '{{Z2_high}}' },
        description: '90 min Z2. Take fluids every 25–30 min.',
      }],
    },
    citation: 'Daniels — long-run physiology',
  },
  {
    key: 'tempo_continuous',
    name: 'Continuous Tempo (T pace)',
    session_type: 'tempo',
    purpose: 'Lactate clearance. Run at the lactate threshold pace for 20–30 min to push the LT curve right.',
    prerequisites: 'At least 4 weeks of base. Recent easy-run HR drift < 5%.',
    structure: {
      name: 'Tempo 20-30',
      description: 'Comfortably hard. T pace = ~1-hour race pace.',
      warmupSeconds: 600,
      cooldownSeconds: 600,
      main: [{
        kind: 'step', stepKey: 'interval', endKind: 'time', endValue: 1500,
        target: { kind: 'pace', low: '{{T_pace_fast}}', high: '{{T_pace_slow}}' },
        description: 'Tempo. HR should plateau at LTHR.',
      }],
    },
    citation: 'Daniels T-pace; threshold continuous',
  },
  {
    key: 'tempo_cruise',
    name: 'Cruise Intervals (T pace)',
    session_type: 'tempo',
    purpose: 'Same lactate-clearance stimulus as continuous tempo, but broken into 4–8 min reps with 1 min jogging recovery — easier to hold target pace.',
    prerequisites: 'Same as continuous tempo. Use when continuous form is breaking down.',
    structure: {
      name: 'Cruise 4×6',
      description: '4× 6min @ T pace with 1min jog recovery.',
      warmupSeconds: 600,
      cooldownSeconds: 600,
      main: [{
        kind: 'repeat', reps: 4,
        steps: [
          { kind: 'step', stepKey: 'interval', endKind: 'time', endValue: 360,
            target: { kind: 'pace', low: '{{T_pace_fast}}', high: '{{T_pace_slow}}' },
            description: '6 min T pace.' },
          { kind: 'step', stepKey: 'recovery', endKind: 'time', endValue: 60,
            target: { kind: 'pace', low: '{{E_pace_fast}}', high: '{{E_pace_slow}}' },
            description: '1 min easy jog (do NOT walk).' },
        ],
      }],
    },
    citation: 'Daniels — cruise intervals',
  },
  {
    key: 'vo2_intervals_400',
    name: 'VO2max 400s (R/I pace)',
    session_type: 'intervals',
    purpose: 'Maximal aerobic power. 8–12× 400m at I pace stresses VO2max delivery and pulls aerobic ceiling up.',
    prerequisites: '6+ weeks of base. No injuries. Recent T-pace work tolerated cleanly.',
    structure: {
      name: '10×400 I',
      description: '10× 400m @ I pace, jog 200m between.',
      warmupSeconds: 900,
      cooldownSeconds: 600,
      main: [{
        kind: 'repeat', reps: 10,
        steps: [
          { kind: 'step', stepKey: 'interval', endKind: 'distance', endValue: 400,
            target: { kind: 'pace', low: '{{I_pace_fast}}', high: '{{I_pace_slow}}' },
            description: '400m @ I pace.' },
          { kind: 'step', stepKey: 'recovery', endKind: 'distance', endValue: 200,
            target: { kind: 'pace', low: '{{E_pace_fast}}', high: '{{E_pace_slow}}' },
            description: '200m jog recovery (jog, do not walk).' },
        ],
      }],
    },
    citation: 'Daniels — VO2max sets',
  },
  {
    key: 'yasso_800',
    name: 'Yasso 800s',
    session_type: 'intervals',
    purpose: 'Marathon predictor + VO2max stimulus. 10× 800m at I pace, with equal jog recovery; the average min:sec correlates with marathon hr:min.',
    prerequisites: 'Marathon goal. 8+ weeks of base.',
    structure: {
      name: 'Yasso 10×800',
      description: '10× 800m @ I pace with equal-time jog recovery.',
      warmupSeconds: 900,
      cooldownSeconds: 600,
      main: [{
        kind: 'repeat', reps: 10,
        steps: [
          { kind: 'step', stepKey: 'interval', endKind: 'distance', endValue: 800,
            target: { kind: 'pace', low: '{{I_pace_fast}}', high: '{{I_pace_slow}}' },
            description: '800m @ I pace.' },
          { kind: 'step', stepKey: 'recovery', endKind: 'time', endValue: 240,
            target: { kind: 'pace', low: '{{E_pace_fast}}', high: '{{E_pace_slow}}' },
            description: 'Jog ~equal time to the rep.' },
        ],
      }],
    },
    citation: 'Yasso (Runner\'s World 1980s); validated Galloway 2010',
  },
  {
    key: 'progression_run',
    name: 'Progression Run',
    session_type: 'easy_run',
    purpose: 'Aerobic durability + race pacing rehearsal. Start E, finish at M pace. Trains glycogen-tolerant late-race effort.',
    prerequisites: 'Base established. Substitute for one weekly easy run.',
    structure: {
      name: 'Progression 60',
      description: '20min E → 20min steady → 20min M pace.',
      warmupSeconds: 300,
      cooldownSeconds: 300,
      main: [
        { kind: 'step', stepKey: 'interval', endKind: 'time', endValue: 1200,
          target: { kind: 'pace', low: '{{E_pace_fast}}', high: '{{E_pace_slow}}' },
          description: '20 min E pace.' },
        { kind: 'step', stepKey: 'interval', endKind: 'time', endValue: 1200,
          target: { kind: 'pace', low: '{{M_pace_fast}}', high: '{{E_pace_slow}}' },
          description: '20 min steady (between E and M).' },
        { kind: 'step', stepKey: 'interval', endKind: 'time', endValue: 1200,
          target: { kind: 'pace', low: '{{M_pace_fast}}', high: '{{M_pace_slow}}' },
          description: '20 min M pace — controlled, not race effort.' },
      ],
    },
    citation: 'Magness — Science of Running',
  },
  {
    key: 'maf_test',
    name: 'MAF Aerobic Test',
    session_type: 'easy_run',
    purpose: 'Recalibration field test. Run a fixed distance (5K) at a fixed cap HR (LTHR×0.82). Rising splits at same HR = aerobic improvement.',
    prerequisites: 'Run every 4–6 weeks; same route, same conditions.',
    structure: {
      name: 'MAF 5K Test',
      description: '5K at HR cap. Cap = LTHR × 0.82.',
      warmupSeconds: 600,
      cooldownSeconds: 600,
      main: [{
        kind: 'step', stepKey: 'interval', endKind: 'distance', endValue: 5000,
        target: { kind: 'hr', low: '{{MAF_low}}', high: '{{MAF_high}}' },
        description: 'Hold cap HR. Slow if drifting up.',
      }],
    },
    citation: 'Maffetone Method — 180 formula / aerobic test',
  },
  {
    key: 'recovery_run',
    name: 'Recovery Run',
    session_type: 'recovery',
    purpose: 'Active recovery: low-impact circulation, HRV restoration. Strict Z1, short.',
    prerequisites: 'Day after a key session.',
    structure: {
      name: 'Recovery 30',
      description: '30 min very easy. Stay Z1.',
      warmupSeconds: 0,
      cooldownSeconds: 0,
      main: [{
        kind: 'step', stepKey: 'interval', endKind: 'time', endValue: 1800,
        target: { kind: 'hr', low: '{{Z1_low}}', high: '{{Z1_high}}' },
        description: 'Strict Z1. Slow is the point.',
      }],
    },
    citation: 'Seiler — recovery sessions in polarized model',
  },
]

// Catalog index for tool responses (omit Garmin JSON to keep small).
export function templateIndex() {
  return CANONICAL_WORKOUTS.map(w => ({
    key: w.key,
    name: w.name,
    session_type: w.session_type,
    purpose: w.purpose,
    prerequisites: w.prerequisites,
    citation: w.citation,
  }))
}

// Get a parameterized workout JSON, with placeholders substituted from values.
// values keys: Z1_low/Z1_high/Z2_low/Z2_high (HR), E_pace_fast/E_pace_slow,
//   T_pace_fast/T_pace_slow, M_pace_fast/M_pace_slow, I_pace_fast/I_pace_slow,
//   R_pace, MAF_low, MAF_high.
export function templateBy(key, values) {
  const wk = CANONICAL_WORKOUTS.find(w => w.key === key)
  if (!wk) return null
  const json = JSON.stringify(wk.structure)
  const filled = json.replace(/"\{\{(\w+)\}\}"/g, (_, k) => {
    const v = values[k]
    if (v == null) return 'null'
    if (typeof v === 'number') return String(v)
    return JSON.stringify(v)
  })
  try {
    return { ...wk, structure: JSON.parse(filled) }
  } catch {
    return wk
  }
}
