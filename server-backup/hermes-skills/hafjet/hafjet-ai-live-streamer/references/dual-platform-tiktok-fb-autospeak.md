# Dual-platform TikTok + Facebook CDP auto-speak (verified 2026-08-31)

Queue-native path: Windows CDP listener (both tabs) → `POST /events/comment` → RTX Chatterbox consumer → single `POST /humanaudio` → orch ack.

## Session + platform enum
- Orchestrator `ALLOWED_PLATFORMS = {shopee, tiktok, fb, ig}`.
- Payload **must** use `platform="fb"` not `"facebook"` — otherwise 422.
- Start a **fresh** session: `POST /session/stop` then `POST /session/start` with `{"platforms":["tiktok","fb"],"title":"...","read_only":false}`.
- Leftover sessions (e.g. `chatterbox_pipeline_full_v1` from 28 Aug) stay `active` for days; mixed-platform tests fail until restarted.

## Dual listener (Windows Python314)
- Same Chrome CDP `127.0.0.1:9223` can hold TikTok `/live` and Facebook `/videos/` tabs.
- TikTok selector: `[data-e2e="chat-message"]`.
- FB live comments proven: `div[aria-label*="comment" i] div[dir="auto"]` (29+ nodes). Match `/videos/` or `/live` in URL.
- **JS quoting pitfall:** never embed a CSS selector that contains `"` inside a JS `"..."` string. Build with `json.dumps(sel)` then `document.querySelectorAll(%s)`. Wrong quoting returns `null` silently for **both** platforms.
- Shared rate 1 enqueue / 5s (not per-platform). TikTok will starve FB on a hot room unless Tuan approves a 5+5 quota split.
- ORCH URL on Windows: `http://localhost:18744` (not `127.0.0.1`).
- Log dir: `C:\Users\PC CUSTOM\hafjet-live-listeners\`. Scripts live there or `/tmp` — **zero repo edits**.

## Consumer / GPU
- Loop: `/tmp/autospeak_consumer_loop.py` in `venv-chatterbox`, `skip_lock=True` if owner LT session already up.
- Single `/humanaudio` POST; success = body `code:0`.
- **VRAM spike:** Chatterbox cold load can hit **>10GB** (~10842 MiB) even at 48°C. Honor GPU STOP (>80°C or >10240 MiB). Drain leftover pending; `POST /queue/ack` `{status:cancelled}` for orphan `in_flight`.
- Tunnel: supervised `terminal(background=true)` `-R 18744` with `-J` Office jump. Never leftover `ssh -f`. Health-check from RTX before and after.

## Proven round (`dual_platform_live_v1`)
- Seen TT 80 + FB 44; enqueue 9 TT + 1 FB (shared 1/5s); 10/10 ok_spoke + ack + code:0; RTF median 0.966; GPU max 54°C / 8805 MiB; queue 0/0/0.
- Stub brain may emit `typed_reply` in the decision — **never type into chat**.
