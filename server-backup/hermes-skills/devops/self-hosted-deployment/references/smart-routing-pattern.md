# WhatsApp Bot Smart Routing Pattern

## Overview
Smart routing for WhatsApp bots: classify customer intent → route to appropriate handler → generate response.

## Architecture
```
Incoming Message
    ↓
Intent Classifier
    ↓
Route Decision
    ├── product_price → Supabase Direct Lookup
    ├── product_stock → Supabase Direct Lookup
    ├── repair_status → Supabase Direct Lookup
    ├── store_info → Hardcoded Response
    ├── human_handoff → Direct Handoff
    └── general_ai → Ollama Fallback
```

## Intent Classification Patterns

### Product Price
```python
PRICE_PATTERNS = [
    r'harga', r'price', r'berapa', r'cost', r'muah', r'rate',
    r'iPhone.*harga', r'harga.*iPhone', r'skrin.*harga', r'harga.*skrin',
]
```

### Product Stock
```python
STOCK_PATTERNS = [
    r'stok', r'stock', r'ada.*stok', r'stok.*ada', r'available',
]
```

### Repair Status
```python
REPAIR_STATUS_PATTERNS = [
    r'status.*repair', r'repair.*status', r'progress', r'kemajuan',
    r'HAF-\d+', r'nombor.*repair', r'repair.*nombor',
]
```

### Human Handoff (Highest Priority)
```python
HUMAN_PATTERNS = [
    r'staff', r'manager', r'boss', r'owner', r'manusi', r'orang',
    r'call.*back', r'telefon.*balik', r'hubung.*balik',
    r'tidak.*puas', r'marah', r'complaint', r'aduan',
    r'refund', r'wang.*balik', r'garansi', r'warranty',
]
```

## Supabase Direct Lookup

### Price Lookup
```python
cur.execute("""
    SELECT name, price, stock 
    FROM products 
    WHERE name ILIKE %s AND active = true
    LIMIT 1
""", (f"%{product_name}%",))

row = cur.fetchone()
if row:
    response = f"{row[0]} - RM{row[1]:.2f}. Stok: {row[2]} unit."
else:
    response = "Maaf, saya tidak dapat mencari produk tersebut."
```

### Repair Status Lookup
```python
cur.execute("""
    SELECT repair_number, device, issue, status, price_estimate
    FROM repairs 
    WHERE repair_number = %s
""", (repair_number,))

row = cur.fetchone()
if row:
    response = f"Repair {row[0]}:\nDevice: {row[1]}\nStatus: {row[3]}"
else:
    response = f"Maaf, nombor repair {repair_number} tidak ditemui."
```

## Ollama Fallback

```python
async def _route_to_ollama(self, message_text, customer_phone):
    from ai.ollama_client import ollama_client
    
    SYSTEM_PROMPT = """Anda ialah AI customer service HAFJET GADGET..."""
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": message_text}
    ]
    
    try:
        response = await ollama_client.chat(messages)
        return {"route_type": "llm", "response": response}
    except Exception as e:
        return {
            "route_type": "llm",
            "response": "Maaf, sistem AI sedang sibuk."
        }
```

## Human Handoff

```python
async def _route_to_human(self, message_text, customer_phone):
    handoff_message = (
        "Baik, saya akan sambungkan pertanyaan ini kepada staff HAFJET. "
        "Sila tunggu sebentar atau hubungi 016-9808736."
    )
    
    return {
        "route_type": "human_handoff",
        "response": handoff_message,
        "needs_human": True
    }
```

## Key Rules

1. **Human handoff has highest priority** — check for staff/refund/complaint patterns first
2. **Direct lookup for simple queries** — don't call Ollama for price/stock/status
3. **Ollama for complex queries** — general questions, explanations, conversational
4. **Never fabricate data** — if Supabase returns no data, say so honestly
5. **Log route_type** — track which routes are used for analytics

## Performance

- Direct Supabase lookup: ~7ms
- Ollama response: ~5-30s
- Human handoff: ~1ms

## Related
- See `references/cost-control-pattern.md` for outbound message limiting
