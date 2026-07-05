# OpenAPI Schema — FastAPI Route Registration Verification

## Why This Matters

When a route returns 404 after deployment, the first question is: **is the route even registered?** The OpenAPI schema (`/openapi.json`) only lists routes that the app actually loaded at startup. If the route exists in source code but is missing from OpenAPI, the problem is at the import/registration layer — not the request/response layer.

## Diagnostic Command

```bash
curl -s https://<host>/openapi.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
paths = list(d.get('paths', {}).keys())
print(f'Total registered routes: {len(paths)}')
for p in sorted(paths):
    print(f'  {p}')
"
```

Or filter by prefix:

```bash
curl -s https://<host>/openapi.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
[print(p) for p in d.get('paths',{}).keys() if 'spx' in p] or print('NO MATCHES')
"
```

## What Results Mean

| OpenAPI Has Route | `curl` Returns | Conclusion |
|---|---|---|
| ✅ Yes | 200/401 | Route works. Debug auth/permissions. |
| ✅ Yes | 404 | Route defined but handler returns 404. Check logic or DB. |
| ❌ No | 404 | **Route NOT registered.** Debug import/cache layer. |
| ❌ No | 405 | Route might be registered as different method. |

## When Routes Are Missing from OpenAPI (Despite Being in Source)

| Root Cause | How to Detect | Fix |
|---|---|---|
| **Stale `__pycache__`** | `find . -name "__pycache__" -exec rm -rf {} +` then restart | Delete bytecache and restart |
| **Stale Oryx build artifact** | Deploy log shows `Build successful. Time: 0(s)` | Force Oryx rebuild (ORYX_BUILD_TIMESTAMP) |
| **Import error in route section** | App starts but later part of file not loaded | Check for `SyntaxError`, missing import, or raise between routes |
| **Kubernetes/Docker deploy cached image** | Old pod still running | Force rolling restart |
| **Stale `appCommandLine`** | Wrong startup command loads different file | Verify `appCommandLine` and `STARTUP_COMMAND` app setting match |

## FastAPI-Specific: Why Only Some Routes Register

FastAPI registers routes **sequentially** as the module is imported. If a runtime error occurs in the middle of `webhook_listener.py`:

```python
@app.get("/api/works")     # ✅ Registered
async def works(): ...

# ... 500 lines ...

SOME_BROKEN_LINE = 1 / 0   # ❌ Import stops here — nothing below registers

@app.get("/api/broken")    # ❌ NEVER REGISTERED
async def broken(): ...
```

The app may still **start** (gunicorn catches lifecycle hooks) but routes after the error point are gone. OpenAPI schema shows routes up to the error point — the last healthy route before the broken line is the boundary.

**Diagnosis:** Find the last route shown in OpenAPI, then inspect the source file immediately after that route's decorator. The error will be in the next few lines.

## Prevention in CI/CD

Add to your deployment pipeline:

```yaml
check_routes:
  script:
    - curl -s https://$APP_URL/openapi.json | python3 -c "
  import json, sys
  d = json.load(sys.stdin)
  expected = ['/api/spx/session-status', '/api/spx/sync', '/api/spx/orders']
  actual = list(d.get('paths', {}).keys())
  for route in expected:
      if route not in actual:
          print(f'❌ MISSING: {route}')
          sys.exit(1)
      print(f'✅ {route}')
"
```

## Related

- `python-cache-pitfalls.md` — Stale bytecode after deployment
- `config-origin-tracing.md` — Tracing config values through all layers
