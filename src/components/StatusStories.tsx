import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleDashed, Image as ImageIcon, Loader2, Play, RefreshCw, Send, Trash2, Upload, X,
} from 'lucide-react'
import type { StatusStory } from '../types'

type UploadFile = { base64: string; mimeType: string; fileName: string; preview: string }

export default function StatusStories() {
  const [stories, setStories] = useState<StatusStory[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<UploadFile | null>(null)
  const [selected, setSelected] = useState<StatusStory | null>(null)
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const list = await window.wa.getStatusStories()
      setStories(list || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const off = window.wa.on('wa:status_story', (raw) => {
      const story = raw as StatusStory
      setStories(prev => [story, ...prev.filter(s => s.wa_msg_id !== story.wa_msg_id)])
    })
    return off
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, StatusStory[]>()
    for (const story of stories) {
      const key = story.is_from_me ? 'My Status' : (story.participant_name || story.participant_jid || 'WhatsApp')
      map.set(key, [...(map.get(key) || []), story])
    }
    return [...map.entries()]
  }, [stories])

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    if (!picked.type.startsWith('image/') && !picked.type.startsWith('video/')) {
      setNotice('Status hanya support gambar atau video.')
      return
    }
    if (picked.size > 16 * 1024 * 1024) {
      setNotice('Saiz maksimum status ialah 16 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setFile({
        base64: dataUrl.split(',')[1] || '',
        mimeType: picked.type,
        fileName: picked.name,
        preview: dataUrl,
      })
    }
    reader.readAsDataURL(picked)
  }

  const upload = async () => {
    if (!text.trim() && !caption.trim() && !file) {
      setNotice('Tulis status atau pilih gambar/video dulu.')
      return
    }
    setSending(true)
    setNotice('')
    try {
      const result = await window.wa.uploadStatus({
        text: file ? '' : text.trim(),
        mediaBase64: file?.base64,
        mimeType: file?.mimeType,
        fileName: file?.fileName,
        caption: file ? caption.trim() : '',
      })
      if (!result.ok) throw new Error(result.error || 'Gagal upload status')
      if (result.story) setStories(prev => [result.story!, ...prev.filter(s => s.wa_msg_id !== result.story!.wa_msg_id)])
      setText('')
      setCaption('')
      setFile(null)
      setNotice(`Status dihantar${typeof result.audience === 'number' ? ` kepada ${result.audience} contact` : ''}.`)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const sync = async () => {
    setLoading(true)
    setNotice('Sync status sedang berjalan. WhatsApp akan reconnect sekejap untuk ambil status/history dari phone.')
    try {
      await window.wa.syncStatuses()
      await load()
    } finally {
      setLoading(false)
    }
  }

  const removeStory = async (story: StatusStory) => {
    const id = story.id || story.wa_msg_id
    setStories(prev => prev.filter(s => (s.id || s.wa_msg_id) !== id))
    if (selected && (selected.id || selected.wa_msg_id) === id) setSelected(null)
    const result = await window.wa.deleteStatusStory(id)
    if (!result.ok) {
      setNotice(result.error || 'Gagal delete status.')
      load()
    }
  }

  return (
    <div className="h-full bg-bg-primary text-text-primary flex flex-col overflow-hidden">
      <header className="flex-shrink-0 px-6 py-4 border-b border-border/60 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CircleDashed size={20} className="text-accent-green" /> Status WA
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Upload story WhatsApp dan lihat status yang sync dari phone.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={sync} disabled={loading} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Sync
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2">
            <Upload size={14} /> Media
          </button>
          <button onClick={upload} disabled={sending} className="btn-primary flex items-center gap-2">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Upload Status
          </button>
        </div>
      </header>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={pickFile} />

      <main className="flex-1 overflow-hidden grid grid-cols-[360px_1fr]">
        <section className="border-r border-border/60 p-4 overflow-y-auto bg-bg-secondary/40">
          <div className="rounded-2xl border border-border bg-bg-tertiary/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-text-muted">Create Story</p>
              <button onClick={() => fileRef.current?.click()} className="text-xxs px-2.5 py-1.5 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors">
                Pilih gambar/video
              </button>
            </div>
            {file ? (
              <div className="rounded-xl border border-border overflow-hidden bg-bg-primary">
                {file.mimeType.startsWith('image/')
                  ? <img src={file.preview} className="w-full max-h-56 object-cover" />
                  : <video src={file.preview} className="w-full max-h-56 object-cover" controls />}
                <div className="p-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-text-secondary truncate">{file.fileName}</p>
                  <button onClick={() => setFile(null)} className="text-text-muted hover:text-status-danger"><X size={15} /></button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Tulis status text..."
                  className="input min-h-[150px] resize-none"
                  maxLength={700}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full min-h-[96px] rounded-xl border border-dashed border-border bg-bg-primary/60 hover:bg-bg-hover hover:border-accent-blue/50 transition-colors flex flex-col items-center justify-center gap-2 text-text-secondary">
                  <Upload size={20} className="text-accent-blue" />
                  <span className="text-sm font-semibold">Klik sini untuk pilih gambar/video status</span>
                  <span className="text-xxs text-text-muted">JPG, PNG, WEBP atau MP4 sampai 16 MB</span>
                </button>
              </div>
            )}
            {file && (
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Caption status..."
                className="input min-h-[90px] resize-none"
                maxLength={700}
              />
            )}
            <button onClick={upload} disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Upload Status ke WhatsApp
            </button>
            {notice && <p className="text-xs text-text-secondary leading-relaxed">{notice}</p>}
          </div>
        </section>

        <section className="overflow-y-auto p-5">
          {loading && stories.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-muted">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-text-muted">
              <CircleDashed size={40} className="mb-3 opacity-50" />
              <p className="font-semibold text-text-secondary">Belum ada status sync.</p>
              <p className="text-xs mt-1 max-w-sm">Klik Sync atau biarkan WhatsApp online. Status yang masuk melalui linked device akan disimpan di sini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
              {grouped.map(([name, items]) => (
                <div key={name} className="rounded-2xl border border-border bg-bg-tertiary/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/60">
                    <p className="font-bold text-sm truncate">{name}</p>
                    <p className="text-xxs text-text-muted">{items.length} story</p>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {items.slice(0, 6).map(story => (
                      <div key={story.id} className="relative group">
                        <button onClick={() => setSelected(story)}
                          className="relative w-full aspect-[9/14] rounded-xl overflow-hidden border border-border bg-bg-primary text-left">
                        {story.media_url && story.type === 'image' && <img src={story.media_url} className="absolute inset-0 w-full h-full object-cover" />}
                        {story.media_url && story.type === 'video' && <video src={story.media_url} className="absolute inset-0 w-full h-full object-cover" />}
                        {!story.media_url && (
                          <div className="absolute inset-0 p-3 flex items-center justify-center bg-gradient-to-br from-accent-green/25 to-accent-blue/20">
                            <p className="text-xs font-semibold line-clamp-6 text-center">{story.content}</p>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent text-white">
                          <p className="text-[10px] font-bold truncate">{formatTime(story.timestamp)}</p>
                          {story.type === 'video' && <Play size={13} className="absolute right-2 bottom-2" />}
                          {story.type === 'image' && <ImageIcon size={13} className="absolute right-2 bottom-2" />}
                        </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeStory(story) }}
                          title="Delete status"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/65 text-white hover:bg-status-danger flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {selected && <StoryModal story={selected} onClose={() => setSelected(null)} onDelete={() => removeStory(selected)} />}
    </div>
  )
}

function StoryModal({ story, onClose, onDelete }: { story: StatusStory; onClose: () => void; onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[88vh] rounded-2xl border border-border bg-bg-primary shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <p className="font-bold">{story.is_from_me ? 'My Status' : story.participant_name}</p>
            <p className="text-xs text-text-muted">{formatTime(story.timestamp)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onDelete} className="w-9 h-9 rounded-xl flex items-center justify-center text-text-muted hover:bg-status-danger/10 hover:text-status-danger">
              <Trash2 size={17} />
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto max-h-[calc(88vh-78px)]">
          {story.media_url && story.type === 'image' && <img src={story.media_url} className="mx-auto max-h-[62vh] rounded-xl object-contain" />}
          {story.media_url && story.type === 'video' && <video src={story.media_url} className="mx-auto max-h-[62vh] rounded-xl" controls autoPlay />}
          {(story.caption || story.content) && (
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-text-primary">{story.caption || story.content}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ms-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
