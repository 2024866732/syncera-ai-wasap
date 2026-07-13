---
name: gas-finance-dashboard
description: Build Google Apps Script (GAS) financial dashboards — CRUD transactions, P&L reports, balance sheet, cash flow — connected to Google Sheets for retail business accounting.
version: 2.0.0
author: Hermes-HAFJET
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [gas, google-apps-script, sheets, accounting, pnl, finance, dashboard, hafjet]
---

# GAS Finance Dashboard

Build transaction management + financial reporting dashboards with Google Apps Script + Google Sheets. Patterns derived from HAFJET accounting system (471 transactions, old/new schema, phone shop retail).

## Core Architecture

```
Google Sheets (Kewangan Hafizi Gadget)
    ↓
GAS Backend (code.gs)
    ├── CRUD: saveTransaction, deleteTransaction (soft delete)
    ├── Reports: generatePnl (periodOptions → PnlData)
    ├── Dashboard: getInitialData(), summary cards
    └── Helpers: normalizeTransactions, withLock, _ensureColumnExists
    ↓
WebApp Frontend (WebApp.html)
    ├── Tables: Aliran Tunai, Kenalan, Invois, Aset
    ├── Report: Tab Untung & Rugi (P&L)
    └── Buttons: Tambah, Padam (soft delete)
```

## Sheet Schema

### Transaksi (required — 7–9 cols)

| Col | Field | Type | Wajib | Nota |
|-----|-------|------|-------|------|
| A | ID | UUID / TX-YYYYMMDD-NNN | ✅ | Unique |
| B | Tarikh | YYYY-MM-DD | ✅ | Cash basis |
| C | Jenis | "Masuk" / "Keluar" | ✅ | |
| D | Kategori | String | ✅ | e.g. Jualan, Gaji |
| E | Butiran | String | ✳️ | Penerangan |
| F | Amaun Masuk / Amaun Keluar | Number | ✅ | OLD STRUCTURE |
| G | Pautan Lampiran | URL | ✳️ | |
| H | ID Lampiran | String | ✳️ | |
| I | Status | "active"/"deleted" | ✳️ | Added by _ensureColumnExists |

**OR** NEW structure: single `Amaun` col (col F) + `Sumber` (col G) + `Status` (col I).

`normalizeTransactions()` handles BOTH dynamically — see below.

## Key Implementation Patterns

### 1. `normalizeTransactions()` — Dynamic Column Mapping

```javascript
function normalizeTransactions(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(function(r) {
    var amountIn, amountOut;
    if (r['Amaun'] !== undefined) {
      // NEW structure: single Amaun col, Jenis determines direction
      var amt = safeNumber(r['Amaun']);
      var t = (r['Jenis'] || '').toLowerCase();
      amountIn  = t === 'masuk' ? amt : 0;
      amountOut = t === 'keluar' ? amt : 0;
    } else {
      // OLD structure: Amaun Masuk + Amaun Keluar cols
      amountIn  = safeNumber(r['Amaun Masuk'] || r['Masuk']);
      amountOut = safeNumber(r['Amaun Keluar'] || r['Keluar']);
    }
    return {
      id: r['ID'] || '',
      date: r['Tarikh'] || r['Date'] || '',
      type: r['Jenis'] || '',
      category: r['Kategori'] || '',
      details: r['Butiran'] || '',
      amountIn: amountIn,
      amountOut: amountOut,
      amount: amountIn || amountOut,
      attachmentUrl: r['Pautan Lampiran'] || '',
      source: r['Sumber'] || '',
      status: ((r['Status'] || '').toLowerCase() || 'active')
    };
  });
}
```

### 2. Safe Lock Service — `withLock()`

```javascript
function withLock(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  timeoutMs = timeoutMs || 10000;
  try {
    lock.waitLock(timeoutMs);   // throws if timeout
    return fn();
  } catch (e) {
    Logger.log('withLock timeout ' + timeoutMs + 'ms');
    throw new Error('Sistem sibuk. Cuba sebentar lagi.');
  } finally {
    lock.releaseLock();
  }
}
```

Use `waitLock` (NOT `tryLock`) so concurrent conflicts throw clear errors.

### 3. Schema Migration — `_ensureColumnExists()`

```javascript
function _ensureColumnExists(sheet, columnName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === columnName) return i + 1;
  }
  // Append at END — never insert mid-sheet
  var colIndex = headers.length + 1;
  sheet.getRange(1, colIndex).setValue(columnName);
  sheet.getRange(1, colIndex).setFontWeight('bold');
  return colIndex;
}
```

### 4. Soft Delete Pattern

```javascript
function deleteTransaction(id) {
  // Validate
  if (!id || String(id).trim() === '') { return NOT_FOUND_RESPONSE; }

  return withLock(function() {
    // Find row by scanning ID col
    // Set Status col to 'Deleted'
    sheet.getRange(rowIndex, statusCol).setValue('Deleted');
    return { found: true, id: id };
  });
  // Return { status: 'success', message: 'Transaksi dipadam', data: { id } }
}
```

**Critical:** `getInitialData()` and `generatePnl()` MUST both `.filter(t => t.status !== 'deleted')` before any calculation.

### 5. P&L Generation — `generatePnl(periodOptions)`

**Input:** `{ mode:'monthly'|'yearly'|'custom', year, month?, startDate?, endDate? }` OR string `'yearly'` / `'2026-07'`.

**Process:**
1. Parse period → date range
2. Read & normalize transactions
3. Filter by date + status != 'deleted'
4. Sum revenue (Jenis=Masuk) vs expense (Jenis=Keluar)
5. Group by category → `breakdownByCategory[]`
6. For yearly: pre-fill ALL 12 months (even empty ones = 0)
7. For custom: only months with data

**Output:**
```json
{
  "status": "success",
  "message": "P&L — Revenue: RM 5000, Expense: RM 3000, Net: RM 2000",
  "data": {
    "period": { "mode": "yearly", "year": 2026, "month": null, "startDate": "2026-01-01", "endDate": "2026-12-31" },
    "totals": { "revenue": 5000, "expense": 3000, "netProfit": 2000 },
    "breakdownByCategory": [
      { "category": "Jualan", "revenue": 4000, "expense": 0, "net": 4000 },
      { "category": "Gaji", "revenue": 0, "expense": 2000, "net": -2000 }
    ],
    "breakdownByMonth": [
      { "year": 2026, "month": 1, "label": "Jan 26", "revenue": 500, "expense": 400, "netProfit": 100 }
    ],
    "rawCount": { "totalTransactions": 471, "incomeTransactions": 320, "expenseTransactions": 151 }
  },
  "errorCode": null
}
```

**Yearly rule:** `breakdownByMonth` MUST have all 12 months (Jan–Dec, 0-fill) so chart/UI doesn't skip months.

### 6. Safe Number Handling

```javascript
function safeNumber(n) {
  var v = Number(n);
  return isNaN(v) ? 0 : v;
}
```

Always use `safeNumber()` when reading amounts from Sheet — prevents string concatenation bugs.

## WebApp Frontend Patterns

### Report Markup — `buildReportMarkup(type, data)`

When server returns `{ status:'success', data: PnlData }`, pass `response.data` to `buildReportMarkup`:

```javascript
google.script.run
  .withSuccessHandler(function(response) {
    if (response && response.status === 'success') {
      container.innerHTML = buildReportMarkup(type, response.data);
    }
  })[handler](parameter);
```

The P&L renderer should show:
1. **Summary table** — Revenue / Expense / Net Profit
2. **Category breakdown** — Grouped by Kategori (sorted by abs net, desc)
3. **Monthly breakdown** — Pre-filled 12-month table (for yearly)
4. **Raw count footer** — Total / income / expense txns

### Delete Button — Confirmation Pattern

```javascript
window.handleDelete = function(type, id) {
  if (!id) return;
  if (!confirm('Anda pasti mahu memadam item ini?')) return;
  google.script.run
    .withSuccessHandler(function(result) {
      if (result.status === 'success') {
        showNotification(result.message, 'success');
        fetchInitialData();  // ← CRITICAL: refresh dashboard
      }
    })
    .withFailureHandler(function(error) {
      showNotification('Gagal memadam: ' + error.message, 'error');
    })['deleteTransaction'](id);
};
```

## Test Function Pattern

Always provide test functions in `code.gs` that run in Apps Script Log:

```javascript
function testDeleteTransaction() {
  // Test 1: invalid ID → expect errorCode:'NOT_FOUND'
  // Test 2: valid ID → expect status:'success', auto undo
  // Test 3: already deleted ID → expect success with 'already' message
}
function testGeneratePnl() {
  // Test yearly: verify 12 months filled, totals match
  // Test monthly: verify single month
  // Test deleted exclusion: active txn count vs sheet total
}
```

## Error Code Convention

| Code | Meaning |
|------|---------|
| VALIDATION_ERROR | Input invalid (missing ID, bad month, etc.) |
| NOT_FOUND | Transaction ID not in sheet |
| NO_DATA | No transactions in date range |
| SHEET_ERROR | Sheet access failure / lock timeout |
| LOCK_TIMEOUT | withLock waitLock expired |

## HAFJET-Specific Conventions

- Sheet name: `Transaksi` (MAIN)
- Store: HAFIZI GADGET ENTERPRISE, Raub Pahang
- Spreadsheet ID: stored in Script Properties as `SPREADSHEET_ID`
- Web App URL: stored in Script Properties as `WEB_APP_URL`
- Deploy: Manage deployments → New version → Deploy
- Tuan's preference: exact message matching, test-first, confirm each step

## References

- `references/response-formats.md` — Standard response shapes for all endpoints
- `references/data-structures.md` — PnlData, PnlPeriod, breakdownBy* full schema
- `references/period-parsing.md` — How period strings/objects parse to date ranges

## Related Skills

- **`hafjet-biz-ops`** (software-development) — Operational side: WhatsApp, Loyverse, Gmail
- **`gas-web-app-review`** — Review/debug existing GAS Web Apps
- **`hafjet-command-safety`** — Security SOP for terminal commands
