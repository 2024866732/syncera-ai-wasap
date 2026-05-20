import { useState, useEffect } from 'react'
import { useStore, LABEL_META } from '../store'
import { useT } from '../i18n'
import type { Broadcast as BroadcastType, Contact } from '../store'
import { Plus, Send, Trash2, Users, CheckCircle2, X, Save, Loader2, Megaphone, ChevronDown, AlertTriangle } from 'lucide-react'

export default function Broadcast() {
  const t = useT()
  const store      = useStore()
  const broadcasts = store.broadcasts
  const contacts   = store.contacts
  const [composing, setComposing] = useState(false)
  const [draft,     setDraft]     = useState<Partial<BroadcastType>>({ title:'', message:'', label_filter:'', contact_ids:[] })
  const [saving,    setSaving]    = useState(false)
  const [sending,   setSending]   = useState<string | null>(null)
  const [result,    setResult]    = useState<{ sent: number; fail: number } | null>(null)
  const [progress,  setProgress]  = useState<Record<string, { sent: number; fail: number; total: number; status: string }>>({})
  const [selAll,    setSelAll]    = useState(false)

  useEffect(() => {
    window.wa.getBroadcasts().then(b => store.setBroadcasts(b as BroadcastType[]))

    // Live progress updates from main process
    const off = window.wa.on('broadcast:progress', (d) => {
      const p = d as { id: string; sent: number; fail: number; total: number; status: string }
      if (!p?.id) return
      setProgress(prev => ({ ...prev, [p.id]: { sent: p.sent || 0, fail: p.fail || 0, total: p.total || 0, status: p.status || 'sending' } }))
      if (p.status === 'done') {
        setSending(null)
        setTimeout(() => setProgress(prev => { const { [p.id]: _x, ...rest } = prev; return rest }), 8000)
      }
    })
    return () => { off?.() }
  }, [])

  const toggleContact = (id: string) => {
    const ids = draft.contact_ids || []
    setDraft({ ...draft, contact_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] })
  }

  const labelContacts = draft.label_filter ? contacts.filter(c => c.label === draft.label_filter) : []
  const selectedIds   = draft.contact_ids || []
  const totalTargets  = draft.label_filter ? new Set([...selectedIds, ...labelContacts.map(c => c.id)]).size : selectedIds.length

  const save = async () => {
    if (!draft.title || !draft.message) return
    setSaving(true)
    try {
      const id = await window.wa.saveBroadcast(draft as BroadcastType)
      const fresh = await window.wa.getBroadcasts()
      store.setBroadcasts(fresh as BroadcastType[])
      setComposing(false)
      setDraft({ title:'', message:'', label_filter:'', contact_ids:[] })
    } finally { setSaving(false) }
  }

  const sendNow = async (id: string) => {
    setSending(id); setResult(null)
    setProgress(prev => ({ ...prev, [id]: { sent: 0, fail: 0, total: 0, status: 'starting' } }))
    try {
      const res = await window.wa.sendBroadcast(id) as { ok: boolean; sent: number; fail: number }
      if (res.ok) setResult({ sent: res.sent, fail: res.fail })
      const fresh = await window.wa.getBroadcasts()
      store.setBroadcasts(fresh as BroadcastType[])
    } finally { setSending(null) }
  }

  const del = async (id: string) => {
    await window.wa.deleteBroadcast(id)
    store.setBroadcasts(broadcasts.filter(b => b.id !== id))
  }

  if (composing) {
    const previewMsg = (draft.message||'').replace(/\{nama\}/g,'Ali Ahmad').replace(/\{telefon\}/g,'01XXXXXXXX')
    return (
      <div className="h-full overflow-y-auto bg-bg-primary">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">{t('broadcast.compose')}</h2>
            <button onClick={() => setComposing(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
          </div>

          <div className="bg-bg-tertiary border border-border rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Nama Broadcast</label>
              <input value={draft.title||''} onChange={e => setDraft({...draft, title: e.target.value})}
                placeholder="Contoh: Promo Raya 2025, Flash Sale Jumaat..." className="field text-sm w-full" />
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Mesej</label>
              <div className="flex gap-1 mb-1.5">
                {['{nama}','{telefon}','{tarikh}'].map(v => (
                  <button key={v} onClick={() => setDraft({...draft, message: (draft.message||'')+v})}
                    className="text-xxs px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 font-mono transition-colors">{v}</button>
                ))}
              </div>
              <textarea value={draft.message||''} onChange={e => setDraft({...draft, message: e.target.value})}
                placeholder="Taip mesej broadcast anda di sini..." rows={6} className="field text-sm w-full resize-none" />
              {previewMsg && (
                <div className="mt-2 p-3 bg-bg-hover rounded-lg border border-border/50">
                  <p className="text-xxs text-text-muted mb-1">PREVIEW (contoh):</p>
                  <p className="text-xs text-text-secondary whitespace-pre-wrap">{previewMsg}</p>
                </div>
              )}
            </div>

            {/* Target selection */}
            <div>
              <label className="text-xs text-text-secondary mb-2 block font-medium">Hantar Kepada</label>
              <div className="space-y-3">
                {/* By label */}
                <div>
                  <p className="text-xxs text-text-muted mb-1">Hantar kepada label:</p>
                  <div className="relative">
                    <select value={draft.label_filter||''} onChange={e => setDraft({...draft, label_filter: e.target.value})}
                      className="field text-sm w-full appearance-none pr-8">
                      <option value="">-- Pilih label (optional) --</option>
                      {Object.entries(LABEL_META).filter(([k])=>k!=='none').map(([k,v]) => (
                        <option key={k} value={k}>{v.label} ({contacts.filter(c=>c.label===k).length} orang)</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                </div>
                {/* Manual select */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xxs text-text-muted">Atau pilih secara manual:</p>
                    <button onClick={() => { setSelAll(!selAll); setDraft({...draft, contact_ids: selAll ? [] : contacts.map(c=>c.id)}) }}
                      className="text-xxs text-accent-blue hover:underline">{selAll ? 'Nyahpilih Semua' : 'Pilih Semua'}</button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                    {contacts.slice(0,50).map(c => (
                      <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-bg-hover cursor-pointer">
                        <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleContact(c.id)}
                          className="accent-accent-green" />
                        <span className="text-xs text-text-primary">{c.name || c.phone}</span>
                        <span className="text-xxs text-text-muted">{c.phone}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-accent-green mt-2 font-medium">✓ Jumlah penerima: {totalTargets} orang</p>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-status-warning/5 border border-status-warning/20 rounded-lg">
              <AlertTriangle size={14} className="text-status-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary">
                Pastikan mesej tidak mengandungi spam. WhatsApp boleh sekat akaun jika terlalu banyak broadcast dalam masa singkat. Elakkan hantar lebih dari 200 mesej sehari.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={save} disabled={saving || !draft.title || !draft.message} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Menyimpan...' : 'Simpan Draft'}
            </button>
            <button onClick={() => setComposing(false)} className="btn-ghost">Batal</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-bg-primary">
      <div className="max-w-4xl mx-auto p-6 space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t('broadcast.title')}</h1>
            <p className="text-sm text-text-muted">{t('broadcast.subtitle')}</p>
          </div>
          <button onClick={() => setComposing(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> {t('broadcast.new')}
          </button>
        </div>

        {result && (
          <div className="flex items-center gap-3 p-4 bg-accent-green/5 border border-accent-green/20 rounded-xl animate-fade-in">
            <CheckCircle2 size={18} className="text-accent-green" />
            <p className="text-sm text-text-primary">
              Broadcast selesai! <strong className="text-accent-green">{result.sent} berjaya</strong>
              {result.fail > 0 && <>, <strong className="text-status-danger">{result.fail} gagal</strong></>}
            </p>
            <button onClick={() => setResult(null)} className="ml-auto text-text-muted"><X size={14} /></button>
          </div>
        )}

        {broadcasts.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <Megaphone size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm mb-2">{t('broadcast.empty')}</p>
            <button onClick={() => setComposing(true)} className="text-xs text-accent-green hover:underline">{t('broadcast.createFirst')}</button>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => {
              const ids = (() => { try { return JSON.parse(b.contact_ids as unknown as string||'[]') as string[] } catch { return [] } })()
              const count = b.label_filter ? contacts.filter(c=>c.label===b.label_filter).length + ids.length : ids.length
              return (
                <div key={b.id} className="bg-bg-tertiary border border-border rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-text-primary">{b.title}</p>
                        <span className={`text-xxs px-2 py-0.5 rounded-full font-medium ${b.status==='sent' ? 'bg-accent-green/10 text-accent-green' : 'bg-bg-hover text-text-muted'}`}>
                          {b.status==='sent' ? 'Dihantar' : 'Draft'}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary line-clamp-2">{b.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-xxs text-text-muted">
                        <span className="flex items-center gap-1"><Users size={10} /> {count} penerima</span>
                        {b.label_filter && <span>Label: {LABEL_META[b.label_filter as keyof typeof LABEL_META]?.label}</span>}
                        {b.status==='sent' && <span>✓ {b.sent_count} berjaya · {b.fail_count} gagal</span>}
                      </div>

                      {!!b.id && progress[b.id] && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xxs text-text-muted mb-1">
                            <span>Progress</span>
                            <span className="font-medium text-text-secondary">
                              {progress[b.id].sent + progress[b.id].fail}/{progress[b.id].total || count}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-bg-hover overflow-hidden border border-border/40">
                            <div
                              className="h-full bg-accent-green/70"
                              style={{
                                width: `${Math.min(100, Math.round(((progress[b.id].sent + progress[b.id].fail) / Math.max(1, (progress[b.id].total || count))) * 100))}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 text-xxs text-text-muted">
                            {progress[b.id].status === 'done'
                              ? `Selesai: ${progress[b.id].sent} berjaya · ${progress[b.id].fail} gagal`
                              : `Menghantar… ${progress[b.id].sent} berjaya · ${progress[b.id].fail} gagal`}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      {b.status !== 'sent' && (
                        <button onClick={() => b.id && sendNow(b.id)} disabled={sending === b.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-colors">
                          {sending === b.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          {sending === b.id ? 'Menghantar...' : 'Hantar Sekarang'}
                        </button>
                      )}
                      <button onClick={() => b.id && del(b.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-status-danger/10 text-text-muted hover:text-status-danger transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
