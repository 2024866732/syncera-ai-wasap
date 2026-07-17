# Build-ZIP Artifact Hygiene (HAFJET Bot Deploy)

## The pitfall (Jul 2026)
`build_zip.py` does `os.walk(src)` over `~/.hermes/whatsapp-bot` — it zips
**whatever is on disk**, tracked OR untracked. It has zero git awareness. Any
junk file not matching an exclude pattern silently enters the deploy ZIP.

Real incidents shipped to production:
- `db-backup-20260712.tar.gz` (DB dump)
- `azure-settings-backup-2026-06-27.json` (possible secrets/settings)
- 20+ debug/test scripts (`check_*.py`, `upload_*.py`, `debug_*.py`, ...)
- stale dist bundles, `AGENTS.md`, `DEPLOYMENT*.md`, `oracle-*.md`, `*.user.js`

## MANDATORY gate (never skip)
1. Ensure `build_zip.py` exclude list covers all junk (see below).
2. **Simulate before building** — dry-run the same `exclude_patterns`, print what
   WOULD be zipped, confirm clean.
3. Only if clean → `python3 build_zip.py` for real.

## Verified exclude list (paste into build_zip.py)
```python
exclude_patterns = [
    ".git", "__pycache__", ".venv", ".env", ".env.", "node_modules",
    ".bak", ".backup", "test_", ".zip", "logs",
    ".backup", "hermes_ai.py.backup", "hermes_ai_new.py",
    "update_fallback.py", "fix_fallback.py",
    ".db",  # exclude all database files (bot_data.db, etc.)
    # ── Pre-deploy artifact hygiene ──
    ".tar.gz",                      # db / file backups
    "backup",                       # *backup* (db-backup, azure-settings-backup, etc.)
    "AGENTS.md",                    # auto-generated context doc
    "DEPLOYMENT",                   # DEPLOYMENT*.md / DEPLOYMENT_NOTES.md
    "oracle-",                      # oracle-deployment-plan-*.md
    ".user.js",                     # spx_phone_agent*.user.js
    "business_info.txt",            # untracked loose copy (loaded at runtime from disk anyway)
    "check_", "upload_", "debug_", "verify_", "monitor_", "fix_",  # temp/debug scripts
    "intent_rules.json", "media_map.json",
    "start_local.sh", "apply_all_patches.py", "run_fetch_phones.py", "s2f5_test.py",
    "azure-settings-backup",        # azure-settings-backup-*.json
]
```

## Simulation script (run BEFORE building — confirms clean)
Save as `/tmp/sim_zip.py`, then `python3 /tmp/sim_zip.py`:
```python
import os
src = os.path.expanduser("~/.hermes/whatsapp-bot")
exclude_patterns = [
    ".git","__pycache__",".venv",".env",".env.","node_modules",".bak",".backup",
    "test_",".zip","logs",".backup","hermes_ai.py.backup","hermes_ai_new.py",
    "update_fallback.py","fix_fallback.py",".db",".tar.gz","backup","AGENTS.md",
    "DEPLOYMENT","oracle-",".user.js","business_info.txt","check_","upload_","debug_",
    "verify_","monitor_","fix_","intent_rules.json","media_map.json","start_local.sh",
    "apply_all_patches.py","run_fetch_phones.py","s2f5_test.py","azure-settings-backup",
]
def should_exclude(name):
    return any(p in name for p in exclude_patterns)
committed = {"hermes_ai.py","system_prompt.txt","webhook_listener.py"}
included, excluded = [], []
for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if not should_exclude(d)]
    for fn in files:
        arc = os.path.relpath(os.path.join(root, fn), src)
        (excluded if should_exclude(fn) else included).append(arc)
print("TOTAL would-be zipped:", len(included))
for f in committed:
    print(("✅" if f in included else "❌"), "committed:", f)
still_bad = [f for f in included if (
    f.endswith(".tar.gz") or "backup" in f.lower() or f.endswith(".user.js")
    or f.startswith(("check_","upload_","debug_","verify_","monitor_","fix_"))
    or f in ("AGENTS.md","business_info.txt","intent_rules.json","media_map.json",
             "start_local.sh","apply_all_patches.py","run_fetch_phones.py","s2f5_test.py")
    or f.startswith("DEPLOYMENT") or f.startswith("oracle-")
)]
print("REMAINING SUSPICIOUS:", len(still_bad))
for f in sorted(still_bad): print("  ⚠️", f)
if not still_bad: print("  (none — clean)")
```

## Approval chain the user enforces (do not skip)
commit → pre-deploy sim → patch exclude → re-sim → build ZIP →
(user approves) → deploy → smoke test.
Never deploy without an explicit "deploy" instruction after the build report.

## Deploy method note
Use `az webapp deployment source config-zip` (legacy) — NOT `az webapp deploy`
(which reported RuntimeSuccessful but left files unchanged on disk in Jul 2026).
