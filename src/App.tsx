import { useEffect, useCallback } from 'react'
import { useStore } from './store'
import { useTheme } from './hooks/useTheme'
import { applyLangAttr, useT } from './i18n'
import type { Lang } from './i18n'
import type { Conversation, Message } from './types'
import QRLogin    from './components/QRLogin'
import LeftNav    from './components/LeftNav'
import Sidebar    from './components/Sidebar'
import ChatView   from './components/ChatView'
import RightPanel from './components/RightPanel'
import Settings   from './components/Settings'
import TitleBar   from './components/TitleBar'
import Dashboard  from './components/Dashboard'
import Broadcast  from './components/Broadcast'
import Templates  from './components/Templates'
import Orders     from './components/Orders'
import Reminders  from './components/Reminders'
import Analytics  from './components/Analytics'
import Pipeline   from './components/Pipeline'
import Insights   from './components/Insights'
import QuickSend  from './components/QuickSend'
import Reports    from './components/Reports'
import Calendar   from './components/Calendar'
import StatusStories from './components/StatusStories'
import UpdateBanner from './components/UpdateBanner'
import { canUseSection } from './lib/plans'

export default function App() {
  // Apply theme from settings (dark/light/system)
  useTheme()

  // Apply language attribute on html element (reactive to setting change)
  const lang = (useStore(s => s.appSettings['app_language']) || 'ms') as Lang
  useEffect(() => { applyLangAttr(lang) }, [lang])

  const {
    isConnected, showQR, showSettings, activeConvId, section,
    setConnected, setQR, setConversations, upsertConversation,
    appendMessage, updateMsgStatus, setTyping, setPresence,
    setAiBackends, setKBEntries, setAppSettings, setTemplates,
    setOrders, setBroadcasts, setReminders, setCalendarEvents, setContacts, setAnalytics,
    setSyncProgress, resetWhatsAppData,
  } = useStore()

  useEffect(() => {
    const wa = window.wa; if (!wa) return
    const off: Array<() => void> = []

    off.push(wa.on('wa:qr', (d) => setQR(d as string)))

    off.push(wa.on('wa:connected', (d) => {
      const u = (d as { user: { id: string; name: string } }).user
      setConnected(true, u)
      loadAll()
    }))

    off.push(wa.on('wa:disconnected', (d) => {
      if ((d as { loggedOut: boolean }).loggedOut) { setConnected(false); setQR(null) }
      else setConnected(false)
    }))

    off.push(wa.on('wa:message', (d) => {
      const msg = d as Message & {
        conversationId: string
        senderName?: string
        mediaUrl?: string
        mimeType?: string
        waMsgId?: string
        isFromMe?: boolean
        isAiReply?: boolean
      }
      const m: Message = {
        id:              msg.id || msg.wa_msg_id || msg.waMsgId || String(Date.now()),
        conversation_id: msg.conversationId,
        wa_msg_id:       msg.wa_msg_id || msg.waMsgId || '',
        content:         msg.content || '',
        type:            msg.type || 'text',
        is_from_me:      msg.isFromMe || msg.is_from_me === 1 ? 1 : 0,
        is_ai_reply:     msg.isAiReply || msg.is_ai_reply === 1 ? 1 : 0,
        status:          msg.status || 'sent',
        timestamp:       msg.timestamp || new Date().toISOString(),
        media_url:       msg.mediaUrl || msg.media_url || '',
        mime_type:       msg.mimeType || msg.mime_type || '',
        caption:         msg.caption || '',
      }
      appendMessage(msg.conversationId, m)
      wa.getConversations().then(list => setConversations(list))
      if (!m.is_from_me) {
        window.electron?.send('notify', { title: `📩 ${msg.senderName || 'New Message'}`, body: m.content.slice(0, 80) || '📎 Attachment' })
      }
    }))

    off.push(wa.on('wa:status_update', (d) => {
      const { msgId, status } = d as { msgId: string; status: string }
      updateMsgStatus(msgId, status)
    }))

    off.push(wa.on('wa:typing',   (d) => { const { jid, typing } = d as { jid: string; typing: boolean }; setTyping(jid, typing) }))
    off.push(wa.on('wa:presence', (d) => { const { jid, presence } = d as { jid: string; presence: string }; setPresence(jid, presence) }))
    off.push(wa.on('wa:contacts_updated', () => {
      Promise.all([wa.getConversations(), wa.getAllContacts()])
        .then(([convs, contacts]) => {
          setConversations(convs)
          setContacts(contacts as Parameters<typeof setContacts>[0])
        })
        .catch(() => {})
    }))

    off.push(wa.on('wa:account_changed', () => {
      resetWhatsAppData()
      setSyncProgress({ active: true, totalSaved: 0, progress: 0, done: false })
    }))

    off.push(wa.on('wa:reminder_due', (d) => {
      const r = d as { title: string; message: string }
      window.electron?.send('notify', { title: `🔔 Reminder: ${r.title}`, body: r.message })
    }))

    off.push(wa.on('calendar:event_saved', () => {
      wa.getCalendarEvents().then(list => setCalendarEvents(list as Parameters<typeof setCalendarEvents>[0])).catch(() => {})
    }))

    // History sync events
    off.push(wa.on('wa:history_sync_start', () => {
      setSyncProgress({ active: true, totalSaved: 0, progress: 0, done: false })
    }))
    off.push(wa.on('wa:history_sync_progress', (d) => {
      const p = d as { totalSaved: number; progress: number }
      setSyncProgress({ active: true, totalSaved: p.totalSaved, progress: p.progress || 0, done: false })
      // Refresh conversation list as new messages stream in
      wa.getConversations().then(setConversations).catch(() => {})
    }))
    off.push(wa.on('wa:history_sync_done', (d) => {
      const p = d as { totalSaved: number }
      setSyncProgress({ active: false, totalSaved: p.totalSaved, progress: 100, done: true })
      wa.getConversations().then(setConversations).catch(() => {})
      // Auto-hide after 4s
      setTimeout(() => setSyncProgress(null), 4000)
    }))

    // Check initial state
    wa.getState().then(s => {
      if ((s as { isConnected: boolean }).isConnected) {
        setConnected(true, (s as { user: unknown }).user as { id: string; name: string })
        loadAll()
      }
    })

    return () => off.forEach(f => f())
  }, [])

  const loadAll = useCallback(async () => {
    const wa = window.wa; if (!wa) return
    const [convs, kb, settings, backends, tpls, contacts, analytics, calendar] = await Promise.all([
      wa.getConversations(), wa.getKB(), wa.getSettings(),
      wa.detectAI(), wa.getTemplates(), wa.getAllContacts(), wa.getAnalytics(), wa.getCalendarEvents(),
    ])
    setConversations(convs)
    setKBEntries(kb)
    setAppSettings(settings)
    setAiBackends(backends)
    setTemplates(tpls)
    setContacts(contacts as Parameters<typeof setContacts>[0])
    setAnalytics(analytics as Parameters<typeof setAnalytics>[0])
    setCalendarEvents(calendar as Parameters<typeof setCalendarEvents>[0])
  }, [])

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <TitleBar />

      {showQR || !isConnected ? (
        <QRLogin />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <LeftNav />
          <MainContent section={section} activeConvId={activeConvId} />
        </div>
      )}

      {showSettings && <Settings />}

      {/* Auto-Update banner (bottom-right) — shows when update available/downloading/ready */}
      <UpdateBanner />
    </div>
  )
}

function MainContent({ section, activeConvId }: { section: string; activeConvId: string | null }) {
  const plan = useStore(s => s.appSettings['license_plan'])
  const safeSection = canUseSection(plan, section) ? section : 'chats'

  if (safeSection === 'status')     return <div className="flex-1 overflow-hidden"><StatusStories /></div>
  if (safeSection === 'dashboard')  return <div className="flex-1 overflow-hidden"><Dashboard /></div>
  if (safeSection === 'broadcast')  return <div className="flex-1 overflow-hidden"><Broadcast /></div>
  if (safeSection === 'templates')  return <div className="flex-1 overflow-hidden"><Templates /></div>
  if (safeSection === 'orders')     return <div className="flex-1 overflow-hidden"><Orders /></div>
  if (safeSection === 'reminders')  return <div className="flex-1 overflow-hidden"><Reminders /></div>
  if (safeSection === 'calendar')   return <div className="flex-1 overflow-hidden"><Calendar /></div>
  if (safeSection === 'analytics')  return <div className="flex-1 overflow-hidden"><Analytics /></div>
  if (safeSection === 'pipeline')   return <div className="flex-1 overflow-hidden"><Pipeline /></div>
  if (safeSection === 'insights')   return <div className="flex-1 overflow-hidden"><Insights /></div>
  if (safeSection === 'quicksend')  return <div className="flex-1 overflow-hidden"><QuickSend /></div>
  if (safeSection === 'reports')    return <div className="flex-1 overflow-hidden"><Reports /></div>

  // Chats section
  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden border-x border-border">
        {activeConvId ? <ChatView /> : <EmptyChat />}
      </div>
      {activeConvId && <RightPanel />}
    </>
  )
}

function EmptyChat() {
  const t = useT()
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-bg-tertiary flex items-center justify-center mb-2">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" stroke="#25D366" strokeWidth="2" opacity="0.3"/>
          <path d="M20 12v8l5 3" stroke="#25D366" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-text-primary">{t('chat.empty')}</h2>
      <p className="text-text-secondary text-sm max-w-xs">{t('chat.emptyDesc')}</p>
    </div>
  )
}
