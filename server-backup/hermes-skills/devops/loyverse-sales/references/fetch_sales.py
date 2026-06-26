#!/usr/bin/env python3
"""
fetch_sales.py - Loyverse Daily Sales Report
Fetch today's sales data from Loyverse API and save to CSV.

CRITICAL: Loyverse API ignores created_at.gte/lte server-side filters
on limited plans. This script implements client-side filtering to ensure
only today's receipts are included in the report.
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
LIMIT = 10  # per page (API max)
REPORTS_DIR = os.path.expanduser("~/.hermes/reports")

# ── Helpers ─────────────────────────────────────────────────────────
def get_today_range():
    """Return (gte, lte) ISO 8601 strings for today in MYT (UTC+8)."""
    myt = timezone(timedelta(hours=8))
    now = datetime.now(myt)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end   = now.replace(hour=23, minute=59, second=59, microsecond=0)
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
        return None
    except URLError as e:
        print(f"  ⚠ URL Error: {e.reason}", file=sys.stderr)
        return None

def fetch_all_receipts(gte, lte):
    """Fetch all receipts using cursor pagination, then client-side filter to today only.

    Loyverse API ignores created_at.gte/lte filters on some plans, so we fetch
    everything available and filter by date locally to ensure accuracy.
    """
    target_date = gte[:10]  # YYYY-MM-DD
    all_receipts = []
    params = {
        "created_at.min": gte,
        "limit": LIMIT,
    }
    page = 1
    while True:
        print(f"  📄 Fetching page {page}...", file=sys.stderr)
        data = api_get("/receipts", params)
        if data is None:
            break
        receipts = data.get("receipts", [])
        # Client-side filter: only keep receipts from target_date
        today_receipts = [r for r in receipts if r.get("created_at", "").startswith(target_date)]
        all_receipts.extend(today_receipts)
        print(f"     → {len(receipts)} fetched, {len(today_receipts)} for {target_date} (total: {len(all_receipts)})", file=sys.stderr)
        cursor = data.get("cursor")
        if not cursor or not receipts:
            break
        params = {"cursor": cursor}
        page += 1
    return all_receipts

def save_csv(receipts, date_str):
    """Save receipts to a daily CSV report."""
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
    """Calculate summary stats from receipts."""
    total_sales = 0.0
    total_tax = 0.0
    total_discount = 0.0
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
            qty = float(item.get("quantity", 0))
            item_totals[name] = item_totals.get(name, 0) + qty

    top_items = sorted(item_totals.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "total_sales": total_sales,
        "total_tax": total_tax,
        "total_discount": total_discount,
        "transaction_count": len(receipts),
        "payment_totals": payment_totals,
        "top_items": top_items,
    }

def format_summary(summary, date_str):
    """Format a Telegram-friendly summary message."""
    lines = [
        f"📊 *Laporan Jualan Harian — {date_str}*",
        "",
        f"💰 Total Jualan: *RM {summary['total_sales']:,.2f}*",
        f"🧾 Transaksi: *{summary['transaction_count']}*",
        f"📉 Tax: RM {summary['total_tax']:,.2f}",
        f"🏷 Discount: RM {summary['total_discount']:,.2f}",
        "",
    ]

    if summary["payment_totals"]:
        lines.append("💳 *Breakdown Bayaran:*")
        for name, amount in summary["payment_totals"].items():
            lines.append(f"  • {name}: RM {amount:,.2f}")
        lines.append("")

    if summary["top_items"]:
        lines.append("📦 *Item Paling Laris:*")
        for name, qty in summary["top_items"]:
            lines.append(f"  • {name}: x {int(qty)}")
        lines.append("")

    return "\n".join(lines)

# ── Main ────────────────────────────────────────────────────────────
def main():
    if not TOKEN:
        print("❌ LOYVERSE_ACCESS_TOKEN not set!", file=sys.stderr)
        sys.exit(1)

    gte, lte = get_today_range()
    date_str = gte[:10]  # YYYY-MM-DD

    print(f"🔍 Fetching sales for {date_str}...", file=sys.stderr)

    receipts = fetch_all_receipts(gte, lte)

    if not receipts:
        msg = f"📊 Laporan Jualan — {date_str}\n\nTiada transaksi hari ini."
        print(msg)
        return msg

    csv_path = save_csv(receipts, date_str)
    print(f"✅ CSV saved: {csv_path}", file=sys.stderr)

    stats = summarize(receipts)
    msg = format_summary(stats, date_str)
    print(msg)
    return msg

if __name__ == "__main__":
    main()
