#!/usr/bin/env python3
"""
Refresh your Garmin OAuth2 token.

Run this whenever the app shows "Garmin token expired":
  python3 refresh_token.py

It loads your existing garth session (~/.garth/), refreshes the access_token
using your residential IP, and prints the new token to paste in Settings.
"""
import json
import sys

try:
    import garth
except ImportError:
    print("garth not installed. Run:  pip install garth")
    sys.exit(1)

try:
    client = garth.Client()
    client.load("~/.garth")

    # Accessing oauth2_token triggers auto-refresh if expired
    token = client.oauth2_token
    if not token:
        raise Exception("No OAuth2 token found. Run browser_auth.py first.")

    # Force a fresh exchange to get a valid access_token
    from garth import sso
    fresh = sso.exchange(client.oauth1_token, client)
    client.oauth2_token = fresh
    client.dump("~/.garth")

    print("\n✓ Token refreshed!\n")
    print("Paste this in Settings → Garmin OAuth2 token:\n")
    print(json.dumps(fresh.dict, indent=2))

except AttributeError:
    # Newer garth versions may store tokens differently
    try:
        token_dict = json.loads(client.dumps())
        oauth2 = token_dict.get("oauth2_token") or token_dict
        print("\n✓ Session loaded. Paste this in Settings → Garmin OAuth2 token:\n")
        print(json.dumps(oauth2, indent=2))
    except Exception as e2:
        print(f"Could not extract token: {e2}")
        print("Run browser_auth.py to do a full re-login.")
        sys.exit(1)

except FileNotFoundError:
    print("No garth session found at ~/.garth/")
    print("Run browser_auth.py first to do the initial login.")
    sys.exit(1)

except Exception as e:
    print(f"Refresh failed: {e}")
    print("Run browser_auth.py to do a full re-login.")
    sys.exit(1)
