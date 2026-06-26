# Shell Token Extraction from .env — Pitfalls

When extracting API tokens from `~/.hermes/.env` via shell, several things can go wrong.

## The Problem

API tokens may contain characters that break shell parsing:
- `=` in the token value breaks `cut -d= -f2-`
- Parentheses `()` break `$(command)` substitution
- The trailing newline (`0a`) from `grep` output gets included in the value

## Failed Approaches

### `grep | cut` pipeline
```bash
grep LOYVERSE_ACCESS_TOKEN .env | cut -d= -f2-
# Includes trailing newline → HTTP 401 UNAUTHORIZED
```

### Shell `$(command)` with special chars
```bash
TOKEN=*** KEY .env | cut -d= -f2-)
# Breaks when token contains () or other metacharacters
```

### `source .env`
```bash
source ~/.hermes/.env
# Fails if values contain = and aren't shell-quoted
```

## Working Approach: Python Wrapper

```python
#!/usr/bin/env python3
"""Run a script with token from .env loaded into environment."""
import subprocess, sys, os

env_path = os.path.expanduser("~/.hermes/.env")
target_script = os.path.expanduser("~/.hermes/skills/script.py")

token = None
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line.startswith("LOYVERSE_ACCESS_TOKEN=***            token = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

if not token:
    raise SystemExit("LOYVERSE_ACCESS_TOKEN not found in .env")

os.environ["LOYVERSE_ACCESS_TOKEN"] = token
result = subprocess.run([sys.executable, target_script])
sys.exit(result.returncode)
```

## Key Takeaway

**Always read `.env` tokens via Python file parsing, never via shell pipelines.** Shell string processing is fragile with arbitrary token values.
