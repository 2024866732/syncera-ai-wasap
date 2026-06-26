#!/usr/bin/env python3
"""Run fetch_sales_30days.py with token from .env"""
import subprocess
import sys
import os

env_path = os.path.expanduser("~/.hermes/.env")
script_path = os.path.expanduser("~/.hermes/skills/fetch_sales_30days.py")

token = None
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line.startswith("LOYVERSE_ACCESS_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

if not token:
    print("ERROR: LOYVERSE_ACCESS_TOKEN not found", file=sys.stderr)
    sys.exit(1)

print(f"Token loaded: {len(token)} chars", file=sys.stderr)
os.environ["LOYVERSE_ACCESS_TOKEN"] = token

result = subprocess.run([sys.executable, script_path], capture_output=False)
sys.exit(result.returncode)
