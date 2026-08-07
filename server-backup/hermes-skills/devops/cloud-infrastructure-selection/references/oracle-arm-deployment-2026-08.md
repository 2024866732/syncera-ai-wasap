# Oracle ARM Deployment — HAFJET Multi-Project (Aug 2026)

## Server Specs
- Shape: VM.Standard.A1.Flex (4 OCPU ARM, 24GB RAM)
- OS: Ubuntu 24.04 LTS aarch64
- IP: 149.118.152.50
- Tailscale: 100.124.99.52
- SSH Key: /tmp/hafjet-oracle-key
- AD: rOJM:AP-KULAI-2-AD-1
- Subnet: ocid1.subnet.oc1.ap-kulai-2.aaaaaaaazzf3xfazpd3ym5ad6uoyal37sdimp5kg2au5ovvpyrwqevz3lfsa

## Deployment Files Location
All files in `/tmp/aws-deploy/`:
- schemas/ — 6 SQL files (inventory, crm, multichannel, marketing, supplier, knowledge)
- apis/ — 6 FastAPI Python files
- uis/ — 7 HTML dashboard files (6 project + 1 command center)
- docker/ — 6 Docker Compose files
- cc_server.py — Command center proxy server

## Port Assignments
| Service | DB Port | API Port | UI Port |
|---------|---------|----------|---------|
| Inventory | 5433 | 8080 | 8082 |
| CRM | 5434 | 8090 | 8092 |
| MultiChannel | 5435 | 8097 | 8098 |
| Marketing | 5436 | 8100 | 8101 |
| Supplier | 5437 | 8105 | 8106 |
| Knowledge | 5438 | 8110 | 8111 |
| Command Center | — | — | 80 |

## Deployment Sequence
1. Install Docker + Tailscale
2. Upload all files via SCP
3. Create project directories
4. Deploy DBs first (wait for healthy)
5. Deploy APIs
6. Deploy UIs
7. Deploy Command Center
8. Test health endpoint

## Key Commands
```bash
# SCP files
scp -o ConnectTimeout=15 -i /tmp/hafjet-oracle-key /tmp/aws-deploy/schemas/*.sql ubuntu@149.118.152.50:/tmp/

# Deploy DB
sudo docker compose -f ~/projects/inventory/docker-compose.yml up -d inventory-db

# Deploy API
sudo docker compose -f ~/projects/inventory/docker-compose.yml up -d inventory-api

# Check health
curl -s http://localhost:80/api/health | python3 -c "import sys,json;d=json.load(sys.stdin);print(f\"UP: {d['up']}/{d['total']}\")"
```

## Memory Usage
- 19 containers total
- ~1.4GB RAM used (of 24GB)
- Each UI: ~15MB
- Each API: ~41MB
- Each DB: ~50-100MB
- Command Center: ~17MB

## Budget Setup
```bash
# $10/month budget with 80% alert
oci budgets budget budget create --compartment-id $TENANCY --display-name "HAFJET-FreeTier" --amount 10 --target-type "COMPARTMENT" --targets "[\"$TENANCY\"]" --reset-period "MONTHLY"
oci budgets budget alert-rule create --budget-id $BUDGET_ID --display-name "80-Alert" --threshold 80 --threshold-type "PERCENTAGE" --type "ACTUAL"
```

## Pay As You Go Upgrade Pattern (Aug 2026)

**Problem:** ARM capacity consistently `Out of host capacity` on Free Tier account.

**Solution:** Upgrade to Pay As You Go → wait 1-2 hours → retry. Capacity eventually freed up.

**Steps:**
1. Go to Oracle Cloud Console → Billing → Upgrade to Pay As You Go
2. Wait for confirmation email (5-10 minutes)
3. Wait additional 1-2 hours for capacity to free up
4. Retry VM creation

**Key insight:** Pay As You Go does NOT change ARM capacity — it's physical host availability. But upgrading + waiting pattern works because capacity fluctuates throughout the day.

**Budget protection:** Always set budget alerts after upgrading to prevent surprise charges.

## Ollama Setup (qwen2.5:7b)

**Model:** qwen2.5:7b (4.7GB, Q4_K_M quantization, 32K context)
- Good for Malay/English
- CPU-only on ARM (no GPU)
- Response time: ~25s for short queries

**Installation:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
```

**Docker access fix:** Ollama binds to 127.0.0.1 by default. For Docker containers to access it:
```bash
# Option 1: Bind to all interfaces
echo 'OLLAMA_HOST=0.0.0.0' | sudo tee -a /etc/environment
sudo systemctl restart ollama

# Option 2: Use host network mode in docker-compose
services:
  api:
    network_mode: host  # Direct access to localhost:11434
```

## Production Dashboard Pattern

For operational dashboards with live KPIs:
- Auto-refresh every 30 seconds
- Status indicators (green/red/yellow dots)
- Empty states for no-data scenarios
- Response time tracking in database
- Health check endpoints

```python
# API pattern for live stats
@app.get("/api/stats")
async def stats():
    # Total messages, today's messages, recent 10
    # Average response time, error count
    # Ollama health status
    # Metrics from in-memory dict
```

## SSH Key Management

```bash
# Generate key
ssh-keygen -t ed25519 -f /tmp/hafjet-oracle-key -N "" -C "hafjet-oracle"

# Use key
ssh -o ConnectTimeout=20 -i /tmp/hafjet-oracle-key ubuntu@149.118.152.50

# SCP files
scp -o ConnectTimeout=15 -i /tmp/hafjet-oracle-key FILE ubuntu@149.118.152.50:/tmp/
```
