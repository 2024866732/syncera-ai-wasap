---
name: gif-search
description: "Search/download GIFs from Klipy (free) via curl + python3. Replaces deprecated Tenor API."
version: 1.2.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
prerequisites:
  env_vars: [KLIPY_API_KEY]
  commands: [curl, python3]
metadata:
  hermes:
    tags: [GIF, Media, Search, Klipy, API]
---

# GIF Search (Klipy API)

Search and download GIFs via the Klipy API (free, by ex-Tenor team). No extra tools needed.

## When to use

Useful for finding reaction GIFs, creating visual content, and sending GIFs in chat.

## Setup

Set your Klipy API key in your environment (add to `${HERMES_HOME:-~/.hermes}/.env`):

```bash
KLIPY_API_KEY=your_key_here
```

Get a free API key at https://partner.klipy.com/ (lifetime free).

## Prerequisites

- `curl` and `python3` (both standard on macOS/Linux)
- `KLIPY_API_KEY` environment variable

## Search for GIFs

```bash
# Search and get GIF URLs (python3 for JSON parsing)
curl -s "https://api.klipy.com/v2/search?q=thumbs+up&limit=5&key=${KLIPY_API_KEY}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('results', []):
    print(r['url'])
"

# Get title + URL
curl -s "https://api.klipy.com/v2/search?q=nice+work&limit=3&key=${KLIPY_API_KEY}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('results', []):
    print(f\"{r.get('title','untitled')} — {r['url']}\")
"
```

## Download a GIF

```bash
# Search and download the top result
URL=$(curl -s "https://api.klipy.com/v2/search?q=celebration&limit=1&key=${KLIPY_API_KEY}" | python3 -c "import sys,json; print(json.load(sys.stdin)['results'][0]['url'])")
curl -sL "$URL" -o celebration.gif
```

## Get Full Metadata

```bash
curl -s "https://api.klipy.com/v2/search?q=cat&limit=3&key=${KLIPY_API_KEY}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('results', []):
    print(json.dumps({
        'title': r.get('title'),
        'url': r['url'],
        'slug': r.get('slug'),
        'duration': r.get('duration')
    }, indent=2))
"
```

## API Parameters

| Parameter | Description |
|-----------|-------------|
| `q` | Search query (URL-encode spaces as `+`) |
| `limit` | Max results (default 20) |
| `key` | API key (from `$KLIPY_API_KEY` env var) |
| `locale` | Language: `en`, `ms`, etc. |

## Response Structure

Each result has:
- `url` — Direct GIF URL (use in markdown: `![alt](url)`)
- `title` — GIF title/description
- `slug` — URL-friendly ID
- `duration` — Video duration (for clips)
- `created` — Timestamp

## Notes

- Klipy is free forever (lifetime free tier)
- API endpoint: `https://api.klipy.com/v2/search`
- URL-encode the query: spaces as `+`, special chars as `%XX`
- For sending in chat, use the direct `url` field
