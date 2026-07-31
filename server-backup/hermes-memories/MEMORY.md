PC Office: 100.121.94.41 Tailscale, i3-2100, 16GB, Ubuntu 26.04. Buzz relay RUNNING ws://100.121.94.41:3000. Hermes v0.19.0 :9119 auth. LiteLLM :4000. SOP: no curl|bash, uv not pip, sudo needs pwd.
§
HAFJET ops ref: /home/hafizi145/HAFJET-Operating-Manual-v1.md; Tuan approval overrides.
§
CRITICAL: cctv-worker restarts need explicit Tuan approval only. Never auto-restart.
§
CCTV: UI changes need rendered proof; investigations need time-series. Camera 2 deferred (RSS leak).
§
Composio: kamellperry/hermes-composio, Gmail+GitHub active. LiteLLM PC: 10 models, systemd.
§
VPS Azure: 1GB+4GB swap, 29GB disk. df -h / monitor. >90% cleanup: rm -rf ~/.cache/pip && uv cache clean. Key rotation: rotate immediately if leaked.
§
Buzz: deploy/compose/compose.yml, ./run.sh start/stop. Nostr keypair via coincurve. relay_url ws:// for Tailscale.
§
Hermes gateway: can't pkill/restart from session. Tuan restarts manually. Non-loopback bind = auth required.
§
HAFJET Content Automation Config: Brand=HAFJET, Business=Repair telefon/gadget/servis digital, Location=Raub Pahang + Malaysia, Audience=Pemilik iPhone/Android, pembeli gadget, pemilik bisnes kecil, Platforms=Threads/Instagram/Facebook/TikTok, Tone=Mesra/jujur/teknikal mudah faham/local/tidak hard-sell, CTA=WhatsApp HAFJET untuk tanya masalah/booking repair, Posting times=12:30 PM & 8:30 PM Asia/Kuala_Lumpur, Telegram Chat ID=1485374469. Full spec: automation-workflow-dev/references/hafjet-content-automation-spec.md
§
HAFJET WhatsApp CTA: https://wa.me/60198021500
§
HAFJET Content Automation: Visual generation = AI image generation + AI caption (both AI-generated)
§
n8n: container hafjet-n8n (v2.8.4) running on :5678, docker-compose at ~/.n8n/, login hafizi145/changeme123. WEBHOOK_URL+N8N_PROXY_HOPS set. Use `sg docker -c` for docker. docker-compose at ~/.local/bin/. Workflow JSON: ~/.n8n/workflows/hafjet-content-automation.json (17 nodes). Quick tunnel temporary - re-setup when URL changes. Telegram bot pending @BotFather creation.
§
Cloudflared installed at /usr/local/bin/cloudflared (v2026.7.3). Quick tunnel: cloudflared tunnel --url http://localhost:5678. Tunnel URL temporary, changes on restart.