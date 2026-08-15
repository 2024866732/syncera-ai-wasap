---
name: my-electronics-price-compare
description: Use when comparing MY gadget prices and seller trust.
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
3. **Authorized resellers (high trust)** — hit Shopify product JSON (not full HTML soup):
   - `https://www.machines.com.my/products/<handle>.js`
   - `https://shop.switch.com.my/products/<handle>.js`
   - Parse: `title`, `price/100`, `compare_at_price/100`, `available`, `variants[].sku`
   - Check **each colour/SKU** — sale price may match but stock differs per colour.
4. **Other APP/AAR sites** — senQ, Thunder Match, etc. Note ETA, extra warranty, instalment hooks.
5. **Marketplace (Shopee/Lazada)** — search for Mall/Official listings. If HTML/API blocked, **say so** and give:
   - Trusted store handles to open manually (e.g. Shopee `machines_os`)
   - Trust checklist (below)
   - Any weak public snippets labelled as unverified
6. **Trust filter before recommending** — drop sellers that fail the checklist.
7. **Deliver** — fixed output shape (below). Always stamp research date.

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
1. **Recommended model** — chip, RAM, storage, size, colours
2. **Price table by source** — price, seller, rating/reviews if any, link, stock/ETA, warranty/promo
3. **Short comparison** — price + trust + warranty
4. **Final picks** — (a) cheapest trusted (b) best value (edu/gift-card/extra warranty may beat raw sticker)
5. **Avoid list** — grey / too-cheap / blocked-verification cases

Tone for Tuan Hafizi: practical BM, scannable bullets/tables, no wall of text. Label promo (gift card, education, flash sale) separately from cash price.

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
- **web_extract may be unavailable** — fall back to curl + targeted parse; don’t loop failed extract
- **Lazada/Shopee anti-bot** — empty HTML/login walls are normal; switch strategy, don’t fabricate
- **Flagship-looking marketplace shops** can still bait-and-switch — require authorized proof + chat SKU confirm for high-ticket
- **Gift card / trade-in / education** change effective value — report cash price and effective value separately
- Command safety: prefer `/tmp` script then execute over `curl | python3` if environment policy blocks pipes

## Quick MY Apple reseller anchors
- Machines (APP): https://www.machines.com.my — often slight discount vs RRP
- Switch (Premium Partner): https://shop.switch.com.my — often = RRP, good multi-colour stock
- senQ: https://www.senq.com.my — watch ETA + extra warranty promos
- Shopee Machines: https://shopee.com.my/machines_os
- See also: `references/my-apple-price-sources.md`

## Verification before final answer
- [ ] Newest generation confirmed with date-stamped source
- [ ] At least one official RRP number from brand site
- [ ] At least one authorized reseller live price **or** explicit gap note
- [ ] Marketplace numbers either verified or marked unverified/blocked
- [ ] Recommendation passes trust checklist
- [ ] Cheapest-trusted and best-value both stated
