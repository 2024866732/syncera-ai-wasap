---
name: hafjet-spx-browser-agent
description: Build and iterate Tampermonkey userscripts for SPX Self-Collection portal DOM scraping — header mapping, container scoring, eye-icon click, phone extraction. NO reverse-engineering, NO Playwright, NO manual copy-paste.
category: hafjet
---

# HAFJET SPX Browser Agent — Development Patterns

Build Tampermonkey userscripts that run in the SPX Self-Collection portal (spx.co / shopee) to extract recipient phone numbers by clicking eye icons and reading the DOM. Zero reverse-engineering of secure-fetch — all extraction happens in real browser context.

## Architecture

```
SPX Portal (Chrome/Edge + Tampermonkey)
  ├── findTableAndHeader()     → keyword-scored header detection
  ├── findContainer()           → scored container selection (NOT first match)
  ├── getDataRows()             → multi-selector, no early break
  ├── extractCell(row, colIdx)  → cell by mapped column index
  ├── findEyeIcon(row, phoneCol)→ priority-ordered eye button scan
  └── runPoC()                  → console-only test (zero POST)

HAFJET Backend (future: POST /api/spx/phones/from-agent)
  ├── X-API-Key middleware
  ├── _normalize_phone()
  └── {updated, skipped, not_found, errors}
```

## Critical Patterns (from v2.1→v2.5 iterations)

### 1. Header-Based Column Mapping

Never use `td:nth-child()` — header text determines column index:

```javascript
const COLUMN_PATTERNS = {
    tracking: ['tracking', 'tracking no', 'awb', 'order id'],
    name:     ['recipient', 'customer', 'name', 'buyer'],
    phone:    ['phone', 'contact', 'mobile', 'tel'],
    status:   ['status', 'order status', 'state'],
};
```

Map by matching header cell text against keywords, then extract data cells by that index.

### 2. Container Scoring (v2.5 — CRITICAL)

SPX renders header in `<table>` but data rows in **separate virtualized containers** (div-based, often outside the table). Picking the first container wins almost always the WRONG one (header wrapper, scroll-bar div).

**Algorithm:**
1. Collect ALL candidate containers: parent chain (8 levels), closest() matches, siblings, document fallback
2. Score each container by row selector yield: `tr[data-row-key]` = +20/row, `tr.ant-table-row` = +15/row, `.ant-table-tbody tr` = +10/row, `tr` = +1/row
3. SPXMY bonus: +30 if any row text matches `SPXMY\d{10,15}`
4. **Penalty: -30 each** for className containing: `header`, `scroll-bar`, `scrollbar`, `thead`, `sticky`, `fixed`, `shadow`, `placeholder`, `filter`, `pagination`
5. Pick highest-scoring container

### 3. Multi-Selector Row Collection — NO EARLY BREAK

Try ALL selectors, collect all matches, deduplicate, THEN filter:

```javascript
const ROW_SELECTORS = [
    'tr[data-row-key]', 'tr.ant-table-row', '.ant-table-tbody tr',
    'tbody tr', '[role="row"]', '[class*="row" i]', 'tr'
];
```

Never `break` on first non-empty selector — the first match may return only the header row.

### 4. Row Validation Gates

After collecting candidates, filter:
- NOT the header row (reference equality)
- NOT matching header text (handles sticky/duplicated headers)
- Has ≥3 cells
- Has text content (not empty)
- Contains `SPXMY\d{10,15}` OR cell count within ±3 of header cell count

### 5. Eye Icon Priority Ordering

Don't use raw `svg` as primary selector — it matches everything. Use:

```javascript
const EYE_SELECTORS = [
    '[aria-label*="show phone" i]',  // Most specific
    '[aria-label*="reveal phone" i]',
    '[aria-label*="show" i]',
    '[aria-label*="reveal" i]',
    '.anticon-eye',                   // CSS classes
    '[class*="eye" i]',
    'button[class*="icon"]:has(svg)', // Button wrappers
    'button:has(svg)',
    'svg',                            // LAST RESORT
];
```

Search phone cell first, then entire row. Return priority index for debugging.

### 6. safeClassName() for SVG Elements

`el.className` on SVG elements returns `SVGAnimatedString`, not a plain string:

```javascript
function safeClassName(el) {
    if (!el) return '';
    const cn = el.className;
    if (typeof cn === 'string') return cn;
    if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
    return '';
}
```

### 7. shortTag() — Handle document/window (v2.6)

`document.tagName` is `undefined` — calling `.toLowerCase()` crashes. Always guard:

```javascript
function shortTag(el) {
    if (!el) return '?';
    if (el === document) return 'document';
    if (el === window) return 'window';
    const rawTag = el.tagName || el.nodeName || 'node';
    const tag = String(rawTag).toLowerCase();
    const cn = safeClassName(el).split(' ').filter(Boolean).slice(0, 2).join('.');
    return cn ? tag + '.' + cn : tag;
}
```

### 8. Click Normalization — SVG `.click()` Crashes (v2.7–v2.8)

Raw SVG elements often lack `.click()` — the real clickable target is a parent wrapper. SPX eye icons are `svg.svg-icon.show-icon` inside non-semantic `<span>` wrappers that lack `button`, `[role]`, or `[tabindex]`.

**Two-phase click strategy:**

**Phase 1: `normalizeClickable()` — climb 10 levels with `isProbablyClickable()` heuristic:**

```javascript
function isProbablyClickable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = (el.tagName || '').toLowerCase();
    const cls = safeClassName(el).toLowerCase();
    const style = window.getComputedStyle(el);
    if (['button', 'a'].includes(tag)) return true;
    if (el.hasAttribute('role') && /button|link/i.test(el.getAttribute('role'))) return true;
    if (el.hasAttribute('tabindex')) return true;
    if (el.hasAttribute('onclick')) return true;
    if (style.cursor === 'pointer') return true;        // SPX uses cursor:pointer on span
    if (/btn|button|icon|action|click|show/i.test(cls)) return true;
    return false;
}

function normalizeClickable(el) {
    if (!el) return null;
    let current = el;
    for (let depth = 0; depth < 10 && current; depth++) {
        if (isProbablyClickable(current)) return current;
        current = current.parentElement;
    }
    return el;  // return raw as last resort
}
```

**Phase 2: Synthetic dispatch fallback — if normalized element still has no `.click()`:**

```javascript
function dispatchSyntheticClick(el) {
    try {
        el.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, view: window
        }));
        return true;
    } catch (e) { return false; }
}
```

**Click sequence in `runPoC()`:**
1. `findEyeIcon()` returns `rawElement` + normalized `element`
2. If `typeof element.click === 'function'` → call `.click()`
3. Else → `dispatchSyntheticClick(rawElement)` as fallback
4. Log both raw and normalized shortTag for debugging

### 9. Document Score Penalty (v2.8)

`document` as container candidate will match every `tr` on the page, producing a high score and winning over real div containers. Apply **÷10 penalty** to document:

```javascript
if (container === document) score = Math.floor(score / 10);
```

This ensures real containers (e.g., `div.ant-table-body`) win when they have fewer but more relevant rows.

## Communication & Delivery Pattern

**CRITICAL — MANDATORY**: When producing any non-trivial output (code review, deploy guide, test results, long explanation), do NOT write long messages in the Telegram chat. Instead:

1. Compile ALL content into ONE well-structured file (`.md` or `.txt`)
2. Deliver via the `telegram-file-delivery` skill (copy to `~/.hermes/cache/documents/` as `.txt`, then `MEDIA:`)
3. In the Telegram chat, write a **maximum of 3 short sentences** — just a summary + file description

The user has explicitly stated: *"Saya tak mahu jawapan panjang berjela dalam chat Telegram."* and *"Dalam chat Telegram, beri ringkasan maksimum 3 ayat sahaja."*

This applies to ALL reply types in this skill's domain: PoC delivery, deploy guides, test results, code snippets longer than ~20 lines.

## Production Deploy Pattern — WhatsApp Send First, DB Update After

When integrating a new backend feature (like SPX follow-up engine), the deploy workflow is:

1. Write the Python module with full test cases
2. Create the integration snippet that replaces/adds the handler in `webhook_listener.py`
3. Produce a deploy checklist (backup, verify, patch, commit, deploy, smoke test)
4. Produce a rollback checklist (stop reminders, revert code, audit sent orders)
5. Deliver everything in ONE `.md` file via `telegram-file-delivery`

**WhatsApp integration rule**: Send WhatsApp FIRST, update DB stage ONLY after send succeeds. If send fails, do NOT update DB — retry on next scheduler cycle. Anti-duplicate in `determine_followup()` prevents double-send.

## Patch Tool Pitfall

When editing files with the `patch` tool in `mode='replace'`, you MUST provide ALL THREE parameters: `path`, `old_string`, AND `new_string`. Common mistake: using `patch` in place of `path`, or omitting `old_string` or `new_string`. The error messages are:
- `"path required"` → you forgot the file path
- `"old_string and new_string required"` → you provided one but not both

When the tool repeatedly fails with the same error, STOP retrying immediately — switch to `write_file` to write the entire file fresh instead of patching. This avoids tool loop exhaustion.

## Delivery Pattern

Tampermonkey `.user.js` files cannot be sent via `MEDIA:` on Telegram. Use the `telegram-file-delivery` skill:

```bash
cp file.user.js ~/.hermes/cache/documents/file.txt
# → MEDIA:/home/hafizi145/.hermes/cache/documents/file.txt
```

User downloads `.txt`, renames to `.user.js`, drags into Tampermonkey.

## v2.9 — 5-Method Click Pipeline (A → E)

After normalization, try these methods in order:

| Method | Action | Target |
|--------|--------|--------|
| **A** | `.click()` | Normalized element |
| **B** | `dispatchEvent(MouseEvent('click'))` | Normalized element |
| **C** | `mousedown + mouseup + click` dispatch sequence | Normalized element |
| **D** | `dispatchEvent(MouseEvent('click'))` | Raw SVG |
| **E** | `mousedown + mouseup + click` dispatch sequence | Raw SVG |

```javascript
function triggerEyeClick(normalizedEl, rawEl) {
    if (normalizedEl && typeof normalizedEl.click === 'function') {
        try { normalizedEl.click(); return { method: 'A', success: true }; } catch (e) {}
    }
    if (normalizedEl && dispatchSimple(normalizedEl)) return { method: 'B', success: true };
    if (normalizedEl && dispatchFullSequence(normalizedEl)) return { method: 'C', success: true };
    if (rawEl && dispatchSimple(rawEl)) return { method: 'D', success: true };
    if (rawEl && dispatchFullSequence(rawEl)) return { method: 'E', success: true };
    return { method: '—', success: false };
}
```

SPX runtime: method **B** consistently works. Methods D/E are fallbacks.

## v3.0 — In-Memory Results Store + Export

```javascript
// Initialized at top of runPoC():
window.__spx_poc_results = [];

// Per-row push (already-clear):
window.__spx_poc_results.push({ tracking, name, phone, status, rowIndex, revealed: false });

// Per-row push (revealed):
window.__spx_poc_results.push({ tracking, name, phone: phoneAfter, status, rowIndex, revealed: true });

// Export to console:
__spx_poc_dump_json()  → console.log(JSON.stringify(results, null, 2))
__spx_poc_dump_csv()   → console.log CSV with header line
```

Never push invalid/skipped rows. Only rows that pass validation gates.

## v3.1 — Status Filter + Dedupe + Clipboard

**Options object signature (backward-compatible):**
```javascript
__spx_poc_run(10)                           // v3.0 style (number)
__spx_poc_run({ limit:10, status:"Ready" }) // filter by status substring
__spx_poc_run({ limit:20, dedupe:true })    // dedupe by tracking
```

**Status filter:** applied BEFORE validation gates. Filtered-out rows do NOT consume the limit. Track `totalFilteredOut` counter in SUMMARY.

**Dedupe:** `Set` per-run tracking. Only blocks `push()` into results — reveal logic still runs. Dedupe is opt-in (`dedupe: true`), default preserves v3.0 behavior.

**Clipboard:**
```javascript
__spx_poc_copy_json() → navigator.clipboard.writeText + execCommand('copy') fallback
__spx_poc_copy_csv()  → same dual-method
```

## Production Script — `spx_phone_agent.user.js`

Full production Tampermonkey userscript at `~/.hermes/whatsapp-bot/spx_phone_agent.user.js`:

**Features beyond PoC:**
- Auto-run on page load + periodic scan (CONFIG.AUTO_SCAN_INTERVAL_MS)
- MutationObserver detects table DOM changes
- Backend POST via `GM_xmlhttpRequest` with retry (CONFIG.REQUEST_RETRY_COUNT)
- Delta push mode: only send new + changed rows (vs batch all)
- In-memory state tracking: scanCount, totalProcessed, totalRevealed, totalPosted
- Visual badge overlay (bottom-right) showing live scan/post stats
- `__spx_test_post()` sends sample payload to verify backend connectivity

**CONFIG placeholders (edit before use):**
```javascript
BACKEND_URL: 'https://YOUR-BACKEND-ENDPOINT/api/spx/ingest',
BACKEND_HEADERS: { 'X-Agent-Token': 'REPLACE_ME' },
```

**Post payload format:**
```json
{
  "source": "spx-browser-agent",
  "agent_version": "1.0.0-prod",
  "mode": "delta",
  "orders": [
    { "tracking": "SPXMY...", "name": "...", "phone": "601...", "status": "Remind1",
      "reveal_state": "revealed", "row_hash": "-1845123456",
      "scraped_at": "2026-07-25T10:30:05Z", "previous_status": null }
  ]
}
```

**Key: browser script only scrapes and POSTs facts. WhatsApp send decisions are made by the backend.**

## Backend Follow-Up Engine — `spx_followup.py`

Production Python function at `~/.hermes/whatsapp-bot/spx_followup.py`.

**`determine_followup(order, now=None) → (next_stage, template_name)`**

Priority:
1. SPX page status IS the source of truth: "Remind1"→remind1, "Collection Failed"→collection_failed
2. Fallback by `collect_by_date`: days_left<0→collection_failed, ==0→remind4, ==1→remind3, ==2→remind2, >=3→remind1
3. No collect_by_date → `inbound_time + 5 days`
4. `first_seen_at` NEVER used for SLA basis

Anti-duplicate: never re-send same stage, never downgrade, collected overrides all.

See `references/spx-followup-engine.md` for full mapping tables and test cases.

## Pitfalls

1. **Never scope rows to header table**: `table.querySelectorAll('tr')` only finds rows inside that `<table>`. SPX virtualized tables put data rows in sibling divs.

2. **Header-only wrappers score high on row count alone**: A `div.ssc-table-header-scroll-bar` may contain that one header `<tr>`, giving +1 → score=1. Without penalty, this beats document which has all rows but also many non-row `tr` elements. The penalty pattern blocks this.

3. **Copy-paste from Telegram to Tampermonkey**: Telegram auto-converts bare URLs into Markdown links. Use `Ctrl+Shift+V` (paste as plain text) when copying from code blocks. Better: deliver as `.txt` file and rename.

4. **PoC must NOT include any POST/API calls**: The PoC is console-only. Backend payload is added only after selectors are confirmed working on real SPX portal.

## Reference Files

- `references/container-scoring-algorithm.md` — detailed scoring math, selector points table, worked example
- `references/click-normalization.md` — v2.7→v2.8 eye-click fix: `isProbablyClickable()` heuristic, synthetic `MouseEvent` dispatch, `debugAncestors()` pattern
- `references/iteration-history-v2.md` — v2.1→v2.8 changelog: each version's runtime failure and fix

## Related Skills

- `telegram-file-delivery` — how to send .user.js files via Telegram
- `hafjet-biz-ops` — SPX operations context (Loyverse, WhatsApp, Gmail)
- `hafjet-spx-reminder` — SPX reminder scheduler skill
