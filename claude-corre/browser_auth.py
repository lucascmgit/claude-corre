#!/usr/bin/env python3
"""
Garmin browser-based authentication for Claude Corre.

Opens a real Chromium window. Log in normally. The script captures
the SSO ticket automatically and exchanges it for OAuth tokens.

The output is a single JSON blob you paste into Settings → Garmin Tokens.

Usage:
    python3 browser_auth.py

Requirements:
    pip install playwright requests requests-oauthlib
    playwright install chromium
"""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs

import requests
from requests_oauthlib import OAuth1Session
from playwright.sync_api import sync_playwright

OAUTH_CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json"
ANDROID_UA = "com.garmin.android.apps.connectmobile"

SSO_URL = (
    "https://sso.garmin.com/sso/embed"
    "?id=gauth-widget"
    "&embedWidget=true"
    "&gauthHost=https://sso.garmin.com/sso"
    "&clientId=GarminConnect"
    "&locale=en_US"
    "&redirectAfterAccountLoginUrl=https://sso.garmin.com/sso/embed"
    "&service=https://sso.garmin.com/sso/embed"
)


def get_oauth_consumer():
    resp = requests.get(OAUTH_CONSUMER_URL, timeout=10)
    resp.raise_for_status()
    return resp.json()


def get_oauth1_token(ticket: str, consumer: dict) -> dict:
    sess = OAuth1Session(consumer["consumer_key"], consumer["consumer_secret"])
    url = (
        f"https://connectapi.garmin.com/oauth-service/oauth/"
        f"preauthorized?ticket={ticket}"
        f"&login-url=https://sso.garmin.com/sso/embed"
        f"&accepts-mfa-tokens=true"
    )
    resp = sess.get(url, headers={"User-Agent": ANDROID_UA}, timeout=15)
    resp.raise_for_status()
    parsed = parse_qs(resp.text)
    token = {k: v[0] for k, v in parsed.items()}
    token["domain"] = "garmin.com"
    return token


def exchange_oauth2(oauth1: dict, consumer: dict) -> dict:
    sess = OAuth1Session(
        consumer["consumer_key"],
        consumer["consumer_secret"],
        resource_owner_key=oauth1["oauth_token"],
        resource_owner_secret=oauth1["oauth_token_secret"],
    )
    data = {}
    if oauth1.get("mfa_token"):
        data["mfa_token"] = oauth1["mfa_token"]
    resp = sess.post(
        "https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0",
        headers={
            "User-Agent": ANDROID_UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data=data,
        timeout=15,
    )
    resp.raise_for_status()
    token = resp.json()
    token["expires_at"] = int(time.time() + token["expires_in"])
    token["refresh_token_expires_at"] = int(
        time.time() + token["refresh_token_expires_in"]
    )
    return token


def browser_login() -> str:
    ticket = None

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto(SSO_URL)

        print()
        print("=" * 55)
        print("  A browser window has opened.")
        print("  Log in with your Garmin credentials.")
        print("  The window closes automatically when done.")
        print("=" * 55)
        print()

        max_wait = 300  # 5 minutes
        start = time.time()
        while time.time() - start < max_wait:
            try:
                content = page.content()
                m = re.search(r"ticket=(ST-[A-Za-z0-9\-]+)", content)
                if m:
                    ticket = m.group(1)
                    break
                url = page.url
                if "ticket=" in url:
                    m = re.search(r"ticket=(ST-[A-Za-z0-9\-]+)", url)
                    if m:
                        ticket = m.group(1)
                        break
            except Exception:
                pass
            page.wait_for_timeout(500)

        browser.close()

    if not ticket:
        print("ERROR: Timed out waiting for login (5 min). Try again.")
        sys.exit(1)

    return ticket


def verify_tokens(oauth2: dict) -> str:
    resp = requests.get(
        "https://connectapi.garmin.com/userprofile-service/socialProfile",
        headers={
            "User-Agent": "GCM-iOS-5.7.2.1",
            "Authorization": f"Bearer {oauth2['access_token']}",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("displayName", "unknown")


def to_clipboard(text: str):
    try:
        subprocess.run(["pbcopy"], input=text.encode(), check=True)
        return True
    except Exception:
        return False


if __name__ == "__main__":
    print()
    print("GARMIN AUTHENTICATION — Claude Corre")
    print("=" * 55)

    print("Fetching OAuth consumer credentials...")
    consumer = get_oauth_consumer()

    print("Launching browser...")
    ticket = browser_login()
    print(f"Got SSO ticket: {ticket[:30]}...")

    print("Exchanging ticket for OAuth1 token...")
    oauth1 = get_oauth1_token(ticket, consumer)

    print("Exchanging OAuth1 for OAuth2 token...")
    oauth2 = exchange_oauth2(oauth1, consumer)

    days = oauth2["refresh_token_expires_in"] // 86400
    print(f"OAuth2 token obtained. Refresh token valid for {days} days.")

    print("Verifying tokens against Garmin API...")
    name = verify_tokens(oauth2)
    print(f"Authenticated as: {name}")

    # Build the combined token blob for the app.
    # The server needs both oauth1 (for refresh) and oauth2 (for API calls).
    app_token = {
        "oauth1": {
            "oauth_token": oauth1["oauth_token"],
            "oauth_token_secret": oauth1["oauth_token_secret"],
            "domain": oauth1.get("domain", "garmin.com"),
        },
        "oauth2": oauth2,
    }

    # Also save individual files for compatibility
    token_dir = Path.home() / ".garmin_tokens"
    token_dir.mkdir(exist_ok=True)
    (token_dir / "oauth1_token.json").write_text(json.dumps(oauth1, indent=2))
    (token_dir / "oauth2_token.json").write_text(json.dumps(oauth2, indent=2))
    token_dir.chmod(0o700)

    app_json = json.dumps(app_token)

    print()
    print("=" * 55)
    print("  PASTE THIS IN THE APP: Settings → Garmin Tokens")
    print("=" * 55)
    print()
    print(app_json)
    print()

    if to_clipboard(app_json):
        print("Copied to clipboard! Go to the app → Settings → paste.")
    else:
        print("(Could not copy to clipboard — paste the JSON above manually.)")

    print()
    print(f"Tokens saved to {token_dir}")
    print(f"Refresh token valid for {days} days. The app auto-refreshes.")
    print("Re-run this script only if the app says tokens are fully expired.")
    print()
