#!/usr/bin/env python3
"""
Generate Garmin Connect structured workout JSON files.

Usage:
    python3 generate_workout.py

This script generates workout JSON files in the workouts/ folder.
Each workout is tailored for the Garmin Forerunner 245 and uses HR targets.

Workout types supported:
    - easy_run: Zone 2 easy run (HR 130-142), distance-based
    - intervals: Run/walk intervals with HR targets
    - tempo: Tempo intervals at goal pace with HR targets
"""

import json
import os
from datetime import date

WORKOUTS_DIR = os.path.join(os.path.dirname(__file__), "workouts")
os.makedirs(WORKOUTS_DIR, exist_ok=True)

# HR zones calibrated from Lucas's data (max HR ~182)
HR_ZONES = {
    "z1_max": 130,   # recovery ceiling
    "z2_min": 130,   # easy floor
    "z2_max": 142,   # easy ceiling -- THIS IS THE PHASE 1 CAP
    "z3_min": 143,
    "z3_max": 155,
    "z4_min": 156,
    "z4_max": 167,
}

# Garmin sport type for running workouts
RUNNING_SPORT_TYPE = {"sportTypeId": 1, "sportTypeKey": "running"}

# Step condition types
CONDITION_LAP_BUTTON = {"conditionTypeId": 1, "conditionTypeKey": "lap.button"}
CONDITION_TIME       = {"conditionTypeId": 2, "conditionTypeKey": "time"}
CONDITION_DISTANCE   = {"conditionTypeId": 3, "conditionTypeKey": "distance"}
CONDITION_HR_LESS    = {"conditionTypeId": 6, "conditionTypeKey": "heart.rate.less.than"}
CONDITION_HR_GREATER = {"conditionTypeId": 7, "conditionTypeKey": "heart.rate.greater.than"}

# Target types
TARGET_NONE = {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"}

def hr_target(min_hr, max_hr):
    return {
        "workoutTargetTypeId": 4,
        "workoutTargetTypeKey": "heart.rate.between",
        "targetValueOne": str(min_hr),
        "targetValueTwo": str(max_hr),
    }

def step_warmup_walk(minutes=5):
    """Walk warm-up, lap-button to advance."""
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": None,  # set later
        "stepType": {"stepTypeId": 1, "stepTypeKey": "warmup"},
        "endCondition": CONDITION_TIME,
        "endConditionValue": minutes * 60,
        "targetType": TARGET_NONE,
        "description": f"Walk {minutes} min to warm up",
    }

def step_run_distance(distance_meters, min_hr, max_hr, description=""):
    """Run for a fixed distance with HR target."""
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": None,
        "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
        "endCondition": CONDITION_DISTANCE,
        "endConditionValue": distance_meters,
        "targetType": hr_target(min_hr, max_hr),
        "description": description,
    }

def step_run_time(seconds, min_hr, max_hr, description=""):
    """Run for a fixed time with HR target."""
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": None,
        "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
        "endCondition": CONDITION_TIME,
        "endConditionValue": seconds,
        "targetType": hr_target(min_hr, max_hr),
        "description": description,
    }

def step_walk_time(seconds, description="Walk / recover"):
    """Walk for a fixed time, no target."""
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": None,
        "stepType": {"stepTypeId": 6, "stepTypeKey": "recovery"},
        "endCondition": CONDITION_TIME,
        "endConditionValue": seconds,
        "targetType": TARGET_NONE,
        "description": description,
    }

def step_cooldown_walk(minutes=5):
    """Walk cool-down."""
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": None,
        "stepType": {"stepTypeId": 2, "stepTypeKey": "cooldown"},
        "endCondition": CONDITION_TIME,
        "endConditionValue": minutes * 60,
        "targetType": TARGET_NONE,
        "description": f"Walk {minutes} min to cool down",
    }

def repeat_block(steps, repeat_count):
    """Wrap steps in a repeat block."""
    return {
        "type": "RepeatGroupDTO",
        "stepOrder": None,
        "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat"},
        "numberOfIterations": repeat_count,
        "workoutSteps": steps,
    }

def build_workout(name, description, steps):
    """Assemble final workout payload for Garmin Connect API."""
    ordered = []
    for i, step in enumerate(steps, start=1):
        s = dict(step)
        s["stepOrder"] = i
        if s.get("type") == "RepeatGroupDTO":
            sub = []
            for j, sub_step in enumerate(s.get("workoutSteps", []), start=1):
                ss = dict(sub_step)
                ss["stepOrder"] = j
                sub.append(ss)
            s["workoutSteps"] = sub
        ordered.append(s)

    return {
        "sportType": RUNNING_SPORT_TYPE,
        "workoutName": name,
        "description": description,
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": RUNNING_SPORT_TYPE,
                "workoutSteps": ordered,
            }
        ],
    }


# ─── WORKOUT DEFINITIONS ──────────────────────────────────────────────────────

def workout_easy_z2_4500m(run_date: str):
    """
    Phase 1 easy run: 4.5km at Z2 (HR 130-142).
    Warm-up walk + run + cooldown walk.
    If HR exceeds 142, the watch will alert you -- slow to a walk for 60s then resume.
    """
    steps = [
        step_warmup_walk(minutes=5),
        step_run_distance(
            distance_meters=4500,
            min_hr=HR_ZONES["z2_min"],
            max_hr=HR_ZONES["z2_max"],
            description="Keep HR 130-142. If HR > 142, walk 60s then resume.",
        ),
        step_cooldown_walk(minutes=5),
    ]
    return build_workout(
        name=f"Z2 Easy 4.5km [{run_date}]",
        description=(
            "Phase 1 base building. HR cap 142 bpm.\n"
            "Science: Zone 2 running stimulates mitochondrial biogenesis and fat oxidation "
            "(Holloszy, 1967). This is the aerobic foundation everything else is built on.\n"
            "If HR exceeds 142: walk until it drops below 135, then resume running."
        ),
        steps=steps,
    )


def workout_easy_z2_5000m(run_date: str):
    """Phase 1 easy run: 5km at Z2 (HR 130-142)."""
    steps = [
        step_warmup_walk(minutes=5),
        step_run_distance(
            distance_meters=5000,
            min_hr=HR_ZONES["z2_min"],
            max_hr=HR_ZONES["z2_max"],
            description="Keep HR 130-142. Slow down early, not when HR is already high.",
        ),
        step_cooldown_walk(minutes=5),
    ]
    return build_workout(
        name=f"Z2 Easy 5km [{run_date}]",
        description=(
            "Phase 1 base building. HR cap 142 bpm.\n"
            "Same aerobic base work as last session, 500m more volume.\n"
            "If HR exceeds 142: walk until it drops below 135, then resume."
        ),
        steps=steps,
    )


def workout_intervals_run_walk(run_date: str, reps=10, run_sec=60, walk_sec=60):
    """
    Run/walk intervals. Each rep: run X seconds + walk X seconds.
    HR target during run: Z2 (130-142). Walk is open.
    """
    run_step = step_run_time(
        seconds=run_sec,
        min_hr=HR_ZONES["z2_min"],
        max_hr=HR_ZONES["z2_max"],
        description=f"Run {run_sec}s at Z2 (HR 130-142)",
    )
    walk_step = step_walk_time(
        seconds=walk_sec,
        description=f"Walk {walk_sec}s -- let HR recover",
    )
    steps = [
        step_warmup_walk(minutes=3),
        repeat_block([run_step, walk_step], repeat_count=reps),
        step_cooldown_walk(minutes=3),
    ]
    return build_workout(
        name=f"Run/Walk {reps}x{run_sec//60}+{walk_sec//60} [{run_date}]",
        description=(
            f"{reps} reps of {run_sec}s run + {walk_sec}s walk.\n"
            "Science: Run/walk protocol (Galloway) reduces cumulative impact load while "
            "maintaining aerobic stimulus. Appropriate for return-to-running to protect "
            "connective tissue while building aerobic capacity.\n"
            "HR target during run intervals: 130-142 bpm."
        ),
        steps=steps,
    )


# ─── MAIN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    today = date.today().isoformat()

    workouts = [
        ("2026-04-02_easy_z2_4500m.json", workout_easy_z2_4500m("2026-04-02")),
        ("2026-04-05_easy_z2_5000m.json", workout_easy_z2_5000m("2026-04-05")),
    ]

    for filename, workout in workouts:
        path = os.path.join(WORKOUTS_DIR, filename)
        with open(path, "w") as f:
            json.dump(workout, f, indent=2)
        print(f"Generated: {path}")

    print(f"\nTo upload to Garmin Connect:")
    print(f"  python3 upload_workout.py workouts/2026-04-02_easy_z2_4500m.json")
    print(f"\n(Run python3 test_auth.py first if you haven't authenticated yet.)")
