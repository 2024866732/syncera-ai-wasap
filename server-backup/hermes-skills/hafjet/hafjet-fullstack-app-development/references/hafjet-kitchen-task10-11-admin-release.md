# Task 10 — Admin/Staff Console (commit 6a3f744) & Task 11 — Release Audit (commit 55135f6)

## Task 10: admin pages pattern (src/app/admin/**)

- **Guard layering**: shared admin layout redirects via `requireAdminPage` (page-level); EVERY server action independently calls `requireAdminAction` first. Never rely on layout guard alone — actions are reachable independently of pages.
- **Dev impersonation fallback**: `src/lib/admin-auth.ts` honors `ADMIN_DEV_IMPERSONATION=1` env to resolve an admin profile without Supabase Auth session. Inert unless explicitly set; documented so real Supabase Auth can slot in later without page changes. Must be unset in prod (noted in release-security-review.md).
- **State-machine-only mutations**: order actions (Mark Preparing / Mark Ready / Complete Pickup / Cancel) call `transitionOrder`/`completePickup` exclusively — never direct `prisma.order.update`. Invalid transitions are hidden client-side AND rejected server-side with typed-error → friendly BM message mapping.
- **Receipt review page**: queue = receipts with status UNDER_REVIEW; preview via signed URL from `getReceiptForReview` (ADMIN/STAFF enforced inside the lib); Reject textarea has both client `required` and server `RejectNoteRequired` handling ("Sila tulis catatan sebelum menolak resit.").
- **Vendor status actions** (Approve/Suspend) have no state machine — direct guarded prisma update is acceptable there.
- **Payouts page**: create payout form maps `NoEligibleOrdersError`; mark-paid maps `PaymentReferenceRequiredError`/`InvalidPaymentAmountError`.
- New guard tests: `tests/integration/admin-guards.test.ts` — CUSTOMER rejected by requireAdminOrStaff/requireAdminAction/page-redirect; ADMIN accepted. +4 tests.

## Task 11: schema verifier + release audit

- `scripts/verify-schema.ts` (npm run `db:verify`): strictly read-only (SELECTs against information_schema/pg_catalog), 38 checks: 15 tables, 9 enums w/ exact values, both composite FKs via pg_constraint contype='f', 6 uniques, 6 CHECK guards. Exit non-zero on any failure. Run against disposable DB before any release claim.
- **pg pitfall**: `array_agg` of enum labels comes back as a *string* (e.g. `"{PENDING_RECEIPT,...}"`), not a JS array — parse before comparing.
- Prisma client accessor names are camelCase singular per model: `db.vendorPayoutOrder`, `db.menuItem` (not `vendorPayoutOrders`/`menuItems` when using the singleton client). `currentRevision` field name, not `revision`.
- `tests/integration/release-readiness.test.ts`: 4 end-to-end proofs — DB-level cross-vendor rejection, signed-URL authorization (customer denied/ForbiddenError, staff ok), approve≠READY until explicit transition, double-payout prevention (NoEligibleOrdersError + unique constraint).

## Runbooks + security doc (docs/)

- `docs/runbooks/development-migration.md` — dev/staging migrate steps (nvm, env, migrate dev/deploy, db:verify, seed).
- `docs/runbooks/receipt-incident-response.md` — symptom→diagnosis for upload failures, wrong revisions, stuck UNDER_REVIEW; read-only inspection of receipt_revisions.
- `docs/runbooks/rollback.md` — git revert app rollback; **bold gate: production migration/rollback requires separate explicit approval from Tuan Hafizi**.
- `docs/security/release-security-review.md` — RLS rationale, private bucket design, service_role grep-proof command, server-side money math, admin gating, known gaps (guest phone identity, dev impersonation flag).
