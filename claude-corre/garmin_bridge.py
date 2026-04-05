#!/usr/bin/env python3
"""
Local Garmin token bridge — run this once, leave it running.

  python3 garmin_bridge.py

Listens on http://localhost:9876. When your claude-corre app detects an
expired Garmin token it calls this bridge (residential IP) to get a fresh
one, saves it to the server, and retries the push — all transparently.

Requirements: pip install garth
"""
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 9876

def refresh():
    try:
        import garth
        from garth import sso
    except ImportError:
        return None, "garth not installed — run: pip install garth"
    try:
        client = garth.Client()
        client.load("~/.garth")
        fresh = sso.exchange(client.oauth1_token, client)
        client.oauth2_token = fresh
        client.dump("~/.garth")
        return fresh.dict, None
    except Exception as e:
        return None, str(e)

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")

        elif self.path == "/refresh":
            token, err = refresh()
            if token:
                body = json.dumps(token).encode()
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)
                print("✓ Token refreshed and sent to app")
            else:
                body = json.dumps({"error": err}).encode()
                self.send_response(500)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)
                print(f"✗ Refresh failed: {err}")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, fmt, *args):
        pass  # suppress default access logs

if __name__ == "__main__":
    try:
        server = HTTPServer(("127.0.0.1", PORT), Handler)
        print(f"Garmin bridge running on http://localhost:{PORT}")
        print("Leave this running. The app will call it automatically when tokens expire.")
        print("Stop with Ctrl+C\n")
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"Port {PORT} already in use — bridge is already running.")
            sys.exit(0)
        raise
