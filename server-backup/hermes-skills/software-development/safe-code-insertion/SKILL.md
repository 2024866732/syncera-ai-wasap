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

## Pre-insertion sanity checks

- Read the 20 lines around the intended insertion point first (`read_file` or `sed -n`).
- Confirm the anchor is unique with `grep -c "<anchor>" <file>` before the Python edit.
- If the file uses a marker comment like `#  STAFF AUTH API`, prefer inserting **before** the marker by replacing `marker -> block + marker`.

## Post-insertion verification

- `git diff --stat` should show only the intended file changed.
- `python3 -m py_compile` must pass.
- If the change adds imports, grep for them to ensure the import block was updated exactly once.