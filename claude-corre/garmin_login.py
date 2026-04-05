#!/usr/bin/env python3
"""
Get a fresh Garmin token for claude-corre.

Normal use:   python3 garmin_login.py
Browser mode: python3 garmin_login.py --browser   (use when rate-limited)

Paste the output in the app: Settings -> Garmin OAuth2 token
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
    print("ERROR: garminconnect not installed.")
    print("  python3 -m pip install 'garminconnect>=0.3.1'")
    sys.exit(1)

TOKENSTORE = str(Path("~/.garminconnect").expanduser())

COOKIE_SNIPPET = (
    "document.cookie.split(';').map(c=>c.trim()).filter(c=>c.startsWith('JWT_WEB='))"
    ".map(c=>{const t=JSON.stringify({access_token:c.substring(8)});"
    "copy(t);console.log('Token copied to clipboard!')})"
)


def main():
    if "--browser" in sys.argv:
        browser_mode()
        return

    print("=== Garmin Login for claude-corre ===")
    print()

    client = Garmin()
    if os.path.exists(TOKENSTORE):
        try:
            client.login(tokenstore=TOKENSTORE)
            print("Loaded existing session from ~/.garminconnect")
            output_token(client)
            return
        except Exception:
            print("Existing session expired. Need fresh login.")
            print()

    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")
    print()
    print("Logging in (may take 5-10 seconds)...")

    try:
        client = Garmin(email=email, password=password)
        mfa_status, _ = client.login(tokenstore=TOKENSTORE)
        if mfa_status == "NEEDS_MFA":
            mfa_code = input("MFA code: ").strip()
            client.resume_login(mfa_code)
        print("Login successful.")
        output_token(client)
    except Exception as e:
        msg = str(e)
        if "429" in msg or "TooMany" in msg:
            print("ERROR: Garmin rate limit (429). Wait ~1 hour, then retry.")
            print()
            print("Or use the browser method RIGHT NOW:")
            print("  python3 garmin_login.py --browser")
        elif "401" in msg or "Authentication" in msg or "credentials" in msg.lower():
            print("ERROR: Wrong email or password.")
        else:
            print(f"ERROR: {e}")
        sys.exit(1)


def browser_mode():
    print()
    print("=== Garmin Token via Browser ===")
    print()
    print("STEP 1 - Open Chrome: https://connect.garmin.com/modern/")
    print("         (log in normally if needed - web login is never rate-limited)")
    print()
    print("STEP 2 - Open Console: Cmd+Option+J")
    print()
    print("STEP 3 - Paste this line and press Enter:")
    print()
    print("   " + COOKIE_SNIPPET)
    print()
    print('         You should see "Token copied to clipboard!"')
    print()
    print("STEP 4 - Come back here and paste (Cmd+V), then Enter:")
    print()
    raw = input("   > ").strip()
    print()

    if not raw:
        print("ERROR: Nothing pasted. Try again.")
        sys.exit(1)

    # Accept raw JWT value (starts with eyJ) or full JSON
    if raw.startswith("eyJ") and not raw.startswith("{"):
        token = {"access_token": raw}
    else:
        try:
            token = json.loads(raw)
            if not token.get("access_token"):
                raise ValueError("missing access_token field")
        except (json.JSONDecodeError, ValueError) as e:
            print(f"ERROR: Could not parse token: {e}")
            print("Expected JSON like: {\"access_token\":\"eyJ...\"}")
            print("Or just the raw JWT value starting with eyJ...")
            sys.exit(1)

    to_clipboard(json.dumps(token))
    print("Note: JWT_WEB tokens expire in ~1 hour. The server will try to")
    print("auto-refresh, but if it fails, run this script again.")
    print("Once the rate limit clears (~1 hour), run without --browser")
    print("to get a long-lived token that auto-refreshes for 90 days.")
    print()


def output_token(client):
    raw = json.loads(client.client.dumps())
    token = {
        "access_token": raw["di_token"],
        "refresh_token": raw["di_refresh_token"],
        "client_id": raw["di_client_id"],
    }
    to_clipboard(json.dumps(token))
    print("This token auto-refreshes server-side. Re-run in ~90 days.")
    print()


def to_clipboard(token_json):
    print("=== PASTE THIS IN SETTINGS -> Garmin OAuth2 token ===")
    print()
    print(token_json)
    print()
    try:
        subprocess.run(["pbcopy"], input=token_json.encode(), check=True)
        print("Copied to clipboard! Switch to the app, go to Settings, Cmd+V.")
    except Exception:
        print("(Could not copy — paste the JSON above manually.)")
    print()


if __name__ == "__main__":
    main()
