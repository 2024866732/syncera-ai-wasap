import { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { Analytics } from '../store'
import { useT } from '../i18n'
import {
  MessageSquare, Users, Bot, TrendingUp, DollarSign,
  ShoppingBag, Bell, AlertCircle, RefreshCw, Zap, Megaphone,
  ArrowUpRight, Sparkles, Activity, Target, Award,
} from 'lucide-react'

export default function Dashboard() {
  const t = useT()
  const store = useStore()
  const analytics = store.analytics
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try { store.setAnalytics(await window.wa.getAnalytics() as Analytics) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  if (!analytics) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw size={24} className="text-text-muted animate-spin" />
    </div>
  )

  const currency = store.appSettings['currency'] || 'RM'
  const aiRate = analytics.msgs_today_out > 0 ? Math.round((analytics.ai_replies_today / analytics.msgs_today_out) * 100) : 0
  const responseRate = analytics.msgs_today_in > 0 ? Math.min(100, Math.round((analytics.msgs_today_out / analytics.msgs_today_in) * 100)) : 0
  const financeIncome = analytics.finance_income_total || 0
  const financeExpense = analytics.finance_expense_total || 0
  const financeProfit = analytics.finance_profit_total || 0

  return (
    <div className="h-full overflow-hidden flex flex-col bg-bg-primary">
      {/* Animated gradient bg */}
      <div className="absolute inset-0 pointer-events-none opacity-50">
        <div className="absolute top-0 left-0 w-96 h-96 bg-accent-green/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent-purple/5 rounded-full blur-3xl" />
      </div>

      {/* Header — compact */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-border/60 flex items-center justify-between relative z-10">
        <div>
          <h1 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Activity size={17} className="text-accent-green" /> {t('dashboard.title')}
          </h1>
          <p className="text-xxs text-text-muted">{new Date().toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-secondary border border-border flex items-center gap-1.5 transition-colors">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
        </button>
      </div>

      {/* Main content — fits viewport, no scroll */}
      <div className="flex-1 p-4 overflow-hidden relative z-10">
        <div className="h-full grid grid-cols-12 grid-rows-12 gap-3">

          {/* KPI Row — 4 cards */}
          <KPICard className="col-span-3 row-span-3" icon={MessageSquare} color="#25D366" label={t('dashboard.msgsToday')} value={analytics.msgs_today_in} sub={`${analytics.msgs_today_out} ${t('dashboard.sent')} · ${responseRate}%`} />
          <KPICard className="col-span-3 row-span-3" icon={Bell} color="#F85149" label={t('dashboard.unread')} value={analytics.unread_total} sub={t('dashboard.needsReply')} urgent={analytics.unread_total > 5} />
          <KPICard className="col-span-3 row-span-3" icon={Bot} color="#BC8CFF" label={t('dashboard.aiReplies')} value={analytics.ai_replies_today} sub={`${aiRate}% ${t('dashboard.aiRate')}`} />
          <KPICard className="col-span-3 row-span-3" icon={Users} color="#58A6FF" label={t('dashboard.totalCustomer')} value={analytics.total_contacts} sub={`${analytics.total_convs} ${t('dashboard.active')}`} />

          {/* Revenue card */}
          <div className="col-span-4 row-span-5 bg-gradient-to-br from-accent-green/15 via-emerald-500/5 to-transparent border border-accent-green/30 rounded-2xl p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center">
                <DollarSign size={15} className="text-accent-green" />
              </div>
              <p className="text-xs font-bold text-text-primary uppercase tracking-wider">{t('dashboard.revenue')}</p>
            </div>
            <p className="text-3xl font-bold text-accent-green leading-tight">{currency} {analytics.revenue_total.toFixed(2)}</p>
            <p className="text-xxs text-text-muted">{t('dashboard.received')}</p>
            <div className="mt-auto space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">{t('dashboard.pending')}</span>
                <span className="text-status-warning font-bold">{currency} {analytics.revenue_pending.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">{t('dashboard.activeOrders')}</span>
                <span className="text-accent-blue font-bold">{analytics.orders_pending}</span>
              </div>
              {(financeIncome > 0 || financeExpense > 0) && (
                <>
                  <div className="pt-1 border-t border-accent-green/20 flex justify-between items-center text-xs">
                    <span className="text-text-muted">Cash In</span>
                    <span className="text-accent-green font-bold">{currency} {financeIncome.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-muted">Expenses</span>
                    <span className="text-status-danger font-bold">{currency} {financeExpense.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-muted">Untung Bersih</span>
                    <span className={`font-bold ${financeProfit >= 0 ? 'text-accent-green' : 'text-status-danger'}`}>{currency} {financeProfit.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="h-1.5 rounded-full bg-bg-active overflow-hidden mt-2">
                <div className="h-full bg-gradient-to-r from-accent-green to-emerald-400" style={{ width: `${analytics.revenue_total > 0 ? (analytics.revenue_total / (analytics.revenue_total + analytics.revenue_pending)) * 100 : 0}%` }} />
              </div>
            </div>
          </div>

          {/* Week chart */}
          <div className="col-span-5 row-span-5 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-accent-blue" />
              <p className="text-xs font-bold text-text-primary uppercase tracking-wider">{t('dashboard.weekTrend')}</p>
            </div>
            <WeekChart data={analytics.msgs_week} />
          </div>

          {/* AI gauge */}
          <div className="col-span-3 row-span-5 bg-gradient-to-br from-accent-purple/15 to-transparent border border-accent-purple/30 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <div className="relative w-24 h-24 mb-2">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#30363D" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#BC8CFF" strokeWidth="2.5"
                  strokeDasharray={`${aiRate} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-2xl font-bold text-accent-purple">{aiRate}%</p>
              </div>
            </div>
            <p className="text-xs font-bold text-text-primary">{t('dashboard.aiPerformance')}</p>
            <p className="text-xxs text-text-muted">{analytics.ai_active} {t('dashboard.chatAiActive')}</p>
          </div>

          {/* Quick actions */}
          <div className="col-span-7 row-span-4 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap size={11} className="text-accent-orange" /> {t('dashboard.quickActions')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: Megaphone,   label: t('nav.broadcast'),  action: () => store.setSection('broadcast'), color: '#F78166', emoji: '📢' },
                { icon: Sparkles,    label: t('nav.insights'),   action: () => store.setSection('chats'),    color: '#BC8CFF', emoji: '🤖', special: true },
                { icon: ShoppingBag, label: t('nav.orders'),     action: () => store.setSection('orders'),    color: '#3FB950', emoji: '📦' },
                { icon: Bell,        label: t('nav.reminders'),  action: () => store.setSection('reminders'), color: '#D29922', emoji: '🔔' },
              ].map(({ icon: Icon, label, action, color, emoji, special }) => (
                <button key={label} onClick={action}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-all group relative overflow-hidden ${
                    special
                      ? 'border-accent-purple/40 bg-gradient-to-br from-accent-purple/10 to-transparent hover:from-accent-purple/20'
                      : 'border-border bg-bg-secondary hover:border-border/80 hover:bg-bg-hover'
                  }`}>
                  {special && <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-bl-md bg-accent-purple text-white text-[8px] font-bold">NEW</div>}
                  <span className="text-2xl">{emoji}</span>
                  <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Top customers */}
          <div className="col-span-5 row-span-4 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 overflow-hidden flex flex-col">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Award size={11} className="text-yellow-400" /> {t('dashboard.topCustomers')}
            </p>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {(analytics.top_contacts || []).slice(0, 4).map((c, i) => {
                const medals = ['🥇','🥈','🥉','4️⃣']
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-bg-hover transition-colors">
                    <span className="text-base">{medals[i]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">{c.name || c.phone}</p>
                      <p className="text-[10px] text-text-muted">{c.phone}</p>
                    </div>
                    <span className="text-xs font-bold text-accent-purple">{c.msg_count}</span>
                  </div>
                )
              })}
              {(!analytics.top_contacts || analytics.top_contacts.length === 0) && (
                <p className="text-xs text-text-muted text-center py-6">{t('dashboard.noData')}</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function KPICard({ icon: Icon, color, label, value, sub, urgent, className }: {
  icon: typeof MessageSquare; color: string; label: string; value: number; sub: string; urgent?: boolean; className?: string
}) {
  return (
    <div className={`relative bg-bg-tertiary/40 backdrop-blur border rounded-2xl p-4 overflow-hidden flex flex-col justify-between ${className} ${urgent ? 'border-status-warning/50' : 'border-border'}`}>
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10" style={{ background: color }} />
      <div className="flex items-center justify-between relative z-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
          <Icon size={16} style={{ color }} />
        </div>
        {urgent && <AlertCircle size={13} className="text-status-warning animate-pulse" />}
      </div>
      <div className="relative z-10">
        <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value.toLocaleString()}</p>
        <p className="text-[11px] font-semibold text-text-primary mt-0.5">{label}</p>
        <p className="text-[10px] text-text-muted">{sub}</p>
      </div>
    </div>
  )
}

function WeekChart({ data }: { data: { d: string; c: number }[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000)
    const key = d.toISOString().split('T')[0]
    const found = data.find(x => x.d === key)
    return { label: d.toLocaleDateString('ms-MY', { weekday: 'short' }), count: found ? Number(found.c) : 0, isToday: i === 6 }
  })
  const max = Math.max(...days.map(d => d.count), 1)
  return (
    <div className="flex-1 flex items-end gap-2">
      {days.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
          <span className="text-[10px] font-bold text-text-primary">{d.count}</span>
          <div className={`w-full rounded-t-md transition-all duration-500 ${d.isToday ? 'bg-gradient-to-t from-accent-green to-emerald-400' : 'bg-gradient-to-t from-accent-blue/60 to-accent-blue/30 hover:from-accent-blue/80 hover:to-accent-blue/50'}`}
            style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '6px' : '3px' }}
            title={`${d.label}: ${d.count}`} />
          <span className={`text-[10px] ${d.isToday ? 'text-accent-green font-bold' : 'text-text-muted'}`}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}
