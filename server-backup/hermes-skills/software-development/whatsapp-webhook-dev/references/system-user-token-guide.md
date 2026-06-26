# WhatsApp Cloud API — System User Token Generation

## When to Use This Guide

Use this when:
- You need a **permanent** (non-expiring) WhatsApp Cloud API access token
- Your current token has wrong scopes (e.g., only `public_profile`)
- You're setting up a new WhatsApp bot from scratch
- Token regeneration broke your existing setup

## Steps to Generate a System User Token

### Prerequisites
- Meta Business Suite account
- A Meta app with WhatsApp product added (e.g., "HAFJET Automation Engine")
- A registered phone number in the WABA

### Step-by-Step

1. **Go to Business Settings**
   - Visit [business.facebook.com/settings](https://business.facebook.com/settings)
   - Or: Meta Business Suite → Settings → Business Settings

2. **Navigate to System Users**
   - Left sidebar → **System Users** (under "Users" section)

3. **Create a System User**
   - Click **Add** button (upper-right)
   - Enter a name (e.g., "HAFJET Bot")
   - Select role: **Admin** or **Employee**
   - Click **Create**

4. **Assign App Access**
   - Select the newly created system user
   - Click **Assign Assets**
   - In the left panel, select **Apps**
   - Find and select your app (e.g., `HAFJET Automation Engine`)
   - Toggle **"Manage WhatsApp Business accounts"** to ON
   - Click **Assign assets**

5. **Generate Token**
   - Click **Generate token** button
   - Select the app if prompted
   - **Select these permissions:**
     - ✅ `business_management`
     - ✅ `whatsapp_business_messaging`
     - ✅ `whatsapp_business_management`
   - Click **Generate**
   - **Copy the token immediately** (you won't see it again)

   **Note:** `business_management` may not appear in the permission list for some app configurations. If it's missing, don't worry — the token works with just `whatsapp_business_messaging` + `whatsapp_business_management`. After generating, verify with `debug_token` that `whatsapp_business_messaging` is in the scopes.

6. **Verify Token**
   ```python
   import urllib.request, json

   token = "EAAdm4..."  # paste your token
   url = f"https://graph.facebook.com/v18.0/debug_token?input_token={token}&access_token={token}"
   req = urllib.request.Request(url)
   resp = urllib.request.urlopen(req, timeout=15)
   result = json.loads(resp.read().decode())
   data = result.get("data", {})

   print(f"Valid: {data.get('is_valid')}")
   print(f"Type: {data.get('type')}")  # Should be SYSTEM_USER
   print(f"Scopes: {data.get('scopes')}")  # Should include whatsapp_business_messaging
   ```

## What NOT to Use

| Source | Scopes | Permanent? | Works? |
|--------|--------|-----------|--------|
| Graph API Explorer | `public_profile` only | No | No |
| WhatsApp → API Setup → "Generate Access Token" (temporary) | WhatsApp scopes | Expires ~24h | Temporary only |
| System User → Generate Token | WhatsApp scopes | Permanent | Yes |

## Troubleshooting

- **"Object does not exist"** → Token scopes are wrong (likely `public_profile` only). Generate System User token.
- **Token works but can't list phone numbers** → Token type is `USER` not `SYSTEM_USER`. Use System User token.
- **Token expired** → System User tokens don't expire. If it expired, it was a temporary token.
- **App not found in Assign Assets** → Make sure the app has WhatsApp product added (Developer Portal → Add Product → WhatsApp)
