# Pre-Deploy Verification Workflow

## Context

Tuan Hafizi requires **explicit code → test → approval → deploy** ordering. Deviations are rejected.

## Mandatory Sequence

1. **Show diff** — `diff -u original.py patched.py` for every changed file. Group by file.
2. **Show test log** — Run the changed function(s) in isolation and capture stdout/stderr. Show the complete output including any fallback paths.
3. **Wait for approval** — The user says either:
   - ✅ "Deploy sekarang" or "DEPLOY SEKARANG" → proceed
   - ❌ "JANGAN deploy" or "Tunjuk dulu" → stop, revise
   - Never deploy without explicit approval.
4. **Deploy** — Only the exact approved version. No bonus fixes or unrelated changes.

## Business Data Integrity

- Operating hours, prices, promotions, stock — ONLY from `business_info.txt`, `system_prompt.txt`, `intent_rules.json`
- If user says "belum sahkan" / "PENDING" about a data point → **don't change it**
- If data is missing → tell the user, never hardcode or fabricate
- When user confirms data, update ALL files that reference it (business_info.txt, webhook_listener.py menu handlers, hermes_ai.py DEFAULT_BUSINESS_INFO, intent_rules.json)
- Use `grep -rn "OLD_DATA" *.py *.txt *.json` to verify no stale data remains across all 4 files
- The fallback message for when AI fails must come from `CANONICAL_FALLBACK` or `fallback_message` runtime setting — never a hardcoded string

## Routing Debug Pattern

When a bot fails to route free-text messages to AI:

```
1. Check the generate_reply() function for 'await sync_func()' pattern
   → grep -n "await " webhook_listener.py | grep -v "def "
   → grep -n "^def \|^async def " hermes_ai.py
   → Any 'await call' to a function listed under 'def' (not 'async def') is a bug

2. Fix: Replace 'await sync_func()' with:
   loop = asyncio.get_event_loop()
   try:
       result = await loop.run_in_executor(None, sync_func, args)
   except Exception as e:
       log.error(f"Exception: {e}", exc_info=True)
       result = None

3. Add routing logging:
   log.info(f"🔄 Routing: teks='{message}' → intent={routing}")
   # After generate_reply returns:
   log.info(f"📤 Reply: intent={routing}, latency={latency}ms, fallback={is_fallback}")
```

## OpenRouter Model Testing & Configuration

When bot falls back to "Maaf sistem sibuk" (AI unreachable):

1. **Check configured model** in Azure App Settings:
   ```bash
   az webapp config appsettings list --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --query "[?name=='OPENROUTER_MODEL']" -o json
   ```

2. **Test model viability** by making a direct API call:
   ```python
   # In Python with the API key from Azure, test various :free models
   # Known working: nvidia/nemotron-3-super-120b-a12b:free
   # Rate-limited common: openai/gpt-oss-120b:free, meta-llama/llama-3.3-70b-instruct:free
   # NOT available as free on this account: deepseek/deepseek-chat-v3-0324:free, deepseek/deepseek-r1:free
   ```

3. **GET /api/v1/models** to list all available :free models:
   ```python
   import urllib.request, json
   req = urllib.request.Request("https://openrouter.ai/api/v1/models")
   with urllib.request.urlopen(req) as resp:
       models = [m["id"] for m in json.loads(resp.read())["data"] if ":free" in m["id"]]
   ```

4. **Common OpenRouter error codes & fixes:**
   | Code | Meaning | Fix |
   |------|---------|-----|
   | 404 | Model not found | Check model name spelling, try `:free` suffix |
   | 429 | Rate limited (free models ~20 req/min) | Wait 2s and retry once, then fallback |
   | 401 | API key invalid | Regenerate key in OpenRouter dashboard |
   | 402 | Payment required | Top up account or use :free model |

## Dedup Bug Fix Pattern

When the bot sends **3 replies for 1 message** (double/triple reply):

1. Check `_is_duplicate()` function — the most common bug is a **missing msg_id save**:
   ```python
   def _is_duplicate(msg_id: str) -> bool:
       ...
       if msg_id in _processed_messages:
           if elapsed < dedup_sec:
               return True  # duplicate
       # ❌ BUG: msg_id is never added to _processed_messages
       return False  # Never detects duplicates!
   ```

2. **Fix:** Add the save line:
   ```python
       # Record this message ID to prevent duplicate processing
       _processed_messages[msg_id] = now
       # Cleanup expired entries
   ```

3. **Also check:** Meta sends webhooks with `messages` array. Every entry/change combo is processed separately. Without dedup, same message through different entries = multiple replies.

## 429 Retry Pattern

When free models return 429 (rate limited):

```python
if resp.status_code == 429:
    print("[hermes_ai] [OPENROUTER] Rate limited (429) — retrying once after 2s sleep")
    time.sleep(2)
    resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
    if resp.status_code >= 200 and resp.status_code < 300:
        # Retry succeeded
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if content:
            return content
    print("[hermes_ai] [OPENROUTER] Retry also failed — falling back")
    return None
```

Always log the retry status and raw body for monitoring.

## Test Every Route

Before claiming a fix works, test BOTH paths:

| Input | Expected Route |
|-------|---------------|
| `"1"` | `static_menu` |
| `"menu"` | `static_menu` |
| `"assalamualaikum"` | `greeting` |
| `"Malam ni bukak lagi ke"` | `ai_query` |
| `"berapa harga repair screen?"` | `ai_query` |
| `"Phone Ansuran ade?"` | `ai_query` |

Verify all pass before asking for deploy approval.

## Post-Verification Grep (Data Consistency)

After updating business data (phone, hours, address), grep ALL source files:

```bash
cd ~/.hermes/whatsapp-bot
echo "=== Old phone check ===" && grep -rn "11-4956" *.py *.txt *.json || echo "(clean)"
echo "=== Old hours check ===" && grep -rn "Isnin.*Sabtu\|10:00 AM\|9:30 PM" *.py *.txt *.json || echo "(clean)"
echo "=== New data ===" && grep -c "16-980 8736\|Setiap Hari" *.py *.txt *.json
```

All 3 checks must show 0 old hits and non-zero new data counts.