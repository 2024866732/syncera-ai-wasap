# Period Parsing Logic

The `generatePnl(period)` function accepts flexible input types and normalises to a standard date range.

## Input Modes

### 1. String: `'yearly'`
→ Current year, Jan 1 – Dec 31
```
opts.mode = 'yearly', opts.year = new Date().getFullYear()
```

### 2. String: `'2026-07'` (YYYY-MM)
→ Specific month
```
opts.mode = 'monthly', opts.year = 2026, opts.month = 7
```

### 3. Object: `{ mode: 'monthly', year: 2026, month: 7 }`
→ Explicit monthly
```
startDate = '2026-07-01'
endDate   = '2026-07-31'   // lastDayOfMonth(2026, 7) = 31
```

### 4. Object: `{ mode: 'yearly', year: 2026 }`
→ Full year
```
startDate = '2026-01-01'
endDate   = '2026-12-31'
```

### 5. Object: `{ startDate: '2026-06-01', endDate: '2026-08-31' }`
→ Custom range. `mode` forced to `'custom'`.
```
startDate = '2026-06-01'
endDate   = '2026-08-31'
```

## Validation Rules

| Condition | Error |
|-----------|-------|
| `mode` not in `monthly, yearly, custom` | VALIDATION_ERROR |
| `year` missing or NaN | VALIDATION_ERROR |
| `month` < 1 or > 12 (for monthly) | VALIDATION_ERROR |

## Date Range Calculation

```javascript
function lastDayOfMonth(y, m) {
  return new Date(y, m, 0).getDate();  // Day 0 of next month = last day
}

// Monthly
startDate = year + '-' + pad(month) + '-01';
endDate   = year + '-' + pad(month) + '-' + pad(lastDayOfMonth(year, month));

// Yearly
startDate = year + '-01-01';
endDate   = year + '-12-31';

// Custom
startDate = opts.startDate;
endDate   = opts.endDate;
```

## Transaction Filtering

```javascript
var filtered = rows.filter(function(r) {
  return r.date >= startDate && r.date <= endDate  // string comparison (YYYY-MM-DD)
      && r.status !== 'deleted';                    // soft delete exclusion
});
```

## Monthly Breakdown Rules

| Mode | Behaviour |
|------|-----------|
| `monthly` | `breakdownByMonth = []` (empty) |
| `yearly` | Pre-fill ALL 12 months with 0 values, overlaid with real data |
| `custom` | Only months WITH data appear (sorted) |
