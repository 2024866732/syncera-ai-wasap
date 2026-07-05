---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:
- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**
- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Manager wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database):**

   **BEFORE proposing fixes, add diagnostic instrumentation:**
   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   **Example (multi-layer system):**
   ```bash
   # Layer 1: Workflow
   echo "=== Secrets available in workflow: ==="
   echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

   # Layer 2: Build script
   echo "=== Env vars in build script: ==="
   env | grep IDENTITY || echo "IDENTITY not in environment"

   # Layer 3: Signing script
   echo "=== Keychain state: ==="
   security list-keychains
   security find-identity -v

   # Layer 4: Actual signing
   codesign --sign "$IDENTITY" --verbose=4 "$APP"
   ```

   **This reveals:** Which layer fails (secrets → workflow ✓, workflow → build ✗)

5. **Trace Data Flow**

   **WHEN error is deep in call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation COMPLETELY
   - Don't skim - read every line
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis
   - DON'T add more fixes on top

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Ask for help
   - Research more

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - MUST have before fixing
   - Use the `superpowers:test-driven-development` skill for writing proper failing tests

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - STOP
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1, re-analyze with new information
   - **If ≥ 3: STOP and question the architecture (step 5 below)**
   - DON'T attempt Fix #4 without architectural discussion

5. **If 3+ Fixes Failed: Question Architecture**

   **Pattern indicating architectural problem:**
   - Each fix reveals new shared state/coupling/problem in different place
   - Fixes require "massive refactoring" to implement
   - Each fix creates new symptoms elsewhere

   **STOP and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we "sticking with it through sheer inertia"?
   - Should we refactor architecture vs. continue fixing symptoms?

   **Discuss with your human partner before attempting more fixes**

   This is NOT a failed hypothesis - this is a wrong architecture.

## Red Flags - STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**
+ - **"Let me speculate instead of capturing production evidence"** — when traceback/logs are available but you propose fixes without reading them. Capture real traceback FIRST, then hypothesize. Speculation wastes turns and erodes trust.
+ - **"Counter is zero but activity is clearly happening"** — Suspect constant/string mismatch between producer (e.g. `_detect_routing()` returning `"ai_query"`) and consumer (SQL query filtering `WHERE routing_path='ai'`). Verify the exact stored values before assuming no activity occurred.
+ - **"Middleware check fails — all routes down"** — When a `DASHBOARD_API_KEY` or similar guard is checked at the top of a middleware function (before path validation), an empty/misconfigured env var crashes ALL endpoints including webhook, health, and dashboard. Check: does the middleware check `if not SECRET: return 500` BEFORE scoping to protected routes? If yes, the guard is wrong — scope the check AFTER determining the route is protected.

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** Question the architecture (see Phase 4.5)

## your human partner's Signals You're Doing It Wrong

**Watch for these redirections:**
- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You're proposing fixes without understanding
- "Ultra-think this" - Question fundamentals, not just symptoms
- "We're stuck?" (frustrated) - Your approach isn't working
- **"'Semua dah ok' — ada bukti dashboard yang bercanggah"** — You claimed success without consulting the actual evidence (dashboard, logs, endpoint output). The human had to correct you mid-claim. Always verify with real tool output before declaring a fix done.

**When you see these:** STOP. Return to Phase 1.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |

## SQLite Idempotent Schema Migration Pattern

When you need to add columns to an existing SQLite database (common in lightweight projects that don't use Alembic):

```python
# In init_db(), after CREATE TABLE IF NOT EXISTS:
for col_def in [
    "escalated_at TIMESTAMP",
    "resolved_at TIMESTAMP",
    "assigned_to VARCHAR(50)",
    "note TEXT",
]:
    try:
        conn.execute(f"ALTER TABLE customers ADD COLUMN {col_def}")
    except sqlite3.OperationalError:
        pass  # Column already exists — skip
```

**Why this pattern:** SQLite lacks `ALTER TABLE ... IF NOT EXISTS`. Running `ALTER TABLE ADD COLUMN` on an existing column raises `OperationalError`. The try/except wrapper makes the migration idempotent — safe to run on every startup.

**Detection:** If your API returns `sqlite3.OperationalError: no such column: resolved_at`, the migration didn't run because the column wasn't in the original CREATE TABLE and no ALTER was applied.

**Fix:** Add the ALTER TABLE loop to `init_db()`, restart the server.

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When Process Reveals "No Root Cause"

If systematic investigation reveals issue is truly environmental, timing-dependent, or external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

**But:** 95% of "no root cause" cases are incomplete investigation.

## Python `__pycache__` — The Silent Route Killer

**Symptom:** New routes return 404 after deployment. `/openapi.json` shows old routes only. Source code has the new routes but server ignores them. Existing routes work fine.

**Root cause:** Stale `.pyc` files in `__pycache__/` are newer than source after zip extraction. Python loads bytecode instead of source — new routes never register.

**Fix:** Always `find . -name "__pycache__" -type d -exec rm -rf {} +` before starting server. Never include `__pycache__` in deployment zips.

See `references/python-cache-pitfalls.md` for full details and the Azure startup command pattern.

## Async Python Webhook Pitfalls (FastAPI)

When debugging async Python services (FastAPI webhook handlers, API servers), check these specific patterns before examining logic bugs:

1. **Sync I/O in async context** — `json.load`/`json.dump`, `open()`, SQLAlchemy sync queries, ORM calls with sync driver. Use `loop.run_in_executor(None, func, *args)` to offload to thread pool.
2. **`subprocess.run` in `async def`** blocks event loop. Use `asyncio.create_subprocess_exec()` instead.
3. **Signature verification bypass** — `if not secret: return True` silently disables security when env var is unset. Always return `False` when secret is missing.
4. **Overly broad keyword triggers** — Single-word triggers like `"repair"`, `"job"`, `"status"` cause false positive routing. Use phrase-level or `startswith` matching.

See **`references/async-python-pitfalls.md`** for code examples and quick-scan commands.

## Supporting Techniques

These techniques are part of systematic debugging and available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling
- **`async-python-pitfalls.md`** - FastAPI/async-specific bugs (sync blocking, signature bypass, keyword routing)
- **`python-cache-pitfalls.md`** - `__pycache__` stale bytecode causing 404s after deployment
- **`github-push-protection.md`** — GitHub Push Protection blocking `git push` due to secrets in history (gh OAuth tokens, API keys). Diagnostic + `git filter-repo` fix.
- **`azure-zip-deployment.md`** — Azure App Service zip deploy patterns, excludes, startup commands, env vars
- **`config-origin-tracing.md`** — Trace a config value through all layers (env var → Python → API → DB → built JS → live dashboard) to determine runtime source of truth. 5-step investigation with exact commands, pitfall table, and quick-reference checklist.
- **`ai-llm-logging-fallback.md`** - Detailed logging of LLM requests/responses, config validation, timeout handling, empty/None response fallback
- **`frontend-backend-field-mapping.md`** — When frontend shows unexpected labels ("SYSTEM", blank text) or missing data, cross-reference field names between API JSON response keys and React component properties. Common mismatch: DB column `content` vs JavaScript `message.message`, DB column `direction` vs React `message.source`. SQL `SELECT *` returns raw DB columns, frontend may expect aliased or computed fields.
- **`fastapi-openapi-route-verification.md`** — OpenAPI schema as definitive FastAPI route registration diagnostic. Detects stale bytecode, Oryx cache, and silent import errors by comparing registered routes against expected endpoints.

**Related skills:**
- **superpowers:test-driven-development** - For creating failing test case (Phase 4, Step 1)
- **superpowers:verification-before-completion** - Verify fix worked before claiming success

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common
