WHAT IS THIS?
CLAUDE CORRE is an AI-powered running coaching terminal built on top of Anthropic's Claude. It analyzes your Garmin activity data, prescribes science-based training sessions, and pushes structured workouts directly to your Garmin watch. The coaching methodology follows established sports science principles: Daniels, Seiler's 80/20 rule, Galloway, and Hawley.

HOW IT WAS BUILT
Built in a single session using Factory Droid — an AI engineering agent. The entire stack (coaching logic, Garmin integration, web interface, and deployment) was designed and implemented iteratively through conversation. No pre-planned architecture. Just a series of "what if we..." followed by working code.

GARMIN INTEGRATION
Connects to Garmin Connect via OAuth. After uploading a run CSV, Claude analyzes your km splits, HR drift, cadence, and zone distribution — then generates a structured workout JSON and pushes it to your watch via the Garmin Connect API. Workout appears under Training → Workouts on the watch after Bluetooth sync.
