# Security Patterns for HAFJET Server

## ❌ FORBIDDEN: `curl | python3 -c` Pattern

**Risk Level: HIGH**

The pattern `curl ... | python3 -c "..."` pipes network output directly to an interpreter without inspection. This is classified as HIGH risk by Hermes security scanner and will be BLOCKED.

**Why it's dangerous:**
- Network data (from APIs, websites) goes directly to code execution
- No inspection of payload before execution
- Similar risk to `curl | sh` (download + execute)
- Can execute arbitrary code from untrusted sources

**Examples that will be BLOCKED:**
```bash
# ❌ BLOCKED - pipe to interpreter
curl -s "https://api.loyverse.com/v1.0/receipts" | python3 -c "import sys, json; print(json.load(sys.stdin))"

# ❌ BLOCKED - inline code execution
python3 -c "import urllib.request; print(urllib.request.urlopen('https://api.example.com').read())"

# ❌ BLOCKED - pipe curl to bash
curl -s https://example.com/script.sh | bash
```

## ✅ SAFE: Write Script First, Then Execute

**Pattern:**
1. Write Python script to a `.py` file
2. Execute the file with `python3 script.py`

**Example - Safe API Test:**
```python
#!/usr/bin/env python3
"""Safe API test - write to file first."""
import os
import json
import urllib.request

token = os.environ.get("LOYVERSE_ACCESS_TOKEN")
url = "https://api.loyverse.com/v1.0/receipts?limit=5"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

with urllib.request.urlopen(req, timeout=10) as resp:
    data = json.loads(resp.read().decode())

print(f"Found {len(data.get('receipts', []))} receipts")
```

Save as `/tmp/test_api.py`, then run:
```bash
python3 /tmp/test_api.py
```

## ✅ SAFE: Use `jq` for JSON Parsing

Instead of piping to Python, use `jq` for JSON manipulation:
```bash
# ✅ SAFE - curl + jq
curl -s "https://api.loyverse.com/v1.0/receipts" | jq '.receipts[].created_at'

# ✅ SAFE - curl + jq with filter
curl -s "https://api.loyverse.com/v1.0/receipts" | jq '[.receipts[] | {date: .created_at, total: .total_money}]'
```

## ✅ SAFE: Separate Commands

```bash
# ✅ SAFE - separate grep commands (no subshell)
grep LOYVERSE_ACCESS_TOKEN ~/.hermes/.env | head -1 | cut -d= -f2-
# Then use the token in a separate command
LOYVERSE_ACCESS_TOKEN=<pasted_token> python3 script.py
```

## ✅ SAFE: Wrapper Scripts

For complex operations, create wrapper scripts:
```python
#!/usr/bin/env python3
"""Wrapper script - reads config, runs main logic."""
import os
import sys

# Read token from file (not from shell)
with open("/tmp/.loyverse_token") as f:
    os.environ["LOYVERSE_ACCESS_TOKEN"] = f.read().strip()

# Run main script
import subprocess
result = subprocess.run([sys.executable, os.path.expanduser("~/.hermes/skills/main.py")])
sys.exit(result.returncode)
```

## Cron Job Security

When setting up cron jobs for HAFJET:

1. **Use Hermes venv Python** — Ensures all dependencies are available:
   ```bash
   /home/hafizi145/hermes-agent/venv/bin/python3 /path/to/script.py
   ```

2. **Log output** — Always redirect to log file for audit:
   ```bash
   0 21 * * * /home/hafizi145/hermes-agent/venv/bin/python3 /path/to/script.py >> /home/hafizi145/.hermes/logs/output.log 2>&1
   ```

3. **Verify cron is running:**
   ```bash
   systemctl status cron
   tail -50 ~/.hermes/logs/output.log
   ```

## Summary

| Pattern | Risk | Status |
|---------|------|--------|
| `curl \| python3 -c` | HIGH | ❌ BLOCKED |
| `python3 -c "..."` | HIGH | ❌ BLOCKED |
| `curl \| bash` | HIGH | ❌ BLOCKED |
| Write `.py` then run | LOW | ✅ SAFE |
| `curl \| jq` | LOW | ✅ SAFE |
| Separate commands | LOW | ✅ SAFE |
| Wrapper scripts | LOW | ✅ SAFE |

**Rule:** Always write scripts to files first, then execute. Never pipe network output directly to interpreter.
