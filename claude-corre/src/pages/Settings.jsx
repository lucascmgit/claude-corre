import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Settings() {
  const { user, logout, getAuthHeader } = useAuth()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [msg, setMsg] = useState('')

  const [anthropicKey, setAnthropicKey] = useState('')
  const [garminOauth1, setGarminOauth1] = useState('')
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
      if (field === 'garminOauth1Token') setGarminOauth1('')
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
          <span>GARMIN TOKENS</span>
          <span className="dim" style={{ fontSize: '11px' }}>
            OAuth2: <Status on={settings?.hasGarminOauth2} /> OAuth1: <Status on={settings?.hasGarminOauth1} />
          </span>
        </div>
        <div className="term-box-body">
          <div className="dim" style={{ fontSize: '12px', marginBottom: '10px' }}>
            Optional — required only for pushing workouts to your Garmin watch.
            Run <code>python3 browser_auth.py</code> locally, then paste the contents of{' '}
            <code>~/.garmin_tokens/oauth2_token.json</code> and <code>oauth1_token.json</code> below.
            Tokens are valid ~30 days.
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div className="dim" style={{ fontSize: '11px', marginBottom: '4px' }}>
              OAuth2 TOKEN (contents of oauth2_token.json)
            </div>
            <textarea
              className="term-input"
              value={garminOauth2}
              onChange={e => setGarminOauth2(e.target.value)}
              placeholder={'{"access_token": "...", ...}'}
              style={{ width: '100%', minHeight: '80px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            />
            <button className="term-btn amber" style={{ marginTop: '6px' }}
              onClick={() => save('garminOauth2Token', garminOauth2)}
              disabled={!garminOauth2 || saving === 'garminOauth2Token'}>
              {saving === 'garminOauth2Token' ? '[...]' : '[SAVE OAuth2]'}
            </button>
          </div>

          <div>
            <div className="dim" style={{ fontSize: '11px', marginBottom: '4px' }}>
              OAuth1 TOKEN (contents of oauth1_token.json)
            </div>
            <textarea
              className="term-input"
              value={garminOauth1}
              onChange={e => setGarminOauth1(e.target.value)}
              placeholder={'{"oauth_token": "...", ...}'}
              style={{ width: '100%', minHeight: '80px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            />
            <button className="term-btn amber" style={{ marginTop: '6px' }}
              onClick={() => save('garminOauth1Token', garminOauth1)}
              disabled={!garminOauth1 || saving === 'garminOauth1Token'}>
              {saving === 'garminOauth1Token' ? '[...]' : '[SAVE OAuth1]'}
            </button>
          </div>

          {(settings?.hasGarminOauth1 || settings?.hasGarminOauth2) && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
              {settings.hasGarminOauth2 && (
                <button className="term-btn" style={{ fontSize: '11px' }} onClick={() => clearField('garminOauth2Token')}>
                  [CLEAR OAuth2]
                </button>
              )}
              {settings.hasGarminOauth1 && (
                <button className="term-btn" style={{ fontSize: '11px' }} onClick={() => clearField('garminOauth1Token')}>
                  [CLEAR OAuth1]
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Security note */}
      <div className="term-box">
        <div className="term-box-title">SECURITY</div>
        <div className="term-box-body" style={{ fontSize: '12px', color: '#555' }}>
          <div>• Your API key and Garmin tokens are encrypted at rest using AES-256-GCM.</div>
          <div>• They are stored in your private namespace on Netlify Blobs.</div>
          <div>• No other user can access your data.</div>
          <div>• Your key is never sent to the browser — only used server-side per request.</div>
          <div>• Garmin tokens expire in ~30 days. Re-run browser_auth.py when needed.</div>
        </div>
      </div>
    </div>
  )
}
