# HAFJET BI Agent — Local Deployment Pitfalls

## Lesson from: Aug 2026 webhook + P&L deployment session

---

## 1. Python venv vs global Python mismatch

**Symptom:** `gunicorn` command not found, or `python3 -m pip install` fails with "No module named pip".

**Root cause:** Hermes Agent runs inside its own venv (`~/.hermes/hermes-agent/venv/`) with Python 3.11 and NO pip module. Global system Python (`/usr/bin/python3`) is 3.10 and has all user-installed packages. The `PATH` in Hermes sessions points to the venv Python first.

**Fix:** Always use full paths for pip and gunicorn:

```bash
# Install packages (uses global Python 3.10)
pip3 install flask gunicorn supabase

# Deploy webhook (explicit full path)
/home/hafizi145/.local/bin/gunicorn whatsapp_webhook_v2:app \
  -b 0.0.0.0:8080 -w 1 --timeout 120

# Verify: check the binary location
which gunicorn          # may show nothing
which python3           # shows hermes venv Python 3.11
/usr/bin/python3 --version  # global Python 3.10
```

**Why `pip3 install` works but `python3 -m pip` doesn't:** `pip3` is a symlink to the global pip, while `python3` resolves to the venv Python which has no pip bootstrapped.

---

## 2. Systemd service blocking deployment port

**Symptom:** Webhook starts and shows the WRONG service identity in `/health`, or port is already bound even after `pkill`.

**Root cause:** A systemd service (e.g., `hafjet-orchestrator-api.service`) manages a process on the target port. Killing the process causes systemd to auto-restart it.

**Fix:**
```bash
# Check what's listening
lsof -i :8080

# Check if systemd owns it
systemctl list-units --type=service | grep -i "webhook\|orchestrator\|8080"

# Stop the systemd service FIRST, then deploy
sudo systemctl stop hafjet-orchestrator-api
lsof -ti :8080 | xargs kill 2>/dev/null

# Now deploy your webhook
gunicorn whatsapp_webhook_v2:app -b 0.0.0.0:8080 ...

# Verify correct service identity
curl -s http://localhost:8080/health | grep "service"
# Should show YOUR service name, not the old one
```

---

## 3. Supabase schema not yet deployed — empty result fallback

**Symptom:** `get_fixed_costs()` returns `{}` (empty dict), causing P&L to show RM 0.00 fixed costs. No exception is raised — the query succeeds but returns zero rows.

**Root cause:** The Supabase `fixed_costs` table exists (from old schema) but lacks the `is_active` column. The query `.eq("is_active", True)` returns zero matching rows instead of throwing an error. No exception = fallback code path never triggered.

**Fix — 3-layer safety net:**
```python
def get_fixed_costs():
    fallback = {"sewa": 400.0, "bsn_loan": 400.0, "tnb": 500.0}
    try:
        result = supabase.table("fixed_costs")\
            .select("name, amount")\
            .eq("is_active", True)\
            .execute()
        costs = {row['name']: float(row['amount']) for row in result.data}
        if not costs:  # <— THIS is the critical guard
            print("⚠️ DB returned 0 rows — using hardcoded fallback")
            return fallback
        return costs
    except Exception as e:
        print(f"⚠ Could not fetch fixed costs: {e}")
        return fallback
```

**Three layers:**
1. DB returns rows → use them
2. DB returns empty → fallback (with warning)
3. DB query throws exception → fallback (with warning)

---

## 4. Schema column mismatch — different stages of deployment

**Symptom:** `column fixed_costs.label does not exist` — the generator queries a column that exists in the hardened SQL file but NOT in the currently deployed Supabase table.

**Root cause:** The hardened schema SQL file defines `label TEXT NOT NULL`, but the DEPLOYED Supabase instance still has the old schema (no `label` column). The generator code was written against the hardened schema, not the deployed one.

**Fix:** Query only columns that both schemas guarantee. Use client-side display labels instead of DB columns:

```python
# ❌ BREAKS on old schema (no label column)
.select("name, label, amount")

# ✅ Works on both old and new schemas
.select("name, amount")

# Display labels handled client-side:
fixed_labels = {"sewa": "Sewa Kedai", "bsn_loan": "BSN Loan", "tnb": "TNB"}
for name, amount in costs.items():
    print(f"  {fixed_labels.get(name, name)}: RM {amount:.2f}")
```

---

## 5. Background gunicorn — process lifecycle

When deploying with `terminal(background=True)`:
- Gunicorn starts and the master process stays alive
- Workers handle requests
- Use `notify_on_complete=true` only if the process is expected to EXIT (gunicorn never exits normally, so don't use it)
- Check health after deployment: `sleep 3 && curl -s http://localhost:8080/health`

If the first deployment attempt fails with `command not found`, the failed background process will eventually report exit code 127 — this is informational, not a problem with your current running webhook.

---

## 6. Supabase .env credential misconfiguration

**Symptom:** `supabase-py` returns HTTP 401 Unauthorized even when `SUPABASE_SERVICE_ROLE_KEY` is set in `.env`.

**Root cause:** The `.env` file may have multiple Supabase keys, and the `SERVICE_ROLE_KEY` variable was copied from the `PUBLISHABLE_KEY` value (both were `sb_publishable_...`). The actual secret key was in a different variable (`SUPABASE_SECRET_KEY`).

**Fix:**
```bash
# Check all Supabase env vars
grep "SUPABASE" ~/.hermes/.env

# Common issue: SERVICE_ROLE_KEY = publishable key (wrong)
# SUPABASE_SERVICE_ROLE_KEY=sb_publishable_xxx  ← BROKEN
# SUPABASE_SECRET_KEY=sb_secret_xxx             ← This is the real service key!

# Fix with sed:
sed -i 's|old_publishable_key|correct_secret_key|' ~/.hermes/.env

# Verify:
python3 -c "
from supabase import create_client
import os, re
# Read .env manually
env = {}
with open('~/.hermes/.env') as f:
    for line in f:
        if '=' in line: k,v = line.split('=',1); env[k.strip()]=v.strip()
c = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
r = c.table('fixed_costs').select('count', count='exact').limit(0).execute()
print(f'Connected! {r.count} rows in fixed_costs')
"
```

---

## 7. Supabase schema incremental deployment pattern

**Problem:** Deploying a hardened schema to a Supabase project that already has tables from an older schema. `CREATE TABLE IF NOT EXISTS` skips table creation, leaving missing columns and constraints. Plain `ALTER TABLE` fails if the column already exists from a partial previous run.

**Pattern — safe incremental deployment:**

```sql
-- 1. Create table (no-op if exists)
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    canonical_name TEXT UNIQUE,
    name TEXT NOT NULL,         -- old column, kept for compatibility
    aliases TEXT[] DEFAULT '{}'
);

-- 2. Add any column that might be missing (safe: skips if exists)
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS canonical_name TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3. Backfill from old columns
UPDATE public.vendors SET canonical_name = name WHERE canonical_name IS NULL;

-- 4. Add constraints safely with DO blocks
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_canonical_name_key') THEN
        ALTER TABLE public.vendors ADD CONSTRAINT vendors_canonical_name_key UNIQUE (canonical_name);
    END IF;
END $$;

-- 5. Seed data — fill BOTH old and new column names
INSERT INTO public.vendors (name, canonical_name, aliases) VALUES
    ('TNB', 'TNB', ARRAY['tenaga', 'tnb'])
ON CONFLICT (name) DO NOTHING;  -- target the constraint that EXISTS

-- 6. Relax old NOT NULL constraints after seeding
ALTER TABLE public.vendors ALTER COLUMN name DROP NOT NULL;
```

**Critical rules:**
- `ADD COLUMN IF NOT EXISTS` BEFORE any `RENAME COLUMN` — otherwise RENAME fails if the target name already exists
- Handle dual-column scenarios explicitly: if both `amount` (old) and `total_amount` (new) exist, copy data then DROP the old one
- `ON CONFLICT` must reference a constraint that ACTUALLY EXISTS on the deployed table. If the table predates your new UNIQUE constraint, use the old column's constraint
- Use DO blocks for conditional DDL that might fail on schema mismatch
- Seed INSERTs must fill ALL NOT NULL columns that exist in the current deployed schema
- After seeds are in, relax old NOT NULL constraints so future code can use only the new column names

**Example — dual column resolution:**
```sql
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='expenses' AND column_name='amount')
       AND EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='expenses' AND column_name='total_amount') THEN
        -- Both exist: migrate data, then drop old
        UPDATE public.expenses SET total_amount = amount WHERE total_amount = 0;
        ALTER TABLE public.expenses DROP COLUMN amount;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='expenses' AND column_name='amount') THEN
        -- Only old column exists: rename
        ALTER TABLE public.expenses RENAME COLUMN amount TO total_amount;
    END IF;
END $$;
```
