#!/bin/bash
# Wrapper to run fetch_sales_30days.py with token from .env
TOKEN=$(grep LOYVERSE_ACCESS_TOKEN /home/hafizi145/.hermes/.env | head -1 | cut -d= -f2-)
export LOYVERSE_ACCESS_TOKEN=$TOKEN
python3 /home/hafizi145/.hermes/skills/fetch_sales_30days.py
