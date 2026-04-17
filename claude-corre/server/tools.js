import { randomUUID } from 'crypto'

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
