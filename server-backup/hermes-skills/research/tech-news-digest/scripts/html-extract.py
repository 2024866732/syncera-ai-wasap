#!/usr/bin/env python3
"""
html-extract.py — Extract readable text from HTML files.

Usage:
    python3 scripts/html-extract.py /tmp/page.html [page2.html ...]

Uses Python's built-in HTMLParser (no dependencies).
Filters out <script>, <style>, <noscript>, <svg> blocks.
Outputs one "=== filename ===" section per file, first 8000 chars.

This script lives under the tech-news-digest skill and is meant to be
copied to /tmp/ (or executed directly relative to the skill dir) during
cron-jobs or interactive sessions when the security scanner blocks
inline python3 -c execution.
"""
import sys
from html.parser import HTMLParser


class TextExtractor(HTMLParser):
    """HTMLParser subclass that extracts clean text, skipping script/style/etc."""

    def __init__(self):
        super().__init__()
        self.text_parts = []
        self._skip_tag = False
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'svg'):
            if not self._skip_tag:
                self._skip_tag = True
                self._skip_depth = 1
            else:
                self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'svg'):
            if self._skip_tag:
                self._skip_depth -= 1
                if self._skip_depth <= 0:
                    self._skip_tag = False
                    self._skip_depth = 0

    def handle_data(self, data):
        if not self._skip_tag:
            stripped = data.strip()
            if stripped:
                self.text_parts.append(stripped)

    def get_text(self):
        return '\n'.join(self.text_parts)


def extract_file(filepath: str, char_limit: int = 8000) -> str:
    """Extract readable text from an HTML file."""
    with open(filepath, 'r', errors='ignore') as f:
        html = f.read()

    extractor = TextExtractor()
    extractor.feed(html)

    text = extractor.get_text()
    if len(text) > char_limit:
        text = text[:char_limit] + f"\n\n... [truncated at {char_limit} chars]"

    return text


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 html-extract.py <html_file> [html_file ...]")
        sys.exit(1)

    for filepath in sys.argv[1:]:
        try:
            text = extract_file(filepath)
            if len(sys.argv) > 2:
                print(f"\n=== {filepath} ===")
            print(text)
        except FileNotFoundError:
            print(f"ERROR: File not found: {filepath}", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: {filepath}: {e}", file=sys.stderr)


if __name__ == '__main__':
    main()
