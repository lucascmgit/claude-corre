import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const SESSION_KEY = 'cc_session'

function parseJwtPayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

async function refreshSession(refreshToken) {
  const res = await fetch('/.netlify/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  })
  if (!res.ok) throw new Error('Session expired')
  const data = await res.json()
  const payload = parseJwtPayload(data.access_token)
  return {
    token: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    email: payload?.email || '',
    id: payload?.sub || '',
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    // Handle email confirmation token in URL hash
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const confirmToken = params.get('confirmation_token')
    if (confirmToken) {
      fetch('/.netlify/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: confirmToken, type: 'signup' })
      }).then(() => {
        window.history.replaceState(null, '', window.location.pathname)
        setConfirmed(true)
      }).catch(() => {})
    }

    // Restore session from localStorage
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      try {
        const session = JSON.parse(stored)
        if (session.expiresAt > Date.now() + 60000) {
          setUser(session)
          setLoading(false)
        } else if (session.refreshToken) {
          refreshSession(session.refreshToken)
            .then(fresh => {
              localStorage.setItem(SESSION_KEY, JSON.stringify(fresh))
              setUser(fresh)
            })
            .catch(() => localStorage.removeItem(SESSION_KEY))
            .finally(() => setLoading(false))
          return
        }
      } catch {
        localStorage.removeItem(SESSION_KEY)
      }
    }
    setLoading(false)
  }, [])

  async function login(email, password) {
    const res = await fetch('/.netlify/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', username: email, password })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error_description || err.msg || 'Login failed')
    }
    const data = await res.json()
    const payload = parseJwtPayload(data.access_token)
    const session = {
      token: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      email: payload?.email || email,
      id: payload?.sub || '',
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(session)
    return session
  }

  async function signup(email, password) {
    const res = await fetch('/.netlify/identity/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.msg || err.error_description || 'Signup failed')
    }
    return await res.json()
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  function getAuthHeader() {
    return user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, confirmed, setConfirmed, login, signup, logout, getAuthHeader }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
