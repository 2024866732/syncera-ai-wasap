# Phase 2A — Prompt Builder Implementation (Jul 2026)

## Overview
Replaces manual `system_prompt.txt` editing with structured SQLite tables + a compile function. Part of the Reply.la clone architecture (14 modules spec'd).

## 4 New Tables (in `db_logger.py::init_db()`)

### `ai_config` (single row, id=1)
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| persona_name | TEXT | 'Sarah' | AI persona name |
| persona_role | TEXT | 'Khidmat Pelanggan & Pembantu Jualan' | Role description |
| business_name | TEXT | 'HAFJET' | Business name |
| language_mode | TEXT | 'en_ms' | Language: en_ms / ms_only / en_only |
| tone_tags | TEXT (JSON) | '["friendly_casual"]' | Tone descriptors |
| reply_structure_flags | TEXT (JSON) | 6 boolean flags | Reply formatting rules |
| custom_instruction_text | TEXT | (seeded) | Free-form extra rules |
| constraints_text | TEXT | (seeded) | Hard rules (8 items) |
| ai_enabled | INT | 1 | Global AI toggle |
| creativity | REAL | 0.5 | Temperature |
| memory_length | INT | 8 | Messages to include in context |

### `ai_business_info` (single row, id=1)
Fields: what_you_offer, product_service_list, contact_info, business_tags, address_hours, delivery_shipping, bookings_availability, payment_methods

### `closing_flow_steps` (ordered, AUTOINCREMENT)
Fields: step_order, title, description (AI instruction), example_script (few-shot), enabled

### `ai_faqs` (array, AUTOINCREMENT)
Fields: question, answer (richtext), enabled, sort_order

## Seed Pattern
All tables use seed-if-empty pattern inside `init_db()`:
```python
cur = conn.execute("SELECT COUNT(*) FROM ai_config")
if cur.fetchone()[0] == 0:
    # INSERT with seed data from system_prompt.txt + business_info.txt
```
This is non-destructive: existing data preserved, only seeds on first run.

## Compile Function: `build_full_system_prompt()`
Location: `db_logger.py` (end of file, after `save_sync_progress`)

Assembles 6 sections with `═══` delimiters:
1. BUSINESS INFO — from `ai_business_info`
2. LANGUAGE & STYLE — from `ai_config` (persona, tone, flags)
3. CLOSING FLOW — from `closing_flow_steps` (ordered, enabled only)
4. FAQs — from `ai_faqs` (enabled only, sorted)
5. CONSTRAINTS — from `ai_config.constraints_text`
6. CUSTOM INSTRUCTION — from `ai_config.custom_instruction_text`

Fallback: if DB empty/error → reads `system_prompt.txt` → final fallback to `"Anda ialah HAFJET AI Assistant."`

## Integration: `build_soul_context()` in `hermes_ai.py`
```python
def build_soul_context() -> str:
    try:
        from db_logger import build_full_system_prompt
        compiled = build_full_system_prompt()
        if compiled and compiled.strip():
            return compiled
    except Exception as e:
        print(f"[hermes_ai] build_full_system_prompt failed, using fallback: {e}")
    return SOUL_CONTEXT
```

In `ask_openrouter()`, replace:
```python
# BEFORE:
{"role": "system", "content": SOUL_CONTEXT},
# AFTER:
{"role": "system", "content": build_soul_context()},
```

Called at runtime (per-message), NOT module-level. This allows prompt edits via DB without app restart.

## Key Decisions
- `system_prompt.txt` kept as fallback (not deleted)
- `SOUL_CONTEXT` still built at module level as fallback chain
- All tables use `CREATE TABLE IF NOT EXISTS` — safe for existing DBs
- Seed data migrated from actual HAFJET content (not Reply.la copy)
- No frontend changes needed for Phase 2A (backend-only)

## Verification
```bash
python3 -m py_compile db_logger.py hermes_ai.py webhook_listener.py
# Deploy → check /health → send test WhatsApp → verify AI reply uses structured prompt
```
