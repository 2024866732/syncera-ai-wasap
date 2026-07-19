# PC Office Node #2 Bootstrap

Run these ON the PC Office terminal (Tuan pastes them). Prereq: PC Office is online on
Tailscale — verify from Azure with `tailscale status` (node `hafjet-pc-office`, user
`hafizi145`). It is on-demand; boot it first if `tailscale ping hafjet-pc-office` fails.
IP: `100.121.94.41`. Azure node (relay/proxy source): `100.111.105.120`.

## 1. Register Azure's SSH key + (optional) enable Tailscale SSH
```bash
mkdir -p ~/.ssh
# Get the key live from Azure: `cat ~/.ssh/id_rsa.pub`, copy the full line.
echo "<AZURE_PUBKEY_FROM_~/.ssh/id_rsa.pub>" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
# Key-based SSH (preferred for agent use). Do NOT run tailscale --ssh unless you want
# per-session web-auth prompts. If already enabled, revert:
sudo tailscale up --ssh=false
```

## 2. From Azure, verify access
```bash
ssh -o StrictHostKeyChecking=accept-new hafizi145@hafjet-pc-office 'uname -a; free -h; df -h /'
```
- If `tailscale ssh` wrapper errors with `flag provided but not defined: -o`, use plain
  `ssh` with inline `-o` flags (the wrapper does not forward ssh options).
- `~/.ssh/config` is a PROTECTED file — agent cannot write it. Pass options inline.
- If `tailscale up --ssh` IS on, first connect demands web auth at
  `login.tailscale.com/a/<token>` → use key auth instead (step 1 revert).

## 3. Install Hermes — BUT external internet is BLOCKED on PC Office
⚠️ ROOT CAUSE (verified 2026-07-19): PC Office is behind an **office firewall that drops
ALL external :443 egress** (github, pypi, codeload, google, ubuntu.com, tailscale.com all
return `000` "Could not connect" in 0ms). Only Tailscale traffic passes. `apt` worked only
via a LAN Ubuntu mirror. So the installer's `git clone github.com` and `pip install` deps
WILL FAIL. The old `git config http.curloptResolve github.com:443:<ip>` IPv4 pin does NOT
help — it's a firewall drop, not an address-family issue.

**Choose ONE working path:**

### Path A — Azure HTTP proxy (cleanest)
On Azure (has full internet):
```bash
# install tinyproxy if missing, set Listen 0.0.0.0 + Allow 0.0.0.0/0, Port 3128
sudo apt-get install -y tinyproxy
sudo sed -i 's/^Listen .*/Listen 0.0.0.0/' /etc/tinyproxy/tinyproxy.conf
sudo sed -i 's/^#Allow /Allow 0.0.0.0\/0\nAllow /' /etc/tinyproxy/tinyproxy.conf
sudo systemctl restart tinyproxy   # approval-gated service restart
```
On PC Office:
```bash
export HTTP_PROXY=http://100.111.105.120:3128 HTTPS_PROXY=http://100.111.105.120:3128
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```
(Azure IP `100.111.105.120` reachable over Tailscale.)

### Path B — scp tarball from Azure (no proxy needed)
On Azure:
```bash
curl -fsSL -o /tmp/hermes-agent-main.tar.gz https://codeload.github.com/NousResearch/hermes-agent/tar.gz/refs/heads/main
scp /tmp/hermes-agent-main.tar.gz hafizi145@hafjet-pc-office:/tmp/
```
On PC Office:
```bash
mkdir -p ~/.hermes/hermes-agent && tar -xzf /tmp/hermes-agent-main.tar.gz -C ~/.hermes/hermes-agent --strip-components=1
# then run the installer again so it detects the cloned tree + builds venv
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```
Installer URL note: `https://hermes-agent.nousresearch.com/install` -> HTTP 404 (dead);
raw.githubusercontent URL above is the reliable one. This installer is the ONE approved
exception to Tuan's no-curl-pipe rule (official Nous Research script). Use a SEPARATE
Hermes profile (`~/.hermes/profiles/pc-office/`) so this node doesn't overwrite the Azure
node's skills / cron / memories.

## 4. Confirm node #2 is live
```bash
ssh -o StrictHostKeyChecking=accept-new hafizi145@hafjet-pc-office 'hermes --version; ps aux | grep hermes | grep -v grep'
```

## 5. UFW hardening (do LATER, not now)
Leave ufw DISABLED until Hermes is stable. Tailscale already provides per-node ACL.
If hardening later, order matters to avoid lockout (Tailscale rides `tailscale0`, not
the OpenSSH/eth0 rule):
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow in on tailscale0
sudo ufw enable
```
⚠️ Pasting several ufw commands merged into one line (as happened this session) leaves
ufw half-configured and `enable` never runs — verify each command ran before proceeding.

## Tuan-paste tips learned this session
- NEVER paste multiple commands mashed into one line — the shell garbles them and
  partial state results (e.g. `ufw default deny incoming` ran but `allow`/`enable` didn't).
  Send each command separately or as a clean heredoc block.
- `sudo nano /etc/ssh/sshd_config.d/10-custom.conf` left the file EMPTY (nano didn't
  save) — verify with `cat` afterward; an empty override file is harmless but means no
  hardening was actually applied.
