# UpCloud Trial Deployment Reference

## Server Info (Frankfurt)
- UUID: `005cae76-359f-4a95-b113-5750349e94fd`
- Public IP: `94.237.88.114`
- Tailscale IP: `100.98.171.12`
- SSH: `ssh -i /tmp/hafjet-trial-key ubuntu@94.237.88.114`
- Plan: 2xCPU-4GB, 80GB disk
- OS: Ubuntu 26.04 LTS
- CPU: AMD EPYC 9575F

## Running Services (8 Projects + Monitoring)

| # | Project | UI Port | API Port | DB Port | Stack Dir |
|---|---------|---------|----------|---------|-----------|
| 1 | Ollama LLM | - | 11434 | - | system |
| 2 | Inventory | 8082 | 8080 | 5433 | ~/inventory/ |
| 3 | CRM + Jobs | 8092 | 8090 | 5434 | ~/crm/ |
| 4 | Analytics | 8095 | - | - | ~/analytics/ |
| 5 | Multi-Channel | 8098 | 8097 | 5435 | ~/multichannel/ |
| 6 | Marketing | - | 8100 | 5436 | ~/marketing/ |
| 7 | Price Monitor | 8106 | 8105 | 5437 | ~/supplier/ |
| 8 | Knowledge Base | 8111 | 8110 | 5438 | ~/knowledge/ |
| - | Prometheus | 9090 | - | - | /opt/monitoring/ |
| - | Node Exporter | 9100 | - | - | /opt/monitoring/ |

## Tailscale Access (from iPhone)
```
http://100.98.171.12:8082  (Inventory)
http://100.98.171.12:8092  (CRM)
http://100.98.171.12:8095  (Analytics)
http://100.98.171.12:8098  (Multi-Channel)
http://100.98.171.12:8106  (Price Monitor)
http://100.98.171.12:8111  (Knowledge Base)
```

## Stress Test Results
| Metric | Frankfurt | Singapore | Azure VM |
|--------|-----------|-----------|----------|
| Disk Random 4K | 1.35 GB/s | 512 MB/s | 23 MB/s |
| Disk Sequential | 19.7 GB/s | N/A | N/A |
| Latency OpenRouter | 0.9ms | 0.99ms | 10ms |
| LLM Speed | 30 tok/s | N/A | N/A |

## SSH Key
- Location: `/tmp/hafjet-trial-key`
- Public: `/tmp/hafjet-trial-key.pub`

## API Token
- Stored in env: `UPCLOUD_TOKEN=ucat_01KYZ08ECQK5CHXGYTZ21MABB2`
- Do NOT commit to git

## Deployment Notes
- Docker Compose v2 installed: `sudo apt-get install -y docker-compose-v2`
- Tailscale installed and authenticated as `hafjet-upcloud`
- Ollama configured: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`
- Non-essential services (n8n, grafana, cadvisor) stopped to free RAM for LLM
- Schema init: PostgreSQL init scripts sometimes don't auto-run; apply manually with `docker exec <db> psql -U hafjet -d <db> -f /docker-entrypoint-initdb.d/01-schema.sql`
