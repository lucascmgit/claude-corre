import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'

// macOS .command file — double-click → Terminal opens, runs garth refresh inline,
// copies resulting token JSON to clipboard via pbcopy, then waits for Enter.
const COMMAND_SCRIPT = `#!/bin/bash
python3 - <<'PYEOF'
import sys
try:
    import garth, json, subprocess
    from garth import sso
    c = garth.Client()
    c.load("~/.garth")
    fresh = sso.exchange(c.oauth1_token, c)
    c.oauth2_token = fresh
    c.dump("~/.garth")
    out = json.dumps(fresh.dict)
    subprocess.run(["pbcopy"], input=out.encode(), check=True)
    print(out)
    print("")
    print("Token refreshed and copied to clipboard!")
    print("Switch back to the app and paste it, then click SAVE.")
except ImportError:
    print("garth not installed. Run: pip install garth", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
echo ""
read -p "Press Enter to close this window..."
`

function downloadCommandFile() {
  const blob = new Blob([COMMAND_SCRIPT], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'refresh_garmin.command'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Inline wizard shown when a Garmin push returns 401.
// onSaved() is called after the fresh token is saved — caller retries the push.
function TokenRenewWizard({ onSaved, getAuthHeader }) {
  const [tokenText, setTokenText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleDownload() {
    downloadCommandFile()
    setDownloaded(true)
  }

  function copyCommand() {
    navigator.clipboard.writeText('python3 refresh_token.py')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function save() {
    setSaving(true)
    setErr('')
    try {
      let token
      try { token = JSON.parse(tokenText.trim()) } catch { throw new Error('Not valid JSON — paste the full output.') }
      if (!token.access_token) throw new Error('No access_token found — paste the full JSON output.')
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ garminOauth2Token: JSON.stringify(token) }),
      })
      if (!res.ok) throw new Error('Failed to save. Try again.')
      onSaved()
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: '12px', border: '1px solid #555', padding: '14px', fontSize: '13px' }}>
      <div className="amber" style={{ fontWeight: 'bold', marginBottom: '8px' }}>⚠ GARMIN TOKEN EXPIRED</div>
      <div style={{ color: '#888', marginBottom: '14px', fontSize: '12px' }}>
        Garmin tokens last ~1 hour. Refresh takes 10 seconds.
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={{ color: '#ccc', marginBottom: '6px', fontWeight: 'bold' }}>
          STEP 1 — {downloaded ? '✓ File downloaded. Double-click it.' : 'Click to download & run:'}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" onClick={handleDownload} style={{ fontSize: '12px' }}>
            {downloaded ? '[↓ RE-DOWNLOAD]' : '[↓ DOWNLOAD refresh_garmin.command]'}
          </button>
          <button className="btn-dim" onClick={copyCommand} style={{ fontSize: '12px' }}>
            {copied ? '[✓ COPIED]' : '[COPY COMMAND INSTEAD]'}
          </button>
        </div>
        {downloaded && (
          <div style={{ color: '#aaa', fontSize: '12px', marginTop: '6px' }}>
            Go to Downloads → double-click <strong>refresh_garmin.command</strong> → Terminal opens → token copied to clipboard automatically
          </div>
        )}
        {!downloaded && (
          <div style={{ color: '#666', fontSize: '11px', marginTop: '5px' }}>
            Downloads a macOS script. Double-click it → Terminal opens → token lands in your clipboard.
          </div>
        )}
      </div>

      <div>
        <div style={{ color: '#ccc', marginBottom: '6px', fontWeight: 'bold' }}>STEP 2 — Paste token here (⌘V):</div>
        <textarea
          value={tokenText}
          onChange={e => setTokenText(e.target.value)}
          placeholder='{"access_token": "...", "refresh_token": "..."}'
          autoFocus={downloaded}
          style={{ width: '100%', height: '70px', background: '#111', color: '#0f0', border: '1px solid #333', padding: '8px', fontSize: '11px', fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' }}
        />
        {err && <div style={{ color: '#f55', fontSize: '12px', marginTop: '4px' }}>✗ {err}</div>}
        <button
          className="btn"
          onClick={save}
          disabled={saving || !tokenText.trim()}
          style={{ marginTop: '8px', fontSize: '12px' }}
        >
          {saving ? '[SAVING...]' : '[SAVE & RETRY PUSH →]'}
        </button>
      </div>
    </div>
  )
}

const SPINNER_FRAMES = ['[/]', '[-]', '[\\]', '[|]']

function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 4), 150)
    return () => clearInterval(id)
  }, [])
  return <span className="amber">{SPINNER_FRAMES[frame]} PROCESSING...</span>
}

// Reads an SSE stream and calls onChunk/onDone/onError
async function readSse(res, { onChunk, onDone, onError }) {
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
      if (evt.error) { onError(evt.error); return }
      if (evt.chunk) onChunk(evt.chunk)
      if (evt.done) onDone(evt)
    }
  }
}

function GarminSync({ hasGarminTokens, onAnalysisResult }) {
  const { getAuthHeader } = useAuth()
  const [activities, setActivities] = useState(null)
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState('')
  const [analyzing, setAnalyzing] = useState(null)
  const [output, setOutput] = useState('')
  const [prescription, setPrescription] = useState('')
  const [garminStatus, setGarminStatus] = useState(null)
  const [renewMode, setRenewMode] = useState(false)

  async function loadActivities() {
    setLoadingList(true)
    setListError('')
    setRenewMode(false)
    try {
      const res = await fetch('/api/garmin-activities', { headers: getAuthHeader() })
      const d = await res.json()
      if (!res.ok && res.status === 401) { setRenewMode(true); setLoadingList(false); return }
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setActivities(d.activities || [])
    } catch (e) {
      setListError(e.message)
    }
    setLoadingList(false)
  }

  async function importActivity(act) {
    setAnalyzing(act.activityId)
    setOutput(`> Fetching "${act.name}" from Garmin Connect...\n> Downloading activity CSV...\n> Analyzing with Claude coach...\n`)
    setPrescription('')
    setGarminStatus(null)

    try {
      const res = await fetch('/api/import-garmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ activityId: act.activityId, activityName: act.name }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Server error ${res.status}`)
      }

      let text = ''
      await readSse(res, {
        onChunk: chunk => {
          text += chunk
          const display = text
            .replace(/```(?:markdown)?\s*\r?\n[\s\S]*?```/g, '')
            .replace(/```(?:markdown)?\s*\r?\n[\s\S]+$/, '')
            .trim()
          setOutput(display)
        },
        onDone: evt => {
          if (evt.prescription) setPrescription(evt.prescription)
          if (evt.logUpdated) {
            setGarminStatus('saved')
            window.dispatchEvent(new CustomEvent('log-updated'))
          }
        },
        onError: msg => { throw new Error(msg) },
      })
    } catch (e) {
      setOutput(prev => prev + `\nERROR: ${e.message}`)
    }
    setAnalyzing(null)
  }

  async function pushToGarmin() {
    if (!prescription) return
    setRenewMode(false)
    setGarminStatus('pushing')
    try {
      const res = await fetch('/api/push-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ prescription }),
      })
      const data = await res.json()
      if (!res.ok && res.status === 401) { setGarminStatus(null); setRenewMode(true); return }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setGarminStatus('pushed')
      setOutput(prev => prev + `\n\n> WORKOUT PUSHED TO GARMIN CONNECT\n> "${data.workoutName || data.workoutId}"\n> Sync via Bluetooth to push to watch.`)
    } catch (e) {
      setGarminStatus('error')
      setOutput(prev => prev + `\n\nERROR: ${e.message}`)
    }
  }

  if (!hasGarminTokens) {
    return (
      <div className="term-box">
        <div className="term-box-title">SYNC FROM GARMIN CONNECT</div>
        <div className="term-box-body" style={{ fontSize: '13px', color: '#555' }}>
          Add Garmin tokens in <span className="amber">[SETTINGS]</span> to sync activities directly from Garmin Connect.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">
          <span>SYNC FROM GARMIN CONNECT</span>
          {garminStatus === 'saved' && <span className="status-ok" style={{ fontSize: '12px' }}>✓ LOG SAVED</span>}
        </div>
        <div className="term-box-body">
          <div className="dim" style={{ fontSize: '12px', marginBottom: '10px' }}>
            Fetch your recent runs directly from Garmin — no CSV export needed.
          </div>

          {!activities && !renewMode && (
            <button className="term-btn amber" onClick={loadActivities} disabled={loadingList}>
              {loadingList ? '[LOADING...]' : '[FETCH RECENT RUNS]'}
            </button>
          )}
          {listError && <div className="red" style={{ fontSize: '13px', marginTop: '8px' }}>✗ {listError}</div>}
          {renewMode && <TokenRenewWizard getAuthHeader={getAuthHeader} onSaved={loadActivities} />}

          {activities && activities.length === 0 && (
            <div className="dim" style={{ fontSize: '13px' }}>No recent running activities found in Garmin Connect.</div>
          )}

          {activities && activities.length > 0 && (
            <table className="term-table" style={{ marginTop: '8px' }}>
              <thead>
                <tr><th>DATE</th><th>NAME</th><th>DIST</th><th>TIME</th><th>AVG HR</th><th></th></tr>
              </thead>
              <tbody>
                {activities.map(a => (
                  <tr key={a.activityId}>
                    <td className="dim nowrap">{a.date}</td>
                    <td>{a.name}</td>
                    <td className="nowrap">{a.distance}</td>
                    <td className="nowrap">{a.duration}</td>
                    <td className="nowrap">{a.avgHR || '—'}</td>
                    <td>
                      <button
                        className="term-btn amber"
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                        onClick={() => importActivity(a)}
                        disabled={!!analyzing}
                      >
                        {analyzing === a.activityId ? '[...]' : '[ANALYZE]'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activities && (
            <div style={{ marginTop: '8px' }}>
              <button className="term-btn" style={{ fontSize: '11px' }} onClick={() => { setActivities(null); setOutput(''); setPrescription('') }}>
                [REFRESH LIST]
              </button>
            </div>
          )}
        </div>
      </div>

      {output && (
        <div className="term-box">
          <div className="term-box-title">
            <span>COACH ANALYSIS</span>
            <span className="dim">// garmin sync</span>
          </div>
          <div className="term-box-body">
            <div className="term-output coach-output" style={{ maxHeight: '500px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {prescription && (
        <div className="term-box">
          <div className="term-box-title">
            <span>NEXT PRESCRIBED SESSION</span>
            <span className="status-ok">● NEW PRESCRIPTION</span>
          </div>
          <div className="term-box-body">
            <div className="coach-output" style={{ marginBottom: '12px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prescription}</ReactMarkdown>
            </div>
            {hasGarminTokens && garminStatus !== 'pushed' && !renewMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  className="term-btn amber"
                  onClick={pushToGarmin}
                  disabled={garminStatus === 'pushing'}
                >
                  {garminStatus === 'pushing' ? '[PUSHING...]' : '[→ PUSH TO GARMIN WATCH]'}
                </button>
                {garminStatus === 'error' && <span className="red" style={{ fontSize: '13px' }}>✗ Push failed — check error above</span>}
              </div>
            )}
            {renewMode && (
              <TokenRenewWizard getAuthHeader={getAuthHeader} onSaved={pushToGarmin} />
            )}
            {garminStatus === 'pushed' && <div className="status-ok" style={{ fontSize: '13px' }}>✓ Workout on Garmin — sync via Bluetooth.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Upload() {
  const { getAuthHeader } = useAuth()
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(false)
  const [output, setOutput] = useState('')
  const [prescription, setPrescription] = useState('')
  const [logSaved, setLogSaved] = useState(false)
  const [garminStatus, setGarminStatus] = useState(null)
  const [hasGarminTokens, setHasGarminTokens] = useState(false)
  const [renewMode, setRenewMode] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    fetch('/api/settings', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => setHasGarminTokens(!!d.hasGarminOauth2))
      .catch(() => {})
  }, [])

  function handleFile(f) {
    if (!f || !f.name.endsWith('.csv')) {
      setAnalyzeError(true)
      setOutput('ERROR: Only Garmin CSV files accepted (.csv)')
      return
    }
    setFile(f)
    setAnalyzeError(false)
    setOutput('')
    setPrescription('')
    setLogSaved(false)
    setGarminStatus(null)
  }

  async function analyze() {
    if (!file) return
    setAnalyzing(true)
    setAnalyzeError(false)
    setOutput('> Reading CSV file...\n> Extracting lap splits, HR, cadence...\n> Sending to Claude coach...\n')
    setPrescription('')
    setLogSaved(false)
    setGarminStatus(null)

    const text = await file.text()
    try {
      const res = await fetch('/api/upload-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ csv: text, filename: file.name }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Server error ${res.status}`)
      }

      let fullText = ''
      await readSse(res, {
        onChunk: chunk => {
          fullText += chunk
          const display = fullText
            .replace(/```(?:markdown)?\s*\r?\n[\s\S]*?```/g, '')
            .replace(/```(?:markdown)?\s*\r?\n[\s\S]+$/, '')
            .trim()
          setOutput(display)
        },
        onDone: evt => {
          if (evt.prescription) setPrescription(evt.prescription)
          if (evt.logUpdated) {
            setLogSaved(true)
            window.dispatchEvent(new CustomEvent('log-updated'))
          }
        },
        onError: msg => { throw new Error(msg) },
      })
    } catch (e) {
      setOutput(`ERROR: ${e.message}`)
      setAnalyzeError(true)
    }
    setAnalyzing(false)
  }

  async function pushToGarmin() {
    if (!prescription) return
    setRenewMode(false)
    setGarminStatus('pushing')
    try {
      const res = await fetch('/api/push-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ prescription }),
      })
      const data = await res.json()
      if (!res.ok && res.status === 401) { setGarminStatus(null); setRenewMode(true); return }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setGarminStatus('pushed')
      setOutput(prev => prev + `\n\n> WORKOUT PUSHED TO GARMIN CONNECT\n> "${data.workoutName || data.workoutId}"\n> Sync via Bluetooth to push to watch.`)
    } catch (e) {
      setGarminStatus('error')
      setOutput(prev => prev + `\n\nERROR: ${e.message}`)
    }
  }

  return (
    <div>
      {/* CSV Upload section */}
      <div className="term-box">
        <div className="term-box-title">
          <span>UPLOAD ACTIVITY // GARMIN CSV</span>
          {logSaved && <span className="status-ok" style={{ fontSize: '12px' }}>✓ LOG SAVED</span>}
        </div>
        <div className="term-box-body">
          <div className="dim" style={{ marginBottom: '12px', fontSize: '12px' }}>
            Export from Garmin Connect: Activities → click run → gear icon → Export to CSV<br />
            Then drop the file below.
          </div>

          <div
            className={`drop-zone ${dragging ? 'dragging' : ''}`}
            onClick={() => inputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          >
            {file
              ? <><div className="amber">{file.name}</div><div className="dim">{(file.size / 1024).toFixed(1)} KB — ready to analyze</div></>
              : <><div>DROP CSV HERE</div><div className="dim">or click to select</div></>
            }
          </div>
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />

          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="term-btn amber" onClick={analyze} disabled={!file || analyzing}>
              [ANALYZE + GET PRESCRIPTION]
            </button>
            {analyzing && <Spinner />}
            {!analyzing && output && !analyzeError && <span className="status-ok">✓ DONE</span>}
            {!analyzing && analyzeError && <span className="red">✗ ERROR</span>}
          </div>
        </div>
      </div>

      {output && (
        <div className="term-box">
          <div className="term-box-title">
            <span>COACH ANALYSIS</span>
            <span className="dim">// powered by claude</span>
          </div>
          <div className="term-box-body">
            <div className="term-output coach-output" style={{ maxHeight: '500px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {prescription && (
        <div className="term-box">
          <div className="term-box-title">
            <span>NEXT PRESCRIBED SESSION</span>
            <span className="status-ok">● NEW PRESCRIPTION</span>
          </div>
          <div className="term-box-body">
            <div className="coach-output" style={{ marginBottom: '12px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prescription}</ReactMarkdown>
            </div>
            {hasGarminTokens && garminStatus !== 'pushed' && !renewMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  className="term-btn amber"
                  onClick={pushToGarmin}
                  disabled={garminStatus === 'pushing'}
                >
                  {garminStatus === 'pushing' ? '[PUSHING...]' : '[→ PUSH TO GARMIN WATCH]'}
                </button>
                {garminStatus === 'error' && <span className="red" style={{ fontSize: '13px' }}>✗ Push failed — see error above</span>}
              </div>
            )}
            {renewMode && (
              <TokenRenewWizard getAuthHeader={getAuthHeader} onSaved={pushToGarmin} />
            )}
            {!hasGarminTokens && (
              <div style={{ fontSize: '12px', color: '#444' }}>
                Add Garmin tokens in <span className="amber">[SETTINGS]</span> to push workouts to your watch.
              </div>
            )}
            {garminStatus === 'pushed' && <div className="status-ok" style={{ fontSize: '13px' }}>✓ Workout on Garmin — sync via Bluetooth.</div>}
          </div>
        </div>
      )}

      {/* Garmin sync section */}
      <GarminSync hasGarminTokens={hasGarminTokens} />
    </div>
  )
}
