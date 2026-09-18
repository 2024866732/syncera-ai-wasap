# Prisma for Auth Queries — Bypassing Supabase RLS

## Problem

`getCurrentProfile()` queries the `profiles` table via the Supabase anon/authenticated client. If RLS policies are not perfectly configured (e.g., missing SELECT policy, recursive policies, or policies that block the query), the query returns `null` → user appears unauthenticated → redirect loop.

**Root cause discovered 23 Aug 2026:** Supabase RLS policies in `prisma/sql/0002_rls_storage_policies.sql` were NOT applied to production. The migration only creates DDL (tables, indexes). RLS policies are separate SQL. With RLS enabled but no matching policies, ALL queries are blocked (`permission denied for table profiles 42501`).

## Solution: Use Prisma for Auth Profile Lookups

After `supabase.auth.getUser()` verifies the session (via cookies), query the `profiles` table via **Prisma** (which uses `DATABASE_URL` and bypasses RLS entirely):

```typescript
// src/lib/authz.ts
import { prisma } from "@/lib/db";
import { createClient } from "@/@/lib/supabase/server";

export async function getCurrentProfile() {
  // Step 1: Get user ID from Supabase Auth session
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getUser();
  if (error || !authData.user) return null;

  const userId = authData.user.id;

  // Step 2: Query profile via Prisma (bypasses RLS)
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!profile) return null;
  return { id: profile.id, role: profile.role };
}
```

## Why This Works

1. `supabase.auth.getUser()` — validates the session cookie, returns `user.id`. This IS subject to Supabase auth (requires valid JWT).
2. `prisma.profile.findUnique()` — queries `profiles` via `DATABASE_URL` (direct connection or pooler). **Not subject to RLS** because Prisma uses a database-level connection, not the Supabase HTTP API.

## When to Use This Pattern

- **Auth profile lookups** (role checking, ownership verification)
- **Admin queries** that need to read other users' data
- **Any query where RLS might block legitimate access**

## When NOT to Use This Pattern

- **Customer-facing data** (menu items, orders) — keep using Supabase client with RLS for defense-in-depth
- **Storage operations** — use Supabase Storage API with service_role key

## RLS Policy Still Needed

Even with Prisma bypass, you should still apply RLS policies for:
- **Customer self-service** (own orders, own receipts) — RLS as defense-in-depth
- **Defense against accidental anon client usage** — if code accidentally uses the anon client, RLS blocks unauthorized access

## Key Lesson

**Never assume RLS policies are applied after `prisma migrate deploy`.** The migration only creates DDL. RLS policies in separate SQL files must be applied manually via Supabase SQL Editor. Always verify with a test query after enabling RLS.

## Verification

After applying RLS policies, test with:
```sql
-- As authenticated user (via Supabase SQL Editor with user context):
SELECT auth.uid() AS my_id;
SELECT id, role FROM profiles WHERE id = (SELECT auth.uid());
```

If the second query returns 0 rows, the RLS policy is blocking the query.
