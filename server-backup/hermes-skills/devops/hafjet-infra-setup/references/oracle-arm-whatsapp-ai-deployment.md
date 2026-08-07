# Oracle ARM + WhatsApp AI Bot Deployment (Aug 2026)

## Server Details
- **IP:** 149.118.152.50
- **Tailscale:** 100.124.99.52
- **SSH Key:** `/tmp/hafjet-oracle-key`
- **AD:** rOJM:AP-KULAI-2-AD-1
- **Subnet:** ocid1.subnet.oc1.ap-kulai-2.aaaaaaaazzf3xfazpd3ym5ad6uoyal37sdimp5kg2au5ovvpyrwqevz3lfsa

## Deployed Services (19 containers)

| Service | Port | Status |
|---------|------|--------|
| Inventory DB | 5433 | ✅ |
| Inventory API | 8080 | ✅ |
| Inventory UI | 8082 | ✅ |
| CRM DB | 5434 | ✅ |
| CRM API | 8090 | ✅ |
| CRM UI | 8092 | ✅ |
| MultiChannel DB | 5435 | ✅ |
| MultiChannel API | 8097 | ✅ |
| MultiChannel UI | 8098 | ✅ |
| Marketing DB | 5436 | ✅ |
| Marketing API | 8100 | ✅ |
| Marketing UI | 8101 | ✅ |
| Supplier DB | 5437 | ✅ |
| Supplier API | 8105 | ✅ |
| Supplier UI | 8106 | ✅ |
| Knowledge DB | 5438 | ✅ |
| Knowledge API | 8110 | ✅ |
| Knowledge UI | 8111 | ✅ |
| Command Center | 80 | ✅ |

## WhatsApp AI Bot Stack

| Container | Port | Purpose |
|-----------|------|---------|
| whatsapp-db | 5439 (host) | PostgreSQL for messages |
| whatsapp-api | 8000 (host network) | FastAPI + Ollama |
| whatsapp-ui | 8116 | Dashboard |

### Key Config
- `network_mode: host` for API container (reaches Ollama at localhost:11434)
- Ollama listening on `0.0.0.0:11434` (configured via systemd env)
- Model: qwen2.5:7b (~4.7GB RAM)

### Webhook URL
```
http://149.118.152.50:8000/webhook
```

### Test Command
```bash
curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"from":"60198021500","text":{"body":"harga iPhone 11?"}}}'
```

## Access URLs (via Tailscale)
- Command Center: `http://100.124.99.52`
- WhatsApp Dashboard: `http://100.124.99.52:8116`

## Files on Server
```
~/Sistem-Wasap-Hafjet/     (829 files - existing bot)
~/HAFJET-AI-WhatsApp-Bot/  (new AI bot)
~/projects/inventory/
~/projects/crm/
~/projects/multichannel/
~/projects/marketing/
~/projects/supplier/
~/projects/knowledge/
~/projects/commandcenter/
```

## RAM Usage (Aug 5, 2026)
- Total: 24GB
- Used: ~3GB (all containers + Ollama)
- Available: ~21GB
- Ollama model: ~4.7GB when loaded
