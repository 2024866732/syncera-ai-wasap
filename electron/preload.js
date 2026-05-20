'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    const ok = ['win:minimize','win:maximize','win:close','notify']
    if (ok.includes(channel)) ipcRenderer.send(channel, data)
  },
})

contextBridge.exposeInMainWorld('wa', {
  // WhatsApp
  connect:           ()          => ipcRenderer.invoke('wa:connect'),
  logout:            ()          => ipcRenderer.invoke('wa:logout'),
  sendMessage:       (jid, text) => ipcRenderer.invoke('wa:send', { jid, text }),
  sendMedia:         (payload)   => ipcRenderer.invoke('wa:send_media', payload),
  getState:          ()          => ipcRenderer.invoke('wa:get_state'),
  subscribePresence: (jid)       => ipcRenderer.invoke('wa:subscribe_presence', jid),
  syncHistory:       ()          => ipcRenderer.invoke('wa:sync_history'),
  getStatusStories:  ()          => ipcRenderer.invoke('wa:get_status_stories'),
  uploadStatus:      (payload)   => ipcRenderer.invoke('wa:upload_status', payload),
  syncStatuses:      ()          => ipcRenderer.invoke('wa:sync_statuses'),
  deleteStatusStory: (id)        => ipcRenderer.invoke('wa:delete_status_story', id),
  // DB - conversations & messages
  getConversations:  ()          => ipcRenderer.invoke('db:get_conversations'),
  getMessages:       (jid, l, o) => ipcRenderer.invoke('db:get_messages', { jid, limit: l, offset: o }),
  clearUnread:       (jid)       => ipcRenderer.invoke('db:clear_unread', jid),
  updateConversation:(jid, data) => ipcRenderer.invoke('db:update_conversation', { jid, data }),
  updateContact:     (id, data)  => ipcRenderer.invoke('db:update_contact', { id, data }),
  getAllContacts:     ()          => ipcRenderer.invoke('db:get_all_contacts'),
  searchMessages:    (q)         => ipcRenderer.invoke('db:search', q),
  getAnalytics:      ()          => ipcRenderer.invoke('db:analytics'),
  // Knowledge Base
  getKB:             ()          => ipcRenderer.invoke('kb:get'),
  saveKBEntry:       (e)         => ipcRenderer.invoke('kb:save', e),
  deleteKBEntry:     (id)        => ipcRenderer.invoke('kb:delete', id),
  // Templates
  getTemplates:      ()          => ipcRenderer.invoke('tpl:get'),
  saveTemplate:      (t)         => ipcRenderer.invoke('tpl:save', t),
  deleteTemplate:    (id)        => ipcRenderer.invoke('tpl:delete', id),
  useTemplate:       (id)        => ipcRenderer.invoke('tpl:use', id),
  // Orders
  getOrders:         (cid)       => ipcRenderer.invoke('orders:get', cid),
  saveOrder:         (o)         => ipcRenderer.invoke('orders:save', o),
  deleteOrder:       (id)        => ipcRenderer.invoke('orders:delete', id),
  // Broadcasts
  getBroadcasts:     ()          => ipcRenderer.invoke('broadcasts:get'),
  saveBroadcast:     (b)         => ipcRenderer.invoke('broadcasts:save', b),
  deleteBroadcast:   (id)        => ipcRenderer.invoke('broadcasts:delete', id),
  sendBroadcast:     (id)        => ipcRenderer.invoke('broadcasts:send', id),
  // Reminders
  getReminders:      (s)         => ipcRenderer.invoke('reminders:get', s),
  saveReminder:      (r)         => ipcRenderer.invoke('reminders:save', r),
  deleteReminder:    (id)        => ipcRenderer.invoke('reminders:delete', id),
  // Calendar
  getCalendarEvents: ()          => ipcRenderer.invoke('calendar:get'),
  saveCalendarEvent: (e)         => ipcRenderer.invoke('calendar:save', e),
  deleteCalendarEvent:(id)       => ipcRenderer.invoke('calendar:delete', id),
  // Settings & AI
  getSettings:       ()          => ipcRenderer.invoke('settings:get_all'),
  setSetting:        (k, v)      => ipcRenderer.invoke('settings:set', { key: k, val: v }),
  detectAI:          ()          => ipcRenderer.invoke('ai:detect'),
  testAI:            (id, u, t)  => ipcRenderer.invoke('ai:test', { backendId: id, url: u, type: t }),
  generateReply:     (p)         => ipcRenderer.invoke('ai:generate', p),
  setAIOutreach:     (p)         => ipcRenderer.invoke('ai:outreach_one', p),
  setAIOutreachAll:  (p)         => ipcRenderer.invoke('ai:outreach_all', p),
  sendAIOutreachNow: (jid)       => ipcRenderer.invoke('ai:outreach_send_now', jid),
  diagnoseAI:        ()          => ipcRenderer.invoke('ai:diagnose'),
  enableAIForAll:    ()          => ipcRenderer.invoke('ai:enable_all'),
  clearAIHistory:    (jid)       => ipcRenderer.invoke('ai:clear_history', jid),
  clearConversation: (jid)       => ipcRenderer.invoke('db:clear_conversation', jid),
  // Report
  getReportStats:    (p)         => ipcRenderer.invoke('report:stats', p),
  saveReportPDF:     (p)         => ipcRenderer.invoke('report:save_pdf', p),
  // Google Drive backup
  driveStatus:       ()          => ipcRenderer.invoke('drive:status'),
  driveSetClientId:  (id)        => ipcRenderer.invoke('drive:set_client_id', id),
  driveConnect:      (id)        => ipcRenderer.invoke('drive:connect', id),
  driveDisconnect:   ()          => ipcRenderer.invoke('drive:disconnect'),
  driveBackupNow:    ()          => ipcRenderer.invoke('drive:backup_now'),
  driveListBackups:  ()          => ipcRenderer.invoke('drive:list_backups'),
  driveRestore:      (id)        => ipcRenderer.invoke('drive:restore', id),
  driveDelete:       (id)        => ipcRenderer.invoke('drive:delete', id),
  // Auto-Updater
  updaterCheck:      ()          => ipcRenderer.invoke('updater:check'),
  updaterDownload:   ()          => ipcRenderer.invoke('updater:download'),
  updaterInstall:    ()          => ipcRenderer.invoke('updater:install'),
  updaterStatus:     ()          => ipcRenderer.invoke('updater:get_status'),
  appVersion:        ()          => ipcRenderer.invoke('updater:get_version'),
  // Generator (Seller mode)
  genBuild:          (opts)      => ipcRenderer.invoke('gen:build', opts),
  genStatus:         ()          => ipcRenderer.invoke('gen:status'),
  genReveal:         ()          => ipcRenderer.invoke('gen:reveal'),
  genIsOwner:        ()          => ipcRenderer.invoke('gen:is_owner'),
  // Events main→renderer
  on: (channel, fn) => {
    const ok = ['wa:qr','wa:connected','wa:disconnected','wa:message','wa:status_update','wa:status_story','wa:typing','wa:presence','wa:ai_error','wa:error','wa:reminder_due','wa:reconnecting','wa:connecting','wa:contacts_updated','broadcast:progress','wa:history_sync_start','wa:history_sync_progress','wa:history_sync_done','drive:event','updater:status','generator:status','calendar:event_saved']
    if (!ok.includes(channel)) return () => {}
    const cb = (_e, d) => fn(d)
    ipcRenderer.on(channel, cb)
    return () => ipcRenderer.removeListener(channel, cb)
  },
})
