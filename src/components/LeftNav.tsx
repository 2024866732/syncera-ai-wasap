import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { AppSection } from '../store'
import { useT } from '../i18n'
import { normalizePlan, sectionsForPlan } from '../lib/plans'
import {
  MessageSquare, LayoutDashboard, Megaphone, Zap, CircleDashed,
  ShoppingBag, Bell, BarChart2, Settings, KanbanSquare, Sparkles, Send, FileText, Package, CalendarDays,
} from 'lucide-react'
import InstallerBuilder from './InstallerBuilder'

// Each tab has a UNIQUE colour from across the spectrum so no two active
// buttons look similar. Colours hand-picked from Tailwind palette with
// minimum hue separation of ~30°.
// Labels are i18n keys — resolved at render time via useT()
const NAV: { id: AppSection; icon: typeof MessageSquare; labelKey: string; color: string; gradient: string }[] = [
  { id: 'chats',     icon: MessageSquare,   labelKey: 'nav.chats',     color: '#22c55e', gradient: 'from-green-400 to-emerald-600' },     // Green
  { id: 'status',    icon: CircleDashed,     labelKey: 'nav.status',    color: '#10b981', gradient: 'from-emerald-400 to-green-600' },     // Emerald
  { id: 'quicksend', icon: Send,            labelKey: 'nav.quicksend', color: '#14b8a6', gradient: 'from-teal-400 to-teal-600' },         // Teal
  { id: 'dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', color: '#3b82f6', gradient: 'from-blue-400 to-blue-600' },         // Blue
  { id: 'pipeline',  icon: KanbanSquare,    labelKey: 'nav.pipeline',  color: '#8b5cf6', gradient: 'from-violet-400 to-violet-600' },     // Violet
  { id: 'broadcast', icon: Megaphone,       labelKey: 'nav.broadcast', color: '#ef4444', gradient: 'from-red-400 to-red-600' },           // Red
  { id: 'templates', icon: Zap,             labelKey: 'nav.templates', color: '#facc15', gradient: 'from-yellow-300 to-amber-500' },      // Yellow
  { id: 'orders',    icon: ShoppingBag,     labelKey: 'nav.orders',    color: '#84cc16', gradient: 'from-lime-400 to-lime-600' },         // Lime
  { id: 'reminders', icon: Bell,            labelKey: 'nav.reminders', color: '#f97316', gradient: 'from-orange-400 to-orange-600' },     // Orange
  { id: 'calendar',  icon: CalendarDays,    labelKey: 'nav.calendar',  color: '#ec4899', gradient: 'from-pink-400 to-rose-600' },        // Pink
  { id: 'analytics', icon: BarChart2,       labelKey: 'nav.analytics', color: '#0ea5e9', gradient: 'from-sky-400 to-sky-600' },           // Sky
  { id: 'reports',   icon: FileText,        labelKey: 'nav.reports',   color: '#06b6d4', gradient: 'from-cyan-400 to-cyan-600' },         // Cyan
  { id: 'insights',  icon: Sparkles,        labelKey: 'nav.insights',  color: '#d946ef', gradient: 'from-fuchsia-400 to-fuchsia-600' },   // Fuchsia
]

export default function LeftNav() {
  const { section, setSection, setShowSettings, conversations } = useStore()
  const t = useT()
  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0)
  const aiActive = conversations.filter(c => c.ai_enabled).length
  const plan = normalizePlan(useStore(s => s.appSettings['license_plan']))
  const visibleNav = useMemo(() => {
    const allowed = sectionsForPlan(plan)
    return NAV.filter(item => allowed.includes(item.id))
  }, [plan])

  const [isOwner, setIsOwner] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  useEffect(() => {
    window.wa?.genIsOwner?.().then((v) => setIsOwner(!!v)).catch(() => {})
  }, [])
  useEffect(() => {
    if (!visibleNav.some(item => item.id === section)) setSection('chats')
  }, [section, setSection, visibleNav])

  return (
    <div className="w-[68px] flex-shrink-0 bg-gradient-to-b from-bg-secondary via-bg-secondary to-bg-primary border-r border-border/60 flex flex-col items-center py-4 gap-1 relative">
      {/* Top accent bar */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gradient-to-r from-transparent via-accent-green/40 to-transparent" />

      {visibleNav.map(({ id, icon: Icon, labelKey, color, gradient }) => {
        const label = t(labelKey)
        const isActive = section === id
        const badge = id === 'chats' && totalUnread > 0 ? String(totalUnread > 99 ? '99+' : totalUnread)
                    : id === 'insights' && aiActive > 0 ? String(aiActive)
                    : undefined
        return (
          <div key={id} className="relative group">
            {/* Active indicator pill */}
            {isActive && (
              <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full"
                style={{ background: color, boxShadow: `0 0 12px ${color}80` }} />
            )}
            <button
              onClick={() => setSection(id)}
              title={label}
              className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? `bg-gradient-to-br ${gradient} text-white shadow-lg`
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-primary hover:scale-105'
              }`}
              style={isActive ? { boxShadow: `0 8px 24px -8px ${color}80, 0 0 0 1px ${color}30` } : {}}
            >
              <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
              {badge && (
                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white shadow-md ${
                  id === 'chats' ? 'bg-status-danger' : 'bg-accent-blue'
                }`}>
                  {badge}
                </span>
              )}
            </button>
            {/* Tooltip */}
            <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0">
              <div className="bg-bg-active border border-border/60 text-text-primary text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-2xl backdrop-blur">
                {label}
              </div>
            </div>
          </div>
        )
      })}

      {/* Divider */}
      <div className="w-8 h-px bg-border/60 my-2" />

      {/* Spacer pushes settings + builder to bottom */}
      <div className="mt-auto flex flex-col gap-1 items-center">
        {/* Build Installer — owner/seller only (dev mode) */}
        {isOwner && plan === 'pro_max' && (
          <div className="relative group">
            <button
              onClick={() => setShowBuilder(true)}
              title="Build Installer"
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-text-muted bg-gradient-to-br from-accent-green/15 to-emerald-600/15 border border-accent-green/30 hover:from-accent-green/25 hover:to-emerald-600/25 hover:text-accent-green transition-all">
              <Package size={18} />
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all">
              <div className="bg-accent-green/20 border border-accent-green/40 text-accent-green text-xs px-3 py-1.5 rounded-lg shadow-2xl backdrop-blur whitespace-nowrap">
                Build Installer
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="relative group">
          <button
            onClick={() => setShowSettings(true)}
            title={t('nav.settings')}
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary hover:rotate-45 transition-all duration-300">
            <Settings size={19} />
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all">
            <div className="bg-bg-active border border-border/60 text-text-primary text-xs px-3 py-1.5 rounded-lg shadow-2xl backdrop-blur">{t('nav.settings')}</div>
          </div>
        </div>
      </div>

      {/* Installer Generator Modal */}
      {showBuilder && <InstallerBuilder onClose={() => setShowBuilder(false)} />}
    </div>
  )
}
