# Oracle Cloud Deployment — HAFJET (Aug 2026)

## Account Setup
- Tenancy: `ocid1.tenancy.oc1..aaaaaaaaigehfv7zkt2uuv5p74tx6yordkpk5sfdz2wkoiknfi7affzkivza`
- User: `ocid1.user.oc1..aaaaaaaawo4wafw6rr3mhrtbnatdfoaxqq6uukgpvyzkmnjf2cahnogloqhq`
- Region: `ap-kulai-2` (Malaysia)
- Home AD: `rOJM:AP-KULAI-2-AD-1`
- SSH Key: `/tmp/hafjet-oracle-key` (ED25519)
- Account type: Pay As You Go (upgraded from Free Trial)

## VCN & Subnet
- VCN: `VCN-HAFJET` (`ocid1.vcn.oc1.ap-kulai-2.amaaaaaak6kbqnyasalriiyuaffkgpjuvkutypoo5bxazyjil5ss5zniwbta`)
- Public Subnet: `public subnet-VCN-HAFJET` (`ocid1.subnet.oc1.ap-kulai-2.aaaaaaaazzf3xfazpd3ym5ad6uoyal37sdimp5kg2au5ovvpyrwqevz3lfsa`)
- Private Subnet: `private subnet-VCN-HAFJET` (exists but not used)

## Image
- Ubuntu 24.04 aarch64: `ocid1.image.oc1.ap-kulai-2.aaaaaaaacgwlsa5omqjaprcno46znm2wwydankme2xavar5s4t4d7xftrlka`

## SUCCESSFUL DEPLOYMENT (Aug 4, 2026)
- **Instance**: `hafjet-oracle` (VM.Standard.A1.Flex, 4 OCPUs, 24GB RAM)
- **Public IP**: `149.118.152.50`
- **Tailscale IP**: `100.124.99.52`
- **SSH**: `ssh -o ConnectTimeout=20 -i /tmp/hafjet-oracle-key ubuntu@149.118.152.50`
- **19 containers running**: 6 PostgreSQL + 6 FastAPI + 6 UIs + Command Center
- **All services healthy**, Command Center at `http://100.124.99.52`

## ARM Capacity Timeline
1. Free Trial → "LimitExceeded" (account limits)
2. Upgraded to Pay As You Go → still "Out of host capacity" (physical hosts full)
3. Waited ~1 hour after upgrade → capacity freed up → VM launched successfully
4. **Lesson**: Pay-As-You-Go removes account limits but capacity is physical. Patience works.

## Docker Permission Fix (Fresh Ubuntu)
After `apt install docker.io`, user NOT in docker group:
- `usermod -aG docker` requires re-login
- **Quick fix**: use `sudo docker compose` instead of `docker compose`
- Works immediately without re-login

## Multi-Project Deployment Pattern
Deploy in stages on 24GB RAM:
```bash
# 1. DBs first
for proj in inventory crm multichannel marketing supplier knowledge; do
  sudo docker compose -f ~/projects/$proj/docker-compose.yml up -d ${proj}-db
done
# 2. Wait 30s for healthy
sleep 30
# 3. APIs second
for proj in inventory crm multichannel marketing supplier knowledge; do
  sudo docker compose -f ~/projects/$proj/docker-compose.yml up -d ${proj}-api
done
# 4. UIs last
for proj in inventory crm multichannel marketing supplier knowledge; do
  sudo docker compose -f ~/projects/$proj/docker-compose.yml up -d ${proj}-ui
done
# 5. Command Center
sudo docker compose -f ~/projects/commandcenter/docker-compose.yml up -d
```

## OCI CLI Config
```ini
[DEFAULT]
user=ocid1.user.oc1..aaaaaaaawo4wafw6rr3mhrtbnatdfoaxqq6uukgpvyzkmnjf2cahnogloqhq
fingerprint=b0:1c:f7:a4:24:81:64:61:81:53:01:57:4f:ce:10:09
key_file=/home/hafizi145/.oci/oci_api_key.pem
tenancy=ocid1.tenancy.oc1..aaaaaaaaigehfv7zkt2uuv5p74tx6yordkpk5sfdz2wkoiknfi7affzkivza
region=ap-kulai-2
```

## Deployment Files
- Schemas: `/tmp/aws-deploy/schemas/` (6 SQL files)
- APIs: `/tmp/aws-deploy/apis/` (6 FastAPI files)
- UIs: `/tmp/aws-deploy/uis/` (7 HTML dashboards)
- Docker: `/tmp/aws-deploy/docker/` (6 Compose files)
- Command Center: `/tmp/aws-deploy/cc_server.py`
- SSH Key: `/tmp/hafjet-oracle-key`

## VM Specs
- Shape: `VM.Standard.A1.Flex`
- OCPUs: 4
- RAM: 24GB
- Storage: 45GB boot volume
- OS: Ubuntu 24.04 LTS aarch64

---

## Ollama Installation (ARM)

### Install
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### CRITICAL: Listen on All Interfaces
By default, Ollama only listens on `127.0.0.1:11434`. Docker containers CANNOT access it.

**Fix**: Add `OLLAMA_HOST=0.0.0.0` to systemd service:
```bash
sudo sed -i '/Environment="PATH=/a Environment="OLLAMA_HOST=0.0.0.0"' /etc/systemd/system/ollama.service
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Verify: `ss -tlnp | grep 11434` → should show `*:11434` (not `127.0.0.1:11434`)

### Pull Model
```bash
ollama pull qwen2.5:7b  # 4.7GB, good for Malay/English
```

### Test
```bash
curl http://localhost:11434/api/tags  # List models
ollama run qwen2.5:7b "Say hello"    # Interactive test
```

---

## Docker Container → Ollama Access

### Option A: Host Network (Recommended)
Container uses host network stack → accesses Ollama via `localhost:11434`.

```yaml
services:
  whatsapp-api:
    network_mode: host  # Container shares host network
    # No ports mapping needed - binds directly to host
```

### Option B: Docker Gateway
Container uses bridge network → accesses Ollama via `172.17.0.1:11434`.

```yaml
services:
  whatsapp-api:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    # OLLAMA_URL=http://host.docker.internal:11434
```

### Pitfall
- `host.docker.internal` does NOT work on Linux by default
- Must add `extra_hosts` or use host network mode
- Host network mode = container shares host's ports (no port conflicts allowed)

---

## WhatsApp Bot Deployment

### Architecture
```
WhatsApp Cloud API → Webhook → FastAPI (port 8000) → Ollama (qwen2.5:7b) → Reply
                                  ↓
                             PostgreSQL (port 5439)
```

### Docker Compose Pattern
```yaml
services:
  whatsapp-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=whatsapp
      - POSTGRES_USER=hafjet
      - POSTGRES_PASSWORD=TrialPass123!
    ports:
      - "127.0.0.1:5439:5432"  # Internal only
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hafjet -d whatsapp"]
      interval: 5s
      timeout: 3s
      retries: 5

  whatsapp-api:
    image: python:3.12-slim
    command: bash -c "pip install -q fastapi uvicorn psycopg2-binary httpx && python whatsapp_api.py"
    network_mode: host  # For Ollama access
    depends_on:
      whatsapp-db:
        condition: service_healthy
```

### DB Schema
```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    from_number VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    direction VARCHAR(10) NOT NULL,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_messages_from ON messages(from_number);
CREATE INDEX idx_messages_created ON messages(created_at);
```

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | WhatsApp webhook receiver |
| `/api/stats` | GET | Dashboard KPIs + last 10 messages |
| `/api/health` | GET | Health check (Ollama status) |
| `/` | GET | Service info |

### Response Time Tracking
Add `response_time_ms` to messages table for latency monitoring:
```python
start_time = time.time()
# ... AI processing ...
response_time_ms = int((time.time() - start_time) * 1000)
```

---

## Production Dashboard Features

### KPIs
- Total Messages
- Today's Messages
- Average Latency (ms)
- Error Count
- Success Rate (%)

### System Status
- Webhook Health (online/offline indicator)
- AI Model Status (qwen2.5:7b)
- Last Health Check

### Design
- Green theme (#22c55e → #059669)
- Status dots: green=online, red=offline, yellow=unknown
- Auto-refresh every 30 seconds
- Beautiful empty states

---

## Budget & Billing

### Always Free Limits
- VM.Standard.A1.Flex: 4 OCPUs, 24GB RAM
- Block Storage: 200GB
- Outbound Data: 10TB/month

### Stay Free Rules
1. Only 1 VM instance
2. Don't exceed 200GB storage
3. No load balancer
4. Monitor billing at `https://cloud.oracle.com/billing`

### Budget Alert (Optional)
```bash
oci budgets budget budget create \
  --compartment-id $TENANCY \
  --display-name "HAFJET-FreeTier-Budget" \
  --amount 10 \
  --target-type "COMPARTMENT" \
  --targets "[\"$TENANCY\"]" \
  --reset-period "MONTHLY"
```
