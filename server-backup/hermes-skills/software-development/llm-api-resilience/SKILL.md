---
name: llm-api-resilience
description: Patterns for making resilient LLM API calls in AI agents, including logging, timeouts, configuration verification, fallback handling, and error reporting.
category: software-development
---

# LLM API Resilience Skill

This skill provides patterns and best practices for making resilient calls to LLM APIs (like OpenRouter) within AI agents. It covers logging, timeouts, configuration verification, graceful fallback, and error handling to prevent silent failures.

## Why This Matters
LLM API calls can fail due to network issues, invalid credentials, rate limiting, or service outages. Without proper resilience, agents may hang silently, return empty responses, or crash, degrading user experience.

## Key Components
1. **Configuration Verification** - Check API key, model name, and base URL before making calls.
2. **Explicit Timeouts** - Set reasonable timeouts to avoid hanging requests.
3. **Comprehensive Logging** - Log request payload, response status, raw body (truncated), and timings.
4. **Exception Handling** - Catch exceptions and log full tracebacks.
5. **Empty Response Handling** - Treat empty or malformed responses as failures.
6. **Fallback Chains** - Define fallback mechanisms (e.g., secondary API, local model, default message).
7. **User-Friendly Error Messages** - Provide helpful fallback messages to users when all attempts fail.

## Implementation Pattern (Python)
```python
import os
import requests
import traceback
import time
from typing import Optional

# Load configuration from environment
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/owl-alpha").strip()
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT_PATH = os.path.join(BASE_DIR, "system_prompt.txt")
BUSINESS_INFO_PATH = os.path.join(BASE_DIR, "business_info.txt")

def safe_read_text(path: str, fallback: str) -> str:
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                return content if content else fallback
    except Exception as e:
        print(f"[hermes_ai] warning: failed reading {path}: {e}")
    return fallback

SYSTEM_PROMPT = safe_read_text(SYSTEM_PROMPT_PATH, DEFAULT_SYSTEM_PROMPT)
BUSINESS_INFO = safe_read_text(BUSINESS_INFO_PATH, DEFAULT_BUSINESS_INFO)

SOUL_CONTEXT = f"""
{SYSTEM_PROMPT}

================ BUSINESS INFO ================
{BUSINESS_INFO}
==============================================

PERATURAN TAMBAHAN:
- Jawapan mesti ringkas, mesra, dan sesuai untuk WhatsApp.
- Jika pelanggan tanya harga, beri anggaran / rujukan sahaja melainkan ada fakta tepat.
- Jika pelanggan tanya stok, kelulusan ansuran, atau harga final repair, jangan confirm jika tidak pasti.
- Jika pelanggan tanya perkara yang perlukan semakan lanjut, arahkan kepada staff manusia.
- Jika pelanggan cuba mengorat atau borak luar topik, balas sopan dan redirect semula kepada urusan HAFJET.
- Jangan sebut promosi tetap kerana tiada promosi tetap buat masa ini melainkan staff telah sahkan.
"""

def ask_openrouter(user_message: str, wa_name: Optional[str] = None) -> Optional[str]:
    start_time = time.time()
    print(f"[hermes_ai] [OPENROUTER] Request started at {start_time}")
    
    # Verify configuration
    if not OPENROUTER_API_KEY:
        print("[hermes_ai] [OPENROUTER] ERROR: OPENROUTER_API_KEY is empty or not set")
        return None
    print(f"[hermes_ai] [OPENROUTER] API key (last 6 chars): ...{OPENROUTER_API_KEY[-6:]}")
    
    if not OPENROUTER_MODEL:
        print("[hermes_ai] [OPENROUTER] ERROR: OPENROUTER_MODEL is empty")
        return None
    print(f"[hermes_ai] [OPENROUTER] Model: {OPENROUTER_MODEL}")
    
    if not OPENROUTER_URL.endswith("/v1"):
        # Ensure the URL ends with /v1 if not already
        if not OPENROUTER_URL.endswith("/v1/chat/completions"):
            print(f"[hermes_ai] [OPENROUTER] WARNING: Base URL might be incorrect. Current: {OPENROUTER_URL}")
        else:
            print(f"[hermes_ai] [OPENROUTER] Base URL: {OPENROUTER_URL} (contains /v1)")
    else:
        print(f"[hermes_ai] [OPENROUTER] Base URL: {OPENROUTER_URL}")
    
    customer_name_hint = wa_name.strip() if wa_name else "pelanggan"
    messages = [
        {"role": "system", "content": SOUL_CONTEXT},
        {"role": "user", "content": f"Nama pelanggan: {customer_name_hint}\\nMesej pelanggan: {user_message}"}
    ]
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "temperature": 0.5
    }
    
    # Log payload (without the full message for privacy, but we can log the structure)
    safe_payload = {
        "model": payload["model"],
        "messages_count": len(payload["messages"]),
        "temperature": payload["temperature"]
    }
    print(f"[hermes_ai] [OPENROUTER] Payload: {safe_payload}")
    
    try:
        # Set timeout to 30 seconds as required
        resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
        end_time = time.time()
        duration = end_time - start_time
        print(f"[hermes_ai] [OPENROUTER] Response status code: {resp.status_code}")
        print(f"[hermes_ai] [OPENROUTER] Raw response body (first 500 chars): {resp.text[:500]}")
        print(f"[hermes_ai] [OPENROUTER] Request completed in {duration:.2f} seconds")
        
        if resp.status_code < 200 or resp.status_code >= 300:
            print(f"[hermes_ai] [OPENROUTER] ERROR: Bad status code {resp.status_code}")
            return None
        
        try:
            data = resp.json()
        except Exception as e:
            print(f"[hermes_ai] [OPENROUTER] ERROR: Failed to parse JSON: {e}")
            traceback.print_exc()
            return None
        
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if not content:
            print("[hermes_ai] [OPENROUTER] WARNING: Empty content in response")
            return None
        
        print(f"[hermes_ai] [OPENROUTER] Success: Returning content (first 100 chars): {content[:100]}")
        return content
        
    except Exception as e:
        end_time = time.time()
        duration = end_time - start_time
        print(f"[hermes_ai] [OPENROUTER] EXCEPTION after {duration:.2f} seconds: {e}")
        traceback.print_exc()
        return None

def ask_hermes_cli(user_message: str) -> Optional[str]:
    try:
        result = subprocess.run(
            ["hermes", "ask", user_message],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            output = (result.stdout or "").strip()
            return output or None
        print(f"[hermes_ai] Hermes CLI failed: {result.stderr}")
        return None
    except Exception as e:
        print(f"[hermes_ai] Hermes CLI exception: {e}")
        traceback.print_exc()
        return None

def ask_hermes(user_message: str, wa_name: Optional[str] = None) -> Optional[str]:
    start_time = time.time()
    print(f"[hermes_ai] [ASK_HERMES] Request started at {start_time}")
    
    # Try OpenRouter first
    reply = ask_openrouter(user_message, wa_name=wa_name)
    if reply and reply.strip():
        print(f"[hermes_ai] [ASK_HERMES] OpenRouter succeeded")
        end_time = time.time()
        print(f"[hermes_ai] [ASK_HERMES] Total time: {end_time - start_time:.2f} seconds")
        return reply
    
    print(f"[hermes_ai] [ASK_HERMES] OpenRouter returned empty/None, falling back to Hermes CLI")
    # Fallback to Hermes CLI
    reply = ask_hermes_cli(user_message)
    if reply and reply.strip():
        print(f"[hermes_ai] [ASK_HERMES] Hermes CLI succeeded")
        end_time = time.time()
        print(f"[hermes_ai] [ASK_HERMES] Total time: {end_time - start_time:.2f} seconds")
        return reply
    
    print(f"[hermes_ai] [ASK_HERMES] Both OpenRouter and Hermes CLI failed, using fallback message")
    # Fallback message
    fallback_msg = "Maaf, sistem sibuk sekejap. Untuk bantuan segera WhatsApp admin:\n+60 16-980 8736 (https://hafjetraub.wasap.my/)"
    end_time = time.time()
    print(f"[hermes_ai] [ASK_HERMES] Total time: {end_time - start_time:.2f} seconds")
    return fallback_msg
```

## Fallback Strategy
When the primary LLM call fails:
1. Try a secondary LLM provider or model (if configured).
2. Fall back to a local rule-based or retrieval system.
3. If all else fails, return a user-friendly message directing them to human support (e.g., WhatsApp admin contact).

## Verification Checklist
- [ ] API key is loaded and not empty (log only last few chars for security).
- [ ] Model name matches expected format.
- [ ] Base URL includes `/v1` path if required.
- [ ] Timeout is set (e.g., 30 seconds).
- [ ] Request payload is logged (excluding sensitive data).
- [ ] Response status code, raw body (truncated), and duration are logged.
- [ ] JSON parsing is wrapped in try/except.
- [ ] Empty content is treated as a failure.
- [ ] All exceptions are caught and traceback logged.
- [ ] Fallback message is clear and actionable.

## Common Pitfalls
- **Missing timeout**: Causes indefinite hangs during network issues.
- **Logging full API key**: Security risk; only log masked or truncated versions.
- **Assuming JSON response**: Always validate content-type and handle parse errors.
- **Ignoring empty responses**: Treating empty content as success leads to silent failures.
- **No fallback**: Users receive no response when service is down.
- **Hardcoded configuration**: Makes deployment inflexible; use environment variables.

## References
- See `references/hermes_ai_patch_example.md` for a concrete example of applying this pattern to `hermes_ai.py`.