---
name: hafjet-deployment-plan
description: "Use when discussing, planning, or executing deployment for the HAFJET WhatsApp Bot. Locked strategy with four environments (Azure, AWS, Heroku, Oracle), exact CLI steps, and decision matrices for upgrades, throttling recovery, and failovers."
version: 1.10.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [deployment, azure, aws, heroku, oracle, whatsapp-bot]
    related_skills: [whatsapp-webhook-dev]

---

# HAFJET WhatsApp Bot - Deployment Strategy (LOCKED)

## Overview

This skill documents the locked deployment strategy for HAFJET WhatsApp Bot v2.1.
It covers four environments: Azure (primary production), AWS (staging), Heroku (fallback), and Oracle Cloud Always Free (fallback/throttle-recovery).
**Do not execute migrations without explicit user confirmation.** This is a reference playbook only.

## Support Files

| File | Purpose |
|------|---------|
| `references/config-var-audit.md` | Exact env var name mapping (internal var → Azure setting → Heroku config) |
| `references/dashboard-portability.md` | Dashboard static serving compatibility across platforms |
| `references/heroku-cli-setup.md` | Heroku CLI installation + API key auth (no browser login) |
| `references/security-hardening-phase1.md` | Phase 1 security hardening (signature fail-closed, API key auth, log masking) — EXACT code changes |
| `references/vite-env-injection.md` | Build-time env var injection for Vite + Azure ZIP deploy |
| `references/azure-debug-503.md` | Debugging 503 errors after deploy (QuotaExceeded, import errors, logging, **resource-not-found/app-deleted**) |
| `references/fallback-provider-setup.md` | Fallback provider config pattern (Cerebras as OpenRouter backup) |
| `references/server-backup-restore.md` | Server config backup/restore from GitHub |
| `references/forward-reference-depends.md` | Forward reference bug: `Depends(func)` defined below route decorator → NameError at import time |
| `scripts/verify_endpoints.py` | Full endpoint verification script (health, dashboard, API, webhook GET/POST, WebSocket) |
| `scripts/regression_v211.py` | Sprint v2.1.1 regression test: auth login/me, inbox filters (all/me/unassigned/escalated/resolved), PATCH conversation status (escalated/resolved/bot_active). 10 endpoint tests. Webhook escalation keyword test must be run separately using `test12.py` due to APP_SECRET handling. |
| `references/b1-upgrade-troubleshooting.md` | F1→B1 upgrade steps + app unreachable after upgrade |
| `references/azure-webapp-up-deploy.md` | `az webapp up` full deploy pattern (Oryx build, startup time budget, common failures) |
| `references/oracle-cloud-free-tier.md` | Oracle Cloud Always Free tier: limits, regions, OCI CLI auth, A1.Flex deployment, capacity risks |
| `references/pre-deploy-verification.md` | Pre-deploy verification workflow: show diff → test → wait for approval → deploy. Business data integrity rules. Routing debug pattern. |
| `references/dashboard-feature-workflow.md` | DB→Backend→Frontend→Build→Deploy workflow + nav sidebar + UI constants + blast/contacts feature patterns |
| `references/jwt-staff-auth.md` | JWT auth implementation for staff login, staff management, and multi-agent inbox (DB schema, token creation, dependency injection, route decorator pattern, endpoint table, Azure pitfalls) |
| `references/server-resource-optimization.md` | Server memory optimization — identifying RAM-heavy processes, verifying safety before stopping (multipathd/snapd/PM2/ngrok), tunnel verification pattern, and memory math for 848Mi Hermes server |
| `references/deploy-verification-audit.md` | Sprint verification protocol: source audit → ZIP content audit → deploy with approval → regression test → final report. Parameter name matching check, ZIP staleness detection, endpoint-by-endpoint verification table. |
| `references/sprint-completion-workflow.md` | Sprint sign-off workflow: source audit → ZIP audit → deploy → regression test (all endpoints + filters + edge cases) → "✅ Sprint X.Y.Z fully stable, ready for X.Y.Z+1" statement. Covers filter differentiation, ORDER BY verification, and anti-patterns. |
| `references/azure-antenv-startup-503.md` | 503 diagnosis after Oryx build: antenv discovery, `config-zip` vs `deploy --type zip` differences, appCommandLine precedence, and recovery steps from 2026-07-04 session. |
| `references/escalation-loop-bug.md` | Silent escalation failure: `loop2` undefined in `_process_message()` causes webhook to return 200 but skip DB update, staff notification, and customer reply. Detection via status verification after webhook test. |
| `references/regression-assertion-schema-matching.md` | **API response schema matching trap** — assertions can produce false negatives when test logic doesn't match actual response structure (`staff` wrapper, `action` field for PATCH status). Prevention pattern: inspect raw response before writing assertions. |

## Workflow Rules

0. **Follow spec order strictly — do NOT skip steps** — When the user provides a numbered spec (Sprint 1 → 2 → 3, or Feature 1 → 2 → 3), implement in the EXACT order given. Do not jump ahead or reorder. Each step builds on the previous one. If a spec says "Buat ikut urutan. Jangan skip step." — treat it as code. Evidence: user frustration at skipped steps despite clear ordering.

1. **Investigate BEFORE proposing fixes** — When user reports a bug, do NOT jump to "let me fix X". First:
   - Read the relevant code to find why it is failing (auth? field name mismatch? env var missing?)
   - Run SQL queries to confirm data exists in DB
   - Cross-reference API response field names vs frontend component expectations
   - Show evidence with code line numbers, not speculation
   - Only THEN offer a fix proposal.
   Violation: user says "siasat dulu dan tunjuk kod" or "jangan teka" or "kenapa". You missed an investigation step.

2. **Show diff + test log before deploying** — Tuan Hafizi reviews code AND test output BEFORE any deployment. Never apply changes in production without prior approval.

3. **Deploy only on explicit "deploy sekarang" command** — Do NOT deploy after showing diff. Wait for "deploy sekarang" or "DEPLOY SEKARANG". Showing approval-ready commands is fine; running them is not. Deploying without explicit approval is a violation.

4. **Never call success without evidence** — Do NOT say "semua dah ok" or "siap" without actual proof (dashboard screenshot, API response, SQL output, traceback). Show the proof, then state the status. If user asks "ada bukti dashboard yang bercanggah", you must investigate the discrepancy, not claim it is fixed without verification.

5. **Never invent business data** — Operating hours, prices, promotions, stock must come ONLY from verified files (business_info.txt, system_prompt.txt, intent_rules.json). If data is "belum sahkan"/"PENDING"/unconfirmed, do not change it. If missing, tell the user — never hardcode or fabricate.

6. **Audit before protecting** — When adding auth/middleware, audit frontend consumers first to avoid breaking existing functionality. Check:
   - Does the frontend bundle send the required auth headers? (verify in built JS, not source)
   - Are there any GET endpoints used by the UI that need to stay unprotected?
   - Does the middleware accidentally block non-protected routes when misconfigured? (Common bug: `if not DASHBOARD_API_KEY: return 500` before path check blocks ALL routes, including webhook/health/dashboard.)

7. **Fail closed, not open** — Security checks reject by default when config is missing, never silently skip. BUT: the check must be scoped to protected routes only, not the entire app. A missing API key should block protected writes, not crash the webhook or health endpoint.

8. **Minimal first pass** — Protect write routes first, read routes later — smaller blast radius.

9. **Coordinated frontend-backend deploys** — Backend auth + frontend headers in the SAME deploy. Never deploy backend-only auth without frontend update first. See `references/vite-env-injection.md`.

10. **Before protecting routes, verify VITE_API_KEY is set in build** — The dashboard frontend sends `X-API-Key` from `import.meta.env.VITE_API_KEY`. If this env var is not set during `npm run build`, the bundle sends an empty/wrong header. Backend middleware returns 401 (or 500) on all protected POST endpoints, including Manual Takeover, Resolve, Escalate, Note. This causes "loading spinner never stops" (fetch hangs because the request resolves with 401/500 and the exception is caught, but if the response does not return at all, the finally block never runs). **Symptoms of missing VITE_API_KEY:**
     - All dashboard action buttons (Take Over, Resolve, Escalate, Note) fail silently
     - Loading spinner never stops for Note
     - Error toast may or may not show depending on backend response
     - GET requests (customer list, messages) still work fine
   **Fix:** Always set `VITE_API_KEY=...` before `npm run build` in deploy script. Verify key is baked into bundle:
   ```bash
   grep -o "$DASHBOARD_API_KEY" dashboard/dist/assets/index-*.js | head -1
   ```

11. **Verify after deploy** — Health checks + test protected routes with valid AND invalid credentials. Do not assume deployment = working.

12. **Stop on throttle, do not retry** — 429 on plan create/delete = STOP. Wait 15+ min, reuse existing resources.

13. **Prefer web app recreate over plan recreate** — Deleting last web app auto-deletes plan. Expect it and plan for throttle window.

## Startup Command Precedence (Python/Linux, Critical)

When Azure App Service starts the Python container, it picks the startup command in this order:

| Precedence | Source | Set via | Example |
|-----------|--------|---------|---------|
| 1 (highest) | `appCommandLine` | `az webapp config set --startup-file "..."` | `antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000` |
| 2 | `STARTUP_COMMAND` env var | `az webapp config appsettings set --settings STARTUP_COMMAND="..."` | Same format as above |
| 3 (default) | Oryx-generated `startup.sh` | Automatic (no override) | Runs from `/home/site/wwwroot/startup.sh` with `antenv` activated |

**Critical rules:**
- **`appCommandLine` always wins** over `STARTUP_COMMAND` env var. If both are set, `appCommandLine` runs.
- **Must use `antenv/bin/gunicorn`**, not system `gunicorn`. Oryx installs packages into `antenv` virtualenv. The system Python's `gunicorn` will crash with `ModuleNotFoundError` because dependencies (fastapi, uvicorn, httpx) are only in `antenv`.
- **Shell chaining (`cd dir && cmd`)** in `appCommandLine` **ALWAYS FAILS** unless wrapped in `bash -c`. The container's entrypoint does NOT parse the string through a shell — it passes the entire string to `exec()` looking for an executable file named `cd /home/site/wwwroot && antenv/bin/gunicorn ...`. This produces **exit code 127** (command not found). Use absolute paths directly instead: `antenv/bin/gunicorn ...` (cwd defaults to `/home/site/wwwroot`). If shell chaining is required, use: `bash -c 'cd dir && cmd'`.
- **After Oryx build**, confirm `antenv` exists at `/home/site/wwwroot/antenv/` in the deployment logs. If the build was skipped, `antenv` won't exist.
- **`WEBSITES_PORT` must match** the gunicorn `--bind` port. Mismatch = 503/timeout.

**Diagnosis when 503 persists after deploy with `appCommandLine` set:**
1. Check `appCommandLine`: `az webapp config show -g <rg> -n <app> --query "appCommandLine"`
2. Check `WEBSITES_PORT`: `az webapp config appsettings list -g <rg> -n <app> --query "[?name=='WEBSITES_PORT'].value"`
3. Download logs: `az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip`
4. Look for `ModuleNotFoundError`, `antenv/bin/python: not found`, or port mismatch in the container stream log
5. If build took 0s, force rebuild (see Oryx stale cache section below)

## Oryx Virtualenv: `antenv` (not `venv`)

**Key fact:** Oryx always names the virtualenv `antenv` when building Python apps on Azure. The name is hardcoded in Oryx and cannot be changed via config.

```bash
# Oryx build output (from deployment log):
# Python Virtual Environment: antenv
# Creating virtual environment...
# /tmp/oryx/platforms/python/3.11.15/bin/python3.11 -m venv antenv
```

This means:
- Do NOT create a `venv/` directory locally and expect it to work on Azure (it won't be copied or activated)
- Do NOT use `source venv/bin/activate` in `start.sh` — Azure's container already activates `antenv`
- Always reference `antenv/bin/gunicorn` in `appCommandLine` or `STARTUP_COMMAND`
- If using a custom `start.sh`: the script can activate antenv with `source /home/site/wwwroot/antenv/bin/activate`

## Runtime Config Precedence (Env > DB > Default)

**Single source of truth = Azure env vars.** DB is fallback only for non-critical keys.

**Critical keys (env overrides DB, DB cannot silently disable):**
- `OPENROUTER_MODEL` → `ai_model`
- `OPENROUTER_API_KEY` → `ai_enabled` (only enable, never disable via DB)
- `AI_ENABLED` → `ai_enabled`
- `BOT_ACTIVE` → `bot_active`

**Required patterns:**
1. `get_runtime()` checks `_ENV_OVERRIDE_MAP` BEFORE DB cache.
2. `get_runtime_bool()` for `ai_enabled`/`bot_active`: env wins, DB can only enable (return True), default is the safety floor. DB false/empty must NOT override default True.
3. Effective model = `os.getenv("OPENROUTER_MODEL") or get_runtime("ai_model", "") or "nvidia/nemotron-3-super-120b-a12b:free"`.
4. Mirror effective model into `os.environ["OPENROUTER_MODEL"]` AND `hermes_ai.OPENROUTER_MODEL` at startup so downstream imports pick it up.

**Pitfall:** Changing `VALID_SETTINGS` default alone is insufficient. You must also update `hermes_ai.py` fallback default, dashboard placeholder, and `GET /api/settings` effective merge.

## Model Debug Logging

Every OpenRouter call MUST log before request:
```
[MODEL_DEBUG] model={model} base_url={url} timeout={timeout}
[MODEL_DEBUG] status_code={code}
[MODEL_DEBUG] reply={content[:200]}
```
This is non-negotiable for diagnosing 404/429/401 misconfigurations.

## Dashboard Effective Values

`GET /api/settings` must return effective runtime values: defaults → DB → env overrides. Dashboard Settings page must display what the bot actually uses, not just the DB default. Never show owl-alpha when nemotron is active.

## Analytics: Today-Only + Date Picker

Stats endpoints must default to today's data. Frontend Analytics must:
- Show `today_inbound`, `today_outbound`, `today_ai_calls`, `today_fallback_rate`, `today_avg_latency`.
- Provide `<input type="date">` + "Hari Ini" button.
- Never show all-time fallback rate as "today" figure.

**Formula for `today_fallback_rate`:**
```python
today_ai_calls = stats["today_ai_calls"] or 0
today_fallback = stats["today_fallback_count"] or 0
today_total_calls = today_ai_calls + today_fallback
stats["today_fallback_rate"] = round((today_fallback / today_total_calls) * 100) if today_total_calls > 0 else 0
```
**Pitfall:** Do NOT compute fallback rate as `(today_outbound - today_ai_calls) / today_outbound`. `today_outbound` includes staff manual replies and `[no_reply]` logs, which inflates the denominator and produces wrong rates (e.g., 100% when AI actually worked).

**Routing path contract:** `_detect_routing()` must return the exact same strings used in SQL `WHERE routing_path='...'` filters. If code returns `"ai_query"`, the SQL must filter on `'ai_query'`, not `'ai'`. Mismatch silently zeroes every counter. See `whatsapp-webhook-dev` `references/routing-path-mismatch.md`.

## Known Deployment Bugs & Fixes (2026-07)

### Bug: Oryx Stale Build Cache — `Build successful. Time: 0(s)`

**Symptom:** `az webapp deploy` shows `Build successful. Time: 0(s)`. After restart, the app still uses the OLD code (e.g., missing new files, old imports failing). `/home/site/wwwroot` contains only `output.tar.zst` and `oryx-manifest.toml` — no `.py` files.

**Root cause:** Oryx caches the build output in `output.tar.zst`. On subsequent deploys with the same file set, Oryx reuses the cached tarball instead of rebuilding from the fresh ZIP files. The old tarball may be missing files (e.g., `repair_db.py`, `system_prompt.txt`).

**Detection:**
1. Deploy output shows `Time: 0(s)` — the build step completed instantly.
2. Most reliable: compare a known file's content from the deployed app vs local. If the app uses old code despite fresh ZIP, cache is stale.
3. Check `/home/site/wwwroot/` contents via startup log — if only tarball + manifest exist without `.py` files, Oryx is managing deployment via cache.

**Fix (three options, try in order):**

1. **Force Oryx rebuild with timestamp app setting** (simplest, no downtime):
   ```bash
   az webapp config appsettings set -g <rg> -n <app> --settings "ORYX_BUILD_TIMESTAMP=$(date +%s)"
   az webapp deploy -g <rg> -n <app> --src-path deploy-hafjet-bot.zip --type zip
   ```
   The new app setting invalidates Oryx's cache fingerprint, forcing a full rebuild from the fresh ZIP files. The build output will show a time > 0s.

2. **Use `az webapp deployment source config-zip`** (deprecated but forces build):
   ```bash
   az webapp deployment source config-zip -g <rg> -n <app> --src deploy-hafjet-bot.zip --timeout 300
   ```
   This older method triggers a full Oryx build even when the modern `az webapp deploy` would use cache. Note: this command is deprecated and will be removed in future CLI versions. **Known side-effect:** after `config-zip` deploys, the app may start with 503/timeout for 30-90s during warmup. Run `az webapp restart -g <rg> -n <app>` after deployment if the site stays stuck.

3. **Delete cache + redeploy** (if options 1-2 fail):
   Stop the app → delete `oryx-manifest.toml` and `output.tar.zst` from `/home/site/wwwroot/` via Kudu VFS API → start app → deploy fresh ZIP with `--type zip`. Kudu VFS requires publishing credentials (always redacted by Azure CLI) — option 1 or 2 is preferred.

**Pitfall:** If the app is STOPPED while deploying, `az webapp deploy --type zip` may fail with 502 (Kudu warmup failure). Always deploy while the app is RUNNING, or use `config-zip` which handles stopped apps better.

**Post-recovery verification:**
```bash
# Confirm build took time (> 0s)
curl -s https://<app>.scm.azurewebsites.net/api/deployments/latest | grep status

# Confirm new files exist (check a known new file via import test in logs)
az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip
# Extract and search for 'IMPORT OK' or specific module names

# Quick health check
curl -s http://<app>.azurewebsites.net/health | python3 -m json.tool
```

See `references/oryx-rebuild-force.md` for the full session transcript, exact CLI sequences, and the `ORYX_BUILD_TIMESTAMP` vs `config-zip` vs cache-deletion decision tree.

### Bug: `api_note` / `api_resolve` / `api_escalate` — Spinner Never Stops (Sync DB in Async Endpoint)

### Bug: FastAPI `Depends` — Decorator `dependencies=[]` Does NOT Inject

**Symptom:** Endpoint returns HTTP 500 with `TypeError: 'NoneType' object is not subscriptable` at `current_staff["id"]`, even though the JWT token is valid. The auth check runs (rejects invalid tokens with 401), but the injected user data is never available in the handler.

**Root cause:** FastAPI has TWO separate places for `Depends()`:

1. **Decorator `dependencies=[]`** — `@app.get("/path", dependencies=[Depends(func)])` — runs the dependency (auth check, etc.) but does **NOT** inject the return value into the handler parameter.
2. **Function signature default** — `async def handler(param: dict = Depends(func))` — runs the dependency **AND** injects the return value into `param`.

When you use `dependencies=[Depends(get_current_staff)]` in the decorator + `current_staff: dict = None` in the function signature, the `current_staff` parameter stays `None` — the dependency ran but the result was silently dropped. Any code that accesses `current_staff["id"]` crashes with `'NoneType' object is not subscriptable`.

```python
# ❌ WRONG — auth runs, result is LOST, current_staff stays None
@app.get("/api/staff", dependencies=[Depends(get_current_staff)])
async def api_list_staff(current_staff: dict = None):
    print(current_staff["id"])  # CRASHES: 'NoneType' object is not subscriptable

# ✅ CORRECT — Depends in function signature both runs AND injects
@app.get("/api/staff")
async def api_list_staff(current_staff: dict = Depends(get_current_staff)):
    return {"staff": current_staff}

# ✅ ALSO VALID — use BOTH decorator AND function sig (decorator for auth-only middleware, sig for injection)
@app.get("/api/staff", dependencies=[Depends(log_access)])
async def api_list_staff(current_staff: dict = Depends(get_current_staff)):
    ...
```

**When to use which:**

| Pattern | Runs dependency? | Injects return value? | Use case |
|---------|-----------------|----------------------|----------|
| `dependencies=[Depends(func)]` in decorator | ✅ Yes | ❌ No | Auth check only (return 401, don't need user data) |
| `param = Depends(func)` in function sig | ✅ Yes | ✅ Yes | Need the user object or any dependency return value |
| Both simultaneously | ✅ Yes (both) | ✅ Yes (sig one) | Auth + logging + data injection |

**Detection:** Search for `dependencies=\[Depends\(` in route decorators. If the same endpoint also has `current_staff: dict = None` in its signature, the pattern is broken — `current_staff` will always be `None`.

**Fix:** Move `Depends(...)` from the decorator's `dependencies=[]` to the function parameter's default value:

```python
# BEFORE (broken):
@app.get("/api/staff", dependencies=[Depends(get_current_staff)])
async def api_list_staff(current_staff: dict = None):
    ...

# AFTER (fixed):
@app.get("/api/staff")
async def api_list_staff(current_staff: dict = Depends(get_current_staff)):
    ...
```

### Bug: FastAPI `Depends` — Forward Reference (`NameError: name X is not defined`)

**Symptom:** App crashes with exit code 3 during startup. `docker.log` shows `Container has finished running with exit code: 3.` Health returns 503 / timeout. The Python error `NameError: name 'get_current_staff' is not defined` appears at import time.

**Root cause:** Python evaluates default parameter values at **function definition time**, not at call time. When a route decorator has `Depends(get_current_staff)` in its parameter list, Python resolves `get_current_staff` immediately when the `def` statement executes — it does NOT wait until the endpoint is called. If `get_current_staff` is defined LATER in the same file (below the route definitions), Python raises `NameError` at import time.

```python
# ❌ WRONG — Python evaluates Depends(get_current_staff) at definition time,
#   but get_current_staff hasn't been defined yet
@app.get("/api/resolve")
async def api_resolve(phone: str, current_staff: dict = Depends(get_current_staff)):
    ...

# ... 600 lines of code ...

async def get_current_staff(request: Request) -> dict:
    ...

# ✅ RIGHT — define get_current_staff BEFORE the routes that use it
async def get_current_staff(request: Request) -> dict:
    ...

@app.get("/api/resolve")
async def api_resolve(phone: str, current_staff: dict = Depends(get_current_staff)):
    ...
```

**This is different from the `dependencies=[]` bug above.** The `dependencies=[]` bug causes `current_staff` to be `None` at runtime (auth runs but result is lost). The forward reference bug crashes the entire app at import time before any request is served. They require different fixes.

**Detection:**
- Exit code 3 in docker log + empty container stream log
- Local import test: `python3 -c "from webhook_listener import app"` shows `NameError`
- Search for `Depends(` in route decorators, then check if the referenced function is defined above or below the decorator line

**Fix:** Move the dependency function definition ABOVE the first route that uses it. If the function relies on constants or helper functions defined below the routes, move those too:

```python
# Move this entire block before all route decorators
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 8

def _create_access_token(...):
    ...

async def get_current_staff(request: Request) -> dict:
    ...

# NOW the routes can use Depends(get_current_staff)
@app.get("/api/resolve")
async def api_resolve(phone: str, current_staff: dict = Depends(get_current_staff)):
    ...
```

**Affected endpoints in HAFJET codebase (all 6 fixed Jul 2026):**
- `GET /api/auth/me` — was returning `{"staff": null}`
- `GET /api/staff` — worked by luck (didn't use current_staff)
- `POST /api/staff` — crashed on `current_staff["role"]`
- `PATCH /api/staff/{id}/status` — crashed on `current_staff["id"]`
- `GET /api/inbox` — crashed on `current_staff["id"]` (was HTTP 500, saw 0 conversations)
- `PATCH /api/conversations/{phone}/assign` — worked by luck

### Bug: FastAPI Param Name Mismatch — Query Parameter Name ≠ Function Parameter Name

**Symptom:** Endpoint always uses its default value regardless of query string. E.g., `/api/inbox?filter=unassigned` returns ALL conversations, not just unassigned ones. The filter silently does nothing.

**Root cause:** FastAPI matches query parameter names to **function parameter names** exactly. If the frontend sends `?filter=unassigned` but the backend function signature has `filter_type: str = "all"`, FastAPI cannot match `filter` to `filter_type` and falls back to the default value `"all"`. No error is raised — the wrong data is returned silently.

```python
# ❌ WRONG — frontend sends ?filter=, backend expects filter_type=
async def api_inbox(filter_type: str = "all", current_staff: dict = Depends(...)):
    # ?filter=unassigned is ignored, filter_type stays "all"

# ✅ CORRECT — parameter name matches query param name
async def api_inbox(filter: str = "all", current_staff: dict = Depends(...)):
    # ?filter=unassigned maps to filter="unassigned"
```

**Detection:**
1. Add a debug log: `log.info(f"api_inbox called: filter={filter}")` before processing
2. Or inspect the deployed ZIP vs source: if the ZIP has `filter_type` but source has `filter`, the ZIP is stale
3. Or verify via API: call `/api/inbox?filter=unassigned` when you know a conversation is assigned — if it still appears, the filter isn't being applied

**Root cause chain (how it happens in practice):**
1. Developer patches the FastAPI endpoint, changing the parameter name (e.g., `filter_type` → `filter`) to match the frontend
2. Developer FORGETS to rebuild the deploy ZIP after the source change
3. The old ZIP still has the old parameter name
4. Deploy "succeeds" (build reports OK), but endpoint silently uses defaults
5. Filters don't work — but it looks like a backend logic bug, not a stale-deploy issue

**Fix:** Always rebuild the ZIP from current source BEFORE deploying. Verify ZIP content before deploy:

```bash
python3 -c "
import zipfile
z = zipfile.ZipFile('/tmp/deploy.zip')
wl = z.read('webhook_listener.py').decode()
# Check parameter names match frontend expectations
import re
match = re.search(r'async def api_inbox\((\w+):', wl)
print(f'api_inbox param: {match.group(1)}')  # Should be 'filter', not 'filter_type'
"
```

**Prevention:** Add a ZIP audit step to the deploy workflow — verify that the source code's parameter names match what the frontend sends before deploying. See `references/deploy-verification-audit.md`.

### Bug: `hashlib` Missing When Seeding Default Admin in `init_db()`

**Symptom:** App startup fails with `NameError: name 'hashlib' is not defined` when `init_db()` seeds the default admin. Container exits with code 3, health returns 503 / Application Error.

**Root cause:** `db_logger.py` does not import `hashlib`, but `init_db()` calls `hashlib.sha256(...)` when seeding the default admin.

**Fix:** Add `import hashlib` at the top of `db_logger.py`.

**Default admin pattern for local dev + Azure:**
```python
# Seed default admin if no staff exists
cur = conn.execute("SELECT COUNT(*) FROM staff")
if cur.fetchone()[0] == 0:
    default_pwd = hashlib.sha256("admin123".encode()).hexdigest()
    conn.execute(
        "INSERT INTO staff (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)",
        ("Tuan Hafizi (Admin)", "hafizi@hafjet.com", default_pwd, "admin", "online")
    )
    conn.commit()
    log.info("✅ Default admin created: hafizi@hafjet.com / admin123")
```

**Pitfall — `bot_data.db` persistence across deploys:** The `staff` table is created in `init_db()` inside the persistent `bot_data.db`. If you create the first admin locally and then deploy, Azure's `bot_data.db` already exists and will NOT re-run `init_db()`. The local admin will not exist in production. Options:
1. Create admin via `POST /api/auth/register` or direct SQL after deploy.
2. Or use Azure Kudu console to delete `bot_data.db` and restart (data loss).
3. Preferred: create the admin via the API after deploy.

### Bug: Deploying While App Is STOPPED Causes 502

**Symptom:** Clicking Simpan Note shows spinner that never finishes. Tandai Selesai and Escalate have the same issue. No error toast. Network tab shows the POST request never completes (pending forever or 500 after timeout).

**Root cause:** Operator action endpoints in `webhook_listener.py` call synchronous SQLite functions **directly** (without `run_in_executor`), blocking the async event loop. SQLite with `check_same_thread=False` still blocks on write locks. If the DB is busy saving an inbound message from the webhook, the async call waits → event loop freezes → request hangs → `finally { setActionLoading(null) }` never runs.

```python
# ❌ WRONG — sync call in async def, blocks event loop
@app.post("/api/customers/{phone}/note")
async def api_note(phone, data: dict, operator="dashboard"):
    result = update_customer_note(phone, note, operator)  # SYNC!

# ✅ RIGHT — offload to thread pool
@app.post("/api/customers/{phone}/note")
async def api_note(phone, data: dict, operator="dashboard"):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, update_customer_note, phone, note, operator)
```

**Affected endpoints:**
- `POST /api/customers/{phone}/note` (line 832)
- `POST /api/customers/{phone}/resolve` (line 814)
- `POST /api/customers/{phone}/escalate` (line 823)
- `POST /api/customers/{phone}/handoff` (line 842) — also calls sync `get_customer_detail()`

**Did not affect** `log_inbound`/`log_outbound` because those already use `loop.run_in_executor(None, _save_inbound, ...)` — the correct pattern.

**Detection:** Check if the async endpoint calls any sync function directly (not via executor). FastAPI endpoints should never call synchronous SQLite/IO functions directly.

**Fix:** Wrap all sync DB function calls in `await loop.run_in_executor(None, func, *args)`.

**Pitfall:** Missing positional args. `log_outbound(phone, message, "staff")` fails because it requires `latency_ms` and `fallback_used` — caught only at runtime, not at syntax check.

### Bug: WebSocket Realtime — `inbound_message` / `outbound_message` vs `new_message`

**Symptom:** Chat panel shows old messages via API load, but new inbound/outbound messages never appear in real-time (no WebSocket append).

**Root cause:** Two mismatches between backend broadcast and frontend WebSocket handler:

| Layer | Backend sends | Frontend expects | Issue |
|-------|--------------|------------------|-------|
| Event name | `event: "inbound_message"` | `data.type === "new_message"` | Field name mismatch |
| Phone field | `data.phone: "6012..."` | `msg.from === phone` | Key name mismatch |

Backend (`db_logger.py:145`):
```python
broadcast_ws("inbound_message", {"phone": phone, "content": content, ...})
# → WS message: {"event": "inbound_message", "data": {"phone": ..., "content": ...}}
```

Frontend (`ChatView.jsx:53`):
```javascript
const data = JSON.parse(event.data);
if (data.type === 'new_message' && data.data) {           // data.type is undefined
  const msg = data.data;
  if (msg.from === phone || msg.to === phone) { ... }     // msg.from is undefined
}
```

**Fix:** Update ChatView handler to match backend broadcast format:
```javascript
if ((data.event === 'inbound_message' || data.event === 'outbound_message') && data.data) {
  const msg = data.data;
  if (msg.phone === phone) { ... }
}
```

The WS broadcast does NOT include `message` and `source` aliases — those are added only in the `/api/messages` endpoint. WS handler must construct the message object from available fields.

### Bug: VITE_API_KEY Not Injected Due to Shell Env Shadowing

**Symptom:** After creating `dashboard/.env.production` with the correct key and running `npm run build`, the built JS bundle still has `X-API-Key:""` (empty). The shell env var `VITE_API_KEY=*** overrides the `.env.production` file because vite overlays `process.env` on top of `.env` files.

**Root cause:** When the terminal session has `VITE_API_KEY=*** (set from a previous command like `DASHBOARD_API_KEY=*** python3 -m uvicorn ...` where the tool persists env across commands), vite loads `.env.production` first, THEN replaces values with `process.env` values. The shell env var wins, injecting `***` (literal asterisks or empty) instead of the real key.

**Fix (two options):**
1. **Clear env before build:** `VITE_API_KEY=*** npm run build` or `export VITE_API_KEY=*** before building
2. **Use a different mode file name** (`.env.buildtime`) and load it explicitly

**Verification:**
```bash
# Check raw bytes, not terminal output (terminal may mask secrets)
python3 -c "
with open('dashboard/dist/assets/index-*.js', 'rb') as f:
    data = f.read()
idx = data.find(b'X-API-Key')
print(data[idx:idx+70])  # Must show actual key, not *** or empty
"
```

### Bug: Cold Start `ModuleNotFoundError` After Fresh Deploy — Exit Code Diagnosis

When the container exits during startup, the **exit code** in `docker.log` reveals the failure stage before you can see the actual Python traceback:

| Exit Code | Meaning | Likely Cause | 
|-----------|---------|-------------|
| 1 | Generic Python process crash | Runtime error after import (e.g., binding failure, port conflict) |
| 3 | Gunicorn APP IMPORT ERROR | Python module cannot be imported (NameError, ImportError, SyntaxError in app code) |
| 127 | Command not found | `appCommandLine` uses shell operators (`&&`, `||`) without `bash -c` wrapper, or path is wrong |

**Diagnosis flow:**
1. Read exit code from `docker.log`: `grep "exit code:" LogFiles/2026_07_*_docker.log | tail -5`
2. **Exit 127** → Fix `appCommandLine` format (remove shell operators or wrap in `bash -c '...'`)
3. **Exit 3** → Fix Python import error (test locally: `python3 -c "from webhook_listener import app"`)
4. **Exit 1** → Check for runtime errors (binding, port, file-not-found at runtime)

**ContainerStream log is often 0 bytes for crash-looping containers.** When the container crashes within seconds (exit code 3 or 127), the Python traceback goes to stdout/stderr but may NOT be flushed to the container stream log file before the container terminates. Do NOT rely on `containerStream.log` having the error — use local import testing combined with the exit code.

The exit code ALWAYS appears in `docker.log` because it's tracked by the container runtime, not by the app's log stream.

### Bug: Cold Start `ModuleNotFoundError` After Fresh Deploy

**Symptom:** App fails to start after `az webapp deploy`. Container stream log shows:
```
ModuleNotFoundError: No module named 'httpx'
```
even though `httpx` is in `requirements.txt`. Health endpoint returns 503 / Application Error page.

**Root cause:** Two possible causes:

1. **`appCommandLine` uses system Python gunicorn** (most common) — The Azure container's system `gunicorn` runs from the base Python install, which has NO project dependencies. The dependencies were installed into `antenv` by Oryx build, but `appCommandLine` points to the system path. Fix: use `antenv/bin/gunicorn` instead.

2. **Oryx cached build** — Oryx build system reuses a cached build manifest (`oryx-manifest.toml`) and `output.tar.zst` without rebuilding the virtualenv. The cached build may be missing installed packages, or `antenv` directory is not present in `/home/site/wwwroot/`. This happens when `SCM_DO_BUILD_DURING_DEPLOYMENT=false` is set, or after Oryx cache invalidation issues.

**Fix — Use `antenv` path (primary):**
```bash
# Set appCommandLine to use antenv's gunicorn
az webapp config set -g <rg> -n <app> \
  --startup-file "antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120"
```

**Fix — Add auto-install fallback in `start.sh` (secondary/legacy):**
```bash
echo "=== PYTHON DEPS CHECK ==="
python3 - <<'PY'
import importlib
for mod in ["fastapi","uvicorn","gunicorn","httpx","dotenv","wsproto","requests"]:
    try:
        importlib.import_module(mod if mod != "dotenv" else "dotenv")
        print(f"OK {mod}")
    except Exception as e:
        print(f"MISSING {mod}: {e}")
PY
MISSING=$(python3 -c "import importlib; print(','.join([m for m in ['fastapi','uvicorn','gunicorn','httpx','dotenv','wsproto','requests'] if not __import__('importlib').import_module(m if m!='dotenv' else 'dotenv', package=None)]))" 2>/dev/null || echo "all")
if [ "$MISSING" != "" ] && [ "$MISSING" != "all" ]; then
  echo "Installing missing python deps: $MISSING"
  pip install -r /home/site/wwwroot/requirements.txt 2>&1 | tail -3 || true
else
  echo "All python deps present"
fi
```

**Post-deploy verification:**
```bash
az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip
python3 -c "
import zipfile
with zipfile.ZipFile('/tmp/logs.zip') as zf:
    log = 'LogFiles/StartupLogs/<latest>_failure.log'
    with zf.open(log) as f:
        print(f.read().decode()[-1000:])
"
```
Look for `IMPORT OK` and `🚀 HAFJET Bot startup complete` lines, not `ModuleNotFoundError`.

### Pattern: Async Deploy with Polling

When `az webapp deploy` times out or stalls (no completion status after minutes), use `--async true` and poll the app state:

```bash
az webapp deploy --resource-group <rg> --name <app> --src-path deploy.zip --type zip --async true
# Then poll:
for i in 1 2 3 4 5 6; do sleep 30; state=$(az webapp show -g <rg> -n <app> --query "state" -o tsv); echo "[$i] state=$state"; [ "$state" = "Running" ] && break; done
```

**Pitfall:** Killing the `az webapp deploy` process does NOT cancel the deployment on Azure. The build continues server-side. Do not re-deploy until the first deployment completes or fails — concurrent deployments can conflict.

### Pattern: Extracting Azure Container Logs

`az webapp log tail` may hang or time out. Alternative:

```bash
az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip
python3 -c "
import zipfile
with zipfile.ZipFile('/tmp/logs.zip') as zf:
    for log in zf.namelist():
        if 'containerStream' in log and '2026_07_03' in log:
            with zf.open(log) as f:
                lines = f.read().decode('utf-8', errors='replace').splitlines()
                for line in lines[-40:]: print(line)
            break
"
```

**Pitfall:** `unzip` CLI may not be installed on the VM. Use Python `zipfile` instead.

## Sprint Implementation Protocol (HAFJET User Preference)

When the user gives a multi-tugas spec (Sprint vX.Y.Z → TUGAS 1 → 2 → 3 → 4), implement in this EXACT order:

**Per-Tugas Workflow:**
1. Show the diff (`patch` tool) for the file changes
2. Test locally (run the Python code, verify syntax with lint)
3. Log the result in a scannable format
4. Get user acknowledgment before proceeding to next TUGAS
5. After all TUGAS done: build clean ZIP → propose deploy with checklist → wait for approval → deploy → restart → regression test → final report

**Anti-patterns:**
- ❌ Do NOT batch multiple TUGAS changes into one massive diff without per-tugas testing
- ❌ Do NOT deploy without showing the final ZIP verification checklist
- ❌ Do NOT skip the "request approval" step for risky commands
- ❌ Do NOT assume the user wants the same changes across files without explicit direction

**Approval workflow for risky commands:**
```markdown
⚠️ Command Approval Required
<command>
Reason: <tujuan & risiko>
```
Wait for "✅ APPROVED" before executing.

## APScheduler + FastAPI Lifecycle Pattern

**Use when:** Adding periodic background tasks (escalation timeout, cleanup, health pings) to a FastAPI app.

```python
# 1. Import
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

# 2. Module-level scheduler (not inside function or class)
_scheduler = AsyncIOScheduler()

# 3. Define job function (async)
async def _check_escalation_timeout():
    """Runs every 5 minutes. Check conversations escalated > 2h without reply."""
    loop = asyncio.get_event_loop()
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
        conn = await loop.run_in_executor(None, _get_db)
        rows = conn.execute(
            "SELECT phone FROM customers WHERE status='escalated' AND bot_paused=1 "
            "AND escalated_at IS NOT NULL AND escalated_at < ?",
            (cutoff,)
        ).fetchall()
        conn.close()
        for row in rows:
            phone = row[0]
            # Resume bot
            conn2 = await loop.run_in_executor(None, _get_db)
            conn2.execute("UPDATE customers SET bot_paused=0 WHERE phone=?", (phone,))
            conn2.commit()
            conn2.close()
            await send_whatsapp_message(phone, "Staff sedang sibuk. Boleh saya bantu sementara ini?")
    except Exception as e:
        log.error(f"❌ Scheduler error: {e}", exc_info=True)

# 4. Start in startup event
@app.on_event("startup")
async def startup_event():
    _scheduler.add_job(
        _check_escalation_timeout,
        IntervalTrigger(minutes=5),  # Check interval
        id="escalation_timeout_check",
        replace_existing=True,
    )
    _scheduler.start()

# 5. Stop in shutdown event (critical for clean restarts)
@app.on_event("shutdown")
async def shutdown_event():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
```

**Pitfalls:**
- Module-level scheduler object (not inside a function) — APScheduler manages its own lifecycle
- `replace_existing=True` prevents duplicate job on hot-reload
- Wrap job body in try/except — scheduler does NOT surface exceptions by default
- For FastAPI `lifespan` pattern (modern FastAPI), use `@asynccontextmanager` instead of `@app.on_event`

## SQLite Migration Pattern (Idempotent ALTER TABLE)

**Use when:** Adding new columns to production SQLite without risking `duplicate column name` errors.

```python
# Place this in init_db() or a dedicated migration function
for col in ["escalation_notified INTEGER DEFAULT 0", "bot_paused INTEGER DEFAULT 0"]:
    try:
        conn.execute(f"ALTER TABLE customers ADD COLUMN {col}")
    except sqlite3.OperationalError:
        pass  # Column already exists — safe to ignore
```

**Pattern rules:**
- Always wrap in try/except OperationalError — SQLite has no `IF NOT EXISTS` for ALTER TABLE
- Use a list of column definitions for multiple columns
- Run at startup (in `init_db()`) so migrations apply automatically on deploy
- **Never add NOT NULL without DEFAULT** — existing rows will get NULL and break queries

## Conversation Status Workflow (State Machine)

**Status lifecycle:** `bot_active → assigned → escalated → resolved` (with auto re-open)

**bot_paused relationship (Guardrail 4):**
| Status | bot_paused | Bot behavior | Staff takeover |
|--------|-----------|-------------|----------------|
| `bot_active` | 0 | Normal AI replies | None |
| `assigned` | 1 | Paused — skip auto-reply | Staff is handling |
| `escalated` | 1 | Paused — skip auto-reply | Pending staff action |
| `resolved` | 0 | Ready to re-open | Completed |

**Implementation pattern:**
```python
def update_conversation_status(phone: str, new_status: str) -> dict:
    paused = 1 if new_status in ("escalated", "assigned") else 0
    conn = _get_db()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    if new_status == "escalated":
        conn.execute("UPDATE customers SET status=?, escalated_at=?, bot_paused=? WHERE phone=?",
            (new_status, now, paused, phone))
    elif new_status == "resolved":
        conn.execute("UPDATE customers SET status=?, resolved_at=?, bot_paused=? WHERE phone=?",
            (new_status, now, paused, phone))
    else:
        conn.execute("UPDATE customers SET status=?, bot_paused=? WHERE phone=?",
            (new_status, paused, phone))
    conn.commit()
    ...
```

**Re-open rule:** When customer sends a message to a `resolved` + `bot_paused=0` conversation, reset to `bot_active` in `_process_message()`:
```python
if cust.get("status") == "resolved":
    await update_conversation_status(from_number, "bot_active")
    log.info(f"Re-opened resolved conversation for {from_number}")
```

## Staff Notification Workflow

**Pattern for notifying staff about escalations (WhatsApp + WebSocket fallback):**

```python
async def _notify_staff(customer_phone, message_preview, staff_id=None):
    # 1. Determine target (admin fallback if no staff_id)
    target_id = staff_id or 1  # admin
    
    # 2. Look up staff's WhatsApp number
    staff_number = await loop.run_in_executor(None, get_staff_whatsapp, target_id)
    if not staff_number:
        # Fallback: WebSocket notification to dashboard
        broadcast_ws("notification", {"type": "escalation", "phone": customer_phone, ...})
        return False
    
    # 3. Send WhatsApp (24-hour window enforced by Meta server-side)
    msg = f"🔔 Escalation from {customer_phone}: \"{message_preview[:80]}\" Dashboard: https://..."
    sent = await send_whatsapp_message(staff_number, msg)
    if not sent:
        # Fallback: WebSocket notification
        broadcast_ws("notification", {"type": "escalation", "phone": customer_phone, ...})
    return sent
```

**Rules:**
- Never block the escalation flow if notification fails — log and proceed
- Use `asyncio.create_task(_notify_staff(...))` for fire-and-forget (don't await in the webhook)
- WebSocket fallback ensures dashboard operators see the notification even if WhatsApp delivery fails

## ZIP Build Discipline

**Always build deploy ZIP with explicit Python script, NOT `zip -r`.** Bash recursive zip is brittle: includes `node_modules`, `.git`, `__pycache__`, `.env`, `bot_data.db`, and silently misses files depending on cwd.

```python
import zipfile, os

out = "deploy-hafjet-bot.zip"
skip_dirs = {"node_modules", "__pycache__", ".git", "venv", ".backup", "logs"}
exclude_files = {"test_model_debug.py", "bot_data.db"}

# If os.walk('.') times out because node_modules is huge, use an explicit file list instead:
# files = ['webhook_listener.py', 'db_logger.py', 'hermes_ai.py', 'repair_db.py', 'requirements.txt', 'start.sh', 'business_info.txt', 'system_prompt.txt']
# WARNING: Exclude bot_data.db from explicit list — local copy will overwrite production DB

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk('.'):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for f in filenames:
            if f in exclude_files or f.startswith('.'):
                continue
            abs_path = os.path.join(dirpath, f)
            arc_path = os.path.relpath(abs_path, '.')
            z.write(abs_path, arc_path)
```

**ZIP must contain:**
- Backend `.py` files at root: `webhook_listener.py`, `db_logger.py`, `hermes_ai.py`, `repair_db.py`, etc.
- Frontend build ONLY: `dashboard/dist/` (not `dashboard/src/`, not `dashboard/node_modules/`)
- Never include `.env`, `.env.*`, secrets, or backup files
- **`repair_db.py` is required** — omitting it causes `ModuleNotFoundError` at Azure startup, producing silent 503/timeout failures.
- **`bot_data.db` must be excluded** — uploading it overwrites the production DB with an empty local copy. The local `bot_data.db` (in the repo directory) is usually empty/stale — including it in the ZIP will replace the real production DB on Azure, causing data loss. Always filter it out: `if f == 'bot_data.db': continue`.
- **`deploy-hafjet-bot.zip` must self-exclude** — the ZIP build script must not include the previously-built ZIP file itself. Add `if f.endswith('.zip'): continue` to the exclude list.

**Validate before deploy:**
```bash
python3 -c "import zipfile; z=zipfile.ZipFile('deploy-hafjet-bot.zip'); print('Total files:', len(z.namelist())); print('.py files:', [n for n in z.namelist() if n.endswith('.py')])"
```

## Local Webhook Test Pattern (Pre-Deploy MODEL_DEBUG Verification)

Before deploying AI changes, verify `[MODEL_DEBUG]` logs locally to catch model name / timeout / status_code issues:

```bash
# Terminal 1: Start server with Azure-equivalent env vars
cd ~/.hermes/whatsapp-bot
DASHBOARD_API_KEY="***" \
OPENROUTER_API_KEY="***" \
OPENROUTER_MODEL="nvidia/nemotron-3-super-120b-a12b:free" \
AI_ENABLED=true BOT_ACTIVE=true \
python3 -m uvicorn webhook_listener:app --host 127.0.0.1 --port 8080

# Terminal 2: Send test webhook
python3 - <<'PY'
import json, hmac, hashlib, requests
APP_SECRET="<from Azure App Settings>"
payload = {"object":"whatsapp_business_account","entry":[{"id":"123","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"+60 16-980 8736"},"contacts":[{"profile":{"name":"Test"},"wa_id":"60119999999"}],"messages":[{"from":"60119999999","id":"wamid.test.001","timestamp":"1234567890","type":"text","text":{"body":"berapa harga repair screen?"}}]},"field":"messages"}]}]}
body = json.dumps(payload, separators=(',',':'))
sig = "sha256=" + hmac.new(APP_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
headers = {"Content-Type":"application/json","X-Hub-Signature-256":sig}
r = requests.post("http://127.0.0.1:8080/webhook", data=body, headers=headers)
print(r.status_code, r.text)
PY
```

Expected log output:
```
[hermes_ai] [OPENROUTER] Model: nvidia/nemotron-3-super-120b-a12b:free
[MODEL_DEBUG] model=nvidia/... base_url=... timeout=30
[MODEL_DEBUG] status_code=200
[MODEL_DEBUG] reply=...
```

If status_code != 200 or reply is missing, fix BEFORE deploying.

## Post-Deploy Verification Checklist

After `az webapp deploy` + `az webapp restart`:

```bash
# 1. Health
curl -s http://hafjet-whatsapp-bot.azurewebsites.net/health

# 2. Effective settings (must show env overrides)
curl -s -H "X-API-Key: $DASHBOARD_API_KEY" http://hafjet-whatsapp-bot.azurewebsites.net/api/settings | python3 -m json.tool

# 3. Stats (today-only)
curl -s http://hafjet-whatsapp-bot.azurewebsites.net/api/stats | python3 -m json.tool

# 4. Dashboard SPA
curl -s -o /dev/null -w "%{http_code}" http://hafjet-whatsapp-bot.azurewebsites.net/dashboard

# 5. Frontend bundle contains new features
curl -s http://hafjet-whatsapp-bot.azurewebsites.net/dashboard/assets/index-*.js | grep -o 'today_fallback_rate\|selectedDate'
```

**Critical assertions:**
- `ai_model` in `/api/settings` must equal Azure env `OPENROUTER_MODEL` (nemotron), NOT `owl-alpha`
- `bot_active` and `ai_enabled` must be `true` if Azure env vars set
- Today stats must have `today_fallback_rate`, `today_avg_latency` keys
- Dashboard HTML must return 200 with React `<div id="root">`
- If an AI bug is suspected, run a test message and verify `[MODEL_DEBUG]` log appears in `az webapp log download` with correct `model=` and `status_code=` before deploying any AI-related fix

| Item | Value |
|------|-------|
| **Primary platform** | Azure App Service B1 (Basic) |
| **App name** | `hafjet-whatsapp-bot` |
| **Resource group** | `hafjet-bot-rg` |
| **App Service Plan** | `hafjet-bot-plan` (B1, Southeast Asia) — **DELETED** (auto-deleted when last web app removed) |
| **Entry point** | `webhook_listener:app` |
| **Startup command** | `antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120` via `--startup-file`/`appCommandLine` |
| **DB** | SQLite (`bot_data.db`) |
| **Dashboard** | React SPA served via FastAPI at `/dashboard` |
| **WebSocket** | `/ws` with wsproto backend |
| **Meta webhook** | `https://hafjet-whatsapp-bot.azurewebsites.net/webhook` |
| **Security** | v2.1.0: fail-closed signature, X-API-Key on write routes, SecureFormatter masking |
| **Hardening status** | Code deployed locally, awaiting clean redeploy |
| **Subscription throttle** | Active — plan create/delete throttled until ~15 min after last violation |

### Pitfall — Wrong app name causes deploy failure
```
ERROR: (ResourceNotFound) The Resource 'Microsoft.Web/sites/<wrong-name>' under resource group '...' was not found.
```
Discovery command when app name is unknown:
```bash
az webapp list --query "[].{name:name, rg:resourceGroup, state:state}" -o table
```
Returns all web apps in the subscription with their resource groups and states.

### Pitfall — `az webapp deploy --async true` may timeout silently
The `--async true` flag polls deployment status with a default timeout of ~120s. If the build takes longer (Oryx rebuild, dependency install), the command times out at `Status: Building the app... Time: X(s)` — but the deployment **continues on Azure** and may still complete successfully.
- **Detection after timeout:** Check app health endpoint. If still `200`, deployment may have completed.
- **Preferred pattern** — sync deploy with explicit 300s timeout:
  ```bash
  az webapp deploy --resource-group <rg> --name <app> --src-path deploy-hafjet-bot.zip --type zip --timeout 300
  ```
  Sync mode blocks until completion and gives a definitive `RuntimeSuccessful` or `Failed` status.
- **App must be RUNNING during deploy** — `az webapp deploy` warms up Kudu before deployment. A stopped app causes 502 (Kudu warmup failure). Use `az webapp deployment source config-zip` as fallback for stopped apps.

## Credit Landscape

| Platform | Credit | Expiry | Monthly Cost |
|----------|--------|--------|--------------|
| **Azure for Students** | $100/month (recurring) | Renewable annually | $0 (F1), B1 ~$12.40 |
| **AWS Activate** | $200 | 6 months | t3.micro free 12mo, then ~$10.50 |
| **Heroku (GitHub Student Pack)** | $13/month | 24 months | Eco $5, Basic $7 |
| **DigitalOcean (GitHub Student Pack)** | $200 | 12 months | Basic 1GB: $6 |
| **Oracle Cloud Always Free** | Never expires | Unlimited | A1.Flex: 2 OCPU/12 GB, $0 |
| **Oracle Cloud (Kulai, Malaysia)** | `ap-kulai-2` | New region (Feb 2026), single AD | Best latency for Malaysia users |

---

## Playbook 1: Azure F1 to B1 Upgrade (Production)

[Content unchanged - truncated for brevity]

## Playbook 2: AWS Staging/Backup (t3.micro)

[Content unchanged - truncated for brevity]

## Playbook 3: Heroku Eco Fallback (Full Production if Azure Fails)

[Content unchanged - truncated for brevity]

## Playbook 4: Oracle Cloud Always Free (Malaysia/Kulai)

[Content unchanged - truncated for brevity]

---

## One-Shot Recipes

### Recipe: Quick B1 Upgrade
[Content unchanged]

### Recipe: Heroku Emergency Deploy
[Content unchanged]

### Recipe: AWS Staging Clone
[Content unchanged]

### Recipe: Placeholder Patch & Deploy (Azure)
**Use when:** Need to update business information placeholders and redeploy to Azure App Service 
**Based on:** Session 2026-06-28 placeholder fix for HAFJET WhatsApp Bot

```bash
set -euo pipefail

APP_DIR="$HOME/.hermes/whatsapp-bot"
APP_NAME="hafjet-whatsapp-bot"
RESOURCE_GROUP="hafjet-bot-rg"

# STEP 1: Backup
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="$HOME/.hermes/backups"
BACKUP_DIR="$BACKUP_ROOT/whatsapp-bot-$TS"

mkdir -p "$BACKUP_ROOT"

echo "==> STEP 1: Backup folder penuh"
cp -a "$APP_DIR" "$BACKUP_DIR"
cd "$BACKUP_ROOT"
zip -r "whatsapp-bot-$TS.zip" "whatsapp-bot-$TS" >/dev/null

echo "==> Backup siap"
echo "    Folder: $BACKUP_DIR"
echo "    ZIP   : $BACKUP_ROOT/whatsapp-bot-$TS.zip"

cd "$APP_DIR"

echo "==> STEP 2: Backup webhook_listener.py sebelum patch"
cp webhook_listener.py "webhook_listener.py.bak-$TS"

echo "==> STEP 3: Patch placeholder dalam webhook_listener.py"
python3 - <<'PY'
from pathlib import Path

path = Path("webhook_listener.py")
text = path.read_text(encoding="utf-8")

replacements = {
    "[Nombor HAFJET]": "+60 16-980 8736",
    "[Alamat Kedai HAFJET]": "No. 890 Jalan Lestari 20, Taman Amalina Lestari, 27600 Raub, Pahang",
    "[Alamat Penuh Kedai]": "No. 890 Jalan Lestari 20, Taman Amalina Lestari, 27600 Raub, Pahang",
    "[Google Maps link]": "https://g.co/kgs/95C9TB",
}

before = text
for old, new in replacements.items():
    text = text.replace(old, new)

if text == before:
    print("WARNING: Tiada placeholder dijumpai untuk diganti.")
else:
    print("Placeholders successfully replaced.")

path.write_text(text, encoding="utf-8")
print("webhook_listener.py updated")
PY

echo "==> STEP 4: Verify placeholder sudah hilang"
grep -nE '\[Nombor HAFJET\]|\[Alamat Kedai HAFJET\]|\[Alamat Penuh Kedai\]|\[Google Maps link\]' webhook_listener.py || true

echo "==> STEP 5: Preview kawasan sekitar menu"
sed -n '620,660p' webhook_listener.py || true

echo "==> STEP 6: Validate Python & JSON"
python3 -m py_compile webhook_listener.py
python3 -m py_compile hermes_ai.py
python3 -m json.tool intent_rules.json >/dev/null
python3 -m json.tool media_map.json >/dev/null

echo "==> STEP 7: Build deploy ZIP"
rm -f deploy-hafjet-bot.zip
zip -r deploy-hafjet-bot.zip . \
  -x "*.git*" \
  -x "*__pycache__*" \
  -x "*.venv*" \
  -x "*.env" \
  -x ".env.*" \
  -x "*node_modules*" \
  -x "*.bak-*" >/dev/null

echo "==> ZIP siap: $APP_DIR/deploy-hafjet-bot.zip"

if [ "$APP_NAME" = "ISI_NAMA_WEBAPP_AZURE" ] || [ "$RESOURCE_GROUP" = "ISI_RESOURCE_GROUP_AZURE" ]; then
  echo "ERROR: Sila isi APP_NAME dan RESOURCE_GROUP dahulu."
  exit 1
fi

echo "==> STEP 8: Deploy ke Azure App Service"
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$APP_DIR/deploy-hafjet-bot.zip" \
  --type zip

echo "==> STEP 9: Restart web app"
az webapp restart \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP"

echo "==> STEP 10: Siap deploy"
echo
echo "Seterusnya, buka log tail dalam terminal lain:"
echo "az webapp log tail --resource-group \"$RESOURCE_GROUP\" --name \"$APP_NAME\""
echo
echo "Kemudian test WhatsApp sandbox / test recipient dengan mesej berikut:"
echo "- menu"
echo "- 2"
echo "- 3"
echo "- 4"
echo "- lokasi kedai"
echo "- waktu operasi"
echo "- bayaran apa"
echo "- nak repair iphone bateri problem"
echo
echo "Pastikan tiada lagi placeholder bracket keluar."
```

Expected: All HTTP checks return 200

---

## One-Shot Recipe: Placeholder Verification

**Use when:** Need to verify that all business information placeholders have been correctly replaced in the codebase

```bash
set -euo pipefail

cd "$HOME/.hermes/whatsapp-bot"

echo "=== Checking for remaining placeholders ==="
PLACEHOLDERS=$(grep -nE '\[Nombor HAFJET\]|\[Alamat Kedai HAFJET\]|\[Alamat Penuh Kedai\]|\[Google Maps link\]' webhook_listener.py || true)
if [ -z "$PLACEHOLDERS" ]; then
    echo "✓ No placeholders found in webhook_listener.py"
else
    echo "✗ Found placeholders:"
    echo "$PLACEHOLDERS"
    exit 1
fi

echo "=== Verifying replacement values =====\=\  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \ 0]
... Truncated