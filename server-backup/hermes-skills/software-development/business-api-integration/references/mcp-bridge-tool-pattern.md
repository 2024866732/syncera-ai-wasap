# MCP Bridge Tool Architecture (HAFJET Pattern)

A repeatable architecture for adding tools to a Python MCP bridge (std MCP SDK, WebSocket client role). Evolved across 6+ tool builds: status, sales, sales_weekly, sales_monthly, inventory, closing_report, customer_last_visit.

## Architecture Overview

```
helper functions          paginated API fetching
     ↓
async handler function   business logic, TTS formatting, logging
     ↓
list_tools registration  advertise the tool with JSON Schema
     ↓
call_tool routing        elif name == "tool_name": result = await handler(arguments)
```

## Step-by-Step: Adding a New Tool

### 1. Write API Fetch Helper(s)

If the tool needs data from an external API (Loyverse, etc.), create a helper that:
- Returns `list[dict]` or `dict | None` — never crashes the bridge
- Returns `[]` or `None` on total failure (caller handles fallback)
- Uses stdlib only (`urllib.request`) for Loyverse
- Applies pagination invariants I1–I5 if pagination needed

**Pattern — fetch helper with cache:**

```python
# Module-level cache (30-second TTL)
_cached_items = None
_cached_items_ts = 0.0

def _fetch_some_data(token: str) -> list[dict]:
    import time, urllib.request, urllib.error, json
    
    global _cached_items, _cached_items_ts
    
    # ── Cache check ──
    now = time.time()
    if _cached_items is not None and (now - _cached_items_ts) < 30:
        logger.info("[dbg] using cached %s items (%0.1fs old)",
                    len(_cached_items), now - _cached_items_ts)
        return _cached_items
    
    # ── Fresh fetch ──
    all_items, cursor, page = [], None, 0
    while True:
        page += 1
        url = f"{BASE}/endpoint?limit=50"
        if cursor:
            url += f"&cursor={cursor}"  # I1 — NEVER url-encode
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as he:
            logger.error("[7] HTTP %s", he.code)
            return all_items if all_items else []   # partial return
        except Exception as e:
            logger.error("[7] exception: %s", e)
            return all_items if all_items else []
        
        recs = data.get("items", [])
        for x in recs:
            all_items.append(x)          # I4: dedup by id optional
        cursor = data.get("cursor")
        if not cursor or not recs:
            break
        if page > 50:                    # I5: runaway brake
            logger.warning("page>50 brake")
            break
    
    # ── Update cache + log diagnostic ──
    _cached_items = all_items
    _cached_items_ts = time.time()
    first_n = [x.get("name", "?") for x in all_items[:10]]
    logger.info("[dbg] cached %s items; first_items: %s", len(all_items), first_n)
    return all_items
```

### 2. Write Async Handler

The handler is an `async def` that accepts `arguments: dict` and returns `dict` via `make_tool_result()`.

**Pattern:**

```python
async def hafjet_some_tool(arguments: dict) -> dict:
    try:
        # Extract arguments
        action = arguments.get("action", "")
        query = arguments.get("query", "").strip()
        
        # Load external token
        token = _load_loyverse_token()  # reads from env
        if not token:
            return make_tool_result(
                "Sistem belum dikonfigurasi, sila rujuk admin.", is_error=True)
        
        # Fetch data
        data = _fetch_some_data(token)
        if not data:
            return make_tool_result(
                "Gagal dapatkan data.", is_error=True)
        
        # Business logic + TTS formatting
        if action == "query":
            result = process_query(data, query)
            logger.info("[6] result: action=%s query=%s -> %s", action, query, result)
            return make_tool_result(result, is_error=False)
        
        elif action == "summary":
            result = process_summary(data)
            logger.info("[6] result: action=%s -> %s", action, result)
            return make_tool_result(result, is_error=False)
        
        else:
            return make_tool_result(
                "Sistem tidak faham arahan.", is_error=True)
    
    except Exception as e:
        logger.error("[7] exception: %s", e)
        return make_tool_result(
            f"Ralat semasa proses data: {e}", is_error=True)
```

### 3. Register in `list_tools`

Add a `types.Tool` entry to the list that advertises the tool:

```python
types.Tool(
    name="hafjet_some_tool",
    description="What this tool does (short, for device).",
    inputSchema={
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "description": "\"query_item\" or \"low_stock\""
            },
            "query": {
                "type": "string",
                "description": "Query string"
            },
        },
        # Specify required fields
        "required": ["action"]
    },
),
```

Also update the logger.info line to include the new tool name:
```python
logger.info("[4] tools/list requested -- advertising 'hafjet_status','hafjet_some_tool'")
```

### 4. Add Route in `call_tool`

Insert an `elif` before the final `else:`:

```python
elif name == "hafjet_some_tool":
    result = await hafjet_some_tool(arguments)
```

## 30-Second In-Memory Cache (Proven Pattern)

Used when an API dataset is large (2500+ items, 51 pages, 80s fetch time).

| Element | Value |
|---------|-------|
| Cache target | Full dataset (e.g., all items from Loyverse) |
| TTL | 30 seconds |
| Storage | Module-level variables |
| Scope | Per-process (lost on restart) |
| Logging | Log hit/miss + age + first 10 items |

**When to use:**
- Voice queries need sub-second response for subsequent calls
- Dataset changes infrequently (prices/stock change hourly, not per-second)
- First call latency is acceptable (user expects it)

**When NOT to use:**
- Data changes every call (time-series, live counts)
- Process restarts frequently (cache lost)
- Dataset is small enough to fetch quickly (<5s)

## Partial Semantics (402 Pattern)

For APIs with depth limits (Loyverse 31-day window):

| Scenario | Behaviour | TTS |
|----------|-----------|-----|
| 402 + rows > 0 | Success (partial) | "... setakat data yang dapat diambil: RM X dari N transaksi." |
| 402 + rows == 0 | Hard error | "Maaf, sistem..." |
| 400/401/403 | Hard error | "Maaf, sistem..." |

Implementation in helper:
```python
except urllib.error.HTTPError as he:
    if he.code == 402 and all_items:
        return all_items  # partial — caller handles
    return []  # hard error — caller knows
```

## Logging Conventions

| Prefix | Purpose |
|--------|---------|
| `[3]` | Initialization / handshake |
| `[4]` | tools/list |
| `[5]` | tools/call received |
| `[6]` | Business logic result (success or not-found) |
| `[7]` | Error / exception |
| `[8]` | Fatal / crash |
| `[dbg]` | Detailed debug (page numbers, cache hit, first_items) |

## `make_tool_result` helper

Used by every handler to produce the MCP response dict:

```python
def make_tool_result(text: str, is_error: bool = False) -> dict:
    if is_error:
        logger.info("[6] tool error result sent: %s", text)
    else:
        logger.info("[6] tool success result sent: %s", text)
    if is_error:
        return {
            "content": [{"type": "text", "text": text}],
            "isError": True,
        }
    return {
        "content": [{"type": "text", "text": text}],
    }
```

## `_load_loyverse_token` helper

Every tool that needs the Loyverse token:

```python
def _load_loyverse_token() -> str | None:
    """Read LOYVERSE_ACCESS_TOKEN from env or .hermes/.env."""
    import os
    tok = os.environ.get("LOYVERSE_ACCESS_TOKEN", "").strip()
    if tok:
        return tok
    env_path = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                s = line.strip()
                if s.startswith("LOYVERSE_ACCESS_TOKEN="):
                    return s.split("=", 1)[1].strip().strip('"').strip("'")
    return None
```

## Banned Patterns (HAFJET Policy)

| Pattern | Why |
|---------|-----|
| `curl ... \| python3` | Arbitrary code execution, credential leak |
| Heredoc with inline credentials | Shell quoting breaks tokens with special chars |
| `grep ^TOKEN=*** ...` with `***` in single quotes | Literal asterisks — grep fails silently |
| `sleep` without health check after `systemctl restart` | Always verify service is running before testing |
| Restarting gateway / cleaning disk / rebooting VM | Out-of-scope for tool builds |
