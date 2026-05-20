'use strict'
const { app, BrowserWindow, ipcMain, Notification, nativeTheme, protocol, dialog, nativeImage } = require('electron')
const path = require('path')
const fs   = require('fs')
const wa      = require('./bridge/whatsapp')
const db      = require('./bridge/database')
const ai      = require('./bridge/ai')
const drive   = require('./bridge/drive')
const updater   = require('./bridge/updater')
const generator = require('./bridge/generator')
const log = require('electron-log')

log.transports.file.level = 'info'
log.transports.console.level = 'info'
const originalConsole = { log: console.log, error: console.error, warn: console.warn }
console.log = (...args) => { originalConsole.log(...args); log.info(...args) }
console.error = (...args) => { originalConsole.error(...args); log.error(...args) }
console.warn = (...args) => { originalConsole.warn(...args); log.warn(...args) }

// Native theme will be reconciled to user setting after DB init
nativeTheme.themeSource = 'system'
const isDev = !app.isPackaged
const useDevServer = isDev && process.env.SYNCERA_USE_DIST !== '1'
let mainWindow = null
let splashWindow = null
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

function loadDistributionPlan() {
  const candidates = [
    path.join(process.resourcesPath || '', 'extras', 'syncera-plan.json'),
    path.join(__dirname, '..', 'build', 'extras', 'syncera-plan.json'),
  ]
  for (const file of candidates) {
    try {
      if (!file || !fs.existsSync(file)) continue
      return JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch (e) {
      console.error('[plan] failed to read distribution plan:', e.message)
    }
  }
  return null
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.syncera.aimessenger')
  app.setName('SYNCERA')
}

// Register secure protocol for serving media files saved to userData
protocol.registerSchemesAsPrivileged([
  { scheme: 'syncera-media', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true, standard: true } },
  // Keep legacy saved messages readable after the SYNCERA rebrand.
  { scheme: 'pulse-media', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true, standard: true } },
])

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 980, height: 640, frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: false, resizable: false,
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.center()
  splashWindow.on('closed', () => { splashWindow = null })
}

function createWindow() {
  const appIconPath = fs.existsSync(path.join(__dirname, '..', 'public', 'icon.ico'))
    ? path.join(__dirname, '..', 'public', 'icon.ico')
    : path.join(process.resourcesPath || '', 'icon.ico')
  const appIcon = nativeImage.createFromPath(appIconPath)
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 640,
    frame: false, backgroundColor: '#0D1117', show: false, skipTaskbar: true,
    icon: appIcon.isEmpty() ? appIconPath : appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  })
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html')
  const showStartupError = (detail) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const safeDetail = String(detail || 'Unknown startup error')
      .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
      <html><body style="margin:0;background:#0d1117;color:#e5edf7;font-family:Segoe UI,Arial,sans-serif;display:grid;place-items:center;height:100vh">
        <div style="max-width:680px;padding:28px;border:1px solid #263241;border-radius:16px;background:#111821">
          <h1 style="margin:0 0 12px;font-size:24px">SYNCERA gagal load UI</h1>
          <p style="color:#9aa8ba;line-height:1.5">App bukan kosong, renderer ada error masa startup. Detail teknikal:</p>
          <pre style="white-space:pre-wrap;background:#0b1118;border:1px solid #263241;border-radius:12px;padding:14px;color:#fca5a5">${safeDetail}</pre>
        </div>
      </body></html>`)}`)
  }
  if (useDevServer) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(distIndex)
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[window] failed to load:', errorCode, errorDescription, validatedURL)
    if (useDevServer && fs.existsSync(distIndex)) {
      console.log('[window] falling back to dist/index.html')
      mainWindow?.loadFile(distIndex)
    } else {
      showStartupError(`${errorCode} ${errorDescription}\n${validatedURL}`)
    }
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[window] renderer gone:', details.reason, details.exitCode)
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => mainWindow && !mainWindow.isDestroyed() && mainWindow.reload(), 800)
    }
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error('[renderer]', message, sourceId, line)
  })

  // No splash — show main window instantly once ready (faster startup).
  const showMain = () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.maximize() } catch (_) {}
      mainWindow.setSkipTaskbar(false)
      mainWindow.show()
      mainWindow.focus()
    }
  }
  mainWindow.once('ready-to-show', showMain)
  setTimeout(showMain, 3000) // safety fallback

  mainWindow.on('closed', () => { mainWindow = null })
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
  ipcMain.on('win:close',    () => mainWindow?.close())
  wa.setMainWindow(mainWindow)
  updater.setWindow(mainWindow)
  generator.setWindow(mainWindow)
  // Start checking for updates 30s after launch, then every 4 hours.
  updater.startPeriodicCheck(4)
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.setSkipTaskbar(false)
    mainWindow.show()
    mainWindow.focus()
  })
}

if (gotSingleInstanceLock) app.whenReady().then(async () => {
  // Register media file protocol -> maps *-media://<filename> to userData/media/<filename>
  const mediaDir = path.join(app.getPath('userData'), 'media')
  const legacyMediaDir = path.join(app.getPath('appData'), 'wa-bizai', 'media')
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })
  const serveMediaFile = (req, callback) => {
    const fileName = decodeURIComponent(req.url.replace(/^[a-z-]+:\/\//, '').split('?')[0].split('#')[0])
      .replace(/^\/+|\/+$/g, '')
    const currentPath = path.join(mediaDir, fileName)
    const legacyPath = path.join(legacyMediaDir, fileName)
    callback({ path: fs.existsSync(currentPath) ? currentPath : legacyPath })
  }
  protocol.registerFileProtocol('syncera-media', serveMediaFile)
  protocol.registerFileProtocol('pulse-media', serveMediaFile)

  // Splash disabled — straight to main window for fastest startup.
  await db.initDB()
  try {
    const plan = loadDistributionPlan()
    if (plan?.id) {
      db.setSetting('license_plan', String(plan.id))
      db.setSetting('license_plan_name', String(plan.name || plan.id))
      db.setSetting('license_features', JSON.stringify(plan.features || []))
    } else if (!db.getSetting('license_plan', '')) {
      db.setSetting('license_plan', 'pro_max')
      db.setSetting('license_plan_name', 'Pro Max')
      db.setSetting('license_features', JSON.stringify(['all']))
    }
  } catch (e) {
    console.error('[plan] apply failed:', e.message)
  }
  drive.init(db)            // load saved Google Drive tokens

  // Apply user's saved theme preference to native chrome (titlebar etc.)
  try {
    const savedTheme = db.getSetting('theme', 'dark')
    if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') {
      nativeTheme.themeSource = savedTheme
    }
  } catch (_) {}

  createWindow()
  setTimeout(() => wa.connect(), 1500)
  setInterval(() => checkReminders(), 60000)
  setInterval(() => checkAutoBackup(), 60 * 60 * 1000)  // hourly check for auto-backup
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (!mainWindow) createWindow() })
app.on('before-quit', () => {
  try { db.flush(true) } catch (_) {}
})

async function checkReminders() {
  const now = new Date().toISOString()
  const due = db.getReminders('pending').filter(r => r.remind_at <= now)
  for (const r of due) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wa:reminder_due', r)
    if (r.repeat_rule === 'none') db.saveReminder({ ...r, status: 'fired' })
  }
}

// ── Updater ──────────────────────────────────────────────────────────────────
ipcMain.handle('updater:check',          () => updater.checkManual())
ipcMain.handle('updater:download',       () => updater.startDownload())
ipcMain.handle('updater:install',        () => updater.quitAndInstall())
ipcMain.handle('updater:get_status',     () => updater.getStatus())
ipcMain.handle('updater:get_version',    () => app.getVersion())

// ── Generator (Seller mode — build fresh installer for customers) ───────────
function isInstallerOwnerPlan() {
  return db.getSetting('license_plan', 'pro_max') === 'pro_max'
}
ipcMain.handle('gen:build',    (_, opts) => {
  if (!isInstallerOwnerPlan()) return { ok: false, error: 'Installer Generator hanya tersedia untuk Pro Max.' }
  return generator.buildInstaller(opts || {})
})
ipcMain.handle('gen:status',   () => generator.getStatus())
ipcMain.handle('gen:reveal',   () => generator.revealInFolder())
ipcMain.handle('gen:is_owner', () => isInstallerOwnerPlan())

// ── WhatsApp ─────────────────────────────────────────────────────────────────
ipcMain.handle('wa:connect',            ()       => wa.connect())
ipcMain.handle('wa:logout',             ()       => wa.logout())
ipcMain.handle('wa:get_state',          ()       => wa.getConnectionState())
ipcMain.handle('wa:subscribe_presence', (_, j)   => wa.subscribePresence(j))
ipcMain.handle('wa:sync_history',       ()       => wa.syncHistoryNow())
ipcMain.handle('wa:send', async (_, { jid, text }) => {
  try   { return { ok: true, data: await wa.sendMessage(jid, text) }
  } catch(e) { return { ok: false, error: e.message } }
})
ipcMain.handle('wa:send_media', async (_, payload) => {
  try   { return { ok: true, data: await wa.sendMedia(payload.jid, payload) }
  } catch(e) { return { ok: false, error: e.message } }
})
ipcMain.handle('wa:get_status_stories', async () => {
  try   { return await wa.getStatusStories() }
  catch(e) { return [] }
})
ipcMain.handle('wa:upload_status', async (_, payload) => {
  try   { return await wa.uploadStatus(payload || {}) }
  catch(e) { return { ok: false, error: e.message } }
})
ipcMain.handle('wa:sync_statuses', async () => {
  try   { return await wa.syncStatuses() }
  catch(e) { return { ok: false, error: e.message } }
})
ipcMain.handle('wa:delete_status_story', async (_, id) => {
  try   { return await wa.deleteStatusStory(id) }
  catch(e) { return { ok: false, error: e.message } }
})

// ── Database ─────────────────────────────────────────────────────────────────
ipcMain.handle('db:get_conversations',   ()                    => db.getConversations())
ipcMain.handle('db:get_messages',        (_, { jid, limit, offset }) => db.getMessages(jid, limit||60, offset||0))
ipcMain.handle('db:clear_unread',        (_, jid)              => db.clearUnread(jid))
ipcMain.handle('db:search',              (_, q)                => db.searchMessages(q))
ipcMain.handle('db:update_conversation', (_, { jid, data })    => db.updateConversation(jid, data))
ipcMain.handle('db:update_contact',      (_, { id, data })     => db.updateContact(id, data))
ipcMain.handle('db:get_all_contacts',    ()                    => db.getAllContacts())
ipcMain.handle('db:analytics',           ()                    => db.getAnalytics())

// ── KB ───────────────────────────────────────────────────────────────────────
ipcMain.handle('kb:get',    ()     => db.getKnowledgeBase(false))
ipcMain.handle('kb:save',   (_, e) => db.saveKBEntry(e))
ipcMain.handle('kb:delete', (_, id)=> db.deleteKBEntry(id))

// ── Templates ────────────────────────────────────────────────────────────────
ipcMain.handle('tpl:get',    ()      => db.getTemplates())
ipcMain.handle('tpl:save',   (_, t)  => db.saveTemplate(t))
ipcMain.handle('tpl:delete', (_, id) => db.deleteTemplate(id))
ipcMain.handle('tpl:use',    (_, id) => { db.incTemplateUsage(id); return db.getTemplates().find(t=>t.id===id) })

// ── Orders ───────────────────────────────────────────────────────────────────
ipcMain.handle('orders:get',    (_, cid) => db.getOrders(cid))
ipcMain.handle('orders:save',   (_, o)   => db.saveOrder(o))
ipcMain.handle('orders:delete', (_, id)  => db.deleteOrder(id))

// ── Broadcasts ───────────────────────────────────────────────────────────────
ipcMain.handle('broadcasts:get',    ()     => db.getBroadcasts())
ipcMain.handle('broadcasts:save',   (_, b) => db.saveBroadcast(b))
ipcMain.handle('broadcasts:delete', (_, id)=> db.deleteBroadcast(id))
ipcMain.handle('broadcasts:send', async (_, id) => {
  const broadcast = db.getBroadcasts().find(b => b.id === id)
  if (!broadcast) return { ok: false, error: 'Not found' }
  let contactIds = []
  try { contactIds = JSON.parse(broadcast.contact_ids || '[]') } catch(_) {}
  if (broadcast.label_filter && broadcast.label_filter !== '') {
    const labelled = db.getAllContacts().filter(c => c.label === broadcast.label_filter)
    contactIds = [...new Set([...contactIds, ...labelled.map(c => c.id)])]
  }
  let sent = 0, fail = 0
  const total = contactIds.length
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('broadcast:progress', { id, status: 'starting', sent: 0, fail: 0, total })
  }

  for (const [idx, cid] of contactIds.entries()) {
    const contact = db.getContact(cid)
    if (!contact) continue
    const jid = contact.phone.includes('@') ? contact.phone : `${contact.phone}@s.whatsapp.net`
    const msg = broadcast.message.replace(/\{name\}/g, contact.name || contact.phone).replace(/\{phone\}/g, contact.phone)
    try {
      await wa.sendMessage(jid, msg)
      sent++
    } catch(_) { fail++ }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('broadcast:progress', { id, status: 'sending', sent, fail, total, current: idx + 1 })
    }
  }
  db.saveBroadcast({ ...broadcast, status: 'sent', sent_count: sent, fail_count: fail })
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('broadcast:progress', { id, status: 'done', sent, fail, total })
  }
  return { ok: true, sent, fail }
})

// ── Reminders ────────────────────────────────────────────────────────────────
ipcMain.handle('reminders:get',    (_, s)  => db.getReminders(s))
ipcMain.handle('reminders:save',   (_, r)  => db.saveReminder(r))
ipcMain.handle('reminders:delete', (_, id) => db.deleteReminder(id))

// ── Calendar ────────────────────────────────────────────────────────────────
ipcMain.handle('calendar:get',    ()      => db.getCalendarEvents())
ipcMain.handle('calendar:save',   (_, e)  => db.saveCalendarEvent(e))
ipcMain.handle('calendar:delete', (_, id) => db.deleteCalendarEvent(id))

// ── Settings & AI ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:get_all', ()               => db.getAllSettings())
ipcMain.handle('settings:set',     (_, { key, val}) => db.setSetting(key, val))
ipcMain.handle('ai:detect',        ()               => ai.detectBackends())
ipcMain.handle('ai:test',          (_, p)           => ai.testBackend(p.url, p.type))
ipcMain.handle('ai:generate',      (_, p)           => ai.generateReply(p))
ipcMain.handle('ai:outreach_one', async (_, p) => {
  try { return await wa.setAIOutreach(p.jid, p.enabled !== false, { sendNow: p.sendNow !== false, force: !!p.force }) }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('ai:outreach_all', async (_, p = {}) => {
  try { return await wa.setAIOutreachAll(p.enabled !== false, { sendNow: p.sendNow !== false }) }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('ai:outreach_send_now', async (_, jid) => {
  try { return await wa.sendAIOutreach(jid, { force: true }) }
  catch (e) { return { ok: false, error: e.message } }
})

// Diagnostic & bulk enable
ipcMain.handle('ai:diagnose', async () => {
  const backends = await ai.detectBackends()
  const defaultModel = db.getSetting('ai_default_model', '')
  const autoEnable = db.getSetting('ai_auto_enable', '1')
  const convs = db.getConversations()
  return {
    ok: backends.length > 0 && backends[0].models.length > 0,
    backends,
    defaultModel,
    autoEnable,
    aiEnabledCount: convs.filter(c => c.ai_enabled).length,
    totalConvs: convs.length,
  }
})

ipcMain.handle('ai:clear_history', (_, jid) => {
  // Delete all AI-generated replies from this conversation (cleanup hallucinated history)
  const dbInstance = require('./bridge/database')
  return dbInstance.clearAIReplies(jid)
})

ipcMain.handle('db:clear_conversation', (_, jid) => {
  // Wipe ALL messages (keep conversation row so user can start fresh chat)
  return db.clearConversation(jid)
})

ipcMain.handle('ai:enable_all', async () => {
  let model = db.getSetting('ai_default_model', '')
  if (!model) {
    const backends = await ai.detectBackends()
    if (backends[0]?.models[0]) {
      model = `${backends[0].id}:${backends[0].models[0]}`
      db.setSetting('ai_default_model', model)
    }
  }
  if (!model) return { ok: false, error: 'No AI model available. Install Ollama and pull a model first.' }
  const convs = db.getConversations()
  for (const c of convs) {
    db.updateConversation(c.id, { ai_enabled: 1, ai_model: c.ai_model || model })
  }
  db.setSetting('ai_auto_enable', '1')
  return { ok: true, count: convs.length, model }
})

// ── Google Drive Backup ──────────────────────────────────────────────────────
ipcMain.handle('drive:status',        ()             => drive.getStatus())
ipcMain.handle('drive:set_client_id', (_, id)        => { drive.setClientId(id); return { ok: true } })
ipcMain.handle('drive:connect',       async (_, id)  => {
  try { return { ok: true, ...(await drive.startOAuth(id)) } }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('drive:disconnect',    ()             => drive.disconnect())
ipcMain.handle('drive:backup_now',    async ()       => {
  try {
    const r = await drive.backupNow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:event', { type: 'backup_done', ...r })
    }
    return { ok: true, ...r }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('drive:list_backups',  async ()       => {
  try { return { ok: true, files: await drive.listBackups() } }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('drive:restore',       async (_, id)  => {
  try {
    const r = await drive.restoreBackup(id)
    // Reload DB after restore
    db.reload && await db.reload()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:event', { type: 'restore_done' })
    }
    return { ok: true, ...r }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('drive:delete',        async (_, id)  => {
  try { await drive.deleteFile(id); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})

async function checkAutoBackup() {
  try {
    const status = drive.getStatus()
    if (!status.connected || !status.autoBackup) return
    const last = status.lastBackup ? new Date(status.lastBackup).getTime() : 0
    const dayMs = 24 * 60 * 60 * 1000
    if (Date.now() - last < dayMs) return
    console.log('[drive] auto-backup running')
    await drive.backupNow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:event', { type: 'auto_backup_done' })
    }
  } catch (e) { console.error('[drive] auto-backup error:', e.message) }
}

// ── Report PDF Generator ─────────────────────────────────────────────────────
ipcMain.handle('report:save_pdf', async (_, { html, defaultFileName }) => {
  let win = null
  let tmpHtmlPath = null
  try {
    // Ask user where to save the PDF
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Report PDF',
      defaultPath: defaultFileName || `syncera-report-${new Date().toISOString().slice(0,10)}.pdf`,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    // Write HTML to temp file — data: URLs have length limits that break with
    // embedded logos + large tables. file:// works for any size.
    const tmpDir = app.getPath('temp')
    tmpHtmlPath = path.join(tmpDir, `syncera-report-${Date.now()}.html`)
    fs.writeFileSync(tmpHtmlPath, html, 'utf-8')

    // Render HTML in a hidden window, then export as PDF
    win = new BrowserWindow({
      width: 1024, height: 1448, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
    })

    await win.loadFile(tmpHtmlPath)
    // Slight delay to let fonts / layout settle
    await new Promise(r => setTimeout(r, 400))

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      // Margins in INCHES (Electron API expects inches, not mm).
      // 0.4" ≈ 10mm — comfortable A4 print margin.
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      preferCSSPageSize: false,
      landscape: false,
    })

    fs.writeFileSync(result.filePath, pdfBuffer)
    return { ok: true, path: result.filePath, size: pdfBuffer.length }
  } catch (e) {
    console.error('[report] PDF error:', e)
    return { ok: false, error: e.message }
  } finally {
    if (win && !win.isDestroyed()) { try { win.destroy() } catch {} }
    if (tmpHtmlPath) { try { fs.unlinkSync(tmpHtmlPath) } catch {} }
  }
})

// Provide aggregated stats for report generation
ipcMain.handle('report:stats', (_, { startDate, endDate }) => {
  return db.getReportStats(startDate, endDate)
})

// ── System Notifications ─────────────────────────────────────────────────────
ipcMain.on('notify', (_, { title, body }) => {
  if (Notification.isSupported() && mainWindow && !mainWindow.isFocused()) {
    const icon = path.join(__dirname, '..', 'public', 'icon.ico')
    const cleanTitle = String(title || 'New message').replace(/^📩\s*/, '').trim()
    const cleanBody = String(body || '').trim()
    new Notification({
      title: `SYNCERA · ${cleanTitle}`,
      subtitle: 'AI Messenger',
      body: cleanBody,
      icon,
      silent: false,
    }).show()
  }
})
