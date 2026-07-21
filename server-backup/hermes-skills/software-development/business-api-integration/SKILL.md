---
name: business-api-integration
description: Patterns and pitfalls for integrating with business/ERP APIs (POS, accounting, CRM). Activates when building scripts that call business APIs like Loyverse, QuickBooks, Xero, or similar SaaS platforms. Covers auth patterns, pagination quirks, rate limits, credential security, and common HTTP error codes.
---

# Business API Integration Patterns

Integration with business SaaS APIs (POS, accounting, CRM) has recurring pitfalls. This skill captures the patterns so future sessions don't re-learn them.

## Credential Security (CRITICAL)

**Never accept credentials in chat.** When a user offers to share API tokens, passwords, or access keys directly in the conversation:

1. **Decline politely** — explain that chat history persists and credentials in plain text are a security risk
2. **Prefer the `.env` file pattern** — ask the user to add the token to `~/.hermes/.env` themselves:
3. **If the user insists** — accept it, but mask it in all responses (show only first/last 4 chars), and remind them to rotate the token after use
4. **Never log credentials** in tool output, debug prints, or error messages

### ⛔ NEVER pipe curl to interpreter (CRITICAL — HAFJET policy)

**Pattern:** `curl <url> | python3` — piping downloaded content directly to an interpreter.

**This is ALWAYS rejected.** Tuan Hafizi explicitly prohibits this:
- Downloaded code executed without inspection = arbitrary code execution
- Credentials exposed in command line, process list, and shell history
- Even for trusted URLs, the pattern is inherently unsafe

**Approved alternatives:**
1. **Save to file, then execute:** `curl -o /tmp/resp.json <url>` → then `python3 -c "..."` reading the file
2. **Use grep/jq for extraction:** `curl <url> | grep -o '"key":"[^"]*"'` (no interpreter pipe)
3. **Use Python with urllib:** Write a proper Python script that fetches and processes — no shell pipes
4. **Direct DB read:** When verifying data, query the DB directly instead of making HTTP API calls

## Reading Tokens from .env

When reading tokens from `~/.hermes/.env` in Python:

```python
def load_token(env_var_name):
    env_path = os.path.expanduser("~/.hermes/.env")
    # Try environment variable first
    token = os.environ.get(env_var_name, "").strip()
    if token:
        return token
    # Fallback: read from .env file
    if os.path.exists(env_path):
        marker = env_var_name
        with open(env_path) as f:
            for line in f:
                s = line.strip()
                if s.startswith(marker + "="):
                    return s.split("=", 1)[1].strip()
    return None
```

**Gotcha:** Use `s.split("=", 1)[1]` not `s.partition("=")[2]` — both work, but `split` with maxsplit=1 is clearer.

**Gotcha:** `source ~/.hermes/.env` will FAIL if values contain special characters (like `=`) and aren't shell-quoted. The `.env` file uses raw `KEY=value` format without quotes. Always read tokens via Python file parsing (as shown above), never via `source`.

**Gotcha — Shell `grep | cut` token extraction is unreliable:** The `grep KEY .env | cut -d= -f2-` pipeline includes the trailing newline (`0a`) from grep output in the token value, causing HTTP 401. Parentheses `()` in tokens break `$(command)` substitution. **Always use a Python wrapper** to read `.env` tokens — see `references/shell-token-extraction.md`.

## Pagination Patterns

### Cursor-based pagination (Loyverse, Stripe, etc.)

```python
all_items = []
cursor = None
while True:
    url = base_url + "/endpoint?limit=10"
    if cursor:
        url += "&cursor=" + cursor  # Do NOT url-encode the cursor!
    
    data = api_get(url)
    items = data.get("items", [])
    all_items.extend(items)
    cursor = data.get("cursor")
    if not cursor or not items:
        break
    time.sleep(0.3)  # Be polite to the API
```

**Gotchas:**
- Do NOT use `urllib.parse.quote()` on cursor values — many APIs (Loyverse) reject encoded cursors
- Add a small delay (`time.sleep(0.3)`) between paginated requests to avoid rate limits
- Some APIs return HTTP 402 (not 429) when hitting pagination depth limits — this is NOT a payment issue, it's a soft rate/depth limit

### Date-range pagination

When cursor pagination fails with filters, use date-range chunking instead:

```python
# Instead of: ?created_at.gte=2026-06-22&cursor=...
# Use: ?created_at.gte=2026-06-22T00:00:00&created_at.lt=2026-06-22T02:00:00
# Then advance the window
```

## HTTP Error Codes in Business APIs

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 401 | Bad token | Check token, re-authenticate |
| 402 | **Not "payment required"** — often means pagination depth limit, soft quota exceeded, or subscription feature gate (e.g., Loyverse 31-day history limit) | Stop pagination, return what you have |
| 403 | Forbidden | Check token scopes/permissions |
| 429 | Rate limit | Back off exponentially, retry |
| 500 | Server error | Retry with backoff |

**Important:** HTTP 402 in Loyverse (and similar APIs) does NOT mean "payment required." It typically means you've hit a pagination or query complexity limit. Stop and return accumulated data.

**Loyverse-specific:** HTTP 402 with message *"Unable to retrieve receipts created earlier than 31 days ago"* means the free tier only allows retrieving receipts within the last 31 days. This is a subscription feature gate, not a rate limit. For data within 31 days, use date filters to bound the range.

## Rate Limits

| API | Limit | Window |
|-----|-------|--------|
| Loyverse | 300 requests | 300 seconds |
| GitHub | 5,000 requests | 1 hour |
| Stripe | 100 requests | 1 second |

Always implement polite delays between requests when doing paginated syncs. Add per-provider rate-limit tuning in the implementation rather than guessing generics.

## Session-Based API Sync

For APIs that use cookie-based sessions (not bearer tokens):

**Storage pattern**
- Store the session cookies in a dedicated DB table with a single constrained row (e.g., `id INTEGER PRIMARY KEY CHECK (id = 1)`)
- Never store passwords or tokens in code, `.env`, or logs
- Query the DB at sync start; cache in memory for the duration of the sync only

**Test pattern**
- Always ship a lightweight health-check endpoint that calls the external API with `count=1`
- Return `{"active": true, "total": N}` on success
- Return `{"active": false, "error": "SESSION_EXPIRED"}` with HTTP 401 on auth failure

**Sync pattern (two-phase)**
1. **Phase 1 — List sync:** Paginate the list endpoint, upsert each record into local DB. Batch upserts are idempotent by natural key (tracking number / entity_id).
2. **Phase 2 — Enrichment:** Query local rows missing enriched fields (e.g., masked phone), call the detail/reveal endpoint per record with a fixed delay, then update the local row.

```python
# Phase 1: list
pageno = 1
while True:
    result = await api_list(cookies, pageno=pageno)
    for item in result["data"]["list"]:
        upsert_local(item)
    if pageno * COUNT >= result["data"]["total"]:
        break
    pageno += 1
    await asyncio.sleep(0.3)

# Phase 2: enrichment
for row in get_rows_missing_enriched_field():
    value = await api_reveal(cookies, row["entity_id"])
    if value:
        update_local(row["id"], value)
    await asyncio.sleep(0.5)
```

**401 handling contracts**
- Any 401 during Phase 1: abort whole sync, return `{"error": "SESSION_EXPIRED"}` so the UI can prompt re-auth
- Any 401 during Phase 2: abort Phase 2, leave enriched data partial; still return the partial stats to the caller
- Do not retry on 401 — there is no backoff that fixes an expired session

## SQLite Schema Drift Migration

SQLite does not support `DROP COLUMN` in older versions and `ALTER TABLE ... ADD COLUMN` is additive only. When you need to change a column type, add `NOT NULL` constraints, or add primary keys:

**Detect-and-rebuild pattern**
```python
def ensure_schema(conn):
    cols = [r[1] for r in conn.execute("PRAGMA table_info(table_name)").fetchall()]
    if "new_required_col" not in cols:
        conn.execute("DROP TABLE IF EXISTS table_name")
        conn.execute("""
            CREATE TABLE table_name (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                new_required_col VARCHAR(50) NOT NULL,
                ...
            )
        """)
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_col ON table_name(col);
        """)
        conn.commit()
```

**When to use full rebuild vs ALTER TABLE**
- Use `ALTER TABLE ... ADD COLUMN` when adding optional columns to an existing table
- Use full table rebuild when: changing column nullability, changing types, adding primary keys, or adding `UNIQUE` constraints that may fail on existing data
- Always recreate indexes after rebuild
- Wrap rebuild in try/except; production DBs may have concurrent readers

## 24-Hour WhatsApp Policy

WhatsApp Cloud API enforces a 24-hour customer-service window after the last inbound message:
- **Within 24h:** free-form text messages allowed
- **After 24h:** must use pre-approved templates

Lookup the last inbound timestamp from the `messages` table per customer and branch send logic accordingly.

```python
last_inbound = conn.execute(
    "SELECT max(timestamp) FROM messages WHERE customer_phone=? AND direction='inbound'",
    (phone,),
).fetchone()[0]
within_24h = last_inbound and (datetime.now() - datetime.fromisoformat(last_inbound)).total_seconds() < 86400
```

**Gotcha:** Inbound timestamps may be stored as naive local time (SQLite default). When comparing to `datetime.now(timezone.utc)`, normalize both sides to naive local or both to UTC. The HAFJET schema uses naive local `timestamp TIMESTAMP DEFAULT (datetime('now'))`, so compare with naive `datetime.now()`.

## Telegram Bot Setup (for report delivery)

When setting up Telegram delivery for reports:

1. Create a bot via @BotFather → get `TELEGRAM_BOT_TOKEN`
2. Get a chat ID by messaging the bot and visiting `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Add both to `~/.hermes/.env`:
   ```env
   TELEGRAM_BOT_TOKEN=***
   TELEGRAM_HOME_CHANNEL=<chat_id>
   TELEGRAM_ALLOWED_USERS=<user_id1>,<user_id2>
   ```
4. Use `python3` (not shell `grep|cut`) to read tokens — terminal output redacts tokens with `...`

## Library Choice: urllib vs requests

For simple API scripts, `urllib.request` is often more reliable than `requests`:

- No dependency on external packages (stdlib only)
- Fewer SSL/proxy issues in containerized environments
- Simpler for GET requests with headers

```python
import urllib.request, urllib.error, json

def api_get(url, token):
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
    })
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read())
```

Use `requests` when you need: sessions, cookies, complex auth, or POST with JSON body.

## Shell Quoting & Token Extraction Gotchas

When writing Python scripts via shell heredoc (`cat << 'EOF' > file.py`):

- **Never embed the token directly** in the heredoc — shell quoting will corrupt strings containing `=`, `'`, `"`, or spaces
- Write the script to read from environment variables or `.env` file
- If you must embed a value, use single-quoted heredoc (`<< 'EOF'`) and avoid the problematic character in the script body

**Shell `grep | cut` token extraction is unreliable:**
- `grep KEY .env | cut -d= -f2-` includes the trailing newline (`0a`) from grep output in the token value → causes HTTP 401
- `$(command)` substitution breaks when token contains `()` or other shell metacharacters
- `source .env` fails if values contain `=` and aren't shell-quoted
- **Always use a Python wrapper** to read `.env` tokens — see `references/shell-token-extraction.md`

**Working pattern — Python wrapper script:**
```python
import subprocess, sys, os
env_path = os.path.expanduser("~/.hermes/.env")
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line.startswith("LOYVERSE_ACCESS_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
os.environ["LOYVERSE_ACCESS_TOKEN"] = token
result = subprocess.run([sys.executable, os.path.expanduser("~/.hermes/skills/script.py")])
```

## Skill Authorship Note

When using `skill_manage(action='write_file')` to add reference/template/script files to a skill, the content parameter must be named **`file_content`** (not `content`). Using `content` will fail with "file_content is required".

## Server Timezone Gotcha for Cron Jobs

Server runs UTC. Malaysia is UTC+8. When scheduling cron jobs:
- `0 22 * * *` = 22:00 UTC = **06:00 MYT** (next day, not 10 PM!)
- For 22:00 MYT, use `0 14 * * *` (14:00 UTC = 22:00 MYT)
- Always verify with: `date` command on server to confirm current timezone

## pip install in PEP 668 Environments

On systems with PEP 668 (externally-managed-environment):
- `pip3 install` may hang or fail — use `pip3 install --break-system-packages` or better, use a venv
- `uv` package manager works without issues: `uv pip install <package>`
- Background `pip3 install` without `notify_on_complete=true` runs silently — use `process(action='poll')` to check

## See Also

- `references/loyverse-api-notes.md` — Loyverse-specific API quirks and working patterns (includes client-side date filtering, cost/profit fields)
- `references/cron-timezone-guide.md` — Server UTC vs MYT timezone conversion for cron jobs
- `references/shell-token-extraction.md` — Why shell grep|cut fails for token extraction
- `references/spx-shopee-integration.md` — SPX Shopee endpoint mapping, status codes, reveal pattern
- `references/telegram-delivery-pattern.md` — Telegram bot delivery pattern for report summaries
- `references/remote-oauth-setup.md` — OAuth setup on remote/headless servers (Google Playground, xurl --headless, iPhone workarounds)
- `scripts/fetch_sales.py` — Working example: Loyverse daily sales report with client-side date filtering, profit calculation, and CSV import
- `references/mcp-bridge-tool-pattern.md` — MCP bridge tool architecture: helper→handler→route→list recipe, 30-second cache, partial semantics, I1–I5 pagination
- `whatsapp-webhook-dev` — WhatsApp Cloud API webhook development (FastAPI, Meta Graph API)