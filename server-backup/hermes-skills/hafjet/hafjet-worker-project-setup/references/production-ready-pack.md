# Production-Ready Pack Recipe (Fasa 4A → 4D, hafjet-kitchen validated)

Validated Aug 2026 on `/home/hafjet/projects/hafjet-kitchen` (commit chain
4e412ad → 831007e). Use when Tuan asks for "production ready pack",
go-live runbooks, verification scripts, or marketing prep docs.

## Phase split

- **4A — foundation docs** (done once): `.env.production.example`,
  supabase-setup.md, migration-plan-production.md, vercel-deploy.md,
  go-live-checklist.md, security-production.md, marketing-agent-plan.md,
  `scripts/check-docs.sh`, runbooks/{development-migration,receipt-incident-response,rollback}.md.
  Verify existence via `bash scripts/check-docs.sh` — do NOT redo.
- **4B — scripts & tooling**: `scripts/check-env-template.sh`,
  `scripts/verify-production-readiness.sh`, npm scripts (`check:env`,
  `verify:production`), `docs/go-live-day-runbook.md` (numbered steps,
  each with expected output).
- **4C — operational runbooks**: `docs/runbook-first-24-hours.md`,
  `runbook-receipt-ops.md` (Soundbox manual cross-check flow),
  `runbook-vendor-onboarding.md`.
- **4D — marketing prep doc-only**: draft ad copies in BM, targeting,
  creative brief. No Ads OAuth/spend.

## Env-template validator semantics (gotcha)

"Required keys non-empty-commented" means: each key exists as an **active
(uncommented) line** — value stays EMPTY in the template because real
secrets are forbidden there. Validating `^KEY=.+` will permanently FAIL
against a placeholder-only template. Correct grep:

```bash
grep -qE "^${key}=" "$FILE"   # active line; value may be empty placeholder
```

Plus negative scans for real-looking secrets:
`sb_secret_[A-Za-z0-9_-]{20,}`, `sbp_...`, `sk_live_...`, long `eyJ...` JWTs.

## verify-production-readiness.sh gate order

1. `db:verify` against DISPOSABLE DB only (expect 38/38 on hafjet-kitchen);
   SKIP (not FAIL) if `DATABASE_URL` unset so script is runnable anywhere.
2. `check-env-template.sh`
3. service_role isolation greps: no `SUPABASE_SERVICE_ROLE_KEY` in `src`
   outside server-only files; never inside a `NEXT_PUBLIC_*` name.
4. `ADMIN_DEV_IMPERSONATION` must not be an active line in the template.
5. Repo-wide accidental-secret scan (exclude node_modules/.next/.env*).
Print PASS/FAIL per section, non-zero exit overall.

## Which gates need the DB

| Gate | DATABASE_URL needed? |
|---|---|
| lint / typecheck / `next build` | NO — use `env -u DATABASE_URL` |
| unit tests | NO |
| integration tests (vitest) | **YES** — disposable `postgresql://hafjet:hafjet_task2_dev_only@127.0.0.1:55432/hafjet_kitchen_task2?schema=public`; without it 9/10 files fail |
| db:verify | YES (same disposable URL) |

## Authoring remote files from local workspace

Write files locally under a staging dir (`~/staging-pack/` mirroring repo
layout) with write_file, then push via nested tar-over-stdin (see
Pitfalls → file transfer). Patching package.json remotely: pipe a small
python3 heredoc through the nested ssh (single-quoted outer shell; escape
`\$` for variables that must resolve on the remote). chmod +x scripts
after extract.

## Final audit + commit sequence

1. `env -u DATABASE_URL npm run lint && typecheck && test && build`
2. `DATABASE_URL=<disposable> npm run test:integration` (73/73)
3. `DATABASE_URL=<disposable> npm run verify:production` (ALL PASS)
4. `scripts/check-docs.sh` still OK after adding new docs
5. Secret-pattern grep clean
6. One commit: `docs+scripts: production ready pack — ...`

Report format: commit hash, docs list, scripts, test/build status,
confirmation that no cloud/Vercel/domain/Ads was touched, next human steps.
