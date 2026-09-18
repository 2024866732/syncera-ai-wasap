# HAFJET Kitchen Production Auth & Storage Fixes (Aug 2026)

Session-specific detail for the production auth/storage debugging cycle after go-live.

## 1. RLS "permission denied for table profiles" (42501)

### Diagnosis path
1. Supabase `signInWithPassword` → SUCCESS (confirmed in Supabase Dashboard → Authentication → Users)
2. Cookie `sb-<ref>-auth-token` EXISTS in browser DevTools → Application → Cookies
3. Middleware logs: `getUser error` or `getUser OK` — confirms cookie reaches server
4. `getCurrentProfile()` logs: `[authz] profiles query error: permission denied for table profiles 42501`

### Root cause
RLS policies in `prisma/sql/0002_rls_storage_policies.sql` were NOT applied to production Supabase. `prisma migrate deploy` only applies DDL. RLS was enabled on tables (from the migration SQL) but no SELECT policies existed → all queries blocked.

### Fix: Prisma bypass for auth profile lookups
After `supabase.auth.getUser()` verifies the session (via cookies), query `profiles` via **Prisma** (`DATABASE_URL`) which bypasses RLS entirely:

```typescript
// src/lib/authz.ts — final working version
export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getUser();
  if (error || !authData.user) return null;

  // Prisma bypasses RLS — uses DATABASE_URL, not Supabase HTTP API
  const profile = await prisma.profile.findUnique({
    where: { id: authData.user.id },
    select: { id: true, role: true },
  });
  return profile ? { id: profile.id, role: profile.role } : null;
}
```

### RLS policies still needed for defense-in-depth
Apply via Supabase SQL Editor AFTER migration:
```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);
```

**Key lesson:** Never assume RLS policies are applied after `prisma migrate deploy`. The migration only creates DDL. RLS policies in separate SQL files must be applied manually.

## 2. SupabaseReceiptStorage — local:// → HTTPS signed URLs

### Problem
`LocalReceiptStorage` (dev/test) produces `local://receipts/...` URLs — browsers reject with `ERR_UNKNOWN_URL_SCHEME`. Production needs real Supabase Storage signed URLs.

### Fix: SupabaseReceiptStorage with createSignedUrl()
```typescript
// src/lib/storage.ts
export class SupabaseReceiptStorage implements ReceiptStorage {
  // uses @supabase/supabase-js createClient(url, serviceKey)
  // store(): supabase.storage.from(bucket).upload(path, bytes, { contentType })
  // signedUrl(): supabase.storage.from(bucket).createSignedUrl(path, expirySec)
}

export function getStorage(): ReceiptStorage {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return SupabaseReceiptStorage.fromEnv();
  }
  return LocalReceiptStorage.fromEnv();
}
```

### TypeScript generic mismatch fix
`@supabase/supabase-js` `SupabaseClient` generic types don't match `ReceiptStorage` interface. Fix with `@ts-expect-error`:
```typescript
// @ts-expect-error SupabaseClient generic mismatch
return new SupabaseReceiptStorage(supabase);
```

## 3. Receipt review actions — "dead buttons" debugging

### Symptom
Admin `/admin/receipts` page loads, but "Sahkan Pembayaran" and "Tolak Pembayaran" buttons do nothing.

### Diagnosis
- Server actions (`confirmPaymentAction`/`rejectPaymentAction`) were correctly defined with `"use server"` and `requireAdminAction()` guard
- Form `<form action={confirmPaymentAction}>` was correctly bound
- Root cause was auth session not working (RLS blocking `getCurrentProfile` → `requireAdminAction` throws → `backToReceipts()` redirects silently)

### Fix
Once the Prisma bypass (§1) was applied, `requireAdminAction()` succeeded, and the server actions worked correctly. Added `console.log("[receipt-review] ...")` for future debugging.

### Key lesson
When server actions appear "dead" (no visible change), check:
1. Vercel Runtime Logs for `[receipt-review]` or `[authz]` entries
2. Whether `requireAdminAction()` is throwing (auth issue, not action issue)
3. Whether `redirect()` in catch block is silently redirecting back to same page

## 4. Admin catalog CRUD pattern (commit ae58ca7)

### Architecture
- Server actions in `src/app/admin/vendors/actions.ts` and `src/app/admin/menu-items/actions.ts`
- All guarded by `requireAdminAction()` (Prisma-based auth check)
- Image upload via `POST /api/admin/upload-image` (FormData, service_role key, Supabase Storage)
- Soft-delete sets `deletedAt` (never hard-delete)
- Vendor delete BLOCKED if active orders exist (status in PENDING_RECEIPT through READY_FOR_PICKUP)
- Slug auto-generated from name, unique per vendor

### Image upload route
```typescript
// src/app/api/admin/upload-image/route.ts
// POST FormData with "file" + "bucket" fields
// Accept: jpeg/png/webp, max 2MB
// Creates bucket idempotently if missing
// Returns { url: "https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>" }
```

### Responsive UI
- Tables wrapped in `overflow-x-auto` for mobile
- Sticky headers where applicable
- Empty states with icon + message
- Touch targets ≥44px
- Nusantara Warmth design (terracotta #9f3d00, Plus Jakarta Sans, card 24px radius)
