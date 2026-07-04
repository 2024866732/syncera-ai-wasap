# Deploy Verification Audit — Sprint Close Protocol

> **Source:** Sprint v2.1.0 close (Jul 2026) — `/api/inbox` Depends bug + param name mismatch fix
> **Pattern:** Source audit → ZIP audit → deploy with approval → regression test → final report

## Protocol (5 Steps)

### Step 1: Source Code Audit

Before ANY deploy, verify the source code has the intended fixes:

| Check | How | Pass/Fail |
|-------|-----|-----------|
| Correct `Depends()` placement | `grep "dependencies=\[Depends"` on route decorators — must be 0 (all moved to function sig) | |
| Parameter names match frontend | Compare function param names against frontend query param names (e.g., `filter` vs `filter_type`) | |
| DB logic fixed | Check ORDER BY, WHERE filters, `_save_outbound` updates customers | |
| `bot_data.db` excluded | No `bot_data.db` in the ZIP build script's include list | |

### Step 2: ZIP Content Audit

Before deploying, inspect the ZIP to confirm it carries the fixed code:

```bash
python3 -c "
import zipfile, re
z = zipfile.ZipFile('/tmp/deploy-prod.zip')

# Check bot_data.db exclusion
has_db = any('bot_data.db' in f for f in z.namelist())
print(f'bot_data.db in ZIP: {\"❌ OVERWRITES PROD\" if has_db else \"✅ excluded\"}')

# Check webhook_listener.py parameter names
wl = z.read('webhook_listener.py').decode()
match = re.search(r'async def api_inbox\((\w+):', wl)
param = match.group(1) if match else 'NOT FOUND'
print(f'api_inbox param name: {param} (expected: \"filter\")')

# Check db_logger.py has ORDER BY
dl = z.read('db_logger.py').decode()
order = 'ORDER BY c.last_contact DESC' in dl
outbound = 'UPDATE customers SET last_contact' in dl
print(f'ORDER BY: {\"✅\" if order else \"❌\"}')
print(f'Outbound update: {\"✅\" if outbound else \"❌\"}')

# Check Depends fix
decorator_depends = wl.count('dependencies=[Depends(')
sig_depends = wl.count('Depends(get_current_staff)')
print(f'Depends in decorator: {decorator_depends} (expect 0)')
print(f'Depends in function sig: {sig_depends} (expect 6)')
"
```

### Step 3: Deploy with Approval

Show the exact deploy command and await explicit approval:

```
⚠️ Command Approval Required
az webapp deploy --resource-group <rg> --name <app> --src-path /tmp/deploy.zip --type zip
Reason: Deploy Sprint v2.1.0 fixes to production. App restarts ~30-60s.
```

Wait for `✅ APPROVED` before executing. Do NOT deploy on "looks good" or "ok" — only explicit approval.

```bash
az webapp deploy --resource-group <rg> --name <app> --src-path /tmp/deploy.zip --type zip
az webapp restart --resource-group <rg> --name <app>
```

### Step 4: Regression Test

After app restarts, run endpoint verification:

```bash
python3 - <<'PYEOF'
import urllib.request, json

# Health
r = urllib.request.urlopen("https://<app>.azurewebsites.net/health")
print(f"/health → {r.status}")

# Login
login = json.loads(urllib.request.urlopen(
    urllib.request.Request("https://<app>.azurewebsites.net/api/auth/login",
        data=json.dumps({"email":"hafizi@hafjet.com","password":"***"}).encode(),
        headers={"Content-Type":"application/json"})
).read())
token = login["access_token"]
print(f"/api/auth/me returns staff: {login['staff']['name'] is not None}")

# Inbox filters — verify different filters return different data
for filt in ['all', 'me', 'unassigned']:
    req = urllib.request.Request(f"https://<app>.azurewebsites.net/api/inbox?filter={filt}",
        headers={"Authorization": f"Bearer {token}"})
    data = json.loads(urllib.request.urlopen(req).read())
    convs = data["conversations"]
    counts = {}
    for c in convs:
        a = c.get('assigned_to','None') or 'None'
        counts[a] = counts.get(a, 0) + 1
    print(f"Inbox (filter={filt}): {len(convs)} convs → {counts}")

# Verify filter=unassigned actually filters (should exclude assigned conversations)
# This is a critical assertion
# Other endpoints
for ep in ["/dashboard", "/api/stats", "/api/customers"]:
    r = urllib.request.urlopen(f"https://<app>.azurewebsites.net{ep}")
    print(f"{ep} → {r.status}")
PYEOF
```

### Step 5: Final Report

| Endpoint / Feature | Before Fix | After Deploy |
|--------------------|-----------|-------------|
| `/api/inbox` | HTTP 500 / 0 conversations | ✅ Returns conversations |
| `/api/auth/me` | `{"staff": null}` | ✅ Returns staff data |
| `/api/staff` POST | HTTP 500 | ✅ Creates staff |
| `/api/staff/{id}/status` PATCH | HTTP 500 | ✅ Updates status |
| Inbox filters (all/me/unassigned) | All return same data | ✅ Distinct per filter |
| `ORDER BY last_contact DESC` | Random order | ✅ Newest first |
| `_save_outbound` updates customer | Only messages table updated | ✅ `last_contact` + `total_messages` updated |
| `bot_data.db` overwritten on deploy | Local DB replaced prod DB | ✅ Excluded from ZIP |

## Common Pitfalls

| Pitfall | Detection | Fix |
|---------|-----------|-----|
| **ZIP is stale** (built before source patch) | Parameter name mismatch between ZIP and source | Rebuild ZIP fresh: `cd project && python3 build_zip.py` |
| **Deploy doesn't replace .py files** | Oryx reports `Build successful. Time: 0(s)` | Set `ORYX_BUILD_TIMESTAMP=$(date +%s)` app setting to invalidate cache |
| **Depends() in decorator instead of sig** | `grep 'dependencies=\[Depends'` returns results | Move `Depends()` to function parameter default value |
| **Param name mismatch** | All filters return same default value | Rename function parameter to match query param name |
| **bot_data.db in ZIP** | `az webapp deploy` overwrites production SQLite | Add `if f == 'bot_data.db': continue` to build script |

## Reference: Affected Endpoints (Depends Fix Pattern)

| Endpoint | Before (broken) | After (fixed) |
|----------|----------------|---------------|
| `GET /api/auth/me` | `dependencies=[Depends(get_current_staff)]` + `current_staff: dict = None` | `@app.get(...)` on decorator, `current_staff: dict = Depends(get_current_staff)` in sig |
| `GET /api/staff` | Same pattern (worked by luck, didn't use current_staff) | Same fix |
| `POST /api/staff` | Same pattern (crashed on `current_staff["role"]`) | Same fix |
| `PATCH /api/staff/{id}/status` | Same pattern (crashed on `current_staff["id"]`) | Same fix |
| `GET /api/inbox` | Same pattern (crashed on `current_staff["id"]`) | Same fix |
| `PATCH /api/conversations/{phone}/assign` | Same pattern (worked by luck) | Same fix |

**One-liner fix for all 6:**
```python
# BEFORE:
@app.get("/path", dependencies=[Depends(get_current_staff)])
async def handler(current_staff: dict = None):

# AFTER:
@app.get("/path")
async def handler(current_staff: dict = Depends(get_current_staff)):
```
