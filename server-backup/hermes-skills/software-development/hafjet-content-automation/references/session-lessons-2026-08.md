# Session lessons (content automation track, Aug 2026)

## Delivery product
- Phase 1 HITL: 2 captions + visual_prompt (+ image when credits allow) → Telegram keyboard → Approve checklist → manual social.
- No auto-publish; no example.com.

## Technical lessons locked in skill body
- content-api :9119 + OpenRouter image pin + max_tokens 2048
- n8n Code runOnceForEachItem return object
- n8n 2.8 publish triad
- host.docker.internal extra_hosts
- Live audit: executions must reach Send Draft nodes

## Related non-content (pointer only)
- Oracle WhatsApp bot `unhealthy` was missing `curl` in python:3.12-slim healthcheck — prefer pure-Python healthcheck (`urllib.request`) or install curl in image. Not content-api specific.

## Overlap note
Deep files also live under `automation-workflow-dev/references/*`. Prefer this skill for routing HAFJET content tasks; prefer automation-workflow-dev for generic n8n/tunnel patterns.
