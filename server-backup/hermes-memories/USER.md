User: Tuan Hafizi, MD HAFJET. Malay/Kelantan; technical. Cost-conscious. AWS+Oracle accounts. UpCloud suspended Aug 2026. Wants cloud for 8 projects.
§
Constraints: explicit approval for restarts; loopback API; D.6 estimates only; RTSP creds redacted. Prefers free cloud; budget-conscious; email: syahrulhafizi101@gmail.com.
§
Hardware: i3-2100 CPU-only, 1GB+4GB swap, Ubuntu 26.04. Cams TC74 / C560WS .226/s2 outdoor / C6N indoor. Disk~94%.
§
Projects: cctv-worker (8091 D.3/5/6), xiaomi-ingest (8092 P1 metadata). P1 deployed 2026-08-01. Multi-camera deferred until RSS stable.
§
Sourcing MY Shopee/Lazada/TikTok; AAC Hikvision, Dahua. Prefer ONVIF Profile M/pro; app-FR not enough.
§
Comms: Telegram, structured BM. Auto-task-chain. Long jobs passive (no hourly spam). SuperGrok-ready summaries when asked.
§
n8n setups: basic auth (user hafizi145) + pre-seed N8N_OWNER_EMAIL=hafizi145@local.com to bypass 'valid email' on owner form. Update BOTH .env + docker-compose.yml for new Cloudflare Quick Tunnel URLs, restart with sg docker -c, verify 'Editor is now accessible via' in logs. Workflows live in DB; import JSON via UI. After adding Telegram credential, assign to all Telegram nodes + set chat ID restriction in Trigger node. Content series must output 3 formats (Threads, IG Feed, IG Story cards) + Telegram Approval Block per post.
§
§