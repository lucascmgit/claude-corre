import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'

function StepBar({ step }) {
  const steps = ['API KEY', 'YOUR PROFILE', 'GARMIN WATCH']
  return (
    <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '1px solid #222' }}>
      {steps.map((label, i) => {
        const num = i + 1
        const active = num === step
        const done = num < step
        return (
          <div key={i} style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '1px',
            borderBottom: active ? '2px solid var(--amber)' : '2px solid transparent',
            color: active ? 'var(--amber)' : done ? '#555' : '#333',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span>{done ? '✓' : `${num}.`}</span>
            <span>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function Step1ApiKey({ onDone }) {
  const { getAuthHeader } = useAuth()
  const [key, setKey] = useState('')
  const [status, setStatus] = useState(null) // null | 'validating' | 'ok' | 'error'
  const [error, setError] = useState('')

  async function validate() {
    if (!key.trim()) return
    setStatus('validating')
    setError('')
    try {
      const res = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ apiKey: key.trim() }),
      })
      const d = await res.json()
      if (d.valid) {
        setStatus('ok')
      } else {
        setStatus('error')
        setError(d.error || 'Validation failed.')
      }
    } catch (e) {
      setStatus('error')
      setError('Network error — check your connection and try again.')
    }
  }

  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">STEP 1 — CONNECT YOUR AI</div>
        <div className="term-box-body">
          <div style={{ marginBottom: '16px', color: '#aaa', lineHeight: '1.8' }}>
            Claude Corre is powered by Claude, an AI made by Anthropic. To use it,
            each person provides their own API key — a secret token that lets this app
            talk to Claude on your behalf. You pay Anthropic directly for usage.
          </div>
          <div style={{ marginBottom: '16px', fontSize: '12px', color: '#555' }}>
            Typical cost: $1–5/month of active coaching. Your key is encrypted and
            never visible to anyone else.
          </div>
        </div>
      </div>

      <div className="term-box">
        <div className="term-box-title">HOW TO GET YOUR API KEY — FOLLOW THESE STEPS</div>
        <div className="term-box-body" style={{ fontSize: '14px', lineHeight: '2' }}>

          <div style={{ marginBottom: '12px' }}>
            <span className="amber">STEP 1 →</span>{' '}
            Open this link in a new tab:{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--amber)', textDecoration: 'underline' }}
            >
              console.anthropic.com/settings/keys
            </a>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <span className="amber">STEP 2 →</span>{' '}
            Create an account if you don&apos;t have one (it&apos;s free to sign up).
            You&apos;ll need to add a credit card to use the API — Anthropic charges
            per use, not a flat subscription.
          </div>

          <div style={{ marginBottom: '12px' }}>
            <span className="amber">STEP 3 →</span>{' '}
            Click <strong style={{ color: '#ddd' }}>&#34;+ Create Key&#34;</strong> and give it any name
            (e.g. <em style={{ color: '#888' }}>claude-corre</em>).
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span className="amber">STEP 4 →</span>{' '}
            A key will appear — it looks like this:
            <div style={{
              background: '#0d0d0d',
              border: '1px solid #333',
              padding: '8px 12px',
              margin: '6px 0',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: '#888',
              letterSpacing: '0.5px',
            }}>
              sk-ant-api03-<span style={{ color: '#555' }}>XXXXXXXXXX...XXXX</span>-<span style={{ color: '#555' }}>XXXXXXXXXX-XXXXXXXXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXX</span>AA
            </div>
            <span className="red">⚠ Copy it immediately.</span>{' '}
            <span style={{ color: '#aaa' }}>
              Once you close that dialog, you cannot see it again. If you lose it,
              you&apos;ll need to create a new one.
            </span>
          </div>

          <div style={{ borderTop: '1px solid #222', paddingTop: '16px', marginTop: '8px' }}>
            <div className="dim" style={{ fontSize: '12px', marginBottom: '8px' }}>
              STEP 5 → Paste your key below and click [VALIDATE + SAVE]:
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                className="term-input"
                type="password"
                value={key}
                onChange={e => { setKey(e.target.value); setStatus(null) }}
                placeholder="sk-ant-api03-..."
                disabled={status === 'validating' || status === 'ok'}
                onKeyDown={e => e.key === 'Enter' && validate()}
              />
              <button
                className="term-btn amber"
                onClick={validate}
                disabled={!key.trim() || status === 'validating' || status === 'ok'}
                style={{ whiteSpace: 'nowrap' }}
              >
                {status === 'validating' ? '[...]' : '[VALIDATE + SAVE]'}
              </button>
            </div>

            {status === 'error' && (
              <div className="red" style={{ fontSize: '13px', marginBottom: '8px' }}>
                ✗ {error}
              </div>
            )}
            {status === 'ok' && (
              <div className="status-ok" style={{ fontSize: '13px', marginBottom: '8px' }}>
                ✓ Key validated and saved. You&apos;re connected to Claude.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="term-btn amber"
          onClick={onDone}
          disabled={status !== 'ok'}
        >
          [NEXT: SET UP YOUR PROFILE →]
        </button>
      </div>
    </div>
  )
}

function Step2Profile({ onDone, onBack }) {
  const { getAuthHeader } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [planCreated, setPlanCreated] = useState(false)
  const bottomRef = useRef()
  const startedRef = useRef(false)

  // Auto-start the coach conversation
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    sendToCoach("I'm new here. Please set up my running profile and training plan from scratch. Ask me about my background, fitness, goals, and availability — then create my profile, set my goal, and build a periodized training plan.")
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendToCoach(text) {
    const q = text || input.trim()
    if (!q || loading) return
    setInput('')

    const userMsg = { role: 'user', content: q }
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setLoading(true)

    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ask-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ question: q, history }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt
          try { evt = JSON.parse(line.slice(6)) } catch { continue }
          if (evt.error) throw new Error(evt.error)
          if (evt.tool) {
            const toolLabel = evt.tool.replace(/_/g, ' ')
            if (evt.tool === 'create_training_plan') setPlanCreated(true)
            if (evt.tool === 'update_athlete_profile') setProfileSaved(true)
            setMessages(prev => {
              const last = prev[prev.length - 1]
              return [...prev.slice(0, -1), { ...last, content: last.content + `\n*[${toolLabel}...]*\n` }]
            })
          }
          if (evt.thinking) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              return [...prev.slice(0, -1), { ...last, content: last.content + `\n*COACH THINKING (round ${evt.thinking})...*\n` }]
            })
          }
          if (evt.chunk) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              return [...prev.slice(0, -1), { ...last, content: last.content + evt.chunk }]
            })
          }
          if (evt.done && evt.logUpdated) {
            setProfileSaved(true)
            window.dispatchEvent(new CustomEvent('log-updated'))
          }
        }
      }
    } catch (e) {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `[ERROR: ${e.message}]` }])
    }
    setLoading(false)
  }

  function displayContent(content) {
    return content.trim()
  }

  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">STEP 2 — SET UP YOUR RUNNING PROFILE</div>
        <div className="term-box-body" style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
          The coach will ask about your running history, current fitness, goal, injuries, and schedule.
          Answer honestly — the more detail you give, the better the plan.
          When done, click <span className="amber">[FINISH SETUP]</span> below.
        </div>
      </div>

      <div className="term-box">
        <div className="term-box-title">
          <span>COACH TERMINAL</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {profileSaved && <span className="status-ok" style={{ fontSize: '12px' }}>✓ PROFILE</span>}
            {planCreated && <span className="status-ok" style={{ fontSize: '12px' }}>✓ PLAN</span>}
          </div>
        </div>
        <div className="term-box-body">
          <div className="term-output" style={{ maxHeight: '420px', marginBottom: '12px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: '12px' }}>
                {m.role === 'user'
                  ? <div><span className="amber">YOU &gt; </span><span>{m.content}</span></div>
                  : <div>
                      <div className="status-ok" style={{ marginBottom: '2px' }}>COACH &gt;</div>
                      <div className="coach-output" style={{ paddingLeft: '8px', lineHeight: '1.5' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent(m.content)}</ReactMarkdown>
                      </div>
                    </div>
                }
              </div>
            ))}
            {loading && (
              <div style={{ color: '#555', fontStyle: 'italic' }}>COACH is typing...</div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="term-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendToCoach()}
              placeholder="type your answer..."
              disabled={loading}
            />
            <button className="term-btn amber" onClick={() => sendToCoach()} disabled={!input.trim() || loading}>
              [SEND]
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="term-btn" onClick={onBack}>[← BACK]</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {!profileSaved && (
            <div className="dim" style={{ fontSize: '12px' }}>
              The button unlocks once the coach saves your profile.
            </div>
          )}
          <button className="term-btn amber" onClick={onDone} disabled={!profileSaved}>
            [FINISH SETUP →]
          </button>
        </div>
      </div>
    </div>
  )
}

function Step3Garmin({ onDone, onBack }) {
  const { getAuthHeader } = useAuth()
  const [choice, setChoice] = useState(null)
  const [tokenText, setTokenText] = useState('')
  const [saveStatus, setSaveStatus] = useState(null)
  const [saveError, setSaveError] = useState('')

  async function saveTokens() {
    if (!tokenText.trim()) return
    setSaveStatus('saving')
    setSaveError('')
    try {
      let parsed
      try { parsed = JSON.parse(tokenText.trim()) } catch {
        setSaveStatus('error')
        setSaveError('Invalid JSON. Copy the entire output from browser_auth.py.')
        return
      }
      // Accept both combined format {oauth1, oauth2} and legacy {access_token}
      if (!parsed.oauth1 && !parsed.oauth2 && !parsed.access_token) {
        setSaveStatus('error')
        setSaveError('Token JSON must contain oauth1+oauth2 (from browser_auth.py) or at least an access_token.')
        return
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ garminTokens: tokenText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSaveStatus('ok')
    } catch (e) {
      setSaveStatus('error')
      setSaveError(e.message)
    }
  }

  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">STEP 3 — GARMIN WATCH (OPTIONAL)</div>
        <div className="term-box-body" style={{ lineHeight: '1.8' }}>
          <div style={{ color: '#aaa', marginBottom: '16px' }}>
            Connect your Garmin to push workouts to your watch and sync activities automatically.
          </div>

          {choice === null && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="term-btn amber" onClick={() => setChoice('yes')}>[CONNECT GARMIN]</button>
              <button className="term-btn" onClick={() => setChoice('skip')}>[SKIP FOR NOW]</button>
            </div>
          )}

          {choice === 'skip' && (
            <div className="dim" style={{ fontSize: '13px' }}>
              You can connect Garmin any time from <span className="amber">[SETTINGS]</span>.
            </div>
          )}
        </div>
      </div>

      {choice === 'yes' && (
        <div className="term-box">
          <div className="term-box-title">CONNECT GARMIN</div>
          <div className="term-box-body" style={{ fontSize: '13px', lineHeight: '1.9' }}>
            <div style={{ marginBottom: '14px', color: '#888' }}>
              Open Terminal on your computer and run these commands. Takes about 2 minutes.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <span className="amber">1.</span> <strong style={{ color: '#ccc' }}>Install dependencies</strong> (first time only):
              <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', padding: '8px 12px', margin: '4px 0', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#0f0' }}>
                pip install playwright requests requests-oauthlib && playwright install chromium
              </div>
              <div className="dim" style={{ fontSize: '11px' }}>
                Need Python? Mac: <code style={{ color: '#888' }}>brew install python</code> · Download: python.org
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <span className="amber">2.</span> <strong style={{ color: '#ccc' }}>Download the auth script</strong>:
              <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', padding: '8px 12px', margin: '4px 0', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#0f0', overflowX: 'auto' }}>
                curl -O https://raw.githubusercontent.com/lucascmgit/claude-corre/main/browser_auth.py
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <span className="amber">3.</span> <strong style={{ color: '#ccc' }}>Run it</strong>:
              <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', padding: '8px 12px', margin: '4px 0', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#0f0' }}>
                python3 browser_auth.py
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <span className="amber">4.</span> <strong style={{ color: '#ccc' }}>Log in</strong> — a Chromium browser window opens automatically.
              Sign in with your Garmin Connect email and password.
              <div className="dim" style={{ fontSize: '11px' }}>
                The window closes by itself when done. You have 5 minutes.
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <span className="amber">5.</span> <strong style={{ color: '#ccc' }}>Paste the token</strong> — the script copies it to your clipboard. Just paste below (Cmd+V / Ctrl+V):
            </div>

            <textarea
              className="term-input"
              value={tokenText}
              onChange={e => { setTokenText(e.target.value); setSaveStatus(null) }}
              placeholder='Paste here — the script copies the token to your clipboard automatically'
              style={{ width: '100%', minHeight: '80px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              disabled={saveStatus === 'ok'}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
              <button className="term-btn amber" onClick={saveTokens}
                disabled={!tokenText.trim() || saveStatus === 'saving' || saveStatus === 'ok'}>
                {saveStatus === 'saving' ? '[...]' : '[SAVE TOKENS]'}
              </button>
              <button className="term-btn" style={{ fontSize: '12px' }} onClick={() => setChoice('skip')}>[SKIP]</button>
            </div>
            {saveStatus === 'error' && <div className="red" style={{ fontSize: '13px', marginTop: '8px' }}>{saveError}</div>}
            {saveStatus === 'ok' && (
              <div className="status-ok" style={{ fontSize: '13px', marginTop: '8px' }}>
                Garmin connected. Tokens auto-refresh — you only need to do this again if they fully expire.
              </div>
            )}

            <div style={{ marginTop: '14px', fontSize: '12px', color: '#444', borderTop: '1px solid #1a1a1a', paddingTop: '8px' }}>
              <strong style={{ color: '#555' }}>Not working?</strong> Check that Python 3 is installed, that you ran <code style={{ color: '#666' }}>playwright install chromium</code>,
              and that you completed the Garmin login before the 5-minute timeout. If the clipboard didn&apos;t work, copy the JSON blob printed in the terminal.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <button className="term-btn" onClick={onBack}>[BACK]</button>
        <button className="term-btn amber" onClick={onDone}
          disabled={choice === null || (choice === 'yes' && saveStatus !== 'ok')}>
          [GO TO DASHBOARD]
        </button>
      </div>
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { getAuthHeader } = useAuth()
  const [step, setStep] = useState(null) // null while loading

  // Determine which step to start from
  useEffect(() => {
    fetch('/api/onboard-status', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(s => {
        if (!s.hasApiKey) setStep(1)
        else if (s.isNewUser) setStep(2)
        else navigate('/', { replace: true }) // already done
      })
      .catch(() => setStep(1))
  }, [])

  if (step === null) return <div className="dim" style={{ padding: '32px' }}>LOADING...</div>

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '0 8px 40px' }}>
      <div style={{ padding: '24px 0 16px' }}>
        <div className="logo-title" style={{ fontSize: '48px' }}>CLAUDE CORRE</div>
        <div className="header-tagline">// SETUP — STEP {step} OF 3</div>
      </div>

      <StepBar step={step} />

      {step === 1 && (
        <Step1ApiKey onDone={() => setStep(2)} />
      )}
      {step === 2 && (
        <Step2Profile
          onDone={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step3Garmin
          onDone={() => navigate('/', { replace: true })}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  )
}
