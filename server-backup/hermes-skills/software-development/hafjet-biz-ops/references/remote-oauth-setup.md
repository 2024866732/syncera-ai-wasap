# Remote OAuth Setup Patterns

## Problem
When running Hermes on a remote server (no local browser), standard OAuth
redirect flows fail because `http://localhost:1` is unreachable from the
user's device.

## Solution: OAuth Playground

For any OAuth provider that supports it (Google, etc.):

### Google OAuth via Playground

1. Create **Web app** OAuth client (NOT Desktop)
2. Add `https://developers.google.com/oauthplayground` as redirect URI
3. Use OAuth Playground to authorize and get refresh token
4. Save token manually to `~/.hermes/google_token.json`
5. **Publish the app** (Testing mode blocks refresh tokens)

### Key Pitfalls

| Pitfall | Fix |
|---------|-----|
| IP addresses blocked as redirect URIs | Use domain URIs only (OAuth Playground) |
| `unauthorized_client` on refresh | App in "Testing" mode → Publish it |
| iPhone Safari stuck loading | Expected — use OAuth Playground |
| `redirect_uri_mismatch` | URI must match exactly (case-sensitive) |

### Token Format

```json
{
  "access_token": "ya29...",
  "refresh_token": "1//04...",
  "token_uri": "https://oauth2.googleapis.com/token",
  "client_id": "WEB_APP_CLIENT_ID",
  "client_secret": "WEB_APP_CLIENT_SECRET",
  "scopes": ["https://www.googleapis.com/auth/..."]
}
```

## For Other Providers

Similar pattern: find their OAuth Playground or use device code flow
if available. Always check if the provider allows refresh tokens from
"Testing" or "Unpublished" apps.
