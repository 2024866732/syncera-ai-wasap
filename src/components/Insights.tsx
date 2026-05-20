import { useEffect, useState, useMemo } from 'react'
import { useStore } from '../store'
import { Sparkles, TrendingUp, MessageSquare, Bot, Clock, Target, Zap, AlertCircle, Award, Users } from 'lucide-react'
import { useT } from '../i18n'

export default function Insights() {
  const t = useT()
  const store = useStore()
  const { conversations, contacts } = store
  const [analytics, setAnalytics] = useState<unknown>(null)

  useEffect(() => { window.wa.getAnalytics().then(setAnalytics) }, [])

  const a = analytics as { msgs_today_in: number; msgs_today_out: number; ai_replies_today: number; ai_active: number; revenue_total: number; revenue_pending: number } | null

  const insights = useMemo(() => {
    const list: { title: string; desc: string; color: string; emoji: string }[] = []
    if (!a) return list
    const aiRate = a.msgs_today_out > 0 ? Math.round((a.ai_replies_today / a.msgs_today_out) * 100) : 0
    if (aiRate > 70) list.push({ title: 'AI Doing Heavy Lifting', desc: `${aiRate}% balasan hari ni dari AI`, color: '#BC8CFF', emoji: '🤖' })
    if (aiRate < 30 && a.msgs_today_in > 5) list.push({ title: 'AI Under-Utilized', desc: `Cuma ${aiRate}% reply guna AI`, color: '#D29922', emoji: '⚠️' })
    const responseRatio = a.msgs_today_in > 0 ? a.msgs_today_out / a.msgs_today_in : 0
    if (responseRatio < 0.5 && a.msgs_today_in > 5) list.push({ title: 'Response Rate Low', desc: `Banyak customer tertunggu reply`, color: '#F85149', emoji: '⏰' })
    if (responseRatio >= 1) list.push({ title: 'Excellent Response', desc: 'Semua mesej dah dijawab — proactive!', color: '#3FB950', emoji: '🏆' })
    const newLeads = conversations.filter(c => c.label === 'new_lead').length
    if (newLeads > 5) list.push({ title: `${newLeads} Lead Baru`, desc: `Belum di-convert. Masa untuk follow-up!`, color: '#58A6FF', emoji: '🎯' })
    const vipCount = conversations.filter(c => c.label === 'vip').length
    if (vipCount > 0) list.push({ title: `${vipCount} VIP Customer`, desc: 'Treat them like royalty', color: '#D29922', emoji: '⭐' })
    if (a.revenue_pending > 0) list.push({ title: 'Outstanding Payment', desc: `RM${a.revenue_pending.toFixed(0)} pending`, color: '#F78166', emoji: '💸' })
    if (!list.length) list.push({ title: 'Semua Smooth', desc: 'Operasi balanced. Continue!', color: '#3FB950', emoji: '✨' })
    return list.slice(0, 4)  // cap at 4 to fit one page
  }, [a, conversations])

  const labelCounts = useMemo(() => {
    const counts = { new_lead: 0, customer: 0, vip: 0, support: 0, closed: 0, none: 0 }
    for (const c of conversations) counts[c.label || 'none']++
    return counts
  }, [conversations])

  const aiRate = a?.msgs_today_out ? Math.round((a.ai_replies_today/a.msgs_today_out)*100) : 0

  return (
    <div className="h-full overflow-hidden flex flex-col bg-bg-primary relative">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none opacity-50">
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-accent-purple/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-accent-blue/5 blur-3xl" />
      </div>

      {/* Compact header */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-border/60 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-fuchsia-600 flex items-center justify-center shadow-lg shadow-accent-purple/40">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">{t('insights.title')}</h1>
            <p className="text-xxs text-text-muted">{t('insights.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* One-page grid */}
      <div className="flex-1 p-4 overflow-hidden relative z-10">
        <div className="h-full grid grid-cols-12 grid-rows-12 gap-3">

          {/* 4 KPI cards top row */}
          <BigStat className="col-span-3 row-span-3" label="Mesej Today" value={(a?.msgs_today_in || 0) + (a?.msgs_today_out || 0)} sub={`${a?.msgs_today_in || 0} in · ${a?.msgs_today_out || 0} out`} color="#58A6FF" icon={MessageSquare} />
          <BigStat className="col-span-3 row-span-3" label="AI Replies" value={a?.ai_replies_today || 0} sub={`${conversations.filter(c => c.ai_enabled).length} active`} color="#BC8CFF" icon={Bot} />
          <BigStat className="col-span-3 row-span-3" label="Customers" value={contacts.length} sub={`${conversations.length} conversations`} color="#3FB950" icon={Users} />
          <BigStat className="col-span-3 row-span-3" label="Revenue Pending" value={`RM${(a?.revenue_pending || 0).toFixed(0)}`} sub={`RM${(a?.revenue_total || 0).toFixed(0)} received`} color="#F78166" icon={Target} />

          {/* Recommendations */}
          <div className="col-span-6 row-span-5 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 overflow-hidden flex flex-col">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap size={12} className="text-accent-orange" /> Recommendations
            </p>
            <div className="grid grid-cols-2 gap-2 flex-1 overflow-hidden">
              {insights.map((ins, i) => (
                <div key={i} className="bg-bg-secondary border rounded-xl p-2.5 flex items-start gap-2"
                  style={{ borderColor: `${ins.color}30` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: `${ins.color}15`, border: `1px solid ${ins.color}30` }}>
                    {ins.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-text-primary truncate">{ins.title}</p>
                    <p className="text-[9px] text-text-muted leading-snug line-clamp-2">{ins.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Performance gauge */}
          <div className="col-span-3 row-span-5 bg-gradient-to-br from-accent-purple/15 to-transparent border border-accent-purple/30 rounded-2xl p-4 flex flex-col items-center justify-center">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Bot size={11} className="text-accent-purple" /> AI Performance
            </p>
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#30363D" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#BC8CFF" strokeWidth="2.5"
                  strokeDasharray={`${aiRate} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-bold text-accent-purple">{aiRate}%</p>
                <p className="text-[9px] text-text-muted uppercase tracking-wider">AI Rate</p>
              </div>
            </div>
            <p className="text-[10px] text-text-muted text-center mt-2 leading-tight">{a?.ai_replies_today || 0} dari {a?.msgs_today_out || 0} reply</p>
          </div>

          {/* Conversion Funnel */}
          <div className="col-span-3 row-span-5 bg-gradient-to-br from-accent-green/10 to-transparent border border-accent-green/30 rounded-2xl p-4 flex flex-col">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp size={11} className="text-accent-green" /> {t('insights.conversionFunnel')}
            </p>
            <div className="space-y-2 flex-1 flex flex-col justify-center">
              <FunnelStep label="New Leads" count={labelCounts.new_lead} max={Math.max(labelCounts.new_lead, 1)} color="#58A6FF" />
              <FunnelStep label="In Support" count={labelCounts.support}  max={Math.max(labelCounts.new_lead, 1)} color="#F78166" />
              <FunnelStep label="Customers" count={labelCounts.customer} max={Math.max(labelCounts.new_lead, 1)} color="#3FB950" />
              <FunnelStep label="VIP"       count={labelCounts.vip}      max={Math.max(labelCounts.new_lead, 1)} color="#D29922" />
            </div>
          </div>

          {/* Customer distribution full-width */}
          <div className="col-span-12 row-span-4 bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-4 flex flex-col">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users size={12} className="text-accent-blue" /> Customer Distribution
            </p>
            <DistributionBar counts={labelCounts} />
          </div>
        </div>
      </div>
    </div>
  )
}

function BigStat({ label, value, sub, color, icon: Icon, className }: { label: string; value: number | string; sub: string; color: string; icon: React.ElementType; className?: string }) {
  return (
    <div className={`relative bg-bg-tertiary/40 backdrop-blur border border-border rounded-2xl p-3.5 overflow-hidden flex flex-col justify-between ${className}`}>
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10" style={{ background: color }} />
      <div className="flex items-center justify-between relative z-10">
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
          <Icon size={13} />
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
        <p className="text-[10px] text-text-muted truncate">{sub}</p>
      </div>
    </div>
  )
}

function DistributionBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const stages = [
    { label: 'No Label',  key: 'none',     color: '#6E7681' },
    { label: 'New Leads', key: 'new_lead', color: '#58A6FF' },
    { label: 'Support',   key: 'support',  color: '#F78166' },
    { label: 'Customer',  key: 'customer', color: '#3FB950' },
    { label: 'VIP',       key: 'vip',      color: '#D29922' },
    { label: 'Closed',    key: 'closed',   color: '#6E7681' },
  ]
  return (
    <div className="flex-1 flex flex-col justify-center">
      <div className="flex h-3 rounded-full overflow-hidden bg-bg-active mb-3">
        {stages.map(s => {
          const pct = (counts[s.key] / total) * 100
          if (pct === 0) return null
          return <div key={s.key} title={`${s.label}: ${counts[s.key]}`} style={{ width: `${pct}%`, background: s.color }} />
        })}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {stages.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[10px] text-text-secondary truncate">{s.label}</span>
            <span className="text-[10px] font-bold text-text-primary ml-auto">{counts[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FunnelStep({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = (count / max) * 100
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="font-bold text-text-primary">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-active overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}80)` }} />
      </div>
    </div>
  )
}
