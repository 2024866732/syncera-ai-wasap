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


def send_whatsapp(to: str, text: str):
    """Send free-form text via Cloud API."""
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
    urllib.request.urlopen(req, timeout=15)


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

    # Build message
    now = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
    msg_lines = [f"⚠️ *Low Stock Alert — HAFJET*", f"📅 {now} MYT\n"]

    for store_name, items in sorted(by_store.items()):
        msg_lines.append(f"🏪 *{store_name}* ({len(items)} item)")
        for it in sorted(items, key=lambda x: x["qty"]):
            msg_lines.append(f"  • {it['name']} ({it['sku']}): *{it['qty']} unit*")
        msg_lines.append("")

    msg_lines.append("Saranan: semak reorder sebelum hujung minggu.")

    msg = "\n".join(msg_lines)

    # Send to OWNER
    if OWNER:
        OWNER_N = OWNER.strip().replace(" ", "").replace("+", "")
        if OWNER_N.startswith("0"):
            OWNER_N = "6" + OWNER_N
        send_whatsapp(OWNER_N, msg)
        print(f"📱 Low stock alert sent to {OWNER_N}")
    else:
        print("⚠️ OWNER_PHONE not set — printing alert here:\n")
        print(msg)

    print(f"🏁 Done. {len(low)} low-stock items reported.")


if __name__ == "__main__":
    main()
