import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Goals() {
  const { getAuthHeader } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Form state
  const [raceDistance, setRaceDistance] = useState('')
  const [customDistance, setCustomDistance] = useState('')
  const [targetTime, setTargetTime] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [description, setDescription] = useState('')

  function load() {
    fetch('/api/goals', { headers: getAuthHeader() })
      .then(r => r.json())
      .then(d => { setGoals(d.goals || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const activeGoal = goals.find(g => g.status === 'active')

  async function handleSubmit(e) {
    e.preventDefault()
    const dist = raceDistance === 'custom' ? customDistance : raceDistance
    if (!dist && !description) { setMsg('Set a distance or description.'); return }
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          race_distance: dist || null,
          target_time: targetTime || null,
          target_date: targetDate || null,
          description: description || `${dist}${targetTime ? ' in ' + targetTime : ''}${targetDate ? ' by ' + targetDate : ''}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error ${res.status}`)
      }
      setMsg('Goal set. The coach will create a training plan on your next interaction.')
      setRaceDistance(''); setCustomDistance(''); setTargetTime(''); setTargetDate(''); setDescription('')
      load()
      window.dispatchEvent(new CustomEvent('log-updated'))
    } catch (e) {
      setMsg(`Error: ${e.message}`)
    }
    setSaving(false)
  }

  if (loading) return <div className="dim" style={{ padding: '24px' }}>LOADING...</div>

  return (
    <div>
      {/* Current active goal */}
      {activeGoal && (
        <div className="term-box">
          <div className="term-box-title">
            <span>ACTIVE GOAL</span>
            <span className="status-ok">ACTIVE</span>
          </div>
          <div className="term-box-body">
            <div style={{ fontSize: '15px', marginBottom: '8px' }}>{activeGoal.description}</div>
            <div style={{ display: 'flex', gap: '20px', fontSize: '13px' }}>
              {activeGoal.race_distance && <div><span className="amber">DISTANCE...</span> {activeGoal.race_distance}</div>}
              {activeGoal.target_time && <div><span className="amber">TARGET.....</span> {activeGoal.target_time}</div>}
              {activeGoal.target_date && <div><span className="amber">DATE.......</span> {activeGoal.target_date}</div>}
            </div>
            {activeGoal.target_date && (
              <div style={{ marginTop: '8px', fontSize: '13px' }} className="dim">
                {Math.ceil((new Date(activeGoal.target_date) - new Date()) / 86400000)} days remaining
              </div>
            )}
          </div>
        </div>
      )}

      {/* Set new goal */}
      <div className="term-box">
        <div className="term-box-title">
          <span>{activeGoal ? 'CHANGE GOAL' : 'SET YOUR GOAL'}</span>
          {activeGoal && <span className="dim">// replaces current goal</span>}
        </div>
        <div className="term-box-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="amber" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>RACE DISTANCE</label>
                <select
                  className="term-input"
                  value={raceDistance}
                  onChange={e => setRaceDistance(e.target.value)}
                  style={{ width: '200px' }}
                >
                  <option value="">Select...</option>
                  <option value="5K">5K</option>
                  <option value="10K">10K</option>
                  <option value="Half Marathon">Half Marathon</option>
                  <option value="Marathon">Marathon</option>
                  <option value="custom">Custom</option>
                </select>
                {raceDistance === 'custom' && (
                  <input
                    className="term-input"
                    value={customDistance}
                    onChange={e => setCustomDistance(e.target.value)}
                    placeholder="e.g. 15K, ultra 50K"
                    style={{ marginLeft: '8px', width: '200px' }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div>
                  <label className="amber" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>TARGET TIME (optional)</label>
                  <input
                    className="term-input"
                    value={targetTime}
                    onChange={e => setTargetTime(e.target.value)}
                    placeholder="e.g. sub-50:00, 1:45:00"
                    style={{ width: '200px' }}
                  />
                </div>
                <div>
                  <label className="amber" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>TARGET DATE (optional)</label>
                  <input
                    className="term-input"
                    type="date"
                    value={targetDate}
                    onChange={e => setTargetDate(e.target.value)}
                    style={{ width: '200px' }}
                  />
                </div>
              </div>

              <div>
                <label className="amber" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>DESCRIPTION (optional)</label>
                <input
                  className="term-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Run my first 10K in under 55 minutes by October"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                <button className="term-btn amber" type="submit" disabled={saving}>
                  {saving ? '[SAVING...]' : '[SET GOAL]'}
                </button>
                {msg && <span className={msg.startsWith('Error') ? 'red' : 'status-ok'} style={{ fontSize: '13px' }}>{msg}</span>}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Goal history */}
      {goals.filter(g => g.status !== 'active').length > 0 && (
        <div className="term-box">
          <div className="term-box-title">
            <span>GOAL HISTORY</span>
            <span className="dim">// {goals.filter(g => g.status !== 'active').length} past goals</span>
          </div>
          <div className="term-box-body">
            <table className="term-table">
              <thead>
                <tr><th>GOAL</th><th>STATUS</th><th>SET ON</th></tr>
              </thead>
              <tbody>
                {goals.filter(g => g.status !== 'active').map(g => (
                  <tr key={g.id}>
                    <td>{g.description}</td>
                    <td className={g.status === 'completed' ? 'status-ok' : 'dim'}>{g.status.toUpperCase()}</td>
                    <td className="dim nowrap">{new Date(g.created_at).toISOString().split('T')[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
