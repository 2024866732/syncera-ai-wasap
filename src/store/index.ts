import { create } from 'zustand'
import type { Conversation, Message, KBEntry, AIBackend } from '../types'

export type AppSection  = 'chats' | 'status' | 'dashboard' | 'broadcast' | 'templates' | 'orders' | 'reminders' | 'calendar' | 'analytics' | 'pipeline' | 'insights' | 'quicksend' | 'reports'
export type RightTab    = 'contact' | 'ai' | 'knowledge'
export type FilterTab   = 'all' | 'unread' | 'ai_on' | 'pinned'
export type ConvLabel   = 'none'|'new_lead'|'customer'|'vip'|'support'|'closed'

export interface Contact {
  id: string; phone: string; name: string; avatar: string
  tags: string; notes: string; label: ConvLabel; is_blocked: number
}

export interface Order {
  id?: string; contact_id: string; conversation_id?: string
  title: string; items?: unknown[]; amount: number; currency?: string
  status: 'new'|'processing'|'shipped'|'completed'|'cancelled'
  paid: number; paid_at?: string; notes?: string; due_date?: string
  created_at?: string; name?: string; phone?: string
}

export interface Template {
  id?: string; category: string; title: string; body: string
  usage_count?: number; created_at?: string
}

export interface Broadcast {
  id?: string; title: string; message: string; label_filter?: string
  contact_ids?: string[]; scheduled_at?: string; status?: string
  sent_count?: number; fail_count?: number; created_at?: string
}

export interface Reminder {
  id?: string; contact_id: string; conversation_id?: string
  title: string; message: string; remind_at: string
  repeat_rule?: string; status?: string; name?: string; phone?: string
}

export interface CalendarEvent {
  id?: string; contact_id: string; conversation_id?: string
  title: string; description?: string; location?: string
  start_at: string; end_at?: string; status?: string; source?: string
  name?: string; phone?: string
}

export interface Analytics {
  total_contacts: number; total_convs: number
  msgs_today_in: number; msgs_today_out: number
  ai_replies_today: number; unread_total: number
  ai_active: number; orders_pending: number
  revenue_total: number; revenue_pending: number
  finance_income_total?: number; finance_expense_total?: number; finance_profit_total?: number
  msgs_week: { d: string; c: number }[]
  top_contacts: { name: string; phone: string; msg_count: number }[]
}

export interface SyncProgress {
  active: boolean
  totalSaved: number
  progress: number
  done: boolean
}

interface Store {
  // Auth
  isConnected: boolean; waUser: { id: string; name: string } | null; qrCode: string | null; showQR: boolean
  // Nav
  section: AppSection
  // Chats
  conversations: Conversation[]; activeConvId: string | null
  filterTab: FilterTab; searchQuery: string; searchResults: Message[]
  messages: Record<string, Message[]>
  typingJids: Set<string>; presences: Record<string, string>
  // Panels
  showSettings: boolean; rightTab: RightTab
  // AI
  aiBackends: AIBackend[]
  // Data
  kbEntries: KBEntry[]; templates: Template[]; orders: Order[]
  broadcasts: Broadcast[]; reminders: Reminder[]; calendarEvents: CalendarEvent[]; contacts: Contact[]
  analytics: Analytics | null; appSettings: Record<string, string>
  syncProgress: SyncProgress | null

  // Actions
  setConnected: (v: boolean, user?: unknown) => void
  setQR: (url: string | null) => void
  setSection: (s: AppSection) => void
  setConversations: (list: Conversation[]) => void
  upsertConversation: (conv: Partial<Conversation> & { id: string }) => void
  setActiveConv: (id: string | null) => void
  setMessages: (jid: string, msgs: Message[]) => void
  appendMessage: (jid: string, msg: Message) => void
  updateMsgStatus: (msgId: string, status: string) => void
  setFilter: (t: FilterTab) => void
  setSearch: (q: string, res?: Message[]) => void
  setShowSettings: (v: boolean) => void
  setRightTab: (t: RightTab) => void
  setTyping: (jid: string, v: boolean) => void
  setPresence: (jid: string, p: string) => void
  setAiBackends: (l: AIBackend[]) => void
  setKBEntries: (l: KBEntry[]) => void
  setTemplates: (l: Template[]) => void
  setOrders: (l: Order[]) => void
  setBroadcasts: (l: Broadcast[]) => void
  setReminders: (l: Reminder[]) => void
  setCalendarEvents: (l: CalendarEvent[]) => void
  setContacts: (l: Contact[]) => void
  setAnalytics: (a: Analytics) => void
  setAppSettings: (s: Record<string, string>) => void
  updateSetting: (k: string, v: string) => void
  setSyncProgress: (p: SyncProgress | null) => void
  resetWhatsAppData: () => void
}

export const useStore = create<Store>((set, get) => ({
  isConnected: false, waUser: null, qrCode: null, showQR: false,
  section: 'chats',
  conversations: [], activeConvId: null, filterTab: 'all', searchQuery: '', searchResults: [],
  messages: {}, typingJids: new Set(), presences: {},
  showSettings: false, rightTab: 'contact',
  aiBackends: [], kbEntries: [], templates: [], orders: [],
  broadcasts: [], reminders: [], calendarEvents: [], contacts: [], analytics: null, appSettings: {}, syncProgress: null,

  setConnected: (v, user) => set({ isConnected: v, waUser: user ? user as Store['waUser'] : get().waUser, showQR: !v, qrCode: v ? null : get().qrCode }),
  setQR: (url) => set({ qrCode: url, showQR: true }),
  setSection: (s) => set({ section: s }),
  setConversations: (list) => set({ conversations: list }),
  upsertConversation: (conv) => set(state => {
    const idx = state.conversations.findIndex(c => c.id === conv.id)
    if (idx >= 0) { const u = [...state.conversations]; u[idx] = { ...u[idx], ...conv }; return { conversations: u } }
    return { conversations: [conv as Conversation, ...state.conversations] }
  }),
  setActiveConv: (id) => set({ activeConvId: id }),
  setMessages: (jid, msgs) => set(state => ({ messages: { ...state.messages, [jid]: msgs } })),
  appendMessage: (jid, msg) => set(state => {
    const ex = state.messages[jid] || []
    if (msg.wa_msg_id && ex.some(m => m.wa_msg_id === msg.wa_msg_id)) return {}
    return { messages: { ...state.messages, [jid]: [...ex, msg] } }
  }),
  updateMsgStatus: (msgId, status) => set(state => {
    const updated: Record<string, Message[]> = {}
    for (const [j, ms] of Object.entries(state.messages))
      updated[j] = ms.map(m => m.wa_msg_id === msgId ? { ...m, status: status as Message['status'] } : m)
    return { messages: updated }
  }),
  setFilter: (t) => set({ filterTab: t }),
  setSearch: (q, res) => set({ searchQuery: q, searchResults: res || [] }),
  setShowSettings: (v) => set({ showSettings: v }),
  setRightTab: (t) => set({ rightTab: t }),
  setTyping: (jid, v) => set(state => { const s = new Set(state.typingJids); v ? s.add(jid) : s.delete(jid); return { typingJids: s } }),
  setPresence: (jid, p) => set(state => ({ presences: { ...state.presences, [jid]: p } })),
  setAiBackends: (l) => set({ aiBackends: l }),
  setKBEntries: (l) => set({ kbEntries: l }),
  setTemplates: (l) => set({ templates: l }),
  setOrders: (l) => set({ orders: l }),
  setBroadcasts: (l) => set({ broadcasts: l }),
  setReminders: (l) => set({ reminders: l }),
  setCalendarEvents: (l) => set({ calendarEvents: l }),
  setContacts: (l) => set({ contacts: l }),
  setAnalytics: (a) => set({ analytics: a }),
  setAppSettings: (s) => set({ appSettings: s }),
  updateSetting: (k, v) => set(state => ({ appSettings: { ...state.appSettings, [k]: v } })),
  setSyncProgress: (p) => set({ syncProgress: p }),
  resetWhatsAppData: () => set({
    conversations: [],
    activeConvId: null,
    messages: {},
    contacts: [],
    calendarEvents: [],
    presences: {},
    typingJids: new Set(),
    analytics: null,
  }),
}))

export function filteredConversations(state: Store): Conversation[] {
  const { conversations, filterTab, searchQuery } = state
  let list = conversations
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    list = list.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.last_message?.toLowerCase().includes(q))
  }
  switch (filterTab) {
    case 'unread': return list.filter(c => c.unread_count > 0)
    case 'ai_on':  return list.filter(c => c.ai_enabled)
    case 'pinned': return list.filter(c => c.is_pinned)
    default:       return list
  }
}

export const LABEL_META: Record<ConvLabel, { label: string; color: string }> = {
  none:     { label: 'No Label',  color: '#6E7681' },
  new_lead: { label: 'New Lead',  color: '#58A6FF' },
  customer: { label: 'Customer',  color: '#3FB950' },
  vip:      { label: 'VIP',       color: '#D29922' },
  support:  { label: 'Support',   color: '#F78166' },
  closed:   { label: 'Closed',    color: '#6E7681' },
}

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  new:        { label: 'New Order',   color: '#58A6FF' },
  processing: { label: 'Processing',  color: '#D29922' },
  shipped:    { label: 'Shipped',     color: '#BC8CFF' },
  completed:  { label: 'Completed',   color: '#3FB950' },
  cancelled:  { label: 'Cancelled',   color: '#F85149' },
}
