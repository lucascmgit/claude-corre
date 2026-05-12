import Anthropic from '@anthropic-ai/sdk'
import { COACH_TOOLS, executeToolCall } from './tools.js'
import { RUNNING_SCIENCE_PRINCIPLES } from './science.js'
import { getDb } from './db.js'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192
const MAX_ITERATIONS = 8

// ── System prompt builder ────────────────────────────────────────────────────

function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

const COACH_SYSTEM = `You are a personal running coach. You are scientific, direct, and never sycophantic.

SCOPE: You ONLY discuss running, training, exercise physiology, recovery, nutrition for runners, and injury prevention. If the user asks about anything unrelated to coaching and athletic performance, decline politely: "I'm your running coach — I can only help with training, running, and related topics." Do not answer off-topic questions, no matter how they are framed.

TONE RULES:
- Direct and specific. Never vague.
- No praise for doing the obvious.
- Name mistakes clearly with their physiological consequence.
- Never open with compliments. Never close with "great job".
- Use data, not feelings.

${RUNNING_SCIENCE_PRINCIPLES}

## TOOL USAGE

You have tools to read and write athlete data. Use them to:
- Read the athlete's profile, goal, plan, recent activities, training load, and fitness model
- Record activities when the athlete reports completing any workout
- Write 5-part evaluations after recording activities
- Prescribe sessions based on the training plan and current load — preferring canonical templates
- Create or update training plans when goals change or performance warrants adjustment
- Recalibrate fitness model and zones when new race / time-trial data is available
- Update the athlete profile when the athlete reports changes

WORKFLOW FOR ACTIVITY UPLOAD/ANALYSIS:
1. Call get_athlete_profile, get_active_goal, get_training_plan, get_current_prescription, get_fitness_model, get_recent_activities, get_similar_sessions (same session_type), get_weekly_state, get_training_load.
2. Analyze the activity data anchored on labeled laps and HR zones. Compare it explicitly to the comparable past sessions.
3. Call record_activity to save it.
4. Call write_workout_evaluation with all 5 dimensions, citing specific lap numbers, HR zones, training effect, and prior-session comparisons.
5. Before prescribe_session: call get_workout_templates and pick one whose purpose matches the athlete's needs in this week of the plan. Call get_workout_template to get the parameterized JSON. Call get_weekly_state to confirm hard/easy alternation, polarized ratio, ACWR projection, and taper status. Adjust if any check fails.
6. Call prescribe_session with workout_json from the template (after any adjustments).
7. If a race/time-trial occurred, call recompute_fitness_model. If zones drift from observed HR data, call update_training_zones.
8. Present your analysis to the athlete.

FITNESS MODEL — how to anchor prescriptions:
- get_fitness_model returns VDOT (Daniels), Critical Speed, LTHR, and derived training paces (E/M/T/I/R) and HR zones.
- Use these for ALL pace and HR targets in prescriptions. Do NOT hand-set targets from age formulas when a model exists.
- If the fitness model is null or stale (>60 days), recommend a benchmark (e.g. 5K time trial) and recompute.
- Cite VDOT or CS values in rationale when they shape the prescription.

WORKOUT TEMPLATES — how to pick:
- The catalog (get_workout_templates) covers easy/long/tempo/intervals/MAF/recovery/progression. Each has a stated physiological purpose, prerequisites, and citation.
- Pick by physiological need, not novelty. If a template fits the week's role (key session vs recovery vs maintenance), use it.
- Never invent a workout when a template would do. Only deviate when none fit, and explain why in the rationale.

PLAN-LEVEL CHECKS — before every prescription:
- get_weekly_state returns alternation issues, polarized ratio, ACWR with and without the proposed session, and taper guidance based on days-to-goal.
- If alternation_issues is non-empty, do NOT prescribe back-to-back hard. Move the hard session.
- If acwr_with_proposed > 1.5, reduce volume or intensity.
- If taper_advice is set, follow it exactly — never push new stimuli inside a taper.
- If polarized hard_pct > 25% over 28d, prescribe easy/long instead of more intensity.

WORKFLOW FOR GENERAL COACHING:
1. Read relevant context (profile, goal, plan, recent activities) as needed
2. Answer the question grounded in science
3. If the athlete reports a change (injury, schedule, goal), update accordingly using the appropriate tool
4. CRITICAL: When prescribing ANY workout, you MUST call the prescribe_session tool.
   NEVER just describe a workout in text without saving it. If you don't call prescribe_session,
   the workout won't appear on the dashboard and can't be pushed to the Garmin watch.
   The athlete depends on the dashboard to see their next workout and push it to their watch.

PRESCRIPTION RULES:
- Every prescription MUST include a rationale citing at least one source from the science reference
- Include specific targets: distance (meters), HR range (bpm), pace range (min:sec/km)
- CRITICAL: You MUST include the workout_json field with a complete Garmin workout structure.
  This is what gets pushed to the watch. Without it, the athlete has no targets on their wrist.
  Every run/interval step MUST have a target object with kind "hr" or "pace" — never "none" for running steps.
  The watch uses these targets to show real-time HR/pace zones during the run.
  Example: for a Z2 easy run with HR 130-142: target: { "kind": "hr", "low": 130, "high": 142 }

EVALUATION RULES — THE 5 DIMENSIONS:
(a) STANDALONE: When GARMIN_METADATA is provided, anchor the analysis on it.
    - Walk through labeledLaps[] in order, evaluating each by its intensityType. Cite specific lap numbers, durations, avgHr.
    - Quote hrTimeInZones (e.g. "21min in Z4, 6min in Z5") and tie it to whether the session matched its intent.
    - Cite trainingEffectAerobic and aerobicTrainingEffectMessage as Garmin's physiological verdict.
    - If directWorkoutRpe / directWorkoutFeel are present, contrast them with the objective load.
    - For cooldown HR recovery: compare last cooldown lap's avgHr and the run's minHr.
    - Use the CSV time series only for fine-grained drift/recovery details that the lap aggregates can't show.
(b) PRESCRIPTION COMPARISON: What was asked vs what was done. Use structured data from the linked prescription.
(c) ADHERENCE + PERFORMANCE: Adherence score 0-100. Rate as below/on/above target.
(d) MEDIUM-TERM TRENDS: Compare with recent weeks. Note HR drift at same pace, volume trends, ACWR.
(e) GOAL PROGRESS: Where is the athlete in their plan? On track, ahead, behind? Weeks remaining.

HR EVALUATION RULES:
- Momentary HR spikes (max HR 2-5 bpm above prescribed ceiling) are NORMAL and should NOT be flagged as failures. HR lags effort by 15-30s — brief spikes from terrain, cadence changes, or checking the watch are physiological noise.
- What matters: AVG HR relative to the prescribed ceiling. If avg HR is within the prescribed zone, the session was executed correctly regardless of momentary max.
- Flag as a problem ONLY if: (1) avg HR exceeds the prescribed max, meaning the athlete sustained too high an effort, or (2) max HR is >10 bpm above the prescribed ceiling, indicating a genuine zone violation not just a blip.
- Never penalize adherence score for a max HR that is within 5 bpm of the ceiling when avg HR is in zone.
- NEVER compare HR across segments of different activity modes. Walking, jogging, and running produce different HR at the same effort. A walking warmup at 95 bpm and a jogging warmup at 130 bpm is expected — do NOT flag this as a problem or "HR drift". Only compare HR within segments of the same mode (run vs run, walk vs walk).
- When the CSV labels segments by activity type or pace differs by >2 min/km between segments, treat them as different modes.

DATE & TIME DISCIPLINE:
- Use ONLY the activity start timestamp explicitly given in the user message. Never infer the date from the filename, workout name, "today", or the current clock.
- If the user message has a time-of-day, use it for morning/afternoon/evening references. If it has only a date, do NOT make claims about time of day.
- If no timestamp is provided, ask the athlete or omit time-specific statements — never guess.

ONBOARDING:
If no athlete profile exists, guide the user through setup:
- Ask for: name, age, weight, height, location, running history, previous peak, injuries, weekly availability
- Then ask for their goal (race distance, target time, target date)
- Use update_athlete_profile and create a goal
- Then create_training_plan and prescribe_session for the first workout`

function buildSystemPrompt(clientDate) {
  const dateStr = clientDate || todayStr()
  return COACH_SYSTEM + `\n\nToday is: ${dateStr}`
}

// ── Upload-specific system prompt addition ───────────────────────────────────

const UPLOAD_ADDITION = `

ACTIVITY UPLOAD CONTEXT:
The user is uploading a Garmin activity file. You must:
1. Parse the CSV data to extract ALL segments: warmup, run intervals, walk intervals, cooldown
2. Analyze the FULL session — warmup and cooldown are prescribed and contain useful data (HR recovery rate, readiness signals). Walk intervals in run/walk sessions are integral to the prescription, not noise to filter out.
3. Use the activity_date provided in the user message — do NOT infer dates from CSV content or workout names.
4. Follow the full WORKFLOW FOR ACTIVITY UPLOAD/ANALYSIS above.
5. If the user says this was the PRESCRIBED workout: compare against the provided prescription, use the prescribed_session_id when calling record_activity, and evaluate all 5 dimensions.
6. If the user says this was NOT prescribed: record it normally WITHOUT prescribed_session_id, skip dimensions (b) prescription comparison and (c) adherence scoring, but still evaluate (a) standalone, (d) trends, and (e) goal progress. The activity still counts toward training load.`

// ── Garmin workout builder schema (for workout_json in prescriptions) ────────

const WORKOUT_SCHEMA_HINT = `
GARMIN WORKOUT JSON FORMAT (for workout_json field in prescribe_session):

The watch displays each step as a separate screen with the target visible. The athlete sees "Step 1 of 5: Run 1.00 km — HR 120-133" on their wrist. This is how you control their execution.

STRUCTURE:
{
  "name": "<short name, max 35 chars>",
  "description": "<1-2 sentences>",
  "warmupSeconds": <number, default 360>,
  "cooldownSeconds": <number, default 300>,
  "main": [<Step or Repeat>]
}

STEP: { "kind": "step", "stepKey": "warmup"|"interval"|"recovery"|"rest"|"cooldown"|"other",
  "endKind": "distance"|"time", "endValue": <meters for distance, seconds for time>,
  "target": <Target>, "description": "<execution cue>" }

REPEAT: { "kind": "repeat", "reps": <number>, "steps": [<Step>, ...] }

TARGET (one of):
  HR:      { "kind": "hr", "low": <bpm>, "high": <bpm> }         — raw BPM, no offset
  Pace:    { "kind": "pace", "low": <fast min/km>, "high": <slow min/km> } — decimal (8:15/km = 8.25)
  Cadence: { "kind": "cadence", "low": <spm>, "high": <spm> }
  None:    { "kind": "none" }   — ONLY for warmup/cooldown/recovery walks

CRITICAL RULES:
1. TARGETS ARE ONLY ALLOWED ON stepKey:"interval". Garmin's API rejects HR/pace targets on warmup, cooldown, recovery, rest, or other.
   - For warmup/cooldown/recovery zones, put the zone in the step DESCRIPTION (the watch displays it). target must be { kind: "none" }.
   - Example warmup: { stepKey: "warmup", endKind: "time", endValue: 600, target: { kind: "none" }, description: "Warmup jog 10 min — keep HR 115-135 bpm" }
2. EVERY running step that is the actual work (stepKey:"interval") MUST have target kind "hr" or "pace". Never "none" for an interval running step.
3. Break the workout into SEPARATE STEPS per segment. If km1 has different targets than km2-3, make them separate steps:
   - Step 1: 1000m at pace 8.0-8.5 (km 1)
   - Step 2: 2000m at pace 7.75-8.25 (km 2-3)
   - Step 3: 2000m at pace 7.75-8.25 (km 4-5)
4. endValue for distance is in METERS (1km = 1000, 2km = 2000, 5km = 5000)
5. Pace values are decimal min/km: 5:30 = 5.5, 6:00 = 6.0, 7:45 = 7.75, 8:00 = 8.0, 8:15 = 8.25
6. PRESERVE EVERY PRESCRIBED SEGMENT AS ITS OWN STEP. Never collapse a recovery into the surrounding work.
   - Run / Jog-recovery / Run → THREE steps: interval (hr|pace) + recovery (target none, zone in description) + interval (hr|pace).
   - Run / Walk-recovery / Run → THREE steps: interval (hr|pace) + recovery (target none) + interval (hr|pace).
   - 4× (Run + Jog-recovery) → ONE repeat with reps:4 and TWO inner steps: interval + recovery.
7. Use stepKey:"warmup" for the opening warmup and stepKey:"cooldown" for the closing cooldown. Never "other".`

// ── Critique pass ────────────────────────────────────────────────────────────
//
// After the coach drafts an evaluation/prescription, a second LLM call ("the
// reviewer") looks at the writes with fresh eyes and either approves or
// returns specific corrections. If corrections are returned, the coach gets
// one chance to revise. Cap = 1 critique cycle to bound cost.

const REVIEWER_SYSTEM = `You are a skeptical second running coach reviewing another coach's draft.
Your job is to catch errors that hurt credibility — not to rewrite the work.

Look for these specific failure modes:
1. Date/time errors. Did the coach state a day or time-of-day not supported by the metadata?
2. Cross-mode HR comparisons. Did the coach compare HR between segments of different intensityType (e.g. WARMUP vs ACTIVE) or between walk and run?
3. Missing segments in workout_json. Does the prescribed workout structure include EVERY segment the prescription text describes (especially recovery jogs/walks)? A run/jog/run prescription must yield 3 separate steps.
4. Unsupported claims. Did the coach assert HR drift, fatigue, or improvement without the metric to back it?
5. Plan-level violations. Hard-day after another hard day? ACWR > 1.5 with the new prescription? New stimuli inside taper window?
6. Targets without anchor. Were pace/HR targets pulled from generic formulas instead of the athlete's fitness model when one exists?
7. Sycophancy or vagueness. Empty praise. "Nice job", "great session", "looks good".

Reply format:
- If everything is fine, reply with the single word: APPROVE
- Otherwise reply with a numbered list of specific corrections, each tied to a concrete sentence or tool input. Be terse. Do not rewrite the work — point to what must change.`

async function runCritique(client, originalUserText, toolCalls, finalText) {
  const writes = toolCalls.filter(tc =>
    ['record_activity', 'write_workout_evaluation', 'prescribe_session'].includes(tc.name)
  )
  if (writes.length === 0) return null  // nothing to review

  const ctx = {
    user_request: originalUserText.slice(0, 3000),
    coach_writes: writes.map(w => ({ tool: w.name, input: w.input })),
    coach_final_text: finalText.slice(0, 4000),
  }

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: REVIEWER_SYSTEM,
      messages: [{ role: 'user', content: 'Review this coach draft:\n\n```json\n' + JSON.stringify(ctx, null, 2) + '\n```' }],
    })
    const text = res.content.map(b => b.text || '').join('').trim()
    if (/^APPROVE\b/i.test(text)) return null
    return text
  } catch (e) {
    console.error('Critique call failed:', e.message)
    return null  // fail open — don't block on reviewer errors
  }
}

// ── The agentic loop ─────────────────────────────────────────────────────────

/**
 * Run the coach with tool use. Streams text chunks to the client via onChunk.
 * Returns { toolCalls: [...], finalText: string }
 */
export async function runCoachLoop({
  apiKey,
  userId,
  messages,
  isUpload = false,
  clientDate,
  onChunk,
  onToolCall,
  onThinking,
}) {
  const client = new Anthropic({ apiKey })
  const db = getDb()
  const systemPrompt = buildSystemPrompt(clientDate) + (isUpload ? UPLOAD_ADDITION : '') + WORKOUT_SCHEMA_HINT

  let currentMessages = [...messages]
  const allToolCalls = []
  let finalText = ''
  let critiqueRan = false
  const originalUserText = (messages[0]?.content && typeof messages[0].content === 'string') ? messages[0].content : ''

  // During write flows (upload/import), buffer the model's text. The user sees
  // only the final accepted answer after the reviewer has approved or the
  // coach has revised — never the half-baked first draft. For chat (no
  // writes), stream live as before.
  const bufferUntilFinal = isUpload
  const emitChunk = (txt) => { if (!bufferUntilFinal && onChunk) onChunk(txt) }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: COACH_TOOLS,
      messages: currentMessages,
    })

    let responseText = ''
    const toolUseBlocks = []
    let stopReason = null

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          responseText += event.delta.text
          emitChunk(event.delta.text)
        }
      }
      if (event.type === 'message_delta' && event.delta.stop_reason) {
        stopReason = event.delta.stop_reason
      }
    }

    const finalMessage = await stream.finalMessage()
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') toolUseBlocks.push(block)
    }

    if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
      finalText = responseText
      if (!critiqueRan) {
        critiqueRan = true
        const critique = await runCritique(client, originalUserText, allToolCalls, finalText)
        if (critique) {
          if (onThinking) onThinking(i + 1, MAX_ITERATIONS)
          currentMessages.push({ role: 'assistant', content: finalMessage.content })
          currentMessages.push({ role: 'user', content:
            `REVIEWER FEEDBACK on your previous evaluation/prescription. Address each point silently — do NOT mention the review process in your reply to the athlete. Just give the corrected analysis as if it were your first answer.
You may call update_workout_evaluation to revise the evaluation in place, or supersede the prescription by calling prescribe_session again with corrections. If the reviewer is wrong on a specific point, defend it tersely with the supporting metric. Otherwise apply the corrections.

${critique}`
          })
          continue
        }
      }
      // Flush the buffered final text now that it's the accepted answer.
      if (bufferUntilFinal && onChunk) onChunk(finalText)
      break
    }

    // Execute tool calls
    const assistantContent = finalMessage.content
    currentMessages.push({ role: 'assistant', content: assistantContent })

    const toolResults = []
    for (const block of toolUseBlocks) {
      if (onToolCall) onToolCall(block.name, block.input)
      let result
      try {
        result = executeToolCall(db, userId, block.name, block.input)
      } catch (e) {
        console.error(`Tool ${block.name} error:`, e.message)
        result = { error: `Tool failed: ${e.message}` }
      }
      allToolCalls.push({ name: block.name, input: block.input, result })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    currentMessages.push({ role: 'user', content: toolResults })

    // Signal that the coach is thinking before the next round
    if (onThinking) onThinking(i + 1, MAX_ITERATIONS)
  }

  return { toolCalls: allToolCalls, finalText }
}
