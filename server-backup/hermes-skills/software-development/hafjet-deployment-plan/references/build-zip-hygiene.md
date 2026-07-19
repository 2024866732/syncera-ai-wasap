# build_zip.py Artifact Hygiene

## The trap
`build_zip.py` builds the deploy ZIP by walking the **disk** (`os.walk(src)`),
NOT git. Any untracked junk file on disk that does not match an exclude pattern
**will be shipped to Azure** — even though it was never `git add`ed.

Confirmed pollution seen in a session: `db-backup-20260712.tar.gz`,
`azure-settings-backup-2026-06-27.json` (possible secret), `AGENTS.md`,
`DEPLOYMENT*.md`, `oracle-deployment-plan-v2.md`, ~20 `check_/upload_/debug_/verify_*.py`
temp scripts, `spx_phone_agent*.user.js`, `business_info.txt` (loose copy),
`intent_rules.json`, `media_map.json`.

## Fix — keep `exclude_patterns` comprehensive
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
    "business_info.txt",            # untracked loose copy (loaded at runtime from disk)
    "check_", "upload_", "debug_", "verify_", "monitor_", "fix_",  # temp/debug scripts
    "intent_rules.json", "media_map.json",
    "start_local.sh", "apply_all_patches.py", "run_fetch_phones.py", "s2f5_test.py",
    "azure-settings-backup",        # azure-settings-backup-*.json
]
```

## Simulate before deploying (no `unzip` on server — use python)
```python
import zipfile, os
zf = zipfile.ZipFile('deploy-hafjet-bot.zip')
names = zf.namelist()
print('FILES:', len(names))
# confirm new bundle present, old absent
assert any('index-Crv-gfnc.js' in n for n in names), "new bundle missing!"
assert not any('BNOCIP1E' in n for n in names), "stale bundle present!"
# confirm no junk
junk = [n for n in names if any(p in n for p in ['tar.gz','backup','AGENTS.md','user.js','check_','upload_','debug_','verify_','DEPLOYMENT','oracle-'])]
assert not junk, f"junk in zip: {junk}"
print("CLEAN")
```

## Pre-build checklist
1. `python3 build_zip.py`
2. Run the simulation above (or `unzip -l` if available locally).
3. Confirm: 3 committed source files present (`hermes_ai.py`, `system_prompt.txt`, `webhook_listener.py`),
   new `dashboard/dist/assets/index-*.js` present, old bundles absent, zero junk.
4. Only then `az webapp deployment source config-zip ...`.
