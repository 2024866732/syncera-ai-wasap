# Runtime Settings Cache Pattern

Lightweight in-memory cache with TTL for bot settings stored in DB. Avoids DB query per request while allowing dashboard changes to apply instantly within ~60 seconds.

## Architecture

```
Dashboard Save → PUT /api/settings → DB write → _refresh_settings() → cache updated
Webhook Request → get_runtime("key", default) → cache hit (within TTL) or DB miss (stale)
                                             ↓
                                         return value
```

## Full Implementation

```python
import time, os, sqlite3

# ── Runtime Settings Cache ─────────────────────────────────────────
_settings_cache: dict = {}
_settings_cache_at: float = 0
_SETTINGS_TTL = 60  # seconds

def _refresh_settings():
    """Load settings from DB into cache."""
    global _settings_cache, _settings_cache_at
    try:
        conn = _get_db()
        rows = conn.execute("SELECT key, value FROM bot_settings").fetchall()
        conn.close()
        _settings_cache = {row["key"]: row["value"] for row in rows}
    except Exception:
        pass  # Keep old cache on DB error
    _settings_cache_at = time.time()

def get_runtime(key: str, default: str = "") -> str:
    """Get a runtime setting (cached, with DB fallback)."""
    if not _settings_cache or (time.time() - _settings_cache_at) > _SETTINGS_TTL:
        _refresh_settings()
    return _settings_cache.get(key, default)

def get_runtime_bool(key: str, default: bool = True) -> bool:
    val = get_runtime(key, str(default).lower())
    return val.lower() in ("true", "1", "yes")

def get_runtime_int(key: str, default: int = 0) -> int:
    try:
        return int(get_runtime(key, str(default)))
    except ValueError:
        return default

def get_runtime_float(key: str, default: float = 0.0) -> float:
    try:
        return float(get_runtime(key, str(default)))
    except ValueError:
        return default

# Initial load at module import
_refresh_settings()
```

## Settings API (with validation)

```python
VALID_SETTINGS = {
    "bot_active":       {"type": "bool", "default": "true"},
    "ai_enabled":       {"type": "bool", "default": "true"},
    "greeting_message": {"type": "text", "default": ""},
    "fallback_message": {"type": "text", "default": ""},
    "dedup_window":     {"type": "int", "default": "300", "min": 30, "max": 3600},
    "ai_model":         {"type": "text", "default": "openrouter/owl-alpha"},
    "ai_timeout":       {"type": "int", "default": "10", "min": 3, "max": 60},
    "ai_temperature":   {"type": "float", "default": "0.3", "min": 0, "max": 2},
    "ai_max_tokens":    {"type": "int", "default": "150", "min": 50, "max": 1000},
    "escalation_keywords": {"type": "text", "default": ""},
    "greeting_keywords":   {"type": "text", "default": ""},
}

@app.get("/api/settings")
async def api_get_settings():
    """Get all settings with defaults for missing keys."""
    conn = _get_db()
    rows = conn.execute("SELECT key, value FROM bot_settings").fetchall()
    conn.close()
    settings = {k: v["default"] for k, v in VALID_SETTINGS.items()}
    for row in rows:
        key = row["key"]
        if key in VALID_SETTINGS:
            settings[key] = row["value"]
    return settings

@app.put("/api/settings")
async def api_update_settings(data: dict, operator: str = "dashboard"):
    """Update with type validation."""
    conn = _get_db()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    updated, errors = [], []
    for key, value in data.items():
        if key.startswith("_") or key not in VALID_SETTINGS:
            errors.append(f"Unknown: {key}"); continue
        spec = VALID_SETTINGS[key]
        val = str(value).strip()
        if spec["type"] == "bool":
            if val.lower() not in ("true","false","1","0","yes","no"):
                errors.append(f"{key}: invalid bool"); continue
            val = "true" if val.lower() in ("true","1","yes") else "false"
        elif spec["type"] == "int":
            try:
                vi = int(val)
                if "min" in spec and vi < spec["min"]:
                    errors.append(f"{key}: min {spec['min']}"); continue
                if "max" in spec and vi > spec["max"]:
                    errors.append(f"{key}: max {spec['max']}"); continue
            except ValueError:
                errors.append(f"{key}: must be int"); continue
        elif spec["type"] == "float":
            try:
                vf = float(val)
                if "min" in spec and vf < spec["min"]:
                    errors.append(f"{key}: min {spec['min']}"); continue
                if "max" in spec and vf > spec["max"]:
                    errors.append(f"{key}: max {spec['max']}"); continue
            except ValueError:
                errors.append(f"{key}: must be number"); continue
        conn.execute(
            "INSERT OR REPLACE INTO bot_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)",
            (key, val, now, operator)
        )
        updated.append(key)
    conn.commit()
    conn.close()
    _refresh_settings()  # Invalidate cache immediately
    broadcast_ws("settings_updated", data)
    return {"status": "ok", "updated": updated, "errors": errors}
```

## Webhook Integration

```python
# In generate_reply():
msg_lower = message.lower().strip()

# Check AI enabled
if not get_runtime_bool("ai_enabled", True):
    return get_runtime("fallback_message", CANONICAL_FALLBACK)

# Check escalation keywords
esc_kw = get_runtime("escalation_keywords", "")
if esc_kw:
    keywords = [k.strip().lower() for k in esc_kw.split(",") if k.strip()]
    if any(kw in msg_lower for kw in keywords):
        return "🔀 *Sambungan ke Staff*\n\nPesan anda akan diteruskan..."

# Greeting uses runtime message
if _is_greeting(msg_lower):
    return get_runtime("greeting_message", CANONICAL_GREETING)

# Fallback uses runtime message
return get_runtime("fallback_message", CANONICAL_FALLBACK)
```

## Manual Operator Reply (Takeover)

```python
@app.post("/api/customers/{phone}/reply")
async def api_manual_reply(phone: str, data: dict, operator: str = "dashboard"):
    message = data.get("message", "")
    if not message:
        raise HTTPException(400, "Message required")
    # Send via WhatsApp API (reuse send_whatsapp_message)
    sent = await send_whatsapp_message(phone, message)
    # Log as outbound
    await log_outbound(phone, message, "staff")
    # Mark as handoff
    conn = _get_db()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("UPDATE customers SET status='handoff', handoff_at=? WHERE phone=?", (now, phone))
    conn.commit(); conn.close()
    broadcast_ws("staff_reply_sent", {"phone": phone, "message": message})
    return {"status": "ok", "action": "staff_reply", "sent": sent}
```

## Classification: What Can Be Instant vs Restart

| Setting | Instant? | Notes |
|---------|----------|-------|
| `ai_enabled` | ✅ | Checked per-request via `get_runtime_bool()` |
| `dedup_window` | ✅ | Checked per-request via `get_runtime_int()` |
| `greeting_message` | ✅ | `get_runtime()` returns saved or default |
| `fallback_message` | ✅ | Same |
| `escalation_keywords` | ✅ | Same |
| `greeting_keywords` | ✅ | Checked in `_is_greeting()` |
| `ai_model` | ✅ | Passed to AI call |
| `ai_timeout` | ✅ | Passed to httpx timeout |
| `ai_temperature` | ✅ | Passed to AI call |
| `ai_max_tokens` | ✅ | Passed to AI call |
| `bot_active` | ⚠️ Restart only | Module-level constant; requires gunicorn reload |
| `openrouter_key` | ⚠️ Restart only | Security: mid-request reload risk |

**Key insight:** All settings except `bot_active` and `openrouter_key` can apply instantly at runtime. `bot_active` is a module-level constant checked at import time; `openrouter_key` is read once at module load for security (mid-request reload could cause partial auth state).

To make `bot_active` instant: wrap webhook handler to check `get_runtime_bool("bot_active", True)` and return early if False.

## Pitfalls

1. **`INSERT OR REPLACE`** in SQLite updates the whole row — make sure all columns you want to keep are in the INSERT.
2. **Cache invalidation** — always call `_refresh_settings()` after successful DB write in the settings PUT endpoint.
3. **`get_runtime()` is not async** — safe to call from async functions without await.
4. **SQLite `ALTER TABLE ADD COLUMN`** fails if column exists — wrap in try/except.
5. **Module-level `_refresh_settings()`** — runs at import time; DB must be accessible when module loads (or wrap in try/except).
