# Dashboard Static Serving — Portability Analysis

**Date:** 2026-06-27
**Purpose:** Confirm React dashboard works across Azure, Heroku, and AWS without framework changes.

## Current Implementation (webhook_listener.py)

```python
# Line 74-86
DASHBOARD_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "dashboard", "dist"
)
if os.path.exists(DASHBOARD_PATH):
    app.mount(
        "/dashboard/assets",
        StaticFiles(directory=os.path.join(DASHBOARD_PATH, "assets")),
        name="dashboard-assets",
    )

# Line 867-882
@app.get("/dashboard/{full_path:path}")
async def serve_dashboard(full_path: str):
    index_file = os.path.join(DASHBOARD_PATH, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"error": "Dashboard not built"})

@app.get("/dashboard")
async def serve_dashboard_root():
    index_file = os.path.join(DASHBOARD_PATH, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"error": "Dashboard not built"})
```

## Portability Matrix

| Factor | Azure | Heroku | AWS EC2 | Verdict |
|--------|-------|--------|---------|---------|
| `StaticFiles` mount | ✅ | ✅ | ✅ | Native FastAPI |
| `FileResponse` | ✅ | ✅ | ✅ | Native FastAPI |
| `os.path.dirname(__file__)` | ✅ | ✅ | ✅ | Resolves to script dir |
| `dist/` in deployment | ✅ ZIP includes it | ⚠️ Must be in git | ✅ Manual copy | **Heroku needs git** |
| `whitenoise` needed | No | No | No | Not needed anywhere |

## Critical: Heroku Git Push Requirement

Heroku deploys from git. If `dashboard/dist/` is in `.gitignore`, it won't be pushed → dashboard returns error.

**Fix:** Ensure `.gitignore` does NOT contain:
- `dashboard/dist/`
- `dist/`
- `*/dist/*`

**Verify:**
```bash
git ls-files dashboard/dist/index.html
# Must return: dashboard/dist/index.html
```

## Path Resolution

On all platforms, `os.path.dirname(os.path.abspath(__file__))` resolves to the directory containing `webhook_listener.py`. As long as `dashboard/dist/` is sibling to it, the dashboard works.

| Platform | Working Dir | `__file__` resolves to |
|----------|-------------|------------------------|
| Azure | `/home/site/wwwroot/` | `/home/site/wwwroot/` |
| Heroku | `/app/` (repo root) | `/app/` |
| AWS EC2 | Wherever you put it | That directory |

## Conclusion

**Zero code changes needed** for dashboard portability. The only requirement is ensuring `dashboard/dist/` is included in the deployment artifact (ZIP for Azure, git for Heroku, manual copy for AWS).
