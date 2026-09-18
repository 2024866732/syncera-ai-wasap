# Production Serverless Pitfalls (Prisma + Supabase + Vercel)

Lessons from HAFJET Kitchen production deployment (Aug 2026).

## 1. Prisma Client Singleton (CRITICAL for Vercel serverless)

Always cache PrismaClient on `globalThis`, even in production. The common
`if (NODE_ENV !== 'production')` guard skips caching in prod → every
serverless invocation creates a new PrismaClient → exhausts the Supabase
pooler connection pool (EMAXCONNSESSION, pool_size 15) → intermittent 500s
under concurrent load.

**Correct pattern (`src/lib/db.ts`):**
```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma;
```

## 2. Supabase Pooler Configuration for Serverless

- **Session pooler** (port 5432, pool_size 15) → `EMAXCONNSESSION` under
  concurrent serverless load. NOT suitable for Vercel serverless.
- **Transaction pooler** (port 6543) with
  `?pgbouncer=true&connection_limit=1&schema=public` is correct for
  serverless runtime.
- `DIRECT_URL` (port 5432, direct host `db.*.supabase.co`) for migrations
  only, not runtime.
- `db.*.supabase.co` is **IPv6-only** — machines without IPv6 (e.g. WSL)
  must use pooler (`aws-0-*.pooler.supabase.com`) for all access.

## 3. Supabase New API Keys (sb_secret_ / sb_publishable_)

- Storage REST API requires the `apikey` header, NOT just
  `Authorization: Bearer`.
- Sending new-format keys (`sb_secret_...`) on `Authorization: Bearer`
  only → "Invalid Compact JWS" error (403).
- Legacy JWT keys work on `Authorization: Bearer`; new-format keys do not.
- Always send both headers: `apikey: <key>` + `Authorization: Bearer <key>`.

## 4. iOS Safari File Upload

- `FileReader.readAsDataURL()` fails on iOS Safari camera/photo picker.
- iOS may report empty or `application/octet-stream` MIME for camera photos.
- **Fix:** Use `FormData` + multipart route handler (App Router
  `src/app/api/.../route.ts`); accept by file extension when MIME is
  empty/unknown; `await file.arrayBuffer()` → `Buffer.from(arrayBuffer)`.
- Do NOT use `FileReader` for file transfer in production client code.

## 5. Supabase RLS SQL Application

- `prisma db execute --stdin` splits on `;` naively and breaks dollar-quoted
  function bodies (`$$...$$`). Apply function/trigger SQL as a single
  statement.
- `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` fails with
  "must be owner of table objects" via pooler — this is normal and safe;
  Supabase platform manages storage.objects RLS by default.

## 6. Admin Auth Guard Resilience (500 crash on /admin)

- `getCurrentProfile()` in `src/lib/authz.ts` calls `createClient()` (supabase
  server client) which throws `"Missing public Supabase environment
  configuration"` if env vars are missing or the session cookie is in a bad
  state. In production this propagated through `requireAdminPage()` →
  `admin/layout.tsx` → 500 "Application error: server-side exception".
- **Fix:** wrap the entire `getCurrentProfile()` body in `try { ... } catch
  { return null; }` — never let a Supabase client error crash a server
  component. Return null (treated as unauthenticated) and let the guard
  redirect cleanly.
- **Redirect target:** `requireAdminPage()` should redirect to `/admin/login`
  (not `/` home) so unauthenticated admin visitors land on the login page.

## 7. Admin Login Page — Top-Level /login Pattern (NOT route groups)

- **Route groups `(auth)` DO NOT work reliably on Vercel production.**
  `src/app/(auth)/admin/login/page.tsx` builds locally (route shows in
  `npm run build` output) but serves **404 on Vercel** — the CDN/edge
  doesn't resolve the route group path. This was proven on 23 Aug 2026:
  4 pushes to `origin/master`, all with the route group page, all served
  404 on `https://makan.hafjet.my/admin/login` while local build showed
  `○ /admin/login 72 kB`.
- **Correct pattern:** put the login page at a **top-level path** that is
  NOT under any guarded layout directory:
  `src/app/login/page.tsx` → URL `/login`. The admin layout guard
  (`src/app/admin/layout.tsx`) redirects unauthenticated users to `/login`
  (not `/admin/login`).
- Login flow: client component uses `createClient()` from
  `@/lib/supabase/browser.ts` → `signInWithPassword` → then `fetch
  /api/auth/check-role` (server route that calls `getCurrentProfile()`) →
  redirect to `/admin` if role is ADMIN/STAFF, reject CUSTOMER with signOut.
- The `/api/auth/check-role` route is a simple GET returning `{role, id}`
  or 401 `{role: null}`.
- **Layout guard redirect target:** `requireAdminPage()` in
  `src/lib/admin-auth.ts` should redirect to `/login` (not `/` home, not
  `/admin/login`).

## 7b. Vercel CDN Stale-404 Caching

- When a route doesn't exist in an old deployment, Vercel CDN caches the
  404 response (`x-vercel-cache: HIT`, `age: 1000+`). After deploying a
  new build that adds the route, the CDN may continue serving the stale
  404 for minutes. Query-parameter cache-busting (`?cb=<timestamp>`) and
  `Cache-Control: no-cache` headers do NOT always purge it.
- The stale 404 has `content-disposition: inline; filename="404"` and
  `accept-ranges: bytes` — signs it's a CDN-cached static 404, not a
  dynamic route response.
- **If this happens:** verify the new deployment is actually Ready in
  Vercel Dashboard → Deployments. If auto-deploy is disabled or the webhook
  is broken, manual redeploy is needed. Do not assume the code is wrong
  when local build succeeds but production 404s — check Vercel deploy status.

## 8. iOS HEIC Support

- iOS default photo format is HEIC (`image/heic` / `image/heif`). The
  `accept` attribute on the file input should include `.heic` and
  `image/heic`.
- HEIC files should be stored as `image/jpeg` MIME (browsers and admin
  preview cannot render HEIC). Substitute canonical MIME from extension in
  the route handler before calling `uploadReceipt()`.
- The `ALLOWED_MIME_TYPES` set in `src/lib/receipts.ts` does NOT include
  HEIC — the route handler must convert before delegating, not add HEIC to
  the lib's allowlist (that would let raw HEIC bytes into storage).

## 9. User Workflow Preference

Tuan Hafizi prefers large-scope autonomous batches (e.g. "complete Tasks 5+6
together before reporting"), with reports only at task boundaries using
pre-specified formats. Do not ask small clarifying questions during
autonomous execution — iterate and fix forward instead.

## 10. Vercel Build Blocked by Invalid Author Email

Vercel silently blocks deployments when the git commit author email is
invalid (e.g. `hafjet-kitchen@localhost`). The push succeeds on GitHub,
but Vercel never triggers a build — no error, no notification, just silence.

**Symptom:** push confirmed on `origin/master`, but production still serves
old code indefinitely. No new deployment appears in Vercel Dashboard.

**Fix:** set a valid GitHub-matching email before any push:
```bash
git config user.email "syahrulhafizi101@gmail.com"
git config user.name "2024866732"
```
Then make an empty commit to trigger: `git commit --allow-empty -m "chore: trigger deploy" && git push origin master`.

**Prevention:** always set `git config user.email` to Tuan's GitHub email
(`syahrulhafizi101@gmail.com`) on any fresh clone or new repo before first push.

## 11. Supabase Auth Recovery / Magic Link URL Configuration

For password reset emails and magic link login to work, Supabase Dashboard
must have correct Redirect URLs configured:

**Dashboard path:** Authentication → URL Configuration

**Required settings:**
- Site URL: `https://makan.hafjet.my`
- Redirect URLs (add ALL):
  - `https://makan.hafjet.my/auth/callback`
  - `https://makan.hafjet.my/auth/reset-password`
  - `https://makan.hafjet.my/login`
  - `https://makan.hafjet.my/**`

**Auth callback flow (`/auth/callback`):**
1. Supabase email link redirects to `https://makan.hafjet.my/auth/callback?type=recovery...`
2. Client calls `supabase.auth.exchangeCodeForSession(window.location.href)`
3. Detect `type=recovery` in URL hash → redirect to `/auth/reset-password`
4. For magic link: check role via `/api/auth/check-role` → redirect to `/admin` (ADMIN/STAFF) or `/` (CUSTOMER)

**Reset password page (`/auth/reset-password`):**
1. User already has a valid session (from callback exchange)
2. Call `supabase.auth.updateUser({ password })` with min 8 chars + confirm match
3. Sign out after success → redirect to `/login`

**Pitfall:** if Redirect URLs are NOT set in Supabase dashboard, the email
link redirects to the Site URL (homepage) and the user never sees the
password reset form — they just land on the homepage with no clear action.
