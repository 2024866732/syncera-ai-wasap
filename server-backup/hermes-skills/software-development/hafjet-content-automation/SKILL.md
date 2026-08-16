---
name: hafjet-content-automation
description: "Use for HAFJET n8n content drafts and content-api images."
---

# HAFJET Content Automation

Class-level ops for the **HAFJET Content Automation** n8n workflow and companion **content-api** on Hermes Azure.

## Placement
- **n8n + content-api**: Hermes Azure only — `hafjet-n8n`, `~/.n8n/`, `https://n8n.hafjet.my`
- **Not Oracle**
- TG admin `1485374469` · Cron `25 4,12 * * *` UTC = **12:25 & 20:25 MYT**

## Flow
```
Schedule/Manual → /api/generate → /api/generate-image (continueOnFail)
  → Merge Code → photo+keyboard OR text+keyboard
  → Approve → Publish Checklist (manual post only)
```

## content-api (:9119)
- Code: `~/.n8n/content-api/app.py` · systemd `hafjet-content-api.service`
- Auth: `CONTENT_API_TOKEN` / `X-API-Key`
- Captions: OpenRouter text
- Images: OpenRouter **`google/gemini-2.5-flash-image`** via `chat/completions` + `modalities:["image","text"]` + **`max_tokens:2048`**
- Static: `~/.n8n/content-api/static/images/`
- Compose: `extra_hosts: host.docker.internal:host-gateway`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`

## n8n 2.8 activate
Need `active=1` + `activeVersionId` + `workflow_published_version` + `workflow_history` + restart → log Activated + published≥1.  
Pause cron only: Schedule node `disabled:true`, keep workflow Active for TG callbacks.

## P0 pitfalls
1. Code `runOnceForEachItem` → `return {json:{...}}` never array (else Merge kills fallback).
2. Image fail must still send text draft.
3. TG photo needs binary download (internal URL not public).
4. Never paste API keys in chat; never `*.example.com` publish.
5. Active+Schedule ≠ healthy — audit last executions reach Send Draft nodes.

## Deep refs (shared under automation-workflow-dev)
- `references/hafjet-content-image-openrouter.md`
- `references/n8n-code-node-runonce-foreach-pitfall.md`
- `references/hafjet-content-p0-fallback-and-live-audit.md`
- `references/hafjet-content-phase1-ops.md`
- `references/hafjet-content-automation-spec.md`
