import { useEffect, useState, Fragment } from 'react'

function AsciiBar({ value, max, width = 20, char = '█', empty = '░' }) {
  const filled = Math.round((value / max) * width)
  return (
    <span>
      <span className="zone-bar-fill">{char.repeat(Math.max(0, filled))}</span>
      <span className="zone-bar-empty">{empty.repeat(Math.max(0, width - filled))}</span>
      <span className="amber"> {String(value).padStart(2, '\u00a0')}/{max}</span>
    </span>
  )
}

function PhaseProgress({ phase, weekCurrent, weekTotal }) {
  const pct = Math.round((weekCurrent / weekTotal) * 100)
  const filled = Math.round((weekCurrent / weekTotal) * 30)
  return (
    <div className="progress-bar">
      <span className="amber">PHASE {phase}</span>
      <span className="progress-track">
        {'['}
        <span className="progress-fill">{'='.repeat(filled)}</span>
        {' '.repeat(30 - filled)}
        {']'}
      </span>
      <span className="dim">WK {weekCurrent}/{weekTotal} ({pct}%)</span>
    </div>
  )
}

function ZoneTable({ zones }) {
  return (
    <table className="term-table">
      <thead>
        <tr>
          <th>ZONE</th><th>HR (BPM)</th><th>EST PACE</th><th>USE</th>
        </tr>
      </thead>
      <tbody>
        {zones.map((z, i) => (
          <tr key={i}>
            <td className="amber">{z.name}</td>
            <td>{z.hr}</td>
            <td>{z.pace}</td>
            <td className="dim">{z.use}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ActivityRow({ run, expanded, onToggle }) {
  const hrClass = run.avgHr > 155 ? 'red' : run.avgHr > 142 ? 'status-warn' : 'status-ok'

  function handleToggle(e) {
    const scrollY = window.scrollY
    onToggle(e)
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }))
  }

  return (
    <Fragment>
      <tr className={`clickable ${expanded ? 'expanded' : ''}`} onClick={handleToggle} title="Click to expand">
        <td className="dim">{run.date}</td>
        <td>{expanded ? '▼ ' : '▶ '}{run.type}</td>
        <td>{run.distance}</td>
        <td>{run.avgPace}</td>
        <td className={hrClass}>{run.avgHr}</td>
        <td>{run.maxHr}</td>
        <td className="dim">{run.notes}</td>
      </tr>
      {expanded && run.splits && (
        <tr>
          <td colSpan={7} style={{padding:0}}>
            <div className="activity-detail">
              <div style={{marginBottom:'8px'}} className="amber">{run.splitLabel || 'KM'} SPLITS ({run.splits.length})</div>
              <table className="term-table" style={{fontSize:'11px', marginBottom:'10px'}}>
                <thead>
                  <tr>
                    <th>{run.splitLabel || 'KM'}</th>
                    <th>PACE</th><th>AVG HR</th><th>CADENCE</th><th>ZONE</th>
                    {run.splits[0]?.note && <th>TYPE</th>}
                  </tr>
                </thead>
                <tbody>
                  {run.splits.map((s, i) => {
                    const zone = s.hr < 130 ? 'Z1' : s.hr <= 142 ? 'Z2' : s.hr <= 155 ? 'Z3' : s.hr <= 167 ? 'Z4' : 'Z5'
                    const zoneClass = zone === 'Z2' || zone === 'Z1' ? '' : zone === 'Z3' ? 'status-warn' : 'red'
                    const isWalk = s.note === 'walk'
                    return (
                      <tr key={i} style={isWalk ? {opacity: 0.5} : {}}>
                        <td className="amber">{i + 1}</td>
                        <td>{s.pace}</td>
                        <td className={zoneClass}>{s.hr}</td>
                        <td>{s.cadence || '—'}</td>
                        <td className={zoneClass}>{zone}</td>
                        {run.splits[0]?.note && <td className="dim">{s.note || '—'}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {run.coachNote && (
                <div style={{fontSize:'11px', borderTop:'1px solid #222', paddingTop:'8px'}} className="dim">
                  COACH: {run.coachNote}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

const ZONES = [
  { name: 'Z1 RECOVERY', hr: '<130',    pace: '7:30+/km',    use: 'warm-up/cool-down' },
  { name: 'Z2 EASY',     hr: '130–142', pace: '6:45–7:15/km', use: 'ALL phase 1 runs' },
  { name: 'Z3 TEMPO',    hr: '143–155', pace: '6:00–6:20/km', use: 'phase 2+ only' },
  { name: 'Z4 THRESHOLD',hr: '156–167', pace: '5:30–5:50/km', use: 'phase 3 only' },
  { name: 'Z5 VO2MAX',   hr: '168+',    pace: '<5:30/km',     use: 'not prescribed' },
]

const RECENT_RUNS = [
  {
    date: '2026-03-29', type: 'Continuous', distance: '5.01km', avgPace: '6:16/km', avgHr: 152, maxHr: 169,
    notes: 'HR drift — went out too hard',
    coachNote: '3 of 5 km in Z3-Z4. Started 6:34/HR 131, drifted to 5:58/HR 166. Classic warm-up-and-speed-up. 28% volume jump from previous run.',
    splits: [
      { pace: '6:34/km', hr: 131, maxHr: 142, cadence: 158 },
      { pace: '6:18/km', hr: 146, maxHr: 155, cadence: 160 },
      { pace: '6:10/km', hr: 155, maxHr: 162, cadence: 162 },
      { pace: '6:04/km', hr: 161, maxHr: 168, cadence: 163 },
      { pace: '5:58/km', hr: 166, maxHr: 169, cadence: 165 },
    ]
  },
  {
    date: '2026-03-24', type: 'Easy', distance: '3.93km', avgPace: '6:41/km', avgHr: 142, maxHr: 160,
    notes: 'Best run. Correct instinct.',
    coachNote: 'Km 1 at 6:54/HR 124 — correct start. HR stayed most controlled. Slowed on km 4 as HR rose — right instinct. Only run to start in Z2.',
    splits: [
      { pace: '6:54/km', hr: 124, maxHr: 131, cadence: 155 },
      { pace: '6:38/km', hr: 140, maxHr: 148, cadence: 159 },
      { pace: '6:32/km', hr: 146, maxHr: 153, cadence: 160 },
      { pace: '6:42/km', hr: 156, maxHr: 160, cadence: 158 },
    ]
  },
  {
    date: '2026-03-22', type: '20x1+1 intervals', distance: '6.14km', avgPace: '6:31/km', avgHr: 157, maxHr: 179,
    notes: 'Intervals too fast',
    coachNote: 'Run intervals at 4:23–4:57/km — far too fast. HR climbed from 109 to 179. Walking recovery HR never dropped below 155 after rep 10. Connective tissue at risk.',
    splitLabel: 'REP',
    splits: [
      { pace: '4:57/km', hr: 118, cadence: 162, note: 'run' },
      { pace: '8:40/km', hr: 130, cadence: 128, note: 'walk' },
      { pace: '4:48/km', hr: 142, cadence: 164, note: 'run' },
      { pace: '8:20/km', hr: 148, cadence: 130, note: 'walk' },
      { pace: '4:44/km', hr: 152, cadence: 165, note: 'run' },
      { pace: '8:10/km', hr: 155, cadence: 129, note: 'walk' },
      { pace: '4:40/km', hr: 156, cadence: 166, note: 'run' },
      { pace: '8:05/km', hr: 158, cadence: 130, note: 'walk' },
      { pace: '4:38/km', hr: 160, cadence: 167, note: 'run' },
      { pace: '8:00/km', hr: 161, cadence: 129, note: 'walk' },
      { pace: '4:35/km', hr: 163, cadence: 168, note: 'run' },
      { pace: '7:55/km', hr: 163, cadence: 129, note: 'walk' },
      { pace: '4:33/km', hr: 165, cadence: 168, note: 'run' },
      { pace: '7:52/km', hr: 165, cadence: 128, note: 'walk' },
      { pace: '4:30/km', hr: 167, cadence: 169, note: 'run' },
      { pace: '7:50/km', hr: 167, cadence: 128, note: 'walk' },
      { pace: '4:28/km', hr: 169, cadence: 169, note: 'run' },
      { pace: '7:48/km', hr: 168, cadence: 129, note: 'walk' },
      { pace: '4:27/km', hr: 171, cadence: 170, note: 'run' },
      { pace: '7:46/km', hr: 170, cadence: 129, note: 'walk' },
      { pace: '4:25/km', hr: 172, cadence: 170, note: 'run' },
      { pace: '7:45/km', hr: 171, cadence: 128, note: 'walk' },
      { pace: '4:24/km', hr: 173, cadence: 170, note: 'run' },
      { pace: '7:44/km', hr: 172, cadence: 128, note: 'walk' },
      { pace: '4:24/km', hr: 174, cadence: 171, note: 'run' },
      { pace: '7:44/km', hr: 173, cadence: 128, note: 'walk' },
      { pace: '4:23/km', hr: 175, cadence: 171, note: 'run' },
      { pace: '7:43/km', hr: 174, cadence: 128, note: 'walk' },
      { pace: '4:23/km', hr: 176, cadence: 171, note: 'run' },
      { pace: '7:42/km', hr: 175, cadence: 129, note: 'walk' },
      { pace: '4:23/km', hr: 177, cadence: 171, note: 'run' },
      { pace: '7:41/km', hr: 176, cadence: 129, note: 'walk' },
      { pace: '4:23/km', hr: 178, cadence: 172, note: 'run' },
      { pace: '7:40/km', hr: 177, cadence: 129, note: 'walk' },
      { pace: '4:23/km', hr: 179, cadence: 172, note: 'run' },
      { pace: '7:40/km', hr: 178, cadence: 128, note: 'walk' },
      { pace: '4:23/km', hr: 179, cadence: 172, note: 'run' },
      { pace: '7:40/km', hr: 177, cadence: 128, note: 'walk' },
      { pace: '4:23/km', hr: 179, cadence: 171, note: 'run' },
      { pace: '7:42/km', hr: 176, cadence: 128, note: 'walk' },
    ]
  },
]

export default function Dashboard() {
  const [log, setLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedRun, setExpandedRun] = useState(null)

  useEffect(() => {
    fetch('/api/training-log')
      .then(r => r.json())
      .then(d => { setLog(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

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
            <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
              <div><span className="amber">ATHLETE....</span> Lucas Martinelli</div>
              <div><span className="amber">AGE........</span> 42 | 80kg | 178cm</div>
              <div><span className="amber">LOCATION...</span> Ipanema, Rio de Janeiro</div>
              <div><span className="amber">PREV PEAK..</span> HM 1:55:22 (May 2023)</div>
              <div><span className="amber">MAX HR.....</span> 179 bpm (observed)</div>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
              <div><span className="amber">GOAL.......</span> 12km @ 6:00/km</div>
              <div><span className="amber">TARGET DATE</span> June 15, 2026</div>
              <div><span className="amber">PHASE......</span> <span className="status-ok">1 — REBUILD</span></div>
              <div><span className="amber">RUNS/WEEK..</span> 2</div>
              <div><span className="amber">KNEE......</span> <span className="status-ok">OK (yoga only)</span></div>
            </div>
          </div>
          <div style={{marginTop: '12px'}}>
            <PhaseProgress phase="1" weekCurrent={2} weekTotal={4} />
            <div className="dim" style={{fontSize:'11px', marginTop:'4px'}}>
              PHASE 1: Z2 only, connective tissue load (weeks 1–4, ending Apr 18)
            </div>
          </div>
        </div>
      </div>

      {/* Next prescribed session */}
      <div className="term-box">
        <div className="term-box-title">
          <span>NEXT PRESCRIBED SESSION</span>
          <span className="status-ok">● READY</span>
        </div>
        <div className="term-box-body">
          <div className="prompt">Thu Apr 2, 2026 — EASY Z2 RUN, 4.5km</div>
          <div style={{marginTop:'8px', paddingLeft:'16px'}}>
            <div>• Walk 3–5 min warm-up</div>
            <div>• Run 6:45–7:00/km, HR target <span className="amber">130–142 bpm</span></div>
            <div>• If HR &gt; 142: walk 60s, then resume</div>
            <div>• Walk 3–5 min cool-down</div>
            <div>• <span className="amber">HR GOVERNS. Do not speed up when warmed up.</span></div>
          </div>
          <div style={{marginTop:'10px', borderTop:'1px solid #222', paddingTop:'8px', fontSize:'12px', color:'#555'}}>
            SCIENCE: Z2 stimulates mitochondrial biogenesis in slow-twitch fibres (Holloszy, 1967).
            At 42, connective tissue adapts 3–5x slower than cardio fitness — staying in Z2 protects
            tendons and joints while the aerobic base builds.
          </div>
          <div style={{marginTop:'10px', display:'flex', gap:'8px'}}>
            <button className="term-btn amber" onClick={() => pushToGarmin()}>
              [→ PUSH TO GARMIN WATCH]
            </button>
            <span className="dim" style={{alignSelf:'center', fontSize:'11px'}}>
              workout already uploaded: Z2 Easy 4.5km [2026-04-02]
            </span>
          </div>
        </div>
      </div>

      {/* Training zones */}
      <div className="term-box">
        <div className="term-box-title">TRAINING ZONES // CALIBRATED MAR 2026</div>
        <div className="term-box-body">
          <ZoneTable zones={ZONES} />
        </div>
      </div>

      {/* Recent activity log */}
      <div className="term-box">
        <div className="term-box-title">
          <span>ACTIVITY LOG</span>
          <span className="dim">// last 3 runs</span>
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
              {[...RECENT_RUNS].reverse().map((r, i) => (
                <ActivityRow
                  key={r.date}
                  run={r}
                  expanded={expandedRun === r.date}
                  onToggle={() => setExpandedRun(expandedRun === r.date ? null : r.date)}
                />
              ))}
            </tbody>
          </table>
          <div style={{marginTop:'8px', fontSize:'11px'}} className="dim">
            ▶ click a row to expand km splits // COACH: all 3 runs in Z3-Z4. Phase 1 = Z2 only.
          </div>
        </div>
      </div>

      {/* HR zone distribution — ASCII bar chart */}
      <div className="term-box">
        <div className="term-box-title">HR ZONE DISTRIBUTION // LAST 3 RUNS</div>
        <div className="term-box-body">
          <div style={{fontFamily:'monospace', fontSize:'13px'}}>
            {[
              { label: 'Z1 <130  ', value: 3,  pct: '10%', cls: 'dim' },
              { label: 'Z2 130-142', value: 8,  pct: '27%', cls: 'status-warn' },
              { label: 'Z3 143-155', value: 10, pct: '33%', cls: 'status-warn' },
              { label: 'Z4 156-167', value: 7,  pct: '23%', cls: 'red' },
              { label: 'Z5 168+   ', value: 2,  pct: ' 7%', cls: 'red' },
            ].map(({ label, value, pct, cls }) => (
              <div key={label} style={{display:'flex', alignItems:'center', gap:'6px', marginBottom:'2px'}}>
                <span className="dim" style={{width:'90px', display:'inline-block'}}>{label}</span>
                <AsciiBar value={value} max={30} width={25} />
                <span className={cls} style={{width:'32px', textAlign:'right'}}>{pct}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:'8px', fontSize:'11px'}} className="status-warn">
            ⚠ TARGET: 80% Z2. CURRENT: 27% Z2. Pace is too high across all sessions.
          </div>
        </div>
      </div>
    </div>
  )
}

function pushToGarmin() {
  alert('Workout already uploaded to Garmin Connect.\nOpen Garmin Connect app and sync via Bluetooth.')
}
