#!/usr/bin/env python3
"""
Wrapper: read LOYVERSE_ACCESS_TOKEN from temp file and run fetch_sales.py.

This avoids shell token-extraction issues where Hermes/Telegram masks
token values with '***', breaking grep|cut and $() subshells.

One-time setup:
    grep LOYVERSE_ACCESS_TOKEN ~/.hermes/.env | head -1 | cut -d= -f2- > /tmp/.loyverse_token

Usage:
    python3 scripts/run_sales.py
"""
import os
import sys
import subprocess

TOKEN_FILE = "/tmp/.loyverse_token"
SCRIPT = os.path.expanduser("~/.hermes/skills/fetch_sales.py")


def main():
    if not os.path.exists(TOKEN_FILE):
        print(f"❌ Token file not found: {TOKEN_FILE}", file=sys.stderr)
        print("Run this first:", file=sys.stderr)
        print(f"  grep LOYVERSE_ACCESS_TOKEN ~/.hermes/.env | head -1 | cut -d= -f2- > {TOKEN_FILE}",
              file=sys.stderr)
        sys.exit(1)

    with open(TOKEN_FILE) as f:
        token = f.read().strip()

    if not token:
        print(f"❌ Token file is empty: {TOKEN_FILE}", file=sys.stderr)
        sys.exit(1)

    os.environ["LOYVERSE_ACCESS_TOKEN"] = token
    result = subprocess.run([sys.executable, SCRIPT], capture_output=False)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
