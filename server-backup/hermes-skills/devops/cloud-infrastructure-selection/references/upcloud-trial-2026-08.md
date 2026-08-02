# UpCloud Trial Deployment — 2026-08-02

## Server Specs
- **UUID:** `0081fb16-a4fb-4867-9e9c-c71f0226bc3b`
- **IP:** `213.163.192.164` (public)
- **SSH:** `ssh -i /tmp/hafjet-trial-key ubuntu@213.163.192.164`
- **CPU:** AMD EPYC 9575F (2 cores)
- **RAM:** 3.8GB (0 swap!)
- **Disk:** 80GB MaxIOPS (69GB free)
- **OS:** Ubuntu 26.04 LTS
- **Zone:** Singapore (sg-sin1)

## Stress Test Results

| Test | Result | vs Azure VM |
|------|--------|-------------|
| CPU Single Core | ✅ PASS | EPYC >> i3-2100 |
| CPU All + IO + VM | ✅ 6/6 PASS | — |
| Disk Random 4K Mixed | **512 MB/s** | 22x faster |
| Disk Random 4K IOPS | **4.8 GB/s** | 208x faster |
| Latency to OpenRouter | **0.987ms** | 10x lower |
| K8s 10 pods | ✅ deployed | — |

## Services Deployed
- Docker v29.7.1
- k3s v1.36.2+k3s1
- PostgreSQL 16 (local)
- Valkey/Redis 8
- n8n
- Prometheus + Grafana + Node Exporter + cAdvisor
- Ollama (LLM inference)

## Ollama/LLM Deployment — OOM Lesson

**Problem:** Server has 3.8GB RAM. With k3s + monitoring + app stack running (~1.5GB used), only ~2.3GB available. Ollama + llama3.2:3b model needs ~2.4GB → OOM kill.

**Solution:** Stop non-essential services before LLM inference:
```bash
docker stop hafjet-stack-n8n-1          # frees ~200MB
cd /opt/monitoring && docker compose stop grafana cadvisor  # frees ~300MB
```

**Result:** 2.5GB available → model loads successfully, 8.5s total (7.6s load + 0.4s gen).

**Models tested:**
- `llama3.2:3b` (2.0 GB) — works when services stopped
- `phi3:mini` (2.2 GB) — works when services stopped

**Ollama config for constrained RAM:**
```ini
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_CONTEXT_LENGTH=2048
```

## SSH Recovery Pattern

When SSH times out (banner exchange timeout, connection refused):

1. **Check server state via API:**
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://api.upcloud.com/1.3/server/$UUID" | jq '.server.state'
   ```

2. **If server is "started" but SSH hung:**
   - Hard stop via API, wait for "stopped", then start
   - Or restart via UpCloud Control Panel

3. **Prevention:**
   - Limit concurrent SSH sessions
   - Use `ServerAliveInterval=60` in SSH config
   - Avoid long-running commands in SSH (use `screen`/`tmux`)

## UpCloud API Auth

- **Bearer token:** `ucat_01KYZ...` (NOT username/password)
- **Endpoint:** `https://api.upcloud.com/1.3/`
- **SDK:** `pip install upcloud-api` → `CloudManager(token=TOKEN)`
- **Templates:** Dict format `{'Ubuntu 26.04 LTS': 'uuid-here'}`

## Backup Procedure (Pre-Deployment)

```bash
# 1. Local backup
mkdir -p ~/backups/pre-upcloud-trial
tar czf ~/backups/pre-upcloud-trial/hermes-config.tar.gz -C ~/.hermes config.yaml memories/ skills/ cron/ plugins/
tar czf ~/backups/pre-upcloud-trial/whatsapp-bot-code.tar.gz -C ~/.hermes/whatsapp-bot --exclude=node_modules .
cp ~/.hermes/whatsapp-bot/bot_data.db ~/backups/pre-upcloud-trial/

# 2. Push to GitHub private repo
gh repo create hafjet-backups --private
cd ~/backups/pre-upcloud-trial && git init && git add . && git commit -m "pre-upcloud backup" && git push -u origin main

# 3. Restore (after trial)
git clone https://github.com/2024866732/hafjet-backups.git
cd hafjet-backups && bash RESTORE.sh
```
