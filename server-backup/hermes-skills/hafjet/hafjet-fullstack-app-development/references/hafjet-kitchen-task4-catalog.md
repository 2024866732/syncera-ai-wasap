# hafjet-kitchen Task 4 — catalog seed + read-only queries (commit 7cc9f4c)

Session-specific detail backing the SKILL.md sections on RTX workflow, idempotent seeding, and shared-DB vitest.

## Environment facts (as of 2026-08-22)

- RTX host `hafjet@100.119.32.87`, project `/home/hafjet/projects/hafjet-kitchen`, master baseline `9de6f12`.
- Scripts: `db:seed` (tsx prisma/seed.ts), `test:integration` (vitest run tests/integration), lint, typecheck all exist.
- No `.env` — always export DATABASE_URL inline for prisma/vitest commands.
- Disposable DB container had been REMOVED between tasks; recreated:
  `docker run -d --name hafjet-kitchen-task2-postgres -e POSTGRES_USER=hafjet -e POSTGRES_PASSWORD=hafjet_task2_dev_only -e POSTGRES_DB=hafjet_kitchen_task2 -p 127.0.0.1:55432:5432 postgres:16-alpine`
  then `npx prisma migrate deploy`. `prisma/sql/0001_database_guards.sql` must NOT be re-applied (its constraints ship inside the init migration).

## Seed design that worked

- Categories/vendors/menu items upserted by unique slug / composite `vendorId_slug`.
- MenuItemOption has no natural key → fixed UUIDs (`c0000000-...0001`) per option, upsert by `id`, update branch re-pins menuItemId.
- Vendor owner Profiles created first with fixed UUIDs (Vendor.userId is required).
- Third vendor seeded as INACTIVE ("gerai-tutup") so tests can assert hiding without mutating.
- One item seeded with `isAvailable: false` ("roti-john-special") to prove unavailable exclusion from data alone.
- Update branches include `isAvailable/isFeatured/deletedAt/status` resets → seed restores test-mutated rows.
- Exported `async function seed()`; CLI execution guarded by `process.argv[1].endsWith("seed.ts")`.

## Catalog query visibility rules (src/lib/catalog.ts)

- categories: isActive && deletedAt null, orderBy sortOrder asc
- vendors: status ACTIVE && deletedAt null
- menu items: isAvailable && deletedAt null
- options: isAvailable && deletedAt null, orderBy groupName then sortOrder
- getVendorStore groups items by category preserving category sortOrder.
- Prisma singleton lives in src/lib/db.ts (globalThis guard).

## Pitfalls hit

1. Test used `new Map(options.map(o => [o.groupName, o.name]))` — duplicate group names overwrite; last option won ("Large" over "Regular"). Assert per-group arrays instead: `options.filter(o => o.groupName === "Saiz").map(o => o.name)` equals `["Regular","Large"]`.
2. Leftover `export type CatalogItem = Prisma.Payload<Prisma.MenuFindManyArgs>` without the Prisma import broke typecheck (TS2503) — removed dead export.
3. Adding a third integration file exposed parallel-file race: schema-integrity TRUNCATEs profiles/categories CASCADE while catalog.test.ts reads seed rows → file passed alone, failed in suite. Fix: `fileParallelism: false` in vitest.config.ts.
4. Command-safety scans block `scp -o ProxyJump=<raw IP>` and heredoc scripts; tar-over-double-ssh pipe and the patch/write_file tools are the accepted paths.

## Verification evidence

- SEED_TWICE_OK (two consecutive db:seed runs).
- RED: catalog.ts moved aside → import failure; GREEN: 6/6 catalog tests.
- Full gates: lint ✓, typecheck ✓, integration 14/14 ✓ (3 files), unit 1/1 ✓.
