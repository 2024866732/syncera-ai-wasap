# Sprint Completion — Sign-Off Workflow

**Use after:** All features for a sprint are implemented and tested locally.
**Goal:** Produce a single definitive "Sprint X fully stable, ready for Sprint X+1" statement backed by evidence.

## Sequence

### 1. Source Code Audit

Verify every fix claimed is actually present in the current source files:

```bash
for check in \
  'ORDER BY c.last_contact DESC' \
  'Depends(get_current_staff)' \
  'WHERE c.assigned_to IS NULL'
do
  echo -n "$check: "
  grep -c "$check" webhook_listener.py db_logger.py 2>/dev/null || echo "0"
done
```

Cross-reference function parameter names with frontend query parameters:

```bash
# Backend expects parameter name 'filter' (matches frontend sending ?filter=)
grep "def api_inbox" webhook_listener.py
# Frontend sends ?filter=
grep "fetchInbox" dashboard/src/api/api.js
```

If names differ (e.g., backend has `filter_type`, frontend sends `filter`), the ZIP is stale — **do not sign off**.

### 2. ZIP Content Audit

Before deploying, inspect the ZIP that was built — never trust that `az webapp deploy` used the right files:

```bash
python3 -c "
import zipfile
z = zipfile.ZipFile('/tmp/hafjet-prod.zip')
wl = z.read('webhook_listener.py').decode()
dl = z.read('db_logger.py').decode()

assert 'Depends(get_current_staff)' in wl, 'Missing Depends fix'
assert 'dependencies=[Depends(' not in wl, 'Old decorator pattern found'
assert 'ORDER BY c.last_contact DESC' in dl, 'Missing ORDER BY'
assert 'UPDATE customers SET last_contact' in dl, 'Missing outbound update'
assert not any('bot_data.db' in f for f in z.namelist()), 'bot_data.db must be excluded'
print('ZIP audit PASSED')
"
```

### 3. Deploy (with approval)

```bash
# Always ask approval before these:
az webapp deploy --resource-group <rg> --name <app> --src-path /tmp/hafjet-prod.zip --type zip
az webapp restart --resource-group <rg> --name <app>
```

### 4. Regression Test

Run a structured test that covers **every endpoint** and **every filter variant**:

```python
ENDPOINTS = [
    ("GET /health",                             200, None),
    ("POST /api/auth/login",                    200, {"email":"admin@hafjet.com","password":"admin123"}),
    ("GET /api/auth/me",                        200, {"Authorization": "Bearer <token>"}),
    ("GET /api/inbox?filter=all",               200, auth_header),
    ("GET /api/inbox?filter=me",                200, auth_header),
    ("GET /api/inbox?filter=unassigned",        200, auth_header),
    ("GET /dashboard",                          200, None),
    ("GET /api/stats",                          200, None),
    ("GET /api/customers",                      200, None),
    ("GET /webhook",                            403, None),
]
```

**Critical assertions beyond HTTP status:**
- `GET /api/auth/me` — response MUST contain `staff.name` (not null)
- `GET /api/inbox?filter=all` — conversations returned with `ORDER BY last_contact DESC`
- `GET /api/inbox?filter=me` — ONLY conversations assigned to current staff
- `GET /api/inbox?filter=unassigned` — ONLY conversations with no assignment
- **All three filters must return different data** — verify counts differ or record sets differ
- `ORDER BY` — confirm timestamps are descending

### 5. Sign-Off Statement

If all tests pass, issue a single line:

```
✅ Sprint X.Y.Z fully stable, ready for X.Y.Z+1
```

If any test fails, report the specific failure line-by-line and **do not** sign off. The fix → retest loop must produce clean results before the statement is issued.

## Anti-Patterns

- **❌ Claiming all tests pass without running them.** Run the actual requests.
- **❌ Accepting 403 on `/webhook` as a failure.** 403 is correct (no verify_token) — don't treat it as a regression.
- **❌ Skipping filter differentiation.** If `filter=all`, `filter=me`, and `filter=unassigned` all return the same data, the parameter isn't being received by the backend.
- **❌ Ignoring ZIP staleness.** A ZIP built from old source will deploy successfully but not contain the fixes. Always audit ZIP content vs source before deploying.

## Relationship to Other References

- `deploy-verification-audit.md` — Heavyweight pre-deploy audit (source code, ZIP contents, parameter name matching). Use when deploying a sprint's changes.
- `pre-deploy-verification.md` — Pre-deploy diff + test + approval workflow. Use for individual fixes between sprints.
