#!/usr/bin/env python3
"""Fetch Shopify product .js price/stock for MY reseller compare.

Usage:
  python3 shopify_product_price.py https://www.machines.com.my/products/HANDLE
  python3 shopify_product_price.py https://shop.switch.com.my/products/HANDLE.js
"""
from __future__ import annotations

import json
import sys
import urllib.request

UA = "Mozilla/5.0 (compatible; HermesPriceCompare/1.0)"


def normalize(url: str) -> str:
    url = url.strip()
    if not url.endswith(".js"):
        url = url.rstrip("/") + ".js"
    return url


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    url = normalize(argv[1])
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    price = (data.get("price") or 0) / 100
    compare = data.get("compare_at_price")
    compare_v = (compare / 100) if compare else None
    variants = data.get("variants") or []
    sku = variants[0].get("sku") if variants else None
    out = {
        "url": url,
        "title": data.get("title"),
        "vendor": data.get("vendor"),
        "price_myr": price,
        "compare_at_myr": compare_v,
        "discount_myr": round(compare_v - price, 2) if compare_v and compare_v > price else 0,
        "available": data.get("available"),
        "sku": sku,
        "variant_count": len(variants),
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
