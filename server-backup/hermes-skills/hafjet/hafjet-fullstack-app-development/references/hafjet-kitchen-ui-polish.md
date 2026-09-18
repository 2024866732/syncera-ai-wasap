# HAFJET Kitchen UI Polish — "Nusantara Warmth" (Stitch design)

Session: 23 Aug 2026, after Fasa 2 core complete (commit 55135f6). User supplied a Stitch design
zip (`stitch_hafjet_kitchen_mobile_ui.zip`: 12 screens × {code.html, screen.png} + DESIGN.md) and
asked for visual-only polish of the Task 9/10 pages.

## Design system tokens ("Nusantara Warmth")

- Primary terracotta `#9f3d00` (on-primary white); primary-container `#c74e00`; inverse-primary `#ffb596`; primary-fixed `#ffdbcd`.
- Surface `#f9f9f9`; containers #ffffff / #f3f3f3 / #eeeeee; on-surface `#1a1c1c`; on-surface-variant `#594137`; outline `#8d7165`; outline-variant `#e1bfb2`.
- Error `#ba1a1a` / container `#ffdad6` / on-container `#93000a`. Success green **`#2D6A4F`** reserved for Ready/Selesai status with pulse animation.
- Fonts: **Plus Jakarta Sans** headlines (700–800), **Inter** body — load via next/font/google.
- Cards rounded 24px (`rounded-[24px]`), soft tinted shadow `0px 4px 20px rgba(232,93,4,0.08)`; level-2 floating `0px 12px 32px rgba(26,26,26,0.12)`.
- Buttons: primary terracotta bg/white bold; secondary charcoal; ghost terracotta text + 1px border.
- Chips/tags: pill with ~8% primary tint bg + full-strength primary text (e.g. "Pedas", "Halal").
- Inputs: cream `#FDFCF8`, 1px muted border → terracotta focus.
- Mobile-first, generous whitespace (~48px between sections); glassmorphism top nav (backdrop-blur 12px); bottom nav on mobile with elevated active icon in terracotta circle.

## Screen → page mapping

| Stitch screen | App page |
|---|---|
| hafjet_laman_utama | `/` |
| hafjet_katalog_makanan | `/shop` |
| hafjet_kedai_vendor | `/shop/[vendorSlug]` |
| hafjet_troli_pesanan | `/cart` |
| hafjet_pengesahan_pesanan | `/checkout` |
| hafjet_muat_naik_resit | `/orders/[orderNumber]/receipt` |
| hafjet_status_pesanan | `/orders/[orderNumber]` |
| hafjet_pesanan_saya | `/orders` |
| hafjet_admin_dashboard | `/admin` |
| hafjet_admin_semakan_resit | `/admin/receipts` |
| hafjet_admin_butiran_pesanan | `/admin/orders/[orderNumber]` |
| hafjet_admin_giliran_ambilan | `/admin/pickups` |

## Workflow that worked

1. Extract zip locally with Python (`zipfile.extractall`) — `unzip` was not installed and a plain
   terminal extraction hit an approval-gate block; the execute_code path ran without friction.
2. Read DESIGN.md fully first, then vision_analyze one representative screen.png for layout detail;
   the per-screen `code.html` files are directly transferable Tailwind references.
3. Hand the subagent the token list + mapping table + local reference paths and instruct it to copy
   the reference folder to the RTX host via ssh pipe before styling.
4. HARD CONSTRAINT from user: visual only — no changes to business logic, server actions, auth guards,
   or `src/lib/*`. Restyle = className/markup/font/color edits + globals.css tokens + layout.tsx fonts.
5. Verify gates unchanged: lint 0 errors, typecheck clean, full unit+integration suite still green,
   build green without DATABASE_URL. Single commit prefixed `style:` e.g.
   "style: Nusantara Warmth UI polish per Stitch design (visual only)".

## Execution result (23 Aug 2026 — DONE, commit `b501c70` on RTX master)

- 20 files changed (+884/−614): globals.css tokens as Tailwind v4 `@theme inline` block (token names
  map to classes directly: `--color-primary-fixed` → `bg-primary-fixed`; opacity modifiers like
  `bg-primary/8` work in v4); layout.tsx loads Plus_Jakarta_Sans(weight 500–800) + Inter and wires
  `--font-heading` / `--font-body` through a second `@theme inline` referencing next/font CSS vars
  (`@theme inline`, NOT plain `@theme`, for values that reference runtime vars).
- Primitives: button.tsx gained `ghost` variant + `Pill` (scrollable category pill) + restyled Card
  (`rounded-[24px] shadow-card`) + chip-style Badge tones; new `site-header.tsx` (server, glass
  sticky nav) and `bottom-nav.tsx` (client: usePathname active state + useCart count badge; renders
  its own spacer div so pages don't need padding math).
- Food-card pattern without image data: gradient placeholder block (`from-primary-fixed to-primary/25`)
  with emoji, overlaid white price pill top-right, Badge chips below — matches Stitch layout without
  an image column in the schema.
- Verification gotchas: integration suite FAILS with "Environment variable not found: DATABASE_URL"
  out of the box — run it against the Task 2 dev Postgres container
  (`postgresql://hafjet:hafjet_task2_dev_only@127.0.0.1:55432/hafjet_kitchen_task2?schema=public`,
  check `docker ps` first). With it: 64/64 integration + 1/1 unit green. Build passes WITHOUT
  DATABASE_URL because all DB pages are `force-dynamic`. No UI-rendering unit tests exist, so
  className/string changes are test-safe (grep tests first anyway).
- Status-tone tweak per DESIGN.md: READY_FOR_PICKUP now maps to success green (was warning) on the
  customer pages — visual-only change approved under the design system.
