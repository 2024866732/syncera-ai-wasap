# HAFJET 8-Project Deployment Reference

## Architecture (UpCloud Frankfurt → AWS → Oracle ARM)

8 business projects deployed as separate Docker Compose stacks on a single VPS, unified by a Command Center dashboard.

**Deployment history:**
- UpCloud Frankfurt (4GB RAM) — Account suspended mid-trial
- AWS t3.micro (911MB RAM) — Too small, OOM with 6 PG databases
- **Oracle ARM A1.Flex (24GB RAM)** — SUCCESS (Aug 4, 2026) ✅

## Projects & Port Allocation

| # | Project | API Port | UI Port | DB Port | Stack Dir |
|---|---------|----------|---------|---------|-----------|
| 1 | Local LLM (Ollama) | 11434 | — | — | `/opt/ollama` |
| 2 | Inventory Management | 8080 | 8082 | 5433 | `~/inventory/` |
| 3 | Job Tracking + CRM | 8090 | 8092 | 5434 | `~/crm/` |
| 4 | Analytics Dashboard | 8095 | — | — | `~/analytics/` |
| 5 | Multi-Channel Support | 8097 | 8098 | 5435 | `~/multichannel/` |
| 6 | Marketing Automation | 8100 | 8101 | 5436 | `~/marketing/` |
| 7 | Supplier Price Monitor | 8105 | 8106 | 5437 | `~/supplier/` |
| 8 | Knowledge Base + Training | 8110 | 8111 | 5438 | `~/knowledge/` |
| — | Command Center | 80 (proxy) | 80 (UI) | — | `~/commandcenter/` |

## RAM Budget (4GB Server)

| Component | RAM |
|-----------|-----|
| System + Docker | ~500MB |
| 6× PostgreSQL | ~600MB |
| 6× FastAPI/Python API | ~300MB |
| 6× Static UI | ~60MB |
| Command Center | ~50MB |
| Ollama 3.2B | ~2.4GB |
| **Total** | **~3.9GB** |

**Rule:** Stop non-essential stacks before LLM workloads. On tighter RAM (≤2GB), skip Ollama entirely.

## Per-Stack Docker Compose Pattern

Each project follows this template:

```yaml
services:
  <project>-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=<db_name>
      - POSTGRES_USER=hafjet
      - POSTGRES_PASSWORD=TrialPass123!
    volumes:
      - <vol_name>:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    ports:
      - "127.0.0.1:<db_port>:5432"  # DB: localhost only
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hafjet -d <db_name>"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  <project>-api:
    image: python:3.12-slim
    working_dir: /app
    command: bash -c "pip install fastapi uvicorn psycopg2-binary -q && python api.py"
    volumes:
      - ./api.py:/app/api.py
    ports:
      - "<api_port>:8000"  # API: accessible
    depends_on:
      <project>-db:
        condition: service_healthy
    restart: unless-stopped

  <project>-ui:
    image: python:3.12-slim
    working_dir: /app
    command: bash -c "python -m http.server 8081"
    volumes:
      - ./ui.html:/app/index.html
    ports:
      - "<ui_port>:8081"  # UI: accessible
    restart: unless-stopped

volumes:
  <vol_name>:
```

**Key rules:**
- DB ports bind to `127.0.0.1` only (no external access)
- API and UI ports bind to `0.0.0.0` (accessible via Tailscale)
- Each project has its own directory, compose file, and volume
- Schema files MUST exist before `docker compose up` (see PostgreSQL pitfall)

## Schema Init Pattern

```bash
# 1. Create project dir
mkdir -p ~/project-name

# 2. Upload files (schema, api, ui, docker-compose)
scp -i KEY schema.sql api.py ui.html docker-compose.yml user@IP:~/project-name/

# 3. Rename compose if needed
ssh user@IP 'cd ~/project-name && mv project_docker-compose.yml docker-compose.yml'

# 4. Deploy
ssh user@IP 'cd ~/project-name && docker compose up -d'

# 5. Wait for DB healthy, then verify schema applied
sleep 10
ssh user@IP 'docker exec project-db-1 psql -U hafjet -d dbname -c "\\dt"'

# 6. If schema NOT applied (volume already existed):
ssh user@IP 'docker exec project-db-1 psql -U hafjet -d dbname -f /docker-entrypoint-initdb.d/01-schema.sql'

# 7. Test API
ssh user@IP 'curl -s http://localhost:<api_port>/api/dashboard | python3 -m json.tool'
```

## Command Center Dashboard

Unified dashboard that aggregates data from all services via proxy.

**cc_server.py pattern:**
- Python `ThreadedHTTPServer` (NOT `HTTPServer` — single-threaded blocks health checks)
- Proxy endpoints: `/proxy/<port>/<path>` → forwards to `172.17.0.1:<port>/<path>`
- Health check: `/api/health` → checks all ports, caches 10s
- HTML uses relative URLs (`/proxy/8080/api/dashboard`) — no CORS issues
- Port 80 for the command center

**Health check must handle FastAPI 404:**
```python
try:
    resp = urllib.request.urlopen(req, timeout=3)
    status[port] = True
except urllib.error.HTTPError as e:
    status[port] = e.code < 500  # 404 = service running, no root handler
except Exception:
    status[port] = False
```

## Tailscale Access

```bash
# Install
curl -fsSL https://tailscale.com/install.sh | sh

# Auth (ONE TIME — don't re-run until user confirms)
sudo tailscale up --hostname=hafjet-server
# → gives auth URL → user clicks → done

# Verify
tailscale status
tailscale ip -4
```

**iPhone access:** `http://<tailscale-ip>:<port>` for each service, or `http://<tailscale-ip>:80` for Command Center.

## Deployment Verification

```bash
# All containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Quick health check
for port in 8080 8082 8090 8092 8095 8097 8098 8100 8101 8105 8106 8110 8111; do
  curl -sf http://localhost:$port/ > /dev/null && echo "✓ :$port" || echo "✗ :$port"
done
```

## Migration Pattern (Server → Server)

When migrating to a new server:
1. Backup all project dirs + docker-compose files
2. Push to GitHub private repo
3. Deploy new server (AWS/Oracle/Hetzner)
4. Install Docker + Tailscale
5. Clone repos / upload files
6. `docker compose up -d` per stack
7. Verify all services
8. Update Tailscale IP in Command Center HTML if hardcoded
