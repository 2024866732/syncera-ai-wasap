---
name: hafjet-supabase-deploy
description: Deploy HAFJET Supabase schema, webhook, and P&L pipeline. Covers idempotent DDL patterns, column migration, policy management, RLS verification, and credential troubleshooting.
category: devops
tags: [hafjet, supabase, schema, bi, pnl]
---

# HAFJET Supabase Deploy

Deploy and manage Supabase schema + services for the HAFJET BI system.

## Project Details
- **Ref:** `ksqrpttesrrnzatgagyh` | **URL:** `https://ksqrpttesrrnzatgagyh.supabase.co`
- **Key:** load from `~/.hermes/.env` → `SUPABASE_SERVICE_ROLE_KEY` (must be `sb_secret_*`, not publishable)
- **Env:** `~/.hermes/.env`

## Golden Rule: Schema Deployment

**Supabase SDK cannot execute DDL.** Management API needs PAT. PG blocked from server.
**Supabase MCP is only available in OpenCode, NOT Hermes Agent.**

**Path:** SQL file → Telegram MEDIA → Supabase SQL Editor.

### Idempotent Column Migration (dual-column)
When both old and new columns exist (e.g., `amount` → `total_amount`):
```sql
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='expenses' AND column_name='amount')
       AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='expenses' AND column_name='total_amount') THEN
        DROP VIEW IF EXISTS public.expenses_active;
        UPDATE public.expenses SET total_amount = amount WHERE total_amount = 0;
        ALTER TABLE public.expenses DROP COLUMN amount;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='expenses' AND column_name='amount') THEN
        ALTER TABLE public.expenses RENAME COLUMN amount TO total_amount;
    END IF;
END $$;
```

### Idempotent Policies (DROP before CREATE)
```sql
DROP POLICY IF EXISTS "Service role full access" ON public.expenses;
CREATE POLICY "Service role full access" ON public.expenses
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```
**Always DROP POLICY IF EXISTS before CREATE POLICY** — PostgreSQL does not support `CREATE OR REPLACE POLICY`.

### Seed data (ON CONFLICT)
```sql
INSERT INTO public.vendors (name, canonical_name, aliases, default_category) VALUES (...)
ON CONFLICT (name) DO NOTHING;

-- Then relax NOT NULL for migration path:
ALTER TABLE public.vendors ALTER COLUMN name DROP NOT NULL;
```

### View dependency handling
**Always `DROP VIEW IF EXISTS` before dropping columns that views depend on.** Re-create views after migration.

## Verification Commands

```python
from supabase import create_client
c = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# RLS: anon INSERT must fail
anon = create_client(URL, PUBLISHABLE_KEY)
try: anon.table('expenses').insert({...}).execute()
except: pass  # must raise permission error

# UNIQUE: duplicate must fail
c.table('expenses').insert({'whatsapp_message_id': 'test', ...}).execute()
try: c.table('expenses').insert({'whatsapp_message_id': 'test', ...}).execute()
except: pass  # must raise duplicate error

# Fixed costs from DB
rows = c.table('fixed_costs').select('name,amount').eq('is_active',True).execute()
```

### Env key check
```bash
grep SUPABASE_SERVICE_ROLE_KEY ~/.hermes/.env | grep -o 'sb_[a-z]*_'
# Must show sb_secret_, NOT sb_publishable_
```

## Python Environment

Hermes venv (py3.11): no pip/flask/supabase/gunicorn. **Always use `/usr/bin/python3` (3.10) for SDK.** Gunicorn: `/home/hafizi145/.local/bin/gunicorn`.

## Webhook (port 8080)

```bash
sudo systemctl stop hafjet-orchestrator-api  # old service
/home/hafizi145/.local/bin/gunicorn whatsapp_webhook_v2:app -b 0.0.0.0:8080 -w 1 --timeout 120 &
curl localhost:8080/health  # → hafjet-whatsapp-webhook-v2
```

## P&L Fixed Costs Fallback

Three layers in `pnl_generator_v2.py`: DB query → empty warn+hardcoded → exception warn+hardcoded. Values: `{"sewa":400,"bsn_loan":400,"tnb":500}`.

## Key Files
- `supabase_expenses_schema_hardened.sql` — DDL with ALTER fallbacks
- `supabase_vendor_rpc.sql` — `find_vendor_by_alias()`
- `pnl_generator_v2.py` — Monthly P&L
- `whatsapp_webhook_v2.py` — Receipt webhook
