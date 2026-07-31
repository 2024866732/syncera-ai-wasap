---
name: cloudflare-mcp-setup
description: Set up Cloudflare MCP servers in Hermes Agent for managing Workers, KV, R2, D1, Hyperdrive, builds, and observability. Covers token creation, auth methods, and all 5 MCP server types.
version: 1.0.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [cloudflare, mcp, workers, kv, r2, d1, hyperdrive, observability]
---

# Cloudflare MCP Setup for Hermes

Configure all 5 Cloudflare MCP servers in Hermes Agent to manage Cloudflare resources via natural language.

## Prerequisites

1. Cloudflare account with Workers paid plan (or Workers free with limits)
2. API Token with required permissions (see below)

## Required API Token Permissions

Create token at: https://dash.cloudflare.com/profile/api-tokens

**Account-level permissions (minimum):**
- Workers Scripts: Read
- Workers KV Storage: Read
- Account Settings: Read

**Recommended additions:**
- D1 Database: Read (for bindings server)
- Zone Settings: Read (all zones, for docs/observability)

**Token TTL:** 1 year recommended. IP filtering: leave default (all addresses) unless strict security needed.

## The 5 MCP Servers

| Server | URL | Auth | Tools | Purpose |
|--------|-----|------|-------|---------|
| `cloudflare` | `https://mcp.cloudflare.com/mcp` | Header | 3 | Main API + docs search + JS execution |
| `cloudflare-bindings` | `https://bindings.mcp.cloudflare.com/mcp` | Header | 23 | KV, Workers, R2, D1, Hyperdrive |
| `cloudflare-builds` | `https://builds.mcp.cloudflare.com/mcp` | Header | 6 | Workers build management |
| `cloudflare-observability` | `https://observability.mcp.cloudflare.com/mcp` | Header | 8 | Logs, metrics, keys, values |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | None | 2 | Documentation search only |

## Setup Procedure

### 1. Add token to .env

```bash
nano ~/.hermes/.env
# Add:
CLOUDFLARE_API_TOKEN=cfut_xxxxxxxxxxxxxxxxxxxxxxxx
```

**⚠️ Critical:** Do NOT include angle brackets `< >` around the token value. Shell interprets `<` as heredoc redirection, resulting in empty token.

### 2. Add MCP servers via Hermes CLI

```bash
# Main server (requires auth)
HERMES_ACCEPT_HOOKS=1 hermes mcp add cloudflare \
  --url https://mcp.cloudflare.com/mcp \
  --auth header

# Bindings (KV, Workers, R2, D1, Hyperdrive)
HERMES_ACCEPT_HOOKS=1 hermes mcp add cloudflare-bindings \
  --url https://bindings.mcp.cloudflare.com/mcp \
  --auth header

# Builds
HERMES_ACCEPT_HOOKS=1 hermes mcp add cloudflare-builds \
  --url https://builds.mcp.cloudflare.com/mcp \
  --auth header

# Observability
HERMES_ACCEPT_HOOKS=1 hermes mcp add cloudflare-observability \
  --url https://observability.mcp.cloudflare.com/mcp \
  --auth header

# Docs (no auth)
HERMES_ACCEPT_HOOKS=1 hermes mcp add cloudflare-docs \
  --url https://docs.mcp.cloudflare.com/mcp
```

The `--auth header` flag tells Hermes to send the token as `Authorization: Bearer <token>`. Hermes will automatically save the token to `.env` as `MCP_CLOUDFLARE_<SERVER>_API_KEY`.

### 3. Enable tools

Each server prompts "Enable all X tools? [Y/n/select]". Answer `y` to enable all.

### 4. Verify

```bash
hermes mcp list
# Should show all 5 servers with ✓ enabled
```

### 5. Restart Hermes gateway (if running)

```bash
hermes gateway restart
```

## Common Issues & Fixes

### "401 Unauthorized" on connect

- Token missing angle brackets in `.env` → fix and re-run
- Token permissions insufficient → add missing permissions in Cloudflare dashboard
- Token expired → regenerate token

### "No address associated with hostname" (DNS error)

- Wrong URL subdomain → use exact URLs from table above
- `cloudflare-bindings` NOT `cloudflare-bindings.mcp.cloudflare.com` (the main domain already includes it)

### Interactive prompts block automation

Use `HERMES_ACCEPT_HOOKS=1` env var to auto-approve shell hooks. For fully non-interactive, pipe responses via `expect`:

```bash
expect -c "
spawn hermes mcp add cloudflare --url https://mcp.cloudflare.com/mcp --auth header
expect \"Overwrite?\"
send \"Y\r\"
expect \"require authentication?\"
send \"Y\r\"
expect \"API key / Bearer token:\"
send \"$TOKEN\r\"
expect \"Save config anyway\"
send \"y\r\"
expect eof
"
```

## Available Tools After Setup

### cloudflare (3 tools)
- `search_cloudflare_documentation` — Search official docs
- `search` — Search OpenAPI spec
- `execute` — Execute JavaScript against Cloudflare API

### cloudflare-bindings (23 tools)
**KV Namespaces:** list, create, get, update, delete
**Workers:** list, get_worker, get_worker_code
**R2 Buckets:** list, create, get, delete
**D1 Databases:** list, create, get, delete, query
**Hyperdrive:** configs_list, config_get, config_edit, config_delete
**Docs:** search_cloudflare_documentation, migrate_pages_to_workers_guide

### cloudflare-builds (6 tools)
- workers_list, workers_get_worker, workers_get_worker_code
- workers_builds_list_builds, workers_builds_get_build, workers_builds_get_build_logs

### cloudflare-observability (8 tools)
- workers_list, workers_get_worker, workers_get_worker_code
- query_worker_observability, observability_keys, observability_values
- search_cloudflare_documentation, migrate_pages_to_workers_guide

### cloudflare-docs (2 tools)
- search_cloudflare_documentation
- migrate_pages_to_workers_guide

## References

- `references/cloudflare-mcp-tools.md` — Detailed tool reference with examples
- `references/cloudflare-api-token-permissions.md` — Full permission matrix
- Cloudflare MCP docs: https://developers.cloudflare.com/agents/mcp/

## Troubleshooting Checklist

1. Token in `.env` has no `< >` brackets
2. Token has Account: Workers Scripts/KV/Account Settings Read
3. All 5 servers added with correct URLs
4. `hermes mcp list` shows all ✓ enabled
5. New session started (or gateway restarted)
6. Test with: `search_cloudflare_documentation` (no auth needed)

## Security Notes

- Token stored in `~/.hermes/.env` (chmod 600)
- Hermes also saves per-server keys as `MCP_CLOUDFLARE_*_API_KEY`
- Never share token in chat/logs
- Rotate annually or on suspected compromise