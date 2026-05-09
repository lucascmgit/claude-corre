import { randomUUID } from 'crypto'
import {
  vdotFromRace, pacesFromVdot, criticalSpeed, pacesFromCs,
  zonesFromLthr, lthrFromLabeledLaps, buildFitnessSummary,
} from './fitness.js'
import { CANONICAL_WORKOUTS, templateIndex, templateBy } from './workout-library.js'

// ── Tool definitions (sent to Claude) ────────────────────────────────────────

export const COACH_TOOLS = [
  {
    name: 'get_athlete_profile',
    description: 'Get the athlete\'s full profile including age, weight, location, injuries, weekly availability, and training zones.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_active_goal',
    description: 'Get the athlete\'s current active goal (race distance, target time, target date).',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_training_plan',
    description: 'Get the current active training plan including all phases, current phase, weekly template, and plan rationale.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_current_prescription',
    description: 'Get the most recent pending prescribed session (what the athlete should do next).',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_recent_activities',
    description: 'Get recent completed activities with splits and evaluations for trend analysis.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'Number of days to look back. Default 14.' },
        limit: { type: 'integer', description: 'Max activities to return. Default 10.' }
      },
      required: []
    }
  },
  {
    name: 'get_weekly_summaries',
    description: 'Get weekly training summaries with volume, load, intensity distribution, and ACWR for trend analysis.',
    input_schema: {
      type: 'object',
      properties: {
        weeks: { type: 'integer', description: 'Number of weeks to look back. Default 8.' }
      },
      required: []
    }
  },
  {
    name: 'get_training_load',
    description: 'Get current acute (7-day) and chronic (28-day) training load, ACWR, and fatigue indicators.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'record_activity',
    description: 'Record a completed activity (from Garmin sync, CSV upload, or manual report). Returns the activity ID.',
    input_schema: {
      type: 'object',
      properties: {
        activity_date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        activity_type: { type: 'string', enum: ['run', 'walk', 'yoga', 'strength', 'cycling', 'rest', 'cross_training'] },
        distance_m: { type: 'number', description: 'Distance in meters' },
        duration_s: { type: 'number', description: 'Duration in seconds' },
        avg_hr: { type: 'integer', description: 'Average heart rate in bpm' },
        max_hr: { type: 'integer', description: 'Maximum heart rate in bpm' },
        avg_pace: { type: 'string', description: 'Average pace as min:sec/km e.g. "6:30"' },
        avg_cadence: { type: 'integer', description: 'Average cadence in steps per minute' },
        splits_json: { type: 'string', description: 'JSON array of per-km splits [{km, pace, hr, cadence}]' },
        notes: { type: 'string', description: 'Coach notes or athlete comments' },
        prescribed_session_id: { type: 'string', description: 'ID of the prescription this activity fulfills, if any' }
      },
      required: ['activity_date', 'activity_type']
    }
  },
  {
    name: 'write_workout_evaluation',
    description: 'Write the 5-part evaluation for a completed activity. Call this after recording an activity.',
    input_schema: {
      type: 'object',
      properties: {
        activity_id: { type: 'string', description: 'ID of the activity to evaluate' },
        standalone_analysis: { type: 'string', description: 'Dimension (a): How was this run on its own merits? Splits analysis, HR patterns, cadence, etc.' },
        prescription_comparison: { type: 'string', description: 'Dimension (b): What was prescribed vs what was done?' },
        adherence_score: { type: 'number', description: '0-100 score for how well the athlete followed the prescription' },
        performance_rating: { type: 'string', enum: ['below_target', 'on_target', 'above_target'], description: 'Overall performance relative to prescription' },
        medium_term_trends: { type: 'string', description: 'Dimension (d): Trends over recent weeks — HR drift, pace improvement, volume, ACWR' },
        goal_progress: { type: 'string', description: 'Dimension (e): Where does this place the athlete vs their goal and plan timeline?' },
        coach_notes: { type: 'string', description: 'Summary coaching notes and key takeaways' },
        plan_adjustments: { type: 'string', description: 'JSON describing any plan changes triggered by this evaluation, or null' }
      },
      required: ['activity_id', 'standalone_analysis', 'coach_notes']
    }
  },
  {
    name: 'prescribe_session',
    description: 'Prescribe the next training session. Creates a new prescription visible on dashboard and pushable to Garmin.',
    input_schema: {
      type: 'object',
      properties: {
        prescribed_date: { type: 'string', description: 'ISO date YYYY-MM-DD for when this session should be done' },
        session_type: { type: 'string', enum: ['easy_run', 'long_run', 'tempo', 'intervals', 'recovery', 'rest', 'cross_training'] },
        description: { type: 'string', description: 'Full text description of what to do, including pace/HR targets and execution cues' },
        target_distance_m: { type: 'integer', description: 'Target distance in meters' },
        target_duration_s: { type: 'integer', description: 'Target duration in seconds' },
        target_hr_low: { type: 'integer', description: 'Lower HR target in bpm' },
        target_hr_high: { type: 'integer', description: 'Upper HR target in bpm' },
        target_pace_low: { type: 'string', description: 'Faster pace bound (min:sec/km) e.g. "6:00"' },
        target_pace_high: { type: 'string', description: 'Slower pace bound (min:sec/km) e.g. "7:00"' },
        workout_json: { type: 'string', description: 'Garmin workout builder JSON (intermediate schema)' },
        rationale: { type: 'string', description: '2-4 sentences on the physiological purpose with citations from the science reference' }
      },
      required: ['prescribed_date', 'session_type', 'description', 'rationale']
    }
  },
  {
    name: 'create_training_plan',
    description: 'Create a new periodized training plan for the athlete\'s goal. Called during onboarding or when a new goal is set.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plan name e.g. "10K Sub-50 Plan"' },
        goal_id: { type: 'string', description: 'ID of the goal this plan targets' },
        total_weeks: { type: 'integer', description: 'Total plan duration in weeks' },
        start_date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        phases: {
          type: 'array',
          description: 'Ordered list of training phases',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Phase name e.g. "Aerobic Base"' },
              duration_weeks: { type: 'integer' },
              objective: { type: 'string', description: 'What this phase achieves physiologically' },
              entry_criteria: { type: 'string', description: 'JSON: conditions to enter this phase' },
              exit_criteria: { type: 'string', description: 'JSON: conditions to move to next phase' },
              weekly_template: { type: 'string', description: 'JSON: default week structure' }
            },
            required: ['name', 'duration_weeks', 'objective']
          }
        },
        rationale: { type: 'string', description: 'Why this plan structure was chosen, citing science references' }
      },
      required: ['name', 'total_weeks', 'start_date', 'phases', 'rationale']
    }
  },
  {
    name: 'update_training_plan',
    description: 'Modify the active training plan: adjust phases, shift timelines, change targets based on performance.',
    input_schema: {
      type: 'object',
      properties: {
        adjustment_type: { type: 'string', enum: ['extend_phase', 'skip_phase', 'modify_targets', 'add_recovery_week', 'reschedule'] },
        adjustment_details: { type: 'string', description: 'JSON with the specific changes to make' },
        rationale: { type: 'string', description: 'Why this adjustment, citing science references' }
      },
      required: ['adjustment_type', 'adjustment_details', 'rationale']
    }
  },
  {
    name: 'update_training_zones',
    description: 'Recalibrate training zones based on new data (race result, MAF test, observed HR patterns).',
    input_schema: {
      type: 'object',
      properties: {
        zones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              zone_name: { type: 'string' },
              hr_low: { type: 'integer' },
              hr_high: { type: 'integer' },
              pace_low: { type: 'string' },
              pace_high: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['zone_name']
          }
        },
        source: { type: 'string', description: 'What triggered this recalibration (e.g. "maf_test", "race_result", "coach_adjustment")' },
        rationale: { type: 'string', description: 'Why zones were changed' }
      },
      required: ['zones', 'source', 'rationale']
    }
  },
  {
    name: 'get_fitness_model',
    description: 'Get the athlete\'s current fitness model (VDOT, Critical Speed, LTHR) with derived training paces and HR zones. Use whenever you need to anchor prescriptions or evaluations to current fitness rather than generic formulas.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'recompute_fitness_model',
    description: 'Recalculate the athlete\'s fitness model from race / time-trial efforts. Provide one race (for VDOT) or 2+ efforts at distinct durations (for Critical Speed). Optionally provide an LTHR estimate from a sustained tempo lap.',
    input_schema: {
      type: 'object',
      properties: {
        efforts: {
          type: 'array',
          description: 'Each effort: {distance_m, duration_s, kind: "race"|"timetrial"|"tempo"|"long_run"}.',
          items: {
            type: 'object',
            properties: {
              distance_m: { type: 'number' },
              duration_s: { type: 'number' },
              kind: { type: 'string' },
              activity_id: { type: 'string', description: 'Optional source activity ID' },
            },
            required: ['distance_m', 'duration_s']
          }
        },
        lthr_bpm: { type: 'integer', description: 'Optional manual LTHR override' },
        source: { type: 'string', description: 'Description of where data came from, e.g. "5K race 2026-04-20"' },
      },
      required: ['efforts', 'source']
    }
  },
  {
    name: 'get_workout_templates',
    description: 'List the canonical session catalog (easy, long, tempo, intervals, etc.) the coach can choose from. Returns purpose, prerequisites, and citation for each. Prefer picking a templated session over inventing one.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_workout_template',
    description: 'Get a specific canonical workout, parameterized with the athlete\'s current fitness model (paces and zones substituted). Use the returned `structure` directly as `workout_json` in prescribe_session.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Template key (from get_workout_templates).' }
      },
      required: ['key']
    }
  },
  {
    name: 'get_similar_sessions',
    description: 'Get the last N completed activities of the same session_type / activity_type. Use to compare current session against the athlete\'s baseline for that kind of work.',
    input_schema: {
      type: 'object',
      properties: {
        activity_type: { type: 'string', description: '"run" / "walk" / etc.' },
        session_type: { type: 'string', description: 'Optional: filter by linked prescription session_type (e.g. "tempo").' },
        limit: { type: 'integer', description: 'Default 5, max 10.' },
      },
      required: []
    }
  },
  {
    name: 'get_weekly_state',
    description: 'Get the current week\'s training state: sessions completed, polarized intensity ratio (last 28 days), hard/easy alternation, projected ACWR if a new prescription were added, days until goal race. Call BEFORE prescribing the next session.',
    input_schema: {
      type: 'object',
      properties: {
        proposed_load_min: { type: 'number', description: 'Optional: estimated TRIMP-equivalent of the session you are about to prescribe (duration_min × HR_factor). If provided, returned ACWR includes it.' },
      },
      required: []
    }
  },
  {
    name: 'update_workout_evaluation',
    description: 'Revise a previously written evaluation (e.g. after reviewer feedback). Supply the activity_id and the field(s) to change.',
    input_schema: {
      type: 'object',
      properties: {
        activity_id: { type: 'string' },
        standalone_analysis: { type: 'string' },
        prescription_comparison: { type: 'string' },
        adherence_score: { type: 'number' },
        performance_rating: { type: 'string', enum: ['below_target', 'on_target', 'above_target'] },
        medium_term_trends: { type: 'string' },
        goal_progress: { type: 'string' },
        coach_notes: { type: 'string' },
      },
      required: ['activity_id']
    }
  },
  {
    name: 'update_athlete_profile',
    description: 'Update athlete profile fields (weight, injuries, availability, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
        weight_kg: { type: 'number' },
        height_cm: { type: 'number' },
        location: { type: 'string' },
        max_hr: { type: 'integer' },
        resting_hr: { type: 'integer' },
        previous_peak: { type: 'string' },
        injuries: { type: 'string' },
        weekly_availability: { type: 'string', description: 'JSON: {"run_days": 4, "cross_days": 2, "long_run_day": "Sunday"}' }
      },
      required: []
    }
  },
]

// ── Tool execution handlers ──────────────────────────────────────────────────

export function executeToolCall(db, userId, toolName, toolInput) {
  switch (toolName) {
    case 'get_athlete_profile': return handleGetAthleteProfile(db, userId)
    case 'get_active_goal': return handleGetActiveGoal(db, userId)
    case 'get_training_plan': return handleGetTrainingPlan(db, userId)
    case 'get_current_prescription': return handleGetCurrentPrescription(db, userId)
    case 'get_recent_activities': return handleGetRecentActivities(db, userId, toolInput)
    case 'get_weekly_summaries': return handleGetWeeklySummaries(db, userId, toolInput)
    case 'get_training_load': return handleGetTrainingLoad(db, userId)
    case 'record_activity': return handleRecordActivity(db, userId, toolInput)
    case 'write_workout_evaluation': return handleWriteWorkoutEvaluation(db, userId, toolInput)
    case 'prescribe_session': return handlePrescribeSession(db, userId, toolInput)
    case 'create_training_plan': return handleCreateTrainingPlan(db, userId, toolInput)
    case 'update_training_plan': return handleUpdateTrainingPlan(db, userId, toolInput)
    case 'update_training_zones': return handleUpdateTrainingZones(db, userId, toolInput)
    case 'update_athlete_profile': return handleUpdateAthleteProfile(db, userId, toolInput)
    case 'get_fitness_model': return handleGetFitnessModel(db, userId)
    case 'recompute_fitness_model': return handleRecomputeFitnessModel(db, userId, toolInput)
    case 'get_workout_templates': return handleGetWorkoutTemplates()
    case 'get_workout_template': return handleGetWorkoutTemplate(db, userId, toolInput)
    case 'get_similar_sessions': return handleGetSimilarSessions(db, userId, toolInput)
    case 'get_weekly_state': return handleGetWeeklyState(db, userId, toolInput)
    case 'update_workout_evaluation': return handleUpdateWorkoutEvaluation(db, userId, toolInput)
    default: return { error: `Unknown tool: ${toolName}` }
  }
}

// ── Read handlers ────────────────────────────────────────────────────────────

function handleGetAthleteProfile(db, userId) {
  const profile = db.prepare('SELECT * FROM athlete_profiles WHERE user_id = ?').get(userId)
  const zones = db.prepare('SELECT zone_name, hr_low, hr_high, pace_low, pace_high, description, source FROM training_zones WHERE user_id = ? ORDER BY zone_name').all(userId)
  const reports = db.prepare("SELECT * FROM availability_reports WHERE user_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 5").all(userId)
  return { profile: profile || null, zones, active_reports: reports }
}

function handleGetActiveGoal(db, userId) {
  const goal = db.prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(userId)
  return goal || { message: 'No active goal set. Ask the athlete about their goals.' }
}

function handleGetTrainingPlan(db, userId) {
  const plan = db.prepare("SELECT * FROM training_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(userId)
  if (!plan) return { message: 'No active training plan. Create one after establishing the athlete\'s goal.' }
  const phases = db.prepare('SELECT * FROM plan_phases WHERE plan_id = ? ORDER BY phase_order').all(plan.id)
  const currentPhase = phases.find(p => p.status === 'active') || null
  return { plan, phases, currentPhase }
}

function handleGetCurrentPrescription(db, userId) {
  const prescription = db.prepare(
    "SELECT * FROM prescribed_sessions WHERE user_id = ? AND status = 'pending' ORDER BY prescribed_date ASC LIMIT 1"
  ).get(userId)
  return prescription || { message: 'No pending prescription. Prescribe the next session.' }
}

function handleGetRecentActivities(db, userId, input) {
  const days = input.days || 14
  const limit = Math.min(input.limit || 10, 30)
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const activities = db.prepare(
    'SELECT * FROM activities WHERE user_id = ? AND activity_date >= ? ORDER BY activity_date DESC LIMIT ?'
  ).all(userId, cutoff, limit)
  // Attach evaluations
  for (const a of activities) {
    a.evaluation = db.prepare('SELECT * FROM workout_evaluations WHERE activity_id = ?').get(a.id) || null
    // Attach linked prescription
    if (a.prescribed_session_id) {
      a.prescription = db.prepare('SELECT * FROM prescribed_sessions WHERE id = ?').get(a.prescribed_session_id) || null
    }
  }
  return { activities, count: activities.length }
}

function handleGetWeeklySummaries(db, userId, input) {
  const weeks = Math.min(input.weeks || 8, 52)
  const summaries = db.prepare(
    'SELECT * FROM weekly_summaries WHERE user_id = ? ORDER BY week_start DESC LIMIT ?'
  ).all(userId, weeks)
  return { summaries, count: summaries.length }
}

function handleGetTrainingLoad(db, userId) {
  // Compute acute (7-day) and chronic (28-day) load from activities
  const now = new Date()
  const d7 = new Date(now - 7 * 86400000).toISOString().split('T')[0]
  const d28 = new Date(now - 28 * 86400000).toISOString().split('T')[0]

  const acute = db.prepare(
    "SELECT COALESCE(SUM(duration_s * CASE WHEN avg_hr > 0 THEN avg_hr / 100.0 ELSE 1 END), 0) as load, COUNT(*) as sessions FROM activities WHERE user_id = ? AND activity_date >= ?"
  ).get(userId, d7)
  const chronic = db.prepare(
    "SELECT COALESCE(SUM(duration_s * CASE WHEN avg_hr > 0 THEN avg_hr / 100.0 ELSE 1 END), 0) as load, COUNT(*) as sessions FROM activities WHERE user_id = ? AND activity_date >= ?"
  ).get(userId, d28)

  const acuteLoad = acute.load
  const chronicLoad = chronic.load / 4 // weekly average over 4 weeks
  const acwr = chronicLoad > 0 ? (acuteLoad / chronicLoad).toFixed(2) : null

  return {
    acute_load: Math.round(acuteLoad),
    chronic_load: Math.round(chronicLoad),
    acwr: acwr ? parseFloat(acwr) : null,
    acute_sessions: acute.sessions,
    chronic_sessions: chronic.sessions,
    risk_level: acwr === null ? 'unknown' : acwr > 1.5 ? 'high' : acwr > 1.3 ? 'elevated' : acwr < 0.8 ? 'detraining' : 'optimal'
  }
}

// ── Write handlers ───────────────────────────────────────────────────────────

function handleRecordActivity(db, userId, input) {
  const id = randomUUID()
  // Validate prescribed_session_id if provided — Claude may hallucinate IDs
  let prescId = input.prescribed_session_id || null
  if (prescId) {
    const exists = db.prepare('SELECT id FROM prescribed_sessions WHERE id = ? AND user_id = ?').get(prescId, userId)
    if (!exists) prescId = null
  }
  db.prepare(`INSERT INTO activities
    (id, user_id, prescribed_session_id, activity_date, activity_type, source, distance_m, duration_s,
     avg_hr, max_hr, avg_pace, avg_cadence, splits_json, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, userId,
    prescId,
    input.activity_date,
    input.activity_type,
    input.source || 'coach',
    input.distance_m || null,
    input.duration_s || null,
    input.avg_hr || null,
    input.max_hr || null,
    input.avg_pace || null,
    input.avg_cadence || null,
    input.splits_json || null,
    input.notes || null,
    Date.now()
  )
  // Mark linked prescription as completed
  if (prescId) {
    db.prepare("UPDATE prescribed_sessions SET status = 'completed' WHERE id = ? AND user_id = ?").run(prescId, userId)
  }
  // Update weekly summary
  updateWeeklySummary(db, userId, input.activity_date)
  return { activity_id: id, message: 'Activity recorded successfully.' }
}

function updateWeeklySummary(db, userId, activityDate) {
  try {
    const d = new Date(activityDate)
    const day = (d.getDay() + 6) % 7
    const mon = new Date(d); mon.setDate(mon.getDate() - day)
    const weekStart = mon.toISOString().split('T')[0]
    const weekEnd = new Date(mon.getTime() + 7 * 86400000).toISOString().split('T')[0]

    const stats = db.prepare(`
      SELECT COUNT(*) as run_count,
             COALESCE(SUM(distance_m), 0) as total_distance_m,
             COALESCE(SUM(duration_s), 0) as total_duration_s,
             ROUND(AVG(CASE WHEN avg_hr > 0 THEN avg_hr END)) as avg_hr
      FROM activities WHERE user_id = ? AND activity_date >= ? AND activity_date < ? AND activity_type = 'run'
    `).get(userId, weekStart, weekEnd)

    const existing = db.prepare('SELECT id FROM weekly_summaries WHERE user_id = ? AND week_start = ?').get(userId, weekStart)
    if (existing) {
      db.prepare('UPDATE weekly_summaries SET total_distance_m=?, total_duration_s=?, run_count=?, avg_hr=?, created_at=? WHERE id=?')
        .run(stats.total_distance_m, stats.total_duration_s, stats.run_count, stats.avg_hr, Date.now(), existing.id)
    } else {
      db.prepare('INSERT INTO weekly_summaries (id, user_id, week_start, total_distance_m, total_duration_s, run_count, avg_hr, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), userId, weekStart, stats.total_distance_m, stats.total_duration_s, stats.run_count, stats.avg_hr, Date.now())
    }
  } catch (e) {
    console.error('Weekly summary update failed:', e.message)
  }
}

function handleWriteWorkoutEvaluation(db, userId, input) {
  // Resolve activity_id: use provided ID, or fall back to most recent activity for this user
  let activityId = input.activity_id
  if (activityId) {
    const exists = db.prepare('SELECT id FROM activities WHERE id = ? AND user_id = ?').get(activityId, userId)
    if (!exists) {
      // Claude may have hallucinated the ID — use most recent activity instead
      const latest = db.prepare('SELECT id FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId)
      activityId = latest?.id || null
    }
  } else {
    // No activity_id provided — use most recent
    const latest = db.prepare('SELECT id FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId)
    activityId = latest?.id || null
  }

  if (!activityId) return { error: 'No activity found to evaluate.' }

  const id = randomUUID()
  db.prepare(`INSERT INTO workout_evaluations
    (id, activity_id, user_id, standalone_analysis, prescription_comparison, adherence_score,
     performance_rating, medium_term_trends, goal_progress, coach_notes, plan_adjustments, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, activityId,
    userId,
    input.standalone_analysis,
    input.prescription_comparison || null,
    input.adherence_score || null,
    input.performance_rating || null,
    input.medium_term_trends || null,
    input.goal_progress || null,
    input.coach_notes,
    input.plan_adjustments || null,
    Date.now()
  )
  return { evaluation_id: id, activity_id: activityId, message: 'Workout evaluation saved.' }
}

function handlePrescribeSession(db, userId, input) {
  const id = randomUUID()
  // Supersede any existing pending prescriptions — only one "next workout" at a time
  db.prepare("UPDATE prescribed_sessions SET status = 'superseded' WHERE user_id = ? AND status = 'pending'").run(userId)

  // Find active plan and phase
  const plan = db.prepare("SELECT id FROM training_plans WHERE user_id = ? AND status = 'active' LIMIT 1").get(userId)
  const phase = plan ? db.prepare("SELECT id FROM plan_phases WHERE plan_id = ? AND status = 'active' LIMIT 1").get(plan.id) : null

  db.prepare(`INSERT INTO prescribed_sessions
    (id, user_id, plan_id, phase_id, prescribed_date, session_type, description,
     target_distance_m, target_duration_s, target_hr_low, target_hr_high,
     target_pace_low, target_pace_high, workout_json, rationale, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
    id, userId,
    plan?.id || null,
    phase?.id || null,
    input.prescribed_date,
    input.session_type,
    input.description,
    input.target_distance_m || null,
    input.target_duration_s || null,
    input.target_hr_low || null,
    input.target_hr_high || null,
    input.target_pace_low || null,
    input.target_pace_high || null,
    input.workout_json || null,
    input.rationale,
    Date.now()
  )
  return { prescription_id: id, message: `Session prescribed for ${input.prescribed_date}.` }
}

function handleCreateTrainingPlan(db, userId, input) {
  const planId = randomUUID()
  const now = Date.now()

  // Supersede any existing active plan
  db.prepare("UPDATE training_plans SET status = 'superseded', updated_at = ? WHERE user_id = ? AND status = 'active'").run(now, userId)

  db.prepare(`INSERT INTO training_plans
    (id, user_id, goal_id, name, total_weeks, start_date, status, plan_json, rationale, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`).run(
    planId, userId,
    input.goal_id || null,
    input.name,
    input.total_weeks,
    input.start_date,
    JSON.stringify({ phases: input.phases }),
    input.rationale,
    now, now
  )

  // Create phase records
  for (let i = 0; i < input.phases.length; i++) {
    const p = input.phases[i]
    db.prepare(`INSERT INTO plan_phases
      (id, plan_id, phase_order, name, duration_weeks, objective, entry_criteria, exit_criteria, weekly_template, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), planId, i + 1,
      p.name, p.duration_weeks, p.objective,
      p.entry_criteria || null, p.exit_criteria || null, p.weekly_template || null,
      i === 0 ? 'active' : 'pending' // First phase starts active
    )
  }

  return { plan_id: planId, phases_created: input.phases.length, message: 'Training plan created. First phase is now active.' }
}

function handleUpdateTrainingPlan(db, userId, input) {
  const plan = db.prepare("SELECT * FROM training_plans WHERE user_id = ? AND status = 'active' LIMIT 1").get(userId)
  if (!plan) return { error: 'No active training plan to update.' }

  const now = Date.now()
  let details
  try { details = JSON.parse(input.adjustment_details) } catch { details = { raw: input.adjustment_details } }

  switch (input.adjustment_type) {
    case 'extend_phase': {
      const phase = db.prepare("SELECT * FROM plan_phases WHERE plan_id = ? AND status = 'active' LIMIT 1").get(plan.id)
      if (phase && details.additional_weeks) {
        db.prepare('UPDATE plan_phases SET duration_weeks = duration_weeks + ? WHERE id = ?').run(details.additional_weeks, phase.id)
        db.prepare('UPDATE training_plans SET total_weeks = total_weeks + ?, updated_at = ? WHERE id = ?').run(details.additional_weeks, now, plan.id)
      }
      break
    }
    case 'add_recovery_week': {
      db.prepare('UPDATE training_plans SET total_weeks = total_weeks + 1, updated_at = ? WHERE id = ?').run(now, plan.id)
      break
    }
    case 'modify_targets': {
      // Store adjustment in plan_json
      const planJson = JSON.parse(plan.plan_json || '{}')
      planJson.adjustments = planJson.adjustments || []
      planJson.adjustments.push({ type: input.adjustment_type, details, rationale: input.rationale, date: new Date().toISOString() })
      db.prepare('UPDATE training_plans SET plan_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(planJson), now, plan.id)
      break
    }
    case 'skip_phase': {
      // Advance to next phase
      const current = db.prepare("SELECT * FROM plan_phases WHERE plan_id = ? AND status = 'active' LIMIT 1").get(plan.id)
      if (current) {
        db.prepare("UPDATE plan_phases SET status = 'completed', completed_at = ? WHERE id = ?").run(now, current.id)
        const next = db.prepare("SELECT * FROM plan_phases WHERE plan_id = ? AND status = 'pending' ORDER BY phase_order LIMIT 1").get(plan.id)
        if (next) {
          db.prepare("UPDATE plan_phases SET status = 'active', started_at = ? WHERE id = ?").run(now, next.id)
        }
      }
      break
    }
    case 'reschedule': {
      if (details.new_start_date) {
        db.prepare('UPDATE training_plans SET start_date = ?, updated_at = ? WHERE id = ?').run(details.new_start_date, now, plan.id)
      }
      break
    }
  }

  // Log the adjustment in plan_json
  const planJson = JSON.parse(plan.plan_json || '{}')
  planJson.adjustment_history = planJson.adjustment_history || []
  planJson.adjustment_history.push({ type: input.adjustment_type, details, rationale: input.rationale, date: new Date().toISOString() })
  db.prepare('UPDATE training_plans SET plan_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(planJson), now, plan.id)

  return { message: `Plan updated: ${input.adjustment_type}. Rationale: ${input.rationale}` }
}

function handleUpdateTrainingZones(db, userId, input) {
  const now = Date.now()
  // Delete old zones and insert new ones
  db.prepare('DELETE FROM training_zones WHERE user_id = ?').run(userId)
  for (const z of input.zones) {
    db.prepare(`INSERT INTO training_zones
      (id, user_id, zone_name, hr_low, hr_high, pace_low, pace_high, description, calibrated_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), userId,
      z.zone_name, z.hr_low || null, z.hr_high || null,
      z.pace_low || null, z.pace_high || null,
      z.description || null, now, input.source
    )
  }
  return { zones_updated: input.zones.length, message: `Training zones recalibrated from ${input.source}.` }
}

function handleUpdateAthleteProfile(db, userId, input) {
  const now = Date.now()
  const existing = db.prepare('SELECT user_id FROM athlete_profiles WHERE user_id = ?').get(userId)

  if (existing) {
    // Build dynamic UPDATE only for provided fields
    const updates = []
    const values = []
    for (const [key, col] of Object.entries({
      name: 'name', age: 'age', weight_kg: 'weight_kg', height_cm: 'height_cm',
      location: 'location', max_hr: 'max_hr', resting_hr: 'resting_hr',
      previous_peak: 'previous_peak', injuries: 'injuries', weekly_availability: 'weekly_availability'
    })) {
      if (input[key] !== undefined) {
        updates.push(`${col} = ?`)
        values.push(key === 'weekly_availability' && typeof input[key] === 'object' ? JSON.stringify(input[key]) : input[key])
      }
    }
    if (updates.length > 0) {
      updates.push('updated_at = ?')
      values.push(now, userId)
      db.prepare(`UPDATE athlete_profiles SET ${updates.join(', ')} WHERE user_id = ?`).run(...values)
    }
  } else {
    db.prepare(`INSERT INTO athlete_profiles
      (user_id, name, age, weight_kg, height_cm, location, max_hr, resting_hr, previous_peak, injuries, weekly_availability, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      userId, input.name || null, input.age || null, input.weight_kg || null,
      input.height_cm || null, input.location || null, input.max_hr || null,
      input.resting_hr || null, input.previous_peak || null, input.injuries || null,
      input.weekly_availability ? (typeof input.weekly_availability === 'object' ? JSON.stringify(input.weekly_availability) : input.weekly_availability) : null,
      now
    )
  }
  return { message: 'Athlete profile updated.' }
}

// ── Fitness model handlers ───────────────────────────────────────────────────

function handleGetFitnessModel(db, userId) {
  const p = db.prepare('SELECT vdot, critical_speed_mps, d_prime_m, lthr_bpm, fitness_calibrated_at, fitness_source FROM athlete_profiles WHERE user_id = ?').get(userId) || {}
  if (!p.vdot && !p.critical_speed_mps && !p.lthr_bpm) {
    return { message: 'No fitness model yet. Call recompute_fitness_model with a recent race or 2+ time-trial efforts.' }
  }
  return {
    ...buildFitnessSummary({
      vdot: p.vdot, cs_mps: p.critical_speed_mps, d_prime_m: p.d_prime_m, lthr_bpm: p.lthr_bpm,
    }),
    calibrated_at: p.fitness_calibrated_at,
    source: p.fitness_source,
    age_days: p.fitness_calibrated_at ? Math.floor((Date.now() - p.fitness_calibrated_at) / 86_400_000) : null,
  }
}

function handleRecomputeFitnessModel(db, userId, input) {
  const efforts = (input.efforts || []).filter(e => e.distance_m > 0 && e.duration_s > 0)
  if (efforts.length === 0) return { error: 'No valid efforts provided.' }

  // VDOT from the longest "race" or "timetrial" effort with the highest implied VO2 demand.
  let vdot = null
  const raceLike = efforts.filter(e => e.kind === 'race' || e.kind === 'timetrial')
  for (const e of (raceLike.length ? raceLike : efforts)) {
    const v = vdotFromRace(e.distance_m, e.duration_s)
    if (v != null && (vdot == null || v > vdot)) vdot = v
  }

  // CS from 2+ distinct-duration efforts.
  let cs = null
  if (efforts.length >= 2) {
    cs = criticalSpeed(efforts)
  }

  // LTHR — explicit override wins, otherwise null (caller can pass labeled-lap-derived value).
  const lthr = input.lthr_bpm || null

  // Persist whatever we computed; preserve previously-set values otherwise.
  const existing = db.prepare('SELECT vdot, critical_speed_mps, d_prime_m, lthr_bpm FROM athlete_profiles WHERE user_id = ?').get(userId) || {}
  const now = Date.now()
  // Ensure profile row exists
  const profExists = db.prepare('SELECT user_id FROM athlete_profiles WHERE user_id = ?').get(userId)
  if (!profExists) {
    db.prepare('INSERT INTO athlete_profiles (user_id, updated_at) VALUES (?, ?)').run(userId, now)
  }
  db.prepare(`UPDATE athlete_profiles SET
    vdot = COALESCE(?, vdot),
    critical_speed_mps = COALESCE(?, critical_speed_mps),
    d_prime_m = COALESCE(?, d_prime_m),
    lthr_bpm = COALESCE(?, lthr_bpm),
    fitness_calibrated_at = ?,
    fitness_source = ?,
    updated_at = ?
  WHERE user_id = ?`).run(
    vdot, cs?.cs_mps || null, cs?.d_prime_m || null, lthr,
    now, input.source, now, userId
  )

  const merged = {
    vdot: vdot || existing.vdot,
    cs_mps: cs?.cs_mps || existing.critical_speed_mps,
    d_prime_m: cs?.d_prime_m || existing.d_prime_m,
    lthr_bpm: lthr || existing.lthr_bpm,
  }
  return {
    updated: { vdot, cs, lthr },
    summary: buildFitnessSummary(merged),
    message: `Fitness model recalibrated from ${input.source}.`,
  }
}

// ── Workout library handlers ─────────────────────────────────────────────────

function handleGetWorkoutTemplates() {
  return { templates: templateIndex() }
}

function handleGetWorkoutTemplate(db, userId, input) {
  const tmpl = CANONICAL_WORKOUTS.find(w => w.key === input.key)
  if (!tmpl) return { error: `Unknown template key: ${input.key}` }

  // Build substitution values from the fitness model + zones.
  const fm = handleGetFitnessModel(db, userId)
  const zonesRow = db.prepare('SELECT zone_name, hr_low, hr_high FROM training_zones WHERE user_id = ?').all(userId)
  const zoneMap = {}
  for (const z of zonesRow) zoneMap[z.zone_name] = z

  const lthrZones = fm?.lthr_zones || []
  const lthrMap = {}
  for (const z of lthrZones) lthrMap[z.zone_name] = z

  const danielsPaces = fm?.daniels_paces || {}
  const csPaces = fm?.cs_paces || {}

  // Helpers: prefer LTHR-derived zones, fall back to existing training_zones.
  const hr = (zone, side) => {
    const z = lthrMap[zone] || zoneMap[zone]
    if (!z) return null
    return side === 'low' ? z.hr_low : z.hr_high
  }
  // Pace bands: prefer Daniels paces (E/M/T/I/R), otherwise CS bands.
  // Daniels gives a single point estimate; widen by ±5sec/km for low/high.
  const widen = (paceStr, deltaSec) => {
    if (!paceStr) return null
    const m = paceStr.match(/^(\d+):(\d{2})$/)
    if (!m) return null
    const total = parseInt(m[1]) * 60 + parseInt(m[2]) + deltaSec
    const mm = Math.floor(total / 60), ss = total % 60
    return `${mm}:${String(ss).padStart(2, '0')}`
  }

  const values = {
    Z1_low: hr('Z1', 'low'), Z1_high: hr('Z1', 'high'),
    Z2_low: hr('Z2', 'low'), Z2_high: hr('Z2', 'high'),
    Z3_low: hr('Z3', 'low'), Z3_high: hr('Z3', 'high'),
    Z4_low: hr('Z4', 'low'), Z4_high: hr('Z4', 'high'),
    E_pace_fast: widen(danielsPaces.E, -5) || (csPaces.Easy && csPaces.Easy.fast),
    E_pace_slow: widen(danielsPaces.E, 15) || (csPaces.Easy && csPaces.Easy.slow),
    M_pace_fast: widen(danielsPaces.M, -3),
    M_pace_slow: widen(danielsPaces.M, 8),
    T_pace_fast: widen(danielsPaces.T, -3) || (csPaces.Threshold && csPaces.Threshold.fast),
    T_pace_slow: widen(danielsPaces.T, 5) || (csPaces.Threshold && csPaces.Threshold.slow),
    I_pace_fast: widen(danielsPaces.I, -3) || (csPaces.VO2max && csPaces.VO2max.fast),
    I_pace_slow: widen(danielsPaces.I, 5) || (csPaces.VO2max && csPaces.VO2max.slow),
    MAF_low: fm?.lthr_bpm ? Math.round(fm.lthr_bpm * 0.78) : null,
    MAF_high: fm?.lthr_bpm ? Math.round(fm.lthr_bpm * 0.82) : null,
  }
  const filled = templateBy(input.key, values)
  return {
    template: filled,
    fitness_inputs: values,
    note: 'Pass `template.structure` as the workout_json in prescribe_session. Cite the template purpose and citation in your rationale.',
  }
}

function handleGetSimilarSessions(db, userId, input) {
  const limit = Math.min(input.limit || 5, 10)
  let rows
  if (input.session_type) {
    rows = db.prepare(`
      SELECT a.*, p.session_type, e.standalone_analysis, e.adherence_score, e.performance_rating
      FROM activities a
      LEFT JOIN prescribed_sessions p ON p.id = a.prescribed_session_id
      LEFT JOIN workout_evaluations e ON e.activity_id = a.id
      WHERE a.user_id = ? AND p.session_type = ?
      ORDER BY a.activity_date DESC LIMIT ?
    `).all(userId, input.session_type, limit)
  } else {
    rows = db.prepare(`
      SELECT a.*, p.session_type, e.standalone_analysis, e.adherence_score, e.performance_rating
      FROM activities a
      LEFT JOIN prescribed_sessions p ON p.id = a.prescribed_session_id
      LEFT JOIN workout_evaluations e ON e.activity_id = a.id
      WHERE a.user_id = ? AND a.activity_type = COALESCE(?, a.activity_type)
      ORDER BY a.activity_date DESC LIMIT ?
    `).all(userId, input.activity_type || null, limit)
  }
  // Trim heavy columns
  const compact = rows.map(r => ({
    activity_id: r.id,
    activity_date: r.activity_date,
    session_type: r.session_type || null,
    activity_type: r.activity_type,
    distance_m: r.distance_m,
    duration_s: r.duration_s,
    avg_hr: r.avg_hr,
    max_hr: r.max_hr,
    avg_pace: r.avg_pace,
    avg_cadence: r.avg_cadence,
    adherence_score: r.adherence_score,
    performance_rating: r.performance_rating,
  }))
  return { sessions: compact, count: compact.length }
}

// HR-load proxy: minutes × HR_intensity (avg_hr / 60). Comparable to TRIMP.
function loadOf(activity) {
  const dur_min = (activity.duration_s || 0) / 60
  const hr = activity.avg_hr || 60
  return Math.round(dur_min * (hr / 60))
}

function handleGetWeeklyState(db, userId, input) {
  const now = new Date()
  const day = (now.getDay() + 6) % 7
  const monday = new Date(now); monday.setHours(0,0,0,0); monday.setDate(monday.getDate() - day)
  const weekStart = monday.toISOString().split('T')[0]
  const weekEnd = new Date(monday.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const thisWeek = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date >= ? AND activity_date < ? ORDER BY activity_date').all(userId, weekStart, weekEnd)

  // Hard/easy alternation: tag each session by intensity via avg_hr quartile-ish heuristic.
  // Anchored on LTHR if known.
  const lthr = (db.prepare('SELECT lthr_bpm FROM athlete_profiles WHERE user_id = ?').get(userId) || {}).lthr_bpm
  const tagIntensity = (a) => {
    if (!a.avg_hr) return 'unknown'
    if (lthr) {
      if (a.avg_hr >= lthr * 0.94) return 'hard'
      if (a.avg_hr >= lthr * 0.82) return 'moderate'
      return 'easy'
    }
    if (a.avg_hr > 160) return 'hard'
    if (a.avg_hr > 140) return 'moderate'
    return 'easy'
  }
  const sessions = thisWeek.map(a => ({
    date: a.activity_date,
    type: a.activity_type,
    distance_m: a.distance_m,
    duration_s: a.duration_s,
    avg_hr: a.avg_hr,
    intensity: tagIntensity(a),
    load: loadOf(a),
  }))

  // Hard/easy alternation violations (two hards back-to-back)
  const alternationIssues = []
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].intensity === 'hard' && sessions[i-1].intensity === 'hard') {
      alternationIssues.push(`${sessions[i-1].date} (hard) → ${sessions[i].date} (hard) — back-to-back hard sessions`)
    }
  }

  // Polarized ratio over last 28 days (time-based)
  const cutoff28 = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0]
  const last28 = db.prepare('SELECT duration_s, avg_hr FROM activities WHERE user_id = ? AND activity_date >= ?').all(userId, cutoff28)
  let easy_s = 0, mod_s = 0, hard_s = 0
  for (const a of last28) {
    const t = a.duration_s || 0
    const tag = tagIntensity(a)
    if (tag === 'easy') easy_s += t
    else if (tag === 'moderate') mod_s += t
    else if (tag === 'hard') hard_s += t
  }
  const total_s = easy_s + mod_s + hard_s
  const polarized = total_s > 0 ? {
    easy_pct: Math.round(easy_s / total_s * 100),
    moderate_pct: Math.round(mod_s / total_s * 100),
    hard_pct: Math.round(hard_s / total_s * 100),
    target: '~80% easy / <10% moderate / ~15-20% hard (polarized 80/20)',
  } : null

  // ACWR computation (HR-load proxy)
  const cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const last7 = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date >= ?').all(userId, cutoff7)
  let acuteLoad = 0
  for (const a of last7) acuteLoad += loadOf(a)
  let chronicLoad = 0
  for (const a of last28) chronicLoad += loadOf({duration_s: a.duration_s, avg_hr: a.avg_hr})
  const chronicWeekly = chronicLoad / 4
  const acwr_now = chronicWeekly > 0 ? Math.round(acuteLoad / chronicWeekly * 100) / 100 : null
  const proposed_load = input.proposed_load_min || 0
  const acwr_with_proposed = chronicWeekly > 0 && proposed_load > 0
    ? Math.round((acuteLoad + proposed_load) / chronicWeekly * 100) / 100
    : null

  // Days to goal
  const goal = db.prepare("SELECT target_date FROM goals WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(userId)
  let days_to_goal = null
  if (goal?.target_date) {
    const td = new Date(goal.target_date)
    days_to_goal = Math.floor((td.getTime() - Date.now()) / 86_400_000)
  }

  // Taper guidance
  let taper_advice = null
  if (days_to_goal != null) {
    if (days_to_goal < 0) taper_advice = 'Goal date passed. Confirm next goal before prescribing.'
    else if (days_to_goal <= 4) taper_advice = 'Race week: only easy runs and short race-pace strides. No new stimuli.'
    else if (days_to_goal <= 10) taper_advice = 'Taper: reduce volume 30–50%, keep some intensity, no new stimuli.'
    else if (days_to_goal <= 21) taper_advice = 'Pre-taper: peak week behind us; begin volume reduction next week.'
  }

  return {
    week_start: weekStart,
    sessions_this_week: sessions,
    week_volume_m: sessions.reduce((s, a) => s + (a.distance_m || 0), 0),
    week_duration_s: sessions.reduce((s, a) => s + (a.duration_s || 0), 0),
    alternation_issues: alternationIssues,
    polarized_28d: polarized,
    acwr_now,
    acwr_with_proposed,
    acwr_thresholds: { detraining: '<0.8', optimal: '0.8–1.3', elevated: '1.3–1.5', high_risk: '>1.5' },
    days_to_goal,
    taper_advice,
  }
}

function handleUpdateWorkoutEvaluation(db, userId, input) {
  const exists = db.prepare('SELECT id FROM workout_evaluations WHERE activity_id = ? AND user_id = ?').get(input.activity_id, userId)
  if (!exists) return { error: 'No existing evaluation for that activity_id.' }
  const fields = ['standalone_analysis', 'prescription_comparison', 'adherence_score', 'performance_rating', 'medium_term_trends', 'goal_progress', 'coach_notes']
  const updates = []
  const values = []
  for (const f of fields) {
    if (input[f] !== undefined) { updates.push(`${f} = ?`); values.push(input[f]) }
  }
  if (updates.length === 0) return { message: 'No fields to update.' }
  values.push(input.activity_id, userId)
  db.prepare(`UPDATE workout_evaluations SET ${updates.join(', ')} WHERE activity_id = ? AND user_id = ?`).run(...values)
  return { message: 'Evaluation revised.', activity_id: input.activity_id }
}
