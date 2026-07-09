# Kudu VFS — Direct DB Patching on Azure

When you need to modify the remote SQLite DB (`/home/data/bot_data.db`) directly
(e.g., pause orders, fix corrupted records), use Kudu VFS download/patch/upload.

## The Pattern

```
1. DOWNLOAD → 2. PATCH (Python sqlite3) → 3. UPLOAD (If-Match: *)
```

## Step-by-Step

### 1. Get Kudu Token
```bash
az account get-access-token --resource "https://management.azure.com" \
  --query "accessToken" -o tsv > /tmp/kudu_token.txt
```

### 2. Download Fresh DB
```bash
TOKEN=*** /tmp/kudu_token.txt | tr -d '\n')
curl -s -H "Authorization: Bearer *** \
  -o /tmp/remote_bot_data.db \
  "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/data/bot_data.db"
```

### 3. Patch via Python (avoid bash quoting hell)
```python
import sqlite3
conn = sqlite3.connect("/tmp/remote_bot_data.db")
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("UPDATE spx_self_collection_orders SET is_paused=1 WHERE spx_tracking_number=?", ("SPXMY...",))
conn.commit()
# VERIFY before upload
rows = conn.execute("SELECT ...").fetchall()
print(rows)
conn.close()
```

### 4. Upload with If-Match: *
```bash
curl -s -X PUT \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/octet-stream" \
  -H "If-Match: *" \
  --data-binary @/tmp/remote_bot_data.db \
  "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/data/bot_data.db" \
  -w "\nHTTP %{http_code}"
```

## Critical: If-Match: *

**Without `If-Match: *`**, you get HTTP 412 (ETag conflict) if the sync process
modified the DB between your download and upload. The sync process writes to the
same DB file, so ETag conflicts are common.

**With `If-Match: *`**, you force the upload regardless of ETag. Use this ONLY
when you've patched specific rows (not structural changes) to minimize risk of
race conditions.

## Pitfalls

| Issue | Fix |
|-------|-----|
| HTTP 412 on upload | Add `-H "If-Match: *"` header |
| DB locked by sync | Retry loop (max 3 attempts, 2s delay) |
| Upload overwrites sync's new orders | Minimize time between download and upload |
| Python script lint errors with f-strings containing `"Bearer"` | Use `.format()` or string concatenation instead of f-strings |

## Verification After Upload

Always re-download and query to confirm:
```python
# After upload
curl ... -o /tmp/verify.db ...
python3 -c "
import sqlite3
conn = sqlite3.connect('/tmp/verify.db')
rows = conn.execute('SELECT ...').fetchall()
for r in rows: print(r)
"
```

**Don't trust the upload HTTP status alone** — 204 means Kudu accepted the file,
not that your changes persisted through any subsequent sync write.
