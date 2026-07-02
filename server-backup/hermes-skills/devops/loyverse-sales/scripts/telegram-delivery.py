#!/usr/bin/env python3
"""
Telegram delivery script for Loyverse sales reports.
Sends a Markdown-formatted message to Hafizi via the Telegram Bot API.

Usage:
    python3 scripts/telegram-delivery.py "message text here"
    # or pipe: echo "msg" | python3 scripts/telegram-delivery.py

Environment variables are read from ~/.hermes/.env:
    TELEGRAM_BOT_TOKEN     — bot token from @BotFather
    TELEGRAM_ALLOWED_USERS — chat ID to send to
"""
import sys
import json
import subprocess
import urllib.request

ENV_PATH = "/home/hafizi145/.hermes/.env"


def get_env_var(name):
    """Extract a variable value from ~/.hermes/.env."""
    result = subprocess.run(
        ["grep", name, ENV_PATH],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().split("\n")
    if not lines or not lines[0]:
        raise RuntimeError(f"Could not find {name} in {ENV_PATH}")
    return lines[0].split("=", 1)[1].strip()


def send_telegram(text: str):
    """Send a Markdown message to the configured Telegram chat."""
    bot_token = get_env_var("TELEGRAM_BOT_TOKEN")
    chat_id = get_env_var("TELEGRAM_ALLOWED_USERS")

    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }).encode("utf-8")

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req, timeout=15)
    result = json.loads(resp.read().decode())

    if not result.get("ok"):
        raise RuntimeError(f"Telegram API error: {result}")

    print(f"✅ Sent (message_id: {result['result']['message_id']})")
    return result


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = sys.stdin.read().strip()

    if not message:
        print("❌ No message provided", file=sys.stderr)
        sys.exit(1)

    send_telegram(message)
