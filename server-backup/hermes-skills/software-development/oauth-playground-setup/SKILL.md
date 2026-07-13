---
name: oauth-playground-setup
description: "Google OAuth setup via OAuth Playground for iPhone/remote server users where localhost redirect fails."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows, ios]
metadata:
  hermes:
    tags: [oauth, google, oauth-playground, remote, iphone, authentication]
    related_skills: [google-workspace, himalaya]
---

# OAuth Playground Setup — For iPhone / Remote Server Users

When the user is on **iPhone or a remote server** without localhost redirect
capability, the standard `--auth-url` → `--auth-code` flow fails because
the browser can't redirect to `http://localhost:1` (no local server listening).

**Use this skill when:**
- User is on iPhone/iPad (no F12/DevTools, no localhost redirect)
- User is on a remote server without browser access
- Standard OAuth redirect flow hangs or times out

## Setup Flow

### Step 1: Create OAuth Client (if not done)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create project → Enable APIs (Gmail, Calendar, Drive, Sheets, Docs, People)
3. Configure consent screen (External, add test user email)
4. Create OAuth client (Desktop app or Web app)
5. Download JSON → save to `~/.hermes/google_client_secret.json`

### Step 2: Add OAuth Playground Redirect URI

In Google Cloud Console → Credentials → Edit app → Authorized redirect URIs:
- Add: `https://developers.google.com/oauthplayground`
- Save

### Step 3: Publish App

In OAuth Consent Screen → Click "Publish App" → Confirm.
(App must be in "Production" for refresh tokens to work.)

### Step 4: Use OAuth Playground

1. Open `https://developers.google.com/oauthplayground/`
2. Click **gear icon** (Settings) → tick **"Use your own OAuth credentials"**
3. Enter Client ID and Client Secret
4. Select scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/documents`
5. Click **"Authorize APIs"** → select account → Allow
6. Click **"Exchange authorization code for tokens"**
7. Copy **Refresh Token** from response

### Step 5: Build Token File

Create `~/.hermes/google_token.json`:

```json
{
  "access_token": "<from playground>",
  "refresh_token": "<from playground>",
  "token_uri": "https://oauth2.googleapis.com/token",
  "client_id": "<user's client_id>",
  "client_secret": "<user's client_secret>",
  "scopes": ["<list>"]
}
```

```bash
chmod 600 ~/.hermes/google_token.json
```

### Step 6: Verify

```bash
GSETUP="python ${HERMES_HOME:-$HOME/.hermes}/skills/productivity/google-workspace/scripts/setup.py"
$GSETUP --check
```

Should print `AUTHENTICATED`.

## Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| `unauthorized_client` on refresh | Token bound to wrong client (Playground's default) | Re-do OAuth with "Use your own credentials" ticked |
| `redirect_uri_mismatch` | Playground URI not in authorized list | Add `https://developers.google.com/oauthplayground` to redirect URIs |
| `unauthorized_client` even after auth | App still in "Testing" mode | Publish app in OAuth consent screen |
| Page hangs after "Continue" | iPhone/remote can't reach localhost:1 | Use this OAuth Playground flow instead |
| `invalid_client` | Wrong client_id/secret | Verify credentials match Google Cloud Console |

## References

- [Google OAuth Playground](https://developers.google.com/oauthplayground/)
- [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
- [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
