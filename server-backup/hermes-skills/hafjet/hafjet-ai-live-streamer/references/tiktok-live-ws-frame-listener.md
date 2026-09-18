# TikTok LIVE comments via CDP WebSocket frames (render-independent)

Verified 2026-09 on `@hafizi.raub/live`, RTX Windows host (`C:\Python314\python.exe`), CDP `127.0.0.1:9223`.
Supersedes DOM scraping for comment *ingestion*. DOM probes stay useful as evidence only.

## Why: the DOM path has a visibility gate

DOM scraping (`[data-e2e="chat-message"]`) is **render-dependent**. TikTok only keeps the chat
node tree live while the page believes it is visible:

| Evidence | Result |
|---|---|
| `document.visibilityState` while Tuan watched another window | `hidden` |
| Same probe, chat container count | `chatMessage: 0`, `commentClass: 0`, `classMessage: 0` |
| `Page.bringToFront` then immediate probe | `visible`, then **6–7 comments in one burst** |
| DOM listener log during the hidden window | log frozen ~10 min, zero `seen_comment` |
| WS frames during the hidden window | room/like/gift still flowing, **`WebcastChatMessage` absent** |

So a hidden tab does not merely hide text — the chat messages are **not delivered to the page at
all**. Symptom is identical to a dead selector, which is why it is easy to misdiagnose. Diagnosis
rule: if comments visibly scroll for Tuan but the listener logs nothing, this is the cause.

Mitigation shipped in the listener: `--force-visible` arms a document-start patch, then navigates:

```python
send("Page.enable")
send("Page.addScriptToEvaluateOnNewDocument", {"source": (
    "Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});"
    "Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});"
    "document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);")})
send("Page.navigate", {"url": live_url})
time.sleep(8)   # let sockets be created AFTER Network.enable
```

Probe confirms the patch takes: `{"vis":"visible","hidden":false}`.

**CONFIRMED EFFECTIVE end-to-end (2026-09-11).** Before the fix: 163 frames, **0** `WebcastChatMessage`
in 27 min. After arming `--force-visible`: real comment *"Aina, screen protector iphone ade jual x ?"*
arrived as frame 184 (2,460 B, `types: ["WebcastChatMessage"], chats: 1`, socket
`wss://webcast-ws.tiktok.com/webcast/im/ws_proxy/...`) → orch `speak` → Chatterbox → `/humanaudio`
`code:0` (RTF 0.693). Always log `req_id → sock_url`; the supplement socket is where chat rides.

## When the live ENDS the chat socket dies — do not chase it (2026-09-11)

A 2-hour run recorded 0 comments while looking perfectly healthy. Cause was **not** the listener:

| Time (MYT run) | Event |
|---|---|
| run start | chat socket `webcast-ws…/ws_reuse_supplement/` created |
| **+59 s** | `webSocketClosed` on that socket — the live had **ended** |
| next ~1 h 54 m | 250 frames from keepalive sockets, `chat_msgs: 0` |

The page title stays `"… is LIVE - TikTok LIVE"` (stale) — the reliable signal is the **body text**:
`"HAFIZI GAMING LIVE has ended"`. A slice of the first ~400 chars misses it (it sits past the
"Suggested LIVE creators" sidebar), so probe with an explicit test, never a truncated text dump:

```js
document.body.innerText.match(/live has ended|has ended/i)
```

Hardening now in the listener:

- `chat_socket_open` / `chat_socket_closed` events track the socket that carries chat.
- **Auto re-attach**: if that socket dies (`need_reload`) or none has existed for `CHAT_SOCK_GAP_S`
  (120 s), navigate through `about:blank` first (a plain same-URL reload does **not** recreate the
  reuse socket) then back to the live URL; cooldown 20 s, cap `MAX_RELOADS`.
- **Room-live probe** every 60 s → `room_state` event, `room_live` on every heartbeat.
  While `room_live: false`, re-attach is **suppressed** so an offline room cannot burn the reload
  budget in a pointless reload storm. When the room goes live again the next probe flips it to
  `true` and the normal re-attach fires — so a listener left running **auto-attaches** to the new live.
- `reloads`, `chat_socks`, `room_live` are logged on every heartbeat and in the `stop` record, so
  "deaf but healthy" is now immediately visible instead of hiding behind a rising frame counter.

Diagnosis order for "listener runs but no replies": (1) `room_live` — did the live end?
(2) `chat_socks` — is the chat socket alive? (3) visibility patch armed? (4) frame types present?
Never conclude "selector broken" or "host account filtered" (host comments pass through fine).

## Brain model + VRAM budget (locked 2026-09-11)

| Item | Value |
|------|-------|
| Aina LLM | **`groq/compound-mini`** — 70,000 TPM, ~1.2 s, clean JSON, no `<think>` |
| Rejected | `openai/gpt-oss-20b` (8,000 TPM → `llm_error` ~every 3rd comment) · `qwen/qwen3.6-27b` (0/3 valid JSON, emits `<think>`) |
| Egress | `ALL_PROXY=socks5h://127.0.0.1:10808` via RTX SOCKS (direct from Azure = CF 1010) |
| VRAM live | ~10,050–10,205 MB during speech; keep **≥600 MB** under the **10,752 MB** inner CB |

The consumer's inner CB (`~10,752 MB`) is the binding limit, **not** the 11,000 MB script guard — it
fires first and stops the run with `blocked_circuit_breaker`. Model-picking harness: `/tmp/pick_groq_model.py`.

## Frame decode recipe (the part that took several iterations)

TikTok live IM sends a `PushFrame` envelope, not a bare `WebcastResponse`:

```
PushFrame
  field 5  repeated Header {key,value}   # compress_type=nones|gzip, im_cursor, server_time
  field 8  payload bytes                  # gzip'd WebcastResponse
WebcastResponse
  field 1  repeated Message { 1: type(string), 2: payload(bytes) }
ChatMessage payload
  field 2  User  { 3: nickname }
  field 3  content        <-- comment text
```

Walk it with a raw varint/wire-type reader; gunzip when the value starts with `\x1f\x8b`:

```python
inner = next((v for f, w, v in pb_fields(frame)
              if w == 2 and f == 8 and isinstance(v, bytes) and len(v) > 32), None)
resp = gunzip_if(inner if inner is not None else frame)      # fall back to bare shape
msgs = [(t, gunzip_if(b)) for f, w, v in pb_fields(resp) if f == 1 and w == 2
        for t, b in [read_msg(v)]]                            # read_msg: 1->type str, 2->payload bytes
```

Chat types to match on: `WebcastChatMessage` (the one that matters). `WebcastRoomUserSeqMessage`,
`WebcastMemberMessage`, `WebcastLikeMessage`, `WebcastGiftMessage`, `WebcastGiftPanelUpdateMessage`,
`WebcastCapsuleMessage` are the noise floor and confirm the pipe is healthy when chat is quiet.

## Pitfalls

1. **Never decode a payload-carrying field through a generic `pb_map()` that converts bytes to a
   nested dict.** The `bytes` value is silently replaced by a dict and `ChatMessage.content` is then
   unreachable — the parser reports types perfectly while always finding `chats: 0`. Read fields raw
   (`pb_fields`) for anything that will be gunzipped or re-parsed.
2. **A WebSocket created before `Network.enable` is not reported.** Attaching to an already-open live
   tab yields only keepalive frames (`opcode 1`, payload `"hi"`, 2 bytes) while the real IM socket
   (`wss://webcast-ws.tiktok.com/webcast/im/...`, then `im-ws-sg.tiktok.com`) stays invisible. Always
   navigate/reload **after** enabling Network — `--reload` / `--force-visible` both do this. Belt and
   braces: auto-reload if `frames == 0` after 25 s.
3. **Bursts must be queued, not dropped.** A strict `if now - last_enq < RATE_S: continue` permanently
   discards every 2nd+ comment of a burst (seen 6 arrive together, 1 dispatched, rest lost forever).
   Use a FIFO deque + drip dispatch one per `RATE_S`; only genuine spam/duplicates are filtered.
   Leftover queue length is logged on stop so nothing is hidden.
4. **WSL env vars are not inherited by a Windows `.exe`.** `WS_MAX_ENQ=… /mnt/c/Python314/python.exe …`
   silently runs with defaults. Pass CLI flags (`--capture-only --max-sec= --max-enq= --rate-s= --log=`)
   and keep env as an optional override.
5. **Diagnostics are load-bearing.** Log `req_id → sock_url` from `Network.webSocketCreated`, the
   handshake status, the per-frame field map for large frames, and a 30 s heartbeat carrying
   `frames / chat_msgs / queued / enqueued / queue`. Without frame-type logging this failure mode is
   indistinguishable from an empty room.
6. **Refresh the Windows-side copy every time.** Editing `/tmp/cdp_ws_listener.py` on WSL does nothing
   until it is copied to the Windows dir (`C:\Users\PC CUSTOM\hafjet-live-listeners\`). `write_file`
   cannot target `C:\…` paths from Linux — `scp` to `/tmp` then `cp` on the host, then `py_compile`.
7. **`/tmp` on RTX WSL is wiped across reboots** — re-scp the consumer/listener scripts before launch.

## Commands

```bash
# diagnostics only, no orchestrator traffic
/mnt/c/Python314/python.exe .../cdp_ws_listener.py --capture-only --reload --max-sec=90 --dump-frames=6

# production: reload + visibility patch, cap 10, 30 min window
/mnt/c/Python314/python.exe .../cdp_ws_listener.py --reload --force-visible \
  --max-sec=1800 --max-enq=10 --rate-s=5
# launch detached via start_ws_listener.ps1 -> "WS_LISTENER_LAUNCHED" (SSH exit 124 is normal)
```

Reduce-only probe for a future session: `scripts/cdp_ws_frame_probe.py`.

## Verified evidence

- Frame 10,250 B → `types: ["WebcastCapsuleMessage"]`; frame 2,258 B → `WebcastChatMessage`, `chats: 1`.
- Real comment "Aina kedai bukak ke hari ni?" decoded (user + text intact) → orch `speak` →
  Chatterbox → `/humanaudio` `code:0`. Filter did **not** drop the host's own account
  (`HAFJET MALAYSIA` passed through and enqueued), so a missing reply is never "host is filtered".
