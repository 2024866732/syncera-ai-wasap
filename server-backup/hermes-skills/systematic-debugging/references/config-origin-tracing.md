# Config Origin Tracing — Multi-Layer Value Investigation

Trace a config value through all layers of a full-stack app to determine which value is actually used at runtime, especially when multiple sources exist (env vars, DB, hardcoded defaults, built JS, API server).

## When to Use

- Dashboard shows a different config value than the server env var
- Suspect a config value is coming from the wrong layer
- After changing an env var, the frontend still shows the old value
- New deploy seems to have ignored a config change
- Multiple operators may have changed the same setting via different interfaces

## The Five-Step Investigation

### Step 1: Grep ALL Reads of the Config Key

Search for ALL occurrences of the config key name across the entire codebase:

```bash
grep -rn "OPENROUTER_MODEL" . | grep -v __pycache__ | grep -v node_modules
grep -rn "nemotron" . | grep -v __pycache__ | grep -v node_modules
grep -rn "owl-alpha" . | grep -v __pycache__
```

Catalog each hit in a table:

| # | File | Line | Source Type | Default Value | 
|---|------|------|-------------|---------------|
| 1 | `hermes_ai.py:23` | `os.getenv("OPENROUTER_MODEL", "owl-alpha")` | Env var | owl-alpha |
| 2 | `hermes_ai.py:100` | `"model": OPENROUTER_MODEL` | Python constant | From line 1 |
| 3 | `dashboard/dist/index-*.js` | `fetch("/api/settings")` | Built JS | From API |

**Source types to check for:**
- **Env var** — `os.getenv()`, `os.environ[]`
- **Hardcoded string** — literal model name in code
- **DB / file config** — SQLite, JSON, settings.yaml
- **API endpoint** — that serves the value to frontend
- **Built JS bundle** — what the frontend actually ships
- **Dashboard state** — React store, local storage, URL params

### Step 2: Determine Runtime Value

**Server-side:** Check what the running process actually reads:

```bash
# Check env var on the server
az webapp config appsettings list -g <rg> -n <app> --query "[?name=='OPENROUTER_MODEL'].value" -o tsv

# Or for local dev
echo $OPENROUTER_MODEL
```

**Add debug logging** before the value is used in the actual API call:

```python
print(f"[MODEL_DEBUG] model={model} base_url={url} timeout={timeout}")
# ... make the API call ...
print(f"[MODEL_DEBUG] status_code={resp.status_code}")
print(f"[MODEL_DEBUG] reply={content[:200]}")
```

This proves the ACTUAL value at runtime, not the assumed value.

### Step 3: Trace Frontend Display Path

**The frontend never reads env vars directly** — it reads from an API. Trace the full chain:

1. **API endpoint** — What endpoint does the frontend call?
   ```javascript
   // Check built JS bundle
   curl -s https://<app>.azurewebsites.net/dashboard/assets/index-*.js | grep -oP 'api/settings.{0,50}'
   ```

2. **API implementation** — How does the endpoint build its response?
   ```python
   @app.get("/api/settings")
   async def get_settings():
       # Does it read from DB? Env var? Defaults?
       # What is the precedence?
   ```

3. **DB contents** — What's saved in the bot_settings table?
   ```sql
   SELECT key, value FROM bot_settings WHERE key = 'ai_model';
   ```

4. **Precedence chain** — Determine the order of priority:
   ```
   Env var > DB saved > Default hardcoded
   ```

5. **Verify via live browser** — Navigate to the dashboard and check the actual field:
   ```python
   browser_navigate("https://<app>.azurewebsites.net/dashboard")
   browser_click("@e6")  # Settings tab
   browser_snapshot()     # Read the model field
   ```

### Step 4: Propose Single Source of Truth

**Recommended pattern:** Env var as the single source of truth for critical config values.

**Precedence:** `Env var > DB > Hardcoded default`

**Implementation pattern:**
```python
_ENV_OVERRIDE_MAP = {
    "ai_model": "OPENROUTER_MODEL",
    "ai_enabled": "AI_ENABLED",
    "bot_active": "BOT_ACTIVE",
}

def get_runtime(key: str, default: str = "") -> str:
    """Get runtime value: env override > DB > default."""
    # 1. Check env override first
    env_key = _ENV_OVERRIDE_MAP.get(key)
    if env_key:
        env_val = os.getenv(env_key)
        if env_val:
            return env_val
    # 2. Check DB cache
    db_val = _settings_cache.get(key)
    if db_val:
        return db_val
    # 3. Return default
    return default
```

**Key rules:**
- The dashboard `GET /api/settings` must return the EFFECTIVE value, not just the DB value
- The dashboard Settings page must show what the bot ACTUALLY uses
- Never let a stale DB value override an env var

### Step 5: Verify Live

**Make a real API call** (or wait for a real user message) to confirm the runtime value:

```python
# Direct API test
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "nvidia/nemotron-3-super-120b-a12b:free", "messages": [{"role": "user", "content": "test"}]}'
```

**Check runtime logs** for MODEL_DEBUG output:
```bash
az webapp log tail -g <rg> -n <app> 2>&1 | grep MODEL_DEBUG
```

## Common Pitfalls

| Pitfall | Symptom | Root Cause | Fix |
|---------|---------|------------|-----|
| DB stale value | Dashboard shows old model | Dashboard reads DB, not env var | Apply env override in API endpoint |
| Built JS hardcodes | Settings always show old value | API key baked at build time | Rebuild Vite app with new env |
| Module-level constant | Bot ignores Azure env var change | `hermes_ai.OPENROUTER_MODEL` set at import time | Restart after env var change |
| Multiple env var sources | `az webapp config appsettings list` shows new value but bot uses old | Shell env var overrides .env overrides Azure | Check all three sources |
| Default in code | Dashboard shows owl-alpha but nemotron is set | `os.getenv("MODEL", "owl-alpha")` default is fallback, not active value | Verify env var is actually set |

## Quick Reference

```bash
# 1. Grep all reads
grep -rn "CONFIG_KEY" . | grep -v __pycache__

# 2. Check server env var
az webapp config appsettings list -g <rg> -n <app> --query "[?name=='CONFIG_KEY'].value"

# 3. Check DB saved value
sqlite3 bot_data.db "SELECT value FROM bot_settings WHERE key='config_key';"

# 4. Check built JS
curl -s https://<app>/dashboard/assets/index-*.js | grep -oP 'config_key.{0,100}'

# 5. Verify live dashboard
browser_navigate("https://<app>/dashboard")
browser_snapshot()

# 6. Check runtime logs
az webapp log tail -g <rg> -n <app> 2>&1 | grep MODEL_DEBUG
```