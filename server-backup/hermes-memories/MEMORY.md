SuperGrok Orchestrator: Research/Content/Strategy/Automation/Copy. SuperGrok=image/video/research; DeepSeek=text automation. Output: practical BM, 2+ angles, copy-paste ready.
§
User: Tuan Hafizi, MD of HAFJET (M) SDN BHD. Casual Malay + Kelantan dialect (goni, sohor, mung, ambo, kito, pacak megah, bersenggoti). Address: 'Tuan Hafizi'.
§
Work style: Execute with verification, root cause analysis. Parallel calls. Scannable bullets/headings. No fabricated output. Batch fixes. Approval before prod deploy. Telegram: max 3-4 sentences + file for long content. Structured tables preferred.
§
Cloud: Oracle Pay-As-You-Go (4C/24GB ARM, 149.118.152.50). Tailscale 100.124.99.52. SSH: /tmp/hafjet-oracle-key. AD: rOJM:AP-KULAI-2-AD-1. Budget: $10/mo, alert 80%. 19 containers deployed. WhatsApp AI Bot port 8200 (8000 conflict). GitHub 2024866732/hafjet-backups. UpCloud suspended; AWS t3.micro too small.
§
Supabase ksqrpttesrrnzatgagyh: schema hardened DEPLOYED. fixed_costs RM1300 from DB, vendors 18. RLS 2 pol/table, UNIQUE msg_id. SDK global py3.10/SQL Editor.
§
Deploy: webhook_v2 ACTIVE :8080 (gunicorn ~/.local/bin py3.10). Hermes venv NO pip; guna /usr/bin/python3. Pickup cron: scripts/run_pickup_live.sh. TG file → MEDIA:.
§
HAFJET Prod: Azure Bot=WhatsApp (Cloud API); Oracle VM=AI+Supabase+Dashboard. POST /api/ai/chat (Azure↔Oracle). DB 5440, API 8200, Dash 8117. Audit-first.
§
SPX Ops: Reminders cron 15min 08-21 MYT. Template spx_ready_pickup (active Meta, expects 2 params: name+tracking — NOT full text!). Bugs fixed: hafjet_reminder_state (not reminder_status), _SPX_TEMPLATES all 8 stages, collection_failed→spx_ready_pickup, template_params=[name,tracking] (not [text]). SPX API=placeholder numbers; Tampermonkey v5.0 auto-scrape (AUTOPILOT.ENABLED=true). is_paused=1 blocks due orders. Kudu: semicolons break, use Python/VFS. ZIP deploy restarts app.
§
HAFJET ops: ~/HAFJET-Operating-Manual-v1.md. Content: Brand HAFJET+Raub, Threads/IG/FB/TikTok, BM casual, CTA wa.me/60198021500, 12:30&20:30 MYT.