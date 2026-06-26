# WhatsApp Cloud API Credential Debugging

When you get `"Object with ID 'XXX' does not exist, cannot be loaded due to missing permissions"`, follow this flow.

## Step 0: Check Shell Environment Variables (Do This FIRST!)

Before debugging tokens and permissions, **always check if shell environment variables are overriding your `.env` file**:

```bash
echo "WHATSAPP_PHONE_ID env: $WHATSAPP_PHONE_ID"
echo "WHATSAPP_ACCESS_TOKEN env: ${WHATSAPP_ACCESS_TOKEN:0:20}..."
echo "APP_SECRET env: $APP_SECRET"
```

If any of these print values, they are set in the shell and **will override** `.env` file values at runtime. This is a **silent failure** — the app starts without errors, `.env` looks correct, but all API calls use stale credentials.

**Real-world example:** HAFJET WhatsApp Bot v2.0 had `WHATSAPP_PHONE_ID=1207630379099331` stuck in the shell env from a previous session. Even after updating `.env` to the correct ID `1089032617637482`, all API calls used the old ID, producing `Object with ID '1207630379099331' does not exist`. Debugging the token/permission was futile — the value in `.env` was never being read.

**Fix in code (permanent):**
```python
for _k in ("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID",
           "APP_SECRET", "VERIFY_TOKEN"):
    os.environ.pop(_k, None)
load_dotenv(os.path.expanduser("~/.hermes/whatsapp-bot/.env"), override=True)
```

**Fix in shell (temporary):**
```bash
unset WHATSAPP_PHONE_ID WHATSAPP_ACCESS_TOKEN APP_SECRET
```

## Step 0.5: Check Token Scopes

Before debugging phone ID or WABA mismatches, **always check token scopes**. This is the most common root cause.

```python
import urllib.request, json

token = load_env_token(".env", "WHATSAPP_ACCESS_TOKEN")

url = f"https://graph.facebook.com/v18.0/debug_token?input_token={token}&access_token={token}"
req = urllib.request.Request(url)
resp = urllib.request.urlopen(req, timeout=15)
result = json.loads(resp.read().decode())
data = result.get("data", {})

print(f"App ID: {data.get('app_id')}")
print(f"App Name: {data.get('application')}")
print(f"Type: {data.get('type')}")
print(f"Valid: {data.get('is_valid')}")
print(f"Scopes: {data.get('scopes')}")
```

**Critical scope check:**

| Scopes | Meaning | Can send messages? |
|--------|---------|-------------------|
| `['public_profile']` only | Graph API Explorer / Facebook Login token | ❌ NO |
| `['whatsapp_business_messaging', 'whatsapp_business_management', 'business_management']` | System User token with WhatsApp permissions | ✅ YES |
| `['whatsapp_business_messaging']` | User token with WhatsApp scope | ✅ YES (limited) |

**If scopes are `['public_profile']` only → token is WRONG.** You need to generate a proper System User token:

### How to Generate a System User Token (Permanent)

1. Go to **Meta Business Suite** → **Business Settings** → **System Users** (sidebar)
2. Click **Add** → create a new system user (e.g., "HAFJET Bot")
3. Select the new user → click **Assign Assets**
4. Select your app (e.g., `HAFJET Automation Engine`) → toggle **"Manage WhatsApp Business accounts"** under Full control → click **Assign assets**
5. Click **Generate token**
6. Select these permissions:
   - ✅ `business_management`
   - ✅ `whatsapp_business_messaging`
   - ✅ `whatsapp_business_management`
7. Copy the token (~250-300 chars)

**Do NOT use tokens from:**
- Graph API Explorer (these only have `public_profile`)
- Temporary tokens from WhatsApp → API Setup (these expire quickly)
- Tokens generated from a different app than the one owning the WABA

## Step 1: Verify Token Validity

```python
import urllib.request, json

token = load_env_token(".env", "WHATSAPP_ACCESS_TOKEN")

url = f"https://graph.facebook.com/v18.0/debug_token?input_token={token}&access_token={token}"
req = urllib.request.Request(url)
resp = urllib.request.urlopen(req, timeout=15)
result = json.loads(resp.read().decode())
data = result.get("data", {})

print(f"App ID: {data.get('app_id')}")
print(f"App Name: {data.get('application')}")
print(f"Type: {data.get('type')}")
print(f"Valid: {data.get('is_valid')}")
print(f"Scopes: {data.get('scopes')}")
```

**Key fields:**
- `is_valid: true` → token is not expired
- `type: USER` → user token (limited querying ability)
- `type: SYSTEM_USER` → system user token (can query business assets)
- Scopes must include `whatsapp_business_messaging`

## Step 2: Identify the Mismatch

If token is valid AND has correct scopes, but `GET /v18.0/{phone_id}/messages` still returns error 100 subcode 33:

| Symptom | Likely Cause |
|---------|-------------|
| Phone ID not found | Phone number registered under different WABA/app |
| WABA ID not found | WABA belongs to different Business Manager |
| Token valid but no access | App not assigned to WABA in Business Settings |
| Scopes = `['public_profile']` only | Wrong token type (see Step 0) |
| Error 133010 "Account not registered" | Phone number registered in WABA but WhatsApp personal account deleted (see below) |

## Step 3: Resolution Path

1. Go to **Meta Business Suite** → **Business Settings** → **Accounts** → **WhatsApp Accounts**
2. Select the WABA → check **Apps** section
3. Ensure your app (e.g., `HAFJET Automation Engine`) is listed with **Full Access**
4. If not: **Add** → search for app → grant permissions
5. Go to **WhatsApp → API Setup** in Developer Portal → note the Phone Number ID shown there
6. Use THAT Phone Number ID with the token from the same app

## Step 4: After Token Regeneration

When you regenerate an Access Token (e.g., after adding a payment method):
- The new token may be associated with a **different WABA**
- Always re-check Phone Number ID from WhatsApp → API Setup
- Old Phone Number IDs may not work with the new token
- Run `debug_token` again to confirm app ID hasn't changed
- **Re-check scopes** — regenerated tokens sometimes lose WhatsApp permissions

## Common ID Confusion

| ID | Example | Used For |
|----|---------|----------|
| Phone Number ID | `1207630379099331` | Send messages: `POST /v18.0/{phone_id}/messages` |
| WABA ID | `1330973725095827` | Account-level operations |
| App ID | `2083444095854295` | App-level operations, token generation |
| Business Manager ID | `...` | Business-level settings |

**All must be from the same Meta app.** Mixing IDs from different apps causes permission errors.

## Python .env Parsing for Tokens with `=`

Tokens containing `=` break simple shell extraction. Use Python:

```python
def load_env_token(env_path, key):
    with open(env_path, 'r') as f:
        for line in f:
            s = line.strip()
            if s.startswith(key + "="):
                return s.split("=", 1)[1]
    return None

token = load_env_token("/home/user/.hermes/.env", "WHATSAPP_ACCESS_TOKEN")
```

**Never use `sed` to update tokens with `=` in `.env`** — sed interprets `=` as regex delimiter. Use Python file manipulation instead.

## Writing Tokens to .env Safely

When writing tokens containing `=`, `'`, `}`, `*` to `.env`:

```python
import re

new_token = "EAAdm4...ZD"  # from user or file

with open('.env', 'r') as f:
    content = f.read()

# Use re.sub with escaped pattern
content = re.sub(
    r'WHATSAPP_ACCESS_TOKEN=.*',
    'WHATSAPP_ACCESS_TOKEN=' + new_token,
    content
)

with open('.env', 'w') as f:
    f.write(content)
```

**Avoid:** shell `echo`, `sed`, `awk` for tokens with special characters.
**Avoid:** Python f-strings containing the token value (braces `}` in token break f-string parsing).

## Error 133010: "Account not registered"

**Symptom:** `POST /v18.0/{phone_id}/messages` returns `(#133010) Account not registered`

**Root Cause:** The phone number is registered and verified in the WABA, but the **WhatsApp personal account for that number has been deleted** (or never existed). The number appears in the WABA phone number list with `code_verification_status: VERIFIED`, but messages cannot be sent because there's no active WhatsApp account to receive them.

**How to confirm:**
1. Check that the phone number appears in `GET /v18.0/{waba_id}/phone_numbers` — if it does, the number IS registered
2. Check that `debug_token` shows correct scopes — if it does, the token IS valid
3. If both are true but you still get 133010, the WhatsApp personal account is the issue

**Fix:**
- **Option A:** Re-create the WhatsApp personal account for that number (install WhatsApp, verify with the same phone number)
- **Option B:** Register a different phone number in the WABA that has an active WhatsApp account
- **Option C:** Use the WhatsApp Business app instead of the personal app for that number

**Note:** This error is distinct from:
- Error 100/33 "Object does not exist" → token/WABA mismatch
- Error 100 "Missing Permission" → token lacks required scopes

## Using urllib.request for API Calls (Avoids Token Quoting Issues)

When tokens contain special characters (`=`, `'`, `}`, `*`), `urllib.request` with string concatenation is more reliable than `requests` or `httpx`:

```python
import urllib.request, json

# Send message — urllib handles token safely
url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
payload = {
    "messaging_product": "whatsapp",
    "to": to_number,
    "type": "text",
    "text": {"body": message}
}
data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(url, data=data, method='POST')
req.add_header("Authorization", "Bearer " + token)  # string concat, no quoting issues
req.add_header("Content-Type", "application/json")
resp = urllib.request.urlopen(req, timeout=15)
result = json.loads(resp.read().decode())
```

**Why:** `requests` library may re-encode or mishandle headers with special characters. `urllib.request` with explicit `add_header()` and string concatenation (`"Bearer " + token`) avoids all quoting/escaping issues.

If token is valid but `GET /v18.0/{phone_id}/messages` returns error 100 subcode 33:

| Symptom | Likely Cause |
|---------|-------------|
| Phone ID not found | Phone number registered under different WABA/app |
| WABA ID not found | WABA belongs to different Business Manager |
| Token valid but no access | App not assigned to WABA in Business Settings |

## Step 3: Resolution Path

1. Go to **Meta Business Suite** → **Business Settings** → **Accounts** → **WhatsApp Accounts**
2. Select the WABA → check **Apps** section
3. Ensure your app (e.g., `HAFJET Automation Engine`) is listed with **Full Access**
4. If not: **Add** → search for app → grant permissions
5. Go to **WhatsApp → API Setup** in Developer Portal → note the Phone Number ID shown there
6. Use THAT Phone Number ID with the token from the same app

## Step 4: After Token Regeneration

When you regenerate an Access Token (e.g., after adding a payment method):
- The new token may be associated with a **different WABA**
- Always re-check Phone Number ID from WhatsApp → API Setup
- Old Phone Number IDs may not work with the new token
- Run `debug_token` again to confirm app ID hasn't changed

## Common ID Confusion

| ID | Example | Used For |
|----|---------|----------|
| Phone Number ID | `1207630379099331` | Send messages: `POST /v18.0/{phone_id}/messages` |
| WABA ID | `1330973725095827` | Account-level operations |
| App ID | `2083444095854295` | App-level operations, token generation |
| Business Manager ID | `...` | Business-level settings |

**All must be from the same Meta app.** Mixing IDs from different apps causes permission errors.

## Python .env Parsing for Tokens with `=`

Tokens containing `=` break simple shell extraction. Use Python:

```python
def load_env_token(env_path, key):
    with open(env_path, 'r') as f:
        for line in f:
            s = line.strip()
            if s.startswith(key + "="):
                return s.split("=", 1)[1]
    return None

token = load_env_token("/home/user/.hermes/.env", "WHATSAPP_ACCESS_TOKEN")
```

**Never use `sed` to update tokens with `=` in `.env`** — sed interprets `=` as regex delimiter. Use Python file manipulation instead.

## Writing Tokens to .env Safely

When writing tokens containing `=`, `'`, `}`, `*` to `.env`:

```python
import re

new_token = "EAAdm4...ZD"  # from user or file

with open('.env', 'r') as f:
    content = f.read()

# Use re.sub with escaped pattern
content = re.sub(
    r'WHATSAPP_ACCESS_TOKEN=.*',
    'WHATSAPP_ACCESS_TOKEN=' + new_token,
    content
)

with open('.env', 'w') as f:
    f.write(content)
```

**Avoid:** shell `echo`, `sed`, `awk` for tokens with special characters.
**Avoid:** Python f-strings containing the token value (braces `}` in token break f-string parsing).

## Error 133010: "Account not registered"

**Symptom:** `POST /v18.0/{phone_id}/messages` returns `(#133010) Account not registered`

**Root Cause:** The phone number is registered and verified in the WABA, but the **WhatsApp personal account for that number has been deleted** (or never existed). The number appears in the WABA phone number list with `code_verification_status: VERIFIED`, but messages cannot be sent because there's no active WhatsApp account to receive them.

**How to confirm:**
1. Check that the phone number appears in `GET /v18.0/{waba_id}/phone_numbers` — if it does, the number IS registered
2. Check that `debug_token` shows correct scopes — if it does, the token IS valid
3. If both are true but you still get 133010, the WhatsApp personal account is the issue

**Fix:**
- **Option A:** Re-create the WhatsApp personal account for that number (install WhatsApp, verify with the same phone number)
- **Option B:** Register a different phone number in the WABA that has an active WhatsApp account
- **Option C:** Use the WhatsApp Business app instead of the personal app for that number

**Note:** This error is distinct from:
- Error 100/33 "Object does not exist" → token/WABA mismatch
- Error 100 "Missing Permission" → token lacks required scopes
