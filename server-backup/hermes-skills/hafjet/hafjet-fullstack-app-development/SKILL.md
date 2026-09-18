---
name: hafjet-fullstack-app-development
description: "Use when building HAFJET Next.js, Prisma and Supabase apps."
tags: [hafjet, nextjs, prisma, supabase, rtx, postgres, rls]
---
# HAFJET Full-Stack App Development

Use for HAFJET web application work using Next.js, Prisma/PostgreSQL, and optionally Supabase Auth/Storage. It covers safe local development, database integrity, auth/RLS review, and phase-gated delivery.

## Working-location and safety gate

1. Confirm the explicitly approved development host and absolute project path before changing files.
2. Keep development databases disposable and loopback-only. Never run a migration, seed, storage operation, or RLS policy against production/Supabase unless the user separately approves that exact environment.
3. Keep phase scope locked: finish, test, commit, and report the current task before starting the next task.
4. Use an SSH jump only as transport when needed; the project files and commands must run on the approved target host.

## Prisma/PostgreSQL integrity workflow

- Pin matching `prisma` and `@prisma/client` versions; generate the client after each schema/migration change.
- For the HAFJET Kitchen single-vendor invariant, make `OrderItem.vendorId` participate in both composite relations:
  - `OrderItem(orderId, vendorId) -> Order(id, vendorId)`
  - `OrderItem(menuItemId, vendorId) -> MenuItem(id, vendorId)`
- Retain composite unique constraints on referenced models. Application-layer checks are insufficient.
- Put database-only validation in migration SQL `CHECK` constraints: commission `0..100`, nonnegative money/stock, and positive order quantity.
- Prove guards against a real disposable PostgreSQL database: cross-vendor order item, cross-vendor menu item, duplicate receipt, invalid commission, and non-positive quantity.

### Raw SQL fixture pitfall

Prisma's `@updatedAt` is set by Prisma Client, not automatically by PostgreSQL. Raw SQL fixtures must explicitly provide `"updatedAt" = now()` for every affected table, or use a deliberate database default. Otherwise a fixture NOT NULL error masks the constraint being tested.

## Supabase Auth, RLS, and private receipts

- Use `@supabase/ssr` cookie-aware browser/server clients. On server, identify a user with `auth.getUser()`; do not authorize from `getSession()` or user-editable metadata.
- Resolve roles from a server-side `profiles` row keyed by verified `auth.uid()`.
- Authorization helpers must be testable and include authenticated profile lookup, `requireRole`, `requireOrderOwner`, and `requireAdminOrStaff`.
- Write RLS as reviewable SQL before any production application. Enable RLS; use `TO authenticated` with ownership predicates and `WITH CHECK` for updates. Never use `SECURITY DEFINER` as a shortcut.
- Keep receipt objects in a private `order-receipts` bucket. Upload and signed URL creation are server-mediated after verified owner/admin/staff authorization. Never expose a service-role key to browser code.
- **Pluggable `ReceiptStorage` interface** (`src/lib/storage.ts`): abstracts blob storage so tests run with `LocalReceiptStorage` (writes to `/tmp/`) while production swaps to S3/Supabase via `ReceiptStorage.fromEnv()`. Do not touch `receipts.ts` when swapping.
- **Typed error hierarchy**: `ReceiptUploadError` (INVALID_TYPE / FILE_TOO_LARGE / ORDER_NOT_FOUND), `RejectNoteRequired`, `ForbiddenError` — callers map these onto HTTP responses.
- **Review flow**: APPROVE sets Receipt→APPROVED + Order→PAYMENT_CONFIRMED (not PREPARING). REJECT requires a note (else throws); Receipt→REJECTED, Order stays PAYMENT_UNDER_REVIEW so customer can re-upload via `createReceiptRevisionForUpload`.

## RTX remote workflow (hafjet-kitchen on 100.119.32.87)

- Transport is a double SSH hop: `ssh hafizi145@hafjet-pc-office 'ssh -i "$HOME/.ssh/id_ed25519_office2rtx" hafjet@100.119.32.87 "..."'`. Project lives at `/home/hafjet/projects/hafjet-kitchen`.
- File transfer: `tar` pipe through the same double hop (`tar czf - <files> | ssh ... "cat > /tmp/x.tgz && cd <project> && tar xzf /tmp/x.tgz"`). Plain `scp -o ProxyJump=` gets flagged by command safety scans; the tar pipe is the reliable pattern.
- The disposable task Postgres container (`hafjet-kitchen-task2-postgres`, 127.0.0.1:55432) is NOT guaranteed to still exist — `docker ps -a` first, and recreate it with `docker run -d --name ... -e POSTGRES_USER/PASSWORD/DB -p 127.0.0.1:55432:5432 postgres:16-alpine` + `prisma migrate deploy` if missing. Guard SQL in `prisma/sql/` is already embedded in the init migration; do not re-apply it (constraint-exists error).
- Pass `DATABASE_URL=postgresql://...@127.0.0.1:55432/...?schema=public` inline per command; the project has no `.env`.

## Idempotent seeding (prisma/seed.ts)

- Upsert everything by its natural unique key (slug, composite `vendorId_slug`). For child rows with NO unique constraint (e.g. `MenuItemOption`), assign deterministic UUIDs derived from the seed data and upsert by `id`.
- Put reset fields (`isAvailable`, `isFeatured`, `deletedAt: null`, status) in the upsert's `update` branch too — re-running the seed then restores the baseline after tests mutate rows.
- Guard the run-on-exec behavior with `if (process.argv[1]?.endsWith("seed.ts"))` so tests can `import { seed }` without side effects.
- Run the seed twice back-to-back to prove idempotency before trusting it.

## Shared-DB vitest integration suites

- When multiple integration test files hit the same disposable Postgres and any of them TRUNCATEs tables, they MUST NOT run in parallel — set `fileParallelism: false` in `vitest.config.ts`. Symptom: a file passes in isolation but fails in the suite with missing-row errors.
- Tests that mutate seeded rows should snapshot-restore in `finally` (reset `deletedAt`/`isAvailable`) so file order never matters.
- For a true RED phase when the module under test already exists locally, temporarily `mv` it aside and rerun (import failure = RED), then restore.

## TDD and verification

1. Capture a RED focused test before implementation.
2. Implement then rerun until GREEN.
3. Run focused integration tests, lint, typecheck, and unit suite.
4. Commit only the current task after checks pass; state whether SQL was merely reviewed or applied to a disposable DB.

## Status
**FASA 2 CORE COMPLETE (22–23 Aug 2026) — Tasks 1–11 all approved & committed on RTX master:**

| Task | Scope | Commit |
|------|-------|--------|
| 1 | Baseline + quality gates | `75a6e44` |
| 2 | Schema, composite FK, CHECK guards | `474bc0b` |
| 3 | Supabase SSR/authz/RLS design | `9de6f12` |
| 4 | Catalog seed + read-only queries | `7cc9f4c` |
| 5 | Cart lock + order creation tx | `2002db6` |
| 6 | Receipt upload/revision/review | `069b98c` |
| 7 | State machine + pickup code + notifications | `b12332c` |
| 8 | VendorPayout settlement | `9bd1d3d` |
| 9 | Customer storefront 8 pages | `2097c6c` |
| 10 | Admin console 7 sections (dual role guards, ADMIN_DEV_IMPERSONATION fallback) | `6a3f744` |
| 11 | Schema verifier 38/38 read-only, release-readiness tests, runbooks, security doc | `55135f6` |
| UI | Nusantara Warmth UI polish (12 screens, Tailwind v4 tokens, bottom nav) | `b501c70` |
| F3 | Vendor portal — dashboard, orders, menu CRUD, profile (isolation tests) | `7de8862` |
| 4A | Production prep docs — env template, setup guides, migration plan, checklists, runbooks, marketing prep | `831007e` |

**Production go-live (23 Aug 2026):** Supabase migration applied (38/38 verified); RLS + private bucket `order-receipts` active; catalog seeded (5 categories, 3 vendors, 11 items); GitHub repo pushed (`2024866732/hafjet-kitchen` private); Vercel project imported + domain `makan.hafjet.my` LIVE (SSL OK, all pages 200).

**Production fixes (post go-live):**
| Commit | Fix |
|--------|-----|
| `296dafd` | Prisma client singleton for serverless (always cache on globalThis) |
| `9a7d8a5` | iOS receipt upload — accept HEIC, lenient MIME, no FileReader, better error handling |
| `091dabe` | Admin login page + resilient auth guard (no 500 on /admin) |
| `57c5d42` | Move login to top-level `/login` — route groups 404 on Vercel production |
| `974442b`+`90a1406` | Admin layout guard skip for login path (intermediate attempts) |
| `76f8c11` | Fix Vercel deploy blocked by invalid author email (`@localhost` → `syahrulhafizi101@gmail.com`) |
| `ba47ae6` | Auth callback + reset password pages, Supabase URL config docs |

**Unresolved:** Vercel was not auto-deploying due to invalid commit author email (`hafjet-kitchen@localhost`) — fixed with `git config user.email "syahrulhafizi101@gmail.com"`. Also verify Vercel Dashboard → Settings → Git → Production Branch = `master` with auto-deploy enabled. See `references/production-serverless-pitfalls.md` §7b, §10.

Final gates: unit 1/1 + integration **73/73** green; lint 0 errors; build green without DATABASE_URL; `npm run db:verify` 38/38 PASS.

## Reporting

```text
TASK N COMPLETE
- Commit hash:
- Integration tests: PASS / FAIL (summary)
- Confirmation invariant/authorization works: Ya/Tidak
- Important issues:
- Ready for Task N+1: Ya (tunggu approval)
```

## Reference

- `references/hafjet-kitchen-task2-integrity.md` — proven Task 2 local PostgreSQL integrity approach.
- `references/hafjet-kitchen-task4-catalog.md` — Task 4 catalog seed + read-only queries: RTX jump-host workflow, disposable-DB recreation, idempotent seed patterns, shared-DB vitest pitfalls.
- `references/hafjet-kitchen-task5-order-transaction.md` — Task 5 cart vendor lock + server-authoritative order creation: Prisma.Decimal money math, atomic stock decrement, rollback proof tests.
- `references/hafjet-kitchen-task6-receipts.md` — Task 6 private receipt upload/review: `ReceiptStorage` interface, transactional upload + review actions, APPROVE/REJECT flow, LocalReceiptStorage for tests.
- `references/hafjet-kitchen-task8-payouts.md` — Task 8 commission settlement: createVendorPayout/markPayoutPaid/voidPayout design, Prisma.Decimal TS widening pitfall, payout test fixture patterns, stdin-cat file transfer to RTX.
- `references/hafjet-kitchen-task9-storefront.md` — Task 9 customer pages (commit 2097c6c): 8-page Server Component + server-action layout, guest find-or-create-by-phone identity, cart conflict UX, Next 15 Promise params / Decimal serialization gotchas, force-dynamic + `env -u DATABASE_URL npm run build` gate, tar-over-double-hop transfer (scp ProxyJump blocked by raw-IP scan).
- `references/hafjet-kitchen-task11-release-readiness.md` — Task 11 (commit 55135f6, Fasa 2 core complete): read-only pg_catalog schema verifier (`npm run db:verify`) patterns, node-pg array-param/agg-string pitfalls, release-readiness test consolidation, runbooks + security review docs.
- `references/hafjet-kitchen-task10-11-admin-release.md` — Task 10 admin console pattern (layout+action dual guards, ADMIN_DEV_IMPERSONATION fallback, state-machine-only order actions) & Task 11 release audit (read-only schema verifier 38 checks incl. pg array_agg-as-string pitfall, release-readiness tests, runbooks, security doc).
- `references/hafjet-kitchen-ui-polish.md` — UI Polish pass ("Nusantara Warmth" Stitch design): token palette, screen→page mapping, visual-only constraint, zip-extract + reference-transfer workflow.
- `references/hafjet-kitchen-fasa3-4a-prep.md` — Fasa 3 vendor portal isolation pattern + Fasa 4A production prep: Supabase IPv6-only direct host vs pooler workaround, Python socket/SSL DB probe (no psql), `.env.production.local` secret handling + gitignore verification, verification scripts (check:env / verify:production), go-live runbooks list.
- `references/hafjet-kitchen-golive-supabase-vercel.md` — actual production go-live execution: session-pooler migration, statement-split RLS apply (dollar-quote blocks), `sb_secret_` keys need `apikey` header on Storage REST, bucket creation, GitHub push via existing gh CLI, Supabase/Vercel MCP OAuth machine-locality.
- `references/production-serverless-pitfalls.md` — consolidated production pitfalls: Prisma singleton for serverless, Supabase pooler config, new API keys, iOS Safari file upload, RLS SQL application, admin auth guard resilience, admin login route group pattern, iOS HEIC support, user workflow preferences, Vercel deploy blocked by invalid author email (§10), Supabase auth recovery/magic link URL config (§11).
- `references/hafjet-kitchen-build-log.md` — running build log: current task status (Tasks 1–11 complete — Fasa 2 core selesai, commit 55135f6), locked stack decisions, key modules map, verification gates. Update after each approved task.

## User workflow preferences (Kitchen phase)

- User approves tasks in batches and wants LARGE autonomous scope: when he says "skop lebih besar / kurangkan bolak-balik", finish ALL approved tasks before reporting — no small status updates in between.
- Strict TDD RED→GREEN is the default only while he asks for it; he may explicitly loosen it ("boleh kurangkan TDD ketat") for speed — implement then verify.
- Always report in the exact `TASK N COMPLETE` format with commit hash, component status lines, test counts, and `Ready for Task N+1: Ya (tunggu approval)`. Never start the next task without his explicit approval line.
- After any subagent completes a task, independently re-run lint/typecheck/tests on the target host and confirm the commit hash before reporting — subagent summaries can drift from reality (e.g. uncommitted files, stale DB container).
- A subagent that exhausts its iteration budget may still have finished the actual work (files written, tests green) but left it UNCOMMITTED. Before re-dispatching, check the target repo: verify lint/typecheck/tests yourself and commit if clean — re-dispatching repeats paid work.
- When the user hands over production secrets in chat, immediately write them to a gitignored local env file on the target host (chmod 600), prove `git check-ignore` passes, and never echo values back into chat or commits. Mask secrets in all reports.
- Supabase direct DB hosts are IPv6-only; IPv4-only dev machines must use the Supabase pooler hostname instead (see Fasa 4A reference). Verify connectivity with a small socket/TLS probe when psql is unavailable rather than declaring the project unreachable.
- Env template files need an explicit `.gitignore` exception (`!.env.production.example`) or they silently stay untracked.
- Supabase production apply patterns (all proven 23 Aug 2026): migrations via **session pooler :5432** (`postgres.<ref>` user; pgbouncer :6543 fails P1000); RLS applied statement-by-statement keeping dollar-quoted function blocks whole; `storage.objects` ALTER fails with "must be owner" — platform-managed, skip it; Storage REST needs new `sb_secret_` keys on the **`apikey` header** (Bearer alone → "Invalid Compact JWS").
- Production catalog seed (approved 23 Aug 2026, era 831007e): `prisma/seed.ts` creates only categories/vendors/menu-items plus the FK-required VENDOR-role profiles — acceptable under "no fake orders/customers" since vendor profiles are schema-mandated; state this explicitly in the report. Seed ran via session pooler :5432 after an auth probe (`select count(*) from information_schema.tables`) proved credentials. Verify post-seed with per-table counts (categories=5, vendors=3 [2 ACTIVE/1 INACTIVE], menu_items=11, orders/receipts/payouts=0).
- `.env.production.local` drift trap: a worker or earlier edit may leave a `[YOUR-PASSWORD]` placeholder in DATABASE_URL even though DIRECT_URL holds the real password. Before any production run, extract and mask-check the actual password portion (sed between `://user:` and last `@aws-0`), test auth with a one-query node-pg probe, then fix the env file.
- Homepage/preview verification when no Vercel CLI exists on the target host: verify via DB counts + tell the user to open the preview URL himself rather than guessing domain patterns.
- MCP OAuth tokens are machine-local: authorization completed on one machine does not carry to another Hermes host — each needs its own interactive `hermes mcp login <name>`; the CLI has no `mcp call`, so invoking MCP tools from an agent session requires a toolset reload or a subagent that loads them.
- **Admin auth guard 500 fix (commit 091dabe):** `getCurrentProfile()` must be wrapped in try-catch returning null (not throw) — a Supabase env/session error propagating through `requireAdminPage()` → `admin/layout.tsx` crashes the page with 500. Redirect target for unauthenticated admin should be `/login` (top-level, NOT `/admin/login` — route groups don't work on Vercel production; see `references/production-serverless-pitfalls.md` §7).
- **Admin login page (commit 091dabe, corrected `57c5d42`):** Login page must live at `src/app/login/page.tsx` (top-level `/login`), NOT under `src/app/admin/` or in a route group `(auth)`. Route groups build locally but 404 on Vercel production. Login flow: Supabase `signInWithPassword` → fetch `/api/auth/check-role` → redirect `/admin` for ADMIN/STAFF, signOut + reject CUSTOMER.
- **iOS HEIC upload (commit 9a7d8a5):** route handler must accept `.heic`/`image/heic`/`image/heif` and store as `image/jpeg` (admin preview can't render HEIC). The `uploadReceipt()` lib's `ALLOWED_MIME_TYPES` stays unchanged — route converts before delegating.
- **Subagent iteration-budget exhaustion:** a subagent that hits max_iterations may still have completed the work (files written, tests green) but left it UNCOMMITTED. Before re-dispatching, check the target repo: verify lint/typecheck/tests yourself and commit if clean — re-dispatching repeats paid work.
- **Vercel deploy blocked by invalid author email (commit `76f8c11`):** always set `git config user.email "syahrulhafizi101@gmail.com"` and `git config user.name "2024866732"` on any fresh clone before pushing. Vercel silently skips builds with `@localhost` or other invalid author emails — push succeeds but no deployment triggers.
- **Supabase auth recovery/magic link (commit `ba47ae6`):** for password reset emails and magic link to work, Supabase Dashboard → Authentication → URL Configuration must have Redirect URLs set (`/auth/callback`, `/auth/reset-password`, `/login`, `/**`). Without these, the email link redirects to the homepage and the user never sees the password form. See `references/production-serverless-pitfalls.md` §11.
- **Azure box disk full (Aug 2026):** the 1GB-RAM Azure server's 29GB disk can fill up (97%+) during npm ci/build of cloned repos. If `npm ci` fails with `ENOSPC`, clean `~/.npm` cache (`rm -rf ~/.npm`) and remove `node_modules`/`.next` from /tmp clones. Do not run heavy builds on the Azure box — use RTX or Vercel for builds.
