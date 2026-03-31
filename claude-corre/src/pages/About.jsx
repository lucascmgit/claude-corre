export default function About() {
  return (
    <div>
      <div className="term-box">
        <div className="term-box-title">ABOUT // CLAUDE CORRE v1.0</div>
        <div className="term-box-body">
          <div style={{marginBottom:'16px'}}>
            <span className="amber">WHAT IS THIS?</span>
            <p style={{marginTop:'6px', color:'#aaa', lineHeight:'1.7'}}>
              CLAUDE CORRE is an AI-powered running coaching terminal built on top of Anthropic's Claude.
              It analyzes your Garmin activity data, prescribes science-based training sessions, and pushes
              structured workouts directly to your Garmin watch. The coaching methodology follows
              established sports science principles: Daniels, Seiler's 80/20 rule, Galloway, and Hawley.
            </p>
          </div>

          <div style={{marginBottom:'16px'}}>
            <span className="amber">HOW IT WAS BUILT</span>
            <p style={{marginTop:'6px', color:'#aaa', lineHeight:'1.7'}}>
              Built in a single session using{' '}
              <span className="amber">Factory Droid</span> — an AI engineering agent.
              The entire stack (coaching logic, Garmin integration, web interface, and deployment)
              was designed and implemented iteratively through conversation. No pre-planned architecture.
              Just a series of "what if we..." followed by working code.
            </p>
          </div>

          <div style={{marginBottom:'16px'}}>
            <span className="amber">GARMIN INTEGRATION</span>
            <p style={{marginTop:'6px', color:'#aaa', lineHeight:'1.7'}}>
              Connects to Garmin Connect via OAuth. After uploading a run CSV, Claude analyzes
              your km splits, HR drift, cadence, and zone distribution — then generates a structured
              workout JSON and pushes it to your watch via the Garmin Connect API.
              Workout appears under Training → Workouts on the watch after Bluetooth sync.
            </p>
            <div style={{marginTop:'8px', fontSize:'12px', color:'#555'}}>
              Note: Garmin blocked programmatic SSO logins in March 2026. Authentication now uses
              a Playwright browser flow. Tokens are valid ~30 days.
            </div>
          </div>

          <div style={{marginBottom:'16px'}}>
            <span className="amber">TAILORED FOR LUCAS</span>
            <p style={{marginTop:'6px', color:'#aaa', lineHeight:'1.7'}}>
              This instance is calibrated for a specific athlete profile:
            </p>
            <div style={{marginTop:'8px', paddingLeft:'12px', fontSize:'13px'}}>
              <div><span className="amber">ATHLETE.......</span> Lucas Martinelli, 42, Ipanema, Rio de Janeiro</div>
              <div><span className="amber">PEAK..........</span> Half marathon 1:55:22 (May 2023)</div>
              <div><span className="amber">GOAL..........</span> 12km @ 6:00/km by June 15, 2026</div>
              <div><span className="amber">MAX HR........</span> 179 bpm (observed Mar 2026)</div>
              <div><span className="amber">Z2 TARGET.....</span> 130–142 bpm / 6:45–7:15/km</div>
              <div><span className="amber">CROSS-TRAIN...</span> Iyengar yoga Tue/Thu + functional Mon/Wed/Fri</div>
              <div><span className="amber">HEAT ADJUST...</span> –5 to –8 bpm HR targets when running in Rio heat</div>
            </div>
          </div>

          <div style={{marginBottom:'16px'}}>
            <span className="amber">SHAREABLE</span>
            <p style={{marginTop:'6px', color:'#aaa', lineHeight:'1.7'}}>
              The project is designed to be portable. Run <code>python3 onboard.py</code> from the
              project directory to set up your own athlete profile, calibrate your zones, and get
              your own coach terminal. The coaching methodology is generic — only the training log
              contains personal data.
            </p>
          </div>

          <div>
            <span className="amber">STACK</span>
            <div style={{marginTop:'8px', fontSize:'13px'}}>
              <table className="term-table">
                <tbody>
                  <tr><td className="amber">Frontend</td><td>React + Vite, deployed on Netlify</td></tr>
                  <tr><td className="amber">Backend</td><td>Netlify Functions (Node.js ESM)</td></tr>
                  <tr><td className="amber">AI Coach</td><td>Anthropic Claude (Sonnet for coaching, Haiku for parameter extraction)</td></tr>
                  <tr><td className="amber">Storage</td><td>Netlify Blobs (training log persistence)</td></tr>
                  <tr><td className="amber">Garmin API</td><td>garminconnect + Playwright browser auth + OAuth token cache</td></tr>
                  <tr><td className="amber">Local tools</td><td>Python scripts for CSV analysis, FIT file generation, workout upload</td></tr>
                  <tr><td className="amber">Built with</td><td>Factory Droid (factory.ai)</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="term-box">
        <div className="term-box-title">SYSTEM LOG</div>
        <div className="term-box-body" style={{fontSize:'12px', color:'#444', fontFamily:'var(--font-mono)'}}>
          <div>[2026-03-22] First run analyzed. Intervals at 4:23/km flagged as excessive.</div>
          <div>[2026-03-24] Best run to date. Z2 compliance: 50%. HR instinct improving.</div>
          <div>[2026-03-29] 5km continuous. 3/5 km in Z3-Z4. Volume +28% — too fast again.</div>
          <div>[2026-03-31] Yoga + cycling logged. Garmin SSO unblocked via Playwright auth.</div>
          <div>[2026-03-31] Workouts pushed to Garmin Connect. Dashboard deployed to Netlify.</div>
          <div className="amber" style={{marginTop:'8px'}}>[CURRENT] Phase 1 Week 2. Next: Thu Apr 2 Z2 4.5km.</div>
        </div>
      </div>
    </div>
  )
}
