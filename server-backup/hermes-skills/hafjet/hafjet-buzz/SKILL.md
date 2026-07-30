---
name: hafjet-buzz
description: "Self-host Buzz (Block's Nostr workspace) on Ubuntu headless + connect Hermes as native gateway platform. Headless relay via production Docker Compose."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Buzz + Hermes Integration

## Overview

Self-host Buzz relay di PC Office (Ubuntu 26.04, headless) dan connect Hermes sebagai native gateway platform (mode ③). Hermes join Buzz sebagai participant penuh — channels, DMs, threads, cron deliver=buzz.

**Platform:** Ubuntu Server 26.04 | **Tools:** Docker, Hermit, Buzz, Hermes Agent

---

## Architecture

```
PC Office (headless)
├── Docker Compose (deploy/compose/)
│   ├── buzz-relay        → ws://0.0.0.0:3000
│   ├── Postgres + Redis + MinIO
├── Hermes Agent v0.19+
│   └── hermes gateway    → Buzz platform
│
Laptop (Tailscale)
└── Buzz Desktop App      → ws://TAILSCALE_IP:3000
```

> **Critical:** JANGAN guna `just dev` — tu start desktop GUI sekali. Guna production Compose: `deploy/compose/compose.yml` (BUKAN `docker-compose.yml` — file tu TAK WUJUD).

---

## ⚠️ CRITICAL: Buzz Platform Plugin Missing on pip Install

`uv tool install hermes-agent` (PEP 668 workaround) **does NOT include** the Buzz platform adapter. Only git-install (`git clone` + `pip install -e ".[all]"`) ships `plugins/platforms/buzz/`.

**Symptom:** `hermes gateway` runs, Telegram/Discord connect, but Buzz connection line NEVER appears — Hermes never joins the relay silently.

**Fix — copy Buzz platform from VPS (git install) to PC Office (pip install):**

```bash
# On VPS (git install): verify buzz plugin exists
ls ~/hermes-agent/plugins/platforms/buzz/
# → __init__.py  adapter.py  nostr_auth.py  plugin.yaml

# From VPS, copy to PC Office:
scp -r ~/hermes-agent/plugins/platforms/buzz/ \
  hafizi145@100.121.94.41:~/.local/share/uv/tools/hermes-agent/lib/python3.13/site-packages/plugins/platforms/buzz/
```
> **Verify fix:** `hermes gateway` output MUST show `INFO Buzz platform connected to ws://...`

---

## Prerequisites Check

```bash
# Verify Hermes
hermes --version                                    # v0.19+
hermes doctor                                       # no critical errors

# Verify resources
free -h                                             # >= 8GB free recommended
df -h /                                             # >= 20GB free disk
docker --version 2>/dev/null || echo "Need Docker"
```

Buzz relay stack guna ~2.8GB RAM (Postgres + Redis + MinIO + relay).

---

## Install

### Step 1: Run Setup Script

Lihat `templates/setup-buzz-hermes.sh` — script automation penuh:
- Install Docker via apt repo (bukan `curl | bash`)
- Clone Buzz + Hermit toolchain
- `just setup && just build`
- Configure relay bind `0.0.0.0:3000`

```bash
# Review dulu
cat ~/setup-buzz-hermes.sh

# Run
./setup-buzz-hermes.sh
```

### Step 2: Start Relay (HEADLESS — bukan `just dev`!)

```bash
cd ~/buzz/deploy/compose
cp .env.example .env

# Replace DB/Redis/S3 placeholders with random hex (these are NOT Nostr keys — random is fine)
sed -i "s/CHANGE_ME/$(openssl rand -hex 32)/g" .env

# ==================== CRITICAL: Nostr Keypair ====================
#  openssl ecparam → TAK VALID untuk Nostr!
#   - Public key extraction broken (wrong length hex)
#   - BUZZ_RELAY_PRIVATE_KEY rejected: "Invalid secret key"
#
#  USE THIS (uv + coincurve — bypasses PEP 668 Ubuntu 26.04):
# ==================================================================

# Generate proper Nostr secp256k1 keypair
uv run --with coincurve python3 -c "
from coincurve import PrivateKey
import secrets
priv = PrivateKey(secrets.token_bytes(32))
pub_hex = priv.public_key.format().hex()[2:]  # strip 02/03 prefix
print(f'PRIVKEY={priv.to_hex()}')
print(f'PUBKEY={pub_hex}')
"

# Output:
#   PRIVKEY=<64-char-hex>   → masukkan sebagai BUZZ_RELAY_PRIVATE_KEY
#   PUBKEY=<64-char-hex>    → masukkan sebagai RELAY_OWNER_PUBKEY

# Edit .env — ganti 2 line ini SAHAJA:
#   BUZZ_RELAY_PRIVATE_KEY=<PRIVKEY>
#   RELAY_OWNER_PUBKEY=<PUBKEY>
nano .env

# IMPORTANT: disable closed relay mode dulu
sed -i 's/BUZZ_REQUIRE_RELAY_MEMBERSHIP=.*/BUZZ_REQUIRE_RELAY_MEMBERSHIP=false/' .env

# Start relay via run.sh (wrapper rasmi)
./run.sh start

# Verify — semua container "Up"
./run.sh status
docker logs buzz-prod-relay-1     # check relay logs
```

> ❌ **JANGAN guna `just dev`** — tu start desktop app (GUI) sekali.  
> ✅ **GUNA** `./run.sh start` dari `deploy/compose/` — relay only, production.  
> ⚠️ **Jika relay "unhealthy"**: check logs → `RELAY_OWNER_PUBKEY required` = disable membership. `Invalid secret key` = BUZZ_RELAY_PRIVATE_KEY bukan 64-char hex secp256k1 valid.

### Step 3: Generate & Register Agent Key (cara RASMI)

```bash
# Generate Nostr keypair untuk Hermes
docker compose -f ~/buzz/deploy/compose/compose.yml exec relay \
  buzz-admin generate-key

# Output: privkey_hex, pubkey_hex, npub

# Register Hermes sebagai member relay
docker compose -f ~/buzz/deploy/compose/compose.yml exec relay \
  buzz-admin add-member --pubkey <PUBKEY_HEX>
```

> **WARNING:** `buzz-admin generate-key` mungkin FAIL dalam production container (image `ghcr.io/block/buzz:main` mungkin tak include binary). Jika gagal, guna `uv run --with coincurve python3` (lihat Step 2) — generated keypair sama format Nostr secp256k1. Register pubkey via:  
> `docker compose exec relay buzz-admin add-member --pubkey <PUBKEY_HEX>`  
> atau manual di Buzz Desktop UI (Invite → paste pubkey).

### Step 4: Hermes Gateway Config

Edit `~/.hermes/config.yaml`:

```yaml
gateway:
  platforms:
    buzz:
      enabled: true
      extra:
        relay_url: "ws://localhost:3000"          # atau ws://TAILSCALE_IP:3000
        privkey_hex: "BUZZ_PRIVKEY_HEX_HERMES"
        require_mention: true
        allow_all_users: false

display:
  platforms:
    buzz:
      interim_assistant_messages: false
      tool_progress: off
```

Edit `~/.hermes/.env`:

```bash
BUZZ_RELAY_URL=ws://localhost:3000
BUZZ_PRIVATE_KEY=BUZZ_PRIVKEY_HEX_HERMES
```

### Step 5: Start Hermes Gateway

```bash
# Test foreground (berhenti dengan Ctrl+C)
hermes gateway

# ATAU wizard interactif
hermes gateway setup    # → pilih Buzz → isi relay_url + privkey_hex

# Install persistent service
hermes gateway install
hermes gateway start
hermes gateway status

# Logs
journalctl --user -u hermes-gateway -f

# Restart lepas ubah config
hermes gateway restart
```

---

## Hermes Gateway Commands (REFERENCE)

| Command | Purpose |
|---------|---------|
| `hermes gateway` | Run foreground (test manual) |
| `hermes gateway setup` | Wizard interactif pilih platform |
| `hermes gateway install` | Install systemd user service |
| `hermes gateway start` | Start service |
| `hermes gateway stop` | Stop service |
| `hermes gateway restart` | Restart (guna lepas ubah config) |
| `hermes gateway status` | Check status |
| `journalctl --user -u hermes-gateway -f` | Live logs |

---

## Buzz CLI Reference (Quick Commands)

Buzz CLI binary: `~/buzz/target/debug/buzz` (built via `just build`). NOT accessible via `just buzz-cli` (not a recipe).

```bash
# Set env var
export BUZZ_PRIVATE_KEY=<64-char-hex>

# Create channel
target/debug/buzz channels create --name "general" --relay ws://localhost:3000

# List channels
target/debug/buzz channels list --relay ws://localhost:3000

# Send message
target/debug/buzz messages send --channel-id <UUID> --text "Hello" --relay ws://localhost:3000
```

---

## Test End-to-End

1. **Start relay**: `cd ~/buzz/deploy/compose && ./run.sh start`
2. **Start gateway**: `hermes gateway` (foreground) atau `hermes gateway start` (service)
3. **Buka Buzz Desktop** di laptop → **Create NEW identity** → skip harnesses → connect ke `ws://TAILSCALE_IP:3000`
4. **Create channel** `#hafjet-lab` dari UI
5. **Invite** pubkey Hermes ke channel (dari `/tmp/hermes-buzz-keys.txt`)
6. **Mention**: `@hermes ping` → jangka reply dalam thread (pastikan `require_mention: true`)
7. **Cron delivery**:

```bash
hermes cronjob action=create \
  schedule="0 9 * * *" \
  deliver="buzz:CHANNEL_UUID" \
  prompt="Hantar laporan harian sistem"
```

---

## Systemd Service (Buzz Relay Auto-Start)

```bash
sudo tee /etc/systemd/system/buzz-relay.service << 'EOF'
[Unit]
Description=Buzz Relay (Docker Compose)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/hafizi145/buzz/deploy/compose
ExecStart=/bin/bash ./run.sh start
ExecStop=/bin/bash ./run.sh stop
User=hafizi145

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable buzz-relay
sudo systemctl start buzz-relay
```

---

## ⚠️ CRITICAL: Buzz CLI Binary MUST Be On PATH

The Buzz adapter shells out to the `buzz` CLI binary. Two things needed:

```bash
# 1. Binary on PATH — copy from build output:
cp ~/buzz/target/debug/buzz ~/.local/bin/buzz
chmod +x ~/.local/bin/buzz

# 2. Tell Hermes where it is:
echo 'BUZZ_CLI_PATH=/home/hafizi145/.local/bin/buzz' >> ~/.hermes/.env
```

> **Symptom jika missing:** Gateway runs, Buzz platform line absent — no error, just silent failure. Adapter tries `buzz` on PATH, then `~/bin/buzz` — neither exists by default.

## ⚠️ CRITICAL: Use Tailscale IP in Hermes Config (NOT localhost)

Hermes config MUST use the SAME host as the community in Postgres:

```yaml
# ~/.hermes/config.yaml:
gateway:
  platforms:
    buzz:
      extra:
        relay_url: "ws://100.121.94.41:3000"   # ← Tailscale IP, BUKAN localhost!
```

```bash
# ~/.hermes/.env:
BUZZ_RELAY_URL=ws://100.121.94.41:3000   # ← MATCH community host in DB
```

> **Why:** Relay identifies community by Host header. `ws://localhost:3000` → community `localhost:3000` (empty, no channels). `ws://100.121.94.41:3000` → community with your channels. Always match.

## The "Not Replying" Resolution Chain

When `hermes gateway` shows Buzz connected but mentions don't trigger reply:

```
1. Buzz platform plugin present?  → ls plugins/platforms/buzz/
2. buzz CLI binary on PATH?       → which buzz
3. BUZZ_CLI_PATH set in .env?     → grep BUZZ_CLI_PATH ~/.hermes/.env  
4. relay_url matches community?   → grep relay_url ~/.hermes/config.yaml
5. Joined the channel?            → buzz channels list (from CLI)
6. Channel join if needed:        → buzz channels join --channel <ID>
```

Step 5-6: Use `buzz` CLI with Hermes' identity to join the target channel:
```bash
BUZZ_RELAY_URL=ws://100.121.94.41:3000 \
BUZZ_PRIVATE_KEY=<HERMES_PRIVKEY_HEX> \
  ~/.local/bin/buzz channels join --channel <CHANNEL_UUID>
```

Then restart gateway. Mentions should now trigger.

---

## Troubleshooting

**PEP 668: externally managed environment** — Ubuntu 26.04 block pip system-wide.  
→ Guna `uv run --with <pkg> python3 -c "..."` — bypass PEP 668 tanpa `--break-system-packages`.

**coincurve ModuleNotFoundError** — coincurve tak installed.  
→ Guna `uv run --with coincurve` — auto install ke venv temporary. JANGAN guna `pip install` (PEP 668).

**Docker daemon not accessible** — user tak masuk docker group lagi.  
→ `newgrp docker` — AMARAN: `newgrp` buka shell BARU. Lepas `newgrp`, run semua command dalam shell baru tu.

**Docker daemon tak start lepas install** — `just setup` fail.  
→ `sudo systemctl start docker` dulu, THEN `newgrp docker`, then `just setup`.

**Double containers (dev + production)** — `just setup` start dev stack via root docker-compose.yml.  
→ Cleanup: `cd ~/buzz && docker compose down`. Production stack di `deploy/compose/` unaffected.

**Script automation tak boleh run via background SSH** — sudo perlukan terminal interactive.  
→ Tuan MESTI run script manual: `ssh` → `./setup-buzz-hermes.sh` → taip sudo password.

**"just dev launches desktop GUI"** — tu masalah kalau headless.  
→ Guna `./run.sh start` dari `deploy/compose/` — wrapper rasmi relay-only. BUKAN `docker compose` direct.

**Relay 404 "no community configured for this host"** — ROOT CAUSE: Community host dalam Postgres tak match host client connect. Buzz auto-create community entry baru setiap relay restart dengan `BUZZ_DOMAIN` berbeza → multiple entries → relay confused.

→ **FIX — Update main community ONLY (bukan consolidate semua):**
```bash
cd ~/buzz/deploy/compose
# Cek state — main community = yg ada events
docker exec buzz-prod-postgres-1 psql -U buzz -d buzz \
  -c "SELECT c.host, COUNT(e.id) AS events FROM communities c LEFT JOIN events e ON c.id = e.community_id GROUP BY c.host;"
# Update HANYA main community (yg ada events) ke target host — jangan sentuh orphan entries
docker exec buzz-prod-postgres-1 psql -U buzz -d buzz \
  -c "UPDATE communities SET host = '100.121.94.41:3000' WHERE host = 'buzz.example.com';"
# Orphan entries (0 events) biar sahaja — relay pilih community yg match host client connect
# Update .env (ws:// NOT wss:// — Tailscale encrypts, no TLS needed)
sed -i 's|BUZZ_DOMAIN=.*|BUZZ_DOMAIN=100.121.94.41|' .env
sed -i 's|RELAY_URL=.*|RELAY_URL=ws://100.121.94.41:3000|' .env
sed -i 's|BUZZ_MEDIA_BASE_URL=.*|BUZZ_MEDIA_BASE_URL=http://100.121.94.41:3000/media|' .env
sed -i 's|buzz.example.com|100.121.94.41|g' .env
./run.sh restart
```
```bash
cd ~/buzz/deploy/compose
# Cek state semasa
docker exec buzz-prod-postgres-1 psql -U buzz -d buzz \
  -c "SELECT c.host, COUNT(e.id) AS events FROM communities c LEFT JOIN events e ON c.id = e.community_id GROUP BY c.host;"
# Update ke temp hosts dulu (bypass unique constraint), then consolidate:
docker exec buzz-prod-postgres-1 psql -U buzz -d buzz <<'SQL'
UPDATE communities SET host = 'tmp-a.example.com' WHERE host LIKE '%example.com%';
UPDATE communities SET host = 'tmp-b.example.com' WHERE host LIKE '%.ts.net%' AND host NOT LIKE '%:3000';
UPDATE communities SET host = 'tmp-c.example.com' WHERE host LIKE '%.ts.net:3000';
UPDATE communities SET host = '100.121.94.41:3000';
SQL
# Update .env (ws:// NOT wss:// — Tailscale encrypts, no TLS needed)
sed -i 's|BUZZ_DOMAIN=.*|BUZZ_DOMAIN=100.121.94.41|' .env
sed -i 's|RELAY_URL=.*|RELAY_URL=ws://100.121.94.41:3000|' .env
sed -i 's|BUZZ_MEDIA_BASE_URL=.*|BUZZ_MEDIA_BASE_URL=http://100.121.94.41:3000/media|' .env
sed -i 's|buzz.example.com|100.121.94.41|g' .env
./run.sh restart
# Update Hermes config to match
sed -i 's|BUZZ_RELAY_URL=.*|BUZZ_RELAY_URL=ws://100.121.94.41:3000|' ~/.hermes/.env
sed -i 's|relay_url:.*|relay_url: "ws://100.121.94.41:3000"|' ~/.hermes/config.yaml
# Restart gateway di terminal BERASINGAN (Hermes security block kill/restart from within gateway process!)
```

> **Why `ws://` not `wss://`:** Tailscale wireguard tunnels encrypt — plain HTTP OK.  \
> **Why plain IP:** Avoids hostname mismatch (localhost vs DNS vs IP all create separate community entries).

**`sed "s/CHANGE_ME/..."` replaces ALL fields with same hex** — `BUZZ_RELAY_PRIVATE_KEY` dan `RELAY_OWNER_PUBKEY` jadi invalid Nostr key. Lepas `sed`, MESTI generate Nostr keypair berasingan guna `uv run --with coincurve` dan replace 2 field tu secara manual.

**Buzz Desktop: Create NEW identity** — jangan re-use existing key. Skip "agent harnesses" screen (Hermes guna native gateway ③, bukan harnesses). Connect ke `ws://TAILSCALE_IP:3000` atau `ws://hostname.tail260d72.ts.net:3000`.

**DISCORD TOKEN LEAK IN CHAT** — jika token API terdedah semasa edit `.env` / `nano`:
→ **RESET SEGERA di developer portal** (Discord, GitHub, etc.), update `.env` dengan token baru. JANGAN paste token baru ke chat — edit direct via `nano ~/.hermes/.env`.

**Key exposure in chat (CRITICAL)** — Nostr private keys, Discord tokens, API keys yang terdedah dalam chat MESTI di-RESET segera. JANGAN generate keypair dengan output terpapar ke chat — tulis ke file: `uv run --with coincurve python3 -c "..." > /tmp/keys.txt && chmod 600 /tmp/keys.txt`. Kalau dah terdedah, lihat `references/keys.md` untuk rotate procedure.

**Hermes gateway tak reply di channel** — check `require_mention: true`.  
→ Agent hanya reply bila di-@mention. Untuk DM, sentiasa reply.

**Relay port tak accessible dari LAN** — check bind address.  
→ Pastikan `.env` ada `BUZZ_RELAY_HOST=0.0.0.0`, bukan `127.0.0.1`.

**Hermes security blocks gateway restart/kill** — `pkill -f "hermes gateway"` dan `hermes gateway restart` di-block bila run dari dalam sesi Hermes (VPS/telegram). Message: "cannot restart or stop the gateway from inside the gateway process".
→ MESTI run dari terminal berasingan (SSH direct ke PC Office). JANGAN cuba bypass — security intentional.

**buzz-admin generate-key FAIL dalam production container** — `docker compose exec relay buzz-admin generate-key` mungkin fail jika relay unhealthy atau image tak include binary.
→ Fallback: guna `uv run --with coincurve python3` untuk generate keypair di host, kemudian register pubkey via `buzz-admin add-member` atau manual di Buzz UI.

**Gateway Buzz connection check** — how to verify Hermes actually connected to relay:  
→ Watch gateway output for `INFO Buzz platform connected to ws://...`. Jika absent: (a) Buzz platform plugin missing from pip install → see CRITICAL section above, (b) relay down → `docker ps | grep buzz-prod-relay`, (c) config wrong → verify `relay_url` matches running relay.

**buzz-admin add-member tak support --channel-id** — `buzz-admin add-member` hanya register pubkey ke relay membership table. Untuk join channel spesifik, invite via Buzz Desktop UI (Add people → paste pubkey) ATAU mention @Hermes dalam channel (Hermes auto-join bila di-mention).

**buzz-cli channel create needs --name flag** — bukan positional arg:  
```bash
# WRONG: buzz channels create "Channel Name"
# CORRECT:
BUZZ_PRIVATE_KEY=<hex> target/debug/buzz channels create --name "channel-name" --relay ws://localhost:3000
```
Binary location: `~/buzz/target/debug/buzz` (built via `just build`).

---

## References

- `templates/setup-buzz-hermes.sh` — Automation install script
- `references/buzz-headless.md` — Headless architecture notes + decisions
