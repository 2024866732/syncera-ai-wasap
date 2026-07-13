# Status Mapping

## Tujuan
Tukar status backend/teknikal kepada bahasa customer-facing dan owner-facing.

## Pemetaan Status

| Backend Status | Label Customer | Nota Internal |
|----------------|----------------|---------------|
| `received` | Peranti telah diterima | Menunggu giliran diagnos |
| `diagnosing` | Peranti sedang diperiksa | Technician sedang kenal pasti masalah |
| `waiting-part` | Menunggu spare part | Follow-up pembekal / ETA |
| `in-progress` | Pembaikan sedang dijalankan | Kerja pembaikan aktif |
| `ready-pickup` | Sudah siap untuk diambil | Trigger pickup reminder jika >3 hari |
| `completed` | Kes selesai | Ticket boleh diarkib |
| `cancelled` | Tempahan dibatalkan | Jangan hantar reminder |

## Rules
- Jika status tidak dikenali, jangan hantar ke customer.
- Masukkan event ke exception report untuk semakan manual.
- Jika status berubah ke `ready-pickup`, jadualkan semakan pickup harian.

## Status Flow
```
received → diagnosing → waiting-part → in-progress → ready-pickup → completed
    ↓           ↓            ↓              ↓              ↓
cancelled   cancelled    cancelled      cancelled      cancelled
```

## Customer Message Rules
| Status | Hantar Mesej? | Tindakan |
|--------|---------------|----------|
| received | ✅ Ya | Confirm receipt |
| diagnosing | ❌ Tidak | Internal only |
| waiting-part | ⚠️ Optional | Inform delay |
| in-progress | ✅ Ya | Update progress |
| ready-pickup | ✅ Ya | Arrange pickup |
| completed | ✅ Ya | Thank you |
| cancelled | ⚠️ Optional | Confirm cancellation |
