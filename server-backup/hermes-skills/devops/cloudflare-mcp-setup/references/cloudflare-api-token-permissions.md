---
title: Cloudflare API Token Permissions Matrix
description: Required and recommended permissions for Cloudflare MCP servers
---

# Cloudflare API Token Permissions for MCP Servers

## Minimum Required (All Authenticated Servers)

| Category | Permission | Access | Required For |
|----------|------------|--------|--------------|
| Account | Workers Scripts | Read | cloudflare, cloudflare-bindings, cloudflare-builds, cloudflare-observability |
| Account | Workers KV Storage | Read | cloudflare-bindings |
| Account | Account Settings | Read | All authenticated servers |

## Recommended Additional Permissions

| Category | Permission | Access | Required For |
|----------|------------|--------|--------------|
| Account | D1 Database | Read | cloudflare-bindings (D1 tools) |
| Account | R2 | Read | cloudflare-bindings (R2 tools) |
| Account | Hyperdrive | Read | cloudflare-bindings (Hyperdrive tools) |
| Zone | Zone Settings | Read | cloudflare-docs, cloudflare-observability |

## Permission Details by Server

### cloudflare (Main API)
- **Workers Scripts: Read** — List/get Workers, search API spec
- **Account Settings: Read** — Account info for API execution

### cloudflare-bindings (Resource Management)
- **Workers Scripts: Read** — List/get Workers
- **Workers KV Storage: Read** — List/get/create/update/delete KV namespaces
- **D1 Database: Read** — List/get/create/query D1 databases
- **R2: Read** — List/get/create/delete R2 buckets
- **Hyperdrive: Read** — List/get/edit Hyperdrive configs

### cloudflare-builds
- **Workers Scripts: Read** — List Workers + builds

### cloudflare-observability
- **Workers Scripts: Read** — List Workers for observability queries
- **Account Settings: Read** — Account info
- **Zone Settings: Read** (optional) — Zone-level metrics

### cloudflare-docs
- **No auth required** — Public documentation server

## Creating the Token

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token** → **Custom token**
3. **Account Resources**: Select your account (e.g., "Hafizi145@gmail.com's Account")
4. **Permissions**: Add the required permissions from tables above
5. **Zone Resources**: "All zones" for Zone Settings Read (or specific zones)
6. **TTL**: 1 year (or "No expiration" if available)
7. **IP Filtering**: Leave default (all addresses) unless strict security required
8. Click **Continue to summary** → **Create Token**
9. **COPY THE TOKEN IMMEDIATELY** — shown only once!

## Token Format

Valid tokens look like: `cfut_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

**⚠️ DO NOT include angle brackets `< >` in .env** — shell interprets `<` as heredoc redirection.

Wrong: `CLOUDFLARE_API_TOKEN=<cfut_abc123>`
Right: `CLOUDFLARE_API_TOKEN=cfut_abc123`

## Verifying Token Works

```bash
# Test with cloudflare-docs (no auth needed)
hermes mcp test cloudflare-docs

# Test with authenticated server (after adding)
hermes mcp test cloudflare

# Or via curl
curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Token missing/invalid permissions | Check token in .env, verify permissions |
| 403 Forbidden | Token lacks specific permission | Add missing permission in dashboard |
| DNS resolution failed | Wrong URL | Use exact URLs from SKILL.md |
| "Object does not exist" | Wrong account ID | Token must match account with resources |

## Security Best Practices

1. **Principle of least privilege** — Only grant Read permissions needed
2. **Separate tokens per environment** — Dev vs prod tokens
3. **Rotate annually** — Set calendar reminder
4. **Audit token usage** — Check Cloudflare audit logs periodically
5. **Never commit tokens** — .env is in .gitignore (verify)