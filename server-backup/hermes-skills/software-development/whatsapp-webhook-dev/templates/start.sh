#!/bin/bash
# Azure App Service startup script for FastAPI WhatsApp Bot
# Place at project root (e.g., /home/site/wwwroot/start.sh)
# Set appCommandLine: "start.sh" in Azure Configuration → General Settings
#
# Requirements:
#   - requirements.txt in same directory (for Oryx build at deploy time)
#   - webhook_listener:app (gunicorn target)
#   - WEBSITES_PORT env var set (default: 8000)
#   - SCM_DO_BUILD_DURING_DEPLOYMENT=true in Azure App Settings
#
# ⚠ CRITICAL: This script must ONLY launch the web server.
#   - NO pip install (Oryx handles it at deploy time)
#   - NO long-running setup commands
#   - NO apt-get or system package installs
#   - If startup takes >230s, Azure kills the container (ContainerTimeout)
#
# Azure safely:
#   - Uses WEBSITES_PORT env var (injected by Azure)
#   - cd to /home/site/wwwroot (Azure Linux container CWD)
#   - NO local developer paths (never /home/xxx/.hermes/...)
#   - 1 worker (Azure Free/Basic tier: low RAM)
#   - --ws wsproto for lightweight WebSocket support

set -e
cd /home/site/wwwroot
python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:${WEBSITES_PORT:-8000} --timeout 120 --ws wsproto
