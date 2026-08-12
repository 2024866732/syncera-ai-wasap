# Oracle A1 — Python slim healthcheck + swap (Aug 2026)

## Scope
Live `hafjet-oracle` (VM.Standard.A1.Flex, ap-kulai-2). WhatsApp AI bot container `hafjet-ai-whatsapp-bot`.

## Unhealthy but app OK
**Symptom:** `docker ps` shows `(unhealthy)` while `curl http://127.0.0.1:8200/api/health` returns 200.

**Cause:** compose healthcheck uses `CMD curl ...` but image is `python:3.12-slim` (no curl).

**Preferred fix (no rebuild, no apt):** pure-Python healthcheck in `docker-compose.yml`:
```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8200/api/health', timeout=5)"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```
Then:
```bash
cd ~/HAFJET-AI-WhatsApp-Bot
sudo docker compose up -d --force-recreate --no-deps whatsapp-api
```
Do **not** touch sibling services. Verify quotes around the URL survive YAML (SyntaxError if quotes stripped via nested SSH).

## Swap (4G) on Always Free A1
If `free -h` shows Swap 0B:
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -w vm.swappiness=10
```
Verify: `swapon --show` and `cat /proc/sys/vm/swappiness` → 10.

## Git push from Oracle
After host key fix (`ssh-keyscan github.com >> ~/.ssh/known_hosts`), push may still fail with `Permission denied (publickey)` if no deploy key. Commit locally; push from a machine with GitHub auth or install a deploy key — do not force-push.
