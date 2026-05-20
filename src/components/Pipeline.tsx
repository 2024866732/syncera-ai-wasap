import { useState, useEffect } from 'react'
import { useStore, LABEL_META } from '../store'
import type { ConvLabel } from '../store'
import type { Conversation } from '../types'
import { Avatar } from './Sidebar'
import { GripVertical, MessageSquare, Bot, Phone, Sparkles, TrendingUp, KanbanSquare } from 'lucide-react'
import { useT } from '../i18n'

const STAGE_DEFS: { label: ConvLabel; titleKey: string; emoji: string; color: string; gradient: string }[] = [
  { label: 'new_lead', titleKey: 'pipeline.newLead',  emoji: '🆕', color: '#58A6FF', gradient: 'from-blue-500/20 to-blue-500/0' },
  { label: 'support',  titleKey: 'pipeline.support',  emoji: '🛠️', color: '#F78166', gradient: 'from-orange-500/20 to-orange-500/0' },
  { label: 'customer', titleKey: 'pipeline.customer', emoji: '✅', color: '#3FB950', gradient: 'from-green-500/20 to-green-500/0' },
  { label: 'vip',      titleKey: 'pipeline.vip',      emoji: '⭐', color: '#D29922', gradient: 'from-yellow-500/20 to-yellow-500/0' },
  { label: 'closed',   titleKey: 'pipeline.closed',   emoji: '💤', color: '#6E7681', gradient: 'from-gray-500/20 to-gray-500/0' },
]

export default function Pipeline() {
  const t = useT()
  const STAGES = STAGE_DEFS.map(s => ({ ...s, title: t(s.titleKey), description: '' }))
  const store = useStore()
  const conversations = store.conversations
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [hoverStage, setHoverStage] = useState<ConvLabel | null>(null)

  const moveToStage = async (convId: string, newLabel: ConvLabel) => {
    const conv = conversations.find(c => c.id === convId)
    if (!conv || conv.label === newLabel) return
    // Update conversation label
    await window.wa.updateContact(conv.contact_id, { label: newLabel })
    store.upsertConversation({ ...conv, label: newLabel })
    // Refresh contacts
    const contacts = await window.wa.getAllContacts()
    store.setContacts(contacts as Parameters<typeof store.setContacts>[0])
  }

  // Stats
  const totalLeads = conversations.length
  const conversionRate = totalLeads ? Math.round((conversations.filter(c => c.label === 'customer' || c.label === 'vip').length / totalLeads) * 100) : 0
  const aiHandled = conversations.filter(c => c.ai_enabled).length

  return (
    <div className="h-full overflow-hidden flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-5 border-b border-border/60 bg-bg-secondary/40 backdrop-blur">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple/20 to-fuchsia-500/20 border border-accent-purple/30 flex items-center justify-center">
              <KanbanSquare size={20} className="text-accent-purple" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary tracking-tight">{t('pipeline.title')}</h1>
              <p className="text-xs text-text-muted">{t('pipeline.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Top stats row */}
        <div className="grid grid-cols-3 gap-3">
          <KPIStat label="Total Customers" value={totalLeads} icon={<MessageSquare size={14} />} color="#58A6FF" />
          <KPIStat label="Conversion Rate" value={`${conversionRate}%`} icon={<TrendingUp size={14} />} color="#3FB950" trend={conversionRate > 30 ? 'up' : 'down'} />
          <KPIStat label="AI-Handled" value={aiHandled} icon={<Sparkles size={14} />} color="#BC8CFF" />
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-4 p-5 min-w-max">
          {STAGES.map(stage => {
            const items = conversations.filter(c => (c.label || 'none') === stage.label)
            const isHover = hoverStage === stage.label
            return (
              <div
                key={stage.label}
                onDragOver={e => { e.preventDefault(); setHoverStage(stage.label) }}
                onDragLeave={() => setHoverStage(null)}
                onDrop={() => {
                  if (draggedId) moveToStage(draggedId, stage.label)
                  setDraggedId(null); setHoverStage(null)
                }}
                className={`w-[300px] flex-shrink-0 flex flex-col rounded-2xl border transition-all ${
                  isHover ? 'bg-bg-tertiary border-accent-green/40 scale-[1.01]' : 'bg-bg-secondary/40 border-border/40'
                }`}
              >
                {/* Column header with gradient */}
                <div className={`relative px-4 py-3 rounded-t-2xl bg-gradient-to-b ${stage.gradient} border-b border-border/40`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{stage.emoji}</span>
                      <h3 className="text-sm font-bold text-text-primary">{stage.title}</h3>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: `${stage.color}20`, color: stage.color }}>
                      {items.length}
                    </span>
                  </div>
                  <p className="text-xxs text-text-muted">{stage.description}</p>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-center py-12 px-3">
                      <p className="text-xs text-text-muted">Drag customer ke sini</p>
                    </div>
                  ) : items.map(conv => (
                    <CustomerCard
                      key={conv.id}
                      conv={conv}
                      stageColor={stage.color}
                      onDragStart={() => setDraggedId(conv.id)}
                      onClick={() => {
                        store.setActiveConv(conv.id)
                        store.setSection('chats')
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function KPIStat({ label, value, icon, color, trend }: { label: string; value: number | string; icon: React.ReactNode; color: string; trend?: 'up' | 'down' }) {
  return (
    <div className="bg-bg-tertiary/60 backdrop-blur border border-border rounded-xl p-3 hover:border-border/80 transition-colors">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xxs text-text-muted uppercase tracking-wider font-semibold">{label}</p>
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, color }}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
        {trend && <span className={`text-xs ${trend === 'up' ? 'text-status-success' : 'text-status-danger'}`}>{trend === 'up' ? '↑' : '↓'}</span>}
      </div>
    </div>
  )
}

function CustomerCard({ conv, stageColor, onDragStart, onClick }: { conv: Conversation; stageColor: string; onDragStart: () => void; onClick: () => void }) {
  const tags: string[] = (() => { try { return JSON.parse(conv.tags || '[]') } catch { return [] } })()
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-bg-secondary border border-border rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-accent-green/40 hover:bg-bg-hover transition-all group shadow-sm"
      style={{ borderLeftColor: stageColor, borderLeftWidth: '3px' }}
    >
      <div className="flex items-start gap-2.5">
        <GripVertical size={14} className="text-text-muted/40 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        <Avatar name={conv.name || conv.phone} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-sm font-semibold text-text-primary truncate">{conv.name || conv.phone}</p>
            {conv.ai_enabled ? <Bot size={11} className="text-accent-blue flex-shrink-0" /> : null}
          </div>
          <div className="flex items-center gap-1 text-xxs text-text-muted">
            <Phone size={9} />
            <span className="truncate">{conv.phone}</span>
          </div>
          {conv.last_message && (
            <p className="text-xxs text-text-secondary line-clamp-2 mt-1.5 italic">"{conv.last_message}"</p>
          )}
          {tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {tags.slice(0, 3).map(t => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-active text-text-secondary">#{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
