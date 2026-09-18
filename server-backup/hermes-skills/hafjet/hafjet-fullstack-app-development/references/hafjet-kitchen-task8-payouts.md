# hafjet-kitchen Task 8 — vendor commission settlement (payouts)

Proven implementation of `src/lib/payouts.ts` + `tests/integration/payouts.test.ts`
(commit `9bd1d3d`, 56/56 tests green). Read before any future money-settlement or
VendorPayout work.

## Design (validated)

- `createVendorPayout({vendorId, periodStart, periodEnd, createdById?})` runs in one
  Prisma interactive tx:
  - Candidates: `order.findMany` where `vendorId`, `status: "COMPLETED"`,
    `deletedAt: null`, `createdAt` in `[periodStart, periodEnd]`,
    `payoutItems: { none: {} }`. Zero candidates → `NoEligibleOrdersError`.
  - Per-order re-check with `vendorPayoutOrder.findUnique({where:{orderId}})`
    immediately before insert; if claimed → throw → whole tx aborts.
  - Snapshots copied verbatim from the Order row (`totalAmount`→gross,
    `commissionAmount`) — never recomputed from items.
  - Totals summed with `Prisma.Decimal.plus`, stored `.toFixed(2)`.
- `markPayoutPaid({payoutId, actorId, actorRole, amount, paymentReference, note?})`:
  authz via caller-verified role param (receipts.ts convention); non-empty trimmed
  paymentReference else `PaymentReferenceRequiredError`; amount > 0 and
  `paidAmount + amount <= commissionAmount` else `InvalidPaymentAmountError`;
  single-row UPDATE serialises concurrent callers; PARTIALLY_PAID until balance
  reached then PAID + paidAt=now. Original Orders/VendorPayoutOrder rows untouched.
- `voidPayout`: ADMIN only, rejects if `paidAmount > 0`; VendorPayoutOrder rows
  cascade-delete so orders become claimable again.

## Prisma.Decimal TypeScript pitfall

Decimal model fields are typed as a Prisma `Decimal` that is NOT assignable to the
`new Prisma.Decimal(value)` string parameter. Helper must widen:

```ts
function money(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}
```

Also: narrowing `if (!input.paymentReference || !input.paymentReference.trim())` does
not satisfy TS — assign `const paymentRef = input.paymentReference?.trim() ?? ""` first.

## Test patterns that worked

- Fixture chain to COMPLETED through the real flows: direct `db.order.create`
  (RM25.50 / commission RM2.55 @10%) + orderItem + statusHistory row →
  `uploadReceipt(LocalReceiptStorage)` + `reviewReceipt APPROVE` →
  `transitionOrder PREPARING → READY_FOR_PICKUP → COMPLETED` (direct transition is allowed).
- Exclusion fixtures: leave one order PENDING_RECEIPT and one stuck at PREPARING;
  assert payout orderCount and exact `"51.00"` / `"5.10"` strings.
- Double-claim proof: overlapping second create → NoEligibleOrdersError; forced
  duplicate `vendorPayoutOrder.create` same orderId → unique-violation rejection.
- Untouched-orders proof: snapshot `db.order.findMany` before/after markPayoutPaid,
  deep-equal.
- Cleanup order matters: vendorPayoutOrder → vendorPayout → receiptRevision → receipt
  → orderStatusHistory → orderItem → order (by customerId) → profiles.
- Pitfall hit: an accidentally-COMPLETED fixture inflated orderCount 3 vs 2 — keep
  exclusion fixtures explicitly mid-chain.

## File transfer to RTX

Simplest reliable channel (no scp/tar needed): pipe local file into the double hop:

```bash
ssh hafizi145@hafjet-pc-office \
  'ssh -i "$HOME/.ssh/id_ed25519_office2rtx" hafjet@100.119.32.87 "cd <project> && cat > src/lib/payouts.ts"' \
  < local-payouts.ts
```

Run checks per command with inline `DATABASE_URL=...127.0.0.1:55432/...?schema=public`.
