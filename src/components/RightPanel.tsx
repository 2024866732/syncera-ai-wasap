import { useState, useEffect, useCallback } from 'react'
import { useStore, LABEL_META } from '../store'
import type { KBEntry, AIBackend, ConvLabel, RightPanelTab } from '../types'
import { Avatar } from './Sidebar'
import { useT } from '../i18n'
import {
  User, Bot, BookOpen, Plus, Trash2, Edit3, Save, X,
  ChevronDown, CheckCircle2, XCircle, Loader2, RefreshCw,
  Tag, StickyNote, ToggleLeft, ToggleRight, Zap,
} from 'lucide-react'

const TABS: { id: RightPanelTab; icon: typeof User; labelKey: string }[] = [
  { id: 'contact',   icon: User,     labelKey: 'panel.contact' },
  { id: 'ai',        icon: Bot,      labelKey: 'panel.ai' },
  { id: 'knowledge', icon: BookOpen, labelKey: 'panel.knowledge' },
]

export default function RightPanel() {
  const t = useT()
  const store   = useStore()
  const { rightTab, activeConvId } = store
  const conv    = store.conversations.find(c => c.id === activeConvId)

  if (!conv) return null

  return (
    <div className="w-[340px] flex-shrink-0 flex flex-col bg-bg-secondary border-l border-border animate-slide-in-right overflow-hidden">

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border flex-shrink-0">
        {TABS.map(({ id, icon: Icon, labelKey }) => (
          <button key={id}
            onClick={() => store.setRightTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2 ${
              rightTab === id
                ? 'border-accent-green text-accent-green'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}>
            <Icon size={13} />{t(labelKey)}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        {rightTab === 'contact'   && <ContactTab   conv={conv} />}
        {rightTab === 'ai'        && <AITab        conv={conv} />}
        {rightTab === 'knowledge' && <KnowledgeTab />}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTACT TAB
// ══════════════════════════════════════════════════════════════════════════════

function ContactTab({ conv }: { conv: ReturnType<typeof useStore>['conversations'][0] }) {
  const t = useT()
  const store = useStore()
  const [name,  setName]  = useState(conv.name || '')
  const [notes, setNotes] = useState(conv.notes || '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(() => { try { return JSON.parse(conv.tags || '[]') } catch { return [] } })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  const labels: ConvLabel[] = ['none','new_lead','customer','vip','support','closed']

  const save = async () => {
    setSaving(true)
    try {
      await window.wa.updateContact(conv.contact_id, { name, notes, tags: JSON.stringify(tags) })
      store.upsertConversation({ ...conv, name, notes, tags: JSON.stringify(tags) })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  const setLabel = async (label: ConvLabel) => {
    await window.wa.updateConversation(conv.id, { label })
    store.upsertConversation({ ...conv, label })
  }

  const msgs = store.messages[conv.id] || []
  const myCount    = msgs.filter(m => m.is_from_me).length
  const theirCount = msgs.filter(m => !m.is_from_me).length
  const aiCount    = msgs.filter(m => m.is_ai_reply).length

  return (
    <div className="p-4 space-y-5">
      {/* Avatar + phone */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <Avatar name={conv.name || conv.phone} size={64} />
        <p className="text-sm font-semibold text-text-primary">{conv.name || conv.phone}</p>
        <p className="text-xs text-text-muted">{conv.phone}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t('common.sent'),     value: myCount,    color: 'text-accent-green' },
          { label: t('reports.msgReceived').split(' ')[0] || 'Received', value: theirCount, color: 'text-accent-blue' },
          { label: t('panel.ai'),        value: aiCount,    color: 'text-accent-purple' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-bg-tertiary rounded-xl p-3 text-center border border-border">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-xxs text-text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Name */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <User size={11} /> {t('panel.displayName')}
        </label>
        <input value={name} onChange={e => setName(e.target.value)}
          className="field text-sm" placeholder={t('common.name')} />
      </div>

      {/* Label */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Tag size={11} /> {t('panel.label')}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {labels.map(lbl => {
            const meta = LABEL_META[lbl]
            const active = (conv.label || 'none') === lbl
            return (
              <button key={lbl} onClick={() => setLabel(lbl)}
                className={`text-xs py-1.5 px-2 rounded-lg border transition-all text-left ${
                  active ? 'border-opacity-50 font-medium' : 'border-border text-text-muted hover:bg-bg-hover'
                }`}
                style={active ? { borderColor: meta.color, color: meta.color, background: meta.color + '15' } : {}}>
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Tag size={11} /> {t('panel.tags')}
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map(tag => (
            <span key={tag} className="tag-chip bg-bg-active text-text-secondary flex items-center gap-1">
              {tag}
              <button onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:text-status-danger">
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
            placeholder={t('panel.addTag')} className="field text-xs flex-1" />
          <button onClick={addTag} className="btn-ghost text-xs">{t('common.add')}</button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <StickyNote size={11} /> {t('panel.notes')}
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder={t('panel.notesPh')}
          rows={4}
          className="field text-sm resize-none" />
      </div>

      <button onClick={save} disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
        {saved ? t('common.saved') : saving ? t('common.saving') : t('panel.saveContact')}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// AI TAB
// ══════════════════════════════════════════════════════════════════════════════

function AITab({ conv }: { conv: ReturnType<typeof useStore>['conversations'][0] }) {
  const t = useT()
  const store    = useStore()
  const backends = store.aiBackends
  const [detecting, setDetecting] = useState(false)
  const [testing,   setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [persona,   setPersona]   = useState(conv.ai_persona || '')
  const [saving,    setSaving]    = useState(false)

  // Selected backend:model string  "backendId:modelName"
  const [selected, setSelected] = useState(conv.ai_model || '')
  const [aiEnabled, setAiEnabled] = useState(!!conv.ai_enabled)
  const [delay, setDelay] = useState(() => store.appSettings['ai_reply_delay'] || '2000')

  const selectedBackendId = selected.split(':')[0] || ''
  const selectedModel     = selected.split(':').slice(1).join(':') || ''
  const currentBackend    = backends.find(b => b.id === selectedBackendId)

  const detectAI = async () => {
    setDetecting(true)
    try {
      const list = await window.wa.detectAI()
      store.setAiBackends(list)
    } finally { setDetecting(false) }
  }

  const testConnection = async () => {
    if (!currentBackend) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.wa.testAI(currentBackend.id, currentBackend.url, currentBackend.type)
      setTestResult(res.ok ? 'ok' : 'fail')
    } finally { setTesting(false) }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const updates: Partial<typeof conv> = {
        ai_enabled: aiEnabled ? 1 : 0,
        ai_model:   selected,
        ai_persona: persona,
      }
      await window.wa.updateConversation(conv.id, updates)
      store.upsertConversation({ ...conv, ...updates })
      await window.wa.setSetting('ai_reply_delay', delay)
      store.updateSetting('ai_reply_delay', delay)
    } finally { setSaving(false) }
  }

  const toggleAI = async (val: boolean) => {
    setAiEnabled(val)
    await window.wa.updateConversation(conv.id, { ai_enabled: val ? 1 : 0 })
    store.upsertConversation({ ...conv, ai_enabled: val ? 1 : 0 })
  }

  return (
    <div className="p-4 space-y-5">

      {/* AI Toggle */}
      <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-xl border border-border">
        <div>
          <p className="text-sm font-medium text-text-primary">{t('panel.autoReply')}</p>
          <p className="text-xs text-text-muted">{t('panel.autoReplyDesc')}</p>
        </div>
        <button onClick={() => toggleAI(!aiEnabled)}
          className={`transition-colors ${aiEnabled ? 'text-accent-blue' : 'text-text-muted'}`}>
          {aiEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
        </button>
      </div>

      {/* Detect AI section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('panel.detectedAI')}</label>
          <button onClick={detectAI} disabled={detecting}
            className="flex items-center gap-1 text-xxs text-accent-blue hover:text-blue-300 transition-colors">
            {detecting ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            {t('panel.scan')}
          </button>
        </div>

        {backends.length === 0 ? (
          <div className="bg-bg-tertiary rounded-xl p-4 border border-border text-center">
            <Bot size={24} className="text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-xs text-text-muted mb-2">No local AI detected</p>
            <p className="text-xxs text-text-muted">Install Ollama or LM Studio, then click Scan</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backends.map(b => (
              <div key={b.id}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedBackendId === b.id ? 'border-accent-blue bg-accent-blue/5' : 'border-border bg-bg-tertiary hover:border-border/80'
                }`}
                onClick={() => setSelected(`${b.id}:${b.models[0] || ''}`)}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-text-primary">{b.name}</p>
                  <span className="text-xxs bg-status-success/10 text-status-success px-2 py-0.5 rounded-full">Running</span>
                </div>
                <p className="text-xxs text-text-muted">{b.url}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Model selector */}
      {currentBackend && (
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">{t('panel.model')}</label>
          <div className="relative">
            <select
              value={selectedModel}
              onChange={e => setSelected(`${selectedBackendId}:${e.target.value}`)}
              className="field text-sm w-full appearance-none pr-8 cursor-pointer">
              {currentBackend.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          <button onClick={testConnection} disabled={testing}
            className={`mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              testResult === 'ok'   ? 'border-status-success text-status-success bg-status-success/5' :
              testResult === 'fail' ? 'border-status-danger  text-status-danger  bg-status-danger/5'  :
              'border-border text-text-muted hover:border-accent-blue hover:text-accent-blue'
            }`}>
            {testing ? <Loader2 size={12} className="animate-spin" /> :
             testResult === 'ok'   ? <CheckCircle2 size={12} /> :
             testResult === 'fail' ? <XCircle size={12} /> :
             <Zap size={12} />}
            {testing ? t('common.loading') : testResult === 'ok' ? t('common.success') : testResult === 'fail' ? t('common.failed') : t('panel.testConnection')}
          </button>
        </div>
      )}

      {/* Reply delay */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>{t('panel.replyDelay')}</span>
          <span className="text-accent-blue normal-case font-normal">{(parseInt(delay) / 1000).toFixed(1)}s</span>
        </label>
        <input type="range" min="500" max="10000" step="500" value={delay}
          onChange={e => setDelay(e.target.value)}
          className="w-full accent-accent-blue cursor-pointer" />
        <div className="flex justify-between text-xxs text-text-muted mt-1">
          <span>0.5s</span><span>5s</span><span>10s</span>
        </div>
      </div>

      {/* Custom persona */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
          {t('panel.customPersona')} <span className="normal-case text-text-muted font-normal">({t('common.optional')})</span>
        </label>
        <textarea value={persona} onChange={e => setPersona(e.target.value)}
          placeholder="e.g. You are a helpful sales assistant for XYZ Company. Always be professional and focus on our products…"
          rows={4}
          className="field text-sm resize-none w-full" />
        <p className="text-xxs text-text-muted mt-1">
          Overrides the default AI persona for this conversation. Leave blank to use global settings.
        </p>
      </div>

      <button onClick={saveSettings} disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE TAB
// ══════════════════════════════════════════════════════════════════════════════

const KB_CATEGORIES = ['Company Info', 'Products', 'Services', 'FAQ', 'Policies', 'Pricing', 'Contact Info', 'Custom']

function KnowledgeTab() {
  const t = useT()
  const store      = useStore()
  const { kbEntries } = store
  const [activeCategory, setActiveCategory] = useState('All')
  const [editEntry,  setEditEntry]  = useState<Partial<KBEntry> | null>(null)
  const [searchKB,   setSearchKB]   = useState('')
  const [saving,     setSaving]     = useState(false)

  const categories = ['All', ...Array.from(new Set(kbEntries.map(e => e.category)))]

  const filtered = kbEntries.filter(e => {
    const matchCat = activeCategory === 'All' || e.category === activeCategory
    const matchSearch = !searchKB || e.title.toLowerCase().includes(searchKB.toLowerCase()) || e.content.toLowerCase().includes(searchKB.toLowerCase())
    return matchCat && matchSearch
  })

  const save = async () => {
    if (!editEntry?.title || !editEntry?.content) return
    setSaving(true)
    try {
      await window.wa.saveKBEntry({ category: 'General', is_active: 1, ...editEntry } as KBEntry)
      const fresh = await window.wa.getKB()
      store.setKBEntries(fresh)
      setEditEntry(null)
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    await window.wa.deleteKBEntry(id)
    store.setKBEntries(kbEntries.filter(e => e.id !== id))
  }

  const toggleActive = async (entry: KBEntry) => {
    await window.wa.saveKBEntry({ ...entry, is_active: entry.is_active ? 0 : 1 })
    store.setKBEntries(kbEntries.map(e => e.id === entry.id ? { ...e, is_active: e.is_active ? 0 : 1 } : e))
  }

  if (editEntry !== null) {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{editEntry.id ? 'Edit Entry' : 'New Entry'}</h3>
          <button onClick={() => setEditEntry(null)} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-xs text-text-secondary mb-1 block">Category</label>
          <div className="relative">
            <select value={editEntry.category || 'General'}
              onChange={e => setEditEntry({ ...editEntry, category: e.target.value })}
              className="field text-sm w-full appearance-none pr-8">
              {KB_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="text-xs text-text-secondary mb-1 block">Title</label>
          <input value={editEntry.title || ''}
            onChange={e => setEditEntry({ ...editEntry, title: e.target.value })}
            placeholder="e.g. Office Hours, Return Policy, Product List…"
            className="field text-sm w-full" />
        </div>

        <div>
          <label className="text-xs text-text-secondary mb-1 block">Content</label>
          <textarea
            value={editEntry.content || ''}
            onChange={e => setEditEntry({ ...editEntry, content: e.target.value })}
            placeholder="Enter the information the AI should know and use when replying…"
            rows={8}
            className="field text-sm w-full resize-none" />
          <p className="text-xxs text-text-muted mt-1">{(editEntry.content || '').length} characters</p>
        </div>

        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !editEntry.title || !editEntry.content}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
          <button onClick={() => setEditEntry(null)} className="btn-ghost">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* KB Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">{t('panel.kbTitle')}</p>
            <p className="text-xxs text-text-muted">{kbEntries.filter(e => e.is_active).length} {t('panel.kbEntries')}</p>
          </div>
          <button onClick={() => setEditEntry({ category: 'General', title: '', content: '', is_active: 1 })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-colors">
            <Plus size={13} /> {t('common.add')}
          </button>
        </div>

        <input value={searchKB} onChange={e => setSearchKB(e.target.value)}
          placeholder={t('panel.kbSearch')}
          className="field text-xs w-full" />
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 px-4 py-2 overflow-x-auto flex-shrink-0">
        {categories.map(cat => (
          <button key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-xxs whitespace-nowrap px-2.5 py-1 rounded-full font-medium transition-colors flex-shrink-0 ${
              activeCategory === cat
                ? 'bg-accent-purple/15 text-accent-purple'
                : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover'
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <BookOpen size={28} className="text-text-muted opacity-30" />
            <p className="text-xs text-text-muted">
              {searchKB ? t('common.search') : t('panel.kbEmpty')}
            </p>
            <button onClick={() => setEditEntry({ category: 'General', title: '', content: '', is_active: 1 })}
              className="text-xs text-accent-green hover:underline mt-1">
              {t('panel.kbAddFirst')}
            </button>
          </div>
        ) : (
          filtered.map(entry => (
            <KBEntryCard key={entry.id}
              entry={entry}
              onEdit={() => setEditEntry(entry)}
              onDelete={() => entry.id && remove(entry.id)}
              onToggle={() => toggleActive(entry)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function KBEntryCard({ entry, onEdit, onDelete, onToggle }: {
  entry: KBEntry; onEdit: () => void; onDelete: () => void; onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`rounded-xl border p-3 transition-all ${entry.is_active ? 'border-border bg-bg-tertiary' : 'border-border/40 bg-bg-tertiary/50 opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xxs px-2 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple font-medium">
              {entry.category}
            </span>
            {!entry.is_active && (
              <span className="text-xxs text-text-muted">(disabled)</span>
            )}
          </div>
          <p className="text-xs font-medium text-text-primary truncate">{entry.title}</p>
          {!expanded && (
            <p className="text-xxs text-text-muted mt-0.5 line-clamp-2">{entry.content}</p>
          )}
          {expanded && (
            <p className="text-xs text-text-secondary mt-1.5 whitespace-pre-wrap leading-relaxed">{entry.content}</p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onToggle}
            className={`text-xxs px-2 py-1 rounded-md transition-colors ${entry.is_active ? 'text-status-success hover:bg-status-success/10' : 'text-text-muted hover:bg-bg-hover'}`}>
            {entry.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          </button>
          <button onClick={onEdit} className="text-text-muted hover:text-accent-blue transition-colors p-1">
            <Edit3 size={12} />
          </button>
          <button onClick={onDelete} className="text-text-muted hover:text-status-danger transition-colors p-1">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
