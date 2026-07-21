# Loyverse Items / Inventory API

Complement to the Receipts-based sales reporting. Used for voice queries like *"stok tempered glass iphone 15 berapa?"* and *"stok rendah hari ini apa?"*.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /v1.0/items` | List | All items (catalogue) — name, sku, cost, price, stock_quantity |
| `GET /v1.0/inventory_levels` | List | Per-variant stock counts (warehouse-level) |

Response shape (items):
```json
{
  "items": [
    {
      "id": "...",
      "item_name": "TEMPLED GLASS IPHONE 15",
      "sku": "TG-IP15",
      "stock_quantity": 12,
      "cost": 5.00,
      "unit_price": 25.00,
      "category_id": "..."
    }
  ],
  "cursor": "..."
}
```

## Shared patterns with Receipts API

### Pagination (same I1–I5 invariants)
The Items API uses the same cursor-based pagination as receipts:

```python
BASE = "https://api.loyverse.com/v1.0"
url = f"{BASE}/items?limit=50"
if cursor:
    url += f"&cursor={cursor}"   # I1: raw, never url-encode
```

| Invariant | Items API | Notes |
|-----------|-----------|-------|
| I1 cursor reuse | ✅ | Same frozen URL params per page |
| I2 frozen upper bound | N/A (no time filter) | Items API is a full dump, not time-windowed |
| I3 datetime guard | N/A | No created_at on items |
| I4 dedup by id | ✅ | Use `item["id"]` for dedup set |
| I5 runaway brake | ✅ | `page > 50 → break + WARNING` |

### Token loading
Use `_load_loyverse_token()` — same as receipts. Items API uses the same Bearer token.

## Known constraint: HUGE catalogue

Confirmed 2026-07-21 by HAFJET device test: inventory contains **~2500+ items** across **50+ API pages** (limit=50). Each full fetch takes **60–90 seconds**. Implications:

- Voice queries may time out before fetch completes
- Every `hafjet_inventory` call re-paginates from scratch
- I5 runaway brake triggers every call (page>50, normal for this dataset)

### Mitigation: memory cache
The bridge MUST cache items with TTL (e.g. 30s):

```python
_cached_items = []          # module-level
_cached_at = 0.0            # time.monotonic()

def _fetch_all_items(token):
    now = time.monotonic()
    if _cached_items and (now - _cached_at) < 30:
        return _cached_items
    # ... full pagination loop ...
    _cached_items = all_items
    _cached_at = now
    return all_items
```

30s TTL: first query slow, subsequent queries instant.

## Voice query matching

Two-pass approach in `_match_item()`:

| Pass | Criteria | Example |
|------|----------|---------|
| 1 | Prefix — item_name starts with `q` OR any word starts with `q` | `"templed"` → `"TEMPLED GLASS IPHONE 15"` |
| 2 | Contains — `q in item_name` (case-insensitive) | `"glass"` → any item with glass in name |

Tie-breaking: shortest name → most specific.

Known weakness: voice ASR may produce different spelling than Loyverse (e.g. "ayerpod" vs "EARPOD", "tempered" vs "TEMPLED"). On failure, log query + first 5 item names for debugging.

## Low stock filter

```python
def _filter_low(items, threshold=5):
    res = [x for x in items
           if isinstance(x.get("stock_quantity"), (int, float))
           and x["stock_quantity"] <= threshold]
    res.sort(key=lambda x: x.get("stock_quantity", 0))
    return res
```

TTS output: `"Stok {name} ialah {qty} unit."` / `"Item {name} tidak ditemui."` / `"Item stok rendah: {name} ({qty}), ..."` / `"Semua item dalam stok mencukupi."` Limit top 10 + `"dan X item lain."`

## Two-mode MCP handler pattern

Use this for any voice tool dispatching by action:

```python
async def hafjet_inventory(arguments: dict) -> dict:
    action = arguments.get("action", "")
    if action not in ("query_item", "low_stock"):
        return make_tool_result("...", is_error=True)

    token = _load_loyverse_token()
    items = _fetch_all_items(token)

    if action == "query_item":
        query = arguments.get("query", "").strip()
        match = _match_item(items, query)
        # ... TTS based on found/miss ...

    elif action == "low_stock":
        threshold = arguments.get("low_threshold", 5)
        low = _filter_low(items, threshold)
        # ... TTS with low stock list ...
```

Schema in `list_tools` must declare both params:

```python
types.Tool(name="hafjet_inventory", inputSchema={
    "properties": {
        "action": {"type": "string"},
        "query": {"type": "string"},
        "low_threshold": {"type": "integer"}
    }
})
```

xiaozhi.me LLM maps voice to arguments automatically.
