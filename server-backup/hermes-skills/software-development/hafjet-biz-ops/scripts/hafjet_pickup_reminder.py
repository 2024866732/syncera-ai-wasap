#!/usr/bin/env python3
"""
HAFJET Pickup Reminder - Google Sheets (AppSheet backend) + WhatsApp Cloud API
SOP: reads env vars (set manually by owner), writes NO .env, no pipe execution.

Tab: REPAIR BARU  (range "REPAIR BARU!A1:Z1000")
Column mapping defaults (override via env if your sheet differs):
  COLUMN_NAME_CUSTOMER = NAMA CUSTOMER
  COLUMN_NAME_PHONE    = NO_PHONE
  COLUMN_NAME_STATUS   = STATUS_REPAIR
  COLUMN_NAME_TICKET   = NO_REPAIR
  COLUMN_NAME_READY    = TARIKH_SIAP
Status filter value (override if different):
  PICKUP_REMINDER_STATUS_VALUE = SIAP DIAMBIL

Behaviour:
  - Filter STATUS == value -> pending pickup
  - Send free-form WhatsApp text to CUSTOMER (NO_PHONE), NOT owner
  - On WhatsApp error 470 (24h window), log + skip (template needed later)
  - DRY_RUN=1 -> read + print only, NO WhatsApp send (safe test)
  - Optional owner summary of pending count
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
except ImportError:
    sys.exit("❌ Install deps: /home/hafizi145/hermes-agent/venv/bin/pip install google-api-python-client google-auth-httplib2 google-auth")

# ---------- Config (env, owner sets manually) ----------
SHEET_ID = os.environ.get("GOOGLE_SHEET_ID")
SA_JSON  = os.environ.get("GOOGLE_SHEETS_CREDENTIALS")
TAB      = os.environ.get("PICKUP_REMINDER_TAB", "REPAIR BARU")
PHONE_ID = os.environ.get("WHATSAPP_CLOUD_PHONE_ID")
TOKEN    = os.environ.get("WHATSAPP_CLOUD_ACCESS_TOKEN")
OWNER    = os.environ.get("OWNER_PHONE")  # optional summary target
DRY_RUN  = os.environ.get("DRY_RUN", "0") == "1"

# Column names (override via env if your sheet uses different headers)
# Defaults match AppSheet tab "REPAIR BARU" headers
NAME_COL   = os.environ.get("COLUMN_NAME_CUSTOMER", "NAMA CUSTOMER")
PHONE_COL  = os.environ.get("COLUMN_NAME_PHONE", "NO TELEFON")
STATUS_COL = os.environ.get("COLUMN_NAME_STATUS", "Status")
TICKET_COL = os.environ.get("COLUMN_NAME_TICKET", "Repair ID")
READY_COL  = os.environ.get("COLUMN_NAME_READY", "TARIKH AMBIL")
READY_VALUE = os.environ.get("PICKUP_REMINDER_STATUS_VALUE", "SIAP DIAMBIL").strip().upper()

for k, v in [("GOOGLE_SHEET_ID", SHEET_ID), ("GOOGLE_SHEETS_CREDENTIALS", SA_JSON),
             ("WHATSAPP_CLOUD_PHONE_ID", PHONE_ID), ("WHATSAPP_CLOUD_ACCESS_TOKEN", TOKEN)]:
    if not v:
        sys.exit(f"❌ Missing env: {k}")

RANGE = f"{TAB}!A1:Z1000"


def norm_phone(p: str) -> str:
    """Normalize MY phone to 6012xxxxxxx (no +, no spaces, leading 0 -> 6)."""
    if not p:
        return ""
    p = p.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if p.startswith("+"):
        p = p[1:]
    if p.startswith("0"):
        p = "6" + p
    return p


def send_whatsapp(to: str, text: str):
    """Send free-form text via Cloud API. Raise on failure (caller logs 470)."""
    url = f"https://graph.facebook.com/v21.0/{PHONE_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": text},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {TOKEN}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def main():
    print(f"🔧 Tab='{TAB}' | Status filter='{READY_VALUE}' | DRY_RUN={DRY_RUN}")

    # 1. Connect Sheets
    creds = service_account.Credentials.from_service_account_file(
        SA_JSON, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    svc = build("sheets", "v4", credentials=creds)

    # 2. Read tab
    result = svc.spreadsheets().values().get(spreadsheetId=SHEET_ID, range=RANGE).execute()
    rows = result.get("values", [])
    if not rows:
        print("⚠️ Sheet kosong atau tab salah")
        return
    header = rows[0]
    print(f"📑 Header: {header}")
    data = [dict(zip(header, r)) for r in rows[1:] if any(c.strip() for c in r)]

    # 3. Filter
    pending = [d for d in data if (d.get(STATUS_COL) or "").strip().upper() == READY_VALUE]
    print(f"📋 Total rows: {len(data)} | Pending pickup ('{READY_VALUE}'): {len(pending)}")

    sent = 0
    failed = []
    for d in pending:
        name  = (d.get(NAME_COL) or "Pelanggan").strip()
        phone = norm_phone(d.get(PHONE_COL))
        tid   = (d.get(TICKET_COL) or "?").strip()
        since = (d.get(READY_COL) or "").strip()
        if not phone:
            failed.append((tid, "no_phone"))
            print(f"  ⚠️ Skip {tid} — no phone")
            continue
        body = (
            f"Hai {name}, 😊\n\n"
            f"Ini hanya reminder lembut untuk pickup peranti anda "
            f"(rujukan {tid}) di HAFJET.\n"
            f"Status: *Siap untuk diambil* sejak {since}.\n\n"
            f"Jika anda perlukan masa tambahan atau wakil untuk pickup, "
            f"balas mesej ini ya.\nTerima kasih! 🙏"
        )
        if DRY_RUN:
            print(f"  🧪 DRY_RUN -> {phone} ({tid}): {body[:50]}...")
            sent += 1
            continue
        try:
            send_whatsapp(phone, body)
            sent += 1
            print(f"  ✅ Sent -> {phone} ({tid})")
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            if "470" in err:
                failed.append((tid, "24h_window_blocked (470)"))
                print(f"  ⚠️ 470 blocked -> {phone} ({tid}) [log saja]")
            else:
                failed.append((tid, f"http_{e.code}"))
                print(f"  ❌ HTTP {e.code} -> {phone} ({tid})")
        except Exception as e:
            failed.append((tid, str(e)[:60]))
            print(f"  ❌ ERR {e} -> {phone} ({tid})")

    # 4. Owner summary (optional)
    if OWNER and (sent or failed) and not DRY_RUN:
        summary = (f"📦 *Pickup Reminder Summary*\n"
                   f"Tarikh: {datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')} MYT\n"
                   f"✅ Dihantar: {sent}\n"
                   f"⚠️ Gagal/470: {len(failed)}")
        if failed:
            sample = "\n".join(f"  • {t} — {r}" for t, r in failed[:5])
            summary += f"\n\nContoh gagal:\n{sample}"
        try:
            send_whatsapp(norm_phone(OWNER), summary)
            print(f"📊 Owner summary sent -> {OWNER}")
        except Exception as e:
            print(f"⚠️ Owner summary failed: {e}")

    print(f"\n🏁 Done. Sent={sent} Failed={len(failed)}")


if __name__ == "__main__":
    main()
