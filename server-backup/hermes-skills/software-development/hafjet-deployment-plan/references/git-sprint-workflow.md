# Git Sprint Branch Workflow — HAFJET WhatsApp Bot

## Branch Convention

| Branch | Purpose | Source | Merge target |
|--------|---------|--------|-------------|
| `main` | Production-ready code, clean, stable | `develop` or sprint branch | Protected — no direct pushes |
| `sprint-*` | Active sprint work | `main` | `main` (after full regression pass) |
| `release/v*.*.*` | Release candidate for a specific version | Working directory or sprint branch | `main` (after verification + approval) |

**Current pattern:** `sprint2-multiagent` → new branch per sprint.  
**Release pattern:** `release/v2.2.0` → one per tagged release, created from working dir state after changes are developed.

## CREATE FLOW

```bash
# 1. Verify you're on main
git branch --show-current

# 2. Create sprint branch
git checkout -b sprint2-multiagent

# 3. Stage ONLY necessary files — NOT bot_data.db, .env, __pycache__, node_modules
git add webhook_listener.py db_logger.py hermes_ai.py requirements.txt start.sh
git add dashboard/git add dashboard/dist/  # Frontend build only, NOT src/ or node_modules
git add deploy-*.sh build_zip.py

# 4. Unstage secrets if accidentally staged
git reset HEAD dashboard/.env.production

# 5. Verify staged files are clean
git diff --cached --name-only | grep -E '\.env|\.db|node_modules' && echo "WARNING: secret/db staged!"

# 6. Commit with message format:
git commit -m "sprint(v2.1.1): <short description of changes>"

# 7. Push — DO NOT merge to main 
git push origin sprint2-multiagent

# 8. STOP. Wait for user instructions on merge PR or further testing.
```

## RELEASE BRANCH FLOW (v2.2.0+)

Used when sprint work is done and user wants a traceable release candidate before deploy.

```bash
# 1. Create release branch from current state (may have uncommitted changes)
git checkout -b release/v2.2.0

# 2. Stage ONLY the files that changed in this release
#    — NOT test files, backups, bot_data.db, .env, node_modules
git add \
  webhook_listener.py \
  db_logger.py \
  dashboard/src/api/api.js \
  dashboard/src/components/Analytics.jsx \
  dashboard/dist/index.html \
  dashboard/dist/assets/index-*.js \
  dashboard/dist/assets/index-*.css \
  start.sh \
  .gitignore

# 3. Handle deleted tracked files (e.g., old dist assets no longer needed)
#    Check git status for "deleted:" entries under "Changes not staged for commit"
git rm dashboard/dist/assets/index-BV4Q6S1Q.js
git rm dashboard/dist/assets/index-Dw0n_jEG.css

# 4. Verify no secrets staged
git diff --cached --name-only | grep -E '\.env|\.db|node_modules|\.zip' && echo "❌ SECRET STAGED — RESET"
git status

# 5. Commit with release message format
git commit -m "release(v2.2.0): Analytics Dashboard MVP

- Bullet list of features, endpoints changed, files summary

Files:
  db_logger.py: +429 lines (new analytics functions + enhanced overview)
  webhook_listener.py: +87 lines (3 new endpoints + JWT on analytics)
  api.js: +56 lines (analytics API helpers)
  Analytics.jsx: +435/-318 (complete rewrite)
  dashboard/dist/: rebuilt assets"

# 6. Verify clean state
git status                # Only untracked files (test_*, .bak, logs, node_modules) remain
git log --oneline -1      # Shows commit hash
git branch --show-current # release/v2.2.0
```

### Post-Commit Verification

```bash
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git rev-parse HEAD)"
echo "Clean: $(git status --short | grep -c '^[^?]') tracked changes pending"
```

Expected: Branch = `release/vX.Y.Z`, Commit = full hash, Clean = `0` tracked changes.

### Key Differences from Sprint Branches

| Aspect | Sprint Branch (`sprint-*`) | Release Branch (`release/v*.*.*`) |
|--------|---------------------------|-----------------------------------|
| Created when | Start of sprint work | End of sprint, before deploy |
| Source | `main` (clean) | Working dir (may have changes) |
| Contains | Sprint branch pushes to remote | One commit, ready for deploy |
| Lifecycle | Active during development | Snapshot for deploy/review |
| Commit format | `sprint(vX.Y.Z): ...` | `release(vX.Y.Z): ...` |

## COMMIT MESSAGE FORMAT

### Sprint Branches
```
sprint(vX.Y.Z): <component> — <change summary>

Examples:
  sprint(v2.1.1): multi-agent inbox, escalation, scheduler, start.sh fix
  sprint(v2.2.0): dashboard analytics, settings page, websocket reconnect
```

### Release Branches

**NOTE:** Despite the branch being `release/v*.*.*`, Tuan Hafizi prefers the `sprint()` prefix for the commit message (not `release()`). This was confirmed in Sprint v2.2.0 close:

```
sprint(vX.Y.Z): <short descriptive title>

- Feature bullets
- Endpoint changes summary

Files:
  file.py: +X/-Y (description)
  ...
```

**Example (approved by user):**
```
sprint(v2.2.0): analytics dashboard MVP

- 8 summary cards, dual charts, agent performance table
- Date range selector (7d/30d/custom)
- CSV export button with JWT auth

Files:
  db_logger.py: +429 lines (new analytics functions + enhanced overview)
  webhook_listener.py: +87 lines (3 new endpoints + JWT on analytics)
  api.js: +56 lines (analytics API helpers)
  Analytics.jsx: +435/-318 (complete rewrite)
  dashboard/dist/: rebuilt assets
```

## SAFETY RULES

| File/Directory | Action | Reason |
|---------------|--------|--------|
| `bot_data.db` | ❌ NEVER stage | Production SQLite DB — local copy overwrites Azure |
| `.env`, `.env.*` | ❌ NEVER stage | API keys, APP_SECRET, credentials |
| `dashboard/node_modules/` | ❌ NEVER stage | 164MB artifact, regenerable via `npm install` |
| `__pycache__/`, `*.pyc` | ❌ NEVER stage | Bytecode cache, platform-specific |
| `*.zip`, `*.tar.gz` | ❌ NEVER stage | Build artifacts |
| `dashboard/dist/` | ✅ Stage only | Built frontend assets (what actually runs) |
| `dashboard/src/` | Stage only if no dist | Source files, but dist is what deploys |

## EXCLUDE DETECTION

Before committing, always check:

```bash
# Check for gitignored files that were accidentally staged
git diff --cached --name-only | sort

# Verify no .env files
git diff --cached --name-only | grep '\.env' && echo "❌ SECRET STAGED — RESET"

# Verify no db files  
git diff --cached --name-only | grep '\.db$' && echo "❌ DB STAGED — RESET"

# Verify no zip files
git diff --cached --name-only | grep '\.zip$' && echo "❌ ZIP ARTIFACT STAGED — RESET"
```

## PITFALLS

- **`.env.production` in `dashboard/` is NOT covered by `.gitignore`** — `.gitignore` only has `.env` and `.env.local`, not `.env.production`. This file contains production VITE_API_KEY reference and must be manually excluded. Use `git reset HEAD dashboard/.env.production` if staged.
- **`deploy-hafjet-bot.zip` in `dashboard/` is covered by `*.zip` in .gitignore** — but verify it's not staged before committing.
- **`node_modules/` NOT in .gitignore** — HAFJET's .gitignore only covers Python and environment excludes. `dashboard/node_modules/` must be excluded via pathspec: `git add dashboard/ -- ':!dashboard/node_modules'`.
- **`main` must stay clean** — Never push directly to main. Sprint branches keep main pristine until full regression passes in production.

## PR CREATION FLOW

After push, create a Pull Request from the sprint branch to `main`:

```bash
# Create PR with structured description
gh pr create \
  --base main \
  --head sprint2-multiagent \
  --title "sprint(v2.1.1): multi-agent inbox + escalation workflow" \
  --body ""    # empty initially, then edit with detailed body
```

### PR Description Template

Use the following structured format. Write body to a temp file, then apply:

```bash
cat > /tmp/pr_body.md << 'PRBODY'
## Purpose

Sprint v2.X.Y introduces <what the sprint does>.

---

## Features

| Feature | Description |
|---------|-------------|
| Feature 1 | Description |
| Feature 2 | Description |

## Bug Fixes

| Bug | Fix |
|-----|-----|
| Bug description | What was changed |

## Test Evidence — Sprint v2.X.Y Regression: N/N PASS

| # | Test | Result |
|---|------|--------|
| 1 | `GET /endpoint` | ✅ detail |
| 2 | `POST /endpoint` | ✅ detail |

## Deployment Notes

- Platform, region, runtime details
- Critical files excluded
- Startup command used

## Known Notes

- Limitations, pending items, known edge cases
- No merge to main yet

## Changed Files Summary

Modified: file1, file2, file3
Added: file4, file5, directory/
PRBODY

gh pr edit 1 --body "$(cat /tmp/pr_body.md)"
```

### PR Description Must Include

| Section | Content |
|---------|---------|
| **Purpose** | What the sprint achieves, why it matters |
| **Features** | Table of feature name + description |
| **Bug Fixes** | Table of bug description + fix applied |
| **Test Evidence** | Table of #, Test name, Result (PASS/FAIL + detail) |
| **Deployment Notes** | Platform, exclusions, startup method, environment |
| **Known Notes** | Limitations, pending work, multi-worker caveats |
| **Changed Files** | Summary of modified + added files |

## SANITY CHECKS BEFORE MERGE

Before the user approves the merge, run these checks:

```bash
# 1. Forbidden files in diff?
gh pr diff 1 | grep -E "^(diff --git|--- /dev/null)" | grep -E "(bot_data\.db|\.env|node_modules|\.zip)"
# Empty output = clean

# 2. Merge conflict?
gh pr view 1 --json mergeable -q '.mergeable'
# Must say MERGEABLE

# 3. Branch status
git status --short    # Working tree clean?
git branch --show-current  # Should show sprint branch
git rev-parse HEAD         # Current commit hash

# 4. Ahead/behind main
git rev-list --count origin/main..HEAD   # Ahead count
git rev-list --count HEAD..origin/main   # Behind count (should be 0)

# 5. Remote tracking
git branch -vv | grep sprint
```

**Report format:**
| Check | Result |
|-------|--------|
| Forbidden files in diff | ✅ None / ❌ Found |
| Merge conflict | ✅ MERGEABLE |
| Branch status | ✅ Clean / needs attention |
| HEAD hash | `abc123` |
| Ahead/behind main | 1 ahead, 0 behind |

## MERGE + TAG RELEASE FLOW

After user approval:

```bash
# 1. Merge PR (merge commit, no squash)
gh pr merge 1 --merge --subject "sprint(v2.1.1): <title>"

# 2. Checkout main + pull latest
git checkout main
git pull origin main

# 3. Tag release
git tag v2.1.1
git push origin v2.1.1

# 4. Verify
git log --oneline -1          # Should show merge commit
git tag -l "v*" | sort -V     # Confirm tag exists
git status --short             # Clean?
git rev-list --count HEAD..origin/main  # 0 behind?

# 5. Report
echo "Merge commit: $(git rev-parse HEAD)"
echo "Tag: v2.1.1"
echo "Branch: $(git branch --show-current)"
```

### Safety Rules for Merge

- ❌ Never squash unless explicitly instructed
- ❌ Never force-push
- ❌ Never rebase
- ❌ Never merge to main without user approval
- ❌ Never push secrets, DB files, or build artifacts
- Keep the sprint branch for 1-2 sprints for hotfix backports

## VERIFY AFTER PUSH / MERGE

```bash
git branch --show-current     # Confirm you're on sprint branch (before merge) or main (after)
git log --oneline -1           # Confirm commit hash (sprint commit or merge commit)
git status --short             # Confirm working tree is clean
```
