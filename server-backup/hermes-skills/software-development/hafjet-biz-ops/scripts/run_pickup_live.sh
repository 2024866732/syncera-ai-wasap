#!/usr/bin/env bash
# Run HAFJET pickup reminder with valid env (source bot .env for working WA creds,
# inject known-good Google/owner constants per pickup-reminder-gsheets.md).
set -e

BOT="/home/hafizi145/.hermes/whatsapp-bot/.env"
MAIN="/home/hafizi145/.hermes/.env"

# Load WhatsApp credentials — prefer bot .env (documented working Phone ID)
# only if it actually defines the vars; otherwise fall back to main .env.
if [ -f "$BOT" ]; then
  # shellcheck disable=SC1090
  . "$BOT"
fi
: "${WHATSAPP_PHONE_ID:=}"
: "${WHATSAPP_ACCESS_TOKEN:=}"
if [ -z "$WHATSAPP_PHONE_ID" ] || [ -z "$WHATSAPP_ACCESS_TOKEN" ]; then
  # shellcheck disable=SC1090
  . "$MAIN"
fi

echo "PhoneID_len=${#WHATSAPP_PHONE_ID} Token_len=${#WHATSAPP_ACCESS_TOKEN}"
export WHATSAPP_CLOUD_PHONE_ID="$WHATSAPP_PHONE_ID"
export WHATSAPP_CLOUD_ACCESS_TOKEN="$WHATSAPP_ACCESS_TOKEN"
export GOOGLE_SHEET_ID="1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE"
export GOOGLE_SHEETS_CREDENTIALS="/home/hafizi145/.hermes/secrets/gsheet_sa.json"
export PICKUP_REMINDER_TAB="REPAIR BARU"
export PICKUP_REMINDER_STATUS_VALUE="SIAP"
export OWNER_PHONE="60198021500"
export DRY_RUN="${DRY_RUN:-0}"

PY="/home/hafizi145/hermes-agent/venv/bin/python3"
if [ ! -x "$PY" ]; then PY="python3"; fi
"$PY" /home/hafizi145/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py