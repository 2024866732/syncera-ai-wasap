# Forward Reference Bug: `Depends(get_current_staff)` Crashes at Import

## Context

Session 2026-07-04, Sprint v2.1.1 HAFJET WhatsApp Bot. After deploying with `az webapp deployment source config-zip` (Oryx build succeeded, `antenv` created with 28 packages), the app crashed at startup with exit code 3 in `docker.log`. Health returned 503 → timeout loop.

## Root Cause

The `webhook_listener.py` file had `get_current_staff` defined at line 1648, but routes using `Depends(get_current_staff)` started at line 1048. Python evaluates `Depends(get_current_staff)` at function definition time (when `def api_resolve` executes), not at call time. Since `get_current_staff` was 600 lines below, Python raised `NameError: name 'get_current_staff' is not defined` at import time, before any request could be served.

## Diagnosis Chain

1. `az webapp deploy` timed out → container 503
2. `config-zip` triggered full Oryx build → `antenv` with all deps
3. `appCommandLine` set to `cd ... && antenv/bin/gunicorn ...` → exit 127 (shell can't parse)
4. Fixed to absolute path `antenv/bin/gunicorn ...` → exit 3 (better!)
5. Downloaded `docker.log`: `Container has finished running with exit code: 3` at 12:03
6. Local test: `python3 -c "from webhook_listener import app"` → `NameError: name 'get_current_staff' is not defined`
7. `grep` found `get_current_staff` defined at line 1648, used from line 1048
8. Moved JWT auth block (JWT_ALGORITHM, _create_access_token, get_current_staff) to before line 1038
9. Local import now passes: ✅

## Key Log Evidence

From `2026_07_04_lw1sdlwk000C1U_docker.log`:
```
2026-07-04T11:54:10Z Container has finished running with exit code: 127.  ← shell parse
2026-07-04T12:04:21Z Container has finished running with exit code: 3.   ← import error
```

## ContainerStream log was 0 bytes

The container crashed before flushing stdout/stderr to the container stream log. The error traceback was not captured. The only signal was the exit code. This is typical for crash-looping containers where the process terminates in < 60s.

## Related Bugs (not the same!)

| Bug | Symptom | Cause | Fix |
|-----|---------|-------|-----|
| `dependencies=[]` | `current_staff` is `None` at runtime, 500 error | Decorator runs auth but discards return value | Move Depends to function signature |
| Forward reference | App crashes at import, exit code 3 | Function defined after route decorator | Move function above route definitions |

## Affected Code

```python
# Lines 1048-1077 (AFTER fix: these could use Depends)
@app.post("/api/customers/{phone}/resolve")
async def api_resolve(phone: str, current_staff: dict = Depends(get_current_staff)):
    ...

@app.post("/api/customers/{phone}/escalate")
async def api_escalate(phone: str, current_staff: dict = Depends(get_current_staff)):
    ...
```

The `get_current_staff` function (and its dependencies JWT_ALGORITHM, _hash_password, _create_access_token) was moved to just before the `# DASHBOARD API — Operator Actions` section.
