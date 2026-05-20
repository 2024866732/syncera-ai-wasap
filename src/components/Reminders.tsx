import { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { Reminder, Contact } from '../store'
import { Plus, Bell, Trash2, X, Save, Loader2, CheckCircle2, Clock, ChevronDown, Send } from 'lucide-react'
import { useT } from '../i18n'

export default function Reminders() {
  const t = useT()
  const store     = useStore()
  const reminders = store.reminders
  const contacts  = store.contacts
  const [filter,  setFilter]  = useState<'all'|'pending'|'fired'>('pending')
  const [editing, setEditing] = useState<Partial<Reminder> | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [sending, setSending] = useState<string | null>(null)

  useEffect(() => {
    window.wa.getReminders(undefined).then(r => store.setReminders(r as Reminder[]))
  }, [])

  const filtered = reminders.filter(r => filter === 'all' ? true : r.status === filter)

  const save = async () => {
    if (!editing?.title || !editing?.contact_id || !editing?.remind_at) return
    setSaving(true)
    try {
      await window.wa.saveReminder({ status:'pending', message:'', repeat_rule:'none', ...editing } as Reminder)
      const fresh = await window.wa.getReminders(undefined)
      store.setReminders(fresh as Reminder[])
      setEditing(null)
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    await window.wa.deleteReminder(id)
    store.setReminders(reminders.filter(r => r.id !== id))
  }

  const sendNow = async (reminder: Reminder) => {
    setSending(reminder.id || null)
    const contact = contacts.find(c => c.id === reminder.contact_id)
    if (!contact) { setSending(null); return }
    const jid = `${contact.phone}@s.whatsapp.net`
    await window.wa.sendMessage(jid, reminder.message || reminder.title)
    await window.wa.saveReminder({ ...reminder, status: 'fired' })
    const fresh = await window.wa.getReminders(undefined)
    store.setReminders(fresh as Reminder[])
    setSending(null)
  }

  if (editing !== null) {
    const localNow = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)
    return (
      <div className="h-full overflow-y-auto bg-bg-primary">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">{editing.id ? 'Edit Peringatan' : 'Peringatan Baru'}</h2>
            <button onClick={() => setEditing(null)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
          </div>

          <div className="space-y-4 bg-bg-tertiary border border-border rounded-2xl p-5">
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Customer</label>
              <div className="relative">
                <select value={editing.contact_id||''} onChange={e => setEditing({...editing, contact_id: e.target.value})}
                  className="field text-sm w-full appearance-none pr-8">
                  <option value="">-- Pilih Customer --</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name||c.phone}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Tajuk Peringatan</label>
              <input value={editing.title||''} onChange={e => setEditing({...editing, title: e.target.value})}
                placeholder="Contoh: Follow up order, Peringatan bayaran..." className="field text-sm w-full" />
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Mesej (optional)</label>
              <textarea value={editing.message||''} onChange={e => setEditing({...editing, message: e.target.value})}
                placeholder="Mesej yang akan dihantar kepada customer apabila peringatan ini dicetuskan..." rows={4} className="field text-sm w-full resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block font-medium">Tarikh & Masa Peringatan</label>
                <input type="datetime-local" min={localNow} value={editing.remind_at?.slice(0,16)||''}
                  onChange={e => setEditing({...editing, remind_at: new Date(e.target.value).toISOString()})}
                  className="field text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block font-medium">Ulang</label>
                <div className="relative">
                  <select value={editing.repeat_rule||'none'} onChange={e => setEditing({...editing, repeat_rule: e.target.value})}
                    className="field text-sm w-full appearance-none pr-8">
                    <option value="none">Sekali sahaja</option>
                    <option value="daily">Harian</option>
                    <option value="weekly">Mingguan</option>
                    <option value="monthly">Bulanan</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={save} disabled={saving || !editing.title || !editing.contact_id || !editing.remind_at} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Menyimpan...' : 'Simpan Peringatan'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost">Batal</button>
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
            <h1 className="text-xl font-bold text-text-primary">{t('reminders.title')}</h1>
            <p className="text-sm text-text-muted">{t('reminders.subtitle')}</p>
          </div>
          <button onClick={() => setEditing({ repeat_rule:'none' })} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> {t('reminders.new')}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Belum Selesai', value: reminders.filter(r=>r.status==='pending').length, color: 'text-status-warning' },
            { label: 'Sudah Dicetuskan', value: reminders.filter(r=>r.status==='fired').length, color: 'text-accent-green' },
            { label: 'Jumlah', value: reminders.length, color: 'text-accent-blue' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-bg-tertiary border border-border rounded-xl p-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-text-muted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(['pending','all','fired'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filter===f ? 'bg-accent-green/15 text-accent-green font-medium' : 'bg-bg-tertiary text-text-muted border border-border hover:bg-bg-hover'}`}>
              {f==='pending'?'Menunggu':f==='all'?'Semua':'Sudah Selesai'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <Bell size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Tiada peringatan</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const isPast   = new Date(r.remind_at) < new Date() && r.status === 'pending'
              const dateStr  = new Date(r.remind_at).toLocaleString('ms-MY', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
              return (
                <div key={r.id} className={`bg-bg-tertiary border rounded-xl p-4 ${isPast ? 'border-status-warning/40' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${r.status==='fired' ? 'bg-accent-green/10' : isPast ? 'bg-status-warning/10' : 'bg-accent-blue/10'}`}>
                        {r.status==='fired' ? <CheckCircle2 size={16} className="text-accent-green" /> : isPast ? <Bell size={16} className="text-status-warning" /> : <Clock size={16} className="text-accent-blue" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{r.title}</p>
                        <p className="text-xs text-text-muted">{r.name || r.phone}</p>
                        {r.message && <p className="text-xs text-text-secondary mt-1 line-clamp-2">{r.message}</p>}
                        <p className={`text-xxs mt-1.5 font-medium flex items-center gap-1 ${isPast ? 'text-status-warning' : 'text-text-muted'}`}>
                          <Clock size={9} /> {isPast ? '⚠️ ' : ''}{dateStr}
                          {r.repeat_rule !== 'none' && ` · Ulang ${r.repeat_rule==='daily'?'harian':r.repeat_rule==='weekly'?'mingguan':'bulanan'}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {r.status === 'pending' && r.message && (
                        <button onClick={() => sendNow(r)} disabled={sending === r.id}
                          className="flex items-center gap-1 text-xxs px-2 py-1 rounded-lg bg-accent-green/10 text-accent-green hover:bg-accent-green/20 transition-colors">
                          {sending === r.id ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                          Hantar
                        </button>
                      )}
                      <button onClick={() => r.id && del(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-status-danger/10 text-text-muted hover:text-status-danger transition-colors">
                        <Trash2 size={12} />
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
