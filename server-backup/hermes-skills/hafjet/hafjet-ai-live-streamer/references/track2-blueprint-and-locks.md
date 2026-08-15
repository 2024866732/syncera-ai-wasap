# Track 2 Blueprint + Session Locks

Condensed from Tuan Hafizi's 2026-08-15 blueprint + design Q&A. Not a substitute for the live SKILL.md locks table.

## Intent

- Full control, no vendor lock-in
- Scale to Shopee Live + TikTok Live + Facebook Live + Instagram Live
- Avatar end-state: wanita berhijab, professional-santai
- Persona: santai slang uni Malaysia (BM + English)
- Integrate with existing Hermes / LangGraph

## Architecture (high level)

1. Product catalog (static curated JSON/SQLite in v0.1) ↔ knowledge base  
2. Hermes Live Sales Agent (Aina) — script + optional comment reply  
3. TTS engine  
4. LiveTalking digital human  
5. Virtual camera / WebRTC  
6. OBS scenes + overlays + multi-RTMP  
7. Four marketplace destinations  

Comment flow (when unlocked): Listener → filter → agent → reply → TTS → LiveTalking interrupt → OBS.

## Session locks (2026-08-15)

| Topic | Choice |
|-------|--------|
| v0.1 platform architecture | Multi-platform day-1 (4 RTMP slots in design/OBS) |
| Avatar | Synthetic face PoC first; custom hijab train later |
| Catalog | Static JSON/SQLite, manual pre-live update |
| Comments | **Unresolved** — re-ask (display / manual TTS / auto 1 / auto 4) |

## Execution order (from blueprint; still approval-gated)

1. Setup LiveTalking on RTX 4070 (local recommended)  
2. Prepare synthetic avatar; later train hijab  
3. Extend Hermes agent with Aina prompt + product tools  
4. Pipeline text → agent → TTS → LiveTalking (text input first)  
5. OBS + multi-RTMP (Shopee + TikTok first in ops maturity, all four slots wired)  
6. Offline E2E → private short live → public  

## Infra reality check (Hermes-Server session)

- Azure Hermes-Server: unsuitable for LiveTalking (RAM ~1GB, disk often tight)  
- PC Office: CPU-only — not real-time avatar host  
- RTX WSL2 `hafjet@100.119.32.87`: correct GPU host; shares card with CCTV YOLO offload  

## Upstream

- LiveTalking: https://github.com/lipku/LiveTalking  
- MuseTalk guidance in upstream README (higher VRAM class)  
