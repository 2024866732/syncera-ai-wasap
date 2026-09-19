#!/usr/bin/env python3
"""E2E cooldown test — sheet PALSU + send PALSU. Tiada WhatsApp sebenar, tiada Sheet sebenar.

Bukti yang dicari:
  Run 1 -> 3 mesej "dihantar" + state ditulis untuk ID-T1..T3
  Run 2 (serta-merta) -> 0 mesej, semua di-skip cooldown  <-- inilah dedupe
"""
import importlib.util, json, os, types

SCRIPT = "/home/hafizi145/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py"
STATE = "/tmp/pickup_state_e2e.json"

os.environ.update({
    "GOOGLE_SHEET_ID": "FAKE", "GOOGLE_SHEETS_CREDENTIALS": "/tmp/fake.json",
    "WHATSAPP_CLOUD_PHONE_ID": "123", "WHATSAPP_CLOUD_ACCESS_TOKEN": "FAKE",
    "PICKUP_REMINDER_STATUS_VALUE": "SIAP",
})
if os.path.exists(STATE):
    os.remove(STATE)

spec = importlib.util.spec_from_file_location("pr_under_test", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# ---- palsukan Sheets ----
ROWS = [
    ["Repair ID", "NAMA CUSTOMER", "NO TELEFON", "Status", "TARIKH AMBIL"],
    ["ID-T1", "Ali",  "0123456789", "SIAP", "2026-09-10"],
    ["ID-T2", "Abu",  "0123456790", "SIAP", "2026-09-11"],
    ["ID-T3", "Siti", "0123456791", "SIAP", "2026-09-12"],
]
class _Val:
    def get(self, **kw): return self
    def execute(self): return {"values": ROWS}
class _SS:
    def values(self): return _Val()
class _Svc:
    def spreadsheets(self): return _SS()

mod.service_account = types.SimpleNamespace(
    Credentials=types.SimpleNamespace(from_service_account_file=lambda p, scopes=None: object()))
mod.build = lambda *a, **k: _Svc()

# ---- palsukan send ----
sent = []
mod.send_whatsapp = lambda to, text: sent.append(to)
mod.preflight_check = lambda: True
mod.DRY_RUN = False
mod.OWNER = ""
mod.STATE_FILE = STATE

print("### RUN 1 (state kosong)")
mod.main()
r1 = list(sent)
print("   mesej dihantar:", len(r1), r1)
state = json.load(open(STATE))
print("   state ditulis:", len(state), "->", sorted(state))

print("### RUN 2 (serta-merta, state dah ada)")
sent.clear()
mod.main()
print("   mesej dihantar:", len(sent), sent)
print("   state kekal:", len(json.load(open(STATE))))

print("### KEPUTUSAN")
ok = (len(r1) == 3 and len(sent) == 0 and len(state) == 3)
print("   dedupe cooldown:", "✅ LULUS" if ok else "❌ GAGAL")
