# LiveTalking client `/offer` storm → "Called in wrong state: stable"

## Symptom
- Client banner: `Failed to set remote answer sdp: Called in wrong state: stable`
- LT server log: ~12 sessions created in 16 s (`Creating sessionid ... session num=0` repeated), then `num=1`, then `num=2`
- Consumer report gets `status: ambiguous_sessions` → Aina goes SILENT

## Root cause (two parts)
1. **Client bug** — `negotiate()` in `~/hafjet-live/LiveTalking/web/index.html` reads the
   GLOBAL `pc`. Every Start click creates a NEW `RTCPeerConnection` and overwrites `pc`
   while the previous `/offer` is still in flight. The stale answer then lands on a pc
   whose `signalingState` is already `stable` → exactly this error.
   Every `POST /offer` also makes the server create a NEW session, so 2 sessions exist →
   `discover_session()` → `ambiguous_sessions` → job acked **cancelled**.
2. **The banner lies** — the page can be fully `connected` (video 400x736, `connectionState: connected`)
   while the red banner is shown, and it auto-hides after ~8 s (`err_visible: false`).
   NEVER trust the banner. Probe `pc.connectionState` + `pc.signalingState` instead.

## The 8-container rule that decides whether Aina speaks
`discover_session()` lives in `~/hafjet-live/bin/livetalking_glue/speak_queue_consumer.py`
(module path `livetalking_glue.speak_queue_consumer`). It calls `/api/admin/sessions` and:
- `count == 0` → `no_active_session`
- `count == 1` → OK, use it
- `count != 1` → `ambiguous_sessions`

Both failure modes ack the job **cancelled** — the rig looks healthy but Aina never speaks.
So: **exactly ONE WebRTC client tab, exactly ONE LT session.**

## Probe the live page (CDP, from Windows python with `websocket`)
```js
(() => {
  const o = {url: location.href, hasPc: (typeof pc !== 'undefined' && pc !== null)};
  if (o.hasPc) {
    o.signalingState = pc.signalingState; o.connectionState = pc.connectionState;
    o.iceConnectionState = pc.iceConnectionState;
  }
  o.sid = (typeof sessionid !== 'undefined') ? sessionid : null;
  const v = document.querySelector('video');
  if (v) { o.vw = v.videoWidth; o.vh = v.videoHeight; o.vready = v.readyState; }
  return JSON.stringify(o);
})()
```

## Task-literal server check (don't guess)
```bash
cd ~/hafjet-live/bin && ~/hafjet-chatterbox/venv-chatterbox/bin/python -c "
import sys, json; sys.path.insert(0,'/home/hafjet/hafjet-live/bin')
from livetalking_glue.speak_queue_consumer import discover_session, check_livetalking
print(json.dumps({'lt_healthy': check_livetalking(),
                  'discover': discover_session('http://127.0.0.1:8010')}, indent=1))"
```

## Fix — guard in index.html (6 edits, backup first)
1. declare `let __offerSeq = 0; let __offerInFlight = false;`
2. top of `negotiate()`: `const __pc = pc; const __seq = ++__offerSeq; __offerInFlight = true;`
   then use `__pc` for every transceiver/offer/ice call
3. before the `fetch('/offer')`: bail if `__seq !== __offerSeq` (superseded)
4. **before `setRemoteDescription`**: require
   `__pc === pc && __seq === __offerSeq && __pc.signalingState === 'have-local-offer'`
   otherwise DISCARD the answer silently (no UI reset)
5. `catch()` returns early when superseded; `.finally()` clears `__offerInFlight`
6. `start()` early-returns when `pc && pc.signalingState !== 'closed' && pc.connectionState !== 'failed'`

## Deploy WITHOUT killing a live stream
`start()` is manual — there is no autostart — so reloading `index.html` **drops the live
WebRTC session** until a human clicks Start. During a live, hot-patch the RUNNING page:
1. patch the file on disk (persistent, takes effect next load)
2. extract the patched `negotiate`/`start` source by brace matching → JS payload
3. `Runtime.evaluate` the payload into the live tab
   (`negotiate = <src>; start = <src>; window.__offerSeq = 0; window.__offerInFlight = false;`)
4. verify `String(start).includes('already active')`,
   `String(negotiate).includes('have-local-offer')`, `window.__offerSeq === 0`,
   and that `pc.connectionState` is STILL `connected` with the same `sessionid`
Tooling: `/tmp/lt_make_payload.py` (WSL `python3`) → `/tmp/lt_inject_cdp.py`
(Windows `/mnt/c/Python314/python.exe`, which has the `websocket` module).

## Pitfalls
- `fn.length` is **arity, not source length** — `negotiate.length === 0` is CORRECT for a
  no-arg function. Do not read it as "injection failed".
- Close duplicate LT tabs with `GET http://127.0.0.1:9223/json/close/<targetId>`.
  `avatar.html` holds **no** WebRTC connection (`hasPc: false`) — safe to close.
- Never derive room liveness from `document.body.innerText`: "Suggested LIVE creators"
  cards make an ENDED room look live and a LIVE room look ended (false negatives seen:
  `room_live: false` while comments were actively arriving). Use the presence of the chat
  socket (`webcast/im/ws_reuse_supplement`) as ground truth.
- `/mnt/c/...` writes from WSL can hit `[Errno 13] Permission denied` right after killing a
  consumer of that file — retry the copy after a short `sleep`.
