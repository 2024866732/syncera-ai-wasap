# SPX Browser Agent — PoC-First Iterative Workflow + Selector Patterns

## ⚠️ MANDATORY: PoC Before Full Deployment

**Never deploy the full agent (`spx_phone_agent.user.js`) without first verifying DOM selectors via PoC.**

The SPX portal DOM varies per deployment region and version. Generic selectors (`td:nth-child(2)`, `table tbody tr`) WILL fail because column order differs. Always validate with a minimal PoC that does NOT POST to backend — only console logging.

### PoC Iterative Workflow (locked in Jul 2026)

1. **Backend sanity check** — verify endpoint exists, is protected, return format correct
2. **Minimal PoC userscript** — DOM detection + console log only. NO backend calls.
3. **Real portal testing** — Tuan runs `__spx_poc_run()` on actual SPX page
4. **Refine selectors** — based on console output, update COLUMN_PATTERNS/EYE_SELECTORS
5. **Only when PoC passes** (tracking=SPXMY..., phone=601..., name=customer) → deploy full agent + backend

**Success criteria for PoC:**
- ✅ Tracking = SPXMY\d+
- ✅ Name = customer name (NOT SPXMY tracking number)
- ✅ Phone before = `****xxxx` (masked)
- ✅ Phone after = `601...` (full number, NOT tracking digits)
- ✅ Status = ReadyForCollection / Collected / etc.

### PoC Version Evolution (v1 → v3.0)

| Version | Key Change | Result |
|---------|-----------|--------|
| v1 | `td:nth-child()` — generic position-based extraction | ❌ FAILED — wrong column mapping, false positives |
| v2.1 | Header-scored table selection + eye-priority selectors + `@grant none` | ❌ Data rows: 0 — `tbody tr` returned only header |
| v2.2 | `getDataRows()` multi-selector fallback (no early break) | ❌ All selectors scoped to `<table>` returned 0 — data rows live OUTSIDE `<table>` |
| v2.3 | All- selector collection (no early break) + row validation | ❌ Still scoped to table — only header row matched |
| v2.4 | Unscoped container search (`table.parentElement` / `closest()`) | ❌ `findContainer()` picked wrong container (`ssc-table-header-scroll-bar-wrapper`) |
| v2.5 | Scored container selection — penalize header/scroll wrappers | ❌ Crashed: `shortTag(document)` — `document.tagName` undefined |
| v2.6 | Crash fix: `shortTag()` handles document + `addCandidate()` rejects non-element nodes | ❌ `normalizeClickable()` returned raw SVG — SVG has no `.click()` |
| v2.7 | `normalizeClickable()` climbs to button ancestor | ❌ SPX eye wrapper is non-semantic (no button/role/tabindex) — SVG still returned |
| v2.8 | `isProbablyClickable()` heuristics (cursor/aria/data-attrs) + synthetic MouseEvent fallback | ❌ Crashed: `scoreHeaderRow()` typo `cels` not defined |
| **v2.9** | **FIX: `cels`→`cells` + full 5-method click pipeline (A-E) + refined penalties** | **✅ SUCCESS — 10/10 phones revealed, method B (MouseEvent dispatch)** |
| **v3.0** | **v2.9 + in-memory result store + `dumpJson()` / `dumpCsv()` export** | **✅ Additive — same click behavior + console export** |

### PoC Files

| File | Version | Purpose |
|------|---------|---------|
| `spx_phone_agent_poc.user.js` | v1 (DEPRECATED) | Used `td:nth-child()` — FAILED on real SPX |
| `spx_phone_agent_poc_v2.1.user.js` | v2.1 | Header-scored + eye-priority + strict validation |
| `spx_phone_agent_poc_v2.9.user.js` | v2.9 (CONFIRMED WORKING) | Full click pipeline + heuristics + container scoring |
| `spx_phone_agent_poc_v3.0.user.js` | v3.0 (LATEST) | v2.9 + export features (dumpJson/dumpCsv) |

## Header-Based Column Mapping (v2 pattern — REPLACES nth-child)

**Problem with v1:** `td:nth-child(2)` assumed column 2 = tracking, column 3 = phone. On real SPX portal, column order was different — name was reading tracking numbers, phone was reading tracking digits. All 4 "revealed" phones were false positives.

**Solution — `scoreHeaderRow()` + keyword mapping:**

```javascript
const COLUMN_PATTERNS = {
    tracking:  ['tracking', 'tracking no', 'tracking number', 'tracking#', 'awb', 'order id', 'order'],
    name:      ['recipient', 'recipient name', 'customer', 'customer name', 'name', 'nama', 'buyer'],
    phone:     ['phone', 'recipient phone', 'contact', 'mobile', 'tel', 'no. telefon'],
    status:    ['status', 'order status', 'state', 'collection status'],
};
```

**How it works:**
1. Find all tables, score each by how many COLUMN_PATTERNS keywords match header cells
2. Higher weight for tracking (5) + name (4) + phone (3) + status (2)
3. Bonus +20 if ALL four columns found
4. Pick the table with the HIGHEST score — NOT the first table with 4+ columns
5. Extract cells by **mapped column index**, not `td:nth-child()`

**Validation gates (prevents false positives):**
- `isValidTracking()` — MUST match `SPXMY\d{10,15}`
- Name MUST NOT match `SPXMY\d+` (reject tracking-looking values)
- Phone must be `\*{3,}` (masked) OR `601...`/`01...` with 10-14 digits
- 12-18 digit strings without `60`/`01` prefix are rejected (they're tracking-like)
- All 4 fields must pass validation before eye-click is attempted

## Container Selection — Scored + Unscoped (v2.4–v2.9)

### Critical discovery: SPX data rows live OUTSIDE the header `<table>`

SPX portal renders the header in a `<table>` element, but data rows are in a **separate container** (e.g., `div.ssc-table-body.ssc-table-show-header`). Scoping row selectors to `table.querySelectorAll()` returns only the header row.

### `findContainer()` — scored selection (v2.5+)

1. Walk up parent chain (8 levels) from the header table
2. At each level, check `CONTAINER_CLUES` selectors AND siblings
3. Also try `table.closest()` for each clue
4. Add `document` as last-resort fallback
5. **Score each candidate** by row selector yield:
   - `tr[data-row-key]` → 20 pts/row
   - `tr.ant-table-row` → 15 pts/row
   - `.ant-table-tbody tr` → 10 pts/row
   - `[role="row"]` → 8 pts/row
   - `[class*="row" i]` → 5 pts/row
   - `tr` → 1 pt/row
   - +30 bonus if any row contains `SPXMY` tracking number
6. Apply penalties:
   - `scroll-bar`, `scrollbar`, `thead`, `sticky`, `fixed` → -30 each
   - `table-header`, `header-scroll`, `header-bar`, `header-wrapper` → -40 each
   - Generic `header` (but NOT `show-header`/`header-body`) → -15
7. **Document gets 10x score penalty** (score ÷ 10) — it's a last resort
8. Pick highest-scoring container

### Confirmed SPX container (Jul 2026)

```
⭐ CHOSEN div.ssc-table-body.ssc-table-show-header
  score=580 rows=25 SPXMY=true penalty=0
  source=parent L3 matched ".ant-table"
```

## Eye Icon Click Pipeline (v2.9 — 5-method A-E)

### `isProbablyClickable()` — expanded heuristics

Returns true if ANY of these conditions match:
1. Tag is `button` or `a`
2. `role` attribute matches `button|link`
3. `tabindex` attribute exists
4. `onclick` attribute exists
5. Computed `cursor === 'pointer'`
6. className matches `/btn|button|icon|action|click|show|reveal|toggle|view/i`
7. Element has child SVG AND is `span`/`div`/`i` with pointer cursor or tabindex
8. `aria-label` or `title` contains `show|reveal|view|phone`
9. Has `data-action`, `data-testid`, or `data-icon` attributes

### `normalizeClickable()` — climb 10 levels

- Start at raw element, climb `parentElement` up to 10 levels
- Prefer non-td/tr/table ancestors unless they are explicitly clickable (pointer cursor, onclick, tabindex)
- If TD/TR/TABLE matches `isProbablyClickable()` ONLY by class regex (not cursor/onclick/tabindex), skip and keep climbing
- Return first true clickable ancestor, or fall back to raw element

### `triggerEyeClick()` — 5-method pipeline

```
A: normalizedEl.click()                    ← works for HTML elements
B: normalizedEl.dispatchEvent(MouseEvent)  ← works for SVG/wrappers (CONFIRMED SUCCESS on SPX)
C: normalizedEl — mousedown + mouseup + click sequence
D: rawEl.dispatchEvent(MouseEvent('click'))
E: rawEl — mousedown + mouseup + click sequence
```

**SPX confirmed working method: B** (simple MouseEvent dispatch on normalized/raw element)

### SPX eye icon structure (confirmed)

```
svg.svg-icon.show-icon  (raw match — no .click() method)
  └─ parent: span/div wrapper (no button, no role, no tabindex)
     └─ clickable via: cursor=pointer OR class contains "show"/"icon"
```

## Eye Icon Selector Priority (v2.1 fix, refined in v2.9)

**Problem with v2:** `svg` was the first selector candidate — matched too many generic SVG icons. Combined with wrong column mapping, produced false-positive "phone revealed" results.

**v2.9 refined priority order:**

```javascript
const EYE_SELECTORS = [
    // Priority 1: Explicit aria-labels
    '[aria-label*="show phone" i]',
    '[aria-label*="reveal phone" i]',
    '[aria-label*="show" i]',
    '[aria-label*="reveal" i]',
    // Priority 2: Title attributes
    '[title*="show" i]',
    '[title*="reveal" i]',
    '[title*="view" i]',
    // Priority 3: Role and tabindex
    '[role="button"]',
    '[tabindex]',
    // Priority 4: Eye-related classes
    '.anticon-eye',
    '.anticon-eye-invisible',
    '[class*="eye" i]',
    '[class*="Eye"]',
    '[class*="show" i]',
    '[class*="reveal" i]',
    'i[class*="eye"]',
    'span[class*="eye"]',
    // Priority 5: Container elements with SVG child
    'span:has(svg)',
    'button:has(svg)',
    'div:has(svg)',
    'i:has(svg)',
    // Priority 6: Icon buttons
    'button[class*="icon"]:has(svg)',
    'button:has(svg[class*="eye" i])',
    'button:has([class*="eye" i])',
    // Priority 7: Raw SVG — LAST resort
    'svg',
];
```

**Key rule:** `svg` is always LAST. It matches every icon on the page and should never be the primary selector for eye icon detection. The `findEyeIcon()` function also searches the phone cell specifically before falling back to the entire row — more precise targeting.

## v3.0 Export Features (in-memory, NO backend)

### `window.__spx_poc_results` — result store

- Initialized as `[]` at script load
- Cleared at start of each `runPoC()` call
- Populated per-row after validation passes:
  - **Already clear phones:** `{ tracking, name, phone, status, rowIndex, revealed: false }`
  - **Successfully revealed:** `{ tracking, name, phone: phoneAfter, status, rowIndex, revealed: true }`
  - Skipped rows (invalid tracking/name/phone) are NOT pushed

### Export functions

```javascript
__spx_poc_dump_json()  // Pretty-prints JSON array to console
__spx_poc_dump_csv()   // Prints CSV with header row: tracking,name,phone,status,revealed
                        // CSV escape: commas/quotes wrapped in double quotes, newlines → spaces
```

### Summary line (after runPoC completes)

```
Stored results: 10 records in window.__spx_poc_results
Use __spx_poc_dump_json() or __spx_poc_dump_csv() to export
```

## Tampermonkey Metadata Best Practices

### For PoC scripts (no GM_ APIs needed):
```javascript
// @grant        none
```

### For production agents (GM_xmlhttpRequest, GM_setValue, etc.):
```javascript
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
```

### @namespace — plain string only
```javascript
// @namespace    https://hafjet.my
```
**PITFALL:** Telegram auto-renders bare URLs as clickable `[links](url)`. When copy-pasting from Telegram code blocks, the rendered link markup can leak into the Tampermonkey editor. Solution:
1. **Preferred:** Deliver as `.user.js` file attachment (zero formatting leak)
2. **Fallback:** Use `Ctrl+Shift+V` (paste as plain text) in Tampermonkey
3. **Alternative:** Save as `.txt` file → rename to `.user.js` → import

### File delivery on Telegram
- `MEDIA:/path/to/file.user.js` — does NOT reliably deliver .user.js files
- `MEDIA:/path/to/file.txt` — works for .txt extension (rename after download)
- Use the `telegram-file-delivery` skill: copy to `~/.hermes/cache/documents/name.txt` → send via `MEDIA:`
- All files should be written to `~/.hermes/whatsapp-bot/` for local access

## `patch` Tool Pitfall — Missing `path` Parameter

When using `patch` tool with `mode='replace'`, ALL three parameters are required:
- `path` — absolute file path
- `old_string` — exact text to find
- `new_string` — replacement text

**Common mistake:** Using `patch` parameter (which is for `mode='patch'` format) instead of `old_string`/`new_string` (which are for `mode='replace'`). This produces "path required" errors repeatedly.

**Fix:** Always verify parameter names match the mode:
- `mode='replace'` → needs `path`, `old_string`, `new_string`
- `mode='patch'` → needs `patch` (V4A format)

## `scoreHeaderRow()` Typo Bug (v2.8 crash, fixed v2.9)

**Symptoms:** `ReferenceError: cels is not defined` at STEP 1.

**Root cause:** Variable `cels` used instead of `cells` in the `for` loop:
```javascript
// BROKEN (v2.8):
for (let i = 0; i < cels.length; i++) {  // ← typo: cels
// FIXED (v2.9):
for (let i = 0; i < cells.length; i++) {  // ← correct: cells
```

**Lesson:** When iterating `cells` variable, always verify the loop variable matches. This is a common copy-paste typo that crashes the entire script at STEP 1.

## User Feedback Patterns (Jul 2026)

| User said | Meaning / Action |
|-----------|-----------------|
| "Jangan proceed full deployment dulu" | Stop. Verify current layer. Do NOT jump ahead. |
| "Saya nak awak buat 2 perkara dulu" | Sequential approval gates. Complete task 1 → report → wait for OK → task 2. |
| "Beri saya versi PoC v2 penuh dalam satu blok code" | Full file, not diff. Ready to copy-paste. |
| "hantar sebagai fail .user.js" | Send file attachment, not code block. Telegram formatting corrupts metadata lines. |
| "Masih salah pada metadata" | Check for Telegram link rendering in code block. Use plain string. |
| "Jangan ada [ ] ( ) langsung" | User saw Telegram-rendered markdown link in code. Fix: file delivery or plain-text paste. |
| "save skil hantar fail nie" | Create a skill for the file-delivery pattern (done: `telegram-file-delivery`) |

## Selector Tuning After SPX Portal Changes

When SPX updates their portal UI:

1. Run `__spx_poc_debug()` first — this dumps ALL tables scored, ALL eye candidates, ALL buttons
2. Check `[1] Tables (scored + getDataRows test)` — find the correct table's header keywords
3. Update `COLUMN_PATTERNS` with the exact header text from SPX
4. Check `[2] Eye icon + ancestor chain` — which selector finds eye icons?
5. Reorder `EYE_SELECTORS` to put the best match first
6. Run `__spx_poc_run(5)` — verify all 5 rows pass validation + phone reveal
7. Only then proceed to full agent deployment

## Deep Ancestor Debug (v2.8+)

`debugAncestors(el)` logs the full ancestor chain for the raw eye icon:
```
L0 svg.svg-icon.show-icon | cursor="default" | tabindex="null" | role="" | onclick=false | clickable=false
L1 span.show-icon-wrapper | cursor="pointer" | tabindex="0" | role="button" | onclick=false | clickable=TRUE ✅
L2 td.phone-cell | cursor="default" | tabindex="null" | role="" | onclick=false | clickable=false
```

This fires only on the FIRST masked row during `runPoC()` — not repeated for every row. Use this output to verify `isProbablyClickable()` is detecting the correct wrapper.