'use strict'

const path  = require('path')
const fs    = require('fs')
const qrLib = require('qrcode')
const { app } = require('electron')
const db = require('./database')
const ai = require('./ai')

const mediaDir = () => {
  const dir = path.join(app.getPath('userData'), 'media')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
const extFromMime = (mime) => {
  if (!mime) return 'bin'
  const map = { 'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp',
    'video/mp4':'mp4','video/3gpp':'3gp','video/quicktime':'mov',
    'audio/mpeg':'mp3','audio/ogg':'ogg','audio/mp4':'m4a','audio/aac':'aac',
    'application/pdf':'pdf','application/zip':'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
  }
  return map[mime] || mime.split('/')[1] || 'bin'
}

let sock         = null
let mainWindow   = null
let isConnected  = false
let isConnecting = false       // prevents concurrent connect() calls
let retryCount   = 0           // exponential backoff counter
let retryTimer   = null
let autoReplying = new Set()   // conversationIds currently typing
const lastAiReplyByJid = new Map()
const lidToPhoneJid = new Map()

// Outbound queue: serialize sends + rate limit to reduce ban risk
let sendQueue = Promise.resolve()
let lastSendAt = 0

function isGroupJid(jid = '') {
  return jid.endsWith('@g.us')
}

function isLidJid(jid = '') {
  return jid.endsWith('@lid')
}

function isNewsletterJid(jid = '') {
  return jid.endsWith('@newsletter')
}

function ownAccountDigits() {
  return normalizeAccountId(sock?.user || {}).replace(/[^\d]/g, '')
}

function jidDigits(jid = '') {
  return String(jid || '').replace(/@.*/, '').replace(/[^\d]/g, '')
}

function isOwnJid(jid = '') {
  const own = ownAccountDigits()
  const other = jidDigits(jid)
  return !!own && !!other && own === other
}

function normalizePhoneJid(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.endsWith('@s.whatsapp.net')) return raw
  if (raw.endsWith('@c.us')) return raw.replace('@c.us', '@s.whatsapp.net')
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? `${digits}@s.whatsapp.net` : ''
}

function canonicalChatJid(jid = '') {
  if (isLidJid(jid) && lidToPhoneJid.has(jid)) return lidToPhoneJid.get(jid)
  return jid
}

async function groupSubject(jid, fallback = '') {
  if (!isGroupJid(jid) || !sock) return fallback || jid
  try {
    const meta = await sock.groupMetadata(jid)
    return meta?.subject || fallback || jid
  } catch {
    return fallback || jid
  }
}

function pickContactName(source = {}, fallback = '') {
  return String(
    source.name ||
    source.notify ||
    source.verifiedName ||
    source.pushName ||
    source.subject ||
    fallback ||
    '',
  ).trim()
}

async function saveWaContact(source = {}) {
  const jid = source.id || source.jid || ''
  if (!jid || jid === 'status@broadcast' || isNewsletterJid(jid)) return false
  const isGroup = isGroupJid(jid)
  const phoneJid = normalizePhoneJid(source.phoneNumber || source.phone || '')
  if (isLidJid(jid) && phoneJid) lidToPhoneJid.set(jid, phoneJid)
  const phone = isGroup
    ? jid
    : (phoneJid || jid).replace('@s.whatsapp.net', '').replace('@c.us', '')
  if (!phone || (!isGroup && phone.includes('@'))) return false
  const fallback = isGroup ? jid : phone
  const name = isGroup
    ? await groupSubject(jid, pickContactName(source, fallback))
    : pickContactName(source, fallback)
  db.upsertContact(phone, name, '')
  return true
}

async function enqueueSend(fn) {
  // Default 0ms = full speed. User boleh override via setting kalau nak rate-limit.
  // Min 0, max 6s. Caller (e.g. QuickSend bulk) boleh inject their own delay.
  const delaySetting = parseInt(db.getSetting('wa_send_delay_ms', '0'), 10)
  const minDelayMs = Number.isFinite(delaySetting) ? Math.max(0, Math.min(delaySetting, 6000)) : 0
  sendQueue = sendQueue.then(async () => {
    if (minDelayMs > 0) {
      const now = Date.now()
      const wait = Math.max(0, minDelayMs - (now - lastSendAt))
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
    }
    const res = await fn()
    lastSendAt = Date.now()
    return res
  })
  return sendQueue
}

function setMainWindow(win) { mainWindow = win }

function emit(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

function normalizeAccountId(user = {}) {
  return String(user.id || user.jid || '')
    .replace(/:\d+(?=@)/, '')
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .trim()
}

function accountDisplayName(user = {}) {
  return String(user.name || user.notify || user.verifiedName || normalizeAccountId(user) || 'WhatsApp').trim()
}

function ensureCurrentAccountData(user = {}) {
  const accountId = normalizeAccountId(user)
  if (!accountId) return { changed: false }

  const previousId = db.getSetting('wa_account_id', '')
  const initialized = db.getSetting('wa_account_initialized', '0') === '1'
  const counts = db.getWhatsAppDataCounts ? db.getWhatsAppDataCounts() : { conversations: 0, messages: 0, contacts: 0 }
  const hasCachedWaData = (counts.conversations || 0) > 0 || (counts.messages || 0) > 0 || (counts.contacts || 0) > 0
  const changed = previousId && previousId !== accountId
  const importedBeforeAccountTracking = !initialized && hasCachedWaData

  if (changed || importedBeforeAccountTracking) {
    const reason = changed ? 'account_changed' : 'account_tracking_initialized'
    const cleared = db.clearWhatsAppData ? db.clearWhatsAppData() : { ok: false }
    console.log(`[wa] ${reason}: cache cleared for fresh account sync (${previousId || 'unknown'} -> ${accountId})`)
    emit('wa:account_changed', { previousId, accountId, reason, cleared })
  }

  db.setSetting('wa_account_id', accountId)
  db.setSetting('wa_account_name', accountDisplayName(user))
  db.setSetting('wa_account_initialized', '1')
  return { changed: changed || importedBeforeAccountTracking, accountId }
}

// ─── Connect ─────────────────────────────────────────────────────────────────

async function connect() {
  // Guard: don't allow concurrent connects
  if (isConnecting) { console.log('[wa] already connecting, skip'); return }
  if (isConnected)  { console.log('[wa] already connected, skip'); return }
  isConnecting = true

  // Clear any pending retry timer
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }

  // Cleanly tear down old socket if present
  if (sock) {
    try { sock.ev.removeAllListeners(); sock.end(undefined) } catch {}
    sock = null
  }

  try {
    const {
      default: makeWASocket,
      DisconnectReason,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
      Browsers,
    } = await import('@whiskeysockets/baileys')

    const { default: pino } = await import('pino')
    const logger = pino({ level: 'silent' })

    const authDir = path.join(app.getPath('userData'), 'wa-auth')
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    // Read user preference for history sync (default ON for first connect)
    const wantHistory = db.getSetting('wa_sync_history', '1') === '1'

    sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      printQRInTerminal: false,
      browser: Browsers.windows('Desktop'),
      syncFullHistory: wantHistory,         // pull historical chats from phone
      shouldSyncHistoryMessage: () => wantHistory,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 1_000,
      emitOwnEvents: false,
      generateHighQualityLinkPreview: false,
    })

    // ── QR / connection events ──────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        try {
          const qrDataUrl = await qrLib.toDataURL(qr, { width: 320, margin: 1, errorCorrectionLevel: 'L' })
          emit('wa:qr', qrDataUrl)
        } catch (e) { console.error('[wa] QR gen error:', e) }
      }

      if (connection === 'connecting') {
        emit('wa:connecting')
      }

      if (connection === 'open') {
        isConnected  = true
        isConnecting = false
        retryCount   = 0
        // Ensure 'registered' flag persists so next launch skips QR
        try {
          if (state.creds && !state.creds.registered) {
            state.creds.registered = true
            await saveCreds()
            console.log('[wa] persisted registered=true')
          }
        } catch (e) { console.error('[wa] saveCreds error:', e.message) }
        console.log('[wa] connected as', sock.user?.id)
        const accountState = ensureCurrentAccountData(sock.user)
        emit('wa:connected', { user: sock.user })
        syncGroupChats().catch(e => console.error('[wa] group sync error:', e.message))
        const counts = db.getWhatsAppDataCounts ? db.getWhatsAppDataCounts() : { messages: 0 }
        const historyRequestedFor = db.getSetting('wa_history_requested_for', '')
        if (accountState.accountId && (accountState.changed || (counts.messages || 0) === 0) && historyRequestedFor !== accountState.accountId) {
          db.setSetting('wa_history_requested_for', accountState.accountId)
          setTimeout(() => {
            if (isConnected && sock) syncHistoryNow().catch(e => console.error('[wa] auto history sync failed:', e.message))
          }, 2000)
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        const wasConnected = isConnected
        isConnected  = false
        isConnecting = false

        // Only TRULY fatal disconnects warrant clearing auth — most others should just retry
        // with existing auth (badSession/multideviceMismatch are reconnect hints, NOT logouts)
        const isLoggedOut = code === DisconnectReason.loggedOut
        const isForbidden = code === DisconnectReason.forbidden
        const fatal = isLoggedOut || isForbidden

        const transient = code === DisconnectReason.restartRequired
                       || code === DisconnectReason.connectionClosed
                       || code === DisconnectReason.connectionLost
                       || code === DisconnectReason.connectionReplaced
                       || code === DisconnectReason.timedOut
                       || code === DisconnectReason.badSession           // <-- KEEP AUTH, just retry
                       || code === DisconnectReason.multideviceMismatch  // <-- KEEP AUTH, just retry
                       || !code

        console.log(`[wa] close (code=${code}, fatal=${fatal}, transient=${transient})`)

        if (fatal) {
          // ONLY explicit logout — purge auth so user can re-pair
          if (isLoggedOut) {
            try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
          }
          emit('wa:disconnected', { loggedOut: isLoggedOut })
          retryTimer = setTimeout(connect, 2000)
        } else if (transient) {
          // Don't alarm the UI — just silently reconnect
          // Only emit disconnect if we WERE connected (lost a live session)
          if (wasConnected) {
            emit('wa:reconnecting')
          }
          // Exponential backoff: 1s, 2s, 4s, 8s, max 15s
          retryCount = Math.min(retryCount + 1, 5)
          const delay = Math.min(1000 * 2 ** (retryCount - 1), 15_000)
          console.log(`[wa] reconnecting in ${delay}ms`)
          retryTimer = setTimeout(connect, delay)
        } else {
          // Unknown — treat as transient with longer delay
          emit('wa:reconnecting')
          retryTimer = setTimeout(connect, 5000)
        }
      }
    })

    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('contacts.update', async (contacts = []) => {
      let count = 0
      for (const contact of contacts) {
        try { if (await saveWaContact(contact)) count++ } catch {}
      }
      if (count) emit('wa:contacts_updated', { count })
    })
    sock.ev.on('contacts.upsert', async (contacts = []) => {
      let count = 0
      for (const contact of contacts) {
        try { if (await saveWaContact(contact)) count++ } catch {}
      }
      if (count) emit('wa:contacts_updated', { count })
    })

    // ── History sync (when first scanned, phone pushes historical chats) ───
    let historyStarted = false
    let historyTotalSaved = 0
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest, progress }) => {
      if (!historyStarted) {
        historyStarted = true
        emit('wa:history_sync_start', { progress: progress || 0 })
      }

      // 1. Save contacts (skip status; groups are handled from chats/group metadata)
      for (const c of (contacts || [])) {
        try { await saveWaContact(c) } catch {}
      }

      // 2. Save chats / conversations
      for (const chat of (chats || [])) {
        const jid = chat.id
        if (!jid || jid === 'status@broadcast' || isNewsletterJid(jid)) continue
        const isGroup = isGroupJid(jid)
        const phone = isGroup ? jid : jid.replace('@s.whatsapp.net', '').replace('@c.us', '')
        if (!phone) continue
        try {
          const name = isGroup ? await groupSubject(jid, pickContactName(chat, phone)) : pickContactName(chat, phone)
          const contactId = db.upsertContact(phone, name, '')
          db.upsertConversation(jid, contactId)
          const ts = Number(chat.conversationTimestamp || 0)
          if (ts > 0) {
            db.updateConversation(jid, {
              last_msg_time: new Date(ts * 1000).toISOString(),
              unread_count: chat.unreadCount || 0,
            })
          }
        } catch {}
      }

      // 3. Save historical messages
      let savedThisBatch = 0
      for (const waMsg of (messages || [])) {
        try {
          const jid = waMsg.key?.remoteJid
          if (!jid) continue
          if (jid === 'status@broadcast') {
            await handleStatusStory(waMsg)
            savedThisBatch++
            continue
          }
          if (isNewsletterJid(jid)) continue
          if (!waMsg.message) continue

          const { content, type, mimeType, caption } = extractContent(waMsg)
          if (!content && !['image','video','audio','document','sticker'].includes(type)) continue

          const isFromMe = waMsg.key.fromMe ? 1 : 0
          const ts = Number(waMsg.messageTimestamp || 0)
          if (ts === 0) continue
          const timestamp = new Date(ts * 1000).toISOString()

          // Ensure contact + conversation exist
          const isGroup = isGroupJid(jid)
          const phone = isGroup ? jid : jid.replace('@s.whatsapp.net', '').replace('@c.us', '')
          const name = isGroup ? await groupSubject(jid, phone) : (waMsg.pushName || phone)
          const contactId = db.upsertContact(phone, name, '')
          db.upsertConversation(jid, contactId)

          db.saveMessage({
            conversationId: jid,
            waMsgId: waMsg.key.id,
            content, type, isFromMe, timestamp,
            mediaUrl: '', mimeType, caption,
          })
          savedThisBatch++
        } catch (e) { /* skip bad messages */ }
      }
      historyTotalSaved += savedThisBatch

      console.log(`[wa] history batch: chats=${chats?.length||0} contacts=${contacts?.length||0} messages=${messages?.length||0} saved=${savedThisBatch} progress=${progress||0}%`)
      emit('wa:history_sync_progress', {
        chats: chats?.length || 0,
        contacts: contacts?.length || 0,
        messages: savedThisBatch,
        totalSaved: historyTotalSaved,
        progress: progress || 0,
        isLatest,
      })

      if (isLatest) {
        console.log(`[wa] ✓ history sync complete: ${historyTotalSaved} messages imported`)
        emit('wa:history_sync_done', { totalSaved: historyTotalSaved })
        historyStarted = false
        historyTotalSaved = 0
      }
    })

    // ── Incoming messages ───────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const waMsg of messages) {
        try { await handleIncoming(waMsg) }
        catch (e) { console.error('[wa] handle incoming error:', e) }
      }
    })

    // ── Message status updates ──────────────────────────────────────────────
    sock.ev.on('message-receipt.update', (updates) => {
      for (const update of updates) {
        const status = update.receipt?.receiptTimestamp ? 'read'
                     : update.receipt?.deliveredTimestamp ? 'delivered'
                     : null
        if (status) {
          db.updateMessageStatus(update.key.id, status)
          emit('wa:status_update', { msgId: update.key.id, status })
        }
      }
    })

    // ── Presence updates ────────────────────────────────────────────────────
    sock.ev.on('presence.update', ({ id, presences }) => {
      const presence = presences[id]
      if (presence) emit('wa:presence', { jid: id, presence: presence.lastKnownPresence })
    })

  } catch (err) {
    console.error('[wa] connect error:', err)
    isConnecting = false
    emit('wa:error', { message: err.message })
    retryCount = Math.min(retryCount + 1, 5)
    const delay = Math.min(2000 * 2 ** (retryCount - 1), 30_000)
    retryTimer = setTimeout(connect, delay)
  }
}

// ─── Handle incoming message ─────────────────────────────────────────────────

async function handleIncoming(waMsg) {
  const rawJid = waMsg.key.remoteJid
  if (rawJid === 'status@broadcast') {
    await handleStatusStory(waMsg)
    return
  }
  if (!rawJid || rawJid === 'status@broadcast' || isNewsletterJid(rawJid)) return

  const isFromMe = waMsg.key.fromMe ? 1 : 0
  const jid = canonicalChatJid(rawJid)

  const isGroup = jid.endsWith('@g.us')
  const phone = isGroup ? jid : jid.replace('@s.whatsapp.net', '')
  const pushName = isGroup ? await groupSubject(jid, waMsg.pushName || phone) : (waMsg.pushName || phone)

  const contactId = db.upsertContact(phone, pushName, '')
  const isNewConv = !db.getConversations().find(c => c.id === jid)
  db.upsertConversation(jid, contactId)

  // Auto-enable AI for new conversations if global setting is on
  const canAutoEnableAi = !isGroup && !isFromMe && !isOwnJid(rawJid) && !isOwnJid(jid) && !(isLidJid(rawJid) && rawJid === jid)
  if (isNewConv && canAutoEnableAi && db.getSetting('ai_auto_enable', '1') === '1') {
    const defaultModel = db.getSetting('ai_default_model', '')
    const defaultPersona = db.getSetting('ai_default_persona', '')
    db.updateConversation(jid, {
      ai_enabled: 1,
      ai_model: defaultModel,
      ai_persona: defaultPersona,
    })
  }

  let { content, type, mediaUrl, mimeType, caption } = extractContent(waMsg)
  const isMedia = ['image','video','audio','document','sticker'].includes(type)
  if (!content && !caption && !isMedia) {
    console.log(`[wa] skip empty/unknown message ${waMsg.key.id || ''} from ${rawJid}`)
    return
  }

  // Download media (image/video/audio/document) and save to userData/media/
  if (isMedia) {
    try {
      const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
      const buffer = await downloadMediaMessage(waMsg, 'buffer', {})
      if (buffer) {
        const ext = extFromMime(mimeType)
        const fileName = `${waMsg.key.id}.${ext}`.replace(/[^a-zA-Z0-9._-]/g,'_')
        fs.writeFileSync(path.join(mediaDir(), fileName), buffer)
        mediaUrl = `syncera-media://${fileName}`
        console.log(`[wa] saved ${type} → ${fileName} (${(buffer.length/1024).toFixed(0)} KB)`)
      }
    } catch (e) {
      console.error('[wa] media download error:', e.message)
    }
  }

  const timestamp = new Date(Number(waMsg.messageTimestamp) * 1000).toISOString()

  db.saveMessage({
    conversationId: jid, waMsgId: waMsg.key.id, content, type,
    isFromMe, timestamp, mediaUrl, mimeType, caption,
  })

  const preview = type === 'text' ? (content.length > 60 ? content.slice(0, 60) + '…' : content)
                : type === 'image' ? '📷 Image'
                : type === 'video' ? '🎥 Video'
                : type === 'audio' ? '🎤 Audio'
                : type === 'document' ? '📎 Document'
                : '📨 Message'

  db.updateConversation(jid, {
    last_message: preview,
    last_msg_time: timestamp,
    unread_count: isFromMe ? (db.getConversations().find(c => c.id === jid)?.unread_count || 0) : (db.getConversations().find(c => c.id === jid)?.unread_count || 0) + 1,
  })

  const contact = db.getContact(contactId)
  emit('wa:message', {
    conversationId: jid, waMsgId: waMsg.key.id, content, type,
    isFromMe: !!isFromMe, timestamp, senderName: pushName, contact, mediaUrl, mimeType, caption,
  })

  if (isFromMe || isOwnJid(rawJid) || isOwnJid(jid)) {
    console.log(`[wa] own/linked-device message saved for ${jid}; AI skipped`)
    return
  }

  if (isLidJid(rawJid) && rawJid === jid) {
    console.log(`[wa] LID chat ${rawJid} has no phone mapping yet; AI skipped to avoid replying to wrong customer`)
    return
  }

  const conv = db.getConversations().find(c => c.id === jid)
  const globalAuto = db.getSetting('ai_auto_enable', '1') === '1'
  const groupAutoReply = db.getSetting('ai_groups_enabled', '0') === '1'

  // SKIP AI auto-reply for groups unless explicitly enabled (default OFF)
  if (isGroup && !groupAutoReply) {
    console.log(`[wa] Group chat ${jid} — AI auto-reply disabled (toggle ai_groups_enabled to enable)`)
    return
  }

  // Auto-enable on existing conversation if global is on but conv was created before
  if (globalAuto && canAutoEnableAi && conv && !conv.ai_enabled) {
    db.updateConversation(jid, { ai_enabled: 1 })
    conv.ai_enabled = 1
  }

  // If no model set on conv, fall back to default setting, then to first detected model
  if (conv?.ai_enabled && !conv.ai_model) {
    let fallback = db.getSetting('ai_default_model', '')
    if (!fallback) {
      try {
        const backends = await ai.detectBackends()
        if (backends[0]?.models[0]) {
          fallback = `${backends[0].id}:${backends[0].models[0]}`
          db.setSetting('ai_default_model', fallback) // remember it
        }
      } catch {}
    }
    if (fallback) {
      db.updateConversation(jid, { ai_model: fallback })
      conv.ai_model = fallback
    }
  }

  if (conv?.ai_enabled && conv?.ai_model && content && type === 'text') {
    console.log(`[wa] AI reply triggered for ${jid} using ${conv.ai_model}`)
    scheduleAiReply(jid, content, conv)
  } else if (conv?.ai_enabled && content && type === 'text') {
    console.log(`[wa] AI enabled but no model — Ollama running? Skipping reply.`)
    emit('wa:ai_error', { jid, error: 'No AI model configured. Install Ollama and pull a model (e.g. "ollama pull llama3").' })
  }
}

async function saveMessageMedia(waMsg, type, mimeType) {
  if (!['image','video','audio','document','sticker'].includes(type)) return ''
  try {
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
    const buffer = await downloadMediaMessage(waMsg, 'buffer', {})
    if (!buffer) return ''
    const ext = extFromMime(mimeType)
    const fileName = `${waMsg.key.id}.${ext}`.replace(/[^a-zA-Z0-9._-]/g,'_')
    fs.writeFileSync(path.join(mediaDir(), fileName), buffer)
    console.log(`[wa] saved ${type} → ${fileName} (${(buffer.length/1024).toFixed(0)} KB)`)
    return `syncera-media://${fileName}`
  } catch (e) {
    console.error('[wa] media download error:', e.message)
    return ''
  }
}

async function handleStatusStory(waMsg) {
  if (!waMsg?.message) return null
  const participantJid = waMsg.key?.participant || waMsg.participant || (waMsg.key?.fromMe ? sock?.user?.id : '')
  const { content, type, mimeType, caption } = extractContent(waMsg)
  if (!content && !['image','video','audio','document','sticker'].includes(type)) return null
  const mediaUrl = await saveMessageMedia(waMsg, type, mimeType)
  const ts = Number(waMsg.messageTimestamp || 0) || Math.floor(Date.now() / 1000)
  const timestamp = new Date(ts * 1000).toISOString()
  const expiresAt = new Date((ts + 24 * 60 * 60) * 1000).toISOString()
  const phone = participantJid
    ? participantJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/:\d+$/, '')
    : ''
  let participantName = waMsg.pushName || phone || 'WhatsApp Status'
  if (phone && !phone.includes('@')) {
    const contactId = db.upsertContact(phone, participantName, '')
    const contact = db.getContact(contactId)
    participantName = contact?.name || participantName
  }
  const story = {
    id: waMsg.key.id,
    waMsgId: waMsg.key.id,
    participantJid,
    participantName,
    content,
    type,
    mediaUrl,
    mimeType,
    caption,
    timestamp,
    expiresAt,
    isFromMe: waMsg.key.fromMe ? 1 : 0,
  }
  const id = db.saveStatusStory(story)
  const saved = { ...story, id, wa_msg_id: story.waMsgId, participant_jid: participantJid, participant_name: participantName, media_url: mediaUrl, mime_type: mimeType, expires_at: expiresAt, is_from_me: story.isFromMe }
  emit('wa:status_story', saved)
  return saved
}

async function syncGroupChats() {
  if (!sock) return { count: 0 }
  let count = 0
  try {
    const groups = await sock.groupFetchAllParticipating()
    for (const meta of Object.values(groups || {})) {
      const jid = meta?.id
      if (!jid || !isGroupJid(jid)) continue
      const name = meta.subject || jid
      const contactId = db.upsertContact(jid, name, '')
      const isNewConv = !db.getConversations().find(c => c.id === jid)
      db.upsertConversation(jid, contactId)
      if (isNewConv) {
        db.updateConversation(jid, {
          last_message: 'Group chat',
          last_msg_time: new Date().toISOString(),
          ai_enabled: 0,
        })
      }
      count++
    }
    if (count) {
      emit('wa:history_sync_progress', { chats: count, contacts: 0, messages: 0, totalSaved: 0, progress: 100, isLatest: true })
      console.log(`[wa] synced ${count} group chats`)
    }
  } catch (e) {
    console.error('[wa] syncGroupChats failed:', e.message)
  }
  return { count }
}

async function syncHistoryNow() {
  db.setSetting('wa_sync_history', '1')
  emit('wa:history_sync_start', { progress: 0 })

  const groupResult = await syncGroupChats()
  emit('wa:history_sync_progress', {
    chats: groupResult.count || 0,
    contacts: 0,
    messages: 0,
    totalSaved: 0,
    progress: 25,
    isLatest: false,
  })

  if (sock) {
    try { sock.ev.removeAllListeners(); sock.end(undefined) } catch {}
    sock = null
  }
  isConnected = false
  isConnecting = false
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  retryCount = 0
  setTimeout(() => connect(), 600)
  return { ok: true, groups: groupResult.count || 0, reconnecting: true }
}

function scheduleAiReply(jid, userMessage, conv) {
  if (autoReplying.has(jid)) return
  autoReplying.add(jid)
  const delayMs = parseInt(db.getSetting('ai_reply_delay', '2500'))

  setTimeout(async () => {
    try {
      await sock.sendPresenceUpdate('composing', jid)
      emit('wa:typing', { jid, typing: true })

      const history = db.getMessages(jid, 12)
      const kb = db.getKnowledgeBase(true)
      const contact = db.getContact(conv.contact_id)
      const businessProfile = db.getSetting('business_profile', '')
      // Split on FIRST colon only — model names like "llama3.2:3b" contain colons
      const sepIdx = (conv.ai_model || ':').indexOf(':')
      const backendId = conv.ai_model.slice(0, sepIdx)
      const model = conv.ai_model.slice(sepIdx + 1)

      const reply = await ai.generateReply({
        message: userMessage,
        history,
        knowledgeBase: kb,
        persona: conv.ai_persona || db.getSetting('ai_default_persona', ''),
        backendId,
        model,
        contact,
        businessProfile,
      })

      await sock.sendPresenceUpdate('paused', jid)
      emit('wa:typing', { jid, typing: false })
      if (reply) {
        const cleanReply = String(reply).trim()
        const last = lastAiReplyByJid.get(jid)
        if (last && last.text === cleanReply && Date.now() - last.at < 10 * 60 * 1000) {
          console.log('[wa] duplicate AI reply suppressed')
          return
        }
        lastAiReplyByJid.set(jid, { text: cleanReply, at: Date.now() })
        await sendMessage(jid, cleanReply, true)
        autoCancelCalendarFromMessage(jid, userMessage)
        autoSaveCalendarFromBooking(jid, conv, userMessage, history, contact)
      }
    } catch (e) {
      console.error('[wa] AI reply error:', e)
      emit('wa:ai_error', { jid, error: e.message })
    } finally {
      autoReplying.delete(jid)
    }
  }, delayMs)
}

function parseBookingDateTime(texts = []) {
  const all = texts.join('\n').toLowerCase()
  const now = new Date()
  const date = new Date(now)
  const latest = String([...texts].reverse().find(Boolean) || '').toLowerCase()
  const rescheduleText = /\b(tukar|ubah|reschedule|postpone|pinda)\b/i.test(latest)
    ? latest
    : ([...texts].reverse().find(t => /\b(tukar|ubah|reschedule|postpone|pinda)\b/i.test(t || '')) || '')
  const latestHasDateOrTime = /\b(esok|tomorrow|hari ini|today|malam ni|malam ini|\d{1,2}[\/\-. ]\d{1,2}|\d{1,2}\s*(jan|feb|mac|apr|may|mei|jun|jul|aug|ogo|sep|oct|okt|nov|dec|dis)|jam|pukul)\b/i.test(latest)
  const source = latestHasDateOrTime ? latest : (rescheduleText ? String(rescheduleText).toLowerCase() : all)
  const explicit = source.match(/\b(\d{1,2})[\/\-. ](\d{1,2})(?:[\/\-. ](\d{2,4}))?\b/)
  if (explicit) {
    const day = parseInt(explicit[1], 10)
    const month = parseInt(explicit[2], 10) - 1
    const year = explicit[3] ? parseInt(explicit[3].length === 2 ? `20${explicit[3]}` : explicit[3], 10) : now.getFullYear()
    date.setFullYear(year, month, day)
  } else {
    const named = source.match(/\b(\d{1,2})\s*(jan(?:uari)?|feb(?:ruari)?|mac|apr(?:il)?|may|mei|jun|jul(?:ai)?|aug|ogo(?:s)?|sep(?:tember)?|oct|okt(?:ober)?|nov(?:ember)?|dec|dis(?:ember)?)\s*(\d{2,4})?\b/i)
    if (named) {
      const months = {
        jan: 0, januari: 0, feb: 1, februari: 1, mac: 2, apr: 3, april: 3,
        may: 4, mei: 4, jun: 5, jul: 6, julai: 6, aug: 7, ogos: 7,
        sep: 8, september: 8, oct: 9, okt: 9, oktober: 9, nov: 10, november: 10,
        dec: 11, dis: 11, disember: 11,
      }
      const day = parseInt(named[1], 10)
      const monthName = named[2].toLowerCase()
      const month = months[monthName] ?? months[monthName.slice(0, 3)]
      const year = named[3] ? parseInt(named[3].length === 2 ? `20${named[3]}` : named[3], 10) : now.getFullYear()
      if (month !== undefined) date.setFullYear(year, month, day)
    } else if (/\besok|tomorrow\b/i.test(source)) {
      date.setDate(date.getDate() + 1)
    }
  }

  const time = source.match(/\b(?:jam|pukul)\s*(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)?\b/i)
    || source.match(/\b(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)\b/i)
    || all.match(/\b(?:jam|pukul)\s*(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)?\b/i)
    || all.match(/\b(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)\b/i)
  if (!time) return null
  let hour = parseInt(time[1], 10)
  const minute = time[2] ? parseInt(time[2], 10) : 0
  const suffix = time[3] || ''
  if (/malam|pm/i.test(suffix) && hour < 12) hour += 12
  if (/petang/i.test(suffix) && hour < 12) hour += 12
  if (/tengahari/i.test(suffix) && hour < 12) hour += 12
  if (/pagi|am/i.test(suffix) && hour === 12) hour = 0
  if (hour > 23) return null
  date.setHours(hour, minute, 0, 0)
  return date
}

function extractBookingLocation(texts = []) {
  const signals = /\b(no\.?|nombor|jalan|jln|lorong|taman|kampung|kg|bandar|kota|tinggi|johor|selangor|kl|kuala|poskod|\d{5})\b/i
  return [...texts].reverse().find(t => signals.test(t) && /\d/.test(t)) || ''
}

function autoCancelCalendarFromMessage(jid, latestMessage = '') {
  try {
    if (!/\b(cancel|batal|tak jadi|jangan datang|hold dulu|pause dulu|nanti dulu|postpone dulu)\b/i.test(latestMessage || '')) return
    const result = db.cancelLatestCalendarEvent ? db.cancelLatestCalendarEvent(jid) : { ok: false }
    if (result.ok) emit('calendar:event_saved', { jid, cancelled: true, id: result.id })
  } catch (e) {
    console.error('[calendar] auto cancel error:', e.message)
  }
}

function autoSaveCalendarFromBooking(jid, conv, latestMessage, history = [], contact) {
  try {
    const customerTexts = [...(history || []).filter(m => !m.is_from_me).map(m => m.content || ''), latestMessage || ''].filter(Boolean)
    const all = customerTexts.join('\n').toLowerCase()
    const latest = String(latestMessage || '').toLowerCase()
    const wantsVisit = /\b(datang|dtg|turun|checking|check|cek|semak|tengok|periksa|technician|juruteknik)\b/i.test(latest)
    const wantsReschedule = /\b(tukar|ubah|reschedule|postpone|pinda)\b/i.test(latestMessage || '') && /\b(tarikh|date|hari|masa|time|jam|pukul|\d{1,2}|may|mei)\b/i.test(latestMessage || '')
    if (!wantsVisit && !wantsReschedule) return
    const start = parseBookingDateTime(customerTexts)
    const location = extractBookingLocation(customerTexts)
    if (!start || !location) return
    const end = new Date(start.getTime() + 90 * 60000)
    const issue = inferBookingIssue(customerTexts)
    const existing = (wantsReschedule || /\b(trip|blackout|short|terputus|tiada elektrik|tak ada elektrik|elektrik trip|breaker|mcb|rccb|elcb|db|main switch)\b/i.test(all)) ? db.getCalendarEvents()
      .filter(e => e.conversation_id === jid && e.status !== 'cancelled')
      .sort((a, b) => new Date(b.created_at || b.start_at).getTime() - new Date(a.created_at || a.start_at).getTime())[0] : null
    db.saveCalendarEvent({
      id: existing?.id,
      contact_id: conv.contact_id,
      conversation_id: jid,
      title: `${issue} - ${contact?.name || contact?.phone || 'Customer'}`,
      description: `Auto dari chat WhatsApp. Issue: ${issue}.`,
      location,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: 'scheduled',
      source: 'ai_booking',
    })
    emit('calendar:event_saved', { jid, start_at: start.toISOString() })
  } catch (e) {
    console.error('[calendar] auto save error:', e.message)
  }
}

function inferBookingIssue(texts = []) {
  const allCustomerText = (texts || []).join('\n').toLowerCase()
  if (/\b(trip|blackout|short|terputus|tiada elektrik|tak ada elektrik|elektrik trip|breaker|mcb|rccb|elcb|db|main switch)\b/i.test(allCustomerText)) {
    return 'Troubleshoot elektrik rumah'
  }
  for (const raw of [...texts].reverse()) {
    const t = (raw || '').toLowerCase()
    if (/\b(lampu|light)\b/i.test(t)) return 'Checking masalah lampu'
    if (/\b(kipas|fan)\b/i.test(t)) return 'Checking masalah kipas'
    if (/\b(soket|socket|plug|point)\b/i.test(t)) return 'Checking masalah soket'
  }
  return 'Checking elektrik'
}

async function ensureConversationModel(conv) {
  if (!conv) return ''
  if (conv.ai_model) return conv.ai_model
  let fallback = db.getSetting('ai_default_model', '')
  if (!fallback) {
    const backends = await ai.detectBackends()
    if (backends[0]?.models[0]) {
      fallback = `${backends[0].id}:${backends[0].models[0]}`
      db.setSetting('ai_default_model', fallback)
    }
  }
  if (fallback) db.updateConversation(conv.id, { ai_model: fallback })
  return fallback
}

async function generateOutreachText(conv) {
  const modelKey = await ensureConversationModel(conv)
  if (!modelKey) throw new Error('No AI model available. Please configure an AI model first.')

  const fullHistory = db.getRecentMessages ? db.getRecentMessages(conv.id, 80) : db.getMessages(conv.id, 80)
  const history = fullHistory.slice(-18)
  const kb = db.getKnowledgeBase(true)
  const contact = db.getContact(conv.contact_id)
  const businessProfile = db.getSetting('business_profile', '')
  const defaultPersona = db.getSetting('ai_default_persona', '')
  const sepIdx = (modelKey || ':').indexOf(':')
  const backendId = modelKey.slice(0, sepIdx)
  const model = modelKey.slice(sepIdx + 1)

  const chatContext = analyseChatHistory(fullHistory)
  const hasPriorCustomerMessage = chatContext.hasPriorCustomerMessage
  const companyName = getBusinessName(businessProfile)
  const serviceHint = chatContext.serviceHint || getServiceHint(fullHistory)
  const instruction = hasPriorCustomerMessage
    ? `[AI_PROACTIVE_OUTREACH]
Tugas: tulis SATU mesej follow-up WhatsApp untuk customer elektrik.
Syarikat: ${companyName}.
Ringkasan cepat history customer:
${chatContext.summary}
Gaya: staff manusia Malaysia, ringkas, confident, tidak desperate.
Panjang: maksimum 2 ayat pendek.
Wajib: rujuk ringkasan history di atas. Kalau customer pernah tanya quotation/harga/status, follow up benda itu. Tanya satu soalan mudah untuk sambung conversation.
Dilarang: placeholder, tanda kurung template, "Best,", ayat email, ayat Indonesia, ayat panjang, minta nama/nombor telefon.`
    : `[AI_PROACTIVE_OUTREACH]
Tugas: tulis SATU mesej pembuka WhatsApp untuk customer baru.
Syarikat: ${companyName}.
Bidang: servis dan kerja elektrik.
Gaya: staff manusia Malaysia, ringkas, sopan, confident.
Panjang: maksimum 2 ayat pendek.
Wajib: perkenalkan syarikat secara natural dan tanya satu soalan mudah tentang keperluan elektrik customer.
Dilarang: placeholder, tanda kurung template, "Best,", ayat email, ayat Indonesia, ayat panjang, minta nama/nombor telefon.`

  const generated = await ai.generateReply({
    message: instruction,
    history,
    knowledgeBase: kb,
    persona: conv.ai_persona || defaultPersona,
    backendId,
    model,
    contact,
    businessProfile,
  })

  return polishOutreachText(generated, { companyName, hasPriorCustomerMessage, serviceHint, chatContext })
}

function getBusinessName(profile = '') {
  const match = String(profile).match(/(?:nama|syarikat|company|business)\s*[:\-]\s*([^\n]+)/i)
  const name = (match?.[1] || '').trim()
  if (name && name.length < 80) return name
  return 'Kejuruteraan Elektrik Sinar Bahagia'
}

function getServiceHint(history = []) {
  const recentCustomer = [...history].reverse().find(m => !m.is_from_me && (m.content || '').trim())
  const text = (recentCustomer?.content || '').toLowerCase()
  if (/\b(quotation|quote|sebut harga|harga|kos|berapa)\b/i.test(text)) return 'quotation'
  if (/\b(lampu|light|downlight|kipas|fan)\b/i.test(text)) return 'lighting'
  if (/\b(soket|socket|plug|point)\b/i.test(text)) return 'power point'
  if (/\b(wiring|wayar|pendawaian)\b/i.test(text)) return 'wiring'
  if (/\b(trip|blackout|short|terputus|tiada elektrik|tak ada elektrik)\b/i.test(text)) return 'fault'
  return ''
}

function cleanMessageText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\[[^\]]+\]/g, '')
    .trim()
    .slice(0, 220)
}

function detectIntent(text = '') {
  const t = text.toLowerCase()
  const intents = []
  if (/\b(quotation|quote|sebut harga|harga|kos|berapa|estimate|anggar)\b/i.test(t)) intents.push('harga/quotation')
  if (/\b(trip|blackout|short|spark|terbakar|bau hangit|tiada elektrik|tak ada elektrik|karan|renjatan)\b/i.test(t)) intents.push('masalah elektrik')
  if (/\b(wiring|wayar|pendawaian|rewiring|db|mcb|elcb|rccb|main switch)\b/i.test(t)) intents.push('wiring/db')
  if (/\b(soket|socket|plug|point|power point)\b/i.test(t)) intents.push('soket/point')
  if (/\b(lampu|light|downlight|kipas|fan|switch)\b/i.test(t)) intents.push('lampu/switch/kipas')
  if (/\b(install|pasang|tukar|repair|baiki|servis|service)\b/i.test(t)) intents.push('servis/pemasangan')
  if (/\b(cancel|tak jadi|nanti dulu|mahal|expensive)\b/i.test(t)) intents.push('halangan/objection')
  return intents
}

function analyseChatHistory(messages = []) {
  const customerMsgs = messages.filter(m => !m.is_from_me && cleanMessageText(m.content))
  const ourMsgs = messages.filter(m => m.is_from_me && cleanMessageText(m.content))
  const lastCustomer = [...customerMsgs].reverse()[0]
  const lastOur = [...ourMsgs].reverse()[0]
  const allCustomerText = customerMsgs.map(m => m.content || '').join(' ')
  const intents = [...new Set(detectIntent(allCustomerText))]
  const serviceHint = getServiceHint(customerMsgs)
  const unanswered = lastCustomer && (!lastOur || new Date(lastCustomer.timestamp).getTime() > new Date(lastOur.timestamp).getTime())
  const asked = customerMsgs.slice(-5).map(m => `- Customer: "${cleanMessageText(m.content)}"`).join('\n') || '- Tiada mesej customer sebelum ini.'
  const lastOurLine = lastOur ? `Last reply kita: "${cleanMessageText(lastOur.content)}"` : 'Kita belum pernah reply customer ini.'
  const statusLine = unanswered
    ? 'Status: customer adalah pihak terakhir yang mesej; follow up mesti jawab/angkat semula soalan customer.'
    : 'Status: kita pernah reply selepas mesej customer; follow up secara lembut, jangan ulang ayat sama.'

  const summary = [
    `Topik dikesan: ${intents.length ? intents.join(', ') : 'belum jelas'}.`,
    lastCustomer ? `Soalan/ayat customer terakhir: "${cleanMessageText(lastCustomer.content)}"` : 'Belum ada soalan customer.',
    lastOurLine,
    statusLine,
    `Mesej customer penting baru-baru ini:\n${asked}`,
  ].join('\n')

  return {
    hasPriorCustomerMessage: customerMsgs.length > 0,
    lastCustomerText: cleanMessageText(lastCustomer?.content || ''),
    lastOurText: cleanMessageText(lastOur?.content || ''),
    intents,
    serviceHint,
    unanswered,
    summary,
  }
}

function isBadOutreachText(text = '') {
  const t = String(text).trim()
  if (!t) return true
  if (t.length > 360) return true
  if ((t.match(/\n/g) || []).length > 3) return true
  if (/\[[^\]]*(nama|customer|perniagaan|bisnes|anda|syarikat)[^\]]*\]/i.test(t)) return true
  if (/\b(best regards|regards|best,\s*$|dear customer|to whom it may concern)\b/i.test(t)) return true
  if (/\b(kamu|bisnis|pertanyaan|senang membantu|kesempatan|menghubungi kami beberapa kali|tidak ada jawapan yang terima kasih)\b/i.test(t)) return true
  if (/\b(saya adalah|kami ingin memastikan bahwa|apakah anda masih memiliki)\b/i.test(t)) return true
  return false
}

function fallbackOutreachText({ companyName, hasPriorCustomerMessage, serviceHint, chatContext }) {
  if (!hasPriorCustomerMessage) {
    return `Salam sejahtera, saya dari ${companyName}. Ada apa-apa kerja elektrik yang tuan/puan perlukan bantuan sekarang?`
  }
  if (chatContext?.unanswered && chatContext.lastCustomerText) {
    return `Salam tuan/puan, saya follow up semula mesej tuan/puan sebelum ini. Masih nak kami bantu semak pasal kerja elektrik tersebut?`
  }
  if (serviceHint === 'quotation') {
    return `Salam tuan/puan, saya follow up semula pasal quotation elektrik sebelum ini. Masih nak kami semak dan bantu teruskan?`
  }
  if (serviceHint === 'fault') {
    return `Salam tuan/puan, saya follow up semula pasal masalah elektrik yang tuan/puan maklumkan sebelum ini. Masalah itu masih berlaku atau sudah selesai?`
  }
  if (serviceHint === 'lighting' || serviceHint === 'power point' || serviceHint === 'wiring') {
    return `Salam tuan/puan, saya follow up semula pasal kerja ${serviceHint} sebelum ini. Nak kami bantu semak detail dan susun next step?`
  }
  return `Salam tuan/puan, saya follow up semula chat kita sebelum ini. Masih perlukan bantuan untuk kerja elektrik?`
}

function polishOutreachText(text, context) {
  let out = String(text || '').trim()
    .replace(/\[AI_PROACTIVE_OUTREACH\]/gi, '')
    .replace(/\[[^\]]*(?:Nama Customer|Nama Anda|Nama Perniagaan|Bisnes|Business)[^\]]*\]/gi, '')
    .replace(/^(dear|hi)\s+customer[:,]?\s*/i, 'Salam sejahtera, ')
    .replace(/\bpertanyaan\b/gi, 'pertanyaan')
    .replace(/\bbisnis\b/gi, 'bisnes')
    .replace(/\bkamu\b/gi, 'anda')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Remove email-style sign-offs and anything after them.
  out = out.replace(/\n+\s*(best regards|regards|best),?[\s\S]*$/i, '').trim()

  if (isBadOutreachText(out)) return fallbackOutreachText(context)

  // Keep only the first two short paragraphs/sentences for WhatsApp.
  const compact = out.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 2).join('\n')
  return isBadOutreachText(compact) ? fallbackOutreachText(context) : compact
}

function businessCardPath() {
  const candidates = [
    db.getSetting('business_card_pdf_path', ''),
    path.join(__dirname, '..', '..', 'build', 'extras', 'kesb-business-card.pdf'),
    path.join(process.resourcesPath || '', 'extras', 'kesb-business-card.pdf'),
  ].filter(Boolean)
  return candidates.find(p => {
    try { return fs.existsSync(p) } catch (_) { return false }
  }) || ''
}

function hasSentBusinessCard(jid) {
  try {
    return !!db.get(
      `SELECT id FROM messages
       WHERE conversation_id=?
         AND is_from_me=1
         AND type='document'
         AND (content LIKE ? OR caption LIKE ? OR mime_type='application/pdf')
       LIMIT 1`,
      [jid, '%Business Card%', '%Kad bisnes%'],
    )
  } catch (_) {
    return false
  }
}

async function sendAIOutreach(jid, { force = false } = {}) {
  if (!sock || !isConnected) throw new Error('Not connected to WhatsApp')
  const conv = db.getConversations().find(c => c.id === jid)
  if (!conv) throw new Error('Conversation not found')
  if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter') || isLidJid(jid) || isOwnJid(jid)) {
    return { ok: false, skipped: true, error: 'Group/status/LID/own chats are skipped for AI outreach.' }
  }
  const messageCount = db.get('SELECT COUNT(*) as c FROM messages WHERE conversation_id=?', [jid])?.c || 0
  const shouldSendBusinessCard = !hasSentBusinessCard(jid)
  if (!force && conv.ai_outreach_sent_at && messageCount > 0) {
    return { ok: true, skipped: true, reason: 'Already approached before.' }
  }

  db.updateConversation(jid, {
    ai_enabled: 1,
    ai_outreach_enabled: 1,
    ai_model: await ensureConversationModel(conv),
  })

  const reply = await generateOutreachText({ ...conv, ai_outreach_enabled: 1 })
  if (!reply) throw new Error('AI did not generate an outreach message.')
  await sendMessage(jid, reply, true, { suppressDisclaimer: true })
  let cardSent = false
  if (shouldSendBusinessCard) {
    const cardPath = businessCardPath()
    if (cardPath) {
      console.log(`[wa] Sending business card PDF to ${jid}: ${cardPath}`)
      await sendFile(jid, cardPath, {
        mimeType: 'application/pdf',
        fileName: 'Kejuruteraan Elektrik Sinar Bahagia - Business Card.pdf',
        caption: 'Kad bisnes kami untuk rujukan tuan/puan.',
      })
      cardSent = true
    } else {
      console.warn('[wa] Business card PDF not found; skipping attachment')
    }
  }
  const sentAt = new Date().toISOString()
  db.updateConversation(jid, { ai_outreach_sent_at: sentAt })
  return { ok: true, jid, sentAt, message: reply, cardSent }
}

async function setAIOutreach(jid, enabled, { sendNow = true, force = false } = {}) {
  const conv = db.getConversations().find(c => c.id === jid)
  if (!conv) throw new Error('Conversation not found')
  db.updateConversation(jid, { ai_outreach_enabled: enabled ? 1 : 0, ai_enabled: enabled ? 1 : conv.ai_enabled })
  if (enabled && sendNow) {
    const messageCount = db.get('SELECT COUNT(*) as c FROM messages WHERE conversation_id=?', [jid])?.c || 0
    return await sendAIOutreach(jid, { force: force || messageCount === 0 })
  }
  return { ok: true, jid, enabled: enabled ? 1 : 0 }
}

async function setAIOutreachAll(enabled, { sendNow = true } = {}) {
  const convs = db.getConversations().filter(c =>
    c.id &&
    c.id.endsWith('@s.whatsapp.net') &&
    !isOwnJid(c.id)
  )
  let sent = 0, skipped = 0, fail = 0
  const errors = []

  for (const conv of convs) {
    try {
      db.updateConversation(conv.id, {
        ai_enabled: enabled ? 1 : conv.ai_enabled,
        ai_outreach_enabled: enabled ? 1 : 0,
      })
      if (enabled && sendNow) {
        const r = await sendAIOutreach(conv.id, { force: false })
        if (r.skipped) skipped++
        else sent++
        await new Promise(r => setTimeout(r, 1500))
      }
    } catch (e) {
      fail++
      errors.push({ jid: conv.id, error: e.message })
    }
  }

  return { ok: fail === 0, total: convs.length, sent, skipped, fail, errors }
}

function getStatusAudienceList() {
  const candidates = [
    ...db.getAllContacts().map(c => c.phone),
    ...db.getConversations().map(c => c.phone || c.id),
  ]
  const seen = new Set()
  for (const raw of candidates) {
    let value = String(raw || '').trim()
    if (!value || value === 'status@broadcast' || value.includes('@g.us') || value.includes('@lid')) continue
    if (value.includes('@')) value = value.replace(/:\d+@/, '@')
    else value = `${value.replace(/[^\d]/g, '')}@s.whatsapp.net`
    if (/^\d+@s\.whatsapp\.net$/.test(value)) seen.add(value)
  }
  return [...seen]
}

async function getStatusStories() {
  return db.getStatusStories ? db.getStatusStories(300) : []
}

async function deleteStatusStory(id) {
  if (!id) throw new Error('Status id is required')
  return db.deleteStatusStory ? db.deleteStatusStory(id) : { ok: false }
}

async function syncStatuses() {
  const current = await getStatusStories()
  db.setSetting('wa_sync_history', '1')
  await syncHistoryNow()
  return { ok: true, count: current.length, reconnecting: true }
}

async function uploadStatus({ text = '', mediaBase64 = '', mimeType = '', fileName = '', caption = '', backgroundColor = '#0f172a', font = 1 } = {}) {
  if (!sock || !isConnected) throw new Error('Not connected to WhatsApp')
  const cleanText = String(text || '').trim()
  const cleanCaption = String(caption || '').trim()
  if (!cleanText && !mediaBase64) throw new Error('Status text or media is required')
  const audience = getStatusAudienceList()
  if (!audience.length) {
    throw new Error('Tiada contact audience untuk status. Sync chat/contact dulu, kemudian cuba lagi.')
  }

  let payload
  let type = 'text'
  let mediaUrl = ''
  let buffer = null

  if (mediaBase64) {
    buffer = Buffer.from(mediaBase64, 'base64')
    if (mimeType.startsWith('image/')) {
      payload = { image: buffer, caption: cleanCaption, mimetype: mimeType }
      type = 'image'
    } else if (mimeType.startsWith('video/')) {
      payload = { video: buffer, caption: cleanCaption, mimetype: mimeType }
      type = 'video'
    } else {
      throw new Error('Status hanya support gambar atau video.')
    }
  } else {
    payload = { text: cleanText }
  }

  const sent = await enqueueSend(() => sock.sendMessage('status@broadcast', payload, {
    broadcast: true,
    backgroundColor,
    font,
    statusJidList: audience,
  }))
  console.log(`[wa] status uploaded: id=${sent.key.id} type=${type} audience=${audience.length}`)
  const timestamp = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  if (buffer) {
    try {
      const ext = extFromMime(mimeType)
      const safeName = `${sent.key.id}.${ext}`.replace(/[^a-zA-Z0-9._-]/g,'_')
      fs.writeFileSync(path.join(mediaDir(), safeName), buffer)
      mediaUrl = `syncera-media://${safeName}`
    } catch (e) { console.error('[wa] save outgoing status media error:', e.message) }
  }

  const participantJid = sock.user?.id || ''
  const participantName = sock.user?.name || 'My Status'
  const story = {
    id: sent.key.id,
    waMsgId: sent.key.id,
    participantJid,
    participantName,
    content: cleanText || cleanCaption || fileName || `[${type}]`,
    type,
    mediaUrl,
    mimeType,
    caption: cleanCaption,
    timestamp,
    expiresAt,
    isFromMe: 1,
  }
  const id = db.saveStatusStory(story)
  const saved = { ...story, id, wa_msg_id: story.waMsgId, participant_jid: participantJid, participant_name: participantName, media_url: mediaUrl, mime_type: mimeType, expires_at: expiresAt, is_from_me: 1 }
  emit('wa:status_story', saved)
  return { ok: true, story: saved, audience: audience.length }
}

// ─── Send message ─────────────────────────────────────────────────────────────

async function sendFile(jid, filePath, { mimeType = 'application/octet-stream', fileName = '', caption = '' } = {}) {
  const buffer = fs.readFileSync(filePath)
  return sendMedia(jid, {
    mediaBase64: buffer.toString('base64'),
    mimeType,
    fileName: fileName || path.basename(filePath),
    caption,
  })
}

async function sendMedia(jid, { mediaBase64, mimeType, fileName, caption }) {
  if (!sock || !isConnected) throw new Error('Not connected to WhatsApp')
  const buffer = Buffer.from(mediaBase64, 'base64')

  let payload
  let savedType = 'document'
  if (mimeType?.startsWith('image/')) {
    payload = { image: buffer, caption: caption || '', mimetype: mimeType }
    savedType = 'image'
  } else if (mimeType?.startsWith('video/')) {
    payload = { video: buffer, caption: caption || '', mimetype: mimeType }
    savedType = 'video'
  } else if (mimeType?.startsWith('audio/')) {
    payload = { audio: buffer, mimetype: mimeType, ptt: false }
    savedType = 'audio'
  } else {
    payload = { document: buffer, mimetype: mimeType || 'application/octet-stream', fileName: fileName || 'file' }
    savedType = 'document'
  }

  const sent = await enqueueSend(() => sock.sendMessage(jid, payload))
  const timestamp = new Date().toISOString()

  // Save outgoing media to disk for UI display
  let savedMediaUrl = ''
  try {
    const ext = extFromMime(mimeType) || (fileName?.split('.').pop() || 'bin')
    const safeName = `${sent.key.id}.${ext}`.replace(/[^a-zA-Z0-9._-]/g,'_')
    fs.writeFileSync(path.join(mediaDir(), safeName), buffer)
    savedMediaUrl = `syncera-media://${safeName}`
  } catch (e) { console.error('[wa] save outgoing media error:', e.message) }

  db.saveMessage({
    conversationId: jid, waMsgId: sent.key.id,
    content: caption || fileName || `[${savedType}]`,
    type: savedType, isFromMe: true, status: 'sent', timestamp,
    mediaUrl: savedMediaUrl, mimeType: mimeType || '', caption: caption || '',
  })

  db.updateConversation(jid, {
    last_message: savedType === 'image' ? `📷 ${caption || 'Image'}`
                : savedType === 'video' ? `🎥 ${caption || 'Video'}`
                : savedType === 'audio' ? '🎤 Audio'
                : `📎 ${fileName || 'Document'}`,
    last_msg_time: timestamp,
  })

  emit('wa:message', {
    conversationId: jid, waMsgId: sent.key.id,
    content: caption || fileName || '', type: savedType, isFromMe: true,
    status: 'sent', timestamp, caption: caption || '', mediaUrl: savedMediaUrl, mimeType: mimeType || '',
  })

  return sent
}

// Formal Malay disclaimer appended to AI auto-replies so customer knows
// they're getting an automated response (not a human staff).
const AI_DISCLAIMER = '\n\n———\n_📌 Nota: Mesej di atas dijawab oleh sistem AI kami untuk respon segera dan pengumpulan maklumat awal. Wakil sebenar akan menyusul untuk pengesahan dan bantuan lanjut. Terima kasih atas kesabaran anda. 🙏_'

async function sendMessage(jid, text, isAiReply = false, options = {}) {
  if (!sock || !isConnected) throw new Error('Not connected to WhatsApp')

  // Smart disclaimer policy:
  //   - Only attach to AI replies
  //   - Only when conversation has NO prior outgoing messages (first contact)
  //   - As soon as owner OR AI has replied before, skip — avoid spam/awkward repetition
  const showDisclaimer = db.getSetting('ai_show_disclaimer', '1') === '1'
  let attachDisclaimer = false
  if (isAiReply && showDisclaimer && !options.suppressDisclaimer) {
    try {
      const priorOutgoing = db.get(
        'SELECT id FROM messages WHERE conversation_id=? AND is_from_me=1 LIMIT 1',
        [jid],
      )
      attachDisclaimer = !priorOutgoing  // first-ever outgoing message → attach
    } catch (_) { attachDisclaimer = false }
  }
  const finalText = attachDisclaimer ? (text + AI_DISCLAIMER) : text

  const sent = await enqueueSend(() => sock.sendMessage(jid, { text: finalText }))
  const timestamp = new Date().toISOString()

  db.saveMessage({
    conversationId: jid, waMsgId: sent.key.id, content: finalText, type: 'text',
    isFromMe: true, isAiReply, status: 'sent', timestamp,
  })

  // Preview should be the meaningful part — strip disclaimer for chat list preview
  const preview = text.length > 60 ? text.slice(0, 60) + '…' : text
  db.updateConversation(jid, {
    last_message: preview,
    last_msg_time: timestamp,
  })

  emit('wa:message', {
    conversationId: jid, waMsgId: sent.key.id, content: finalText, type: 'text',
    isFromMe: true, isAiReply, status: 'sent', timestamp,
  })

  return sent
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractContent(waMsg) {
  const msg = waMsg.message
  if (!msg) return { content: '', type: 'text', mediaUrl: '', mimeType: '', caption: '' }

  if (msg.conversation)              return { content: msg.conversation, type: 'text', mediaUrl: '', mimeType: '', caption: '' }
  if (msg.extendedTextMessage?.text) return { content: msg.extendedTextMessage.text, type: 'text', mediaUrl: '', mimeType: '', caption: '' }
  if (msg.imageMessage)              return { content: '[Image]', type: 'image', mediaUrl: '', mimeType: msg.imageMessage.mimetype || '', caption: msg.imageMessage.caption || '' }
  if (msg.videoMessage)              return { content: '[Video]', type: 'video', mediaUrl: '', mimeType: msg.videoMessage.mimetype || '', caption: msg.videoMessage.caption || '' }
  if (msg.audioMessage)              return { content: '[Audio]', type: 'audio', mediaUrl: '', mimeType: msg.audioMessage.mimetype || '', caption: '' }
  if (msg.documentMessage)           return { content: msg.documentMessage.fileName || '[Document]', type: 'document', mediaUrl: '', mimeType: msg.documentMessage.mimetype || '', caption: '' }
  if (msg.stickerMessage)            return { content: '[Sticker]', type: 'sticker', mediaUrl: '', mimeType: msg.stickerMessage.mimetype || 'image/webp', caption: '' }
  if (msg.reactionMessage)           return { content: `Reacted: ${msg.reactionMessage.text}`, type: 'reaction', mediaUrl: '', mimeType: '', caption: '' }
  if (msg.locationMessage)           return { content: `📍 ${msg.locationMessage.degreesLatitude},${msg.locationMessage.degreesLongitude}`, type: 'location', mediaUrl: '', mimeType: '', caption: '' }

  return { content: '', type: 'unknown', mediaUrl: '', mimeType: '', caption: '' }
}

async function logout() {
  // Stop pending retries
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }

  // Logout from WhatsApp server (if currently connected)
  if (sock) {
    try { await sock.logout() } catch {}
    try { sock.ev.removeAllListeners(); sock.end(undefined) } catch {}
    sock = null
  }

  // Reset all state
  isConnected  = false
  isConnecting = false
  retryCount   = 0

  // PURGE auth folder so next connect generates a fresh QR for a different account
  const authDir = path.join(app.getPath('userData'), 'wa-auth')
  try {
    const fs = require('fs')
    if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true })
    console.log('[wa] auth purged, ready for new login')
  } catch (e) { console.error('[wa] failed to purge auth:', e) }

  // Tell UI we're disconnected (loggedOut=true clears UI state too)
  emit('wa:disconnected', { loggedOut: true })

  // Auto-restart the connect cycle so user immediately sees a fresh QR
  setTimeout(() => connect(), 1500)
}

function getConnectionState() {
  return { isConnected, user: sock?.user || null }
}

async function subscribePresence(jid) {
  if (!sock || !isConnected) return
  // Baileys renamed this — try both for compatibility
  const fn = sock.presenceSubscribe || sock.subscribePresence
  if (typeof fn === 'function') {
    await fn.call(sock, jid).catch(() => {})
  }
}

module.exports = {
  setMainWindow, connect, sendMessage, sendMedia, logout, getConnectionState, subscribePresence,
  syncHistoryNow, sendAIOutreach, setAIOutreach, setAIOutreachAll,
  getStatusStories, uploadStatus, syncStatuses, deleteStatusStory,
}
