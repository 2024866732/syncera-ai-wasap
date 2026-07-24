# DataHub Self-Hosted Deployment

## Overview

[DataHub](https://datahub.io) is an open-source metadata platform for data discovery, lineage,
and governance. The quickstart method deploys 13 containers via docker-compose.

## Resource Requirements (from official docs)

| Resource | Tested Config | Minimum |
|---|---|---|
| CPU | 2 cores | 2 cores |
| RAM | **8 GB** | 6 GB (risky below 8 GB) |
| Swap | 2 GB | — |
| Disk | **13 GB** | 8 GB (tight) |
| Docker | Docker + Compose v2 | v2 required |

### Services deployed (13 containers)

- datahub-frontend (React UI, port 9002)
- datahub-gms (backend API, port 8080)
- datahub-mae-consumer
- datahub-mce-consumer
- datahub-actions
- datahub-system-update
- elasticsearch OR opensearch (~2 GB RAM each)
- mysql (~512 MB)
- kafka + zookeeper (~1 GB)
- datahub-upgrade (one-shot, exits after migration)

## Quickstart Steps

```bash
# 1. Install DataHub CLI
python3 -m pip install --upgrade pip wheel setuptools
python3 -m pip install --upgrade acryl-datahub

# 2. Verify
datahub version

# 3. Start DataHub (pulls + starts all 13 containers)
datahub docker quickstart

# 4. Sign in at http://localhost:9002
#    Username: datahub
#    Password: datahub

# 5. (Optional) Load sample data
datahub init --username datahub --password datahub
datahub datapack load showcase-ecommerce
```

### Version pinning

```bash
# Specific release
datahub docker quickstart --version v1.6.0

# Latest coordinated dev images (master branch)
datahub docker quickstart --version head
```

## DataHub Skills (AI Agent Skills)

DataHub ships an open-source [skills registry](https://github.com/datahub-project/datahub-skills)
that gives AI agents (Claude Code, Codex, Cursor, Gemini CLI, Copilot) direct access to
catalog workflows.

### Prerequisites
- Claude Code (or compatible agent) installed
- A running DataHub instance (Cloud or self-hosted)

### Install Skills

```bash
# Fastest path — npx
npx skills add datahub-project/datahub-skills

# Or as Claude Code plugin
claude plugins install datahub-skills --from github:datahub-project/datahub-skills

# Verify
claude plugins list
```

### Connect to DataHub

Run the setup skill inside Claude Code:

```
/datahub-skills:datahub-setup
```

It walks through connecting to a DataHub instance (Cloud URL `<tenant>.acryl.io`
or self-hosted GMS URL `http://localhost:8080`) with a personal access token.

### Available Skills

| Skill | Command | What It Does |
|---|---|---|
| Setup | `/datahub-skills:datahub-setup` | Connect to your DataHub instance |
| Search | `/datahub-skills:datahub-search` | Find assets via descriptions, glossary, quality signals |
| Lineage | `/datahub-skills:datahub-lineage` | Trace upstream sources, downstream consumers |
| Enrich | `/datahub-skills:datahub-enrich` | Add descriptions, tags, glossary terms, owners |
| Quality | `/datahub-skills:datahub-quality` | Find unhealthy assets, investigate incidents |

### Example Workflow: Text-to-SQL

> "What was our revenue by region last quarter?"

Agent uses `datahub-search` to find the canonical revenue table, confirms it's the certified
source, generates SQL, and runs it against the warehouse.

## Management Commands

```bash
# Stop
datahub docker quickstart --stop

# Reset (cleanse all state)
datahub docker nuke

# Backup MySQL
datahub docker quickstart --backup

# Restore from backup
datahub docker quickstart --restore

# Upgrade (re-pulls images, preserves data)
datahub docker quickstart
```

## When the Server Can't Run It

If RAM < 6 GB or disk < 10 GB:

1. **DataHub Cloud** — https://datahub.com (free trial at `/free-trial/`, managed, zero ops)
   - **Signup is NOT instant self-service** — fill out a HubSpot form on the free-trial page,
     then the DataHub integrations team provisions the instance manually.
   - You receive: tenant URL (`https://<your-tenant>.acryl.io`) + admin invite link + credentials.
   - Supports OIDC (Google, Okta) via Client ID/Secret/Discovery URL setup.
   - AWS PrivateLink available for private connection to existing VPC.
2. **Bigger machine** — PC Office (16 GB RAM) or 8GB VPS (RM50-80/mo)
3. **CLI-only ingestion** — `pip install acryl-datahub` lets you push metadata
   via Python scripts to a remote DataHub instance without hosting the full stack

## Security Notes (quickstart)

- ⚠️ Default credentials: `datahub`/`datahub` — CHANGE before any network exposure
- ⚠️ All ports bind to `0.0.0.0` by default — restrict with firewall or run behind Tailscale
- ⚠️ Not intended for production — use Kubernetes/Helm for production deployments

## References

- Official quickstart: https://docs.datahub.com/docs/quickstart
- DataHub CLI docs: https://docs.datahub.com/docs/cli
- Skills registry: https://github.com/datahub-project/datahub-skills (also works with Cursor, Copilot, Codex, Gemini CLI, Windsurf)
- DataHub Cloud free trial: https://datahub.com/free-trial
- MCP Server setup: https://docs.datahub.com/docs/features/feature-guides/mcp
