# Docker Healthcheck on python:*-slim — Unhealthy but App Healthy

**Class pattern (confirmed HAFJET Oracle, 2026-08-12):** Container `Up (unhealthy)` for days while FastAPI serves `/api/health` HTTP 200.

## Symptom
```
STATUS: Up N days (unhealthy)
FailingStreak: thousands
Health log: exec: "curl": executable file not found in $PATH
```
Host probe still 200. App logs normal.

## Root cause
Compose healthcheck uses `curl` on `python:3.12-slim` (no curl/wget). **Ops signal only** — traffic may be fine.

## Diagnosis (non-destructive)
1. `docker ps` / inspect `State.Health` + `Config.Healthcheck`
2. Host: `curl http://127.0.0.1:<port>/api/health`
3. Inside: `command -v curl || echo no-curl`
4. Mask secrets when dumping env
5. No restart until root cause written + approval (HAFJET)

## Fix (preferred) — pure Python, no rebuild
```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8200/api/health', timeout=5)"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```
Apply: edit compose → recreate **only** that service. Confirm `Health=healthy`, `FailingStreak=0`.

### Quote pitfall when patching via nested SSH
Single quotes inside the Python `-c` string are easy to strip through shells → healthcheck `SyntaxError` and stays unhealthy. Prefer writing compose on the remote with a base64-delivered Python script or `write_file`-equivalent so quotes survive. Verify:
```bash
docker inspect <name> --format '{{json .Config.Healthcheck.Test}}'
# must show urlopen('http://127.0.0.1:...') with quotes intact
```

### Applied fix (HAFJET Oracle, 2026-08-12)
- Service: `whatsapp-api` / container `hafjet-ai-whatsapp-bot`
- Compose: `~/HAFJET-AI-WhatsApp-Bot/docker-compose.yml`
- Result after recreate: `healthy`, streak 0; DB container untouched

## Alternative
Install curl in Dockerfile (rebuild). Do not disable healthcheck entirely.

## Related HAFJET Oracle notes
- `network_mode: host`, port `8200`, Tailscale `100.124.99.52`, key `/tmp/hafjet-oracle-key`
- Public bind attracts scanners — separate from healthcheck root cause
- See `oracle-cloud-iptables-pitfall.md`, `production-deployment-safety-protocol.md`
