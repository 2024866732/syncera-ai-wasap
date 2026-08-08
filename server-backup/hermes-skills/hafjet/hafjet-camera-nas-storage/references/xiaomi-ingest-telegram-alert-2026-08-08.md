# Xiaomi Ingest — Telegram Alert (2026-08-08)

## Apa yang dibina
Alert Telegram untuk setiap recording Xiaomi baru yang berjaya di-ingest (≥10 saat),
cooldown 5 minit, dengan thumbnail. Keputusan Tuan: alert CCTV → Telegram group
**`-5330700835`** ("CCTV ALERT"); WhatsApp kekal untuk customer service sahaja.

## Komponen

### 1. `app/telegram_alert.py` (baru)
- `send_recording_alert(thumb_path: Path, original_name: str, recorded_at: str, duration_s: float|None) -> bool`
- Stdlib sahaja: `urllib.request` + manual `multipart/form-data` boundary (TIADA `requests` dep —
  service venv mungkin tidak ada requests).
- Filter: `duration_s < XIAOMI_ALERT_MIN_DURATION` (default 10) → skip dengan log;
  cooldown dalam-process (`_last_alert_ts` global, `XIAOMI_ALERT_COOLDOWN_SECONDS` default 300);
  thumb tak wujud → skip.
- Caption:
  ```
  📁 Xiaomi Recording Baru
  Kamera: {device_id}      # dari nama fail {device_id}_{YYYYMMDD}_{HHMMSS}.mp4
  Masa: {dd/mm HH:MM MYT}
  Tempoh: {int} saat
  ```
- Camera name diekstrak dari bahagian pertama nama fail Xiaomi (`_` separator) — guna
  `config.CAMERA_DEFAULT_NAME` jika format tak dikenali.

### 2. `app/watcher.py` (patch)
- Import `from app.telegram_alert import send_recording_alert`.
- Dalam `process_file()`, SELEPAS `store.insert_video(...)` + `self.processed_ok += 1`:
  ```python
  try:
      send_recording_alert(thumb_path, original_name, recorded_at, meta.get("duration_s"))
  except Exception as exc:
      logger.warning("telegram alert error: %s", exc)   # alert gagal TIDAK jejas ingest
  ```

### 3. `.env` (tambah, tanpa buang vars lain)
```
TELEGRAM_BOT_TOKEN=<dari ~/.hermes/.env>
TELEGRAM_CCTV_CHAT_ID=-5330700835
XIAOMI_ALERT_MIN_DURATION=10
XIAOMI_ALERT_COOLDOWN_SECONDS=300
```
Update pattern: baca existing .env → dict → setdefault/add → tulis semula (jangan overwrite).

## End-to-end test (dilakukan 2026-08-08)
1. `cp` sample mp4 ke `/mnt/cctv/xiaomi-nas/recordings/xiaomi_alert_test_<ts>.mp4`
2. Tunggu `STABLE_SECONDS=45` (stability gate) + poll 5s.
3. Jangkaan dalam `/mnt/cctv/logs/xiaomi-ingest.log`:
   ```
   ingested xiaomi_alert_test_<ts>.mp4 -> <video_id>
   telegram alert sent ok=True (xiaomi_alert_test_<ts>.mp4)
   ```
4. Verify artefact: `archive/YYYY/MM/DD/<video_id>_*.mp4`, `thumbs/.../<video_id>.jpg`, `json/.../<video_id>.json`.
5. `ok=True` dari sendPhoto = Telegram API terima; group message boleh disahkan secara visual oleh
   Tuan (getUpdates tak berguna bila bot guna long-polling untuk Hermes — update offset sudah advance).

## ⚠️ Pitfall Telegram parse_mode (kritikal, ditemui 2026-08-08)
- `parse_mode=Markdown` **HTTP 400** bila teks ada underscore tak berpasangan — nama kamera
  `outdoor_shop` (Tapo/Frigate) atau device_id Xiaomi boleh mengandungi `_` → Telegram anggap
  sebagai italic delimiter. **WAJIB `parse_mode=HTML`** (escape `& < >` sahaja; `_` selamat dalam HTML).
- Simptom log: `send_telegram FAIL: HTTP Error 400: Bad Request` walaupun token/chat_id betul.
- Test pertama berjaya (`ok=True`) kerana guna text ringkas tanpa underscore; gagal bila event
  sebenar bawa nama kamera `outdoor_shop`. Lesson: guna HTML parse_mode untuk SEMUA alert yang
  mengandungi nama kamera/device_id.

## ⚠️ Pitfall restart (kritikal)
- `cctv-worker` JUGA `python -m app.main` → **jangan `pkill -f "python -m app.main"`** (bunuh dua-dua).
- Listener: `ss -tlnp | grep 8092` → `kill <PID>` spesifik.
- Process exe `readlink -f /proc/PID/exe` mungkin `/usr/bin/python3.14` tetapi sebenarnya berjalan
  dalam venv (lihat `tr '\0' '\n' < /proc/PID/environ | grep VIRTUAL_ENV`). Shell biasa `python3`
  TIDAK ada dotenv/uvicorn — mesti restart dengan venv:
  ```bash
  cd ~/projects/hafjet-xiaomi-ingest
  VIRTUAL_ENV=$PWD/.venv PATH=$PWD/.venv/bin:$PATH nohup .venv/bin/python -m app.main > /mnt/cctv/logs/xiaomi-ingest.log 2>&1 &
  ```
- Selepas restart: `:8092/health` watcher_alive=true DAN `systemctl is-active cctv-worker` = active
  dengan MainPID TIDAK berubah.

## Status selepas deploy (2026-08-08)
- xiaomi-ingest PID 2604975 → 649490 (restart OK), cctv-worker MainPID 520038 **unchanged**.
- `processed_ok=1`, `processed_fail=0` selepas test drop.
- Artefact test: `ec70a59dc96d4d1aa5fc1389ef4cd2b0_*.mp4` (+ thumb + json) di bawah `/mnt/cctv/xiaomi/`.

## Pilihan A — recursive scan `xiaomi_camera_videos` (diluluskan & deploy 2026-08-08)

### Patch `app/watcher.py`
```python
def _iter_files(root: Path):
    """Recursive walk — yield video candidates dalam BACKFILL window sahaja.
    Fail lebih lama daripada BACKFILL_HOURS di-skip (elak banjir 5K fail lama)."""
    cutoff = time.time() - config.BACKFILL_HOURS * 3600
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]  # skip hidden dirs
        for name in filenames:
            p = Path(dirpath) / name
            if not _is_candidate(p):
                continue
            try:
                if p.stat().st_mtime < cutoff:
                    continue
            except OSError:
                continue
            yield p
```
- `scan_once()` loop: `for path in _iter_files(root):` (replace `root.iterdir()`).
- Tambah `import os` di atas.

### Patch `app/config.py`
```python
BACKFILL_HOURS = _int("XIAOMI_BACKFILL_HOURS", 24)          # skip fail lebih lama
ALERT_NEW_MINUTES = _int("XIAOMI_ALERT_NEW_MINUTES", 30)    # alert hanya fail baru ≤30 min
```

### Patch alert guard dalam `process_file()`
```python
is_new = (time.time() - src.stat().st_mtime) < config.ALERT_NEW_MINUTES * 60
# ... selepas ingest OK:
if is_new:
    try:
        send_recording_alert(thumb_path, original_name, recorded_at, meta.get("duration_s"))
    except Exception as exc:
        logger.warning("telegram alert error: %s", exc)
```
**Kenapa:** tanpa `ALERT_NEW_MINUTES`, backfill 5K fail lama akan spam Telegram walaupun cooldown
5 min — alert hanya untuk fail yang benar-benar baru, backfill di-ingest senyap.

### `.env` (Pilihan A)
```
XIAOMI_RECORDINGS_DIR=/mnt/cctv/xiaomi-nas/xiaomi_camera_videos
XIAOMI_BACKFILL_HOURS=2        # HAFJET pilih 2 jam — elak beban CPU i3-2100 (Frigate + worker dah ~full)
XIAOMI_ALERT_NEW_MINUTES=30
```

### ✅ ACL RESOLVED (2026-08-08, Tuan ran script interactively)
Tuan jalankan `~/fix_acl_xiaomi_camera_videos.sh` di terminal Office PC → output `WRITE OK`.
Selepas ACL:
- Restart xiaomi-ingest (venv pattern di atas) — cctv-worker MainPID 520038 kekal unchanged.
- First scan mula ingest fail sebenar (`08M38S_...mp4` etc.) — health naik ke `processed_ok=24+`.
- Test alert dengan "fail baru": copy fail valid ke `xiaomi_camera_videos/{id}/{YYYYMMDDHH}/test_new_<ts>.mp4`,
  tunggu 45s → log `telegram alert sent ok=True` + thumb di `thumbs/.../<video_id>.jpg`.
  (Fail sebenar lama TIDAK akan alert — `ALERT_NEW_MINUTES=30`; guna copy-mtime-baru untuk test.)

### ⚠️ Partial-file pitfall — `moov atom not found`
Kamera Xiaomi tulis MP4 secara streaming; watcher claim selepas `STABLE_SECONDS=45` tapi fail besar
(rolling 30s–2min) masih ditulis → ffprobe gagal `moov atom not found` (rc=1) → clip masuk
`failed/{y}/{m}/{d}/`, `processed_fail` naik. Tidak jejas ingest lain, tiada alert spam, tetapi clip
itu hilang. Jika kerap: naikkan `STABLE_SECONDS` atau tambah retry re-probe sekali selepas beberapa
minit sebelum final fail. Diagnose: `ffprobe -v error -show_format <file>` → `moov atom not found`.

### Pengajaran operasi
- Sebelum deploy watcher baru, selalu `ls -ltR` folder sumber untuk SAHKAN di mana kamera
  sebenarnya menulis — dokumentasi lama (`recordings/`) tidak menggambarkan kelakuan sebenar.
- Watcher yang scan folder beribu fail MESTI ada backfill cutoff + new-only alert guard.
- `processed_fail` naik + PermissionError = ACL/owner, bukan bug kod.
