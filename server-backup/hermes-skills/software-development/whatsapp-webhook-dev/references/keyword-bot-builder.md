# Keyword Bot Builder — Full Implementation Reference

## Backend Integration Flow

```
_inbound message_
    ↓ log_inbound (DB)
    ↓ _check_keyword_rules() [run_in_executor → SQLite]
    ├─ MATCH → send_whatsapp_message + log_outbound(routing_path="keyword") → RETURN
    └─ NO MATCH → _detect_routing() → generate_reply() → AI / fallback
```

**Placement:** Call `_check_keyword_rules()` in `_process_message()` AFTER `await log_inbound(...)` and BEFORE `_detect_routing(...)` / `generate_reply(...)`.

```python
keyword_reply = await _check_keyword_rules(user_message)
if keyword_reply:
    log.info("🔑 Keyword match — bypassing AI")
    _routing = "keyword"
    reply_text = keyword_reply
    _latency_ms = int((_time.time() - _reply_start) * 1000)
    await send_whatsapp_message(from_number, reply_text)
    _fallback = False
    await log_outbound(from_number, reply_text, _routing, _latency_ms, _fallback)
    return
```

## API Route Pattern (FastAPI)

All keyword routes go in `webhook_listener.py`, AFTER analytics routes, BEFORE SPA catch-all.

**Key rules:**
- Every sync DB call MUST be wrapped in `await loop.run_in_executor(None, func, args)`
- Use `JSONResponse` for error paths, plain dict for success
- Input validation: strip strings, default `match_type` to `"contains"`, reject empty keyword/reply with 400

## Frontend Keywords Page (`dashboard/src/components/Keywords.jsx`)

**State:** `keywords[]`, `showModal`, `editRule`, `form{keyword,reply,priority,match_type}`, `testMsg`, `testResult`.

**Actions:** `loadKeywords()`, `handleSave()`, `handleEdit(rule)`, `handleDelete(id)`, `handleToggle(rule)`, `handleTest()`.

**Styling (Reply.la dark theme):**
- Card: `bg-[#1a1d27] rounded-xl p-4`
- Button: `bg-[#00d563] hover:bg-[#00c255] text-black px-4 py-2 rounded-lg`
- Toggle: `w-10 h-5 rounded-full`, active=`bg-[#00d563]`, inactive=`bg-gray-600`
- Keyword badge: `bg-blue-900/40 text-blue-300 px-3 py-1 rounded-full text-sm font-mono`

## API Helpers (`dashboard/src/api/api.js`)

Add 5 functions: `fetchKeywords()`, `createKeyword(data)`, `updateKeyword(id, data)`, `deleteKeyword(id)`, `testKeyword(message)`.
Pattern: always include `'X-API-Key': import.meta.env.VITE_API_KEY || ''`.

## Layout Wiring (`dashboard/src/components/Layout.jsx`)

1. `import Keywords from './Keywords'`
2. Add NAV_ITEMS entry after Blast, before Settings: `{ id: 'keywords', label: 'Keywords', icon: <HashIcon /> }`
3. Render branch: `{activeTab === 'keywords' ? <Keywords /> : ...}`

## Seeding Default Rules

After first deploy, seed via POST `/api/keywords`:

| Keyword | Priority | Reply |
|---------|----------|-------|
| `harga` | 5 | `Untuk senarai harga repair, rujuk: https://bit.ly/SenaraiHargaRepair atau hantar model phone untuk estimate.` |
| `lokasi` | 10 | `HAFJET berlokasi di Raub, Pahang. 📍 Google Maps: https://maps.app.goo.gl/CzqhRwrN1P11Buwy9` |
| `waktu` | 10 | `Waktu operasi HAFJET: Isnin–Sabtu, 10 pagi – 7 malam.` |
| `whatsapp` | 10 | `Admin boleh dihubungi di: +60 16-980 8736` |
| `status` | 10 | `Semak status repair, sila berikan nombor job order (format: JOB-2026-XXXX).` |

**Pitfall:** Lower priority number = higher priority. If multiple rules match, lowest number wins.

## Validation Checklist

- [ ] `/api/keywords` returns 200 with `{"keywords": [...]}`
- [ ] `POST /api/keywords` creates rule, returns `{"id": N}`
- [ ] `PATCH /api/keywords/{id}` updates rule
- [ ] `DELETE /api/keywords/{id}` removes rule
- [ ] `POST /api/keywords/test` returns match result
- [ ] Test panel shows green/gray result box
- [ ] Toggle switch disables/enables rule immediately
- [ ] `/keywords` accessible via SPA catch-all
- [ ] Hash icon visible in sidebar on hover
- [ ] Bot sends keyword reply when matching message received
- [ ] Routing log shows `intent=keyword` for keyword-triggered messages

## Common Pitfalls

1. **Match type:** `"contains"` = `kw in msg_lower`, `"exact"` = `msg_lower == kw`.
2. **Empty keyword/reply:** Always strip/validate. Empty keyword causes `"" in msg_lower` → always matches.
3. **Sync DB in async:** Never call sync DB functions directly in async endpoints. Always use `run_in_executor`.
4. **Frontend routing:** If `/keywords` returns 404, verify SPA catch-all is LAST route in FastAPI.
5. **VITE_API_KEY missing:** If endpoints return 401, rebuild dashboard with `VITE_API_KEY` set.
