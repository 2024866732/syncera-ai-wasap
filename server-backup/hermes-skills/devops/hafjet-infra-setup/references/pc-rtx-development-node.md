# PC RTX 4070 — HAFJET Kitchen development node

Use this when moving HAFJET Kitchen development from the constrained Azure gateway or PC Office to the RTX WSL node.

## Verified host baseline (2026-08-22)

- Host: `DESKTOP-RHDUSF3`, WSL Ubuntu 26.04
- Tailscale IP: `100.119.32.87`
- User/home: `hafjet` / `/home/hafjet`
- Storage: approximately 852 GB free during verification
- Node.js: system `v22.22.2`; do **not** assume `~/.nvm/nvm.sh` exists.
- Project location: `/home/hafjet/projects/hafjet-kitchen`

## Access and migration method

Azure direct key-based SSH to `hafjet@100.119.32.87` returned public-key denial. The existing PC Office key `~/.ssh/id_ed25519_office2rtx` successfully reaches the RTX node.

When a project must move from PC Office to RTX, use PC Office only as a **one-time transport hop**; all install, database, test and development commands then run on RTX. Preserve git metadata, exclude rebuildable dependencies and session reports:

```bash
# Run on the jump host; RTX target must be absent or deliberately prepared first.
tar --exclude=node_modules --exclude=.sdd -C ~/projects -cf - hafjet-kitchen \
  | ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 \
      'mkdir -p /home/hafjet/projects && tar -C /home/hafjet/projects -xf -'

# Run on RTX after transfer.
cd /home/hafjet/projects/hafjet-kitchen
npm ci
```

Do not run development workloads on PC Office after the migration when the user has designated RTX as the active development node. Do not copy `node_modules`; rebuild it with `npm ci` against the RTX runtime.

## Disposable Task 2 PostgreSQL

Keep schema integrity tests isolated from production and existing local containers. A loopback-only disposable container can use port `55432`:

```bash
docker run -d --name hafjet-kitchen-task2-postgres --rm \
  -e POSTGRES_USER=hafjet \
  -e POSTGRES_PASSWORD=<development-only-local-value> \
  -e POSTGRES_DB=hafjet_kitchen_task2 \
  -p 127.0.0.1:55432:5432 postgres:16-alpine
```

Never use `docker prune`, `docker compose down`, or existing container networks/volumes during this workflow. The database URL must point to the loopback disposable instance, never Supabase or production.

## Prisma integrity-test notes

- Pin `prisma` and `@prisma/client` to the same supported major version. The approved HAFJET Kitchen schema uses Prisma 6 syntax, so `6.19.1` was used for the development migration and client generation.
- Apply migrations and any hand-authored SQL guards only to the disposable loopback database; `prisma migrate deploy` is acceptable there after the migration SQL has been reviewed.
- Prisma `@updatedAt` is maintained by Prisma Client, not necessarily as a PostgreSQL column default. Raw `pg` fixture inserts must explicitly supply `"updatedAt" = now()` for every affected table, otherwise the test can fail on `NOT NULL` before reaching the intended composite-FK, unique, or CHECK constraint.
- For an integration script declared as `test:integration`, ensure Vitest discovers `tests/**/*.test.ts`; a unit-only include pattern silently excludes the integration suite.

## File transfer and nested-SSH pitfalls (verified 2026-08-22, Task 7)

- **scp to the JUMP host's /tmp is invisible on RTX.** `scp file hafizi145@hafjet-pc-office:/tmp/x` lands on PC Office; the inner RTX ssh has its own separate filesystem, so `cp /tmp/x` on RTX fails with "No such file or directory" even though lint/typecheck still run (on stale files). To push a file through BOTH hops, pipe via stdin:
  ```bash
  cat local-file.ts | ssh hafizi145@hafjet-pc-office \
    "ssh -i \$HOME/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 'cat > /home/hafjet/projects/hafjet-kitchen/src/lib/target.ts'"
  ```
  After any transfer, confirm with `wc -l` on the RTX side before running checks.
- **Nested SSH quoting that works:** outer `ssh ... "ssh ... 'remote command'"` — double quotes outside, single inside. Escape `$HOME` as `\$HOME` so it resolves on PC Office (where the inner key lives). Unquoted parentheses inside the remote command crash the remote bash (`syntax error near unexpected token '('`) — quote or restructure such commands (e.g. use `grep -rn pattern dir` without `( )`).
- **Disposable Postgres lifecycle:** the task container `hafjet-kitchen-task2-postgres` persists across sessions (plain container, not `--rm`). If stopped: `docker start hafjet-kitchen-task2-postgres`, then export `DATABASE_URL=postgresql://hafjet:hafjet_task2_dev_only@127.0.0.1:55432/hafjet_kitchen_task2?schema=public` per command batch.
- **Integration-test conventions (hafjet-kitchen):** tests import `seed` from `prisma/seed`, create throwaway profiles with `randomUUID()` + timestamped unique phone, and clean up only rows they created (delete by own ids). Vitest config sets `fileParallelism: false` because integration files share one DB. Consequence: leftover rows from FAILED runs persist across runs (cleanup keys change each run) — write assertions scoped to freshly created order/profile ids, never global counts.
- **Existing lib conventions:** Prisma interactive transactions everywhere; guarded `updateMany` where `{id, status: from}` + count check gives FOR UPDATE semantics for state machines; typed error classes (`InvalidTransitionError`, `PickupCodeError`) map onto HTTP responses; unique codes generated with collision-retry loop checking `findUnique`. Follow these when extending order/receipt logic.
- **Verify before claiming:** run `npm run lint && npm run typecheck && npm test && npm run test:integration` on RTX with DATABASE_URL exported, then commit with an explicit `-c user.name/-c user.email` (RTX repo may have no git identity configured).
