#!/usr/bin/env python3
"""
Full endpoint verification for hafjet-whatsapp-bot
Run after deploy or quota reset to confirm all endpoints are working.

Usage:
  python3 scripts/verify_endpoints.py
  python3 scripts/verify_endpoints.py --base https://other-host.example.com
"""

import urllib.request
import json
import sys
import argparse
import asyncio

def parse_args():
    parser = argparse.ArgumentParser(description="Verify hafjet-whatsapp-bot endpoints")
    parser.add_argument("--base", default="https://hafjet-whatsapp-bot.azurewebsites.net",
                        help="Base URL of the bot")
    parser.add_argument("--ws-only", action="store_true", help="Only test WebSocket")
    parser.add_argument("--skip-ws", action="store_true", help="Skip WebSocket test")
    return parser.parse_args()

def main():
    args = parse_args()
    BASE = args.base

    tests = [
        ("GET /health", f"{BASE}/health", "GET", None, 200),
        ("GET /dashboard", f"{BASE}/dashboard", "GET", None, 200),
        ("GET /api/stats", f"{BASE}/api/stats", "GET", None, 200),
        ("GET /api/customers", f"{BASE}/api/customers", "GET", None, 200),
        ("GET /api/settings", f"{BASE}/api/settings", "GET", None, 200),
        ("GET /webhook (with token)", f"{BASE}/webhook?hub.verify_token=HAFJET_RAUB_RAK&hub.challenge=test", "GET", None, 200),
        ("GET /webhook (no token)", f"{BASE}/webhook", "GET", None, 403),
    ]

    # POST /webhook with simulated signature
    payload = json.dumps({
        "object": "page",
        "entry": [{"id": "123", "changes": [{"field": "messages", "value": {
            "from": {"id": "1"}, "message": {"text": "test"}
        }}]}]
    }).encode()
    tests.append(("POST /webhook (with signature)", f"{BASE}/webhook", "POST", payload, 200))

    failures = 0
    for label, url, method, body, expected in tests:
        try:
            req = urllib.request.Request(url, data=body, method=method)
            if body:
                req.add_header("Content-Type", "application/json")
                req.add_header("X-Hub-Signature-256", "sha256=test")
            resp = urllib.request.urlopen(req, timeout=10)
            actual = resp.status
        except urllib.error.HTTPError as e:
            actual = e.code
        except Exception as e:
            actual = f"ERR:{type(e).__name__}"

        status = "PASS" if actual == expected else "FAIL"
        if status == "FAIL":
            failures += 1
        print(f"  [{status}] {label}: expected={expected}, actual={actual}")

    # WebSocket check
    if not args.skip_ws:
        ws_result = test_websocket(BASE)
        print(f"\nWebSocket: {ws_result}")
        if ws_result.startswith("FAIL"):
            failures += 1

    print(f"\nResult: {len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)

def test_websocket(base):
    """Test WebSocket /ws endpoint"""
    try:
        import websockets
    except ImportError:
        return "SKIP (websockets not installed — pip install websockets)"

    async def ws_test():
        ws_url = base.replace("https://", "wss://") + "/ws"
        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({"type": "ping"}))
            resp = await asyncio.wait_for(ws.recv(), timeout=5)
            return f"CONNECTED (received: {resp[:80]})"

    try:
        return asyncio.run(ws_test())
    except asyncio.TimeoutError:
        return "FAIL (timeout — no response within 5s)"
    except Exception as e:
        return f"FAIL ({type(e).__name__}: {e})"

if __name__ == "__main__":
    main()
