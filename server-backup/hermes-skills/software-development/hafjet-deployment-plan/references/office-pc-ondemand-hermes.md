# Office PC as On-Demand Hermes Host (Jul 2026)

**Decision:** Replace the broken Azure VPS (root FS went read-only / ext4 remount-ro) with a spare office PC. Goal: save ~RM30/mo Azure cost, no new subscription.

## Hardware
- Intel **i3**, 8GB RAM, 256GB SSD (enough for Hermes API-only + light browser tool)
- Mode: **ON-DEMAND** — boot when needed, shut down after. Elektrik ~RM5-15/mo (vs RTX 4070 gaming PC yang bill melambung)

## OS: Ubuntu 26.04 LTS Server
- 26.04 "Resolute Raccoon" released 23 Apr 2026 — confirmed stable + Hermes-compatible (DEV Community, Vultr guides May 2026)
- **Server, NOT Desktop** — Desktop wastes ~2GB RAM on GUI for headless bot
- Download via **Manual Installation** ISO (NOT Instant VM / Automated Provisioning)
- Rufus: GPT + UEFI, ISO mode. Tick "Install OpenSSH server"

## Hermes install pitfall on 26.04
- Default Python = 3.14 → let official installer use `uv` (auto-provisions compatible Python). Do NOT force system python.
- `hermes update` git path can corrupt repo on 26.04 (GitHub #32384) → use plain `hermes update`.
- One-liner: `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`

## Remote access (dynamic home IP)
- Cloudflare Tunnel (`cloudflared tunnel`) → free public URL, no port-forward
- SSH direct only works on same LAN

## Migration from Azure
1. PC ready + Hermes verified
2. rsync `~/.hermes` from Azure → PC
3. Test bot on PC
4. `az webapp stop` / terminate Azure subscription → save RM30/mo

## Runbook
See `PC-OFFICE-26.04-HERMES-RUNBOOK.md` (workspace) — 6 phases: ISO → install → post-install → Hermes → verify → tunnel.
