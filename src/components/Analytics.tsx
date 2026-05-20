import { useEffect, useState } from 'react'
import { useStore, LABEL_META, ORDER_STATUS } from '../store'
import { useT } from '../i18n'
import type { Analytics as AnalyticsType } from '../store'
import { RefreshCw, TrendingUp, Users, Bot, DollarSign, MessageSquare, BarChart2 } from 'lucide-react'

export default function Analytics() {
  const t = useT()
  const store     = useStore()
  const analytics = store.analytics
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try { store.setAnalytics(await window.wa.getAnalytics() as AnalyticsType) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const orders   = store.orders
  const currency = store.appSettings['currency'] || 'RM'

  const statusCounts = Object.keys(ORDER_STATUS).reduce((acc, k) => {
    acc[k] = orders.filter(o => o.status === k).length; return acc
  }, {} as Record<string, number>)

  const labelCounts = Object.keys(LABEL_META).reduce((acc, k) => {
    acc[k] = store.contacts.filter(c => c.label === k).length; return acc
  }, {} as Record<string, number>)

  if (!analytics) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw size={24} className="text-text-muted animate-spin" />
    </div>
  )

  const aiPct = analytics.msgs_today_out > 0 ? Math.round((analytics.ai_replies_today / analytics.msgs_today_out) * 100) : 0
  const totalRevenue = orders.filter(o => o.paid).reduce((s, o) => s + o.amount, 0)
  const pendingRevenue = orders.filter(o => !o.paid && o.status !== 'cancelled').reduce((s, o) => s + o.amount, 0)
  const financeIncome = analytics.finance_income_total || 0
  const financeExpense = analytics.finance_expense_total || 0
  const financeProfit = analytics.finance_profit_total || 0

  return (
    <div className="h-full overflow-hidden flex flex-col bg-bg-primary relative">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-green/5 rounded-full blur-3xl" />
      </div>

      {/* Compact header */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-border/60 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-blue/20 to-cyan-500/20 border border-accent-blue/30 flex items-center justify-center">
            <BarChart2 size={18} className="text-accent-blue" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">{t('analytics.title')}</h1>
            <p className="text-xxs text-text-muted">{t('analytics.subtitle')}</p>
          </div>
        </div>
        <button onClick={refresh} disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-secondary border border-border flex items-center gap-1.5 transition-colors">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
        </button>
      </div>

      {/* Single-page grid 12x12 */}
      <div className="flex-1 p-4 overflow-hidden relative z-10">
        <div className="h-full grid grid-cols-12 grid-rows-12 gap-3">

          {/* Top row — 4 KPIs */}
          <Stat className="col-span-3 row-span-3" label={t('analytics.receivedToday')}   value={analytics.msgs_today_in}    color="#58A6FF" icon={MessageSquare} />
          <Stat className="col-span-3 row-span-3" label={t('analytics.sentToday')}   value={analytics.msgs_today_out}   color="#3FB950" icon={MessageSquare} />
          <Stat className="col-span-3 row-span-3" label={t('analytics.aiReplyToday')}   value={analytics.ai_replies_today} color="#BC8CFF" icon={Bot} />
          <Stat className="col-span-3 row-span-3" label={t('analytics.aiRate')}          value={`${aiPct}%`}                color="#F78166" icon={Bot} />

          {/* Middle row */}
          {/* Week chart */}
          <div className="col-span-6 row-span-5 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp size={11} className="text-accent-blue" /> {t('dashboard.weekTrend')}
              </p>
            </div>
            <WeekBarChart data={analytics.msgs_week} />
          </div>

          {/* Customer Segments */}
          <div className="col-span-3 row-span-5 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 flex flex-col">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users size={11} className="text-accent-purple" /> Segmen Customer
            </p>
            <div className="flex-1 flex flex-col justify-center gap-1.5 overflow-hidden">
              {Object.entries(LABEL_META).map(([key, meta]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                    <span className="text-[11px] text-text-primary truncate">{meta.label}</span>
                  </div>
                  <span className="text-xs font-bold text-text-primary">{labelCounts[key] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Performance gauge */}
          <div className="col-span-3 row-span-5 bg-gradient-to-br from-accent-purple/15 to-transparent border border-accent-purple/30 rounded-2xl p-4 flex flex-col items-center justify-center">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Bot size={11} className="text-accent-purple" /> Prestasi AI
            </p>
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#30363D" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#BC8CFF" strokeWidth="2.5"
                  strokeDasharray={`${aiPct} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-accent-purple">{aiPct}%</p>
              </div>
            </div>
            <div className="mt-2 text-center">
              <p className="text-[11px] font-bold text-text-primary">{analytics.ai_active} chat AI aktif</p>
              <p className="text-[9px] text-text-muted">{analytics.ai_replies_today} reply hari ni</p>
            </div>
          </div>

          {/* Revenue */}
          <div className="col-span-4 row-span-4 bg-gradient-to-br from-accent-green/15 to-transparent border border-accent-green/30 rounded-2xl p-4 flex flex-col">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign size={11} className="text-accent-green" /> Revenue
            </p>
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-2xl font-bold text-accent-green">{currency} {totalRevenue.toFixed(0)}</p>
              <p className="text-[10px] text-text-muted">Diterima</p>
              <div className="flex justify-between mt-2 text-[11px]">
                <span className="text-text-muted">Pending:</span>
                <span className="text-status-warning font-bold">{currency} {pendingRevenue.toFixed(0)}</span>
              </div>
              <div className="flex justify-between mt-1 text-[11px]">
                <span className="text-text-muted">Total Order:</span>
                <span className="text-accent-blue font-bold">{orders.length}</span>
              </div>
              {(financeIncome > 0 || financeExpense > 0) && (
                <div className="mt-2 pt-2 border-t border-border/70 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-text-muted">Cash In:</span>
                    <span className="text-accent-green font-bold">{currency} {financeIncome.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-text-muted">Expenses:</span>
                    <span className="text-status-danger font-bold">{currency} {financeExpense.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-text-muted">Untung:</span>
                    <span className={`font-bold ${financeProfit >= 0 ? 'text-accent-green' : 'text-status-danger'}`}>{currency} {financeProfit.toFixed(0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Order Status */}
          <div className="col-span-5 row-span-4 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 flex flex-col">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              📦 Status Order
            </p>
            <div className="flex-1 grid grid-cols-5 gap-2">
              {Object.entries(ORDER_STATUS).map(([key, meta]) => (
                <div key={key} className="text-center p-2 bg-bg-secondary rounded-xl border border-border/60 flex flex-col justify-center">
                  <p className="text-xl font-bold" style={{ color: meta.color }}>{statusCounts[key] || 0}</p>
                  <p className="text-[9px] text-text-muted uppercase tracking-wide truncate">{meta.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top contacts */}
          <div className="col-span-3 row-span-4 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 flex flex-col overflow-hidden">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              🏆 Customer Aktif
            </p>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {(analytics.top_contacts || []).slice(0, 4).map((c, i) => {
                const medals = ['🥇','🥈','🥉','4']
                return (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="text-base">{medals[i]}</span>
                    <p className="text-[10px] text-text-primary truncate flex-1">{c.name || c.phone}</p>
                    <span className="text-xs font-bold text-accent-purple">{c.msg_count}</span>
                  </div>
                )
              })}
              {(!analytics.top_contacts || analytics.top_contacts.length === 0) && (
                <p className="text-[10px] text-text-muted text-center py-2">Tiada data</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color, icon: Icon, className }: { label: string; value: number | string; color: string; icon: React.ElementType; className?: string }) {
  return (
    <div className={`relative bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-3.5 overflow-hidden flex flex-col justify-between ${className}`}>
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10" style={{ background: color }} />
      <div className="flex items-center justify-between relative z-10">
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
          <Icon size={13} />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight relative z-10" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  )
}

function WeekBarChart({ data }: { data: { d: string; c: number }[] }) {
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
        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
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
