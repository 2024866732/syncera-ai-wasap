#!/usr/bin/env python3
"""
monthly_tracking.py — Loyverse Monthly Sales Tracker
Fetches daily sales from Loyverse API, maintains monthly cumulative tracking.
Saves data to ~/.hermes/reports/monthly_tracking.json for historical reference.

Usage:
  python3 monthly_tracking.py              → today only, show + save
  python3 monthly_tracking.py --monthly    → recalc entire current month from API
"""

import os
import sys
import json
import csv
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

# ── Config ──────────────────────────────────────────────────────────
BASE_URL = "https://api.loyverse.com/v1.0"
TOKEN = os.environ.get("LOYVERSE_ACCESS_TOKEN", "")
LIMIT = 10
REPORTS_DIR = os.path.expanduser("~/.hermes/reports")
TRACKING_FILE = os.path.join(REPORTS_DIR, "monthly_tracking.json")

# MYT timezone
MYT = timezone(timedelta(hours=8))

def api_get(path, params=None):
    """GET request to Loyverse API, return parsed JSON."""
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

def fetch_receipts_for_date(date_str):
    """Fetch all receipts for a specific YYYY-MM-DD using cursor pagination + client-side filter."""
    myt = timezone(timedelta(hours=8))
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=myt)
    gte = dt.isoformat()
    
    all_receipts = []
    params = {"created_at.min": gte, "limit": LIMIT}
    page = 1
    
    while True:
        print(f"  📄 Fetching page {page}...", file=sys.stderr)
        data = api_get("/receipts", params)
        if data is None:
            break
        receipts = data.get("receipts", [])
        # Client-side filter
        day_receipts = [r for r in receipts if r.get("created_at", "").startswith(date_str)]
        all_receipts.extend(day_receipts)
        print(f"     → {len(receipts)} fetched, {len(day_receipts)} for {date_str} (total: {len(all_receipts)})", file=sys.stderr)
        
        cursor = data.get("cursor")
        if not cursor or not receipts:
            break
        params = {"cursor": cursor}
        page += 1
    
    return all_receipts

def summarize_receipts(receipts):
    """Calculate summary from receipts list."""
    total_sales = 0.0
    total_cost = 0.0
    total_tax = 0.0
    total_discount = 0.0
    payment_totals = {}
    item_counts = {}
    
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
            item_counts[name] = item_counts.get(name, 0) + qty
            cost = float(item.get("cost_total", 0))
            total_cost += cost
    
    gross_profit = total_sales - total_cost
    margin = (gross_profit / total_sales * 100) if total_sales > 0 else 0
    transaction_count = len(receipts)
    
    # Top 5 items
    top_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "date": "",
        "total_sales": round(total_sales, 2),
        "total_cost": round(total_cost, 2),
        "gross_profit": round(gross_profit, 2),
        "profit_margin": round(margin, 1),
        "total_tax": round(total_tax, 2),
        "total_discount": round(total_discount, 2),
        "transaction_count": transaction_count,
        "payment_totals": {k: round(v, 2) for k, v in payment_totals.items()},
        "top_items": [(name, int(qty)) for name, qty in top_items],
    }

def load_tracking():
    """Load existing tracking data."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    if os.path.exists(TRACKING_FILE):
        try:
            with open(TRACKING_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}

def save_tracking(data):
    """Save tracking data."""
    with open(TRACKING_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"✅ Tracking saved: {TRACKING_FILE}", file=sys.stderr)

def get_month_key(date_str):
    """Return 'YYYY-MM' from date string."""
    return date_str[:7]

def main():
    if not TOKEN:
        print("❌ LOYVERSE_ACCESS_TOKEN not set!", file=sys.stderr)
        sys.exit(1)
    
    now = datetime.now(MYT)
    today_str = now.strftime("%Y-%m-%d")
    month_key = get_month_key(today_str)
    
    # Determine date range
    # Default: today only
    target_dates = [today_str]
    
    print(f"🔍 Fetching sales for {today_str}...", file=sys.stderr)
    
    # Fetch for each date
    all_receipts = []
    for d in target_dates:
        receipts = fetch_receipts_for_date(d)
        all_receipts.extend(receipts)
    
    # Summarize today (even if empty)
    if all_receipts:
        today_stats = summarize_receipts(all_receipts)
    else:
        today_stats = {
            "total_sales": 0.0, "total_cost": 0.0, "gross_profit": 0.0,
            "profit_margin": 0.0, "total_tax": 0.0, "total_discount": 0.0,
            "transaction_count": 0, "payment_totals": {}, "top_items": []
        }
    today_stats["date"] = today_str
    
    # ── Load & Update Tracking (ALWAYS save, even zero days) ──
    tracking = load_tracking()
    
    if month_key not in tracking:
        tracking[month_key] = {
            "store": "HAFIZI GADJET ENTERRPRISE",
            "days": {}
        }
    
    # Save today's data
    tracking[month_key]["days"][today_str] = today_stats
    
    # Recalc month totals
    month_days = tracking[month_key]["days"]
    month_total = {
        "total_sales": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "total_tax": 0.0,
        "total_discount": 0.0,
        "transaction_count": 0,
    }
    
    for d_key, d_stats in sorted(month_days.items()):
        month_total["total_sales"] += d_stats["total_sales"]
        month_total["total_cost"] += d_stats["total_cost"]
        month_total["gross_profit"] += d_stats["gross_profit"]
        month_total["total_tax"] += d_stats["total_tax"]
        month_total["total_discount"] += d_stats["total_discount"]
        month_total["transaction_count"] += d_stats["transaction_count"]
    
    month_total["profit_margin"] = round(
        (month_total["gross_profit"] / month_total["total_sales"] * 100)
        if month_total["total_sales"] > 0 else 0, 1
    )
    
    tracking[month_key]["monthly_total"] = {
        k: round(v, 2) if isinstance(v, float) else v
        for k, v in month_total.items()
    }
    
    save_tracking(tracking)
    
    # ── Print Report ──
    days_count = len(month_days)
    print(f"\n📅 *Tracking Bulanan — {month_key}*")
    print(f"🏪 HAFIZI GADJET ENTERRPRISE")
    print(f"📆 Hari direkod: {days_count} hari")
    print(f"")
    print(f"📊 *Hari Ini — {today_str}*")
    print(f"💰 Jualan: RM {today_stats['total_sales']:,.2f}")
    print(f"📈 Untung: RM {today_stats['gross_profit']:,.2f} ({today_stats['profit_margin']:.1f}%)")
    print(f"🧾 Transaksi: {today_stats['transaction_count']}")
    print(f"🏷 Diskaun: RM {today_stats['total_discount']:,.2f}")
    print(f"")
    print(f"📊 *Month-to-Date — {month_key}*")
    print(f"💰 Jualan: RM {month_total['total_sales']:,.2f}")
    print(f"💸 COGS: RM {month_total['total_cost']:,.2f}")
    print(f"📈 Untung Kasar: RM {month_total['gross_profit']:,.2f} ({month_total['profit_margin']:.1f}%)")
    print(f"🧾 Jumlah Transaksi: {month_total['transaction_count']}")
    print(f"🏷 Jumlah Diskaun: RM {month_total['total_discount']:,.2f}")

if __name__ == "__main__":
    main()
