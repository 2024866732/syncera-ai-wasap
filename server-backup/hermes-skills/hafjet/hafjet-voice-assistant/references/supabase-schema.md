# Supabase Schema — HAFJET Voice Assistant

## Expected Tables

### products
Stock inventory for query responses.

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,           -- e.g., "IP11-BLK-64"
    name TEXT NOT NULL,                 -- e.g., "iPhone 11 Black 64GB"
    quantity INTEGER DEFAULT 0,         -- Current stock
    price DECIMAL(10,2) NOT NULL,       -- e.g., 1299.00
    category TEXT,                      -- e.g., "phone", "accessory"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for search
CREATE INDEX idx_products_name ON products USING gin (to_tsvector('english', name));
CREATE INDEX idx_products_sku ON products (sku);
```

### sales
Daily sales transactions for digest/summary.

```sql
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT UNIQUE NOT NULL,      -- e.g., "LV-20260805-00123"
    amount_total DECIMAL(10,2) NOT NULL,
    payment_status TEXT NOT NULL,       -- "paid", "pending", "refunded"
    customer_phone TEXT,
    customer_email TEXT,
    items JSONB NOT NULL,               -- [{"sku": "...", "qty": 1, "price": ...}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for timeframe queries
CREATE INDEX idx_sales_created_at ON sales (created_at);
CREATE INDEX idx_sales_payment_status ON sales (payment_status);
```

### repairs
Repair ticket status for customer queries.

```sql
CREATE TABLE repairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT UNIQUE NOT NULL,     -- e.g., "RPR-20260805-001"
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    device TEXT NOT NULL,               -- e.g., "iPhone 11", "Samsung S22"
    status TEXT NOT NULL,               -- received, diagnosing, waiting-part, in-progress, ready-pickup, completed
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for status queries
CREATE INDEX idx_repairs_ticket_id ON repairs (ticket_id);
CREATE INDEX idx_repairs_status ON repairs (status);
```

## Status Mapping (English → Malay)

| English | Malay (Customer) |
|---------|------------------|
| received | diterima |
| diagnosing | diagnosis |
| waiting-part | menunggu spare part |
| in-progress | sedang dibaiki |
| ready-pickup | sedia untuk diambil |
| completed | selesai |

## Query Patterns Used by Voice Assistant

### Stock Query
```python
# Search by product name or SKU
supabase.table("products") \
    .select("sku,name,quantity,price,category") \
    .or_(f"name.ilike.%{query}%,sku.ilike.%{query}%") \
    .execute()
```

### Low Stock Alert
```python
# Items below threshold (default 5)
supabase.table("products") \
    .select("sku,name,quantity,price,category") \
    .lt("quantity", threshold) \
    .execute()
```

### Sales Summary
```python
# Filter by timeframe (today, yesterday, this week, this month)
supabase.table("sales") \
    .select("amount_total,payment_status,created_at") \
    .gte("created_at", start_of_period) \
    .execute()
```

### Repair Status
```python
# Exact ticket_id match
supabase.table("repairs") \
    .select("*") \
    .eq("ticket_id", ticket_id) \
    .single() \
    .execute()
```

## RLS Policy

Voice assistant uses **service_role** key (bypasses RLS). Ensure:
- Service role key stored securely in `.env`
- Never exposed in client-side code
- Read-only access sufficient for queries

## Sample Data

```sql
-- Products
INSERT INTO products (sku, name, quantity, price, category) VALUES
('IP11-BLK-64', 'iPhone 11 Black 64GB', 3, 1299.00, 'phone'),
('IP11-WHT-128', 'iPhone 11 White 128GB', 1, 1499.00, 'phone'),
('IP12-BLU-64', 'iPhone 12 Blue 64GB', 0, 2199.00, 'phone'),
('BAT-IP11', 'iPhone 11 Battery Replacement', 15, 129.00, 'part'),
('SCR-IP11', 'iPhone 11 Screen Replacement', 8, 349.00, 'part');

-- Sales (today)
INSERT INTO sales (order_id, amount_total, payment_status, items) VALUES
('LV-20260805-001', 1299.00, 'paid', '[{"sku":"IP11-BLK-64","qty":1,"price":1299}]'),
('LV-20260805-002', 129.00, 'paid', '[{"sku":"BAT-IP11","qty":1,"price":129}]');

-- Repairs
INSERT INTO repairs (ticket_id, customer_name, customer_phone, device, status) VALUES
('RPR-20260805-001', 'Ahmad', '+60123456789', 'iPhone 11', 'in-progress'),
('RPR-20260805-002', 'Siti', '+60198765432', 'Samsung S22', 'ready-pickup');
```