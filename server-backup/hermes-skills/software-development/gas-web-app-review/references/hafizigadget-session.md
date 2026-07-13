# Session Reference: HAFIZI GADGET Dashboard Fix (Jul 2026)

## App Overview
Sistem Kewangan HAFIZI GADGET (M) SDN. BHD. — GAS Web App + Telegram Bot.
- Dashboard prestasi perniagaan (aliran tunai, invois, aset, P&L)
- Telegram Bot integration with Gemini AI Vision for receipt processing
- Data in Google Sheets (5 sheets: Transaksi, Kenalan, Invois, Kategori, Aset)
- **471 existing transactions**, 9-column old structure (Amaun Masuk/Amaun Keluar)
- Spreadsheet: `1AKIEr7URI9NBadJDgIJP5GVfl_fBlzEWizB1LFOMcuc`

## Identity
- **Tuan Hafizi** (Syahrul Hafizi) — MD of HAFIZI GADGET (M) SDN. BHD.
- **Preferences:** Malay+Kelantan dialect, prefers concise tables/bullets, hates overexplaining
- **Device:** iPhone (Safari) — no DevTools, no localhost redirect
- **Code delivery:** Paste code blocks directly in chat — MEDIA protocol and terminal cat output don't work reliably for file delivery

## 15 Stub Functions Added

### CRUD Operations
| Function | Frontend Caller | Returns |
|----------|----------------|---------|
| `saveTransaction(data)` | `handleTransactionSave()` | `{status, message, data}` |
| `deleteTransaction(id)` | `handleDelete('transaction', id)` | `{status, message, data}` |
| `saveContact(data)` | `handleSimpleForm(contactForm, 'saveContact', ...)` | `{status, message, data}` |
| `deleteContact(id)` | `handleDelete('contact', id)` | `{status, message, data}` |
| `saveInvoice(data)` | `handleInvoiceForm()` | `{status, message, data}` |
| `deleteInvoice(id)` | `handleDelete('invoice', id)` | `{status, message, data}` |
| `saveAsset(data)` | `handleSimpleForm(assetForm, 'saveAsset', ...)` | `{status, message, data}` |
| `deleteAsset(id)` | `handleDelete('asset', id)` | `{status, message, data}` |

### AI Operations
| Function | Frontend Caller | Returns |
|----------|----------------|---------|
| `suggestTransactionDetails(type, category, amount)` | `handleTransactionSuggestion()` | `{status, details, message}` |
| `saveTransactionWithAI(data)` | `handleTransactionAiSave()` | `{status, message, data}` |
| `analyzeReceiptWithAI(payload)` | `handleTransactionReceiptAnalyze()` | `{status, data: {type, category, amount, details}}` |

### Reports & Email
| Function | Frontend Caller | Returns |
|----------|----------------|---------|
| `generatePnl(period)` | `renderReport('profit-loss')` | `{status, data: PnlData}` |
| `generateBalanceSheet(year)` | `renderReport('balance-sheet')` | `{status, report: {year, currentAssets, ...}}` |
| `generateCashFlowStatement(period)` | `renderReport('cash-flow')` | `{status, report: {period, operations, ...}}` |
| `generateInvoiceReminderEmail(invoiceId)` | `handleGenerateEmail(invoiceId)` | `{status, subject, body}` |

## Bug Pattern Checklist
- [ ] **Missing containers** — JS calls `getElementById('cashflow-summary')` but no such element in HTML
- [ ] **Forced debug panels** — leftover `else { emergencyPanel.style.display = 'block' }` even when data OK
- [ ] **Duplicate filter systems** — two independent implementations with incompatible DOM IDs
- [ ] **inline style vs. classList conflict** — `section.style.display` overrides `.page.active { display: block }`
- [ ] **Window stubs conflicting** — `window.filteredTransactions` defined twice with different behaviour

## Specific Fixes Applied — Session 3 (deleteTransaction + generatePnl, Jul 2026)

### deleteTransaction() — Soft Delete with Idempotent Check

**Pattern:** `_ensureColumnExists('Status')` → read `getValue() || 'Active'` → if 'deleted', return `{alreadyDeleted: true}` → else `setValue('Deleted')`.

**Critical detail:** The second call to `deleteTransaction(id)` with the same ID must return `{ message: 'Transaksi sudah dipadam sebelum ini', data: { id, alreadyDeleted: true }, errorCode: null }` — no sheet write on the second call.

**Response formats:**
| Scenario | Return |
|----------|--------|
| Success | `{ status: 'success', message: 'Transaksi dipadam', data: { id } }` |
| Already deleted | `{ status: 'success', message: 'Transaksi sudah dipadam sebelum ini', data: { id, alreadyDeleted: true }, errorCode: null }` |
| Not found | `{ status: 'error', errorCode: 'NOT_FOUND', message: 'Transaksi tidak ditemui', data: null }` |
| Server error | `{ status: 'error', errorCode: 'SHEET_ERROR', message: '...', data: null }` |

### generatePnl() — Full P&L from Transaction Data

**Parsing period input:**
- String `'yearly'` → auto current year
- String `'2026-07'` → monthly July 2026
- Object `{ mode, year, month }` → as specified
- Object `{ startDate, endDate }` → custom range

**Filter order:**
1. Read sheet → `normalizeTransactions()` → `.filter(t => t.status !== 'deleted')`
2. Filter by date range: `startDate <= date <= endDate`
3. If no rows match → `{ status: 'error', errorCode: 'NO_DATA', data: null }`

**Yearly breakdown:** Pre-fill ALL 12 months (Jan-Dec) even when empty — frontend chart needs continuous x-axis. Use `for (var m = 1; m <= 12; m++) { ... byMonth[key] || { revenue:0, expense:0 } ... }`.

**Rounding:** Every money value `Math.round(val * 100) / 100` — prevents floating-point drift.

### withLock() Upgrade

| Before | After |
|--------|-------|
| `lock.tryLock(5000)` | `lock.waitLock(10000)` |
| No catch — proceeds even without lock | Catch → throw clear error |
| Finally `releaseLock()` | Same, but now always reached even after throw |

**Why:** `tryLock` returns `false` on timeout but the function still runs (unsafe). `waitLock` throws → caught → user sees "Sistem sibuk. Cuba sebentar lagi." → `finally` releases the lock.

### _ensureColumnExists() Pattern

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

- Appends at the END (`headers.length + 1`) — never inserts mid-sheet
- Returns 1-indexed column position
- Idempotent: if column already exists, returns its index (no write)

### normalizeTransactions() — Default 'active' Status

```javascript
status: ((r['Status'] || '').toLowerCase() || 'active')
```

- Old rows (created before Status column existed) → cell empty → `''` → `'active'`
- Deleted rows → `'Deleted'` → `'deleted'`
- This enables `.filter(t => t.status !== 'deleted')` to work universally

## Sheet Structure

Transaksi sheet headers changed from 9-column to 7-column for new sheets:
```
Old:  ID, Tarikh, Jenis, Kategori, Butiran, Amaun Masuk, Amaun Keluar, Pautan Lampiran, ID Lampiran
New:  ID, Tarikh, Jenis, Kategori, Butiran, Amaun, Sumber
```

Backward compatible — existing 9-col sheets keep working because `saveTransaction` and `addTransaction` adapt via dynamic header mapping.

## Data Flow Diagram

```
Dashboard Form → getTransactionPayload() → google.script.run.saveTransaction(payload)
                                              ├─ validate() → VALIDATION_ERROR
                                              ├─ process() → normalise date/type/amount
                                              ├─ withLock {
                                              │     sheet.getHeaders()
                                              │     id = _generateTransactionId(sheet)
                                              │     row = headers.map(header=>value)
                                              │     sheet.appendRow(row)
                                              │    }
                                              └─ return {status, message, data}
                                              │
Telegram Bot → parseTelegramCaption() → addTransaction(...)
                                           └─ (same pattern as saveTransaction)

Dashboard Delete → handleDelete('transaction', id) → deleteTransaction(id)
                                                        ├─ withLock {
                                                        │     find row by ID
                                                        │     ensure Status column exists
                                                        │     if already 'Deleted' → alreadyDeleted=true
                                                        │     else setValue('Deleted')
                                                        │    }
                                                        ├─ NOT_FOUND / alreadyDeleted / success
                                                        └─ fetchInitialData() (refresh UI)

Dashboard P&L → renderReport('profit-loss') → generatePnl(period)
                                                ├─ parse period → date range
                                                ├─ read + normalize + filter(deleted)
                                                ├─ filter by date range
                                                ├─ calc totals + breakdownByCategory + breakdownByMonth
                                                └─ return { status, data: PnlData }
```
