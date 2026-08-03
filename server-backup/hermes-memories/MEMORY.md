PC Office: 100.121.94.41 Tailscale, i3-2100 2C/4T, 16GB RAM, Ubuntu 26.04. (1GB+4GB swap = Azure Hermes VPS only, NOT Office PC.)
§
HAFJET ops ref: /home/hafizi145/HAFJET-Operating-Manual-v1.md; Tuan approval overrides.
§
CCTV: worker restart needs approval except Opt A 6h timer cctv-worker-restart /etc (00/06/12/18 UTC). Opt C live: face_attr load/unload D.6. TC74 .94/s1; C560WS .226/s1 (VLC ok, Frigate 401); C6N indoor. Frigate 0.17.2 :5000 loopback 1-cam soak 720p@3fps; C560WS draft 540p@2fps pending. Multi-cam gated. No pkill app.main.
§
Composio Gmail+GitHub active. SuperGrok Orchestrator modes: Research/Content/Strategy/Automation/Copy. SuperGrok=research+image/video; DeepSeek=cheap write. Output: practical BM, 2+ angles, copy-paste ready, freeze drafts until revise.
§
Azure: 1GB+4GB swap. UpCloud Frankfurt: 94.237.88.114, TS 100.98.171.12, 2C/4GB/80GB. Command Center :80 threaded proxy. Docker 172.17.0.1 gateway. FastAPI 404=UP. Ollama localhost-only. SSH /tmp/hafjet-trial-key. Grok v0.2.118 installed, XAI auth pending.
§
Buzz: deploy/compose/compose.yml, ./run.sh start/stop. Nostr keypair via coincurve. relay_url ws:// for Tailscale.
§
Hermes gateway: can't pkill/restart from session. Tuan restarts manually. Non-loopback bind = auth required.
§
HAFJET Content Auto: Brand HAFJET, repair/gadget Raub+MY, platforms Threads/IG/FB/TikTok, tone mesra/jujur/local/no hard-sell, CTA wa.me/60198021500, post 12:30&20:30 MYT, TG 1485374469, visual AI image+caption. Spec: automation-workflow-dev/references/hafjet-content-automation-spec.md
§
n8n hafjet-n8n :5678, compose ~/.n8n/, docker `sg docker -c`, compose bin ~/.local/bin/docker-compose. Workflow ~/.n8n/workflows/hafjet-content-automation.json. cloudflared Quick Tunnel temp (rebind WEBHOOK_URL+N8N_PROXY_HOPS=1). No bot tokens in chat—n8n Credentials only. TG bot pending BotFather.
§
TTS: provider edge, voice ms-MY-YasminNeural (Melayu MY perempuan). xAI TTS tiada ms.
§
Xiaomi NAS Samba 192.168.1.252→/mnt/cctv/xiaomi-nas. Ingest P1 :8092 LIVE prod recordings path+DB. Passive monitors: final/critical/≥900MB/crash/blocker only. SSH tunnels from laptop not server.