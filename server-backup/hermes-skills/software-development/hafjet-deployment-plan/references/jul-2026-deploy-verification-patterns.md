# Jul 2026 Deployment & Verification Patterns

## Pre-Commit Review Rule (HARD RULE — Tuan Hafizi, Jul 2026)

**Show `git status` + `git diff` and get EXPLICIT approval BEFORE `git commit` — never commit-then-show-diff-after.** Even if the change is expected/verified clean. Sequence (pre-commit review) = trust.

This rule was established after Tuan caught a commit being made before showing the diff, even though the diff was clean. The lesson: **the review sequence matters for trust, not just correctness.**

### Correct workflow:
1. Apply code patches (via `patch` tool)
2. Run `py_compile` / `npm run build` for syntax verification
3. Show `git diff --stat` + full `git diff` to Tuan
4. **STOP — wait for explicit "approved, commit"**
5. Only then `git add` + `git commit`
6. For deploys: show ZIP manifest → wait for approval → `az webapp deployment source config-zip`

---

## Deploy Command — `config-zip` is the verified method

| Command | Reliability | Notes |
|---------|-------------|-------|
| `az webapp deploy --type zip` | ❌ Unreliable | Oryx build cache issues, stale artifacts |
| `az webapp deployment source config-zip` | ✅ Verified | Legacy method, bypasses Oryx cache. Used for all Jul 2026 deploys (commits 5a8ea21, 775f5e2, 5292810) |

```bash
az webapp deployment source config-zip \
  --name hafjet-whatsapp-bot \
  --resource-group hafjet-bot-rg \
  --src deploy-hafjet-bot.zip
```

Check result: `"status": "RuntimeSuccessful"`, `"numberOfInstancesSuccessful": 1`.

---

## Frontend Bearer Auth Audit Pattern (commit 775f5e2)

**Class-level bug:** Backend routes using `Depends(get_current_staff)` require `Authorization: Bearer <token>`. Frontend `api.js` functions hardcoding `'X-API-Key'` only → 401.

### Audit method:
1. `grep "Depends(get_current_staff)" webhook_listener.py` — find ALL protected routes (26 found in Jul 2026)
2. Cross-reference with `api.js` — find functions calling those routes
3. Any using `headers: { 'X-API-Key': ... }` instead of `getAuthHeaders()` → 401 bug

### `getAuthHeaders()` (api.js:148):
```js
function getAuthHeaders() {
  const token = localStorage.getItem('staff_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-API-Key'] = import.meta.env.VITE_API_KEY || '';
  }
  return headers;
}
```

### Functions that STAY on X-API-Key (backend NOT Bearer-protected):
`fetchCustomers`, `fetchMessages`, `updateNote`, `handoffCustomer`, `staffReply`, `createBlast`, `fetchBlastHistory`, `fetchContacts`, `updateContact`, `exportContacts`, `importContacts`, `fetchKeywords`, `createKeyword`, `updateKeyword`, `deleteKeyword`, `testKeyword` — backend routes use `operator` param or public access, NOT `Depends(get_current_staff)`.

### Functions fixed in commit 775f5e2 (8 total):
`fetchInbox`, `fetchStaffList`, `createStaff`, `fetchStaffMe`, `resolveCustomer`, `escalateCustomer`, `assignConversation`, `updateConversationStatus`.

---

## Bounded Log Tail — Scheduler Verification Pattern

### Foreground (under 600s timeout):
```bash
timeout 580 az webapp log tail --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg 2>&1 \
  | grep -a -m 30 -iE "\[SPX-PILOT\]|SPX\]|spx_reminder"
```

Key flags:
- `grep -a` — treat binary/log output as text (Azure logs have binary encoding)
- `-m N` — stop after N matches (don't tail forever)
- `timeout 580` — hard bound (under 600s foreground limit)

### Background (for long waits >10 min):
```
terminal(background=true, notify_on_complete=true)
# Command: sleep 1900 && timeout 600 az webapp log tail ... | grep -a ...
```
- `sleep 1900` (~32 min) to wait for scheduler cycle
- `notify_on_complete=true` — get notified when done
- Check output via `process(action='poll')` or wait for notification

### Gotcha: `grep` binary file matches
Azure log stream contains binary bytes (color codes/encoding). Plain `grep` silently skips with "binary file matches" message. **Always use `grep -a`** to force text mode.

---

## Read-Only DB Verification Protocol

1. Write Python script to `/tmp/check_*.py` (NOT inline `python3 -c`)
2. Show Tuan the full script content for review
3. Wait for approval
4. Execute: `python3 /tmp/check_*.py`
5. Always use `sqlite3.connect(f'file:bot_data.db?mode=ro', uri=True)` — read-only mode

### Pitfall: inline `python3 -c` with complex logic
Tuan catches syntax errors in multi-line inline scripts (e.g., `convs]` bracket mismatch). Always write to file first, show, then execute. This follows the "no curl|python3" safety rule.

---

## build_zip.py Artifact Hygiene (commit 775f5e2)

`build_zip.py` walks **disk, not git**. Untracked junk files WILL be zipped unless excluded.

### Exclude patterns added Jul 2026:
```python
".tar.gz", "backup", "AGENTS.md", "DEPLOYMENT", "oracle-",
".user.js", "business_info.txt",
"check_", "upload_", "debug_", "verify_", "monitor_", "fix_",
"intent_rules.json", "media_map.json",
"start_local.sh", "apply_all_patches.py", "run_fetch_phones.py", "s2f5_test.py",
"azure-settings-backup"
```

### Verification pattern:
1. Run simulation (same exclude logic) to list what WOULD be zipped
2. Confirm 3 committed files present
3. Confirm junk absent (db-backup, tar.gz, AGENTS.md, debug scripts, azure-settings-backup)
4. Only then build real ZIP

---

## SPX Reminder State Machine — `_Sent` Suffix Contract

Critical: scheduler MUST persist `f"{next_state}_Sent"` after successful send. Resolver ONLY advances FROM `*_Sent` states. Plain state (e.g., `"Remind2"`) matches no branch → returns `None` → scheduler skips → **permanent deadlock**.

### One-time migration for stuck rows:
```sql
UPDATE spx_self_collection_orders SET hafjet_reminder_state='Remind2_Sent' WHERE hafjet_reminder_state='Remind2';
UPDATE spx_self_collection_orders SET hafjet_reminder_state='Remind3_Sent' WHERE hafjet_reminder_state='Remind3';
```

### Send window verification gotcha:
- Window = 08:00–21:00 MYT (line 513 `if not (8 <= now_my.hour < 21): return`)
- Scheduler fires every 15 min but returns early outside window
- Log tail at 07:xx MYT shows job ran (no error) but NO send lines — that's CORRECT
- First in-window cycle = 08:08 MYT (00:08 UTC)
