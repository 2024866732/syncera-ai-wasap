---
name: automation-workflow-dev
description: Use when setting up, extending, or troubleshooting self-hosted workflow automation platforms (n8n, similar) and when building automations with Context7-driven documentation lookup. Covers constrained Linux installs, npm/node workarounds, and Context7 query patterns for automation providers.
trigger: "user mentions n8n, workflow automation, automation project, self-hosted automation, Context7 for automation, build/buat automation, n8n workflow, Cloudflare tunnel, public webhook URL, Telegram bot webhook, content automation"
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
- **REST API auth (community edition)**: n8n's `/rest/*` endpoints use cookie-based session auth — basic auth only covers the web UI at `/`. To programmatically import workflows/credentials, first POST to `/rest/login` with `{emailOrLdapLoginId, password}`, capture the `n8n-auth` cookie, then use it on subsequent REST calls. Alternatively, use the web UI for manual workflow import.
- **VPS memory constraint**: On 1GB RAM + 4GB swap instances, n8n container uses ~200-400MB idle. Monitor with `docker stats`. If OOM, add `mem_limit: 512m` to the compose service.

## Anti-patterns

- Do not `npm install -g` with default prefix on read-only `/home`
- Do not rely on `nvm` in this environment
- Do not assume `~/.local` is writable (`/home` ro); use `~/.hermes/`
- **Do NOT use shell redirection (`cat >`, `tee`, `>>`) for dotfiles/config files** — Hermes security scanner blocks these as "Dotfile overwrite detected". Use the `write_file` tool instead for `.env`, `.config`, `docker-compose.yml`, etc.
- **Do NOT use `newgrp docker` in Hermes terminal** — see pitfall above; always use `sg docker -c "..."` for post-group-add docker commands
- The `docker compose` plugin command won't work on Docker-from-apt (no compose plugin); always use standalone `~/.local/bin/docker-compose`
- **Do NOT reference `$json` in Switch conditions when an intermediate node transforms data** — after a processing node like Answer Callback Query, `$json.callback_query.data` resolves to the API response, not the original callback query. Use `$('Telegram Callback Trigger').item.json.callback_query.data` to reach back past the transform. See `references/n8n-telegram-approval-workflow.md` for the full Telegram callback_query pattern.

## n8n Workflow JSON Design Patterns

When building n8n workflows as raw JSON files (rather than via the web UI):

### Telegram Inline Keyboard Approval Flow
Full pattern documented in `references/n8n-telegram-approval-workflow.md`. Key takeaways:
- **Flow**: Schedule Trigger → HTTP generate → Telegram send with inline keyboard → Telegram Trigger (callback_query) → Answer Callback Query → Switch route
- **Switch pitfall**: if Answer Callback Query sits between Trigger and Switch, Switch rules MUST reference `$('Telegram Callback Trigger').item.json.callback_query.data` — NOT `$json.callback_query.data` (which sees the Answer Callback API response)
- **Grouping**: use `combinator: "or"` in Switch rules to route multiple callback_data values to the same output (e.g., `approve_1` and `approve_2` both → approve branch)
- **Text input**: use `reply_markup: {"force_reply": true, "input_field_placeholder": "..."}` for branches that need user text follow-up (revise, schedule change, reject reason)
- **MYT→UTC cron**: subtract 8 hours — `25 4,12 * * *` UTC = 12:25 & 20:25 MYT. Always set `settings.timezone: "Asia/Kuala_Lumpur"` in workflow JSON

### After writing a workflow JSON
Always validate:
```bash
python3 -m json.tool workflow.json > /dev/null && echo "Valid JSON"
```
Then verify all connection targets reference existing node names — broken connections import silently and fail at runtime.

## Docker Compose on Azure Ubuntu (2026-07-31 learning)

On Azure Ubuntu 22.04 with Docker 29.x installed via apt, the `docker-compose-plugin` package is not available in standard repos. Workaround:

```bash
# Install standalone docker-compose v2 binary to user-writable location
mkdir -p ~/.local/bin
curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 \
  -o ~/.local/bin/docker-compose
chmod +x ~/.local/bin/docker-compose
export PATH="$HOME/.local/bin:$PATH"
docker-compose version  # verify
```

After **sudo usermod -aG docker $USER**, the user must re-login for group membership to take effect. **CRITICAL**: `newgrp docker` does NOT work inside Hermes Agent terminal sessions (creates a subshell that loses the group context). Use `sg docker -c "command"` instead:

```bash
# WRONG: newgrp docker && docker ps  (silently fails with permission denied)
# CORRECT:
sg docker -c "docker ps"
sg docker -c "~/.local/bin/docker-compose -f compose-file.yml up -d"
```

Then use full path: `~/.local/bin/docker-compose -f <compose-file> up -d`.

## n8n Docker Compose for Telegram Bot Webhooks

Required environment for Telegram webhook integration:
- `WEBHOOK_URL` MUST be a public HTTPS URL (use Cloudflare tunnel / ngrok for local dev)
- `N8N_ENCRYPTION_KEY` must persist in `~/.n8n/config` for credential decryption
- `GENERIC_TIMEZONE=Asia/Kuala_Lumpur` for Malaysia timezone scheduling
- Volume mount `~/.n8n:/home/node/.n8n` for SQLite DB + config persistence

Example minimal compose:
```yaml
services:
  n8n:
    image: n8nio/n8n:2.8.4
    container_name: hafjet-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=hafizi145
      - N8N_BASIC_AUTH_PASSWORD=changeme123
      - WEBHOOK_URL=https://your-domain.com/webhook
      - GENERIC_TIMEZONE=Asia/Kuala_Lumpur
      - TZ=Asia/Kuala_Lumpur
      - DB_SQLITE_DATABASE=/home/node/.n8n/database.sqlite
      - N8N_ENCRYPTION_KEY=your-32-char-key
      - EXECUTIONS_MODE=regular
    volumes:
      - /home/hafizi145/.n8n:/home/node/.n8n
    networks:
      - hafjet-network
```

## References

- `references/n8n-context7.md` — proven Context7 library IDs and verified environment details
- `scripts/probe-automation-env.sh` — one-shot verification of node/npm/n8n/ctx7 paths and versions
- `references/n8n-docker-compose.md` — docker-compose setup patterns for Azure Ubuntu + Telegram webhooks
- `references/n8n-telegram-approval-workflow.md` — Telegram inline keyboard approval pattern: Switch data-referencing pitfall, inline keyboard JSON, force_reply, MYT cron conversion, workflow validation
- `references/hafjet-content-automation-spec.md` — **HAFJET Content Automation full system prompt**: brand config, content pillars, approval workflow, inline keyboard spec, caption standards, publishing rules, reporting format. Reference this when building n8n workflows for HAFJET social media automation.
- **Cross-skill**: Cloudflare Tunnel setup → load `self-hosted-deployment`, see `references/cloudflare-tunnel.md`
