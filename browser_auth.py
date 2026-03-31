#!/usr/bin/env python3
"""
Garmin browser-based authentication.
Bypasses the Garmin SSO 429 block (active since March 17, 2026).

Opens a real Chromium window. Log in normally. The script captures
the SSO ticket automatically and exchanges it for OAuth tokens.
Tokens are cached to ~/.garmin_tokens/ for use by upload_workout.py.

Usage:
    python3 browser_auth.py

Requirements:
    pip install playwright requests-oauthlib
    playwright install chromium
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs

import requests
from requests_oauthlib import OAuth1Session
from playwright.sync_api import sync_playwright

OAUTH_CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json"
ANDROID_UA = "com.garmin.android.apps.connectmobile"
TOKEN_DIR = Path.home() / ".garmin_tokens"

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
    token["refresh_token_expires_at"] = int(time.time() + token["refresh_token_expires_in"])
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
                m = re.search(r'ticket=(ST-[A-Za-z0-9\-]+)', content)
                if m:
                    ticket = m.group(1)
                    break
                url = page.url
                if "ticket=" in url:
                    m = re.search(r'ticket=(ST-[A-Za-z0-9\-]+)', url)
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


def save_tokens(oauth1: dict, oauth2: dict):
    """Save tokens in garth format to ~/.garmin_tokens/"""
    TOKEN_DIR.mkdir(exist_ok=True)
    (TOKEN_DIR / "oauth1_token.json").write_text(json.dumps(oauth1, indent=2))
    (TOKEN_DIR / "oauth2_token.json").write_text(json.dumps(oauth2, indent=2))
    TOKEN_DIR.chmod(0o700)
    print(f"Tokens saved to {TOKEN_DIR}")


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


if __name__ == "__main__":
    print("Garmin Browser Authentication")
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

    days_until_refresh_expires = oauth2["refresh_token_expires_in"] // 86400
    print(f"OAuth2 token obtained. Refresh token valid for {days_until_refresh_expires} days.")

    print("Verifying tokens against Garmin API...")
    name = verify_tokens(oauth2)
    print(f"Authenticated as: {name}")

    save_tokens(oauth1, oauth2)

    print()
    print("Authentication successful.")
    print("Run: python3 upload_workout.py workouts/2026-04-02_easy_z2_4500m.json")
