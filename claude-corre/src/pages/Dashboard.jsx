import { useEffect, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'

function AsciiBar({ value, max, width = 20 }) {
  const filled = Math.round((value / max) * width)
  return (
    <span>
      <span className="zone-bar-fill">{'█'.repeat(Math.max(0, filled))}</span>
      <span className="zone-bar-empty">{'░'.repeat(Math.max(0, width - filled))}</span>
    </span>
  )
}

function PhaseBar({ phase, currentWeek }) {
  const phaseNum = phase?.match(/Phase (\d+)/)?.[1] || '?'
  const phaseName = phase?.match(/—\s*([^(]+)/)?.[1]?.trim() || phase
  const totalWeeksMatch = phase?.match(/Weeks?\s*\d+-(\d+)/)
  const totalWeeks = totalWeeksMatch ? parseInt(totalWeeksMatch[1]) : 4
  const weekNum = currentWeek?.match(/Week (\d+)/)?.[1] || 1
  const filled = Math.round((weekNum / totalWeeks) * 30)

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        <span className="amber">PHASE {phaseNum} — {phaseName}</span>
        <span style={{ color: '#333' }}>
          {'['}
          <span className="amber">{'='.repeat(filled)}</span>
          {' '.repeat(30 - filled)}
          {']'}
        </span>
        <span className="dim">WK {weekNum}/{totalWeeks}</span>
      </div>
    </div>
  )
}

function ActivityRow({ act, expanded, onToggle }) {
  const hr = parseInt(act['Avg HR'])
  const hrClass = hr > 155 ? 'red' : hr > 142 ? 'status-warn' : ''

  function handleToggle() {
    const scrollY = window.scrollY
    onToggle()
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }))
  }

  return (
    <Fragment>
      <tr className={`clickable ${expanded ? 'expanded' : ''}`} onClick={handleToggle}>
        <td className="dim nowrap">{act.Date}</td>
        <td className="nowrap">{expanded ? '▼ ' : '▶ '}{act.Type || act.Day}</td>
        <td className="nowrap">{act.Distance || '—'}</td>
        <td className="nowrap">{act['Avg Pace'] || '—'}</td>
        <td className={`nowrap ${hrClass}`}>{act['Avg HR'] || '—'}</td>
        <td className="nowrap">{act['Max HR'] || '—'}</td>
        <td className="dim" style={{ fontSize: '13px' }}>{act.Notes || '—'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: 0 }}>
            <div className="activity-detail" style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {act['Avg Cadence'] && act['Avg Cadence'] !== '—' && <div><span className="amber">Cadence:</span> {act['Avg Cadence']}</div>}
              {act.Notes && act.Notes !== '—' && <div className="dim" style={{ lineHeight: '1.6' }}>{act.Notes}</div>}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

export default function Dashboard() {
  const { getAuthHeader } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedActivity, setExpandedActivity] = useState(null)
  const [garminStatus, setGarminStatus] = useState(null) // null | 'pushing' | 'ok' | 'error'
  const [garminMsg, setGarminMsg] = useState('')

  function load() {
    setLoading(true)
    fetch('/api/dashboard', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
    window.addEventListener('log-updated', load)
    return () => window.removeEventListener('log-updated', load)
  }, [])

  async function pushToGarmin() {
    setGarminStatus('pushing')
    setGarminMsg('')
    try {
      const res = await fetch('/api/push-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ prescription: data?.prescription }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
      setGarminStatus('ok')
      setGarminMsg(`Workout pushed. ID: ${d.workoutId}`)
    } catch (e) {
      setGarminStatus('error')
      setGarminMsg(e.message)
    }
  }

  if (loading) return <div className="dim" style={{ padding: '24px' }}>LOADING...</div>
  if (!data) return <div className="red" style={{ padding: '24px' }}>ERROR: Could not load dashboard.</div>

  const { isNewUser, profile, goal, phase, currentWeek, zones, activities, prescription, coachNotes, hasGarminTokens } = data

  if (isNewUser) {
    return (
      <div className="term-box">
        <div className="term-box-title">WELCOME TO CLAUDE CORRE</div>
        <div className="term-box-body">
          <div style={{ marginBottom: '12px', color: '#aaa' }}>
            Your athlete profile is not yet configured.
          </div>
          <div style={{ marginBottom: '16px', fontSize: '13px' }}>
            Go to <span className="amber">[ASK COACH]</span> and say:
            <div className="prompt" style={{ margin: '8px 0', fontSize: '14px' }}>
              "I'm new here. Help me set up my training profile."
            </div>
            The coach will ask about your running history, goal, injuries, and schedule — then write your full training log.
          </div>
          <button className="term-btn amber" onClick={() => navigate('/coach')}>[GO TO COACH →]</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Athlete status */}
      <div className="term-box">
        <div className="term-box-title">
          <span>ATHLETE STATUS</span>
          <span className="dim">// {new Date().toISOString().split('T')[0]}</span>
        </div>
        <div className="term-box-body">
          <div className="grid-2">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {profile.Name      && <div><span className="amber">ATHLETE....</span> {profile.Name}</div>}
              {profile.Age       && <div><span className="amber">AGE........</span> {profile.Age}{profile.Weight ? ` | ${profile.Weight}` : ''}{profile.Height ? ` | ${profile.Height}` : ''}</div>}
              {profile.Location  && <div><span className="amber">LOCATION...</span> {profile.Location}</div>}
              {profile['Previous peak'] && <div><span className="amber">PREV PEAK..</span> {profile['Previous peak']}</div>}
              {profile['Injuries/limits'] && <div><span className="amber">INJURIES...</span> {profile['Injuries/limits']}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div><span className="amber">GOAL.......</span> {goal}</div>
              {currentWeek && <div><span className="amber">WEEK.......</span> {currentWeek}</div>}
            </div>
          </div>
          {phase && phase !== '—' && <PhaseBar phase={phase} currentWeek={currentWeek} />}
        </div>
      </div>

      {/* Prescribed session */}
      {prescription && prescription.length > 10 && (
        <div className="term-box">
          <div className="term-box-title">
            <span>PRESCRIBED SESSION</span>
            <span className="status-ok">● CURRENT</span>
          </div>
          <div className="term-box-body coach-output" style={{ fontSize: '13px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{prescription}</ReactMarkdown>
            {hasGarminTokens && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  className="term-btn amber"
                  onClick={pushToGarmin}
                  disabled={garminStatus === 'pushing'}
                >
                  {garminStatus === 'pushing' ? '[PUSHING...]' : '[PUSH TO GARMIN ↑]'}
                </button>
                {garminStatus === 'ok' && <span className="status-ok" style={{ fontSize: '13px' }}>✓ {garminMsg}</span>}
                {garminStatus === 'error' && <span className="red" style={{ fontSize: '13px' }}>✗ {garminMsg}</span>}
              </div>
            )}
            {!hasGarminTokens && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#444' }}>
                Add Garmin tokens in <span className="amber">[SETTINGS]</span> to push workouts to your watch.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Training zones */}
      {zones.length > 0 && (
        <div className="term-box">
          <div className="term-box-title">TRAINING ZONES</div>
          <div className="term-box-body">
            <table className="term-table">
              <thead>
                <tr><th>ZONE</th><th>HR (BPM)</th><th>EST PACE</th><th>USE</th></tr>
              </thead>
              <tbody>
                {zones.map((z, i) => (
                  <tr key={i}>
                    <td className="amber">{z.Zone || z.zone}</td>
                    <td>{z.HR || z.hr}</td>
                    <td>{z['Est. Pace'] || z['Est Pace'] || z.pace}</td>
                    <td className="dim">{z.Use || z.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity log */}
      {activities.length > 0 && (
        <div className="term-box">
          <div className="term-box-title">
            <span>ACTIVITY LOG</span>
            <span className="dim">// {activities.length} entries</span>
          </div>
          <div className="term-box-body">
            <table className="term-table">
              <thead>
                <tr>
                  <th>DATE</th><th>TYPE</th><th>DIST</th>
                  <th>AVG PACE</th><th>AVG HR</th><th>MAX HR</th><th>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((act, i) => (
                  <ActivityRow
                    key={`${act.Date}-${i}`}
                    act={act}
                    expanded={expandedActivity === i}
                    onToggle={() => setExpandedActivity(expandedActivity === i ? null : i)}
                  />
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '8px', fontSize: '11px' }} className="dim">
              ▶ click a row to expand details
            </div>
          </div>
        </div>
      )}

      {/* Coach notes */}
      {coachNotes && coachNotes.length > 10 && (
        <div className="term-box">
          <div className="term-box-title">COACH NOTES</div>
          <div className="term-box-body coach-output" style={{ fontSize: '13px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{coachNotes}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
