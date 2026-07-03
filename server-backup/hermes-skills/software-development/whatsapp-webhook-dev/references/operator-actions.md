# Operator Dashboard Actions — Backend Pattern

When building an operator dashboard for a WhatsApp bot, you need backend APIs for customer conversation management (resolve, escalate, notes) with status tracking.

## DB Migration Pattern — SQLite `ALTER TABLE` with Try/Except

SQLite doesn't support `ALTER TABLE ... IF NOT EXISTS`. For idempotent migrations:

```python
# init_db approach: CREATE TABLE first, then ALTER for new columns
conn.executescript("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100),
        ...
    );
""")

# Migration: add new columns safely (skip if already exists)
for col_def in [
    "escalated_at TIMESTAMP",
    "resolved_at TIMESTAMP",
    "handoff_at TIMESTAMP",
    "assigned_to VARCHAR(50)",
    "note TEXT",
]:
    try:
        conn.execute(f"ALTER TABLE customers ADD COLUMN {col_def}")
    except sqlite3.OperationalError:
        pass  # Column already exists
```

**Why:** Run on every startup — new columns added only if not present. Zero-downtime, no migration scripts.

## Async-Safe DB Operations — `run_in_executor`

**Critical:** All operator action endpoints call synchronous database functions. In FastAPI async handlers, sync DB calls BLOCK the event loop. If SQLite is busy (e.g., another webhook saving a message), the request hangs indefinitely → frontend spinner never stops.

### Fix Pattern

Wrap every sync DB call with `await loop.run_in_executor(None, sync_func, args)`:

```python
@app.post("/api/customers/{phone}/note")
async def api_note(phone: str, data: dict, operator: str = "dashboard"):
    try:
        note = data.get("note", "")
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, update_customer_note, phone, note, operator)
        if not result:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"status": "ok", "action": "note_updated", "customer": result}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"❌ api_note failed: {e}", exc_info=True)
        return {"status": "error", "success": False, "error": str(e)}
```

**Also apply to:** `api_resolve`, `api_escalate`, `api_handoff`.

### `broadcast_ws` Must Be OUTSIDE the Executor Thread

`broadcast_ws()` calls `asyncio.get_event_loop().create_task(...)`. Inside a thread executor, `get_event_loop()` returns a **different event loop** than the main async context. The broadcast silently fails.

```python
# WRONG — broadcast_ws inside the executor function:
def _do_handoff():
    conn.execute(...)
    conn.commit()
    broadcast_ws(...)  # ⚠️ asyncio.get_event_loop() in executor thread → silent failure
    conn.close()
    return get_customer_detail(phone)

detail = await loop.run_in_executor(None, _do_handoff)

# RIGHT — broadcast_ws in main async context:
def _do_handoff():
    conn.execute(...)
    conn.commit()
    conn.close()
    return get_customer_detail(phone)

detail = await loop.run_in_executor(None, _do_handoff)
broadcast_ws("customer_handoff", {...})  # ✅ main async context
```

### Error Response for Frontend

Always include try/except with fallback JSON response:

```python
except Exception as e:
    log.error(f"❌ api_resolve failed: {e}", exc_info=True)
    return {"status": "error", "success": False, "error": str(e)}
```

This ensures the frontend gets a valid JSON response and can show meaningful error toasts instead of hanging forever.

### Diagnosis: Spinner Never Stops

If a spinner keeps spinning after clicking an action button:

1. **Check Azure logs** for the endpoint — look for 200 (success), 500/503 (exception), or no log line (request never arrived)
2. **If no log line:** Request hung before reaching the endpoint — likely auth middleware (401) or CORS issue
3. **If 500 with `TypeError`:** Likely `await` on a sync function — check the signaure
4. **If 500 with no obvious error:** Sync DB call blocking the event loop — add `run_in_executor`
5. **If 200 with `{"success": false}`:** Exception was caught and returned as error JSON — check the `error` field

**Most common cause:** Sync `update_customer_note()`, `resolve_customer()`, or `escalate_customer()` called directly in an `async def` handler without `run_in_executor`.

## Status Values

| Status | Badge Color | Meaning |
|--------|------------|---------|
| `active` | Green | Normal, open conversation |
| `escalated` | Amber | Escalated to human staff |
| `handoff` | Blue | Staff manually took over, monitoring |
| `resolved` | Gray | Issue resolved, archived |

## Human Handoff Pattern

When staff wants to manually take over a conversation from the bot:

1. Operator clicks "Take Over" in dashboard
2. Dashboard shows a textarea for staff to type a message
3. On submit: marks customer as `status='handoff'` + sends WhatsApp message as staff
4. Customer replies inbound → webhook resets status to `active` (bot resumes)

```python
@app.post("/api/customers/{phone}/handoff")
async def api_handoff(phone: str, data: dict, operator: str = "dashboard"):
    try:
        status = data.get("status", "handoff")
        message = data.get("message", "")

        # Optionally send a WhatsApp message as staff
        if message:
            asyncio.create_task(send_whatsapp_message(phone, message))

        # Update status via executor — DB ops block event loop
        def _do_handoff():
            conn = _get_db()
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                "UPDATE customers SET status=?, handoff_at=? WHERE phone=?",
                (status, now, phone)
            )
            conn.commit()
            conn.close()
            return get_customer_detail(phone)

        loop = asyncio.get_event_loop()
        detail = await loop.run_in_executor(None, _do_handoff)
        # broadcast_ws must be in main async context, not inside executor
        broadcast_ws("customer_handoff", {"phone": phone, "status": "handoff"})

        if not detail:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"status": "ok", "action": "handoff", "customer": detail}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"❌ api_handoff failed: {e}", exc_info=True)
        return {"status": "error", "success": False, "error": str(e)}
```

### POST Endpoint Pattern — JSON Body for Optional Fields

When POST endpoints have optional fields (e.g., handoff with optional message), use `data: dict` pattern instead of individual query params:

```python
# ✅ Good — optional fields in JSON body
@app.post("/api/customers/{phone}/handoff")
async def api_handoff(phone: str, data: dict):
    message = data.get("message", "")  # Optional

# ❌ Avoid — optional field as query param causes 422 when missing
@app.post("/api/customers/{phone}/note")
async def api_note(phone: str, note: str):  # 422 if note not provided
    ...
```

For the `note` endpoint specifically, accept `{"note": "text"}` as JSON body rather than a query parameter — this avoids FastAPI's 422 error when the parameter is empty or whitespace-only. The frontend calls:
```js
fetch(`/api/customers/${phone}/note`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ note: 'text' }),
});
```

## Frontend flow:
```jsx
const handleHandoff = async () => {
  setActionLoading('handoff');
  try {
    const result = await handoffCustomer(phone, { message: handoffMessage });
    setCustomerStatus('handoff');
    showToast('👤 Staff takeover aktif — mesej dihantar');
    setShowHandoff(false);
    setHandoffMessage('');
    if (onCustomerUpdate) onCustomerUpdate(result.customer);
  } catch (e) {
    showToast('❌ Gagal handoff', 'error');
  } finally {
    setActionLoading(null);
  }
};
```

## Bot Settings API (Key-Value Store with Validation)

Use the existing `bot_settings` table for dashboard-editable config:

```sql
CREATE TABLE IF NOT EXISTS bot_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT (datetime('now')),
    updated_by VARCHAR(50)
);
```

### Validation Schema

Define valid settings with types, defaults, and bounds:

```python
VALID_SETTINGS = {
    "bot_active": {"type": "bool", "default": "true"},
    "ai_enabled": {"type": "bool", "default": "true"},
    "greeting_message": {"type": "text", "default": ""},
    "fallback_message": {"type": "text", "default": ""},
    "dedup_window": {"type": "int", "default": "300", "min": 30, "max": 3600},
    "ai_model": {"type": "text", "default": "openrouter/owl-alpha"},
    "ai_timeout": {"type": "int", "default": "10", "min": 3, "max": 60},
    "ai_temperature": {"type": "float", "default": "0.3", "min": 0, "max": 2},
    "ai_max_tokens": {"type": "int", "default": "150", "min": 50, "max": 1000},
    "escalation_keywords": {"type": "text", "default": ""},
    "greeting_keywords": {"type": "text", "default": ""},
}
```

### GET /api/settings — Returns Defaults + Saved Values

```python
@app.get("/api/settings")
async def api_get_settings():
    conn = _get_db()
    rows = conn.execute("SELECT key, value FROM bot_settings").fetchall()
    conn.close()
    # Start with defaults, override with saved
    settings = {k: v["default"] for k, v in VALID_SETTINGS.items()}
    for row in rows:
        if row["key"] in VALID_SETTINGS:
            settings[row["key"]] = row["value"]
    return settings
```

### PUT /api/settings — Validate + Save

```python
@app.put("/api/settings")
async def api_update_settings(data: dict, operator: str = "dashboard"):
    conn = _get_db()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    updated = []
    errors = []

    for key, value in data.items():
        if key.startswith("_"):
            continue
        if key not in VALID_SETTINGS:
            errors.append(f"Unknown: {key}")
            continue

        spec = VALID_SETTINGS[key]
        val_str = str(value).strip()

        if spec["type"] == "bool":
            if val_str.lower() not in ("true", "false", "1", "0", "yes", "no"):
                errors.append(f"{key}: invalid bool")
                continue
            val_str = "true" if val_str.lower() in ("true", "1", "yes") else "false"
        elif spec["type"] == "int":
            try:
                val_int = int(val_str)
                if "min" in spec and val_int < spec["min"]:
                    errors.append(f"{key}: min {spec['min']}")
                    continue
                if "max" in spec and val_int > spec["max"]:
                    errors.append(f"{key}: max {spec['max']}")
                    continue
            except ValueError:
                errors.append(f"{key}: must be integer")
                continue
        elif spec["type"] == "float":
            try:
                val_float = float(val_str)
                if "min" in spec and val_float < spec["min"]:
                    errors.append(f"{key}: min {spec['min']}")
                    continue
                if "max" in spec and val_float > spec["max"]:
                    errors.append(f"{key}: max {spec['max']}")
                    continue
            except ValueError:
                errors.append(f"{key}: must be number")
                continue

        conn.execute(
            "INSERT OR REPLACE INTO bot_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)",
            (key, val_str, now, operator)
        )
        updated.append(key)

    conn.commit()
    conn.close()
    broadcast_ws("settings_updated", data)
    return {"status": "ok", "updated": updated, "errors": errors}
```

**Response format:**
```json
{"status": "ok", "updated": ["greeting_message", "ai_enabled"], "errors": []}
```

**Validation error response:**
```json
{"status": "ok", "updated": ["greeting_message"], "errors": ["dedup_window: min 30"]}
```

### Frontend Settings Pattern

```jsx
// Settings page with grouped sections: General / AI / Routing
// Use PUT method (not POST) for semantic correctness
const res = await fetch('/api/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(form),
});
const result = await res.json();
if (result.errors?.length > 0) {
  setErrors(result.errors);
}
```

**Settings that apply immediately (runtime cache):** `greeting_message`, `fallback_message`, `escalation_keywords`, `greeting_keywords`, `ai_enabled`, `dedup_window`, `ai_model`, `ai_timeout`, `ai_temperature`, `ai_max_tokens` — read per-request from `bot_settings` table via `get_runtime()`.

**Settings that require restart:** `bot_active` (module-level constant), `openrouter_key` (security: mid-request reload risk).

## Action Availability

- Resolved customers: disable "Mark Resolved" button
- Escalated customers: disable "Escalate" button
- Handoff customers: disable "Take Over" button, show "Sedang Handoff"
- All customers: note input always available

## WebSocket Broadcast

After status change, broadcast to connected dashboard clients:

```python
broadcast_ws("customer_resolved", {"phone": phone, "status": "resolved"})
broadcast_ws("customer_handoff", {"phone": phone, "status": "handoff"})
```

Frontend auto-updates badge in real-time.

## POST Endpoint Pattern — JSON Body for Optional Fields

For POST endpoints that have optional fields (like handoff with optional message), use `data: dict` pattern instead of individual query params:

```python
# ✅ Good — optional fields in JSON body
@app.post("/api/customers/{phone}/handoff")
async def api_handoff(phone: str, data: dict):
    message = data.get("message", "")  # Optional

# ❌ Avoid — optional fields as query params cause 422 when missing
@app.post("/api/customers/{phone}/note")
async def api_note(phone: str, note: str):  # 422 if note not provided
    ...
```

For the `note` endpoint specifically, accept `{"note": "text"}` as JSON body rather than a query parameter — this avoids FastAPI's 422 error when the note parameter is empty or missing.
