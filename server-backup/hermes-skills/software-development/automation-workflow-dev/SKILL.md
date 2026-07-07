---
name: automation-workflow-dev
description: Use when setting up, extending, or troubleshooting self-hosted workflow automation platforms (n8n, similar) and when building automations with Context7-driven documentation lookup. Covers constrained Linux installs, npm/node workarounds, and Context7 query patterns for automation providers.
trigger: "user mentions n8n, workflow automation, automation project, self-hosted automation, Context7 for automation, build/buat automation, n8n workflow"
---

# Automation Workflow Development

Guiding principle: **Context7 docs first, then build.** User's explicit rule: for every automation project henceforth, use the Context7 CLI to fetch current library/docs before designing workflows.

## Core Flow

1. Identify the platform/docs need
2. Resolve Context7 library ID
3. Fetch docs for exact feature/trigger/action/auth
4. Build/validate from current docs, not training data

## Context7 Query Pattern

```bash
# 1) Resolve library
ctx7 library <owner>/<repo>

# 2) Fetch exact docs
ctx7 docs <context7-id> <specific-topic>

# 3) If blocked as false-positive long-process, retry with simpler query
```

## n8n Context7 Libraries (proven)

- `/n8n-io/n8n-docs` — auth/workflow/trigger/action docs (highest density)
- `/n8n-io/n8n-hosting` — deployment (Docker/K8s/Azure/etc.)
- `/context7/n8n_io` — broad integration examples

## Constrained Environment Install (read-only /home, writable `~/.hermes/`)

When `apt`/`sudo`/`nvm` is unavailable and `/home` is mounted read-only:

### Node binary workaround
```bash
mkdir -p ~/.hermes/n8n
curl -fSL https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz -o /tmp/node.tar.xz
tar -xJf /tmp/node.tar.xz -C ~/.hermes/n8n --strip-components=1
export PATH="$HOME/.hermes/n8n/bin:$PATH"
node --version
```

### npm without global root
```bash
export PATH="$HOME/.hermes/n8n/bin:$PATH"
mkdir -p ~/.hermes/npm-global ~/.hermes/npm-cache ~/.hermes/npm-tmp
npm_config_prefix="$HOME/.hermes/npm-global" \
npm_config_cache="$HOME/.hermes/npm-cache" \
npm_config_tmp="$HOME/.hermes/npm-tmp" \
npm install -g <package>
# add global bin to PATH
export PATH="$HOME/.hermes/npm-global/bin:$PATH"
```

## n8n Verified Paths

- n8n CLI: `~/.hermes/npm-global/bin/n8n`
- Config/env: set per-run via Environment Variables or `~/.n8n/` under writable home
- If SQLite or SQLite-backed metadata required, verify disk write path is writable before starting

## Anti-patterns

- Do not `npm install -g` with default prefix on read-only `/home`
- Do not rely on `nvm` in this environment
- Do not assume `~/.local` is writable (`/home` ro); use `~/.hermes/`

## References

- `references/n8n-context7.md` — proven Context7 library IDs and verified environment details
- `scripts/probe-automation-env.sh` — one-shot verification of node/npm/n8n/ctx7 paths and versions
