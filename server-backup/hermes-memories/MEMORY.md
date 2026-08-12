SuperGrok Orchestrator: Research/Content/Strategy/Automation/Copy. SuperGrok=image/video/research; DeepSeek=text automation. Output: practical BM, 2+ angles, copy-paste ready.
§
User: Tuan Hafizi, MD of HAFJET (M) SDN BHD. Casual Malay + Kelantan dialect (goni, sohor, mung, ambo, kito, pacak megah, bersenggoti). Address: 'Tuan Hafizi'.
§
Work style: Execute+verify, RCA. Phased SRE (diagnose→CTO approve→fix); strict report formats. Parallel calls. Scannable tables. No fabrications. Approval before prod/other services. TG short+file for long. Mask secrets; no force-push.
§
Oracle LIVE hafjet-oracle A1 4OCPU/24GB +4G swap(swappiness=10) ap-kulai-2; pub 149.118.152.50; TS 100.124.99.52; SSH ubuntu+/tmp/hafjet-oracle-key; bot :8200 host-net, Python healthcheck (no curl on slim); compose ~/HAFJET-AI-WhatsApp-Bot; GH push needs deploy key. Ollama qwen2.5:7b.
§
Supabase ksqrpttesrrnzatgagyh: schema hardened DEPLOYED. fixed_costs RM1300 from DB, vendors 18. RLS 2 pol/table, UNIQUE msg_id. SDK global py3.10/SQL Editor.
§
Deploy: webhook_v2 ACTIVE :8080 (gunicorn ~/.local/bin py3.10). Hermes venv NO pip; guna /usr/bin/python3. Pickup cron: scripts/run_pickup_live.sh. TG file → MEDIA:.
§
HAFJET Prod: Azure Bot=WhatsApp (Cloud API); Oracle VM=AI+Supabase+Dashboard. POST /api/ai/chat (Azure↔Oracle). DB 5440, API 8200, Dash 8117. Audit-first.
§
SPX: cron 15min 08-21 MYT; template spx_ready_pickup=[name,tracking]; state col hafjet_reminder_state; TM v5 autopilot; is_paused=1 blocks; Kudu no ; use VFS.
§
HAFJET ops: ~/HAFJET-Operating-Manual-v1.md. Content: Brand HAFJET+Raub, Threads/IG/FB/TikTok, BM casual, CTA wa.me/60198021500, 12:30&20:30 MYT.
§
M2U PDF→expenses auto after first OK: SUPABASE_SECRET_KEY; category_source=manual; idempotent receipt_number. E-PAY JomPAY 2360→vendor 6c8e862b… utilities/transfer. Label 'Expenses Lori'→misc+notes. Shopee vendor e33a06c1…
§
n8n Hermes-only (not Oracle): hafjet-n8n @ n8n.hafjet.my. content-api :9119 captions(OpenRouter)+images(GOOGLE_API_KEY Gemini). Never paste keys in TG chat. n8n 2.8 activate=published_version+history. Pause schedule via node disabled; keep workflow active for HITL 1485374469. Image 429→text fallback.