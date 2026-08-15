# MY Apple price sources (anchors)

Not a live price sheet — re-fetch every session. Use with `my-electronics-price-compare`.

## Official
- Consumer store: https://www.apple.com/my/shop/buy-mac/macbook-air
- Education store: https://www.apple.com/my-edu/shop/buy-mac/macbook-air
- Mac family hub: https://www.apple.com/my/macbook-air/
- Specs: https://www.apple.com/my/macbook-air/specs/

### Parse tips
- JSON-LD `AggregateOffer.lowPrice` / `highPrice` (MYR)
- Config path segments encode size, chip, GPU, colour, memory, storage
- Gift-card promos appear in buy-flow HTML (“limited time”, “Apple Store Gift Card”)

## Apple Premium / Authorized (Shopify JSON)
Product JSON: `https://<host>/products/<handle>.js`  
Fields: `price` (sen), `compare_at_price` (sen), `available`, `variants[].sku`, `title`

| Seller | Host | Notes |
|---|---|---|
| Machines | www.machines.com.my | Often RM50–150 under RRP; check colour stock |
| Switch | shop.switch.com.my | Often = RRP; multi-colour stock stronger |

### MacBook Air M5 13" base handles (example pattern)
Base = M5 10CPU/8GPU, 16GB, 512GB — SKU pattern `MDH*4ZP/A`:
- Starlight: `13-inch-macbook-air-mdha4zp-a` (MDHA4ZP/A)
- Sky Blue: `13-inch-macbook-air-mdhh4zp-a` (MDHH4ZP/A)
- Silver: `13-inch-macbook-air-mdh74zp-a` (MDH74ZP/A)
- Midnight: `13-inch-macbook-air-mdhe4zp-a` (MDHE4ZP/A)

15" base examples appear as `15-inch-macbook-air-mdvd4zp-a` etc. — always confirm title string.

## Other AAR / retail
- senQ: https://www.senq.com.my — ETA banners, extra-warranty promos
- Thunder Match / tmt.my — authorized listings
- Local tech press for launch RRP only (SoyaCincau, Lowyat, TechNave) — **re-verify on Apple** after price changes

## Marketplace official shops
- Shopee Machines: https://shopee.com.my/machines_os
- Lazada: search LazMall + authorized reseller / brand flagship; verify APP status in chat
- Expect anti-bot blocks from headless curl; don’t invent prices

## Trust red flags (high-ticket Apple)
- Sealed “new” M-series Air far below current RRP without APP clearance label
- International warranty only / no MY invoice
- Pre-order from unknown shop with long ship window and no authorized badge
- Bait listings (wrong category photos, power-bank scam reports, etc.)
