import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'

const PrescriptionContext = createContext(null)

export function PrescriptionProvider({ children }) {
  const { user, getAuthHeader } = useAuth()
  const [prescription, setPrescription] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!user) return
    setLoading(true)
    fetch('/api/prescriptions?status=pending&limit=1', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : { prescriptions: [] })
      .then(d => {
        setPrescription(d.prescriptions?.[0] || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user])

  // Initial load
  useEffect(() => { refresh() }, [refresh])

  // Refresh when any tab dispatches log-updated
  useEffect(() => {
    window.addEventListener('log-updated', refresh)
    return () => window.removeEventListener('log-updated', refresh)
  }, [refresh])

  // Refresh when tab becomes visible (user switches back)
  useEffect(() => {
    function onVisible() { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  return (
    <PrescriptionContext.Provider value={{ prescription, loading, refresh }}>
      {children}
    </PrescriptionContext.Provider>
  )
}

export function usePrescription() {
  const ctx = useContext(PrescriptionContext)
  if (!ctx) throw new Error('usePrescription must be inside PrescriptionProvider')
  return ctx
}
