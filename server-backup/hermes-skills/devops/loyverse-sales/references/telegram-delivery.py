#!/usr/bin/env python3
"""
telegram-delivery.py — Send a message to Telegram via Bot API.
Usage: python3 telegram_delivery.py "message text here"
       python3 telegram_delivery.py --file /path/to/message.txt

Reads TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USERS from ~/.hermes/.env.
Uses only Python stdlib — no pip install required.
"""

import sys
import os
import json
import subprocess
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ENV_PATH = os.path.expanduser("~/.hermes/.env")


def get_env_var(name):
    """Extract a single value from .env file."""
    result = subprocess.run(
        ["grep", name, ENV_PATH],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().split("\n")
    if lines and "=" in lines[0]:
        return lines[0].split("=", 1)[1].strip()
    return ""


def send_telegram(message, parse_mode="Markdown"):
    """Send a message to Telegram. Returns the API response dict."""
    bot_token = get_env_var("TELEGRAM_BOT_TOKEN")
    chat_id = get_env_var("TELEGRAM_ALLOWED_USERS")

    if not bot_token or not chat_id:
        print("❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USERS in .env", file=sys.stderr)
        sys.exit(1)

    payload = json.dumps({
        "chat_id": chat_id,
        "text": message,
        "parse_mode": parse_mode
    }).encode("utf-8")

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    req = Request(url, data=payload, headers={"Content-Type": "application/json"})

    try:
        with urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())
            if result.get("ok"):
                print(f"✅ Sent (message_id: {result['result']['message_id']})")
            else:
                print(f"❌ Failed: {result}", file=sys.stderr)
            return result
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"❌ HTTP {e.code}: {body}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"❌ URL Error: {e.reason}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 telegram_delivery.py <message>")
        print("       python3 telegram_delivery.py --file <path>")
        sys.exit(1)

    if sys.argv[1] == "--file":
        with open(sys.argv[2], "r") as f:
            msg = f.read()
    else:
        msg = sys.argv[1]

    send_telegram(msg)
