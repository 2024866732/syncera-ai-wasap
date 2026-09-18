# HAFJET Kitchen build log & conventions (Tasks 1–9, Aug 2026)

Session-specific detail backing `hafjet-fullstack-app-development`. Update after each approved task.

## Environment
- All coding on RTX WSL box (user hafjet, /home/hafjet/projects/hafjet-kitchen). PC Office is SSH jump/transport ONLY.
- Reach RTX via PC Office jump with the office→RTX key (`~/.ssh/id_ed25519_office2rtx` on Office); Tailscale accept mode ON. Raw-IP writes from subagents may still hit approval gates — ask user, then run autonomously.
- Disposable Postgres container on RTX loopback :55432 (`hafjet-kitchen-task2-postgres`, hafjet/hafjet_task2_dev_only/hafjet_kitchen_task2). Recreate with docker run if missing; never touch Frigate/Buzz containers.
- Vitest integration suite uses `fileParallelism: false` — shared-DB test files TRUNCATE and race otherwise.

## Stack decisions (locked)
- Prisma pinned 6.19.1 (NOT 7.x — plan schema uses v6 semantics). Money/commission always Prisma.Decimal, toFixed(2); never floats.
- 1 Order = 1 Vendor enforced at DB level: composite FKs OrderItem(orderId,vendorId)→Order(id,vendorId) and (menuItemId,vendorId)→MenuItem(id,vendorId). CHECK guards appended into the init migration (prisma/sql/0001_database_guards.sql).
- RLS/storage SQL is reviewable-only (prisma/sql/0002_rls_storage_policies.sql); never applied outside disposable DB. No service_role in browser code.
- Receipts: one active Receipt per order (orderId @unique) + ReceiptRevision audit chain; storage behind a swappable ReceiptStorage interface (src/lib/storage.ts, LocalReceiptStorage for tests).
- Server-side truth: createOrder recomputes ALL prices server-side (client prices ignored), single interactive transaction, atomic stock decrement via updateMany where stockQuantity >= qty, orderNumber HK-YYYYMMDD-XXXX with collision retry.

## Key modules (src/lib)
catalog.ts (read-only queries, isAvailable+deletedAt+ACTIVE vendor filters) · cart.ts (pure vendor-lock helpers) · orders.ts · receipts.ts · order-state.ts (ALLOWED_TRANSITIONS map, guarded updateMany tx, pickupCode at READY only) · payouts.ts (COMPLETED-only, orderId @unique double-claim guard) · authz.ts · db.ts.

## Gotchas found
- Prisma nested create rejects vendorId on compound-FK relation → use explicit createMany for OrderItems inside tx.
- Distinguish CROSS_VENDOR vs ITEM_UNAVAILABLE via unscoped pre-fetch of item vendorIds.
- scp through jump host lands on wrong machine — pipe files over SSH instead.
- Test fixtures must set NOT NULL updatedAt columns explicitly in raw SQL inserts.
- reviewReceipt approve → PAYMENT_CONFIRMED only (never auto READY); reject requires non-empty note.
- Payout snapshots gross/commission verbatim from Order rows; never recompute from items.

## Verification gate per task (user requires live proof)
npm run lint && npm run typecheck && npm test && npm run test:integration (+ npm run build once pages exist). Independently re-run after subagent reports — trust but verify commit hash + suite counts.

## Status
Fasa 2 core COMPLETE (Tasks 1–11, head 55135f6) → UI POLISH "Nusantara Warmth" (**b501c70**, visual only, src/lib untouched; 64/64) → FASA 3 VENDOR PORTAL COMPLETE (**7de8862**, 13 files +1525: /vendor dashboard, orders list + view-only detail, menu list/new/edit CRUD with soft-delete, profile; guards in src/lib/vendor-auth.ts + vendor-portal.ts = requireRole VENDOR + owned vendor; isolation tests prove cross-vendor order read blocked, non-VENDOR roles rejected, non-owner menu mutation blocked — suite **73/73**). Worker hit its iteration cap before committing; orchestrator verified gates itself and committed.

→ FASA 4A PRODUCTION PREP COMPLETE (4e412ad docs + **831007e** pack): env template (+ `.gitignore` exception `!.env.production.example`), supabase-setup / migration-plan-production / vercel-deploy / go-live-checklist / security-production / marketing-agent-plan / supabase-mcp-setup (guide-only) / go-live-day-runbook / runbook-first-24-hours / runbook-receipt-ops (Soundbox cross-check) / runbook-vendor-onboarding / marketing-prep (8 BM ad copies, Raub targeting); scripts check-env-template.sh + verify-production-readiness.sh (`npm run verify:production` = db:verify 38/38 + service_role isolation + impersonation guard + secret scan — ALL PASS).

## Supabase production project (23 Aug 2026)
- Ref `nilvvujozkxkofqxbqhu` (Singapore), created by Tuan Hafizi. Connection verified READ-ONLY: REST /rest/v1/ returns 401 with dummy key = server up + auth enforced; auth health OK.
- **Direct host db.<ref>.supabase.co is IPv6-only** — RTX WSL has no IPv6 route → use pooler `aws-0-ap-southeast-1.pooler.supabase.com` (6543 pgbouncer runtime / 5432 session pooler for migrations from IPv4-only machines).
- `.env.production.local` on RTX (chmod 600; `git check-ignore` confirmed OK); pooler DATABASE_URL password still placeholder. NO migration/deploy/seed/domain/Ads touched.
- Detail: references/hafjet-kitchen-fasa3-4a-prep.md.

## Supabase production migration EXECUTED (23 Aug 2026, approved)
- Tuan approved pooler migration: `npx prisma migrate deploy` + `npm run db:verify` → **38/38 PASS** on production ref `nilvvujozkxkofqxbqhu`.
- **Pooler gotchas:** pgbouncer :6543 string failed auth P1000 for migrations — use **session pooler :5432** with user `postgres.<project_ref>` (NOT plain `postgres`). Prisma reports the datasource host as the pooler; verify via output line.
- **RLS applied to production (approved):** statement-by-statement via `prisma db execute --stdin`; naive `;`-split breaks dollar-quoted function bodies — regex-extract `CREATE OR REPLACE FUNCTION ... $$...$$;` blocks as units. Result: 4 ownership SELECT policies + auth trigger `on_auth_user_created` + `private.handle_new_auth_user()` verified in pg_catalog.
- Expected failure, do not retry: `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` → "must be owner of table objects" — storage.objects RLS is platform-managed and already enabled. Skip it.
- **Bucket created** via Storage REST API: new-style keys (`sb_secret_…`) must be sent on the **`apikey` header** (Authorization Bearer alone → "Invalid Compact JWS" 403). Bucket `order-receipts`: public=false, 10MB limit, MIME jpeg/png/webp/pdf — confirmed via GET.
- `.env.production.local` now holds REAL pooler credentials on RTX (chmod 600, gitignored). Never echo into chat/commits.
- Remaining go-live steps: Vercel import + env, domain makan.hafjet.my, smoke tests per docs/go-live-day-runbook.md — all awaiting Tuan's approval.

## Vercel + GitHub (23 Aug 2026)
- GitHub repo created & pushed via existing `gh` CLI on RTX (account `2024866732`): https://github.com/2024866732/hafjet-kitchen (PRIVATE, master = 831007e). No deploy key needed — gh was already authed.
- Vercel MCP OAuth is machine-local: authorized on one machine does not carry to the Hermes host; `hermes mcp test vercel` confirms Connected + 37 tools after Tuan's interactive login. CLI has no `mcp call` — MCP tools usable only from a session/subagent that loads them.
- **PRODUCTION SEED EXECUTED (approved, catalog-only):** categories=5, vendors=3 (2 ACTIVE/1 INACTIVE), menu_items=11, menu_item_options=10, **orders/receipts/payouts=0**, profiles=3 (VENDOR-role rows mandated by vendor.user_id FK — not fake customers). Ran via session pooler :5432.
- `.env.production.local` drift: DATABASE_URL had a `[YOUR-PASSWORD]` placeholder while DIRECT_URL held the real password — always mask-probe the actual password before production runs and fix the env file.
