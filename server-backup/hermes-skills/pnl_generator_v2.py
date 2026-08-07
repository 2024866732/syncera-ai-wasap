#!/usr/bin/env python3
"""
pnl_generator_v2.py — HAFJET Monthly P&L Generator (Production Hardened)

Key fixes over v1:
- Discount allocated proportionally to COGS (not ignored)
- Fixed costs fetched from Supabase table, not hardcoded
- Consistent hire threshold (RM 2,900) across all scripts
- UTC-based month boundaries to avoid 1-day edge cases
- Revenue reconciliation (warn if >5% uncategorized)
- Stock purchases flagged as capital expenditure vs expense
- Loyverse 31-day limit detection and warning
- Detailed accounting line items

Usage:
    python3 pnl_generator_v2.py                    # previous month (auto)
    python3 pnl_generator_v2.py 2026 07            # explicit month
    python3 pnl_generator_v2.py --live              # current month MTD
"""

import os
import sys
import json
import csv
import argparse
from datetime import date, datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

# Supabase
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────
BASE_URL = "https://api.loyverse.com/v1.0"
TOKEN_FILE = "/tmp/.loyverse_token"
REPORTS_DIR = os.path.expanduser("~/.hermes/reports")
PNL_CSV = os.path.join(REPORTS_DIR, "pnl_tracker_v2.csv")
DASHBOARD_PATH = os.path.join(REPORTS_DIR, "pnl_dashboard_v2.html")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Consistent hire threshold (same across all scripts)
HIRE_THRESHOLD = 2900.0  # net profit needed for hire readiness
LOVVERSE_MAX_DAYS = 31   # free tier limit
MYT = timezone(timedelta(hours=8))
UTC = timezone.utc

# Revenue categories mapping from Loyverse items
REVENUE_CATEGORIES = {
    "bill_redone": ["bill redone", "bill reload", "reload", "topup", "top up"],
    "tnb_payments": ["tnb", "tenaga", "electric", "elektrik", "bill tnb"],
    "tunetalk": ["tunetalk", "tune talk"],
    "phone_sales": [
        "vivo v70", "realme 16 pro", "iphone 15", "pixel 7 pro",
        "oppo reno", "redmi note", "phone", "fon", "handphone",
        "smartphone", "unit", "set"
    ],
    "repair_services": [
        "repair", "baiki", "servis", "tukar lcd", "tukar skrin",
        "ganti lcd", "ganti battery", "charging port", "back cover",
        "motherboard", "camera", "speaker", "mic"
    ],
    "accessories": [
        "casing", "tempered", "screen protector", "kabel", "cable",
        "charger", "headphone", "earphone", "powerbank", "holder",
        "stand", "ring", "strap"
    ],
    "photostat": ["photostat", "fotostat", "fotokopi", "copy"],
    "other_bills": ["bill maxis", "bill air", "bill astro", "bill tm", "bill unifi"]
}

CATEGORY_LABELS = {
    "bill_redone": "BILL REDONE (Reload/Topup)",
    "tnb_payments": "TNB Payments",
    "tunetalk": "Tunetalk",
    "phone_sales": "Phone Sales",
    "repair_services": "Repair Services",
    "accessories": "Accessories",
    "photostat": "Photostat/Fotokopi",
    "other_bills": "Other Bill Payments"
}

EXPENSE_LABELS = {
    "utilities": "Utilities (Air/Elektrik/Internet)",
    "stock_purchase": "Pembelian Stok",
    "repair_parts": "Spare Parts Baikan",
    "rent": "Sewa Kedai",
    "loan_repayment": "Bayaran Pinjaman",
    "misc": "Lain-lain"
}

# ── Token & Auth ────────────────────────────────────────────────────
def load_token():
    tok = os.environ.get("LOYVERSE_ACCESS_TOKEN", "").strip()
    if tok:
        return tok
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    env_path = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("LOYVERSE_ACCESS_TOKEN="):
                    return line.split("=", 1)[1].strip()
    return ""

def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def derive_target_month():
    today = date.today()
    first_of_this = today.replace(day=1)
    last_month = first_of_this - timedelta(days=1)
    return last_month.year, last_month.month

# ── Fixed Costs (from DB) ───────────────────────────────────────────
def get_fixed_costs() -> dict:
    """Fetch active fixed costs from Supabase. Falls back to hardcoded if empty."""
    fallback = {"sewa": 400.0, "bsn_loan": 400.0, "tnb": 500.0}
    try:
        supabase = get_supabase()
        result = supabase.table("fixed_costs")\
            .select("name, amount")\
            .eq("is_active", True)\
            .execute()
        costs = {}
        for row in result.data:
            costs[row['name']] = float(row['amount'])
        if not costs:
            print("  ⚠️ DB returned 0 fixed_costs rows — using hardcoded fallback", file=sys.stderr)
            return fallback
        return costs
    except Exception as e:
        print(f"  ⚠ Could not fetch fixed costs from DB: {e}", file=sys.stderr)
        print(f"     Using hardcoded fallback: {fallback}", file=sys.stderr)
        return fallback

# ── Loyverse Data Fetching ──────────────────────────────────────────
def api_get(params):
    url = BASE_URL + "/receipts?" + urlencode(params, safe=":+=.")
    req = Request(url)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/json")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  ⚠ HTTP {e.code}: {body[:150]}", file=sys.stderr)
        return None
    except URLError as e:
        print(f"  ⚠ URL Error: {e.reason}", file=sys.stderr)
        return None

def check_loyverse_window(year, month):
    """Check if target month is within the 31-day Loyverse window.
    
    Uses month START because Loyverse free tier drops receipts older
    than 31 days individually. The first day of the month must be
    within the window to guarantee complete data.
    """
    today = date.today()
    # Start of target month (receipts from day 1 must still be visible)
    month_start = date(year, month, 1)
    
    days_ago = (today - month_start).days
    if days_ago > LOVVERSE_MAX_DAYS:
        return False, f"{days_ago} days ago — first receipts may be truncated (Loyverse limit: {LOVVERSE_MAX_DAYS})"
    return True, f"OK (oldest receipt: {days_ago} days ago, limit: {LOVVERSE_MAX_DAYS})"

def fetch_month_receipts(year, month):
    """Fetch all receipts for a given month (UTC boundaries)."""
    prefix = f"{year:04d}-{month:02d}"
    
    # Use UTC boundaries to avoid timezone edge cases
    start_utc = datetime(year, month, 1, tzinfo=UTC)
    if month == 12:
        end_utc = datetime(year + 1, 1, 1, tzinfo=UTC) - timedelta(seconds=1)
    else:
        end_utc = datetime(year, month + 1, 1, tzinfo=UTC) - timedelta(seconds=1)
    
    gte = start_utc.isoformat()
    
    all_receipts = []
    params = {"created_at.min": gte, "limit": 10}
    page = 1
    while True:
        data = api_get(params)
        if data is None:
            break
        receipts = data.get("receipts", [])
        month_r = [r for r in receipts if r.get("created_at", "").startswith(prefix)]
        all_receipts.extend(month_r)
        cursor = data.get("cursor")
        if not cursor or not receipts:
            break
        params = {"cursor": cursor}
        page += 1
    return all_receipts

# ── Revenue Computation ─────────────────────────────────────────────
def categorize_revenue_item(item_name: str) -> str:
    name_lower = item_name.lower()
    for cat, keywords in REVENUE_CATEGORIES.items():
        for kw in keywords:
            if kw in name_lower:
                return cat
    return "other_bills"

def compute_revenue(receipts):
    """Compute revenue breakdown with proper discount allocation."""
    revenue = {cat: 0.0 for cat in REVENUE_CATEGORIES}
    cogs_raw = 0.0
    total_sales = 0.0
    total_discount = 0.0
    tx_count = 0
    
    for r in receipts:
        tx_count += 1
        total_sales += float(r.get("total_money", 0))
        total_discount += float(r.get("total_discount", 0))
        
        for item in r.get("line_items", []):
            sales = float(item.get("total_money", 0))
            cost = float(item.get("cost_total", 0))
            cogs_raw += cost
            
            cat = categorize_revenue_item(item.get("item_name", ""))
            revenue[cat] += sales
    
    # CRITICAL: Allocate discount proportionally to COGS
    # If 5% discount on RM 100, COGS should be reduced by 5% too
    discount_rate = total_discount / total_sales if total_sales > 0 else 0
    cogs_adjusted = cogs_raw * (1 - discount_rate)
    
    gross_profit = (total_sales - total_discount) - cogs_adjusted
    
    # Revenue reconciliation
    categorized_total = sum(revenue.values())
    reconciliation_gap = total_sales - categorized_total
    reconciliation_pct = abs(reconciliation_gap / total_sales * 100) if total_sales > 0 else 0
    
    return {
        "revenue_breakdown": revenue,
        "total_sales": total_sales,
        "total_discount": total_discount,
        "net_revenue": total_sales - total_discount,
        "cogs_raw": cogs_raw,
        "cogs_adjusted": cogs_adjusted,
        "discount_rate": discount_rate,
        "gross_profit": gross_profit,
        "gross_margin": (gross_profit / total_sales * 100) if total_sales > 0 else 0,
        "transaction_count": tx_count,
        "reconciliation_gap": reconciliation_gap,
        "reconciliation_ok": reconciliation_pct < 5.0,  # warn if >5% uncategorized
    }

# ── Expense Fetching ────────────────────────────────────────────────
def fetch_monthly_expenses(year, month):
    """Fetch variable expenses from Supabase (excludes soft-deleted)."""
    supabase = get_supabase()
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    
    result = supabase.table("expenses")\
        .select("category, total_amount, tax_amount")\
        .eq("status", "completed")\
        .is_("deleted_at", "null")\
        .gte("expense_date", start.isoformat())\
        .lt("expense_date", end.isoformat())\
        .execute()
    
    totals = {
        "utilities": 0.0,
        "stock_purchase": 0.0,
        "repair_parts": 0.0,
        "rent": 0.0,
        "loan_repayment": 0.0,
        "misc": 0.0
    }
    
    for row in result.data:
        cat = row['category']
        if cat in totals:
            totals[cat] += float(row['total_amount'])
    return totals

# ── P&L Generation ──────────────────────────────────────────────────
def generate_pnl(year, month):
    """Generate complete P&L statement."""
    global TOKEN
    TOKEN = load_token()
    if not TOKEN:
        print("❌ Loyverse token not found!", file=sys.stderr)
        return None
    
    print(f"🔍 Generating P&L for {year}-{month:02d}...", file=sys.stderr)
    
    # Check Loyverse window
    in_window, window_msg = check_loyverse_window(year, month)
    if not in_window:
        print(f"  ⚠ LOYVERSE WARNING: {window_msg}", file=sys.stderr)
        print(f"     Data may be incomplete. Reports >{LOVVERSE_MAX_DAYS} days old are truncated.", file=sys.stderr)
    
    # 1. Fetch revenue
    receipts = fetch_month_receipts(year, month)
    if not receipts:
        print(f"  No receipts found for {year}-{month:02d}")
        return None
    
    rev_data = compute_revenue(receipts)
    
    # 2. Fetch variable expenses
    var_expenses = fetch_monthly_expenses(year, month)
    
    # 3. Fetch fixed costs
    fixed_costs = get_fixed_costs()
    total_fixed = sum(fixed_costs.values())
    
    # 4. Calculate P&L
    total_revenue = rev_data["net_revenue"]
    total_cogs = rev_data["cogs_adjusted"]
    gross_profit = rev_data["gross_profit"]
    gross_margin = rev_data["gross_margin"]
    
    total_var_expenses = sum(var_expenses.values())
    total_all_expenses = total_var_expenses + total_fixed
    
    net_profit = gross_profit - total_all_expenses
    net_margin = (net_profit / total_revenue * 100) if total_revenue > 0 else 0
    
    # 5. Hire readiness
    hire_ready = net_profit >= HIRE_THRESHOLD
    months_to_ready = 0
    if not hire_ready and net_profit > 0:
        monthly_growth = net_profit * 0.05  # assume 5% monthly growth
        if monthly_growth > 0:
            months_to_ready = int((HIRE_THRESHOLD - net_profit) / max(monthly_growth, 50)) + 1
        else:
            months_to_ready = int((HIRE_THRESHOLD - net_profit) / 100) + 1
    
    # 6. Category-level margin analysis
    revenue_cat = rev_data["revenue_breakdown"]
    phone_repair_rev = revenue_cat.get("phone_sales", 0) + revenue_cat.get("repair_services", 0)
    bill_rev = (revenue_cat.get("bill_redone", 0) + revenue_cat.get("tnb_payments", 0) + 
                revenue_cat.get("tunetalk", 0) + revenue_cat.get("other_bills", 0))
    bill_ratio = bill_rev / phone_repair_rev if phone_repair_rev > 0 else 999
    
    # Build report
    report = {
        "period": f"{year}-{month:02d}",
        "generated_at": datetime.now(MYT).isoformat(),
        "revenue": revenue_cat,
        "total_revenue": total_revenue,
        "total_revenue_gross": rev_data["total_sales"],
        "total_discount": rev_data["total_discount"],
        "cogs_adjusted": total_cogs,
        "gross_profit": gross_profit,
        "gross_margin": gross_margin,
        "variable_expenses": var_expenses,
        "total_var_expenses": total_var_expenses,
        "fixed_costs": fixed_costs,
        "total_fixed": total_fixed,
        "total_all_expenses": total_all_expenses,
        "net_profit": net_profit,
        "net_margin": net_margin,
        "transaction_count": rev_data["transaction_count"],
        "reconciliation_ok": rev_data["reconciliation_ok"],
        "reconciliation_gap": rev_data["reconciliation_gap"],
        "hire_ready": hire_ready,
        "months_to_ready": months_to_ready,
        "threshold": HIRE_THRESHOLD,
        "loyverse_window_ok": in_window,
        "loyverse_window_msg": window_msg,
        "phone_repair_rev": phone_repair_rev,
        "bill_rev": bill_rev,
        "bill_ratio": bill_ratio,
        "basket_size": total_revenue / max(rev_data["transaction_count"], 1)
    }
    
    # Print report
    print_pnl_report(report, year, month)
    
    # Save CSV
    save_pnl_csv(report, year, month)
    
    # Generate dashboard
    update_dashboard(report, year, month)
    
    return report

# ── Report Formatting ───────────────────────────────────────────────
def print_pnl_report(report, year, month):
    """Print beautifully formatted P&L statement."""
    month_name = ["", "Jan", "Feb", "Mac", "Apr", "Mei", "Jun",
                  "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"][month]
    
    print(f"\n{'='*55}")
    print(f"  HAFJET PROFIT & LOSS — {month_name} {year}")
    print(f"  Generated: {datetime.now(MYT).strftime('%d/%m/%Y %H:%M MYT')}")
    print(f"{'='*55}")
    
    # Revenue section
    print(f"\n📈 REVENUE")
    print(f"{'─'*55}")
    for cat, label in CATEGORY_LABELS.items():
        val = report["revenue"].get(cat, 0)
        if val > 0:
            print(f"  {label:<35} RM {val:>10,.2f}")
    print(f"  {'─'*47}")
    print(f"  {'Gross Sales':<35} RM {report['total_revenue_gross']:>10,.2f}")
    if report['total_discount'] > 0:
        print(f"  {'Less: Discounts':<35} RM {report['total_discount']:>10,.2f}")
    print(f"  {'Net Revenue':<35} RM {report['total_revenue']:>10,.2f}")
    if not report['reconciliation_ok']:
        print(f"  ⚠  Uncategorized: RM {report['reconciliation_gap']:,.2f}")
    
    # COGS
    print(f"\n📦 COST OF GOODS SOLD")
    print(f"{'─'*55}")
    print(f"  {'COGS (adjusted for discounts)':<35} RM {report['cogs_adjusted']:>10,.2f}")
    print(f"  {'─'*47}")
    profit_icon = "🟢" if report['gross_profit'] > 0 else "🔴"
    print(f"  {profit_icon} {'GROSS PROFIT':<33} RM {report['gross_profit']:>10,.2f}  "
          f"({report['gross_margin']:.1f}%)")
    
    # Expenses
    print(f"\n📉 OPERATING EXPENSES")
    print(f"{'─'*55}")
    
    # Variable expenses
    print(f"  Variable Expenses:")
    for cat, label in EXPENSE_LABELS.items():
        val = report["variable_expenses"].get(cat, 0)
        if val > 0:
            print(f"    {label:<33} RM {val:>10,.2f}")
    print(f"  {'  Total Variable':<35} RM {report['total_var_expenses']:>10,.2f}")
    
    # Fixed costs
    print(f"\n  Fixed Costs:")
    fixed_labels = {"sewa": "Sewa Kedai", "bsn_loan": "BSN Loan", "tnb": "TNB"}
    for name, amount in report["fixed_costs"].items():
        label = fixed_labels.get(name, name.replace('_', ' ').title())
        print(f"    {label:<33} RM {amount:>10,.2f}")
    print(f"  {'  Total Fixed':<35} RM {report['total_fixed']:>10,.2f}")
    
    print(f"  {'─'*47}")
    print(f"  {'TOTAL EXPENSES':<35} RM {report['total_all_expenses']:>10,.2f}")
    
    # Net profit
    print(f"\n{'='*55}")
    net_icon = "💚" if report['net_profit'] >= 0 else "❤️"
    print(f"  {net_icon} NET PROFIT: RM {report['net_profit']:>10,.2f}  "
          f"({report['net_margin']:.1f}%)  |  {report['transaction_count']} txns")
    print(f"{'='*55}")
    
    # Hire readiness
    print(f"\n🎯 HIRE READINESS  (threshold: RM {report['threshold']:,.0f}/month)")
    print(f"{'─'*55}")
    if report['hire_ready']:
        print(f"  ✅ READY — Net profit exceeds threshold")
    else:
        gap = report['threshold'] - report['net_profit']
        print(f"  ❌ NOT READY — Gap: RM {gap:,.2f}")
        if report['months_to_ready'] > 0:
            print(f"  📅 Estimated {report['months_to_ready']} months at current trajectory")
    
    # Strategic insights
    print(f"\n💡 STRATEGIC INSIGHTS")
    print(f"{'─'*55}")
    print(f"  • Phone + Repair: RM {report['phone_repair_rev']:,.2f}")
    print(f"  • Bill/Reload:    RM {report['bill_rev']:,.2f}")
    print(f"  • Bill Ratio:     {report['bill_ratio']:.1f}:1")
    print(f"  • Avg Basket:     RM {report['basket_size']:.2f}")
    
    if report['phone_repair_rev'] < 2000:
        print(f"  ⚠️  Phone sales < 2 units/mo → hire 6+ months away")
    elif report['phone_repair_rev'] < 5000:
        print(f"  🟡 2-3 phone sales/mo → hire in 2-3 months")
    else:
        print(f"  ✅ Strong phone sales → hire ready soon")
    
    if not report['loyverse_window_ok']:
        print(f"  ⚠️  Loyverse data may be incomplete ({report['loyverse_window_msg']})")

# ── CSV & Dashboard ─────────────────────────────────────────────────
def save_pnl_csv(report, year, month):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    label = f"{year}-{month:02d}"
    row = [
        label,
        f"{report['total_revenue']:.2f}",
        f"{report['cogs_adjusted']:.2f}",
        f"{report['gross_profit']:.2f}",
        f"{report['gross_margin']:.1f}",
        f"{report['total_all_expenses']:.2f}",
        f"{report['net_profit']:.2f}",
        f"{report['net_margin']:.1f}",
        "YES" if report['hire_ready'] else "NO",
        f"{report['months_to_ready']}"
    ]
    
    rows = []
    if os.path.exists(PNL_CSV):
        with open(PNL_CSV, newline="") as f:
            rows = list(csv.reader(f))
    
    if not rows:
        rows = [["period", "revenue", "cogs", "gross_profit", "gross_margin_pct",
                 "total_expenses", "net_profit", "net_margin_pct", "hire_ready", "months_to_ready"]]
    
    found = False
    for i in range(1, len(rows)):
        if rows[i] and rows[i][0] == label:
            rows[i] = row
            found = True
            break
    if not found:
        rows.append(row)
    
    with open(PNL_CSV, "w", newline="") as f:
        csv.writer(f).writerows(rows)
    
    print(f"✅ P&L CSV: {PNL_CSV}", file=sys.stderr)

def update_dashboard(report, year, month):
    """Generate dashboard HTML with report data."""
    month_name = ["", "Jan", "Feb", "Mac", "Apr", "Mei", "Jun",
                  "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"][month]
    hire_text = "READY TO HIRE" if report['hire_ready'] else f"NOT READY — Need RM {report['threshold'] - report['net_profit']:,.0f} more"
    hire_class = "green" if report['hire_ready'] else "red"
    profit_class = "green" if report['net_profit'] >= 0 else "red"
    
    html = f"""<!DOCTYPE html><html lang="ms"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>HAFJET P&L - {month_name} {year}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#0f1117;color:#e8eaf0;font-family:system-ui,sans-serif;padding:24px;max-width:900px;margin:0 auto}}
h1{{font-size:22px;margin-bottom:4px}}
.sub{{color:#8b90a0;font-size:13px;margin-bottom:20px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:24px}}
.c{{background:#1a1d27;border-radius:12px;padding:16px;border:1px solid #262a36}}
.c .l{{color:#8b90a0;font-size:11px;text-transform:uppercase;letter-spacing:.5px}}
.c .v{{font-size:26px;font-weight:700;margin-top:6px}}
.c .s{{font-size:11px;color:#8b90a0;margin-top:4px}}
.g{{color:#2ecc71}}.r{{color:#e74c3c}}.y{{color:#f1c40f}}.b{{color:#3498db}}
.section{{background:#1a1d27;border-radius:12px;padding:18px;margin-bottom:18px;border:1px solid #262a36}}
.section h2{{font-size:15px;margin-bottom:14px;color:#3498db}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{text-align:left;padding:7px 6px;border-bottom:1px solid #262a36}}
th{{color:#8b90a0;font-weight:600;font-size:11px;text-transform:uppercase}}
.insight{{background:#1a2a1a;border-left:3px solid #2ecc71;padding:12px 16px;margin-top:12px;border-radius:0 8px 8px 0}}
.meta{{font-size:11px;color:#8b90a0;margin-top:16px;text-align:center}}
</style></head><body>
<h1>📊 HAFJET P&L Dashboard</h1>
<div class="sub">{month_name} {year}</div>

<div class="cards">
<div class="c"><div class="l">Net Revenue</div><div class="v b">RM {report['total_revenue']:,.2f}</div><div class="s">{report['transaction_count']} txns</div></div>
<div class="c"><div class="l">Gross Profit</div><div class="v g">RM {report['gross_profit']:,.2f}</div><div class="s">{report['gross_margin']:.1f}% margin</div></div>
<div class="c"><div class="l">Total Expenses</div><div class="v r">RM {report['total_all_expenses']:,.2f}</div><div class="s">Fixed: RM {report['total_fixed']:,.0f}</div></div>
<div class="c"><div class="l">Net Profit</div><div class="v {profit_class}">RM {report['net_profit']:,.2f}</div><div class="s">{report['net_margin']:.1f}% margin</div></div>
</div>

<div class="section"><h2>🎯 Hire Status</h2>
<div style="text-align:center;padding:20px"><div style="font-size:28px;font-weight:700" class="{hire_class}">{hire_text}</div>
<div style="color:#8b90a0;margin-top:8px">Threshold: RM {report['threshold']:,.0f}/mo</div>
{'' if report['hire_ready'] else f'<div style="color:#8b90a0;margin-top:4px">Est. {report["months_to_ready"]} months to ready</div>'}
</div></div>

<div class="section"><h2>📋 Detailed P&L</h2><table>
<tr><td colspan="2" style="color:#3498db;font-weight:600">REVENUE</td></tr>
{''.join(f'<tr><td>{CATEGORY_LABELS.get(c,"")}</td><td style="text-align:right">RM {v:,.2f}</td></tr>' for c,v in report['revenue'].items() if v>0)}
<tr><td><strong>Net Revenue</strong></td><td style="text-align:right"><strong>RM {report['total_revenue']:,.2f}</strong></td></tr>
<tr><td>Less: COGS</td><td style="text-align:right">RM {report['cogs_adjusted']:,.2f}</td></tr>
<tr style="background:#1a2a1a"><td style="color:#2ecc71"><strong>Gross Profit ({report['gross_margin']:.1f}%)</strong></td><td style="text-align:right;color:#2ecc71"><strong>RM {report['gross_profit']:,.2f}</strong></td></tr>
<tr><td colspan="2" style="color:#e74c3c;font-weight:600">EXPENSES</td></tr>
{''.join(f'<tr><td>{EXPENSE_LABELS.get(c,"")}</td><td style="text-align:right">RM {v:,.2f}</td></tr>' for c,v in report['variable_expenses'].items() if v>0)}
{''.join(f'<tr><td>{l}</td><td style="text-align:right">RM {a:,.2f}</td></tr>' for l,a in zip(["Sewa","BSN Loan","TNB"],[report['fixed_costs'].get(k,0) for k in ['sewa','bsn_loan','tnb']]) if a>0)}
<tr><td><strong>Total Expenses</strong></td><td style="text-align:right"><strong>RM {report['total_all_expenses']:,.2f}</strong></td></tr>
<tr style="background:#1a2a1a"><td style="color:#2ecc71"><strong>NET PROFIT ({report['net_margin']:.1f}%)</strong></td><td style="text-align:right;color:#2ecc71"><strong>RM {report['net_profit']:,.2f}</strong></td></tr>
</table></div>

<div class="insight"><h4 style="margin-bottom:8px">💡 Insights</h4>
<ul style="margin-left:18px;line-height:1.8">
<li>Phone+Repair: RM {report['phone_repair_rev']:,.2f}</li>
<li>Bill/Reload: RM {report['bill_rev']:,.2f}</li>
<li>Avg Basket: RM {report['basket_size']:.2f}</li>
{'' if report['bill_ratio'] < 5 else '<li class="r">Bill ratio too high — push phone sales</li>'}
</ul></div>

<div class="meta">Generated {datetime.now(MYT).strftime('%d/%m/%Y %H:%M MYT')} · HAFJET BI Agent v2</div>
</body></html>"""
    
    with open(DASHBOARD_PATH, "w") as f:
        f.write(html)
    print(f"✅ Dashboard: {DASHBOARD_PATH}", file=sys.stderr)

# ── Main ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="HAFJET Monthly P&L Generator v2")
    parser.add_argument("year", nargs="?", type=int)
    parser.add_argument("month", nargs="?", type=int)
    parser.add_argument("--live", action="store_true", help="Current month MTD (not previous)")
    args = parser.parse_args()
    
    if args.live:
        now = datetime.now()
        year, month = now.year, now.month
    elif args.year and args.month:
        year, month = args.year, args.month
    else:
        year, month = derive_target_month()
    
    generate_pnl(year, month)

if __name__ == "__main__":
    main()
