# SPX Browser Agent — Full Tampermonkey Implementation (v2.0)

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

## Source File
Full userscript at: `~/.hermes/whatsapp-bot/spx_phone_agent.user.js` (32KB)

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
1. Install Tampermonkey in Chrome/Edge
2. Create new script → paste full content of `spx_phone_agent.user.js`
3. Set `API_KEY` to your `DASHBOARD_API_KEY` value
4. Save (Ctrl+S)
5. Navigate to SPX portal → agent auto-starts if within 9am-9pm
6. Verify: green overlay badge at bottom-right shows "Running"

## Tuning After SPX UI Changes
If SPX updates their portal:
1. `__hafjet_debug()` — check if rows still found, eye icon still detected
2. Update relevant `CONFIG` selectors
3. Save script → Tampermonkey auto-reloads
4. Verify with `__hafjet_status()` — sent count should increase
