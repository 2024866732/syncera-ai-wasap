# Heavy npm Installs on Constrained Servers

## Overview

Large npm packages (1000+ dependencies) can fail on servers with limited disk/RAM. This reference covers patterns observed during heavy installs like OmniRoute (1177 packages, ~600 MB installed).

## Disk Requirements

| Package | Dependencies | Disk (installed) | Install time (1GB RAM) |
|---------|-------------|------------------|----------------------|
| OmniRoute v3.8.46 | 1177 | ~600 MB | 4-10 min |

## Common Failure Modes

### 1. ENOSPC (No Space Left on Device)
**Cause**: `npm install` downloads + extracts all deps before linking. If disk fills mid-extract:
- Partial `node_modules/` left behind (~100-600 MB)
- npm cache grows (~200 MB per attempt)
- Subsequent installs fail even if you freed space (cache retained)

**Recovery**:
```bash
# Identify and remove partial install
ls ~/.nvm/versions/node/v*/lib/node_modules/<package> 2>/dev/null
rm -rf ~/.nvm/versions/node/v*/lib/node_modules/<package>

# Clear npm cache (can be 500 MB - 2 GB)
npm cache clean --force

# Check available space
df -h /

# Verify cleanup worked
du -sh ~/.nvm/versions/node/v*/lib/node_modules/ 2>/dev/null
```

### 2. Timeout on Constrained RAM
**Cause**: npm's post-install scripts (native module compilation, React build) can take 5+ min on 1 GB RAM + 4 GB swap.
**Symptom**: Process appears stuck at "npm warn deprecated ..." messages.
**Fix**: Use `terminal(background=true)` with `notify_on_complete=true`. Never use foreground with <5 min timeout.

### 3. Zombie Processes
**Cause**: `npm install` killed mid-execution leaves npm/node processes running.
**Check**: `ps aux | grep "[n]pm"` or `pgrep -f "npm install"`
**Kill**: `pkill -f "npm install"` (nuclear option — use only if processes hung)

## OmniRoute Specifics

### Install
```bash
npm install -g omniroute  # Global install, ~600 MB
```

### First Run
```bash
omniroute  # Starts dashboard + API
# Creates ~/.omniroute/.env with auto-generated STORAGE_ENCRYPTION_KEY
# Dashboard: http://localhost:20128
# API: http://localhost:20128/v1
```

### Configuration
- Main env: `~/.nvm/versions/node/v24.16.0/lib/node_modules/omniroute/.env`
- Storage key: `~/.omniroute/.env` (auto-generated, do not overwrite)
- Dashboard port: 20128 (hardcoded, not configurable without editing source)

### Health Check
```bash
curl -s http://localhost:20128/v1/models  # Returns model list (may need API key)
ss -tlnp | grep 20128                    # Verify port listening
```

### Cleanup (if needed)
```bash
npm uninstall -g omniroute
rm -rf ~/.omniroute  # Remove config/data
npm cache clean --force  # Reclaim ~500 MB
```

### Runtime on Constrained RAM
**Observation (2026-07-10)**: OmniRoute v3.8.46 process starts, reports "running", port 20128 shows in `ss -tlnp`, but HTTP requests timeout (0 bytes received). Root cause: competing RAM consumers (Hermes gateway 275 MB + Hermes webui + Tailscale) leave <150 MB free on 848 MB server. The Node.js process is alive but too memory-starved to handle requests.

**Detection**:
```bash
ss -tlnp | grep 20128          # port shows LISTEN
curl -m 5 http://127.0.0.1:20128/  # timeout or empty response
free -h                         # check available RAM
ps aux --sort=-%mem | head -10  # identify RAM hogs
```

**Decision**: If RAM <200 MB available with OmniRoute running, the service is likely non-functional despite showing as "up". Either stop competing services or accept the tool cannot run on this server.

## Best Practices

1. **Pre-flight disk check**: Always run `df -h /` before heavy installs
2. **Background execution**: Use `terminal(background=true, notify_on_complete=true)` for installs >2 min
3. **Clean before retry**: If install fails, always `npm cache clean --force` before retry
4. **Monitor progress**: Use `du -sh ~/.nvm/versions/node/v*/lib/node_modules/<package>` to track download progress
5. **Docker alternative**: If Docker is available, prefer `docker run -p 20128:20128 diegosouzapw/omniroute` for isolation

## Server Context (HAFJET Azure)

- RAM: 848 MB + 4 GB swap
- Disk: 29 GB total, ~7.5 GB available after cleanup
- Node: v24.16.0 (via nvm)
- npm: 11.13.0
- Docker: NOT available
