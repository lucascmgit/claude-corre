#!/usr/bin/env python3
"""
Get a fresh Garmin DI token for claude-corre.

Normal use:   python3 garmin_login.py
Browser mode: python3 garmin_login.py --paste   (use when rate-limited)

Normal mode: prompts for email/password, logs in via portal web flow.
Browser mode: paste a Bearer token copied from Chrome DevTools.

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
    print("ERROR: garminconnect not installed. Run: python3 -m pip install 'garminconnect>=0.3.1'")
    sys.exit(1)

TOKENSTORE = str(Path("~/.garminconnect").expanduser())

BROWSER_SNIPPET = "fetch('/services/auth/token/di-oauth/exchange',{method:'POST',credentials:'include',headers:{'Accept':'application/json','NK':'NT'}}).then(r=>r.json()).then(t=>{const o={access_token:t.access_token,refresh_token:t.refresh_token,client_id:t.client_id};copy(JSON.stringify(o));console.log('Copied! Keys:',Object.keys(t))}).catch(e=>console.error('Failed:',e))"

def main():
    paste_mode = "--paste" in sys.argv

    if paste_mode:
        browser_paste_mode()
        return

    print("=== Garmin Login for claude-corre ===")
    print()

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
            print("ERROR: Garmin rate limit (429). Wait ~1 hour, then retry.")
            print()
            print("Or use the browser method RIGHT NOW:")
            print("  python3 garmin_login.py --paste")
        elif "401" in msg or "Authentication" in msg or "credentials" in msg.lower():
            print("ERROR: Wrong email or password.")
        else:
            print(f"ERROR: {e}")
        sys.exit(1)


def browser_paste_mode():
    print("=== Garmin Browser Token for claude-corre ===")
    print()
    print("STEP 1 - Open Chrome: https://connect.garmin.com/modern/")
    print("         (log in if needed - web login is never rate-limited)")
    print()
    print("STEP 2 - Open Console: Cmd+Option+J")
    print()
    print("STEP 3 - Paste this and press Enter:")
    print()
    print("  " + BROWSER_SNIPPET)
    print()
    print("         Token is now in your clipboard.")
    print()
    print("         If you see 'Failed:' in console, use Network tab instead:")
    print("           Network -> reload -> filter 'connectapi' -> any request ->")
    print("           Headers -> copy Authorization: Bearer <token> -> type: bearer")
    print()
    raw = input("STEP 4 - Paste token JSON here (or type 'bearer' for plain token): ").strip()
    print()

    if raw.lower() == "bearer":
        token_val = input("Paste the Bearer token value (without 'Bearer '): ").strip()
        token = {"access_token": token_val}
        print()
        print("Note: no refresh_token - expires in ~1 hour.")
        print("Run  python3 garmin_login.py  (no --paste) after rate limit clears.")
    else:
        try:
            token = json.loads(raw)
            if not token.get("access_token"):
                raise ValueError("no access_token field")
        except Exception as e:
            print(f"ERROR: {e}")
            print("Paste the full JSON from the browser snippet.")
            sys.exit(1)

    token_json = json.dumps(token)
    print()
    print("=== PASTE THIS IN SETTINGS -> Garmin OAuth2 token ===")
    print(token_json)
    print()
    try:
        subprocess.run(["pbcopy"], input=token_json.encode(), check=True)
        print("Token copied to clipboard. Switch to the app and Command+V.")
    except Exception:
        print("(Could not copy to clipboard - paste the JSON above manually.)")


def output_token(client):
    raw = json.loads(client.client.dumps())
    token = {
        "access_token": raw["di_token"],
        "refresh_token": raw["di_refresh_token"],
        "client_id": raw["di_client_id"],
    }
    token_json = json.dumps(token)
    print()
    print("=== PASTE THIS IN SETTINGS -> Garmin OAuth2 token ===")
    print(token_json)
    print()
    try:
        subprocess.run(["pbcopy"], input=token_json.encode(), check=True)
        print("Token copied to clipboard. Switch to the app and Command+V.")
    except Exception:
        print("(Could not copy to clipboard - paste the JSON above manually.)")


if __name__ == "__main__":
    main()
