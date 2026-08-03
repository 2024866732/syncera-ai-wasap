#!/usr/bin/env python3
"""Safe runner for hafjet_pickup_reminder.py.
Sources WhatsApp creds from bot .env (valid) as WHATSAPP_CLOUD_*,
injects known-good constants, runs script via venv python.
Usage: python3 run_pickup.py [--dry] [--max N]
"""
import os, sys, subprocess, argparse

def load_env(path):
    d = {}
    try:
        with open(os.path.expanduser(path)) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                d[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return d

ap = argparse.ArgumentParser()
ap.add_argument("--dry", action="store_true")
ap.add_argument("--max", type=int, default=None)
args = ap.parse_args()

bot = load_env("~/.hermes/whatsapp-bot/.env")

env = {
    # WhatsApp creds: prefer bot .env (valid Phone ID) mapped to CLOUD_* names
    "WHATSAPP_CLOUD_PHONE_ID": bot.get("WHATSAPP_PHONE_ID"),
    "WHATSAPP_CLOUD_ACCESS_TOKEN": bot.get("WHATSAPP_ACCESS_TOKEN"),
    # Known-good constants
    "GOOGLE_SHEET_ID": "1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE",
    "GOOGLE_SHEETS_CREDENTIALS": "/home/hafizi145/.hermes/secrets/gsheet_sa.json",
    "PICKUP_REMINDER_TAB": "REPAIR BARU",
    "PICKUP_REMINDER_STATUS_VALUE": "SIAP",
    "OWNER_PHONE": "60198021500",
}
if args.dry:
    env["DRY_RUN"] = "1"
if args.max:
    env["MAX_PER_RUN"] = str(args.max)

missing = [k for k, v in env.items() if not v]
if missing:
    print("❌ Missing env for runner:", missing)
    sys.exit(1)

merged = dict(os.environ)
merged.update({k: v for k, v in env.items() if v})
# strip any stale COLUMN_NAME overrides
for k in list(merged):
    if k.startswith("COLUMN_NAME_"):
        merged.pop(k)

py = "/home/hafizi145/hermes-agent/venv/bin/python3"
script = "/home/hafizi145/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py"
print("DRY_RUN=" + str(args.dry), "PhoneID_len=%d" % len(env["WHATSAPP_CLOUD_PHONE_ID"]))
r = subprocess.run([py, script], env=merged, cwd="/home/hafizi145")
print("runner exit:", r.returncode)
sys.exit(r.returncode)