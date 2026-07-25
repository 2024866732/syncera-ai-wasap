# SPX Follow-Up v1.1 Deploy Learnings (Jul 2026)

## Dashboard 502 After Deploy

### Symptom
- Dashboard `/api/spx/orders` or `/api/spx/stats` returns 502
- Health endpoint returns 200 (app is running)
- Browser shows "Failed to fetch SPX orders"
- Azure logs: `Container exited with exit code 3 during startup`

### Root Cause
`webhook_listener.py` imports dashboard functions from `db_logger.py` (e.g., `get_dashboard_overview`,
`get_dashboard_handoff_analytics`) that don't exist in the deployed `db_logger.py`. 
When deploying only `webhook_listener.py` + `spx_followup.py` without also deploying `db_logger.py`,
Python crashes at import-time (exit code 3) before the scheduler starts.

### Fix
Deploy `db_logger.py` together with `webhook_listener.py` when new DB functions are added.

### Lazy Import Pattern for New Modules

Top-level `from spx_followup import determine_followup` can cause Azure container startup failure
even when the file exists. Use lazy import inside the function:

```python
async def _check_spx_reminders():
    try:
        from spx_followup import determine_followup
    except ImportError:
        log.error("[SPX-REMINDER] spx_followup not available — skipping cycle")
        return
    # ... rest of function
```

### Verification
- `python3 -m py_compile webhook_listener.py` — must pass before deploy
- Download remote files via Kudu VFS and py_compile them — confirms upload integrity
- Health check before proceeding to smoke tests
- Smoke test: `determine_followup()` with 3 test cases (Remind1, anti-duplicate, Collected)
