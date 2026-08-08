# Smart Routing with Supabase Direct Lookup

## Overview

Route WhatsApp messages to appropriate handler based on intent:
- Simple queries → Supabase direct lookup (fast, no LLM)
- Complex queries → Ollama LLM (slower, more flexible)
- Complaints/human requests → Human handoff

## Intent Classification

| Intent | Pattern Examples | Route |
|--------|------------------|-------|
| product_price | "harga iPhone 11", "berapa harga skrin?" | Supabase |
| product_stock | "ada stok iPhone 13?", "stok casing" | Supabase |
| repair_status | "status repair HAF-1234", "bila siap?" | Supabase |
| store_info | "alamat kedai", "waktu buka" | Supabase |
| booking | "nak booking repair", "appointment" | Ollama |
| human_handoff | "saya nak cakap dengan staff", "refund" | Human |
| general_ai | "hello", "terima kasih", general questions | Ollama |

## Implementation Pattern

```python
class IntentClassifier:
    PRICE_PATTERNS = [r'harga', r'price', r'berapa']
    STOCK_PATTERNS = [r'stok', r'stock', r'available']
    REPAIR_STATUS_PATTERNS = [r'status.*repair', r'HAF-\d+']
    HUMAN_PATTERNS = [r'staff', r'manager', r'refund', r'complaint']
    
    @classmethod
    def classify(cls, message: str) -> str:
        msg = message.lower()
        for p in cls.HUMAN_PATTERNS:
            if re.search(p, msg): return "human_handoff"
        for p in cls.REPAIR_STATUS_PATTERNS:
            if re.search(p, msg): return "repair_status"
        for p in cls.PRICE_PATTERNS:
            if re.search(p, msg): return "product_price"
        for p in cls.STOCK_PATTERNS:
            if re.search(p, msg): return "product_stock"
        return "general_ai"
```

## Supabase Direct Lookup Examples

### Product Price
```sql
SELECT name, price, stock 
FROM products 
WHERE name ILIKE '%iPhone 11%' AND active = true
LIMIT 1;
```

### Product Stock
```sql
SELECT name, stock 
FROM products 
WHERE name ILIKE '%iPhone 13%' AND active = true
LIMIT 1;
```

### Repair Status
```sql
SELECT repair_number, device, issue, status, price_estimate
FROM repairs 
WHERE repair_number = 'HAF-1234';
```

### Store Info (hardcoded or from DB)
```python
STORE_INFO = (
    "HAFIJI GADJET ENTERPRISE\n"
    "📍 Raub, Pahang, Malaysia\n"
    "📞 016-9808736\n"
    "⏰ Isnin-Ahad: 10am-8pm"
)
```

## Response Templates

### Price Found
```
{name} - RM{price:.2f}. Stok: {stock} unit.
```

### Price Not Found
```
Maaf, saya tidak dapat mencari produk tersebut. Boleh nyatakan model yang lebih spesifik?
```

### Stock Available
```
{name} - Ada stok {stock} unit.
```

### Stock Empty
```
{name} - Stok habis. Boleh pre-order?
```

### Repair Status
```
Repair {repair_number}:
Device: {device}
Issue: {issue}
Status: {status}
Estimate: RM{price_estimate:.2f}
```

### Repair Not Found
```
Maaf, nombor repair {repair_number} tidak ditemui.
```

## Benefits

1. **Speed**: Direct DB lookup ~100ms vs Ollama ~5-10s
2. **Accuracy**: No LLM hallucination for factual data
3. **Cost**: Zero LLM tokens for simple queries
4. **Reliability**: No Ollama dependency for common queries
