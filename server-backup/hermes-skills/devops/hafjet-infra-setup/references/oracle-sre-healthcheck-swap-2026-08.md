# Oracle SRE — Unhealthy Docker Healthcheck + 4GB Swap (2026-08-12)

Live instance `hafjet-oracle` (ap-kulai-2). Phase 1 diagnose → Phase 2 pure-Python healthcheck → Option A commit + swap.

## Live inventory (verify before acting)

| Field | Value |
|-------|--------|
| Hostname | `hafjet-oracle` |
| Shape | `VM.Standard.A1.Flex` · 4× Neoverse-N1 · **24 GB RAM** · boot ~45 GB |
| OS | Ubuntu 24.04.4 LTS aarch64 |
| Public IP | `149.118.152.50` |
| Tailscale | `100.124.99.52` |
| SSH | `ssh -i /tmp/hafjet-oracle-key ubuntu@100.124.99.52` (or public IP) |
| WhatsApp AI bot | container `hafjet-ai-whatsapp-bot` · compose service `whatsapp-api` |
| Project dir | `~/HAFJET-AI-WhatsApp-Bot/` |
| Compose | `~/HAFJET-AI-WhatsApp-Bot/docker-compose.yml` |
| Bot listen | `0.0.0.0:8200` · **network_mode: host** |
| DB | `hafjet-ai-db` · `127.0.0.1:5440` |
| Ollama | host systemd · `qwen2.5:7b` · `127.0.0.1:11434` |

## Symptom vs reality

| Observation | Meaning |
|-------------|---------|
| `docker ps` → `Up N days (unhealthy)` | Docker health **signal** failed |
| `FailingStreak` thousands | Healthcheck failing every interval for days |
| App logs show Uvicorn OK + 200s | **App may still be fine** |
| Health log: `exec: "curl": executable file not found` | Healthcheck binary missing in image |

**Rule:** Treat `unhealthy` as **signal failure first**. Probe the app from the host before restart/rebuild.

```bash
# Identity
sudo docker ps -a --filter name=hafjet-ai-whatsapp-bot

# Health definition + last outputs (most important)
sudo docker inspect hafjet-ai-whatsapp-bot \
  --format 'Health={{.State.Health.Status}} Streak={{.State.Health.FailingStreak}}'
sudo docker inspect hafjet-ai-whatsapp-bot --format '{{json .Config.Healthcheck}}'
sudo docker inspect hafjet-ai-whatsapp-bot --format '{{range .State.Health.Log}}{{.Start}} exit={{.ExitCode}} {{.Output}}{{println}}{{end}}' | tail -5

# Functional probe (host network)
curl -sS -m 5 http://127.0.0.1:8200/api/health
sudo docker logs --tail 100 hafjet-ai-whatsapp-bot
```

Expected healthy payload:
```json
{"api":"healthy","supabase":"healthy","ollama":"healthy","whatsapp_configured":true,...}
```

## Root cause (confirmed)

- Compose healthcheck: `CMD curl -f http://localhost:8200/api/health`
- Image: `FROM python:3.12-slim` — **no curl**
- Result: every health exec fails; app never involved

## Fix Option B (preferred — no rebuild, no apt)

**Only** edit `whatsapp-api` healthcheck in compose:

```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8200/api/health', timeout=5)"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

Recreate **only** the bot service:

```bash
cd ~/HAFJET-AI-WhatsApp-Bot
# backup first
cp -a docker-compose.yml "docker-compose.yml.bak.$(date -u +%Y%m%dT%H%M%SZ)"
sudo docker compose up -d --force-recreate --no-deps whatsapp-api
# wait ≥ start_period + one interval (~45–60s)
sudo docker ps --filter name=hafjet-ai-whatsapp-bot
sudo docker inspect hafjet-ai-whatsapp-bot --format 'Health={{.State.Health.Status}} Streak={{.State.Health.FailingStreak}}'
curl -sS -m 5 http://127.0.0.1:8200/api/health
```

### Option A (rebuild path — only if approved)

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
```

Heavier on ARM slim images; prefer Option B unless curl needed for other reasons.

## Pitfall: nested SSH quoting eats healthcheck quotes

Editing YAML over `ssh 'python3 <<PY ... urlopen('http://...') ...'` **strips single quotes**. Healthcheck becomes:

```python
urlopen(http://127.0.0.1:8200/api/health, timeout=5)  # SyntaxError
```

**Fix pattern:** write remote patcher via **base64** (or scp a local script), never nest complex quoted Python inside SSH single quotes.

```bash
# On agent host: build B64 of patch script, then:
ssh ... "echo '$B64' | base64 -d | python3"
# Verify inspect shows quotes preserved:
sudo docker inspect ... --format '{{json .Config.Healthcheck.Test}}'
```

After a bad patch: re-fix compose + `--force-recreate --no-deps whatsapp-api` again. App endpoint usually stays OK between recreates.

## Git commit (compose only)

```bash
cd ~/HAFJET-AI-WhatsApp-Bot
git status
git diff -- docker-compose.yml   # expect more than one line if live compose drifted from last commit
git add docker-compose.yml       # ONLY this file unless CTO expands scope
git commit -m "fix(healthcheck): replace curl with pure Python healthcheck for python:3.12-slim image"
git push -u origin main          # may fail
```

**Push failures seen:**
- `main` has no upstream → need `-u origin main`
- `Host key verification failed` for `github.com` on Oracle host → **local commit is success**; do not force. Fix later: `ssh-keyscan github.com >> ~/.ssh/known_hosts` (with approval) or HTTPS token.

**Honesty:** live `docker-compose.yml` may also differ in `container_name`, `env_file`, logging, `${DB_PASSWORD}` — still OK to commit as one ops fix if only compose is staged; call out extra delta in the report.

Do **not** commit `.env`, backup `docker-compose.yml.bak.*`, or unrelated dirty `src/` unless separately approved.

## Enable 4GB swap (Oracle host — no swap by default)

```bash
free -h
swapon --show

# if empty:
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# permanent
grep -qE '^/swapfile\s' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# prefer RAM; avoid thrashing Ollama
grep -qE '^\s*vm.swappiness\s*=' /etc/sysctl.conf || echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -w vm.swappiness=10
```

Verify: `free -h` shows `Swap: 4.0Gi`; `swapon --show` lists `/swapfile`; bot still `healthy`.

## Rules for this class of SRE work

1. Non-destructive diagnose first (inspect Health.Log + host curl).
2. Do not rebuild / apt-install unless Option B fails or CTO asks.
3. `--no-deps` on recreate — never bounce DB with the bot.
4. Mask secrets in env dumps (`TOKEN`, `PASSWORD`, `KEY`, Supabase, etc.).
5. Report format: container ID, Health=, Streak=, endpoint JSON, other services untouched.
6. Public `:8200` on host network attracts scanners — separate hardening ticket (iptables/NSG/tunnel); not required to clear `unhealthy`.

## Related skills / refs

- Parent: `hafjet-infra-setup` (Oracle ARM, iptables, WhatsApp bot deploy)
- `references/whatsapp-ai-bot-oracle-deployment.md`
- `references/oracle-arm-whatsapp-ai-deployment.md`
- Health routines: `whatsapp-bot-health-check` (Oracle section)
