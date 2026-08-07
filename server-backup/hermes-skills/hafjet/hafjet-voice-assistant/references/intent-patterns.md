# Intent Patterns — Regex for HAFJET Voice Commands

## Wake Words
```python
wake_words = ["hafjet", "ha fet", "half jet", "hapjet"]
```

## Intent Patterns (Priority Order)

### LOW_STOCK_ALERT (highest priority - specific pattern)
```python
r"(stock|stok)\s+(rendah|kurang|low)"
r"(alert|amaran)\s+(stock|stok)"
r"(apa)\s+(stock|stok)\s+(rendah|kurang)"
r"(stock|stok)\s+low"
r"low\s+(stock|stok)"
```

### STOCK_QUERY
```python
r"(berapa|berapa banyak|stock|stok)\s+(.*?)(?:\?|$)"
r"(ada|tersedia)\s+(.*?)(?:\?|$)"
r"(check|cek)\s+stock\s+(.*?)(?:\?|$)"
r"(stock|stok)\s+(.*?)\s+(ada|berapa)"
```

### SALES_QUERY
```python
r"(jualan|sales|pendapatan)\s+(hari ini|semalam|bulan ini|minggu ini)"
r"(berapa)\s+(jualan|sales|pendapatan)"
r"(daily|harian)\s+(sales|jualan|report)"
```

### REPAIR_STATUS
```python
r"(status|keadaan)\s+(repair|pembaikan|ticket)\s+(.*?)(?:\?|$)"
r"(repair|pembaikan)\s+(.*?)\s+(status|keadaan)"
r"(ticket|tik)\s+(.*?)\s+(mana|status)"
```

### DAILY_DIGEST
```python
r"(ringkasan|summary|digest)\s+(harian|daily)"
r"(laporan|report)\s+(harian|daily)"
r"(apa)\s+(hari ini|today)"
```

## Entity Patterns

### product
```python
r"(iphone\s+\d+|samsung\s+\w+|ipad\s+\w+|macbook\s+\w+)"
r"(battery|bateri|screen|skrin|charger|cas|glass|kaca)"
```

### model
```python
r"(iphone\s+\d+\w*)"
r"(samsung\s+\w+\s*\d*)"
```

### repair_ticket
```python
r"(ticket|tik|repair)\s*[:#]?\s*(\w+)"
r"(#\w+)"
```

### timeframe
```python
r"(hari ini|today|semalam|yesterday|minggu ini|bulan ini)"
```

## Parsing Logic

1. Lowercase input, strip whitespace
2. Check for wake word (boosts confidence to 0.8 vs 0.6)
3. Remove wake word from text
4. Iterate intents in priority order (LOW_STOCK_ALERT first)
5. First matching pattern wins
6. Extract entities from matched text

## Example Matches

| Input | Intent | Entities | Confidence |
|-------|--------|----------|------------|
| "HAFJET, berapa stock iPhone 11?" | stock_query | product: ["iphone 11"], model: ["iphone 11"] | 0.8 |
| "HAFJET, stock rendah" | low_stock_alert | {} | 0.8 |
| "HAFJET, jualan hari ini" | sales_query | timeframe: ["hari ini"] | 0.8 |
| "status repair ticket ABC123" | repair_status | repair_ticket: ["ticket", "repair"] | 0.6 |
| "Apa khabar?" | unknown | {} | 0.0 |