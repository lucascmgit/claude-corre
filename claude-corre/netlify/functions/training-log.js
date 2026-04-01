import { getLog, saveLog } from './shared/log.js'
import { verifyUser, unauthorizedResponse } from './shared/auth.js'

export default async (req) => {
  let user
  try {
    user = await verifyUser(req)
  } catch (e) {
    return unauthorizedResponse(e.message)
  }

  if (req.method === 'GET') {
    const content = await getLog(user.userId)
    return new Response(JSON.stringify({ content }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (req.method === 'POST') {
    const { content } = await req.json()
    await saveLog(user.userId, content)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/api/training-log' }
