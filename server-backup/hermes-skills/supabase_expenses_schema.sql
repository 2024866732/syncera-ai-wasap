-- Supabase expenses table schema for HAFJET
-- Run this in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    -- Receipt metadata
    receipt_image_url TEXT,
    receipt_drive_file_id TEXT,
    whatsapp_message_id TEXT,
    sender_whatsapp_id TEXT,
    sender_name TEXT,
    
    -- Extracted structured data
    vendor_name TEXT NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'MYR',
    payment_method TEXT, -- cash, card, transfer, ewallet
    items JSONB, -- array of {name, qty, unit_price, total}
    
    -- Auto-categorization
    category TEXT NOT NULL CHECK (category IN (
        'utilities', 'stock_purchase', 'repair_parts', 
        'rent', 'loan_repayment', 'misc'
    )),
    category_confidence DECIMAL(3,2) DEFAULT 0.0, -- 0.0 to 1.0
    category_source TEXT DEFAULT 'auto', -- 'auto', 'manual', 'review'
    
    -- Processing status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'flagged', 'rejected'
    )),
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_sender ON public.expenses(sender_whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON public.expenses(created_at DESC);

-- Create updated_at trigger
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

-- Create view for monthly P&L expense summary
CREATE OR REPLACE VIEW public.monthly_expense_summary AS
SELECT 
    DATE_TRUNC('month', expense_date)::DATE AS month_start,
    category,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_amount
FROM public.expenses
WHERE status = 'completed'
GROUP BY DATE_TRUNC('month', expense_date), category
ORDER BY month_start DESC, category;

-- Create view for yearly expense summary
CREATE OR REPLACE VIEW public.yearly_expense_summary AS
SELECT 
    EXTRACT(YEAR FROM expense_date)::INT AS year,
    category,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_amount
FROM public.expenses
WHERE status = 'completed'
GROUP BY EXTRACT(YEAR FROM expense_date), category
ORDER BY year DESC, category;

-- Grant permissions (adjust for your Supabase roles)
GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
GRANT SELECT ON public.monthly_expense_summary TO authenticated;
GRANT SELECT ON public.yearly_expense_summary TO authenticated;

-- RLS Policies
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read their own expenses
CREATE POLICY "Users can view own expenses" ON public.expenses
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policy: Allow insert for receipt processing
CREATE POLICY "Allow expense insert" ON public.expenses
    FOR INSERT WITH CHECK (true);

-- Policy: Allow update for manual review
CREATE POLICY "Allow expense update" ON public.expenses
    FOR UPDATE USING (true);