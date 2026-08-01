PC Office: 100.121.94.41 Tailscale, i3-2100, 16GB, Ubuntu 26.04. Buzz relay RUNNING ws://100.121.94.41:3000. Hermes v0.19.0 :9119 auth. LiteLLM :4000. SOP: no curl|bash, uv not pip, sudo needs pwd.
§
HAFJET ops ref: /home/hafizi145/HAFJET-Operating-Manual-v1.md; Tuan approval overrides.
§
CRITICAL: cctv-worker restarts need explicit Tuan approval only. Never auto-restart.
§
CCTV: Cam2 deferred RSS. Tapo no Hub—worker RTSP→/mnt/cctv; event-clip first; TC74 OK; C560WS wait RTSP. Xiaomi Samba separate from Tapo.
§
Composio Gmail+GitHub active. SuperGrok Orchestrator modes: Research/Content/Strategy/Automation/Copy. SuperGrok=research+image/video; DeepSeek=cheap write. Output: practical BM, 2+ angles, copy-paste ready, freeze drafts until revise.
§
VPS Azure: 1GB+4GB swap, 29GB disk. df -h / monitor. >90% cleanup: rm -rf ~/.cache/pip && uv cache clean. Key rotation: rotate immediately if leaked.
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
Xiaomi CCTV NAS WORKS: Samba 192.168.1.252 xiaomi-nas/smbcam @ /mnt/cctv/xiaomi-nas (ACL smbcam +x on /mnt/cctv; never IPC$). Oray X1 112081250984 USB RMA parallel. Ingest P1 APPROVED: sibling :8092 meta+thumb; code ~/.hermes/cache/documents/xiaomi-ingest/; no worker restart.