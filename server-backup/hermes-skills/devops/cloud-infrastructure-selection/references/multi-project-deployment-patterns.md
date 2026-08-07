# Multi-Project Deployment Patterns

## Command Center Proxy Pattern (Unified Dashboard)

When deploying multiple services (Inventory, CRM, Marketing, etc.) behind a single dashboard, use a **proxy server** to avoid CORS issues.

### Architecture
```
Browser → Command Center (port 80) → /proxy/{port}/api/... → Internal Services
                                    → /api/health → Health Check All Services
```

### Key Files
- `cc_server.py` — Python ThreadedHTTPServer with CORS + proxy
- `commandcenter_ui.html` — Single-page dashboard with tab navigation

### Proxy Server Pattern (cc_server.py)
```python
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class CORSHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/health':
            # Check all services via 172.17.0.1:{port}
            # Accept HTTPError with code < 500 as "service running"
        elif self.path.startswith('/proxy/'):
            # Forward to internal service at 172.17.0.1:{port}/{path}
```

### Critical Fixes
1. **Docker networking:** Container → host services via `172.17.0.1` (Docker gateway), NOT `127.0.0.1`
2. **FastAPI 404:** FastAPI returns 404 for `/` — health check must accept HTTPError with code < 500
3. **Threading:** Use `ThreadingMixIn` to prevent blocking on slow health checks
4. **Browser fetch:** All JS fetch calls use relative paths (`/proxy/8080/api/...`) to avoid CORS

### HTML Dashboard Pattern
```javascript
const INV = '/proxy/8080';
const CRM = '/proxy/8090';

async function api(u) {
    const r = await fetch(u, {signal: AbortSignal.timeout(8000)});
    return r.ok ? await r.json() : null;
}

// Tab switching
function show(name) {
    document.querySelectorAll('[id^="sec-"]').forEach(s => s.style.display = 'none');
    document.getElementById('sec-' + name).style.display = 'block';
}
```

## Low-RAM Deployment (< 2GB)

### RAM Budget
| Component | RAM Usage |
|-----------|-----------|
| PostgreSQL | ~100MB per instance |
| FastAPI API | ~30-50MB per instance |
| Python HTTP server (UI) | ~10-20MB per instance |
| Docker overhead | ~50MB base |

### Rules
1. **Max 4-5 services** on 1GB RAM
2. **Shared PostgreSQL** for multiple projects when RAM < 2GB
3. **Deploy sequentially** — parallel Docker pulls + starts = OOM
4. **PostgreSQL config:** `shared_buffers=128MB`, `work_mem=4MB`, `max_connections=20`
5. **No Ollama** on < 2GB RAM — needs minimum 2.4GB for 3B model

### Sequential Deployment Script Pattern
```bash
# Deploy DBs first, wait for healthy
for proj in inventory crm multichannel; do
    cd ~/projects/$proj && docker compose up -d ${proj}-db
    sleep 15
done
sleep 30  # Wait for all DBs healthy

# Then APIs
for proj in inventory crm multichannel; do
    cd ~/projects/$proj && docker compose up -d ${proj}-api
    sleep 20
done

# Then UIs
for proj in inventory crm multichannel; do
    cd ~/projects/$proj && docker compose up -d ${proj}-ui
done
```

## SSH Key Format Issues

### AWS OpenSSH Format
Newer AWS key pairs use OpenSSH format which may fail:
```
error in libcrypto
```

**Fix:** Add final newline to .pem file:
```bash
echo "" >> /tmp/hafjet-aws-key.pem
ssh-keygen -l -f /tmp/hafjet-aws-key.pem  # Verify
```

### SSH Timeout Under Load
When server is under heavy load (Docker pulls, multiple containers starting), SSH may hang.

**Fix:** Wait 60-120 seconds, then retry. Or reboot from cloud console.

## Oracle ARM Capacity Issues

### Symptoms
- `Out of host capacity` — ARM capacity exhausted in region
- `LimitExceeded` — Account hit free tier allocation
- `standard-a1-core-count` errors

### Workarounds
1. Try again in 1-2 hours (capacity fluctuates)
2. Try smaller shape (1 OCPU, 1GB)
3. Use x86 shape (not free tier but available)
4. Request limit increase via console

### Confirmed: AP-KULAI-2 (Malaysia) has very limited ARM capacity
- Only 1 Availability Domain
- ARM capacity often exhausted during peak hours
- Always Free VM.Standard.A1.Flex (4 OCPU, 24GB) is target but not guaranteed
