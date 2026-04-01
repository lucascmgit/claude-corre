import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login, signup, confirmed, setConfirmed } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'confirm'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
        navigate('/')
      } else {
        await signup(email.trim(), password)
        setMode('confirm')
      }
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '480px', margin: '60px auto', padding: '0 16px' }}>
      <div style={{ marginBottom: '32px' }}>
        <div className="logo-title" style={{ fontSize: '48px' }}>CLAUDE CORRE</div>
        <div className="header-tagline">// AI RUNNING COACH TERMINAL v1.0</div>
      </div>

      {confirmed && (
        <div className="term-box" style={{ marginBottom: '16px' }}>
          <div className="term-box-body" style={{ color: '#aaa' }}>
            EMAIL CONFIRMED. You can now log in.
          </div>
        </div>
      )}

      {mode === 'confirm' ? (
        <div className="term-box">
          <div className="term-box-title">CHECK YOUR EMAIL</div>
          <div className="term-box-body">
            <p style={{ color: '#aaa', marginBottom: '12px' }}>
              Confirmation email sent to <span className="amber">{email}</span>.
            </p>
            <p className="dim" style={{ fontSize: '12px', marginBottom: '16px' }}>
              Click the link in the email to activate your account, then log in.
            </p>
            <button className="term-btn" onClick={() => { setMode('login'); setConfirmed(false) }}>
              [BACK TO LOGIN]
            </button>
          </div>
        </div>
      ) : (
        <div className="term-box">
          <div className="term-box-title">
            {mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
          </div>
          <div className="term-box-body">
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <div className="dim" style={{ fontSize: '11px', marginBottom: '4px' }}>EMAIL</div>
                <input
                  className="term-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <div className="dim" style={{ fontSize: '11px', marginBottom: '4px' }}>PASSWORD</div>
                <input
                  className="term-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="red" style={{ fontSize: '12px', marginBottom: '12px' }}>
                  ERROR: {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="term-btn amber" type="submit" disabled={loading || !email || !password}>
                  {loading ? '[...]' : mode === 'login' ? '[LOGIN]' : '[CREATE ACCOUNT]'}
                </button>
                <button
                  className="term-btn"
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
                  disabled={loading}
                  style={{ fontSize: '12px' }}
                >
                  {mode === 'login' ? 'Create account' : 'Back to login'}
                </button>
              </div>
            </form>

            {mode === 'signup' && (
              <div className="dim" style={{ fontSize: '11px', marginTop: '12px' }}>
                You will need your own Anthropic API key to use the coach.
                Set it in [SETTINGS] after creating your account.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sep" style={{ marginTop: '24px' }}>{'─'.repeat(48)}</div>
      <div className="dim" style={{ fontSize: '11px', marginTop: '8px' }}>
        Each user has their own data and API key. Nothing is shared.
      </div>
    </div>
  )
}
