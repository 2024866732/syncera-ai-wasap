# Buzz Headless Architecture Notes

## Decision: Self-Host di PC Office

**Resources:** i3-2100, 16GB RAM (13GB free), 51GB disk free

### Why Self-Host Instead of VPS

- 13GB RAM free — plenty for Buzz stack (~2.8GB) + existing services
- 0ms latency (localhost relay)
- Free — no VPS cost
- Tailscale provides secure remote access from laptop

### Why NOT `just dev`

`just dev` starts **both** relay + desktop GUI app (Tauri + React). PC Office is headless Ubuntu Server via SSH — no display, no GUI libraries.

### Production Approach

Guna **`deploy/compose/compose.yml`** — production Compose bundle untuk relay-only:

- `buzz-relay` — Nostr relay (Rust), binds `0.0.0.0:3000`
- `postgres` — Event storage + metadata
- `redis` — Cache + pub/sub
- `minio` — S3-compatible object storage (files, media)

Root `docker-compose.yml` is for day-to-day development only (README Buzz).

### RAM Budget

| Component | ~RAM |
|-----------|------|
| buzz-relay | 500MB |
| postgres | 500MB |
| redis | 200MB |
| minio | 500MB |
| Docker overhead | 500MB |
| **Total** | **~2.8GB** |

### Key Generation — Official vs Fallback

| Method | Tool | Registration |
|--------|------|--------------|
| **Official** | `buzz-admin generate-key` | `buzz-admin add-member --pubkey KEY` |
| Fallback | `python3 -c secrets.token_hex(32)` | Manual via Buzz UI |

Official tool registers agent cryptographically on relay. Fallback needs manual UI action.

### Hermes Gateway Commands (Correct)

- `hermes gateway` — foreground (test)
- `hermes gateway setup` — interactive wizard
- `hermes gateway install` — install systemd service
- `hermes gateway start` / `stop` / `restart` — service control
- `hermes gateway status` — check
- `journalctl --user -u hermes-gateway -f` — logs

**BUKAN** `hermes gateway run` — itu bukan command rasmi.

---

## Key Generation Pitfalls (2026-07-30 Session)

1. **`docker compose exec relay buzz-admin generate-key` FAILS jika relay unhealthy.**
   Relay mesti fully healthy (6/6 containers Up) sebelum `buzz-admin` boleh jalan.
   Fresh install: `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true` + missing `RELAY_OWNER_PUBKEY`
   → crash loop → `buzz-admin` unreachable. Workaround:
   ```bash
   sed -i 's/BUZZ_REQUIRE_RELAY_MEMBERSHIP=.*/BUZZ_REQUIRE_RELAY_MEMBERSHIP=false/' .env
   ./run.sh stop 2>/dev/null && ./run.sh start
   # THEN generate keys & register agent
   ```

2. **`sed 's/CHANGE_ME/$(openssl rand -hex 32)/g'` — semua placeholder dapat hex SAMA.**
   `BUZZ_RELAY_PRIVATE_KEY` dan `RELAY_OWNER_PUBKEY` jadi identical → relay reject.
   Fix: replace DB/Redis/S3 secrets dengan random hex je. Nostr keys handle BERASINGAN.

3. **Private key TERDEDAH di Hermes chat = compromised.**
   Semua output chat tersimpan dalam session log. Keys yang dipaste/print ke terminal
   dalam chat session boleh dibaca semula. ALWAYS save keys to file:
   ```bash
   uv run --with coincurve python3 -c "... write to /tmp/hermes-buzz-keys.txt ..."
   cat /tmp/hermes-buzz-keys.txt   # read locally, JANGAN paste chat
   ```

4. **`openssl ecparam -name secp256k1` — TAK BOLEH untuk Nostr keys.**
   Extraction public key broken (wrong length). `BUZZ_RELAY_PRIVATE_KEY` rejected:
   `"Invalid secret key"`. GUNA `uv run --with coincurve` sahaja.

5. **PEP 668: externally-managed-environment di Ubuntu 26.04.**
   `pip install coincurve` gagal. GUNA `uv run --with coincurve` — bypass PEP 668
   tanpa `--break-system-packages`.