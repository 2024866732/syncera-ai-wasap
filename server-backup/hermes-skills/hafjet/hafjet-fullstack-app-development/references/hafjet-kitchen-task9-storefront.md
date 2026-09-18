# HAFJET Kitchen Task 9 — customer storefront pages (commit 2097c6c)

Session-specific detail backing `hafjet-fullstack-app-development`. All 8 customer pages built as Server Components + `"use server"` actions; existing 56 tests untouched.

## What was built
- `/` hero + category cards + featured + ACTIVE vendors; `/shop?category=`; `/shop/[vendorSlug]`; `/cart` (client); `/checkout` (client form → server action); `/orders/[orderNumber]/receipt` (dropzone); `/orders/[orderNumber]` (timeline); `/orders` (phone lookup for guests).
- Shared: Tailwind-only primitives in `src/components/ui/` (button.tsx exports Button/ButtonLink/Card/Badge; input.tsx; timeline.tsx), CartProvider in `src/components/cart/cart-provider.tsx`, `formatRM` in `src/lib/format.ts`, guest identity in `src/lib/customer.ts`, decision doc `docs/guest-checkout.md`.

## Patterns that worked
- **Guest identity**: `resolveCurrentCustomer()` → authz profile if session, else checkout action find-or-creates a CUSTOMER Profile by unique phone (`findOrCreateGuestProfile`). Phone stored in localStorage (`hk-customer-phone`) after success; `/orders?phone=` lists matches. Documented in docs/guest-checkout.md.
- **Cart conflict UX**: CartProvider wraps pure cart.ts helpers; `addItemToCart` returns the typed AddItemResult. AddToCartButton shows an inline confirm modal on conflict → `clear()` then re-add. Never mutate around the vendor lock.
- **Checkout error mapping**: catch `OrderCreationError`, switch on `.reason` (CROSS_VENDOR / ITEM_UNAVAILABLE / INSUFFICIENT_STOCK) → friendly BM messages; CROSS_VENDOR tells user to clear cart. pickupTime/note applied via a post-create `order.update` so createOrder stays pure.

## Next.js 15 / React 19 gotchas found
- `params` and `searchParams` are Promises in Next 15 App Router — must `await` them in every page.
- Prisma `Decimal` is NOT RSC-serializable to client components — always convert with `.toString()` server-side and format via `formatRM` (Decimal from string).
- `@/lib/receipts` imports OrderStatus but does not re-export it — import enums from `@prisma/client` or use string literals in action files.
- Timeline component takes `{toStatus, note, at}` — map history rows (`createdAt`→`at`) at call site.

## Verification specifics for page tasks
- Mark EVERY DB-backed page `export const dynamic = "force-dynamic"`; then `env -u DATABASE_URL npm run build` proves build needs no DB (client-only pages like /cart, /checkout prerender static).
- Integration suites need inline env: `export DATABASE_URL=postgresql://hafjet:...@127.0.0.1:55432/hafjet_kitchen_task2` before `npm run test:integration` (no .env on RTX). Container was up this session; verify with docker ps first.
- File transfer that worked cleanly: author files locally under a mirror dir, then `tar czf - src docs | ssh hafizi145@hafjet-pc-office 'ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 "cd <project> && tar xzf -"'`. A direct `scp -o ProxyJump=` attempt was blocked by the raw-IP security scan — use the tar-over-double-hop pipe.
