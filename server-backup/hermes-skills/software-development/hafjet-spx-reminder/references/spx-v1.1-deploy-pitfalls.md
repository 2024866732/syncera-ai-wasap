# SPX Follow-Up v1.1 Deploy Learnings (Jul 2026)

## Dashboard 502 After Deploy

### Symptom
- Dashboard `/api/spx/orders` or `/api/spx/stats` returns 502
- Health endpoint returns 200 (app is running)
- Browser shows "Failed to fetch SPX orders"
- Azure logs: `Container exited with exit code 3 during startup`

### Root Cause (3 possible, check in order)

**#1 (MOST COMMON): db_logger.py dashboard functions missing**
`webhook_listener.py` imports dashboard functions from `db_logger.py` (e.g., `get_dashboard_overview`,
`get_dashboard_handoff_analytics`) that don't exist in the deployed `db_logger.py`. 
When deploying only `webhook_listener.py` + `spx_followup.py` without also deploying `db_logger.py`,
Python crashes at import-time (exit code 3) before the scheduler starts.

**#2: Top-level import of new module**
`from spx_followup import determine_followup` at module level can cause Azure container startup failure
even when the file exists. Use lazy import inside the function instead.

**#3: File not uploaded to correct Azure path**
Verify via Kudu VFS GET download → `py_compile` locally → confirms the remote file isn't corrupt or truncated.

### Fix Checklist (ALL must be done)
1. Deploy `spx_followup.py` (new file)
2. Deploy `db_logger.py` (with dashboard functions + `update_spx_phone_by_tracking`)
3. Deploy `webhook_listener.py` (with lazy import + `_send_autopilot_summary`)
4. ALL THREE files deployed in one cycle

### Lazy Import Pattern for New Modules

```python
async def _check_spx_reminders():
    try:
        from spx_followup import determine_followup
    except ImportError:
        log.error("[SPX-REMINDER] spx_followup not available — skipping cycle")
        return
    # ... rest of function
```

This allows the scheduler to start even if the module isn't available. The function logs a clear error instead of crashing the entire app.

### Diagnosis Methodology
- **Exit code 3** → Python import error. Check ALL imports in `webhook_listener.py`, comment them out one by one to isolate.
- **Health 200 but SPX endpoints 502/timeout** → likely `get_dashboard_*` functions missing from deployed `db_logger.py`
- **Unexplained crash** → download remote files via Kudu, `py_compile` them, compare with local

### Verification Steps
1. `python3 -m py_compile webhook_listener.py db_logger.py spx_followup.py` — must pass before deploy
2. Download remote files via Kudu VFS and py_compile them — confirms upload integrity
3. Health check before proceeding to smoke tests
4. Smoke test: `determine_followup()` with 3 test cases (Remind1, anti-duplicate, Collected)
