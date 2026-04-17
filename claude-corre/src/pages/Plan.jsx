import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../context/AuthContext.jsx'

function PhaseTimeline({ phases, currentPhase }) {
  if (!phases || phases.length === 0) return null
  const totalWeeks = phases.reduce((sum, p) => sum + (p.duration_weeks || 0), 0)

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', gap: '2px', height: '24px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        {phases.map((p, i) => {
          const width = totalWeeks > 0 ? (p.duration_weeks / totalWeeks) * 100 : 100 / phases.length
          const isActive = currentPhase?.id === p.id
          const isCompleted = p.status === 'completed'
          const bg = isActive ? 'var(--amber)' : isCompleted ? '#2a4a2a' : '#1a1a1a'
          const color = isActive ? '#000' : isCompleted ? '#4a8a4a' : '#444'
          const border = isActive ? '1px solid var(--amber)' : '1px solid #333'

          return (
            <div
              key={p.id}
              style={{
                width: `${width}%`,
                background: bg,
                color,
                border,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                padding: '0 4px',
              }}
              title={`${p.name} — ${p.duration_weeks}wk — ${p.status}`}
            >
              {p.name.length > 12 ? p.name.slice(0, 10) + '..' : p.name}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '2px' }}>
        <span className="dim">WK 1</span>
        <span className="dim">WK {totalWeeks}</span>
      </div>
    </div>
  )
}

function PhaseCard({ phase, isCurrent }) {
  const [expanded, setExpanded] = useState(isCurrent)

  let exitCriteria = null
  if (phase.exit_criteria) {
    try { exitCriteria = JSON.parse(phase.exit_criteria) } catch { exitCriteria = phase.exit_criteria }
  }
  let weeklyTemplate = null
  if (phase.weekly_template) {
    try { weeklyTemplate = JSON.parse(phase.weekly_template) } catch { weeklyTemplate = phase.weekly_template }
  }

  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        className="clickable"
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}
      >
        <span style={{ width: '16px' }}>{expanded ? '▼' : '▶'}</span>
        <span className={isCurrent ? 'amber' : phase.status === 'completed' ? 'status-ok' : 'dim'}>
          {phase.name}
        </span>
        <span className="dim" style={{ fontSize: '11px' }}>{phase.duration_weeks}wk</span>
        <span className={
          phase.status === 'active' ? 'amber' :
          phase.status === 'completed' ? 'status-ok' : 'dim'
        } style={{ fontSize: '11px' }}>
          [{phase.status.toUpperCase()}]
        </span>
      </div>

      {expanded && (
        <div style={{ paddingLeft: '24px', fontSize: '13px', marginBottom: '8px' }}>
          {phase.objective && (
            <div style={{ marginBottom: '6px' }}>
              <span className="amber">OBJECTIVE: </span>
              <span>{phase.objective}</span>
            </div>
          )}

          {exitCriteria && (
            <div style={{ marginBottom: '6px' }}>
              <div className="amber" style={{ fontSize: '11px', marginBottom: '2px' }}>EXIT CRITERIA</div>
              {typeof exitCriteria === 'string'
                ? <div className="dim">{exitCriteria}</div>
                : <div className="dim">{JSON.stringify(exitCriteria, null, 2)}</div>
              }
            </div>
          )}

          {weeklyTemplate && (
            <div style={{ marginBottom: '6px' }}>
              <div className="amber" style={{ fontSize: '11px', marginBottom: '2px' }}>WEEKLY TEMPLATE</div>
              {typeof weeklyTemplate === 'string'
                ? <div className="dim">{weeklyTemplate}</div>
                : typeof weeklyTemplate === 'object' && (
                  <div className="dim">
                    {Object.entries(weeklyTemplate).map(([k, v]) => (
                      <div key={k}>{k}: {typeof v === 'string' ? v : JSON.stringify(v)}</div>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          {phase.started_at && (
            <div className="dim" style={{ fontSize: '11px' }}>
              Started: {new Date(phase.started_at).toISOString().split('T')[0]}
              {phase.completed_at && ` — Completed: ${new Date(phase.completed_at).toISOString().split('T')[0]}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Plan() {
  const { getAuthHeader } = useAuth()
  const [planData, setPlanData] = useState(null)
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)

  function load() {
    const headers = getAuthHeader()
    Promise.all([
      fetch('/api/plan', { headers }).then(r => r.ok ? r.json() : null),
      fetch('/api/prescriptions?limit=10', { headers }).then(r => r.ok ? r.json() : { prescriptions: [] }).catch(() => ({ prescriptions: [] })),
    ]).then(([plan, prescs]) => {
      setPlanData(plan)
      setPrescriptions(prescs.prescriptions || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
    window.addEventListener('log-updated', load)
    return () => window.removeEventListener('log-updated', load)
  }, [])

  if (loading) return <div className="dim" style={{ padding: '24px' }}>LOADING...</div>

  if (!planData) {
    return (
      <div>
        <div className="term-box">
          <div className="term-box-title">TRAINING PLAN</div>
          <div className="term-box-body">
            <div style={{ fontSize: '14px', marginBottom: '12px' }}>
              No active training plan. <Link to="/goals" className="amber">Set a goal</Link> first, then ask the coach to create your plan.
            </div>
          </div>
        </div>
        <div style={{ marginTop: '8px' }}>
          <Link to="/goals" className="term-btn amber" style={{ textDecoration: 'none' }}>[SET GOAL]</Link>
        </div>
      </div>
    )
  }

  const { plan, phases = [], currentPhase } = planData
  if (!plan) return <div className="dim" style={{ padding: '24px' }}>No plan data available.</div>
  const planJson = useMemo(() => { try { return plan.plan_json ? JSON.parse(plan.plan_json) : null } catch { return null } }, [plan.plan_json])
  const adjustments = planJson?.adjustment_history || planJson?.adjustments || []

  const totalWeeks = plan.total_weeks || 0
  const startDate = plan.start_date ? new Date(plan.start_date) : new Date()
  const weeksElapsed = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / (7 * 86400000)))

  return (
    <div>
      {/* Plan overview */}
      <div className="term-box">
        <div className="term-box-title">
          <span>TRAINING PLAN</span>
          <span className="status-ok">ACTIVE</span>
        </div>
        <div className="term-box-body">
          <div style={{ fontSize: '15px', marginBottom: '8px' }}>{plan.name}</div>
          <div style={{ display: 'flex', gap: '20px', fontSize: '13px', marginBottom: '12px' }}>
            <div><span className="amber">START......</span> {plan.start_date}</div>
            <div><span className="amber">WEEKS......</span> {weeksElapsed}/{totalWeeks}</div>
            <div><span className="amber">PHASES.....</span> {phases.length}</div>
            {currentPhase && <div><span className="amber">CURRENT....</span> {currentPhase.name}</div>}
          </div>

          <PhaseTimeline phases={phases} currentPhase={currentPhase} />

          {plan.rationale && (
            <div style={{ marginTop: '8px', fontSize: '13px' }}>
              <div className="amber" style={{ fontSize: '11px', marginBottom: '2px' }}>PLAN RATIONALE</div>
              <div className="dim coach-output" style={{ lineHeight: '1.5' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.rationale}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phases detail */}
      <div className="term-box">
        <div className="term-box-title">
          <span>PHASES</span>
          <span className="dim">// click to expand</span>
        </div>
        <div className="term-box-body">
          {phases.map(p => (
            <PhaseCard key={p.id} phase={p} isCurrent={currentPhase?.id === p.id} />
          ))}
        </div>
      </div>

      {/* Upcoming prescriptions */}
      {prescriptions.length > 0 && (
        <div className="term-box">
          <div className="term-box-title">
            <span>PRESCRIPTIONS</span>
            <span className="dim">// recent and upcoming</span>
          </div>
          <div className="term-box-body">
            <table className="term-table">
              <thead>
                <tr><th>DATE</th><th>TYPE</th><th>DESCRIPTION</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                {prescriptions.map(p => (
                  <tr key={p.id}>
                    <td className="dim nowrap">{p.prescribed_date}</td>
                    <td className="amber nowrap">{(p.session_type || '').replace('_', ' ')}</td>
                    <td style={{ fontSize: '12px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description?.slice(0, 80)}{p.description?.length > 80 ? '...' : ''}
                    </td>
                    <td className={p.status === 'pending' ? 'amber' : p.status === 'completed' ? 'status-ok' : 'dim'} style={{ fontSize: '11px' }}>
                      {p.status.toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plan adjustments */}
      {adjustments.length > 0 && (
        <div className="term-box">
          <div className="term-box-title">
            <span>PLAN ADJUSTMENTS</span>
            <span className="dim">// {adjustments.length} changes</span>
          </div>
          <div className="term-box-body" style={{ fontSize: '13px' }}>
            {adjustments.map((a, i) => (
              <div key={i} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: i < adjustments.length - 1 ? '1px solid #222' : 'none' }}>
                <div>
                  <span className="amber">{(a.type || a.adjustment_type || '').replace('_', ' ').toUpperCase()}</span>
                  <span className="dim" style={{ marginLeft: '8px', fontSize: '11px' }}>{a.date?.split('T')[0]}</span>
                </div>
                {a.rationale && <div className="dim" style={{ marginTop: '2px' }}>{a.rationale}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
