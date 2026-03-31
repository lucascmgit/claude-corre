import Anthropic from '@anthropic-ai/sdk'
import { getLog } from './shared/log.js'

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
4. In Rio heat (30C+): adjust HR targets down 5-8 bpm.

The athlete's full training log is provided below. Use it for all responses.`

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ answer: 'ERROR: ANTHROPIC_API_KEY not configured.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    })
  }

  const { question, history = [] } = await req.json()
  const log = await getLog()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Ensure alternating roles -- filter out any consecutive same-role messages
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
      max_tokens: 1024,
      system: SYSTEM_PROMPT + '\n\n---\nTRAINING LOG:\n' + log,
      messages
    })
    const answer = response.content[0]?.text || 'No response.'
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
