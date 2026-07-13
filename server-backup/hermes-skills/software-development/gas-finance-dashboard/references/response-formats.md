# GAS Finance Dashboard — Response Formats

All server functions return a standard envelope:

```json
{
  "status": "success|error",
  "message": "Human-readable description",
  "errorCode": "null | VALIDATION_ERROR | NOT_FOUND | NO_DATA | SHEET_ERROR | LOCK_TIMEOUT",
  "data": {} | null
}
```

## deleteTransaction

**Success:**
```json
{
  "status": "success",
  "message": "Transaksi dipadam",
  "data": { "id": "TX-20260713-0001" }
}
```

**Already Deleted:**
```json
{
  "status": "success",
  "message": "Transaksi sudah dipadam sebelum ini",
  "data": { "id": "TX-20260713-0001" }
}
```

**Not Found:**
```json
{
  "status": "error",
  "errorCode": "NOT_FOUND",
  "message": "Transaksi tidak ditemui",
  "data": null
}
```

**Validation Error (empty ID):**
```json
{
  "status": "error",
  "errorCode": "VALIDATION_ERROR",
  "message": "ID transaksi diperlukan.",
  "data": null
}
```

## generatePnl — PnlData (inside data field)

```json
{
  "period": {
    "mode": "monthly | yearly | custom",
    "year": 2026,
    "month": 7,
    "startDate": "2026-07-01",
    "endDate": "2026-07-31"
  },
  "totals": {
    "revenue": 5000.00,
    "expense": 3000.00,
    "netProfit": 2000.00
  },
  "breakdownByCategory": [
    {
      "category": "Jualan",
      "revenue": 4000.00,
      "expense": 0.00,
      "net": 4000.00
    }
  ],
  "breakdownByMonth": [
    {
      "year": 2026,
      "month": 7,
      "label": "Jul 26",
      "revenue": 5000.00,
      "expense": 3000.00,
      "netProfit": 2000.00
    }
  ],
  "rawCount": {
    "totalTransactions": 471,
    "incomeTransactions": 320,
    "expenseTransactions": 151
  }
}
```

## saveTransaction (implied pattern)

```json
{
  "status": "success",
  "message": "Transaksi berjaya disimpan",
  "data": {
    "transaction": {
      "id": "TX-20260713-0001",
      "date": "2026-07-13",
      "type": "Masuk",
      "category": "Jualan",
      "details": "Jualan iPhone",
      "amount": 1500.00,
      "source": "Dashboard"
    }
  },
  "errorCode": null
}
```
