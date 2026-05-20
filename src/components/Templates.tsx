import { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { Template } from '../store'
import { Plus, Edit3, Trash2, Zap, Copy, Search, X, Save, Loader2, ChevronDown } from 'lucide-react'
import { useT } from '../i18n'

const CATEGORIES = ['Salam', 'Maklumat Produk', 'Harga', 'Bayaran', 'Follow Up', 'Penghantaran', 'Promosi', 'Terima Kasih', 'Lain-lain']
const VARIABLES  = ['{nama}', '{telefon}', '{tarikh}', '{jumlah}', '{produk}', '{no_order}']

export default function Templates() {
  const tr = useT()
  const store     = useStore()
  const templates = store.templates
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState('All')
  const [editing,  setEditing]  = useState<Partial<Template> | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [copied,   setCopied]   = useState<string | null>(null)

  const cats = ['All', ...Array.from(new Set(templates.map(t => t.category)))]

  const filtered = templates.filter(t => {
    const matchCat = category === 'All' || t.category === category
    const matchS   = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.body.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchS
  })

  const save = async () => {
    if (!editing?.title || !editing?.body) return
    setSaving(true)
    try {
      await window.wa.saveTemplate({ category: 'Lain-lain', ...editing } as Template)
      const fresh = await window.wa.getTemplates()
      store.setTemplates(fresh as Template[])
      setEditing(null)
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    await window.wa.deleteTemplate(id)
    store.setTemplates(templates.filter(t => t.id !== id))
  }

  const copyText = (body: string, id?: string) => {
    navigator.clipboard.writeText(body)
    setCopied(id || body)
    setTimeout(() => setCopied(null), 2000)
  }

  if (editing !== null) {
    return (
      <div className="h-full overflow-y-auto bg-bg-primary">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">{editing.id ? 'Edit Template' : 'Template Baru'}</h2>
            <button onClick={() => setEditing(null)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
          </div>

          <div className="space-y-4 bg-bg-tertiary border border-border rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block font-medium">Kategori</label>
                <div className="relative">
                  <select value={editing.category || 'Lain-lain'} onChange={e => setEditing({...editing, category: e.target.value})}
                    className="field text-sm w-full appearance-none pr-8">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block font-medium">Nama Template</label>
                <input value={editing.title || ''} onChange={e => setEditing({...editing, title: e.target.value})}
                  placeholder="Contoh: Sambut Customer Baru" className="field text-sm w-full" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-secondary font-medium">Isi Mesej</label>
                <div className="flex gap-1">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => setEditing({...editing, body: (editing.body||'') + v})}
                      className="text-xxs px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors font-mono">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={editing.body || ''} onChange={e => setEditing({...editing, body: e.target.value})}
                placeholder="Taip mesej template anda di sini. Guna {nama} untuk nama customer..."
                rows={8} className="field text-sm w-full resize-none" />
              <p className="text-xxs text-text-muted mt-1">{(editing.body||'').length} karakter</p>
            </div>

            <div className="bg-bg-hover rounded-xl p-3 border border-border/50">
              <p className="text-xxs text-text-muted mb-1 font-medium">PREVIEW</p>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {(editing.body||'').replace(/\{nama\}/g,'Ali Bin Ahmad').replace(/\{telefon\}/g,'01XXXXXXXX').replace(/\{tarikh\}/g,new Date().toLocaleDateString('ms-MY')).replace(/\{jumlah\}/g,'150.00').replace(/\{produk\}/g,'Produk A').replace(/\{no_order\}/g,'ORD-001') || 'Preview akan muncul di sini...'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={save} disabled={saving || !editing.title || !editing.body} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Menyimpan...' : 'Simpan Template'}
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

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{tr('templates.title')}</h1>
            <p className="text-sm text-text-muted">{tr('templates.subtitle')}</p>
          </div>
          <button onClick={() => setEditing({ category: 'Lain-lain', title: '', body: '' })} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> {tr('templates.new')}
          </button>
        </div>

        {/* Starter templates */}
        {templates.length === 0 && (
          <div className="bg-bg-tertiary border border-border rounded-2xl p-5">
            <p className="text-sm font-semibold text-text-primary mb-3">🚀 Mula dengan template popular</p>
            <div className="grid grid-cols-2 gap-2">
              {STARTER_TEMPLATES.map(t => (
                <button key={t.title} onClick={async () => {
                  await window.wa.saveTemplate(t)
                  const fresh = await window.wa.getTemplates()
                  store.setTemplates(fresh as Template[])
                }}
                  className="text-left p-3 bg-bg-hover rounded-xl border border-border hover:border-accent-green/30 hover:bg-bg-active transition-all">
                  <p className="text-xs font-medium text-text-primary">{t.title}</p>
                  <p className="text-xxs text-text-muted mt-0.5 line-clamp-2">{t.body}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search + filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari template..."
              className="field text-sm pl-8 w-full" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"><X size={12} /></button>}
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {cats.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${category === c ? 'bg-accent-green/15 text-accent-green font-medium' : 'bg-bg-tertiary text-text-muted border border-border hover:bg-bg-hover'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Templates grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <Zap size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Tiada template ditemui</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map(t => (
              <div key={t.id} className="bg-bg-tertiary border border-border rounded-xl p-4 hover:border-border/80 transition-all group">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xxs px-2 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue font-medium">{t.category}</span>
                    <p className="text-sm font-semibold text-text-primary mt-1.5">{t.title}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => copyText(t.body, t.id)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${copied === t.id ? 'bg-accent-green/10 text-accent-green' : 'hover:bg-bg-hover text-text-muted'}`}>
                      <Copy size={12} />
                    </button>
                    <button onClick={() => setEditing(t)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-bg-hover text-text-muted transition-colors">
                      <Edit3 size={12} />
                    </button>
                    <button onClick={() => t.id && del(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-status-danger/10 text-text-muted hover:text-status-danger transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-secondary line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                {t.usage_count! > 0 && (
                  <p className="text-xxs text-text-muted mt-2">Digunakan {t.usage_count} kali</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const STARTER_TEMPLATES: Template[] = [
  { category: 'Salam',           title: 'Salam Pembuka',       body: 'Assalamualaikum {nama}! 👋\n\nTerima kasih kerana menghubungi kami. Apa yang boleh kami bantu hari ini?' },
  { category: 'Harga',           title: 'Hantar Senarai Harga',body: 'Terima kasih kerana bertanya! 😊\n\nBerikut adalah senarai harga kami:\n\n{produk}\n\nUntuk maklumat lanjut, sila hubungi kami.' },
  { category: 'Bayaran',         title: 'Peringatan Bayaran',  body: 'Salam {nama},\n\nSekadar peringatan mesra bahawa bayaran sebanyak RM{jumlah} masih belum diterima.\n\nSila lakukan bayaran sebelum {tarikh}. Terima kasih! 🙏' },
  { category: 'Penghantaran',    title: 'Konfirmasi Order',    body: 'Salam {nama}! ✅\n\nOrder anda (No: {no_order}) telah disahkan.\n\nJumlah: RM{jumlah}\nPenghantaran: {tarikh}\n\nTerima kasih kerana membeli dengan kami!' },
  { category: 'Follow Up',       title: 'Follow Up Pelanggan', body: 'Salam {nama}! 😊\n\nSekadar ingin follow up mengenai pertanyaan anda baru-baru ini. Adakah anda masih berminat atau ada soalan lain?\n\nKami sedia membantu!' },
  { category: 'Terima Kasih',    title: 'Ucapan Terima Kasih', body: 'Terima kasih kerana membeli dengan kami {nama}! 🙏❤️\n\nKami harap anda berpuas hati dengan produk/perkhidmatan kami. Jangan ragu untuk hubungi kami jika ada sebarang pertanyaan.' },
]
