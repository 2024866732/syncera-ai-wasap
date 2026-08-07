-- HAFJET Expenses Schema — Production Hardened
-- Run in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- VENDORS TABLE (normalized vendor names)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    canonical_name TEXT NOT NULL UNIQUE,
    aliases TEXT[] DEFAULT '{}',
    default_category TEXT CHECK (default_category IN (
        'utilities', 'stock_purchase', 'repair_parts', 
        'rent', 'loan_repayment', 'misc'
    )),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if table existed from old schema (safe no-ops if present)
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS canonical_name TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS default_category TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill canonical_name from old 'name' column if it exists
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='vendors' AND column_name='name') THEN
        UPDATE public.vendors SET canonical_name = name WHERE canonical_name IS NULL;
    END IF;
END $$;

-- Ensure canonical_name has UNIQUE constraint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_canonical_name_key') THEN
        ALTER TABLE public.vendors ADD CONSTRAINT vendors_canonical_name_key UNIQUE (canonical_name);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_aliases ON public.vendors USING GIN (aliases);

-- Seed common vendors — fills BOTH name (old schema) AND canonical_name (new schema)
INSERT INTO public.vendors (name, canonical_name, aliases, default_category) VALUES
    ('TNB', 'TNB', ARRAY['tenaga nasional', 'tenaga', 'tnb berhad', 'electric', 'elektrik'], 'utilities'),
    ('SYABAS', 'SYABAS', ARRAY['syabas', 'air selangor', 'water', 'air'], 'utilities'),
    ('Unifi', 'Unifi', ARRAY['unifi', 'tm unifi', 'streamyx', 'tm', 'telekom'], 'utilities'),
    ('Maxis', 'Maxis', ARRAY['maxis', 'maxis berhad', 'hotlink'], 'utilities'),
    ('Celcom', 'Celcom', ARRAY['celcom', 'celcomdigi', 'digi'], 'utilities'),
    ('U Mobile', 'U Mobile', ARRAY['u mobile', 'umobile', 'u-mobile'], 'utilities'),
    ('BSN', 'BSN', ARRAY['bsn', 'bank simpanan nasional', 'bank simpanan'], 'loan_repayment'),
    ('Maybank', 'Maybank', ARRAY['maybank', 'malayan banking'], 'loan_repayment'),
    ('CIMB', 'CIMB', ARRAY['cimb', 'cimb bank'], 'loan_repayment'),
    ('RHB', 'RHB', ARRAY['rhb', 'rhb bank'], 'loan_repayment'),
    ('Public Bank', 'Public Bank', ARRAY['public bank', 'pbb'], 'loan_repayment'),
    ('Hong Leong', 'Hong Leong', ARRAY['hong leong', 'hlb'], 'loan_repayment'),
    ('Affin', 'Affin', ARRAY['affin', 'affin bank'], 'loan_repayment'),
    ('Sewa Kedai', 'Sewa Kedai', ARRAY['sewa', 'rental', 'kedai', 'shop lot', 'premis', 'bayaran sewa'], 'rent'),
    ('Tunetalk', 'Tunetalk', ARRAY['tunetalk', 'tune talk'], 'utilities'),
    ('Photostat', 'Photostat', ARRAY['photostat', 'fotostat', 'fotokopi', 'copy', 'printing'], 'misc')
ON CONFLICT (name) DO NOTHING;

-- After seed: relax NOT NULL on name so future inserts use canonical_name only
ALTER TABLE public.vendors ALTER COLUMN name DROP NOT NULL;

-- ============================================================
-- FIXED COSTS TABLE (configurable, auditable)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fixed_costs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table existed from old schema
ALTER TABLE public.fixed_costs ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.fixed_costs ADD COLUMN IF NOT EXISTS effective_from DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.fixed_costs ADD COLUMN IF NOT EXISTS effective_to DATE;
ALTER TABLE public.fixed_costs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.fixed_costs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.fixed_costs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill label from name if null
UPDATE public.fixed_costs SET label = name WHERE label IS NULL;
-- Ensure existing rows are active
UPDATE public.fixed_costs SET is_active = true WHERE is_active IS NULL;

-- Seed current fixed costs
INSERT INTO public.fixed_costs (name, label, amount, effective_from) VALUES
    ('sewa', 'Sewa Kedai', 400.00, '2026-01-01'),
    ('bsn_loan', 'BSN Loan', 400.00, '2026-01-01'),
    ('tnb', 'TNB (estimate)', 500.00, '2026-01-01')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- EXPENSES TABLE — Hardened
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    receipt_image_url TEXT,
    receipt_drive_file_id TEXT,
    whatsapp_message_id TEXT UNIQUE NOT NULL,
    sender_whatsapp_id TEXT,
    sender_name TEXT,
    vendor_id UUID REFERENCES public.vendors(id),
    vendor_name_raw TEXT NOT NULL,
    expense_date DATE NOT NULL,
    receipt_number TEXT,
    total_amount DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'MYR' CHECK (currency ~ '^[A-Z]{3}$'),
    payment_method TEXT CHECK (payment_method IN (
        'cash', 'card', 'transfer', 'ewallet', 'cheque', 'other', NULL
    )),
    items JSONB DEFAULT '[]',
    category TEXT NOT NULL CHECK (category IN (
        'utilities', 'stock_purchase', 'repair_parts', 
        'rent', 'loan_repayment', 'misc'
    )),
    category_confidence DECIMAL(3,2) DEFAULT 0.0 CHECK (category_confidence >= 0 AND category_confidence <= 1),
    category_source TEXT DEFAULT 'auto' CHECK (category_source IN ('auto', 'manual', 'review', 'corrected')),
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'flagged', 'rejected'
    )),
    notes TEXT,
    raw_ocr_text TEXT,
    ocr_confidence DECIMAL(3,2),
    image_quality TEXT CHECK (image_quality IN ('good', 'fair', 'poor', 'unreadable', NULL)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- Add missing columns if table existed from old schema
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor_name_raw TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS raw_ocr_text TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(3,2);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS image_quality TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category_confidence DECIMAL(3,2) DEFAULT 0.0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category_source TEXT DEFAULT 'auto';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS sender_whatsapp_id TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- If old schema has 'amount' (NOT NULL), migrate to total_amount
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='expenses' AND column_name='amount')
       AND EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='expenses' AND column_name='total_amount') THEN
        -- Both exist: drop dependent view, copy data, drop old column
        DROP VIEW IF EXISTS public.expenses_active;
        UPDATE public.expenses SET total_amount = amount WHERE total_amount = 0;
        ALTER TABLE public.expenses DROP COLUMN amount;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='expenses' AND column_name='amount') THEN
        -- Only old column: rename it
        ALTER TABLE public.expenses RENAME COLUMN amount TO total_amount;
    END IF;
END $$;

-- Add total_amount if neither 'amount' nor 'total_amount' exists (fresh table)
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Add UNIQUE constraint if not present
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_whatsapp_message_id') THEN
        ALTER TABLE public.expenses ADD CONSTRAINT uniq_whatsapp_message_id UNIQUE (whatsapp_message_id);
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_sender ON public.expenses(sender_whatsapp_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_vendor ON public.expenses(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_created ON public.expenses(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON public.expenses(deleted_at) WHERE deleted_at IS NOT NULL;
-- Composite for monthly P&L queries
CREATE INDEX IF NOT EXISTS idx_expenses_month_cat ON public.expenses(expense_date, category) WHERE deleted_at IS NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_expenses_updated_at ON public.expenses;
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vendor updated_at trigger
DROP TRIGGER IF EXISTS update_vendors_updated_at ON public.vendors;
CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Fixed costs updated_at trigger
DROP TRIGGER IF EXISTS update_fixed_costs_updated_at ON public.fixed_costs;
CREATE TRIGGER update_fixed_costs_updated_at
    BEFORE UPDATE ON public.fixed_costs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS (exclude soft-deleted)
-- ============================================================
CREATE OR REPLACE VIEW public.monthly_expense_summary AS
SELECT 
    DATE_TRUNC('month', expense_date)::DATE AS month_start,
    category,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_amount,
    SUM(tax_amount) as total_tax
FROM public.expenses
WHERE status = 'completed' AND deleted_at IS NULL
GROUP BY DATE_TRUNC('month', expense_date), category
ORDER BY month_start DESC, category;

CREATE OR REPLACE VIEW public.yearly_expense_summary AS
SELECT 
    EXTRACT(YEAR FROM expense_date)::INT AS year,
    category,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_amount,
    SUM(tax_amount) as total_tax
FROM public.expenses
WHERE status = 'completed' AND deleted_at IS NULL
GROUP BY EXTRACT(YEAR FROM expense_date), category
ORDER BY year DESC, category;

-- Vendor summary view
CREATE OR REPLACE VIEW public.vendor_expense_summary AS
SELECT 
    v.canonical_name,
    e.category,
    COUNT(*) as transaction_count,
    SUM(e.total_amount) as total_amount,
    MIN(e.expense_date) as first_seen,
    MAX(e.expense_date) as last_seen
FROM public.expenses e
JOIN public.vendors v ON e.vendor_id = v.id
WHERE e.status = 'completed' AND e.deleted_at IS NULL
GROUP BY v.canonical_name, e.category
ORDER BY total_amount DESC;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;

-- EXPENSES policies (drop first for idempotent re-run)
DROP POLICY IF EXISTS "Service role full access" ON public.expenses;
CREATE POLICY "Service role full access" ON public.expenses
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users read own expenses" ON public.expenses;
CREATE POLICY "Users read own expenses" ON public.expenses
    FOR SELECT USING (sender_whatsapp_id = auth.jwt() ->> 'phone' OR auth.role() = 'service_role');

-- VENDORS policies
DROP POLICY IF EXISTS "Service role full access vendors" ON public.vendors;
CREATE POLICY "Service role full access vendors" ON public.vendors
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated read vendors" ON public.vendors;
CREATE POLICY "Authenticated read vendors" ON public.vendors
    FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- FIXED_COSTS policies
DROP POLICY IF EXISTS "Service role full access fixed_costs" ON public.fixed_costs;
CREATE POLICY "Service role full access fixed_costs" ON public.fixed_costs
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated read fixed_costs" ON public.fixed_costs;
CREATE POLICY "Authenticated read fixed_costs" ON public.fixed_costs
    FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- ============================================================
-- GRANTS
-- ============================================================
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO service_role;
GRANT SELECT ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO service_role;
GRANT SELECT ON public.vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_costs TO service_role;
GRANT SELECT ON public.fixed_costs TO authenticated;
GRANT SELECT ON public.monthly_expense_summary TO authenticated, service_role;
GRANT SELECT ON public.yearly_expense_summary TO authenticated, service_role;
GRANT SELECT ON public.vendor_expense_summary TO authenticated, service_role;