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
  - PC-office (confirmed Jul 2026): Intel i3, 18GB RAM, 512GB SSD — **Linux partition is only
    100GB (~400GB unallocated, not yet grown)**; 320GB HDD (NTFS, holds office documents,
    NEVER format). On-demand boot keeps electricity ~RM5-15/mo. If PC Office needs more space
    (Docker images, AI models, backups), grow `/` into the unallocated space — disk op, do it
    when PC is off / carefully; 100GB is enough for Hermes + base tools for now.
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

## PC Office Python ML venv recipe (torch / transformers / HF)
PC Office ships **Python 3.14 system-wide ONLY**; it is PEP 668 externally-managed and has NO `python3-venv` package. Naive venv creation FAILS:
- ❌ `python3 -m venv ~/x` → "ensurepip is not available … apt install python3.14-venv" (package absent, sudo blocked).
- ❌ `python3 -m pip install --user uv` → "error: externally-managed-environment" (PEP 668 blocks even user pip).
- ✅ **WORKING recipe** (install `uv` as the single `--break-system-packages` tool, then `uv` manages a standalone Python + venv):
  ```bash
  python3 -m pip install --user --break-system-packages uv
  export PATH="$HOME/.local/bin:$PATH"
  uv python install 3.11          # 3.11 has torch CPU wheels; 3.14 often lacks them
  rm -rf ~/tts_venv               # uv venv REFUSES to overwrite an existing dir → clear first
  uv venv --python 3.11 ~/tts_venv
  VENV_PY="$HOME/tts_venv/bin/python"
  uv pip install --python "$VENV_PY" torch --index-url https://download.pytorch.org/whl/cpu
  uv pip install --python "$VENV_PY" "transformers" "huggingface_hub[cli]" soundfile tqdm
  ```
- PC Office has **NO GPU** (Intel iGPU only) → CPU inference only. A 0.6B model on CPU does ~10–30s per short sentence; not realtime for concurrent users.
- **`uv venv` has NO `pip` module.** After `uv venv`, `python -m pip` fails with `No module named pip` and `which pip` may resolve to system 3.14 pip (PEP 668). ALWAYS install deps with `uv pip install --python "$VENV_PY" <pkgs>` — never `python -m pip install`. (Hit & debugged 2026-07-20.)
- **`hf download` include-flag quirk:** `hf download REPO file1 --include file2` triggers `UserWarning: Ignoring --include since filenames have been explicitly set` — the `--include` is silently dropped. To grab specific files pass them ALL as positional args: `hf download REPO fileA fileB --local-dir DIR`. Also: the `hf` CLI is **NOT installed on PC Office** (only on the Azure gateway). On PC Office use the Python API instead: `python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id=..., filename=..., local_dir=...)"` (run inside the venv). (Hit 2026-07-20: `model_config.json` was missed by a bad `--include`, recovered via Python API.)
- **DistilCodec has an UNDECLARED dependency chain — install them ALL up front, don't debug one-by-one.** Each import is top-level (no conditional), so `from distilcodec import DistilCodec` fails repeatedly until every dep is present. The full set (in order hit 2026-07-20): `librosa` → `matplotlib` → `wandb` → `tensorboard` → `torchaudio`. Install in one shot (slow — run in background with notify):
  ```bash
  uv pip install --python "$VENV_PY" librosa matplotlib wandb tensorboard
  # torchaudio MUST come from the CPU index on PC Office (see pitfall below):
  uv pip install --python "$VENV_PY" --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu
  ```
  `librosa` alone pulls numba/llvmlite/scikit-learn and takes ~3 min to resolve — never run it foreground (180s timeout). (Hit & debugged 2026-07-20: 7 sequential ModuleNotFoundErrors before clean import.)
- **🔴 torchaudio CPU pitfall (GPU-less box):** Plain `uv pip install torchaudio` pulls the **CUDA build**, which at runtime fails with `OSError: libcudart.so.13: cannot open shared object file` (PC Office has Intel iGPU only, no CUDA). Fix = reinstall from the CPU wheel index: `uv pip install --python "$VENV_PY" --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu`. Always pair torchaudio's index with the torch CPU index you already used. (Hit & debugged 2026-07-20.)
- **DistilCodec `from_pretrained` signature** (per mesolitica README, NOT the standard HF pattern):
  ```python
  codec = DistilCodec.from_pretrained(config_path=".../DistilCodec-v1.0/model_config.json",
                                      model_path=".../DistilCodec-v1.0/g_00204000",
                                      use_generator=True, is_debug=False).eval()
  ```
  The codec weights live at `IDEA-Emdoor/DistilCodec-v1.0` as `g_00204000` (1.6 GB) + `model_config.json` — separate repo from the TTS model. Both must be downloaded.
- **Malaysian-TTS-0.6B-v1 working pipeline (Qwen3 LM → DistilCodec decode → 24 kHz MP3):** model is NOT a standard TTS; it's a Qwen3 causal LM that generates `speech_NNN` tokens, then DistilCodec detokenizes to audio. Confirmed generating valid MP3s on PC Office CPU (idayu + husein speakers). Full tested `test_tts.py` + install/download scripts are in `references/pc-office-python-ml-venv.md`. Key gotchas: (a) text MUST be **normalized** (`123` → `one two three`) or output is garbled; (b) prompt format `<s>speaker: text<|speech_start|>`; (c) **license = None on the HF card** — NOT verified for commercial use; Tuan approved **personal-use only** this session. Do NOT wire into the customer-facing WhatsApp bot until license is confirmed.
- **SCP-to-PC-Office approval trap:** every `scp`/`ssh` to the Tailscale IP `100.121.94.41` triggers a MEDIUM security-scan approval ("raw IP"). It auto-blocks on timeout if Tuan doesn't click approve promptly. Batch the work and ask Tuan to approve fast, or have Tuan run the file copy himself.
- See `references/pc-office-node2-bootstrap.md` for the full tested install/download/run scripts + mesolitica Qwen3-TTS (Malaysian-TTS) specifics (DistilCodec dependency, Xet storage needs `hf download` not `curl`, normalized-text requirement, license caveat).
- See `references/remote-daemon-deploy-jarvis.md` for the full JARVIS brain+sidecar recipe (JWT auth, brain_domain for remote sidecars, Gemini free-tier, Windows sidecar) and the remote-ops pitfalls (`write_file`≠SSH, `cat|ssh` not `scp`, no `===`/heredoc-in-ssh). Helper `templates/jarvis-token.sh` mints the access token and prints a ready dashboard URL.

## Adding a new logical volume for data storage (e.g., CCTV) on PC Office

When you need additional storage for data such as CCTV footage, AI model files, or backups on the PC Office, and you have free space in the volume group (VG), you can create a new logical volume (LV) without affecting the existing system.

### Prerequisites
- You have confirmed free space in the VG (run `sudo vgdisplay` and look for "Free PE / Size").
- You have chosen a name for the new LV (e.g., `cctv-lv`).
- You have decided on a mount point (e.g., `/mnt/cctv`).

### Steps

1. **Create the logical volume** using all free space (or specify a size with `-L`):
   ```bash
   sudo lvcreate -n <lv-name> -l 100%FREE <vg-name>
   ```
   Example: `sudo lvcreate -n cctv-lv -l 100%FREE ubuntu-vg`

2. **Format the LV** with a filesystem (ext4 is a good general-purpose choice):
   ```bash
   sudo mkfs.ext4 -L <LABEL> /dev/<vg-name>/<lv-name>
   ```
   Example: `sudo mkfs.ext4 -L CCTV_SSD /dev/ubuntu-vg/cctv-lv`

3. **Create a mount point**:
   ```bash
   sudo mkdir -p <mount-point>
   ```
   Example: `sudo mkdir -p /mnt/cctv`

4. **Get the UUID of the new filesystem** for use in `/etc/fstab`:
   ```bash
   blkid /dev/<vg-name>/<lv-name>
   ```
   Copy the UUID value (e.g., `UUID="..."}`).

5. **Add an entry to `/etc/fstab`** for automatic mounting at boot:
   - Open the file with `sudo nano /etc/fstab`
   - Add a line in the format:
     ```
     UUID=<your-uuid>  <mount-point>  ext4  defaults,noatime  0  2
     ```
   - Example: `UUID=da1cce88-4123-4b31-96ef-f2aa0aa1f18c  /mnt/cctv  ext4  defaults,noatime  0  2`
   - Save and exit.

6. **Mount the volume** (either reboot or run `sudo mount -a`):
   ```bash
   sudo mount -a
   ```

7. **Verify the mount**:
   ```bash
   df -hT | grep <mount-point>
   ```
   You should see the new filesystem listed with its size.

8. **Set appropriate ownership** so your user can write to it without sudo:
   ```bash
   sudo chown -R $USER:$USER <mount-point>
   # Optional: set group write access if multiple users need it
   # sudo chgrp -R <group> <mount-point>
   # sudo chmod -R 775 <mount-point>
   ```

9. **Create a directory structure** for your project (optional but recommended):
   ```bash
   mkdir -p <mount-point>/{raw,annotated,models,logs,backup}
   ```

### Notes
- Always verify the device name (`/dev/<vg-name>/<lv-name>`) before running `mkfs` or `lvremove` to avoid data loss.
- If you prefer to keep the system partition separate from data, this pattern is ideal. You can also extend an existing LV (like the root LV) using `lvextend` and `resize2fs`, but creating a separate LV for data is safer and more flexible.
- The steps above assume you are using ext4. For other filesystems (like xfs), adjust the `mkfs` command and fstab type accordingly.

## Azure VPS read-only filesystem recovery
- Symptom: bot stuck, `rm` → "Read-only file system", `touch` fails.
- Cause: ext4 auto remount-ro after FS error (`mount` shows `ro` on `/` or `/root`).
- Fix needs root console (Azure Serial Console / direct SSH as root): `touch /forcefsck && reboot`, or fsck at boot.
- Hermes as unprivileged user (sudo blocked, no-new-privileges) CANNOT fix this.
- After rw restored, safe cleanup: `rm -rf ~/.npm/_cacache`, `rm -rf /tmp/*`. `apt clean` needs root.
- After rw restored, safe cleanup: `rm -rf ~/.npm/_cacache`, `rm -rf /tmp/*`. `apt clean` needs root.

## Deploying a remote always-on daemon on PC Office (JARVIS case study, 2026-07-24)
Standing up a third-party daemon (e.g. JARVIS — github.com/vierisid/jarvis, an autonomous
AI assistant) on `hafjet-pc-office` over SSH from the Azure gateway. Full recipe, JWT auth
model, `brain_domain` for remote sidecars, and the remote-ops pitfalls below are in
`references/remote-daemon-deploy-jarvis.md`. A ready `jarvis-token.sh` helper (mints the
JWT-only access token and prints a working `?token=` dashboard URL) is in `templates/`.

**Remote-ops pitfalls that burned time this session (DO NOT repeat):**
- `write_file` writes to the AGENT's LOCAL FS (Azure), NOT the SSH target. To push a file
  to PC Office, use `cat localfile | ssh hafjet-pc-office 'cat > ~/remotefile'`.
- `scp` of a single file SILENTLY FAILED here; the `cat | ssh` pipe worked. Prefer the pipe.
- `echo === text ===` breaks bash (parsed as `test`). Never use `===` in echoed headers.
- `<<PY` heredocs INSIDE `ssh -c '...'` fail with "unexpected EOF". Write the script to a
  local file, pipe it over (`cat file | ssh 'cat > file'`), then run it remotely.
- `execute_code` (Hermes tool) is BLOCKED for SSH/remote subprocess — use the `terminal` tool.
- JARVIS-specific: it is **JWT-only**, no shared dashboard password. `auth.insecure_open_access`
  is a setup-only escape hatch (remove immediately). For remote laptop sidecars, set
  `daemon.brain_domain: 100.121.94.41:3142` (Tailscale IP, NOT localhost) and RE-ENROLL —
  old tokens keep the localhost origin and fail WS connect. Gemini free-tier key works as the
  LLM provider (OpenCode Go does NOT).

## Server Backup to GitHub (Push Protection aware)

Backing up Hermes config/skills/cron → GitHub `2024866732/syncera-ai-wasap` branch `feat/hafjet-azure-whatsapp-bot`.  
Script: `~/syncera-ai-wasap/scripts/backup-server.sh`. Daily cron: `315e1bdcd7fc` @ 14:00 UTC.

**Push Protection scans ALL history**, not just HEAD. OpenRouter keys (`sk-or-…`), PATs (`ghp_`/`gho_`), Cerebras (`csk-…`) all trigger `GH013`.

### Mandatory pipeline (order matters)

1. `cp` live files into `server-backup/` — **never mutate** live `~/.hermes/config.yaml`
2. **Python redact** every `api_key:` value + known prefixes across the backup tree (`sed`-only failed 2026-08)
3. Delete secret files: `.env`, `auth.json`, `*.key`, `*.pem`, `hosts.yml`, `credentials`
4. **Abort gate** before commit: grep must find zero live `sk-or-` strings (exit 2 if any)
5. `git add` + commit + normal push; force push only after `filter-repo` recovery

Include: redacted config, SOUL.md, skills/, memories/, cron/, scripts/.  
Exclude: secrets, `state.db`, venv/node_modules.

Full patterns + GH013 recovery playbook: `references/server-backup-push-protection.md`.

### Recovering from blocked push (GH013)

```bash
unset GITHUB_TOKEN GH_TOKEN   # invalid env token overrides good gh hosts.yml
printf 'regex:api_key: sk-or-[a-zA-Z0-9_-]{20,}==>api_key: [REDACTED]\n' > /tmp/filter.txt
printf 'regex:[REDACTED_OPENROUTER][A-Za-z0-9_-]+==>[REDACTED_OPENROUTER]\n' >> /tmp/filter.txt
cd ~/syncera-ai-wasap
rm -f .git/filter-repo/already_ran
echo "Y" | git filter-repo --replace-text /tmp/filter.txt --force
git remote add origin https://github.com/2024866732/syncera-ai-wasap.git  # filter-repo drops origin
git push -u origin feat/hafjet-azure-whatsapp-bot --force                 # needs Tuan approval
bash scripts/backup-server.sh   # script must already have redact + abort gate
```

### Pitfalls (2026-07 → 2026-08)

| Pitfall | Rule |
|---------|------|
| Tool output shows `sk-or-...74f7` | Hermes **display-redacts** secrets. File may still hold full key — never trust visual truncation as proof of redact |
| `sed` only on `api_key:` | Still got GH013 on OpenRouter line. Prefer **Python `re.sub`** + abort grep |
| `git reset --hard` after editing `backup-server.sh` | Restores **old script from HEAD**, wiping the redact fix. Order: reset bad commit → rewrite script → run. Prefer `git reset --soft HEAD~1` for local-only bad commits |
| `git commit --amend` alone | Insufficient — entire history is scanned |
| `git filter-repo` | Drops `origin`, rewrites SHAs, needs force push; continuation prompt needs `echo Y \|` or delete `.git/filter-repo/already_ran` |
| Force-push approval timeout | Silence ≠ consent. Stop; ask Tuan to approve or run push himself |
| Invalid `GITHUB_TOKEN` env | Overrides valid `gh` hosts.yml (`Active account: true` on the broken env). `unset GITHUB_TOKEN` before push; PAT scopes for backup: `repo` + `workflow` + `read:org` (+ optional `gist`) |
| Improved script not committed | Cron reuses repo script — commit `scripts/backup-server.sh` in the same successful backup push |

### Git identity (cosmetic)
```bash
git config --global user.name "HAFJET-Hermes"
git config --global user.email "hermes@hafjet.com.my"
```

## Tuan's standing cleanup constraints
- **Reversibility first:** Before ANY infrastructure change, backup everything and push to GitHub. User explicitly said "backup dulu semua, lepas habis trial saya nak kembali ke asal semula" — always create a restore path before deploying.
- Destructive commands need EXPLICIT per-command approval. NEVER set "Allow always".
- Do NOT touch: npm-global, state.db, whatsapp-bot repo, n8n, state-snapshots.
- Cache-only deletions (~/.npm/_cacache, /tmp) are safe-to-rebuild.
- Silence / timeout on approval prompt = NOT consent. Stop and wait.

## Operating-manual change control

When a HAFJET operating manual is designated as the primary reference, treat it as a living **verified-state** document:

1. Draft a unified diff first; do not alter the manual until Tuan explicitly approves that exact diff.
2. Base each replacement line on fresh tool evidence, not an earlier plan or an in-progress status. If requested wording becomes stale during execution, preserve it as a dated/historical checkpoint and state the later verified result as the current status.
3. Keep unfinished controls visibly separate from verified work (for example: pending permission hardening, uncreated worker directories, unmounted backup storage, and unapproved listener changes).
4. After applying an approved diff, re-read the changed section and deliver the updated document. The newest explicit instruction from Tuan still overrides the manual.

## n8n + Cloudflare Named Tunnel + Telegram Webhook (Aug 2026)

Production-ready setup for HAFJET Content Automation workflow with stable hostname.

### Architecture
- **n8n**: Docker Compose on HAFJET-Hermes-Server (Azure VPS), port 5678
- **Cloudflare Named Tunnel**: `hafjet-n8n` → `https://n8n.hafjet.my`
- **Cloudflare Zero Trust Free**: 0/50 seats, $0/month
- **Telegram Bot**: Webhook at `https://n8n.hafjet.my/webhook/<JOB_ID>/webhook`
- **Workflow**: `HAFJET Content Automation` (17 nodes, active)

### Key Configurations

**n8n .env & docker-compose.yml (must align):**
```env
WEBHOOK_URL=https://n8n.hafjet.my
N8N_HOST=n8n.hafjet.my
N8N_PROTOCOL=https
N8N_PROXY_HOPS=1
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=hafizi145
N8N_BASIC_AUTH_PASSWORD=***
N8N_OWNER_EMAIL=hafizi145@gmail.com
TZ=Asia/Kuala_Lumpur
```

**Cloudflare Tunnel systemd service (/etc/systemd/system/cloudflared.service):**
```ini
[Unit]
Description=Cloudflare Tunnel - hafjet-n8n
After=network.target

[Service]
Type=simple
User=hafizi145
ExecStart=/usr/local/bin/cloudflared tunnel run --token <TOKEN>
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**DNS at Cloudflare (Full setup):**
- Type: CNAME (auto-created by Tunnel as "Tunnel" type)
- Name: `n8n`
- Target: `<TUNNEL_ID>.cfargotunnel.com`
- Proxy: Proxied (orange cloud)

**Split Tunnels (Device Profile → WARP Client):**
- **Remove** `100.64.0.0/10` from Exclude list (CGNAT range required for Tunnel)
- Keep `192.168.0.0/16` and `10.0.0.0/8` in Exclude (local LAN)
- **Local Domain Fallback**: Ensure `n8n.hafjet.my` and `hafjet.my` NOT in list

### Telegram Webhook Migration (Critical Steps)

1. **Update n8n config** → WEBHOOK_URL to new domain
2. **Deactivate → Activate** workflow "HAFJET Content Automation" (triggers auto-register)
3. **Verify** with `getWebhookInfo`:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   ```
   - `url` must be `https://n8n.hafjet.my/...`
   - `last_error_date` / `last_error_message` = empty
   - `allowed_updates` includes `callback_query` (and `message` if using Telegram Trigger)

### Workflow "HAFJET Content Automation" (17 nodes)

| Node | Type | Purpose |
|------|------|---------|
| Send Draft to Telegram | telegram | Deliver draft + 10-button inline keyboard |
| Telegram Callback Trigger | telegramTrigger | **Main inbound** (Restrict Chat ID: 1485374469) |
| Answer Callback Query | telegram | Acknowledge button press |
| Switch | switch | Route 8 callback actions |
| Edit - Approved / Publish Success / Ask Revise / Regenerate Captions/Visual/Both / Ask New Schedule / Reject / Ask Manual Instruction | telegram | Response branches |

**Inline Keyboard (10 buttons):** Approve Option 1/2, Revise, New Captions, New Visual, New Both, Change Schedule, Reject, Manual Instruction

### Content generation endpoints (updated Phase 1 — Aug 2026)

| Path | Port | When to use |
|------|------|-------------|
| **HAFJET Content API** (proven Phase 1) | **`:9119`** | Default for n8n Generate node. systemd `hafjet-content-api`, OpenRouter backend |
| Hermes gateway | `:8787` | Only if `gateway.api_key` set + cron job exists for `/api/cron/fire` |
| xAI REST | api.x.ai | Optional direct LLM; not wired as default n8n path |

**n8n Generate (Phase 1):**
```
POST http://host.docker.internal:9119/api/generate
Headers: X-API-Key: {{ $env.CONTENT_API_TOKEN }}, Content-Type: application/json
```
Requires compose `extra_hosts: host.docker.internal:host-gateway` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.

**Ops bible:** `references/hafjet-content-phase1-ops.md` lives under skill `automation-workflow-dev`.  
Also see local path: `~/.n8n/content-api/`.

**n8n 2.8 activate:** need `workflow_published_version` + matching `workflow_history` + `activeVersionId` — not just `active=1`.  
**Pause schedule without killing callbacks:** disable Schedule Trigger node only; keep workflow active.

### Testing Checklist
- [ ] `curl -I https://n8n.hafjet.my` → HTTP/2 200
- [ ] `curl -s http://127.0.0.1:9119/health` → content-api ok
- [ ] From n8n container: fetch `host.docker.internal:9119/health` OK
- [ ] `systemctl --user status hafjet-content-api` → active
- [ ] `systemctl status cloudflared` → active
- [ ] Manual Trigger → draft + inline keyboard in Telegram 1485374469
- [ ] Approve → Publish Checklist only (no example.com / no Meta publish)
- [ ] Schedule node stays disabled until CTO UI sign-off

### Pitfalls & Fixes

| Issue | Fix |
|-------|-----|
| Generate ENOTFOUND `host.docker.internal` | Add `extra_hosts: host-gateway`; recreate with `~/.local/bin/docker-compose` |
| `$env.CONTENT_API_TOKEN` empty in node | `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` + pass token in compose env |
| `:9119` connection refused | Start/enable `hafjet-content-api` user service |
| active=1 but logs "0 published workflows" | Insert published_version + history for versionId; restart n8n |
| Webhook still trycloudflare.com | Deactivate → Activate; wait 5s |
| Telegram message not sent | Credential on every TG node; Chat ID 1485374469 |

## UpCloud Trial Deployment (Aug 2026)

Tuan signed up for UpCloud 14-day $250 trial. Key learnings:

### API Authentication
- UpCloud now uses **Bearer token** auth (not username/password).
- Token prefix: `ucat_...` — create in Hub → Profile → API Credentials.
- Python SDK: `CloudManager(token='ucat_...')` — NOT `CloudManager(username, password)`.
- REST: `Authorization: Bearer <token>` header.

### Server Creation via SDK
```python
from upcloud_api import CloudManager, Server, Storage, login_user_block
cm = CloudManager(token='ucat_...')
server = Server(
    zone='de-fra1',  # try multiple zones if one is full
    title='HAFJET',
    hostname='hafjet-trial',
    plan='2xCPU-4GB',
    storage_devices=[Storage(action='clone', storage=UBUNTU_UUID, size=80)],
    login_user=login_user_block(username='ubuntu', create_password=False, ssh_keys=[pub_key]),
    metadata=True  # REQUIRED when cloning cloud-init templates
)
created = cm.create_server(server)
```

### Zone Capacity Issues (CRITICAL)
- Singapore (`sg-sin1`) frequently at capacity for trial accounts — `SERVER_RESOURCES_UNAVAILABLE`.
- **Multi-zone fallback**: try `de-fra1` → `uk-lon1` → `nl-ams1` → `us-nyc1` → `au-syd1`.
- Frankfurt (`de-fra1`) had best disk I/O: 19.7 GB/s sequential read.
- Trial quota: 8 cores, 16GB RAM, 1024GB storage, 5 servers — NOT "1 server at a time".

### SSH Session Overload
- Too many concurrent SSH sessions + Ollama inference can lock out SSH.
- Fix: hard restart via API (`stop_type: "hard"`) then wait 60s before reconnecting.
- Always kill stale SSH connections before retrying: `pkill -f "ssh.*<IP>"`.

### Ollama on 3.8GB RAM Server
- `llama3.2:3b` (2GB) + services = OOM kill on 3.8GB with no swap.
- **Fix**: stop non-essential services before running LLM:
  ```bash
  docker stop hafjet-stack-n8n-1
  cd /opt/monitoring && docker compose stop grafana cadvisor
  ```
- This frees ~500MB → LLM runs at 30 tok/s CPU-only.
- Configure Ollama: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_CONTEXT_LENGTH=2048`.

### Docker Compose v2 on Ubuntu 26.04
- `docker compose` (v2 plugin) not installed by default on fresh Ubuntu 26.04.
- Install: `sudo apt-get install -y docker-compose-v2`.
- Fallback: `sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose`.

### Backup Before Trial End
- Created GitHub private repo `2024866732/hafjet-backups` with full system backup.
- Local backup: `~/backups/pre-upcloud-trial/` with `RESTORE.sh`.
- Includes: Hermes config, bot code, Azure settings, upcloud-trial scripts.

## AWS Free Tier Deployment (Aug 2026)

After UpCloud account suspension, migrated HAFJET projects to AWS Free Tier.
Full deployment guide + RAM constraints: `references/aws-free-tier-deployment.md`

Key lesson: t3.micro (911MB) cannot run 6 PostgreSQL + 6 APIs simultaneously.
Either use 1 shared database or upgrade to t3.small (2GB).

## Oracle Cloud Deployment (Aug 2026)

Tuan signed up for Oracle Cloud, initially Free Tier then upgraded to Pay As You Go.

### ARM Capacity Issues (CRITICAL)
- Region `ap-kulai-2` (Malaysia) has SEVERE ARM capacity constraints.
- Even with Pay As You Go, `VM.Standard.A1.Flex` may return "Out of host capacity".
- Free Trial accounts also hit "LimitExceeded" for ARM shapes until upgraded.
- **Workaround**: Try off-peak hours, or use `ap-mumbai-1` (requires tenancy subscription to that region).
- If capacity unavailable, fallback to Hetzner CX22 (€4.5/mo, 2C/4GB) or AWS t3.small.

### OCI CLI Multi-Region
- API keys are tenancy-wide, NOT region-specific.
- To use different region: add profile to `~/.oci/config` with `region=ap-mumbai-1`.
- BUT: tenancy must be subscribed to that region first (check via Console).
- Cross-region auth works if key is valid, but `--region` flag alone doesn't override config profile.

### VM Creation Command
```bash
oci compute instance launch \
  --compartment-id $TENANCY \
  --availability-domain "$AD" \
  --display-name "hafjet-oracle" \
  --shape "VM.Standard.A1.Flex" \
  --shape-config '{"ocpus": 4, "memoryInGBs": 24}' \
  --image-id $IMAGE \
  --ssh-authorized-keys-file /tmp/hafjet-oracle-key.pub \
  --assign-public-ip true \
  --subnet-id $SUBNET \
  --query "data.{id:id,state:\"lifecycle-state\"}" \
  --output table
```

### SSH Key for Oracle
- Generate: `ssh-keygen -t ed25519 -f /tmp/hafjet-oracle-key -N ""`
- Public key passed via `--ssh-authorized-keys-file` during instance creation.
- Key saved at `/tmp/hafjet-oracle-key` (private) and `/tmp/hafjet-oracle-key.pub`.

### Serial Console Recovery When Public SSH Times Out
- Diagnose transport before changing credentials: `ssh: connect ... port 22: Connection timed out` means traffic is not reaching `sshd`; changing/re-sending the SSH key cannot fix it. `Permission denied (publickey)` means transport works but the key is not authorized.
- OCI CLI can create an emergency serial-console connection without normal SSH:
  ```bash
  oci compute instance-console-connection create \
    --instance-id "$INSTANCE_OCID" \
    --ssh-public-key-file /secure/path/console-key.pub \
    --wait-for-state ACTIVE
  ```
- **OCI instance console connections reject `ssh-ed25519` public keys** (`Invalid ssh public key type "ssh-ed25519"`). Generate a dedicated temporary RSA key for console recovery:
  ```bash
  ssh-keygen -t rsa -b 4096 -N '' -f /secure/path/oracle-console-recovery
  ```
- The create response includes `connection-string`; use that exact command, adding the recovery key using `-i` to both the outer SSH and the SSH command inside `ProxyCommand`.
- Treat a serial-console key as short-lived. Deliver it only via an approved secure channel; after normal SSH is restored, delete the OCI console connection and recovery key. Any private key pasted into chat must be rotated.

### Oracle ARM VM Specs (Confirmed Aug 2026)
| Resource | Value |
|----------|-------|
| Shape | VM.Standard.A1.Flex |
| CPU | 4 cores ARM (Neoverse-N1) |
| RAM | 24GB |
| Storage | 45GB boot volume |
| IP | Public IP assigned at launch |
| Cost | **SGD 0.00** (Always Free) |

### Docker Permission Fix (Fresh Ubuntu on Oracle)
```bash
# Use sudo for all docker commands until user is added to docker group
sudo docker compose up -d

# Or add user permanently (requires re-login)
sudo usermod -aG docker ubuntu
```

### Ollama on Oracle ARM
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Configure to listen on all interfaces (for Docker containers)
sudo sed -i '/Environment="PATH=/a Environment="OLLAMA_HOST=0.0.0.0"' /etc/systemd/system/ollama.service
sudo systemctl daemon-reload && sudo systemctl restart ollama

# Verify: ss -tlnp | grep 11434 → should show *:11434
```

### Budget Protection (Oracle Pay As You Go)
```bash
# Create $10/month budget
oci budgets budget budget create --compartment-id $TENANCY \
  --display-name "HAFJET-FreeTier" --amount 10 \
  --target-type "COMPARTMENT" --targets "[\"$TENANCY\"]" \
  --reset-period "MONTHLY"

# Create 80% alert rule
oci budgets budget alert-rule create --budget-id $BUDGET_ID \
  --display-name "80-Alert" --threshold 80 \
  --threshold-type "PERCENTAGE" --type "ACTUAL"
```

### Hybrid Azure + Oracle Architecture (Aug 2026)

Tuan chose **Option 2: Hybrid** — Azure as WhatsApp channel layer, Oracle as AI engine.

**Architecture:**
```
Customer WhatsApp → Azure Bot Service → Oracle VM (AI) → Response
```

**Azure Bot URLs:**
- Bot: `https://hafjet-whatsapp-bot.azurewebsites.net`
- Dashboard: `https://hafjet-whatsapp-bot.azurewebsites.net/dashboard`

**API Contract (Azure ↔ Oracle):**
- Endpoint: `POST /api/ai/chat`
- Request: `{phone, message_text, context_id, timestamp}`
- Response: `{reply_text, suggested_actions, confidence, model, latency_ms}`

**Full reference**: `references/whatsapp-ai-bot-oracle-deployment.md` (Hybrid Architecture section)

### WhatsApp AI Bot Deployment on Oracle ARM (Aug 2026)

**Full reference**: `references/whatsapp-ai-bot-oracle-deployment.md`

```bash
# Clone repos
cd ~ && git clone https://github.com/2024866732/Sistem-Wasap-Hafjet.git
git init HAFJET-AI-WhatsApp-Bot

# Deploy with Docker Compose (network_mode: host for Ollama access)
cd ~/HAFJET-AI-WhatsApp-Bot
sudo docker compose up -d

# Test: curl http://localhost:8200/api/health
```

**Key lessons:**
- Use `network_mode: host` for API container to reach Ollama at `localhost:11434`
- Port must be set in BOTH Dockerfile AND main.py (port mappings ignored with host mode)
- Ollama must listen on `0.0.0.0` (not just `127.0.0.1`) for container access
- `.env` file must be in project root and referenced via `env_file:` in docker-compose.yml

### Oracle SRE: Docker `unhealthy` + 4GB swap (2026-08-12)

**Playbooks:** `references/oracle-sre-healthcheck-swap-2026-08.md` · `references/oracle-a1-python-slim-healthcheck-swap.md` (short checklist)

Live box (re-verify before act): `hafjet-oracle` · TS `100.124.99.52` · public `149.118.152.50` · SSH `-i /tmp/hafjet-oracle-key ubuntu@…` · `~/HAFJET-AI-WhatsApp-Bot` · container `hafjet-ai-whatsapp-bot` · service `whatsapp-api` · **:8200 host network**.

**`docker ps` unhealthy ≠ app down.** Read `State.Health.Log` + host `curl /api/health` before restart/rebuild.

| Trap | Rule |
|------|------|
| Healthcheck `CMD curl` on `python:3.12-slim` | Slim has **no curl** → forever unhealthy while Uvicorn is fine |
| Preferred fix | Pure-Python healthcheck (urllib) in **compose only** — no apt, no image rebuild |
| Recreate | `sudo docker compose up -d --force-recreate --no-deps whatsapp-api` only — never bounce DB |
| Nested SSH YAML edit | Quotes around health URL get stripped → healthcheck `SyntaxError`. Patch via **base64-delivered** remote Python; verify `inspect .Config.Healthcheck.Test` |
| Git | Stage **only** `docker-compose.yml` unless CTO expands scope. Push may fail (`no upstream` / GitHub `Host key verification failed`) → local commit OK; do not force |
| Swap | Oracle image often **0 swap**. Safe 4G: `fallocate /swapfile` → `mkswap` → `swapon` → fstab → `vm.swappiness=10` |

```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8200/api/health', timeout=5)"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### 🚨 iptables Firewall on Oracle VM (CRITICAL — hit Aug 2026)

**Symptom:** Port 8200 is open in Oracle Cloud Security Lists but external `curl` times out. Port 80 works fine.

**Root cause:** Oracle Cloud Ubuntu images come with iptables INPUT rules that only allow:
- SSH (port 22)
- ICMP (ping)
- RELATED,ESTABLISHED connections

Everything else is REJECT'd by the INPUT chain. Cloud Security Lists are Layer 3/4; iptables is Layer 7 — BOTH must allow the port.

**Fix:**
```bash
# Add rules to allow your service ports
sudo iptables -I INPUT 3 -p tcp --dport 8200 -j ACCEPT
sudo iptables -I INPUT 4 -p tcp --dport 8201 -j ACCEPT

# Make persistent across reboots
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

**Verify:**
```bash
# Check rules
sudo iptables -L INPUT -n --line-numbers

# Test external access
curl -s --max-time 10 http://<PUBLIC_IP>:8200/api/health
```

**Debugging pattern:** When a port is open in Cloud Security Lists but still blocked:
1. Check iptables on the VM: `sudo iptables -L INPUT -n`
2. Check if service is listening on 0.0.0.0: `ss -tlnp | grep PORT`
3. Check if service is running: `curl localhost:PORT/api/health`
4. If all pass but external fails → iptables is the culprit

**⚠️ Dual-layer fix required:** Both Oracle Cloud Security Lists AND iptables must allow the port. Fix iptables first (faster), then verify Security Lists in OCI Console.

### Pydantic v2 BaseSettings Migration (Aug 2026)

**Symptom:** `from pydantic import BaseSettings` fails with `PydanticImportError: BaseSettings has been moved to the pydantic-settings package`.

**Root cause:** Pydantic v2 moved `BaseSettings` to a separate package.

**Fix:**
```bash
# Add to requirements.txt
pydantic-settings==2.7.0
```

```python
# Update imports
# ❌ OLD (Pydantic v1)
from pydantic import BaseSettings

# ✅ NEW (Pydantic v2)
from pydantic_settings import BaseSettings
```

### Meta Webhook Verification Handler (WhatsApp Cloud API)

Meta requires a GET handler for webhook verification. Without it, the "Verify and Save" button in Business Manager fails.

**Required GET handler in FastAPI:**
```python
from fastapi import FastAPI, Request, Query
from fastapi.responses import PlainTextResponse

@app.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_verify_token: str = Query(..., alias="hub.verify_token"),
    hub_challenge: str = Query(..., alias="hub.challenge")
):
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        return PlainTextResponse(content=hub_challenge)
    else:
        return PlainTextResponse(content="Forbidden", status_code=403)
```

**Meta Business Manager setup:**
1. Go to `https://business.facebook.com/settings/whatsapp-business-accounts/<WABA_ID>`
2. Click Webhook → Callback URL
3. Enter: `http://<PUBLIC_IP>:<PORT>/webhook`
4. Enter Verify Token (must match `.env`)
5. Click "Verify and Save"
6. Subscribe to "messages" field

**Complete .env template for WhatsApp AI Bot (Production):**
```bash
# App
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=8200
APP_DEBUG=false

# Ollama
OLLAMA_HOST=127.0.0.1
OLLAMA_PORT=11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_REQUEST_TIMEOUT=20

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Database (local PostgreSQL for dashboard)
DB_HOST=localhost
DB_PORT=5440
DB_NAME=hafjet_ai
DB_USER=hafjet
DB_PASSWORD=your_password

# WhatsApp Meta Cloud API
WHATSAPP_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_GRAPH_API_VERSION=v21.0

# Owner
OWNER_PHONE_NUMBER=60169808736
DEFAULT_LANGUAGE=ms

# Cost Controls
MAX_OUTBOUND_MESSAGES_PER_DAY=100
OUTBOUND_WARNING_THRESHOLD=80
ENABLE_MARKETING_MESSAGES=false
ENABLE_BROADCAST=false

# Azure Forwarding (disabled by default)
ENABLE_AZURE_FORWARDING=false
AZURE_BOT_BASE_URL=
AZURE_BOT_API_KEY=
```

### Production WhatsApp Cloud API Architecture (Aug 2026)

**CTO Decision:** Official WhatsApp Cloud API as primary channel. Azure Bot as backup/experimental only.

**Architecture:**
```
Customer WhatsApp → Meta Cloud API → Oracle FastAPI Webhook
                                        ↓
                                  Smart Router
                                        ↓
                          ┌─────────────┼─────────────┐
                          ↓             ↓             ↓
                    Direct DB      Ollama AI    Human Handoff
                    (prices,      (complex      (escalation)
                     stock,        queries)
                     status)
                          ↓             ↓             ↓
                          └─────────────┼─────────────┘
                                        ↓
                              WhatsApp Cloud API Reply
```

**Smart Routing Module:**
```python
class IntentClassifier:
    """Classify customer intent from message text"""
    
    PRICE_PATTERNS = [r'harga', r'price', r'berapa', r'cost']
    STOCK_PATTERNS = [r'stok', r'stock', r'ada.*stok']
    REPAIR_STATUS_PATTERNS = [r'status.*repair', r'HAF-\d+', r'bila.*siap']
    HUMAN_PATTERNS = [r'staff', r'manager', r'marah', r'refund', r'warranty']
    
    @classmethod
    def classify(cls, message: str) -> str:
        message_lower = message.lower().strip()
        # Check human handoff first (highest priority)
        for pattern in cls.HUMAN_PATTERNS:
            if re.search(pattern, message_lower):
                return "human_handoff"
        # Check other intents...
        return "general"  # Default to Ollama
```

**Cost Controls Configuration:**
```bash
MAX_OUTBOUND_MESSAGES_PER_DAY=100
OUTBOUND_WARNING_THRESHOLD=80
ENABLE_MARKETING_MESSAGES=false
ENABLE_BROADCAST=false
```

**Production Database Schema (Supabase):**
```sql
-- customers
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255),
    language_preference VARCHAR(10) DEFAULT 'ms',
    created_at TIMESTAMP DEFAULT NOW()
);

-- messages (with dedup)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    whatsapp_message_id VARCHAR(100) UNIQUE,
    customer_phone VARCHAR(50) NOT NULL,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    message_type VARCHAR(50) DEFAULT 'text',
    message_text TEXT,
    status VARCHAR(50) DEFAULT 'received',
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ai_requests (for monitoring)
CREATE TABLE IF NOT EXISTS ai_requests (
    id SERIAL PRIMARY KEY,
    customer_phone VARCHAR(50),
    route_type VARCHAR(50) DEFAULT 'llm',
    model VARCHAR(50),
    latency_ms INTEGER,
    confidence FLOAT,
    status VARCHAR(50) DEFAULT 'success',
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Health Check Endpoint (Production):**
```python
@app.get("/api/health")
async def health_check():
    ollama_ok = await ollama_client.health_check()
    supabase_ok = False
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        supabase_ok = True
    except:
        pass
    
    return {
        "api": "healthy",
        "supabase": "healthy" if supabase_ok else "unhealthy",
        "ollama": "healthy" if ollama_ok else "unhealthy",
        "whatsapp_configured": bool(settings.whatsapp_token),
        "timestamp": datetime.now().isoformat()
    }
```

## Cloud Provider Comparison (Aug 2026)

| Provider | CPU | RAM | Storage | Cost | Notes |
|----------|-----|-----|---------|------|-------|
| UpCloud Trial | 2C | 4GB | 80GB | Free 14d | Account suspended |
| AWS t3.micro | 2C | 1GB | 20GB | Free 12mo | Too small for 6 DBs |
| AWS t3.small | 2C | 2GB | 20GB | ~RM65/mo | Can handle projects |
| Oracle A1.Flex | 4C | 24GB | 200GB | Free forever | ARM capacity issues |
| Hetzner CX22 | 2C | 4GB | 40GB | €4.5/mo | Best value, SG region |
| PC Office | 2C | 18GB | 512GB | RM5-15/mo | On-demand boot |

**Recommendation**: Oracle Free (if capacity) > Hetzner (if cheap needed) > AWS t3.small (if must have).

## Command Center Architecture (Aug 2026)

Unified dashboard for all HAFJET projects using proxy pattern.

### Components
1. **cc_server.py** — Python threaded HTTP server (ThreadingMixIn)
2. **commandcenter_ui.html** — Single-page dashboard with Chart.js
3. **Docker Compose** — Runs on port 80

### Proxy Pattern (avoids CORS)
```
Browser → http://server:80/proxy/8080/api/dashboard
        → cc_server.py → http://172.17.0.1:8080/api/dashboard
        → Returns JSON to browser
```

### Key Implementation Details
- Use `172.17.0.1` (Docker gateway) NOT `127.0.0.1` for service access from container.
- Health check: accept `HTTPError` with code < 500 as "service UP" (FastAPI returns 404 for `/`).
- Cache health results 10 seconds to avoid hammering services.
- Threaded server prevents blocking on slow health checks.
- All fetch() in HTML use relative paths (`/proxy/{port}/api/...`) to avoid CORS.

### Pitfalls
- Single-threaded `HTTPServer` blocks ALL requests during health check — MUST use `ThreadingMixIn`.
- FastAPI services return 404 for root `/` — health check must treat 4xx as "UP" (service running).
- `127.0.0.1` inside Docker container = container itself, NOT host — use `172.17.0.1`.

## Memory-Constrained Docker Deployment (911MB RAM)

When running many services on small instances:

### Option A: Shared PostgreSQL (recommended)
- 1 PostgreSQL instance with multiple databases (one per project).
- Saves ~500MB vs 6 separate PostgreSQL containers.
- Connection strings: `host=shared-db dbname=inventory user=hafjet`

### Option B: Sequential Startup
- Start DBs first, wait for healthy, then start APIs.
- Don't start all containers at once — RAM spike kills services.
- Use `docker compose up -d db1 && sleep 15 && docker compose up -d db2 && ...`

### PostgreSQL Memory Tuning
```yaml
command: postgres -c shared_buffers=128MB -c work_mem=4MB -c max_connections=20
```
- `shared_buffers=128MB` (default 128MB, OK for small)
- `work_mem=4MB` (reduces per-query memory)
- `max_connections=20` (limit concurrent connections)

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
  WAS TRANSIENT, NOT A PERMANENT FIREWALL BLOCK:** the FIRST attempt failed because at
  bootstrap time PC Office had **NO working internet route** (no default gateway configured
  → every external `curl`/`git` to :443 returned `000` "Could not connect" in 0ms, even
  `github.com`, `pypi.org`, `ubuntu.com`, `google.com`). This LOOKED like a firewall block
  but was a **missing default route / network unreachable** state. Tuan fixed it by bringing
  up the LAN route: `inet 192.168.1.252/24` on `enp1s0`, `default via 192.168.1.1`, `ping
  8.8.8.8` OK. ⚠️ **Do NOT assume a permanent office firewall block** — once the route was
  up, `github.com`=200, `codeload`=301, `pypi`=200, and a **plain re-run of the installer
  succeeded with NO proxy and NO scp fallback** (see RESOLVED STATE below). ⚠️ The
  `git config --global http.curloptResolve "github.com:443:20.205.243.166"` IPv4 pin did NOT
  fix it during the no-route window (0ms drop = no path, not address family) — only relevant
  if DNS resolves but routing is broken. If external :443 is STILL `000` AFTER a default
  route exists, THEN suspect a real egress firewall and use the proxy/scp fixes below.
  Working fixes, in order:
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
- After SSH works, configure Hermes on PC Office. Tuan chose **Pilihan B: clone Azure
  config** (not a separate profile) for consistency — see RESOLVED STATE below.
- Reference: `references/pc-office-node2-bootstrap.md` — exact commands for Tuan to paste
  on PC Office + per-step pitfalls (key register, enable Tailscale SSH, Hermes install).

### RESOLVED STATE — Pilihan B (confirmed 2026-07-19)
After the LAN route was fixed, the FULL bootstrap completed cleanly with a plain re-run.
Final topology chosen:
- **Azure VPS = GATEWAY 24/7** — `hermes-gateway.service` (user service) active+enabled,
  `loginctl show-user hafizi145 -p Linger` → `Linger=yes` (survives logout). Telegram /
  Discord / WebUI all terminate here.
- **PC Office = WORKER on-demand** — Hermes agent v0.18.2 installed, **config cloned
  from Azure** (NOT a separate profile — Tuan wanted consistency), **NO gateway installed**
  (no listening :8000/:8080/:3000). Reachable only via Tailscale SSH.

**Successful install path (once internet route is up — NO proxy needed):**
```bash
# From Azure, drive PC Office remotely:
ssh -o StrictHostKeyChecking=accept-new hafizi145@hafjet-pc-office \
  'rm -rf ~/.hermes/hermes-agent && curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash'
# Clone Azure config to PC Office (secret-safe: scp file, don't print):
scp ~/.hermes/config.yaml ~/.hermes/.env hafizi145@hafjet-pc-office:/home/hafizi145/.hermes/
```
**Verification commands that worked (run from Azure):**
```bash
# PC Office agent smoke test:
ssh hafizi145@hafjet-pc-office 'export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"; hermes --version; echo "Say OK" | hermes chat -q "Say OK"'
# Expect: Hermes Agent v0.18.2 ... + reply "OK"
# Azure gateway health:
systemctl --user status hermes-gateway   # active (running)
loginctl show-user hafizi145 -p Linger     # Linger=yes
# Confirm PC Office exposes NO gateway ports:
ssh hafizi145@hafjet-pc-office 'ss -tlnp | grep -E ":8000|:8080|:3000" || echo no-gateway-ports'
```
**Pitfall — `hermes setup` wizard on a remote/non-interactive shell is SKIPPED** by the
installer ("Setup wizard skipped (no terminal available)"). If Tuan runs `hermes setup`
interactively on PC Office later, it may briefly leave a `hermes setup` process running —
harmless; it just configures provider/key (which the cloned `.env` already supplies).
**Do NOT install gateway on PC Office** for Pilihan B — that would double-handle Telegram
messages and split the single chat surface. Keep Azure as the sole gateway.

**Azure `terminal.backend` decision (Pilihan B — FINAL, confirmed 2026-07-19):** Do NOT set
`terminal.backend: ssh` globally on the Azure gateway to point at PC Office. We tested this —
it works (passwordless SSH Azure→PC Office is solid), BUT it makes EVERY Azure terminal tool
run remotely on PC Office. If PC Office is off/sleeping, Azure's terminal tools **"lumpuh"**
(all fail to connect → Hermes can't do any terminal work). The safer choice Tuan confirmed:
keep Azure `terminal.backend: local` so Azure stays self-sufficient for light work, and only
delegate to PC Office selectively later (e.g. a dedicated profile or skill that sets the `ssh`
backend for heavy jobs). SSH target details are still saved for future use:
```bash
hermes config set terminal.backend local
hermes config set terminal.ssh.host 100.121.94.41
hermes config set terminal.ssh.user hafizi145
hermes config set terminal.ssh.port 22
```
⚠️ `hermes config show terminal` is **INVALID** — `config show` takes NO sub-argument
(parser errors "unrecognized arguments: terminal"). Inspect via `hermes config show` (full)
or `read_file ~/.hermes/config.yaml`. Also: `hermes config get` subcommand does NOT exist
(use `show` or read the file).
