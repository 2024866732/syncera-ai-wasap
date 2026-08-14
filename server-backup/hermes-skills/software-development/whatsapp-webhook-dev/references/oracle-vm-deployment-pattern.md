# Oracle VM Deployment Pattern (Aug 2026)

## Overview

HAFJET WhatsApp Bot deployment on Oracle Cloud VM with Azure Bot as channel layer.

## Architecture

```
Customer WhatsApp → Meta Cloud API → Azure Bot → Oracle VM API → Ollama/Supabase → Response
```

## Components

| Component | Location | Port | Status |
|-----------|----------|------|--------|
| **Oracle VM** | `149.118.152.50` | - | Always Free A1.Flex |
| **API** | Oracle VM | 8200 | FastAPI + Ollama |
| **PostgreSQL** | Oracle VM | 5440 | Dashboard metrics |
| **Dashboard** | Oracle VM | 8117 | Nginx + HTML |
| **Ollama** | Oracle VM host | 11434 | qwen2.5:7b |
| **Azure Bot** | Azure | 443 | Channel layer |

## SSH Access

```bash
ssh -i /tmp/hafjet-oracle-key ubuntu@100.124.99.52
```

## Docker Commands

```bash
# Rebuild and restart
cd ~/HAFJET-AI-WhatsApp-Bot
sudo docker compose down
sudo docker compose up -d --build

# Check status
sudo docker ps | grep hafjet

# View logs
sudo docker logs hafjet-ai-whatsapp-bot --tail 50

# Apply migration
sudo docker exec -i hafjet-ai-db psql -U hafjet -d hafjet_ai < db/migration_v2_fixed.sql
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | None | Health check |
| `/api/stats` | GET | None | Dashboard metrics |
| `/webhook` | GET | Verify token | Meta webhook verification |
| `/webhook` | POST | Signature | WhatsApp messages |
| `/api/ai/chat` | POST | X-API-Key | Azure Bot forwarding |

## Environment Variables

```bash
# WhatsApp
WHATSAPP_TOKEN=***
WHATSAPP_PHONE_NUMBER_ID=1155010821036918
WHATSAPP_VERIFY_TOKEN=hafjet_verify_2026
WHATSAPP_BUSINESS_ACCOUNT_ID=2902030616815311

# Database
DB_HOST=localhost
DB_PORT=5440
DB_NAME=hafjet_ai
DB_USER=hafjet
DB_PASSWORD=***

# Ollama
OLLAMA_HOST=127.0.0.1
OLLAMA_PORT=11434
OLLAMA_MODEL=qwen2.5:7b

# Security
INTERNAL_API_KEY=***
```

## Firewall Rules

```bash
# Check iptables
sudo iptables -L INPUT -n | grep -E "8200|8117"

# Add rule (if needed)
sudo iptables -I INPUT 3 -p tcp --dport 8200 -j ACCEPT
sudo netfilter-persistent save
```

## Common Issues

### 1. Docker Build Cache Corruption
```bash
# Symptom: "parent snapshot does not exist"
# Fix:
sudo docker builder prune -af
sudo docker compose up -d --build
```

### 2. API Auth Not Working
```bash
# Symptom: Returns 200 instead of 401
# Check: INTERNAL_API_KEY in .env
grep INTERNAL_API_KEY ~/HAFJET-AI-WhatsApp-Bot/.env

# Fix: Add key and rebuild
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)" >> ~/HAFJET-AI-WhatsApp-Bot/.env
sudo docker compose down && sudo docker compose up -d --build
```

### 3. Migration Fails on Existing Tables
```bash
# Symptom: "column already exists" or "table already exists"
# Fix: Use IF NOT EXISTS blocks (see migration_v2_fixed.sql)
```

### 4. Dashboard Not Accessible
```bash
# Check nginx container
sudo docker ps | grep dashboard
sudo docker logs hafjet-dashboard --tail 20

# Restart nginx
sudo docker restart hafjet-dashboard
```

## Deployment Checklist

- [ ] Gap analysis complete
- [ ] All changes presented for approval
- [ ] Migration SQL reviewed
- [ ] Rollback script provided
- [ ] Tests passing
- [ ] Approval received
- [ ] Files uploaded to VM
- [ ] Migration applied
- [ ] Container rebuilt
- [ ] Health check passing
- [ ] Dashboard verified
- [ ] GitHub commit/pushed

## References

- `references/oracle-cloud-iptables-pitfall.md` — iptables rules
- `references/oracle-cloud-docker-build-cache.md` — Docker cache issues
- `references/database-migration-existing-tables.md` — Migration patterns
- `references/api-auth-dev-mode-behavior.md` — API auth behavior
- `references/production-deployment-safety-protocol.md` — Safety protocol
