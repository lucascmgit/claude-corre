import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Settings() {
  const { user, logout, getAuthHeader } = useAuth()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [msg, setMsg] = useState('')

  const [anthropicKey, setAnthropicKey] = useState('')
  const [garminTokens, setGarminTokens] = useState('')
  const [garminStatus, setGarminStatus] = useState(null)

  useEffect(() => {
    const h = getAuthHeader()
    fetch('/api/settings', { headers: h })
      .then(r => r.json())
      .then(d => { setSettings(d); setLoading(false) })
      .catch(() => setLoading(false))
    fetch('/api/garmin-status', { headers: h })
      .then(r => r.json())
      .then(d => setGarminStatus(d))
      .catch(() => {})
  }, [])

  async function save(field, value) {
    if (!value.trim()) return
    setSaving(field)
    setMsg('')
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ [field]: value.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      const h = getAuthHeader()
      const updated = await fetch('/api/settings', { headers: h }).then(r => r.json())
      setSettings(updated)
      setMsg('Saved.')
      if (field === 'anthropicApiKey') setAnthropicKey('')
      if (field === 'garminTokens') {
        setGarminTokens('')
        fetch('/api/garmin-status', { headers: h }).then(r => r.json()).then(d => setGarminStatus(d)).catch(() => {})
      }
    } catch (e) {
      setMsg(`ERROR: ${e.message}`)
    }
    setSaving('')
  }

  async function clearField(field) {
    setSaving(field)
    const bodyField = field === 'garminTokens' ? 'garminTokens' : field
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ [bodyField]: '' })
    })
    const updated = await fetch('/api/settings', { headers: getAuthHeader() }).then(r => r.json())
    setSettings(updated)
    setSaving('')
  }

  const Status = ({ on }) => (
    <span className={on ? 'amber' : 'red'} style={{ fontSize: '12px' }}>
      {on ? '● SET' : '○ NOT SET'}
    </span>
  )

  if (loading) return <div className="dim">LOADING SETTINGS...</div>

  return (
    <div>
      {/* Account */}
      <div className="term-box">
        <div className="term-box-title">ACCOUNT</div>
        <div className="term-box-body">
          <div style={{ marginBottom: '12px' }}>
            <span className="amber">EMAIL......</span> {user?.email}
          </div>
          <button className="term-btn" onClick={logout}>[LOGOUT]</button>
        </div>
      </div>

      {msg && (
        <div className="term-box">
          <div className="term-box-body" style={{ color: msg.startsWith('ERROR') ? '#ff4444' : '#aaa', fontSize: '12px' }}>
            {msg}
          </div>
        </div>
      )}

      {/* Anthropic API key */}
      <div className="term-box">
        <div className="term-box-title">
          <span>ANTHROPIC API KEY</span>
          <Status on={settings?.hasAnthropicKey} />
        </div>
        <div className="term-box-body">
          <div className="dim" style={{ fontSize: '12px', marginBottom: '10px' }}>
            Required for coach chat and CSV analysis. Get yours at console.anthropic.com.
            Your key is stored encrypted server-side and never exposed.
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              className="term-input"
              type="password"
              value={anthropicKey}
              onChange={e => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <button className="term-btn amber" onClick={() => save('anthropicApiKey', anthropicKey)}
              disabled={!anthropicKey || saving === 'anthropicApiKey'}>
              {saving === 'anthropicApiKey' ? '[...]' : '[SAVE]'}
            </button>
          </div>
          {settings?.hasAnthropicKey && (
            <button className="term-btn" style={{ fontSize: '11px' }}
              onClick={() => clearField('anthropicApiKey')}>
              [CLEAR KEY]
            </button>
          )}
        </div>
      </div>

      {/* Garmin connection */}
      <div className="term-box">
        <div className="term-box-title">
          <span>GARMIN CONNECTION</span>
          {garminStatus && (
            <span className={
              garminStatus.health === 'healthy' ? 'status-ok' :
              garminStatus.health === 'refreshing' ? 'amber' :
              garminStatus.health === 'not_connected' ? 'dim' : 'red'
            } style={{ fontSize: '12px' }}>
              {garminStatus.health === 'healthy' ? '● CONNECTED' :
               garminStatus.health === 'refreshing' ? '● AUTO-REFRESHING' :
               garminStatus.health === 'not_connected' ? '○ NOT CONNECTED' :
               garminStatus.health === 'degraded' ? '● DEGRADED' : '● EXPIRED'}
            </span>
          )}
        </div>
        <div className="term-box-body">
          {garminStatus && garminStatus.health !== 'not_connected' && (
            <div style={{ marginBottom: '14px', fontSize: '13px' }}>
              <div>{garminStatus.message}</div>
              {garminStatus.oauth2ExpiresAt && (
                <div className="dim" style={{ marginTop: '4px', fontSize: '11px' }}>
                  Access token expires: {garminStatus.oauth2ExpiresAt}
                  {garminStatus.refreshTokenExpiresAt && <> · Refresh expires: {garminStatus.refreshTokenExpiresAt}</>}
                </div>
              )}
            </div>
          )}

          <div className="dim" style={{ fontSize: '12px', marginBottom: '14px' }}>
            Push workouts to your watch and sync activities from Garmin Connect.<br />
            Run this in Terminal on your computer:
          </div>

          <div style={{ marginBottom: '14px' }}>
            <code style={{ background: '#111', padding: '6px 10px', display: 'inline-block', color: '#0f0', fontSize: '13px' }}>
              python3 browser_auth.py
            </code>
            <div className="dim" style={{ fontSize: '11px', marginTop: '4px' }}>
              Requires: <code style={{ color: '#888' }}>pip install playwright requests requests-oauthlib && playwright install chromium</code>
            </div>
          </div>

          <div style={{ marginBottom: '6px', fontSize: '11px', color: '#555' }}>
            PASTE TOKEN (output from browser_auth.py)
          </div>
          <textarea
            className="term-input"
            value={garminTokens}
            onChange={e => setGarminTokens(e.target.value)}
            placeholder='{"oauth1": {...}, "oauth2": {...}}'
            style={{ width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
          />
          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="term-btn amber"
              onClick={() => save('garminTokens', garminTokens)}
              disabled={!garminTokens || saving === 'garminTokens'}>
              {saving === 'garminTokens' ? '[...]' : '[SAVE TOKENS]'}
            </button>
            {settings?.hasGarminOauth2 && (
              <button className="term-btn" style={{ fontSize: '11px' }} onClick={() => clearField('garminTokens')}>
                [CLEAR]
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Security note */}
      <div className="term-box">
        <div className="term-box-title">SECURITY</div>
        <div className="term-box-body" style={{ fontSize: '13px', color: '#666' }}>
          <div>• API key and Garmin tokens encrypted at rest (AES-256-GCM), isolated per account.</div>
          <div>• Never sent to the browser — only used server-side.</div>
          <div>• Garmin tokens auto-refresh server-side. Re-run browser_auth.py only when fully expired.</div>
        </div>
      </div>
    </div>
  )
}
