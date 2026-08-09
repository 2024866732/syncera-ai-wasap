#!/usr/bin/env python3
"""Extract GitHub Trending repository cards from a downloaded HTML page.

Usage:
  python3 github-trending-parser.py /tmp/github-trending.html
  python3 github-trending-parser.py /tmp/github-trending.html --limit 15

Prints TSV-ish lines:
  repository | description | total_stars | stars_this_period

Notes from live runs (Aug 2026):
  - Prefer period stars ("N stars this week/today") over total — total regex
    often false-matches tiny integers from SVG/aria junk (e.g. bare "3").
  - First href in a card may be "/sponsors/..." — skip sponsors/ and
    extract owner/repo from the Star link text or a non-sponsor href.
  - <article class="Box-row"> may include extra attributes; match flexibly.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

SKIP_PREFIXES = (
    "sponsors/",
    "login",
    "topics/",
    "settings/",
    "orgs/",
    "features/",
    "pricing",
    "about",
    "customer-stories",
)


def clean(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def is_repo_slug(slug: str) -> bool:
    if not slug or slug.count("/") != 1:
        return False
    if any(slug.startswith(p) or slug == p.rstrip("/") for p in SKIP_PREFIXES):
        return False
    owner, name = slug.split("/", 1)
    if not owner or not name:
        return False
    if owner in {"features", "topics", "collections", "marketplace"}:
        return False
    return True


def pick_repo(card: str) -> str | None:
    # 1) Prefer explicit repo links that are not sponsors
    for m in re.finditer(r'href="/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)"', card):
        slug = m.group(1)
        if is_repo_slug(slug):
            return slug

    # 2) Fallback: "Star owner / name" plain text after strip
    text = clean(card)
    m = re.search(
        r"Star\s+([A-Za-z0-9_.-]+)\s*/\s*([A-Za-z0-9_.-]+)",
        text,
    )
    if m:
        slug = f"{m.group(1)}/{m.group(2)}"
        if is_repo_slug(slug):
            return slug
    return None


def pick_period_stars(card: str) -> str:
    m = re.search(
        r"([\d,]+)\s*stars\s*(this\s*week|today|this\s*month)",
        card,
        re.I,
    )
    return m.group(1) if m else ""


def pick_total_stars(card: str, repo: str) -> str:
    """Total stars next to stargazers link for this repo. Avoid bare tiny ints."""
    owner, name = repo.split("/", 1)
    pat = (
        rf'href="/{re.escape(owner)}/{re.escape(name)}/stargazers"'
        rf'[^>]*>.*?([\d,]+(?:\.\d+)?[KkMm]?)'
    )
    m = re.search(pat, card, re.S)
    if m:
        val = m.group(1)
        raw = val.replace(",", "")
        if re.fullmatch(r"\d{1,2}", raw) and int(raw) < 50:
            pass
        else:
            return val

    m = re.search(
        r'href="/[^"]+/stargazers"[^>]*>.*?</svg>\s*([\d,]+(?:\.\d+)?[KkMm]?)\s*<',
        card,
        re.S | re.I,
    )
    if m:
        val = m.group(1)
        digits = val.replace(",", "").rstrip("KkMm")
        try:
            n = float(digits)
            if n >= 50 or val[-1:] in "KkMm":
                return val
        except ValueError:
            return val
    return ""


def pick_description(card: str) -> str:
    m = re.search(
        r'<p[^>]*class="[^"]*color-fg-muted[^"]*"[^>]*>(.*?)</p>',
        card,
        re.S,
    )
    if m:
        return clean(m.group(1))[:200]
    for m in re.finditer(r"<p[^>]*>(.*?)</p>", card, re.S):
        t = clean(m.group(1))
        if len(t) > 20 and not t.lower().startswith("star "):
            return t[:200]
    return ""


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: github-trending-parser.py <downloaded-html> [--limit N]"
        )

    path = Path(sys.argv[1])
    limit = 25
    if "--limit" in sys.argv:
        i = sys.argv.index("--limit")
        if i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    source = path.read_text(encoding="utf-8", errors="ignore")

    cards = re.findall(
        r'<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>(.*?)</article>',
        source,
        re.S,
    )
    if not cards:
        idxs = [m.start() for m in re.finditer(r'class="[^"]*Box-row[^"]*"', source)]
        cards = []
        for i, start in enumerate(idxs):
            end = idxs[i + 1] if i + 1 < len(idxs) else min(start + 4000, len(source))
            cards.append(source[start:end])

    if not cards:
        raise SystemExit("No trending repository cards found.")

    printed = 0
    for card in cards:
        repo = pick_repo(card)
        if not repo:
            continue
        period = pick_period_stars(card)
        total = pick_total_stars(card, repo)
        desc = pick_description(card)
        print(" | ".join((repo, desc, total, period)))
        printed += 1
        if printed >= limit:
            break

    if printed == 0:
        raise SystemExit("Cards found but no repository slugs extracted.")


if __name__ == "__main__":
    main()
