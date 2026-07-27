# Dashboard UI Patching Pitfalls — f-string + HTML Template Edits

When modifying the `/dashboard` HTML generation in `app/api/routes.py`, the template lives inside a **Python `f"""..."""` string**. This creates several gotchas that caused repeated patch failures.

## 1. Double-Brace CSS in f-strings

CSS declarations use `{ }`, but inside a Python f-string they must be `{{ }}`. When writing an `old_string` to match in the source, you MUST use the double-brace form:

```python
# WRONG — single braces won't match the f-string source
old_css = "body { font-family: sans-serif; }"

# RIGHT — matches the literal {{ }} in the .py file
old_css = "body {{ font-family: sans-serif; }}"
```

**Tip:** Use `cat -A file.py | grep "body"` to see whether the source has `{` or `{{`.

## 2. Unicode Escape Sequences in f-string Source

Python f-string source may contain literal escape sequences (`\U0001f4c8`, `\u00b7`) that render as emoji/symbols at f-string evaluation time. When matching, use the literal escape form (as it appears in the `.py` source), not the rendered character:

```python
# The .py source has:   "\\U0001f4c8 HAFJET CCTV"
# The f-string renders it as: 📈
# To match, use the anchor WITHOUT the escape prefix:
anchor = "HAFJET CCTV — Events Dashboard"  # always works as anchor
```

Never try to match the emoji character directly — use a plain-text portion of the same line as the anchor instead.

## 3. Multi-Pass Script Must Write Once (Atomically)

When applying 10+ `content.replace()` passes in a Python script, **do not write-to-disk after each pass**. If an intermediate pass (e.g., pass 7 of 11) fails with an `assert`, all earlier passes that saved to disk are now orphaned, and the file is in an inconsistent state.

```python
# WRONG
for i, (old, new) in enumerate(passes):
    content = content.replace(old, new, 1)
    f.write_text(content)  # disaster if pass 7 fails — passes 1-6 are on disk

# RIGHT
for i, (old, new) in enumerate(passes):
    content = content.replace(old, new, 1)
    print(f"Pass {i} OK")
# Only write when all passes succeeded
f.write_text(content)
```

If a pass fails: fix the failing `old_string`, restore from backup, re-run all passes.

## 4. Body-Block Replacement Drops Trailing Statements

When replacing the entire HTML body block (`<h1>...</html>"""`) within a dashboard function, the replacement range may inadvertently swallow:

- `return HTMLResponse(html)` — the function return statement
- `from fastapi.responses import HTMLResponse` — imported locally inside the function body

**Always verify post-replacement:**
```bash
grep "return HTMLResponse\|from fastapi.responses import" app/api/routes.py
```

If missing, add them back immediately after the closing `"""` of the new body block.

## 5. The Clean-Atomic Workflow (Proven Pattern)

The pattern that worked after multiple failed attempts:

1. **Save backup:** `cp routes.py routes.py.before-{label}`
2. **Write one Python script** that does ALL passes, writes once.
3. **Apply from clean backup each re-run:** `cp backup routes.py && python3 apply.py`
4. **Syntax-check immediately:** `.venv/bin/python -c "import py_compile; py_compile.compile('app/api/routes.py', doraise=True)"`
5. **Restart and verify** real HTML output — never declare success based solely on grep counts.

## 6. Verify CSS from Real HTML, Not Grep Alone

After restart, verify the rendered dashboard HTML contains the expected CSS classes:

```bash
curl -s http://127.0.0.1:8091/dashboard?limit=3 > /tmp/dash.html
grep -c "filter-bar\|event-card\|badge-conf" /tmp/dash.html
```

A 500 error or `null` body means the template has a Python error — check the journal, not the HTML file.

## Related

- `safe-code-insertion` skill — general multi-pass patching and f-string brace trap
- `hafjet-cctv-deployment` SKILL.md § "Dashboard Visual Refreshes" — high-level workflow contract
