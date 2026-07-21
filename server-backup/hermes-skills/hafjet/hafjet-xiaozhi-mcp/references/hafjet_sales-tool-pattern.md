# hafjet_sales / hafjet_sales_weekly / hafjet_sales_monthly — Loyverse tool pattern

Three MCP tools added to the bridge after `hafjet_status` (Phase-1 PoC).
All call the **Loyverse POS API** live and return a short Malay TTS string.

## Approved spec (applies to ANY data tool)

- Primary range filter: **`created_at.gte` + `created_at.lte`** (dot notation, `+08:00` offset).
  NOT `created_at_min`/`created_at_max` (those are invalid — HTTP 400).
- Pagination via `cursor` until exhausted. **`limit=50`** (API max; >50 returns HTTP 402).
- `try/except` every call; on failure return `CallToolResult(isError=True)`.
- stdlib-only (`urllib`/`json`/`datetime`) — no `pip install`.
- Separate **journal log** from **TTS string**. No token / trace in TTS.
- **Client-side range guard** always implemented (Loyverse free tier IGNORES server-side filters).

## Invariants (I1–I5)

See `devops/loyverse-sales/SKILL.md` → "Pagination Stability Invariants (I1–I5)".
Reusable for daily, weekly, monthly, or any custom-range Loyverse query.

## Tools

### `hafjet_sales` (built 2026-07-20, fixed 2026-07-21)
- Range: MYT day `00:00:00`–`23:59:59`, `created_at.gte`/`lte` + `+08:00`
- Client guard: `ca_myt_str == today_myt_str` (parsed MYT date)
- TTS: `"Jualan hari ini: RM X,XXX.XX dari N transaksi."`

### `hafjet_sales_weekly` (built 2026-07-21)
- Range: Monday 00:00 MYT → now MYT (frozen `lte` — I2)
- Client guard: `monday_start ≤ ca_dt ≤ now_myt` (full `datetime` — I3)
- Aggregation field: `receipt_date` preferred, fallback to `created_at`
- Dedup: `seen = set(receipt_number)` (I4)
- TTS: `"Jualan minggu ini: RM X,XXX.XX dari N transaksi."`

### `hafjet_sales_monthly` (built 2026-07-21)
- Range: 1st of month 00:00 MYT → now MYT (frozen `lte` — I2)
- Client guard: `month_start ≤ ca_dt ≤ now_myt` (full `datetime` — I3)
- Aggregation field: `receipt_date` preferred, fallback to `created_at`
- Dedup: `seen = set(receipt_number)` (I4)
- TTS: `"Jualan bulan ini: RM X,XXX.XX dari N transaksi."`

### Partial semantics (all tools)

| Scenario | `isError` | TTS text |
|---|---|---|
| 402 + data > 0 | `False` | "...setakat data yang dapat diambil: RM X,XXX.XX dari N transaksi." |
| 402 + data == 0 | `True` | "Loyverse hadkan capaian data (31 hari). Sila rujuk admin." |
| 400 / 401 / 403 | `True` | "Loyverse kembalikan ralat HTTP {code}." |

## Bug post-mortem: HTTP 400 (2026-07-20→21)

### Root cause (two bugs stacked)

1. **Wrong param names** — used `created_at_min`/`created_at_max` instead of
   `created_at.gte`/`created_at.lte` (dot notation). Loyverse rejects unknown params → **400**.
2. **Wrong datetime format** — `.isoformat()` emitted `+08:00` offset + microseconds.
   Loyverse requires `YYYY-MM-DDTHH:MM:SS+08:00` (second precision, offset suffix OK).

### Debug sequence (the honest trail)

| Fix applied | Params | Format | limit | Result |
|---|---|---|---|---|
| None (original) | `created_at_min`/`max` | `.isoformat()` (MYT + micro) | 250 | **400** |
| UTC format | `created_at_min`/`max` | UTC `strftime`, no offset | 250 | **400** (param still wrong!) |
| Dot params + offset | `created_at.gte`/`lte` | `+08:00` `strftime` | 50 | **200** ✅ |

### Correct final query

```python
gte = day_start_myt.strftime("%Y-%m-%dT%H:%M:%S+08:00")
lte = day_end_myt.strftime("%Y-%m-%dT%H:%M:%S+08:00")
url = f"{BASE}/receipts?limit=50&created_at.gte={gte}&created_at.lte={lte}"
```

## Known-good helper skeleton

The full working 4-tool bridge with daily + weekly + monthly + I1–I5 invariants:
→ **`~/hafjet-mcp-bridge/hafjet_bridge.py`** (~500 lines, systemd user service).

Key helpers (stdlib-only, reusable):
- `_load_loyverse_token()` — reads env or `~/.hermes/.env`
- `_fetch_loyverse_today(token)` → `(text, is_error, is_partial)`
- `_fetch_loyverse_weekly(token)` → `(text, is_error, is_partial)`
- `_fetch_loyverse_monthly(token)` → `(text, is_error, is_partial)`
- `make_tool_result(text, is_error)` → `CallToolResult`-shaped dict

## Systemd deployment

- Unit: `~/.config/systemd/user/hafjet-bridge.service`
- Env: `~/hafjet-mcp-bridge/run.env` → `XIAOZHI_MCP_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=...`
- Restart: `systemctl --user restart hafjet-bridge`
- Log: `journalctl --user -u hafjet-bridge -f`
