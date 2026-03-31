#!/usr/bin/env python3
"""
Generate .FIT workout files for Garmin 245, loadable via USB.

Usage:
    python3 generate_fit_workout.py

Files are written to workouts/ folder.

To load on the watch:
1. Connect 245 to Mac via USB cable
2. Open Finder -- the watch mounts as "GARMIN"
3. Drag the .fit file into GARMIN/GARMIN/NEWFILES/
4. Eject the watch (drag to Trash or right-click > Eject)
5. On the watch: Run > hold UP > Training > Workouts > select > Do Workout
"""

import os

from fit_tool.fit_file_builder import FitFileBuilder
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.workout_message import WorkoutMessage
from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
from fit_tool.profile.profile_type import (
    FileType, Manufacturer, Sport,
    WorkoutStepDuration, WorkoutStepTarget, Intensity,
)

WORKOUTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workouts")
os.makedirs(WORKOUTS_DIR, exist_ok=True)

# HR zones for Lucas (max HR ~182 bpm)
Z2_MIN = 130
Z2_MAX = 142


def make_file_id():
    msg = FileIdMessage()
    msg.type = FileType.WORKOUT
    msg.manufacturer = Manufacturer.GARMIN
    msg.product = 0
    return msg


def make_workout_header(name, num_steps):
    msg = WorkoutMessage()
    msg.sport = Sport.RUNNING
    msg.wkt_name = name
    msg.num_valid_steps = num_steps
    return msg


def step_warmup(duration_secs):
    """Walk warm-up, time-based, no HR target."""
    msg = WorkoutStepMessage()
    msg.wkt_step_name = "Warm Up"
    msg.intensity = Intensity.WARMUP
    msg.duration_type = WorkoutStepDuration.TIME
    msg.duration_value = duration_secs * 1000  # milliseconds
    msg.target_type = WorkoutStepTarget.OPEN
    msg.target_value = 0
    return msg


def step_run_distance(distance_meters, hr_min, hr_max, name="Run Z2"):
    """Run for a fixed distance, HR target zone."""
    msg = WorkoutStepMessage()
    msg.wkt_step_name = name
    msg.intensity = Intensity.ACTIVE
    msg.duration_type = WorkoutStepDuration.DISTANCE
    msg.duration_value = distance_meters * 100  # centimeters
    msg.target_type = WorkoutStepTarget.HEART_RATE
    # Garmin encodes HR zone targets as: low = hr_min + 100, high = hr_max + 100
    msg.target_value = 0
    msg.custom_target_value_low = hr_min + 100
    msg.custom_target_value_high = hr_max + 100
    return msg


def step_run_time(duration_secs, hr_min, hr_max, name="Run Z2"):
    """Run for a fixed time, HR target zone."""
    msg = WorkoutStepMessage()
    msg.wkt_step_name = name
    msg.intensity = Intensity.ACTIVE
    msg.duration_type = WorkoutStepDuration.TIME
    msg.duration_value = duration_secs * 1000  # milliseconds
    msg.target_type = WorkoutStepTarget.HEART_RATE
    msg.target_value = 0
    msg.custom_target_value_low = hr_min + 100
    msg.custom_target_value_high = hr_max + 100
    return msg


def step_walk_time(duration_secs, name="Walk"):
    """Walk/recovery, time-based, no target."""
    msg = WorkoutStepMessage()
    msg.wkt_step_name = name
    msg.intensity = Intensity.REST
    msg.duration_type = WorkoutStepDuration.TIME
    msg.duration_value = duration_secs * 1000
    msg.target_type = WorkoutStepTarget.OPEN
    msg.target_value = 0
    return msg


def step_cooldown(duration_secs):
    """Walk cool-down, time-based, no target."""
    msg = WorkoutStepMessage()
    msg.wkt_step_name = "Cool Down"
    msg.intensity = Intensity.COOLDOWN
    msg.duration_type = WorkoutStepDuration.TIME
    msg.duration_value = duration_secs * 1000
    msg.target_type = WorkoutStepTarget.OPEN
    msg.target_value = 0
    return msg


def build_and_save(filename, workout_name, steps):
    builder = FitFileBuilder(auto_define=True)
    builder.add(make_file_id())
    builder.add(make_workout_header(workout_name, len(steps)))
    for step in steps:
        builder.add(step)
    fit_file = builder.build()
    path = os.path.join(WORKOUTS_DIR, filename)
    fit_file.to_file(path)
    print(f"Generated: {path}")
    return path


# ─── WORKOUT DEFINITIONS ──────────────────────────────────────────────────────

def workout_easy_z2_4500m():
    steps = [
        step_warmup(5 * 60),
        step_run_distance(4500, Z2_MIN, Z2_MAX, name="Run HR130-142"),
        step_cooldown(5 * 60),
    ]
    return build_and_save(
        "2026-04-02_easy_z2_4500m.fit",
        "Z2 Easy 4.5km",
        steps,
    )


def workout_easy_z2_5000m():
    steps = [
        step_warmup(5 * 60),
        step_run_distance(5000, Z2_MIN, Z2_MAX, name="Run HR130-142"),
        step_cooldown(5 * 60),
    ]
    return build_and_save(
        "2026-04-05_easy_z2_5000m.fit",
        "Z2 Easy 5km",
        steps,
    )


# ─── MAIN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Generating FIT workout files...\n")

    workout_easy_z2_4500m()
    workout_easy_z2_5000m()

    print("\nTo load on the Garmin 245:")
    print("1. Connect watch to Mac via USB cable")
    print("2. Open Finder -- watch mounts as 'GARMIN'")
    print("3. Drag the .fit file into: GARMIN/GARMIN/NEWFILES/")
    print("4. Eject the watch")
    print("5. On watch: Run > hold UP > Training > Workouts > select > Do Workout")
