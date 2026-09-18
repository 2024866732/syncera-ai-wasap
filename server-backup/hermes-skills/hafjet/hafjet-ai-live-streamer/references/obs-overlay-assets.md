# OBS Overlay + Watermark Assets (HAFJET Aina)

Compliance-friendly overlay assets for the Aina live scene. Never claim a human host on-screen.

## Generated assets (`obs/assets/`)
| File | Size | Use |
|------|------|-----|
| `ai-streamer.png` | 520×96 | small watermark chip "AI Streamer" |
| `aina-hafjet.png` | 520×96 | watermark chip "Aina · HAFJET" |
| `product-banner.png` | 680×210 | static product/price banner (top-left), auto-reads first ACTIVE catalog product |

Regenerate anytime:
```bash
cd ~/projects/hafjet-ai-live-streamer
python3 scripts/gen_obs_overlay_assets.py
```
Script: Pillow only (no GPU/network). Catalog path is `catalog/products.json` relative to repo root — **run from the repo root**, not from `scripts/` (the script resolves `parent.parent` and falls back to a safe "HAFJET · Live Raub" banner when the catalog is unreadable).

## OBS layer order (bottom → top)
1. Background (image/video)
2. Avatar — Window Capture / Browser Source → `http://localhost:8010/index.html` (LiveTalking WebRTC)
3. Watermark chip (`ai-streamer.png` or `aina-hafjet.png`) — bottom-right, small
4. Product banner (`product-banner.png`) — top-left

Keep watermark/banner out of the center of the frame so Aina's face is never covered.

## Compliance wording
- Use "AI Streamer" / "Aina · HAFJET". Do NOT imply a human host (no "live host", "kami", person pronouns for the avatar).
- Product banner prices come from the static catalog only; regenerate the banner whenever `products.json` changes.

## OBS scene collection
- `HAFJET-Aina-Preview` exists on the RTX Windows host; scene **Aina Preview** verified at G2 Task 6.
- Never store stream keys in the repo/Telegram — OBS UI service config only.
