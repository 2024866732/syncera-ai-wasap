import { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { Contact } from '../store'
import {
  X, Sparkles, Loader2, Send, Search, CheckCircle2, RefreshCw, Users, Target,
  Wand2, Paperclip, Image as ImageIcon, FileText, Bot, BrainCircuit, ShieldCheck,
  MessageSquareText, RotateCcw, Gift, ClipboardCheck, PenLine, Cake, SlidersHorizontal,
  Database, Cpu, Clock3,
} from 'lucide-react'
import { useRef } from 'react'

// Pick one element randomly
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

// Polite Malay address based on contact name (fallback to "tuan/puan")
function addressFor(name: string | undefined): string {
  if (!name || /^\d+$/.test(name)) return 'tuan/puan'
  // Strip leading honorifics already in the name
  const clean = name.replace(/^(encik|puan|cik|tuan|dato|datin|dr|prof)\b\s*/i, '').trim()
  return clean || name
}

// ─── DETERMINISTIC PER-GOAL TEMPLATES (Malaysian Malay formal) ─────────────
function generateGoalTemplate(goalId: string, contact: Contact, businessName: string): string {
  const name = addressFor(contact.name)
  const biz = businessName || 'pasukan kami'
  const greet = pick(['Salam sejahtera', 'Hai', 'Selamat sejahtera'])

  switch (goalId) {
    case 'greet':
      return pick([
        `${greet} ${name}! Saya dari ${biz}. Terima kasih kerana menghubungi kami. Boleh saya tahu apa yang ${name} perlukan hari ini? Kami sedia membantu 🙏`,
        `${greet} ${name}! Saya dari ${biz}, sedia menyokong keperluan anda. Boleh anda kongsikan sedikit apa yang ${name} sedang cari? Saya akan susulkan dengan info yang sesuai.`,
        `${greet} ${name}! Terima kasih meluangkan masa. Saya ${biz} — kami spesifik dalam memberikan perkhidmatan terbaik kepada pelanggan. Bagaimana saya boleh membantu anda?`,
        `Hai ${name} 👋 Saya wakil dari ${biz}. Adakah anda memerlukan bantuan untuk sesuatu? Boleh kongsikan keperluan anda — kami akan cuba penuhi sebaik mungkin.`,
      ])

    case 'reactivate':
      return pick([
        `${greet} ${name}! Sudah lama kami tidak mendengar khabar daripada anda. Apa khabar? Sekiranya ada apa-apa keperluan, ${biz} sentiasa di sini untuk membantu.`,
        `Hai ${name}, ingin menyapa anda. Sudah beberapa waktu kita tidak berhubung — semoga semuanya baik. Kalau ${name} ada apa-apa yang perlu disusulkan dengan kami, jangan segan untuk bertanya.`,
        `${greet} ${name}! Lama tak jumpa anda di WhatsApp kami 😊 Hanya ingin pastikan anda dalam keadaan baik. ${biz} masih menawarkan perkhidmatan yang sama dan ada beberapa penambahbaikan baru — beritahu jika anda berminat untuk tahu.`,
        `${greet} ${name}, harap anda sihat. Kami di ${biz} ingin tahu jika ada peluang untuk berkhidmat semula kepada anda. Boleh balas mesej ini bila lapang ya.`,
      ])

    case 'promo':
      return pick([
        `${greet} ${name}! 🎁 Berita baik — ${biz} sedang menawarkan promosi eksklusif untuk pelanggan kami. Adakah anda berminat untuk mengetahui lebih lanjut? Tawaran terhad sahaja.`,
        `Hai ${name}! Kami di ${biz} ada offer special untuk anda. Diskaun istimewa untuk tempahan minggu ini. Boleh saya kongsikan butiran lanjut?`,
        `${greet} ${name}! ${biz} ingin memaklumkan tentang promosi terbaru kami yang sangat menarik. Tertarik untuk dapatkan info lengkap? Reply mesej ini ya.`,
        `Hai ${name} 🎉 Ada offer terhad untuk anda dari ${biz} bulan ini. Khusus untuk pelanggan terpilih sahaja. Beritahu saya jika anda berminat — saya akan susulkan dengan butiran.`,
      ])

    case 'followup':
      return pick([
        `${greet} ${name}, saya dari ${biz} ingin menyusul status order anda dengan kami. Adakah anda perlukan bantuan tambahan? Kami sedia membantu jika ada sebarang isu.`,
        `Hai ${name}, hanya ingin follow-up tentang order ${name} dengan kami. Adakah semuanya berjalan lancar? Sekiranya ada apa-apa pertanyaan, jangan segan untuk bertanya.`,
        `${greet} ${name}! Ingin memastikan order ${name} di ${biz} dalam keadaan baik. Boleh kongsikan jika ada apa-apa yang perlu diperbaiki atau memerlukan susulan dari pihak kami?`,
        `Hai ${name}, terima kasih kerana memilih ${biz}. Saya ingin menyemak status pesanan anda — adakah anda telah menerima/menggunakannya dengan memuaskan?`,
      ])

    case 'survey':
      return pick([
        `${greet} ${name}! Terima kasih atas sokongan anda terhadap ${biz}. Boleh saya tahu pendapat anda tentang perkhidmatan kami? Maklum balas anda amat dihargai untuk kami menambah baik.`,
        `Hai ${name}, hanya ingin mengetahui pengalaman anda dengan ${biz}. Adakah ${name} berpuas hati dengan perkhidmatan kami? Apa yang boleh kami perbaiki?`,
        `${greet} ${name}! Hanya 30 saat untuk soalan ringkas — bagaimana penilaian anda terhadap servis ${biz}? Kongsikan dengan kami supaya kami boleh terus berikan yang terbaik untuk anda.`,
        `Hai ${name} 🙏 Maklum balas anda penting untuk kami. Boleh anda kongsikan sedikit pengalaman dengan ${biz} — apa yang baik dan apa yang boleh kami tingkatkan?`,
      ])

    case 'birthday':
      return pick([
        `${greet} ${name}! 🎂 Selamat Hari Lahir daripada keluarga ${biz}! Semoga ${name} sentiasa dilimpahi kebahagiaan dan kesihatan.`,
        `Hai ${name}, kami di ${biz} ingin mengucapkan Selamat Hari Lahir 🎉 Sebagai tanda penghargaan, kami ada hadiah istimewa untuk anda — beritahu jika anda berminat untuk tahu lebih lanjut.`,
        `${greet} ${name}! 🎂 Selamat Hari Jadi! Doa terbaik dari ${biz} untuk anda — semoga sentiasa berjaya dalam segala urusan.`,
        `Salam Hari Lahir ${name} 🎁 Daripada seluruh pasukan ${biz}, kami doakan tahun ini lebih cemerlang untuk anda. Teruskan menjadi pelanggan istimewa kami!`,
      ])

    default:
      return `${greet} ${name}! Saya dari ${biz}. Boleh saya tahu apa yang ${name} perlukan? Kami sedia membantu.`
  }
}

const GOALS = [
  { id: 'greet',      label: 'Pengenalan Pelanggan', desc: 'Sambutan awal dan kenal pasti keperluan', prompt: 'Sapa customer dengan mesra, perkenalkan bisnes secara ringkas, tanya apa yang dia cari atau perlukan. Jangan terlalu pushy. Pendek, friendly.' },
  { id: 'reactivate', label: 'Aktifkan Semula',      desc: 'Hubungi pelanggan yang lama tidak aktif',  prompt: 'Sapa customer yang dah lama tak hubung kami. Tanya khabar, ingatkan kami available kalau dia perlu apa-apa. Jangan jual produk dulu — fokus rekoneksi.' },
  { id: 'promo',      label: 'Kempen Promosi',       desc: 'Maklumkan tawaran atau diskaun terpilih',  prompt: 'Inform customer pasal promo terkini secara excited tapi tak spammy. Sebut apa promo, sampai bila, dan bagaimana proceed. Pendek.' },
  { id: 'followup',   label: 'Susulan Pesanan',      desc: 'Semak status pesanan atau bayaran',        prompt: 'Follow up customer tentang order/payment yang masih outstanding. Friendly tone, tanya kalau ada masalah atau perlu bantuan, offer flexibility.' },
  { id: 'survey',     label: 'Maklum Balas Servis',  desc: 'Dapatkan ulasan selepas servis selesai',   prompt: 'Tanya customer macam mana experience dengan servis kami. Adakah satisfied? Ada anything boleh improve? Pendek, sincere.' },
  { id: 'birthday',   label: 'Ucapan Bermusim',      desc: 'Ucapan hari lahir, musim perayaan, tawaran', prompt: 'Wish customer Selamat Hari Lahir / festive season. Boleh sebut sikit special offer khusus untuk dia (kalau ada bisnes bagi). Mesra, personal.' },
  { id: 'custom',     label: 'Arahan Tersuai',       desc: 'Gunakan arahan manual untuk AI',           prompt: '' },
]

const goalIcons: Record<string, typeof MessageSquareText> = {
  greet: MessageSquareText,
  reactivate: RotateCcw,
  promo: Gift,
  followup: ClipboardCheck,
  survey: PenLine,
  birthday: Cake,
  custom: SlidersHorizontal,
}

export default function AIOutreach({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const contacts = store.contacts
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [goalId, setGoalId] = useState<string>('greet')
  const [customPrompt, setCustomPrompt] = useState('')
  const [search, setSearch] = useState('')
  const [generating, setGenerating] = useState(false)
  const [previewMsg, setPreviewMsg] = useState('')
  const [previewContact, setPreviewContact] = useState<Contact | null>(null)
  const [sending, setMenghantar] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [labelFilter, setLabelFilter] = useState<string>('all')
  const [attachment, setAttachment] = useState<{ base64: string; mimeType: string; fileName: string; preview?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { alert('Saiz fail terlalu besar (maksimum 20 MB)'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setAttachment({
        base64,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        preview: file.type.startsWith('image/') ? result : undefined,
      })
    }
    reader.readAsDataURL(file)
  }

  // ALWAYS refresh contacts on open + sync conversation participants (anyone in chat list
  // but not in contacts table should still be selectable)
  useEffect(() => {
    Promise.all([
      window.wa.getAllContacts(),
      window.wa.getConversations(),
    ]).then(([allContacts, convs]) => {
      const map = new Map<string, Contact>()
      for (const c of (allContacts as Contact[])) {
        if (c.id) map.set(c.id, c)
      }
      // Add conversation participants that may not be in contacts table
      for (const conv of (convs || [])) {
        // Skip groups (@g.us) and newsletters (@newsletter)
        if (conv.id.endsWith('@g.us') || conv.id.includes('@newsletter')) continue
        if (!conv.contact_id) continue
        if (!map.has(conv.contact_id)) {
          // Construct a Contact-shaped object from joined conversation data
          map.set(conv.contact_id, {
            id: conv.contact_id,
            phone: conv.phone || '',
            name: conv.name || conv.phone || '',
            avatar: conv.avatar || '',
            tags: conv.tags || '[]',
            notes: conv.notes || '',
            label: (conv.label as Contact['label']) || 'none',
            is_blocked: 0,
          } as Contact)
        }
      }
      store.setContacts(Array.from(map.values()))
    }).catch(() => {})
  }, [])

  const goal = GOALS.find(g => g.id === goalId) || GOALS[0]
  const filtered = contacts.filter(c => {
    // Hide groups + newsletters from outreach (only person-to-person)
    if (c.phone && (c.phone.includes('@g.us') || c.phone.includes('@newsletter'))) return false
    if (c.id && (c.id.includes('@g.us') || c.id.includes('@newsletter'))) return false
    if (search && !`${c.name||''} ${c.phone||''}`.toLowerCase().includes(search.toLowerCase())) return false
    if (labelFilter !== 'all' && c.label !== labelFilter) return false
    return true
  })

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(c => c.id)))
  }

  const generatePreview = async () => {
    if (!selected.size) return
    setGenerating(true)
    const firstId = Array.from(selected)[0]
    const contact = contacts.find(c => c.id === firstId)
    if (!contact) { setGenerating(false); return }
    setPreviewContact(contact)

    const businessName = (store.appSettings['business_name'] || '').trim()
    const businessProfile = store.appSettings['business_profile'] || ''
    const persona = store.appSettings['ai_default_persona'] || ''

    try {
      // Custom goal goes through LLM. Predefined goals use deterministic templates
      // for consistent, distinct output per goal.
      let reply: string
      if (goalId === 'custom' && customPrompt.trim()) {
        reply = await window.wa.generateReply({
          message: `[OUTREACH: ${customPrompt}. Tulis mesej WhatsApp 2-3 ayat dalam Bahasa Melayu Malaysia formal. Pakai "anda" (bukan "kamu"). Sapa "${contact.name || 'tuan/puan'}". JANGAN sebut "saya AI". Pendek, professional.]`,
          history: [], knowledgeBase: store.kbEntries, persona, businessProfile, contact,
        })
      } else {
        // small artificial delay so it feels intentional
        await new Promise(r => setTimeout(r, 600))
        reply = generateGoalTemplate(goalId, contact, businessName)
      }
      setPreviewMsg(reply || 'Hai! Apa khabar? Saya ingin menghubungi anda.')
    } catch (e) {
      setPreviewMsg(generateGoalTemplate(goalId, contact, businessName))
    } finally { setGenerating(false) }
  }

  const sendToAll = async () => {
    if ((!previewMsg.trim() && !attachment) || !selected.size) return
    setMenghantar(true)
    setSentCount(0)
    const ids = Array.from(selected)
    for (const id of ids) {
      const c = contacts.find(x => x.id === id)
      if (!c) continue
      let msg = previewMsg
      const personalName = c.name && !/^\d+$/.test(c.name) ? c.name : ''
      if (personalName && previewContact) {
        const prevName = previewContact.name && !/^\d+$/.test(previewContact.name) ? previewContact.name : ''
        if (prevName) msg = msg.replace(new RegExp(prevName, 'gi'), personalName)
      }
      msg = msg.replace(/\{nama\}/gi, personalName || 'tuan/puan')
      const jid = c.phone.includes('@') ? c.phone : `${c.phone}@s.whatsapp.net`
      try {
        if (attachment) {
          // Send media with caption (combined message)
          await window.wa.sendMedia({
            jid,
            mediaBase64: attachment.base64,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
            caption: msg,
          })
        } else {
          await window.wa.sendMessage(jid, msg)
        }
        setSentCount(s => s + 1)
        await new Promise(r => setTimeout(r, 1500))
      } catch (e) { console.error('Outreach send error:', e) }
    }
    setMenghantar(false)
    const fresh = await window.wa.getConversations()
    store.setConversations(fresh)
    setTimeout(() => onClose(), 1500)
  }

  const aiOnline = store.aiBackends.length > 0
  const modelLabel = store.appSettings['ai_default_model'] || (aiOnline ? 'Model tersedia' : 'Belum dikonfigurasi')
  const profileReady = Boolean((store.appSettings['business_profile'] || '').trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="relative bg-bg-secondary border border-accent-green/25 rounded-3xl w-[1060px] max-w-[96vw] h-[680px] max-h-[92vh] flex overflow-hidden shadow-[0_24px_90px_rgba(0,0,0,0.62),0_0_50px_rgba(37,211,102,0.12)] animate-slide-in-up"
        onClick={e => e.stopPropagation()}>
        <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(37,211,102,0.10),transparent_28%),radial-gradient(circle_at_82%_4%,rgba(88,166,255,0.08),transparent_30%),linear-gradient(120deg,rgba(37,211,102,0.04),transparent_38%)]" />
          <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(37,211,102,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(37,211,102,0.4)_1px,transparent_1px)] bg-[size:28px_28px]" />
        </div>

        {/* LEFT — contact picker */}
        <div className="relative z-10 w-[330px] flex-shrink-0 bg-bg-primary/40 border-r border-accent-green/15 flex flex-col">
          <div className="p-5 border-b border-accent-green/15">
            <p className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
              <Users size={13} className="text-accent-green" /> Penerima Kempen
            </p>
            <p className="text-[11px] text-text-muted mb-3">Segmentasi pelanggan untuk outreach</p>
            <div className="relative mb-2">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama atau nombor..."
                className="w-full bg-bg-primary/80 border border-border rounded-xl pl-8 pr-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60" />
            </div>
            <div className="flex gap-1 mb-2">
              {[
                { id: 'all',      label: 'Semua' },
                { id: 'new_lead', label: 'Lead' },
                { id: 'customer', label: 'Cust' },
                { id: 'vip',      label: 'VIP' },
              ].map(f => (
                <button key={f.id} onClick={() => setLabelFilter(f.id)}
                  className={`flex-1 text-[10px] py-1 rounded-md font-semibold transition-colors ${
                    labelFilter === f.id ? 'bg-accent-green/15 text-accent-green border border-accent-green/25' : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover border border-transparent'
                  }`}>{f.label}</button>
              ))}
            </div>
            <button onClick={toggleAll} className="text-[11px] font-semibold text-accent-green hover:underline">
              {selected.size === filtered.length && filtered.length > 0 ? 'Nyahpilih semua' : `Pilih semua (${filtered.length})`}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-text-muted py-12">Tiada contact</p>
            ) : filtered.map(c => (
              <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                selected.has(c.id) ? 'bg-accent-green/10 border-accent-green/35' : 'hover:bg-bg-hover border-transparent hover:border-border'
              }`}>
                <input type="checkbox" checked={selected.has(c.id)}
                  onChange={() => {
                    const s = new Set(selected)
                    s.has(c.id) ? s.delete(c.id) : s.add(c.id)
                    setSelected(s)
                  }}
                  className="accent-accent-green" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">{c.name || c.phone}</p>
                  <p className="text-[10px] text-text-muted">{c.phone}</p>
                </div>
                {c.label && c.label !== 'none' && (
                  <span className="text-[8px] px-1 py-0.5 rounded uppercase font-bold tracking-wider bg-bg-active text-text-secondary">{c.label}</span>
                )}
              </label>
            ))}
          </div>
          <div className="p-4 border-t border-accent-green/15 bg-bg-secondary/80">
            <p className="text-xs">
              <span className="font-bold text-accent-green">{selected.size}</span>
              <span className="text-text-muted"> pelanggan dipilih</span>
            </p>
          </div>
        </div>

        {/* RIGHT — Goal & Preview */}
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-6 py-4 border-b border-accent-green/15 bg-gradient-to-r from-accent-green/10 via-bg-secondary/85 to-bg-secondary/40">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-accent-green/15 border border-accent-green/35 flex items-center justify-center shadow-[0_0_24px_rgba(37,211,102,0.20)]">
                <Bot size={20} className="text-accent-green" />
              </div>
              <div>
                <p className="text-lg font-black text-text-primary tracking-tight">SYNCERA AI Outreach</p>
                <p className="text-xs text-text-muted">Modul kempen mesej pintar dengan kawalan manual sebelum penghantaran.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                aiOnline ? 'border-accent-green/30 bg-accent-green/10 text-accent-green' : 'border-status-warning/30 bg-status-warning/10 text-status-warning'
              }`}>
                <Cpu size={12} /> {aiOnline ? 'AI Engine Online' : 'AI Engine Offline'}
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary"><X size={16} /></button>
            </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="rounded-2xl border border-border bg-bg-primary/55 p-3">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted"><BrainCircuit size={13} className={aiOnline ? 'text-accent-green' : 'text-status-warning'} /> Model</p>
                <p className="truncate text-xs font-bold text-text-primary mt-2">{modelLabel}</p>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/55 p-3">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted"><Database size={13} className={profileReady ? 'text-accent-green' : 'text-status-warning'} /> Business Context</p>
                <p className="truncate text-xs font-bold text-text-primary mt-2">{profileReady ? 'Profile loaded' : 'Profile not set'}</p>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/55 p-3">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted"><ShieldCheck size={13} className="text-accent-green" /> Delivery Guard</p>
                <p className="truncate text-xs font-bold text-text-primary mt-2">{store.appSettings['wa_send_delay'] || '1500'}ms interval</p>
              </div>
            </div>
          </div>

          {/* Goal selector */}
          <div className="p-5 border-b border-accent-green/15">
            <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Target size={12} className="text-accent-green" /> Campaign Objective
            </p>
            <div className="grid grid-cols-4 gap-2">
              {GOALS.map(g => {
                const Icon = goalIcons[g.id] || Target
                const active = goalId === g.id
                return (
                <button key={g.id} onClick={() => setGoalId(g.id)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all min-h-[64px] ${
                    active
                      ? 'border-accent-green/65 bg-accent-green/12 shadow-[0_0_22px_rgba(37,211,102,0.14)]'
                      : 'border-border bg-bg-tertiary/40 hover:border-accent-green/30 hover:bg-bg-hover'
                  }`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-accent-green/20' : 'bg-bg-hover'}`}>
                    <Icon size={14} className={active ? 'text-accent-green' : 'text-text-muted'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-bold leading-tight ${active ? 'text-accent-green' : 'text-text-primary'}`}>
                      {g.label}
                    </p>
                    <p className="text-[10px] text-text-muted leading-snug mt-0.5 line-clamp-2">
                      {g.desc}
                    </p>
                  </div>
                </button>
                )
              })}
            </div>
            {goalId === 'custom' && (
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Tulis arahan khusus untuk AI. Contoh: Tanya pelanggan sama ada berminat untuk sesi demo minggu depan."
                rows={2} className="mt-3 w-full bg-bg-primary border border-border rounded-xl p-3 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60 resize-none" />
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xxs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Wand2 size={11} className="text-accent-green" /> AI Message Composer
              </p>
              <button onClick={generatePreview} disabled={generating || !selected.size}
                className="text-xs px-4 py-2 rounded-xl border border-accent-green/30 bg-accent-green/12 text-accent-green font-black hover:bg-accent-green/18 disabled:opacity-40 flex items-center gap-1.5">
                {generating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {generating ? 'Menjana...' : (previewMsg ? 'Jana Semula' : 'Jana Mesej')}
              </button>
            </div>

            <div className="flex-1 bg-bg-primary border border-border rounded-2xl p-4 overflow-y-auto">
              {previewMsg ? (
                <div>
                  <p className="text-[10px] text-text-muted mb-2">→ Sample untuk: <strong className="text-text-secondary">{previewContact?.name || previewContact?.phone}</strong></p>
                  <div className="bg-gradient-to-br from-accent-green/15 to-accent-green/5 border border-accent-green/30 rounded-xl p-3 mb-2">
                    {attachment?.preview && (
                      <img src={attachment.preview} alt="preview" className="rounded-lg max-h-40 mb-2 object-cover" />
                    )}
                    {attachment && !attachment.preview && (
                      <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 mb-2">
                        <FileText size={14} className="text-text-secondary" />
                        <span className="text-xs text-text-primary truncate">{attachment.fileName}</span>
                      </div>
                    )}
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{previewMsg}</p>
                  </div>
                  <textarea value={previewMsg} onChange={e => setPreviewMsg(e.target.value)} rows={3}
                    className="w-full bg-bg-tertiary border border-border rounded-lg p-2 text-xs text-text-primary outline-none focus:border-accent-green/60 resize-none"
                    placeholder="Semak dan sunting mesej sebelum dihantar..." />

                  {/* Attachment toolbar */}
                  <div className="flex items-center gap-2 mt-2">
                    <input ref={fileInputRef} type="file" onChange={handleFileSelect}
                      accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                      className="hidden" />
                    {!attachment ? (
                      <>
                        <button onClick={() => { fileInputRef.current?.setAttribute('accept', 'image/*'); fileInputRef.current?.click() }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors">
                          <ImageIcon size={12} /> Lampirkan Gambar
                        </button>
                        <button onClick={() => { fileInputRef.current?.removeAttribute('accept'); fileInputRef.current?.click() }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 transition-colors">
                          <Paperclip size={12} /> Lampirkan Fail
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 flex-1">
                        {attachment.preview ? <ImageIcon size={12} className="text-accent-green" /> : <FileText size={12} className="text-accent-green" />}
                        <span className="text-xs text-text-primary truncate flex-1">{attachment.fileName}</span>
                        <span className="text-[10px] text-text-muted">{(attachment.base64.length * 0.75 / 1024).toFixed(0)}KB</span>
                        <button onClick={() => setAttachment(null)} className="text-text-muted hover:text-status-danger"><X size={12} /></button>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted mt-1">💡 Nama customer akan auto-replace untuk setiap penerima{attachment ? ' · Mesej akan dihantar bersama lampiran' : ''}</p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent-green/10 border border-accent-green/25 flex items-center justify-center">
                    <BrainCircuit size={24} className="text-accent-green" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Belum ada draf mesej</p>
                    <p className="text-xs text-text-muted mt-1">{selected.size === 0 ? 'Pilih pelanggan di sebelah kiri untuk mengaktifkan composer' : 'Klik Jana Mesej untuk menghasilkan draf rasmi berdasarkan objective kempen'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer — send button */}
          <div className="p-4 border-t border-border flex items-center justify-between bg-bg-secondary">
            <div className="text-xs">
              {sending ? (
                <span className="text-accent-green font-bold flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Menghantar {sentCount}/{selected.size}…
                </span>
              ) : sentCount === selected.size && sentCount > 0 ? (
                <span className="text-accent-green font-bold flex items-center gap-1.5"><CheckCircle2 size={13} /> {sentCount} mesej berjaya dihantar</span>
              ) : (
                <span className="text-text-muted">{selected.size} customer · ~{Math.ceil(selected.size * 1.5)}s anggaran penghantaran</span>
              )}
            </div>
            <button onClick={sendToAll} disabled={(!previewMsg.trim() && !attachment) || !selected.size || sending}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-accent-green to-emerald-500 text-bg-primary text-xs font-bold flex items-center gap-2 hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100 shadow-lg shadow-accent-green/20">
              <Send size={12} /> Hantar kepada {selected.size} pelanggan{attachment ? ' + lampiran' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
