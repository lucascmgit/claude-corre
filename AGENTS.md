# Running Coach Project

A data-driven running coaching system. Athlete-specific data lives in `training_log.md`. The coaching logic lives in `.factory/droids/running-coach.md`.

## Quick Start (new athlete)

```bash
python3 onboard.py
```

Then open Droid from this folder and say "running coach: let's get started."

## Context for Droid Sessions

Before doing anything coaching-related, read:
- `training_log.md` — athlete profile, training zones, activity history, prescribed sessions

Raw activity data (Garmin CSV exports) are in:
- `activities/` — named `YYYY-MM-DD_activity_XXXXXXXXXX.csv`

Generated workout files:
- `workouts/` — `.json` files for API upload, `.fit` files for USB transfer

## Script Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `onboard.py` | New user setup | `python3 onboard.py` |
| `test_auth.py` | One-time Garmin login & token cache | `python3 test_auth.py` |
| `upload_workout.py` | Upload a workout to Garmin Connect | `python3 upload_workout.py workouts/<file>.json` |
| `generate_workout.py` | Generate JSON workout files for API | `python3 generate_workout.py` |
| `generate_fit_workout.py` | Generate FIT workout files for USB | `python3 generate_fit_workout.py` |

## Workout Upload Flow

```
Coach prescribes session
    → generate_workout.py creates .json in workouts/
    → upload_workout.py uploads to Garmin Connect cloud
    → Garmin Connect app syncs to watch via Bluetooth
    → Athlete selects workout on watch: Run > Training > Workouts
```

## CSV Export Flow (after a run)

```
Run completes on watch
    → Garmin Connect app syncs activity
    → Open connect.garmin.com > Activities > All Activities
    → Click activity > gear icon > Export to CSV
    → Rename to YYYY-MM-DD_activity_XXXXXXXXXX.csv
    → Drop in activities/
    → Tell coach: "I just ran, here's the CSV"
```

## Credential Files (not in git)

- `~/.garmin_credentials` — Garmin email and password (chmod 600)
- `~/.garmin_tokens/` — cached OAuth tokens (chmod 700)
