#!/usr/bin/env python3
"""HAFJET Pickup Reminder — Cron Wrapper
Sourcing ~/.hermes/.env alone is not enough because the script uses
WHATSAPP_CLOUD_PHONE_ID / WHATSAPP_CLOUD_ACCESS_TOKEN (not the .env names).
This wrapper patches in the aliases before running the main script.
"""
import os
import sys
import subprocess

ENV_PATH = os.path.expanduser("~/.hermes/.env")

# 1. Read .env
if os.path.exists(ENV_PATH):
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ[key.strip()] = val.strip().strip("'").strip('"')

# 2. Patch variable names the script expects
os.environ.setdefault("WHATSAPP_CLOUD_PHONE_ID", os.environ.get("WHATSAPP_PHONE_ID", ""))
os.environ.setdefault("WHATSAPP_CLOUD_ACCESS_TOKEN", os.environ.get("WHATSAPP_ACCESS_TOKEN", ""))
os.environ.setdefault("GOOGLE_SHEET_ID", "1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE")
os.environ.setdefault("GOOGLE_SHEETS_CREDENTIALS", os.path.expanduser("~/.hermes/secrets/gsheet_sa.json"))
os.environ.setdefault("PICKUP_REMINDER_TAB", "REPAIR BARU")
os.environ.setdefault("PICKUP_REMINDER_STATUS_VALUE", "SIAP")
os.environ.setdefault("OWNER_PHONE", "60198021500")

# 3. Use DRY_RUN from .env OR this wrapper's default (1 for safety)
os.environ.setdefault("DRY_RUN", "1")

# 4. Run main script
script = os.path.expanduser(
    "~/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py"
)
proc = subprocess.run([sys.executable, script], timeout=600)
sys.exit(proc.returncode)
