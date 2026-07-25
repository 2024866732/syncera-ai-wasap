# Remote Code Patching via SSH

## Problem
Running complex multi-line Python patches through SSH heredocs or inline `python3 -c "..."` fails with escaping nightmares — quotes, backslashes, and special characters get mangled across multiple layers of shell interpretation.

## Pattern: write → scp → run

```bash
# 1. Write a patch script LOCALLY (on Hermes host)
write_file("/tmp/patch_foo.py", content="""...""")

# 2. Copy to remote machine
scp /tmp/patch_foo.py user@remote:/tmp/patch_foo.py

# 3. Execute on remote
ssh user@remote "python3 /tmp/patch_foo.py"
```

## Example: replacing a function in Python source
```python
#!/usr/bin/env python3
"""Replace dashboard function in routes.py."""
f = "/home/user/project/app/routes.py"
with open(f) as fh:
    content = fh.read()

# Find and replace
old = "def dashboard(...): ..."
new = "def dashboard(...): ...  # enhanced"
content = content.replace(old, new, 1)

with open(f, 'w') as fh:
    fh.write(content)
print("Dashboard replaced")
```

## When to use
- Multi-line sed/awk/replace operations on remote files
- Python source patches with complex strings (f-strings, regex, heredocs)
- Any operation that would require >2 layers of shell quoting

## Anti-pattern (avoid)
```bash
# ❌ Shell quoting hell — almost never works for multi-line content
ssh user@remote "python3 -c \"
with open('f') as fh:
    content = fh.read()
    # ... escaping nightmare
\""
```
