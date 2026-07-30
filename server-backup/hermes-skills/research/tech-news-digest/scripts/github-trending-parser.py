#!/usr/bin/env python3
"""Extract GitHub Trending repository cards from a downloaded HTML page.

Usage:
  python3 github-trending-parser.py /tmp/github-trending.html

Prints: repository | description | total_stars | stars_period
Designed for GitHub's server-rendered Trending page, whose cards occur far
below the navigation/language selector and are therefore often missed by
head-only generic HTML extraction.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path


def clean(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: github-trending-parser.py <downloaded-html>")

    source = Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
    cards = re.findall(r'<article class="Box-row">(.*?)(?=</article>)', source, re.S)
    if not cards:
        raise SystemExit("No trending repository cards found.")

    for card in cards:
        repo = re.search(r'href="/([^"?#]+/[^"?#]+)"[^>]*class="Link"', card)
        description = re.search(r'<p class="col-9 color-fg-muted my-1 tmp-pr-4">(.*?)</p>', card, re.S)
        total = re.search(r'href="/[^/]+/[^/]+/stargazers"[^>]*>.*?</svg>\s*([\d,]+)</a>', card, re.S)
        period = re.search(r'([\d,]+) stars (?:this|today)', card)
        if repo and period:
            print(" | ".join((
                repo.group(1),
                clean(description.group(1)) if description else "",
                total.group(1) if total else "",
                period.group(1),
            )))


if __name__ == "__main__":
    main()
