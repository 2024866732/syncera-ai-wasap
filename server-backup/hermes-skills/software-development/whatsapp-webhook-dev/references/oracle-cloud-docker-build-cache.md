# Oracle Cloud Docker Build Cache Issue

## Problem

When rebuilding Docker containers on Oracle Cloud VM, the build may fail with:

```
ERROR: failed to prepare extraction snapshot "extract-...": parent snapshot sha256:... does not exist: not found
```

## Root Cause

Docker build cache becomes corrupted or references snapshots that no longer exist after container removal.

## Solution

Clear the Docker build cache before rebuilding:

```bash
# Step 1: Clear build cache
sudo docker builder prune -af

# Step 2: Remove existing containers
sudo docker compose down

# Step 3: Rebuild
sudo docker compose up -d --build
```

## Prevention

- Use `sudo docker compose down` before `sudo docker compose up -d --build`
- If build fails, always clear cache first
- Keep `restart: unless-stopped` in docker-compose.yml to avoid manual restarts

## Oracle Cloud Specific Notes

- Must use `sudo` for Docker commands (ubuntu user not in docker group)
- Use Tailscale IP (100.124.99.52) for SSH connection
- SSH key: `/tmp/hafjet-oracle-key` (ed25519)
