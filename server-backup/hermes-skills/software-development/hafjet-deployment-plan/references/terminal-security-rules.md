# Terminal Security Rules (Jul 2026)

Tuan Hafizi has explicitly rejected these patterns. Use file-based approaches instead.

## ❌ BANNED Patterns

### 1. Pipe `curl` ke interpreter
```bash
# ❌ BANNED — high-risk code injection surface
curl -s https://... | python3 -c "import json,sys; ..."
curl -s https://... | bash
```

**✅ Correct:**
```bash
# Two-step file-based approach
curl -s https://... -o /tmp/response.json
python3 /tmp/process_response.py

# Or: curl then cat/grep/jq separately
curl -s https://... -o /tmp/data.json
cat /tmp/data.json | jq '.access_token'
```

### 2. Password in command-line arguments
```bash
# ❌ BANNED — password visible in /proc/*/cmdline, ps aux, shell history
curl -X POST ... -d '{"email":"hafizi@hafjet.com","password":"admin123"}'
```

**✅ Correct:**
```bash
# Option A: Payload from file
echo '{"email":"hafizi@hafjet.com","password":"admin123"}' > /tmp/login_payload.json
curl -X POST ... -d @/tmp/login_payload.json
rm /tmp/login_payload.json

# Option B: Use environment variable (still visible in ps but not history)
# Only use if file approach isn't viable
```

## Why It Matters

- `curl | python3` → arbitrary code injection if the remote endpoint is compromised or MITM'd
- Password in `-d` → leaked to every `ps aux` / process monitor / audit log on the server
- Tuan explicitly rejected both: *"tak approve — sama sebab macam sebelum ini (pipe terus ke interpreter, high risk security pattern)"* and *"Password saya terdedah dalam command line/process list/logs"*

## For DB Queries

Prefer direct file-based DB access over HTTP API:
```bash
# ✅ Direct DB query (no auth, no HTTP, no password)
python3 -c "
import sqlite3
conn = sqlite3.connect('/tmp/remote_bot_data.db')
rows = conn.execute('SELECT ...').fetchall()
for r in rows: print(r)
conn.close()
"
```

This is faster AND safer than API login → token → query for debugging purposes.
