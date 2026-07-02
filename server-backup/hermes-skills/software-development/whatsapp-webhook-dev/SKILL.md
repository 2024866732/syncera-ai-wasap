---
name: whatsapp-webhook-dev
description: Build and deploy WhatsApp Cloud API (Meta) webhook listeners for chatbot integrations. Activates when the user wants to create a WhatsApp bot, set up webhook endpoints, handle incoming WhatsApp messages, or integrate WhatsApp with an AI agent. Covers Meta Developer Portal setup, FastAPI webhook server, HMAC signature verification, message processing, and sending replies via Graph API.
---

# WhatsApp Cloud API Webhook Development

Build custom WhatsApp chatbots using Meta's WhatsApp Cloud API with a FastAPI webhook listener.

## Architecture

```
Customer (WhatsApp)
    → Meta Cloud API (Graph API v21.0)
    → Webhook POST (our server)
    → FastAPI Webhook Listener
    → Message Handler / AI Agent
    → Meta Cloud API (send reply)
    → Customer (WhatsApp)
```

## Meta Developer Portal Setup

### 1. Create Business App
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. My Apps → Create App → **Business** type
3. Add product: **WhatsApp**

### 2. Register Phone Number
1. WhatsApp → API Setup → "Add phone number"
2. Verify via SMS/call
3. **Note:** Phone Number ID (different from the phone number itself)

### 3. Generate Credentials
| Credential | Location | Notes |
|------------|----------|-------|
| Access Token | WhatsApp → API Setup → Generate | Choose **Permanent** |
| Phone Number ID | WhatsApp → API Setup | Listed under the phone number |
| App Secret | Settings → Basic | For webhook signature verification |

### 4. Configure Webhook
1. WhatsApp → Configuration → Webhook
2. Callback URL: `https://your-domain.com/webhook`
3. Verify Token: any secret string you choose
4. Subscribe to: `messages`

## Server Requirements

- Python 3.10+
- `fastapi`, `uvicorn`, `httpx`, `python-dotenv`
- Public HTTPS endpoint (use nginx + Let's Encrypt, or ngrok for testing)
- Port 8443 (or as configured)

## Webhook Listener Structure

### Two Endpoints Required

**GET /webhook** — Verification (Meta calls this once during setup):
```python
@app.get("/webhook")
async def verify_webhook(request: Request):
    params = dict(request.query_params)
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == EXPECTED_TOKEN:
        return Response(content=params["hub.challenge"])
    raise HTTPException(403)
```

**POST /webhook** — Receive messages:
```python
@app.post("/webhook")
async def receive_message(request: Request):
    signature = request.headers.get("X-Hub-Signature-256", "")
    body = await request.body()
    if not verify_signature(body, signature):
        raise HTTPException(403)
    data = json.loads(body)
    # Process messages...
    return {"status": "ok"}
```

### HMAC Signature Verification

```python
import hmac, hashlib

def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

## Sending Replies

```python
import httpx

async def send_whatsapp_message(to_number: str, message: str, token: str, phone_id: str):
    url = f"https://graph.facebook.com/v21.0/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": message, "preview_url": False},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)
        return resp.status_code == 200
```

## Message Types to Handle

| Type | Field | Notes |
|------|-------|-------|
| Text | `msg["text"]["body"]` | Plain text message |
| Interactive (button) | `msg["interactive"]["button_reply"]["id"]` | Quick reply button |
| Interactive (list) | `msg["interactive"]["list_reply"]["id"]` | List selection |
| Button | `msg["button"]["text"]` | Call-to-action button |

## Credential Security

**Never hardcode tokens in scripts.** Use `.env` file pattern:

```python
from dotenv import load_dotenv
load_dotenv(os.path.expanduser("~/.hermes/.env"))

TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")
```

**Gotcha:** Read `.env` tokens via Python file parsing, never via shell `grep | cut` — see `business-api-integration` skill for details.

## Common Pitfalls

0. **⚠ WRONG TOKEN TYPE (most common):** If `debug_token` shows `scopes: ['public_profile']` only, your token is from Graph API Explorer or Facebook Login — NOT a WhatsApp token. You MUST generate a System User token with `whatsapp_business_messaging` scope. See `references/system-user-token-guide.md` for step-by-step instructions. This is the #1 cause of `"Object with ID 'XXX' does not exist"` errors.

1. **Webhook verification fails:** Ensure `hub.verify_token` matches exactly (case-sensitive). If you set `HAFJET_RAUB_RAK` in Meta portal, the code must use the same string.
2. **403 on POST:** Check `APP_SECRET` is correct for HMAC signature verification
3. **No reply sent:** Check `WHATSAPP_TOKEN` is permanent (not temporary) and `PHONE_ID` is correct
4. **Messages not received:** Ensure webhook is subscribed to `messages` field in Meta portal
5. **Graph API version:** Use `v21.0` or later in URLs — older versions may be deprecated
6. **Phone number format:** Use full international format without `+` (e.g., `60123456789`)
7. **Tunnel URL changes:** Cloudflare Tunnel URLs change on every restart. For production, use a paid tunnel with a fixed domain or ngrok with an auth token.
8. **SSL required:** Meta requires HTTPS for webhook callbacks. Direct IP:port without SSL will always fail validation. Always use a tunnel (ngrok) or proper SSL certificate.
9. **⚠ Cloudflare Tunnel interstitial page:** Meta CANNOT verify webhooks through Cloudflare Tunnel because `trycloudflare.com` serves an interstitial/warning page that blocks Meta's validation request. **Always use ngrok** (with auth token) or a proper domain + SSL for Meta webhook verification. Cloudflare Tunnel is only suitable for non-Meta webhook testing.
10. **⚠ ngrok auth token config:** ngrok v3 requires an auth token. Setting it via CLI (`ngrok config add-authtoken`) may fail silently. **Always write the config file directly:**
    ```bash
    mkdir -p ~/.config/ngrok
    cat > ~/.config/ngrok/ngrok.yml << 'EOF'
    version: "2"
    authtoken: YOUR_TOKEN_HERE
    log_level: info
    EOF
    ```
    Then start with: `ngrok http 8443 --config ~/.config/ngrok/ngrok.yml`
11. **⚠ Shell quoting with special characters:** Tokens containing `=`, `'`, `)`, `}`, `$` break shell commands, `python3 -c "..."`, and heredocs. **Never** embed tokens in shell commands. **Never** use `grep | cut` or `sed` for extraction. When **updating** `.env` with a new token: (1) write the token to `/tmp/new_token.txt` via `write_file`, (2) write a Python script that reads the token from the file and does `re.sub` on `.env`, (3) execute the script. This 3-step pattern is the only reliable way. See `references/shell-quoting-workaround.md` for the full pattern.
11b. **⚠ `write_file` sibling subagent warning:** When using `write_file` on `.env`, you may get a warning: "file was modified by sibling subagent but this agent never read it." This is a false positive in most cases — the "sibling subagent" is often the same session's earlier tool calls. If you're certain your content is correct, proceed. To be safe, read the current file first via `terminal(cat ...)` before writing.
12. **⚠ `sed` in-place edit corrupts tokens with `=`:** Using `sed -i 's/.../.../'` to update `.env` lines where the new value contains `=` will silently truncate or corrupt the value. **Always use Python file manipulation** to update tokens in `.env`:
    ```python
    # Safe .env token update
    env_path = "/home/user/.hermes/.env"
    with open("/tmp/token.txt") as f:
        new_token = f.read().strip()
    with open(env_path, "r") as f:
        lines = f.readlines()
    out = []
    for line in lines:
        if line.strip().startswith("WHATSAPP_ACCESS_TOKEN="):
            out.append("WHATSAPP_ACCESS_TOKEN=" + new_token + "\n")
        else:
            out.append(line)
    with open(env_path, "w") as f:
        f.writelines(out)
    ```
    **Why:** `sed` patterns like `s|WHATSAPP_ACCESS_TOKEN=.*|WHATSAPP_ACCESS_TOKEN=NEW_VALUE|` break when `NEW_VALUE` contains `=` — sed interprets the `=` as part of the regex, not the replacement. Python string concatenation has no such ambiguity.
13. **⚠ Phone Number ID must match the token's app/WABA:** If you get `"Object with ID 'XXXXXXXX' does not exist, cannot be loaded due to missing permissions"` when calling `GET /v21.0/{phone_id}`, it means the Phone Number ID and Access Token are from **different Meta apps or WABAs**. The token must be generated from the same app that owns the phone number. When you add a new payment method or regenerate tokens, Meta may create a new WABA — you must use the Phone Number ID from the **same WABA** as the token. To find the correct Phone Number ID:
    - Go to Meta Developer Portal → WhatsApp → API Setup
    - The phone number listed there is the one that matches your token
    - Or call `GET /v21.0/{waba_id}/phone_numbers` with your token to list all phone numbers under that WABA
14. **⚠ WABA ID ≠ Phone Number ID:** These are two different identifiers:
    - **Phone Number ID** (e.g., `107158292462704`) — identifies the specific phone number, used in the send message API: `POST /v21.0/{phone_id}/messages`
    - **WhatsApp Business Account ID** (e.g., `105841539261734`) — identifies the business account, used for account-level operations
    - **App ID** (e.g., `2083444095854295`) — identifies the Meta app
    - All three must be from the same Meta app. Mixing IDs from different apps causes permission errors.

15. **⚠ Shell environment variables override `.env` file values:** If a credential (e.g., `WHATSAPP_PHONE_ID`) is set as a shell environment variable AND also in `.env`, the **shell env var wins** even with `load_dotenv()`. Symptom: you update `.env` but API calls still use the old value, producing "Object with ID 'OLD_VALUE' does not exist" errors. **Diagnose:** `echo $WHATSAPP_PHONE_ID` — if non-empty, it's overriding `.env`. **Fix for local dev:** Pop all stale env vars before `load_dotenv()`:
    ```python
    for _k in ("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID",
               "APP_SECRET", "VERIFY_TOKEN", "WEBHOOK_VERIFY_TOKEN"):
        os.environ.pop(_k, None)
    load_dotenv(os.path.expanduser("~/.hermes/whatsapp-bot/.env"), override=True)
    ```

15a. **⚠ AZURE ONLY: `os.environ.pop()` + `load_dotenv(override=True)` DESTROYS Azure-injected env vars:** In Azure App Service, there is NO `.env` file (excluded from zip deploy). If you `os.environ.pop("WHATSAPP_ACCESS_TOKEN")` then call `load_dotenv(..., override=True)`, you DELETE the Azure-injected credential and the non-existent `.env` replaces it with nothing. Symptom: `configured: false` on `/health`, "WhatsApp token or phone ID not configured!" in Azure logs — even though Azure App Settings are correct. **Fix for Azure production:**
    ```python
    _env_path = os.path.expanduser("~/.hermes/whatsapp-bot/.env")
    if os.path.exists(_env_path):
        load_dotenv(_env_path, override=False)
    ```
    NEVER use `os.environ.pop()` for credentials in production Azure code. The local-dev pattern (pitfall 15) and the Azure pattern (15a) are **opposites** — use the right one for the environment.

15b. **⚠ Meta App Development/Unpublished mode BLOCKS all real inbound webhooks:** When a Meta app is in Development mode (or "Unpublished" / not Live), Meta **deliberately does not deliver** webhook events for messages from real users. Dashboard test button works (Meta itself triggers it), outbound send works (API call from your server), but real user messages → webhook = **silently dropped by Meta**. Symptom: bot works in simulation/local test, works with Meta dashboard test, but real WhatsApp messages never reach your server. **Fix:** App must be in **Live mode** in Meta Developer Portal. Before going Live, you need:
    - Privacy Policy URL (required field) — generate via privacypolicygenerator.info, host on GitHub Pages
    - Access Verification completed (submit for `whatsapp_business_messaging` + `whatsapp_business_management` permissions)
    - All required app settings filled (app icon, category, terms of service)
    - Toggle App Mode from "Development" to "Live" at the top of the dashboard
    **Workaround while waiting for Live approval:** Add yourself as a Tester (App Dashboard → Roles → Testers). Testers can trigger webhooks in Development mode. You CANNOT test with the general public until Live.

15c. **⚠ `subscribed_apps` endpoint requires WABA ID, NOT Phone Number ID:** To subscribe your app to webhook events for a phone number, the endpoint is:
    ```
    POST /v21.0/{waba_id}/subscribed_apps
    ```
    NOT `/{phone_id}/subscribed_apps` — that returns `"Object with ID 'XXX' does not exist"`. The WABA ID (WhatsApp Business Account ID) is different from the Phone Number ID. To find it: Meta Developer Portal → WhatsApp → API Setup → look for "WhatsApp Business Account ID". Or call `GET /v21.0/{app_id}/businesses` with your token. To verify subscription worked: `GET /v21.0/{waba_id}/subscribed_apps` → should list your app in `data`.

16. **⚠ Env var names must match between `.env` and code — no auto-mapping:** Python's `os.getenv("WHATSAPP_PHONE_ID")` looks for **exactly** `WHATSAPP_PHONE_ID` in the environment. If your `.env` file uses `PHONE_ID` or `phone_number_id`, the code will get `None`. Common mismatches found in production:
    - Code uses `APP_SECRET` but `.env` has `WHATSAPP_APP_SECRET` → signature verification silently passes (empty secret = no check)
    - Code uses `VERIFY_TOKEN` but `.env` has `WEBHOOK_VERIFY_TOKEN` → webhook verification always fails (403)
    - Code uses `WHATSAPP_PHONE_ID` but `.env` has `PHONE_ID` → send message fails with "Object does not exist"
    
    **Always verify the exact env var names in both `.env` AND the Python code match character-for-character.** When debugging 403/401/100 errors, this is the first thing to check after token validity.

17. **⚠ `az login` on headless servers requires device code flow:** On servers without a browser (SSH-only), `az login` will hang waiting for interactive browser auth. **Always use `az login --use-device-code`** — it displays a code that you enter at https://login.microsoft.com/device on any other device (phone/laptop). The CLI polls and completes auth automatically. Plan for this: you need a second device during Azure deployment.

17a. **⚠ Tester role REQUIRES Facebook Developer Account:** When adding a Tester to a Meta app in Development mode (App Dashboard → Roles → Testers → Add People), Meta rejects the addition with "A Facebook Developer Account is required to be added to an app. Test users can't be added" if the person lacks a Facebook Developer account. The app creator (Admin) already has one, but cannot test inbound webhooks from their own personal number in Dev mode without being added as Tester via a Developer account. If Tester addition fails, the only path to test real inbound messages is: complete Publish requirements → toggle app to Live mode.

17b. **⚠ Meta App Publish checklist — Development to Live mode requires ALL:**
    - **Privacy Policy URL**: Host HTML on public URL (fastest: GitHub Pages — create repo → add index.html → Settings → Pages → main branch). Use privacypolicygenerator.info for content. Must include: data collected, purpose, retention period (specify days), third-party sharing (mention Meta/WhatsApp only), PDPA 2010 mention, contact email.
    - **App Settings**: App icon (1024x1024 PNG), category (Business), support email.
    - **Advanced Access**: Request `whatsapp_business_messaging` and `whatsapp_business_management` in App Dashboard → Permissions. Use concise business-focused use case descriptions.
    - **Business Verification** (sometimes required): business.facebook.com/settings/security/ — upload SSM/registration certificate.
    - **Toggle Live**: Dashboard → App Mode (top banner) → Development → Live. If rejected, Meta shows the missing requirement.

17c. **⚠ Azure App Service startup command for FastAPI:** The correct startup command is:
    ```
    gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto
    ```
    Set in: App Settings → Configuration → General Settings → Startup Command. Also save in `start.sh` in project root. Azure injects App Settings as env vars — do NOT use `load_dotenv(override=True)` or `os.environ.pop()` in production code (see pitfall 15a). **Note:** `-w 1` only — 2 workers crash on 1GB RAM Free tier. `--ws wsproto` uses the lightweight wsproto WebSocket backend (requires `wsproto` in requirements.txt).

17d. **⚠ AI integration in Azure MUST use HTTP API, not CLI:** The Hermes CLI (`subprocess.run(["hermes", "ask", ...])`) does NOT exist in Azure App Service Linux containers. Local API fallback (`localhost:3000`) also fails. Symptom: "Hermes CLI not found, using API fallback" → "AI fallback — using default response" in logs. Bot works but always uses static default replies for non-menu messages. **Fix:** Use an HTTP-based AI provider (e.g., OpenRouter) as the primary AI method. See `references/azure-ai-integration.md` for the complete Azure-safe AI architecture, required env vars (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), and the refactored `hermes_ai.py` pattern. Key: OpenRouter API key is set via Azure App Settings, never in `.env` (which doesn't exist in Azure).

17e. **⚠ OpenRouter model names MUST be verified against available models for your key:** Model names like `google/gemini-2.0-flash-001` or `openrouter/owl-alpha` may be deprecated or unavailable for your key tier. Symptom: `404 — No endpoints found for {model}` in logs, AI always falls back to default. **Fix:** Before deploying, call `GET https://openrouter.ai/api/v1/models` with your key, extract all `:free` models, and test the candidate(s) with an actual completion request. Never assume a model name works — verify it via the API. Recommended free models verified as of July 2026: `nvidia/nemotron-3-super-120b-a12b:free`, `openai/gpt-oss-120b:free`, `qwen/qwen3-coder:free`. Always set model via `OPENROUTER_MODEL` env var so it can be changed without code changes. See `references/openrouter-free-model-verification.md` for the full verification script and process.

17f. **⚠ Azure Free tier may have outbound network restrictions causing API timeouts:** External API calls (OpenRouter, OpenAI, etc.) from Azure App Service Free F1 tier may hang or timeout (>30s) even when the same call works fine from your local machine. Symptom: webhook received but no reply, no error logs (async handler still waiting for external API). **Diagnosis:** Test the external API from Kudu console (`curl -v https://api.openrouter.ai/api/v1/key` from Kudu terminal). If curl times out from Azure but works from local, it's an Azure network restriction. **Mitigation:** Set fail-fast timeouts (connect=5s, read=10s), always have a default fallback response. Consider upgrading to Basic tier if AI response time is critical. See `references/ai-timeout-diagnosis.md` for the full diagnostic methodology and curl test patterns.

17g. **⚠ Repetitive/duplicate replies from overlapping static + AI fallback paths:** A common bug where a single inbound message produces multiple outbound replies. Root cause: static handler returns a greeting, but AI fallback ALSO returns a greeting for the same message, and webhook re-triggers create duplicates. **Symptom:** Screenshot shows 5-6 near-identical greeting messages from the bot for one inbound "hi". **Fix:** (1) Greeting detection must be in BOTH `_static_menu_handler()` AND `should_use_ai()` — return `False` for greetings so AI never processes them. (2) Add deduplication by `msg_id` with a 5-minute window. (3) Use canonical reply constants instead of generating variations. (4) Lower AI `temperature` to 0.3 and `max_tokens` to 150 for consistent output. See `references/reply-dedup-pattern.md` for the complete anti-duplicate architecture.

17h. **⚠ Meta App category for WhatsApp bots is "Messaging" not "Business":** When selecting an app category in Meta Developer Portal for a WhatsApp Bot, choose **Messaging** (not "Business and pages" or "Messenger bots for business"). "Messaging" is the correct category for apps whose primary function is sending/receiving messages via WhatsApp Business Platform. The "Messenger bots for business" category is specifically for Facebook Messenger bots, not WhatsApp.

17i. **⚠ Meta Data Deletion URL requirement:** Meta requires a Data Deletion Instruction URL for app review. This can be the same URL as your Privacy Policy page with an added section (Section 7.5) explaining how users can request data deletion. Include: contact methods (WhatsApp/email), expected response time (1-3 business days), deletion timeframe (30 days), and legal retention exceptions. Host on GitHub Pages alongside your Privacy Policy.

17j. **⚠ Meta App Review requires ALL fields filled before submission:** The "Currently Ineligible for Submission" error appears when any of these are missing: App icon (1024x1024), Privacy Policy URL, Category selection. Upload icon FIRST, fill URL, select category, then Save before attempting Submit for Review. The submission validation is strict — all three must be present simultaneously.

17k. **⚠ Tech Provider onboarding requires video documentation:** If you choose "Tech Provider" (instead of standard business app), Meta requires video evidence for: (1) `whatsapp_business_messaging` — video showing your app sending a message to a WhatsApp number, (2) `whatsapp_business_management` — video showing API call to create a message template. For single-business bots (your own repair shop), **choose standard app** to avoid this requirement. Tech Provider is only needed if you plan to onboard other businesses as clients.

17l. **⚠ Azure log streaming delay — `az webapp log tail` shows stale output:** The `az webapp log tail` command frequently shows old log entries and misses recent webhook activity. Symptom: you deploy new code but the log stream still shows output from the previous deployment. **Workaround:** Use `az webapp log download --log-file /tmp/app_logs.txt` to download all logs as a zip, then extract and read the `containerStream.log` files directly. Alternatively, access logs via Kudu API (`https://{app}.scm.azurewebsites.net/api/vfs/LogFiles/`) — but Kudu requires its own auth token. For real-time debugging, add explicit `log.info()` calls in your code and grep the downloaded log file.

17m. **⚠ OpenRouter model availability must be verified via API before deployment:** Model names from documentation may be deprecated or unavailable for your key tier. Symptom: `404 — No endpoints found for {model}` in logs, AI always falls back to default. **Diagnostic:** Before deploying, call `curl -s https://openrouter.ai/api/v1/models | python3 -m json.tool | grep -i "model_name"` and verify the exact model ID exists. Also call `curl -s https://openrouter.ai/api/v1/key` to check your key tier and available credits. Verify free models by actually submitting a completion request (not just listing). Recommended widely-available free models (Jul 2026): `nvidia/nemotron-3-super-120b-a12b:free`, `liquid/lfm-2.5-1.2b-instruct:free`. Set model via `OPENROUTER_MODEL` env var so it can be changed without code changes.

17n. **⚠ In-memory message deduplication pattern for webhook handlers:** To prevent duplicate replies when Meta re-delivers the same webhook event, implement a lightweight in-memory dedup dict keyed by `msg_id`:

```python
from datetime import datetime, timezone, timedelta

_processed_messages: dict[str, datetime] = {}
_DEDUP_WINDOW = 300  # 5 minutes

def _is_duplicate(msg_id: str) -> bool:
    now = datetime.now(timezone.utc)
    if msg_id in _processed_messages:
        elapsed = (now - _processed_messages[msg_id]).total_seconds()
        if elapsed < _DEDUP_WINDOW:
            return True
    _processed_messages[msg_id] = now
    # Cleanup old entries to prevent memory leak
    expired = [k for k, v in _processed_messages.items() if (now - v).total_seconds() > _DEDUP_WINDOW]
    for k in expired:
        del _processed_messages[k]
    return False
```

Call `_is_duplicate(msg_id)` at the top of `_process_message()` — return early if True. This is per-instance (resets on deploy) — for multi-instance, use Redis or DB-backed dedup.

17o. **⚠ HMAC signature verification with curl — JSON formatting and APP_SECRET issues:** When testing webhooks with `curl`, signature verification fails commonly due to: (1) APP_SECRET read from `.env` may have whitespace/leading zeros — always `repr()` the secret to verify; (2) JSON payload must be **compact** (no pretty-print, no newlines between fields) — `json.dumps(payload, separators=(',', ':'))` — pretty-printed JSON produces a different signature; (3) Writing payload to file then using `@/tmp/payload.json` is more reliable than inline `-d '...'` for large payloads. **Diagnostic pattern:**
```python
# Generate test signature
import hmac, hashlib
APP_SECRET = "exact_secret_from_env"  # Verify with repr()!
payload = json.dumps(data, separators=(',', ':')).encode()  # Compact JSON!
sig = hmac.new(APP_SECRET.encode(), payload, hashlib.sha256).hexdigest()
print(f"sha256={sig}")
```
If signature still fails, the APP_SECRET in Azure App Settings may differ from the one in `.env` — Azure env vars take precedence.

17p. **⚠ Python zipfile as `zip` command alternative:** The `zip` command may not be available on all servers (Azure App Service SSH, minimal Linux containers). Always use Python's `zipfile` module as a universal fallback. See `templates/deploy.py` for the complete universal deploy script and `references/zip-build-pattern.md` for exclusion rules, self-exclusion pitfalls, and the pre-flight verification checklist.
17q-old. **⚠ React SPA dashboard served from FastAPI — mount order and `__pycache__` pitfall:** When serving a React/Vite build from FastAPI alongside API routes + WebSocket, the mount order is critical: (1) `app.mount("/dashboard/assets", StaticFiles(...))` BEFORE (2) `@app.get("/dashboard/{full_path:path}")` catch-all. Both MUST be at module level (before `if __name__`) for gunicorn to load them. Guard mount with `if os.path.exists(path)` — return error JSON if missing, never crash. See `references/azure-startup-issues.md` §2 for the full pattern. Also: after updating source with new routes, ALWAYS `find . -name "__pycache__" -type d -exec rm -rf {} +` before restarting — stale `.pyc` files cause 404 on new routes while old routes still work.

17q. **⚠ Extended greeting detection for Malaysian WhatsApp bots:** Malaysian users use diverse greetings — BM formal, casual, English, Kelantan dialect. Static list of 4-6 greetings is insufficient. Use comprehensive detection:
```python
greetings_exact = [
    "hi", "hello", "hey", "halo", "hai", "helo", "hallo",
    "selamat pagi", "selamat petang", "selamat malam", "selamat tengahari",
    "assalamualaikum", "waalaikumsalam", "assalam", "salam",
    "apa khabar", "apa kabar", "howdy", "yo", "oi",
]
greetings_startswith = [
    "hi ", "hello ", "hey ", "halo ", "hai ", "selamat ",
    "assalam", "waalaikum", "good morning", "good evening",
    "apa khabar", "apa kabar",
]
def _is_greeting(msg_lower: str) -> bool:
    return msg_lower in greetings_exact or msg_lower.startswith(tuple(greetings_startswith))
```
This must exist in BOTH the static menu handler AND the AI `should_use_ai()` function to prevent duplicate greeting replies.

17r. **⚠ AI reply length guard for WhatsApp:** WhatsApp messages over ~500 chars get truncated and look unprofessional. Always validate AI output length before sending:
```python
def _is_too_long(text: str, max_len: int = 500) -> bool:
    return len(text) > max_len

# In generate_reply():
loop = asyncio.get_event_loop()
try:
    ai_reply = await loop.run_in_executor(None, ask_hermes, message, sender_name)
except Exception as e:
    log.error(f"AI exception: {e}", exc_info=True)
    ai_reply = None
if ai_reply and not _is_too_long(ai_reply):
    return ai_reply
# Fallback if AI output too long or AI failed
return CANONICAL_FALLBACK
```
Combine with `max_tokens=150` and `temperature=0.3` in the AI API call for consistent short output.

17t. **⚠ Sync I/O in async webhook handlers blocks the event loop:** When using FastAPI async handlers, calling synchronous file I/O (JSON read/write, SQLite) or `subprocess.run()` directly blocks the entire event loop — other webhook requests queue behind it. **Fix:** Wrap sync operations with `await loop.run_in_executor(None, sync_func, args)`. For subprocess, use `await asyncio.create_subprocess_exec()` with `await asyncio.wait_for(proc.communicate(), timeout=N)`. See `references/async-webhook-debugging.md` for complete patterns.

17t2. **⚠ `await` on sync function crashes webhook handler — silent message drop:** Calling `await sync_func(...)` where `sync_func()` is a regular `def` (not `async def`) raises `TypeError: 'str' object is not awaitable` (or similar). This is **not caught by any try/except** in the webhook route — it propagates to FastAPI's exception handler which returns HTTP 200 with `{"status": "ok"}` but **never sends a WhatsApp reply**. Symptom: menu items (1/2/3/4) work perfectly because they return before the AI call, but every free-text question gets silently dropped.

**Detection:** Cross-reference every `await X(...)` call against the function definition:

```bash
# List all async defs
grep -n "^async def " webhook_listener.py hermes_ai.py db_logger.py
# List all sync defs  
grep -n "^def " *.py | grep -v "^def __\|# "
# Find every await call
grep -n "await " webhook_listener.py
```

Any `await` call to a function listed only under `^def ` (not `^async def`) is a bug.

**Fix:** Wrap sync AI calls with `run_in_executor`:

```python
# BEFORE (broken — TypeError at runtime):
ai_reply = await ask_hermes(message, sender_name)

# AFTER (correct):
loop = asyncio.get_event_loop()
try:
    ai_reply = await loop.run_in_executor(None, ask_hermes, message, sender_name)
except Exception as e:
    log.error(f"AI exception: {e}", exc_info=True)
    ai_reply = None
```

See `references/async-webhook-debugging.md` § Pattern 5 for full diagnostic methodology. Also covered in `systematic-debugging` skill's `references/async-python-pitfalls.md`, Pattern 5.

17u. **⚠ Overly broad keyword triggers cause misrouting:** Single-word triggers like `"repair"`, `"job"`, `"status"`, `"contact"` match unintended messages (e.g., "battery repair shop near me" → Menu 1). **Fix:** Use multi-word phrases only: `"semak harga"`, `"status job"`, `"hubungi staff"`. Keep single-digit menu numbers (`"1"`, `"2"`) as the only single-character triggers. See `references/async-webhook-debugging.md` § Logic.

17v. **⚠ HMAC signature verification must NOT return True when APP_SECRET is empty:** `if not APP_SECRET: return True` silently disables all webhook signature verification. **Fix:** Return `False` when `APP_SECRET` is missing — reject all requests until properly configured. See `references/async-webhook-debugging.md` § Security.

17v2. **⚠ OCI Always Free = 1 region only, no fallback:** Always Free tenancies are locked to their home region. You CANNOT subscribe to additional regions (`TenantCapacityExceeded` error). If your home region's A1.Flex is out of capacity, you CANNOT fall back to Singapore/Japan — your only options are: (1) retry later, (2) use E2.1.Micro (AMD, different capacity pool), (3) upgrade to Pay-As-You-Go. **Before attempting OCI deployment, always verify your home region has capacity.**

17v3. **⚠ OCI non-admin users cannot launch instances:** If `oci compute instance launch` returns `NotAuthorizedOrNotFound` (404) even when all resources are confirmed available, the user likely isn't in the `Administrators` group. Non-admin users need IAM policies (`manage compute-instances`, `manage virtual-network-family`) which can ONLY be created through the Console UI (non-admins cannot call `oci iam policy create` via CLI). **Fix:** User must login to Console → Identity → Groups → add themselves to `Administrators`.

17w. **⚠ Azure startup.txt/start.sh MUST use Azure paths, not local paths:** Gunicorn startup scripts must `cd /home/site/wwwroot` (Azure path), NEVER local paths like `cd /home/hafizi145/.hermes/whatsapp-bot`. Local paths don't exist on Azure → app crashes with "No such file or directory". Also: `SCM_DO_BUILD_DURING_DEPLOYMENT=false` does NOT install pip packages — if you disable build, dependencies are never installed and the app crashes on import. Keep `SCM_DO_BUILD_DURING_DEPLOYMENT=true` for Python apps. If you need to deploy without build (e.g., only static files), ensure packages are pre-installed in a persistent virtual environment.

17ac. **⚠ Two Azure startup mechanisms can conflict — `STARTUP_COMMAND` app setting overrides `start.sh`:** Azure has TWO ways to start Python apps: (1) `appCommandLine` in site config (set via `--startup-file` or portal), and (2) `STARTUP_COMMAND` environment variable. **The `STARTUP_COMMAND` app setting takes precedence over `start.sh`.** If your `start.sh` has `--ws wsproto` but `STARTUP_COMMAND` still has the old command without it, the old command runs. **Best practice:** Keep them in sync — update BOTH `start.sh` in your repo AND `STARTUP_COMMAND` in Azure App Settings. Verify which one actually runs by checking logs after deploy:
```bash
az webapp config appsettings list -g <rg> -n <app> | grep STARTUP_COMMAND
```
If `STARTUP_COMMAND` is set, it overrides `start.sh`. Update it:
```bash
az webapp config appsettings set -g <rg> -n <app> --settings STARTUP_COMMAND="gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto"
```

17ad. **⚠ Azure Health Check is NOT configured by default:** Without `healthCheckPath` set, Azure considers your app unhealthy if the first request takes too long, and may restart it. **Fix:** After deployment, set `healthCheckPath` to your health endpoint:
```bash
az webapp config set -g <rg> -n <app> --generic-configurations '{"healthCheckPath": "/health"}'
```
This is a one-time config — survives deploys. Without it on Free tier, cold starts may trigger false unhealthy-restarts.

17ae. **⚠ SQLite on Azure uses ephemeral storage — data lost on restart/redeploy:** `/home/site/wwwroot/` is NOT persistent across container restarts (Azure may move your app to a different container). `bot_data.db` will be wiped. **For production:** Mount an Azure Files share to `/home/site/wwwroot/data/` and point `DB_PATH` there, OR migrate to Azure SQL/MySQL. **For dev/testing:** Accept data loss on restart, or add a startup script that backs up/restore from blob storage.

17ae1. **⚠ `bot_data.db` in deploy zip overwrites production DB:** Even if `bot_data.db` is gitignored, it still lives in the repo directory. When building the deploy zip with `os.walk('.')`, the local (stale/empty) DB gets uploaded and overwrites the production DB on Azure. **Always explicitly exclude `bot_data.db`** from the zip build: `if f in ('bot_data.db',): continue`. This is the #1 cause of "data disappeared after deploy" in SQLite-based Azure deployments.

17af. **⚠ Python zipfile must exclude `bot_data.db`, `deploy_*.zip`, `.backup/`:** The universal zipfile build pattern (pitfall 17p) needs these additional excludes: `if f in ('.env', 'deploy.zip', 'bot_data.db')`

**See `references/post-deploy-hardening.md`** for the complete post-deploy audit: health check verification, startup command duplicate detection, stale artifact cleanup, persistence risk matrix, known-good baseline template, and the official deploy command with all exclusions.

17ag. **⚠ Deployment recovery — do NOT delete/recreate without explicit approval:** When the site is unreachable (503, timeout, Application Error), follow the recovery sequence in `references/azure-deployment-recovery.md`. Key rules: (1) Report each step before executing, (2) stop and report exact error on failure — don't apply new fixes without review, (3) do NOT delete the web app unless all safer options fail, (4) do NOT delete the App Service plan or resource group, (5) do NOT change strategy mid-flow. The user wants the right answer fast, not a debate or autonomous fix cascade.

17z. **⚠ Deploying updated dashboard/dist to Azure without triggering rebuild:** Prefer `az webapp deploy --type zip --src-path dist.zip` over Kudu VFS API. VFS upload requires Kudu credentials which are always redacted by Azure CLI. If you must update only `dashboard/dist/`, deploy the full zip with `SCM_DO_BUILD_DURING_DEPLOYMENT=false` + `ENABLE_ORYX_BUILD=false` to skip Oryx build entirely. See `references/azure-kudu-vfs-deploy.md` for when VFS is the only option.

17aa. **⚠ `az webapp config appsettings set --settings KEY=VALUE` NULLIFIES all other settings:** This command REPLACES the entire settings collection with only what you pass. Existing keys not included become null. **ALWAYS** backup → modify → apply ALL settings at once. See `references/azure-settings-preservation.md` for the safe Python workflow and `references/azure-safe-update-workflow.md` for the exact CLI commands used in production.

17ab. **⚠ `az webapp deploy --type zip` on Linux App Service PRESERVES `appCommandLine`** — unlike Windows, Linux zip deploy does NOT reset the startup command. Do NOT proactively re-set `appCommandLine` after every Linux deploy — you risk conflicting with the working config. If `/health` works after deploy, `start.sh` is running correctly. Only re-set if `appCommandLine` is confirmed null via `az webapp config show --query appCommandLine`.

17ag. **⚠ WebSocket 403 is a FASTAPI TYPE ANNOTATION bug, NOT an Azure tier limitation or uvicorn bug:** WebSocket connections to `/ws` return HTTP 403 (not 404) with empty body. **Root cause:** When using `@app.websocket("/ws")`, the handler parameter **MUST** have a `WebSocket` type annotation: `async def websocket_endpoint(websocket: WebSocket):`. Without the annotation, FastAPI treats `websocket` as a **query parameter**, Pydantic validation fails ("Field required"), and FastAPI sends `websocket.close` with code 1008 — which uvicorn logs as HTTP 403. **Evidence:** (1) raw `curl` with Upgrade headers gets `HTTP 403 Forbidden` with `Content-Length: 0`, (2) the handler code NEVER executes, (3) middleware logging reveals `{'type': 'websocket.close', 'code': 1008, 'reason': [{'type': 'missing', 'loc': ['query', 'websocket'], 'msg': 'Field required'}]}`, (4) it reproduces locally with `uvicorn.run()` — no Azure involved. **Fix:** Add the `WebSocket` type annotation:
```python
# BEFORE (broken — 403):
@app.websocket("/ws")
async def websocket_endpoint(websocket):
    await websocket.accept()

# AFTER (fixed — works):
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
```
**Optional:** Add `--ws wsproto` to gunicorn startup for a more lightweight WebSocket implementation. This is NOT required for the fix but reduces dependencies.
**Never assume tier limitation** — always test locally first. See `references/websocket-debugging.md`.

17x. **⚠ Telegram DM topic stuck — cron job delivery anchor error:** Cron jobs with `deliver: "origin"` fail with "Telegram DM topic delivery requires a reply anchor" when the origin has a `thread_id`. **Fix:** Remove `thread_id` from cron job origin or set deliver to target the main chat explicitly. See `references/async-webhook-debugging.md` § Telegram DM Topic Debugging.

17s. **⚠ GitHub Pages hosting for Privacy Policy (Meta compliance):** Fastest way to host a Privacy Policy for Meta App Review:
```bash
# Create dedicated repo (lightweight, separate from bot code)
gh repo create hafjet-privacy --public --clone=false
cd hafjet-privacy
cp ../whatsapp-bot/privacy-policy.html index.html
git add index.html && git commit -m "feat: privacy policy" && git push origin main
# Enable Pages: Settings → Pages → Source: main branch → Save
# URL: https://<username>.github.io/hafjet-privacy/
```
Include in privacy policy: data collected, purpose, retention period, third-party sharing (Meta), PDPA mention, contact info, and Data Deletion section (Section 7.5) with contact methods and timeframe.

9. **⚠ Token regeneration changes permissions:** When you regenerate an Access Token (e.g., after adding a payment method), the new token may be associated with a different WABA. Always re-check Phone Number ID after token regeneration. The old Phone Number ID may not work with the new token. See `references/credential-debugging.md` for the full debugging flow.
10. **⚠ "Account not registered" (error code 133010):** If you get `(#133010) Account not registered` when calling `POST /v18.0/{phone_id}/messages`, it means the phone number is registered in the WABA but **the WhatsApp personal account for that number has been deleted or never existed**. The number needs an active WhatsApp account (personal or business app) that can receive messages. **Fix:** Register a different phone number that has an active WhatsApp account, or re-create the WhatsApp personal account for that number. This error is distinct from "Object does not exist" (error 100/33) which indicates a token/WABA mismatch.

11. **⚠ `business_management` scope may not be available:** Some Meta app configurations don't offer `business_management` in the System User token permission list. If it's not available, the token can still work with just `whatsapp_business_messaging` + `whatsapp_business_management`. Don't block on missing `business_management` — test the token with `debug_token` and proceed if `whatsapp_business_messaging` is present.

12. **⚠ Token length varies by type:** Permanent System User tokens can be ~200-300 chars. Shorter tokens (~203 chars) are NOT truncated — they're a valid format. Always verify token validity via `debug_token` endpoint, never by length alone.
## Tunneling / Deployment Options

### Heroku Eco (Fallback if Azure Fails)

If Azure credit is exhausted or subscription ends, Heroku Eco ($5/month) is covered by GitHub Student Pack $13/month credit for 24 months.

**Key notes:**
- Use `$PORT` (not hardcoded port) in Procfile
- SQLite is ephemeral on Heroku (lost on every deploy/restart) — use MongoDB Atlas for persistence
- `whitenoise` NOT needed — FastAPI StaticFiles natively
- Env var names must match exactly: `WHATSAPP_ACCESS_TOKEN` (not `WHATSAPP_TOKEN`), `VERIFY_TOKEN` (not `WEBHOOK_VERIFY_TOKEN`)

See `hafjet-deployment-plan` skill for the **exact** config vars, Procfile, and Meta webhook change steps.

### Azure App Service (Recommended for Production)

For a permanent, stable HTTPS endpoint without tunnel hassles, deploy to Azure App Service Free F1 tier. This is the **preferred production deployment** for WhatsApp bots.

**Advantages over ngrok:**
- Permanent URL: `https://[name].azurewebsites.net` (never changes)
- Auto SSL certificate
- No tunnel software needed
- Reliable webhook delivery from Meta
- Free tier sufficient for ~100 msgs/day

See `references/azure-deployment-guide.md` for the full deployment walkthrough.
See `references/azure-kudu-vfs-deploy.md` for updating just `dashboard/dist/` without triggering Python rebuild.
See `references/ngrok-free-tier-issues.md` for why ngrok free tier fails for Meta webhooks.

**Key gotcha:** Azure App Settings override `.env` values. The env var names in Azure must match what `webhook_listener.py` expects — use `APP_SECRET` (not `WHATSAPP_APP_SECRET`) and `VERIFY_TOKEN` (not `WEBHOOK_VERIFY_TOKEN`).

**Key gotcha:** The `zip` command may not be available on all servers. Use Python's `zipfile` module as a fallback (see azure-deployment-guide.md Step 7 Option B).

### Cloudflare Tunnel (NOT Recommended for Meta)

⚠️ Cloudflare Tunnel (`trycloudflare.com`) serves an interstitial page that **blocks Meta's webhook verification**. Do not use for production WhatsApp bots. Only suitable for non-Meta webhook testing.

### ngrok (Unreliable Free Tier, OK for Testing Only)

```bash
# Write config file directly (CLI add-authtoken may fail silently)
mkdir -p ~/.config/ngrok
cat > ~/.config/ngrok/ngrok.yml << 'EOF'
version: "2"
authtoken: YOUR_TOKEN_HERE
log_level: info
EOF
ngrok http 8443 --config ~/.config/ngrok/ngrok.yml
```

**⚠ ngrok free tier (`*.ngrok-free.dev`) is unreliable for Meta webhook delivery** — connections drop, webhook POST requests from Meta may silently not reach your server. Use only for initial testing. Migrate to Azure for production. See `references/ngrok-free-tier-issues.md`.

## Hybrid Webhook Pattern (AI + Static Menu + DB)

For advanced chatbots that combine static menus, database lookups, and AI:

```
User Message
    │
    ├─ Job ID / Receipt number? → Database lookup → Status reply
    │
    ├─ Static menu / greeting?  → _static_menu_handler() → Instant reply
    │
    └─ Everything else          → ask_hermes() → AI reply → Fallback
```
    msg_lower = message.lower().strip()
    
    # Static triggers — handle locally
    static_triggers = {"1", "2", "3", "4", "menu", "help", "/help", "bantu"}
    if msg_lower in static_triggers:
        return False
    
    # Job ID pattern — handle via DB lookup
    if msg_lower.startswith("job-") or msg_lower.startswith("receipt-"):
        return False
    
    # Short greetings — handle statically
    greetings = ["hi", "hello", "hey", "halo"]
    if msg_lower in greetings:
        return False
    
    # Everything else → AI
    return True
```

**Critical:** Greeting detection must exist in BOTH `_static_menu_handler()` AND `should_use_ai()`. If only in static handler, AI fallback still produces greeting replies → duplicates.

### Job ID Detection

```python
def _is_job_id(message: str) -> bool:
    cleaned = message.strip().upper().replace(" ", "")
    if cleaned.startswith("JOB-") and len(cleaned) >= 8:
        return True
    if cleaned.startswith("RECEIPT-") and len(cleaned) >= 12:
        return True
    # 3-5 digit numbers treated as short job IDs (not single digits like "1", "2")
    if cleaned.isdigit() and 3 <= len(cleaned) <= 5:
        return True
    return False
```

**Gotcha:** Single-digit numbers like `"1"`, `"2"` are menu selections, NOT job IDs. Require 3+ digits for numeric job IDs.

### AI Integration Module (`hermes_ai.py`)

Create a separate module for AI integration:

```python
SOUL_CONTEXT = """You are the [BUSINESS] WhatsApp assistant..."""

def ask_hermes(user_message: str, sender_name: str) -> Optional[str]:
    """Send to Hermes Agent Core. Returns reply or None on failure."""
    # Method 1: Try OpenRouter HTTP API
    # Method 2: Try local CLI fallback
    # Method 3: Return None (caller uses fallback)
```

**Key pattern:** Always have a fallback reply when AI fails — never leave the customer without a response.

### Database Integration Pattern

For job/status tracking, create a separate `repair_db.py` module:

```python
def check_repair_status(job_id: str) -> Optional[dict]:
    """Look up job by ID. Returns job dict or None."""
    # Normalize: uppercase, strip spaces
    # Try exact match, then partial match
    pass

def format_job_status(job: dict) -> str:
    """Format job dict into WhatsApp-friendly message."""
    pass
```

**Storage:** JSON file works for small scale (<1000 jobs). For production, migrate to SQLite/PostgreSQL.

### Full `generate_reply()` Pattern

```python
async def generate_reply(message: str, sender_name: str, sender_number: str) -> str:
    msg_lower = message.lower().strip()
    
    # Tier 1: Job ID check
    if _is_job_id(message):
        job = check_repair_status(message.strip().upper())
        if job:
            return format_job_status(job)
        return f"❌ Job tidak dijumpai: {message}"
    
    # Tier 2: Static menu
    reply = _static_menu_handler(msg_lower, sender_name, message)
    if reply:
        return reply
    
    # Tier 3: AI
    # ⚠ ask_hermes() is typically sync — never use `await` directly
    loop = asyncio.get_event_loop()
    try:
        ai_reply = await loop.run_in_executor(None, ask_hermes, message, sender_name)
    except Exception as e:
        log.error(f"AI exception: {e}", exc_info=True)
        ai_reply = None
    if ai_reply:
        return ai_reply
    
    # Fallback
    return "Terima kasih! Sila tulis *menu* untuk pilihan."
```

### Routing Logging Pattern

Log every message's routing decision to enable debugging:

```python
# In _process_message(), before calling generate_reply:
_routing = _detect_routing(user_message)
log.info(f"🔄 Routing: teks='{user_message}' → intent={_routing}")

reply_text = await generate_reply(user_message, sender_name, from_number)

# After receiving reply:
log.info(f"📤 Reply: intent={_routing}, latency={latency_ms}ms, fallback={reply_text == CANONICAL_FALLBACK}")
```

This produces the pattern:
```
🔄 Routing: teks='Malam ni bukak lagi ke' → intent=ai_query
🤖 Routing to Hermes AI: 'Malam ni bukak lagi ke'
📤 Reply: intent=ai_query, latency=1234ms, fallback=False
```

Use `_detect_routing()` function:
```python
def _detect_routing(message: str) -> str:
    msg_lower = message.lower().strip()
    if _is_greeting(msg_lower):    return "greeting"
    if msg_lower in static_menu:   return "static_menu"
    if _is_job_id(message):        return "job_status"
    return "ai_query"
```

### Standard Fallback Message

When AI fails or no valid response is generated, use this fallback:

```
Maaf, sistem sibuk sekejap. Untuk bantuan segera WhatsApp admin:
+60 16-980 8736 (https://hafjetraub.wasap.my/)
```

Store as `CANONICAL_FALLBACK` constant, not as a random string. Make it changeable via runtime settings: `get_runtime("fallback_message", CANONICAL_FALLBACK)`.

## Runtime Settings with In-Memory Cache

For operator-configurable bot behavior without redeploys, use a simple in-memory cache with TTL backed by a `bot_settings` key-value table. See `references/runtime-settings-cache.md` for the full pattern including:
- `_refresh_settings()` / `get_runtime()` / `get_runtime_int()` helpers
- `PUT /api/settings` with type validation
- Webhook integration (AI toggle, greeting/fallback messages, escalation keywords, dedup window)
- Manual operator reply (takeover) endpoint
- Classification: instant vs restart-only settings

## See Also

- `templates/start.sh` — **Azure-safe startup script template**: cd to `/home/site/wwwroot`, pip install at startup, `${WEBSITES_PORT}` binding, log to stdout/stderr. Replace `[BUSINESS]` placeholders. Use as `appCommandLine: start.sh`.
- `scripts/azure-deploy-verify.sh` — **Post-deployment verification**: checks app settings for nulls, verifies `appCommandLine`, probes all endpoints (`/health`, `/dashboard`, `/api/stats`, `/webhook`), confirms JS bundle loads. Run after every deploy.
- `references/azure-safe-update-workflow.md` — **Safe settings update workflow**: backup → diff → bulk-apply → verify, with exact commands for avoiding the settings-nulling pitfall.
- `references/azure-startup-issues.md` — **Azure startup issues**: SQLite DB path detection (`WEBSITE_SITE_NAME`), Vite `base: '/dashboard/'` for blank dashboard, StaticFiles mount failures, `init_db()` not running under gunicorn, startup probe timeouts (ContainerTimeout), log streaming delays, `__pycache__` stale routes, zip size explosion
- `references/azure-deployment-recovery.md` — **Deployment recovery sequence**: safest-first recovery from 503/timeout/Application Error, user workflow preferences (no delete without approval, report-before-execute, stop-on-error), ContainerTimeout diagnosis, `az webapp up` vs `az webapp deploy`, required app settings checklist
- `references/azure-subscription-throttle.md` — **Azure subscription throttle (429/51025)**: why it happens, why Retry-After is misleading, prevention rules (stop create/delete loops immediately), recovery options. Read BEFORE any plan create/delete operation.
- `references/oracle-cloud-deployment.md` — **Oracle Cloud A1.Flex deployment**: Always Free tier limits (2 OCPU/12 GB as of Jun 2026), Malaysia Kulai region preferred, full deployment steps, risk matrix
- `references/react-dashboard-pattern.md` — **React SPA dashboard served from FastAPI**: Vite config (`base: '/dashboard/'` required for subpath), WebSocket hook with reconnect, dark theme colors, message bubbles, empty states, mobile responsive pattern
- `references/websocket-debugging.md` — **WebSocket 403 root cause**: uvicorn `check_request` bug, NOT Azure tier limitation. Full diagnostic methodology, local reproduction steps, the fix, and the "never assume platform limitation" lesson.
- `references/post-deploy-hardening.md` — **Post-deployment hardening checklist**: health check verification, startup command duplicate detection, stale artifact cleanup, persistence risk matrix, known-good baseline template, pre-flight ZIP verification, safe deploy command, 10-minute post-deploy production gate
- `references/bounded-execution-workflow.md` — **Bounded execution for DevOps debugging**: when user sets max-action limits, stop conditions, or report-only mode — count every tool call, stop exactly at limit, report in exact format requested, distinguish blocked vs complete vs budget-exhausted
- `references/zip-build-pattern.md` — **ZIP build pattern**: Python `zipfile` fallback when `zip` unavailable, exclusion rules, self-exclusion pitfall, `.env.example` vs `.env`, pre-flight verification checklist
- `templates/deploy.py` — **Universal deploy ZIP builder (Python)**: replaces `zip` command, handles all exclusions, self-excludes, reports size/entries
- `templates/deploy.sh` — **One-shot deploy script**: builds clean ZIP (secrets excluded), deploys to Azure, validates `/health` after 60s warmup. Usage: `bash deploy.sh`
- `references/azure-kudu-vfs-deploy.md` — **Kudu VFS API for static file deployment**: Update `dashboard/dist/` on Azure without triggering Python rebuild (401/400 troubleshooting, auth pattern, bulk ZIP alternative)
- `references/azure-settings-preservation.md` — **Azure settings nulling pitfalls**: `az webapp config appsettings set` deletes other keys, `az webapp deploy` resets appCommandLine, Kudu creds always redacted — safe backup/modify/apply workflow
- `references/webhook-signature-testing.md` — **Webhook signature testing with curl**: Python-generated compact JSON signature pattern, file payload approach, dedup testing, common failures
- `references/oracle-cloud-deployment.md` — **Oracle Cloud A1.Flex deployment**: Always Free tier limits (2 OCPU/12 GB as of Jun 2026), Fly.io NOT free for new accounts, OCI snapshots quota-dependent (5 included), instance splitting options, full deployment steps, risk matrix
- `references/azure-deployment-guide.md` — **Azure App Service deployment** (recommended production target): Free F1 tier, permanent HTTPS URL, step-by-step CLI commands
- `references/azure-ai-integration.md` — **Azure-safe AI integration**: OpenRouter HTTP API pattern, env vars (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), graceful degradation, model recommendations, cost estimation. Use this when deploying any AI-powered WhatsApp bot to Azure.
- `references/publish-checklist.md` — **Meta App publish checklist**: Development → Live mode requirements, Privacy Policy hosting, Advanced Access, Business Verification, toggle Live
- `templates/privacy-policy.html` — **Privacy Policy HTML template**: Ready-to-customize template for Meta Publish requirement. Replace `[COMPANY_NAME]` placeholders, host on GitHub Pages. Includes PDPA 2010 compliance sections
- `references/reply-dedup-pattern.md` — **Anti-duplicate reply architecture**: greeting detection in both layers, canonical constants, msg_id deduplication (5-min window), AI output constraints, routing priority order
- `references/operator-actions.md` — **Operator dashboard actions backend**: SQLite migration pattern (try/except ALTER), resolve/escalate/note/handoff endpoints, status tracking, WebSocket broadcast, settings API with type validation, POST JSON body pattern for optional fields
- `references/async-webhook-debugging.md` — **Async webhook audit**: Security (signature bypass), performance (event loop blocking from sync I/O & subprocess), logic (overly broad keyword triggers), Telegram DM topic debugging (session IDs, flood control, cron delivery anchor errors)
- `references/security-hardening-audit.md` — **Security hardening audit**: Rate limiting (sliding window middleware), dashboard API auth (X-API-Key header), webhook signature fail-closed fix, structured JSON logging with phone/token masking, security event spike alerting, prioritized P1-P4 checklist
- `references/meta-review-answers.md` — **Copy-paste ready Meta review answers**: Use case descriptions and data usage explanations for `whatsapp_business_messaging` and `whatsapp_business_management` permissions
- `references/credential-debugging.md` — Full credential debugging flow: token validation, WABA/Phone ID mismatch diagnosis, safe .env token writing patterns, and **shell environment variable override detection** (the #1 silent failure)
- `references/missing-file-safety-audit.md` — Missing-file crash risk audit: which files the bot references, whether missing files cause 500, and confirmation that free chat depends only on OpenRouter HTTP API (no external knowledge files)
- `references/shell-quoting-workaround.md` — Shell quoting patterns for tokens with special chars, **shell env var override fix**, and the 3-step token write pattern
- `references/system-user-token-guide.md` — Step-by-step System User token generation (the correct way to get a permanent WhatsApp token)
- `references/hybrid-webhook-template.py` — Full working FastAPI webhook with hybrid AI routing, job ID detection, and database integration pattern
- `references/meta-setup-checklist.md` — Step-by-step Meta Developer Portal setup
- `references/ngrok-setup-guide.md` — Ngrok installation, auth token config, and tunnel management (testing only — unreliable for production)
- `references/meta-app-category.md` — Meta App category selection for WhatsApp bots (Messaging, not Business), required fields, Data Deletion URL requirement
- `references/tech-provider-vs-standard.md` — Tech Provider vs Standard App decision tree: when to use each, video documentation requirements for Tech Provider, recommendation for single-business bots
- `business-api-integration` — General API integration patterns, credential security, pagination

---

## Azure Oryx Python Deployment — Critical Findings (2026-06-28)

### Oryx Deletes `.py` Source from `/home/site/wwwroot`

**Finding:** After Oryx build, `/home/site/wwwroot/` contains ONLY `output.tar.zst`, `oryx-manifest.toml`, `requirements.txt`, `hostingstart.html`. **NO `.py` source files.** Oryx packs everything into `output.tar.zst`, deletes originals, extracts to `/tmp/<random>/` at each cold start.

**Implication:** `start.sh` CANNOT assume files are in `/home/site/wwwroot`. Must use `find` to locate the app dynamically:

```bash
APP_FILE=$(find /tmp /home -name "webhook_listener.py" 2>/dev/null | head -1)
APP_DIR=$(dirname "$APP_FILE")
export PYTHONPATH="$APP_DIR:$PYTHONPATH"
cd "$APP_DIR"
exec python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --chdir "$APP_DIR" --bind 0.0.0.0:8000 --timeout 120 --access-logfile - --error-logfile -
```

### Missing Source Files in ZIP

**Finding:** Any `.py` file not explicitly included in the deploy zip will be absent at runtime. `hermes_ai.py` was missing → `ModuleNotFoundError: No module named 'hermes_ai'` even though `webhook_listener.py` was found.

**Fix:** Include ALL `.py` files in the zip build, not just a hardcoded list:
```python
for f in os.listdir('.'):
    if f.endswith('.py') and f not in ('.env', 'bot_data.db'):
        zf.write(f, f)
```

### Debugging Methodology

When Azure App Service Linux returns 503 after successful Oryx build:
1. Use `az webapp log startup show` (NOT `az webapp log tail` — crashes reset the stream)
2. Add diagnostic `echo` + `ls` + `find` to `start.sh` to capture runtime state
3. The startup log captures ALL stdout from the container — use it as your primary debug channel
4. Look for `ContainerStream:` lines with your diagnostic output
5. Fix ONE error at a time — the first `ModuleNotFoundError` is the real blocker; subsequent errors are cascades

### SQLite DB Persistence — Use `/home/data/` NOT `/home/site/wwwroot/`

`/home/site/wwwroot/` is ephemeral — Oryx wipes it on every deploy. Use `/home/data/` for persistent storage (survives restarts and redeploys). See `references/azure-db-persistence.md` for the code pattern, migration notes, and the `bot_data.db` zip exclusion rule.

### Bounded Execution for DevOps Tasks

When the user sets explicit limits ("max N actions", "stop after X", "report only"):
1. Count every tool call as one action — batch independent calls to conserve budget
2. Stop EXACTLY at the limit — do not start the next step
3. Report in the EXACT format requested — no preamble, no unsolicited recommendations
4. Distinguish: **complete** (goal reached) vs **blocked** (exact error) vs **budget exhausted** (findings so far + next step)
5. See `references/bounded-execution-workflow.md` for the full pattern
