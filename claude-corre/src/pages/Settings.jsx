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
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setGarminStatus(d) })
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

          <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
            <div style={{ color: '#aaa', marginBottom: '12px' }}>
              Push workouts to your watch and sync activities from Garmin Connect.
              This requires a one-time setup on your computer (~2 minutes).
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="amber" style={{ fontSize: '12px', marginBottom: '6px' }}>STEP 1 — INSTALL DEPENDENCIES (first time only)</div>
              <div className="dim" style={{ fontSize: '12px', marginBottom: '4px' }}>
                You need Python 3. Check with: <code style={{ color: '#aaa', background: '#111', padding: '1px 4px' }}>python3 --version</code>
              </div>
              <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#0f0' }}>
                pip install playwright requests requests-oauthlib && playwright install chromium
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="amber" style={{ fontSize: '12px', marginBottom: '6px' }}>STEP 2 — DOWNLOAD THE AUTH SCRIPT</div>
              <div className="dim" style={{ fontSize: '12px', marginBottom: '4px' }}>
                Download <code style={{ color: '#aaa' }}>browser_auth.py</code> from the project repo:
              </div>
              <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#0f0', overflowX: 'auto' }}>
                curl -O https://raw.githubusercontent.com/lucascmgit/claude-corre/main/browser_auth.py
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="amber" style={{ fontSize: '12px', marginBottom: '6px' }}>STEP 3 — RUN IT</div>
              <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#0f0' }}>
                python3 browser_auth.py
              </div>
              <div className="dim" style={{ fontSize: '12px', marginTop: '4px' }}>
                A Chromium browser window opens automatically. Log in with your Garmin credentials.
                The window closes by itself when done. The token is copied to your clipboard.
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="amber" style={{ fontSize: '12px', marginBottom: '6px' }}>STEP 4 — PASTE THE TOKEN BELOW</div>
              <div className="dim" style={{ fontSize: '12px', marginBottom: '6px' }}>
                The script copies the token to your clipboard automatically. Just paste here (Cmd+V / Ctrl+V).
                It looks like: <code style={{ color: '#999', fontSize: '11px' }}>{`{"oauth1":{...},"oauth2":{...}}`}</code>
              </div>
            </div>
          </div>

          <textarea
            className="term-input"
            value={garminTokens}
            onChange={e => setGarminTokens(e.target.value)}
            placeholder='Paste the token from browser_auth.py here (Cmd+V)'
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

          <div style={{ marginTop: '14px', fontSize: '12px', color: '#999', borderTop: '1px solid #1a1a1a', paddingTop: '10px' }}>
            <div className="amber" style={{ fontSize: '11px', marginBottom: '4px' }}>TROUBLESHOOTING</div>
            <div>• <strong style={{ color: '#aaa' }}>python3 not found:</strong> Install from <span style={{ color: '#888' }}>python.org</span> or via <code style={{ color: '#888' }}>brew install python</code> (Mac)</div>
            <div>• <strong style={{ color: '#aaa' }}>playwright error:</strong> Make sure you ran <code style={{ color: '#888' }}>playwright install chromium</code> after pip install</div>
            <div>• <strong style={{ color: '#aaa' }}>Browser doesn&apos;t open:</strong> Try running from a regular terminal, not VS Code</div>
            <div>• <strong style={{ color: '#aaa' }}>Login times out:</strong> You have 5 minutes. Complete the login including any MFA prompts</div>
            <div>• <strong style={{ color: '#aaa' }}>Token not copied:</strong> Look for the JSON blob printed in the terminal and copy it manually</div>
          </div>
        </div>
      </div>

      {/* Security note */}
      <div className="term-box">
        <div className="term-box-title">SECURITY</div>
        <div className="term-box-body" style={{ fontSize: '13px', color: '#aaa' }}>
          <div>• API key and Garmin tokens encrypted at rest (AES-256-GCM), isolated per account.</div>
          <div>• Never sent to the browser — only used server-side.</div>
          <div>• Garmin tokens auto-refresh server-side. Re-run browser_auth.py only when fully expired.</div>
        </div>
      </div>
    </div>
  )
}
