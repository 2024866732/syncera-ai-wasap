import { useCallback, useState, useRef, useEffect } from 'react'
import { useStore, filteredConversations, LABEL_META } from '../store'
import type { Conversation, FilterTab } from '../types'
import { Search, Pin, Bot, MessageSquare, Users, X, Filter, SlidersHorizontal, Plus, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import AIOutreach from './AIOutreach'
import { useT } from '../i18n'

const FILTERS: { id: FilterTab; labelKey: string; icon?: string; color?: string }[] = [
  { id: 'all',    labelKey: 'inbox.all',     color: '#8B949E' },
  { id: 'unread', labelKey: 'inbox.unread',  color: '#F85149' },
  { id: 'ai_on',  labelKey: 'inbox.ai',      icon: '🤖', color: '#58A6FF' },
  { id: 'pinned', labelKey: 'inbox.pinned',  icon: '📌', color: '#D29922' },
]

export default function Sidebar() {
  const store            = useStore()
  const t                = useT()
  const convs            = filteredConversations(store)
  const allConvs         = store.conversations
  const { activeConvId, filterTab } = store
  const [localSearch, setLocalSearch] = useState('')
  const [showOutreach, setShowOutreach] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('syncera_sidebar_collapsed') === '1')
  const searchRef = useRef<HTMLInputElement>(null)
  const accountDisplayName = (store.appSettings['business_name'] || '').trim()
    || store.waUser?.name
    || 'My Account'

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('syncera_sidebar_collapsed', next ? '1' : '0') } catch {}
  }

  // Ctrl+B keyboard shortcut to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleCollapse()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [collapsed])

  // Stats for header
  const totalUnread = allConvs.reduce((s, c) => s + (c.unread_count || 0), 0)
  const aiCount = allConvs.filter(c => c.ai_enabled).length

  const handleSearch = useCallback(async (q: string) => {
    setLocalSearch(q)
    store.setSearch(q)
    if (q.length > 1) {
      const results = await window.wa.searchMessages(q)
      store.setSearch(q, results)
    }
  }, [])

  const selectConv = useCallback(async (conv: Conversation) => {
    store.setActiveConv(conv.id)
    if (!store.messages[conv.id]?.length) {
      const msgs = await window.wa.getMessages(conv.id, 60)
      store.setMessages(conv.id, msgs)
    }
    if (conv.unread_count > 0) {
      window.wa.clearUnread(conv.id)
      store.upsertConversation({ ...conv, unread_count: 0 })
    }
    window.wa.subscribePresence(conv.id)
  }, [store])

  // Collapsed strip — show only icons + unread badges
  if (collapsed) {
    return (
      <div
        style={{ width: 60 }}
        className="flex-shrink-0 flex flex-col bg-gradient-to-b from-bg-secondary to-bg-primary border-r border-border/60 overflow-hidden will-change-[width] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] animate-sidebar-collapse">
        <div className="pt-4 pb-2 px-2 flex items-center justify-center relative">
          <button onClick={toggleCollapse}
            title="Expand inbox (Ctrl+B)"
            className="w-10 h-10 rounded-xl bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-text-primary flex items-center justify-center transition-all duration-200 active:scale-90">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex flex-col items-center gap-1.5 px-2 py-2 border-y border-border/40">
          <button onClick={() => setShowOutreach(true)} title="AI Outreach"
            className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-accent-purple/30">
            <Sparkles size={16} />
          </button>
          <button
            onClick={() => store.setSection('quicksend')}
            title="New chat / Quick Send"
            aria-label="New chat / Quick Send"
            className="w-10 h-10 rounded-xl bg-accent-green/10 hover:bg-accent-green/20 text-accent-green flex items-center justify-center transition-all duration-150 active:scale-95">
            <Plus size={18} />
          </button>
        </div>
        {/* Mini list — avatar dots with unread badges */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
          {convs.slice(0, 30).map(c => (
            <button key={c.id} onClick={() => selectConv(c)}
              title={`${c.name || c.phone}${c.unread_count ? ` · ${c.unread_count} unread` : ''}`}
              className={`relative w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-all ${
                activeConvId === c.id ? 'ring-2 ring-accent-green' : 'hover:scale-105'
              }`}>
              <Avatar name={c.name || c.phone} size={40} />
              {c.unread_count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-status-danger text-white text-[9px] font-bold flex items-center justify-center shadow-md">
                  {c.unread_count > 99 ? '99+' : c.unread_count}
                </span>
              )}
              {c.ai_enabled === 1 && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent-blue ring-2 ring-bg-primary" />
              )}
            </button>
          ))}
          {convs.length > 30 && (
            <p className="text-[9px] text-text-muted text-center pt-1">+{convs.length - 30} more</p>
          )}
        </div>
        {showOutreach && <AIOutreach onClose={() => setShowOutreach(false)} />}
      </div>
    )
  }

  return (
    <div
      style={{ width: 340 }}
      className="flex-shrink-0 flex flex-col bg-gradient-to-b from-bg-secondary to-bg-primary border-r border-border/60 overflow-hidden will-change-[width] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] animate-sidebar-expand">

      {/* ── Premium Header with Stats ── */}
      <div className="px-5 pt-5 pb-3 relative">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-xl font-bold text-text-primary tracking-tight">{t('inbox.title')}</p>
            <p className="text-xxs text-text-muted mt-0.5">
              {allConvs.length} {t('inbox.conversations')}
              {totalUnread > 0 && <span className="text-status-danger font-semibold"> · {totalUnread} {t('inbox.unread')}</span>}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={toggleCollapse}
              title="Collapse inbox (Ctrl+B)"
              className="w-8 h-8 rounded-xl bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-text-primary flex items-center justify-center transition-all duration-200 active:scale-90">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setShowOutreach(true)}
              title="AI Outreach — Mulakan perbualan dengan customer secara automatik"
              className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-accent-purple to-fuchsia-600 hover:scale-105 text-white flex items-center justify-center transition-transform shadow-md shadow-accent-purple/30">
              <Sparkles size={14} />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent-orange animate-pulse" />
            </button>
            <button
              onClick={() => store.setSection('quicksend')}
              title="New chat / Quick Send"
              aria-label="New chat / Quick Send"
              className="w-8 h-8 rounded-xl bg-accent-green/10 hover:bg-accent-green/20 text-accent-green flex items-center justify-center transition-all duration-150 active:scale-95">
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Mini stats row */}
        <div className="flex gap-2">
          <StatPill value={allConvs.length} label="Total" color="#58A6FF" />
          <StatPill value={totalUnread} label="Unread" color="#F85149" pulse={totalUnread > 0} />
          <StatPill value={aiCount} label="AI Active" color="#BC8CFF" />
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-4 pb-3">
        <div className="relative group">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-green transition-colors" />
          <input
            ref={searchRef}
            value={localSearch}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && handleSearch('')}
            placeholder={t('inbox.searchPlaceholder')}
            className="w-full bg-bg-tertiary/60 backdrop-blur border border-border rounded-xl pl-10 pr-9 py-2.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-green/50 focus:bg-bg-tertiary transition-all"
          />
          {localSearch && (
            <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex gap-1.5 px-4 pb-3">
        {FILTERS.map(f => {
          const active = filterTab === f.id
          return (
            <button key={f.id}
              onClick={() => store.setFilter(f.id)}
              className={`flex-1 text-xxs py-1.5 rounded-lg font-semibold transition-all ${
                active
                  ? 'text-bg-primary shadow-md'
                  : 'text-text-muted bg-bg-tertiary/40 hover:bg-bg-hover hover:text-text-secondary'
              }`}
              style={active ? { background: f.color } : {}}>
              {f.icon ? `${f.icon} ` : ''}{t(f.labelKey)}
            </button>
          )
        })}
      </div>

      <div className="h-px bg-border/40 mx-4 mb-1" />

      {/* ── Conversation list ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {convs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-bg-tertiary/60 border border-border flex items-center justify-center">
              <Users size={22} className="text-text-muted opacity-50" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {localSearch ? 'No matches found' : 'No conversations'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {localSearch ? 'Try a different search' : 'Customer messages will appear here'}
              </p>
            </div>
          </div>
        ) : (
          convs.map((conv, i) => (
            <ConvRow
              key={conv.id}
              conv={conv}
              isActive={activeConvId === conv.id}
              isTyping={store.typingJids.has(conv.id)}
              onClick={() => selectConv(conv)}
            />
          ))
        )}
      </div>

      {showOutreach && <AIOutreach onClose={() => setShowOutreach(false)} />}

      {/* ── Footer: user info ── */}
      <div className="px-4 py-3 border-t border-border/60 bg-bg-primary/50 backdrop-blur flex items-center gap-3">
        <div className="relative">
          <Avatar name={accountDisplayName} size={36} />
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-status-success border-2 border-bg-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate" title={accountDisplayName}>{accountDisplayName}</p>
          <p className="text-xxs text-status-success font-medium">● Online · WhatsApp Live</p>
        </div>
      </div>
    </div>
  )
}

// ── Stat Pill ─────────────────────────────────────────────────────────────────
function StatPill({ value, label, color, pulse }: { value: number; label: string; color: string; pulse?: boolean }) {
  return (
    <div className="flex-1 bg-bg-tertiary/40 backdrop-blur border border-border/60 rounded-lg px-2.5 py-1.5">
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-bold" style={{ color }}>
          {value}
        </span>
        {pulse && value > 0 && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
      </div>
      <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mt-0.5">{label}</p>
    </div>
  )
}

// ── Conversation Row (premium card style) ────────────────────────────────────
function ConvRow({ conv, isActive, isTyping, onClick }: {
  conv: Conversation; isActive: boolean; isTyping: boolean; onClick: () => void
}) {
  const labelMeta = LABEL_META[conv.label || 'none']
  const tags: string[] = (() => { try { return JSON.parse(conv.tags || '[]') } catch { return [] } })()
  const hasLabel = conv.label && conv.label !== 'none'
  const isGroup = conv.id.endsWith('@g.us') || conv.phone?.endsWith('@g.us')

  const timeStr = conv.last_msg_time ? formatTime(new Date(conv.last_msg_time)) : ''

  return (
    <div
      onClick={onClick}
      className={`relative mx-1 my-0.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 group ${
        isActive
          ? 'bg-gradient-to-r from-accent-green/15 to-transparent border border-accent-green/30 shadow-sm'
          : 'hover:bg-bg-hover border border-transparent'
      }`}
    >
      {/* Label color indicator */}
      {hasLabel && (
        <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
          style={{ background: labelMeta.color, boxShadow: `0 0 8px ${labelMeta.color}60` }} />
      )}

      <div className="flex items-start gap-3">
        {/* Avatar with AI/online indicator */}
        <div className="relative flex-shrink-0">
          <Avatar name={conv.name || conv.phone} size={44} />
          {conv.ai_enabled ? (
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-accent-blue to-blue-600 flex items-center justify-center border-2 border-bg-secondary shadow-md">
              <Bot size={9} className="text-white" />
            </div>
          ) : isGroup ? (
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-accent-purple to-fuchsia-600 flex items-center justify-center border-2 border-bg-secondary shadow-md">
              <Users size={9} className="text-white" />
            </div>
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-[13px] font-semibold truncate ${isActive ? 'text-text-primary' : 'text-text-primary'}`}>
                {conv.name || conv.phone}
              </span>
              {isGroup ? <Users size={11} className="text-accent-purple flex-shrink-0" /> : null}
              {conv.is_pinned ? <Pin size={10} className="text-status-warning flex-shrink-0" /> : null}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`text-[10px] font-medium ${conv.unread_count > 0 ? 'text-accent-green' : 'text-text-muted'}`}>
                {timeStr}
              </span>
              {conv.unread_count > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent-green text-bg-primary text-[10px] font-bold flex items-center justify-center shadow-sm">
                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isTyping ? (
              <span className="text-xs text-accent-green italic flex items-center gap-1">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                <span className="ml-1">typing</span>
              </span>
            ) : (
              <span className={`text-xs truncate flex-1 ${conv.unread_count > 0 ? 'text-text-primary font-medium' : 'text-text-muted'}`}>
                {conv.last_message || 'Tap to start a conversation'}
              </span>
            )}
          </div>

          {/* Label + Tags row */}
          {(hasLabel || tags.length > 0) && (
            <div className="flex gap-1 mt-1.5 flex-wrap items-center">
              {hasLabel && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wider"
                  style={{ background: `${labelMeta.color}20`, color: labelMeta.color }}>
                  {labelMeta.label}
                </span>
              )}
              {tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-bg-active text-text-secondary font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 40, src }: { name: string; size?: number; src?: string }) {
  const color = stringToColor(name)
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white overflow-hidden flex-shrink-0 shadow-sm"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color} 0%, ${darken(color)} 100%)`, fontSize: size * 0.36 }}
    >
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  )
}

function stringToColor(str: string) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#25D366','#128C7E','#58A6FF','#BC8CFF','#F78166','#D29922','#3FB950','#FF6B9D','#06B6D4','#8B5CF6']
  return colors[Math.abs(hash) % colors.length]
}

function darken(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 0xff) - 40)
  const g = Math.max(0, ((n >> 8) & 0xff) - 40)
  const b = Math.max(0, (n & 0xff) - 40)
  return `#${[r,g,b].map(x => x.toString(16).padStart(2, '0')).join('')}`
}

function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7)  return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' })
}
