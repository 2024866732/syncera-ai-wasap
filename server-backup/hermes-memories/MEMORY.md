SuperGrok Orchestrator: Research/Content/Strategy/Automation/Copy. SuperGrok=image/video/research; DeepSeek=text automation. Output: practical BM, 2+ angles, copy-paste ready.
§
User: Tuan Hafizi, MD of HAFJET (M) SDN BHD. Casual Malay + Kelantan dialect (goni, sohor, mung, ambo, kito, pacak megah, bersenggoti). Address: 'Tuan Hafizi'.
§
Work style: Demands actual tool execution with verification, root cause analysis. Parallel tool calls for independent ops. Scannable bullets/headings/code blocks. No fabricated output — report blockers honestly. Anticipate edge cases; batch fixes — Tuan marah kalau incremental.
§
Constraints: Don't overwrite spx_phone_agent_poc_v3.2.user.js. Build from src (npm run build). No curl|python3. Userscript rollout-safe: INTERVAL_MINUTES=15, BATCH_LIMIT=5, STATUS_FILTER='Ready For Collection', ENABLED=false, PUSH_TIMEOUT_MS=45000.
§
HAFJET ops: manual ~/HAFJET-Operating-Manual-v1.md. Content Auto: Brand HAFJET, Raub+MY, Threads/IG/FB/TikTok, tone mesra/BM, CTA wa.me/60198021500, 12:30&20:30 MYT, TG 1485374469. Spec: automation-workflow-dev/references/hafjet-content-automation-spec.md
§
Cloud: Oracle Pay-As-You-Go (4C/24GB ARM, 149.118.152.50). Tailscale 100.124.99.52. SSH: /tmp/hafjet-oracle-key. AD: rOJM:AP-KULAI-2-AD-1. Budget: $10/mo, alert 80%. 19 containers deployed. Ollama qwen2.5:7b on host. WhatsApp AI Bot port 8200 (8000 conflict). GitHub 2024866732/hafjet-backups. UpCloud suspended; AWS t3.micro too small.
§
Supabase ksqrpttesrrnzatgagyh: schema hardened DEPLOYED. fixed_costs RM1300 from DB, vendors 18. RLS 2 pol/table, UNIQUE msg_id. SDK global py3.10/SQL Editor. MCP hanya OpenCode — Hermes tiada MCP tools.
§
Deploy: webhook_v2 ACTIVE :8080 (gunicorn ~/.local/bin py3.10). hafjet-orchestrator-api systemd STOPPED (auto-restart). Hermes venv NO pip; guna /usr/bin/python3. Pickup cron: scripts/run_pickup_live.sh. TG file → MEDIA:.
§
Channels: Official + Legacy(lab). API port 8200.