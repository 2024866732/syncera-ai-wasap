# HAFJET Kitchen — Fasa Build History (Aug 2026)

Session log of the full build, condensed for future sessions working on the
same project. Access: PC Office jump `ssh hafizi145@hafjet-pc-office`
→ inner `ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87`.
Project: `/home/hafjet/projects/hafjet-kitchen` (Next.js 15 + Prisma 6.19.1
+ disposable PG `hafjet-kitchen-task2-postgres` on 127.0.0.1:55432).

## Commit chain (one per approved task)

| Task | Commit | Scope |
|------|--------|-------|
| 1 | 75a6e44 | Baseline scaffold, scripts, vitest/playwright configs |
| 2 | 474bc0b | Prisma schema, composite FKs (1 order=1 vendor), CHECK guards |
| 3 | 9de6f12 | Supabase SSR clients, authz helpers, RLS SQL (reviewable), signed-URL design |
| 4 | 7cc9f4c | Catalog seed (5 kategori, 3 vendor demo) + read-only catalog queries |
| 5 | 2002db6 | Cart vendor lock + secure server-side order creation (Prisma.Decimal) |
| 6 | 069b98c | Receipt upload/revision/review (MIME allowlist, 10MB, reject wajib note) |
| 7 | b12332c | Order state machine, pickup code (READY only), notifications |
| 8 | 9bd1d3d | VendorPayout settlement (double-claim prevented by orderId @unique) |
| 9 | 2097c6c | Customer storefront 8 pages |
| 10 | 6a3f744 | Admin console 8 files (guarded layout + per-action guards) |
| 11 | 55135f6 | Schema verifier (38/38), release-readiness tests, runbooks, security doc |
| UI polish | b501c70 | Nusantara Warmth tokens/fonts/bottom-nav, visual only |
| Fasa 3 | 7de8862 | Vendor portal 7 pages + vendor-auth/vendor-portal libs |

## Key invariants baked into the codebase

- Composite FKs `order_items(order_id,vendor_id)` and `(menu_item_id,vendor_id)`
  enforce 1-order-1-vendor at DB level.
- All money via `Prisma.Decimal`; prices recomputed server-side in
  `createOrder`; client prices ignored.
- Order transitions only via `transitionOrder` ALLOWED_TRANSITIONS map;
  COMPLETED/CANCELLED terminal; approve payment stops at PAYMENT_CONFIRMED.
- Pickup code generated only at READY_FOR_PICKUP; visible only to owner/admin-staff.
- Receipts: one active per order (`orderId @unique`) + ReceiptRevision audit trail.
- Payouts snapshot gross/commission from Orders; `vendor_payout_orders.order_id @unique`.
- Admin guard: layout redirect (`requireAdminPage`) + every action
  (`requireAdminAction`); dev impersonation flag `ADMIN_DEV_IMPERSONATION`
  must be unset in prod.
- Vendor portal: requireRole VENDOR + ownership via `Vendor.userId`;
  all queries filtered by owned vendorId.

## Verification convention

```bash
DATABASE_URL=postgresql://hafjet:hafjet_task2_dev_only@127.0.0.1:55432/hafjet_kitchen_task2?schema=public \
  npm run test:integration   # 73 tests green as of Fasa 3
npm run db:verify             # 38/38 schema checks, read-only
env -u DATABASE_URL npm run build
```

vitest config has `fileParallelism: false` (shared disposable DB).

## Known gaps carried forward (documented, not yet fixed)

- Guest checkout identifies customer by phone (localStorage) until Supabase
  Auth wired end-to-end in UI.
- No CSP headers; no rate limiting beyond platform limits.
- RLS/storage policies are reviewable SQL only — not applied to any live DB.
- Production env: RTX `.env` intentionally has empty DATABASE_URL; pass inline.
