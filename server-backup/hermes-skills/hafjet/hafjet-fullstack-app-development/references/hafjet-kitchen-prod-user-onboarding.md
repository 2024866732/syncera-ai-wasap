# Production User Onboarding + Manual Order-Path Smoke (23 Aug 2026, makan.hafjet.my)

Session-specific ops recipe for the HAFJET Kitchen production app after go-live. Complements `hafjet-kitchen-softlaunch-vercel-pooler.md`.

## 1. Create ADMIN / STAFF / VENDOR users in production

Auth trigger `private.handle_new_auth_user()` auto-creates `public.profiles` rows with role `CUSTOMER` whenever a Supabase Auth user is created. So the role elevation is always a second, explicit step.

1. **Create the user first** (either):
   - App signup flow, OR
   - Supabase Dashboard → Authentication → Users → **Add user** (email + password) → Create. This fires the trigger → profile row exists with role CUSTOMER.
2. **Elevate role** in SQL Editor:
   ```sql
   update public.profiles set role = 'ADMIN' where email = 'admin@hafjet.my';
   -- STAFF: role = 'STAFF'
   -- VENDOR: role = 'VENDOR' PLUS link to the stall:
   update public.vendors set "userId" = (select id from public.profiles where email='vendor@hafjet.my')
   where slug = 'warung-mak-cik';
   ```
3. **Verify**:
   ```sql
   select p.email, p.role, v.stallName from public.profiles p
   left join public.vendors v on v."userId" = p.id where p.role in ('ADMIN','STAFF','VENDOR');
   ```
4. Confirm admin route access by logging in → `/admin` loads (not 307 redirect). Never use `ADMIN_DEV_IMPERSONATION` in production.

## 2. Manual order-path smoke checklist (1 real order, no flood)

Customer side:
1. `/shop` → pick a vendor store (e.g. Warung Mak Cik).
2. Add item → Add to Cart.
3. Try adding an item from a second vendor → expect the vendor-lock conflict/clear-cart prompt.
4. `/cart` → verify item list + RM total → Checkout.
5. Fill nama / test phone (e.g. 019-999 9999) / pickup time / nota → submit.
6. Copy order number (`HK-YYYYMMDD-XXXX`) → redirected to `/orders/<orderNumber>/receipt`.
7. Upload a small JPEG/PNG receipt → status `UNDER_REVIEW` / `PAYMENT_UNDER_REVIEW`.

Admin side (with the ADMIN account):
8. `/admin/receipts` → order in queue → preview signed URL → **Confirm Payment** → order `PAYMENT_CONFIRMED` (NOT auto READY).
9. `/admin/orders/<orderNumber>` → **Mark Preparing** → `PREPARING` → **Mark Ready** → `READY_FOR_PICKUP` + pickup code appears.
10. **Complete Pickup** with pickup code → `COMPLETED`.

Verify: `/orders` with test phone shows full timeline; `/admin` orders-today metric +1.

## 3. Local env ≠ Vercel env (secret-reading limitation)

- The agent can verify the RTX `.env.production.local` (gitignored, chmod 600) but **cannot read Vercel environment variables** — they are secrets in Vercel's store.
- After a fix like pooler :6543, always tell the user to confirm the value in **Vercel Dashboard → Settings → Environment Variables** and Redeploy; the agent verifies externally with repeated `curl` (expect 200, no `EMAXCONNSESSION`).

## 4. WhatsApp number default

- `WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? "60169808736"` (src/app/page.tsx). Default is correct (016-980 8736). To change without code edit: set `NEXT_PUBLIC_WA_NUMBER` in Vercel env.
- Vendor model already has `operatingHours Json?` — pickup location/hours UI is still a gap before public launch.

## 5. Production gaps noted at soft-launch (pre-public)

- No real STAFF account, no vendor onboarding UI flow.
- No QR payment instructions page, no operating-hours/pickup-location text UI.
- No error monitoring (Vercel logs only), no rate limiting.
