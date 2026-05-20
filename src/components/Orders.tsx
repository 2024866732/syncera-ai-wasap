import { useState, useEffect } from 'react'
import { useStore, ORDER_STATUS } from '../store'
import { useT } from '../i18n'
import type { Order, Contact } from '../store'
import {
  Plus, Edit3, Trash2, Search, X, Save, Loader2,
  DollarSign, CheckCircle2, ChevronDown, Send, ShoppingBag,
} from 'lucide-react'

const STATUS_OPTIONS = ['new','processing','shipped','completed','cancelled']

export default function Orders() {
  const t = useT()
  const store   = useStore()
  const orders  = store.orders
  const contacts = store.contacts
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState<'all'|'unpaid'|'pending'|'completed'>('all')
  const [editing, setEditing] = useState<Partial<Order> | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)

  useEffect(() => {
    window.wa.getOrders(undefined).then(o => store.setOrders(o as Order[]))
  }, [])

  const filtered = orders.filter(o => {
    const matchS = !search || (o.name||'').toLowerCase().includes(search.toLowerCase()) || o.title.toLowerCase().includes(search.toLowerCase())
    const matchF = filter === 'all' ? true
                 : filter === 'unpaid'    ? !o.paid && o.status !== 'cancelled'
                 : filter === 'pending'   ? ['new','processing','shipped'].includes(o.status)
                 : filter === 'completed' ? o.status === 'completed'
                 : true
    return matchS && matchF
  })

  const totalRevenue = orders.filter(o => o.paid).reduce((s, o) => s + (o.amount || 0), 0)
  const totalPending = orders.filter(o => !o.paid && o.status !== 'cancelled').reduce((s, o) => s + (o.amount || 0), 0)

  const save = async () => {
    if (!editing?.title || !editing?.contact_id) return
    setSaving(true)
    try {
      const id = await window.wa.saveOrder(editing as Order)
      const fresh = await window.wa.getOrders(undefined)
      store.setOrders(fresh as Order[])
      setEditing(null)
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    await window.wa.deleteOrder(id)
    store.setOrders(orders.filter(o => o.id !== id))
  }

  const togglePaid = async (order: Order) => {
    const updated = { ...order, paid: order.paid ? 0 : 1, paid_at: order.paid ? '' : new Date().toISOString() }
    await window.wa.saveOrder(updated)
    store.setOrders(orders.map(o => o.id === order.id ? { ...o, paid: updated.paid, paid_at: updated.paid_at } : o))
  }

  const sendPaymentReminder = async (order: Order) => {
    setSendingReminder(order.id || null)
    const contact = contacts.find(c => c.id === order.contact_id)
    if (!contact) { setSendingReminder(null); return }
    const jid = `${contact.phone}@s.whatsapp.net`
    const msg = `Salam ${contact.name || 'tuan/puan'}! 🙏\n\nSekadar peringatan mesra bahawa pembayaran untuk *${order.title}* sebanyak *RM${order.amount.toFixed(2)}* masih belum diterima.\n\nSila hubungi kami jika ada pertanyaan. Terima kasih!`
    await window.wa.sendMessage(jid, msg)
    setSendingReminder(null)
  }

  const currency = store.appSettings['currency'] || 'RM'

  if (editing !== null) {
    return (
      <div className="h-full overflow-y-auto bg-bg-primary">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">{editing.id ? 'Edit Order' : 'Order Baru'}</h2>
            <button onClick={() => setEditing(null)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
          </div>

          <div className="space-y-4 bg-bg-tertiary border border-border rounded-2xl p-5">
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Customer *</label>
              <div className="relative">
                <select value={editing.contact_id || ''} onChange={e => setEditing({...editing, contact_id: e.target.value})}
                  className="field text-sm w-full appearance-none pr-8">
                  <option value="">-- Pilih Customer --</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name || c.phone}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Tajuk Order *</label>
              <input value={editing.title || ''} onChange={e => setEditing({...editing, title: e.target.value})}
                placeholder="Contoh: Baju Kurung Saiz M x2, Tudung Bawal x3..." className="field text-sm w-full" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block font-medium">Jumlah ({currency})</label>
                <input type="number" min="0" step="0.01" value={editing.amount || ''} onChange={e => setEditing({...editing, amount: parseFloat(e.target.value)||0})}
                  placeholder="0.00" className="field text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block font-medium">Status</label>
                <div className="relative">
                  <select value={editing.status || 'new'} onChange={e => setEditing({...editing, status: e.target.value as Order['status']})}
                    className="field text-sm w-full appearance-none pr-8">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{ORDER_STATUS[s]?.label || s}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block font-medium">Tarikh Perlu Bayar</label>
                <input type="date" value={editing.due_date || ''} onChange={e => setEditing({...editing, due_date: e.target.value})}
                  className="field text-sm w-full" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div onClick={() => setEditing({...editing, paid: editing.paid ? 0 : 1})}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${editing.paid ? 'bg-accent-green' : 'bg-bg-active'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${editing.paid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-text-primary">Sudah Bayar</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1.5 block font-medium">Nota</label>
              <textarea value={editing.notes || ''} onChange={e => setEditing({...editing, notes: e.target.value})}
                placeholder="Nota tambahan..." rows={3} className="field text-sm w-full resize-none" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={save} disabled={saving || !editing.title || !editing.contact_id} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Menyimpan...' : 'Simpan Order'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost">Batal</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-bg-primary">
      <div className="max-w-5xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t('orders.title')}</h1>
            <p className="text-sm text-text-muted">{t('orders.subtitle')}</p>
          </div>
          <button onClick={() => setEditing({ status: 'new', paid: 0, amount: 0 })} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> {t('orders.new')}
          </button>
        </div>

        {/* Revenue summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Jumlah Diterima',  value: `${currency} ${totalRevenue.toFixed(2)}`,  color: 'text-accent-green', bg: 'bg-accent-green/10' },
            { label: 'Belum Diterima',   value: `${currency} ${totalPending.toFixed(2)}`,  color: 'text-status-warning', bg: 'bg-status-warning/10' },
            { label: 'Jumlah Order',     value: String(orders.length),                     color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="bg-bg-tertiary border border-border rounded-xl p-4">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-text-muted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari order atau customer..."
              className="field text-sm pl-8 w-full" />
          </div>
          {(['all','unpaid','pending','completed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${filter === f ? 'bg-accent-green/15 text-accent-green font-medium' : 'bg-bg-tertiary text-text-muted border border-border hover:bg-bg-hover'}`}>
              {f === 'all' ? 'Semua' : f === 'unpaid' ? 'Belum Bayar' : f === 'pending' ? 'Dalam Proses' : 'Selesai'}
            </button>
          ))}
        </div>

        {/* Orders list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <ShoppingBag size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Tiada order ditemui</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(order => {
              const s = ORDER_STATUS[order.status] || { label: order.status, color: '#6E7681' }
              return (
                <div key={order.id} className="bg-bg-tertiary border border-border rounded-xl p-4 hover:border-border/80 transition-all group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: s.color + '20', color: s.color }}>{s.label}</span>
                        {order.paid ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green font-medium flex items-center gap-1"><CheckCircle2 size={10} /> Bayar</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-status-warning/10 text-status-warning font-medium">Belum Bayar</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-text-primary">{order.title}</p>
                      <p className="text-xs text-text-muted">{order.name || order.phone}</p>
                      {order.notes && <p className="text-xs text-text-secondary mt-1">{order.notes}</p>}
                      {order.due_date && <p className="text-xxs text-text-muted mt-1">Bayar sebelum: {new Date(order.due_date).toLocaleDateString('ms-MY')}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                      <p className="text-lg font-bold text-text-primary">{currency} {(order.amount||0).toFixed(2)}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => togglePaid(order)}
                          className={`text-xxs px-2 py-1 rounded-lg transition-colors ${order.paid ? 'bg-status-warning/10 text-status-warning' : 'bg-accent-green/10 text-accent-green'}`}>
                          {order.paid ? 'Tandakan Belum Bayar' : '✓ Dah Bayar'}
                        </button>
                        {!order.paid && (
                          <button onClick={() => sendPaymentReminder(order)} disabled={sendingReminder === order.id}
                            className="text-xxs px-2 py-1 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors flex items-center gap-1">
                            {sendingReminder === order.id ? <Loader2 size={9} className="animate-spin" /> : <Send size={9} />}
                            Reminder
                          </button>
                        )}
                        <button onClick={() => setEditing(order)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-bg-hover text-text-muted">
                          <Edit3 size={11} />
                        </button>
                        <button onClick={() => order.id && del(order.id)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-status-danger/10 text-text-muted hover:text-status-danger">
                          <Trash2 size={11} />
                        </button>
                      </div>
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
