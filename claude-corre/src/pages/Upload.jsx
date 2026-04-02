import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'

const SPINNER_FRAMES = ['[/]', '[-]', '[\\]', '[|]']

function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 4), 150)
    return () => clearInterval(id)
  }, [])
  return <span className="amber">{SPINNER_FRAMES[frame]} PROCESSING...</span>
}

export default function Upload() {
  const { getAuthHeader } = useAuth()
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | done | error
  const [output, setOutput] = useState('')
  const [prescription, setPrescription] = useState('')
  const [hasGarminTokens, setHasGarminTokens] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    fetch('/api/settings', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => setHasGarminTokens(!!d.hasGarminOauth2))
      .catch(() => {})
  }, [])

  function handleFile(f) {
    if (!f || !f.name.endsWith('.csv')) {
      setStatus('error')
      setOutput('ERROR: Only Garmin CSV files accepted (.csv)')
      return
    }
    setFile(f)
    setStatus('idle')
    setOutput('')
  }

  async function analyze() {
    if (!file) return
    setStatus('uploading')
    setOutput('> Reading CSV file...\n> Extracting lap splits, HR, cadence...\n> Sending to Claude coach...\n')
    setPrescription('')

    const text = await file.text()
    try {
      const res = await fetch('/api/upload-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ csv: text, filename: file.name })
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      setOutput(data.analysis || 'No analysis returned.')
      setPrescription(data.prescription || '')
      setStatus('done')
      window.dispatchEvent(new CustomEvent('log-updated'))
    } catch (e) {
      setOutput(`ERROR: ${e.message}`)
      setStatus('error')
    }
  }

  async function pushToGarmin() {
    if (!prescription) return
    setStatus('uploading')
    try {
      const res = await fetch('/api/push-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ prescription })
      })
      const data = await res.json()
      if (data.workoutId) {
        setOutput(prev => prev + `\n\n> WORKOUT UPLOADED TO GARMIN CONNECT\n> ID: ${data.workoutId}\n> Sync via Bluetooth to push to watch.`)
      } else {
        setOutput(prev => prev + `\n\nERROR: ${data.error || 'Upload failed'}`)
      }
      setStatus('done')
    } catch (e) {
      setOutput(prev => prev + `\n\nERROR: ${e.message}`)
      setStatus('error')
    }
  }

  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">UPLOAD ACTIVITY // GARMIN CSV</div>
        <div className="term-box-body">
          <div className="dim" style={{marginBottom:'12px', fontSize:'12px'}}>
            Export from Garmin Connect: Activities → click run → gear icon → Export to CSV<br/>
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
              ? <><div className="amber">{file.name}</div><div className="dim">{(file.size/1024).toFixed(1)} KB — ready to analyze</div></>
              : <><div>DROP CSV HERE</div><div className="dim">or click to select</div></>
            }
          </div>
          <input ref={inputRef} type="file" accept=".csv" style={{display:'none'}}
            onChange={e => handleFile(e.target.files[0])} />

          <div style={{marginTop:'12px', display:'flex', gap:'8px', alignItems:'center'}}>
            <button className="term-btn amber" onClick={analyze} disabled={!file || status === 'uploading'}>
              [ANALYZE + GET PRESCRIPTION]
            </button>
            {status === 'uploading' && <Spinner />}
            {status === 'done' && <span className="status-ok">✓ DONE</span>}
            {status === 'error' && <span className="red">✗ ERROR</span>}
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
            <div className="term-output coach-output">
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
            <div className="coach-output" style={{marginBottom:'12px'}}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prescription}</ReactMarkdown>
            </div>
            {hasGarminTokens
              ? <button className="term-btn amber" onClick={pushToGarmin} disabled={status === 'uploading'}>
                  [→ GENERATE + PUSH TO GARMIN WATCH]
                </button>
              : <div style={{ fontSize: '12px', color: '#444' }}>
                  Add Garmin tokens in <span className="amber">[SETTINGS]</span> to push workouts to your watch.
                </div>
            }
          </div>
        </div>
      )}
    </div>
  )
}
