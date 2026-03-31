# CLAUDE CORRE — Setup Guide

AI running coach terminal. Analyzes Garmin activity data, prescribes science-based training sessions, and pushes structured workouts to your Garmin watch.

**Live demo:** https://claude-corre.netlify.app

---

## What you need

- Python 3.10+
- Node.js 18+
- A [Netlify](https://netlify.com) account (free)
- An [Anthropic API key](https://console.anthropic.com) (pay-as-you-go, ~$5 to start)
- A Garmin watch + Garmin Connect account (optional — needed for workout push)

---

## Step 1 — Clone and onboard

```bash
git clone https://github.com/lucascmgit/claude-corre.git
cd claude-corre
python3 onboard.py
```

`onboard.py` will ask about your fitness background, goal, schedule, and injuries — then generate your personal `training_log.md`. This file is gitignored and never leaves your machine.

---

## Step 2 — Deploy the web app

```bash
cd claude-corre
npm install
npx netlify init       # creates your own Netlify site
```

Set your Anthropic API key (required for coach chat and CSV analysis):

```bash
npx netlify env:set ANTHROPIC_API_KEY "sk-ant-..."
npx netlify deploy --build --prod
```

Your own instance is now live.

---

## Step 3 — Garmin workout push (optional)

This pushes structured workouts directly to your Garmin watch.

```bash
pip install playwright
playwright install chromium
python3 browser_auth.py    # opens a browser — log in with YOUR Garmin account
```

After login, set the tokens in Netlify:

```bash
npx netlify env:set GARMIN_OAUTH1_TOKEN "$(cat ~/.garmin_tokens/oauth1_token.json)"
npx netlify env:set GARMIN_OAUTH2_TOKEN "$(cat ~/.garmin_tokens/oauth2_token.json)"
npx netlify deploy --build --prod
```

Tokens are valid ~30 days. Re-run `browser_auth.py` when they expire.

---

## Security notes

- Your `training_log.md` is gitignored — personal data stays local.
- Your Garmin credentials stay in `~/.garmin_credentials` (chmod 600) — never committed.
- Your Anthropic API key goes into Netlify env vars only — never in code.
- Each user deploys their own Netlify instance with their own keys.

---

## How it works

Upload a Garmin CSV → Claude analyzes your HR zones and km splits → prescribes your next session → pushes it to your watch as a structured workout → repeat.

Coaching methodology: Daniels running formula, Seiler's 80/20 rule, 10% weekly volume rule, heat-adjusted HR targets.
