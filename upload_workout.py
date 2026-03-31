#!/usr/bin/env python3
"""
Upload a structured running workout to Garmin Connect.
The workout appears in your Garmin Connect library and syncs to your watch via Bluetooth.

Usage:
    python3 upload_workout.py <workout_file.json>

Credentials: stored in ~/.garmin_credentials (email on line 1, password on line 2)
Tokens: cached in ~/.garmin_tokens after first login -- no password needed after that.
"""

import json
import os
import sys

import garminconnect

TOKEN_DIR = os.path.expanduser("~/.garmin_tokens")
CRED_FILE = os.path.expanduser("~/.garmin_credentials")


def get_api():
    """Return authenticated Garmin API instance. Uses cached tokens if available."""
    # Try cached tokens first
    if os.path.exists(os.path.join(TOKEN_DIR, "oauth2_token.json")):
        try:
            api = garminconnect.Garmin()
            api.garth.load(TOKEN_DIR)
            api.get_full_name()  # Validate token is still alive
            print("Authenticated (cached tokens).")
            return api
        except Exception:
            print("Cached tokens expired. Re-authenticating...")

    # Fall back to credentials
    if not os.path.exists(CRED_FILE):
        print("ERROR: ~/.garmin_credentials not found.")
        print("Run python3 test_auth.py first to set up authentication.")
        sys.exit(1)

    lines = open(CRED_FILE).read().strip().splitlines()
    if len(lines) < 2:
        print("ERROR: ~/.garmin_credentials must have email on line 1 and password on line 2.")
        sys.exit(1)

    print(f"Authenticating as {lines[0]}...")
    try:
        api = garminconnect.Garmin(lines[0].strip(), lines[1].strip())
        api.login()
        os.makedirs(TOKEN_DIR, exist_ok=True)
        api.garth.dump(TOKEN_DIR)
        os.chmod(TOKEN_DIR, 0o700)
        print("Authenticated. Tokens cached for future use.")
        return api
    except garminconnect.GarminConnectConnectionError as e:
        if "429" in str(e):
            print("ERROR: Garmin rate-limited this IP. Wait 30 minutes before retrying.")
        elif "401" in str(e):
            print("ERROR: Invalid credentials. Check ~/.garmin_credentials")
        else:
            print(f"ERROR: {e}")
        sys.exit(1)


def upload_workout(workout_path):
    api = get_api()

    with open(workout_path) as f:
        workout = json.load(f)

    print(f"Uploading: {os.path.basename(workout_path)}...")
    result = api.upload_workout(workout)

    print("Upload successful.")
    workout_id = None
    if isinstance(result, dict):
        workout_id = result.get("workoutId")
    elif isinstance(result, list) and result:
        workout_id = result[0].get("workoutId")
    if workout_id:
        print(f"View at: https://connect.garmin.com/modern/workout/{workout_id}")
    print("Open Garmin Connect on your phone to sync to your watch via Bluetooth.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python3 {os.path.basename(sys.argv[0])} <workout_file.json>")
        sys.exit(1)

    workout_path = sys.argv[1]
    if not os.path.exists(workout_path):
        print(f"ERROR: File not found: {workout_path}")
        sys.exit(1)

    upload_workout(workout_path)
