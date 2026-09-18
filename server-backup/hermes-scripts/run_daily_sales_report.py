#!/usr/bin/env python3
"""Wrapper: read LOYVERSE_ACCESS_TOKEN from ~/.hermes/.env and run fetch_sales.py.

Self-contained (no /tmp token file, no shell secret handling).
Usage: python3 ~/.hermes/scripts/run_daily_sales_report.py
"""
import os
import subprocess
import sys

ENV_PATH = os.path.expanduser("~/.hermes/.env")
SCRIPT = os.path.expanduser("~/.hermes/skills/fetch_sales.py")


def read_token(name="LOYVERSE_ACCESS_TOKEN"):
    token = None
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line.startswith(name + "="):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    return token


def main():
    token = read_token()
    if not token:
        print("❌ LOYVERSE_ACCESS_TOKEN not found in ~/.hermes/.env", file=sys.stderr)
        sys.exit(1)
    os.environ["LOYVERSE_ACCESS_TOKEN"] = token
    result = subprocess.run([sys.executable, SCRIPT])
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
