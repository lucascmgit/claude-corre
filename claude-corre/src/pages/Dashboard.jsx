import { useEffect, useState, Fragment, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'

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

function parseKm(s) {
  if (!s || s === '—' || s === '-') return 0
  const m = String(s).match(/([0-9.]+)\s*k?m?/i)
  return m ? parseFloat(m[1]) : 0
}

function getMonday(d) {
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const diff = (day.getDay() + 6) % 7 // Mon=0
  day.setDate(day.getDate() - diff)
  return day.toISOString().split('T')[0]
}

function WeeklySummary({ activities }) {
  const weeks = {}
  for (const a of activities) {
    if (!a.Date || a.Date === '—') continue
    const d = new Date(a.Date)
    if (isNaN(d)) continue
    const wk = getMonday(d)
    if (!weeks[wk]) weeks[wk] = { km: 0, runs: 0, hrTotal: 0, hrCount: 0 }
    const km = parseKm(a.Distance)
    const type = (a.Type || '').toLowerCase()
    if (km > 0 || type.includes('run')) {
      weeks[wk].km += km
      weeks[wk].runs++
      const hr = parseInt(a['Avg HR'])
      if (hr > 0) { weeks[wk].hrTotal += hr; weeks[wk].hrCount++ }
    }
  }

  const sorted = Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).reverse()
  if (sorted.length < 2) return null

  const maxKm = Math.max(...sorted.map(([, v]) => v.km), 1)
  const BAR_W = 20

  return (
    <div className="term-box">
      <div className="term-box-title">
        <span>WEEKLY VOLUME</span>
        <span className="dim">// last {sorted.length} weeks</span>
      </div>
      <div className="term-box-body" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        {sorted.map(([wk, v]) => {
          const filled = Math.round((v.km / maxKm) * BAR_W)
          const isCurrentWeek = wk === getMonday(new Date())
          const label = wk.slice(5) // MM-DD
          return (
            <div key={wk} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dim" style={{ width: '48px', fontSize: '11px' }}>{label}</span>
              <span style={{ color: '#333' }}>[</span>
              <span style={{ color: isCurrentWeek ? 'var(--amber)' : '#888' }}>
                {'█'.repeat(filled)}
              </span>
              <span style={{ color: '#1e1e1e' }}>{'░'.repeat(BAR_W - filled)}</span>
              <span style={{ color: '#333' }}>]</span>
              <span className={isCurrentWeek ? 'amber' : ''} style={{ width: '52px' }}>
                {v.km.toFixed(1)} km
              </span>
              <span className="dim" style={{ fontSize: '11px' }}>
                {v.runs} run{v.runs !== 1 ? 's' : ''}
                {v.hrCount > 0 ? ` · ${Math.round(v.hrTotal / v.hrCount)} bpm avg` : ''}
                {isCurrentWeek ? ' ← now' : ''}
              </span>
            </div>
          )
        })}
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

  const onboardChecked = useRef(false)

  function load() {
    setLoading(true)
    fetch('/api/dashboard', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    // Redirect to onboarding if setup is incomplete (first load only)
    if (!onboardChecked.current) {
      onboardChecked.current = true
      fetch('/api/onboard-status', { headers: getAuthHeader() })
        .then(r => r.json())
        .then(s => { if (!s.hasApiKey || s.isNewUser) navigate('/onboard', { replace: true }) })
        .catch(() => {})
    }
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

  const { isNewUser, profile, goal, phase, currentWeek, zones, activities, prescription, coachNotes, hasGarminTokens, garminTokenDaysOld } = data

  return (
    <div>
      {/* Garmin token expiry warning */}
      {hasGarminTokens && garminTokenDaysOld >= 25 && (
        <div style={{ background: '#1a0f00', border: '1px solid var(--amber)', padding: '8px 12px', marginBottom: '12px', fontSize: '13px' }}>
          <span className="amber">⚠ GARMIN TOKENS EXPIRING SOON</span>
          <span style={{ color: '#aaa', marginLeft: '8px' }}>
            Saved {garminTokenDaysOld} days ago — tokens last ~30 days.
            Re-run <code style={{ color: '#ccc' }}>python3 browser_auth.py</code> and update in{' '}
            <span className="amber">[SETTINGS]</span>.
          </span>
        </div>
      )}
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

      {/* Weekly volume chart */}
      {activities.length >= 2 && <WeeklySummary activities={activities} />}

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
