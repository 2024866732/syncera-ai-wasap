# Supabase Key Configuration & Connection Debugging

## Key Types & Prefixes

| Key Type | Prefix | Purpose | Use In |
|----------|--------|---------|--------|
| Anon / Publishable | `sb_publishable_*` | Client-side; respects RLS | `SUPABASE_PUBLISHABLE_KEY` |
| Service Role | `sb_secret_*` | Server-side; bypasses RLS | `SUPABASE_SERVICE_ROLE_KEY` |
| Management Token | `sb_access_token_*` | Dashboard API (manage projects) | NOT in `.env` |

## Common `.env` Misconfiguration

```bash
# WRONG — publishable key in service role slot:
SUPABASE_SERVICE_ROLE_KEY=sb_publishable_[REDACTED_EXAMPLE]

# RIGHT — secret key in service role slot (from ~/.hermes/.env, never commit):
SUPABASE_SERVICE_ROLE_KEY=[REDACTED_SUPABASE_SERVICE_ROLE]
```

**Symptoms of wrong key:**
- `HTTP 401 Unauthorized` on REST API calls
- `fixed_costs` table returns 0 rows (RLS blocks service role queries with anon key)
- `get_fixed_costs()` falls back to hardcoded values

## Connection Verification

```bash
# Quick check — should return HTTP 200
python3 -c "
from supabase import create_client
import os, sys
# Read from .env
env = {}
with open(os.path.expanduser('~/.hermes/.env')) as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
c = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
print('Key prefix:', env.get('SUPABASE_SERVICE_ROLE_KEY', '')[:15])
r = c.table('fixed_costs').select('count', count='exact').limit(0).execute()
print(f'fixed_costs rows: {r.count}')
# If r.count = 0 with 401/RLS in logs → key is publishable, not secret
"
```

## Project Reference

- **Project URL**: `https://ksqrpttesrrnzatgagyh.supabase.co`
- **Dashboard**: `https://supabase.com/dashboard/project/ksqrpttesrrnzatgagyh`
- **SQL Editor**: `https://supabase.com/dashboard/project/ksqrpttesrrnzatgagyh/sql/new`

## RLS Quick Test

```python
# Test that anon key CANNOT insert (RLS blocks it)
from supabase import create_client
anon = create_client(url, anon_key)
try:
    anon.table('expenses').insert({...}).execute()
    print('❌ RLS: anon INSERT worked — NOT restricted')
except Exception as e:
    if 'permission' in str(e).lower() or 'policy' in str(e).lower():
        print('✅ RLS: anon INSERT blocked — correct')
```

## Schema-Dependent Column Checks

The hardened schema adds columns that the old schema lacks:
- `vendor_name_raw` — if missing: `Could not find the 'vendor_name_raw' column` → schema not deployed
- `is_active` on `fixed_costs` — if missing: query `.eq("is_active", True)` returns 0 rows silently
- `tax_amount`, `receipt_number`, `deleted_at` — if missing: same column-not-found errors
