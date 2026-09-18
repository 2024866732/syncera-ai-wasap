# Task 5 — Cart vendor lock + secure order creation (HAFJET Kitchen)

Session-proven approach for implementing server-authoritative cart/order logic on the
RTX hafjet-kitchen project. See SKILL.md for host/transport/DB setup.

## Cart vendor lock (`src/lib/cart.ts`)

- Keep the cart as a pure data shape; `addItem(cart, menuItem, qty)` returns
  `{ ok }` or `{ conflict: true, currentVendorId }` when the cart holds another
  vendor's item. Never allow mixed-vendor state to exist at all — the caller must
  confirm "clear cart" before the new vendor's item is added.
- Pure logic module, no DB access: unit-testable and reusable across API routes.

## Secure order creation (`src/lib/orders.ts`)

Single Prisma interactive transaction (`prisma.$transaction(async tx => ...)`):

1. Re-fetch every MenuItem **for that vendor** with vendor ACTIVE, `deletedAt`
   null, `isAvailable` true. Reject otherwise (typed error).
2. **Ignore any client-supplied price entirely** — always recompute from DB.
3. Stock check when `stockQuantity != null`; decrement via `updateMany` with
   `where: { id, stockQuantity: { gte: qty } }` so the guard is atomic even under
   concurrency (check `count === 1`, else throw → rollback).
4. Snapshot per OrderItem: itemName, unitPrice, optionsSnapshot (JSON), subtotal.
5. Money/commission math ONLY with `Prisma.Decimal` — never JS floats. Assert
   exact decimal strings in tests (e.g. total `25.50` → commission `2.55`).
6. Commission rate snapshotted from `vendor.commissionRate` onto the Order.
7. orderNumber format `HK-YYYYMMDD-XXXX`: date + random suffix, retry on unique
   collision inside the transaction.
8. Create Order (PENDING_RECEIPT / AWAITING_RECEIPT) + OrderItems +
   OrderStatusHistory(fromStatus null → PENDING_RECEIPT) in the same transaction.
9. Typed errors with reason variants (`CROSS_VENDOR`, `ITEM_UNAVAILABLE`,
   `INSUFFICIENT_STOCK`) so API routes map them cleanly.

Note: the schema's composite FKs already make cross-vendor rows impossible at DB
level; the app-layer check exists to return friendly conflicts before hitting the
constraint. Both layers are tested.

## Test cases (tests/integration/order-creation.test.ts)

- Add other-vendor item to cart → conflict result with current vendor id.
- Client sends fake prices → server totals correct anyway (the key security test).
- Cross-vendor order attempt → typed rejection AND zero Order/OrderItem rows
  remain (prove rollback by counting after failure).
- Insufficient stock → rejected, stock unchanged.
- Commission exact Decimal assertion; stock decremented exactly once on success.
- Reuse Task 4 seeded vendors/menu as fixtures where possible.

## Pitfalls (session-proven on RTX, commit 2002db6)

- **Prisma compound-FK nested create rejects the non-parent scalar.** A nested
  `order.create({ data: { items: { create: [...] } } })` fails with
  `Unknown argument 'vendorId'` because OrderItem's FK to Order is composite
  `(orderId, vendorId)`. Fix inside the same tx: create the Order first, then
  `tx.orderItem.createMany({ data: rows.map(r => ({ ...r, orderId: order.id })) })`
  (vendorId stays in each row) plus a separate `orderStatusHistory.create`.
  Type the row buffer as `Omit<Prisma.OrderItemCreateManyInput, "orderId">[]`
  or typecheck fails.
- **Distinguishing CROSS_VENDOR vs ITEM_UNAVAILABLE:** the vendor-scoped
  visibility-filtered fetch collapses both into "row missing". Do an unscoped
  first pass (`findMany where id in ids`, select id+vendorId) and compare each
  row's vendorId to pick the error reason before throwing.
- Do not use `tx.menuItem.update({ data: { stockQuantity: { decrement } } })`
  without a WHERE guard — it can drive stock negative under race conditions;
  `updateMany` with the gte filter is the atomic pattern.
- Decimal discipline: build money with `new Prisma.Decimal(...)`, render with
  `.toFixed(2)`, store strings into Decimal columns, and assert exact decimal
  STRINGS in tests (`"25.50"` / `"2.55"`).
- File transfer through the jump host by piping works well:
  `cat localfile | ssh <jump> 'ssh -i key hafjet@RTX "cat > path"'`. RED phase:
  push only the test file first and run vitest (module-not-found = RED).
- Vitest integration files share one disposable DB (`fileParallelism: false`
  already set); keep fixtures scoped by unique slugs/UUIDs so other files'
  TRUNCATEs don't interleave badly. Reuse the deterministic seed fixtures
  (vendors `b…00a1`/`b…00a2` ACTIVE, `b…00a3` INACTIVE); clean up created
  orders in afterAll.
