# React SPA Dashboard Served from FastAPI

Pattern for serving a React/Vite dashboard from FastAPI backend, with WebSocket real-time updates.

## Architecture

```
Browser (React Dashboard)
    ├── REST: /api/customers, /api/messages/{phone}, /api/stats
    ├── WS:   /ws (real-time message events)
    └── Static: /dashboard/assets/* (CSS, JS, images)

FastAPI Backend
    ├── API routes (/api/*)
    ├── WebSocket (/ws)
    ├── Static mount (/dashboard/assets)
    └── Catch-all (/dashboard/*) → index.html
```

## Vite Configuration

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8443', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8443', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
```

**Note:** Do NOT set `base: '/dashboard/'` in vite.config.js when serving from FastAPI without a reverse proxy. The default `base: '/'` works because FastAPI mounts at `/dashboard` and the built `index.html` references assets at `/assets/...` which get served by the `/dashboard/assets` mount.

## WebSocket Hook (Browser)

```js
// hooks/useWebSocket.js
export function connectWebSocket(onMessage, onConnect, onDisconnect) {
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${window.location.host}/ws`;
  
  let ws;
  let reconnectTimer = null;
  let intentionalClose = false;

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => onConnect?.();
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (e) { /* ignore */ }
    };
    ws.onclose = () => {
      onDisconnect?.();
      if (!intentionalClose) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
  }

  connect();
  return {
    close: () => { intentionalClose = true; clearTimeout(reconnectTimer); ws?.close(); },
    getReadyState: () => ws?.readyState,
  };
}
```

## Dashboard State Management

For operator dashboards, simple `useState` + `useEffect` is sufficient. No need for Redux/Zustand at this scale.

```jsx
// App.jsx — Main state
const [activeTab, setActiveTab] = useState('chats');     // chats | analytics
const [selectedPhone, setSelectedPhone] = useState(null);
const [customers, setCustomers] = useState([]);
const [messages, setMessages] = useState([]);
const [stats, setStats] = useState(null);
const [wsConnected, setWsConnected] = useState(false);
```

## Dark Theme Colors (Tailwind)

| Element | Class |
|---------|-------|
| Background primary | `bg-gray-800` |
| Background secondary | `bg-gray-900` |
| Text primary | `text-gray-200` |
| Text secondary | `text-gray-400` |
| Accent | `emerald-500` / `emerald-600` |
| Inbound bubble | `bg-gray-700` |
| Outbound bubble | `bg-emerald-600` |
| Border | `border-gray-700` |

## Message Bubble Pattern

```jsx
// MessageBubble.jsx
const isOutbound = message.direction === 'outbound' || message.source === 'bot';
// Outbound: right-aligned, emerald bg
// Inbound: left-aligned, gray bg
// Always show: source label (BOT/STAFF/USER), timestamp
```

## Empty States

Always show placeholder when no data:
- No conversation selected → "Pilih perbualan" with icon
- No messages → "Tiada mesej lagi"
- No customers → "Tiada perbualan lagi"
- Loading → Spinner animation

## Mobile Responsiveness

On mobile (< 768px), collapse panels:
- Show only 1 panel at a time
- Add hamburger menu or tab switching
- Sidebar → full-width overlay
- ChatView → full screen
- CustomerInfo → slide-in panel
