# HAFJET Content Automation — Phase 1 / 1.5 Ops (Aug 2026)

## Placement
- **n8n host**: Hermes Azure (`HAFJET-Hermes-Server`), **not** Oracle.
- Container: `hafjet-n8n` · image `n8nio/n8n:2.8.4`
- Data: `/home/hafizi145/.n8n` → `/home/node/.n8n`
- Public UI/webhooks: `https://n8n.hafjet.my` (cloudflared)
- Workflow: `HAFJET Content Automation` (id `TEl4FEVffYACrkxQ`)
- Admin Telegram chat: `1485374469`

## Content API
| Item | Value |
|------|--------|
| Code | `~/.n8n/content-api/app.py` |
| Port | `9119` |
| systemd | `systemctl --user status hafjet-content-api` |
| Health | `curl -s http://127.0.0.1:9119/health` → expect `google:true` when image path configured |
| Captions | `POST /api/generate` |
| Images | `POST /api/generate-image` (Google Gemini; see `hafjet-content-image-gen-google.md`) |
| Auth | `X-API-Key: <CONTENT_API_TOKEN>` |

## Secrets
- Never collect API keys in Telegram/chat.
- Captions: OpenRouter key in `~/.hermes/.env`
- Images: `GOOGLE_API_KEY` in `~/.hermes/.env` (sync to n8n env if needed)

## docker-compose essentials
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
environment:
  - CONTENT_API_TOKEN=${CONTENT_API_TOKEN}
  - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```
```bash
cd ~/.n8n && sg docker -c '~/.local/bin/docker-compose -f docker-compose.yml up -d --force-recreate'
```

## n8n 2.8 publish/activate (SQLite)
1. New `versionId`
2. `active=1`, `activeVersionId=versionId`
3. Upsert `workflow_published_version`
4. Insert `workflow_history` with same versionId + full nodes/connections
5. Refresh `webhook_entity` for Telegram Callback Trigger
6. Restart n8n → `Activated workflow` + `published workflows` ≥ 1

### Pause schedule only (keep TG callbacks)
- Workflow **active**
- Schedule Trigger `"disabled": true`
- Cron `25 4,12 * * *` UTC = 12:25 & 20:25 MYT

## Product path
Generate Content → Generate Image (continueOnFail) → Merge → sendPhoto **or** text draft + keyboard → Approve checklist (manual post, include image_url when present).

## Common failures
| Symptom | Cause | Fix |
|---------|--------|-----|
| ENOTFOUND host.docker.internal | no extra_hosts | host-gateway + recreate |
| `$env.*` empty | env blocked | `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` |
| active=1 not Activated | missing published/history | insert both; restart |
| Image 429 | Google quota | text fallback; fix billing |
| Photo by URL fails | non-public URL | download binary in n8n first |

## Related
- Brand: `references/hafjet-content-automation-spec.md`
- Images: `references/hafjet-content-image-gen-google.md`
