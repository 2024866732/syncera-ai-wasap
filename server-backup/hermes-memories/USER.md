User: Tuan Hafizi, MD HAFJET. Malay/Kelantan dialect; technical for code/hardware. Telegram comms. Nak EXPERIENCE cloud trials (UpCloud $250/14d) — rasa spec power, bukan keep subscription.
§
Constraints: explicit approval for restarts; no code/config with restart; loopback API; D.6 estimates only; 94.7% disk no cleanup; RTSP creds redacted.
§
Hardware: i3-2100 CPU-only, 1GB+4GB swap, Ubuntu 26.04. Cameras: TC74 entrance, C560WS outdoor facial recog, CS-C6N indoor. Disk 94.7%.
§
Projects: cctv-worker (8091 D.3/5/6), xiaomi-ingest (8092 P1 metadata). P1 deployed 2026-08-01. Multi-camera deferred until RSS stable.
§
Sourcing: Shopee/Lazada/TikTok; AAC Hikvision, Dahua MY. Need ONVIF Profile M for AI events.
§
Comms: Telegram, structured. Auto-task-chain preference — proceed through task lists without pausing.
§
n8n setups: basic auth (user hafizi145) + pre-seed N8N_OWNER_EMAIL=hafizi145@local.com to bypass 'valid email' on owner form. Update BOTH .env + docker-compose.yml for new Cloudflare Quick Tunnel URLs, restart with sg docker -c, verify 'Editor is now accessible via' in logs. Workflows live in DB; import JSON via UI. After adding Telegram credential, assign to all Telegram nodes + set chat ID restriction in Trigger node. Content series must output 3 formats (Threads, IG Feed, IG Story cards) + Telegram Approval Block per post.