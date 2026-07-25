# SPX PoC Iteration History (v2.1 → Production)

Session: 2026-07-25. Each version fixed a specific runtime failure on real SPX portal DOM.

## Version Changelog

### v2.1 — Header-Based Column Mapping
- **Fix**: v1 used `td:nth-child(N)` which picked wrong columns (name read tracking, phone read tracking digits)
- **Approach**: Read `<thead>` → keyword-match each header cell → store column index → extract cell by that index
- **Status**: Column mapping confirmed working (tracking=col1, name=col3, phone=col4, status=col12)

### v2.2 — Multi-Selector Row Extraction (Early Break Bug)
- **Bug**: `getDataRows()` broke on first selector returning >0 rows — sometimes that was just the header row
- **Fix**: Try ALL selectors, collect all matches, deduplicate
- **Status**: Still 0 data rows — header row was the only `tr` inside the table

### v2.3 — No Early Break (Still Fails)
- **Bug**: All selectors scoped to `table.querySelectorAll()` return 0 (header only)
- **Root cause**: SPX renders header in `<table>` but data rows in a separate virtualized container

### v2.4 — Unscoped Container Search
- **Fix**: `findContainer()` walks up from table to parent/closest container, searches there
- **Bug**: Returns first matched container — picks `div.ssc-table-header-scroll-bar-wrapper` (header-only wrapper)
- **Status**: All row selectors inside chosen container return 0

### v2.5 — Container Scoring
- **Fix**: Score ALL candidate containers, penalize header/scroll-bar classes
- **Crash**: `shortTag(document)` → `document.tagName` is `undefined` → `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`

### v2.6 — Crash Fix (shortTag + addCandidate Hardening)
- **Fix**: `shortTag()` handles `document`, `window`, undefined `tagName`
- **Fix**: `addCandidate()` rejects non-element nodes except `document`
- **Status**: Container selection, row extraction, eye detection all working
- **Crash**: `svg.click()` → `TypeError: not a function`

### v2.7 — Click Normalization (Semantic Selectors)
- **Fix**: `normalizeClickable()` climbs to nearest `button`/`a`/`[role=button]`/`.ant-btn`
- **Failure**: SPX eye icon wrapper is non-semantic `<span>` with `cursor:pointer` — no semantic attributes
- **Result**: normalizeClickable returns raw SVG, crash persists

### v2.8 — Heuristic Clickable + Synthetic Dispatch
- **Fix**: `isProbablyClickable()` uses computed `cursor:pointer`, class regex, role, tabindex, onclick
- **Fix**: Climb 10 levels (not 5)
- **Fix**: Fallback `dispatchEvent(new MouseEvent('click'))` if no clickable ancestor
- **Fix**: Document score ÷10 penalty — prevents document from winning over real div containers
- **Status**: Awaiting Tuan's test on real SPX portal

### v2.9 — 5-Method Click Pipeline + `cels` Typo Fix
- **Crash**: `cels is not defined` in `scoreHeaderRow()` — typo from v2.8
- **Fix**: `cells.length` (not `cels`)
- **New**: `triggerEyeClick()` A-E pipeline: .click→MouseEvent→mousedown+mouseup+click on normalized → same on raw SVG
- **New**: Restructured EYE_SELECTORS priority: aria-label→title→role→tabindex→eye-class→span/button/div:has(svg)→svg
- **New**: Refined container penalties — "show-header" not auto-penalized; HEADER_HARD_PENALTY list
- **Result**: ✅ 10/10 phones revealed with method B on real SPX portal

### v3.0 — In-Memory Results Store + Console Export
- **New**: `window.__spx_poc_results = []` cleared at start of each `runPoC()`
- **New**: `__spx_poc_dump_json()` / `__spx_poc_dump_csv()` — print to console
- **Push gates**: already-clear rows (`revealed:false`) + revealed rows (`revealed:true`, phone=phoneAfter)
- Skipped/invalid rows never pushed
- SUMMARY shows "Stored results: X records"
- **Status**: ✅ UAT PASSED

### v3.1 — Status Filter + Dedupe + Clipboard
- **New**: `__spx_poc_run({limit:10, status:"Ready", dedupe:true})` — options object, backward-compatible with number
- **Status filter**: applied before validation; `totalFilteredOut` in SUMMARY
- **Dedupe**: `seenTrackings` Set — blocks push but NOT reveal; `[DEDUPE]` log when duplicate skipped
- **Clipboard**: `__spx_poc_copy_json()` / `__spx_poc_copy_csv()` via `navigator.clipboard` + `execCommand` fallback
- **Status**: ✅ UAT PASSED

### Production — Full Auto-Scan + Backend POST
- **File**: `spx_phone_agent.user.js` (1,067 lines / 47 KB)
- `CONFIG` section: BACKEND_URL, BACKEND_HEADERS, AUTO_RUN, SCAN_INTERVAL, PUSH_MODE, DEDUPE_KEY
- Auto-start on page load + periodic scan via `setInterval` + `MutationObserver`
- `GM_xmlhttpRequest` POST with retry count + exponential delay
- Delta push mode: new + changed rows only
- State tracking: scanCount, totalProcessed, totalRevealed, totalPosted, errors[]
- Visual badge overlay (bottom-right): status, scans, rows, posted, last error
- Global commands: `__spx_run_once`, `__spx_start_auto`, `__spx_stop_auto`, `__spx_test_post`
- **Backend**: `spx_followup.py` (207 lines) — `determine_followup()` with status-based mapping + date fallback

## Key Debugging Principle

Each version produced console output that revealed the NEXT failure:
1. v2.1: "Name baca tracking number" → column mapping wrong
2. v2.2: "Data rows: 0" → selectors scoped to table only find header `tr`
3. v2.4: "Container: div.ssc-table-header-scroll-bar-wrapper" → first-match picks header wrapper
4. v2.5: Crash before showing scores → document.tagName undefined
5. v2.6: "svg.click is not a function" → SVG elements lack HTMLElement.click()
6. v2.7: "normalized up from raw = false" → no semantic clickable ancestor found
7. v2.8→v2.9: "cels is not defined" → typo in loop variable
8. v3.0: Export needed after successful PoC → result store pattern
9. v3.1: Status filtering + clipboard → options object pattern

**Lesson**: Console debug output is the primary debugging tool for Tampermonkey PoC scripts. Each iteration must log enough state to diagnose the next failure without needing to add new logging.