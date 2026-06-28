# GitHub Push Protection: Secret Scanning Block

## Symptom

`git push` fails with:
```
remote: error: GH013: Repository rule violations found for refs/heads/BRANCH
remote: - GITHUB PUSH PROTECTION
remote:   — Push cannot contain secrets
remote:       —— GitHub OAuth Access Token —
remote:         locations:
remote:           - commit: abc123
remote:             path: some/file.yml:4
To https://github.com/OWNER/REPO.git
 ! [remote rejected] BRANCH -> BRANCH (push declined due to repository rule violations)
```

## Root Cause

GitHub scans ALL commits in the push (including history) for secret patterns:
- `gho_*` (GitHub OAuth tokens)
- `sk-*` / `csk-*` (API keys)
- AWS keys, etc.

The secret may be in a **prior commit** (not the one you're pushing), especially if a backup script accidentally included `~/.config/gh/hosts.yml`.

## Diagnostic

```bash
# Find which commits contain the secret
git log --all --oneline -- path/to/file.yml

# Search all commits for token patterns
git grep -l "gho_\|sk-\|csk-" $(git rev-list --all)

# Check current file content (may already be clean locally)
cat path/to/file.yml
```

## Fix

### Option A: Secret only in current commit (not yet pushed)
```bash
git rm --cached path/to/file.yml
# Remove from working tree too
rm path/to/file.yml
git commit --amend --no-edit
git push
```

### Option B: Secret in PRIOR commits (history rewrite required)
```bash
# Install tool
pip install git-filter-repo

# Scrub from ALL history
git filter-repo --invert-paths --path path/to/file.yml --force
# NOTE: filter-repo removes 'origin' remote!

# Re-add remote
git remote add origin https://github.com/OWNER/REPO.git

# Verify
git log --all --oneline -- path/to/file.yml  # should be empty
git grep -l "gho_" $(git rev-list --all)       # should be empty

# Force push (history rewritten)
git push origin BRANCH --force
```

## Prevention

1. **Never copy `~/.config/gh/hosts.yml`** into any git repo
2. Add to `.gitignore`:
   ```gitignore
   **/hosts.yml
   **/.env
   **/auth.json
   **/*.key
   ```
3. Run `git grep -l "gho_\|sk-" $(git rev-list --all)` before pushing backup folders
4. When backing up server config to git, explicitly exclude `~/.config/gh/` entirely

## Key Insight

GitHub Push Protection scans **the entire commit history in the push range**, not just the HEAD commit. A token committed 5 commits ago will still block today's push. Only `git filter-repo` (or BFG) can remove it from history.
