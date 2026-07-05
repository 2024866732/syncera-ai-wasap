# deploy.sh EXCLUDE_PATTERNS Validation

## Lesson (2026-07-05)

Dry-run scripts that replicate `EXCLUDE_PATTERNS` inline can give false confidence if the actual `deploy.sh` embedded Python has drifted patterns. In one session, a dry-run showed `test_all.py` was excluded, but the actual ZIP still contained it due to a missing `*.backup` pattern that wasn't in the script copy.

## Rule 1: Always validate the ACTUAL ZIP artifact

After `bash deploy.sh` completes, inspect the produced ZIP with `zipfile` to confirm:

```python
import zipfile
with zipfile.ZipFile('hafjet-prod.zip', 'r') as zf:
    names = zf.namelist()
    print('TOTAL=' + str(len(names)))
    for n in names:
        if n.startswith('test_') or '.backup' in n or n.endswith('.db') or n.startswith('.env') or '/logs/' in n or n.endswith('.bak') or n.endswith('.md') or (n.startswith(' deploy') and n.endswith('.sh')):
            print('LEAK=' + n)
    dist = [n for n in names if n.startswith('dashboard/dist/')]
    print('dist_files=' + str(len(dist)))
```

**deploy.sh embedded leak check is insufficient by default** — it only checks `.env`, `.backup`, and `azure-settings`. Add explicit checks for `test_*.py`, `*_test.py`, `*.db`, and `*.md` in the ZIP, or extend the embedded verification block.

## Rule 2: Inspect deploy.sh with read-only commands only

Do NOT pipe `deploy.sh` to `python3`. The shebang lines and heredoc syntax are invalid Python.

Use:
```bash
nl -ba deploy.sh | sed -n '7,60p'
# or
sed -n '7,55p' deploy.sh
```

For syntax check of the embedded Python block only:
```bash
awk 'NR>=8 && NR<=57' deploy.sh > /tmp/deploy_snippet.py
python3 /tmp/deploy_snippet.py
```

## Rule 3: fnmatch coverage gaps

| Pattern | Matches | Misses |
|---------|---------|--------|
| `*.bak*` | `.bak`, `.bak123`, `.bak-20260705` | `.backup` |
| `*.backup` | `.backup` | `.bak` |
| `test_*.py` | `test_all.py`, `test_foo.py` | `s2f5_test.py` |
| `*_test.py` | `foo_test.py`, `s2f5_test.py` | `test_all.py` |

Include both `*.bak*` AND `*.backup` when excluding backup files.

## Rule 4: Do not alter production code during ZIP validation

Fixing `EXCLUDE_PATTERNS` in `deploy.sh` is allowed. Do not patch `webhook_listener.py`, `db_logger.py`, or dashboard files while preparing deploy artifacts.

## Rule 5: Post-deploy route verification — 404 mismatch trap

**Symptom:** An endpoint exists in source (`webhook_listener.py`) but returns **404** in production, while health/dashboard/assets return 200.

**Meaning:** 404 is NOT an auth issue (auth returns 401). It means the route is not registered in the running app — the deployed code does not match the local source.

**Diagnosis:**
1. Verify the route line exists in deployed code: search the route string in the live app's source via Kudu or log stream.
2. If missing but present locally → stale ZIP / Oryx cache / incomplete deploy.
3. If present in deployed source but still 404 → import error during app startup silently prevents route registration. Check startup logs for `Added job` / `Application startup complete` and any import errors before that line.

**Fix:** Rebuild ZIP + redeploy. If Oryx cache is suspected:
1. Set `ORYX_BUILD_TIMESTAMP=$(date +%s)` before deploy to force rebuild.
2. Or use `az webapp deployment source config-zip` (forces full Oryx rebuild despite deprecation).
3. Or delete `oryx-manifest.toml` and `output.tar.zst` from `/home/site/wwwroot/` via Kudu VFS.

**Root cause detail (Oryx stale `output.tar.zst`):** When `az webapp deploy --type zip` runs, Oryx may skip rebuilding and reuse a cached `output.tar.zst` from a previous deployment. The cached tarball contains the old code. The ZIP's new files are ignored. This produces the exact symptom: route present in ZIP, missing in production, no startup errors. Detection: deployment log shows `Build successful. Time: 0(s)` and startup logs show `Found build manifest file at '/home/site/wwwroot/oryx-manifest.toml'` + `Extracting '/home/site/wwwroot/output.tar.zst'` instead of processing the ZIP's source files.
