# Remote DB Verification (Azure App Service)

When an API endpoint claims it wrote data to the database, the API response alone
is NOT sufficient verification. You MUST download the remote DB and query raw values.

## The Pattern

```
API response says "mapped: 2" → Download DB via Kudu → Query raw values → VERIFY
```

## Quick Verification Script

```python
import subprocess, sqlite3, pathlib

token = pathlib.Path("/tmp/kudu_token.txt").read_text().strip()
auth = "Authorization: Bearer *** + token

# Download
subprocess.run([
    "curl", "-s", "-H", auth, "-o", "/tmp/verify_db.db",
    "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/data/bot_data.db"
], check=True)

# Query raw values
conn = sqlite3.connect("/tmp/verify_db.db")
conn.row_factory = sqlite3.Row
rows = conn.execute(
    "SELECT spx_tracking_number, recipient_phone "
    "FROM spx_self_collection_orders "
    "WHERE spx_tracking_number IN ('SPXMY061509414257', 'SPXMY064037299837')"
).fetchall()
for r in rows:
    print("{}: phone='{}' (len={})".format(r["spx_tracking_number"], r["recipient_phone"], len(r["recipient_phone"] or "")))
conn.close()
```

## Real Example (Jul 2026)

**Claim:** `POST /api/spx/phones/bulk` returned `{"mapped": 2}` — endpoint said both phones updated.

**Verification:** Downloaded remote DB via Kudu VFS, queried raw values:
```
SPXMY061509414257: phone='+601****6789' (len=12)  ← LITERAL ASTERISKS
SPXMY064037299837: phone='+601****6791' (len=12)  ← LITERAL ASTERISKS
```

**Reality:** DB still had SPX-masked values from original sync. `bulk_map_phones()` on the remote instance
either didn't run (stale `db_logger.py`) or the commit didn't persist.

**Lesson:** `mapped: 2` was a lie. Always verify DB writes by downloading and querying the remote DB directly.

## Why API Responses Lie

| Cause | Why it happens |
|-------|---------------|
| Stale module | `db_logger.py` wasn't deployed — old version returns success but doesn't commit |
| DB path mismatch | Remote uses different `DB_PATH` than expected |
| Write conflict | Sync process overwrote between write and your read |
| Connection isolation | WAL mode — write committed to WAL but not yet checkpointed to main DB |
