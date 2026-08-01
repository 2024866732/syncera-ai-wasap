# n8n 2.8+ Owner Login + Basic Auth Gotcha (HAFJET, 2026-08)

## Context
n8n 2.8.4 (and similar) with `N8N_BASIC_AUTH_ACTIVE=true` still forces an owner account creation that requires a **valid email**.

Using only a fake local email (hafizi145@local.com) often still triggers the "Must be a valid email" validation.

## Resolution Pattern (proven in this session)

1. Keep basic auth in `.env`:
   ```
   N8N_BASIC_AUTH_ACTIVE=true
   N8N_BASIC_AUTH_USER=hafizi145
   N8N_BASIC_AUTH_PASSWORD=hafjet123!
   ```

2. User creates owner manually in the UI using a **real email** they control:
   - Email: hafizi145@gmail.com
   - Password: Skyblues@145 (or strong one)

3. **Clean up conflicting owner lines** that were previously added:
   ```bash
   sed -i '/N8N_OWNER_EMAIL/d; /N8N_OWNER_PASSWORD/d' /home/hafizi145/.n8n/.env
   ```

4. Restart:
   ```bash
   cd /home/hafizi145/.n8n
   sg docker -c "/home/hafizi145/.local/bin/docker-compose down && /home/hafizi145/.local/bin/docker-compose up -d"
   ```

5. Login sequence (two layers):
   - **Browser Basic Auth popup first**: username `hafizi145`, password `hafjet123!`
   - **Then n8n UI**: email `hafizi145@gmail.com` + the password created in step 2

## Lessons
- Do not rely solely on `N8N_OWNER_EMAIL` in .env for the first run when basic auth is active.
- After manual owner creation, remove stale `N8N_OWNER_*` lines.
- Always use real deliverable email for owner (Gmail worked).
- User may request "tolong runkan dalam terminal untuk saya" — run the sed + restart sequence directly when asked.
- Incognito or cache clear helps when switching between basic auth and UI login.

## Related
See main SKILL.md "n8n Login / Owner Setup Gotcha" section and `references/n8n-quick-tunnel-haftet.md`.