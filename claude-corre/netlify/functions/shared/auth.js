import { createRemoteJWKSet, jwtVerify } from 'jose'

let JWKS = null

function getJWKS() {
  if (!JWKS) {
    const base = process.env.URL || 'http://localhost:8888'
    JWKS = createRemoteJWKSet(new URL(`${base}/.netlify/identity/.well-known/jwks.json`))
  }
  return JWKS
}

function decodePayload(token) {
  try {
    const part = token.split('.')[1]
    return JSON.parse(Buffer.from(part, 'base64url').toString())
  } catch {
    throw new Error('Malformed token')
  }
}

export async function verifyUser(req) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized: missing token')

  const token = authHeader.slice(7)
  const payload = decodePayload(token)

  if (process.env.NETLIFY) {
    // Production: verify signature against Netlify Identity JWKS
    try {
      await jwtVerify(token, getJWKS(), { audience: 'netlify' })
    } catch (e) {
      throw new Error(`Unauthorized: ${e.message}`)
    }
  }
  // Local dev (netlify dev): trust decoded payload — Identity proxy handles real auth

  if (!payload.sub) throw new Error('Unauthorized: no user ID in token')
  return { userId: payload.sub, email: payload.email || '' }
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  })
}
