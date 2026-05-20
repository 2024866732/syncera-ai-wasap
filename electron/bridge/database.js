'use strict'

const fs   = require('fs')
const path = require('path')
const { app } = require('electron')
const { v4: uuidv4 } = require('uuid')

let db = null, SQL = null, dbPath = null
let flushTimer = null
let dirty = false

async function initDB() {
  if (db) return db
  const initSqlJs = require('sql.js')

  // Resolve sql-wasm.wasm path — works in both dev and packaged (asar) builds.
  // In packaged build, sql.js is in app.asar.unpacked thanks to `asarUnpack`.
  let wasmPath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  if (!fs.existsSync(wasmPath)) {
    // Packaged: rewrite app.asar/node_modules/... → app.asar.unpacked/node_modules/...
    const unpacked = wasmPath.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
    if (fs.existsSync(unpacked)) wasmPath = unpacked
  }
  SQL = await initSqlJs({ locateFile: () => wasmPath })
  dbPath = path.join(app.getPath('userData'), 'wa-bizai.db')
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath))
  } else {
    db = new SQL.Database()
  }
  run('PRAGMA foreign_keys = ON')
  initSchema()
  flush(true)
  return db
}

// Reload DB from disk (used after restoring from Drive backup)
async function reload() {
  if (!SQL || !dbPath) return
  try { if (db) db.close() } catch {}
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath))
  } else {
    db = new SQL.Database()
  }
  run('PRAGMA foreign_keys = ON')
  initSchema()
  return db
}

function flush(sync = false) {
  if (!db || !dbPath) return
  if (sync) {
    try {
      dirty = false
      fs.writeFileSync(dbPath, Buffer.from(db.export()))
    } catch (_) {}
    return
  }
  dirty = true
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!dirty) return
    try {
      dirty = false
      fs.writeFileSync(dbPath, Buffer.from(db.export()))
    } catch (_) {
      // ignore; we'll retry next write
      dirty = true
    }
  }, 650)
}

function run(sql, params = []) { db.run(sql, params) }

function get(sql, params = []) {
  const s = db.prepare(sql); s.bind(params)
  if (s.step()) { const r = s.getAsObject(); s.free(); return r }
  s.free(); return undefined
}

function all(sql, params = []) {
  const s = db.prepare(sql); s.bind(params)
  const rows = []
  while (s.step()) rows.push(s.getAsObject())
  s.free(); return rows
}

function ensureColumn(table, column, definition) {
  const exists = all(`PRAGMA table_info(${table})`).some(c => c.name === column)
  if (!exists) run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT DEFAULT '',
      avatar TEXT DEFAULT '', tags TEXT DEFAULT '[]', notes TEXT DEFAULT '',
      label TEXT DEFAULT 'none', is_blocked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL,
      last_message TEXT DEFAULT '', last_msg_time TEXT DEFAULT '',
      unread_count INTEGER DEFAULT 0, is_pinned INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0, ai_enabled INTEGER DEFAULT 0,
      ai_model TEXT DEFAULT '', ai_persona TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
      wa_msg_id TEXT DEFAULT '', content TEXT DEFAULT '', type TEXT DEFAULT 'text',
      is_from_me INTEGER NOT NULL, is_ai_reply INTEGER DEFAULT 0,
      status TEXT DEFAULT 'sent', timestamp TEXT NOT NULL,
      media_url TEXT DEFAULT '', mime_type TEXT DEFAULT '', caption TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, timestamp);

    CREATE TABLE IF NOT EXISTS knowledge_base (
      id TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT 'General',
      title TEXT NOT NULL, content TEXT NOT NULL, is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT 'General',
      title TEXT NOT NULL, body TEXT NOT NULL,
      usage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL,
      conversation_id TEXT DEFAULT '',
      title TEXT NOT NULL, items TEXT DEFAULT '[]',
      amount REAL DEFAULT 0, currency TEXT DEFAULT 'MYR',
      status TEXT DEFAULT 'new',
      paid INTEGER DEFAULT 0, paid_at TEXT DEFAULT '',
      notes TEXT DEFAULT '', due_date TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finance_records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount REAL DEFAULT 0,
      description TEXT DEFAULT '',
      occurred_at TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      source TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL,
      message TEXT NOT NULL, label_filter TEXT DEFAULT '',
      contact_ids TEXT DEFAULT '[]',
      scheduled_at TEXT DEFAULT '', status TEXT DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL,
      conversation_id TEXT DEFAULT '',
      title TEXT NOT NULL, message TEXT NOT NULL,
      remind_at TEXT NOT NULL, repeat_rule TEXT DEFAULT 'none',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL,
      conversation_id TEXT DEFAULT '',
      title TEXT NOT NULL, description TEXT DEFAULT '',
      location TEXT DEFAULT '', start_at TEXT NOT NULL,
      end_at TEXT DEFAULT '', status TEXT DEFAULT 'scheduled',
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wa_status_stories (
      id TEXT PRIMARY KEY,
      wa_msg_id TEXT UNIQUE DEFAULT '',
      participant_jid TEXT DEFAULT '',
      participant_name TEXT DEFAULT '',
      content TEXT DEFAULT '',
      type TEXT DEFAULT 'text',
      media_url TEXT DEFAULT '',
      mime_type TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      timestamp TEXT NOT NULL,
      expires_at TEXT DEFAULT '',
      is_from_me INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_status_time ON wa_status_stories(timestamp DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
  `)

  // Older installs may have a messages table created before media support.
  ensureColumn('messages', 'media_url', "TEXT DEFAULT ''")
  ensureColumn('messages', 'mime_type', "TEXT DEFAULT ''")
  ensureColumn('messages', 'caption', "TEXT DEFAULT ''")
  ensureColumn('conversations', 'ai_outreach_enabled', "INTEGER DEFAULT 0")
  ensureColumn('conversations', 'ai_outreach_sent_at', "TEXT DEFAULT ''")
}

/* ── Contacts ── */
function cleanContactName(name) {
  return String(name || '').trim()
}

function isPlaceholderContactName(name, phone) {
  const n = cleanContactName(name)
  const p = cleanContactName(phone)
  if (!n) return true
  if (p && n === p) return true
  if (n.includes('@s.whatsapp.net') || n.includes('@c.us') || n.includes('@lid')) return true
  const digits = n.replace(/[^\d]/g, '')
  return digits.length >= 5 && digits === p.replace(/[^\d]/g, '')
}

function upsertContact(phone, name, avatar) {
  const incomingName = cleanContactName(name)
  const ex = get('SELECT id,name FROM contacts WHERE phone=?', [phone])
  if (ex) {
    const currentName = cleanContactName(ex.name)
    const shouldUpdateName = incomingName && (
      !isPlaceholderContactName(incomingName, phone) || isPlaceholderContactName(currentName, phone)
    )
    if (shouldUpdateName) run(`UPDATE contacts SET name=?,updated_at=datetime('now') WHERE phone=?`, [incomingName, phone])
    return ex.id
  }
  const id = uuidv4()
  run('INSERT INTO contacts (id,phone,name,avatar) VALUES (?,?,?,?)', [id, phone, incomingName || phone, avatar||''])
  flush(); return id
}
function getContact(id)   { return get('SELECT * FROM contacts WHERE id=?', [id]) }
function getAllContacts()  { return all('SELECT * FROM contacts ORDER BY name ASC') }
function updateContact(id, fields) {
  const allowed = ['name','tags','notes','label','is_blocked']
  const keys = Object.keys(fields).filter(k => allowed.includes(k))
  if (!keys.length) return
  const sets = keys.map(k=>`${k}=?`).join(',')
  const vals = keys.map(k => typeof fields[k]==='object' ? JSON.stringify(fields[k]) : fields[k])
  run(`UPDATE contacts SET ${sets},updated_at=datetime('now') WHERE id=?`, [...vals, id]); flush()
}

/* ── Conversations ── */
function upsertConversation(waJid, contactId) {
  if (!get('SELECT id FROM conversations WHERE id=?', [waJid]))
    run('INSERT INTO conversations (id,contact_id) VALUES (?,?)', [waJid, contactId])
  flush(); return waJid
}
function getConversations() {
  return all(`SELECT c.*,ct.name,ct.phone,ct.avatar,ct.tags,ct.label,ct.notes
    FROM conversations c JOIN contacts ct ON c.contact_id=ct.id
    WHERE c.is_archived=0
      AND c.id NOT LIKE '%@newsletter'
      AND ct.phone NOT LIKE '%@newsletter'
    ORDER BY c.is_pinned DESC, c.last_msg_time DESC`)
}
function updateConversation(id, fields) {
  const allowed = ['last_message','last_msg_time','unread_count','is_pinned','is_archived','ai_enabled','ai_model','ai_persona','ai_outreach_enabled','ai_outreach_sent_at']
  const keys = Object.keys(fields).filter(k => allowed.includes(k))
  if (!keys.length) return
  run(`UPDATE conversations SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=datetime('now') WHERE id=?`,
    [...keys.map(k=>fields[k]), id]); flush()
}
function clearUnread(jid) { run('UPDATE conversations SET unread_count=0 WHERE id=?',[jid]); flush() }

function clearWhatsAppData() {
  const before = {
    conversations: get('SELECT COUNT(*) as c FROM conversations')?.c || 0,
    messages: get('SELECT COUNT(*) as c FROM messages')?.c || 0,
    contacts: get('SELECT COUNT(*) as c FROM contacts')?.c || 0,
    calendarEvents: get('SELECT COUNT(*) as c FROM calendar_events')?.c || 0,
    statusStories: get('SELECT COUNT(*) as c FROM wa_status_stories')?.c || 0,
  }
  run('DELETE FROM messages')
  run('DELETE FROM conversations')
  run('DELETE FROM contacts')
  run('DELETE FROM calendar_events')
  run('DELETE FROM wa_status_stories')
  flush(true)
  return { ok: true, cleared: before }
}

function getWhatsAppDataCounts() {
  return {
    conversations: get('SELECT COUNT(*) as c FROM conversations')?.c || 0,
    messages: get('SELECT COUNT(*) as c FROM messages')?.c || 0,
    contacts: get('SELECT COUNT(*) as c FROM contacts')?.c || 0,
  }
}

/* ── Messages ── */
function saveMessage(msg) {
  const id = msg.id || uuidv4()
  if (msg.waMsgId && msg.waMsgId !== '') {
    const ex = get('SELECT id FROM messages WHERE wa_msg_id=?', [msg.waMsgId])
    if (ex) return ex.id
  }
  try {
    run(`INSERT INTO messages (id,conversation_id,wa_msg_id,content,type,is_from_me,is_ai_reply,status,timestamp,media_url,mime_type,caption) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, msg.conversationId, msg.waMsgId||'', msg.content||'', msg.type||'text',
       msg.isFromMe?1:0, msg.isAiReply?1:0, msg.status||'sent',
       msg.timestamp||new Date().toISOString(), msg.mediaUrl||'', msg.mimeType||'', msg.caption||''])
    flush()
  } catch(_) {}
  return id
}
function getMessages(jid, limit=60, offset=0) {
  return all('SELECT * FROM messages WHERE conversation_id=? ORDER BY timestamp ASC LIMIT ? OFFSET ?', [jid, limit, offset])
}
function getRecentMessages(jid, limit=80) {
  const rows = all('SELECT * FROM messages WHERE conversation_id=? ORDER BY timestamp DESC LIMIT ?', [jid, limit])
  return rows.reverse()
}
function updateMessageStatus(waMsgId, status) {
  run('UPDATE messages SET status=? WHERE wa_msg_id=?', [status, waMsgId]); flush()
}
function searchMessages(query) {
  return all(`SELECT m.*,ct.phone,ct.name FROM messages m
    JOIN conversations c ON c.id=m.conversation_id
    JOIN contacts ct ON ct.id=c.contact_id
    WHERE m.content LIKE ? ORDER BY m.timestamp DESC LIMIT 50`, [`%${query}%`])
}

/* ── Analytics ── */
function getAnalytics() {
  const today = new Date().toISOString().split('T')[0]
  const week  = new Date(Date.now()-7*86400000).toISOString().split('T')[0]
  const total_contacts   = get('SELECT COUNT(*) as c FROM contacts')?.c || 0
  const total_convs      = get('SELECT COUNT(*) as c FROM conversations WHERE is_archived=0')?.c || 0
  const msgs_today_in    = get(`SELECT COUNT(*) as c FROM messages WHERE is_from_me=0 AND timestamp>=?`, [today+'T00:00:00'])?.c || 0
  const msgs_today_out   = get(`SELECT COUNT(*) as c FROM messages WHERE is_from_me=1 AND timestamp>=?`, [today+'T00:00:00'])?.c || 0
  const ai_replies_today = get(`SELECT COUNT(*) as c FROM messages WHERE is_ai_reply=1 AND timestamp>=?`, [today+'T00:00:00'])?.c || 0
  const unread_total     = get('SELECT SUM(unread_count) as c FROM conversations')?.c || 0
  const ai_active        = get('SELECT COUNT(*) as c FROM conversations WHERE ai_enabled=1')?.c || 0
  const orders_pending   = get("SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('completed','cancelled')")?.c || 0
  const revenue_total    = get("SELECT SUM(amount) as c FROM orders WHERE paid=1")?.c || 0
  const revenue_pending  = get("SELECT SUM(amount) as c FROM orders WHERE paid=0 AND status NOT IN ('cancelled')")?.c || 0
  const finance_income_total  = get("SELECT SUM(amount) as c FROM finance_records WHERE type='income'")?.c || 0
  const finance_expense_total = get("SELECT SUM(amount) as c FROM finance_records WHERE type='expense'")?.c || 0
  const finance_profit_total  = finance_income_total - finance_expense_total
  const msgs_week        = all(`SELECT date(timestamp) as d, COUNT(*) as c FROM messages WHERE timestamp>=? GROUP BY date(timestamp) ORDER BY d`, [week+'T00:00:00'])
  const top_contacts     = all(`SELECT ct.name,ct.phone,COUNT(m.id) as msg_count FROM messages m JOIN conversations cv ON cv.id=m.conversation_id JOIN contacts ct ON ct.id=cv.contact_id WHERE m.is_from_me=0 AND m.timestamp>=? GROUP BY ct.id ORDER BY msg_count DESC LIMIT 5`, [week+'T00:00:00'])
  return { total_contacts, total_convs, msgs_today_in, msgs_today_out, ai_replies_today, unread_total, ai_active, orders_pending, revenue_total, revenue_pending, finance_income_total, finance_expense_total, finance_profit_total, msgs_week, top_contacts }
}

/* ── Templates ── */
function getTemplates()         { return all('SELECT * FROM templates ORDER BY category,title') }
function saveTemplate(t)        {
  if (t.id && get('SELECT id FROM templates WHERE id=?',[t.id])) {
    run(`UPDATE templates SET category=?,title=?,body=?,updated_at=datetime('now') WHERE id=?`, [t.category,t.title,t.body,t.id]); flush(); return t.id
  }
  const id = t.id || uuidv4()
  run('INSERT INTO templates (id,category,title,body) VALUES (?,?,?,?)',[id,t.category,t.title,t.body]); flush(); return id
}
function deleteTemplate(id)     { run('DELETE FROM templates WHERE id=?',[id]); flush() }
function incTemplateUsage(id)   { run('UPDATE templates SET usage_count=usage_count+1 WHERE id=?',[id]); flush() }

/* ── Orders ── */
function getOrders(contactId)   { return contactId ? all('SELECT * FROM orders WHERE contact_id=? ORDER BY created_at DESC',[contactId]) : all('SELECT o.*,ct.name,ct.phone FROM orders o JOIN contacts ct ON ct.id=o.contact_id ORDER BY o.created_at DESC') }
function saveOrder(o)           {
  if (o.id && get('SELECT id FROM orders WHERE id=?',[o.id])) {
    const keys=['title','items','amount','status','paid','paid_at','notes','due_date']
    const k = keys.filter(k=>o[k]!==undefined)
    run(`UPDATE orders SET ${k.map(x=>`${x}=?`).join(',')},updated_at=datetime('now') WHERE id=?`,[...k.map(x=>typeof o[x]==='object'?JSON.stringify(o[x]):o[x]),o.id]); flush(); return o.id
  }
  const id=uuidv4()
  run('INSERT INTO orders (id,contact_id,conversation_id,title,items,amount,currency,status,paid,notes,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [id,o.contact_id,o.conversation_id||'',o.title,JSON.stringify(o.items||[]),o.amount||0,o.currency||'MYR',o.status||'new',o.paid?1:0,o.notes||'',o.due_date||'']); flush(); return id
}
function deleteOrder(id)        { run('DELETE FROM orders WHERE id=?',[id]); flush() }

/* ── Broadcasts ── */
function getBroadcasts()        { return all('SELECT * FROM broadcasts ORDER BY created_at DESC') }
function saveBroadcast(b)       {
  if (b.id && get('SELECT id FROM broadcasts WHERE id=?',[b.id])) {
    run(`UPDATE broadcasts SET title=?,message=?,label_filter=?,contact_ids=?,scheduled_at=?,status=?,sent_count=?,fail_count=? WHERE id=?`,
      [b.title,b.message,b.label_filter||'',JSON.stringify(b.contact_ids||[]),b.scheduled_at||'',b.status||'draft',b.sent_count||0,b.fail_count||0,b.id]); flush(); return b.id
  }
  const id=uuidv4()
  run('INSERT INTO broadcasts (id,title,message,label_filter,contact_ids,scheduled_at,status) VALUES (?,?,?,?,?,?,?)',
    [id,b.title,b.message,b.label_filter||'',JSON.stringify(b.contact_ids||[]),b.scheduled_at||'','draft']); flush(); return id
}
function deleteBroadcast(id)    { run('DELETE FROM broadcasts WHERE id=?',[id]); flush() }

/* ── Reminders ── */
function getReminders(status)   { return status ? all('SELECT r.*,ct.name,ct.phone FROM reminders r JOIN contacts ct ON ct.id=r.contact_id WHERE r.status=? ORDER BY r.remind_at ASC',[status]) : all('SELECT r.*,ct.name,ct.phone FROM reminders r JOIN contacts ct ON ct.id=r.contact_id ORDER BY r.remind_at ASC') }
function saveReminder(r)        {
  if (r.id && get('SELECT id FROM reminders WHERE id=?',[r.id])) {
    run(`UPDATE reminders SET title=?,message=?,remind_at=?,status=? WHERE id=?`,[r.title,r.message,r.remind_at,r.status||'pending',r.id]); flush(); return r.id
  }
  const id=uuidv4()
  run('INSERT INTO reminders (id,contact_id,conversation_id,title,message,remind_at,repeat_rule) VALUES (?,?,?,?,?,?,?)',
    [id,r.contact_id,r.conversation_id||'',r.title,r.message,r.remind_at,r.repeat_rule||'none']); flush(); return id
}
function deleteReminder(id)     { run('DELETE FROM reminders WHERE id=?',[id]); flush() }

/* ── Calendar Events ── */
function getCalendarEvents() {
  return all(`SELECT e.*,ct.name,ct.phone FROM calendar_events e
    LEFT JOIN contacts ct ON ct.id=e.contact_id
    ORDER BY e.start_at ASC`)
}
function saveCalendarEvent(e) {
  if (e.id && get('SELECT id FROM calendar_events WHERE id=?',[e.id])) {
    const keys = ['title','description','location','start_at','end_at','status','source']
    const k = keys.filter(x => e[x] !== undefined)
    run(`UPDATE calendar_events SET ${k.map(x=>`${x}=?`).join(',')},updated_at=datetime('now') WHERE id=?`,
      [...k.map(x=>e[x]), e.id]); flush(); return e.id
  }
  const existing = get(`SELECT id FROM calendar_events
    WHERE conversation_id=? AND start_at=? AND status!='cancelled' LIMIT 1`,
    [e.conversation_id || '', e.start_at])
  if (existing) {
    saveCalendarEvent({ ...e, id: existing.id })
    return existing.id
  }
  const id = e.id || uuidv4()
  run(`INSERT INTO calendar_events
    (id,contact_id,conversation_id,title,description,location,start_at,end_at,status,source)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id,e.contact_id||'',e.conversation_id||'',e.title,e.description||'',e.location||'',e.start_at,e.end_at||'',e.status||'scheduled',e.source||'manual'])
  flush(); return id
}
function deleteCalendarEvent(id) { run('DELETE FROM calendar_events WHERE id=?',[id]); flush() }
function cancelLatestCalendarEvent(conversationId) {
  const row = get(`SELECT id FROM calendar_events
    WHERE conversation_id=? AND status!='cancelled'
    ORDER BY datetime(start_at) DESC, datetime(created_at) DESC
    LIMIT 1`, [conversationId])
  if (!row) return { ok: false, cancelled: 0 }
  run(`UPDATE calendar_events SET status='cancelled',updated_at=datetime('now') WHERE id=?`, [row.id])
  flush()
  return { ok: true, cancelled: 1, id: row.id }
}

/* ── WhatsApp Status Stories ── */
function saveStatusStory(story) {
  const id = story.id || uuidv4()
  const waMsgId = story.wa_msg_id || story.waMsgId || id
  const existing = waMsgId ? get('SELECT id FROM wa_status_stories WHERE wa_msg_id=?', [waMsgId]) : null
  const values = [
    story.participant_jid || story.participantJid || '',
    story.participant_name || story.participantName || '',
    story.content || '',
    story.type || 'text',
    story.media_url || story.mediaUrl || '',
    story.mime_type || story.mimeType || '',
    story.caption || '',
    story.timestamp,
    story.expires_at || story.expiresAt || '',
    story.is_from_me || story.isFromMe ? 1 : 0,
  ]
  if (existing) {
    run(`UPDATE wa_status_stories SET
      participant_jid=?, participant_name=?, content=?, type=?, media_url=?, mime_type=?,
      caption=?, timestamp=?, expires_at=?, is_from_me=?
      WHERE id=?`, [...values, existing.id])
    flush()
    return existing.id
  }
  run(`INSERT INTO wa_status_stories
    (id,wa_msg_id,participant_jid,participant_name,content,type,media_url,mime_type,caption,timestamp,expires_at,is_from_me)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [id, waMsgId, ...values])
  flush()
  return id
}

function getStatusStories(limit = 200) {
  return all(`
    SELECT * FROM wa_status_stories
    WHERE expires_at='' OR expires_at>=?
    ORDER BY datetime(timestamp) DESC
    LIMIT ?`, [new Date(Date.now() - 60 * 60 * 1000).toISOString(), limit])
}
function deleteStatusStory(id) {
  run('DELETE FROM wa_status_stories WHERE id=? OR wa_msg_id=?', [id, id])
  flush()
  return { ok: true }
}

/* ── Knowledge Base ── */
function getKnowledgeBase(onlyActive=true) {
  return all(onlyActive ? 'SELECT * FROM knowledge_base WHERE is_active=1 ORDER BY sort_order,category,title' : 'SELECT * FROM knowledge_base ORDER BY sort_order,category,title')
}
function saveKBEntry(entry) {
  if (entry.id && get('SELECT id FROM knowledge_base WHERE id=?',[entry.id])) {
    run(`UPDATE knowledge_base SET category=?,title=?,content=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
      [entry.category,entry.title,entry.content,entry.is_active??1,entry.id]); flush(); return entry.id
  }
  const id=entry.id||uuidv4()
  run('INSERT INTO knowledge_base (id,category,title,content,is_active) VALUES (?,?,?,?,?)',
    [id,entry.category,entry.title,entry.content,entry.is_active??1]); flush(); return id
}
function deleteKBEntry(id) { run('DELETE FROM knowledge_base WHERE id=?',[id]); flush() }

/* ── Settings ── */
function getSetting(key, def='')  { const r=get('SELECT value FROM settings WHERE key=?',[key]); return r?r.value:def }
function setSetting(key, value)   {
  if (get('SELECT key FROM settings WHERE key=?',[key])) run('UPDATE settings SET value=? WHERE key=?',[String(value),key])
  else run('INSERT INTO settings (key,value) VALUES (?,?)',[key,String(value)])
  flush()
}
function getAllSettings()         { return Object.fromEntries(all('SELECT key,value FROM settings').map(r=>[r.key,r.value])) }

// Wipe ALL messages for a conversation (keep contact + conversation row)
function clearConversation(jid) {
  const before = get('SELECT COUNT(*) as c FROM messages WHERE conversation_id=?', [jid])?.c || 0
  run('DELETE FROM messages WHERE conversation_id=?', [jid])
  run(`UPDATE conversations
       SET last_message='', last_msg_time=datetime('now'), unread_count=0,
           ai_enabled=0, ai_outreach_enabled=0, ai_outreach_sent_at='', updated_at=datetime('now')
       WHERE id=?`, [jid])
  flush()
  return { deleted: before }
}

/* ── Report Stats ──
 * Comprehensive aggregation for staff work report.
 * startDate / endDate as ISO date strings (YYYY-MM-DD), inclusive.
 */
function getReportStats(startDate, endDate) {
  const fromISO = `${startDate}T00:00:00.000Z`
  const toISO   = `${endDate}T23:59:59.999Z`

  // Overall counts
  const totalIn  = get('SELECT COUNT(*) c FROM messages WHERE is_from_me=0 AND timestamp BETWEEN ? AND ?', [fromISO, toISO])?.c || 0
  const totalOut = get('SELECT COUNT(*) c FROM messages WHERE is_from_me=1 AND timestamp BETWEEN ? AND ?', [fromISO, toISO])?.c || 0
  const aiReplies = get('SELECT COUNT(*) c FROM messages WHERE is_from_me=1 AND is_ai_reply=1 AND timestamp BETWEEN ? AND ?', [fromISO, toISO])?.c || 0
  const manualReplies = get('SELECT COUNT(*) c FROM messages WHERE is_from_me=1 AND is_ai_reply=0 AND timestamp BETWEEN ? AND ?', [fromISO, toISO])?.c || 0

  // Active conversations in range
  const activeConvs = all(`SELECT DISTINCT conversation_id FROM messages WHERE timestamp BETWEEN ? AND ?`, [fromISO, toISO]).length

  // New customers — contacts whose FIRST EVER message is within the range
  const newCustomers = all(`
    SELECT ct.id, ct.name, ct.phone, MIN(m.timestamp) AS first_msg
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN contacts ct ON ct.id = c.contact_id
    GROUP BY ct.id
    HAVING first_msg BETWEEN ? AND ?
  `, [fromISO, toISO])

  // Returning customers — contacts with messages in range AND messages before range
  const returningCustomers = all(`
    SELECT DISTINCT ct.id, ct.name, ct.phone
    FROM messages m1
    JOIN conversations c ON c.id = m1.conversation_id
    JOIN contacts ct ON ct.id = c.contact_id
    WHERE m1.timestamp BETWEEN ? AND ?
      AND EXISTS (
        SELECT 1 FROM messages m2
        WHERE m2.conversation_id = m1.conversation_id
          AND m2.timestamp < ?
      )
  `, [fromISO, toISO, fromISO])

  // Daily breakdown
  const daily = all(`
    SELECT DATE(timestamp) AS d,
           SUM(CASE WHEN is_from_me=0 THEN 1 ELSE 0 END) AS in_count,
           SUM(CASE WHEN is_from_me=1 THEN 1 ELSE 0 END) AS out_count,
           SUM(CASE WHEN is_from_me=1 AND is_ai_reply=1 THEN 1 ELSE 0 END) AS ai_count
    FROM messages
    WHERE timestamp BETWEEN ? AND ?
    GROUP BY DATE(timestamp)
    ORDER BY d ASC
  `, [fromISO, toISO])

  // Hourly distribution (24-hour)
  const hourly = all(`
    SELECT CAST(strftime('%H', timestamp) AS INTEGER) AS h, COUNT(*) AS c
    FROM messages
    WHERE timestamp BETWEEN ? AND ?
    GROUP BY h
    ORDER BY h ASC
  `, [fromISO, toISO])

  // Top contacts by message count
  const topContacts = all(`
    SELECT ct.name, ct.phone, ct.label,
           COUNT(m.id) AS msg_count,
           SUM(CASE WHEN m.is_from_me=0 THEN 1 ELSE 0 END) AS msgs_from_them,
           SUM(CASE WHEN m.is_from_me=1 THEN 1 ELSE 0 END) AS msgs_to_them
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN contacts ct ON ct.id = c.contact_id
    WHERE m.timestamp BETWEEN ? AND ?
    GROUP BY ct.id
    ORDER BY msg_count DESC
    LIMIT 10
  `, [fromISO, toISO])

  // Customer labels distribution (segments)
  const segments = all(`
    SELECT ct.label, COUNT(DISTINCT ct.id) AS cnt
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN contacts ct ON ct.id = c.contact_id
    WHERE m.timestamp BETWEEN ? AND ?
    GROUP BY ct.label
  `, [fromISO, toISO])

  // Orders in range (if any)
  const orders = all(`
    SELECT o.id, o.title, o.amount, o.status, o.paid, o.created_at,
           ct.name AS customer_name, ct.phone AS customer_phone
    FROM orders o
    JOIN contacts ct ON ct.id = o.contact_id
    WHERE o.created_at BETWEEN ? AND ?
    ORDER BY o.created_at DESC
  `, [fromISO, toISO])

  const totalRevenue = orders.filter(o => o.paid).reduce((s, o) => s + (o.amount || 0), 0)
  const pendingRevenue = orders.filter(o => !o.paid && o.status !== 'cancelled').reduce((s, o) => s + (o.amount || 0), 0)

  // Response stats: average time to reply (when staff/AI replied to a customer message)
  // (Simplified — first outgoing after each incoming)
  const responseTimes = all(`
    SELECT m1.timestamp AS in_ts,
           (SELECT MIN(m2.timestamp) FROM messages m2
            WHERE m2.conversation_id = m1.conversation_id
              AND m2.is_from_me = 1
              AND m2.timestamp > m1.timestamp) AS out_ts
    FROM messages m1
    WHERE m1.is_from_me = 0 AND m1.timestamp BETWEEN ? AND ?
  `, [fromISO, toISO]).filter(r => r.out_ts)
  let avgResponseMinutes = 0
  if (responseTimes.length) {
    const totalMs = responseTimes.reduce((s, r) => s + (new Date(r.out_ts).getTime() - new Date(r.in_ts).getTime()), 0)
    avgResponseMinutes = Math.round((totalMs / responseTimes.length) / 60000)
  }

  return {
    range: { from: startDate, to: endDate },
    summary: {
      totalMessages: totalIn + totalOut,
      messagesIn: totalIn,
      messagesOut: totalOut,
      aiReplies,
      manualReplies,
      aiRate: totalOut > 0 ? Math.round((aiReplies / totalOut) * 100) : 0,
      activeConversations: activeConvs,
      newCustomers: newCustomers.length,
      returningCustomers: returningCustomers.length,
      avgResponseMinutes,
      totalRevenue,
      pendingRevenue,
      ordersCount: orders.length,
    },
    daily,
    hourly,
    topContacts,
    segments,
    orders,
    newCustomersList: newCustomers.slice(0, 30),
    returningCustomersList: returningCustomers.slice(0, 30),
  }
}

function clearAIReplies(jid) {
  const before = get('SELECT COUNT(*) as c FROM messages WHERE conversation_id=? AND is_ai_reply=1', [jid])?.c || 0
  run('DELETE FROM messages WHERE conversation_id=? AND is_ai_reply=1', [jid])
  flush()
  return { deleted: before }
}

module.exports = {
  initDB, reload, flush, run, get, all,
  upsertContact, getContact, getAllContacts, updateContact,
  upsertConversation, getConversations, updateConversation, clearUnread,
  saveMessage, getMessages, getRecentMessages, updateMessageStatus, searchMessages,
  getAnalytics,
  getTemplates, saveTemplate, deleteTemplate, incTemplateUsage,
  getOrders, saveOrder, deleteOrder,
  getBroadcasts, saveBroadcast, deleteBroadcast,
  getReminders, saveReminder, deleteReminder,
  getCalendarEvents, saveCalendarEvent, deleteCalendarEvent, cancelLatestCalendarEvent,
  getStatusStories, saveStatusStory, deleteStatusStory,
  getKnowledgeBase, saveKBEntry, deleteKBEntry,
  getSetting, setSetting, getAllSettings,
  clearAIReplies, clearConversation, getReportStats,
  clearWhatsAppData, getWhatsAppDataCounts,
}
