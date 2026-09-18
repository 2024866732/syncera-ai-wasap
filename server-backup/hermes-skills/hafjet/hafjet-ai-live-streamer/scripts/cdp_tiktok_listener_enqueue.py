#!/usr/bin/env python3
"""CDP TikTok live listener -> Hermes /events/comment (ALL comments, bounded).

Proven shape (2026-08-28): reads TikTok live chat via Chrome CDP loopback
(127.0.0.1:9223), enqueues every visible chat-message to the Hermes orchestrator
(/events/comment, platform=tiktok, unique event_id), bounded to MAX_ENQ jobs and
MAX_SEC seconds. Minimal spam guard (skip emoji-only / <2 chars / host pin).
Does NOT touch chat input, typed reply, /human, /offer, /interrupt_talk.

Run on RTX (venv-chatterbox, after `uv pip install websocket-client`):
    VAL_ORCH_URL=http://127.0.0.1:18744 python cdp_tiktok_listener_all.py [MAX_ENQ] [MAX_SEC]

Keyword-filter variant: filter comments by KEYWORDS ("test"/"soak") and add a
rate limiter (1 job / 5s) for bounded auto-speak tests.
"""
import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

import websocket

ORCH = "http://127.0.0.1:18744"
CDP = "http://127.0.0.1:9223/json/list"
MAX_ENQ = int(sys.argv[1]) if len(sys.argv) > 1 else 10
MAX_SEC = int(sys.argv[2]) if len(sys.argv) > 2 else 300  # 5 min
KEYWORDS = ("test", "soak")  # set to None to accept all comments
RATE_S = 5                   # min seconds between enqueues (0 = no limit)
LOG = Path.home() / "hafjet-chatterbox" / "cdp_listener.log"


def log(o):
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(o, ensure_ascii=False) + "\n")


def cdp_tabs():
    try:
        with urllib.request.urlopen(CDP, timeout=8) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


def read_comments():
    tabs = cdp_tabs()
    if isinstance(tabs, dict):
        return []
    target = None
    for t in tabs:
        if t.get("type") == "page" and "/live" in (t.get("url") or ""):
            target = t
            break
    if not target:
        return []
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=10,
                                     origin="http://127.0.0.1:9223")
    expr = ("(()=>[...document.querySelectorAll('[data-e2e=\"chat-message\"]')]"
            ".filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0})"
            ".map(x=>(x.innerText||'').trim()).filter(Boolean).slice(-40))()")
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "returnByValue": True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == 1:
            ws.close()
            return m.get("result", {}).get("result", {}).get("value", [])


def is_spam(text: str) -> bool:
    t = text.strip()
    if len(t) < 2:
        return True
    if not re.search(r"[a-zA-Z0-9\u00c0-\u024f]", t):
        return True  # emoji/symbol only
    return False


def enqueue(text: str) -> dict:
    eid = "cdp-" + hashlib.sha256(text.encode()).hexdigest()[:16]
    body = {"event_id": eid, "platform": "tiktok", "user": "cdp-listener",
            "text": text, "live_id": "private-live"}
    req = urllib.request.Request(
        ORCH + "/events/comment", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main() -> int:
    log({"event": "start", "mode": "all" if KEYWORDS is None else "keyword",
         "keywords": KEYWORDS, "rate_s": RATE_S, "max_enq": MAX_ENQ, "max_sec": MAX_SEC})
    seen = set()
    enq = 0
    last_enq = 0.0
    start = time.monotonic()
    tabs0 = cdp_tabs()
    log({"event": "cdp_preflight", "count": len(tabs0) if isinstance(tabs0, list) else "err",
         "err": tabs0.get("error") if isinstance(tabs0, dict) else None})
    print("PREFLIGHT", json.dumps(tabs0 if isinstance(tabs0, dict) else {"count": len(tabs0)}), flush=True)
    try:
        while time.monotonic() - start < MAX_SEC and enq < MAX_ENQ:
            for raw in read_comments():
                parts = [x.strip() for x in raw.splitlines() if x.strip()]
                if len(parts) < 2:
                    continue
                user, text = parts[0], " ".join(parts[1:])
                low = text.lower()
                if KEYWORDS is not None and not any(k in low for k in KEYWORDS):
                    continue
                if is_spam(text):
                    continue
                key = hashlib.sha256((user + "\n" + text).encode()).hexdigest()
                if key in seen:
                    continue
                now = time.monotonic()
                if RATE_S and now - last_enq < RATE_S:
                    continue
                seen.add(key)
                try:
                    d = enqueue(text)
                    enq += 1
                    last_enq = time.monotonic()
                    acts = [a.get("type") for a in d.get("actions", [])]
                    log({"event": "enqueue", "n": enq, "user": user, "text": text[:120],
                         "actions": acts, "event_id": d.get("event_id")})
                    print("ENQ", enq, acts, text[:80], flush=True)
                except Exception as e:  # noqa: BLE001
                    log({"event": "enqueue_err", "user": user, "text": text[:120], "err": str(e)[:200]})
                    print("ENQ_ERR", str(e)[:120], flush=True)
                if enq >= MAX_ENQ:
                    break
            time.sleep(2)
    finally:
        log({"event": "stop", "enqueued": enq, "elapsed_s": round(time.monotonic() - start, 1)})
        print("DONE enqueued=", enq, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
