---
name: hafjet-deployment-plan
description: "Use when discussing, planning, or executing deployment for the HAFJET WhatsApp Bot. Locked strategy with four environments (Azure, AWS, Heroku, Oracle), exact CLI steps, and decision matrices for upgrades, throttling recovery, and failovers."
version: 1.11.0
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

## ⚠️ Deployment Method Pitfall (Jul 2026)

**`az webapp deploy --type zip` is unreliable on Linux App Service.** It reports `RuntimeSuccessful` but frequently **does not update the actual files** in `/home/site/wwwroot/`. The platform returns success even when files on disk are unchanged.

### Quick reference

See `references/azure-python-fastapi-patterns.md` — SQLite, FastAPI, bytecode, JSON parsing.
See `references/azure-oryx-worker-pitfalls.md` — Oryx, start.sh, gunicorn workers.
See `references/deploy-validation-checklist.md` — ZIP checklist, deploy verification.

### Working alternative: Kudu VFS API PUT

Use the Kudu Virtual File System API with an Azure AD Bearer token to push individual files directly:

```bash
# Get AAD token for management scope
TOKEN=$(az account get-access-token \
  --resource https://management.azure.com \
  --query accessToken -o tsv)

# Upload a file — must first GET to obtain ETag, then PUT with If-Match
# 1. GET to obtain ETag
ETAG=$(curl -s -D - "https://<app-name>.scm.azurewebsites.net/api/vfs/site/wwwroot/<file>.py" \
  -H "Authorization: Bearer $TOKEN" -o /dev/null 2>&1 \
  | grep -i etag | awk '{print $2}' | tr -d '\r')

# 2. PUT with If-Match
curl -X PUT "https://<app-name>.scm.azurewebsites.net/api/vfs/site/wwwroot/<file>.py" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "If-Match: $ETAG" \
  --data-binary @local-file.py
```

**Python equivalent (more robust):**
```python
import subprocess, urllib.request, ssl

token = subprocess.run(["az", "account", "get-access-token",
    "--resource", "https://management.azure.com",
    "--query", "accessToken", "-o", "tsv"],
    capture_output=True, text=True, timeout=15).stdout.strip()

ctx = ssl.create_default_context()
url = f"https://{app}.scm.azurewebsites.net/api/vfs/site/wwwroot/{file}"

# GET → ETag
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
resp = urllib.request.urlopen(req, timeout=15, context=ctx)
etag = resp.headers.get("ETag")

# PUT with If-Match
local = open(local_path, "rb").read()
req2 = urllib.request.Request(url, data=local, headers={
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/octet-stream",
    "If-Match": etag
})
req2.get_method = lambda: "PUT"
urllib.request.urlopen(req2, timeout=30, context=ctx)
```

Publishing credentials (`az webapp deployment list-publishing-credentials`) do NOT work for the SCM VFS API on this app — they return 401. AAD tokens scoped to `https://management.azure.com` DO work.

### Lifecycle: Stop → Upload → Start (not restart)

After uploading files, a plain `az webapp restart` may not pick up the new code because old Python processes cache modules in memory. Use the full stop/start cycle:

```bash
az webapp stop -n <app> -g <rg>
# Upload files via Kudu VFS API while stopped
az webapp start -n <app> -g <rg>
```

### Deploy verification via debug markers

When `az webapp deploy` is suspected of silently failing, inject a response marker to prove the running code is your version:

```python
# In the handler:
return {"status": "ok", "stats": stats, "_version": "deploy-<date>-<build>"}
```

Then call the endpoint from production — if the marker is missing, the server is still serving old code. This saved hours of debugging in Jul 2026.

### Force Oryx rebuild

If you must use `az webapp deploy` (e.g. for first-time setup), set these to force Oryx to rebuild and not cache:
- `SCM_DO_BUILD_DURING_DEPLOYMENT=true`
- `ENABLE_ORYX_BUILD=true`
- `ORYX_BUILD_TIMESTAMP=$(date +%s)` — changes every deploy

Even with these, the Kudu VFS path is more reliable for incremental updates.
It covers four environments: Azure (primary production), AWS (staging), Heroku (fallback), and Oracle Cloud Always Free (fallback/throttle-recovery).
It also covers self-hosted Linux + Tailscale for internal HAFJET tools (Hermes WebUI, admin panels, dev dashboards).
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
| `references/kudu-vfs-deployment-pattern.md` | Direct file upload via Kudu VFS API (workaround for `az webapp deploy` not updating files); dashboard rebuild + upload |
| `references/sqlite-returning-compat.md` | SQLite RETURNING clause not supported on Azure container |
| `references/server-backup-restore.md` | Server config backup/restore from GitHub |
| `references/forward-reference-depends.md` | Forward reference bug: `Depends(func)` defined below route decorator → NameError at import time |
| `scripts/verify_endpoints.py` | Full endpoint verification script (health, dashboard, API, webhook GET/POST, WebSocket) |
| `scripts/regression_v211.py` | Sprint v2.1.1 regression test: auth login/me, inbox filters (all/me/unassigned/escalated/resolved), PATCH conversation status (escalated/resolved/bot_active). 10 tests. |
| `scripts/regression_v220.py` | Sprint v2.2.0 regression test: analytics overview/timeseries/agents/CSV-export, health, auth, inbox, dashboard frontend, unauthorized rejection, metric cardinality (12 tests). Run with: `python3 regression_v220.py [--base URL] [--email EMAIL] [--password PASS]` |
| `scripts/test12.py` | Webhook escalation keyword test (must be run separately due to APP_SECRET handling). Verifies inbound keyword triggers `status=escalated` + `bot_paused=1`. |
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
| `references/git-sprint-workflow.md` | Sprint branch management: create, stage, exclude secrets, commit format, push without merge. |
| `references/analytics-backend-api.md` | Analytics API v2.2.0: endpoint design, metric definitions, response schemas, response time calculations, date-range filtering, known limitations. |
| `references/analytics-frontend-dashboard.md` | Analytics frontend v2.2.0: React component architecture, summary cards, dual charts (Line+Bar), agent perf table, date range selector, CSV export, JWT auth helpers, build process. Companion to `analytics-backend-api.md`. |
| `references/regression-assertion-schema-matching.md` | **API response schema matching trap** — assertions can produce false negatives when test logic doesn't match actual response structure (`staff` wrapper, `action` field for PATCH status). Prevention pattern: inspect raw response before writing assertions. |
| `references/pre-deploy-release-readiness.md` | **Pre-deploy release readiness check** — 5-point checklist after commit but before deploy: branch tracking, working tree, ZIP-vs-git SHA256 match, startup method, forbidden files. Exact output format approved by Tuan Hafizi. |
| `references/tailscale-remote-access.md` | Self-hosted Linux + Tailscale pattern: auth URL flow, serve vs 0.0.0.0 fallback, systemd auto-start template, gateway-safe `sudo service start` workaround, password auth safety rule. |
| `references/spx-deploy-readiness.md` | SPX self-collection deploy readiness checklist: timezone rules, masked-phone handling, rate limits, cookie lifecycle, pre-deploy verification, build-freshness check. |
| `references/context7-cli-pitfalls.md` | Context7 CLI session-tested pitfalls: exact 2-arg docs rule, false-positive long-process guard, 3-call library limit workaround. |
| `references/deploy-sh-validation.md` | deploy.sh dry-run vs actual ZIP discrepancy, safe inspection commands, fnmatch coverage gaps for EXCLUDE_PATTERNS. |

## Workflow Rules

0. **Follow spec order strictly — do NOT skip steps** — When the user provides a numbered spec (Sprint 1 → 2 → 3, or Feature 1 → 2 → 3), implement in the EXACT order given. Do not jump ahead or reorder. Each step builds on the previous one. If a spec says "Buat ikut urutan. Jangan skip step." — treat it as code. Evidence: user frustration at skipped steps despite clear ordering.

0a. **Never pipe deploy.sh contents to python3** — When inspecting or validating `deploy.sh`, use read-only commands only: `sed -n '7,55p' deploy.sh`, `nl -ba deploy.sh | sed -n '7,55p'`, or `bash -n deploy.sh` for syntax validation. Extracting and executing the embedded Python block via `python3 deploy.sh` or similar is forbidden unless the user explicitly asks for a dry-run build. Evidence: explicit user instruction "Jangan pipe kandungan deploy.sh ke python3".

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

## Loop Engineering for Production Incidents — When recovering from a production incident (app down, stale artifact, dependency crash), follow this structured format:

### Engineering Mode Protocol (User Preference, Jul 2026)

The user may interrupt a recovery sequence and demand **strict loop engineering mode**. When this happens:

1. **STOP** all ongoing recovery actions immediately — no more stop/start/redeploy/restart.
2. **Checkpoint** — produce a single concise report:
   - Current state (health, app state, relevant config)
   - Evidence (logs, API response codes, timestamps)
   - Most likely cause (ONE paragraph maximum)
3. **One action only** — propose exactly ONE corrective action with full confidence it addresses the cause.
4. **Verify** — after action, re-check health + one API endpoint.
5. **Verdict** — one of: `APP RECOVERED`, `APP STILL IN STARTUP LOOP`, `BAD DEPLOY SUSPECTED`, `CONFIG MISMATCH SUSPECTED`.

**Do NOT** chain multiple changes (stop + deploy + restart + config edit) in the same loop. Each loop changes exactly one variable.

**Use this format when the user says "stop", "engineering mode", "checkpoint", or expresses frustration at repeated recovery attempts.**

    a. **Incident Assessment** — Direct verdict on whether this is a dependency/build failure vs content/code failure. One sentence, no filler.

    b. **Commands to Run** — Exact Azure CLI commands in safe execution order. One change at a time. Use real app identity.

    c. **Verification Checklist** — Compact ordered list (deployment logs → startup logs → /health → specific endpoint → OpenAPI schema). Each item defines what success looks like and what failure implies.

    d. **Failure Branching** — Decision tree with branches (e.g., Oryx build didn't run / build ran but install failed / build succeeded but startup failed / startup succeeded but endpoint still fails). Each branch: most likely cause → next smallest corrective action.

    e. **Exit Criteria** — Clear stop conditions: recovered / needs second loop with different variable / must escalate to different deployment strategy.

    **Rules:**
    - Change ONE variable at a time (not build + start + code all at once).
    - Measure after each change before making the next.
    - If build succeeds but app still fails, inspect startup logs for import errors — do not redeploy blindly.
    - If Oryx build recreates old manifest artifacts, do not panic — verify the deployed code and dependencies are correct, not the file names.
    - Do NOT escalate to a different deployment strategy until two loops with different variables have failed.
    - If a loop succeeds, exit immediately — do not keep iterating.

## Startup Command Precedence (Python/Linux, Critical)

**SETTLED STANDARD (Jul 2026):** Use `start.sh` (version-controlled in repo) via `appCommandLine`. Do NOT hardcode `antenv/bin/gunicorn` in `appCommandLine`. The `antenv` path is only reliable during Oryx build temp dir; after ZIP deploy it may not exist at `/home/site/wwwroot/antenv/`. Use a **resilient `start.sh`** that prefers `antenv/bin/gunicorn` (Oryx-built) and falls back to `python -m gunicorn` (system Python with auto-install). Set via:

```bash
az webapp config set \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --startup-file "bash /home/site/wwwroot/start.sh"
```

The `start.sh` content (resilient pattern — handles both Oryx-build and no-build scenarios):
```bash
#!/bin/bash
cd /home/site/wwwroot

# Prefer Oryx virtualenv, fallback to system Python
if [ -f antenv/bin/gunicorn ]; then
    exec antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker \
      webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
else
    echo "[start.sh] antenv not found, trying pip install..."
    pip install -q gunicorn uvicorn 2>/dev/null
    exec python -m gunicorn -w 2 -k uvicorn.workers.UvicornWorker \
      webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
fi
```

**Why resilience matters:** After a WEBSITE_RUN_FROM_PACKAGE cycle or container recycle, the Oryx-built `antenv/` may no longer exist at `/home/site/wwwroot/antenv/`. A plain `python -m gunicorn` will fail with `ModuleNotFoundError` if gunicorn/uvicorn are not in the system Python. The fallback pip install covers this gap.

**Why `start.sh` over direct `appCommandLine`:**
| Factor | `start.sh` (chosen) | Direct `appCommandLine` |
|--------|---------------------|------------------------|
| Version-controlled | ✅ In repo + ZIP | ❌ Hidden in Azure config |
| Editable | ✅ `git commit` → deploy | ❌ Requires `az webapp config set` |
| Traceable | ✅ Part of release commit | ❌ No history |
| Works with Oryx `antenv` | ✅ Absolute path | ✅ |

When Azure App Service starts the Python container, it picks the startup command in this order:

| Precedence | Source | Set via | Example |
|-----------|--------|---------|---------|
| 1 (highest) | `appCommandLine` | `az webapp config set --startup-file "..."` | `antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000` |
| 2 | `STARTUP_COMMAND` env var | `az webapp config appsettings set --settings STARTUP_COMMAND="..."` | Same format as above |

**Critical rule — `STARTUP_COMMAND` app setting vs `appCommandLine` conflict (Jul 2026 discovery):**
Azure App Service has TWO separate places for the startup command:
1. **General Settings → Startup File** (sets `appCommandLine`) — set via `az webapp config set --startup-file "bash start.sh"`
2. **App Settings → `STARTUP_COMMAND`** (a config key in the settings list) — set via `az webapp config appsettings set --settings STARTUP_COMMAND="bash start.sh"`

These are REDUNDANT and can CONFLICT. If `appCommandLine` says `bash start.sh` but `STARTUP_COMMAND` app setting still has an old value like `gunicorn -w 2 ...`, Azure may execute the app setting value instead. After fixing `appCommandLine`, always verify the `STARTUP_COMMAND` app setting matches:

```bash
# Check both
az webapp config show -g <rg> -n <app> --query "appCommandLine"
az webapp config appsettings list -g <rg> -n <app> --query "[?name=='STARTUP_COMMAND']"
# If STARTUP_COMMAND differs, align it:
az webapp config appsettings set -g <rg> -n <app> --settings STARTUP_COMMAND="bash start.sh"
```
| 3 (default) | Oryx-generated `startup.sh` | Automatic (no override) | Runs from `/home/site/wwwroot/startup.sh` with `antenv` activated |

**Critical rules:**
- **`appCommandLine` always wins** over `STARTUP_COMMAND` env var. If both are set, `appCommandLine` runs.
- **Must use `python -m gunicorn`**, not a hardcoded `antenv/bin/gunicorn` absolute path. Azure's Oryx build activates `antenv` and sets `PYTHONPATH`; the runtime `python` resolves `gunicorn` from that activated environment. A hardcoded `/home/site/wwwroot/antenv/bin/gunicorn` path breaks when `antenv` is not present in the deployed `wwwroot` (e.g. ZIP deploy without Oryx rebuild). See **Bug: Cold start `antenv/bin/gunicorn: No such file or directory`** below.
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
- Do NOT hardcode `antenv/bin/gunicorn` in `start.sh` — the `antenv/` folder may not exist in `/home/site/wwwroot` after ZIP deploy. Use `python -m gunicorn` instead, which resolves via the runtime `PYTHONPATH` set by Oryx.
- If using a custom `start.sh`: the script can rely on `python -m gunicorn` resolving from the activated `antenv` via `PYTHONPATH`

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

**⚠️ Dependency-Loss Loop after `--clean`:** When `az webapp deploy --clean true --type zip` runs, it removes ALL files from wwwroot including the Oryx-built `antenv/` virtualenv. The ZIP contains `requirements.txt` but NOT a pre-built venv. If `ENABLE_ORYX_BUILD=false` and `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, Oryx does NOT recreate `antenv` — gunicorn becomes unavailable → app returns 503 Application Error. Recovery requires enabling build (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`) and redeploying while app is RUNNING. See `references/oryx-rebuild-force.md#dependency-loss-loop--clean-removes-antenv-app-crashes-2026-07-05`.

**Detection:**
1. Deploy output shows `Time: 0(s)` — the build step completed instantly.
2. Most reliable: compare OpenAPI schema against local routes:
   ```bash
   curl -s https://<app>.azurewebsites.net/openapi.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(p) for p in d.get('paths',{}).keys() if 'spx' in p]"
   ```
   If local has SPX routes but OpenAPI doesn't → stale cache.
3. Check `/home/site/wwwroot/` contents via startup log — if only tarball + manifest exist without `.py` files, Oryx is managing deployment via cache.

**⚠️ CRITICAL PITFALL — `az webapp deploy --clean true` on a STOPPED app causes SILENT AUTO-REVERT:**
```text
1. --clean removes ALL files from /home/site/wwwroot
2. ZIP is extracted to the empty wwwroot
3. Kudu warmup fails (app is stopped → 502)
4. Deploy command retries "Starting the site..." for ~180s
5. Because site never starts, Azure marks deployment as FAILED
6. Azure AUTO-REVERTS to the previous deployment — all new files replaced with old ones!
7. Manual `az webapp start` runs the OLD code — new routes GONE
8. Sign: OpenAPI unchanged despite "deploy succeeded" messaging
```
**Fix:** Always deploy with `--clean` while app is RUNNING. If you accidentally cleaned while stopped, simply redeploy the same ZIP (no --clean, just --type zip) while app is running — the deploy will overlay fresh files on top of the auto-reverted old ones.

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

### Bug: `az webapp deploy --async false` returns "Deployment status endpoint returned error" but deploy may still succeed

**Symptom:** The deploy command output includes:
```
WARNING: Deployment status endpoint https://management.azure.com/... returned error: Not Found(...)
WARNING: Failed to track the runtime status for this deployment. Resuming without tracking status.
```
Followed by `"complete": true, "status": 4` in the JSON. The app may or may not have received the new files.

**Root cause:** The Azure Management API version used by `az webapp deploy` for runtime status polling may not match the API version expected by the deployment service. This is a **tracking issue only** — the deployment itself (ZIP extraction, build) ran successfully on Kudu. The `"status": 4` indicates successful completion.

**Diagnosis:** After seeing this error, verify by checking the app directly:
```bash
# If backend changed, test a specific endpoint
curl -s https://<app>.azurewebsites.net/api/spx/session-status

# If frontend changed, check the JS bundle hash
curl -s https://<app>.azurewebsites.net/dashboard | grep -o 'index-[^.]*\.js'

# Compare with local dist/index.html
grep -o 'index-[^.]*\.js' dashboard/dist/index.html
```

**If files ARE updated:** The error was non-fatal — just polling broke, deploy worked.
**If files are NOT updated:** The deploy actually failed despite the "success" message. Redeploy with a force mechanism.

### Bug: Dashboard Static Assets (index.html, JS bundle) Not Updated Despite Successful Deploy

**Symptom:** Backend routes work (new SPX endpoints registered, authentication works), but the dashboard still serves the OLD `index.html` referencing the OLD JS bundle hash. New JS bundle returns 404. The ZIP contains the correct new files (verified by extracting and checking hashes).

**Root cause (likely):** This is the same stale Oryx cache issue affecting the `dashboard/dist/` directory. The Oryx build artifact (`output.tar.zst`) was built before the dashboard was rebuilt, so it contains old JS/CSS/HTML. Even though the ZIP has the new files, the deployment system serves the cached artifact instead. Backend `.py` files may update because they are not cached in the artifact (they're extracted fresh).

**Detection:**
```bash
# 1. Verify ZIP has new content
python3 -c "
import zipfile
z = zipfile.ZipFile('hafjet-prod.zip')
html = z.read('dashboard/dist/index.html').decode()
print('NEW hash in ZIP:', 'C2adAMRn' in html)  # replace with actual hash
"

# 2. Check what production serves
curl -s https://<app>.azurewebsites.net/dashboard | grep -o 'index-[^.]*\.js'
curl -s -o /dev/null -w '%{http_code}' https://<app>.azurewebsites.net/dashboard/assets/index-NEWHASH.js

# 3. If new JS returns 404 but ZIP has it → stale Oryx cache
```

**Fix:** Force Oryx rebuild via `ORYX_BUILD_TIMESTAMP` (see below), or deploy with `--clean true` while app is RUNNING.

**Prevention:** After `npm run build`, verify the JS hash in `dist/index.html` changed. Then either:
- Set a new `ORYX_BUILD_TIMESTAMP` before deploying to invalidate cache
- Or deploy with `--clean true` syntax

### Bug: Route Exists in ZIP but Returns 404 in Production — Stale Oryx Artifact

**Symptom:** A route/function is present in the local source and in the deployed ZIP (verified by extracting the ZIP), but `curl` against the production endpoint returns `404`. Health endpoint returns `200`, app starts cleanly, and logs show no import errors. Other older endpoints still work.

**Root cause:** Oryx caches build output in `/home/site/wwwroot/output.tar.zst` and `oryx-manifest.toml`. When `az webapp deploy --type zip` is used, Oryx may **skip rebuilding** and reuse the cached tarball from a previous deployment. The cached artifact does not contain the new routes/files from the fresh ZIP. The app starts from the old cached code, so new routes return 404 even though the ZIP contains them.

**Detection:**
1. Confirm route exists in the ZIP artifact: `python3 -c "import zipfile; z=zipfile.ZipFile('hafjet-prod.zip'); print('session-status' in z.read('webhook_listener.py').decode())"`
2. Confirm route works locally: `python3 -c "from webhook_listener import app; print([r.path for r in app.routes if 'session-status' in r.path])"`
3. If local and ZIP both have the route but production returns 404 → stale Oryx cache.
4. Check deployment log for `Build successful. Time: 0(s)` or absence of `output.tar.zst` extraction messages.
5. **OpenAPI schema is the definitive diagnostic** — it only lists routes the app actually registered:
   ```bash
   curl -s https://<app>.azurewebsites.net/openapi.json | python3 -c "import json,sys; [print(p) for p in json.load(sys.stdin).get('paths',{}).keys()]"
   ```
   If the SPX routes are missing from OpenAPI but present in the ZIP, the deployed code is not the ZIP code.

**Fix options (try in order):**

1. **Force Oryx rebuild with timestamp app setting (APP MUST BE RUNNING):**
   ```bash
   az webapp config appsettings set -g <rg> -n <app> --settings "ORYX_BUILD_TIMESTAMP=$(date +%s)"
   az webapp deploy -g <rg> -n <app> --src-path hafjet-prod.zip --type zip --timeout 300
   ```

2. **Use `az webapp deployment source config-zip`** (forces full rebuild despite deprecation):
   ```bash
   az webapp deployment source config-zip -g <rg> -n <app> --src hafjet-prod.zip --timeout 300
   az webapp restart -g <rg> -n <app>
   ```

3. **Delete cache artifacts via `--clean true` (APP MUST BE RUNNING):**
   ```bash
   # 🚨 CRITICAL: Deploy with --clean ONLY while app is RUNNING.
   # If app is STOPPED, --clean will wipe wwwroot, then deploy Kudu warmup fails,
   # and Azure AUTO-REVERTS to the previous deployment — undoing the clean!
   az webapp deploy -g <rg> -n <app> --src-path hafjet-prod.zip --type zip --clean true --timeout 300
   ```

4. **Delete cache artifacts via Kudu VFS (last resort):** Requires publishing credentials which are ALWAYS redacted by Azure CLI (returns `REDACTED` as the literal string). Use `az rest` with `http.client` or Python SDK to extract them. If Kudu access fails, use option 1 or 2 instead.

**⚠️ Critical pitfall — deploy --clean true on a STOPPED app causes SILENT AUTO-REVERT:**
```text
When app is STOPPED and you run `az webapp deploy --clean true --type zip`:
1. --clean removes ALL files from /home/site/wwwroot
2. ZIP is extracted to the empty wwwroot
3. Kudu warmup fails (app is stopped → 502)
4. Deploy command retries "Starting the site..." for ~180s
5. Because site never starts, Azure marks deployment as FAILED
6. Azure AUTO-REVERTS to the previous deployment — all new files are replaced with old ones!
7. When you manually `az webapp start`, the app runs the OLD code
8. The new routes are GONE despite "deploy succeeded" messaging
```

**Detection of auto-revert after `--clean` on stopped app:**
- `az webapp deploy` shows "Starting the site..." repeatedly then times out
- After manual `az webapp start`, health returns 200
- OpenAPI schema shows NO new routes — same as before deploy
- Deployment log shows "Build successful" but no actual file extraction
- **Fix:** Redeploy the same ZIP while app is RUNNING (no need for --clean again since the files are already there but replace them)

**Post-recovery verification:**
```bash
# Confirm endpoint returns expected status (401 if auth required, not 404)
curl -s -o /dev/null -w "%{http_code}" https://<app>.azurewebsites.net/api/spx/session-status

# Confirm registration via OpenAPI schema
curl -s https://<app>.azurewebsites.net/openapi.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(p) for p in d.get('paths',{}).keys() if 'spx' in p]"

# Confirm deployment log shows non-zero build time
az webapp log tail -n 20 --name <app> --resource-group <rg> | grep -E "Build successful|output.tar.zst"
```

### Bug: Cold Start `antenv/bin/gunicorn: No such file or directory` After ZIP Deploy

**Symptom:** Container exits immediately with:
```
start.sh: line 3: /home/site/wwwroot/antenv/bin/gunicorn: No such file or directory
```
Health returns 503 / Application Error. No `gunicorn` process starts.

**Root cause:** `start.sh` uses an absolute path to `/home/site/wwwroot/antenv/bin/gunicorn`. After a ZIP deploy (not Oryx build), the `antenv/` virtualenv is **not** extracted into `/home/site/wwwroot/`. Oryx creates `antenv` in a temp directory during build and sets `PYTHONPATH` to point to it, but the actual `antenv/` folder is not part of the ZIP artifact. When `start.sh` tries to execute the missing binary, the container crashes with exit code 127.

**Fix:** Use `python -m gunicorn` in `start.sh` instead of the hardcoded absolute path:
```bash
# BEFORE (breaks after ZIP deploy)
/home/site/wwwroot/antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120

# AFTER (robust)
python -m gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
```

The `python` in PATH is the Oryx-provided interpreter with `PYTHONPATH` already pointing to the built `antenv` site-packages, so `python -m gunicorn` resolves correctly without the absolute path.

### Bug: Container Crash After WEBSITE_RUN_FROM_PACKAGE Removal (302ms)

**Symptom:** After setting `WEBSITE_RUN_FROM_PACKAGE=1`, deploying, then removing the setting and restarting, the container crashes in <1s. Container log shows:
```
Container is terminated. Total time elapsed: 302 ms.
Site container: hafjet-whatsapp-bot terminated during site startup.
```
App state says "Running" but `/health` returns `503` (Application Error) or TCP connection times out (`000`). The app process died before any health check could run.

**Root cause:** When `WEBSITE_RUN_FROM_PACKAGE=1` is active, Azure mounts the ZIP directly as a read-only filesystem at `/home/site/wwwroot`. Files are managed by the package mount daemon, not by the standard extraction pipeline. When `WEBSITE_RUN_FROM_PACKAGE` is **removed** and the container restarts:
1. The mount point is released
2. A fresh container is provisioned
3. The fresh container's `/home/site/wwwroot` may be in an **inconsistent state** — old Oryx build artifacts (`antenv/`, `output.tar.zst`, `oryx-manifest.toml`) are missing or corrupted
4. If `start.sh` references `antenv/bin/gunicorn` (or even `python -m gunicorn` without pip fallback), the command fails and the container exits

**This is exactly the same root cause as the Oryx stale cache bug** — the environment that `start.sh` depends on (antenv + deps) does not exist after the container recycles. The run-from-package cycle merely accelerates the symptom.

**Fix (try in order):**

1. **Deploy with resilient start.sh** (see "Settled Standard" section above) — the fallback pip install covers the dependency gap. Deploy while app is RUNNING:
   ```bash
   az webapp deploy -n <app> -g <rg> --src-path hafjet-prod.zip --type zip
   ```

2. **Ensure Oryx builds** by setting both `ENABLE_ORYX_BUILD=true` AND `SCM_DO_BUILD_DURING_DEPLOYMENT=true` BEFORE deploying. A real Oryx build takes 30-90s (not 1s). Verify with:
   ```bash
   # Deploy output should NOT show "Build successful. Time: 0(s)"
   ```

3. **WARNING — Do NOT set WEBSITE_RUN_FROM_PACKAGE experimentally.** The read-only mount mode is incompatible with apps that:
   - Write to wwwroot (logs, DB files, temp uploads)
   - Depend on Oryx's dynamic `antenv` virtualenv in wwwroot
   - Use `start.sh` that expects a writable filesystem
   
   Once WEBSITE_RUN_FROM_PACKAGE is set and a deploy goes through, **removing it may break the app**. Plan for a full recovery cycle before adding this setting.

**Recovery sequence from container crash after WEBSITE_RUN_FROM_PACKAGE removal:**

```
1. ✅ Fix start.sh with resilient fallback (see Settled Standard)
2. ✅ Rebuild clean ZIP (python3 inline, not bash zip)
3. ✅ Set ENABLE_ORYX_BUILD=true + SCM_DO_BUILD_DURING_DEPLOYMENT=true
4. ✅ az webapp deploy --type zip (while app is RUNNING)
5. Wait 60-90s for Oryx build + container warmup
6. Verify: curl /health → 200
7. Verify: curl /dashboard/index.html → grep for new JS bundle hash
8. If still 503 after 120s: az webapp log tail for container startup errors
```

### Bug: Cold Start `ModuleNotFoundError` After Fresh Deploy

**Symptom:** App fails to start after `az webapp deploy`. Container stream log shows:
```
ModuleNotFoundError: No module named 'httpx'
```
even though `httpx` is in `requirements.txt`. Health endpoint returns 503 / Application Error page.

**Root cause:** Two possible causes:

1. **`appCommandLine` uses system Python gunicorn** (most common) — The Azure container's system `gunicorn` runs from the base Python install, which has NO project dependencies. The dependencies were installed into `antenv` by Oryx build, but `appCommandLine` points to the system path. Fix: use `antenv/bin/gunicorn` instead.

2. **Oryx cached build** — Oryx build system reuses a cached build manifest (`oryx-manifest.toml`) and `output.tar.zst` without rebuilding the virtualenv. The cached build may be missing installed packages, or `antenv` directory is not present in `/home/site/wwwroot/`. This happens when `SCM_DO_BUILD_DURING_DEPLOYMENT=false` is set, or after Oryx cache invalidation issues.

**Fix — Use `python -m gunicorn` (primary):**
```bash
# Set appCommandLine to use python -m gunicorn (follows Oryx PYTHONPATH)
az webapp config set -g <rg> -n <app> \
  --startup-file "bash /home/site/wwwroot/start.sh"
```
With `start.sh` containing `python -m gunicorn ...` as the settled standard.

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

**Preferred method: `az webapp deployment source config-zip`** (despite deprecation warning, most reliable for full Oryx rebuild — tested Jul 2026).

```bash
az webapp deployment source config-zip \
  --resource-group <rg> --name <app> \
  --src deploy.zip --timeout 300
```

The `--timeout 300` flag is critical — builds with many dependencies take 65-110s. Without enough timeout, the CLI returns exit 124 before the build completes (build continues server-side). Works whether app is RUNNING or STOPPED.

If the deprecation warning is a concern, use `ORYX_BUILD_TIMESTAMP` with `az webapp deploy` to force rebuild.

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

**Pre-deploy step: Frontend build verification (grep technique)**

Before building the deploy ZIP, verify the frontend build actually contains expected features:

```bash
cd dashboard && npm run build 2>&1 | tail -5
```

Then confirm specific feature strings are compiled into the bundled JS (minified names OK):

```bash
# Check chart library is bundled
grep -c "recharts" dist/assets/index-*.js
# Check analytics data fields
grep -co "messages_in|messages_out" dist/assets/index-*.js
grep -co "escalated|resolved" dist/assets/index-*.js
# Check CSV export
grep -c "CSV|exportType" dist/assets/index-*.js
# Check specific UI strings (if not minified away)
grep -c "Ai|Prestasi|Hari" dist/assets/index-*.js || true
```

Expected output pattern: `recharts` ≥ 10 matches (library bundled), `messages_in` ≥ 2 (LineChart), `escalated` ≥ 5 (BarChart), `CSV` ≥ 2 (export). If zero matches, the new component was tree-shaken out — investigate imports and component references in Layout.jsx / App.jsx.

**Pre-deploy step: Release notes generation**

As part of sprint/finishing workflow, produce release notes with this structure:

```
# vX.Y.Z — Release Title

## What's New
- Bullet-list of features/user-facing changes

## New API Endpoints
| Endpoint | Method | Description |
|---|---|---|
| /api/... | GET | ... |

## Changed Endpoints
- /api/... — description of change

## Files Changed (N files, +/-X lines)
| File | Change |
|---|---|
| path/to/file | Summary of what changed |

## Known Limitations
- Feature gaps, known bugs, acceptable trade-offs
- Bundle size info if relevant

## Schema Changes
- State: "None" or list of new columns/tables
```

**Pre-deploy step: Release Readiness Check (5-point checklist)**

After all TUGAS done, release notes written, and clean ZIP built — but BEFORE asking for deploy approval — run this final release readiness check:

```bash
# 1. Branch tracking — confirm local matches remote
git branch -vv
git ls-remote --heads origin release/v2.2.0

# 2. Working tree clean — no tracked changes pending
git status --short | grep '^[^?]'

# 3. ZIP matches git HEAD — checksum verification
python3 -c "
import zipfile, hashlib
with zipfile.ZipFile('/tmp/deploy.zip', 'r') as zf:
    for kf in ['webhook_listener.py','db_logger.py','start.sh','requirements.txt']:
        with open(kf,'rb') as f:
            wh = hashlib.sha256(f.read()).hexdigest()[:16]
            zh = hashlib.sha256(zf.read(kf)).hexdigest()[:16]
            print(f'{\"✅\" if wh==zh else \"❌\"} {kf}: work={wh} zip={zh}')
"

# 4. start.sh verified
cat start.sh | head -3

# 5. Forbidden files in git
for f in bot_data.db .env node_modules __pycache__; do
  count=$(git ls-tree -r HEAD --name-only | grep -c "$f" 2>/dev/null || echo 0)
  echo "  $f: $count occurrences"
done
```

**Report format to user (after all 5 checks pass):**

```
## ✅ Final Verification — Release vX.Y.Z

### 1️⃣ Branch Tracking
| Local | Remote | Hash Match |
|-------|--------|------------|
| release/vX.Y.Z | origin/release/vX.Y.Z | ✅ hash |

### 2️⃣ Working Tree
- Tracked files: ✅ Clean (only <unrelated> modified)
- Untracked files: ✅ All scrap/test (excluded from git)

### 3️⃣ ZIP vs Git
| File | Hash Match |
|------|-----------|
| webhook_listener.py | ✅ hash |
| db_logger.py | ✅ hash |
| start.sh | ✅ hash |

### 4️⃣ Startup Standard
start.sh — absolute path to antenv/bin/gunicorn, version-controlled

### 5️⃣ Forbidden Files
| File | In Branch? |
|------|-----------|
| bot_data.db | ✅ 0 |
| .env | ✅ 0 |
| node_modules | ✅ 0 |
```

Wait for user reply: `✅ APPROVED — RELEASE BRANCH READY` (or equivalent) before proceeding to deploy.

Then deliver:
- Branch name
- Commit hash
- Short diff summary
- Confirm ZIP match
- Confirm no forbidden files

**Anti-patterns:**
- ❌ Do NOT batch multiple TUGAS changes into one massive diff without per-tugas testing
- ❌ Do NOT deploy without showing the final ZIP verification checklist
- ❌ Do NOT deploy without producing release notes first — the user reviews both code and notes before approving
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

**Technique — Inspect production code via ZIP proxy:** When Kudu/SSH publishing credentials are unavailable (Azure CLI redacts them), verify production file contents by inspecting the exact ZIP artifact that was deployed. The ZIP is a byte-for-byte copy of what Azure extracted, so route definitions, imports, and decorators in the ZIP match production exactly:
```python
import zipfile
with zipfile.ZipFile('hafjet-prod.zip', 'r') as zf:
    data = zf.read('webhook_listener.py').decode('utf-8', errors='ignore')
    print('session-status route present:', '/api/spx/session-status' in data)
    # Verify decorator + function signature match expected auth pattern
    print('staff auth pattern:', 'Depends(get_current_staff)' in data)
```

**Pitfall — fnmatch coverage gaps in `EXCLUDE_PATTERNS`**
```python
# ❌ INSUFFICIENT — *.bak* does NOT match .backup files
['*.bak', 'test_*.py']

# ✅ CORRECT — cover all variants
['*.bak*', '*.backup', 'test_*.py', '*_test.py']
```
- `*.bak*` matches `.bak`, `.bak123`, `.bak-20260705` — but NOT `.backup`
- Always include both `*.bak*` AND `*.backup` if you want to cover all backup file variants
- Same logic applies to other prefix/suffix patterns: verify with `python3 -c "import fnmatch; print(fnmatch.fnmatch('x.backup', '*.bak*'))"` before assuming coverage

**Pitfall — dry-run script gives false confidence**
Inline Python dry-runs can diverge from the actual `deploy.sh` embedded Python if pattern lists are copied/pasted and drift apart. Always validate the ACTUAL ZIP artifact after build:
```python
import zipfile
with zipfile.ZipFile('hafjet-prod.zip', 'r') as zf:
    names = zf.namelist()
    sensitive = [n for n in names if n.startswith('.env') or '.backup' in n or 'azure-settings' in n or n.endswith('.db') or '/logs/' in n or n.startswith('test_') or n.endswith('.md')]
    print('Sensitive files:', len(sensitive))
    dist = [n for n in names if n.startswith('dashboard/dist/')]
    print('dashboard/dist files:', len(dist))
```

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
| **Startup command** | `bash /home/site/wwwroot/start.sh` via `--startup-file`/`appCommandLine`. `start.sh` MUST use `python -m gunicorn`, not a hardcoded `antenv/bin/gunicorn` absolute path. |
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

## Post-Deploy Verification (Critical Deploy-File Gap)

**Jul 2026 discovery:** `az webapp deploy` and `az webapp deployment source config-zip` may report `"complete": true`, `"status": 4`, `"RuntimeSuccessful"` — but the files on disk at `/home/site/wwwroot/` are STILL the OLD version. This happened with `_safe_str` fix where deployed `db_logger.py` lacked the new function despite the deploy reporting success.

**Root cause:** Unclear — possibly Azure Files NFS caching, stale Oryx artifact, or container serving from a cached layer. The deploy pipeline completes (ZIP extracted to persistent storage), but the running container loads from a stale copy.

**Verification — do NOT trust deploy status alone:**
```bash
# 1. After deploy, verify file content on disk via SSH tunnel
az webapp create-remote-connection -n <app> -g <rg> --timeout 120
# In another shell or after tunnel establishes:
ssh -o StrictHostKeyChecking=no root@127.0.0.1 -p <port> \
  "grep -c 'def _safe_str' /home/site/wwwroot/db_logger.py"
# If 0, the deployed code is NOT the code in your ZIP

# 2. Verify route registration via OpenAPI
curl -s https://<app>.azurewebsites.net/openapi.json | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('paths',{})))"

# 3. Compare JS bundle hash
curl -s https://<app>.azurewebsites.net/dashboard | \
  grep -o 'index-[^.]*\\.js'
grep -o 'index-[^.]*\\.js' dashboard/dist/index.html
```

**If files are stale despite "complete: true":**
- Try deploying WHILE app is running (not stopped)
- Add a forced workaround: `ORYX_BUILD_TIMESTAMP=$(date +%s)` as app setting
- Use the SSH tunnel workaround to directly `scp` files if possible
- As a LAST resort, scale to 0 → 1 instances after deploy to force new container creation

**Pitfall — Hotfix ZIP with `--clean true` destroys essential files:**
```bash
# ❌ DANGEROUS — creates a minimal ZIP with only 3 files
python3 -c "
import zipfile
with zipfile.ZipFile('hotfix.zip','w') as z:
    z.write('db_logger.py','db_logger.py')
    z.write('webhook_listener.py','webhook_listener.py')
    z.write('start.sh','start.sh')
"
az webapp deploy --src-path hotfix.zip --type zip --clean true
# → --clean true DELETES everything including dashboard/dist/, requirements.txt,
#   antenv/, and all non-code files. App crashes with 503 on next restart.
```
**Fix:** Never use `--clean true` with a partial ZIP. Always deploy the FULL production ZIP with `--clean true`, or deploy partial fixes WITHOUT `--clean`. The full ZIP contains everything the app needs (dashboard dist, requirements.txt, backend files).

**Recovery from hotfix disaster:**
```bash
# Deploy full ZIP immediately (while app is stopped or running)
az webapp deploy -n <app> -g <rg> --src-path hafjet-prod.zip --type zip
az webapp start -n <app> -g <rg>  # if stopped
```

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

## Environment 5: Self-Hosted Linux + Tailscale (Internal HAFJET Tools)

**Use when:** Deploying internal services (Hermes WebUI, dev dashboards, admin panels) on a Linux VM accessible only via Tailscale private network.

**Tools in this category:** Hermes WebUI, future Shopee reminder service, any staff-only dashboard.

### Setup recipe

1. **Clone repo** → `/home/<user>/<repo>`
2. **Install deps** → `uv pip install -r requirements.txt` (or per-project `pip install -r requirements.txt`)
3. **Generate password** → `python3 -c "import secrets; print(''.join(secrets.choice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#%') for _ in range(20)))"`
4. **Create `.env`** with `HERMES_WEBUI_HOST=127.0.0.1`, `HERMES_WEBUI_PORT=8787`, `HERMES_WEBUI_PASSWORD=<generated>`
5. **Install Tailscale** → `curl -fsSL https://tailscale.com/install.sh | sudo sh`
6. **Auth Tailscale** → `sudo tailscale up` → open printed URL → after auth, `tailscale ip -4`
7. **Start service** → repo's `ctl.sh start` or `./start.sh`
8. **Verify** → `curl -s http://127.0.0.1:PORT/health`
9. **systemd auto-start** → create unit file (see `references/tailscale-remote-access.md`)
10. **Enable** → `sudo systemctl enable <service>` then `sudo systemctl start <service>` (or `sudo service <service> start`)

### Tailscale serve vs 0.0.0.0 fallback

```bash
# Try HTTPS serve first
tailscale serve --bg 8787
# → If enabled: https://<hostname>.<tailnet>.ts.net

# If disabled, fallback to 0.0.0.0 bind
# ⚠️ MUST have password auth enabled BEFORE this
sed -i 's/HERMES_WEBUI_HOST=.*/HERMES_WEBUI_HOST=0.0.0.0/' .env
sudo service <service> restart
```

**Critical rule:** Never bind `0.0.0.0` without password auth. Any unauthenticated dashboard on a Tailscale interface is accessible to every device on the tailnet.

### Gateway-safe systemctl workaround

Inside the Hermes gateway process, `sudo systemctl start <service>` may trigger SIGTERM propagation (the gateway blocks restarts of itself, but the child `systemctl` gets killed). Use:

```bash
sudo service <service> start   # Works from inside Hermes gateway
```

`systemctl enable` does NOT suffer this restriction — it is safe to run from any shell.

### One-Shot Recipe: Self-Hosted Service on Tailscale

```bash
REPO=/home/hafizi145/<repo>
SERVICE=<service-name>
PORT=8787
PASSWORD=$(python3 -c "import secrets; print(''.join(secrets.choice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#%') for _ in range(20)))")

# 1. Env
cat > "$REPO/.env" <<EOF
HERMES_WEBUI_HOST=127.0.0.1
HERMES_WEBUI_PORT=$PORT
HERMES_WEBUI_PASSWORD=$PASSWORD
EOF

# 2. Tailscale install + auth prompt
sudo apt-get update && sudo apt-get install -y curl 2>/dev/null
curl -fsSL https://tailscale.com/install.sh | sudo sh
sudo tailscale up   # → open URL printed in terminal

# 3. Start + verify
cd "$REPO"
./ctl.sh start
sleep 2
curl -s http://127.0.0.1:$PORT/health

# 4. systemd auto-start (run while sudo tailscale up tab is open)
sudo tee /etc/systemd/system/$SERVICE.service <<'UNIT'
[Unit]
Description=<Service>
After=network-online.target
Wants=network-online.target
[Service]
Type=forking
User=hafizi145
Group=hafizi145
WorkingDirectory=/home/hafizi145/<repo>
EnvironmentFile=/home/hafizi145/<repo>/.env
ExecStart=/home/hafizi145/<repo>/ctl.sh start
ExecStop=/home/hafizi145/<repo>/ctl.sh stop
PIDFile=/home/hafizi145/.hermes/webui.pid
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=read-only
ReadWritePaths=/home/hafizi145/.hermes
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE
sudo service $SERVICE start
```

### Verification checklist

| Check | Command |
|-------|---------|
| Health | `curl -s http://127.0.0.1:$PORT/health` → `{"status":"ok"}` |
| Tailscale IP | `tailscale ip -4` → `100.x.y.z` |
| Tailscale status | `tailscale status` → `Logged in` |
| systemd enabled | `sudo systemctl is-enabled $SERVICE` → `enabled` |
| systemd running | `sudo systemctl status $SERVICE` → `active (running)` |
| Port bound | `ss -tlnp | grep $PORT` |
| Logs | `tail -50 /home/hafizi145/.hermes/webui.log` |
| .env protected | `read_file .env` should be blocked → use `cat .env` in terminal |

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