import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'
import type { Template } from '../store'
import type { Message, Conversation } from '../types'
import { Avatar } from './Sidebar'
import { useT, t, getActiveLang } from '../i18n'
import {
  Send, Paperclip, SmilePlus, MoreVertical, Bot,
  Check, CheckCheck, Clock, Copy, Info, Archive, Pin, ChevronDown, Zap, X, AlertTriangle, Sparkles, Trash2, Loader2, Users,
} from 'lucide-react'

export default function ChatView() {
  const tr = useT()
  const store = useStore()
  const conv  = store.conversations.find(c => c.id === store.activeConvId)
  const msgs  = store.messages[store.activeConvId || ''] || []
  const presence = store.presences[store.activeConvId || '']
  const isTyping = store.typingJids.has(store.activeConvId || '')

  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [showScroll, setShowScroll] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [outreachOpen, setOutreachOpen] = useState(false)
  const [outreachBusy, setOutreachBusy] = useState<'one' | 'all' | 'send' | null>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    if (bottomRef.current && !showScroll) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [msgs.length])

  // Reset on conversation change
  useEffect(() => {
    setText('')
    setShowScroll(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
    inputRef.current?.focus()
  }, [store.activeConvId])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScroll(distFromBottom > 200)
  }, [])

  const sendMsg = useCallback(async () => {
    const t = text.trim()
    if (!t || !conv || sending) return
    setSending(true)
    setText('')
    try {
      await window.wa.sendMessage(conv.id, t)
    } catch (e) {
      console.error('Send error:', e)
      setText(t)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [text, conv, sending])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMsg()
    }
  }

  // Insert emoji at cursor position
  const insertEmoji = (emoji: string) => {
    const ta = inputRef.current
    if (!ta) { setText(t => t + emoji); return }
    const start = ta.selectionStart ?? text.length
    const end   = ta.selectionEnd ?? text.length
    const newText = text.slice(0, start) + emoji + text.slice(end)
    setText(newText)
    setTimeout(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + emoji.length
    }, 0)
  }

  // Attach file: open picker, then send via wa.sendMedia
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // reset so same file can be picked again
    if (!file || !conv) return
    if (file.size > 20 * 1024 * 1024) { alert('Saiz fail terlalu besar (maksimum 20 MB)'); return }
    setAttaching(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          const sent = await window.wa.sendMedia({
            jid: conv.id,
            mediaBase64: base64,
            mimeType: file.type || 'application/octet-stream',
            fileName: file.name,
            caption: text.trim(),  // send any pending text as caption
          })
          if (sent && sent.ok === false) throw new Error(sent.error || 'Gagal hantar media')
          setText('')
        } catch (err) {
          console.error('Attach error:', err)
          alert(err instanceof Error ? err.message : 'Gagal hantar media')
        } finally {
          setAttaching(false)
        }
      }
      reader.onerror = () => { alert('Gagal baca fail'); setAttaching(false) }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error('Attach error:', err)
      alert(err instanceof Error ? err.message : 'Gagal hantar media')
      setAttaching(false)
    }
  }

  const toggleAI = async () => {
    if (!conv) return
    const newVal = conv.ai_enabled ? 0 : 1
    await window.wa.updateConversation(conv.id, { ai_enabled: newVal })
    store.upsertConversation({ ...conv, ai_enabled: newVal })
  }

  const refreshConversations = async () => {
    const fresh = await window.wa.getConversations()
    store.setConversations(fresh)
  }

  const setOutreachForCurrent = async (enabled: boolean, force = false) => {
    if (!conv || outreachBusy) return
    setOutreachBusy(force ? 'send' : 'one')
    try {
      const r = force
        ? await window.wa.sendAIOutreachNow(conv.id)
        : await window.wa.setAIOutreach({ jid: conv.id, enabled, sendNow: enabled, force })
      if (!r.ok) alert(r.error || 'AI Outreach gagal dihantar')
      await refreshConversations()
    } finally {
      setOutreachBusy(null)
      setOutreachOpen(false)
    }
  }

  const setOutreachForAll = async (enabled: boolean) => {
    if (outreachBusy) return
    const action = enabled ? 'ON dan hantar mesej pembuka kepada semua customer' : 'OFF untuk semua customer'
    if (!confirm(`Set AI Approach ${action}?`)) return
    setOutreachBusy('all')
    try {
      const r = await window.wa.setAIOutreachAll({ enabled, sendNow: enabled })
      if (!r.ok && r.error) alert(r.error)
      else if (enabled) alert(`AI Approach selesai: ${r.sent || 0} dihantar, ${r.skipped || 0} skip, ${r.fail || 0} gagal.`)
      await refreshConversations()
    } finally {
      setOutreachBusy(null)
      setOutreachOpen(false)
    }
  }

  if (!conv) return null

  const grouped = groupMessages(msgs)
  const presenceLabel = isTyping ? tr('common.typing')
                      : presence === 'available' ? tr('common.online')
                      : presence === 'unavailable' ? tr('common.offline')
                      : presence === 'composing' ? tr('common.typing')
                      : ''

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* AI Status Banner — shown if AI not configured */}
      <AIStatusBanner />

      {/* ── Header ── */}
      <div className="h-[60px] flex items-center justify-between px-5 bg-bg-secondary border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Avatar name={conv.name || conv.phone} size={38} />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-text-primary">{conv.name || conv.phone}</p>
              {conv.ai_enabled ? (
                <span className="flex items-center gap-1 text-xxs px-1.5 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue font-medium">
                  <Bot size={9} /> AI ON
                </span>
              ) : null}
            </div>
            {presenceLabel ? (
              <p className={`text-xs ${(isTyping || presence === 'composing') ? 'text-accent-green' : 'text-text-muted'}`}>
                {presenceLabel}
              </p>
            ) : (
              <p className="text-xs text-text-muted">{conv.phone}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* AI toggle */}
          <button onClick={toggleAI}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              conv.ai_enabled
                ? 'bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25'
                : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover hover:text-text-secondary'
            }`}>
            <Bot size={13} />
            {conv.ai_enabled ? tr('chat.aiActive') : tr('chat.enableAi')}
          </button>

          <div className="relative">
            <button onClick={() => setOutreachOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                conv.ai_outreach_enabled
                  ? 'bg-accent-green/15 text-accent-green hover:bg-accent-green/25'
                  : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover hover:text-text-secondary'
              }`}>
              {outreachBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {conv.ai_outreach_enabled ? 'Approach ON' : 'AI Approach'}
            </button>
            {outreachOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOutreachOpen(false)} />
                <div className="absolute right-0 top-9 z-50 w-72 overflow-hidden rounded-xl border border-border bg-bg-tertiary py-1.5 shadow-2xl animate-fade-in">
                  <button onClick={() => setOutreachForCurrent(!conv.ai_outreach_enabled)}
                    disabled={!!outreachBusy}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50">
                    <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center">
                      {outreachBusy === 'one' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{conv.ai_outreach_enabled ? 'OFF untuk customer ini' : 'ON untuk customer ini'}</p>
                      <p className="text-[10px] text-text-muted">{conv.ai_outreach_enabled ? 'Berhenti mod approach' : 'AI jana mesej pembuka sekarang'}</p>
                    </div>
                  </button>
                  <button onClick={() => setOutreachForCurrent(true, true)}
                    disabled={!!outreachBusy}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50">
                    <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center">
                      {outreachBusy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Hantar approach sekarang</p>
                      <p className="text-[10px] text-text-muted">Guna AI Knowledge dan history customer</p>
                    </div>
                  </button>
                  <div className="my-1 mx-3 h-px bg-border/60" />
                  <button onClick={() => setOutreachForAll(true)}
                    disabled={!!outreachBusy}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50">
                    <div className="w-8 h-8 rounded-lg bg-accent-green/10 flex items-center justify-center text-accent-green">
                      {outreachBusy === 'all' ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">ON untuk semua customer</p>
                      <p className="text-[10px] text-text-muted">AI akan approach semua chat individu</p>
                    </div>
                  </button>
                  <button onClick={() => setOutreachForAll(false)}
                    disabled={!!outreachBusy}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-status-danger hover:bg-status-danger/10 disabled:opacity-50">
                    <div className="w-8 h-8 rounded-lg bg-status-danger/10 flex items-center justify-center">
                      <X size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">OFF untuk semua customer</p>
                      <p className="text-[10px] text-status-danger/70">Matikan mod approach global</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          <button onClick={() => store.setRightTab('contact') || store.setShowSettings(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors">
            <Info size={16} />
          </button>
          <HeaderMenu conv={conv} />
        </div>
      </div>

      {/* ── Messages area ── */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-bg-primary relative"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 80%, rgba(37,211,102,0.04) 0%, transparent 45%),
            radial-gradient(circle at 80% 20%, rgba(88,166,255,0.025) 0%, transparent 45%)
          `,
        }}
      >
        <div className="max-w-[980px] mx-auto px-5 py-5 flex flex-col gap-0.5">
          {grouped.map((group, gi) => {
            if (group.type === 'date') return <DateSeparator key={gi} label={group.label!} />
            const prevMsg = grouped[gi - 1]?.type === 'msg' ? grouped[gi - 1].msg : undefined
            const nextMsg = grouped[gi + 1]?.type === 'msg' ? grouped[gi + 1].msg : undefined
            return <MessageBubble key={group.msg!.id} msg={group.msg!} prev={prevMsg} next={nextMsg} />
          })}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start mt-1 animate-fade-in">
              <div className="bubble-in flex items-center gap-1 py-3 px-4">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll to bottom FAB */}
      {showScroll && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-20 right-6 w-9 h-9 rounded-full bg-bg-tertiary border border-border text-text-secondary hover:bg-bg-hover flex items-center justify-center shadow-lg transition-colors animate-fade-in">
          <ChevronDown size={16} />
        </button>
      )}

      {/* ── Input ── */}
      <div className="flex-shrink-0 bg-bg-secondary border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" onChange={handleFilePick}
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
            className="hidden" />

          <button onClick={() => fileInputRef.current?.click()}
            disabled={attaching}
            title={tr('chat.attach')}
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-accent-blue rounded-lg transition-colors mb-0.5 disabled:opacity-40">
            {attaching ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>

          <div className="relative mb-0.5">
            <button onClick={() => setShowEmoji(s => !s)}
              title={tr('chat.emoji')}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${showEmoji ? 'text-yellow-400 bg-yellow-400/10' : 'text-text-muted hover:bg-bg-hover hover:text-yellow-400'}`}>
              <SmilePlus size={18} />
            </button>
            {showEmoji && <EmojiPicker onPick={(e) => { insertEmoji(e); setShowEmoji(false) }} onClose={() => setShowEmoji(false)} />}
          </div>
          {/* Template quick-insert */}
          <div className="relative mb-0.5">
            <button onClick={() => setShowTemplates(s => !s)}
              className={`w-8 h-8 flex items-center justify-center transition-colors ${showTemplates ? 'text-accent-green' : 'text-text-muted hover:text-text-secondary'}`}>
              <Zap size={18} />
            </button>
            {showTemplates && <TemplatePicker onPick={(body) => { setText(body); setShowTemplates(false); inputRef.current?.focus() }} onClose={() => setShowTemplates(false)} contactName={conv?.name || ''} />}
          </div>

          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder={tr('chat.inputPlaceholder')}
            rows={1}
            className="flex-1 bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-blue transition-colors resize-none max-h-[120px] overflow-y-auto"
            style={{ lineHeight: '1.4' }}
          />

          <button
            onClick={sendMsg}
            disabled={!text.trim() || sending}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all mb-0.5 ${
              text.trim() && !sending
                ? 'bg-accent-green text-bg-primary hover:bg-green-400 active:scale-90'
                : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
            }`}>
            <Send size={16} />
          </button>
        </div>

        {conv.ai_enabled && (
          <div className="flex items-center gap-1.5 mt-2 text-xxs text-accent-blue/70">
            <Bot size={10} />
            <span>{tr('chat.autoReply')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI Status Banner ─────────────────────────────────────────────────────────

function AIStatusBanner() {
  const [diag, setDiag] = useState<Awaited<ReturnType<typeof window.wa.diagnoseAI>> | null>(null)
  const [enabling, setEnabling] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.wa.diagnoseAI().then(setDiag).catch(() => {})
  }, [])

  if (!diag || dismissed) return null

  // Case 1: Ollama not running / no model installed
  if (!diag.ok) {
    return (
      <div className="bg-status-warning/10 border-b border-status-warning/30 px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle size={15} className="text-status-warning flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-status-warning">AI tak boleh reply — Ollama tak dikesan</p>
          <p className="text-xxs text-text-secondary mt-0.5">
            Install Ollama dari ollama.com → buka command prompt → run <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-accent-blue">ollama pull llama3.2</code> (atau model lain)
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-text-muted hover:text-text-primary"><X size={13} /></button>
      </div>
    )
  }

  // Case 2: Ollama OK but most conversations have AI disabled
  if (diag.aiEnabledCount < diag.totalConvs) {
    return (
      <div className="bg-accent-blue/10 border-b border-accent-blue/30 px-4 py-2.5 flex items-center gap-3">
        <Sparkles size={15} className="text-accent-blue flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-accent-blue">
            AI ready — {diag.aiEnabledCount} dari {diag.totalConvs} chat ada auto-reply
          </p>
          <p className="text-xxs text-text-secondary mt-0.5">
            Click button kanan untuk enable AI auto-reply ke semua chat sekaligus
          </p>
        </div>
        <button
          onClick={async () => {
            setEnabling(true)
            const r = await window.wa.enableAIForAll()
            setEnabling(false)
            if (r.ok) {
              const fresh = await window.wa.diagnoseAI()
              setDiag(fresh)
              const convs = await window.wa.getConversations()
              useStore.getState().setConversations(convs)
            } else { alert(r.error || 'Failed') }
          }}
          disabled={enabling}
          className="text-xxs px-3 py-1.5 rounded-lg bg-accent-blue text-white font-semibold hover:bg-blue-500 disabled:opacity-50">
          {enabling ? 'Enabling…' : '⚡ Enable for All'}
        </button>
        <button onClick={() => setDismissed(true)} className="text-text-muted hover:text-text-primary"><X size={13} /></button>
      </div>
    )
  }

  return null
}

// ── Message Bubble (WhatsApp-style) ─────────────────────────────────────────

function MessageBubble({ msg, prev, next }: { msg: Message; prev?: Message; next?: Message }) {
  const tr = useT()
  const isMe = msg.is_from_me === 1
  const isAI = msg.is_ai_reply === 1
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const [mediaError, setMediaError] = useState(false)
  const [copied, setCopied] = useState(false)
  const mediaUrl = msg.media_url || ''
  const copyText = msg.type === 'text' ? msg.content : (msg.caption || '')

  const copyMessageText = async () => {
    if (!copyText.trim()) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 900)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = copyText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 900)
    }
  }

  // Group consecutive messages by sender — only show tail on the LAST in a run
  const sameAsPrev = prev && (prev.is_from_me === msg.is_from_me)
  const sameAsNext = next && (next.is_from_me === msg.is_from_me)
  const isTail = !sameAsNext  // last bubble in a run gets the tail
  const isFirstInRun = !sameAsPrev

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${sameAsPrev ? 'mt-0.5' : 'mt-2'} animate-slide-in-up`}>
      <div className={`relative max-w-[68%] min-w-[60px] ${isMe ? 'ml-12' : 'mr-12'}`}>
        {/* AI label — only on first bubble of a run */}
        {isAI && isFirstInRun && (
          <div className="flex items-center gap-1 mb-1 text-xxs text-accent-blue/80 px-1 justify-end">
            <Bot size={9} /> {tr('chat.autoReplyTag')}
          </div>
        )}

        <div className={`${isMe ? 'bubble-out' : 'bubble-in'} ${isTail ? 'tailed' : ''}`}>
          {/* Image — actual render */}
          {msg.type === 'image' && mediaUrl && !mediaError && (
            <a href={mediaUrl} target="_blank" rel="noreferrer">
              <img src={mediaUrl} alt="image"
                className="max-w-[300px] max-h-[400px] w-auto h-auto rounded-lg mb-1 cursor-zoom-in object-cover"
                onError={() => setMediaError(true)} />
            </a>
          )}
          {msg.type === 'image' && (!mediaUrl || mediaError) && (
            <div className="w-56 h-32 bg-black/20 border border-white/10 rounded-lg mb-1 flex flex-col items-center justify-center gap-1 text-xs">
              <span className="text-2xl opacity-50">🖼️</span>
              <span className="opacity-60">Gambar tidak dapat dipaparkan</span>
              <span className="opacity-40 text-[10px]">{mediaUrl ? 'Fail media tidak ditemui' : 'Media belum disimpan'}</span>
            </div>
          )}

          {/* Video — actual render */}
          {msg.type === 'video' && mediaUrl && !mediaError && (
            <video src={mediaUrl} controls
              className="max-w-[300px] max-h-[400px] rounded-lg mb-1"
              onError={() => setMediaError(true)} />
          )}
          {msg.type === 'video' && (!mediaUrl || mediaError) && (
            <div className="w-56 h-32 bg-black/20 border border-white/10 rounded-lg mb-1 flex flex-col items-center justify-center gap-1 text-xs">
              <AlertTriangle size={18} className="text-amber-300/80" />
              <span className="opacity-60">Video tidak dapat dipaparkan</span>
              <span className="opacity-40 text-[10px]">{mediaUrl ? 'Fail media tidak ditemui' : 'Media belum disimpan'}</span>
            </div>
          )}

          {/* Audio — actual playback */}
          {msg.type === 'audio' && mediaUrl && !mediaError && (
            <audio src={mediaUrl} controls className="my-1 max-w-[260px] h-9" onError={() => setMediaError(true)} />
          )}
          {msg.type === 'audio' && (!mediaUrl || mediaError) && (
            <div className="flex items-center gap-2 py-1">
              <span>🎤</span>
              <AlertTriangle size={14} className="text-amber-300/80" />
              <span className="text-xs">Audio tidak dapat dimainkan</span>
            </div>
          )}

          {/* Document */}
          {msg.type === 'document' && (
            <a href={mediaUrl || '#'} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 bg-black/15 hover:bg-black/25 rounded-lg px-3 py-2 mb-1 transition-colors no-underline">
              <span className="text-2xl">📄</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate max-w-[200px]">{msg.content}</p>
                <p className="text-[10px] opacity-70">{msg.mime_type || 'document'}</p>
              </div>
            </a>
          )}

          {/* Sticker */}
          {msg.type === 'sticker' && mediaUrl && !mediaError && (
            <img src={mediaUrl} alt="sticker" className="w-32 h-32 object-contain my-1" onError={() => setMediaError(true)} />
          )}
          {msg.type === 'sticker' && (!mediaUrl || mediaError) && (
            <div className="flex items-center gap-2 py-1">
              <AlertTriangle size={14} className="text-amber-300/80" />
              <span className="text-xs">Sticker tidak dapat dipaparkan</span>
            </div>
          )}

          {/* Text or caption — left-aligned */}
          {((msg.type === 'text' && msg.content) || (msg.caption && msg.caption.trim())) && (
            <p className="text-[14px] leading-[1.45] whitespace-pre-wrap break-words text-left pl-6 pr-12 pb-3">
              {msg.type === 'text' ? msg.content : msg.caption}
            </p>
          )}

          {copyText.trim() && (
            <button
              onClick={copyMessageText}
              title="Copy text"
              className={`absolute bottom-1.5 left-2.5 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                isMe
                  ? 'text-white/65 hover:text-white hover:bg-white/15'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
              }`}>
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
          )}

          {/* Time + status — bottom-right corner inside bubble */}
          <div className="flex items-center gap-1 absolute bottom-1.5 right-2.5 select-none">
            <span className={`text-[10px] ${isMe ? 'text-white/70' : 'text-text-muted'}`}>{time}</span>
            {isMe && <StatusIcon status={msg.status} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'sending')   return <Clock size={11} className="text-white/50" />
  if (status === 'sent')      return <Check size={11} className="text-white/70" />
  if (status === 'delivered') return <CheckCheck size={11} className="text-white/70" />
  if (status === 'read')      return <CheckCheck size={11} className="text-blue-300" />
  return null
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xxs text-text-muted bg-bg-primary px-3 py-1 rounded-full border border-border whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function HeaderMenu({ conv }: { conv: { id: string; is_pinned?: number; is_archived?: number } & object }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const store = useStore()
  const c = conv as ReturnType<typeof store.conversations.find> & { id: string; is_pinned: number }

  const toggle = (field: 'is_pinned' | 'is_archived') => {
    if (!c) return
    const val = c[field] ? 0 : 1
    window.wa.updateConversation(c.id, { [field]: val })
    store.upsertConversation({ ...c, [field]: val })
    setOpen(false)
  }

  const clearAI = async () => {
    if (!c) return
    if (!confirm(tr('chat.resetAiConfirm'))) return
    const r = await window.wa.clearAIHistory(c.id)
    // Reload messages
    const msgs = await window.wa.getMessages(c.id, 60, 0)
    store.setMessages(c.id, msgs)
    setOpen(false)
    alert(`✓ ${r.deleted} ${tr('common.message')}`)
  }

  const clearAll = async () => {
    if (!c) return
    const name = ((c as { name?: string; phone?: string }).name || (c as { phone?: string }).phone) || ''
    if (!confirm(tr('chat.clearConfirm', { name }))) return
    const r = await window.wa.clearConversation(c.id)
    // Empty messages locally
    store.setMessages(c.id, [])
    // Update conversation preview
    store.upsertConversation({ ...c, last_message: '', unread_count: 0 } as Conversation)
    setOpen(false)
    alert(`✓ ${r.deleted} ${tr('common.message')}`)
  }

  // Menu items grouped: regular actions + destructive (shown below a divider)
  const regularItems = [
    { icon: Pin,     label: c?.is_pinned   ? tr('chat.unpin')     : tr('chat.pin'),     sub: c?.is_pinned ? tr('chat.unpinDesc') : tr('chat.pinDesc'),     action: () => toggle('is_pinned') },
    { icon: Archive, label: c?.is_archived ? tr('chat.unarchive') : tr('chat.archive'), sub: c?.is_archived ? tr('chat.unarchiveDesc') : tr('chat.archiveDesc'), action: () => toggle('is_archived') },
  ]
  const destructiveItems = [
    { icon: Bot,    label: tr('chat.resetAi'),  sub: tr('chat.resetAiDesc'),  action: clearAI },
    { icon: Trash2, label: tr('chat.clearAll'), sub: tr('chat.clearAllDesc'), action: clearAll },
  ]

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors">
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 bg-bg-tertiary border border-border rounded-xl shadow-2xl py-1.5 w-64 animate-fade-in overflow-hidden">
            {regularItems.map(({ icon: Icon, label, sub, action }) => (
              <button key={label} onClick={action}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors text-text-secondary hover:bg-bg-hover hover:text-text-primary group">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary group-hover:bg-bg-active flex items-center justify-center flex-shrink-0 transition-colors">
                  <Icon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{label}</p>
                  <p className="text-[10px] text-text-muted leading-tight mt-0.5">{sub}</p>
                </div>
              </button>
            ))}

            {/* Divider before destructive */}
            <div className="my-1 mx-3 h-px bg-border/60" />

            {destructiveItems.map(({ icon: Icon, label, sub, action }) => (
              <button key={label} onClick={action}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors text-status-danger hover:bg-status-danger/10 group">
                <div className="w-8 h-8 rounded-lg bg-status-danger/10 group-hover:bg-status-danger/20 flex items-center justify-center flex-shrink-0 transition-colors">
                  <Icon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{label}</p>
                  <p className="text-[10px] text-status-danger/70 leading-tight mt-0.5">{sub}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Emoji Picker ──────────────────────────────────────────────────────────────

const EMOJI_GROUPS = {
  'Recent / Common': ['👍','❤️','🙏','😀','😂','😊','😍','🥰','😎','🤔','😢','🔥','✨','💯','✅','❌'],
  'Smileys':         ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😴','😪','🤤'],
  'Gestures':        ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','🤲','🤝','🙏','✊','👊','🤛','🤜','💪','🫶'],
  'Hearts':          ['❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️'],
  'Objects':         ['🎉','🎊','🎈','🎁','🎂','🎄','🎃','🌟','⭐','💫','✨','🔥','💥','💦','💨','🌈','☀️','🌙','⚡','💡','💰','💵','💳','🏆','🎯','📌','📍','✅','❌','⚠️','🆗','🆕','🔔','🔕','📞','📱','💻','📷','🎥'],
  'Food':            ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥙','🍳','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🧂','🍩','🍪'],
  'Activities':      ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🎿','⛷️','🏂','🪂','🏋️','🤸','🤼','🤺','⛹️','🤾','🏌️','🏇','🧘'],
}

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState<keyof typeof EMOJI_GROUPS>('Recent / Common')

  const groupKeys = Object.keys(EMOJI_GROUPS) as (keyof typeof EMOJI_GROUPS)[]
  const allEmojis = Object.values(EMOJI_GROUPS).flat()
  const filtered = search ? allEmojis.filter(e => true /* no name search yet */) : EMOJI_GROUPS[activeGroup]

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-10 left-0 z-50 w-[340px] bg-bg-tertiary border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Group tabs */}
        <div className="flex gap-0.5 p-1.5 border-b border-border bg-bg-secondary/60 overflow-x-auto">
          {groupKeys.map(g => (
            <button key={g} onClick={() => setActiveGroup(g)}
              className={`text-[10px] px-2 py-1 rounded whitespace-nowrap font-medium transition-colors ${
                activeGroup === g ? 'bg-accent-green/15 text-accent-green' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
              }`}>
              {g.split(' ')[0]}
            </button>
          ))}
        </div>
        {/* Emoji grid */}
        <div className="grid grid-cols-9 gap-0.5 p-2 max-h-56 overflow-y-auto">
          {filtered.map((e, i) => (
            <button key={`${e}-${i}`} onClick={() => onPick(e)}
              className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-bg-hover transition-colors">
              {e}
            </button>
          ))}
        </div>
        {/* Footer */}
        <div className="px-3 py-2 border-t border-border bg-bg-secondary/60 text-[10px] text-text-muted flex items-center justify-between">
          <span>Klik untuk insert</span>
          <span className="font-semibold">{activeGroup}</span>
        </div>
      </div>
    </>
  )
}

// ── Template Picker ───────────────────────────────────────────────────────────

function TemplatePicker({ onPick, onClose, contactName }: { onPick: (body: string) => void; onClose: () => void; contactName: string }) {
  const store     = useStore()
  const templates = store.templates as Template[]
  const [search, setSearch] = useState('')
  const filtered  = templates.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))

  const applyTemplate = async (t: Template) => {
    const body = t.body.replace(/\{nama\}/g, contactName || 'tuan/puan').replace(/\{telefon\}/g, '').replace(/\{tarikh\}/g, new Date().toLocaleDateString('ms-MY'))
    if (t.id) await window.wa.useTemplate(t.id).catch(() => {})
    onPick(body)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-10 left-0 z-50 w-80 bg-bg-tertiary border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <Zap size={13} className="text-accent-green" />
          <span className="text-xs font-semibold text-text-primary">Template Pantas</span>
          <button onClick={onClose} className="ml-auto text-text-muted hover:text-text-primary"><X size={13} /></button>
        </div>
        <div className="p-2 border-b border-border">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari template..."
            className="w-full bg-bg-hover border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-blue" />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-text-muted py-6">Tiada template. Buat di bahagian Templates.</p>
          ) : (
            filtered.map(t => (
              <button key={t.id} onClick={() => applyTemplate(t)}
                className="w-full text-left px-3 py-2.5 hover:bg-bg-hover transition-colors border-b border-border/30 last:border-0">
                <p className="text-xs font-medium text-text-primary">{t.title}</p>
                <p className="text-xxs text-text-muted mt-0.5 line-clamp-1">{t.body}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type GroupItem = { type: 'date'; label: string; msg?: undefined } | { type: 'msg'; msg: Message; label?: undefined }

function groupMessages(msgs: Message[]): GroupItem[] {
  const result: GroupItem[] = []
  let lastDate = ''
  for (const msg of msgs) {
    const d = new Date(msg.timestamp)
    const label = getDateLabel(d)
    if (label !== lastDate) {
      result.push({ type: 'date', label })
      lastDate = label
    }
    result.push({ type: 'msg', msg })
  }
  return result
}

function getDateLabel(d: Date): string {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgD  = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff  = Math.floor((today.getTime() - msgD.getTime()) / 86400000)
  if (diff === 0) {
    try { return t('common.today', getActiveLang()) } catch { return 'Today' }
  }
  if (diff === 1) {
    try { return t('common.yesterday', getActiveLang()) } catch { return 'Yesterday' }
  }
  const locale = getActiveLang() === 'zh' ? 'zh-CN' : getActiveLang() === 'ms' ? 'ms-MY' : 'en-US'
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
}
