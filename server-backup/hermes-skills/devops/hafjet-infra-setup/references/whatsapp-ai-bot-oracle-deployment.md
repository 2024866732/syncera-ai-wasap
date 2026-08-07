# HAFJET AI WhatsApp Bot - Oracle Cloud Deployment

## Quick Reference

- **VM**: Oracle Cloud VM.Standard.A1.Flex (4C/24GB ARM)
- **IP**: 149.118.152.50
- **Tailscale**: 100.124.99.52
- **SSH Key**: /tmp/hafjet-oracle-key
- **GitHub Repo**: https://github.com/2024866732/HAFJET-AI-WhatsApp-Bot

## Docker Deployment (network_mode: host)

### Critical: Port Configuration

When using `network_mode: host`, Docker port mappings are **IGNORED**. The container binds directly to the host's network.

```yaml
# docker-compose.yml
services:
  whatsapp-api:
    build: .
    # ports: ["8200:8000"]  # THIS IS IGNORED with network_mode: host!
    env_file:
      - .env
    environment:
      - OLLAMA_URL=http://localhost:11434
      - OLLAMA_MODEL=qwen2.5:7b
    network_mode: host  # Container uses host's network directly
    restart: unless-stopped
```

**Port must be set in BOTH:**
1. `Dockerfile`: `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8200"]`
2. `src/main.py`: `uvicorn.run(app, host="0.0.0.0", port=8200)`

### Ollama Access from Docker

Ollama must listen on all interfaces (not just localhost) for Docker containers to access it:

```bash
# Check Ollama config
sudo cat /etc/systemd/system/ollama.service | grep OLLAMA_HOST

# If only listening on 127.0.0.1, fix:
sudo sed -i '/Environment="PATH=/a Environment="OLLAMA_HOST=0.0.0.0"' /etc/systemd/system/ollama.service
sudo systemctl daemon-reload && sudo systemctl restart ollama

# Verify: should show *:11434
ss -tlnp | grep 11434
```

## .env Configuration

```bash
# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# Supabase
SUPABASE_URL=https://cykenkmpbouwlcknwquv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Database (Supabase PostgreSQL)
DB_HOST=db.cykenkmpbouwlcknwquv.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=***

# WhatsApp Meta Cloud API
WHATSAPP_TOKEN=EAAd...
WHATSAPP_PHONE_NUMBER_ID=1155010821036918
WHATSAPP_VERIFY_TOKEN=hafjet_verify_2026
WHATSAPP_BUSINESS_ACCOUNT_ID=2902030616815311
WHATSAPP_GRAPH_API_VERSION=v21.0

# Owner
OWNER_PHONE_NUMBER=60169808736

# Features
FEATURE_STATUS_LOOKUP=true
FEATURE_PRODUCT_CATALOG=true
FEATURE_AUTO_QUOTE=true
```

## Deployment Commands

```bash
# SSH to Oracle VM
ssh -i /tmp/hafjet-oracle-key ubuntu@149.118.152.50

# Navigate to project
cd ~/HAFJET-AI-WhatsApp-Bot

# Edit .env (if needed)
nano .env

# Deploy with Docker Compose
sudo docker compose up -d

# Check status
sudo docker ps --format "table {{.Names}}\t{{.Status}}"

# Test health
curl http://localhost:8200/api/health

# Test webhook
curl -X POST http://localhost:8200/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"from":"60198021500","text":{"body":"harga iPhone 11?"}}}'
```

## Troubleshooting

### Pydantic v2 Import Error

**Symptom:** `pydantic.errors.PydanticImportError: BaseSettings has been moved to the pydantic-settings package`

**Fix:**
```bash
# Add to requirements.txt
echo "pydantic-settings==2.7.0" >> requirements.txt
```

```python
# settings.py
from pydantic_settings import BaseSettings  # NOT from pydantic
```

### Python Import Path Error

**Symptom:** `ModuleNotFoundError: No module named 'src'`

**Root cause:** When `Dockerfile` does `COPY src/ .` (copies contents), imports lose the `src.` prefix.

**Fix:** Use relative imports in `src/main.py`:
```python
# BROKEN
from src.settings import settings
from src.ai.ollama_client import ollama_client

# CORRECT
from settings import settings
from ai.ollama_client import ollama_client
```

### Port Already in Use

```bash
# Check what's using the port
ss -tlnp | grep 8200

# If old container, stop it
sudo docker stop <container_name>
sudo docker rm <container_name>
```

### Ollama Connection Refused

```bash
# Check Ollama status
systemctl status ollama

# Check if listening on all interfaces
ss -tlnp | grep 11434
# Should show: *:11434 (not 127.0.0.1:11434)

# If not, use systemd override (NOT sed on service file)
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo '[Service]' | sudo tee /etc/systemd/system/ollama.service.d/override.conf
echo 'Environment=OLLAMA_HOST=0.0.0.0' | sudo tee -a /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

### Container Restarting

```bash
# Check logs
sudo docker logs <container_name> --tail 50

# Common issues:
# - Port conflict (see above)
# - Ollama not reachable
# - Missing .env variables
# - Pydantic v2 import error (see above)
# - Python import path error (see above)
```

## WhatsApp Channels Strategy

| Channel | Number | Stack | Use Case |
|---------|--------|-------|----------|
| **Production** | 016-9808736 | FastAPI + Cloud API + Supabase + Ollama | Customer-facing |
| **Legacy/Lab** | [Different] | Sistem-Wasap-Hafjet (whatsapp-web.js) | R&D only |

**⚠️ NEVER mix production number with unofficial client.**

## Ollama Systemd Configuration (Aug 2026)

### Correct Way to Set OLLAMA_HOST

**⚠️ Do NOT use `sed` on Ollama service file** — it can break systemd parsing:

```bash
# BROKEN — may break service file structure
sudo sed -i '/Environment="PATH=/a Environment="OLLAMA_HOST=0.0.0.0"' /etc/systemd/system/ollama.service

# CORRECT — use systemd override directory
sudo mkdir -p /etc/systemd/system/ollama.service.d
cat <<EOF | sudo tee /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment=OLLAMA_HOST=0.0.0.0
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

### Verify Ollama Listening

```bash
# Should show *:11434 (all interfaces)
ss -tlnp | grep 11434

# If shows 127.0.0.1:11434, Ollama is NOT accessible from Docker containers
```

## Hybrid Azure + Oracle Architecture (Aug 2026)

### Architecture Overview

```
Customer WhatsApp → Azure Bot Service (Channel Layer) → Oracle VM (AI Engine) → Response
```

**Azure Bot Service (Channel Layer):**
- WhatsApp Cloud API integration
- Auth & validation
- Retry & queue management
- SLA & enterprise security

**Oracle VM (AI Engine):**
- Ollama qwen2.5:7b (LLM inference)
- Supabase (data storage)
- FastAPI (webhook handler)
- Dashboard & monitoring

### API Contract (Azure ↔ Oracle)

**Endpoint:** `POST /api/ai/chat`

**Request (Azure → Oracle):**
```json
{
  "phone": "60198021500",
  "message_text": "harga iPhone 11?",
  "context_id": "optional-conversation-id",
  "timestamp": "2026-08-05T10:00:00Z"
}
```

**Response (Oracle → Azure):**
```json
{
  "reply_text": "iPhone 11 (128GB) - RM1,299. Ada stok 2 unit.",
  "suggested_actions": [],
  "confidence": 0.95,
  "model": "qwen2.5:7b",
  "latency_ms": 5200
}
```

### FastAPI Router for Azure Forwarding

```python
# src/api/ai_chat.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import time
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.ollama_client import ollama_client
from settings import settings

router = APIRouter()


class AIChatRequest(BaseModel):
    phone: str
    message_text: str
    context_id: Optional[str] = None
    timestamp: Optional[str] = None


class AIChatResponse(BaseModel):
    reply_text: str
    suggested_actions: list[str] = []
    confidence: Optional[float] = None
    model: str = settings.ollama_model
    latency_ms: Optional[int] = None


@router.post("/api/ai/chat", response_model=AIChatResponse)
async def ai_chat(req: AIChatRequest):
    import time
    start = time.time()
    
    SYSTEM_PROMPT = """You are HAFJET AI Assistant for HAFIZI GADJET ENTERPRISE in Raub, Pahang, Malaysia.
    
CORE RULES:
1. Always reply in the same language as the customer (Malay or English)
2. Use EXACT prices from the database - NEVER make up prices
3. If unsure about price or model, ask for more details
4. Keep responses SHORT (2-4 sentences max)
5. Always offer to help further or make an appointment

REPAIR PRICES (reference only):
- Screen replacement: RM80-250 (varies by model)
- Battery replacement: RM50-120
- Charging port: RM40-80
- Software issues: RM30-60
- Water damage: RM80-200

Call to action: "Nak booking? WhatsApp kami di 019-802 1500" """
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": req.message_text}
    ]
    
    try:
        reply = await ollama_client.chat(messages)
        latency = int((time.time() - start) * 1000)
        
        return AIChatResponse(
            reply_text=reply,
            suggested_actions=[],
            confidence=0.95,
            latency_ms=latency,
        )
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return AIChatResponse(
            reply_text="Maaf, AI sedang sibuk. Sila hubungi kami terus di 019-802 1500.",
            suggested_actions=[],
            confidence=0.0,
            latency_ms=latency,
        )
```

### Include Router in main.py

```python
from api.ai_chat import router as ai_chat_router

app.include_router(ai_chat_router)
```

### Azure Bot URLs

| Service | URL |
|---------|-----|
| Azure Bot | https://hafjet-whatsapp-bot.azurewebsites.net |
| Azure Dashboard | https://hafjet-whatsapp-bot.azurewebsites.net/dashboard |
| Oracle API | http://149.118.152.50:8200 |
| Oracle Dashboard | http://100.124.99.52:8117 (Tailscale) |

## Production Dashboard (Real Data)

### Database Tables

```sql
-- Webhook Events
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) DEFAULT 'message',
    from_number VARCHAR(50),
    content TEXT,
    status VARCHAR(20) DEFAULT 'received',
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    from_number VARCHAR(50) NOT NULL,
    content TEXT,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    response_time_ms INTEGER,
    ai_model VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- AI Requests
CREATE TABLE IF NOT EXISTS ai_requests (
    id SERIAL PRIMARY KEY,
    request_text TEXT,
    response_text TEXT,
    model VARCHAR(50),
    latency_ms INTEGER,
    status VARCHAR(20) DEFAULT 'success',
    created_at TIMESTAMP DEFAULT NOW()
);

-- AI Errors
CREATE TABLE IF NOT EXISTS ai_errors (
    id SERIAL PRIMARY KEY,
    error_type VARCHAR(50),
    error_message TEXT,
    request_text TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### API Stats Endpoint

```python
@app.get("/api/stats")
async def stats():
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT COUNT(*) FROM messages")
    total = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'")
    today = cur.fetchone()[0]
    
    cur.execute("SELECT AVG(response_time_ms) FROM messages WHERE direction='outbound' AND response_time_ms IS NOT NULL")
    avg_latency = cur.fetchone()[0] or 0
    
    cur.execute("SELECT COUNT(*) FROM ai_errors")
    error_count = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM webhook_events")
    total_webhooks = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM webhook_events WHERE status='success'")
    successful_webhooks = cur.fetchone()[0]
    
    cur.close()
    conn.close()
    
    return {
        "total_messages": total,
        "today_messages": today,
        "avg_latency_ms": round(avg_latency),
        "error_count": error_count,
        "success_rate": round((successful_webhooks / total_webhooks * 100) if total_webhooks > 0 else 100),
        ...
    }
```

### Dashboard UI

- `dashboard.html` - Production dashboard with real data
- Served via nginx container on port 8117
- Auto-refresh every 30 seconds
- Shows: Total Messages, Today Messages, Avg Latency, Error Count, Success Rate

## Related Files

- `references/oracle-cloud-deployment.md` - General Oracle Cloud setup
- `references/oracle-multi-project-deployment.md` - Multi-project deployment
