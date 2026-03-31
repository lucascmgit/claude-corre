#!/usr/bin/env python3
"""
One-time authentication test for Garmin Connect.
Run this once to verify credentials and cache OAuth tokens.
After it succeeds, upload_workout.py will use the cached tokens automatically.

Usage:
    python3 test_auth.py
"""

import os
import sys
import garminconnect

TOKEN_DIR = os.path.expanduser("~/.garmin_tokens")
CRED_FILE = os.path.expanduser("~/.garmin_credentials")


def load_credentials():
    if not os.path.exists(CRED_FILE):
        print("ERROR: ~/.garmin_credentials not found.")
        print("Create it with:")
        print("  printf 'your@email.com\\nyourpassword\\n' > ~/.garmin_credentials")
        print("  chmod 600 ~/.garmin_credentials")
        sys.exit(1)
    lines = open(CRED_FILE).read().strip().splitlines()
    if len(lines) < 2 or not lines[0] or not lines[1]:
        print("ERROR: ~/.garmin_credentials must have email on line 1 and password on line 2.")
        sys.exit(1)
    return lines[0].strip(), lines[1].strip()


def try_cached_tokens():
    """Attempt login using cached tokens. Returns api instance or None."""
    if not os.path.exists(os.path.join(TOKEN_DIR, "oauth2_token.json")):
        return None
    try:
        api = garminconnect.Garmin()
        api.garth.load(TOKEN_DIR)
        name = api.get_full_name()
        return api, name
    except Exception as e:
        print(f"Cached tokens exist but failed ({type(e).__name__}). Re-authenticating...")
        return None


def fresh_login():
    """Login with credentials, cache tokens. Returns api instance."""
    email, password = load_credentials()
    print(f"Logging in as {email}...")
    try:
        api = garminconnect.Garmin(email, password)
        api.login()
        os.makedirs(TOKEN_DIR, exist_ok=True)
        api.garth.dump(TOKEN_DIR)
        os.chmod(TOKEN_DIR, 0o700)
        return api, api.get_full_name()
    except garminconnect.GarminConnectConnectionError as e:
        if "429" in str(e):
            print("\nERROR: Garmin rate-limited this IP. Wait 30 minutes before retrying.")
            print("Every failed attempt resets the cooldown -- do not retry immediately.")
        elif "401" in str(e) or "Invalid" in str(e):
            print("\nERROR: Invalid credentials. Check your email and password in ~/.garmin_credentials")
        else:
            print(f"\nERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    result = try_cached_tokens()
    if result:
        api, name = result
        print(f"Login OK (cached tokens): {name}")
        print("Tokens are valid. upload_workout.py is ready to use.")
    else:
        api, name = fresh_login()
        print(f"Login OK (fresh): {name}")
        print(f"Tokens saved to {TOKEN_DIR}")
        print("Future runs will use cached tokens -- no password needed.")
