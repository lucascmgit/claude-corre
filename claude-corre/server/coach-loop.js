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

PRESCRIPTION RULES:
- Every prescription MUST include a rationale citing at least one source from the science reference
- Include specific targets: distance (meters), HR range (bpm), pace range (min:sec/km)
- Include the Garmin workout JSON in workout_json when prescribing runs (for push-to-watch)

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

function buildSystemPrompt() {
  return COACH_SYSTEM + `\n\nToday is: ${todayStr()}`
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
{
  "name": "<short name, max 35 chars>",
  "description": "<1-2 sentences>",
  "warmupSeconds": <number, default 300>,
  "cooldownSeconds": <number, default 300>,
  "main": [
    { "kind": "step", "stepKey": "interval"|"rest"|"recovery"|"other",
      "endKind": "distance"|"time"|"lapbutton", "endValue": <meters or seconds>,
      "target": { "kind": "hr"|"pace"|"cadence"|"none", "low": <number>, "high": <number> },
      "description": "<execution cue>" }
    OR
    { "kind": "repeat", "reps": <number>, "steps": [<Step>, ...] }
  ]
}
Pace target: low = fast pace (decimal min/km, e.g. 6.0), high = slow pace.
HR target: low/high in bpm (no offset — server handles +100).`

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
  onChunk,
  onToolCall,
}) {
  const client = new Anthropic({ apiKey })
  const db = getDb()
  const systemPrompt = buildSystemPrompt() + (isUpload ? UPLOAD_ADDITION : '') + WORKOUT_SCHEMA_HINT

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
      const result = executeToolCall(db, userId, block.name, block.input)
      allToolCalls.push({ name: block.name, input: block.input, result })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    currentMessages.push({ role: 'user', content: toolResults })
  }

  return { toolCalls: allToolCalls, finalText }
}
