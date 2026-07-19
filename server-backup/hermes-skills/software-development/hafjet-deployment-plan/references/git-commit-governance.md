# Git Commit Governance — HARD RULE (Tuan Hafizi, 2026-07-18)

**Show `git status` + `git diff` and get EXPLICIT approval BEFORE running `git commit` — never commit-then-show-diff-after, even when the change is expected/verified clean.**

## Why
Sequence matters for trust, not just correctness. Tuan explicitly corrected Hermes after a session where the agent committed first, then showed the diff for confirmation. The act of committing-before-review broke the trust loop even though the diff was clean.

## Rule
1. Before ANY `git commit`, run `git status` + `git diff` (and `git diff --cached` if staging) and present the exact changes to Tuan.
2. Wait for explicit approval ("commit", "push", "approved", "proceed") before committing.
3. Exception: skip pre-commit review ONLY if Tuan said "commit now" / "approved, proceed" / "deploy" IN THE SAME turn.
4. For multi-file changes, show `git show --stat` of the planned commit (file list + insertions/deletions) before committing.
5. This applies to ALL repos (hafjet-whatsapp-bot, syncera-ai-wasap, etc.) — not just deployment artifacts.

## Paired rules (memory)
- Deploy only on explicit command; show diff + logs before deploy.
- This commit rule + deploy rule together form Tuan's "review-before-action" expectation.

## Note
The main SKILL.md for hafjet-deployment-plan is over the 100k char limit, so this rule lives here as a reference file. When SKILL.md is next refactored (split into references/), fold this section into the body.
