import { useEffect, useState } from 'react'
import { Minus, Square, X, Activity, Sun, Moon, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store'
import { applyTheme } from '../hooks/useTheme'
import { useT } from '../i18n'

export default function TitleBar() {
  const t = useT()
  const { isConnected, waUser, qrCode, appSettings, updateSetting, syncProgress } = useStore()
  const store = useStore()
  const send = (ch: string) => window.electron?.send(ch)
  const [syncing, setSyncing] = useState(false)

  // Live clock — updates every second when connected
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!isConnected) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [isConnected])
  const lang = (appSettings['app_language'] || 'ms') as 'en'|'ms'|'zh'
  const locale = lang === 'zh' ? 'zh-CN' : lang === 'ms' ? 'ms-MY' : 'en-US'
  const liveLabel = `${t('badge.live')} · ${now.toLocaleDateString(locale, { day: '2-digit', month: 'short' })} ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}`

  const currentTheme = appSettings['theme'] || 'dark'
  const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const toggleTheme = async () => {
    const next: 'light' | 'dark' = isDark ? 'light' : 'dark'
    updateSetting('theme', next)
    applyTheme(next)
    try { await window.wa.setSetting('theme', next) } catch {}
  }

  const syncHistory = async () => {
    if (syncing || !isConnected) return
    setSyncing(true)
    try {
      const r = await window.wa.syncHistory()
      if (r?.ok === false) throw new Error(r.error || 'Sync failed')
      const [convs, contacts] = await Promise.all([
        window.wa.getConversations(),
        window.wa.getAllContacts(),
      ])
      store.setConversations(convs)
      store.setContacts(contacts)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal sync chat history')
    } finally {
      setTimeout(() => setSyncing(false), 1800)
    }
  }

  const state = isConnected ? 'connected' : qrCode ? 'awaiting' : 'connecting'

  const badge = {
    connected: { label: liveLabel, dot: 'bg-accent-green', text: 'text-accent-green', bg: 'bg-accent-green/10', ring: 'ring-accent-green/30' },
    awaiting:  { label: t('badge.awaitingScan'),  dot: 'bg-status-warning', text: 'text-status-warning', bg: 'bg-status-warning/10', ring: 'ring-status-warning/20' },
    connecting:{ label: t('badge.connecting'),    dot: 'bg-text-muted',     text: 'text-text-muted',     bg: 'bg-bg-hover',           ring: 'ring-border' },
  }[state]

  return (
    <div className="h-10 bg-gradient-to-b from-bg-secondary to-bg-primary flex items-center justify-between select-none drag-region border-b border-border/60 flex-shrink-0">
      {/* Left: refined wordmark */}
      <div className="flex items-center gap-2.5 px-4 no-drag">
        <div className="relative">
          {/* Subtle outer glow */}
          <div className="absolute inset-0 rounded-lg bg-accent-green/30 blur-[6px] opacity-70" />
          <div className="relative w-6 h-6 rounded-lg bg-gradient-to-br from-accent-green via-emerald-500 to-emerald-700 flex items-center justify-center shadow-md shadow-accent-green/40 ring-1 ring-white/10">
            <Activity size={12} className="text-white" strokeWidth={3} />
          </div>
        </div>
        <span className="text-[14px] font-bold text-text-primary tracking-[0.02em] bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text">SYNCERA</span>
        <span className="text-text-muted/40 text-xs">·</span>
        <span className="text-[10px] text-text-muted font-semibold uppercase tracking-[0.18em]">AI Messenger</span>
      </div>

      {/* Right: theme toggle + connection badge + window controls */}
      <div className="flex items-center no-drag">
        {isConnected && (
          <button
            onClick={syncHistory}
            disabled={syncing}
            title="Sync chat history"
            className={`relative h-7 mr-2 rounded-full border overflow-hidden text-xxs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-80 ${
              syncProgress
                ? 'w-[230px] px-3 border-accent-blue/40 bg-accent-blue/10 text-text-primary'
                : 'px-2.5 border-border bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-text-primary'
            }`}>
            {syncProgress && !syncProgress.done && (
              <span
                className="absolute left-0 bottom-0 h-0.5 bg-accent-blue transition-all duration-300"
                style={{ width: `${Math.max(4, syncProgress.progress || 0)}%` }}
              />
            )}
            {syncProgress?.done
              ? <CheckCircle2 size={12} className="relative z-10 text-accent-green flex-shrink-0" />
              : <RefreshCw size={12} className={`relative z-10 text-accent-blue flex-shrink-0 ${(syncing || syncProgress?.active) ? 'animate-spin' : ''}`} />}
            <span className="relative z-10 truncate">
              {syncProgress
                ? syncProgress.done
                  ? `Sync complete · ${syncProgress.totalSaved.toLocaleString()} imported`
                  : `Syncing chat history · ${syncProgress.totalSaved.toLocaleString()} imported · ${syncProgress.progress || 0}%`
                : syncing ? 'Syncing' : 'Sync'}
            </span>
          </button>
        )}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 mr-2 rounded-full text-xxs font-semibold ring-1 ${badge.bg} ${badge.text} ${badge.ring}`}>
          <span className="relative flex w-1.5 h-1.5">
            {state !== 'connecting' && (
              <span className={`absolute inset-0 rounded-full ${badge.dot} animate-ping opacity-60`} />
            )}
            <span className={`relative w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          </span>
          {badge.label}
        </div>

        <button onClick={toggleTheme}
          title={isDark ? t('badge.switchToLight') : t('badge.switchToDark')}
          className="w-8 h-8 mr-1 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary transition-all">
          {isDark ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button onClick={() => send('win:minimize')}
          className="w-10 h-10 flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors">
          <Minus size={13} />
        </button>
        <button onClick={() => send('win:maximize')}
          className="w-10 h-10 flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors">
          <Square size={11} />
        </button>
        <button onClick={() => send('win:close')}
          className="w-10 h-10 flex items-center justify-center text-text-muted hover:bg-status-danger hover:text-white transition-colors">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
