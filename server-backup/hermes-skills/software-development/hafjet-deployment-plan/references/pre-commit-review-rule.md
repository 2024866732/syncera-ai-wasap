# Pre-Commit Review Rule (HARD, established Jul 2026)

## The Rule
**Show `git status` + `git diff` and get EXPLICIT approval from Tuan Hafizi BEFORE running `git commit` — NEVER commit-then-show-diff-after, even if the change is expected/verified clean.**

Tuan's exact words: "For future commits: pause and show diff BEFORE committing, not after — even if the change is expected to be clean. Sequence matters for trust, not just correctness."

## Sequence
1. Apply code changes (patches via `patch` tool)
2. `python3 -m py_compile` syntax check on modified files
3. `git diff --stat` + `git diff` — show Tuan the exact changes
4. **STOP. Wait for explicit approval.**
5. Only then `git add` + `git commit`
6. Only then `git push` (if remote maintained)

## Exception
Only skip pre-commit review if Tuan explicitly says "commit now" / "approved, proceed" / "go" BEFORE the diff is shown. But the default is ALWAYS show-then-approve-then-commit.

## Context
This rule was established after an incident where a commit was executed before the user had a chance to review the diff. The user acknowledged the commit was correct but emphasized that the sequence (pre-review) matters for trust, not just correctness.

## Applies To
All git commits in HAFJET projects — not just deployment commits. Includes:
- Feature commits
- Bugfix commits
- Hotfix commits
- Cleanup/hygiene commits
