#!/usr/bin/env python3
"""
Onboarding script for new athletes.
Run this once to set up your personalized training log and Garmin authentication.

Usage:
    python3 onboard.py
"""

import os
import sys
import subprocess
from datetime import date, timedelta


def install_dependencies():
    print("Installing required packages...")
    packages = ["garminconnect", "fit-tool"]
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet"] + packages)
    print("Done.\n")


def ask(prompt, default=None):
    if default:
        result = input(f"{prompt} [{default}]: ").strip()
        return result if result else default
    return input(f"{prompt}: ").strip()


def ask_int(prompt, default=None):
    while True:
        val = ask(prompt, str(default) if default else None)
        try:
            return int(val)
        except ValueError:
            print("  Please enter a number.")


def ask_float(prompt, default=None):
    while True:
        val = ask(prompt, str(default) if default else None)
        try:
            return float(val)
        except ValueError:
            print("  Please enter a number.")


def collect_profile():
    print("=" * 60)
    print("ATHLETE PROFILE SETUP")
    print("=" * 60)
    print("Your answers build your training log. You can edit it later.\n")

    name = ask("Your name")
    age = ask_int("Age")
    weight_kg = ask_float("Weight (kg)")
    height_cm = ask_float("Height (cm)")
    location = ask("City / location (used for heat adjustments)", "Unknown")

    print("\nPeak running history (helps calibrate your plan):")
    peak = ask("Best race or typical weekly km before your break (e.g. 'Half marathon 1:55' or '30km/week')", "Unknown")
    break_duration = ask("How long have you been away from running?", "Unknown")
    injuries = ask("Any current injuries or limitations? (or 'none')", "none")

    print("\nTraining goal:")
    goal_distance = ask_float("Target distance (km)", 12.0)
    goal_pace = ask("Target pace (min/km, e.g. 6:00)", "6:00")
    goal_date = ask("Target date (YYYY-MM-DD)", (date.today() + timedelta(weeks=11)).isoformat())

    print("\nWeekly schedule:")
    print("  Running: how many days per week can you run?")
    run_days = ask_int("Running days per week", 2)
    cross_training = ask("Cross-training (e.g. 'yoga Tue/Thu, functional Mon/Wed/Fri')", "None")

    return {
        "name": name,
        "age": age,
        "weight_kg": weight_kg,
        "height_cm": height_cm,
        "location": location,
        "peak": peak,
        "break_duration": break_duration,
        "injuries": injuries,
        "goal_distance": goal_distance,
        "goal_pace": goal_pace,
        "goal_date": goal_date,
        "run_days": run_days,
        "cross_training": cross_training,
    }


def compute_weeks_remaining(goal_date_str):
    try:
        goal = date.fromisoformat(goal_date_str)
        weeks = max(1, (goal - date.today()).days // 7)
        return weeks
    except Exception:
        return 11


def write_training_log(profile):
    project_dir = os.path.dirname(os.path.abspath(__file__))
    log_path = os.path.join(project_dir, "training_log.md")

    weeks = compute_weeks_remaining(profile["goal_date"])
    today = date.today().isoformat()

    content = f"""# Running Training Log — {profile["name"]}

**Goal:** {profile["goal_distance"]}km @ {profile["goal_pace"]}/km by {profile["goal_date"]}
**Current Phase:** Phase 1 — Rebuild (Weeks 1-{min(4, weeks//3)})
**Current Week:** Week 1 (started {today})

---

## Athlete Profile

| Field | Value |
|-------|-------|
| Name | {profile["name"]} |
| Age | {profile["age"]} |
| Weight | {profile["weight_kg"]}kg |
| Height | {profile["height_cm"]}cm |
| Location | {profile["location"]} |
| Previous peak | {profile["peak"]} |
| Break duration | {profile["break_duration"]} |
| Injuries/limits | {profile["injuries"]} |

## Training Zones

*These are estimated zones based on your profile. They will be calibrated from real run data after your first session.*

| Zone | HR | Est. Pace | Use |
|------|----|-----------|-----|
| Z1 Recovery | <130 | 7:30+/km | Warm-up/cool-down |
| Z2 Easy | 130–142 | 6:45–7:15/km | All Phase 1 running |
| Z3 Tempo | 143–155 | 6:00–6:20/km | Phase 2+ only |
| Z4 Threshold | 156–167 | 5:30–5:50/km | Phase 3 only |
| Z5 VO2max | 168+ | <5:30/km | Not prescribed |

*Max HR not yet observed. Zones will be updated after first run.*

## Weekly Schedule

- **Running:** {profile["run_days"]} days/week — confirm each session before going out
- **Cross-training:** {profile["cross_training"]}

---

## Activity Log

| Date | Day | Type | Distance | Avg Pace | Avg HR | Max HR | Avg Cadence | Notes |
|------|-----|------|----------|----------|--------|--------|-------------|-------|
| — | — | No runs yet | — | — | — | — | — | Onboarded {today} |

---

## Prescribed Sessions

### First Run (when ready)
**Session:** Easy run/walk to establish baseline
- Walk 5 min warm-up
- Run/walk easy for 20–25 min — no pace target, just stay conversational
- Walk 5 min cool-down
- This is a calibration run. Your coach will set zones based on your HR data.
- After: export CSV from Garmin Connect web, rename `YYYY-MM-DD_activity_XXXXXXXXXX.csv`, drop in `activities/`

---

## Coach Notes

*No runs yet. Profile set up on {today}.*

**Key concern to monitor:** Most returning runners default to their old pace instinctively. HR, not pace, governs all Phase 1 sessions.

---

## Phase Plan Reference

| Phase | Weeks | Focus | Volume |
|-------|-------|-------|--------|
| 1 – Rebuild | 1–{max(3, weeks//3)} | Z2 only, connective tissue | 8–12 km/week |
| 2 – Build | {max(3, weeks//3)+1}–{max(6, weeks*2//3)} | Tempo intervals + long run | 14–20 km/week |
| 3 – Sharpen | {max(6, weeks*2//3)+1}–{weeks} | Goal-pace work + validation | 18–22 km/week |
"""

    with open(log_path, "w") as f:
        f.write(content)
    print(f"Training log created: {log_path}")
    return log_path


def setup_garmin_credentials():
    print("\n" + "=" * 60)
    print("GARMIN CONNECT AUTHENTICATION (optional)")
    print("=" * 60)
    print("This enables automatic workout upload to your Garmin watch.")
    print("You can skip this and set it up later with: python3 test_auth.py\n")

    skip = ask("Skip Garmin setup for now? (y/n)", "y").lower()
    if skip == "y":
        print("Skipped. Run python3 test_auth.py when ready.\n")
        return

    cred_file = os.path.expanduser("~/.garmin_credentials")
    if os.path.exists(cred_file):
        print(f"~/.garmin_credentials already exists. Skipping.\n")
        return

    email = ask("Garmin Connect email")
    password = ask("Garmin Connect password")

    with open(cred_file, "w") as f:
        f.write(f"{email}\n{password}\n")
    os.chmod(cred_file, 0o600)
    print(f"Credentials saved to {cred_file} (chmod 600).\n")

    print("Testing authentication...")
    try:
        import garminconnect
        api = garminconnect.Garmin(email, password)
        api.login()
        token_dir = os.path.expanduser("~/.garmin_tokens")
        os.makedirs(token_dir, exist_ok=True)
        api.garth.dump(token_dir)
        os.chmod(token_dir, 0o700)
        print(f"Authentication successful: {api.get_full_name()}")
        print("Tokens cached. Future uploads won't need your password.\n")
    except Exception as e:
        if "429" in str(e):
            print("Rate limited by Garmin. Wait 30 min, then run: python3 test_auth.py\n")
        else:
            print(f"Auth failed: {e}")
            print("Run python3 test_auth.py later to retry.\n")


def install_droid():
    """Install the project-level droid to ~/.factory/droids/ if not already there."""
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       ".factory", "droids", "running-coach.md")
    dst_dir = os.path.expanduser("~/.factory/droids")
    dst = os.path.join(dst_dir, "running-coach.md")

    if not os.path.exists(src):
        print("WARNING: .factory/droids/running-coach.md not found. Droid not installed.")
        return

    if os.path.exists(dst):
        overwrite = ask("~/.factory/droids/running-coach.md already exists. Overwrite? (y/n)", "n").lower()
        if overwrite != "y":
            print("Keeping existing droid.\n")
            return

    os.makedirs(dst_dir, exist_ok=True)
    import shutil
    shutil.copy2(src, dst)
    print(f"Droid installed to {dst}\n")


def ensure_directories():
    project_dir = os.path.dirname(os.path.abspath(__file__))
    for d in ["activities", "workouts"]:
        path = os.path.join(project_dir, d)
        os.makedirs(path, exist_ok=True)


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("RUNNING COACH — SETUP")
    print("=" * 60)
    print("This sets up your personal training log and coaching environment.\n")

    install_dependencies()
    ensure_directories()
    profile = collect_profile()
    write_training_log(profile)
    install_droid()
    setup_garmin_credentials()

    print("=" * 60)
    print("SETUP COMPLETE")
    print("=" * 60)
    print(f"\nYour training log is at: training_log.md")
    print(f"Start a Droid session from this folder and say:")
    print(f'  "running coach: I want to start my first run. What do I do?"')
    print()
