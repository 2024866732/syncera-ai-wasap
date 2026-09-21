# G4c prep — Shopee + IG live listeners (2026-09-20)

Prep only. **G4c soak is NOT closed.** No real Shopee/IG room was attached.

## Glue lock (do not drift)

| Wrong | Right |
|-------|--------|
| `POST /api/speak_queue` | **`POST /events/comment`** |
| field `author` | field **`user`** |
| platform `instagram` / `facebook` | **`ig`** / **`fb`** |

Payload: `event_id, platform, user, text` (+ optional `ts`, `live_id`).
Same client as G4a: `listeners/orchestrator_client.py`.

Spam: emoji/symbol-only or `<2` chars (TikTok class). Dedup: event_id + norm text / 60s.

## Capture strategy

### Shopee Live — **build first**
- Desktop web live exists (`live.shopee.com` / `.com.my`). Same CDP class as TikTok: enable `Network`, then `webSocketFrameReceived`.
- Chrome profile + Tuan login required (seller or watcher). Cookies stay on the Windows node.
- Shopee Open Platform **Webchat Push** = seller↔buyer IM, **not** live comments. Do not wire it.
- Frame JSON shape is **unknown until capture-only dump**. Fixture uses a synthetic `type=live_comment` contract that the first dump will replace.

### Instagram Live — **second**
- Graph API: comments on live IG media **not supported**.
- Unofficial **MQTT** realtime is a mobile dialect — do not clone (`instagram_mqtt`); ban/ToS risk.
- HITL path = headed `instagram.com` live viewer via CDP **DOM first** (like FB), WS second if sockets appear.
- Web comments are historically thin vs the app. Treat as high-fragility.

## Files shipped (fixture-first, `--post-orch` refused)

```
listeners/g4c_live_glue.py
listeners/shopee_live_listener.py
listeners/ig_live_listener.py
listeners/fixtures/shopee/live_ws_frames.jsonl
listeners/fixtures/ig/live_dom.html
tests/test_g4c_shopee_ig_live_fixtures.py   # 5 passed
```

G4a `listeners/shopee.py` + `ig.py` (Playwright fixture stubs) left untouched.

## Next (needs `approve G4c shopee capture-only` + live URL)

1. Headed Chrome profile `hafjet-live-listeners/profiles/shopee` on RTX Windows.
2. Capture-only CDP dump of WS URLs + 20 frames (no orch POST).
3. Replace `parse_shopee_ws_frame` with the real shape.
4. Only then a bounded enqueue soak. IG after Shopee parser is green.
