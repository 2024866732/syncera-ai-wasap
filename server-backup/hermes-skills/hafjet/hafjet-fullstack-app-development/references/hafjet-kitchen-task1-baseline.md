# Task 1 — Baseline Project Setup (HAFJET Kitchen)

Session-proven approach for the initial isolated Next.js 15 project on the RTX host via PC Office SSH jump.

## Commands run on RTX (`/home/hafjet/projects/hafjet-kitchen`)

```bash
# 1. Scaffold (Node v22.22.2 via nvm)
nvm use 22
npx create-next-app@latest hafjet-kitchen --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack

# 2. Initialize git (separate repo on RTX)
cd hafjet-kitchen && git init && git add -A && git commit -m "chore: scaffold hafjet kitchen application"

# 3. Install deps (npm ci on lockfile; Node 22 OK)
npm ci

# 4. Add test tooling
npm i -D vitest @vitest/ui @playwright/test tsx
npx playwright install chromium

# 5. Configuration files
# vitest.config.ts (node env, alias @ → ./src, include tests/unit/**/*.test.ts)
# playwright.config.ts (tests/e2e, chromium, webServer http://127.0.0.1:3000)
# .env.example (DATABASE_URL, SUPABASE_*, NEXT_PUBLIC_APP_URL)
# package.json scripts: lint, typecheck, test, test:integration, test:e2e, db:generate, db:migrate:dev, db:seed

# 6. Smoke test (TDD RED)
# tests/unit/smoke.test.ts → npm test fails (missing script) → then GREEN after config

# 7. Final verification
npm run lint && npm run typecheck && npm test && npx playwright test --list --pass-with-no-tests
git commit -m "chore: add task one quality baseline"
```

## RTX-specific notes

- Project lives at `/home/hafjet/projects/hafjet-kitchen` (user `hafjet`).
- Transport: double SSH hop via PC Office with key `id_ed25519_office2rtx`.
- Node/npm must be sourced via `source "$HOME/.nvm/nvm.sh"` on RTX.
- No `.env` file committed — only `.env.example`; real values supplied inline per command.
- Disposable Postgres (`hafjet-kitchen-task2-postgres`, 127.0.0.1:55432) created on demand for Tasks 2+.
- Commit `75a6e44` = Task 1 baseline; parent of all later tasks.