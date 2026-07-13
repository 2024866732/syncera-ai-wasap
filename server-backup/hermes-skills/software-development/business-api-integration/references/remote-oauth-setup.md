# Remote/Headless Server OAuth Setup

When Hermes runs on a remote server (Azure, AWS, Oracle) and the user's browser is on a different device (phone, laptop), standard OAuth browser redirects to `localhost` fail. This reference covers workarounds.

## Problem

OAuth flows redirect to `http://localhost:PORT/callback`. On a remote server:
- User's browser tries to connect to `localhost` on THEIR machine, not the server
- Browser hangs indefinitely or shows connection error
- The authorization code never reaches the agent

## Solution 1: OAuth Playground (Google Workspace)

For Google APIs, use OAuth Playground to exchange auth code for tokens without browser redirect:

1. Open: `https://developers.google.com/oauthplayground/`
2. Click **Settings** (gear icon) → Tick **"Use your own OAuth credentials"**
3. Enter OAuth client ID and secret from Google Cloud Console
4. Select required scopes (Gmail, Calendar, Drive, etc.)
5. Click **"Authorize APIs"** → Sign in → Allow
6. Click **"Exchange authorization code for tokens"**
7. Copy **Refresh Token** and **Access Token**

### Create Token File Manually

Save to `~/.hermes/google_token.json`:

```json
{
  "access_token": "ya29...",
  "refresh_token": "1//0...",
  "token_uri": "https://oauth2.googleapis.com/token",
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "scopes": [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive"
  ]
}
```

## Solution 2: xurl --headless (X/Twitter)

For X/Twitter OAuth, use the `--headless` flag:

```bash
# Register app (user runs this)
xurl auth apps add my-app --client-id CLIENT_ID --client-secret CLIENT_SECRET

# Authenticate with headless mode
xurl auth oauth2 --app my-app --headless

# Server prints authorization URL
# User opens URL in browser on their device
# After authorize, browser redirects but fails to load
# User copies URL from address bar (has code= parameter)
# User pastes URL back in terminal

# Set default
xurl auth default my-app
```

## Common Pitfalls

### IP Addresses Not Allowed as Redirect URIs

Google OAuth does NOT allow raw IP addresses (e.g., `http://52.237.113.23:8080`) as redirect URIs. Google will show error:

> "The redirect URI in the request, http://52.237.113.23:8080, does not match any of the registered redirect URIs."

**Solution:** Use domain names only, or use `http://localhost:1` with OAuth Playground workaround.

### Testing Mode Requires Test Users

If OAuth app is in "Testing" state in Google Cloud Console, token refresh fails with `unauthorized_client` error.

**Fix:** Add user's email as test user at `https://console.cloud.google.com/auth/audience`

### iPhone/Mobile Browser Limitations

- No F12/DevTools to inspect network requests
- Cannot easily extract redirect URL from failed page load
- Safari may not show URL bar clearly after redirect fails

**Workaround:** Use OAuth Playground (Solution 1) or guide user to copy URL from address bar after pressing Escape/X to stop loading.

### App Password Spaces (Gmail/Himalaya)

Gmail displays App Passwords with spaces (e.g., `abcd efgh ijkl mnop`), but the actual password is 16 characters WITHOUT spaces. Always strip spaces before saving to credential file.

### OAuth Client Type Matters

| Type | When to Use | Notes |
|------|-------------|-------|
| Desktop app | Agent on same machine as browser | Standard localhost redirect |
| Web application | Agent on remote server | Need OAuth Playground workaround |

## Security Reminders

1. **Never share credentials in chat** - User may paste API keys/tokens in conversation
2. **Store credentials in files** with `chmod 600` - Not in code, `.env` tracked by git, or chat history
3. **Use `cat` command for credential files** - Reference via `backend.auth.cmd = "cat ~/.path/to/credential"` in config
4. **Regenerate if exposed** - If credentials shared in chat, advise user to regenerate after setup

## Debugging

```bash
# Test Google token refresh
curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "refresh_token=YOUR_REFRESH_TOKEN" \
  -d "grant_type=refresh_token"

# Expected: {"access_token": "ya29...", "expires_in": 3599, ...}
# Error: {"error": "unauthorized_client"} = test user not added or app not published
```
