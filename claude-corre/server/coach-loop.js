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

TONE RULES:
- Direct and specific. Never vague.
- No praise for doing the obvious.
- Name mistakes clearly with their physiological consequence.
- Never open with compliments. Never close with "great job".
- Use data, not feelings.

${RUNNING_SCIENCE_PRINCIPLES}

## TOOL USAGE

You have tools to read and write athlete data. Use them to:
- Read the athlete's profile, goal, plan, recent activities, and training load before giving advice
- Record activities when the athlete reports completing any workout
- Write 5-part evaluations after recording activities
- Prescribe sessions based on the training plan and current load
- Create or update training plans when goals change or performance warrants adjustment
- Update training zones when new calibration data is available
- Update the athlete profile when the athlete reports changes

WORKFLOW FOR ACTIVITY UPLOAD/ANALYSIS:
1. Call get_athlete_profile, get_active_goal, get_training_plan, get_current_prescription, get_recent_activities, get_training_load
2. Analyze the activity data
3. Call record_activity to save it
4. Call write_workout_evaluation with all 5 dimensions
5. Call prescribe_session for the next workout
6. If performance warrants, call update_training_plan
7. Present your analysis to the athlete

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
(a) STANDALONE: Parse ALL segments (warmup, run, walk, cooldown). Analyze splits, HR drift, cadence, pacing strategy, warmup effectiveness, cooldown HR recovery rate. Be specific.
(b) PRESCRIPTION COMPARISON: What was asked vs what was done. Use structured data from the linked prescription.
(c) ADHERENCE + PERFORMANCE: Adherence score 0-100. Rate as below/on/above target.
(d) MEDIUM-TERM TRENDS: Compare with recent weeks. Note HR drift at same pace, volume trends, ACWR.
(e) GOAL PROGRESS: Where is the athlete in their plan? On track, ahead, behind? Weeks remaining.

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
3. For prescription comparison, compare the full session structure (including warmup/cooldown duration, walk/run interval pattern) against what was prescribed
4. Follow the full WORKFLOW FOR ACTIVITY UPLOAD/ANALYSIS above
5. Present a clear, structured analysis covering all 5 evaluation dimensions`

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

STEP: { "kind": "step", "stepKey": "interval"|"recovery"|"rest"|"other",
  "endKind": "distance"|"time", "endValue": <meters for distance, seconds for time>,
  "target": <Target>, "description": "<execution cue>" }

REPEAT: { "kind": "repeat", "reps": <number>, "steps": [<Step>, ...] }

TARGET (one of):
  HR:      { "kind": "hr", "low": <bpm>, "high": <bpm> }         — raw BPM, no offset
  Pace:    { "kind": "pace", "low": <fast min/km>, "high": <slow min/km> } — decimal (8:15/km = 8.25)
  Cadence: { "kind": "cadence", "low": <spm>, "high": <spm> }
  None:    { "kind": "none" }   — ONLY for warmup/cooldown/recovery walks

CRITICAL RULES:
1. EVERY running step MUST have target kind "hr" or "pace". Never "none" for running.
2. Break the workout into SEPARATE STEPS per segment. If km1 has different targets than km2-3, make them separate steps:
   - Step 1: 1000m at pace 8.0-8.5 (km 1)
   - Step 2: 2000m at pace 7.75-8.25 (km 2-3)
   - Step 3: 2000m at pace 7.75-8.25 (km 4-5)
   The watch will guide the athlete through each step with the correct target shown.
3. endValue for distance is in METERS (1km = 1000, 2km = 2000, 5km = 5000)
4. Pace values are decimal min/km: 5:30 = 5.5, 6:00 = 6.0, 7:45 = 7.75, 8:00 = 8.0, 8:15 = 8.25
5. For run/walk intervals: use "repeat" with interval step (hr/pace target) + recovery step (target "none")
6. The watch enforces targets with alerts — the athlete sees and hears when out of range`

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

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Decide: stream only on the final text response, use non-streaming for tool-use turns
    // Actually, we always stream so the user sees thinking progress
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
          if (onChunk) onChunk(event.delta.text)
        }
      }
      if (event.type === 'message_delta' && event.delta.stop_reason) {
        stopReason = event.delta.stop_reason
      }
    }

    // Collect tool use blocks from the final message
    const finalMessage = await stream.finalMessage()
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        toolUseBlocks.push(block)
      }
    }

    if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
      // No tools called — we're done
      finalText = responseText
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
