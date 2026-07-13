---
name: skill-readiness-validation
description: "Validate that loaded skills are actually runnable on this server — check env vars, test imports, verify scripts exist. Use after bulk skill review, server setup, or system updates."
version: 1.0.0
author: Hermes-HAFJET
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [validation, setup, skills, prerequisites, health-check]
    category: productivity
---

# Skill Readiness Validation

Systematically verify that Hermes skills are runnable — not just installed. Use when the user asks "what skills do we have?", after server setup, or when adding new capabilities.

## Validation Checklist

For each skill, run these steps in order:

### 1. Load the skill
```
skill_view(name="<skill-name>")
```
Check `readiness_status` in the response: `available` or `setup_needed`.

### 2. Check environment variables
From the skill's `required_environment_variables`:
```bash
echo $VARIABLE_NAME | head -c 10   # verify non-empty
grep -q "VARIABLE_NAME" ~/.hermes/.env 2>/dev/null && echo "SET" || echo "NOT SET"
```

### 3. Check required commands
From the skill's `required_commands` or its SKILL.md:
```bash
command -v <cmd> && echo "OK" || echo "MISSING"
```

### 4. Test Python imports (for skills with pip deps)
```bash
python3 -c "import <module>; print('OK')" 2>/dev/null || echo "NOT INSTALLED"
```
**Pitfall**: Systems with multiple Python versions may install packages to the wrong interpreter. If `python3 -c "import X"` fails but the package was installed, check alternate versions:
```bash
python3.10 -c "import X" 2>/dev/null && echo "on 3.10"
python3.11 -c "import X" 2>/dev/null && echo "on 3.11"
```
Fix: install for the correct version (`pip3.11 install X`) or use the working python in scripts.

### 5. Test scripts
If the skill has helper scripts, run a minimal test:
```bash
python3 <script-path> --help 2>&1 | head -3
# or a known-safe invocation:
python3 <script-path> search "test query"
```

### 6. Report status
Present results as a table:

| Skill | Status | Notes |
|-------|--------|-------|
| skill-name | ✅ Ready | — |
| skill-name | ⚠️ Needs setup | Missing: TENOR_API_KEY |
| skill-name | ❌ Broken | ImportError: pymupdf on python3.11 |

## Batch Validation Pattern

When reviewing multiple skills at once:

1. Load all skills in parallel (`skill_view` calls in one block)
2. Check prereqs in a single terminal command (batch env checks)
3. Test scripts sequentially (they may have side effects)
4. Report as a consolidated table

Example batch env check:
```bash
echo "=== VAR1 ===" && echo "${VAR1:-NOT SET}" && \
echo "=== VAR2 ===" && (grep -q "VAR2" ~/.hermes/.env 2>/dev/null && echo "SET" || echo "NOT SET") && \
echo "=== module ===" && python3 -c "import X; print('OK')" 2>/dev/null || echo "NOT INSTALLED"
```

## What NOT to Capture

- **Environment-specific failures** (missing binaries on this server, wrong python version, permission denied). These are setup state — the user can fix them. The validation pattern is durable; the specific failure is not.
- **Transient errors** that resolved. If retrying worked, the lesson is "retry", not the original error.
- **Negative claims** ("tool X doesn't work"). These harden into refusals after the actual problem is fixed.

## When to Use

- User asks "what skills are available?" or "which skills are ready?"
- After server migration or OS upgrade
- After installing a batch of new skills
- When a skill fails at runtime and you suspect prereq issues
