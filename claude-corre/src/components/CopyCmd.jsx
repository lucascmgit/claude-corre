import { useState } from 'react'

const GARMIN_CMD = 'python3 browser_auth.py'

/**
 * Renders a terminal command with a click-to-copy button.
 */
export function GarminAuthCmd({ style }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(GARMIN_CMD).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <span
      onClick={copy}
      title="Click to copy"
      className="clickable"
      style={{
        background: '#0d0d0d',
        border: '1px solid #2a2a2a',
        padding: '3px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: '#0f0',
        cursor: 'pointer',
        display: 'inline-block',
        ...style,
      }}
    >
      {GARMIN_CMD}
      <span style={{ marginLeft: '8px', fontSize: '11px', color: copied ? 'var(--amber)' : '#999' }}>
        {copied ? 'copied!' : '[click to copy]'}
      </span>
    </span>
  )
}

/**
 * Scans text for the garmin auth command pattern and replaces it with a copyable element.
 */
export function RenderWithCopyCmd({ text }) {
  if (!text) return null
  // Match both old and new command patterns
  const patterns = [
    'python3 browser_auth.py (see Settings for instructions)',
    'python3 browser_auth.py',
  ]
  for (const pat of patterns) {
    const idx = text.indexOf(pat)
    if (idx === -1) continue
    const before = text.slice(0, idx)
    const after = text.slice(idx + pat.length)
    return <>{before}<GarminAuthCmd style={{ margin: '4px 0' }} />{after}</>
  }
  return <>{text}</>
}
