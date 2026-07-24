---
name: omniroute-deployment
description: Deploys the OmniRoute AI Gateway on a remote Ubuntu machine via SSH, ensuring sufficient resources and verifying the service is reachable.
version: 1.0.0
---

# OmniRoute Deployment Skill

## Description
Deploys the OmniRoute AI Gateway (https://github.com/diegosouzapw/OmniRoute) on a remote Ubuntu machine via SSH, ensuring sufficient resources and verifying the service is reachable.

## When to Use
- You need to run OmniRoute on a machine with more resources than the current Azure VM.
- You want to keep processing local (PC Office) and use Azure only as a gateway/trusted entry point.
- You prefer to manage the service via SSH and verify with curl.

## Prerequisites
- SSH access to the target machine (user with sudo or able to install nvm/npm).
- Target machine running Ubuntu (or Debian-based) with at least 2GB RAM and 5GB free disk recommended.
- Node.js not pre-installed; we will use nvm to install the latest LTS.

## Procedure
1. **Test SSH connectivity**
   ```bash
   ssh -o BatchMode=yes -o ConnectTimeout=10 <user>@<host> echo "SSH OK"
   ```

2. **Install nvm and Node.js LTS**
   ```bash
   ssh <user>@<host> '
     export NVM_DIR="$HOME/.nvm"
     [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
     export NVM_DIR="$HOME/.nvm"
     [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
     nvm install --lts
     nvm use --lts
   '
   ```

3. **Install OmniRoute globally**
   ```bash
   ssh <user>@<host> '
     export NVM_DIR="$HOME/.nvm"
     [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
     npm install -g omniroute
   '
   ```

4. **Start OmniRoute in background**
   ```bash
   ssh <user>@<host> '
     export NVM_DIR="$HOME/.nvm"
     [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
     nohup omniroute > omniroute.log 2>&1 &
     echo $! > omniroute.pid
   '
   ```

5. **Wait for startup (~10s) and verify**
   ```bash
   ssh <user>@<host> "
     export NVM_DIR=\"\$HOME/.nvm\"
     [ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\"
     sleep 10
     curl -s -m 10 http://127.0.0.1:20128/
   "
   # Should return a redirect to /dashboard or HTML.
   ```

6. **Optional: Check API**
   ```bash
   ssh <user>@<host> "
     export NVM_DIR=\"\$HOME/.nvm\"
     [ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\"
     curl -s -m 10 http://127.0.0.1:20128/v1/models | head -5
   "
   ```

7. **Note the PID file and log location for later management**
   - PID: `~/omniroute.pid`
   - Log: `~/omniroute.log`

## Stopping & Restarting
- To stop: `ssh <user>@<host> 'kill $(cat ~/omniroute.pid)'`
- To restart: repeat steps 4‑6.

## Pitfalls & Troubleshooting
- **Disk space** – OmniRoute + dependencies need ~600 MB; ensure at least 2 GB free.
- **RAM** – The service uses ~1.3 GB RSS after startup; 2 GB free RAM is comfortable.
- **Port conflict** – If another process listens on 20128, change the port via `OMNIROUTE_PORT` env or stop the conflicting service.
- **Node version mismatch** – Using nvm guarantees a recent LTS; avoid system Node which may be too old.
- **Environment variables** – The script above loads nvm in each SSH block; if you prefer a persistent shell, source `~/.bashrc` first.

## Verification
- Dashboard reachable: HTTP 200 with redirect to `/dashboard`.
- API endpoint returns JSON list of models.
- Process appears in `ps aux | grep omniroute`.

## References
- Official OmniRoute repo: https://github.com/diegosouzapw/OmniRoute
- nvm installation script: https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh