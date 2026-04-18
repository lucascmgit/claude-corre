import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'
import { RenderWithCopyCmd } from '../components/CopyCmd.jsx'


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
async function readSse(res, { onChunk, onDone, onError, onTool, onThinking }) {
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
      if (evt.tool && onTool) onTool(evt.tool)
      if (evt.thinking && onThinking) onThinking(evt.thinking)
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
  const [choosingActivity, setChoosingActivity] = useState(null) // activity waiting for prescribed/other choice
  const [output, setOutput] = useState('')
  const [prescription, setPrescription] = useState('')
  const [garminStatus, setGarminStatus] = useState(null)
  async function loadActivities() {
    setLoadingList(true)
    setListError('')
    try {
      const res = await fetch('/api/garmin-activities', { headers: getAuthHeader() })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setActivities(d.activities || [])
    } catch (e) {
      setListError(e.message)
    }
    setLoadingList(false)
  }

  async function importActivity(act, isPrescribed) {
    setChoosingActivity(null)
    setAnalyzing(act.activityId)
    setOutput(`> Fetching "${act.name}" from Garmin Connect...\n> ${isPrescribed ? 'Comparing to prescribed workout...' : 'Recording as extra activity...'}\n> Analyzing with Claude coach...\n`)
    setPrescription('')
    setGarminStatus(null)

    try {
      const res = await fetch('/api/import-garmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          activityId: act.activityId,
          activityName: act.name,
          activityDate: act.date,
          isPrescribed,
          clientDate: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Server error ${res.status}`)
      }

      let text = ''
      await readSse(res, {
        onChunk: chunk => {
          text += chunk
          setOutput(text)
        },
        onTool: name => {
          setOutput(prev => prev + `\n> [${name.replace(/_/g, ' ')}...]`)
        },
        onThinking: round => {
          setOutput(prev => prev + `\n> COACH THINKING (round ${round})...`)
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
    setGarminStatus('pushing')
    try {
      const res = await fetch('/api/push-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ prescription }),
      })
      const data = await res.json()
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

          {!activities && (
            <button className="term-btn amber" onClick={loadActivities} disabled={loadingList}>
              {loadingList ? '[LOADING...]' : '[FETCH RECENT RUNS]'}
            </button>
          )}
          {listError && <div className="red" style={{ fontSize: '13px', marginTop: '8px' }}>✗ <RenderWithCopyCmd text={listError} /></div>}

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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {choosingActivity?.activityId === a.activityId ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="term-btn amber" style={{ fontSize: '10px', padding: '2px 6px' }}
                            onClick={() => importActivity(a, true)}>[PRESCRIBED]</button>
                          <button className="term-btn" style={{ fontSize: '10px', padding: '2px 6px' }}
                            onClick={() => importActivity(a, false)}>[OTHER]</button>
                        </div>
                      ) : (
                        <button
                          className="term-btn amber"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          onClick={() => setChoosingActivity(a)}
                          disabled={!!analyzing}
                        >
                          {analyzing === a.activityId ? '[...]' : '[ANALYZE]'}
                        </button>
                      )}
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
            {hasGarminTokens && garminStatus !== 'pushed' && (
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
            {garminStatus === 'pushed' && <div className="status-ok" style={{ fontSize: '13px' }}>✓ Workout on Garmin — sync via Bluetooth.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Upload() {
  const { getAuthHeader } = useAuth()
  const [hasGarminTokens, setHasGarminTokens] = useState(false)

  useEffect(() => {
    fetch('/api/settings', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => setHasGarminTokens(!!d.hasGarminOauth2))
      .catch(() => {})
  }, [])

  return <GarminSync hasGarminTokens={hasGarminTokens} />
}
