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

Backing up Hermes config/skills/cron to GitHub repo `syncera-ai-wasap`. **GitHub Push Protection scans ALL pushed history** for secrets (OpenRouter keys, API tokens, etc.).

### Redaction BEFORE git commit (mandatory in backup script)

The backup script at `~/syncera-ai-wasap/scripts/backup-server.sh` MUST strip secrets before `git add`:
```bash
# Redact API keys from config.yaml
sed -i -E 's/(api_key: )(.+)/\1[REDACTED]/g' "$BACKUP_DIR/hermes-config/config.yaml"
sed -i -E 's/(api_key=)(.+)/\1[REDACTED]/g' "$BACKUP_DIR/hermes-config/config.yaml"
sed -i -E 's/("api_key": *")[^"]+/\1[REDACTED]/g' "$BACKUP_DIR/hermes-config/config.yaml"

# Redact from cron output files (LLM output may contain API keys in plaintext)
find "$BACKUP_DIR/hermes-cron" -type f \
  -exec sed -i -E 's/(sk-[a-zA-Z0-9_-]{20,})/[REDACTED_API_KEY]/g' {} \;

# Delete raw secret files entirely
find "$BACKUP_DIR" -name ".env" -delete
find "$BACKUP_DIR" -name "auth.json" -delete
find "$BACKUP_DIR" -name "*.key" -delete
find "$BACKUP_DIR" -name "hosts.yml" -delete
```

Cron job `315e1bdcd7fc` runs daily at 14:00 UTC. Full recovery walkthrough + verification steps in `references/server-backup-push-protection.md`.

### Recovering from a blocked push (GH013)

If secrets slipped into history and push is blocked:
```bash
# 1. Create replacement file (regex pattern for the secret)
printf 'regex:api_key: sk-or-[a-zA-Z0-9_-]{30,}==>api_key: [REDACTED]\n' > /tmp/filter.txt

# 2. Clean ALL commits in the branch (rewrites history)
cd ~/repo && rm -f .git/filter-repo/already_ran
echo "Y" | git filter-repo --replace-text /tmp/filter.txt --force

# 3. Re-add origin (filter-repo removes it) and force push
git remote add origin https://github.com/...
git push origin <branch> --force
```

**Key pitfalls:**
- `git filter-repo` removes the `origin` remote and rewrites ALL commit SHAs — force push is mandatory after
- `git filter-repo --force` prompts "Treat this run as a continuation? Y/N" — pipe `echo "Y" |` or delete `.git/filter-repo/already_ran`
- GitHub scans the ENTIRE pushed history, not just HEAD — one old commit with a secret blocks the whole push
- Push Protection won't tell you WHICH key triggered it; check the error message for the commit SHA + line number

### Git identity (cosmetic)
```bash
git config --global user.name "HAFJET-Hermes"
git config --global user.email "hermes@hafjet.com.my"
```

## Tuan's standing cleanup constraints
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
