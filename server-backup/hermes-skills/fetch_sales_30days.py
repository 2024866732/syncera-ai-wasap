#!/usr/bin/env python3
"""
fetch_sales_30days.py - Loyverse 30-Day Historical Sales Report
Fetch sales data for the past 30 days from Loyverse API and save to CSV.
"""

import os
import sys
import csv
import json
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

# ── Config ──────────────────────────────────────────────────────────
BASE_URL = "https://api.loyverse.com/v1.0"
TOKEN = os.environ.get("LOYVERSE_ACCESS_TOKEN", "")
LIMIT = 10  # per page — keep low to avoid 402
REPORTS_DIR = os.path.expanduser("~/.hermes/reports")

# ── Helpers ─────────────────────────────────────────────────────────
def get_30day_range():
    """Return (gte, lte) ISO 8601 strings for past 30 days in MYT (UTC+8)."""
    myt = timezone(timedelta(hours=8))
    now = datetime.now(myt)
    end = now.replace(hour=23, minute=59, second=59, microsecond=0)
    start = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat(), end.isoformat()

def api_get(path, params=None):
    """Make a GET request to Loyverse API, return parsed JSON."""
    url = BASE_URL + path
    if params:
        url += "?" + urlencode(params, safe=":+.=")
    req = Request(url)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/json")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  ⚠ HTTP {e.code}: {body}", file=sys.stderr)
        return {"error": True, "status": e.code, "body": body}
    except URLError as e:
        print(f"  ⚠ URL Error: {e.reason}", file=sys.stderr)
        return {"error": True, "status": 0, "body": str(e.reason)}

def fetch_all_receipts(gte, lte):
    """Fetch all receipts for the date range using cursor pagination."""
    all_receipts = []
    params = {
        "created_at.gte": gte,
        "created_at.lte": lte,
        "limit": LIMIT,
    }
    page = 1
    while True:
        print(f"  📄 Fetching page {page}...", file=sys.stderr)
        data = api_get("/receipts", params)

        if data is None or data.get("error"):
            print(f"  ❌ Stopped at page {page} due to error.", file=sys.stderr)
            break

        receipts = data.get("receipts", [])
        all_receipts.extend(receipts)
        print(f"     → {len(receipts)} receipts (total: {len(all_receipts)})", file=sys.stderr)

        cursor = data.get("cursor")
        if not cursor or not receipts:
            break

        # Next page uses only cursor (date filter already applied on first call)
        params = {"cursor": cursor, "limit": LIMIT}
        page += 1

    return all_receipts

def save_csv(receipts, start_str, end_str):
    """Save all receipts to a CSV report."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    filepath = os.path.join(REPORTS_DIR, "sales_past_30_days.csv")

    fieldnames = [
        "receipt_number", "created_at", "receipt_type",
        "total_money", "total_tax", "total_discount",
        "payment_type", "item_name", "quantity", "line_total"
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()

        for r in receipts:
            row_base = {
                "receipt_number": r.get("receipt_number", ""),
                "created_at": r.get("created_at", ""),
                "receipt_type": r.get("receipt_type", ""),
                "total_money": r.get("total_money", 0),
                "total_tax": r.get("total_tax", 0),
                "total_discount": r.get("total_discount", 0),
                "payment_type": "",
                "item_name": "",
                "quantity": "",
                "line_total": "",
            }

            payments = r.get("payments", [])
            if payments:
                row_base["payment_type"] = payments[0].get("name", "")

            line_items = r.get("line_items", [])
            if line_items:
                for item in line_items:
                    row = row_base.copy()
                    row["item_name"] = item.get("item_name", "")
                    row["quantity"] = item.get("quantity", 0)
                    row["line_total"] = item.get("total_money", 0)
                    writer.writerow(row)
            else:
                writer.writerow(row_base)

    return filepath

def summarize(receipts):
    """Calculate 30-day summary stats."""
    total_sales = 0.0
    total_tax = 0.0
    total_discount = 0.0
    payment_totals = {}
    item_totals = {}
    daily_sales = {}

    for r in receipts:
        money = float(r.get("total_money", 0))
        total_sales += money
        total_tax += float(r.get("total_tax", 0))
        total_discount += float(r.get("total_discount", 0))

        # Daily breakdown
        created = r.get("created_at", "")[:10]
        if created:
            daily_sales[created] = daily_sales.get(created, 0) + money

        # Payment breakdown
        for p in r.get("payments", []):
            name = p.get("name", "Unknown")
            payment_totals[name] = payment_totals.get(name, 0) + float(p.get("money_amount", 0))

        # Item breakdown
        for item in r.get("line_items", []):
            name = item.get("item_name", "Unknown")
            qty = float(item.get("quantity", 0))
            item_totals[name] = item_totals.get(name, 0) + qty

    # Top 10 items
    top_items = sorted(item_totals.items(), key=lambda x: x[1], reverse=True)[:10]

    # Best day
    best_day = max(daily_sales.items(), key=lambda x: x[1]) if daily_sales else ("N/A", 0)
    avg_daily = total_sales / len(daily_sales) if daily_sales else 0

    return {
        "total_sales": total_sales,
        "total_tax": total_tax,
        "total_discount": total_discount,
        "transaction_count": len(receipts),
        "payment_totals": payment_totals,
        "top_items": top_items,
        "daily_sales": daily_sales,
        "best_day": best_day,
        "avg_daily": avg_daily,
        "active_days": len(daily_sales),
    }

def format_summary(s, start_str, end_str, csv_path):
    """Format a Telegram-friendly 30-day summary."""
    lines = [
        f"📊 *Laporan Jualan 30 Hari*",
        f"📅 {start_str[:10]} → {end_str[:10]}",
        "",
        f"💰 *Jumlah Besar Jualan: RM {s['total_sales']:,.2f}*",
        f"🧾 *Jumlah Transaksi: {s['transaction_count']}*",
        f"📉 Tax: RM {s['total_tax']:,.2f}",
        f"🏷 Discount: RM {s['total_discount']:,.2f}",
        f"📆 Hari Aktif: {s['active_days']} hari",
        f"📈 Purata Harian: RM {s['avg_daily']:,.2f}",
        f"⭐ Hari Terbaik: {s['best_day'][0]} (RM {s['best_day'][1]:,.2f})",
        "",
    ]

    if s["payment_totals"]:
        lines.append("💳 *Breakdown Bayaran:*")
        for name, amount in sorted(s["payment_totals"].items(), key=lambda x: x[1], reverse=True):
            lines.append(f"  • {name}: RM {amount:,.2f}")
        lines.append("")

    if s["top_items"]:
        lines.append("📦 *Top 10 Item Paling Laris:*")
        for i, (name, qty) in enumerate(s["top_items"], 1):
            lines.append(f"  {i}. {name}: x {int(qty)}")
        lines.append("")

    lines.append(f"💾 *Fail CSV:* `{csv_path}`")

    return "\n".join(lines)

# ── Main ────────────────────────────────────────────────────────────
def main():
    if not TOKEN:
        print("❌ LOYVERSE_ACCESS_TOKEN not set!", file=sys.stderr)
        sys.exit(1)

    gte, lte = get_30day_range()
    print(f"🔍 Fetching 30-day sales: {gte[:10]} → {lte[:10]}", file=sys.stderr)

    receipts = fetch_all_receipts(gte, lte)

    if not receipts:
        msg = f"📊 Laporan 30 Hari ({gte[:10]} → {lte[:10]})\n\nTiada transaksi dijumpai."
        print(msg)
        return msg

    # Save CSV
    csv_path = save_csv(receipts, gte, lte)
    print(f"✅ CSV saved: {csv_path}", file=sys.stderr)

    # Summarize
    stats = summarize(receipts)
    msg = format_summary(stats, gte, lte, csv_path)
    print(msg)
    return msg

if __name__ == "__main__":
    main()
