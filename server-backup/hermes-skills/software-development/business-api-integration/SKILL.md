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
   ```bash
   echo 'SERVICE_API_TOKEN=abc123...' >> ~/.hermes/.env
   ```
3. **If the user insists** — accept it, but mask it in all responses (show only first/last 4 chars), and remind them to rotate the token after use
4. **Never log credentials** in tool output, debug prints, or error messages

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

## Telegram Bot Setup (for report delivery)

When setting up Telegram delivery for reports:

1. Create a bot via @BotFather → get `TELEGRAM_BOT_TOKEN`
2. Get a chat ID by messaging the bot and visiting `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Add both to `~/.hermes/.env`:
   ```env
   TELEGRAM_BOT_TOKEN=<token>
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

## Rate Limit Patterns

| API | Limit | Window |
|-----|-------|--------|
| Loyverse | 300 requests | 300 seconds |
| GitHub | 5,000 requests | 1 hour |
| Stripe | 100 requests | 1 second |

Always implement polite delays between requests when doing pagination.

## Report Delivery via Telegram

After generating a report (sales, inventory, etc.), deliver the summary to Telegram:

1. Run the script, capture stdout (the formatted summary)
2. Send the captured text to the Telegram chat using the Bot API
3. CSV is auto-saved to `~/.hermes/reports/` for archival

See `references/telegram-delivery-pattern.md` for the full pattern including:
- Reading `TELEGRAM_BOT_TOKEN` and `TELEGRAM_HOME_CHANNEL` from `.env`
- Token redaction gotcha (terminal masks tokens with `...`)
- Python wrapper for sending messages
- Cron job orchestration pattern

## See Also

- `references/loyverse-api-notes.md` — Loyverse-specific API quirks and working patterns
- `references/cron-timezone-guide.md` — Server UTC vs MYT timezone conversion for cron jobs
- `references/shell-token-extraction.md` — Why shell grep|cut fails for token extraction
- `references/telegram-delivery-pattern.md` — Telegram bot delivery pattern for report summaries
- `scripts/fetch_sales.py` — Working example: Loyverse daily sales report script with CSV export
- `whatsapp-webhook-dev` — WhatsApp Cloud API webhook development (FastAPI, Meta Graph API)

## Skill Authoring Note

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
