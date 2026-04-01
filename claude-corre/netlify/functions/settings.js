import { getStore } from '@netlify/blobs'
import { verifyUser, unauthorizedResponse } from './shared/auth.js'
import { encrypt, decrypt } from './shared/crypto.js'

const SETTINGS_STORE = 'user-settings'

async function getSettings(userId) {
  try {
    const store = getStore(SETTINGS_STORE)
    const raw = await store.get(userId)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

async function saveSettings(userId, settings) {
  const store = getStore(SETTINGS_STORE)
  await store.set(userId, JSON.stringify(settings))
}

export default async (req) => {
  let user
  try {
    user = await verifyUser(req)
  } catch (e) {
    return unauthorizedResponse(e.message)
  }

  const { userId } = user

  if (req.method === 'GET') {
    const s = await getSettings(userId)
    return new Response(JSON.stringify({
      hasAnthropicKey: !!s.anthropicApiKey,
      hasGarminOauth1: !!s.garminOauth1Token,
      hasGarminOauth2: !!s.garminOauth2Token,
      email: user.email,
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    const body = await req.json()
    const s = await getSettings(userId)

    if (body.anthropicApiKey !== undefined) {
      s.anthropicApiKey = body.anthropicApiKey ? encrypt(body.anthropicApiKey) : null
    }
    if (body.garminOauth1Token !== undefined) {
      s.garminOauth1Token = body.garminOauth1Token ? encrypt(body.garminOauth1Token) : null
    }
    if (body.garminOauth2Token !== undefined) {
      s.garminOauth2Token = body.garminOauth2Token ? encrypt(body.garminOauth2Token) : null
    }

    await saveSettings(userId, s)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405 })
}

// Internal helper — used by other functions to retrieve the decrypted API key
export async function getUserApiKey(userId) {
  const s = await getSettings(userId)
  if (!s.anthropicApiKey) return null
  try { return decrypt(s.anthropicApiKey) } catch { return null }
}

export async function getUserGarminTokens(userId) {
  const s = await getSettings(userId)
  const result = {}
  if (s.garminOauth1Token) {
    try { result.oauth1 = JSON.parse(decrypt(s.garminOauth1Token)) } catch {}
  }
  if (s.garminOauth2Token) {
    try { result.oauth2 = JSON.parse(decrypt(s.garminOauth2Token)) } catch {}
  }
  return result
}

export const config = { path: '/api/settings' }
