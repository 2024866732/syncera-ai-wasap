---
name: hermes-skill-install
description: Use when installing third-party agent skills into Hermes—especially when `uv tool install` is blocked by read-only filesystem or cache issues—and for verifying the skill is loadable.
---

# Hermes Skill Install

## Overview

External skill installers that target Hermes can fail under `uv tool` or `pipx` because of filesystem/cache restrictions (e.g. read-only `$HOME/.cache/uv/` or user-site paths). This skill documents a reliable venv fallback and Hermes-specific path rules for the install and the always-on wiring.

## When to use

- Installing a third-party skill whose repo provides a CLI installer targeting Hermes.
- `uv tool install <pkg>` fails with lock/cache or read-only errors.
- Need to confirm the skill is discoverable by Hermes after install.

## Core pattern

1. Clone the source repo or prepare a local wheel.
2. Build an isolated venv to run the installer:
   ```bash
   python3 -m venv /tmp/venv-<skill>
   /tmp/venv-<skill>/bin/pip install --no-cache-dir /path/to/repo
   ```
3. Run the installer:
   ```bash
   /tmp/venv-<skill>/bin/<cli> install --platform hermes
   ```
4. Verify:
   ```bash
   ls -la ~/.hermes/skills/<skill>/SKILL.md
   ```

## Hermes-specific rules

- Skill file lands at: `~/.hermes/skills/<skill>/SKILL.md`
- References sidecar: `~/.hermes/skills/<skill>/references/`
- `<cli> hermes install` writes an `AGENTS.md` section in the **current working directory**, not under `~/.hermes/`. For WebUI sessions, that is the active workspace. If you need project-level wiring, cd there first or use `--project`.
- The PyPI package name can differ from the installed CLI name (e.g. `graphifyy` installs as `graphify`). Always confirm the package name in the upstream README.

## Pitfalls

- Do NOT use `pip install --user -e <repo>` if `~/.local` is read-only. Use a `/tmp` venv.
- `uv tool install` can error with `Read-only file system` inside `$HOME/.cache/uv/`. Retrying will not fix it; switch to pip-in-venv.
- Some installers write rewrite rules (graphify → `AGENTS.md`). If the CWD is wrong, the rules attach to the wrong directory.
- Do not execute install scripts from untrusted sources without first reviewing their contents for malicious commands.

## Verification

After install, confirm:
- `~/.hermes/skills/<skill>/SKILL.md` exists
- `skill_view(name="<skill>")` reports `readiness_status: available`
