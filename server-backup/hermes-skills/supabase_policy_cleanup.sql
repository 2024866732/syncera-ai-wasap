-- HAFJET Policy Cleanup — DROP ALL variants, recreate clean set
-- Run in Supabase SQL Editor

-- ============================================================
-- EXPENSES: Drop ALL possible policy variants
-- ============================================================
DROP POLICY IF EXISTS "Allow expense insert" ON public.expenses;
DROP POLICY IF EXISTS "Service role insert" ON public.expenses;
DROP POLICY IF EXISTS "Service role full access" ON public.expenses;
DROP POLICY IF EXISTS "service_role_full_access" ON public.expenses;
DROP POLICY IF EXISTS "service_role_full_access_expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users read own expenses" ON public.expenses;
DROP POLICY IF EXISTS "authenticated_read_expenses" ON public.expenses;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.expenses;

-- Recreate clean policies for expenses
CREATE POLICY "Service role full access" ON public.expenses
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users read own expenses" ON public.expenses
    FOR SELECT USING (sender_whatsapp_id = auth.jwt() ->> 'phone' OR auth.role() = 'service_role');

-- ============================================================
-- VENDORS: Drop ALL possible policy variants
-- ============================================================
DROP POLICY IF EXISTS "Service role full access vendors" ON public.vendors;
DROP POLICY IF EXISTS "service_role_full_access" ON public.vendors;
DROP POLICY IF EXISTS "service_role_full_access_vendors" ON public.vendors;
DROP POLICY IF EXISTS "Authenticated read vendors" ON public.vendors;
DROP POLICY IF EXISTS "authenticated_read_vendors" ON public.vendors;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.vendors;

-- Recreate clean policies for vendors
CREATE POLICY "Service role full access vendors" ON public.vendors
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated read vendors" ON public.vendors
    FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- ============================================================
-- FIXED_COSTS: Drop ALL possible policy variants
-- ============================================================
DROP POLICY IF EXISTS "Service role full access fixed_costs" ON public.fixed_costs;
DROP POLICY IF EXISTS "service_role_full_access" ON public.fixed_costs;
DROP POLICY IF EXISTS "service_role_full_access_fixed_costs" ON public.fixed_costs;
DROP POLICY IF EXISTS "Authenticated read fixed_costs" ON public.fixed_costs;
DROP POLICY IF EXISTS "authenticated_read_fixed_costs" ON public.fixed_costs;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.fixed_costs;

-- Recreate clean policies for fixed_costs
CREATE POLICY "Service role full access fixed_costs" ON public.fixed_costs
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated read fixed_costs" ON public.fixed_costs
    FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- ============================================================
-- VERIFY: Should show exactly 2 policies per table
-- ============================================================
SELECT tablename, count(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('expenses', 'fixed_costs', 'vendors')
GROUP BY tablename
ORDER BY tablename;
