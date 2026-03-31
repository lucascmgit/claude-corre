import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Upload from './pages/Upload.jsx'
import Coach from './pages/Coach.jsx'
import TrainingLog from './pages/TrainingLog.jsx'
import About from './pages/About.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <div className="logo-header">
          <div className="logo-title">CLAUDE CORRE</div>
          <div className="header-tagline">// AI RUNNING COACH TERMINAL v1.0</div>
        </div>
        <div className="sep">{'─'.repeat(72)}</div>

        <nav className="nav">
          <NavLink to="/"       className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')} end>[DASHBOARD]</NavLink>
          <NavLink to="/upload" className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[UPLOAD RUN]</NavLink>
          <NavLink to="/coach"  className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[ASK COACH]</NavLink>
          <NavLink to="/log"    className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[TRAINING LOG]</NavLink>
          <NavLink to="/about"  className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>[ABOUT]</NavLink>
        </nav>

        <Routes>
          <Route path="/"       element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/coach"  element={<Coach />} />
          <Route path="/log"    element={<TrainingLog />} />
          <Route path="/about"  element={<About />} />
        </Routes>

        <footer className="footer">
          CLAUDE CORRE v1.0 // MADE BY LUCAS MARTINELLI // POWERED BY ANTHROPIC CLAUDE + GARMIN API // {new Date().getFullYear()}
        </footer>
      </div>
    </BrowserRouter>
  )
}
