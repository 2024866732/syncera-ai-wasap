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
  base: '/dashboard/',
  server: {
    origin: 'http://localhost:5173/dashboard',
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

**CRITICAL: Set `base: '/dashboard/'` when the app is served under a subpath.**

Without `base: '/dashboard/'`, Vite generates asset paths like `/assets/index-xxx.js`. The browser resolves these relative to the **page URL** (`/dashboard`), requesting `/assets/index-xxx.js` at the **root** — which returns 404 because FastAPI only serves assets at `/dashboard/assets/...`. Result: blank page with no visible errors.

With `base: '/dashboard/'`, Vite generates `/dashboard/assets/index-xxx.js` — the browser requests the correct path, assets load, dashboard renders.

**Diagnosis pattern (blank dashboard page):**
1. Open browser DevTools → Network tab
2. Look for 404 errors on `/assets/*.js` or `/assets/*.css`
3. If assets return 404 but `/dashboard/assets/*` returns 200 → `base` path is wrong
4. Fix: add `base: '/dashboard/'` to vite.config.js, rebuild, redeploy

**Favicon path in index.html:** Use relative path `href="./favicon.svg"` instead of `href="/favicon.svg"` to ensure it resolves correctly from the subpath.

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
const [activeTab, setActiveTab] = useState('chats');     // chats | analytics | settings
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

## Toast Notification Pattern

For operator feedback (save success, action completed), use a simple auto-dismiss toast:

```jsx
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
  return (
    <div className={`fixed top-4 right-4 ${bg} text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 animate-fade-in`}>
      {message}
    </div>
  );
}
```

CSS animation:
```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
```

## Mobile Responsiveness

On mobile (< 768px), collapse panels:
- Show only 1 panel at a time
- Add hamburger menu or tab switching
- Sidebar → full-width overlay
- ChatView → full screen
- CustomerInfo → slide-in panel
