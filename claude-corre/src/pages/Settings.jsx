import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Settings() {
  const { user, logout, getAuthHeader } = useAuth()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [msg, setMsg] = useState('')

  const [anthropicKey, setAnthropicKey] = useState('')
  const [garminOauth2, setGarminOauth2] = useState('')

  useEffect(() => {
    fetch('/api/settings', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => { setSettings(d); setLoading(false) })
      .catch(() => setLoading(false))
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
      if (!res.ok) throw new Error('Save failed')
      const updated = await fetch('/api/settings', { headers: getAuthHeader() }).then(r => r.json())
      setSettings(updated)
      setMsg(`${field} saved.`)
      if (field === 'anthropicApiKey') setAnthropicKey('')
      if (field === 'garminOauth2Token') setGarminOauth2('')
    } catch (e) {
      setMsg(`ERROR: ${e.message}`)
    }
    setSaving('')
  }

  async function clearField(field) {
    setSaving(field)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ [field]: '' })
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

      {/* Garmin tokens */}
      <div className="term-box">
        <div className="term-box-title">
          <span>GARMIN TOKEN</span>
          <Status on={settings?.hasGarminOauth2} />
        </div>
        <div className="term-box-body">
          <div className="dim" style={{ fontSize: '12px', marginBottom: '14px' }}>
            Required to push workouts to your watch and fetch past runs.<br />
            Get a token by running one of these in Terminal:
          </div>

          <div style={{ marginBottom: '10px', fontSize: '12px' }}>
            <div style={{ color: '#aaa', marginBottom: '4px' }}>
              <span className="amber">Option A</span> — normal login (email + password):
            </div>
            <code style={{ background: '#111', padding: '4px 8px', display: 'inline-block', color: '#0f0' }}>
              python3 garmin_login.py
            </code>
          </div>

          <div style={{ marginBottom: '14px', fontSize: '12px' }}>
            <div style={{ color: '#aaa', marginBottom: '4px' }}>
              <span className="amber">Option B</span> — browser cookie (use if Option A is rate-limited):
            </div>
            <code style={{ background: '#111', padding: '4px 8px', display: 'inline-block', color: '#0f0' }}>
              python3 garmin_login.py --browser
            </code>
          </div>

          <div style={{ marginBottom: '6px', fontSize: '11px', color: '#555' }}>
            TOKEN JSON (output from garmin_login.py)
          </div>
          <textarea
            className="term-input"
            value={garminOauth2}
            onChange={e => setGarminOauth2(e.target.value)}
            placeholder={'{"access_token": "eyJ...", "refresh_token": "...", "client_id": "..."}'}
            style={{ width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
          />
          <button className="term-btn amber" style={{ marginTop: '6px' }}
            onClick={() => save('garminOauth2Token', garminOauth2)}
            disabled={!garminOauth2 || saving === 'garminOauth2Token'}>
            {saving === 'garminOauth2Token' ? '[...]' : '[SAVE TOKEN]'}
          </button>

          {settings?.hasGarminOauth2 && (
            <div style={{ marginTop: '10px' }}>
              <button className="term-btn" style={{ fontSize: '11px' }} onClick={() => clearField('garminOauth2Token')}>
                [CLEAR TOKEN]
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Security note */}
      <div className="term-box">
        <div className="term-box-title">SECURITY</div>
        <div className="term-box-body" style={{ fontSize: '13px', color: '#666' }}>
          <div>• Your API key and Garmin tokens are encrypted at rest using AES-256-GCM.</div>
          <div>• They are stored encrypted in the database, isolated to your account.</div>
          <div>• No other user can access your data.</div>
          <div>• Your key is never sent to the browser — only used server-side per request.</div>
          <div>• Garmin token auto-refreshes server-side. Re-run garmin_login.py every ~90 days.</div>
        </div>
      </div>
    </div>
  )
}
