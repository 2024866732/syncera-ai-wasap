# Bounded Execution Workflow for DevOps Debugging

When the user gives a scoped debugging/task instruction with explicit bounds (max N actions, stop after X steps, report-only mode), follow this pattern precisely.

## Trigger Conditions

User signals that activate this workflow:
- "Max N actions total"
- "Stop after X steps"
- "Report only: [specific fields]"
- "Do not [action]"
- "Prefer the shortest path"
- "One task only"
- "Read-only diagnose"
- Explicit numbered Action 1, Action 2, ... with "Stop after N actions"

## Rules

### 1. Count Every Tool Call
Count each tool call as one action. Batch independent calls in a single response to conserve the action budget.

### 2. Report Before Execute (if budget allows)
If the plan has ≥3 actions, briefly state what you're about to do before each major step.

### 3. Stop Exactly at the Limit
When you hit the action limit, STOP. Do not start the next step. Report what you found.

### 4. Report in the Exact Format Requested
If the user specifies "Report only: 1. X 2. Y 3. Z", give exactly that format — no preamble, no recommendations, no next steps unless asked.

### 5. Distinguish "Blocked" from "Complete"
- **Complete**: reached the goal → report success
- **Blocked**: hit a wall → report exact blocker (error message, status code, missing credential)
- **Budget exhausted**: hit action limit → report findings so far + what to try next

## Why This Matters

The user wants **control over autonomous execution**. Unbounded exploration wastes tokens, triggers Azure throttles, and frustrates. Bounded execution:
- Respects the user's time and API budget
- Forces clarity on what the actual blocker is
- Prevents "fix cascades" where each fix introduces new bugs

## Session Evidence (2026-06-28)

This pattern emerged during the Azure App Service startup debugging session. Multiple rounds of "max 15 actions", "stop after 5 actions", "report only" instructions kept the debugging focused and prevented the agent from:
- Redeploying repeatedly (triggers Oryx rebuilds + throttle)
- Chasing credentials (Kudu is always redacted)
- Applying fixes without confirming the root cause first

The key insight: **the first `ModuleNotFoundError` is the real blocker; subsequent errors are cascades.** Fix it, redeploy once, validate once. Stop.
