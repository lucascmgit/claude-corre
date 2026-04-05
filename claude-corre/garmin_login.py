#!/usr/bin/env python3
"""
Get a fresh Garmin DI token for claude-corre.

Run: python3 garmin_login.py

Prompts for email/password, logs in via the portal web flow
(same as the Garmin Connect website — bypasses Cloudflare).
Saves session to ~/.garminconnect for future use.
Prints the token JSON and copies it to clipboard.

Paste the output in the app: Settings → Garmin OAuth2 token
"""
import getpass
import json
import subprocess
import sys
import os
from pathlib import Path

try:
    from garminconnect import Garmin
except ImportError:
    print("ERROR: garminconnect not installed. Run: python3 -m pip install 'garminconnect>=0.3.1'")
    sys.exit(1)

TOKENSTORE = str(Path("~/.garminconnect").expanduser())

def main():
    print("=== Garmin Login for claude-corre ===")
    print()

    # Try loading existing tokens first
    client = Garmin()
    if os.path.exists(TOKENSTORE):
        try:
            client.login(tokenstore=TOKENSTORE)
            print("Loaded existing session from ~/.garminconnect")
            print("(DI token refreshed automatically if needed)")
            output_token(client)
            return
        except Exception:
            print("Existing session expired or invalid. Need fresh login.")
            print()

    # Fresh login
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")
    print()
    print("Logging in via portal web flow (may take 5-10 seconds)...")

    try:
        client = Garmin(email=email, password=password)
        mfa_status, _ = client.login(tokenstore=TOKENSTORE)

        if mfa_status == "NEEDS_MFA":
            mfa_code = input("MFA code from Garmin app: ").strip()
            client.resume_login(mfa_code)

        print("Login successful.")
        output_token(client)

    except Exception as e:
        msg = str(e)
        if "429" in msg or "TooMany" in msg:
            print(f"ERROR: Garmin rate limit (429). Wait ~1 hour and try again.")
        elif "401" in msg or "Authentication" in msg or "credentials" in msg.lower():
            print(f"ERROR: Wrong email or password.")
        else:
            print(f"ERROR: {e}")
        sys.exit(1)

def output_token(client):
    # garminconnect 0.3.1 stores di_token/di_refresh_token/di_client_id
    raw = json.loads(client.client.dumps())
    token = {
        "access_token": raw["di_token"],
        "refresh_token": raw["di_refresh_token"],
        "client_id": raw["di_client_id"],
    }
    token_json = json.dumps(token)

    print()
    print("=== PASTE THIS IN SETTINGS → Garmin OAuth2 token ===")
    print(token_json)
    print()

    try:
        subprocess.run(["pbcopy"], input=token_json.encode(), check=True)
        print("Token copied to clipboard. Switch to the app and ⌘V.")
    except Exception:
        print("(Could not copy to clipboard — paste the JSON above manually.)")

if __name__ == "__main__":
    main()
