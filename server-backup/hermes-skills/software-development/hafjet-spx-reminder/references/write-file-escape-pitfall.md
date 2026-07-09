# write_file() Double-Quote Escaping Pitfall (Jul 2026)

## Symptom
When using `write_file()` to create a Python script containing double-quoted strings (e.g., `auth = "Authorization: Bearer ***), the file on disk contains **escaped double quotes**: `auth = \"Authorization: Bearer \"`. Python interprets these as literal backslash-quote sequences, NOT as string delimiters — causing `SyntaxError: unterminated string literal`.

## Root Cause
The `write_file()` tool escapes `"` to `\"` in the file content. The resulting file contains `\"` (backslash + double-quote) as literal characters, which Python parses as an escaped quote inside a string — but since the string never properly closes, syntax error.

**Secondary issue:** Even with single quotes, the closing `'` can get dropped if the string contains a `"` character right before where the closing `'` should be. E.g., `'Bearer *** needs to be `'Bearer ***'` — the closing single quote after `"` is critical.

## Fix

**Always use single quotes (`'`) for ALL Python strings containing `"` in scripts written via `write_file()`.**

### ❌ BROKEN (double quotes → escaped in file):
```python
auth = "Authorization: Bearer *** + token
file = "/home/user/data.py"
```

### ✅ WORKS (single quotes → preserved as-is):
```python
auth = 'Authorization: Bearer *** + token
file = '/home/user/data.py'
```

### ✅ ALSO WORKS (multi-line with .format()):
```python
auth = 'Authorization: Bearer {}'.format(token)
```

### ✅ Post-write patch fix:
If write_file mangled the closing quote:
```
# Find:  auth_val = 'Bearer *** + token
# Replace: auth_val = 'Bearer ***' + token
```
Use `patch` tool with `old_string` / `new_string` to add the missing closing `'`.

## Verification
After `write_file()`, check the linter output. A `SyntaxError` at the line with the auth header almost always means escaped quotes. If it passes lint but fails at runtime with `SyntaxError`, use `read_file` on the script to inspect the actual bytes.

## Impacted Use Cases
- Kudu VFS upload scripts (Python scripts that call `curl` with auth headers)
- DB verification scripts (SQL queries with string literals)
- Any `write_file()` call that writes Python code with string concatenation involving `"`

## Alternative
If the script is short (< ~50 lines), prefer `terminal()` with `python3 -c "..."` for one-liners, or use `execute_code` for multi-line scripts (avoids the write_file escaping layer entirely). However, `execute_code` is gated behind cron approval settings.
