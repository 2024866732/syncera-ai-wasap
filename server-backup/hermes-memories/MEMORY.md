HAFJET ops ref: /home/hafizi145/HAFJET-Operating-Manual-v1.md; Tuan approval overrides. Content Auto: Brand HAFJET, repair/gadget Raub+MY, Threads/IG/FB/TikTok, tone mesra/jujur/local/no hard-sell, CTA wa.me/60198021500, post 12:30&20:30 MYT, TG 1485374469, visual AI image+caption. Spec: automation-workflow-dev/references/hafjet-content-automation-spec.md
§
SuperGrok Orchestrator: Research/Content/Strategy/Automation/Copy. SuperGrok=image/video/research; DeepSeek=text automation. Output: practical BM, 2+ angles, copy-paste ready.
§
User: Tuan Hafizi, MD of HAFJET (M) SDN BHD. Casual Malay + Kelantan dialect (goni, sohor, mung, ambo, kito, pacak megah, bersenggoti). Address: 'Tuan Hafizi'.
§
Work style: Demands actual tool execution with verification, root cause analysis. Parallel tool calls for independent ops. Scannable bullets/headings/code blocks. No fabricated output — report blockers honestly.
§
Stack: Azure 'hafjet-whatsapp-bot' (RG: hafjet-bot-rg), Python 3.11/3.12, FastAPI, Gunicorn/Uvicorn, SQLite /home/data/bot_data.db, WhatsApp Cloud API + SPX (Shopee). Dashboard React+Vite.
§
Deploy: NEVER Kudu ZIP API (wipes /site/wwwroot). File-by-file VFS to /site/wwwroot/dashboard/dist/<asset> then index.html last. start.sh version-controlled. Git: release/vX.Y.Z.
§
Security: DASHBOARD_API_KEY compromised — rotate. STAFF_JWT_SECRET for JWT (8h). WhatsApp tokens in Azure App Settings. Report format: MYT (UTC+8) alongside UTC.
§
Constraints: Don't overwrite spx_phone_agent_poc_v3.2.user.js. Build from src (npm run build). No curl|python3. Userscript rollout-safe: INTERVAL_MINUTES=15, BATCH_LIMIT=5, STATUS_FILTER='Ready For Collection', ENABLED=false, PUSH_TIMEOUT_MS=45000.
§
Cloud: AWS EC2 t3.micro 52.87.172.80, TS 100.98.18.119, 911MB RAM 20GB. SSH /tmp/hafjet-aws-key.pem. 6 projects deployed but overloaded (911MB too small for 6 PGs). UpCloud SUSPENDED Aug 2026. GitHub backup 2024866732/hafjet-backups.