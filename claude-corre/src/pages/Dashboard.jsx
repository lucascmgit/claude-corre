import { useEffect, useState, Fragment, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'
import { usePrescription } from '../context/PrescriptionContext.jsx'
import { GarminAuthCmd, RenderWithCopyCmd } from '../components/CopyCmd.jsx'

const SPARK_CHARS = '▁▂▃▄▅▆▇█'
function sparkline(values) {
  const nums = values.filter(v => v != null)
  if (nums.length < 2) return ''
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1
  return values.map(v => {
    if (v == null) return ' '
    const idx = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1))
    return SPARK_CHARS[idx]
  }).join('')
}

function formatPace(totalSeconds) {
  if (!totalSeconds) return '—'
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function TrendCharts({ trends }) {
  if (!trends) return null
  const { volume, avgHr, avgPace } = trends
  if (!volume || volume.length < 2) return null

  const charts = [
    {
      label: 'WEEKLY VOLUME',
      data: volume,
      valueKey: 'km',
      format: v => v != null ? `${v.toFixed(1)} km` : '—',
      color: 'amber',
    },
    {
      label: 'AVG HEART RATE',
      data: avgHr,
      valueKey: 'hr',
      format: v => v != null ? `${v} bpm` : '—',
      color: '',
    },
    {
      label: 'AVG PACE',
      data: avgPace,
      valueKey: 'paceS',
      format: v => v != null ? `${formatPace(v)}/km` : '—',
      color: '',
      invert: true, // lower is better
    },
  ]

  return (
    <div className="term-box">
      <div className="term-box-title">
        <span>TRENDS</span>
        <span className="dim">// last {volume.length} weeks</span>
      </div>
      <div className="term-box-body" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        {charts.map(({ label, data, valueKey, format, color, invert }) => {
          const values = data.map(d => d[valueKey])
          const displayValues = invert ? values.map(v => v != null ? -v : null) : values
          const latest = values[values.length - 1]
          const prev = values.length >= 2 ? values[values.length - 2] : null
          let arrow = ''
          if (latest != null && prev != null) {
            const diff = latest - prev
            const better = invert ? diff < 0 : diff > 0
            arrow = diff === 0 ? '→' : better ? '↑' : '↓'
          }
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="dim" style={{ width: '120px', fontSize: '11px' }}>{label}</span>
              <span className={color} style={{ letterSpacing: '1px' }}>{sparkline(displayValues)}</span>
              <span className={color || 'dim'} style={{ width: '80px' }}>{format(latest)}</span>
              <span className={arrow === '↑' ? 'status-ok' : arrow === '↓' ? 'red' : 'dim'} style={{ fontSize: '11px' }}>{arrow}</span>
            </div>
          )
        })}
      </div>
    </div>
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
        <td className="nowrap hide-mobile">{act['Max HR'] || '—'}</td>
        <td className="dim hide-mobile" style={{ fontSize: '13px' }}>{act.Notes || '—'}</td>
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

function TrainingLoadGauge({ load }) {
  if (!load || load.acwr === null) return null
  const acwr = load.acwr
  const label = load.risk_level === 'optimal' ? 'OPTIMAL'
    : load.risk_level === 'elevated' ? 'ELEVATED'
    : load.risk_level === 'high' ? 'HIGH RISK'
    : load.risk_level === 'detraining' ? 'DETRAINING' : 'UNKNOWN'
  const color = load.risk_level === 'optimal' ? 'status-ok'
    : load.risk_level === 'elevated' ? 'status-warn'
    : load.risk_level === 'high' ? 'red'
    : load.risk_level === 'detraining' ? 'status-warn' : 'dim'

  // ASCII gauge: [====|=====|======] with marker
  const min = 0.4, max = 2.0
  const pos = Math.min(Math.max((acwr - min) / (max - min), 0), 1)
  const barWidth = 30
  const markerPos = Math.round(pos * barWidth)
  const bar = '='.repeat(markerPos) + '|' + '='.repeat(barWidth - markerPos)

  return (
    <div className="term-box">
      <div className="term-box-title">
        <span>TRAINING LOAD</span>
        <span className={color}>{label}</span>
      </div>
      <div className="term-box-body" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className="amber">ACWR</span>
          <span style={{ color: '#333' }}>[</span>
          <span className={color}>{bar}</span>
          <span style={{ color: '#333' }}>]</span>
          <span className={color}>{acwr.toFixed(2)}</span>
        </div>
        <div style={{ marginTop: '4px', display: 'flex', gap: '20px' }}>
          <span className="dim">Acute (7d): {load.acute_load} · {load.acute_sessions} sessions</span>
          <span className="dim">Chronic (28d avg): {load.chronic_load} · {load.chronic_sessions} sessions</span>
        </div>
        <div style={{ marginTop: '2px', fontSize: '11px', color: '#444' }}>
          Safe: 0.8-1.3 · Elevated: 1.3-1.5 · High risk: &gt;1.5 · Detraining: &lt;0.8
        </div>
      </div>
    </div>
  )
}

function LatestEvaluation({ evaluation }) {
  if (!evaluation) return null
  const sections = [
    { key: 'standalone_analysis', label: 'STANDALONE ANALYSIS' },
    { key: 'prescription_comparison', label: 'PRESCRIPTION COMPARISON' },
    { key: 'medium_term_trends', label: 'MEDIUM-TERM TRENDS' },
    { key: 'goal_progress', label: 'GOAL PROGRESS' },
    { key: 'coach_notes', label: 'COACH NOTES' },
  ]
  return (
    <div className="term-box">
      <div className="term-box-title">
        <span>LATEST EVALUATION</span>
        {evaluation.performance_rating && (
          <span className={evaluation.performance_rating === 'above_target' ? 'status-ok' : evaluation.performance_rating === 'on_target' ? 'amber' : 'red'}>
            {evaluation.performance_rating.replace('_', ' ').toUpperCase()}
          </span>
        )}
      </div>
      <div className="term-box-body" style={{ fontSize: '13px' }}>
        {evaluation.adherence_score != null && (
          <div style={{ marginBottom: '8px' }}>
            <span className="amber">ADHERENCE: </span>
            <span>{evaluation.adherence_score}/100</span>
          </div>
        )}
        {sections.map(({ key, label }) => evaluation[key] ? (
          <div key={key} style={{ marginBottom: '8px' }}>
            <div className="amber" style={{ fontSize: '11px', marginBottom: '2px' }}>{label}</div>
            <div className="dim" style={{ lineHeight: '1.5' }}>{evaluation[key]}</div>
          </div>
        ) : null)}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { getAuthHeader } = useAuth()
  const { prescription: pendingPrescription } = usePrescription()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedActivity, setExpandedActivity] = useState(null)
  const [garminStatus, setGarminStatus] = useState(null) // null | 'pushing' | 'ok' | 'error'
  const [garminMsg, setGarminMsg] = useState('')
  const [trainingLoad, setTrainingLoad] = useState(null)
  const [latestEval, setLatestEval] = useState(null)
  const [trends, setTrends] = useState(null)

  const onboardChecked = useRef(false)

  function load() {
    setLoading(true)
    const headers = getAuthHeader()
    Promise.all([
      fetch('/api/dashboard', { headers }).then(r => r.ok ? r.json() : null),
      fetch('/api/structured-activities?limit=1', { headers }).then(r => r.ok ? r.json() : { activities: [] }).catch(() => ({ activities: [] })),
    ]).then(([d, acts]) => {
      if (d) setData(d)
      if (acts.activities?.[0]?.id) {
        fetch(`/api/structured-activities/${acts.activities[0].id}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.evaluation) setLatestEval(d.evaluation) })
          .catch(() => {})
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    fetch('/api/training-load', { headers }).then(r => r.ok ? r.json() : null).then(d => { if (d) setTrainingLoad(d) }).catch(() => {})
    fetch('/api/trends', { headers }).then(r => r.ok ? r.json() : null).then(d => { if (d) setTrends(d) }).catch(() => {})
  }

  useEffect(() => {
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
        body: JSON.stringify({
          prescription: pendingPrescription?.description,
          prescription_id: pendingPrescription?.id,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
      setGarminStatus('ok')
      setGarminMsg(d.workoutName ? `"${d.workoutName}" pushed to Garmin.` : `Workout pushed. ID: ${d.workoutId}`)
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
          <span className="amber">GARMIN TOKENS EXPIRING SOON</span>
          <div style={{ color: '#aaa', marginTop: '4px' }}>
            Saved {garminTokenDaysOld} days ago. Run in Terminal:
          </div>
          <GarminAuthCmd style={{ marginTop: '6px' }} />
          <div className="dim" style={{ marginTop: '4px', fontSize: '11px' }}>Then paste the token in <span className="amber">[SETTINGS]</span>.</div>
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

      {/* Prescribed session — from shared PrescriptionContext */}
      {pendingPrescription && (
        <div className="term-box">
          <div className="term-box-title">
            <span>NEXT WORKOUT</span>
            <span className="status-ok">● {pendingPrescription.prescribed_date}</span>
          </div>
          <div className="term-box-body coach-output" style={{ fontSize: '14px' }}>
            <div style={{ marginBottom: '8px' }}>
              <span className="amber" style={{ textTransform: 'uppercase' }}>{(pendingPrescription.session_type || '').replace('_', ' ')}</span>
            </div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{pendingPrescription.description || ''}</ReactMarkdown>
            {pendingPrescription.rationale && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>
                <strong className="amber">Rationale:</strong> {pendingPrescription.rationale}
              </div>
            )}
            {hasGarminTokens && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button className="term-btn amber" onClick={pushToGarmin} disabled={garminStatus === 'pushing'}>
                  {garminStatus === 'pushing' ? '[PUSHING...]' : '[PUSH TO GARMIN]'}
                </button>
                {garminStatus === 'ok' && <span className="status-ok" style={{ fontSize: '13px' }}>✓ {garminMsg}</span>}
                {garminStatus === 'error' && <span className="red" style={{ fontSize: '13px' }}><RenderWithCopyCmd text={garminMsg} /></span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Training load gauge */}
      <TrainingLoadGauge load={trainingLoad} />

      {/* Latest workout evaluation */}
      <LatestEvaluation evaluation={latestEval} />

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
                  <th>AVG PACE</th><th>AVG HR</th><th className="hide-mobile">MAX HR</th><th className="hide-mobile">NOTES</th>
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

      {/* Trend sparklines (from structured data) */}
      <TrendCharts trends={trends} />

      {/* Weekly volume chart (legacy, from markdown) */}
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
