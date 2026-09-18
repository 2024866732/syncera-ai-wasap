# LiveTalking + Chatterbox VRAM ceiling & session-picking (HAFJET rig)

Three defects found 2026-09-12 during a live where Aina went silent. All three
looked like one bug; they are independent.

## 1. `ambiguous_sessions` — orphan session beside the live one

`~/hafjet-live/bin/livetalking_glue/speak_queue_consumer.py` → `discover_session()`
did `count == 1` → use, else report `ambiguous_sessions` and the consumer ACKed
`cancelled`. LiveTalking keeps a session object in memory after its browser peer
is gone (observed: `avatar_id: sarah`, `REF_FILE: ""` orphan next to the live
`Aina` / `ms-MY-YasminNeural` session) → count 2 → every speak aborted.

**Fix (HAFJET_SESSION_PICK_V1, deployed):** rank sessions and pick, don't give up.

```python
LT_AVATAR_PREF = os.environ.get("LT_AVATAR_PREF", "Aina").strip()

def _session_pref(s: dict) -> tuple:
    aid = str(s.get("avatar_id") or "").strip()
    ref = str(s.get("REF_FILE") or "").strip()
    pref = 1 if (LT_AVATAR_PREF and aid.lower() == LT_AVATAR_PREF.lower()) else 0
    return (pref, 1 if ref else 0)
```

- `best == (0, 0)` → keep the legacy strict ambiguity report (nothing to rank).
- several sessions tied at `best` → `count: len(tied)`, `reason: ambiguous_preferred`.
- exactly one best → `count: 1` + `sessionid` + `avatar_id` + `orphans_ignored`.

Verified with 5 mocked cases, including the real live pair (orphan `sarah` +
live `Aina` → picks Aina). Old file backed up next to it as
`speak_queue_consumer.py.bak.hafjet-<ts>`.

## 2. Listener room-live probe: false "ended" → reload churn

`cdp_ws_listener.py` decided liveness by scraping `document.body.innerText` for
LIVE-TAMAT markers. TikTok's own LIVE page carries a **"Suggested LIVE creators"**
sidebar, so the marker matched on a healthy room and the listener cried
`live: false` → reload every 120 s (17 reloads observed), and a reload costs
~10 s of lost chat frames each time.

**Fix (deployed):** probe the `<video>` element instead — a real live reports
`duration === Infinity` and `!paused`; an ended room has no playing video. Also
auto-click TikTok's "Watch on computer" block ("Couldn't watch this LIVE because
you're watching it on your TikTok app") — that page state yields **no chat socket
at all** (`chat_socks: 0`) and no video, so it must be cleared, not reloaded:

```
stream_blocked → click "Watch on computer" → video appears (720x1280, duration inf)
```

Plus offline reload slowed 120 → 300 s (`WS_OFFLINE_RELOAD_S`) and live probe
30 s (`WS_LIVE_CHECK_S`). After the fix: `reloads: 0`, `chat_socks: 5`,
`chat_msgs` climbing, `room_live` true then correctly false when the live ended.

## 3. VRAM ceiling: TTS model never released → circuit breaker kills the loop

Symptom: consumer speaks **exactly one** utterance, then every later job returns
`blocked_circuit_breaker` at the `polish` gate and the loop exits
(`stop_reason: non_ok_status`). Temperature is innocent (~52 °C).

Measured budget (RTX 4070 12 GB = 12,282 MB):

| State | VRAM |
|---|---|
| LT only (idle, session up ~19 h) | 6,991 MB |
| + Chatterbox multilingual TTS resident | **10,937 MB** |
| `circuit_breaker.py MEM_STOP_MB` | 10,752 MB |
| `hafjet_tts_adapter.py CB_STOP_VRAM_MB` | 11,000 MB |

`hafjet_tts_adapter.py` has `IDLE_UNLOAD_S = 600` and an `unload()` that does
`del self._model; torch.cuda.empty_cache()`, but **nothing calls
`maybe_unload_idle()` or `.unload()`** — the model stays on the GPU for the life
of the consumer process. So idle VRAM (10,937) sits above the CB stop line
(10,752) and every job after the first is refused.

First job of a run takes ~30 s extra (model load; `wall_s 62.68` vs ~6 s warm).
So "unload after every utterance" is correct-by-the-rules but costs ~35-60 s of
latency per reply; "raise MEM_STOP to 11,000" is fast but leaves ~63 MB of buffer
and needs Tuan's explicit approval (it is a safety threshold).

Durable fixes to weigh (NOT applied — needs approval):
1. unload TTS before the CB gate when `vram > MEM_WARN_MB` (no threshold change),
2. restart LT fresh before each live and/or drop `batch_size` (16) to shrink LT's
   6,991 MB — the 19 h session had grown ~500 MB over its historical 6,475 MB,
3. raise `MEM_STOP_MB` — safety change, approval required.

## Order of diagnosis (cheap → decisive)
1. `curl :8010/api/admin/sessions` — how many sessions, who owns them.
2. Client tab via CDP: `connectionState` / `signalingState` / `<video>.readyState`
   (the in-page error banner lies and auto-hides after 8 s).
3. `grep heartbeat <listener>.log` → `room_live`, `chat_socks`, `reloads`, `enqueue`.
4. Consumer report jsonl → per-job `status`, and the `gpu_after.vram_used_mb`.
5. `nvidia-smi` + who holds the memory+ `grep -rn "empty_cache\|\.unload()"`.

**Never** trust a single green metric: the live looked healthy while `room_live`
was false, the client looked broken while `connected`, and the consumer looked
dead while the only fault was a resident TTS model above the CB line.
