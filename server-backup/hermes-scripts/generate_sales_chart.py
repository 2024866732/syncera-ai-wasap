#!/usr/bin/env python3
"""
generate_sales_chart.py - Visualize 30-day Loyverse sales data.
Generates: daily revenue bar chart + payment breakdown pie chart.
"""

import os
import sys
import csv
from datetime import datetime, timezone, timedelta
from collections import defaultdict

try:
    import matplotlib
    matplotlib.use("Agg")  # headless
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    from matplotlib.ticker import MaxNLocator
except ImportError:
    print("❌ matplotlib not installed. Run: pip3 install matplotlib", file=sys.stderr)
    sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────
CSV_PATH = os.path.expanduser("~/.hermes/reports/sales_past_30_days.csv")
OUTPUT_DIR = os.path.expanduser("~/.hermes/reports")
CHART_PATH = os.path.join(OUTPUT_DIR, "sales_30days_chart.png")
MYT = timezone(timedelta(hours=8))

# ── Load Data ───────────────────────────────────────────────────────
daily_sales = defaultdict(float)
payment_totals = defaultdict(float)
daily_transactions = defaultdict(int)

with open(CSV_PATH, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Parse date
        created = row.get("created_at", "")
        if not created:
            continue
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            dt_myt = dt.astimezone(MYT)
            date_key = dt_myt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        try:
            money = float(row.get("total_money", 0))
        except (ValueError, TypeError):
            money = 0.0

        daily_sales[date_key] += money
        daily_transactions[date_key] += 1

        payment = row.get("payment_type", "").strip()
        if payment:
            payment_totals[payment] += money

if not daily_sales:
    print("❌ No data found in CSV.", file=sys.stderr)
    sys.exit(1)

# Sort by date
sorted_dates = sorted(daily_sales.keys())
sorted_values = [daily_sales[d] for d in sorted_dates]
sorted_txn = [daily_transactions[d] for d in sorted_dates]
parsed_dates = [datetime.strptime(d, "%Y-%m-%d") for d in sorted_dates]

# ── Chart ───────────────────────────────────────────────────────────
fig, (ax1, ax2) = plt.subplots(
    2, 1, figsize=(14, 10), gridspec_kw={"height_ratios": [3, 2]}
)
fig.patch.set_facecolor("#1a1a2e")

# ── Top: Daily Revenue Bar Chart ────────────────────────────────────
ax1.set_facecolor("#16213e")
bars = ax1.bar(
    parsed_dates, sorted_values,
    color="#0f3460", edgecolor="#e94560", linewidth=0.8, width=0.7
)
# Highlight max day
max_idx = sorted_values.index(max(sorted_values))
bars[max_idx].set_color("#e94560")

ax1.set_title(
    "📊 Jualan Harian — 30 Hari (RM)",
    fontsize=16, color="white", pad=15, fontweight="bold"
)
ax1.set_ylabel("Jumlah (RM)", color="white", fontsize=12)
ax1.tick_params(colors="white")
ax1.spines["bottom"].set_color("#333")
ax1.spines["left"].set_color("#333")
ax1.spines["top"].set_visible(False)
ax1.spines["right"].set_visible(False)
ax1.xaxis.set_major_formatter(mdates.DateFormatter("%d\n%b"))
ax1.xaxis.set_major_locator(MaxNLocator(integer=False, nbins=15))
ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"RM{x:,.0f}"))
ax1.grid(axis="y", alpha=0.2, color="white")

# Add value labels on top of bars
for bar, val in zip(bars, sorted_values):
    if val > 0:
        ax1.text(
            bar.get_x() + bar.get_width() / 2, bar.get_height() + 20,
            f"RM{val:,.0f}", ha="center", va="bottom",
            color="white", fontsize=7, rotation=45
        )

# ── Bottom: Transaction Count Line ─────────────────────────────────
ax2.set_facecolor("#16213e")
ax2.plot(
    parsed_dates, sorted_txn,
    color="#e94560", marker="o", markersize=5, linewidth=2
)
ax2.fill_between(parsed_dates, sorted_txn, alpha=0.15, color="#e94560")
ax2.set_title(
    "🧾 Jumlah Transaksi Harian",
    fontsize=14, color="white", pad=10, fontweight="bold"
)
ax2.set_ylabel("Transaksi", color="white", fontsize=12)
ax2.set_xlabel("Tarikh", color="white", fontsize=12)
ax2.tick_params(colors="white")
ax2.spines["bottom"].set_color("#333")
ax2.spines["left"].set_color("#333")
ax2.spines["top"].set_visible(False)
ax2.spines["right"].set_visible(False)
ax2.xaxis.set_major_formatter(mdates.DateFormatter("%d\n%b"))
ax2.xaxis.set_major_locator(MaxNLocator(integer=False, nbins=15))
ax2.grid(axis="y", alpha=0.2, color="white")

plt.tight_layout(pad=3.0)
plt.savefig(CHART_PATH, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
plt.close()

print(f"✅ Chart saved: {CHART_PATH}", file=sys.stderr)
print(CHART_PATH)
