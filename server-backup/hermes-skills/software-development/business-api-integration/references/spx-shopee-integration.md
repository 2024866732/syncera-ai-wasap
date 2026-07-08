# SPX Shopee Integration Notes

## Confirmed Endpoints

- `GET https://sp.spx.shopee.com.my/sp-api/point/order/collection/list`
  - Query: `inbound_time_start`, `inbound_time_end` (unix timestamp in seconds), `pageno`, `count`
  - Response: `data.list[]` with `id` (entity_id), `shipment_id`, `recipient_name`, `recipient_phone` (masked), `inbound_time`, `collect_time`, `outbound_time` (0 = NULL), `status` (int), `storage_id`
  - Total field in `data.total`

- `POST https://sp.spx.shopee.com.my/sp-api/order/show_secret`
  - Body: `{"entity_id": "entity_id", "entity_type": 2, "info_type": 2, "query_id": tracking, "view_channel": 2}`
  - Response: `data.real_message` contains full phone number

## ⚠️ SPX Response JSON Format Pitfalls

### Anti-Hijacking Prefix

The SPX API sometimes wraps JSON responses in the `)]}'\n` prefix (5-6 chars) as an anti-JSON-hijacking measure. Python's `json.loads()` will fail with `JSONDecodeError`. **Always use a safe JSON parser:**

```python
def _safe_json(text: str) -> dict:
    """Parse JSON, stripping non-JSON prefix/suffix."""
    text = (text or "").strip()
    if not text:
        return {}
    # Find first { or [
    start = -1
    for ch in ("{", "["):
        idx = text.find(ch)
        if idx != -1 and (start == -1 or idx < start):
            start = idx
    if start == -1:
        return {}
    trimmed = text[start:]
    # Find matching bracket via counter
    end, depth, in_str, esc = -1, 0, False, False
    for i, ch in enumerate(trimmed):
        if esc: esc = False; continue
        if ch == "\\" and in_str: esc = True; continue
        if ch == '"' and not esc: in_str = not in_str; continue
        if in_str: continue
        if ch == trimmed[0]: depth += 1
        elif (trimmed[0] == "{" and ch == "}") or (trimmed[0] == "[" and ch == "]"):
            depth -= 1
            if depth == 0: end = i + 1; break
    if end == -1:
        return {}
    return json.loads(trimmed[:end])
```

Always wrap with `try/except` using httpx `resp.json()` first, then fallback to `_safe_json(resp.text)` on `JSONDecodeError`.

### Empty Responses

The API may return empty bodies during transient errors. Guard defensively:

```python
body = resp.text or ""
blen = len(body.strip())
if blen == 0:
    log.warning("SPX response empty")
    return {}  # or return None / continue
```

### Extra Content After JSON

The API may append trailing whitespace or garbage after the JSON body. The `_safe_json` bracket-finding approach above handles this.

## Status Integer Mapping

1=ReadyForCollection, 2=Remind1, 3=Remind2, 4=Remind3, 5=Remind4, 6=Collected, 7=CollectionFailed, 8=Return_Outbound, 9=Return_Packing

## Rate Limits

No documented hard limit. Use 0.3s between list pages, 0.5s between show_secret calls.

## Auth

Cookie-based session. 401 on either endpoint means session expired — propagate as `SPX_SESSION_EXPIRED`.

## Session Status Verification

Always ship a health-check endpoint that calls the API with `count=1`:

```python
@app.get("/api/spx/session-status")
async def check_session(staff = Depends(get_current_staff)):
    result = await fetch_spx_order_list(cookies, pageno=1, count=1)
    total = result.get("data", {}).get("total", 0)
    return {"active": True, "total": total, "error": None,
            "deploy_version": "spx-json-guard-v1-2026-07-08"}
```

Expose a version marker in the response to confirm file deployment.

## SQLite Compatibility Note

Azure App Service (Linux, Python 3.11 container) ships SQLite < 3.35.0, which does **not** support the `RETURNING` clause. Use two-step insert + select:

```python
# ❌ Will fail: RETURNING * not supported
conn.execute("INSERT INTO ... VALUES (...) RETURNING *")

# ✅ Works everywhere:
conn.execute("INSERT INTO ... VALUES (...)")
row = conn.execute("SELECT * FROM table WHERE key = ?", (key,)).fetchone()
```

## Verification Pattern

Before deploying to production, always:
1. Expose `deploy_version` in a health/session endpoint
2. Use `az webapp stop` + `az webapp start` (not restart) to pick up new files
3. Verify the version marker appears in the response before testing sync
