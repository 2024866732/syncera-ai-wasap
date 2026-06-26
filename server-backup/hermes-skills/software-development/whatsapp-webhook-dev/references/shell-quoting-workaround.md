# Shell Quoting Workaround for API Tokens

## Problem

API tokens often contain special characters (`=`, `'`, `)`, `!`, `}`, `*`) that break shell command parsing. Common patterns like `grep | cut` fail silently or produce truncated values. Even `python3 -c "..."` and heredocs break when the token is embedded in the command.

## Example: Token with special chars

```
WHATSAPP_ACCESS_TOKEN=EAAdm4aEZBJtcBRx...ZDZD
```

A shell command like `grep WHATSAPP_ACCESS_TOKEN .env | cut -d= -f2-` might work, but embedding this token in `python3 -c "..."` breaks because the shell interprets `$`, `{`, `}`, and other special characters.

## Solution 1: Write Token to Temp File (MOST RELIABLE)

When updating `.env` with a new token, **never embed the token in a shell command or Python script**. Instead:

**Step 1:** Write the token to a temp file using `write_file` (no shell involved):
```
write_file(path="/tmp/new_token.txt", content="<paste_token_here>")
```

**Step 2:** Write a Python update script to `/tmp/update_env.py`:
```python
import re

env_path = '/home/user/.hermes/whatsapp-bot/.env'

# Read new token from file (avoids ALL shell quoting issues)
with open('/tmp/new_token.txt', 'r') as f:
    new_token = f.read().strip()

# Read current .env
with open(env_path, 'r') as f:
    content = f.read()

# Replace the token line
content = re.sub(
    r'WHATSAPP_ACCESS_TOKEN=.*',
    'WHATSAPP_ACCESS_TOKEN=' + new_token,
    content
)

# Write back
with open(env_path, 'w') as f:
    f.write(content)

print('Token updated successfully')
```

**Step 3:** Execute:
```bash
python3 /tmp/update_env.py
```

**Why this works:** The token never passes through a shell interpreter. `write_file` writes raw bytes directly. The Python script reads raw bytes from a file. No quoting, no escaping, no corruption.

**Verified in production:** This exact pattern was used to update the HAFJET WhatsApp Bot `.env` with a 200+ char permanent System User token containing multiple `=`, `{`, `}`, `Z`, `D` characters that broke every shell-based approach.

## Solution 2: Python Wrapper for Reading Tokens

When reading tokens from `.env` in Python (for API calls):

```python
import os

def load_token_from_env(env_path, token_name):
    """Safely read a token from .env file, handling special characters."""
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(token_name + "="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                return value
    return None

token = load_token_from_env(os.path.expanduser("~/.hermes/.env"), "TOKEN_NAME")
```

## Solution 3: write_file for Full .env Replacement

For simple `.env` updates where you know all current values:
```
write_file(path="~/.hermes/.env", content="<full_env_content>")
```

**Caution:** This overwrites the entire file. Make sure you include ALL existing keys.

## What NOT to Do

```bash
# grep|cut breaks with special chars
TOKEN=$(grep TOKEN .env | cut -d= -f2)

# sed breaks with = in replacement value
sed -i "s/TOKEN=.*/TOKEN=NEW_VALUE/" .env

# source .env fails with unquoted special chars
source ~/.hermes/.env

# python3 -c with embedded token breaks with shell metacharacters
python3 -c "... TOKEN=$VAR ..."
```

## Server Restart Pattern (WhatsApp Bot / uvicorn)

After updating `.env`, restart the uvicorn server:

1. Kill old process: `pkill -f "uvicorn webhook_listener"`
2. Start new process with `terminal(background=True)`:
   ```
   cd ~/.hermes/whatsapp-bot && python3 -m uvicorn webhook_listener:app --host 0.0.0.0 --port 8443
   ```
3. Verify with curl:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8443/
   ```
   - `200` or `404` = server is running (404 just means no root handler)
   - Connection refused = server failed to start

**Note:** Do NOT use `nohop` or shell-level `&` backgrounding — Hermes can't track those. Use `terminal(background=True)`.

## ⚠️ CRITICAL: Shell Environment Variables Override .env File Values

**Discovered in HAFJET WhatsApp Bot v2.0 (2026-06-23):**

When a credential (e.g., `WHATSAPP_PHONE_ID`) is set as a **shell environment variable** AND also in the `.env` file, the **shell environment variable wins** — even when using `python-dotenv`'s `load_dotenv()`.

### Symptom

You update `.env` with the correct value, verify it with `grep`, but the app still uses the old value. API calls fail with:
```
"Object with ID '1207630379099331' does not exist, cannot be loaded due to missing permissions"
```
The ID in the error is the OLD value, not the one currently in `.env`.

### Root Cause

`os.getenv("WHATSAPP_PHONE_ID")` returns the shell env var first, ignoring `.env`. `load_dotenv()` by default does NOT override existing env vars. The Hermes Agent shell session may have exported env vars from a previous `.env` file or from manual `export` commands. These persist across the session.

### How to Diagnose

```bash
# Check if the variable is set in shell env
echo "WHATSAPP_PHONE_ID env: $WHATSAPP_PHONE_ID"
# If this prints a value, it's set in the shell and will override .env
```

### How to Fix in Code (Permanent)

Add this pattern to your webhook listener's config loading section:

```python
# Pop stale env vars that may override .env file values
for _k in ("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID",
           "APP_SECRET", "VERIFY_TOKEN", "WEBHOOK_VERIFY_TOKEN"):
    os.environ.pop(_k, None)
load_dotenv(os.path.expanduser("~/.hermes/whatsapp-bot/.env"), override=True)
```

This ensures `.env` values always take precedence regardless of shell state.

### How to Fix in Shell (Temporary)

```bash
unset WHATSAPP_PHONE_ID
unset WHATSAPP_ACCESS_TOKEN
# Then restart the server
```

### Why This Matters

This is a **silent failure** — the app starts without errors, `.env` looks correct, but all API calls use stale credentials. The error message references the old ID, making it look like a token/permission issue rather than an env var override. Always pop env vars before `load_dotenv()` in any WhatsApp bot or similar credential-loading application.
