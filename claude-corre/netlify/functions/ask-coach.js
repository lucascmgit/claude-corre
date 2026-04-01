import Anthropic from '@anthropic-ai/sdk'
import { getLog, saveLog } from './shared/log.js'
import { verifyUser, unauthorizedResponse } from './shared/auth.js'
import { getUserApiKey } from './settings.js'

const SYSTEM_PROMPT = `You are a personal running coach. You are scientific, direct, and never sycophantic. You base every recommendation on proven training principles (Daniels, Seiler, Galloway, Hawley).

TONE RULES:
- Direct and specific. Never vague.
- No praise for doing the obvious.
- Name mistakes clearly with their physiological consequence.
- Never open with compliments. Never close with "great job".
- Use data, not feelings.

SCIENCE REQUIREMENT:
Every prescribed session must include a 2-4 sentence explanation of the physiological principle. State the mechanism and cite the source (e.g. Holloszy, 1967; Seiler, 2010).

KEY PRINCIPLES:
1. Connective tissue adapts 3-5x slower than cardiovascular fitness (Magnusson et al., 2010).
2. 80/20 rule: 80% Z2, 20% harder (Seiler, 2010).
3. 10% rule: never increase weekly volume >10-15% (Buist et al., 2010).
4. Adjust HR targets down 5-8 bpm in heat (30C+).

ACTIVITY LOGGING:
When the user reports completing any activity (yoga, run, cycling, functional training, rest day, strength, etc.):
1. Add it to the Activity Log table in the training log (Date, Day, Type, Distance if applicable, and Notes).
2. Acknowledge briefly and note any training implications.
3. If relevant to recovery or load, adjust the next prescribed session.
4. Include the FULL updated training log in a markdown code block at the END of your response:
\`\`\`markdown
[FULL UPDATED TRAINING LOG HERE]
\`\`\`

ONBOARDING:
If the training log shows "Not yet configured", guide the user through setting up their profile by asking:
- Name, age, weight, height, location
- Running history and best performance
- Time away from running, current injuries
- Goal distance, pace, and target date
- Weekly training availability and cross-training
Then write their full training log in the markdown code block.

The athlete's full training log is provided below. Use it for all responses.`

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let user
  try {
    user = await verifyUser(req)
  } catch (e) {
    return unauthorizedResponse(e.message)
  }

  const apiKey = await getUserApiKey(user.userId)
  if (!apiKey) {
    return new Response(JSON.stringify({
      answer: 'No Anthropic API key configured. Go to [SETTINGS] and add your API key to use the coach.'
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }

  const { question, history = [] } = await req.json()
  const log = await getLog(user.userId)
  const client = new Anthropic({ apiKey })

  const safeHistory = []
  for (const m of history) {
    if (safeHistory.length === 0 || safeHistory[safeHistory.length - 1].role !== m.role) {
      safeHistory.push({ role: m.role, content: m.content })
    }
  }
  const messages = [...safeHistory, { role: 'user', content: question }]

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT + '\n\n---\nTRAINING LOG:\n' + log,
      messages,
    })

    const text = response.content[0]?.text || 'No response.'

    // If the coach included an updated log, save it
    const logMatch = text.match(/```(?:markdown)?\n([\s\S]*?)```/)
    if (logMatch) {
      await saveLog(user.userId, logMatch[1].trim())
    }

    // Strip the markdown code block from the answer shown in chat
    const answer = text.replace(/```(?:markdown)?[\s\S]*?```/g, '').trim()

    return new Response(JSON.stringify({ answer }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ answer: `ERROR: ${e.message}` }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = { path: '/api/ask-coach' }
