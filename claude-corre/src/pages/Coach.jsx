import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'
import { RenderWithCopyCmd } from '../components/CopyCmd.jsx'

const QUICK_PROMPTS = [
  'Prescribe my next run',
  'Am I on track for my June 15 goal?',
  'Explain why Z2 matters for me right now',
  'What does my HR data tell you about my fitness?',
  'How should I adjust for running in Rio heat?',
]

function ThinkingIndicator() {
  const [dots, setDots] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setDots(d => (d % 3) + 1), 400)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{marginBottom:'12px'}}>
      <div className="amber" style={{marginBottom:'4px'}}>COACH &gt;</div>
      <div style={{paddingLeft:'8px', color:'#555', fontStyle:'italic'}}>
        THINKING{'.'.repeat(dots)}{' '.repeat(3 - dots)}
      </div>
    </div>
  )
}

const WELCOME_MSG = {
  role: 'assistant',
  content: 'COACH TERMINAL READY.\n\nType a question or use a quick prompt below. I have your full training log loaded.\n\nRemember: I will not sugarcoat. Data governs.',
}

export default function Coach() {
  const { getAuthHeader } = useAuth()
  const [messages, setMessages] = useState([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastLogStatus, setLastLogStatus] = useState(null) // 'saved' | 'not-saved' | null
  const bottomRef = useRef()
  const historyLoaded = useRef(false)

  // Load persisted chat history on first mount
  useEffect(() => {
    if (historyLoaded.current) return
    historyLoaded.current = true
    fetch('/api/chat-history', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => {
        if (d.messages && d.messages.length > 0) {
          // Restore up to 20 messages for display (oldest first, keep welcome at top)
          setMessages([WELCOME_MSG, ...d.messages.slice(-20)])
        }
      })
      .catch(() => {})
  }, [])

  // Only scroll into view when user sends a message (not when coach answers)
  const prevLengthRef = useRef(messages.length)
  useEffect(() => {
    const prev = prevLengthRef.current
    prevLengthRef.current = messages.length
    // last message added is from user → scroll so their message is visible
    if (messages.length > prev && messages[messages.length - 1]?.role === 'user') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  async function send(text) {
    const q = text || input.trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)
    setLastLogStatus(null)

    // Add empty assistant placeholder for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/ask-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ question: q, history: messages.slice(-6) })
      })
      if (!res.ok) {
        let msg = `Server error ${res.status}`
        try { const d = await res.json(); if (d.error || d.answer) msg = d.error || d.answer } catch {}
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let rawText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt
          try { evt = JSON.parse(line.slice(6)) } catch { continue }

          if (evt.error) throw new Error(evt.error)

          if (evt.tool) {
            // Show tool usage as a subtle status line
            const toolLabel = evt.tool.replace(/_/g, ' ')
            setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: rawText ? rawText + `\n\n*[${toolLabel}...]*` : `*[${toolLabel}...]*` }])
          }

          if (evt.chunk) {
            rawText += evt.chunk
            setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: rawText }])
          }

          if (evt.done) {
            setLastLogStatus(evt.logUpdated ? 'saved' : 'not-saved')
            if (evt.logUpdated) window.dispatchEvent(new CustomEvent('log-updated'))
          }
        }
      }
      // Persist history (skip the welcome message at index 0)
      setMessages(prev => {
        const toSave = prev.slice(1).filter(m => m.content) // exclude welcome + empty bubbles
        fetch('/api/chat-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ messages: toSave }),
        }).catch(() => {})
        return prev
      })
    } catch (e) {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `[ERROR: ${e.message}]` }])
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">
          <span>COACH TERMINAL</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {lastLogStatus === 'saved' && (
              <span className="status-ok" style={{ fontSize: '12px' }}>✓ LOG SAVED</span>
            )}
            {lastLogStatus === 'not-saved' && (
              <span style={{ fontSize: '12px', color: '#666' }}>◌ LOG NOT UPDATED</span>
            )}
            <span className="dim">// claude sonnet 4.6</span>
          </div>
        </div>
        <div className="term-box-body">

          {/* Chat log */}
          <div className="term-output" style={{maxHeight:'500px', marginBottom:'12px'}}>
            {messages.map((m, i) => (
              <div key={i} style={{marginBottom:'12px'}}>
                {m.role === 'user'
                  ? <div>
                      <span className="amber">YOU &gt; </span>
                      <span>{m.content}</span>
                    </div>
                  : <div>
                      <div className="status-ok" style={{marginBottom:'2px'}}>COACH &gt;</div>
                      <div className="coach-output" style={{paddingLeft:'8px', lineHeight:'1.45'}}>
                        {m.content?.startsWith('[ERROR:') ? <div className="red"><RenderWithCopyCmd text={m.content} /></div> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>}
                      </div>
                    </div>
                }
              </div>
            ))}
            {loading && <ThinkingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{display:'flex', gap:'8px'}}>
            <input
              className="term-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="ask the coach..."
              disabled={loading}
            />
            <button className="term-btn" onClick={() => send()} disabled={!input.trim() || loading}>
              [SEND]
            </button>
          </div>

          {/* Quick prompts */}
          <div style={{marginTop:'10px'}}>
            <div className="dim" style={{fontSize:'11px', marginBottom:'6px'}}>QUICK PROMPTS:</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:'6px'}}>
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} className="term-btn" style={{fontSize:'11px', padding:'3px 10px'}}
                  onClick={() => send(p)} disabled={loading}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
