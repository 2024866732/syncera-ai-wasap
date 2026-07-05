# Analytics Frontend Dashboard — Sprint v2.2.0

## Overview

The Analytics Dashboard frontend (`dashboard/src/components/Analytics.jsx`) provides a dark-themed React dashboard with summary cards, dual charts (Line + Bar), date range filtering, agent performance table, and CSV export. Built with **Vite + React + Recharts**.

## File Structure

| File | Purpose |
|------|---------|
| `dashboard/src/components/Analytics.jsx` | Main component — all UI, charts, table, export |
| `dashboard/src/api/api.js` | API helpers: `fetchAnalyticsTimeseries()`, `fetchAgents()`, `downloadAnalyticsCSV()` |

## API Helpers (`api.js`)

All analytics API functions use JWT Bearer token from `localStorage.getItem('staff_token')`, with fallback to `X-API-Key`:

```javascript
function getAuthHeaders() {
  const token = localStorage.getItem('staff_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-API-Key'] = import.meta.env.VITE_API_KEY || '';
  }
  return headers;
}
```

**Helper functions added:**

| Function | HTTP Call | Parameters |
|----------|-----------|------------|
| `fetchAnalyticsTimeseries({ days, start, end })` | `GET /api/analytics/timeseries` | `days` (7/30), `start`, `end` (YYYY-MM-DD) |
| `fetchAgents({ staffId, start, end })` | `GET /api/analytics/agents` | All optional |
| `downloadAnalyticsCSV({ exportType, start, end })` | `GET /api/analytics/export.csv` | Triggers browser download via Blob + URL |

## UI Component Architecture (`Analytics.jsx`)

### State Management

```javascript
const [overview, setOverview] = useState(null);         // /api/analytics/overview
const [chartDays, setChartDays] = useState(7);           // 7 or 30
const [customStart, setCustomStart] = useState('');       // YYYY-MM-DD
const [customEnd, setCustomEnd] = useState('');           // YYYY-MM-DD
const [dateMode, setDateMode] = useState('7d');           // '7d' | '30d' | 'custom'
const [chartData, setChartData] = useState([]);           // Recharts data array
const [timeseries, setTimeseries] = useState(null);       // Raw /api/analytics/timeseries
const [agents, setAgents] = useState([]);                 // Agent perf array
const [loading, setLoading] = useState(true);
const [exporting, setExporting] = useState(false);
```

### Data Loading

Three endpoints are called in parallel via `Promise.all()`:

```javascript
const [overviewData, timeseriesData, agentsData] = await Promise.all([
  fetchAnalyticsOverview(),
  fetchAnalyticsTimeseries({ days, ...dateOpts }),
  fetchAgents(dateOpts),
]);
```

Chart data is built from `timeseriesData` to power BOTH the Line chart (in/out) and the Bar chart (escalated/resolved):

```javascript
setChartData(
  (timeseriesData.labels || []).map((label, i) => ({
    label,
    messages_in: timeseriesData.messages_in?.[i] || 0,
    messages_out: timeseriesData.messages_out?.[i] || 0,
    escalated: timeseriesData.escalated?.[i] || 0,
    resolved: timeseriesData.resolved?.[i] || 0,
    response_time: timeseriesData.response_times_sec?.[i] || 0,
  }))
);
```

Auto-refresh every 30s via `setInterval`. Cleanup on unmount via `clearInterval` from the `useEffect` return.

### Summary Cards (8 cards, 4-column grid)

| Card | Key in overview | Color |
|------|----------------|-------|
| Total Perbualan | `total_conversations` | Default (white) |
| Mesej Masuk | `inbound_total` | Default |
| Mesej Keluar | `outbound_total` | Default |
| Mesej Hari Ini | `today_messages` | Default |
| Eskalasi | `escalation_count` | `text-amber-400` |
| Selesai | `resolved_count` | `text-emerald-400` |
| Masa Respons Pertama | `avg_first_response_time_sec` | `text-blue-400` |
| Masa Selesai | `avg_resolution_time_sec` | `text-purple-400` |

Cards rendered via reusable `<Card label value sub color>` component. Response times formatted via `formatDuration()`:

```javascript
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
```

### Charts

**Chart 1: Line Chart** — Messages In vs Out (`/api/analytics/timeseries`)
- Recharts `<LineChart>` at 250px height
- Green line = inbound, Blue line = outbound
- Empty state: shows `<EmptyState>` component when all values are zero

**Chart 2: Bar Chart** — Escalated vs Resolved (NEW)
- Recharts `<BarChart>` at 200px height
- Amber bars = escalated, Green bars = resolved
- Empty state: same component, different message

### Date Range Selector

Three-mode toggle button group:

| Mode | Behavior |
|------|----------|
| **7 Hari** | `dateMode='7d'`, `days=7`, no custom dates |
| **30 Hari** | `dateMode='30d'`, `days=30`, no custom dates |
| **Tempoh** | `dateMode='custom'` — shows two `<input type="date">` fields + "Guna" button |

When "Guna" is clicked, calls `loadAll()` with `{ start: customStart, end: customEnd }`.

### Agent Performance Table

| Column | Data field | Rendered as |
|--------|-----------|-------------|
| Nama | `a.name` | Left-aligned, white, font-medium |
| Perbualan | `a.conversations_handled` | Right-aligned |
| Masa Respons | `a.avg_response_time_sec` | Via `formatDuration()` |
| Eskalasi | `a.escalated_count` | `text-amber-400` |
| Selesai | `a.resolved_count` | `text-emerald-400` |
| Mesej | `a.messages_sent` | Right-aligned |

Empty state: `<EmptyState message="Tiada data prestasi staf untuk tempoh ini" />` when `agents.length === 0`.

### CSV Export

Button in header triggers `downloadAnalyticsCSV()` which:
1. Fetches `/api/analytics/export.csv` with JWT auth
2. Gets response as Blob
3. Creates element `<a>` with `download` attribute
4. Programmatically clicks it (browser downloads file)
5. Revokes the Blob URL

Filename: `analytics_overview_YYYY-MM-DD.csv`

### AI Reply Rate Card

Compact card at bottom, shows percentage with badge:
- ≥80% → "✅ AI handle baik" (emerald)
- <80% → "⚠️ Ramai perlu staff" (amber)

## Build

```bash
cd dashboard/
npm run build
```

Generates `dist/index.html` + `dist/assets/index-*.js` + `dist/assets/index-*.css`.

## Key Styling Constants

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0f1117` | Page/root |
| Card bg | `#1a1d27` | Cards, charts, table rows |
| Accent green | `#00d563` | Active button, inbound line, resolved bars |
| Blue | `#3b82f6` | Outbound line |
| Amber | `#f59e0b` | Escalated bars, escalation count |
| Border | `#2a2d3a` / `#gray-800` | Card borders, chart grid |
| Text muted | `#6b7280` / `text-gray-400` | Labels |
| Text primary | `#fff` / `text-white` | Values |

## Known Limitations

1. Agent performance only shows staff who have `assigned_phone` set in the DB
2. Bundle size ~636KB (includes recharts) — consider code-splitting if this grows
3. CSV export currently only exports overview type; `timeseries` and `agents` types are implemented on the backend but not wired into the UI button
4. Custom date range does not persist across page navigation (state is in-memory)
5. The legacy `/api/analytics/chart` endpoint is still used by the old component but replaced by `/api/analytics/timeseries` in v2.2.0 — backward compatible
