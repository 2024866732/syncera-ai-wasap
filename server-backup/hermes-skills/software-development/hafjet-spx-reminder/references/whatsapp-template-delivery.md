# WhatsApp Template Delivery — Production-Confirmed (2026-08-08)

## Status: Template sudah ACTIVE dan di-test di production

Template yang didaftar di Meta Business Manager:
- `spx_ready_pickup` ✅ — Active, tested successfully
- `spx_ready_collection3` ✅ — Active, fallback for final reminder

---

## Error 131047 — Root Cause Diagnosis (Confirmed)

### Gejala
- Outbound count: 29,112 (tinggi — dashboard menunjukkan message "sent")
- Delivery status table: 34,850 failed, 0 delivered
- Semua failed dengan error code `131047` — "Re-engagement message"

### Punca
Session message (`type: "text"`) ke customer **di luar 24h window** (last inbound > 24 jam):
- Meta **accept** request (HTTP 200) → outbound count naik
- Meta **reject delivery** (callback: `status: failed, code: 131047`) → customer tak terima

### Evidence dari Production DB (2026-08-08)
```
sqlite3> SELECT status, COUNT(*) FROM message_delivery_status GROUP BY status;
failed|34850          ← 99.99% sebelum template fix
delivered|1          ← test template (2026-08-08)
sent|1               ← test template (2026-08-08)
```

---

## Solution: Template Messages

### Perbandingan

| Type | Syarat | Error jika langgar |
|---|---|---|
| `type: "text"` (session) | Customer inbound < 24 jam | 131047 (Re-engagement) |
| `type: "template"` | Template Meta-approved | Tiada — sent anytime |

### Template Registration
1. Meta Business Manager → WhatsApp → Message Templates → Create
2. Category: `Utility`
3. Language: `ms` (Bahasa Melayu)
4. Template name: `spx_ready_pickup` (or custom name)
5. Body with `{{1}}`, `{{2}}` parameters
6. Submit for approval (~5 min - 24 jam)

---

## Smart Send Implementation

### Functions Added to `webhook_listener.py`

```python
# Template send
await send_whatsapp_template(phone, "spx_ready_pickup", ["Tuan Hafizi", "SPX-TEST-001"])

# 24h window check
within = await _check_24h_window(phone)  # True jika last_contact < 24 jam

# Smart send — auto-select session vs template
await send_whatsapp_smart(
    phone,
    session_text="Parcel anda sudah sampai...",  # untuk dalam 24h window
    template_name="spx_ready_pickup",             # untuk luar 24h window
    template_params=["Tuan Hafizi", "SPX-TEST-001"]
)
```

### Logic
```
_check_24h_window(phone)
  └─ within 24h → session message (type: text)
  └─ outside 24h → template message (type: template)
  └─ no template → skip (return False)
```

---

## SPX Reminders Toggle

### Pattern
```python
# In _check_spx_reminders():
if not get_runtime_bool("spx_reminders_enabled", False):
    return  # paused

# In VALID_SETTINGS for dashboard:
"spx_reminders_enabled": {"type": "bool", "default": "false"},
```

### Control via Dashboard Settings API
```
PUT /api/settings  {"spx_reminders_enabled": "true"}   → enable
PUT /api/settings  {"spx_reminders_enabled": "false"}  → disable
```

### ⚠️ Bug: `get_runtime_bool()` ignores "false"
`get_runtime_bool(key, default)` returns `default` untuk SEMUA nilai DB kecuali `"true"/"1"/"yes"`. 
Jadi jika DB setting "false", fungsi tetap return `default`.

**Fix:** Pastikan parameter `default=False`:
```python
# ❌ BROKEN — "false" in DB still returns True
get_runtime_bool("spx_reminders_enabled", True)

# ✅ CORRECT — "false" in DB returns False
get_runtime_bool("spx_reminders_enabled", False)
```

---

## Delivery Status Tracking

### Table: `message_delivery_status`
```sql
CREATE TABLE message_delivery_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wamid VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20),
    status VARCHAR(20) NOT NULL,  -- sent, delivered, read, failed
    error_code VARCHAR(50),
    error_title TEXT,
    error_message TEXT,
    timestamp TIMESTAMP DEFAULT (datetime('now')),
    meta_timestamp BIGINT
);
```

### Webhook Callback Handling
```python
# In webhook handler:
for status in value.get("statuses", []):
    await _process_status_callback(status)
```

### Status Progression
```
HTTP 200 (accepted)
  → callback: sent
    → callback: delivered
      → callback: read (customer buka chat)
    
  → callback: failed (131047 = Re-engagement, etc.)
```

### API Endpoints
| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/delivery/status?limit=50` | JWT Bearer | Recent delivery status records |
| `GET /api/delivery/summary` | JWT Bearer | Counts: delivered, failed, pending |

---

## Template Test curl Command

```bash
PHONE_ID="$(az webapp config appsettings list ... --query "[?name=='WHATSAPP_PHONE_ID'].value[0]")"
TOKEN="$(az webapp config appsettings list ... --query "[?name=='WHATSAPP_ACCESS_TOKEN'].value[0]")"

curl -s -X POST "https://graph.facebook.com/v21.0/${PHONE_ID}/messages" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product":"whatsapp",
    "to":"60198021500",
    "type":"template",
    "template":{
      "name":"spx_ready_pickup",
      "language":{"code":"ms"},
      "components":[{
        "type":"body",
        "parameters":[
          {"type":"text","text":"Tuan Hafizi"},
          {"type":"text","text":"SPX-TEST-001"}
        ]
      }]
    }
  }'
# Expected: HTTP 200, "message_status":"accepted"
```

---

## Key Pitfalls

1. **Jangan campur `type: "text"` untuk cold audience** — akan trigger 131047
2. **Template name mesti exact match** dengan Meta Business Manager
3. **Azure env var name:** `WHATSAPP_ACCESS_TOKEN` (bukan `WHATSAPP_TOKEN`)
4. **Phone format:** `601xxxxxxxx` (no `+`, no spaces)
5. **Template approval:** Meta reviewers periksa content — jangan hard-sell
6. **Language code:** guna `"ms"` (ISO 639-1 untuk Bahasa Melayu)
