# Fasa 3 + Fasa 4A (commits b501c70, 7de8862, 4e412ad, 831007e) — session detail

## UI Polish (b501c70)
- Stitch design zip: extract with `python3 -c "import zipfile; ...)"` — `unzip` not installed on Azure box. Extract locally, then read HTML/PNG references and transfer to RTX (`~/design-reference/`).
- Nusantara Warmth tokens live as Tailwind v4 `@theme` vars in globals.css; fonts Plus Jakarta Sans + Inter via next/font/google.
- Visual-only constraint held: no src/lib changes; tone mappings only where DESIGN.md dictates (READY_FOR_PICKUP→success green #2d6a4f).
- Bottom nav client component with cart-count badge; glass header shared.

## Fasa 3 Vendor Portal (7de8862)
- Guard chain: requireRole('VENDOR') → resolveOwnedVendor(profileId) via vendor.userId; every server action re-guards. Helpers in src/lib/vendor-auth.ts + src/lib/vendor-portal.ts.
- Isolation tests prove: Vendor A cannot list/fetch Vendor B orders; CUSTOMER/ADMIN/STAFF rejected by vendor guard; non-owner cannot mutate another vendor's menu item; soft-deleted items stay hidden in catalog.
- Worker hit its iteration cap just before committing (files complete, tests green, tree dirty). Orchestrator verified lint/typecheck/73-test suite itself then committed. Lesson: when a subagent fails on max_iterations but the work is done, verify independently and commit yourself rather than re-dispatching.

## Fasa 4A Production prep (4e412ad + 831007e)
- Docs shipped: .env.production.example (+ `.gitignore` exception line `!.env.production.example` needed alongside `!.env.example`), production-env.md, supabase-setup.md, migration-plan-production.md, vercel-deploy.md, go-live-checklist.md, security-production.md, marketing-agent-plan.md, supabase-mcp-setup.md (guide-only), go-live-day-runbook.md, runbook-first-24-hours.md, runbook-receipt-ops.md (Soundbox cross-check), runbook-vendor-onboarding.md, marketing-prep.md (8 BM ad copies, Raub targeting).
- Scripts: scripts/check-env-template.sh (npm run check:env), scripts/verify-production-readiness.sh (npm run verify:production — db:verify 38/38 + env template + service_role isolation grep + ADMIN_DEV_IMPERSONATION guard + secret scan). Both PASS.

## Supabase production connection findings (23 Aug 2026)
- Project ref nilvvujozkxkofqxbqhu (Singapore). REST /rest/v1/ returns 401 with dummy apikey = server up + auth enforced; /auth/v1/health responds.
- **Direct DB host is IPv6-only** (`db.<ref>.supabase.co`). PC RTX WSL has no IPv6 route → TCP connect unreachable. Workaround: use Supabase pooler hostname `aws-0-ap-southeast-1.pooler.supabase.com` (IPv4-compatible): transaction pooler port 6543 `?pgbouncer=true&connection_limit=1` for runtime DATABASE_URL; session pooler port 5432 user `postgres.<ref>` for migrations from IPv4-only machines. Get exact strings from Dashboard → Settings → Database.
- psql is not installed on Azure or RTX — connectivity checks done with a small Python socket+ssl probe (send Postgres SSLRequest bytes `\x00\x00\x00\x08\x04\xd2\x16\x2f`, expect 'S', wrap TLS). DNS check needs getaddrinfo (IPv6-aware), not gethostbyname (A-record only).
- Secrets handling: keys arrive in Telegram chat → write to `.env.production.local` on RTX (chmod 600); verify `git check-ignore .env.production.local` passes before anything else. Never echo values back into chat or commits.
- Writing project env files via ssh redirection triggers an approval gate even under broad standing approval — expect it, ask once, proceed after explicit user OK.

## Build log update
- Master head after this phase: 831007e. Suite: unit 1/1 + integration 73/73. Awaiting: Tuan creates Supabase project (DONE — ref above), fills Vercel envs, approves migration+deploy.
