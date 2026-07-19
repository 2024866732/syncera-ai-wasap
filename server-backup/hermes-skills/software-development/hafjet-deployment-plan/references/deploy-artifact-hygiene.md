# Deploy-Artifact Hygiene (Jul 2026)

`build_zip.py` walks the **disk**, not git. Any untracked junk on disk enters the
ZIP unless explicitly excluded — silently shipping secrets/backups and bloating
the artifact.

## Symptom
Build reported success; deploy "worked"; but `unzip -l` (or a from-disk simulation)
showed 30+ unwanted files including `db-backup-20260712.tar.gz`,
`azure-settings-backup-2026-06-27.json`, `AGENTS.md`, `*.user.js`, `check_*.py`,
`upload_*.py`, `debug_*.py`, `verify_*.py`, `monitor_*.py`, `fix_*.py`, stale
`dashboard/dist` assets, etc.

## Fix (applied to build_zip.py exclude_patterns)
```
.tar.gz, backup, AGENTS.md, DEPLOYMENT, oracle-,
.user.js, business_info.txt,
check_, upload_, debug_, verify_, monitor_, fix_,
intent_rules.json, media_map.json,
start_local.sh, apply_all_patches.py, run_fetch_phones.py, s2f5_test.py,
azure-settings-backup
```

## Pre-deploy verification (no mutation)
Walk the source dir, apply the same exclude logic, then:
- assert 0 suspicious files in the would-be archive
- assert the intended source files (e.g. `hermes_ai.py`, `system_prompt.txt`,
  `webhook_listener.py`) ARE present
- only then `az webapp deployment source config-zip` (legacy — avoids Oryx cache)

## Notes
- `getAuthHeaders()` in dashboard `api.js` already falls back to `X-API-Key` when
  no staff token — keep both auth methods; do not strip `X-API-Key` from headers.
- This is a frontend-build + zip concern, orthogonal to backend auth (see
  `hafjet-frontend-auth-debug`).
