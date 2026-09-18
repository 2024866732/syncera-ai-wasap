#!/usr/bin/env python3
"""Read-only probe: decode TikTok LIVE WebSocket frames over CDP, report message types.

Answers "is the listener broken or is the room/page quiet?" without posting anything to the
orchestrator. Run it on the Windows host that owns the CDP profile (RTX Windows, Python 3.14):

    python cdp_ws_frame_probe.py --max-sec=90 --reload --force-visible --dump-frames=6

Needs: websocket-client. Loops only frame types + any WebcastChatMessage found.
Never types, clicks, navigates to another URL, or touches chat input.

Flags:
  --max-sec=N        wall bound (default 90)
  --reload           navigate after Network.enable (sockets opened earlier are NOT reported)
  --force-visible    patch document.visibilityState/hidden before the reload
  --dump-frames=N    log raw frame field map for the first N frames
  --cdp=URL          CDP json/list endpoint (default http://127.0.0.1:9223/json/list)
  --match=SUBSTR     tab URL substring to attach to (default tiktok.com)
"""
from __future__ import annotations

import base64
import gzip
import json
import sys
import time
import urllib.request

import websocket

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ARGS = sys.argv[1:]
def opt(name: str, default: str) -> str:
    for a in ARGS:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default

MAX_SEC = int(opt("max-sec", "90"))
DUMP_FRAMES = int(opt("dump-frames", "0"))
CDP = opt("cdp", "http://127.0.0.1:9223/json/list")
MATCH = opt("match", "tiktok.com")
RELOAD = "--reload" in ARGS
FORCE_VISIBLE = "--force-visible" in ARGS

VIS_PATCH = (
    "Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});"
    "Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});"
    "document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);"
)


# --- protobuf wire reading (raw values; never coerce bytes into dicts) ---------
def read_varint(buf: bytes, i: int):
    shift = val = 0
    while True:
        b = buf[i]
        i += 1
        val |= (b & 0x7F) << shift
        if not (b & 0x80):
            return val, i
        shift += 7
        if shift > 63 or i >= len(buf):
            raise ValueError("varint")


def pb_fields(buf: bytes):
    """[(field_no, wire_type, value)] — bytes stay bytes."""
    out, i = [], 0
    while i < len(buf):
        try:
            key, i = read_varint(buf, i)
        except Exception:
            break
        fno, wt = key >> 3, key & 7
        if fno == 0:
            break
        try:
            if wt == 0:
                v, i = read_varint(buf, i)
            elif wt == 2:
                ln, i = read_varint(buf, i)
                if i + ln > len(buf):
                    break
                v = buf[i:i + ln]
                i += ln
            elif wt == 5:
                v, i = buf[i:i + 4], i + 4
            elif wt == 1:
                v, i = buf[i:i + 8], i + 8
            else:
                break
        except Exception:
            break
        out.append((fno, wt, v))
    return out


def gunzip_if(b: bytes) -> bytes:
    if b[:2] == b"\x1f\x8b":
        try:
            return gzip.decompress(b)
        except Exception:
            return b
    return b


def as_text(b: bytes):
    try:
        s = b.decode("utf-8")
    except Exception:
        return None
    return s if s and not any(ord(c) < 9 for c in s) else None


def read_msg(blob: bytes):
    """WebcastResponse.Message -> (type, gunzipped payload) | (None, None)."""
    mtype = body = None
    for f, w, v in pb_fields(blob):
        if f == 1 and w == 2:
            mtype = as_text(v)
        elif f == 2 and w == 2:
            body = v
    return mtype, (gunzip_if(body) if body is not None else None)


def iter_messages(frame: bytes):
    """PushFrame(field 8, gzip) -> [(type, payload)]; falls back to a bare WebcastResponse."""
    inner = next((v for f, w, v in pb_fields(frame)
                  if w == 2 and f == 8 and isinstance(v, bytes) and len(v) > 32), None)
    for buf in ([inner] if inner is not None else []) + [frame]:
        out = []
        for f, w, v in pb_fields(gunzip_if(buf)):
            if f == 1 and w == 2:
                t, b = read_msg(v)
                if t and b is not None:
                    out.append((t, b))
        if out:
            return out
    return []


def chat_of(payload: bytes):
    """ChatMessage payload -> (nickname, content)."""
    user, text = "", None
    for f, w, v in pb_fields(payload):
        if f == 3 and w == 2 and text is None:
            text = as_text(v)
        elif f == 2 and w == 2 and not user:
            for f3, w3, v3 in pb_fields(v):
                if f3 == 3 and w3 == 2:
                    user = as_text(v3) or ""
                    break
    return user, text


def attach():
    tabs = json.loads(urllib.request.urlopen(CDP, timeout=8).read())
    tab = next((t for t in tabs if t.get("type") == "page" and MATCH in (t.get("url") or "")), None)
    if not tab:
        print("NO_TAB", MATCH)
        sys.exit(1)
    ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=20,
                                     origin="http://127.0.0.1:9223", max_size=None)
    n = [0]

    def send(method, params=None):
        n[0] += 1
        ws.send(json.dumps({"id": n[0], "method": method, "params": params or {}}))

    send("Network.enable", {"maxPostDataSize": 0})
    url = tab.get("url") or ""
    if FORCE_VISIBLE:
        send("Page.enable")
        send("Page.addScriptToEvaluateOnNewDocument", {"source": VIS_PATCH})
        print("FORCE_VISIBLE_ARMED")
    if RELOAD or FORCE_VISIBLE:
        send("Page.navigate", {"url": url})
        time.sleep(8)
    ws.settimeout(2.0)
    print("ATTACHED", url)
    return ws


def main() -> int:
    ws = attach()
    start = time.monotonic()
    frames = chats = 0
    socks: dict = {}
    last_hb = start
    try:
        while time.monotonic() - start < MAX_SEC:
            try:
                raw = ws.recv()
            except Exception:
                raw = None
            if raw:
                try:
                    m = json.loads(raw)
                except Exception:
                    m = None
                if m and m.get("method") == "Network.webSocketCreated":
                    p = m["params"]
                    socks[p.get("requestId")] = (p.get("url") or "")[:120]
                    print("SOCK", p.get("requestId"), socks[p["requestId"]])
                elif m and m.get("method") == "Network.webSocketFrameReceived":
                    frames += 1
                    p = m["params"]
                    resp = p.get("response") or {}
                    data = resp.get("payloadData") or ""
                    try:
                        blob = (base64.b64decode(data) if resp.get("opcode") == 2
                                else data.encode("utf-8", "replace"))
                    except Exception:
                        continue
                    if len(blob) < 8:
                        continue
                    if frames <= DUMP_FRAMES:
                        print("RAW", frames, len(blob), [f for f, _, _ in pb_fields(blob)][:16])
                    for t, body in iter_messages(blob):
                        if "chat" in t.lower():
                            u, txt = chat_of(body)
                            chats += 1
                            print(f"CHAT[{chats}] user={u!r} text={txt!r}")
                        else:
                            print("MSG", t, len(blob), "B",
                                  socks.get(p.get("requestId"), "?")[:60])
            now = time.monotonic()
            if now - last_hb >= 30:
                print(f"HB frames={frames} chats={chats} elapsed={round(now - start, 1)}")
                last_hb = now
    finally:
        print(f"STOP frames={frames} chats={chats} elapsed={round(time.monotonic() - start, 1)}")
        try:
            ws.close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
