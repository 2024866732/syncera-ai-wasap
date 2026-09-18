# Task 6 — Private Receipt Upload + Revision + Review Actions

## Context

Task 5 complete at RTX commit `2002db6` (cart.ts + orders.ts + order-creation.test.ts). Task 6 adds server-side receipt management on top. No schema migration needed — `Receipt` and `ReceiptRevision` already exist with `@unique(orderId)` and `@@unique([receiptId, revisionNumber])`.

## New files

- `src/lib/storage.ts` — `ReceiptStorage` interface + `LocalReceiptStorage` that writes to `/tmp/hafjet-kitchen-receipts/` and produces deterministic pseudo-signed URLs (`local://receipts/{base64path}?expiry={ts}&sig={sha256(16)}`). Production swaps via `ReceiptStorage.fromEnv()` without touching callers.
- `src/lib/receipts.ts` — Transactional server-side functions: `uploadReceipt`, `getReceiptForReview`, `reviewReceipt`, `createReceiptRevisionForUpload`. Typed errors: `ReceiptUploadError`, `RejectNoteRequired`, `ForbiddenError`.
- `tests/integration/receipts.test.ts` — 11 integration tests covering all required cases.

## Key design decisions

- **Swappable storage interface**: `ReceiptStorage.store()` + `ReceiptStorage.signedUrl()` decouples from S3/Supabase. Tests use `LocalReceiptStorage`; production uses `ReceiptStorage.fromEnv()` (configurable via `RECEIPT_STORAGE_DIR`, `RECEIPT_STORAGE_SIGNING_SECRET`).
- **One receipt per order**: enforced by Prisma `@unique(orderId)` on `Receipt`. Upload either creates or updates; a new `ReceiptRevision` is always created and `currentRevision` bumped.
- **ReceiptStatus flow**: UPLOADED → UNDER_REVIEW (on upload) → APPROVED (admin approve) or REJECTED (admin reject). After reject, stays at UNDER_REVIEW on order so customer can re-upload.
- **Order flow on review**: APPROVE → `PAYMENT_CONFIRMED` (NOT PREPARING/READY). REJECT → order stays `PAYMENT_UNDER_REVIEW` so customer can re-upload.
- **REJECT requires non-empty note**: throws `RejectNoteRequired`.
- **No Supabase client needed**: the storage abstraction means tests run without real S3/Supabase.

## Integration test cases (11 total)

1. Upload valid JPEG within size → revision created, receipt under review, storage path set
2. Upload disallowed type (.exe) → `INVALID_TYPE` rejected
3. Upload oversized (>10MB) → `FILE_TOO_LARGE` rejected
4. Re-upload after reject → new revision, `currentRevision` incremented, status back to UNDER_REVIEW
5. Approve by admin → order PAYMENT_CONFIRMED (not PREPARING/READY), receipt APPROVED
6. Reject by admin without note → `RejectNoteRequired`, order not advanced
7. Reject with note → receipt REJECTED
8. Signed URL returned and parseable (matches `local://receipts/...` pattern)
9. `getReceiptForReview` allows ADMIN, returns revisions with signed URLs
10. `getReceiptForReview` denies CUSTOMER role → Forbidden
11. Multiple receipts on same order prevented by schema `@unique(orderId)`

## Reusable patterns / pitfalls

- **Prisma `$transaction` + interactive `tx`**: all writes (Receipt + ReceiptRevision + Order update + OrderStatusHistory) happen in one atomic transaction.
- **`sanitiseName()` helper**: strips path separators and non-alphanumerics from original filenames before building storage paths.
- **bytesFromInput() helper**: accepts buffer, bytes, or base64 — callers can pass any of the three.
- **ESLint `@typescript-eslint/no-explicit-any`**: must use typed return aliases (`ReceiptWithSignedUrls`) instead of inline `as any` casts.
- **Vitest null checks**: `getReceiptForReview` returns `T | null`, so tests must use `result!.field` after `toBeTruthy()` guard.

## Test results (final)

- 34/34 integration tests pass (11 receipts + 9 order-creation + 4 schema-integrity + 6 catalog + 4 authorization)
- Unit + typecheck + lint: clean