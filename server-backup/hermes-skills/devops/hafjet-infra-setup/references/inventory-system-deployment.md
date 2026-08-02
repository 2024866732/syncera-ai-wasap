# Inventory Management System — HAFJET

## Architecture
- **Database**: PostgreSQL 16 (port 5433 internal)
- **API**: FastAPI + psycopg2 (port 8080)
- **UI**: HTML + Tailwind CSS + vanilla JS (port 8082)

## Database Schema
- `categories` - Part categories (Screen, Battery, etc.)
- `suppliers` - Supplier info (Shopee, Lazada, Direct)
- `parts` - Inventory items with SKU, pricing, stock levels
- `stock_transactions` - In/out transaction log
- `price_history` - Price tracking per supplier
- `alerts` - Low stock alerts

## API Endpoints
```
GET  /api/dashboard          - Overview stats
GET  /api/parts              - List parts (optional: ?category_id=1&search=iphone)
GET  /api/parts/{id}         - Get single part
POST /api/parts              - Create part
PUT  /api/parts/{id}         - Update part
DELETE /api/parts/{id}       - Delete part
POST /api/stock              - Stock in/out transaction
GET  /api/stock/transactions - Transaction history
GET  /api/low-stock          - Parts below min_stock
GET  /api/alerts             - Low stock alerts
POST /api/alerts/{id}/acknowledge - Acknowledge alert
GET  /api/categories         - List categories
GET  /api/suppliers          - List suppliers
POST /api/suppliers          - Add supplier
```

## Docker Compose Services
```yaml
inventory-db:    # PostgreSQL (internal only)
inventory-api:   # FastAPI backend
inventory-ui:    # Static file server
```

## Deployment Command
```bash
cd ~/inventory
docker compose up -d
```

## Key Files
- `schema.sql` - Database schema + sample data
- `inventory_api.py` - FastAPI backend
- `inventory_ui.html` - Web dashboard
- `docker-compose.yml` - Container orchestration

## Sample Data
- 14 parts across 9 categories
- 5 suppliers (AAC Hikvision, Shopee, Lazada, iFixit, AliExpress)
- Pre-loaded with HAFJET repair parts (iPhone, Samsung screens, batteries, etc.)

## Pitfalls
- DB host in API must match Docker service name (`inventory-db`, not `postgres`)
- Schema must be applied manually if init script doesn't run: `docker exec inventory-inventory-db-1 psql -U hafjet -d inventory -f /docker-entrypoint-initdb.d/01-schema.sql`
- Docker Compose v2 not installed by default on Ubuntu 26.04: `sudo apt-get install -y docker-compose-v2`
