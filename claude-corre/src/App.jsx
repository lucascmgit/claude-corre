import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Upload from './pages/Upload.jsx'
import Coach from './pages/Coach.jsx'
import TrainingLog from './pages/TrainingLog.jsx'
import About from './pages/About.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="dim" style={{ padding: '32px' }}>AUTHENTICATING...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppShell() {
  const { user, logout } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <div className="app">
      <div className="logo-header">
        <div className="logo-title">CLAUDE CORRE</div>
        <div className="header-tagline">// AI RUNNING COACH TERMINAL v1.0</div>
      </div>
      <div className="sep">{'─'.repeat(72)}</div>

      <nav className="nav">
        <NavLink to="/"         className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')} end>[DASHBOARD]</NavLink>
        <NavLink to="/upload"   className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[UPLOAD RUN]</NavLink>
        <NavLink to="/coach"    className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[ASK COACH]</NavLink>
        <NavLink to="/log"      className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[TRAINING LOG]</NavLink>
        <NavLink to="/settings" className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[SETTINGS]</NavLink>
        <NavLink to="/about"    className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[ABOUT]</NavLink>
      </nav>

      <Routes>
        <Route path="/"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/upload"   element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/coach"    element={<ProtectedRoute><Coach /></ProtectedRoute>} />
        <Route path="/log"      element={<ProtectedRoute><TrainingLog /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/about"    element={<ProtectedRoute><About /></ProtectedRoute>} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>

      <footer className="footer">
        <span>{user.email}</span>
        <span> // </span>
        <span>CLAUDE CORRE v1.0 // MADE BY LUCAS MARTINELLI // {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}
