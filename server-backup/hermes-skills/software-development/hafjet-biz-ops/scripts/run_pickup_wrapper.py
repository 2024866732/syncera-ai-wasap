#!/usr/bin/env python3
"""Wrapper: reads ~/.hermes/.env, sets DRY_RUN=0, runs the pickup reminder."""
import os
import sys
import subprocess

env_path = os.path.expanduser("~/.hermes/.env")
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        os.environ[key] = val

os.environ["DRY_RUN"] = "0"

script = os.path.expanduser(
    "~/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py"
)

# Use sys.executable and subprocess so output streams to our stdout/stderr
proc = subprocess.Popen([sys.executable, script], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for line in proc.stdout:
    print(line, end="", flush=True)
proc.wait()
sys.exit(proc.returncode)
