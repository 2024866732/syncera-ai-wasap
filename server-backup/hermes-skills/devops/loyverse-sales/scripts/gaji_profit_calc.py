#!/usr/bin/env python3
"""
gaji_profit_calc.py — HAFJET Monthly "Gaji vs Profit" Tracker

Fetches Loyverse sales for a target month, subtracts fixed costs
(Sewa RM400 + BSN RM400 + TNB RM500 = RM1,300), computes net profit
(gross = jualan - COGS), baki hidup (after fixed costs, before salary),
and hire-readiness status, then upserts the row into
~/.hermes/reports/gaji_profit_tracker.csv.

USAGE:
    python3 gaji_profit_calc.py            # auto = previous month
    python3 gaji_profit_calc.py YYYY MM     # explicit (e.g. 2026 06)

DATA-INTEGRITY GUARD:
    Loyverse free tier only returns 31 days of receipt history.
    If the target month started more than 31 days ago AND a complete
    row already exists in the tracker, we DO NOT re-fetch (which would
    only return late-month receipts and understate the total). We
    report the existing row instead. This prevents corrupting good data.
"""

import os
import sys
import csv
import json
from datetime import date, datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

# ── Config ──────────────────────────────────────────────────────────
BASE_URL = "https://api.loyverse.com/v1.0"
REPORTS_DIR = os.path.expanduser("~/.hermes/reports")
CSV_PATH = os.path.join(REPORTS_DIR, "gaji_profit_tracker.csv")
TOKEN_FILE = "/tmp/.loyverse_token"
FIXED_COST = 400.0 + 400.0 + 500.0  # Sewa + BSN + TNB = 1300
HIRE_READY_THRESHOLD = 3200.0        # baki_hidup needed to hire full-time
PART_TIME_THRESHOLD = 1500.0         # baki_hidup needed to hire part-time
MYT = timezone(timedelta(hours=8))


def load_token():
    tok = os.environ.get("LOYVERSE_ACCESS_TOKEN", "").strip()
    if tok:
        return tok
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            tok = f.read().strip()
        if tok:
            return tok
    # Fallback: read from .env
    env_path = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("LOYVERSE_ACCESS_TOKEN="):
                    return line.split("=", 1)[1].strip()
    return ""


def derive_target_month():
    today = date.today()
    first_of_this = today.replace(day=1)
    last_month = first_of_this - timedelta(days=1)
    return last_month.year, last_month.month


def month_bounds(yyyy, mm):
    start = date(yyyy, mm, 1)
    if mm == 12:
        nxt = date(yyyy + 1, 1, 1)
    else:
        nxt = date(yyyy, mm + 1, 1)
    end = nxt - timedelta(days=1)
    return start, end


def api_get(path, params):
    url = BASE_URL + path
    if params:
        url += "?" + urlencode(params, safe=":+=.")
    req = Request(url)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/json")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  ⚠ HTTP {e.code}: {body[:200]}", file=sys.stderr)
        return None
    except URLError as e:
        print(f"  ⚠ URL Error: {e.reason}", file=sys.stderr)
        return None


def fetch_month_receipts(yyyy, mm):
    """Fetch all receipts whose created_at starts with 'YYYY-MM' (client-side filter)."""
    prefix = f"{yyyy:04d}-{mm:02d}"
    gte = f"{prefix}-01T00:00:00.000Z"
    all_receipts = []
    params = {"created_at.min": gte, "limit": 10}
    page = 1
    while True:
        print(f"  📄 Fetching page {page}...", file=sys.stderr)
        data = api_get("/receipts", params)
        if data is None:
            break
        receipts = data.get("receipts", [])
        matched = [r for r in receipts if (r.get("created_at") or "").startswith(prefix)]
        all_receipts.extend(matched)
        print(f"     → {len(receipts)} fetched, {len(matched)} for {prefix} (total: {len(all_receipts)})", file=sys.stderr)
        cursor = data.get("cursor")
        if not cursor or not receipts:
            break
        params = {"cursor": cursor}
        page += 1
    return all_receipts


def compute(receipts):
    total_sales = 0.0
    total_cost = 0.0
    for r in receipts:
        total_sales += float(r.get("total_money", 0))
        for item in r.get("line_items", []):
            total_cost += float(item.get("cost_total", 0))
    gross_profit = total_sales - total_cost          # tracker's "net_profit"
    baki_hidup = gross_profit - FIXED_COST           # after fixed costs, before salary
    return total_sales, gross_profit, baki_hidup


def hire_status(baki_hidup):
    if baki_hidup >= HIRE_READY_THRESHOLD:
        return "READY — boleh hire full-time"
    if baki_hidup >= PART_TIME_THRESHOLD:
        gap = HIRE_READY_THRESHOLD - baki_hidup
        return f"PART-TIME — perlu +RM {gap:,.2f} lagi untuk full-time"
    if baki_hidup >= 0:
        gap = HIRE_READY_THRESHOLD - baki_hidup
        return f"OK - belum boleh hire (perlu +RM {gap:,.2f} untuk full-time)"
    gap = HIRE_READY_THRESHOLD - baki_hidup
    return f"⚠️ BELUM — perlu +RM {gap:,.2f} lagi"


def read_tracker():
    rows = {}
    if os.path.exists(CSV_PATH):
        with open(CSV_PATH, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                rows[row["bulan"]] = row
    return rows


def upsert_tracker(bulan, jualan, net_profit, baki_hidup, status):
    rows = read_tracker()
    rows[bulan] = {
        "bulan": bulan,
        "jualan": f"{jualan:.2f}",
        "net_profit": f"{net_profit:.2f}",
        "kos_tetap": f"{FIXED_COST:.2f}",
        "gaji_pekerja": "0.00",
        "baki_hidup": f"{baki_hidup:.2f}",
        "status": status,
    }
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["bulan", "jualan", "net_profit", "kos_tetap",
                                          "gaji_pekerja", "baki_hidup", "status"])
        w.writeheader()
        for b in sorted(rows.keys()):
            w.writerow(rows[b])
    return rows[bulan]


def main():
    TOKEN = load_token()
    if not TOKEN:
        print("❌ LOYVERSE_ACCESS_TOKEN not found (env, /tmp/.loyverse_token, or .env).")
        sys.exit(1)

    if len(sys.argv) == 3:
        yyyy, mm = int(sys.argv[1]), int(sys.argv[2])
    else:
        yyyy, mm = derive_target_month()
    bulan = f"{yyyy:04d}-{mm:02d}"
    start, end = month_bounds(yyyy, mm)
    today = date.today()

    print(f"🗓  Target month: {bulan}  ({start} → {end})")
    print(f"📅 Today: {today}")

    # ── Data-integrity guard ──
    days_since_start = (today - start).days
    existing = read_tracker().get(bulan)
    if days_since_start > 31 and existing:
        print(f"⚠️  {bulan} started {days_since_start} days ago (>31-day Loyverse window).")
        print(f"⚠️  Re-fetching now would only return late-month receipts and UNDERSTATE the total.")
        print(f"✅ Complete row for {bulan} already exists — preserving it (no overwrite).")
        jualan = float(existing["jualan"])
        net_profit = float(existing["net_profit"])
        baki_hidup = float(existing["baki_hidup"])
        status = existing["status"]
        mode = "EXISTING (preserved)"
    else:
        receipts = fetch_month_receipts(yyyy, mm)
        if not receipts:
            print(f"📊 Tiada receipt untuk {bulan}.")
            return
        jualan, net_profit, baki_hidup = compute(receipts)
        status = hire_status(baki_hidup)
        upsert_tracker(bulan, jualan, net_profit, baki_hidup, status)
        mode = "FETCHED + UPDATED"

    # ── Report ──
    print("=" * 48)
    print(f"📊 LAPORAN GAJI vs PROFIT — {bulan}  [{mode}]")
    print(f"💰 Jualan Total : RM {jualan:,.2f}")
    print(f"📈 Net Profit   : RM {net_profit:,.2f}  (gross, sblm kos tetap)")
    print(f"🏠 Kos Tetap    : RM {FIXED_COST:,.2f}  (Sewa400+BSN400+TNB500)")
    print(f"💵 Baki Hidup   : RM {baki_hidup:,.2f}  (lepas kos, sblm gaji)")
    print(f"🚦 Status       : {status}")
    print("=" * 48)


if __name__ == "__main__":
    main()
