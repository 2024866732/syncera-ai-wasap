# Vite Environment Variable Injection at Deploy Time

**Date:** 2026-06-27
**Context:** Azure ZIP deploy of React dashboard served by FastAPI

## Problem

Vite env vars (`import.meta.env.VITE_*`) are **baked at build time**, not runtime.
Azure ZIP deploy copies pre-built static files — no runtime env var injection.
Need to pass secrets (like `DASHBOARD_API_KEY` as `VITE_API_KEY`) into the JS bundle
without committing them to git.

## Solution

Modify `deploy.sh` (Python-based ZIP builder) to:
1. Read `VITE_API_KEY` from environment
2. Run `npm run build` with the var injected via `env` parameter
3. ZIP the rebuilt `dashboard/dist/`

### deploy.sh Pattern

```python
import subprocess
vite_api_key = os.environ.get("VITE_API_KEY", "")
if vite_api_key:
    env = os.environ.copy()
    env["VITE_API_KEY"] = vite_api_key
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=os.path.join(BASE, "dashboard"),
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"❌ Dashboard build failed:\n{result.stderr}")
        sys.exit(1)
```

### Deployment Command

```bash
export VITE_API_KEY="your-secret-key"
python3 deploy.sh
az webapp deploy --resource-group hafjet-bot-rg --name hafjet-whatsapp-bot --src-path deploy.zip --type zip
```

### Verification

```bash
# Confirm key is baked into JS bundle
grep -o "your-secret-key" dashboard/dist/assets/index-*.js
```

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Forgetting to export VITE_API_KEY before deploy.sh | Script uses existing dist/ (no key) — deploy succeeds but auth fails |
| Key visible in git | Never commit .env.production; only inject at deploy time |
| Frontend sends empty string header | `import.meta.env.VITE_API_KEY \|\| ''` — harmless on GET, fails on POST to protected routes |

## Why Not Runtime?

Served static files (FastAPI StaticFiles mount) cannot read server env vars from the browser.
The browser only gets the compiled JS bundle. Therefore:
- **Build-time injection** is the only option for Vite + static serving
- Deploy script must rebuild with env vars before zipping
- This is a one-way write: key is embedded in JS, visible to anyone who inspects the bundle

## Security Note

`DASHBOARD_API_KEY` embedded in JS is **visible to dashboard users** (not secret from them).
This is acceptable for a single-operator dashboard. For multi-user scenarios,
use session-based auth instead.
