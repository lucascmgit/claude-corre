import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'

export default function TrainingLog() {
  const { getAuthHeader } = useAuth()
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('idle')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/training-log', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => { setContent(d.content || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function save() {
    setStatus('saving')
    try {
      const res = await fetch('/api/training-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ content: draft })
      })
      if (!res.ok) throw new Error('Save failed')
      setContent(draft)
      setEditing(false)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
      window.dispatchEvent(new CustomEvent('log-updated'))
    } catch (e) {
      setStatus('error')
    }
  }

  if (loading) return <div className="amber">LOADING TRAINING LOG...</div>

  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">
          <span>TRAINING LOG</span>
          <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
            {status === 'saved' && <span className="status-ok">✓ SAVED</span>}
            {status === 'error' && <span className="red">✗ ERROR</span>}
            {editing
              ? <>
                  <button className="term-btn" style={{fontSize:'11px', padding:'2px 10px'}} onClick={save}>
                    [SAVE]
                  </button>
                  <button className="term-btn" style={{fontSize:'11px', padding:'2px 10px'}}
                    onClick={() => { setEditing(false); setDraft('') }}>
                    [CANCEL]
                  </button>
                </>
              : <button className="term-btn" style={{fontSize:'11px', padding:'2px 10px'}}
                  onClick={() => { setEditing(true); setDraft(content) }}>
                  [EDIT]
                </button>
            }
          </div>
        </div>
        <div className="term-box-body">
          {editing
            ? <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '600px',
                  background: '#080808',
                  border: '1px solid #2a2a2a',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  padding: '10px',
                  resize: 'vertical',
                  outline: 'none',
                  lineHeight: '1.6',
                }}
              />
            : <div className="coach-output">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
          }
        </div>
      </div>
    </div>
  )
}
