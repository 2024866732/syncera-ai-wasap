# Analytics Chart Upgrade Pattern (Sprint 1 Feature 3)

Reply.la-style analytics for HAFJET Dashboard. Backend endpoints + Recharts frontend.

## Backend — New Endpoints

Add to `webhook_listener.py`:

```python
@app.get("/api/analytics/overview")
async def api_analytics_overview():
    if not _verify_api_key(request): raise HTTPException(401)
    return JSONResponse(content=get_analytics_overview())

@app.get("/api/analytics/chart")
async def api_analytics_chart(request: Request, days: int = 7):
    if not _verify_api_key(request): raise HTTPException(401)
    days = max(1, min(days, 90))  # clamp 1-90
    return JSONResponse(content=get_analytics_chart(days))
```

DB helpers in `db_logger.py`:
- `get_analytics_overview()` — total_conversations, new_last_7_days, messages_this_month, messages_last_month, messages_change_pct, ai_reply_rate, today_messages, escalation_count
- `get_analytics_chart(days)` — labels, messages_in[], messages_out[]

**Timezone:** Use UTC+8 (`timezone(timedelta(hours=8))`) for all "today", "this month", "last month" calculations.

**ai_reply_rate formula:** `100 - fallback_rate` where `fallback_rate = (fallback_count / total_inbound) * 100`.

**Routing path contract:** Use `routing_path='ai_query'` consistently between `_detect_routing()` and SQL `WHERE` clauses.

## Frontend — New Page

File: `dashboard/src/pages/Analytics.jsx` (replace existing)

```jsx
import { fetchAnalyticsOverview, fetchAnalyticsChart } from '../api/api';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function CircularProgress({ value, size = 120, strokeWidth = 8 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? '#00d563' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#2a2d3a" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute text-white font-bold text-lg">{value.toFixed(1)}%</span>
    </div>
  );
}

// State: overview, chartDays (7|30), chartData, loading
// useEffect: loadOverview() + loadChart(chartDays) on mount + every 30s
// useEffect: loadChart(chartDays) when chartDays changes
```

## API helpers — `api.js`

```javascript
export async function fetchAnalyticsOverview() {
  const res = await fetch(`${API_BASE}/api/analytics/overview`, {
    headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || '' },
  });
  if (!res.ok) throw new Error('Failed to fetch analytics overview');
  return res.json();
}

export async function fetchAnalyticsChart(days = 7) {
  const res = await fetch(`${API_BASE}/api/analytics/chart?days=${encodeURIComponent(days)}`, {
    headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || '' },
  });
  if (!res.ok) throw new Error('Failed to fetch analytics chart');
  return res.json();
}
```

## Deploy Workflow for Analytics Feature

1. Patch `db_logger.py` + `webhook_listener.py`
2. Write/replace `dashboard/src/pages/Analytics.jsx`
3. `npm install recharts` in `dashboard/`
4. `npm run build` in `dashboard/`
5. **Rebuild ZIP** (`python3 build_zip.py`) — the dist files must be repackaged
6. `az webapp deploy ... --type zip`
7. Verify endpoints + `/analytics` page load

**Pitfall:** Forgetting to rebuild the ZIP after `npm run build` means the old `dashboard/dist/` is deployed, and the new Analytics page is missing.

## SPA Catch-All Route (Required for React Router)

Place LAST in `webhook_listener.py`, after ALL `/api/*` routes:

```python
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_catch_all(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404)
    return FileResponse(os.path.join(DASHBOARD_PATH, "index.html"))
```

This enables React Router to handle `/contacts`, `/blast`, `/analytics`, etc.
