export interface Contact {
  id: string; phone: string; name: string; avatar: string
  tags: string; notes: string; label: string; is_blocked: number
  created_at?: string; updated_at?: string
}

export interface Conversation {
  id: string; contact_id: string; last_message: string; last_msg_time: string
  unread_count: number; is_pinned: number; is_archived: number
  ai_enabled: number; ai_model: string; ai_persona: string
  ai_outreach_enabled?: number; ai_outreach_sent_at?: string
  created_at?: string; updated_at?: string
  // Joined
  name: string; phone: string; avatar: string; tags: string; label: string; notes?: string
}

export interface Message {
  id: string; conversation_id: string; wa_msg_id: string; content: string
  type: MessageType; is_from_me: number; is_ai_reply: number; status: MessageStatus
  timestamp: string; media_url: string; mime_type: string; caption: string
}

export interface KBEntry {
  id?: string; category: string; title: string; content: string
  is_active: number; sort_order?: number; created_at?: string; updated_at?: string
}

export interface AIBackend {
  id: string; name: string; url: string; type: 'ollama'|'openai'; models: string[]
}

export type MessageType   = 'text'|'image'|'video'|'audio'|'document'|'sticker'|'reaction'|'location'|'unknown'
export type MessageStatus = 'sending'|'sent'|'delivered'|'read'|'failed'
export type ConvLabel     = 'none'|'new_lead'|'customer'|'vip'|'support'|'closed'

export interface DriveStatus {
  connected: boolean
  email: string | null
  hasClientId: boolean
  lastBackup: string | null
  autoBackup: boolean
}

export interface DriveBackup {
  id: string
  name: string
  modifiedTime: string
  size: string
  description?: string
}

export interface ReportStats {
  range: { from: string; to: string }
  summary: {
    totalMessages: number
    messagesIn: number
    messagesOut: number
    aiReplies: number
    manualReplies: number
    aiRate: number
    activeConversations: number
    newCustomers: number
    returningCustomers: number
    avgResponseMinutes: number
    totalRevenue: number
    pendingRevenue: number
    ordersCount: number
  }
  daily: Array<{ d: string; in_count: number; out_count: number; ai_count: number }>
  hourly: Array<{ h: number; c: number }>
  topContacts: Array<{ name: string; phone: string; label: string; msg_count: number; msgs_from_them: number; msgs_to_them: number }>
  segments: Array<{ label: string; cnt: number }>
  orders: Array<{ id: string; title: string; amount: number; status: string; paid: number; created_at: string; customer_name: string; customer_phone: string }>
  newCustomersList: Array<{ id: string; name: string; phone: string; first_msg: string }>
  returningCustomersList: Array<{ id: string; name: string; phone: string }>
}

declare global {
  interface Window {
    wa: {
      connect: () => Promise<void>
      logout:  () => Promise<void>
      sendMessage: (jid: string, text: string) => Promise<{ok:boolean;data?:unknown;error?:string}>
      sendMedia: (payload: { jid: string; mediaBase64: string; mimeType: string; fileName: string; caption: string }) => Promise<{ok:boolean;data?:unknown;error?:string}>
      getStatusStories: () => Promise<StatusStory[]>
      uploadStatus: (payload: { text?: string; mediaBase64?: string; mimeType?: string; fileName?: string; caption?: string; backgroundColor?: string; font?: number }) => Promise<{ok:boolean; story?:StatusStory; audience?:number; error?:string}>
      syncStatuses: () => Promise<{ok:boolean; count?:number; reconnecting?:boolean; error?:string}>
      deleteStatusStory: (id: string) => Promise<{ok:boolean; error?:string}>
      getState: () => Promise<{isConnected:boolean;user:unknown}>
      subscribePresence: (jid: string) => Promise<void>
      syncHistory: () => Promise<{ok:boolean; groups?:number; reconnecting?:boolean; error?:string}>
      getConversations: () => Promise<Conversation[]>
      getMessages: (jid: string, l?: number, o?: number) => Promise<Message[]>
      clearUnread: (jid: string) => Promise<void>
      updateConversation: (jid: string, data: object) => Promise<void>
      updateContact: (id: string, data: object) => Promise<void>
      getAllContacts: () => Promise<Contact[]>
      searchMessages: (q: string) => Promise<Message[]>
      getAnalytics: () => Promise<unknown>
      getKB: () => Promise<KBEntry[]>
      saveKBEntry: (e: KBEntry) => Promise<string>
      deleteKBEntry: (id: string) => Promise<void>
      getTemplates: () => Promise<unknown[]>
      saveTemplate: (t: unknown) => Promise<string>
      deleteTemplate: (id: string) => Promise<void>
      useTemplate: (id: string) => Promise<unknown>
      getOrders: (cid?: string) => Promise<unknown[]>
      saveOrder: (o: unknown) => Promise<string>
      deleteOrder: (id: string) => Promise<void>
      getBroadcasts: () => Promise<unknown[]>
      saveBroadcast: (b: unknown) => Promise<string>
      deleteBroadcast: (id: string) => Promise<void>
      sendBroadcast: (id: string) => Promise<unknown>
      getReminders: (s?: string) => Promise<unknown[]>
      saveReminder: (r: unknown) => Promise<string>
      deleteReminder: (id: string) => Promise<void>
      getCalendarEvents: () => Promise<unknown[]>
      saveCalendarEvent: (e: unknown) => Promise<string>
      deleteCalendarEvent: (id: string) => Promise<void>
      getSettings: () => Promise<Record<string,string>>
      setSetting: (k: string, v: string) => Promise<void>
      detectAI: () => Promise<AIBackend[]>
      testAI: (id: string, url: string, type: string) => Promise<{ok:boolean;error?:string}>
      generateReply: (p: unknown) => Promise<string>
      setAIOutreach: (p: { jid: string; enabled: boolean; sendNow?: boolean; force?: boolean }) => Promise<{ok:boolean; sent?:number; skipped?:number; fail?:number; error?:string}>
      setAIOutreachAll: (p: { enabled: boolean; sendNow?: boolean }) => Promise<{ok:boolean; total?:number; sent?:number; skipped?:number; fail?:number; error?:string}>
      sendAIOutreachNow: (jid: string) => Promise<{ok:boolean; error?:string}>
      diagnoseAI: () => Promise<{ok:boolean; backends:AIBackend[]; defaultModel:string; autoEnable:string; aiEnabledCount:number; totalConvs:number}>
      enableAIForAll: () => Promise<{ok:boolean; count?:number; model?:string; error?:string}>
      clearAIHistory: (jid: string) => Promise<{deleted:number}>
      clearConversation: (jid: string) => Promise<{deleted:number}>
      getReportStats: (p: { startDate: string; endDate: string }) => Promise<ReportStats>
      saveReportPDF: (p: { html: string; defaultFileName?: string }) => Promise<{ok:boolean; path?:string; size?:number; canceled?:boolean; error?:string}>
      // Google Drive
      driveStatus: () => Promise<DriveStatus>
      driveSetClientId: (id: string) => Promise<{ok:boolean}>
      driveConnect: (id?: string) => Promise<{ok:boolean; email?:string; error?:string}>
      driveDisconnect: () => Promise<{ok:boolean}>
      driveBackupNow: () => Promise<{ok:boolean; id?:string; name?:string; size?:number; replaced?:boolean; error?:string}>
      driveListBackups: () => Promise<{ok:boolean; files?:DriveBackup[]; error?:string}>
      driveRestore: (id: string) => Promise<{ok:boolean; path?:string; error?:string}>
      driveDelete: (id: string) => Promise<{ok:boolean; error?:string}>
      // Auto-Updater
      updaterCheck:    () => Promise<{ok:boolean; reason?:string; error?:string}>
      updaterDownload: () => Promise<{ok:boolean; error?:string}>
      updaterInstall:  () => Promise<{ok:boolean}>
      updaterStatus:   () => Promise<{state:string; version?:string; releaseNotes?:string; percent?:number; bytesPerSecond?:number; transferred?:number; total?:number; currentVersion?:string; fileSize?:number|null; timestamp?:number; message?:string}>
      appVersion:      () => Promise<string>
      // Generator (Seller mode)
      genBuild:        (opts?: {bundleOllama?: boolean; plan?: 'demo'|'basic'|'pro'|'pro_max'}) => Promise<{ok:boolean; path?:string; sizeMB?:string; plan?:string; planName?:string; error?:string}>
      genStatus:       () => Promise<{state:string; installer?:string; path?:string; sizeMB?:string; message?:string; line?:string}>
      genReveal:       () => Promise<{ok:boolean; error?:string}>
      genIsOwner:      () => Promise<boolean>
      on: (channel: string, fn: (data: unknown) => void) => () => void
    }
    electron: { send: (ch: string, data?: unknown) => void }
  }
}

export interface StatusStory {
  id: string
  wa_msg_id: string
  participant_jid: string
  participant_name: string
  content: string
  type: MessageType
  media_url: string
  mime_type: string
  caption: string
  timestamp: string
  expires_at: string
  is_from_me: number
}
