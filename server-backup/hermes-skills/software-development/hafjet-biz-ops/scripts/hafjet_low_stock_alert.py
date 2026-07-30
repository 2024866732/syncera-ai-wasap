#!/usr/bin/env python3
"""
HAFJET Low Stock Alert - Loyverse Inventory + WhatsApp Cloud API
SOP: reads env vars (owner sets manually), writes NO .env, no pipe execution.

Env vars required:
  LOYVERSE_ACCESS_TOKEN      = token dari .env
  WHATSAPP_CLOUD_PHONE_ID    = 107158292462704
  WHATSAPP_CLOUD_ACCESS_TOKEN = token dari .env
  LOW_STOCK_THRESHOLD        = 5 (default)
  OWNER_PHONE                = 60198021500 (target untuk alert)

Behaviour:
  - Paginates Loyverse /v1.0/inventory untuk semua variant+store
  - Fetch /v1.0/items untuk map variant_id -> item_name + sku
  - Filter in_stock <= threshold
  - Send WhatsApp alert to OWNER only
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

# ---------- Config ----------
LOYVERSE_TOKEN = os.environ.get("LOYVERSE_ACCESS_TOKEN")
PHONE_ID = os.environ.get("WHATSAPP_CLOUD_PHONE_ID")
WHATSAPP_TOKEN = os.environ.get("WHATSAPP_CLOUD_ACCESS_TOKEN")
OWNER = os.environ.get("OWNER_PHONE")
THRESHOLD = int(os.environ.get("LOW_STOCK_THRESHOLD", "5"))

for k, v in [("LOYVERSE_ACCESS_TOKEN", LOYVERSE_TOKEN),
             ("WHATSAPP_CLOUD_PHONE_ID", PHONE_ID),
             ("WHATSAPP_CLOUD_ACCESS_TOKEN", WHATSAPP_TOKEN)]:
    if not v:
        sys.exit(f"❌ Missing env: {k}")

# ---------- Helpers ----------
def loyverse_get(url_suffix: str) -> dict:
    """GET Loyverse API with pagination support. Returns full JSON."""
    base = "https://api.loyverse.com/v1.0"
    url = f"{base}{url_suffix}" if not url_suffix.startswith("http") else url_suffix
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {LOYVERSE_TOKEN}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


MAX_WHATSAPP_TEXT_CHARS = 4096
# Keep a small margin for the per-part marker added by chunk_alert_messages().
CHUNK_TARGET_CHARS = 3900
# A WhatsApp owner alert is a triage notification, not an inventory export. This cap
# prevents a zero-stock data anomaly from flooding the recipient and hitting Meta's
# same-recipient rate limit. Set explicitly only when a longer shortlist is wanted.
MAX_ITEMS_PER_STORE = int(os.environ.get("LOW_STOCK_ALERT_MAX_ITEMS_PER_STORE", "25"))


def send_whatsapp(to: str, text: str):
    """Send a Cloud API text message within Meta's 4,096-character body limit."""
    if len(text) > MAX_WHATSAPP_TEXT_CHARS:
        raise ValueError(f"WhatsApp body is {len(text)} chars; max is {MAX_WHATSAPP_TEXT_CHARS}")
    url = f"https://graph.facebook.com/v21.0/{PHONE_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": text},
    }
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    try:
        urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"WhatsApp API HTTP {exc.code}: {detail}") from exc


def chunk_alert_messages(header: str, item_lines: list[str], footer: str) -> list[str]:
    """Split a complete low-stock list into API-safe WhatsApp messages."""
    chunks, current = [], []
    current_length = len(header)
    for line in item_lines:
        addition = len(line) + 1  # newline before each list line
        if current and current_length + addition > CHUNK_TARGET_CHARS:
            chunks.append(current)
            current, current_length = [], len(header)
        # A single unexpected oversized item name still cannot break the API limit.
        if len(line) + len(header) + 1 > CHUNK_TARGET_CHARS:
            line = line[:CHUNK_TARGET_CHARS - len(header) - 2] + "…"
            addition = len(line) + 1
        current.append(line)
        current_length += addition
    if current:
        chunks.append(current)

    total = len(chunks)
    messages = []
    for index, lines in enumerate(chunks, start=1):
        suffix = footer if index == total else ""
        body = "\n".join([header, f"📄 Bahagian {index}/{total}", *lines, suffix]).rstrip()
        if len(body) > MAX_WHATSAPP_TEXT_CHARS:
            raise ValueError(f"Generated WhatsApp chunk {index} is {len(body)} chars")
        messages.append(body)
    return messages


def paginate_inventory():
    """Paginate all inventory levels. Returns list of {variant_id, store_id, in_stock}."""
    results = []
    cursor = None
    while True:
        suffix = "/inventory?limit=250"
        if cursor:
            suffix += f"&cursor={cursor}"
        data = loyverse_get(suffix)
        results.extend(data.get("inventory_levels", []))
        cursor = data.get("cursor")
        if not cursor:
            break
    return results


def build_variant_map():
    """Paginate items -> build map: variant_id_str -> {name, sku}."""
    vmap = {}
    cursor = None
    while True:
        suffix = "/items?limit=250"
        if cursor:
            suffix += f"&cursor={cursor}"
        data = loyverse_get(suffix)
        for item in data.get("items", []):
            name = item.get("item_name", "Unknown")
            for v in item.get("variants", []):
                vid = v.get("variant_id")
                if vid:
                    vmap[vid] = {"name": name, "sku": v.get("sku", "?")}
        cursor = data.get("cursor")
        if not cursor:
            break
    return vmap


# ---------- Store name mapping (from earlier test) ----------
STORE_NAMES = {
    "7ff40a33-f30b-4680-a2e0-a6b644f05988": "HAFJET Raub",
    "f93d2d7b-711d-11ea-8d93-0603130a05b8": "HAFJET LORI",
}


def main():
    print(f"📦 Fetching Loyverse inventory...")
    inventory = paginate_inventory()
    print(f"   Total inventory levels: {len(inventory)}")

    print(f"📋 Building item map...")
    vmap = build_variant_map()
    print(f"   Variants mapped: {len(vmap)}")

    # Filter low stock
    low = []
    for inv in inventory:
        qty = inv.get("in_stock", 999)
        if qty <= THRESHOLD:
            vid = inv.get("variant_id", "")
            sid = inv.get("store_id", "")
            item = vmap.get(vid, {"name": f"variant:{vid[:8]}", "sku": "?"})
            low.append({
                "name": item["name"],
                "sku": item["sku"],
                "store": STORE_NAMES.get(sid, sid[:8]),
                "qty": qty,
            })

    print(f"   Low stock (≤{THRESHOLD}): {len(low)} items")

    if not low:
        print("✅ Semua stok sihat. Tiada alert dihantar.")
        return

    # Group by store
    by_store = {}
    for l in low:
        by_store.setdefault(l["store"], []).append(l)

    # Build a concise, per-store reorder shortlist. The full low-stock count remains
    # visible so an abnormal inventory baseline can be investigated in Loyverse.
    now = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
    header = f"⚠️ *Low Stock Alert — HAFJET*\n📅 {now} MYT\nJumlah rekod ≤{THRESHOLD}: *{len(low)}*"
    item_lines = []
    for store_name, items in sorted(by_store.items()):
        ranked_items = sorted(items, key=lambda x: x["qty"])
        shown_items = ranked_items[:MAX_ITEMS_PER_STORE]
        item_lines.append(f"🏪 *{store_name}* ({len(items)} item)")
        for it in shown_items:
            item_lines.append(f"  • {it['name']} ({it['sku']}): *{it['qty']} unit*")
        remaining = len(ranked_items) - len(shown_items)
        if remaining:
            item_lines.append(f"  … +{remaining} lagi (semak dalam Loyverse)")
        item_lines.append("")
    messages = chunk_alert_messages(
        header, item_lines, "Saranan: semak reorder sebelum hujung minggu."
    )
    print(f"   Alert split into {len(messages)} WhatsApp message(s)")

    # Send to OWNER
    if OWNER:
        OWNER_N = OWNER.strip().replace(" ", "").replace("+", "")
        if OWNER_N.startswith("0"):
            OWNER_N = "6" + OWNER_N
        for index, message in enumerate(messages, start=1):
            send_whatsapp(OWNER_N, message)
            print(f"📱 Alert part {index}/{len(messages)} sent to {OWNER_N}")
    else:
        print("⚠️ OWNER_PHONE not set — printing alert here:\n")
        print("\n\n".join(messages))

    print(f"🏁 Done. {len(low)} low-stock items reported.")


if __name__ == "__main__":
    main()
