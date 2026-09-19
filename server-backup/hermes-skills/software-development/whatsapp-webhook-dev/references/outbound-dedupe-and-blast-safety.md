# Outbound Message Automation — Dedupe, Cooldown, Blast Safety

Sending side of WhatsApp Cloud API automation (reminders, alerts, invoices). The jobs that
break aren't the ones that crash — they're the ones that quietly re-send the **same message
to the same people every day**. Duplicated outbound traffic is what gets a WABA's quality
rating cut and the number limited, and `last_status=ok` looks perfectly healthy while it
happens. Liveness is NOT health; always report *what* a job sends, not that it ran.

## When to use

Any recurring/scheduled sender: pickup reminders, low-stock alerts, invoice or statement
dispatch, digests. If the job iterates a set of contacts and sends, it needs a dedupe key.

## 1. Give every outbound job a dedupe/cooldown key

- Key = the business identity of the row (`Repair ID`, order no, item+variant, invoice no).
  Never a row index, never a sheet-range position.
- Keep state **locally** — `~/.hermes/state/<job>_state.json`, chmod 600 — and **never write
  back into the customer's source system** (Sheet/AppSheet/CRM). Rollback then costs one
  `rm`, and a bad cooldown cannot corrupt the business record.
- Mark the key **only after a confirmed successful send** — in the same branch that increments
  the sent counter. Never in DRY_RUN (a test would silence real customers for a week), and
  never after a failed attempt (HTTP 400 / error 470 must retry next run).
- Write atomically: `<file>.tmp` → `os.replace` → `chmod 600`. Persist every ~25 sends so a
  crash mid-batch doesn't discard the whole batch's marks.
- Expose knobs as env vars so tuning needs no code edit:
  `_COOLDOWN_DAYS`, `_STATE=/path`, `MAX_PER_RUN` (0 = no cap).

```python
COOLDOWN_DAYS = float(os.environ.get("PICKUP_REMINDER_COOLDOWN_DAYS", "7"))
STATE_FILE = os.environ.get("PICKUP_REMINDER_STATE",
                            os.path.expanduser("~/.hermes/state/pickup_reminder_state.json"))

due, cooling = [], 0
for d in pending:
    tid = (d.get(TICKET_COL) or "?").strip()
    if days_since(state.get(tid), now) < COOLDOWN_DAYS:
        cooling += 1
        continue
    due.append(d)
```

## 2. Bootstrapping: the first install otherwise re-blasts

Shipping the fix does not stop the current wave — the state file starts empty, so the next
run repeats the whole set one more time. Seed it from the **last real run's log**, using that
script's success marker (e.g. `✅ Sent -> <phone> (<ID>)`), stamping each key with `now`.
606 keys seeded → next run becomes `skip 606 | send 15` instead of another 621-row blast.

Confirm the marker from the log before grepping: mismatched markers (a `✅ Sent` pattern where
the code prints `Sent ->`) silently yield zero matches and a fake "nothing to seed" result.

## 3. Testing ladder — escalating proof, zero real messages

| Level | What it proves | How |
|-------|----------------|-----|
| L1 | syntax | `<venv>/bin/python3 -m py_compile <script>` |
| L2 | skip/send partition correct | DRY_RUN against the **real** source + **real** state → expect exact `skip N | send M` |
| L3 | cooldown expiry works | backdate one key past the window → it must reappear as due |
| L4 | baseline blast size | empty state → documents what NOT to trigger |
| L5 | the **writing** path | import the module, swap its globals, call `main()` twice |

L5 is the only level that proves dedupe, because DRY_RUN deliberately never writes state:

```python
spec = importlib.util.spec_from_file_location("pr", SCRIPT)
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
mod.service_account = SimpleNamespace(Credentials=FakeCreds)   # from_service_account_file
mod.build = lambda *a, **k: FakeSheetsService(rows)            # .spreadsheets().values().get()
mod.send_whatsapp = lambda to, text: sent.append(to)           # recorder, no HTTP call
mod.preflight_check = lambda: True
mod.OWNER = ""                                                 # skip owner summary
mod.DRY_RUN = False
mod.STATE_FILE = "/tmp/<job>_e2e_state.json"                   # remove first
mod.main()   # run 1 → sends N and writes N state keys
mod.main()   # run 2 → sends 0  ← the proof
```

Copy-ready example: `hafjet-biz-ops` → `scripts/pickup_cooldown_e2e_test.py`.

## 4. Pitfalls

- **Use the venv python for anything importing `googleapiclient`**
  (`/home/hafizi145/hermes-agent/venv/bin/python3`). The system `/usr/bin/python3` lacks the
  Google libs and the script only prints an "install deps" line.
- **Filter value must match the SOURCE, not the prompt.** A cron prompt said
  `Status == 'SIAP DIAMBIL'`; the sheet only contains `SIAP` → literal use sends 0, silently.
  Print a `Counter` of the status column before trusting any job prompt, and watch for
  near-duplicate variants (`SEDIA DI AMBIL` vs `SIAP`) that a single-value filter misses.
- **Cron must call the env-bridging runner, not the raw script.** Vars such as
  `GOOGLE_SHEET_ID` / `OWNER_PHONE` are absent from `~/.hermes/.env` and live in the bot's
  `.env`; the runner injects them. If a job prompt names the raw script, fix the prompt —
  otherwise every run depends on the agent re-deriving env inline.
- **Don't assume a cap exists.** Wrappers typically set `MAX_PER_RUN` only when passed
  (`if args.max:`); the default is *no cap*, so "it's capped" is not a safety net.
- **A lost/empty state = full blast.** Verify the file exists and holds the expected key count
  before calling a fixed job safe.
- **Sheet cells with two numbers separated by `/`** fail every run (HTTP 400) and will show up
  as a constant failure count forever; that is a data-cleanup item for the owner, not
  something to paper over in code.

## 5. Reporting this class of fix

1. Blast size **before → after** with real numbers (621 → 15) and why it mattered
   (quality-rating / number limit risk).
2. When the cooling ends.
3. Rollback in one line.
4. The business-level open decision (prune old rows / add a `LAST_REMINDER_SENT` column),
   not a config detail.
