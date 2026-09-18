# xAI Grok OAuth (SuperGrok) entitlement vs grok.com UI

Use when Tuan reports SuperGrok missing, grok.com flipped to Free, or grok.com chat history empty. Probe **Hermes `xai-oauth`** first. Do not restore grok.com data from this host.

## Surfaces (keep separate)

| Surface | What it proves |
|---|---|
| `~/.hermes/auth.json` → `providers.xai-oauth` | Consumer OAuth still stored |
| `GET /v1/me` + `POST /v1/chat/completions` `grok-4.6` | **API entitlement** on that identity |
| grok.com Settings / Billing / history | **Website session** only (wrong Google/X account looks like Free + empty chats) |
| Hermes `config.yaml` `model.provider` | **Default** for new sessions — may stay `commandcode`/`deepseek-v4-flash` while *this* Telegram session is already `xai-oauth` |

X Premium+ on the X app is **not** the same as SuperGrok API access. Hermes itself documents that Premium+ often 403s on `api.x.ai`. A live `grok-4.6` 200 means this OAuth identity has API-side access.

## Identity (HAFJET)

- OAuth / id_token email: **`hafizi145@gmail.com`**
- No `XAI_API_KEY` in `.env` is expected (OAuth, not Console).
- Hermes gws Gmail: **`hafjetai@gmail.com`**. SuperGrok receipts will **not** appear there. Do not treat “0 xAI emails in gws” as “no subscription”.

## Probe (never print tokens)

Python against `auth.json` must print **claims and HTTP status only**. Never log `access_token`, `refresh_token`, or `id_token` bodies.

1. Confirm `hermes auth list` shows `xai-oauth` (device_code). Pool `last_status` may be `ok`.
2. Decode JWT **payload** of access token: `email` (id_token), `tier`, `exp`, `scope` (`grok-cli:access`, `api:access`), `principal_type`.
3. `GET https://api.x.ai/v1/me` — expect `user_id`, `team_id`, `team_blocked`, `oauth.client_id`. `team_blocked: true` is the hard stop.
4. `GET https://api.x.ai/v1/models` — SuperGrok-class lists include `grok-4.6` and often `grok-imagine-*`.
5. `POST https://api.x.ai/v1/chat/completions` with `{"model":"grok-4.6","messages":[{"role":"user","content":"Reply with exactly: PONG"}],"max_tokens":8}`.
6. **Do not** change `model.provider` / default without Tuan’s approval.

`id_token` can be expired while a refreshed **access_token** is still valid — that is not “logged out”.

## How to read results

| Observation | Meaning | Next |
|---|---|---|
| Chat 200 `grok-4.6` + `team_blocked: false` | API SuperGrok **live** | If grok.com is Free: Tuan checks **email shown** on grok.com = `hafizi145@gmail.com` |
| grok.com Free + empty history + API 200 | Wrong website account **or** UI/billing desync — **not** proven wipe | Screenshot Settings + Billing; xAI Support if email matches |
| 403 “no active Grok subscription” / out of resources | Entitlement/quota/tier — Hermes cannot distinguish | Tuan opens https://grok.com/?_s=usage |
| gws Gmail has no xAI mail | **Wrong mailbox** (`hafjetai`) | Do not conclude no receipt |

## Hard limits

- Cannot restore grok.com chats or force-resubscribe. Only xAI Support + original payment channel (grok.com / App Store / Play).
- Cannot log into grok.com for Tuan. Do not ask for the Google/xAI password. Ask for a **screenshot of the logged-in email + Billing page**.
- Do not declare compromise unless Tuan has foreign sessions on https://myaccount.google.com/device-activity for **`hafizi145@gmail.com`**. A Free empty grok.com view is insufficient.
- If Tuan still suspects takeover: they change Google password + 2FA + kick sessions **themselves**. Agent does not revoke their Google account.

## Support pointers (Tuan, not agent)

- Billing: grok.com → Settings → Billing; usage: https://grok.com/?_s=usage
- Identity: https://accounts.x.ai
- FAQ: https://docs.x.ai/grok/faq
