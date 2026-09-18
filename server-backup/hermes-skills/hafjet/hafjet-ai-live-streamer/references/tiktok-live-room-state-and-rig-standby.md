# TikTok LIVE rig: room state, tab drift, and the standby shape (2026-09-11)

Companion to `references/tiktok-live-ws-frame-listener.md` (frame decode + `--force-visible`).
This file covers the two *silent* ways a long run dies, and the launch shape Tuan actually asks for.

> **Supersedes one bullet in the companion file.** That file says: *"While `room_live: false`,
> re-attach is **suppressed** so an offline room cannot burn the reload budget."* That is WRONG and was
> corrected the same day. See "Offline: slow-poll, never suppress" below. If you read the old bullet,
> ignore it.

## 1. The live ended (the run looks perfectly healthy)

A 2-hour run recorded **0 comments** with frames flowing, orch active, consumer polling and GPU nominal.

| Time (from run start) | Event |
|---|---|
| 0 s | chat socket `webcast-ws…/ws_reuse_supplement/` created |
| **+59 s** | `webSocketClosed` on that socket — the live had **ended** |
| next ~1 h 54 m | ~250 keepalive frames, `chat_msgs: 0` |

- Page **title stays** `"… is LIVE - TikTok LIVE"` (stale) — never trust it.
- Reliable signal = body text: `"HAFIZI GAMING LIVE has ended"`.
- Probe with an explicit test, **never** a truncated `innerText` slice:

```js
(()=>{const t=document.body?document.body.innerText:'';
      return JSON.stringify({ended:/live has ended|has ended/i.test(t), len:t.length});})()
```

A ~400-char slice misses it because "has ended" sits *past* the "Suggested LIVE creators" sidebar.
(The first probe written did exactly that and reported `ended:false` on a dead room.)

Mitigation: `room_state` event every 60 s (`LIVE_CHECK_S`), `room_live` on every heartbeat.

## 2. Offline: slow-poll, never suppress

`OFFLINE_RELOAD_S` (120 s): while `room_live: false` the listener **keeps reloading the room URL,
slowly**. The first version of this fix suppressed reload entirely to save the budget — that made a
standby rig *permanently deaf*, because a room page that is never re-fetched can never discover a
**new** live. Budget is protected by spacing (120 s) + cooldown (`RELOAD_COOLDOWN_S` 20 s) +
`MAX_RELOADS`, not by suppression.

Consequence, and it is a feature: a listener left running **auto-attaches to the next live** within
~120 s. This is why the honest standby status line to Tuan is
*"listener running + `room_live: false` + menunggu live"* rather than stopping everything.

## 3. The CDP tab drifted away from `/live`

`attach_err: no tiktok /live tab in CDP` repeating every 5 s forever = the **tab** is gone, not the
socket and not the decoder. Seen when the TikTok tab sat on `https://www.tiktok.com/` (homepage):
Chrome had 16 processes, CDP on `127.0.0.1:9223` answered fine, `/json/list` showed the homepage.

Recovery now built in — the listener opens the room itself:

```python
url = "http://127.0.0.1:9223/json/new?" + urllib.parse.quote(ROOM_URL, safe="")
req = urllib.request.Request(url, method="PUT")      # PUT, not GET — a GET errors out
```

- One attempt per `OPEN_TAB_COOLDOWN_S` (30 s) so a bad URL can't become a request storm.
- Room URL from `--room-url=` (CLI) or `WS_ROOM_URL`; default `https://www.tiktok.com/@hafizi.raub/live`.
- Proven: `opened_live_tab … target_id 047A9AB9036300EB`, then the tab list showed the `/live` page.
- Add `--room-url=` to the launcher whenever the room changes; it beats editing the script.

## 4. Diagnosis order for "listener runs but Aina never replies"

1. `room_live` — did the live end? (`room_state` event / heartbeat field)
2. Is there a `/live` tab at all? (`cdp_diag.py`: `/json/version` + `/json/list` page URLs)
3. `chat_socks` — is the chat-carrying socket alive?
4. Is the `--force-visible` visibility patch armed?
5. Do frames carry `WebcastChatMessage`? (vs only Member/Like/Gift/RoomUserSeq noise)

Only after all five: suspect the decoder. Never "selector broken", never "host account filtered" —
host comments pass through and enqueue fine.

## 5. Standby rig shape Tuan wants

Tuan opens the live **himself**, then wants the rig (re)launched; between lives he wants the orch
session left **alive on standby**, not stopped.

| Piece | Launch (2026-09-11) |
|---|---|
| Listener | `cdp_ws_listener.py --reload --force-visible --max-sec=14400 --max-enq=300 --rate-s=5` via `start_ws_listener.ps1` → `"LISTENER_LAUNCHED cap=300 max_sec=14400"` (SSH exit 124 is normal) |
| Consumer | `VAL_ORCH_URL=http://127.0.0.1:18744 MAX_JOBS=300 MAX_SEC=14400 ~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/autospeak_consumer_loop.py` |
| Orch | leave `hafjet-orch.service` active; `POST /session/start` once — the session is **in-memory**, so restarting orch silently drops it and `event_count` resets to 0 (re-`/session/start` after every orch restart) |
| Readiness evidence | queue `0/0/0`, `/session` active, `ss -lntp \| grep 10808` (SOCKS *listening*, not just `is-active`), tunnel 18744 → orch 200, LT `:8010` `speaking:false`, VRAM |

Cap/window are Tuan's stated numbers: **cap 300 comments**, **4 h window** for a live session
(`--max-enq=300 --max-sec=14400`, `MAX_JOBS=300 MAX_SEC=14400`). A 2-hour window plus cap 10 is the
*old* short-run shape and will self-terminate mid-live.

## 6. Two operational gotchas found while redeploying

- **Env defaults must be bound BEFORE the argv loop.** `DUMP_FRAMES = int(os.environ.get(
  "WS_DUMP_FRAMES","5"))` placed *below* `for _a in sys.argv[1:]` silently overwrote
  `--dump-frames=N` — the flag looked implemented and did nothing. Bind env defaults above the loop;
  when the loop re-binds a later-declared name, use `globals()["NAME"] = value`.
- **Replacing the Windows listener file needs a pause after the kill.** `cp -f` to
  `C:\Users\PC CUSTOM\hafjet-live-listeners\cdp_ws_listener.py` returned
  `[Errno 13] Permission denied` while the dying python still held the file (same for `py_compile`
  of that path). Working sequence: `kill_ws_listener.py` → `sleep 3` → `cp -f` → `py_compile`
  (require `COMPILE_OK`) → launch the `.ps1`.
- **`curl` → Windows-python one-liner over SSH mangles CDP JSON** (`CDP_PARSE_FAIL … char 0`, CRLF).
  Use a file: `/tmp/cdp_diag.py` (`/json/version`, `/json/list`, page URLs), `scp`, run with
  `C:\Python314\python.exe`. Same rule for any multi-line inline `python -c` over SSH.
