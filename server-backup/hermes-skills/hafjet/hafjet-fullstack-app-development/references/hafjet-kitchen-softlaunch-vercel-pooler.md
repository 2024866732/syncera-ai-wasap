# Soft Launch + Production Troubleshooting (23 Aug 2026, makan.hafjet.my)

Session-specific evidence for the class-level rules. Covers: session vs transaction pooler for serverless, DNS reality-check, Vercel MCP auth lifecycle, and soft-launch verification approach.

## 1. EMAXCONNSESSION — session pooler NOT for serverless

- Symptom: production Next.js "Application error: server-side exception" digest 3895324003; Vercel runtime logs show `EMAXCONNSESSION max clients reached in session mode pool_size 15`.
- Root cause: `DATABASE_URL` pointed at the Supabase **session pooler** (port 5432). Each Vercel serverless function opens a connection; session pool caps at 15 → exhaustion.
- Fix (non-destructive, env-only):
  ```
  DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=public
  DIRECT_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres   # unchanged, migrate-only
  ```
  Update env in Vercel (Production + Preview) → Redeploy latest → verify with repeated curl (200).

## 2. Port matrix (keep straight)

| Job | Host:port | Params |
|-----|-----------|--------|
| prisma migrate deploy / seed | session pooler :5432 (user `postgres.<ref>`) | none (pgbouncer :6543 → P1000) |
| Vercel runtime | transaction pooler :6543 | `?pgbouncer=true&connection_limit=1&schema=public` |
| psql/one-off probes | pooler :5432 or :6543 | both reachable from IPv4 |

## 3. DNS reality check

- User said CNAME `makan → cname.vercel-dns.com` was set at Exabytes. Public reality: `dig makan.hafjet.my CNAME @<auth-ns>` empty; apex `hafjet.my` resolves to Cloudflare NS (`sterling/lauryn.ns.cloudflare.com`). Zone is hosted at Cloudflare, not Exabytes — record had to be added there.
- Rule: never trust "DNS sudah set" — query the AUTHORITATIVE NS (`dig <host> <type> @<ns>`) before domain verification or SSL checks.
- A non-resolving domain makes Vercel domain verification + Let's Encrypt fail; nothing else to debug until DNS is real.

## 4. Vercel MCP OAuth lifecycle

- Initial `hermes mcp add vercel --url https://mcp.vercel.com --auth oauth` in a non-interactive environment fails OAuth (no browser) but the CLI may still offer "Save config anyway" → config saved, token absent, `hermes mcp test` fails with "no cached tokens".
- After interactive `hermes mcp login vercel`, tokens land in `~/.hermes/mcp-tokens/vercel*.json` (client + meta + json). BUT initial scope was `openid` only → token expired ~1h, NO refresh token → `invalid_grant` on refresh → hard re-auth required.
- MCP tools are not callable via `hermes mcp call` (no such subcommand). Agent sessions need the toolset loaded (subagent that loads the MCP server, or toolset reload). Subagent toolset may NOT include the MCP server's tools — check with tool_search for `mcp__vercel__*`.
- `hermes mcp list` can say "enabled" while `hermes mcp test` still fails on auth — enabled ≠ authenticated.

## 5. Soft-launch verification pattern

- Read-only page sweep: curl each public route, record status + size; `/admin` 307 redirect = guard working; `/checkout`, `/cart` 200.
- DB reachability probe with node pg (no psql on hosts): one query `select count(*) from information_schema.tables where table_schema='public'` against pooler; mask password in all output.
- When RTX/Tailscale host unreachable (ping 100% loss), continue with cloud-side checks (Vercel, DNS) and document the host outage rather than retrying the tunnel.
- One real test order through guest checkout is acceptable for smoke; do NOT flood. Document manual admin steps if automation risky.
