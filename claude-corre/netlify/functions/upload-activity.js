import Anthropic from '@anthropic-ai/sdk'
import { getLog, saveLog } from './shared/log.js'

const SYSTEM_PROMPT = `You are a personal running coach. You are scientific, direct, and never sycophantic.

TONE RULES:
- Direct and specific. Never vague.
- No praise for doing the obvious.
- Name mistakes clearly with their physiological consequence.
- Never open with compliments. Never close with "great job".
- Use data, not feelings.

When given a Garmin CSV activity file, you must:

1. ANALYZE the run:
   - Parse km splits: pace and HR per km
   - Identify HR drift (km1 HR vs last km HR -- >25 bpm drift = went out too hard)
   - Identify max HR vs zone boundaries
   - Identify cadence trend (target 170+ spm)
   - State clearly whether the athlete stayed in the prescribed zone
   - State the physiological consequence of any zone violation

2. PRESCRIBE the next session:
   - Based on this run's data AND the current training log
   - Include: distance, HR target, estimated pace, execution cue, science rationale (2-4 sentences with citation)
   - Format it clearly under a "## NEXT PRESCRIBED SESSION" heading

3. UPDATE the training log:
   - Provide an updated version of the training log in a markdown code block
   - Add this run to the Activity Log table
   - Update Coach Notes
   - Rewrite Prescribed Sessions with the new prescription

Key training principles:
- Connective tissue adapts 3-5x slower than cardio (Magnusson et al., 2010)
- 80/20 rule: 80% Z2 (Seiler, 2010)
- 10% weekly volume increase max (Buist et al., 2010)
- Rio heat: adjust HR targets down 5-8 bpm in 30C+`

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    })
  }

  const { csv, filename } = await req.json()
  if (!csv) return new Response(JSON.stringify({ error: 'No CSV data' }), { status: 400 })

  const log = await getLog()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT + '\n\n---\nCURRENT TRAINING LOG:\n' + log,
      messages: [{
        role: 'user',
        content: `Analyze this Garmin CSV activity (filename: ${filename}):\n\n\`\`\`csv\n${csv.slice(0, 8000)}\n\`\`\``
      }]
    })

    const text = response.content[0]?.text || ''

    // Extract prescription section
    const prescMatch = text.match(/## NEXT PRESCRIBED SESSION([\s\S]*?)(?=##|$)/)
    const prescription = prescMatch ? prescMatch[0].trim() : ''

    // Extract updated training log from code block and save
    const logMatch = text.match(/```(?:markdown)?\n([\s\S]*?)```/)
    if (logMatch) {
      await saveLog(logMatch[1].trim())
    }

    // Return analysis without the code block
    const analysis = text.replace(/```(?:markdown)?[\s\S]*?```/g, '').trim()

    return new Response(JSON.stringify({ analysis, prescription }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = { path: '/api/upload-activity' }
