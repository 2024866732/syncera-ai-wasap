# HAFJET Multi-Project Oracle ARM Deployment (Aug 2026)

## Server Details
- Shape: VM.Standard.A1.Flex (4 OCPU ARM, 24GB RAM)
- IP: 149.118.152.50
- Tailscale: 100.124.99.52
- SSH: /tmp/hafjet-oracle-key
- OS: Ubuntu 24.04 LTS aarch64

## Projects Deployed (19 containers)
| Project | DB Port | API Port | UI Port |
|---------|---------|----------|---------|
| Inventory | 5433 | 8080 | 8082 |
| CRM | 5434 | 8090 | 8092 |
| MultiChannel | 5435 | 8097 | 8098 |
| Marketing | 5436 | 8100 | 8101 |
| Supplier | 5437 | 8105 | 8106 |
| Knowledge | 5438 | 8110 | 8111 |
| Command Center | — | — | 80 |

## Deployment Sequence
```bash
# 1. Install tools
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 curl wget jq htop
sudo systemctl enable docker && sudo systemctl start docker

# 2. Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# 3. Upload files (from local machine)
scp -i /tmp/hafjet-oracle-key /tmp/aws-deploy/schemas/*.sql ubuntu@149.118.152.50:/tmp/
scp -i /tmp/hafjet-oracle-key /tmp/aws-deploy/apis/*.py ubuntu@149.118.152.50:/tmp/
scp -i /tmp/hafjet-oracle-key /tmp/aws-deploy/uis/*_ui.html ubuntu@149.118.152.50:/tmp/
scp -i /tmp/hafjet-oracle-key /tmp/aws-deploy/docker/*_docker-compose.yml ubuntu@149.118.152.50:/tmp/
scp -i /tmp/hafjet-oracle-key /tmp/aws-deploy/cc_server.py ubuntu@149.118.152.50:/tmp/

# 4. Copy to project dirs
mkdir -p ~/projects/{inventory,crm,multichannel,marketing,supplier,knowledge,commandcenter}
for proj in inventory crm multichannel marketing supplier knowledge; do
  cp /tmp/${proj}_schema.sql ~/projects/$proj/schema.sql
  cp /tmp/${proj}_api.py ~/projects/$proj/
  cp /tmp/${proj}_docker-compose.yml ~/projects/$proj/docker-compose.yml
  cp /tmp/${proj}_ui.html ~/projects/$proj/
done
cp /tmp/cc_server.py ~/projects/commandcenter/
cp /tmp/commandcenter_ui.html ~/projects/commandcenter/
cp /tmp/commandcenter_docker-compose.yml ~/projects/commandcenter/docker-compose.yml

# 5. Deploy DBs first (wait 30s for healthy)
for proj in inventory crm multichannel marketing supplier knowledge; do
  cd ~/projects/$proj && sudo docker compose up -d ${proj}-db
done
sleep 30

# 6. Deploy APIs
for proj in inventory crm multichannel marketing supplier knowledge; do
  cd ~/projects/$proj && sudo docker compose up -d ${proj}-api
done

# 7. Deploy UIs
for proj in inventory crm multichannel marketing supplier knowledge; do
  cd ~/projects/$proj && sudo docker compose up -d ${proj}-ui
done

# 8. Deploy Command Center
cd ~/projects/commandcenter && sudo docker compose up -d
```

## Docker Permission Fix
Fresh Oracle Ubuntu needs sudo for Docker:
```bash
# Option 1: Use sudo (quick)
sudo docker compose up -d

# Option 2: Add user to docker group
sudo usermod -aG docker ubuntu
newgrp docker
```

## Budget Protection
```bash
# Create $10/month budget
oci budgets budget budget create \
  --compartment-id $TENANCY \
  --display-name "HAFJET-FreeTier" \
  --amount 10 \
  --target-type "COMPARTMENT" \
  --targets "[\"$TENANCY\"]" \
  --reset-period "MONTHLY"

# Create 80% alert
oci budgets budget alert-rule create \
  --budget-id $BUDGET_ID \
  --display-name "80-Alert" \
  --threshold 80 \
  --threshold-type "PERCENTAGE" \
  --type "ACTUAL"
```

## Memory Usage
- Total containers: 19
- RAM used: ~1.4GB (of 24GB)
- Each UI: ~15MB
- Each API: ~41MB
- Each DB: ~50-100MB
- Command Center: ~17MB

## Access URLs
| Service | Tailscale URL | Public URL |
|---------|---------------|------------|
| Command Center | http://100.124.99.52 | http://149.118.152.50 |
| Inventory | http://100.124.99.52:8082 | http://149.118.152.50:8082 |
| CRM | http://100.124.99.52:8092 | http://149.118.152.50:8092 |
| MultiChannel | http://100.124.99.52:8098 | http://149.118.152.50:8098 |
| Marketing | http://100.124.99.52:8101 | http://149.118.152.50:8101 |
| Supplier | http://100.124.99.52:8106 | http://149.118.152.50:8106 |
| Knowledge | http://100.124.99.52:8111 | http://149.118.152.50:8111 |
| WhatsApp Bot UI | http://100.124.99.52:8116 | http://149.118.152.50:8116 |
| Ollama API | http://100.124.99.52:11434 | http://149.118.152.50:11434 |

## Ollama + WhatsApp Bot (Aug 2026)
Additional deployment: WhatsApp Bot with Ollama AI backend (qwen2.5:7b).

### Ollama Setup
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull model (ARM-optimized)
ollama pull qwen2.5:7b  # ~4.7GB download

# Bind to all interfaces (REQUIRED for Docker container access)
echo 'OLLAMA_HOST=0.0.0.0' | sudo tee -a /etc/environment
sudo systemctl restart ollama

# Verify: should show *:11434 (not 127.0.0.1:11434)
ss -tlnp | grep 11434
```

### WhatsApp Bot Deployment
- DB Port: 5439 (internal PostgreSQL)
- API Port: 8000 (host network mode — accesses Ollama on localhost:11434)
- UI Port: 8116
- Docker: `network_mode: host` for API container (Ollama access)
- Model: qwen2.5:7b (5GB RAM, good Malay/English)

### Webhook URL
```
POST http://149.118.152.50:8000/webhook
Body: {"message": {"from": "60198021500", "text": {"body": "Berapa harga?"}}}
```

### Memory Usage (updated)
- Total containers: 22 (19 base + 3 WhatsApp Bot)
- RAM used: ~6.5GB (of 24GB) — Ollama ~5GB + containers ~1.5GB
- Ollama model: qwen2.5:7b (4.7GB on disk, ~5GB RAM when loaded)

## Command Center Proxy Pattern
- Uses `172.17.0.1` (Docker gateway) NOT `127.0.0.1`
- Health check accepts HTTPError code < 500 as "UP"
- Threaded server (ThreadingMixIn) prevents blocking
- Cache health results 10 seconds
