# SPX Browser Agent — Full Tampermonkey Implementation (v2.0)

> ⚠️ **READ FIRST:** Before deploying the full agent, you MUST verify DOM selectors via the PoC-first workflow. See `references/spx-browser-poc-workflow.md` for header-based column mapping, eye-icon priority, and validation gates. Skipping PoC = false positives from wrong column mappings.

## Purpose
Fully autonomous browser-side agent running in Tampermonkey on Tuan Hafizi's laptop (9am-9pm MYT). Zero manual copy-paste. Monitors SPX Self-Collection portal, clicks eye icons to reveal masked phones, extracts data from DOM, and POSTs to HAFJET backend.

## Architecture

```
Laptop (9am-9pm)                    Azure (24/7)
┌──────────────────────┐            ┌──────────────────────┐
│ Tampermonkey         │  POST      │ POST /api/spx/phones │
│ spx_phone_agent.js   │──────→     │        /from-agent   │
│                      │  X-API-Key │                      │
│ • MutationObserver   │            │ • _process_agent_    │
│ • Row scanner        │            │   phones()           │
│ • Eye-icon clicker   │            │ • _normalize_phone() │
│ • DOM extraction     │            │ • UPDATE DB          │
│ • Retry+backoff      │            │                      │
│ • Dedup (localStor)  │            │ → Reminder Scheduler │
│ • Auto-refresh       │            │   (auto WhatsApp)    │
└──────────────────────┘            └──────────────────────┘
```

## Key Design Decisions
- **No reverse engineering** — never touch `@shopee/secure-fetch-utils` or `x-sap-ri`/`x-sap-sec`
- **No server-side phone fetch** — `show_secret` permanently abandoned
- **Browser context = real session** — agent runs in user's logged-in browser, bypasses all anti-bot
- **Auth via X-API-Key** — no JWT expiry issues; uses same `DASHBOARD_API_KEY` as dashboard
- **Operating hours gated** — auto-pause outside 9am-9pm MYT to avoid wasting resources

## Selector Strategy (IMPORTANT — see PoC workflow first)

The full agent's `CONFIG` section uses configurable selectors. Before deploying, verify these selectors work on the real SPX portal via the PoC script (`spx_phone_agent_poc_v2.9.user.js` or v3.0). Key patterns:

- **Row selection:** Header-based column mapping via `scoreHeaderRow()` — NOT `td:nth-child()`
- **Container selection:** Scored container search — data rows live OUTSIDE the header `<table>` (e.g., `div.ssc-table-body.ssc-table-show-header`)
- **Eye icon:** Priority-ordered (aria-label → CSS class → button:has(svg) → svg LAST)
- **Click pipeline:** 5-method `triggerEyeClick()` (A-E) — confirmed working method B (MouseEvent dispatch)
- **`normalizeClickable()`:** Climbs 10 levels with `isProbablyClickable()` heuristics
- **Validation:** Strict gates (`isValidTracking`, `isLikelyPhone`, `isMaskedPhone`)

Full details in `references/spx-browser-poc-workflow.md`.

## Source Files
- Full agent: `~/.hermes/whatsapp-bot/spx_phone_agent.user.js` (32KB)
- PoC v2.9 (confirmed working): `~/.hermes/whatsapp-bot/spx_phone_agent_poc_v2.9.user.js` (46KB)
- PoC v3.0 (with export): `~/.hermes/whatsapp-bot/spx_phone_agent_poc_v3.0.user.js` (49KB)

### Configuration (edit before use)
```javascript
const CONFIG = {
    BACKEND_URL: 'https://hafjet-whatsapp-bot.azurewebsites.net',
    API_KEY: 'YOUR_DASHBOARD_API_KEY_HERE',   // ← MUST SET THIS
    
    SCAN_INTERVAL: 3000,        // Scan every 3s
    CLICK_DELAY: 800,           // Wait after eye-click
    RETRY_BASE_DELAY: 5000,     // Retry: 5s → 10s → 20s → 40s → 80s → max 120s
    PAGE_REFRESH_INTERVAL: 600000, // Auto-refresh every 10 min
    
    OP_START_HOUR: 9,           // 9am MYT
    OP_END_HOUR: 21,            // 9pm MYT
    
    ROW_SELECTOR: 'tr[class*="row"], .ant-table-row, [data-row-key]',
    PHONE_MASKED_PATTERN: /\*{3,}/,  // Detect masked phones
    MAX_CONCURRENT_CLICKS: 2,        // Rate-limit eye clicks
};
```

## v3.0 Export Features (PoC only — no backend)

The v3.0 PoC script adds in-memory result store and console export:
- `window.__spx_poc_results` — array of `{tracking, name, phone, status, rowIndex, revealed}`
- `__spx_poc_dump_json()` — pretty-print JSON to console
- `__spx_poc_dump_csv()` — CSV with header `tracking,name,phone,status,revealed` (proper escaping)
- Summary line after run: `Stored results: X records in window.__spx_poc_results`

## DOM Selector Strategy
All selectors are configurable in CONFIG. Use `__hafjet_debug()` in browser console to inspect actual DOM:

```javascript
// Console commands:
__hafjet_debug()    // Full DOM inspection — rows found, sample HTML, clickable elements
__hafjet_status()   // Current stats: running, sent, errors, dedup count
__hafjet_toggle()   // Start/pause agent
```

The debug output shows every clickable element in the first row — use this to tune `EYE_ICON_SELECTORS` if SPX changes their UI.

## Error Handling Matrix

| Scenario | Behavior |
|----------|----------|
| Network failure | Exponential backoff: 5s→10s→20s→40s→80s→max 120s (5 retries) |
| HTTP 401/403 | Stop + red overlay: "Auth failed — check API_KEY" |
| HTTP 5xx | Retry like network failure |
| Session expired | Auto-detect keywords → auto-refresh page in 3s |
| Page re-render | MutationObserver → re-scan in 1s |
| Phone still masked | Poll 10x every 300ms → timeout after 3s, skip row |
| Outside 9am-9pm | Auto-pause, check every 5min to resume |
| Duplicate tracking | localStorage dedup (24h TTL) |
| DB tracking not found | Backend returns `not_found` → agent skips |
| Rate limiting SPX | Max 2 concurrent eye-clicks |

## Backend Endpoint
`POST /api/spx/phones/from-agent` — documented in main skill under API table.

Request (single):
```json
{"tracking": "SPXMY061509414257", "phone": "601133114781", "name": "...", "status": "ReadyForCollection", "source": "spx-agent"}
```

Request (batch):
```json
{"orders": [{"tracking": "...", "phone": "..."}, ...]}
```

Auth: `X-API-Key` header (DASHBOARD_API_KEY). Protected by middleware — see `_PROTECTED_PREFIXES`.

## Installation
1. **FIRST:** Run PoC script (`spx_phone_agent_poc_v3.0.user.js`) to verify selectors work. See `references/spx-browser-poc-workflow.md`.
2. Install Tampermonkey in Chrome/Edge
3. Create new script → paste full content of `spx_phone_agent.user.js`
4. Set `API_KEY` to your `DASHBOARD_API_KEY` value
5. Save (Ctrl+S)
6. Navigate to SPX portal → agent auto-starts if within 9am-9pm
7. Verify: green overlay badge at bottom-right shows "Running"

## Tuning After SPX UI Changes
If SPX updates their portal:
1. Run `__spx_poc_debug()` (from PoC script) — dump scored tables + eye candidates + ancestor chain
2. Update relevant `CONFIG` selectors based on debug output
3. Run `__spx_poc_run(5)` to verify
4. Deploy updated `spx_phone_agent.user.js`
5. Verify with `__hafjet_status()` — sent count should increase