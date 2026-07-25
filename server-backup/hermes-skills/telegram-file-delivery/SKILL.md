---
name: telegram-file-delivery
description: Deliver non-media files (.js, .py, .sh, .txt) to Telegram as document attachments via MEDIA directive.
category: devops
---

# Telegram File Delivery

When the user asks to send a file to Telegram that is NOT an image/audio/video, use this workflow.

## Steps

1. Copy the file to the documents cache directory as `.txt`:

```bash
cp /path/to/source/file.ext ~/.hermes/cache/documents/filename.txt
```

2. Deliver via MEDIA directive:

```
MEDIA:/home/hafizi145/.hermes/cache/documents/filename.txt
```

3. The file arrives as a Telegram document attachment — user downloads and renames back to original extension.

## Chat Brevity Rule (CRITICAL)

When delivering a file, the accompanying Telegram chat message must be **≤3 lines** in `STEP / ACTION / RESULT` format. Never paste code blocks, diffs, or explanations in chat alongside a `MEDIA:` directive.

The user has stated:
- "Saya tak mahu jawapan panjang berjela dalam chat Telegram."
- "Setiap mesej mesti ≤ 3 baris."
- "Jika lebih, saya akan abaikan."

**Correct:** "Siap, fail dilampirkan." + MEDIA: line
**Wrong:** 10-line explanation + code block + MEDIA: line

The file itself carries all detail — the chat message is only a short signal that the file is ready.

## Why `.txt`

Telegram gateway delivers `.txt` as document attachments. Other extensions (`.user.js`, `.py`) may not deliver. The `.txt` extension guarantees delivery.

## Pitfalls

- `MEDIA:` only works for files at absolute paths
- The cache directory `~/.hermes/cache/documents/` is on the same filesystem as the session working directory — no cross-filesystem issues
- User renames `.txt` → original extension after download
- Tampermonkey scripts: user saves as `.user.js`, then drags into Tampermonkey dashboard
- `.user.js` and other non-media extensions are NOT delivered via `MEDIA:` — only `.txt` works reliably. Always copy to `.txt` first.
- Code blocks in Telegram are corrupted by auto-formatting (URLs become Markdown links, smart quotes). File delivery bypasses this entirely.
- If the user asks to send a file "like last time" and they attached a `.txt` document: they mean use this MEDIA + .txt pattern, not a code block.
