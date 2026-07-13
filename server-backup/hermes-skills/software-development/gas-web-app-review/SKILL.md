---
name: gas-web-app-review
description: >-
  Review, debug, and fix Google Apps Script Web Apps (code.gs + HTML) for
  business dashboard systems. Covers structured analysis, common GAS pitfalls,
  stub-first approach for missing server functions, and targeted HTML patching
  over full rewrites. Use whenever the user needs help stabilising a GAS Web App
  with inconsistent code quality, silent errors, or broken UI.
domain: software-development
tags:
  - google-apps-script
  - gas
  - web-app
  - code-review
  - debugging
  - dashboard
trigger: >-
  User shares code.gs and/or WebApp.html files, mentions 'Google Apps Script',
  'GAS Web App', 'dashboard tak jalan', or asks to fix/debug/improve a GAS
  project.
version: "1.2"
created: 2026-07-13
author: hermes
---

# Google Apps Script Web App Review & Fix

## Overview

This skill defines the workflow for reviewing, debugging, and fixing Google Apps Script
Web Apps — specifically business dashboard systems with `code.gs` (server) and
`WebApp.html` (client). It prioritises **stability, clear error handling, and minimal
destructive changes** to existing layout/styling.

---

## Workflow: Structured A→B→C→D Analysis

When the user shares GAS code, follow these four sections in order:

### A. Ringkasan Aplikasi + 5–10 Isu Utama
1. Read both files completely.
2. Write one paragraph summarising what the app does.
3. List 5–10 bugs and design flaws in bullet format with **exact line references**.
4. Categorise each issue: `KRITIKAL` (app won't run), `SEDERHANA` (UX broken),
   `RINGAN` (maintainability).

### B. Cadangan Pembaikan Berstruktur
Organise by priority:
1. **Bug kritikal** — app cannot function at all
2. **Bug UX** — data not rendering, silent errors
3. **Refactor** — maintainability improvements (function naming, constants ordering)

Each issue must include:
- What the problem is
- Why it's problematic specifically in GAS Web App context
- Specific code fix with concrete examples (not generic snippets)

### C. Fixed Code
- Write the full fixed `code.gs` (or complete patches for `WebApp.html`)
- Use **constants-first** ordering: all `const` declarations at the top of `code.gs`,
  before any function that depends on them
- For missing server functions called by the frontend, write **stubs** with a
  consistent return format (see §Stub Pattern)
- For HTML fixes, prefer **`patch` tool** over full rewrites when the file is very
  large (>1000 lines) and mostly working
- Preserve existing CSS classes, layout structure, and colour scheme — only change
  what's needed for stability

### D. Debugging Guideline
Give the user practical steps:
1. How to use `Logger.log` and debug mode in Apps Script editor
2. How to check browser Console for HTML/JS errors
3. How to write `test*()` functions in code.gs to simulate frontend calls
4. A quick-fail decision tree for common dashboard-empty scenarios

---

## Advanced GAS Patterns

### Dual-Structure Reading (normalizeTransactions)

When *reading* from a sheet that may have evolved, the normalizer must detect which structure is in use:

```javascript
function normalizeTransactions(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(function(r) {
    var amountIn, amountOut;
    if (r['Amaun'] !== undefined) {
      // New structure: single 'Amaun' column — derive masuk/keluar from type
      var amt = safeNumber(r['Amaun']);
      var t = r['Jenis'] || r['Type'] || '';
      amountIn = t.toLowerCase() === 'masuk' ? amt : 0;
      amountOut = t.toLowerCase() === 'keluar' ? amt : 0;
    } else {
      // Old structure: split 'Amaun Masuk' / 'Amaun Keluar' columns
      amountIn  = safeNumber(r['Amaun Masuk'] || r['Masuk'] || r['amountIn'] || r['Income']);
      amountOut = safeNumber(r['Amaun Keluar'] || r['Keluar'] || r['amountOut'] || r['Expense']);
    }

    return {
      id:            r['ID'] || '',
      date:          r['Tarikh'] || r['Date'] || '',
      type:          r['Jenis'] || r['Type'] || '',
      category:      r['Kategori'] || r['Category'] || '',
      details:       r['Butiran'] || r['Details'] || r['Keterangan'] || '',
      amountIn:      amountIn,
      amountOut:     amountOut,
      amount:        amountIn || amountOut,  // Single display value
      attachmentUrl: r['Pautan Lampiran'] || r['Lampiran'] || '',
      attachmentId:  r['ID Lampiran'] || '',
      source:        r['Sumber'] || r['Source'] || '',
      status:        ((r['Status'] || '').toLowerCase() || 'active')   // 'deleted', 'active', or ''
    };
  });
}
```

**Key checks:**
- `r['Amaun'] !== undefined` — new structure has a single 'Amaun' key
- `r['Amaun Masuk']` — old structure has split columns
- The `source` field is new; if the column doesn't exist, it defaults to `''`

This pairs with the **Dynamic Header Mapping** writer (below) — both are needed for backward-compatible sheet evolution.

### Dynamic Header Mapping (Sheet Evolution Safety)

When a GAS app writes rows to a sheet whose structure may evolve over time, **never hardcode column indices**. Read the headers dynamically and map values by header name:

```javascript
function writeToSheet(data) {
  var sheet = getSheet('Transaksi');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var cleanHeaders = headers.map(function(h) { return String(h).trim(); });

  var rowData = cleanHeaders.map(function(header) {
    switch (header) {
      case 'ID':       return generateId();
      case 'Amaun':    return data.amount;         // new structure
      case 'Amaun Masuk': return data.type === 'Masuk' ? data.amount : 0;  // old structure
      case 'Sumber':   return data.source;
      default:         return '';
    }
  });
  sheet.appendRow(rowData);
}
```

**Why it matters:** The same `saveTransaction()` function writes correctly whether the sheet has the old 9-column structure (Amaun Masuk / Amaun Keluar + attachment columns) or the new 7-column structure (single Amaun + Sumber). No migration script needed — the code adapts.

### Date Normalization (_normalizeDate)

When reading dates from Google Sheets, the raw value can be:
- A **JavaScript Date object** (when column is formatted as date in Sheets)
- A **string** like `"Thu Sep 11 2025 00:00:00 GMT+0800 (Singapore Standard Time)"` (auto-converted by `getValues()`)
- A **YYYY-MM-DD string** (when written by the app itself)

**Never compare raw dates with string comparisons.** Normalize everything to YYYY-MM-DD first:

```javascript
function _normalizeDate(raw) {
  if (!raw) return '';
  var tz = (SpreadsheetApp && SpreadsheetApp.getActiveSpreadsheet)
    ? SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()
    : Session.getScriptTimeZone();

  if (raw instanceof Date) return toYMD(raw, tz);

  if (typeof raw === 'string') {
    var s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var cleaned = s.replace(/\s*\([^)]*\)/g, '');  // Strip "(Singapore Standard Time)"
    var d = new Date(cleaned);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    Logger.log('_normalizeDate: FAILED to parse "' + raw + '"');
  }
  return String(raw);
}
```

**Use `getSpreadsheetTimeZone()`** over `Session.getScriptTimeZone()` — the spreadsheet timezone is the source of truth for stored dates. The two can differ if the script editor has a different timezone setting.

**Apply in the normalizer, not at filter time:** Call `_normalizeDate` once in `normalizeTransactions()` so every downstream consumer (dashboard, P&L, export) gets consistent YYYY-MM-DD strings:

```javascript
function normalizeTransactions(rows) {
  return rows.map(function(r) {
    return {
      date: _normalizeDate(r['Tarikh'] || r['Date'] || ''),
      // ... other fields
    };
  });
}
```

Once dates are YYYY-MM-DD strings, **lexicographic comparison** (`>=`, `<=`) works correctly for date filtering (because YYYY-MM-DD sorts chronologically as strings).

All server functions called from `google.script.run` should return a consistent shape:

```javascript
// Success
{ status: 'success', message: 'Transaksi berjaya disimpan.', data: { ... }, errorCode: null }

// Validation failure
{ status: 'error', message: 'Amaun tidak sah.', data: null, errorCode: 'VALIDATION_ERROR' }

// Server/sheet failure
{ status: 'error', message: 'Ralat: gagal buka sheet.', data: null, errorCode: 'SHEET_ERROR' }
```

**Frontend handler:**
```javascript
google.script.run
  .withSuccessHandler(function(result) {
    if (result && result.status === 'success') {
      showNotification(result.message, 'success');
      refreshData();
    } else {
      showNotification((result && result.message) || 'Gagal.', 'error');
    }
  })
  .withFailureHandler(function(error) {
    // Unexpected errors (network, permissions, runtime) — not validation
    showNotification('Ralat server: ' + error.message, 'error');
  })
  .saveTransaction(payload);
```

This separates **expected errors** (validation — returned as `status:'error'`) from **unexpected errors** (runtime — caught by `withFailureHandler`). The `errorCode` field enables programmatic handling (e.g., auto-focus the invalid field).

### `withLock` Concurrency for Writes

When both the **Telegram Bot** and **Web App Dashboard** can write to the same sheet simultaneously, use `LockService`:

```javascript
var result = withLock(function() {
  var sheet = getSheet(SHEETS.TRANSACTIONS);
  var id = _generateTransactionId(sheet);  // inside lock — prevents duplicate IDs
  sheet.appendRow(buildRow(id, data));
  SpreadsheetApp.flush();  // ← commit before releasing lock
  return { id: id, ... };
});
```

**`SpreadsheetApp.flush()` — why inside the lock:** When another concurrent request acquires the lock immediately after release, it needs to see the committed state. `setValue()`, `appendRow()`, and other sheet mutations are queued by GAS and may not be written before `releaseLock()` runs. `flush()` forces all pending changes to the sheet **while the lock is still held**, ensuring the next request sees the latest data.

```javascript
  // In withLock callback, after write:
  sheet.getRange(rowIndex, statusCol).setValue('Deleted');
  SpreadsheetApp.flush();  // ← critical — commit before lock release
  return { found: true, alreadyDeleted: false, id: normalizedId };
```

The `withLock` helper (defined in code.gs) MUST use `waitLock()` with a proper `try/catch/finally` so `releaseLock()` is always called even on error:

```javascript
function withLock(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  timeoutMs = timeoutMs || 10000;  // default 10 seconds
  try {
    lock.waitLock(timeoutMs);      // throws if lock not acquired in time
    return fn();
  } catch (e) {
    Logger.log('withLock: Gagal dapatkan lock dalam ' + timeoutMs + 'ms');
    throw new Error('Sistem sibuk. Cuba sebentar lagi.');
  } finally {
    lock.releaseLock();  // ALWAYS runs — even if fn() threw
  }
}
```

**Why `waitLock` over `tryLock`:** `tryLock()` returns `false` on failure but continues execution, meaning the function runs WITHOUT the lock. `waitLock()` throws — the catch block provides a clear user-facing message, and `finally` guarantees cleanup.

**Critical:** Call ID generation *inside* the locked block — otherwise two concurrent requests could generate the same ID.

### Soft Delete Pattern (Safe Delete, Not deleteRow)

Use **soft delete** (set a `Status` column to `'Deleted'`) instead of `sheet.deleteRow()`:

```javascript
function deleteTransaction(id) {
  var normalizedId = String(id).trim();
  if (!normalizedId) {
    return { status: 'error', errorCode: 'VALIDATION_ERROR', message: 'ID transaksi diperlukan.', data: null };
  }

  var result = withLock(function() {
    var sheet = getSheet(SHEETS.TRANSACTIONS);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var cleanHeaders = headers.map(function(h) { return String(h == null ? '' : h).trim(); });

    var idColIndex = cleanHeaders.indexOf('ID');
    if (idColIndex === -1) throw new Error('Column ID tidak dijumpai.');

    var idColValues = sheet.getRange(2, idColIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    for (var rowOffset = 0; rowOffset < idColValues.length; rowOffset++) {
      if (String(idColValues[rowOffset][0] || '').trim() === normalizedId) {
        var statusCol = _ensureColumnExists(sheet, 'Status');

        // Idempotent check: already deleted?
        var currentStatus = String(sheet.getRange(rowOffset + 2, statusCol).getValue() || 'Active')
          .trim()
          .toLowerCase();
        if (currentStatus === 'deleted') {
          return { found: true, alreadyDeleted: true, id: normalizedId };
        }

        sheet.getRange(rowOffset + 2, statusCol).setValue('Deleted');
        return { found: true, alreadyDeleted: false, id: normalizedId };
      }
    }
    return { found: false };
  });

  if (!result.found) {
    return { status: 'error', errorCode: 'NOT_FOUND', message: 'Transaksi tidak ditemui', data: null };
  }
  if (result.alreadyDeleted) {
    return { status: 'success', message: 'Transaksi sudah dipadam sebelum ini', data: { id: normalizedId, alreadyDeleted: true }, errorCode: null };
  }
  return { status: 'success', message: 'Transaksi dipadam', data: { id: normalizedId } };
}
```

**Key idempotent check:** The `|| 'Active'` default ensures rows created before the Status column existed are treated as active (not deleted). The second call to `deleteTransaction` with the same ID returns `{ alreadyDeleted: true }` — no sheet write occurs on the second call.

**Why soft delete:**
- Data audit trail — transaksi tidak hilang dari sheet
- Boleh undo nanti (set semula Status kosong)
- Pautan invois/kenalan tidak patah
- Dashboard filter otomatik (lihat §Filtering Soft-Deleted Transactions)

**Column auto-creation helper:**
```javascript
function _ensureColumnExists(sheet, columnName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === columnName) return i + 1;
  }
  var colIndex = headers.length + 1;
  sheet.getRange(1, colIndex).setValue(columnName);
  sheet.getRange(1, colIndex).setFontWeight('bold');
  return colIndex;
}
```

### Filtering Soft-Deleted Transactions

When reading data for the dashboard or reports, filter out soft-deleted records:

```javascript
// In getInitialData:
payload.transactions = normalizeTransactions(ensureArray(getDataFromSheet(SHEETS.TRANSACTIONS)))
  .filter(function(t) { return t.status !== 'deleted'; });

// In generatePnl:
var rows = normalizeTransactions(ensureArray(getDataFromSheet(SHEETS.TRANSACTIONS)))
  .filter(function(t) { return t.status !== 'deleted'; });
```

The `normalizeTransactions` function must include the `status` field:
```javascript
return {
  // ... other fields
  status: (r['Status'] || '').toLowerCase()
};
```

### P&L Report Generation (generatePnl)

Used when the dashboard needs an **Untung & Rugi** report from transaction data. Supports monthly, yearly, and custom date-range modes.

**Input format (period options):**
```javascript
// String formats (legacy frontend compatibility):
generatePnl('yearly')              // Current year
generatePnl('2026-07')            // Specific month

// Object format (new):
generatePnl({ mode: 'monthly', year: 2026, month: 7 })
generatePnl({ mode: 'yearly', year: 2026 })
generatePnl({ startDate: '2026-01-01', endDate: '2026-06-30' })
```

**Output structure:**
```javascript
{
  status: 'success',
  message: 'P&L — Revenue: RM X.XX, Expense: RM Y.YY, Net: RM Z.ZZ',
  data: {
    period: { mode: 'monthly'|'yearly'|'custom', year, month, startDate, endDate },
    totals: { revenue, expense, netProfit },
    breakdownByCategory: [{ category, revenue, expense, net }],
    breakdownByMonth: [{ year, month, label, revenue, expense, netProfit }],
    rawCount: { totalTransactions, incomeTransactions, expenseTransactions }
  },
  errorCode: null
}
```

**Core calculation logic:**
1. Parse period → opts `{ mode, year, month, startDate, endDate }`
2. Determine date range from opts
3. Read sheet → `normalizeTransactions()` → `.filter(t => t.status !== 'deleted')`
4. Filter by date range: `startDate <= date <= endDate` (YYYY-MM-DD string comparison works after normalization)
5. Sum: revenue = sum(Masuk amounts), expense = sum(Keluar amounts)
6. Group by category for `breakdownByCategory`
7. If yearly/custom: group by month for `breakdownByMonth`; **pre-fill 12 months** even when empty so chart x-axis is continuous
8. Round all monetary values: `Math.round(val * 100) / 100`
9. Return `{ status, message, data: PnlData, errorCode }`

**Key rules:** Masuk = Revenue, Keluar = Expense. `NO_DATA` error if zero transactions match. `VALIDATION_ERROR` for invalid month/year.

### P&L Frontend Rendering (Chart.js + KPI Cards)

Fetch data via `google.script.run.generatePnl(opts)` and render with Chart.js (loaded from CDN).

**Flow:** Tab click → `fetchProfitLossData()` → convert current filter to periodOptions → server call → render KPI cards, bar chart, category table, expense doughnut.

**Filter-to-periodOptions mapping** — reuse existing filter system, no separate P&L filter:
```javascript
function getPnLPeriodOptions() {
  var range = getDateRange(state.currentDateFilter);
  if (!range) return { mode: 'yearly', year: new Date().getFullYear() };
  var s = _ymd(range.start), e = _ymd(range.end);
  if (s.substring(0,7) === e.substring(0,7))
    return { mode: 'monthly', year: +s.split('-')[0], month: +s.split('-')[1] };
  if (s.substring(5) === '01-01' && e.substring(5) === '12-31')
    return { mode: 'yearly', year: +s.split('-')[0] };
  return { mode: 'custom', startDate: s, endDate: e };
}
```

**KPI Cards** — 3 cards in a row: Revenue (green), Expense (orange), Net Profit (green if ≥0, red if <0). Use server-calculated totals, not local aggregation.

**Monthly Bar Chart** — Grouped bar (Revenue + Expense per month) + optional Net Profit line:
```javascript
new Chart(ctx, { type: 'bar',
  data: { labels: months.map(m=>m.label), datasets: [
    { label:'Pendapatan', data:r, backgroundColor:'rgba(34,197,94,0.75)', order:2 },
    { label:'Perbelanjaan', data:e, backgroundColor:'rgba(239,68,68,0.75)', order:2 },
    { label:'Untung Bersih', data:n, type:'line',
      pointBackgroundColor: n.map(v=>v>=0?'#22C55E':'#EF4444'), tension:0.3, fill:true, order:1 }
  ]},
  options: { responsive:true, maintainAspectRatio:false,
    scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>'RM'+v.toFixed(0) } } } }
});
```

**Category Table** — Columns: Kategori | Pendapatan | Perbelanjaan | Bersih. Sorted by |net| descending.

**Expense Doughnut** — Filter to categories with expense > 0, Top 8 + Lain-lain:
```javascript
var items = categories.filter(c=>c.expense>0).sort((a,b)=>b.expense-a.expense);
var top8 = items.slice(0,8);
var other = items.slice(8).reduce((s,c)=>s+c.expense,0);
```
Colour palette `['#EF4444','#F97316','#EAB308','#22C55E','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#6B7280']`, `type:'doughnut'`, `cutout:'55%'`. Tooltip shows RM + percentage.

**Chart cleanup** — destroy old instances before creating new ones to prevent canvas conflicts:
```javascript
var plCharts = { monthly:null, expensePie:null };
function destroyPnlCharts() {
  if (plCharts.monthly) { plCharts.monthly.destroy(); plCharts.monthly = null; }
  if (plCharts.expensePie) { plCharts.expensePie.destroy(); plCharts.expensePie = null; }
}
```

**⚠️ Canvas preservation for empty states — CRITICAL:** When the chart has no data to display, do NOT replace the parent element's `innerHTML` with a text message. That destroys the `<canvas>` element, and when data arrives on a subsequent call, `document.getElementById('pl-monthly-chart')` returns `null`.

**❌ BAD — destroys canvas:**
```javascript
canvas.parentElement.innerHTML = '<p>Tiada data</p>';  // canvas is GONE
```

**✅ GOOD — toggle visibility:**
```javascript
// HTML: add an empty-text sibling next to the canvas
<div class="chart-container" style="height:320px; position:relative;">
  <canvas id="pl-monthly-chart"></canvas>
  <p id="pl-monthly-empty" class="text-sm text-gray-500 text-center py-8" style="display:none;">Tiada data.</p>
</div>

// JS: toggle display between canvas and empty text
function _renderPnLMonthlyChart(months) {
  var canvas = document.getElementById('pl-monthly-chart');
  var emptyText = document.getElementById('pl-monthly-empty');
  destroyPnlCharts();

  if (!months || months.length === 0) {
    canvas.style.display = 'none';
    if (emptyText) emptyText.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyText) emptyText.style.display = 'none';
  // ... create chart normally
}
```

Same pattern applies to the expense doughnut canvas. The empty state functions (`_showPnLEmpty`) must toggle `style.display` on canvas/empty-text pairs, never replace `innerHTML` on parents.

**Error handling:** Loading overlay → NO_DATA empty state → server-error red banner (withFailureHandler) → unexpected-response banner.

**Activation:** Fetch only when tab is active:
```javascript
// In showPage():
else if (pageId === 'profit-loss') { fetchProfitLossData(); }
// In renderProfitLossSection() (called by renderAll on filter change):
function renderProfitLossSection() {
  if (document.getElementById('profit-loss').classList.contains('active')) fetchProfitLossData();
}
```

### `_generateTransactionId` (Sequential ID Generator)

```javascript
function _generateTransactionId(sheet) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var prefix = 'TX-' + today + '-';
  var maxNum = 0;

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < idColumn.length; i++) {
      var existingId = String(idColumn[i][0] || '');
      if (existingId.startsWith(prefix)) {
        var num = parseInt(existingId.substring(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  }
  return prefix + String(maxNum + 1).padStart(4, '0');
}
```

**Key:** Only scan column A (ID column) — not the full row. Must be called inside `withLock`.

### Test Functions with Auto-Undo

For GAS functions that modify sheet data (delete, update), always provide a test function that **reverts its changes** so repeated runs don't accumulate:

```javascript
function testDeleteTransaction() {
  // Test 1: Invalid/non-existent ID → expect NOT_FOUND
  Logger.log('=== INVALID ID ===');
  Logger.log(JSON.stringify(deleteTransaction('INVALID-ID-XXX-999'), null, 2));

  // Test 2: Valid ID — find an active transaction
  Logger.log('=== VALID ID ===');
  var data = getDataFromSheet(SHEETS.TRANSACTIONS);
  var validId = null;
  for (var i = data.length - 1; i >= 0; i--) {
    if ((data[i]['Status'] || '') !== 'Deleted' && data[i]['ID']) {
      validId = data[i]['ID']; break;
    }
  }
  var result2 = deleteTransaction(validId);
  Logger.log(JSON.stringify(result2, null, 2));

  // Test 3: Same ID again — expect alreadyDeleted (BEFORE undo)
  Logger.log('=== ALREADY DELETED ===');
  Logger.log(JSON.stringify(deleteTransaction(validId), null, 2));

  // UNDO: clear status so test can run again
  if (result2.status === 'success') {
    var sheet = getSheet(SHEETS.TRANSACTIONS);
    var statusCol = _ensureColumnExists(sheet, 'Status');
    var rows = sheet.getDataRange().getValues();
    for (var r = 1; r < rows.length; r++) {
      if (rows[r][0] == validId) {
        sheet.getRange(r + 1, statusCol).setValue('');
        Logger.log('✅ Undone: status cleared for ' + validId);
        break;
      }
    }
  }
}
```

**Test ordering matters:** Test the already-deleted case BEFORE the undo, otherwise the third call is a fresh delete (after undo cleared the status), not an idempotent check.

### Date Diagnostic — `testTransactionDateRange()`

When the user reports `generatePnl()` returns `NO_DATA`, the root cause is often **date parsing mismatch** (raw Date objects from Sheets vs YYYY-MM-DD string comparison). Run this diagnostic FIRST:

```javascript
function testTransactionDateRange() {
  var allRows = normalizeTransactions(ensureArray(getDataFromSheet(SHEETS.TRANSACTIONS)));
  var activeRows = allRows.filter(function(t) { return t.status !== 'deleted'; });

  if (!activeRows.length) {
    Logger.log('❌ Tiada transaksi aktif'); return;
  }

  var dates = [];
  var byYear = {};
  activeRows.forEach(function(r) {
    dates.push(r.date);                              // already normalized to YYYY-MM-DD
    var y = (r.date || '').split('-')[0];
    if (y) byYear[y] = (byYear[y] || 0) + 1;
  });
  dates.sort();

  Logger.log('📅 Min date: ' + (dates[0] || 'N/A'));
  Logger.log('📅 Max date: ' + (dates[dates.length - 1] || 'N/A'));
  Logger.log('📊 Count by year: ' + JSON.stringify(byYear));

  // 5 sample rows with parsed date + raw values
  Logger.log('📋 5 sample transaksi (active):');
  for (var i = 0; i < Math.min(5, activeRows.length); i++) {
    var t = activeRows[i];
    Logger.log('  ' + (i+1) + '. ID=' + t.id + ' date="' + t.date + '" type=' + t.type + ' amount=' + t.amount + ' status=' + t.status);
  }
}
```

**What it catches:**
- **Year mismatch** — data is in 2025 but `generatePnl` was called with 2026
- **Date parsing failure** — `_normalizeDate` returned empty (check sample date strings)
- **Deleted status filtering** — active count matches expected
- **Time zone offset** — if dates shift ±1 day, inspect the UTC vs spreadsheet timezone

Run BEFORE the P&L test to know which year/month to query.

## Validation-First Pattern

Validate all fields **before** accessing any external service (sheet, Drive, API):

```javascript
function saveTransaction(data) {
  // 1. VALIDATE — pure logic, side-effect-free
  var errors = [];
  if (!data.date) errors.push('Tarikh wajib.');
  if (!['Masuk','Keluar'].includes(data.type)) errors.push('Jenis mesti Masuk/Keluar.');
  if (isNaN(parseAmount(data.amount)) || parseAmount(data.amount) <= 0)
    errors.push('Amaun tidak sah.');

  if (errors.length > 0) {
    return { status: 'error', errorCode: 'VALIDATION_ERROR', message: errors.join(' '), data: null };
  }

  // 2. PROCESS — transform/sanitise
  // 3. WRITE — withLock + sheet call
  // 4. RETURN — success shape
}
```

**Why:** If validation fails, we never hit the sheet at all — no partial writes, no `try/catch` pollution for what are really expected failures.

---

## Common GAS Web App Pitfalls

### 1. Constants Placed After Functions Using Them
```javascript
// ❌ BAD: Called before const is evaluated
function doGet() { ... } // uses SPREADSHEET_ID
const SPREADSHEET_ID = '...';

// ✅ GOOD: Constants first
const SPREADSHEET_ID = '...';
function doGet() { ... }
```
While GAS compiles the full file before execution, the ordering confuses developers
and makes debugging harder. Always put constants first.

### 2. Missing `withFailureHandler`
Every `google.script.run` call **must** have `.withFailureHandler()`:
```javascript
google.script.run
  .withSuccessHandler(handleResult)
  .withFailureHandler(function(error) {
    console.error('Server error:', error);
    showNotification('Ralat: ' + error.message, 'error');
  })
  .someFunction(args);
```
Without it, server errors are **silently swallowed** and the UI hangs.

### 3. Frontend Calls Server Functions That Don't Exist
Always cross-reference every `google.script.run.someFunction()` call in WebApp.html
against actual `function someFunction()` definitions in code.gs. This is the #1 source
of silent failures in GAS Web Apps.

### 4. Metric Card Containers Missing from HTML
When JS calls `document.getElementById('some-summary')` and the ID doesn't exist in
the HTML, the function fails silently. Always verify container IDs match between
HTML templates and JS `getElementById()` calls.

### 5. Duplicate Page Visibility Logic
Don't mix `element.style.display` with CSS class toggling:
```javascript
// ❌ BAD: inline style overrides class
section.classList.toggle('active', isTarget);
section.style.display = isTarget ? '' : 'none';  // conflict!

// ✅ GOOD: classList only + CSS handles display
section.classList.toggle('active', isTarget);
```
CSS should handle `.page { display: none; }` and `.page.active { display: block; }`.

---

## Stub Pattern for Missing Server Functions

Use a standard pair of helper functions and return a consistent object shape:

```javascript
function _stubResponse(message) {
  return { status: 'success', message: message || 'Belum dilaksanakan', data: null };
}
function _stubError(message) {
  return { status: 'error', message: message || 'Ralat tidak diketahui', data: null };
}

function saveTransaction(data) {
  try {
    Logger.log('saveTransaction called (stub): ' + JSON.stringify(data));
    return _stubResponse('Fungsi saveTransaction belum ditulis lagi.');
  } catch (e) {
    return _stubError(e.message);
  }
}
```

The frontend checks `result.status === 'success'`, so the stub must return that shape.
For functions that expect additional fields (e.g. `suggestTransactionDetails` needs
`result.details`, `generatePnl` needs `result.report`), include dummy data:

```javascript
function suggestTransactionDetails(type, category, amount) {
  return {
    status: 'success',
    details: 'Transaksi ' + type + ' — RM ' + Number(amount).toFixed(2),
    message: 'Draf (stub).'
  };
}
```

---

## Targeted HTML Patching Strategy

When the WebApp.html file is very large (>2000 lines) and mostly functional:

1. **Do NOT rewrite the whole file** — use the `patch` tool for targeted fixes
2. Identify the specific buggy blocks (debug panel force-show, dead filter systems,
   missing containers)
3. Apply patches one at a time: each patch should be a self-contained fix
4. Always include enough surrounding context for a unique match
5. After all patches, verify the file still ends cleanly (read last 50 lines)

Common patches for GAS HTML:
- Remove forced debug panels (leftover from development)
- Add missing `id` containers for metric cards
- Remove duplicate/dead filter systems
- Fix `showPage()` to use classList only
- Remove dead code calling `window.setupFilters` or `window.rerenderFiltered`

---

## User Preferences (GAS Context)

- Output analysis in **Bahasa Melayu** (clear minimal Malay, keep function names in English)
- **Bullet-friendly**, scannable format — avoid dense paragraphs
- Use **tables** for issue summaries
- Keep **existing layout and styling** — don't restructure HTML just to be tidy
- Ask before making changes that could affect: WhatsApp integration, POS hooks,
  specific Sheet IDs, or existing Telegram bot flows
- When in doubt about a function's purpose, state your guess and ask for confirmation
  before refactoring it

### Code/File Delivery (Telegram/iPhone)

**CRITICAL PREFERENCE (Jul 2026):** When delivering code files (`.gs`, `.html`) to Tuan Hafizi:

1. ✅ **Paste code directly in chat** — use formatted code blocks (```language ... ```) split into logical sections
2. ❌ **Do NOT use MEDIA:/path protocol** — text files do NOT send as downloadable attachments on Telegram
3. ❌ **Do NOT use terminal `cat` output** as primary delivery — the output appears but is hard to copy from mobile
4. ✅ **Reference the VPS file path** — Tuan can run `cat /home/hafizi145/<file>` himself on his terminal if he has access
5. ✅ **Split large files** (>300 lines) into logical sections in separate messages, each self-contained

**Rationale:** Tuan uses iPhone (Safari) and reads Telegram on mobile. Terminal output blocks are hard to copy, and MEDIA protocol only works for images/audio/video on Telegram. Direct code blocks in chat are the most reliable delivery method.

---

## References

- [Google Apps Script Web App Guide](https://developers.google.com/apps-script/guides/web)
- [google.script.run API](https://developers.google.com/apps-script/guides/html/reference/run)
