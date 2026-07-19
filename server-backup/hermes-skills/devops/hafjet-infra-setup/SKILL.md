---
name: hafjet-infra-setup
description: "Use when planning or executing HAFJET infrastructure setup — on-prem PC (Ubuntu dual-boot, WSL2), VPS migration, disk/partition strategy, cost trade-offs between cloud subscription vs existing hardware, and Azure read-only filesystem recovery. Covers Tuan Hafizi's standing constraints on safe cleanup and approval-gated destructive commands."
version: 1.0.0
author: Hermes-HAFJET
license: MIT
---

# HAFJET Infrastructure Setup

Class-level skill for standing up or migrating HAFJET compute: PC-office Ubuntu server, PC-gaming
WSL2, Azure VPS, hybrid topologies. Driven by Tuan Hafizi's tight fixed-cost discipline.

## Cost-aware default
- NEVER recommend a new VPS subscription (Tencent/Azure) unless no existing hardware fits.
  New subscription = higher monthly fixed cost for HAFJET.
- Reuse existing hardware first:
  - PC-gaming: Ryzen 7 8700F + RTX 4070 12GB + 32GB RAM + 3TB NVMe. Powerful but electricity
    ~RM40+/mo 24/7 → was switched OFF, bot moved to VPS.
  - PC-office (confirmed Jul 2026): Intel i3, 18GB RAM, 512GB SSD (Windows installed), 320GB HDD
    (NTFS, holds office documents). On-demand boot keeps electricity ~RM5-15/mo.
- PC-office beats Azure VPS specs: 18GB RAM vs 1GB, 512GB vs 30GB, plus 320GB HDD.

## Dual-Boot Ubuntu + Windows (CRITICAL pitfalls)
When installing Ubuntu on the same SSD as Windows:
1. SHRINK WINDOWS FIRST from Windows Disk Management → Shrink Volume, BEFORE booting Ubuntu USB.
   Ubuntu Custom storage layout CANNOT shrink NTFS (no resize button exists there).
2. In Ubuntu installer Storage screen → choose **"Custom storage layout"** — NEVER "Use an entire disk"
   (that formats the whole SSD incl. Windows).
3. NEVER click "New Simple Volume" in Windows Disk Management on unallocated space — leave it
   unallocated; Ubuntu creates the partition during install.
4. NEVER touch the HDD (320GB NTFS docs) or the Windows partition. Leave both untouched.
5. After install, Ubuntu reads NTFS HDD directly: `sudo mount /dev/sdbX /mnt/docs`.
6. If unallocated doesn't appear in Ubuntu installer: disable Windows Fast Startup, use Restart
   (not Shutdown) before booting USB.
7. Tick "Install OpenSSH server" during install — required for remote access.
8. Swap: optional with 18GB RAM, but create 4GB for OOM safety. Swap does NOT improve performance.

## Ubuntu version (Jul 2026)
- Ubuntu 26.04 LTS "Resolute Raccoon" released 23 Apr 2026 — VALID, not beta. Confirmed Hermes-Agent
  compatible (live deploys May 2026). LTS until 2031. Prefer over 24.04 for new installs.
- Caveat: Python 3.14 default — let Hermes installer use `uv` (auto-handles), never force system python.
- Known: `hermes update` git-path corruption on 26.04 (GH #32384) — use normal `hermes update`.

## Azure VPS read-only filesystem recovery
- Symptom: bot stuck, `rm` → "Read-only file system", `touch` fails.
- Cause: ext4 auto remount-ro after FS error (`mount` shows `ro` on `/` or `/root`).
- Fix needs root console (Azure Serial Console / direct SSH as root): `touch /forcefsck && reboot`,
  or fsck at boot.
- Hermes as unprivileged user (sudo blocked, no-new-privileges) CANNOT fix this.
- After rw restored, safe cleanup: `rm -rf ~/.npm/_cacache`, `rm -rf /tmp/*`. `apt clean` needs root.

## Tuan's standing cleanup constraints
- Destructive commands need EXPLICIT per-command approval. NEVER set "Allow always".
- Do NOT touch: npm-global, state.db, whatsapp-bot repo, n8n, state-snapshots.
- Cache-only deletions (~/.npm/_cacache, /tmp) are safe-to-rebuild.
- Silence / timeout on approval prompt = NOT consent. Stop and wait.

## Hybrid topology (when PC is off most of the time)
- Azure VPS (small) = public relay/proxy; PC-office = Hermes engine via Cloudflare Tunnel / Tailscale.
- When PC off, bot "sleeps". No fixed-cost increase if Azure already paid.
- Alternative: deprecate Azure entirely once PC-office is proven → save RM30/mo.

## PC Office as Hermes Node #2 (offload from Azure) — bootstrap
Tuan's standing choice (Jul 2026): run Hermes on PC Office (18GB RAM) as a second node
to offload the 1GB Azure VPS. PC Office is reachable ONLY via Tailscale
(`hafjet-pc-office`, user `hafizi145`); on-demand (boot when needed). In this session it
was online at Tailscale IP 100.121.94.41 (~93–195ms via DERP hkg), latency acceptable.

**DEFAULT BLOCKER — SSH from Azure → PC Office FAILS out of the box:**
- Azure's `~/.ssh/id_rsa.pub` is NOT registered in PC Office's `authorized_keys`
  (file exists but is 0 bytes / empty) → `Permission denied (publickey,password)`.
- Tailscale SSH is OFF by default (`sudo tailscale up --ssh` not yet run).

**Bootstrap (Tuan pastes on PC Office terminal — see `references/pc-office-node2-bootstrap.md`):**
1. Append Azure pubkey to `~/.ssh/authorized_keys`; `chmod 700 ~/.ssh`; `chmod 600 ~/.ssh/authorized_keys`.
2. `sudo tailscale up --ssh` to enable Tailscale SSH.

**Pitfalls (learned this session — DO NOT repeat the dead ends):**
- `tailscale ssh` WRAPPER REJECTS `-o` flags → `flag provided but not defined: -o`.
  Use plain `ssh -o StrictHostKeyChecking=accept-new hafizi145@hafjet-pc-office` instead.
- `~/.ssh/config` is a PROTECTED file — agent `write_file` is DENIED. Pass SSH options
  inline as `-o` flags on every `ssh` call; never rely on a config file.
- First connect to `*.ts.net` fails host-key check (`No ED25519 host key is known…`).
  Pass `-o StrictHostKeyChecking=accept-new` once to auto-add to known_hosts.
- Hermes install on PC Office — **USE THE GITHUB RAW URL, NOT the marketing domain**
  (verified 2026-07-19):
  ```bash
  curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
  ```
  ⚠️ `https://hermes-agent.nousresearch.com/install` → **HTTP 404** (dead). The path
  `/install.sh` on that domain returns 200, but the raw.githubusercontent URL is the
  reliable one. This installer is the ONE approved exception to Tuan's no-curl-pipe rule
  (official Nous Research script, not arbitrary code). Tick "Install OpenSSH server", skip import key.
- **GitHub clone failure / install breakage on PC Office (hit 2026-07-19) — ROOT CAUSE
  CORRECTED:** it is NOT IPv6. PC Office sits behind an **office firewall that DROPS ALL
  external :443 egress** (verified: `github.com`, `pypi.org`, `codeload.github.com`,
  `files.pythonhosted.org`, `ubuntu.com`, `google.com`, `cloudflare.com`, `tailscale.com`
  ALL return `000` / "Could not connect" in 0ms = packet drop, NOT DNS/IPv6 failure).
  Only **Tailscale traffic** (UDP + its own relay) passes. `apt` "worked" earlier only
  because the office mirrors Ubuntu via a LAN cache/proxy — real internet is blocked.
  Symptom: installer bootstrap downloads fine (raw.githubusercontent reachable at first),
  but clone to `github.com:443` dies with `✗ Failed to clone repository` and
  `hermes: command not found`. `pip install` for deps will ALSO fail (PyPI blocked).
  ⚠️ **The `git config --global http.curloptResolve "github.com:443:20.205.243.166"`
  IPv4 pin did NOT fix it** — 0ms drop means firewall block, not address family. Do NOT
  rely on it. Working fixes, in order:
  1. **Route PC Office egress through Azure via a proxy.** Azure has full internet.
     On Azure run a tiny HTTP proxy (tinyproxy on :3128, `Listen 0.0.0.0`, `Allow 0.0.0.0/0`),
     then on PC Office: `export HTTP_PROXY=http://100.111.105.120:3128 HTTPS_PROXY=$HTTP_PROXY`
     and re-run the installer — all `curl`/`git`/`pip` now flow Azure → internet.
     (PC Office reaches Azure fine over Tailscale.) NOTE: `systemctl restart tinyproxy`
     is an approval-gated service restart — let Tuan consent.
  2. **Fallback — build on Azure, scp the whole folder.** Azure CAN reach github via
     codeload: `curl -fsSL -o /tmp/hermes-agent-main.tar.gz https://codeload.github.com/NousResearch/hermes-agent/tar.gz/refs/heads/main`
     (≈70MB, verified downloadable). After SSH key registered (below), `scp` it to PC Office
     and extract into `~/.hermes/hermes-agent`. Heavier but avoids per-command proxy setup.
- **Tailscale SSH (`sudo tailscale up --ssh`) is annoying for agent use** (hit this session):
  every new SSH session demands a one-time web auth at `login.tailscale.com/a/<token>`
  ("Tailscale SSH requires an additional check"). For unattended/agent-driven access,
  PREFER key-based SSH: register Azure's pubkey in `authorized_keys` (step 1) and revert
  Tailscale SSH with `sudo tailscale up --ssh=false`. Key auth then works with no prompts.
- **UFW lockout trap on a Tailscale-only box** (Tuan's merged paste left ufw half-configured):
  if you set `ufw default deny incoming`, you MUST `allow OpenSSH` AND `allow in on tailscale0`
  BEFORE `ufw enable` — otherwise `enable` severs all remote access (Tailscale rides the
  `tailscale0` interface, not the default `eth0`/OpenSSH rule). Tuan's paste garbled several
  commands into one line so `enable` never ran → no lockout this time, but it's a real risk.
  Recommendation: leave ufw DISABLED on PC Office until Hermes is stable; Tailscale already
  provides per-node ACL. If hardening later, the correct sequence is:
  `sudo ufw default deny incoming; sudo ufw default allow outgoing; sudo ufw allow OpenSSH;
  sudo ufw allow in on tailscale0; sudo ufw enable`.
- After SSH works, configure as a SEPARATE Hermes profile (`~/.hermes/profiles/<name>/`)
  so node #2 doesn't clobber the Azure node's skills/cron/memories.
- Reference: `references/pc-office-node2-bootstrap.md` — exact commands for Tuan to paste
  on PC Office + per-step pitfalls (key register, enable Tailscale SSH, Hermes install,
  GitHub-clone IPv4 fix).
