# On-Prem PC as Azure Replacement (learned 2026-07-19)

When Azure VPS is unreliable (read-only fs, disk tight) and Tuan has spare
hardware, replacing Azure with an on-prem PC is valid and adds ZERO fixed
cost (electricity only, ~RM5-15/mo for an i3 on-demand box vs RM30/mo Azure).

## Verified: Ubuntu 26.04 LTS + Hermes Agent compatibility
- Ubuntu 26.04 LTS "Resolute Raccoon" released 23 Apr 2026 — real LTS, NOT beta.
- Multiple live deployments confirmed (DEV Community, Vultr guide, May 2026).
- Official docs say "Ubuntu 22.04 LTS or any modern Linux" → 26.04 included.
- **Caveat:** 26.04 ships Python 3.14 default. Hermes installer uses `uv`
  to provision its own Python — let it, do NOT force system python.
- **Known bug:** `hermes update` git path can corrupt repo on 26.04
  (GitHub issue #32384). Use plain `hermes update`, not git-path update.
- Prefer 26.04 over 24.04 for new installs: longer LTS (2031), newer kernel
  (better i3/i5 hardware support). Only pick 24.04 if Tuan wants the exact
  version the Hermes docs literally name.

## Recommended topology (on-demand hybrid)
```
Tuan (browser/Telegram)
   │
   ▼  Cloudflare Tunnel / Tailscale (dynamic IP at home)
PC Office (Ubuntu 26.04, i3/18GB/512GB+320GB HDD)
   └─ Hermes MAIN engine + storage
Azure (optional): stop or terminate → save RM30/mo
```
- PC on-demand: boot when needed, shutdown when done (low electricity).
- Cloudflare Tunnel gives free public URL without port-forward.
- Migrate `~/.hermes` from Azure via scp/rsync AFTER fsck fixes the ro fs.

## Install mode decision
- Server (not Desktop) for headless bot box — Desktop wastes ~1.5GB RAM on GUI.
- Dual-boot if Windows must stay (see hafjet-command-safety dual-boot rules).
- Full Ubuntu if Windows not needed — but backup HDD docs first.

## Confirmed spec for Tuan's PC office (write final spec in any runbook)
Intel i3 · 18GB RAM · 512GB SSD (Windows currently) + 320GB HDD (office docs).
→ 18x RAM, 17x storage vs Azure 1GB/30GB. Comfortable for Hermes API-only.

## Runbook file produced this session
`/home/hafizi145/.hermes/webui/workspace/PC-OFFICE-26.04-HERMES-RUNBOOK.md`
(6-phase: download → install dual-boot → post-install → Hermes → verify →
on-demand access + known-issues table + Azure rollover plan)
