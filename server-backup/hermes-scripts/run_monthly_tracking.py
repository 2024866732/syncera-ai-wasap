#!/usr/bin/env python3
"""Wrapper: read Loyverse token from .env and run monthly_tracking.py"""
import os
import sys
import subprocess

# Read token from .env
env_path = os.path.expanduser("~/.hermes/.env")
token = None
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if line.startswith("LOYVERSE_ACCESS_TOKEN="):
                token = line.split("=", 1)[1].strip()
                break

if not token:
    print("❌ LOYVERSE_ACCESS_TOKEN tak jumpa dalam .env")
    sys.exit(1)

os.environ["LOYVERSE_ACCESS_TOKEN"] = token

script = os.path.expanduser("~/.hermes/skills/monthly_tracking.py")
result = subprocess.run([sys.executable, script], capture_output=False)
sys.exit(result.returncode)
