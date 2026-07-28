---
name: safe-code-insertion
title: Safe Code Insertion When Patch Tool Fails
description: >
  Workflow for inserting code blocks into large Python files when the patch tool
  hits multiple-match or indentation failures. Use this when fuzzy matching is
  unreliable and you need exact, single-shot insertion.
---

# Safe Code Insertion When Patch Tool Fails

## When to use

- `patch` returns `Found N matches for old_string` even though you only want one insertion point.
- Inserted routes/functions come back with wrong indentation because the previous attempt was partially applied.
- The file is large (>3000 lines) and contains many similar decorator/import blocks.

## Guiding rule

**Prefer a single anchored terminal edit over repeated patch retries.** Repeating the same patch with identical arguments is a loop; switch strategy after the first failure.

## Exact recipe

1. **Restore a clean baseline first if the file is already partially mangled.**
   - `git checkout HEAD -- <file>`

2. **Choose a unique anchor near the real insertion point.**
   - Good anchors: unique decorator line, unique comment block, import line that only appears once.
   - Bad anchors: generic strings like `return JSONResponse(...)`, `except Exception as e:`, blank lines.

3. **Use a single terminal command with an inline Python script.**
   - Read the file.
   - Replace **one** unique anchor with `anchor + inserted_block`.
   - Write the file back.
   - Example pattern:
     ```bash
     python3 - <<'PY'
     from pathlib import Path
     text = Path('<file>').read_text()
     old = '<unique anchor>'
     new = '<unique anchor>\n\n<inserted block>'
     if old not in text:
         raise SystemExit('anchor not found')
     text = text.replace(old, new, 1)
     Path('<file>').write_text(text)
     print('patched')
     PY
     ```

4. **Verify syntax immediately.**
   - `python3 -m py_compile <file> && echo OK`
   - If syntax fails, restore to step 1 and re-insert in one shot; do not patch around the syntax error.

5. **Confirm placement with grep before declaring success.**
   - `grep -n "<new symbol>" <file>`

## Pitfalls

- **Do not** use `replace_all=True` unless you truly want every occurrence replaced.
- **Do not** insert top-level `@app.get(...)` decorators inside an existing function body; they must be at module indentation.
- **Do not** retry the same `patch old_string` more than twice. The matcher is not going to change its mind.
- **Do not** run a partial multi-step patch sequence when one of the steps already corrupted indentation; restore and re-apply as one block.
- **f-string double-brace trap:** CSS inside Python `f"""..."""` templates uses `{{ }}`, not `{ }`. When building an `old_string` to match, check the source with `cat -A` or `repr()` to confirm single vs. double braces. Mismatch = silent failure.
- **Multi-pass atomic write:** When a script applies multiple `.replace()` passes, write the file only at the very end. If an intermediate assert fails, no partial work is saved — fix the failing pass and re-run from a clean baseline. Write-per-pass loses earlier successful passes on a later failure.
- **Body-block replacement must preserve `return`/`import` lines:** When replacing an `f"""..."""` HTML template block, include any trailing `return HTMLResponse(html)`, `from fastapi.responses import HTMLResponse`, or function-close lines. A naive `content[:start] + new_body` silently drops them. **Open the body from the first `<h1>` tag** (not an earlier line), and verify with `grep "return HTMLResponse"` and `grep "import HTMLResponse"` after the write — these lines live after the closing `"""` in the original source and are NOT part of the template string.
- **SSH inline-Python escaping black hole:** Never embed multi-line Python scripts directly inside `ssh ... '...'` or `bash -c "..."` when the script contains backslashes, single quotes, double quotes, f-string braces, or regex patterns. The bash shell's escaping rules make `\\\\`/`\\\"`/`'\\''` chains virtually impossible to get right on the first try. **Instead:** write the script as a local file → `scp` it → `ssh ... 'python3 /tmp/script.py'`. This is the ONLY reliable pattern; inline approaches that fail once will continue failing.
- **Clean-backup re-run pattern:** When a multi-pass patch script fails partway through (e.g. pass 11 fails after passes 1–10), restore the backup, fix ONLY the failing pass in the script, then re-run the entire script against the clean file. Do NOT attempt to apply the remaining passes to a partially-modified file — the passes are designed to match the original source, and the file is now in an unknown intermediate state.

## Pre-insertion sanity checks

- Read the 20 lines around the intended insertion point first (`read_file` or `sed -n`).
- Confirm the anchor is unique with `grep -c "<anchor>" <file>` before the Python edit.
- If the file uses a marker comment like `#  STAFF AUTH API`, prefer inserting **before** the marker by replacing `marker -> block + marker`.

## Post-insertion verification

- `git diff --stat` should show only the intended file changed.
- `python3 -m py_compile` must pass.
- If the change adds imports, grep for them to ensure the import block was updated exactly once.