# PC Office Deployment Reference (2026-07-22)

This file captures the specific steps and outputs from deploying OmniRoute on the PC Office machine (100.121.94.41) during the session.

## Machine Specifications
- Hostname: hafjet-pc-office
- OS: Ubuntu 26.04 LTS
- Kernel: Linux 7.0.0-28-generic
- RAM: 16 GiB total, 6.4 GiB free after installation
- Disk: 98 GiB total, 54 GiB free after installation
- Swap: 8 GiB total, 8 GiB free

## Steps Taken

### 1. Install nvm and Node.js LTS
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts
```
Output:
- Installed Node.js v24.18.0 (npm v11.16.0)

### 2. Install OmniRoute globally
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm install -g omniroute
```
Output:
- added 1181 packages in 3m
- Version installed: 3.8.48

### 3. Start OmniRoute in background
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nohup omniroute > omniroute.log 2>&1 &
echo $! > omniroute.pid
```
- Process ID captured in `omniroute.pid`

### 4. Verification
After ~10 seconds wait:
- Dashboard curl returned redirect to `/dashboard`
- API endpoint `/v1/models` returned a JSON list of models (truncated in logs)
- Process list showed:
  - `node /home/hafizi145/.nvm/versions/node/v24.18.0/bin/omniroute` (PID ~47253)
  - `omniroute (v16.2.10)` (PID ~47273) with ~4.0% memory usage (~727048 KB)

### 5. Resource Usage Post-Install
```bash
free -h
```
Output:
- total: 16GiB, used: 1.3GiB, free: 6.4GiB

```bash
df -h /
```
Output:
- Size: 98G, Used: 40G, Avail: 54G, Use%: 43%

## Notes
- The installation and startup were successful without errors.
- The service remained responsive after startup message "OmniRoute is running! (started in 8.9s)" appeared in the log.