# Migration Safety Checklist

Pre-flight and post-flight checks when migrating an existing project into an existing repo.

## Pre-Migration Checklist

- [ ] Clone target repo and inspect structure (`ls -la`, `find . -not -path './.git/*'`)
- [ ] Check existing commits (`git log --oneline -10`) — note history to preserve
- [ ] Identify default branch (`git branch -a`)
- [ ] Audit source project files (sizes, types, secrets)
- [ ] Confirm no path conflicts (does target subfolder already exist?)
- [ ] Decide strategy: A (replace) / B (merge) / C (subfolder + branch)
- [ ] Default to Strategy C unless user explicitly requests otherwise

## Exclusion Patterns (NEVER commit these)

```
.env
.env.*
__pycache__/
*.pyc
venv/
.venv/
node_modules/
*.zip
*.tar.gz
dist/
build/
*.secret
*.key
*.pem
```

## Commit Message Template

```
feat: migrate <project-name> into <subfolder>

- <One-line description of what was added>
- Exclude secrets (.env), caches, and virtual environments
- Preserve existing repo history on main branch
```

## Post-Migration Verification

```bash
echo "Branch: $(git branch --show-current)"
echo "Remote: $(git remote get-url origin)"
git status
git diff --stat main..HEAD
```

**NEVER push without explicit user approval.** Always present status and wait for green light.
