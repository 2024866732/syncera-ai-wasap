# Analytics API v2.2.0 — Design Reference

## Overview

Analytics endpoints added in Sprint v2.2.0 to give staff visibility into inbox performance, agent productivity, and escalation/resolution trends. All endpoints are **JWT-protected** via `Depends(get_current_staff)` — unauthorized requests return 401.

## Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/analytics/overview` | GET | JWT | Summary cards: totals, response times, escalation/resolution |
| `/api/analytics/timeseries` | GET | JWT | Daily trends: in/out, escalated/resolved, avg response time |
| `/api/analytics/agents` | GET | JWT | Per-staff performance metrics |
| `/api/analytics/export.csv` | GET | JWT | CSV download for overview/timeseries/agents |
| `/api/analytics/chart` (legacy) | GET | JWT | Legacy backward-compat (deprecated, returns in/out only) |

## Common Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `start` | string | No | Start date `YYYY-MM-DD` filter (applied to `timestamp`) |
| `end` | string | No | End date `YYYY-MM-DD` filter (appended with `23:59:59`) |
| `days` | int | No | Days of data (default 7). Used when no custom start/end |

## Metric Definitions (from db_logger.py)

### Core Counts
- **total_conversations**: `COUNT(DISTINCT customer_phone)` from messages table
- **inbound_total**: `COUNT(*) WHERE direction='inbound'` (within date range)
- **outbound_total**: `COUNT(*) WHERE direction='outbound'` (within date range)

### Response Times (seconds)
- **avg_first_response_time_sec**: Per conversation: `MIN(inbound_timestamp) → MIN(outbound_timestamp)` where outbound > inbound. Averaged across all conversations with at least 1 inbound + 1 outbound.
- **avg_response_time_sec**: Per conversation: iterate messages in chronological order, for each inbound→outbound pair, compute diff. Cap at 24h. Average across all pairs.
- **avg_resolution_time_sec**: Per customer with `resolved_at` set: `resolved_at - first_contact`. Average across all resolved customers.

### State Counts
- **escalation_count**: `COUNT(*) WHERE escalated_at IS NOT NULL` in customers table
- **resolved_count**: `COUNT(*) WHERE resolved_at IS NOT NULL` in customers table

### Agent Performance (per staff)
- **conversations_handled**: number of customers with `assigned_to = staff_id`
- **avg_response_time_sec**: avg of `MIN(inbound) → MIN(outbound)` across their assigned conversations
- **escalated_count**: count of assigned conversations with `escalated_at IS NOT NULL`
- **resolved_count**: count of assigned conversations with `resolved_at IS NOT NULL`
- **messages_sent**: `COUNT(*) WHERE direction='outbound' AND customer_phone IN (their assigned phones)`

## Response Schema

### `/api/analytics/overview`
```json
{
  "total_conversations": 1,
  "inbound_total": 1,
  "outbound_total": 2,
  "new_last_7_days": 1,
  "messages_this_month": 3,
  "messages_last_month": 0,
  "messages_change_pct": 100.0,
  "ai_reply_rate": 100.0,
  "today_messages": 0,
  "escalation_count": 0,
  "resolved_count": 0,
  "avg_first_response_time_sec": 4,
  "avg_response_time_sec": 0,
  "avg_resolution_time_sec": 0
}
```

### `/api/analytics/timeseries?days=7`
```json
{
  "labels": ["28 Jun", "29 Jun", ...],
  "messages_in": [0, 0, 0, 0, 1, 1, 0],
  "messages_out": [0, 0, 0, 1, 1, 0, 1],
  "escalated": [0, 0, 0, 0, 0, 0, 0],
  "resolved": [0, 0, 0, 0, 0, 0, 0],
  "response_times_sec": [0, 0, 0, 0, 30, 15, 0]
}
```

### `/api/analytics/agents`
```json
{
  "agents": [
    {
      "id": 1,
      "name": "Tuan Hafizi",
      "conversations_handled": 0,
      "avg_response_time_sec": 0,
      "escalated_count": 0,
      "resolved_count": 0,
      "messages_sent": 0
    }
  ]
}
```

## Implementation Details (db_logger.py)

### Date Range Filtering Pattern
```python
date_where = ""
date_params = []
if start_date:
    date_where += " AND timestamp >= ?"
    date_params.append(start_date)
if end_date:
    date_where += " AND timestamp <= ?"
    date_params.append(end_date + " 23:59:59")

# Use in queries:
conn.execute(f"SELECT COUNT(*) FROM messages WHERE direction='inbound'{date_where}", date_params)
```

### Response Time Calculation
```python
# First response time per conversation
rows = conn.execute("""
    SELECT customer_phone,
           MIN(CASE WHEN direction='inbound' THEN timestamp END) as first_in,
           MIN(CASE WHEN direction='outbound' THEN timestamp END) as first_out
    FROM messages
    GROUP BY customer_phone
    HAVING first_in IS NOT NULL AND first_out IS NOT NULL
""").fetchall()
# Then for each row: diff = datetime.fromisoformat(first_out) - datetime.fromisoformat(first_in)
# Average across all diffs

# Average reply time (all pairs)
# Iterate each conversation's messages in chronological order
# Track last_inbound timestamp, compute diff when outbound arrives
# Cap at 24h to exclude overnight gaps, then average
```

### Agent Performance by assigned_to
```python
# assigned_to stores staff_id as VARCHAR
conv_phones = [r[0] for r in conn.execute(
    "SELECT phone FROM customers WHERE assigned_to=?", (str(staff_id),)
).fetchall()]
```

## Fallback Values on Error

All endpoints catch exceptions and return safe defaults (zeros, empty arrays) with a log error. The frontend should handle empty/zero data gracefully.

## Known Limitations (v2.2.0)

- Response times calculated purely from SQLite timestamps — no separate "working hours" tracking
- "Same day" response time in timeseries uses all messages for that day, not per-conversation grouping
- No `p95`/`p99` percentile metrics (only averages)
- Agent performance only counts conversations where `assigned_to = staff_id` — manual conversations without assignment may be missed
- No trend comparison period (e.g., "improved 15% vs last week")
