---
name: remote-code-review
description: "Use when reviewing a remote repository over SSH."
version: 1.0.0
---

# Remote Code Review

Use this skill for a review target that lives on another machine reachable by SSH, especially a Node/Next.js project. It produces evidence-based review verdicts while preserving the remote worktree.

## Guardrails

- Treat the review host as read-only unless the user explicitly authorizes a change.
- Do not run migrations, seeds, deploys, service restarts, `npm install`, or `npm audit fix` during a baseline review.
- Use the exact remote path and commits supplied by the user. Do not assume a local checkout mirrors the target.
- Avoid commands that write temporary files when read-only pipelines or direct output suffice.

## Procedure

### 1. Establish the exact review state

Run on the remote host:

```bash
source "$HOME/.nvm/nvm.sh"
cd /exact/project/path
node --version
npm --version
git rev-parse --show-toplevel
git status --short
git log --oneline --decorate -3
git diff --stat BASE..HEAD
git diff --name-status BASE..HEAD
```

For a non-interactive SSH command, explicitly source nvm before invoking npm. Record the commit at HEAD and verify the worktree again at the end.

### 2. Inspect changed files and surrounding configuration

Read the full diff but omit bulky lockfile bodies after confirming the lockfile is part of the change. Inspect the complete current versions of:

- `package.json` and the package-lock header/dependency entries relevant to additions
- `.gitignore` and `.env.example`
- TypeScript, ESLint, Vitest, and Playwright config files
- every smoke test and configured test directory
- any TDD evidence report referenced by the task

For secret templates, confirm values are blank and real `.env*` files remain ignored while the template is explicitly tracked.

### 3. Validate script-to-config consistency

Do not stop at the existence of package scripts. For each test script, confirm the runner configuration can discover the directory/file family the script names.

**Vitest pitfall:** a config such as:

```ts
include: ["tests/unit/**/*.test.ts"]
```

makes `vitest run tests/integration` fail to discover integration tests. Either include both families or use separate configs/scripts. Treat a declared script that cannot ever discover its claimed test category as an Important quality finding.

An empty e2e suite can be intentional in a scaffold. Where the task asks for Playwright discovery, use:

```bash
npx playwright test --list --pass-with-no-tests
```

and distinguish a successful zero-test listing from a runnable actual e2e suite.

### 4. Run only requested, non-mutating verification

For a Node baseline, the usual fresh remote evidence is:

```bash
npm run lint
npm run typecheck
npm test
npx playwright test --list --pass-with-no-tests
npm ci --dry-run --ignore-scripts   # optional lockfile consistency check
```

Run commands serially. Capture each exit code and enough output to show test counts and discovery behavior. If an unrelated declared script reveals a material configuration defect, run it and report the actual result separately.

### 5. Dependency audit interpretation

If dependency risk is relevant, use a read-only audit, preferably scoped to production resolution:

```bash
npm audit --omit=dev --audit-level=critical
```

Report confirmed severity, affected package path, and whether the suggested remediation is breaking. Do not apply audit fixes outside scope. High-severity advisories can justify a code-quality rejection even if required lint/typecheck/tests pass; they do not automatically mean the requested scaffold files violate a narrowly written specification.

### 6. Inspect ignored evidence directly

A report under an ignored directory (for example `.sdd/`) is present in the working tree but not necessarily in the reviewed commit. Read it directly by path rather than relying on `git show HEAD:path`.

### 7. Make two independent verdicts

Always state both separately:

1. **Spec compliance — APPROVED/REJECTED:** Did the exact commit meet the stated scope and required artifacts?
2. **Code quality — APPROVED/REJECTED:** Are the configuration, tests, scripts, and dependency posture sound enough to accept?

List **Critical** and **Important** findings separately. A required script merely existing can satisfy a literal scope requirement while still failing code quality if it is unusable.

## Completion checklist

- [ ] Remote HEAD matches the requested review commit.
- [ ] Range contains no out-of-scope tracked files.
- [ ] Final remote worktree is clean.
- [ ] Required commands have fresh exit-code evidence.
- [ ] Env template and ignore rules were inspected for secret safety.
- [ ] Test scripts are consistent with runner discovery config.
- [ ] Both verdicts and severity-separated findings are explicit.
