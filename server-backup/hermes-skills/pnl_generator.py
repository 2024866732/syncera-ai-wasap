#!/usr/bin/env python3
"""
pnl_generator.py — HAFJET Monthly Profit & Loss Generator

Combines Loyverse revenue data with Supabase expenses to generate
complete P&L statement with hire-readiness verdict.

Usage:
    python3 pnl_generator.py                    # previous month (auto)
    python3 pnl_generator.py 2026 07            # explicit month
    python3 pnl_generator.py --send-whatsapp    # send to WhatsApp too
"""

import os
import sys
import json
import csv
import argparse
from datetime import date, datetime, timedelta, timezone
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
PNL_CSV = os.path.join(REPORTS_DIR, "pnl_tracker.csv")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Fixed costs (monthly)
FIXED_COSTS = {
    "sewa": 400.0,
    "bsn_loan": 400.0,
    "tnb": 500.0,
}
TOTAL_FIXED = sum(FIXED_COSTS.values())  # 1300.0

HIRE_THRESHOLD = 2900.0  # net profit needed for hire readiness
MYT = timezone(timedelta(hours=8))

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

EXPENSE_CATEGORIES = [
    "utilities", "stock_purchase", "repair_parts", 
    "rent", "loan_repayment", "misc"
]

EXPENSE_LABELS = {
    "utilities": "Utilities (Air/Elektrik/Internet/Telefon)",
    "stock_purchase": "Pembelian Stok (Phone/Unit)",
    "repair_parts": "Spare Parts Baikan",
    "rent": "Sewa Kedai",
    "loan_repayment": "Bayaran Pinjaman (BSN/Lain)",
    "misc": "Lain-lain"
}

# ── Helper Functions ────────────────────────────────────────────────
def load_token():
    tok = os.environ.get("LOYVERSE_ACCESS_TOKEN", "").strip()
    if tok:
        return tok
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            tok = f.read().strip()
        if tok:
            return tok
    env_path = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("LOYVERSE_ACCESS_TOKEN="):
                    return line.split("=", 1)[1].strip()
    return ""

def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def derive_target_month():
    today = date.today()
    first_of_this = today.replace(day=1)
    last_month = first_of_this - timedelta(days=1)
    return last_month.year, last_month.month

def month_bounds(year, month):
    start = date(year, month, 1)
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    end = nxt - timedelta(days=1)
    return start, end

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

def fetch_month_receipts(year, month):
    """Fetch all receipts for a given month from Loyverse."""
    prefix = f"{year:04d}-{month:02d}"
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=MYT)
    gte = start.isoformat()
    
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

def categorize_revenue_item(item_name: str) -> str:
    """Map Loyverse item name to revenue category."""
    name_lower = item_name.lower()
    for cat, keywords in REVENUE_CATEGORIES.items():
        for kw in keywords:
            if kw in name_lower:
                return cat
    return "other_bills"

def compute_revenue(receipts):
    """Compute revenue breakdown from Loyverse receipts."""
    revenue = {cat: 0.0 for cat in REVENUE_CATEGORIES}
    cogs = 0.0
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
            cogs += cost
            
            cat = categorize_revenue_item(item.get("item_name", ""))
            revenue[cat] += sales
    
    gross_profit = total_sales - cogs
    net_revenue = total_sales - total_discount  # revenue after discounts
    
    return {
        "revenue_breakdown": revenue,
        "total_sales": total_sales,
        "total_discount": total_discount,
        "net_revenue": net_revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "gross_margin": (gross_profit / total_sales * 100) if total_sales > 0 else 0,
        "transaction_count": tx_count
    }

def fetch_monthly_expenses(year, month):
    """Fetch expense totals by category from Supabase."""
    supabase = get_supabase()
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    
    result = supabase.table("expenses")\
        .select("category, total_amount")\
        .eq("status", "completed")\
        .gte("expense_date", start.isoformat())\
        .lt("expense_date", end.isoformat())\
        .execute()
    
    totals = {cat: 0.0 for cat in EXPENSE_CATEGORIES}
    for row in result.data:
        cat = row['category']
        if cat in totals:
            totals[cat] += float(row['total_amount'])
    return totals

def generate_pnl(year, month, send_whatsapp=False):
    """Generate complete P&L statement for the month."""
    global TOKEN
    TOKEN = load_token()
    if not TOKEN:
        print("❌ Loyverse token not found!")
        return None
    
    print(f"🔍 Generating P&L for {year}-{month:02d}...", file=sys.stderr)
    
    # 1. Fetch revenue from Loyverse
    receipts = fetch_month_receipts(year, month)
    if not receipts:
        print(f"  No receipts found for {year}-{month:02d}")
        return None
    
    rev_data = compute_revenue(receipts)
    
    # 2. Fetch expenses from Supabase
    expenses = fetch_monthly_expenses(year, month)
    
    # 3. Calculate P&L
    total_revenue = rev_data["net_revenue"]
    total_cogs = rev_data["cogs"]
    gross_profit = rev_data["gross_profit"]
    gross_margin = rev_data["gross_margin"]
    
    # Add fixed costs to expenses
    total_expenses = sum(expenses.values()) + TOTAL_FIXED
    expenses_with_fixed = expenses.copy()
    expenses_with_fixed["fixed_costs"] = TOTAL_FIXED
    
    net_profit = gross_profit - total_expenses
    net_margin = (net_profit / total_revenue * 100) if total_revenue > 0 else 0
    
    # Hire readiness
    hire_ready = net_profit >= HIRE_THRESHOLD
    months_to_ready = 0
    if not hire_ready and net_profit > 0:
        months_to_ready = int((HIRE_THRESHOLD - net_profit) / max(net_profit * 0.1, 100)) + 1
    
    # Build report
    report = {
        "period": f"{year}-{month:02d}",
        "generated_at": datetime.now(MYT).isoformat(),
        "revenue": rev_data["revenue_breakdown"],
        "total_revenue": total_revenue,
        "cogs": total_cogs,
        "gross_profit": gross_profit,
        "gross_margin": gross_margin,
        "expenses": expenses_with_fixed,
        "total_expenses": total_expenses,
        "fixed_costs": FIXED_COSTS.copy(),
        "net_profit": net_profit,
        "net_margin": net_margin,
        "transaction_count": rev_data["transaction_count"],
        "hire_ready": hire_ready,
        "months_to_ready": months_to_ready,
        "threshold": HIRE_THRESHOLD
    }
    
    # Print formatted report
    print_pnl_report(report, year, month)
    
    # Save to CSV tracker
    save_pnl_csv(report, year, month)
    
    # Generate/update dashboard
    update_dashboard(report, year, month)
    
    # Send WhatsApp if requested
    if send_whatsapp:
        send_whatsapp_report(report, year, month)
    
    return report

def print_pnl_report(report, year, month):
    """Print formatted P&L to console."""
    month_name = ["", "Jan", "Feb", "Mac", "Apr", "Mei", "Jun",
                  "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"][month]
    
    print(f"\n═══════════════════════════════════════════")
    print(f"  HAFJET PROFIT & LOSS — {month_name} {year}")
    print(f"═══════════════════════════════════════════")
    
    print(f"\n📈 REVENUE")
    print(f"──────────────────────────────────────────")
    for cat, label in CATEGORY_LABELS.items():
        val = report["revenue"].get(cat, 0)
        if val > 0:
            print(f"  {label:<30} RM {val:>10,.2f}")
    print(f"  {'─'*42}")
    print(f"  {'TOTAL REVENUE':<30} RM {report['total_revenue']:>10,.2f}")
    print(f"  {'COGS':<30} RM {report['cogs']:>10,.2f}")
    print(f"  {'─'*42}")
    print(f"  {'GROSS PROFIT':<30} RM {report['gross_profit']:>10,.2f} ({report['gross_margin']:.1f}%)")
    
    print(f"\n📉 EXPENSES")
    print(f"──────────────────────────────────────────")
    for cat, label in EXPENSE_LABELS.items():
        val = report["expenses"].get(cat, 0)
        if val > 0:
            print(f"  {label:<30} RM {val:>10,.2f}")
    
    # Fixed costs
    print(f"  {'─'*42}")
    for fc_cat, fc_val in report["fixed_costs"].items():
        label = {
            "sewa": "Sewa Kedai",
            "bsn_loan": "BSN Loan",
            "tnb": "TNB (estimate)"
        }.get(fc_cat, fc_cat)
        print(f"  {label:<30} RM {fc_val:>10,.2f}")
    
    print(f"  {'─'*42}")
    print(f"  {'TOTAL EXPENSES':<30} RM {report['total_expenses']:>10,.2f}")
    
    print(f"\n═══════════════════════════════════════════")
    net_color = "💚" if report["net_profit"] >= 0 else "❤️"
    print(f"  {net_color} NET PROFIT: RM {report['net_profit']:>10,.2f} ({report['net_margin']:.1f}%)")
    print(f"  Transaksi: {report['transaction_count']}")
    print(f"═══════════════════════════════════════════")
    
    # Hire readiness
    print(f"\n🎯 HIRE READINESS")
    print(f"──────────────────────────────────────────")
    if report["hire_ready"]:
        print(f"  ✅ READY — Net profit RM {report['net_profit']:,.2f} > Threshold RM {report['threshold']:,.0f}")
    else:
        gap = report["threshold"] - report["net_profit"]
        print(f"  ❌ NOT READY — Need RM {gap:,.2f} more (Threshold: RM {report['threshold']:,.0f})")
        if report["months_to_ready"] > 0:
            print(f"  📅 Est. {report['months_to_ready']} months at current trajectory")
    
    # Strategic insights
    phone_rev = report["revenue"].get("phone_sales", 0) + report["revenue"].get("repair_services", 0)
    bill_rev = report["revenue"].get("bill_redone", 0) + report["revenue"].get("tnb_payments", 0) + report["revenue"].get("tunetalk", 0)
    
    print(f"\n💡 STRATEGIC INSIGHTS")
    print(f"──────────────────────────────────────────")
    print(f"  • Phone + Repair Revenue: RM {phone_rev:,.2f}")
    print(f"  • Bill/Reload Revenue:    RM {bill_rev:,.2f}")
    if phone_rev > 0:
        ratio = bill_rev / phone_rev if phone_rev > 0 else 0
        print(f"  • Bill-to-Phone Ratio:     {ratio:.1f}:1")
    if phone_rev < 2000:
        print(f"  ⚠️  Phone sales < 2 units/mo → hire 6+ months away")
    elif phone_rev < 5000:
        print(f"  🟡 2-3 phone sales/mo → hire in 2-3 months")
    else:
        print(f"  ✅ Strong phone sales → hire ready soon")

def save_pnl_csv(report, year, month):
    """Save P&L data to tracker CSV."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    
    label = f"{year}-{month:02d}"
    row = [
        label,
        f"{report['total_revenue']:.2f}",
        f"{report['cogs']:.2f}",
        f"{report['gross_profit']:.2f}",
        f"{report['gross_margin']:.1f}",
        f"{report['total_expenses']:.2f}",
        f"{report['net_profit']:.2f}",
        f"{report['net_margin']:.1f}",
        "YES" if report["hire_ready"] else "NO",
        f"{report['months_to_ready']}"
    ]
    
    # Read existing
    rows = []
    if os.path.exists(PNL_CSV):
        with open(PNL_CSV, newline="") as f:
            rows = list(csv.reader(f))
    
    # Header
    if not rows:
        rows = [["period", "revenue", "cogs", "gross_profit", "gross_margin_pct",
                 "total_expenses", "net_profit", "net_margin_pct", "hire_ready", "months_to_ready"]]
    
    # Update or append
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
    
    print(f"✅ P&L CSV updated: {PNL_CSV}", file=sys.stderr)

def update_dashboard(report, year, month):
    """Generate/update HTML dashboard."""
    dashboard_path = os.path.join(REPORTS_DIR, "pnl_dashboard.html")
    
    # Read existing dashboard or create new
    html = generate_dashboard_html(report, year, month)
    
    with open(dashboard_path, "w") as f:
        f.write(html)
    
    print(f"✅ Dashboard updated: {dashboard_path}", file=sys.stderr)

def generate_dashboard_html(report, year, month):
    """Generate HTML dashboard with live calculations."""
    import json
    month_name = ["", "Jan", "Feb", "Mac", "Apr", "Mei", "Jun",
                  "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"][month]
    
    # Revenue breakdown for chart
    rev_data = []
    for cat, label in CATEGORY_LABELS.items():
        val = report["revenue"].get(cat, 0)
        if val > 0:
            rev_data.append({"label": label, "value": val})
    
    # Expense breakdown for chart
    exp_data = []
    for cat, label in EXPENSE_LABELS.items():
        val = report["expenses"].get(cat, 0)
        if val > 0:
            exp_data.append({"label": label, "value": val})
    
    # Fixed costs
    for fc_cat, fc_val in report["fixed_costs"].items():
        label = {"sewa": "Sewa Kedai", "bsn_loan": "BSN Loan", "tnb": "TNB (estimate)"}.get(fc_cat, fc_cat)
        exp_data.append({"label": label, "value": fc_val})
    
    hire_ready = report["hire_ready"]
    hire_status = "ready" if hire_ready else "not-ready"
    hire_text = "READY TO HIRE" if hire_ready else "NOT READY — Need RM " + f"{report['threshold'] - report['net_profit']:,.0f} more"
    
    phone_rev = report['revenue'].get('phone_sales',0) + report['revenue'].get('repair_services',0)
    bill_rev = report['revenue'].get('bill_redone',0) + report['revenue'].get('tnb_payments',0) + report['revenue'].get('tunetalk',0)
    basket_size = report['total_revenue'] / max(report['transaction_count'], 1)
    
    insight_class = "warning" if phone_rev < 2000 else ""
    insight_text = "Phone sales < 2 units/mo → hire 6+ months away" if phone_rev < 2000 else ("2-3 phone sales/mo → hire in 2-3 months" if phone_rev < 5000 else "Strong phone sales → hire ready soon")
    
    rev_json = json.dumps(rev_data)
    exp_json = json.dumps(exp_data)
    
    html = f"""<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HAFJET P&L Dashboard — {month_name} {year}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  :root {{ --bg:#0f1117; --card:#1a1d27; --green:#2ecc71; --red:#e74c3c; --yellow:#f1c40f; --blue:#3498db; --text:#e8eaf0; --muted:#8b90a0; }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:-apple-system,'Segoe UI',sans-serif; background:var(--bg); color:var(--text); padding:24px; max-width:1000px; margin:0 auto; }}
  h1 {{ font-size:24px; margin-bottom:4px; }}
  .sub {{ color:var(--muted); font-size:13px; margin-bottom:24px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-bottom:24px; }}
  .card {{ background:var(--card); border-radius:12px; padding:18px; border:1px solid #262a36; }}
  .card .label {{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }}
  .card .value {{ font-size:28px; font-weight:700; margin-top:6px; }}
  .green {{ color:var(--green); }} .red {{ color:var(--red); }} .yellow {{ color:var(--yellow); }} .blue {{ color:var(--blue); }}
  .section {{ background:var(--card); border-radius:12px; padding:20px; margin-bottom:20px; border:1px solid #262a36; }}
  .section h2 {{ font-size:15px; margin-bottom:16px; color:var(--blue); }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th,td {{ text-align:left; padding:8px 6px; border-bottom:1px solid #262a36; }}
  th {{ color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; }}
  .charts {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; }}
  @media (max-width:700px) {{ .charts {{ grid-template-columns:1fr; }} }}
  .chart-wrap {{ background:var(--card); border-radius:12px; padding:16px; border:1px solid #262a36; height:300px; }}
  .insight {{ background:#1a2a1a; border-left:4px solid var(--green); padding:12px 16px; margin-top:12px; border-radius:0 8px 8px 0; }}
  .warning {{ background:#2a1a1a; border-left:4px solid var(--red); }}
  .meta {{ font-size:12px; color:var(--muted); margin-top:20px; }}
</style>
</head>
<body>
  <h1>📊 HAFJET P&L Dashboard</h1>
  <div class="sub">{month_name} {year} — Generated {datetime.now(MYT).strftime('%d/%m/%Y %H:%M MYT')}</div>
  
  <div class="grid">
    <div class="card">
      <div class="label">Total Revenue</div>
      <div class="value blue">RM {report['total_revenue']:,.2f}</div>
      <div class="sub">{report['transaction_count']} transaksi</div>
    </div>
    <div class="card">
      <div class="label">Gross Profit</div>
      <div class="value green">RM {report['gross_profit']:,.2f}</div>
      <div class="sub">{report['gross_margin']:.1f}% margin</div>
    </div>
    <div class="card">
      <div class="label">Total Expenses</div>
      <div class="value red">RM {report['total_expenses']:,.2f}</div>
      <div class="sub">incl. fixed RM {TOTAL_FIXED:,.0f}</div>
    </div>
    <div class="card">
      <div class="label">Net Profit</div>
      <div class="value {'green' if report['net_profit']>=0 else 'red'}">RM {report['net_profit']:,.2f}</div>
      <div class="sub">{report['net_margin']:.1f}% margin</div>
    </div>
  </div>
  
  <div class="section">
    <h2>🎯 Hire Readiness</h2>
    <div class="card" style="text-align:center; padding:30px;">
      <div class="value {'green' if hire_ready else 'red'}" style="font-size:32px;">
        {hire_text}
      </div>
      <div class="sub" style="margin-top:12px;">Threshold: RM {report['threshold']:,.0f}/month net profit</div>
      {f'<div class="sub" style="margin-top:8px;">Est. {report["months_to_ready"]} months at current trajectory</div>' if not hire_ready and report['months_to_ready']>0 else ''}
    </div>
  </div>
  
  <div class="charts">
    <div class="chart-wrap">
      <h3 style="margin-bottom:12px; color:var(--blue);">Revenue Breakdown</h3>
      <canvas id="revChart"></canvas>
    </div>
    <div class="chart-wrap">
      <h3 style="margin-bottom:12px; color:var(--red);">Expense Breakdown</h3>
      <canvas id="expChart"></canvas>
    </div>
  </div>
  
  <div class="section">
    <h2>📋 Detailed P&L</h2>
    <table>
      <thead><tr><th>Category</th><th style="text-align:right">Amount (RM)</th></tr></thead>
      <tbody>
        <tr><td colspan="2" style="font-weight:600; color:var(--blue);">REVENUE</td></tr>
        {''.join(f'<tr><td>{CATEGORY_LABELS.get(cat,cat)}</td><td style="text-align:right">{val:,.2f}</td></tr>' for cat,val in report['revenue'].items() if val>0)}
        <tr><td><strong>Total Revenue</strong></td><td style="text-align:right"><strong>{report['total_revenue']:,.2f}</strong></td></tr>
        <tr><td>COGS</td><td style="text-align:right">{report['cogs']:,.2f}</td></tr>
        <tr><td style="color:var(--green)"><strong>Gross Profit ({report['gross_margin']:.1f}%)</strong></td><td style="text-align:right;color:var(--green)"><strong>{report['gross_profit']:,.2f}</strong></td></tr>
        <tr><td colspan="2" style="font-weight:600; color:var(--red);">EXPENSES</td></tr>
        {''.join(f'<tr><td>{EXPENSE_LABELS.get(cat,cat)}</td><td style="text-align:right">{val:,.2f}</td></tr>' for cat,val in report['expenses'].items() if val>0 and cat!='fixed_costs')}
        {''.join(f'<tr><td>{"Sewa Kedai" if cat=="sewa" else "BSN Loan" if cat=="bsn_loan" else "TNB (estimate)"}</td><td style="text-align:right">{val:,.2f}</td></tr>' for cat,val in report['fixed_costs'].items())}
        <tr><td><strong>Total Expenses</strong></td><td style="text-align:right"><strong>{report['total_expenses']:,.2f}</strong></td></tr>
        <tr style="background:#1a2a1a;"><td style="color:var(--green)"><strong>NET PROFIT ({report['net_margin']:.1f}%)</strong></td><td style="text-align:right;color:var(--green)"><strong>{report['net_profit']:,.2f}</strong></td></tr>
      </tbody>
    </table>
  </div>
  
  <div class="insight {insight_class}">
    <h4 style="margin-bottom:8px;">💡 Strategic Insights</h4>
    <ul style="margin-left:20px; line-height:1.8;">
      <li>Phone + Repair Revenue: RM {phone_rev:,.2f}</li>
      <li>Bill/Reload Revenue: RM {bill_rev:,.2f}</li>
      <li>{insight_text}</li>
      <li>Target basket size: RM 100+ (current: RM {basket_size:.0f})</li>
    </ul>
  </div>
  
  <div class="meta">Data sources: Loyverse API (revenue) + Supabase (expenses) | Auto-generated by HAFJET BI Agent</div>

  <script>
    const revData = {rev_json};
    const expData = {exp_json};
    
    new Chart(document.getElementById('revChart'), {{
      type: 'doughnut',
      data: {{
        labels: revData.map(d=>d.label),
        datasets: [{{
          data: revData.map(d=>d.value),
          backgroundColor: ['#3498db','#2ecc71','#f1c40f','#e74c3c','#9b59b6','#1abc9c','#e67e22','#34495e'],
          borderWidth: 0
        }}]
      }},
      options: {{ responsive:true, maintainAspectRatio:true, plugins:{{legend:{{position:'bottom',labels:{{color:'#8b90a0',font:{{size:11}}}}}}}} }}
    }});
    
    new Chart(document.getElementById('expChart'), {{
      type: 'doughnut',
      data: {{
        labels: expData.map(d=>d.label),
        datasets: [{{
          data: expData.map(d=>d.value),
          backgroundColor: ['#e74c3c','#c0392b','#e67e22','#d35400','#f39c12','#f1c40f','#95a5a6','#7f8c8d'],
          borderWidth: 0
        }}]
      }},
      options: {{ responsive:true, maintainAspectRatio:true, plugins:{{legend:{{position:'bottom',labels:{{color:'#8b90a0',font:{{size:11}}}}}}}} }}
    }});
  </script>
</body>
</html>"""
    return html

def send_whatsapp_report(report, year, month):
    """Send P&L summary via WhatsApp (placeholder - integrate with Meta Graph API)."""
    # TODO: Implement WhatsApp sending using Meta Graph API
    # This would use WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID
    print("📱 WhatsApp sending not yet implemented", file=sys.stderr)

# ── Main ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="HAFJET Monthly P&L Generator")
    parser.add_argument("year", nargs="?", type=int, help="Year (e.g., 2026)")
    parser.add_argument("month", nargs="?", type=int, help="Month (1-12)")
    parser.add_argument("--send-whatsapp", action="store_true", help="Send to WhatsApp")
    args = parser.parse_args()
    
    if args.year and args.month:
        year, month = args.year, args.month
    else:
        year, month = derive_target_month()
    
    generate_pnl(year, month, send_whatsapp=args.send_whatsapp)

if __name__ == "__main__":
    main()