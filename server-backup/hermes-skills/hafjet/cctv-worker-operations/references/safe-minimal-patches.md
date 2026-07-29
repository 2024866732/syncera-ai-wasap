# Safe Minimal CCTV Code Patch Pattern

Use for narrow server-side fixes such as a DB-query/serialization field omission.

## Approval boundaries

1. User approves the exact scoped diff to **store** code.
2. Take a file-scoped backup before modifying.
3. User gives a separate explicit approval to **load** code through a worker restart.
4. A restart approval is one helper/command execution only; it never permits bundled config/model/timer changes.

## Pre-apply procedure

- Read the exact current source block from the actual Office PC source; do not assume local checkout is a Git repository.
- Copy the target source to a dated scoped backup. Refuse to overwrite an existing backup.
- Verify source and backup with `cmp -s` and SHA-256.
- Create a disposable read-only RED test against the existing code. It must fail for the intended behavioral absence, not import/path setup.

## Additive SQL/dict patch checklist

When adding fields to a query helper:

- Add only the approved SQL columns.
- Add matching returned-dict keys.
- Shift all following tuple indexes, especially trailing timestamps.
- Keep function signature, filter clauses, order, limit, and existing key names unchanged.
- Do not refactor nearby code.

## Post-apply, before loading

- Capture the exact `diff -u backup current`.
- Run Python syntax compile for the modified file.
- Run a disposable read-only GREEN test using a known DB event with non-null target fields.
- Report the real event ID and returned values. Do not claim browser/UI success before a separately approved restart and real browser confirmation.

## Dashboard parity verification after loading

Use one exact event ID across four layers: raw read-only DB row, API response, server-rendered dashboard HTML, and user/browser screenshot. A raw HTML placeholder establishes a server-side data path issue; it is not browser cache evidence.
