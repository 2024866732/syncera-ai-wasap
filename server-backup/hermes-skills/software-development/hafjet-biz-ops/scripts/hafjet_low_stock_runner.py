#!/usr/bin/env python3
"""Safe runner for hafjet_low_stock_alert.py (cron + manual).

Bridges the env-var name gap documented in the skill:
  * the alert script wants  LOYVERSE_ACCESS_TOKEN / WHATSAPP_CLOUD_PHONE_ID /
    WHATSAPP_CLOUD_ACCESS_TOKEN / OWNER_PHONE / LOW_STOCK_THRESHOLD
  * ~/.hermes/.env stores     WHATSAPP_PHONE_ID / WHATSAPP_ACCESS_TOKEN and has
    NO OWNER_PHONE / LOW_STOCK_THRESHOLD at all.

Order of preference for WhatsApp creds: ~/.hermes/whatsapp-bot/.env (known-good
Phone ID) then ~/.hermes/.env. Loyverse token: main .env first, bot .env second.

Nothing is written to any .env, no shell redirection, no pipes. Secrets are never
printed — only lengths/HTTP status.

Usage:
  python3 hafjet_low_stock_runner.py --dry          # build + print, send nothing
  python3 hafjet_low_stock_runner.py                # live send to owner
  python3 hafjet_low_stock_runner.py --threshold 3  # override low-stock threshold
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

MAIN_ENV = "~/.hermes/.env"
BOT_ENV = "~/.hermes/whatsapp-bot/.env"
SCRIPT = ("/home/hafizi145/.hermes/skills/software-development/"
          "hafjet-biz-ops/scripts/hafjet_low_stock_alert.py")
VENV_PY = "/home/hafizi145/hermes-agent/venv/bin/python3"
DEFAULT_OWNER = "60198021500"


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


def preflight(phone_id, token):
    """Cheap credential probe: GET /v21.0/{PHONE_ID}. Prints status only."""
    url = f"https://graph.facebook.com/v21.0/{phone_id}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
            return f"HTTP {r.status} (credential ok)"
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(body).get("error", {})
            detail = "code=%s subcode=%s msg=%s" % (
                err.get("code"), err.get("error_subcode"), err.get("message"))
        except Exception:
            detail = "unparseable body"
        return f"HTTP {exc.code} ({detail})"
    except Exception as exc:  # network/timeout
        return f"probe failed: {type(exc).__name__}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true",
                    help="build + print the WhatsApp payload, send nothing")
    ap.add_argument("--threshold", type=int, default=None)
    ap.add_argument("--max-items", type=int, default=None,
                    help="override LOW_STOCK_ALERT_MAX_ITEMS_PER_STORE (default 25)")
    ap.add_argument("--skip-preflight", action="store_true")
    args = ap.parse_args()

    main_env = load_env(MAIN_ENV)
    bot_env = load_env(BOT_ENV)

    env = {
        "LOYVERSE_ACCESS_TOKEN": main_env.get("LOYVERSE_ACCESS_TOKEN")
        or bot_env.get("LOYVERSE_ACCESS_TOKEN"),
        "WHATSAPP_CLOUD_PHONE_ID": bot_env.get("WHATSAPP_PHONE_ID")
        or main_env.get("WHATSAPP_PHONE_ID"),
        "WHATSAPP_CLOUD_ACCESS_TOKEN": bot_env.get("WHATSAPP_ACCESS_TOKEN")
        or main_env.get("WHATSAPP_ACCESS_TOKEN"),
        "OWNER_PHONE": os.environ.get("OWNER_PHONE")
        or main_env.get("OWNER_PHONE") or DEFAULT_OWNER,
        "LOW_STOCK_THRESHOLD": str(args.threshold or
                                   os.environ.get("LOW_STOCK_THRESHOLD") or 5),
        "LOW_STOCK_ALERT_MAX_ITEMS_PER_STORE": str(args.max_items or
                                                   os.environ.get("LOW_STOCK_ALERT_MAX_ITEMS_PER_STORE") or 25),
        "DRY_RUN": "1" if args.dry else "0",
    }
    missing = [k for k, v in env.items() if not v or v == "None"]
    if missing:
        print("❌ Missing env for runner:", missing)
        return 1
    if not os.path.exists(SCRIPT):
        print("❌ Alert script not found:", SCRIPT)
        return 1

    print(f"DRY_RUN={env['DRY_RUN']} threshold={env['LOW_STOCK_THRESHOLD']} "
          f"max_per_store={env['LOW_STOCK_ALERT_MAX_ITEMS_PER_STORE']} "
          f"phone_id_len={len(env['WHATSAPP_CLOUD_PHONE_ID'])} "
          f"loyverse_token_len={len(env['LOYVERSE_ACCESS_TOKEN'])}")

    if not args.skip_preflight:
        print("preflight (WhatsApp creds):",
              preflight(env["WHATSAPP_CLOUD_PHONE_ID"], env["WHATSAPP_CLOUD_ACCESS_TOKEN"]))

    merged = dict(os.environ)
    merged.update(env)
    for k in list(merged):
        if k.startswith("COLUMN_NAME_"):
            merged.pop(k)

    py = VENV_PY if os.path.exists(VENV_PY) else sys.executable
    r = subprocess.run([py, SCRIPT], env=merged, cwd="/home/hafizi145")
    print("runner exit:", r.returncode)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
