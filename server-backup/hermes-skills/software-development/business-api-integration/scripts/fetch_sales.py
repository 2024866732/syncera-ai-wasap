#!/usr/bin/env python3
"""
Loyverse Daily Sales Report
Fetches today's sales data from Loyverse API, saves CSV, and prints a Telegram-friendly summary.

Usage:
    python3 fetch_sales.py

Environment:
    LOYVERSE_ACCESS_TOKEN - Set in ~/.hermes/.env or exported

Output:
    - CSV saved to ~/.hermes/reports/sales_YYYY-MM-DD.csv
    - Formatted summary printed to stdout (for Telegram delivery)
"""

import os, sys, csv, json, time
from datetime import datetime, timezone, timedelta
import urllib.request, urllib.error, urllib.parse

BASE_URL = "https://api.loyverse.com/v1.0"
REPORTS_DIR = os.path.expanduser("~/.hermes/reports")
LIMIT = 10

def load_token():
    token = os.environ.get("LOYVERSE_ACCESS_TOKEN", "").strip()
    if token:
        return token
    env_path = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                s = line.strip()
                if s.startswith("LOYVERSE_ACCESS_TOKEN=***                    return s.split("=", 1)[1].strip()
    return None

def get_today_range():
    myt = timezone(timedelta(hours=8))
    now = datetime.now(myt)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = now.replace(hour=23, minute=59, second=59, microsecond=0)
    return start.isoformat(), end.isoformat()

def api_get(path, params=None):
    url = BASE_URL + path
    if params:
        parts = []
        for k, v in params.items():
            if k == "cursor":
                parts.append(f"{k}={v}")
            else:
                parts.append(f"{k}={urllib.parse.quote(str(v), safe=':+.=')}")
        url += "?" + "&".join(parts)
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(f"  URL Error: {e.reason}", file=sys.stderr)
        return None

def fetch_all_receipts(gte, lte):
    all_receipts = []
    params = {"created_at.gte": gte, "created_at.lte": lte, "limit": LIMIT}
    page = 1
    while True:
        data = api_get("/receipts", params)
        if data is None:
            break
        receipts = data.get("receipts", [])
        all_receipts.extend(receipts)
        cursor = data.get("cursor")
        if not cursor or not receipts:
            break
        params = {"cursor": cursor}
        page += 1
        time.sleep(0.3)
    return all_receipts

def save_csv(receipts, date_str):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    filepath = os.path.join(REPORTS_DIR, f"sales_{date_str}.csv")
    fieldnames = [
        "receipt_number", "created_at", "total_money",
        "total_tax", "total_discount", "receipt_type",
        "payment_type", "item_name", "quantity", "line_total"
    ]
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for r in receipts:
            row_base = {
                "receipt_number": r.get("receipt_number", ""),
                "created_at": r.get("created_at", ""),
                "total_money": r.get("total_money", 0),
                "total_tax": r.get("total_tax", 0),
                "total_discount": r.get("total_discount", 0),
                "receipt_type": r.get("receipt_type", ""),
                "payment_type": "",
                "item_name": "", "quantity": "", "line_total": "",
            }
            payments = r.get("payments", [])
            if payments:
                row_base["payment_type"] = payments[0].get("name", "")
            for item in r.get("line_items", []):
                row = row_base.copy()
                row["item_name"] = item.get("item_name", "")
                row["quantity"] = item.get("quantity", 0)
                row["line_total"] = item.get("total_money", 0)
                writer.writerow(row)
            if not r.get("line_items"):
                writer.writerow(row_base)
    return filepath

def summarize(receipts):
    total_sales = total_tax = total_discount = 0.0
    payment_totals = {}
    item_totals = {}
    for r in receipts:
        total_sales += float(r.get("total_money", 0))
        total_tax += float(r.get("total_tax", 0))
        total_discount += float(r.get("total_discount", 0))
        for p in r.get("payments", []):
            name = p.get("name", "Unknown")
            payment_totals[name] = payment_totals.get(name, 0) + float(p.get("money_amount", 0))
        for item in r.get("line_items", []):
            name = item.get("item_name", "Unknown")
            item_totals[name] = item_totals.get(name, 0) + float(item.get("quantity", 0))
    top_items = sorted(item_totals.items(), key=lambda x: x[1], reverse=True)[:5]
    return {
        "total_sales": total_sales, "total_tax": total_tax,
        "total_discount": total_discount, "transaction_count": len(receipts),
        "payment_totals": payment_totals, "top_items": top_items,
    }

def format_summary(s, date_str):
    lines = [
        f"Laporan Jualan Harian - {date_str}",
        "",
        f"Total Jualan: RM {s['total_sales']:,.2f}",
        f"Transaksi: {s['transaction_count']}",
        f"Tax: RM {s['total_tax']:,.2f}",
        f"Discount: RM {s['total_discount']:,.2f}",
    ]
    if s["payment_totals"]:
        lines += ["", "Breakdown Bayaran:"]
        for name, amount in s["payment_totals"].items():
            lines.append(f"  {name}: RM {amount:,.2f}")
    if s["top_items"]:
        lines += ["", "Item Paling Laris:"]
        for name, qty in s["top_items"]:
            lines.append(f"  {name}: x {int(qty)}")
    return "\n".join(lines)

def main():
    global TOKEN
    TOKEN=***    if not TOKEN:
        print("ERROR: LOYVERSE_ACCESS_TOKEN not set!", file=sys.stderr)
        sys.exit(1)
    gte, lte = get_today_range()
    date_str = gte[:10]
    receipts = fetch_all_receipts(gte, lte)
    if not receipts:
        msg = f"Laporan Jualan - {date_str}\n\nTiada transaksi hari ini."
        print(msg)
        return msg
    csv_path = save_csv(receipts, date_str)
    print(f"CSV saved: {csv_path}", file=sys.stderr)
    stats = summarize(receipts)
    msg = format_summary(stats, date_str)
    print(msg)
    return msg

if __name__ == "__main__":
    main()
