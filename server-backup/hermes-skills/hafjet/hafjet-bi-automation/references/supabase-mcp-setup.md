# Supabase MCP & Agent Skills Setup

## OpenCode MCP Configuration

Add to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "supabase": {
      "type": "remote",
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching",
      "enabled": true
    }
  }
}
```

**HAFJET project ref:** `ksqrpttesrrnzatgagyh`

## OAuth Authentication

```bash
# MUST run from local machine (Windows/Mac) with browser — NOT from headless server
opencode mcp auth supabase
```

This opens a browser → login to Supabase → authorize → callback completes auth.
The Hermes server is headless (no browser) — this step will time out if run from Hermes terminal.
Tuan must run it from their Windows PC.

## Agent Skills Installation

```bash
# Install Supabase agent skills — use --yes (NOT --global)
npx skills add supabase/agent-skills --yes

# Installs to:
#   ~/.config/opencode/.agents/skills/supabase/
#   ~/.config/opencode/.agents/skills/supabase-postgres-best-practices/
```

The `--yes` flag auto-accepts all prompts. The `--global` flag fails with `PromptScript does not support global skill installation`.

## MCP Tools Availability

| Agent | MCP Tools Available? | Notes |
|-------|:---:|-------|
| OpenCode | ✅ Yes | After auth: full SQL execution, table management |
| Hermes Agent | ❌ No | MCP servers in opencode.json not loaded by Hermes |
| Grok Build | ❌ No | Different tool registry |

**Implication:** For DDL/SQL execution, use OpenCode or manual SQL Editor. Hermes uses supabase Python SDK (CRUD + RPC only).

## Schema Deployment Workaround

When SDK can't execute DDL and PG port is blocked:
1. Copy SQL → `~/.hermes/cache/documents/supabase_schema.txt`
2. Send via Telegram `MEDIA:` directive
3. Tuan pastes into Supabase SQL Editor → Run

All SQL uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — safe to re-run.

## Verified State (2026-08-05)

| Item | Status |
|------|:---:|
| OpenCode MCP config | ✅ |
| OAuth auth | ✅ (Tuan's Windows PC) |
| Agent skills (2) | ✅ |
| Schema SQL | ✅ Sent (pending SQL Editor) |
| Vendor RPC | ⏳ Pending schema |
