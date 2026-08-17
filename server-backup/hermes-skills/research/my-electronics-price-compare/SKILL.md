---
name: my-electronics-price-compare
description: Use when comparing MY gadget prices/seller trust, Apple Edu vs Mall, SPayLater/BNPL vs Apple 0%, or AppleCare+ cost.
---

# Malaysia Electronics Price + Trust Compare

## Overview
Live price research for MY buyers. Anchor on **official RRP + authorized sellers first**, then marketplace only if Mall/Official + warranty clear. Output must be scannable tables, dated, and honest about scrape gaps.

## When to Use
- User asks harga / banding / mana termurah / trusted seller for gadgets in Malaysia
- Platforms named: Shopee MY, Lazada MY, apple.com/my, Machines, Switch, senQ, etc.
- Need newest model vs clearance previous-gen trade-off

## Workflow
1. **Identify newest SKU family** — web_search model year + chip (e.g. MacBook Air M5 2026). Confirm base config (RAM/storage/display). Note if base storage changed vs prior gen.
2. **Lock official RRP** — fetch Apple MY buy page. Prefer JSON-LD `AggregateOffer.lowPrice` / product config URLs under `apple.com/my/shop/...`. Also check Education store if relevant: `apple.com/my-edu/shop/...`.
3. **If user is student / teacher** — always quote **Education cash price + active Edu promo** (e.g. limited-time Apple Store Gift Card) as a separate column from consumer RRP. Effective value = sticker − gift-card face value **only if** GC is usable for something they would buy (Care/accessories).
4. **Authorized resellers (high trust)** — hit Shopify product JSON (not full HTML soup):
   - Prefer: `python3 ~/.hermes/skills/research/my-electronics-price-compare/scripts/shopify_product_price.py <product-url>`
   - Hosts: Machines, Switch (see references)
   - Parse: `title`, `price/100`, `compare_at_price/100`, `available`, `variants[].sku`
   - Check **each colour/SKU** — sale price may match but stock differs per colour.
   - AppleCare+ add-on often linked on PDP as separate Shopify product (title contains `AppleCare+`); quote one-time MYR + accidental excess fees from Apple footnotes.
5. **Other APP/AAR sites** — senQ, Thunder Match, etc. Note ETA, extra warranty (senQ “+1 year” ≠ AppleCare+), instalment hooks.
6. **Marketplace (Shopee/Lazada)** — search for Mall/Official listings. If HTML/API blocked, **say so** and give:
   - Trusted store handles to open manually (e.g. Shopee `machines_os`, Apple Flagship + Fulfilled by Shopee)
   - Trust checklist (below)
   - Any weak public snippets labelled as unverified
7. **User-supplied checkout screenshots** — treat as primary live data: extract SKU/config, seller, vouchers, **total payable**, SPayLater tenure/%, EPS/protection add-ons. Recalculate total interest before endorsing.
8. **Financing reality check** — before recommending “buy at Apple Store with instalment”, run the rules in `references/my-apple-financing-and-care.md` (Education ≠ Apple 0% IPP; no SPayLater at Apple; BNPL %/month total cost).
9. **Trust filter before recommending** — drop sellers that fail the checklist.
10. **Deliver** — fixed output shape (below). Always stamp research date.

## Trust hierarchy (Apple-class; adapt for other brands)
1. Brand official store (apple.com/my)
2. Apple Premium Partner / Authorized Reseller (Machines, Switch, listed AAR)
3. Shopee Mall / LazMall **official brand or authorized shop** with explicit local warranty
4. High-rating marketplace only if warranty + invoice verifiable
5. Reject: grey import, “international warranty only”, price far below RRP, new seller, no serial/invoice path

## Trust checklist (must pass for “trusted”)
- Rating ≥ 4.8 when marketplace reviews exist
- Reviews ≥ 50 when possible (new official shops: use APP status instead)
- Official Store / Mall / Authorized Reseller badge
- Local brand warranty ≥ 1 year (Apple MY 1-year limited)
- Price not absurdly below RRP (rule of thumb: treat **>10–15% under sealed new RRP** as red flag unless APP clearance of prior gen)
- SKU/model string matches (e.g. Apple `MDxx4ZP/A` regional codes)

## Output shape (required)
1. **Recommended model** — chip, RAM, storage, size, colours (+ why not upsell size/RAM if user already has monitors/iPad)
2. **Price table by source** — cash sticker, seller, rating/reviews if any, link, stock/ETA, warranty/promo
3. **Effective value row** — Education ± gift card ± forced BNPL interest vs Mall voucher cash
4. **Financing path** — only plans user can actually use (CC / SPayLater tenure / full debit); never imply Apple 0% without CC
5. **Short comparison** — price + trust + warranty + bunga
6. **Final picks** — (a) cheapest trusted **cash** (b) best value including edu/GC (c) “need now + max monthly” compromise if any
7. **Avoid list** — grey / too-cheap / long BNPL / wrong config upsell

Tone for Tuan Hafizi: practical BM (+ Kelantan OK casual), scannable bullets/tables, no wall of text. Label promo (gift card, education, flash sale) and **interest** separately from cash price.

## Reliable fetch patterns
### Apple MY
- Family: `https://www.apple.com/my/shop/buy-mac/macbook-air` (or product family path)
- Config URL pattern includes size, chip, GPU cores, colour, memory, storage
- JSON-LD often has `lowPrice` / `highPrice` MYR
- Watch limited-time **Apple Store Gift Card** promos on buy flow
- Education RRP is lower when eligible — quote separately, don’t mix with consumer RRP

### Shopify APP product JSON
Prefer skill script (no curl|python pipe):
```bash
python3 ~/.hermes/skills/research/my-electronics-price-compare/scripts/shopify_product_price.py \
  "https://www.machines.com.my/products/<handle>"
```
Manual fallback: save `.js` to `/tmp/p.json` then parse with python3 file open (not stdin pipe).
- `compare_at_price` > `price` ⇒ active discount vs RRP
- `available: false` ⇒ don’t recommend that colour as buy-now without saying OOS
- Handles/SKU map: `references/my-apple-price-sources.md`

### Marketplace when blocked
- Do **not** invent listing prices
- Give search queries + official shop URLs
- Use web_search snippets only as **leads**, not verified quotes
- Prefer user open app for voucher/coin final price

## Pitfalls
- **Prior-gen clearance ≠ newest** — always separate “newest model” vs “best value older gen” (e.g. M4 clearance vs M5 current)
- **One colour OOS ≠ whole model OOS** — poll sibling handles/SKUs
- **RRP hikes after launch** — don’t trust launch-day articles alone; re-fetch Apple MY
- **web_extract may be unavailable** — fall back to reseller `.js` script / curl to file; don’t loop failed extract 3×
- **Lazada/Shopee anti-bot** — empty HTML/login walls are normal; switch strategy, don’t fabricate
- **Flagship-looking marketplace shops** can still bait-and-switch — require authorized proof + chat SKU confirm for high-ticket
- **Gift card / trade-in / education** change effective value — report cash price and effective value separately
- **Education Store orders are NOT eligible for Apple’s official 0% credit-card instalment** (same exclusion as EPP/business). Do not tell students “pay Edu at TRX with Apple 0% 12/24m” without flagging this.
- **SPayLater ≠ Apple Store** — BNPL only on Shopee/Lazada checkout; Apple TRX needs debit/FPX/CC.
- **BNPL “affordable monthly” can erase Edu/voucher wins** — always show `principal × monthly% × months` (flat) estimate and prefer 0% 1–3m if offered.
- **Screenshot total may be balance-only** after partial wallet/cash — don’t treat SPayLater line as full laptop price.
- **Uncheck marketplace EPS** unless user wants it; it is not AppleCare+.
- **Dual external displays on MacBook Air** — Air has MagSafe + 2× TB; HDMI+DP monitors need USB-C→HDMI and USB-C→DP (or one dock). Don’t push 15" when user already has large monitors/iPad Sidecar.
- **AppleCare+ ≠ shop “extra 1-year warranty”** — quote AC+ one-time + excess fees; optional after device if still inside Apple’s add-on window.
- Command safety: prefer skill script or `/tmp` file then python — avoid `curl | python3` when policy blocks pipes.

## Quick MY Apple reseller anchors
- Machines (APP): https://www.machines.com.my — often slight discount vs RRP
- Switch (Premium Partner): https://shop.switch.com.my — often = RRP, good multi-colour stock
- senQ: https://www.senq.com.my — watch ETA + extra warranty promos
- Shopee Machines: https://shopee.com.my/machines_os
- See also: `references/my-apple-price-sources.md`, `references/my-apple-financing-and-care.md`

## Verification before final answer
- [ ] Newest generation confirmed with date-stamped source
- [ ] At least one official RRP number from brand site
- [ ] At least one authorized reseller live price **or** explicit gap note
- [ ] Marketplace numbers either verified or marked unverified/blocked
- [ ] Recommendation passes trust checklist
- [ ] Cheapest-trusted and best-value both stated
