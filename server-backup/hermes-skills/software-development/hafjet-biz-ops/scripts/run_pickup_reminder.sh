#!/usr/bin/env bash
set -a
source /home/hafizi145/.hermes/.env
set +a
DRY_RUN=0
export DRY_RUN
exec python3 /home/hafizi145/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py
