---
name: fb-video-poster
description: Post video ke Facebook Page via Graph API — download dari X/YouTube guna yt-dlp lalu upload.
---

# Facebook Video Poster — HAFJET Hermes

Download video dari mana-mana laman (X, YouTube, TikTok dll.) guna `yt-dlp`, kemudian post ke **Facebook Page** melalui Graph API.

## Prerequisites

| Item | Cara dapat |
|------|-----------|
| `yt-dlp` | `uv tool install yt-dlp` + `export PATH="$HOME/.local/bin:$PATH"` |
| `PAGE_ID` | FB Page → About → scroll bawah → Page ID |
| `PAGE_TOKEN` | FB Developers → Graph API Explorer → Get Token → pilih Page (bukan user) |
| Permissions token | `pages_manage_posts` + `publish_video` (+ `pages_read_engagement` sebagai insurance) |

> ⚠️ **PENTING:** Token mesti dari **PAGE**, bukan user account. User token tak boleh post ke Page.

---

## Workflow

### 1. Semak format video dari X/YouTube

```bash
yt-dlp -F "URL_X_TWITTER" --no-playlist
```

Pilih format terbaik (video + audio berasingan):

```bash
# Format video + audio secara eksplisit
yt-dlp -o "video.mp4" \
  -f "FORMAT_VIDEO+FORMAT_AUDIO" \
  --no-playlist "URL_X_TWITTER"
```

> 💡 **Notes penting:**
> - Kalau nak auto-best: `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"`
> - Kalau nak senang je: `-f "best[ext=mp4]/best"`
> - `--no-playlist` WAJIB — elak yt-dlp ambik playlist sepenuhnya
> - Dari X, format **http-XXXX** (bukan hls-XXXX) biasanya lebih stabil untuk download

### 2. Post ke Facebook Page (curl)

```bash
curl -X POST \
  "https://graph.facebook.com/v21.0/PAGE_ID/videos" \
  -F "source=@video.mp4" \
  -F "description=Caption anda di sini" \
  -F "access_token=PAGE_TOKEN"
```

Atau dengan title:

```bash
curl -X POST \
  "https://graph.facebook.com/v21.0/PAGE_ID/videos" \
  -F "source=@video.mp4" \
  -F "title=Tajuk Video" \
  -F "description=Caption anda di sini" \
  -F "access_token=PAGE_TOKEN"
```

### 3. Verify post

```bash
# Dapatkan video ID dari response, terus buka:
echo "https://www.facebook.com/watch/?v=VIDEO_ID"
```

---

## Troubleshooting

| Masalah | Penyelesaian |
|---------|-------------|
| `(#200) Permissions error` | Token salah (user instead of page) atau takde `pages_manage_posts` |
| `(#100) Invalid parameter` | Format video tak support — convert ke MP4 H.264 + AAC audio |
| yt-dlp ambik semua playlist | Guna `--no-playlist` |
| HLS stream gagal download | Pilih format `http-XXXX` secara manual, avoid `hls-XXXX` |
| Upload perlahan (> 20MB) | Normal — FB guna resumable upload. Tunggu siap. |

---

## Bundled Script

Untuk automation, guna `~/scripts/fb-video-poster.py`:

```bash
# Post video sedia ada
python3 ~/scripts/fb-video-poster.py \
  --file video.mp4 \
  --page-id PAGE_ID \
  --token PAGE_TOKEN

# Download + post dalam satu arahan
python3 ~/scripts/fb-video-poster.py \
  --url "https://x.com/user/status/123" \
  --page-id PAGE_ID \
  --token PAGE_TOKEN \
  --best \
  --title "Tajuk" \
  --desc "Caption"

# Paksa chunked upload untuk video >20MB
python3 ~/scripts/fb-video-poster.py \
  --file video_besar.mp4 \
  --page-id PAGE_ID \
  --token PAGE_TOKEN \
  --chunked
```

Flag:
- `--best` — kualiti video+audio terbaik
- `--chunked` — paksa resumable upload (auto-aktif untuk >20MB)
- `--keep` — jangan delete video lepas post
- Alias ringkas: `alias fbp='python3 ~/scripts/fb-video-poster.py'`

---

## Token Long-Lived

FB token ada expiry. Untuk long-term usage:

1. Buka [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Get Token → pilih Page
3. Extend Token → dapat long-lived token (60 hari)
4. Simpan selamat di password manager / env variable
