# HAFJET Kitchen Task 2: Integrity Pattern

Use this as a local-development reference only.

## Scope proved

A disposable PostgreSQL instance can enforce the single-vendor Kitchen order invariant with Prisma composite relations:

```prisma
OrderItem.order    @relation(fields: [orderId, vendorId], references: [id, vendorId])
OrderItem.menuItem @relation(fields: [menuItemId, vendorId], references: [id, vendorId])
```

The referenced models need matching composite unique constraints:

```prisma
Order    @@unique([id, vendorId])
MenuItem @@unique([id, vendorId])
```

`Receipt.orderId @unique` enforces one active receipt per order, while `ReceiptRevision` holds the re-upload audit trail.

## SQL guard set

Use migration SQL for database-invariant constraints:

- vendor/order commission rate: `>= 0 AND <= 100`
- menu price and order monetary values: nonnegative
- optional menu stock: NULL or nonnegative
- order item quantity: strictly positive

## Test fixture rule

Raw `pg` inserts bypass Prisma's `@updatedAt` application behavior. Add `"updatedAt", now()` in fixture inserts for models that have required updatedAt columns. This ensures the tested failure is the target FK/UNIQUE/CHECK constraint rather than a fixture NOT NULL error.

## Verification sequence

1. `prisma validate`
2. apply the migration only to local disposable PostgreSQL
3. `prisma generate`
4. run focused integration tests
5. run lint, typecheck and existing unit tests

No Supabase production database, storage bucket, or credentials are needed for this proof.

## Session-proven detail (commit 474bc0b on RTX)

### Schema additions (prisma/schema.prisma)
- Enums: UserRole, VendorStatus, OrderStatus, PaymentStatus, PaymentMethod, ReceiptStatus, PayoutStatus, DocumentType, NotificationType
- Profile (user, roles, soft-delete)
- Vendor (stallName, slug unique, status, commissionRate default 10%)
- Category (sortOrder, isActive)
- MenuItem (vendorId, categoryId, unique composite keys, options)
- Order (vendorId, status PENDING_RECEIPT→COMPLETED, commissionRate/Amount snapshots, orderNumber unique)
- OrderItem (composite FKs: `(orderId, vendorId) -> Order(id, vendorId)` AND `(menuItemId, vendorId) -> MenuItem(id, vendorId)`)
- Receipt + ReceiptRevision (one active receipt per order, revision audit trail)
- OrderStatusHistory (full audit trail)
- VendorPayout + VendorPayoutOrder (commission settlement)

### Migration guards (prisma/sql/0001_database_guards.sql)
```sql
ALTER TABLE "vendors"
  ADD CONSTRAINT "vendors_commission_rate_range"
  CHECK ("commissionRate" >= 0 AND "commissionRate" <= 100);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_commission_rate_range"
  CHECK ("commissionRate" >= 0 AND "commissionRate" <= 100),
  ADD CONSTRAINT "orders_nonnegative_money"
  CHECK ("subtotal" >= 0 AND "totalAmount" >= 0 AND "commissionAmount" >= 0);

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_nonnegative_price" CHECK ("price" >= 0),
  ADD CONSTRAINT "menu_items_stock_nonnegative" CHECK ("stockQuantity" IS NULL OR "stockQuantity" >= 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_nonnegative_money" CHECK ("unitPrice" >= 0 AND "subtotal" >= 0);
```

### Integration tests (tests/integration/schema-integrity.test.ts)
Raw SQL fixtures against disposable Postgres `:55432` prove:
1. Cross-vendor OrderItem insert rejected (composite FK)
2. Cross-vendor MenuItem insert rejected (composite FK)
3. Duplicate active Receipt per order rejected (unique orderId)
4. Invalid commission >100 rejected (CHECK)
5. Non-positive quantity rejected (CHECK)

### Verification commands
```bash
export DATABASE_URL="postgresql://hafjet:hafjet_task2_dev_only@127.0.0.1:55432/hafjet_kitchen_task2?schema=public"
npx prisma validate && npx prisma migrate dev --name init_hafjet_kitchen --skip-generate
cat prisma/sql/0001_database_guards.sql >> prisma/migrations/*/migration.sql
npx prisma migrate reset --force --skip-seed --skip-generate
npx prisma generate
npm run test:integration -- schema-integrity.test.ts
npm run lint && npm run typecheck && npm test
```

### RTX notes
- Pin Prisma 6.19.1 (both `prisma` and `@prisma/client`) — schema uses Prisma 6 semantics.
- Guard SQL embedded in init migration; do not re-apply.
- Integration tests run sequentially (`fileParallelism: false`) against shared disposable DB.