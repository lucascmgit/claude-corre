export default function About() {
  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">ABOUT // CLAUDE CORRE v1.0</div>
        <div className="term-box-body">
          <div style={{ marginBottom: '16px' }}>
            <span className="amber">WHAT IS THIS?</span>
            <p style={{ marginTop: '6px', color: '#aaa', lineHeight: '1.7' }}>
              CLAUDE CORRE is an AI-powered running coaching terminal built on top of Anthropic's Claude.
              It analyzes your Garmin activity data, prescribes science-based training sessions, and pushes
              structured workouts directly to your Garmin watch. The coaching methodology follows
              established sports science principles: Daniels, Seiler's 80/20 rule, Galloway, and Hawley.
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span className="amber">HOW IT WAS BUILT</span>
            <p style={{ marginTop: '6px', color: '#aaa', lineHeight: '1.7' }}>
              Built using{' '}
              <span className="amber">Factory Droid</span> — an AI engineering agent.
              The entire stack (coaching logic, Garmin integration, web interface, and deployment)
              was designed and implemented iteratively through conversation. No pre-planned architecture.
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span className="amber">HOW IT WORKS</span>
            <p style={{ marginTop: '6px', color: '#aaa', lineHeight: '1.7' }}>
              Each user has their own account with isolated data. Your training log lives in the database.
              The coach reads your log on every request and writes back when you report activities or upload CSVs.
              Your Anthropic API key and Garmin tokens are stored encrypted — only used server-side, never exposed.
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span className="amber">GARMIN INTEGRATION</span>
            <p style={{ marginTop: '6px', color: '#aaa', lineHeight: '1.7' }}>
              Connects to Garmin Connect via OAuth. After uploading a run CSV, Claude analyzes
              your km splits, HR drift, cadence, and zone distribution — then generates a structured
              workout JSON and pushes it to your watch via the Garmin Connect API.
              Workout appears under Training → Workouts on the watch after Bluetooth sync.
            </p>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#555' }}>
              Note: Garmin blocked programmatic SSO logins in March 2026. Authentication uses
              a Playwright browser flow locally. Tokens are valid ~30 days.
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span className="amber">OPEN SOURCE</span>
            <p style={{ marginTop: '6px', color: '#aaa', lineHeight: '1.7' }}>
              The project is on GitHub:{' '}
              <a href="https://github.com/lucascmgit/claude-corre" style={{ color: 'var(--amber)' }}>
                github.com/lucascmgit/claude-corre
              </a>
              {'. '}
              Run <code>python3 onboard.py</code> to set up your own instance.
              No vendor lock-in — runs on any Node.js host.
            </p>
          </div>

          <div>
            <span className="amber">STACK</span>
            <div style={{ marginTop: '8px', fontSize: '13px' }}>
              <table className="term-table">
                <tbody>
                  <tr><td className="amber">Frontend</td><td>React + Vite</td></tr>
                  <tr><td className="amber">Backend</td><td>Express.js (Node.js)</td></tr>
                  <tr><td className="amber">Database</td><td>SQLite via better-sqlite3</td></tr>
                  <tr><td className="amber">Auth</td><td>bcrypt + JWT (no external provider)</td></tr>
                  <tr><td className="amber">AI Coach</td><td>Anthropic Claude (user's own API key)</td></tr>
                  <tr><td className="amber">Garmin API</td><td>OAuth tokens via Playwright browser auth</td></tr>
                  <tr><td className="amber">Built with</td><td>Factory Droid (factory.ai)</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
