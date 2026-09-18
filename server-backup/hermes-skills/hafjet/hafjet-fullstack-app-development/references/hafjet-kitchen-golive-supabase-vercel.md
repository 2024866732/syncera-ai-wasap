# HAFJET Kitchen — Production Go-Live (23 Aug 2026)

## What happened, in order
1. Tuan created the Supabase production project `nilvvujozkxkofqxbqhu` (Singapore) and pasted all keys into Telegram chat.
2. Connection verified WITHOUT psql: Python socket probe. Direct host `db.<ref>.supabase.co` resolves IPv6-ONLY → RTX WSL has no IPv6 route (`Network is unreachable`). Pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432` resolves IPv4 and passed TCP + Postgres SSLRequest (0x04d2162f → 'S') + TLS 1.3 handshake.
3. `.env.production.local` written on RTX (chmod 600), proven gitignored via `git check-ignore -v`.
4. Migration approved → first attempt via pgbouncer-style URL failed P1000 auth; SUCCESS with **session pooler :5432** user `postgres.<ref>`. `npx prisma migrate deploy` applied init migration; `npm run db:verify` = **38/38 PASS** on production.
5. RLS + bucket approved:
   - Whole-file `prisma db execute --file` FAILED ("must be owner of table objects" — from storage.objects ALTER). Fix: split SQL statement-by-statement in Python, keeping dollar-quoted function blocks whole; naive semicolon splitting broke the trigger function (syntax errors) — regex-extract `CREATE OR REPLACE FUNCTION ... END;\s*\$\$` as one unit.
   - Result: 4 customer SELECT policies + auth user_created trigger applied; `storage.objects` ALTER skipped (platform-managed).
   - Bucket create via Storage REST failed "Invalid Compact JWS" with Bearer-only header on new `sb_secret_` keys. Fix: send secret key on **both `apikey:` and `Authorization: Bearer` headers** → HTTP 200. Bucket confirmed: public=false, 10MB limit, jpeg/png/webp/pdf allowlist.

## Key learnings (durable)
- Supabase new API keys: `sb_secret_` is NOT a JWT. Any raw REST call must carry it on the `apikey` header. Bearer alone → 403 Invalid Compact JWS.
- Session pooler (:5432, `postgres.<ref>` user) works for Prisma migrate from IPv4 machines; transaction pooler :6543 gave P1000 with same password.
- Supabase MCP OAuth tokens are machine-local: authorization completed on one machine does NOT transfer to another Hermes install (`.hermes/mcp-tokens/<name>.client.json` exists but no token file). Each host needs its own interactive `hermes mcp login <name>`; non-interactive env cannot complete it.
- Vercel MCP after successful OAuth: config shows enabled; verify with `hermes mcp test vercel` (✓ Connected, tools discovered). CLI has no `mcp call` subcommand — MCP tool invocation from agent context requires a session/toolset reload or a subagent that loads the toolset.
- GitHub push from RTX used existing `gh` CLI login (account 2024866732): `gh repo create hafjet-kitchen --private --source=. --remote=origin --push` — no deploy key setup needed despite that being the initial plan.

## Current state (end of this session)
- Production Supabase: schema migrated, db:verify 38/38, RLS policies live, bucket live.
- GitHub repo pushed: https://github.com/2024866732/hafjet-kitchen (PRIVATE, master=831007e).
- Vercel MCP connected (37 tools); list_projects read-only check dispatched.
- Pending: Vercel import + 6 env vars + preview deploy → smoke test → domain makan.hafjet.my (needs separate approval).

## Env vars for Vercel
DATABASE_URL (pooler session string), DIRECT_URL (direct 5432), NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (sb_publishable_), SUPABASE_SERVICE_ROLE_KEY (sb_secret_, server-only), NEXT_PUBLIC_APP_URL=https://makan.hafjet.my (override for preview).
