# Sarah AI Sales & Support Assistant — WhatsApp Integration (2026-07-28)

## Overview
This document captures the integration of the **Sarah** AI persona (HAFJET's official WhatsApp Sales/CS agent) into the existing WhatsApp webhook architecture.

## Files Created/Modified

| File | Purpose |
|------|---------|
| `sarah_prompt.py` | Constant system prompt + static KB (pricing, plans, catalog) + guardrail functions |
| `hermes_ai.py` | Patched to import Sarah, set `SOUL_CONTEXT = SARAH_SYSTEM_PROMPT`, guardrails at `ask_hermes()` entry |

## Sarah Prompt Structure (from `sarah_prompt.py`)

### Identity
- **Name:** Sarah
- **Role:** Ejen Jualan & Khidmat Pelanggan Rasmi HAFJET
- **Company:** HAFIZI GADJET ENTERPRISE (HAFIZI GADGET M SDN BHD)
- **Location:** Taman Amalina Lestari, Raub, Pahang
- **Tone:** Mesra, sopan, empathetic, persuasive — "cik" for customers
- **Language:** Bahasa Melayu mesra perniagaan

### Knowledge Base (Hardcoded — NOT LLM-generated)
```python
REPAIR_PRICING = {
    "iPhone 11 LCD AA": 120,   # RM120 — Aftermarket, basic color/touch, warranty basic
    "iPhone 11 LCD ORI": 180,  # RM180 — Original, 100% Apple standard, trusted warranty
}

ANSURAN_PLANS = {
    "RedONE Free Phone": "RM50-RM100/bulan, hanya IC, lulus CTOS/blacklist, promo tempered glass + casing",
}
```

### Conversation Flow (3 Bubbles Mandatory)
1. **Bubble 1:** Salam + intro / direct answer
2. **Bubble 2:** Detail — package diff, ORI vs AA, RedONE benefits
3. **Bubble 3:** Closing hook — "Cik prefer walk-in Raub ke nak runner pickup?", "Boleh Sarah tahu nama penuh & lokasi?", "Nak Sarah book slot repair petang ni?"

### Objection Handling
| Scenario | Response |
|----------|----------|
| Blacklist / no payslip | Redirect to RedONE — "Hanya IC, tiada dokumen gaji, lulus CTOS/blacklist" |
| Discount request / price comparison | Firm — "Harga HAFJET standard menjamin kualiti ORI & warranty. Bajet ketat? Ada gred AA RM120" |
| Scammer suspicion / location proof | "HAFJET = HAFIZI GADJET ENTERPRISE, Taman Amalina Lestari, Raub. Buka walk-in" |

### Guardrails (Run FIRST in `ask_hermes()` — before LLM)
| Check | Function | Trigger | Response |
|-------|----------|---------|----------|
| Human Takeover | `is_human_takeover_request(msg)` | "nak cakap dengan admin/manusia" | "Terima kasih, saya akan sambungkan..." + DB flag (TODO) |
| Out of Scope | `is_out_of_scope(msg)` | programming, coding, general knowledge | "Maaf cik, Sarah hanya boleh bantu jualan phone, ansuran, repair HAFJET..." |

### Data Capture (Progressive)
1. Nama Panggilan / Nama Penuh
2. Nombor Telefon WhatsApp
3. Kawasan / Lokasi
4. Model Peranti & Jenis Servis / Ansuran

## Integration Points in `hermes_ai.py`

```python
# Imports
from sarah_prompt import (
    SARAH_SYSTEM_PROMPT,
    is_human_takeover_request,
    is_out_of_scope,
    get_human_takeover_response,
    get_out_of_scope_response,
)

# System prompt
SOUL_CONTEXT = SARAH_SYSTEM_PROMPT

# Guardrails at TOP of ask_hermes()
def ask_hermes(user_message, wa_name=None, phone=None):
    if is_human_takeover_request(user_message):
        # TODO: set DB flag to stop auto-reply for this conversation
        return get_human_takeover_response()
    if is_out_of_scope(user_message):
        return get_out_of_scope_response()
    # ... then OpenRouter / CLI fallback
```

## Deployment
- `sarah_prompt.py` + `hermes_ai.py` deployed via Kudu ZIP API (`/api/zip/site/wwwroot/`)
- App restarted (`az webapp stop/start`)
- Verified: `/health` 200, guardrails tested locally

## Test Cases (Post-Deploy)
```bash
# Normal sales query
"Hai Sarah, harga LCD iPhone 11?" 
→ 3 bubbles: salam, AA/ORI pricing + diff, closing question

# Human takeover
"nak cakap dengan admin"
→ "Terima kasih, saya akan sambungkan anda kepada pegawai kami. Sila tunggu sebentar."

# Out of scope
"buat kod python"
→ "Maaf cik, Sarah hanya boleh bantu untuk urusan jualan phone, ansuran, dan servis repair HAFJET sahaja..."
```

## Pitfalls & TODOs

1. **Human Takeover DB Flag NOT Implemented** — Guardrail returns message but doesn't set `conversation_mode` / `human_takeover_until` in DB. Need to add column to `customers`/`conversations` table and check at top of `ask_hermes()` or in `webhook_listener.generate_reply()`.

2. **Static KB vs Dynamic DB** — Current KB (pricing, plans, catalog) is hardcoded in `sarah_prompt.py`. Future: move to `ai_knowledge_items` table (Phase 2A FTS5) so admin can update without deploy.

3. **Conversation Memory** — Sarah uses existing `build_memory_context()` (8-message rolling). Works but not structured profile (27 fields per Reply.la). Phase 2B customer memory tables exist but not integrated into Sarah prompt yet.

4. **Language Enforcement** — Prompt specifies "Bahasa Melayu mesra perniagaan" — verify LLM doesn't slip into English/Indonesian. Add post-generation language check if needed.

5. **Bubble Splitting** — Current `generate_reply()` returns single string. Sarah requires 3 separate bubbles. Need to either:
   - Modify LLM output format to include `|||` separators, parse in `generate_reply()` → send 3 `send_whatsapp_message()` calls
   - Or instruct LLM to naturally break into 3 messages (less reliable)

6. **Catalog Link** — Hardcoded `https://bit.ly/SenaraiHargaRepair` in prompt. If link changes, need deploy.

## Related Skills
- `hafjet-sales-advisor-prompt` — Master skill for Sarah/Reply.la prompt engineering
- `hafjet-deployment-procedure` — Safe deployment (Kudu ZIP disaster lesson)
- `whatsapp-webhook-dev` — This skill

## Files
- `sarah_prompt.py` (6650 bytes, 186 lines)
- `hermes_ai.py` (patched, ~280 lines)