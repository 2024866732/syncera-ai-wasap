import { useState, useRef } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import {
  Send, Phone, Paperclip, Image as ImageIcon, FileText, X, Loader2, CheckCircle2,
  AlertCircle, SmilePlus, MessageSquare, History, Users, User, Zap,
} from 'lucide-react'

type Status = 'idle' | 'sending' | 'sent' | 'error'
type Mode = 'single' | 'bulk'

interface SentRecord {
  phone: string
  preview: string
  attachmentName?: string
  attachmentType?: string
  sentAt: string
  status: 'ok' | 'fail'
  error?: string
}

const COUNTRIES = [
  { code: '60',  flag: '🇲🇾', name: 'Malaysia' },
  { code: '65',  flag: '🇸🇬', name: 'Singapore' },
  { code: '62',  flag: '🇮🇩', name: 'Indonesia' },
  { code: '66',  flag: '🇹🇭', name: 'Thailand' },
  { code: '673', flag: '🇧🇳', name: 'Brunei' },
  { code: '63',  flag: '🇵🇭', name: 'Philippines' },
  { code: '84',  flag: '🇻🇳', name: 'Vietnam' },
  { code: '91',  flag: '🇮🇳', name: 'India' },
  { code: '1',   flag: '🇺🇸', name: 'USA/CA' },
  { code: '44',  flag: '🇬🇧', name: 'UK' },
  { code: '61',  flag: '🇦🇺', name: 'Australia' },
]

// Quick emoji set
const QUICK_EMOJIS = ['👍','🙏','❤️','😊','😂','🔥','✨','✅','❌','📌','💯','🎉','🤝','👋','📞','📍','🕒','💰']

export default function QuickSend() {
  const tr = useT()
  const store = useStore()
  const [mode, setMode] = useState<Mode>('single')
  const [countryCode, setCountryCode] = useState('60')
  const [phone, setPhone] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState<{ base64: string; mimeType: string; fileName: string; preview?: string; size: number } | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [history, setHistory] = useState<SentRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('syncera_quicksend_history') || '[]') } catch { return [] }
  })
  const [showEmoji, setShowEmoji] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; ok: number; fail: number } | null>(null)
  const [delayMs, setDelayMs] = useState<number>(() => parseInt(localStorage.getItem('syncera_bulk_delay_ms') || '0'))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const bulkRef = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // Normalize phone: strip non-digits, remove leading 0 / +, ensure starts with country code
  const normalize = (input: string) => {
    let p = input.replace(/[^\d]/g, '')
    if (p.startsWith('0'))               p = countryCode + p.slice(1)
    else if (!p.startsWith(countryCode)) p = countryCode + p
    return p
  }
  const fullJid = phone ? `${normalize(phone)}@s.whatsapp.net` : ''
  const displayPhone = phone ? `+${normalize(phone)}` : ''
  const validPhone = phone && normalize(phone).length >= 9 && normalize(phone).length <= 15

  // Bulk: parse a textarea into a list of numbers (supports lines, commas, semicolons, spaces)
  const parseBulkNumbers = (input: string): { valid: string[]; invalid: string[] } => {
    const tokens = input.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    const valid: string[] = []
    const invalid: string[] = []
    const seen = new Set<string>()
    for (const t of tokens) {
      const n = normalize(t)
      if (n.length >= 9 && n.length <= 15 && !seen.has(n)) {
        seen.add(n)
        valid.push(n)
      } else if (n.length > 0) {
        invalid.push(t)
      }
    }
    return { valid, invalid }
  }

  const bulkParsed = parseBulkNumbers(bulkText)

  const persistHistory = (records: SentRecord[]) => {
    setHistory(records)
    try { localStorage.setItem('syncera_quicksend_history', JSON.stringify(records.slice(0, 30))) } catch {}
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { alert('Maksimum saiz fail 20 MB'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setAttachment({
        base64: result.split(',')[1],
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        preview: file.type.startsWith('image/') ? result : undefined,
        size: file.size,
      })
    }
    reader.readAsDataURL(file)
  }

  const insertEmoji = (emoji: string) => {
    const ta = textRef.current
    if (!ta) { setText(t => t + emoji); return }
    const start = ta.selectionStart ?? text.length
    const end = ta.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + emoji.length }, 0)
  }

  const sendBulk = async () => {
    if (!bulkParsed.valid.length) { setErrorMsg('Tiada nombor sah dalam senarai'); setStatus('error'); return }
    if (!text.trim() && !attachment) { setErrorMsg('Sila isi mesej atau lampirkan fail'); setStatus('error'); return }
    setStatus('sending'); setErrorMsg('')
    setBulkProgress({ done: 0, total: bulkParsed.valid.length, ok: 0, fail: 0 })

    const newHistory: SentRecord[] = []
    let ok = 0, fail = 0

    for (let i = 0; i < bulkParsed.valid.length; i++) {
      const num = bulkParsed.valid[i]
      const jid = `${num}@s.whatsapp.net`
      try {
        if (attachment) {
          const r = await window.wa.sendMedia({
            jid, mediaBase64: attachment.base64,
            mimeType: attachment.mimeType, fileName: attachment.fileName,
            caption: text.trim(),
          })
          if (!r.ok) throw new Error(r.error || 'Send failed')
        } else {
          const r = await window.wa.sendMessage(jid, text.trim())
          if (!r.ok) throw new Error(r.error || 'Send failed')
        }
        ok++
        newHistory.push({
          phone: '+' + num, preview: text.trim().slice(0, 100) || `[${attachment?.fileName}]`,
          attachmentName: attachment?.fileName, attachmentType: attachment?.mimeType,
          sentAt: new Date().toISOString(), status: 'ok',
        })
      } catch (e) {
        fail++
        newHistory.push({
          phone: '+' + num, preview: text.trim().slice(0, 100) || '[attachment]',
          sentAt: new Date().toISOString(), status: 'fail',
          error: e instanceof Error ? e.message : String(e),
        })
      }
      setBulkProgress({ done: i + 1, total: bulkParsed.valid.length, ok, fail })
      if (delayMs > 0 && i < bulkParsed.valid.length - 1) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    persistHistory([...newHistory, ...history])
    window.wa.getConversations().then(c => store.setConversations(c)).catch(() => {})

    setStatus('sent')
    setTimeout(() => {
      setStatus('idle')
      setBulkProgress(null)
      if (fail === 0) { setText(''); setAttachment(null); setBulkText('') }
    }, 2500)
  }

  const send = async () => {
    if (mode === 'bulk') return sendBulk()
    if (!validPhone) { setErrorMsg('Nombor telefon tidak sah'); setStatus('error'); return }
    if (!text.trim() && !attachment) { setErrorMsg('Sila isi mesej atau lampirkan fail'); setStatus('error'); return }
    setStatus('sending'); setErrorMsg('')

    try {
      let ok = false
      if (attachment) {
        const r = await window.wa.sendMedia({
          jid: fullJid,
          mediaBase64: attachment.base64,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
          caption: text.trim(),
        })
        ok = r.ok
        if (!ok) throw new Error(r.error || 'Gagal hantar media')
      } else {
        const r = await window.wa.sendMessage(fullJid, text.trim())
        ok = r.ok
        if (!ok) throw new Error(r.error || 'Gagal hantar mesej')
      }

      // Record success
      persistHistory([{
        phone: displayPhone,
        preview: text.trim().slice(0, 100) || `[${attachment?.fileName || 'attachment'}]`,
        attachmentName: attachment?.fileName,
        attachmentType: attachment?.mimeType,
        sentAt: new Date().toISOString(),
        status: 'ok',
      }, ...history])

      // Refresh conversation list (new conversation auto-created)
      window.wa.getConversations().then(c => store.setConversations(c)).catch(() => {})

      setStatus('sent')
      setTimeout(() => {
        setText(''); setAttachment(null); setStatus('idle')
      }, 1200)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMsg(msg)
      setStatus('error')
      persistHistory([{
        phone: displayPhone,
        preview: text.trim().slice(0, 100) || '[attachment]',
        sentAt: new Date().toISOString(),
        status: 'fail',
        error: msg,
      }, ...history])
    }
  }

  const formatSize = (b: number) => b < 1024 ? `${b}B` : b < 1024*1024 ? `${(b/1024).toFixed(0)}KB` : `${(b/1024/1024).toFixed(1)}MB`

  return (
    <div className="h-full overflow-hidden flex bg-bg-primary no-drag quicksend-root">
      {/* LEFT — Compose */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-green to-emerald-600 flex items-center justify-center shadow-md shadow-accent-green/30">
              <Send size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{tr('quicksend.title')}</h1>
              <p className="text-xs text-text-muted">{tr('quicksend.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Mode toggle: Single vs Bulk */}
        <div className="flex gap-2 mb-4 p-1 bg-bg-tertiary rounded-xl border border-border">
          <button onClick={() => setMode('single')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === 'single' ? 'bg-accent-green text-bg-primary shadow-md' : 'text-text-muted hover:bg-bg-hover'
            }`}>
            <User size={14} /> {tr('quicksend.single')}
          </button>
          <button onClick={() => setMode('bulk')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === 'bulk' ? 'bg-accent-purple text-white shadow-md' : 'text-text-muted hover:bg-bg-hover'
            }`}>
            <Users size={14} /> {tr('quicksend.bulk')}
          </button>
        </div>

        {/* Phone input — single mode */}
        {mode === 'single' && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 block flex items-center gap-1.5">
              <Phone size={12} className="text-accent-green" /> {tr('quicksend.recipient')}
            </label>
            <div className="flex gap-2">
              <select value={countryCode} onChange={e => setCountryCode(e.target.value)}
                className="bg-bg-tertiary border border-border rounded-xl px-3 py-3 text-sm text-text-primary outline-none focus:border-accent-green/60 cursor-pointer">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>
                ))}
              </select>
              <input
                ref={phoneRef}
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onMouseDown={() => phoneRef.current?.focus()}
                onClick={() => phoneRef.current?.focus()}
                placeholder={tr('quicksend.phonePh')}
                className="no-drag flex-1 bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60" />
            </div>
            {phone && (
              <p className="text-[11px] text-text-muted mt-1.5 flex items-center gap-2">
                {tr('quicksend.willSend')} <span className="font-mono font-bold text-accent-green">{displayPhone}</span>
                {validPhone
                  ? <span className="text-status-success">{tr('quicksend.validFormat')}</span>
                  : <span className="text-status-warning">{tr('quicksend.invalidFormat')}</span>}
              </p>
            )}
          </div>
        )}

        {/* Bulk numbers — paste many */}
        {mode === 'bulk' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Users size={12} className="text-accent-purple" /> {tr('quicksend.bulkList')}
              </label>
              <select value={countryCode} onChange={e => setCountryCode(e.target.value)}
                className="text-xs bg-bg-tertiary border border-border rounded-lg px-2 py-1 text-text-primary outline-none focus:border-accent-purple/60 cursor-pointer">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>
                ))}
              </select>
            </div>
            <textarea
              ref={bulkRef}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              onMouseDown={() => bulkRef.current?.focus()}
              onClick={() => bulkRef.current?.focus()}
              placeholder={tr('quicksend.bulkPh') + `\n\n01XXXXXXXX\n01XXXXXXXX, 01XXXXXXXX\n+60XXXXXXXXX`}
              rows={6}
              className="no-drag w-full bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-purple/60 resize-none font-mono text-[12px] leading-relaxed" />

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30">
                <CheckCircle2 size={12} className="text-accent-green" />
                <span className="text-xs font-bold text-accent-green">{bulkParsed.valid.length}</span>
                <span className="text-[10px] text-text-secondary">{tr('quicksend.valid')}</span>
              </div>
              {bulkParsed.invalid.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-status-warning/10 border border-status-warning/30">
                  <AlertCircle size={12} className="text-status-warning" />
                  <span className="text-xs font-bold text-status-warning">{bulkParsed.invalid.length}</span>
                  <span className="text-[10px] text-text-secondary">{tr('quicksend.invalid')}</span>
                </div>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Zap size={12} className="text-accent-orange" />
                <span className="text-[10px] text-text-secondary">{tr('quicksend.delayLabel')}</span>
                <select value={delayMs}
                  onChange={e => { const v = parseInt(e.target.value); setDelayMs(v); localStorage.setItem('syncera_bulk_delay_ms', String(v)) }}
                  className="text-[10px] bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary outline-none">
                  <option value="0">{tr('quicksend.delayFull')}</option>
                  <option value="100">100ms</option>
                  <option value="300">{tr('quicksend.delaySafe')}</option>
                  <option value="800">800ms</option>
                  <option value="1500">{tr('quicksend.delayAntiSpam')}</option>
                </select>
              </div>
            </div>

            {bulkParsed.valid.length > 50 && (
              <div className="mt-2 p-2 bg-status-warning/5 border border-status-warning/20 rounded-lg flex items-start gap-2">
                <AlertCircle size={12} className="text-status-warning flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  <strong className="text-status-warning">{tr('quicksend.banRisk')}</strong> {tr('quicksend.banRiskDesc')}
                </p>
              </div>
            )}

            {/* Progress bar during bulk send */}
            {bulkProgress && (
              <div className="mt-3 p-3 bg-bg-tertiary rounded-xl border border-accent-purple/30">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-text-primary">
                    {tr('quicksend.sending')} {bulkProgress.done}/{bulkProgress.total}
                  </p>
                  <p className="text-xs">
                    <span className="text-accent-green font-bold">{bulkProgress.ok} {tr('quicksend.progress')}</span>
                    {bulkProgress.fail > 0 && <span className="text-status-danger font-bold ml-2">{bulkProgress.fail} {tr('quicksend.progressFailed')}</span>}
                  </p>
                </div>
                <div className="h-2 bg-bg-active rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-accent-purple to-fuchsia-500 transition-all duration-300"
                    style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Message body */}
        <div className="mb-3 relative">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 block flex items-center justify-between">
            <span className="flex items-center gap-1.5"><MessageSquare size={12} className="text-accent-blue" /> {tr('common.message')}</span>
            <span className="text-[10px] text-text-muted normal-case font-normal">{text.length} {tr('quicksend.chars')}</span>
          </label>
          <textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onMouseDown={() => textRef.current?.focus()}
            onClick={() => textRef.current?.focus()}
            placeholder={tr('quicksend.messagePh')}
            rows={6}
            className="no-drag w-full bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60 resize-none" />

          {/* Emoji + attach toolbar */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <input ref={fileInputRef} type="file" onChange={handleFilePick}
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
              className="hidden" />
            <button onClick={() => { fileInputRef.current?.setAttribute('accept', 'image/*'); fileInputRef.current?.click() }}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors">
              <ImageIcon size={13} /> {tr('quicksend.imageBtn')}
            </button>
            <button onClick={() => { fileInputRef.current?.removeAttribute('accept'); fileInputRef.current?.click() }}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 transition-colors">
              <Paperclip size={13} /> {tr('quicksend.fileBtn')}
            </button>
            <button onClick={() => setShowEmoji(s => !s)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors ${
                showEmoji ? 'bg-yellow-400/15 text-yellow-400' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}>
              <SmilePlus size={13} /> {tr('quicksend.emojiBtn')}
            </button>
          </div>

          {showEmoji && (
            <div className="mt-2 p-3 bg-bg-tertiary border border-border rounded-xl flex flex-wrap gap-1.5">
              {QUICK_EMOJIS.map(e => (
                <button key={e} onClick={() => insertEmoji(e)}
                  className="w-9 h-9 rounded-lg hover:bg-bg-hover flex items-center justify-center text-lg transition-colors">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Attachment preview */}
        {attachment && (
          <div className="mb-3 bg-bg-tertiary border border-accent-green/30 rounded-xl p-3">
            <div className="flex items-start gap-3">
              {attachment.preview ? (
                <img src={attachment.preview} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-accent-orange/10 flex items-center justify-center flex-shrink-0">
                  <FileText size={26} className="text-accent-orange" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{attachment.fileName}</p>
                <p className="text-xs text-text-muted">{attachment.mimeType} · {formatSize(attachment.size)}</p>
                {text && <p className="text-xs text-text-secondary mt-1 italic">Caption: "{text.slice(0, 60)}{text.length > 60 ? '…' : ''}"</p>}
              </div>
              <button onClick={() => setAttachment(null)} className="text-status-danger hover:bg-status-danger/10 w-8 h-8 rounded-lg flex items-center justify-center">
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Status messages */}
        {status === 'error' && (
          <div className="mb-3 flex items-center gap-2 p-3 bg-status-danger/10 border border-status-danger/30 rounded-xl">
            <AlertCircle size={15} className="text-status-danger flex-shrink-0" />
            <p className="text-sm text-status-danger">{errorMsg || tr('quicksend.failed')}</p>
          </div>
        )}
        {status === 'sent' && (
          <div className="mb-3 flex items-center gap-2 p-3 bg-status-success/10 border border-status-success/30 rounded-xl animate-fade-in">
            <CheckCircle2 size={15} className="text-status-success" />
            <p className="text-sm text-status-success font-semibold">{tr('quicksend.successful')} {displayPhone}</p>
          </div>
        )}

        {/* Send button */}
        <button
          onClick={send}
          disabled={
            (mode === 'single' && (!validPhone || (!text.trim() && !attachment))) ||
            (mode === 'bulk' && (!bulkParsed.valid.length || (!text.trim() && !attachment))) ||
            status === 'sending'
          }
          className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white text-sm font-bold shadow-lg transition-all disabled:opacity-40 disabled:from-bg-hover disabled:to-bg-hover disabled:shadow-none disabled:text-text-muted ${
            mode === 'bulk'
              ? 'bg-gradient-to-r from-accent-purple to-fuchsia-600 shadow-accent-purple/25 hover:shadow-accent-purple/40'
              : 'bg-gradient-to-r from-accent-green to-emerald-600 shadow-accent-green/25 hover:shadow-accent-green/40'
          }`}>
          {status === 'sending' ? (<>
            <Loader2 size={16} className="animate-spin" />
            {bulkProgress ? ' ' + tr('quicksend.sendingBulk', { done: bulkProgress.done, total: bulkProgress.total }) : ' ' + tr('quicksend.sending')}
          </>) : (<>
            <Send size={16} />
            {mode === 'bulk'
              ? <>{tr('quicksend.sendBulkBtn', { n: bulkParsed.valid.length })}</>
              : <>{tr('quicksend.sendBtn')}</>}
            {attachment && <span className="text-[11px] opacity-80">+ {attachment.fileName.length > 14 ? attachment.fileName.slice(0,14)+'…' : attachment.fileName}</span>}
          </>)}
        </button>

        {/* Helper tip */}
        <div className="mt-4 p-3 bg-accent-blue/5 border border-accent-blue/20 rounded-xl">
          <p className="text-xxs text-text-secondary leading-relaxed">{tr('quicksend.tip')}</p>
        </div>
      </div>

      {/* RIGHT — History sidebar */}
      <div className="w-[320px] flex-shrink-0 border-l border-border bg-bg-secondary flex flex-col">
        <div className="p-4 border-b border-border">
          <p className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <History size={12} className="text-accent-purple" /> {tr('quicksend.history')}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5">{tr('quicksend.historyDesc', { n: history.length })}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {history.length === 0 ? (
            <div className="py-8 text-center">
              <Send size={28} className="mx-auto mb-2 text-text-muted opacity-30" />
              <p className="text-xs text-text-muted">{tr('quicksend.noHistory')}</p>
            </div>
          ) : history.map((h, i) => (
            <div key={i}
              className={`p-3 rounded-xl border ${h.status === 'ok' ? 'border-border bg-bg-tertiary/40' : 'border-status-danger/30 bg-status-danger/5'}`}>
              <div className="flex items-start gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${h.status === 'ok' ? 'bg-accent-green/15 text-accent-green' : 'bg-status-danger/15 text-status-danger'}`}>
                  {h.status === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-text-primary truncate font-mono">{h.phone}</p>
                  <p className="text-[11px] text-text-secondary truncate">{h.preview}</p>
                  {h.attachmentName && (
                    <p className="text-[10px] text-accent-blue mt-0.5 flex items-center gap-1">
                      <Paperclip size={9} /> {h.attachmentName}
                    </p>
                  )}
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {new Date(h.sentAt).toLocaleString('ms-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {h.status === 'fail' && h.error && (
                    <p className="text-[10px] text-status-danger mt-1 italic">{h.error}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {history.length > 0 && (
          <div className="p-3 border-t border-border">
            <button onClick={() => persistHistory([])}
              className="text-xs px-3 py-1.5 rounded-lg text-text-muted hover:bg-status-danger/10 hover:text-status-danger transition-colors w-full">
              {tr('quicksend.clearHistory')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
