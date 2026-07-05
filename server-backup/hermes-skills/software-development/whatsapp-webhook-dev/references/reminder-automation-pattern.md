# Reminder Automation Pattern

Reusable blueprints for WhatsApp reminder integrations with external data sources (SPX, POS, delivery, courier, etc.).

## Critical Precondition: Verify Data Source First

**Never implement the send path until you confirm the external system exports full phone numbers.**

Discovery workflow:
1. Test the portal/export manually
2. Check if recipient phone is masked in table view
3. Download exported CSV — is the phone column full or masked?
4. If masked: explore session-based API calls or manual reveal before designing the scheduler

**Why:** A masked export means the scheduler cannot send reminders — the entire pipeline must be redesigned. Building send logic first wastes ~200 LOC and requires rollback.

---

## Dry-Run Scheduler Pattern

When the data source or send permission is unconfirmed, implement the scheduler as dry-run only:

```python
async def _check_<source>_reminders():
    loop = asyncio.get_event_loop()
    try:
        due = await loop.run_in_executor(None, get_<source>_due_orders, 100, 0)
        log.info(f"[<SOURCE>] Reminder check: {len(due)} due orders")
        for order in due:
            # Idempotency: skip if sent within last 12h
            last_sent = order.get("last_reminder_sent_at")
            if last_sent:
                try:
                    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(last_sent.replace(" ", "T"))).total_seconds()
                    if elapsed < 12 * 3600:
                        continue
                except Exception:
                    pass
            log.info(
                f"[<SOURCE>] dry-run: would remind order={order['tracking_number']} "
                f"state={order['reminder_state']} phone={order['recipient_phone']} deadline={order['pickup_deadline']}"
            )
    except Exception as e:
        log.error(f"❌ _check_<source>_reminders error: {e}", exc_info=True)
```

Register in startup:
```python
_scheduler.add_job(
    _check_<source>_reminders,
    IntervalTrigger(minutes=15),
    id="<source>_reminder_check",
    replace_existing=True,
)
```

**Transition to real send:** Replace the `log.info(...)` dry-run line with:
```python
if within_24h:
    content = get_reminder_text(next_state)
    sent = await send_whatsapp_message(phone, content)
else:
    template = f"<source>_{next_state.lower()}"
    sent = await send_whatsapp_template(phone, template, components)
```

---

## Dual-Layer State Machine

External systems already have their own status. Maintain a separate internal automation state so scheduling logic is decoupled from the source system.

| External Status (source of truth) | Internal Reminder State |
|---|---|
| Ready For Collection | Pending |
| Remind1 | Remind1_Sent |
| Remind2 | Remind2_Sent |
| Remind3 | Remind3_Sent |
| Remind4 | Remind4_Sent |
| Collected | Completed (terminal) |
| Collection Failed | CollectionFailed (terminal) |
| Return_* | CollectionFailed (terminal) |

**Transition rules:**
- Scheduler advances internal state based on deadline elapsed + last_sent
- Re-importing CSV updates external status → align internal state accordingly
- Terminal states (Completed, CollectionFailed) stop all automation

---

## DB Schema: External Orders Table

```sql
CREATE TABLE IF NOT EXISTS <source>_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_number VARCHAR(50) UNIQUE NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    recipient_name VARCHAR(100),
    deadline TIMESTAMP NOT NULL,
    external_status VARCHAR(50) DEFAULT 'Pending',
    reminder_state VARCHAR(20) DEFAULT 'Pending',
    last_reminder_sent_at TIMESTAMP,
    reminder_count INTEGER DEFAULT 0,
    is_paused INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT (datetime('now')),
    updated_at TIMESTAMP DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_<source>_phone ON <source>_orders(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_<source>_deadline ON <source>_orders(deadline);
CREATE INDEX IF NOT EXISTS idx_<source>_reminder_state ON <source>_orders(reminder_state);
```

---

## CSV Import Pipeline with Upsert

```python
def import_<source>_csv(csv_text: str) -> dict:
    imported = updated = skipped = 0
    errors = []
    conn = _get_db()
    for idx, row in enumerate(csv_text.splitlines()[1:], start=2):
        # parse + validate
        existing = conn.execute("SELECT id FROM <source>_orders WHERE tracking_number = ?", (tracking_id,)).fetchone()
        if existing:
            conn.execute(UPDATE ..., (tracking_id,))
            updated += 1
        else:
            conn.execute(INSERT ..., (tracking_id, ...))
            imported += 1
    conn.commit()
    conn.close()
    return {"imported": imported, "updated": updated, "skipped": skipped, "errors": errors[:100]}
```

Validation rules:
1. Tracking number required, non-empty
2. Phone required, strip spaces/dashes, normalize to +60 prefix
3. Deadline parseable datetime
4. External status in allowed set

API endpoint shape:
```python
@app.post("/api/<source>/import-csv")
async def api_<source>_import_csv(request: Request, staff: dict = Depends(get_current_staff)):
    form = await request.form()
    upload = form.get("file")
    csv_text = (await upload.read()).decode("utf-8", errors="replace")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, import_<source>_csv, csv_text)
    return {"status": "ok", **result}
```

---

## WhatsApp 24-Hour Template Routing

```python
async def send_<source>_reminder(order: dict, next_state: str):
    last_inbound = get_last_inbound_time(order["recipient_phone"])
    within_24h = last_inbound and (datetime.now(timezone.utc) - last_inbound).total_seconds() < 86400

    if within_24h:
        text = render_reminder_text(order, next_state)
        sent = await send_whatsapp_message(order["recipient_phone"], text)
    else:
        template_name = f"<source>_{next_state.lower()}"
        components = [{"type": "body", "parameters": [
            {"type": "text", "text": order.get("recipient_name", "")},
            {"type": "text", "text": order.get("tracking_number", "")},
            {"type": "text", "text": order.get("deadline", "")},
        ]}]
        sent = await send_whatsapp_template(order["recipient_phone"], template_name, "ms_MY", components)

    if sent:
        await log_outbound(order["recipient_phone"], content, "<source>_reminder", 0, False)
        update_<source>_reminder_state(order["id"], next_state, now_str)
    return sent
```

**New send function required (text→template):**
```python
async def send_whatsapp_template(to_number: str, template_name: str, language_code: str = "ms_MY", components: list = None) -> bool:
    url = f"https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": components or []
        }
    }
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code == 200:
            log.info(f"✅ Template {template_name} sent to {to_number}")
            return True
        log.error(f"❌ Template send failed: {resp.status_code} — {resp.text[:300]}")
        return False
```

---

## Frontend: Operator UI Skeleton

The minimum viable UI for operators:

1. Upload CSV → show `{imported, updated, skipped, errors}`
2. Table with filters (status, storage/location, deadline range, search by tracking/name/phone)
3. Row actions: Mark Collected, Pause/Resume, Resend reminder
4. Stats cards: total orders, counts by external_status + reminder_state

File reference: `dashboard/src/components/SPXOrders.jsx` — full working example.

---

## Idempotency Rules

- Use `reminder_state` + `last_reminder_sent_at` as natural guard — don't create separate idempotency tables unless volume > 10K orders
- Scheduler must re-check `last_reminder_sent_at` before sending (prevents duplicate sends on overlapping ticks)
- Re-importing the same CSV must UPDATE existing rows, never create duplicates — use `ON CONFLICT(tracking_number) DO UPDATE` or explicit SELECT-then-UPDATE
- Manual override (Mark Collected) sets state to terminal → scheduler auto-skips

---

## Reminder Timing Policy (Configurable)

| Reminder | Typical Trigger |
|---|---|
| Remind1 | deadline - 3 days |
| Remind2 | deadline - 1 day |
| Remind3 | deadline (same day) |
| Remind4 | deadline + 1 day |
| Collection Failed | deadline + 2 days |

Store offsets in `bot_settings` so staff can tune without code changes.

---

## SPX Self-Collection: Masked Data & Two-Phase Sync

Shopee SPX masks phone numbers in CSV exports and table views. The actual phone is retrieved via a separate session-based API call. This requires a two-phase sync design.

### Phase 1: Fetch Order List

```python
async def fetch_spx_order_list(cookies: str, pageno: int = 1, count: int = 50) -> dict:
    url = "https://sp.spx.shopee.com.my/sp-api/point/order/collection/list"
    now = int(time.time())
    params = {
        "inbound_time_start": now - (90 * 24 * 3600),
        "inbound_time_end": now,
        "pageno": pageno,
        "count": count,
    }
    headers = {
        "Cookie": cookies,
        "Referer": "https://sp.spx.shopee.com.my/",
        "Origin": "https://sp.spx.shopee.com.my",
        "User-Agent": "Mozilla/5.0",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params, headers=headers)
        if resp.status_code == 401:
            raise Exception("SPX_SESSION_EXPIRED")
        return resp.json()
```

**Key field notes:**
- `recipient_phone` is masked (`********757`) — ignore it
- `id` (integer) is `entity_id` — NOT `co_num`
- `inbound_time` and `collect_time` are UNIX timestamps
- `status` is integer (1-9); normalize immediately:
  ```python
  STATUS_MAP = {1:"ReadyForCollection", 2:"Remind1", 3:"Remind2", 4:"Remind3",
                5:"Remind4", 6:"Collected", 7:"CollectionFailed",
                8:"Return_Outbound", 9:"Return_Packing"}
  ```

### Phase 2: Reveal Phone Per Order

```python
async def fetch_spx_phone(cookies: str, entity_id: str, tracking_number: str) -> str | None:
    url = "https://sp.spx.shopee.com.my/sp-api/order/show_secret"
    payload = {
        "entity_id": str(entity_id),
        "entity_type": 2,
        "info_type": 2,
        "query_id": tracking_number,
        "view_channel": 2,
    }
    headers = {"Cookie": cookies, "Content-Type": "application/json",
               "Referer": "https://sp.spx.shopee.com.my/",
               "Origin": "https://sp.spx.shopee.com.my"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code == 401:
            raise Exception("SPX_SESSION_EXPIRED")
        data = resp.json()
        if data.get("retcode") == 0:
            return data["data"]["real_message"]
        return None
```

**Rate limiting:** Use `asyncio.sleep(0.5)` between reveal calls.

### Batch Sync Pattern

```python
async def batch_sync_spx_orders():
    cookies = get_spx_cookies()
    if not cookies:
        return {"error": "No SPX session configured"}

    # Step 1: paginate through all orders
    pageno = 1
    while True:
        result = await fetch_spx_order_list(cookies, pageno, count=50)
        orders = result.get("data", {}).get("list", [])
        if not orders:
            break
        for order in orders:
            upsert_spx_order({...})  # phone=None initially
        if pageno * 50 >= result["data"].get("total", 0):
            break
        pageno += 1
        await asyncio.sleep(0.3)

    # Step 2: batch-reveal missing phones
    missing = get_orders_missing_phone()
    for order in missing:
        if not order.get("entity_id"):
            continue
        try:
            phone = await fetch_spx_phone(cookies, order["entity_id"], order["spx_tracking_number"])
            if phone:
                update_order_phone(order["id"], phone)
        except Exception as e:
            if "SPX_SESSION_EXPIRED" in str(e):
                return {"error": "SPX_SESSION_EXPIRED"}
        await asyncio.sleep(0.5)
```

### Session Cookie Storage

Store SPX session cookies in a singleton table:
```sql
CREATE TABLE IF NOT EXISTS spx_session (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cookies TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT (datetime('now'))
);
```

### DB Schema: External Orders Table (SPX Variant)

When the source uses masked exports and requires a separate reveal API, the orders table must allow NULL phones:
```sql
CREATE TABLE IF NOT EXISTS spx_self_collection_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id VARCHAR(50) NOT NULL,           -- API integer id as string
    spx_tracking_number VARCHAR(50) UNIQUE NOT NULL,
    scan_tracking_number VARCHAR(50),
    recipient_name VARCHAR(100),
    recipient_phone VARCHAR(20),              -- NULL until revealed
    storage_id VARCHAR(50),
    inbound_time TIMESTAMP,
    outbound_time TIMESTAMP,
    collect_by_date TIMESTAMP NOT NULL,
    spx_status VARCHAR(50) DEFAULT 'ReadyForCollection',  -- Normalized string
    hafjet_reminder_state VARCHAR(20) DEFAULT 'Pending',
    last_reminder_sent_at TIMESTAMP,
    is_paused INTEGER DEFAULT 0,
    reminder_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT (datetime('now')),
    updated_at TIMESTAMP DEFAULT (datetime('now'))
);
```

### Schema Evolution: Adding Required Columns to Existing Tables

When a new required column (`entity_id`) must be added to a table that already has rows:

1. Check existing columns via `PRAGMA table_info(table_name)`
2. If missing, `DROP TABLE IF EXISTS` + recreate with new schema
3. Recreate indexes

```python
cols = [r[1] for r in conn.execute("PRAGMA table_info(spx_self_collection_orders)").fetchall()]
if "entity_id" not in cols:
    conn.execute("DROP TABLE IF EXISTS spx_self_collection_orders")
    conn.execute(CREATE_TABLE_NEW_SCHEMA)
    conn.executescript(CREATE_INDEXES)
    conn.commit()
```

### ID Migration: `str` vs `int` Keys

Always store external API `id` fields as strings (`VARCHAR(50)`) even if they look like integers. This avoids silent `int` truncation if the API ever returns IDs > 2^53, and keeps `co_num`/`entity_id` distinctions clear.

## Customer Reply Handling (Stop Automation)

Detect collected-intent keywords:
```python
COLLECTION_KEYWORDS = ["collected", "sudah ambil", "take lepas", "dah ambil", "dah pickup"]
```

In inbound handler:
```python
if any(kw in msg_lower for kw in COLLECTION_KEYWORDS):
    await api_<source>_mark_collected(order_id)
    await send_whatsapp_message(phone, "Terima kasih! Kami dah rekod parcel anda sebagai dikoleksi.")
```

This stops the scheduler for that order immediately.
