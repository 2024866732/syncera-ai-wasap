#!/usr/bin/env python3
"""Extract GitHub Trending cards from a saved trending HTML page.
Usage: python3 github-trending-html-parser.py /tmp/github-trending.html

Outputs: repository | description | stars_this_week
"""
import html
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 github-trending-html-parser.py <trending.html>")

with open(sys.argv[1], encoding="utf-8", errors="ignore") as f:
    source = f.read()


def clean(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return re.sub(r"\s+", " ", value).strip()

for card in re.findall(r'<article class="Box-row">(.*?)</article>', source, re.S):
    # GitHub adds SVG and data attributes inside the heading link; do not assume href
    # immediately follows <a> or that the label is plain text.
    repo = re.search(r'<h2[^>]*>.*?href="/([^"?#]+)".*?</h2>', card, re.S)
    description = re.search(r'<p[^>]*>(.*?)</p>', card, re.S)
    weekly_stars = re.search(r'([0-9][0-9,]*)\s+stars\s+this\s+week', clean(card), re.I)
    if repo:
        print(" | ".join((
            repo.group(1),
            clean(description.group(1)) if description else "",
            weekly_stars.group(1) if weekly_stars else "n/a",
        )))
