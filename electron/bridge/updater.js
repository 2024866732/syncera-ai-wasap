'use strict'
/**
 * SYNCERA Auto-Updater
 *
 * Uses electron-updater to:
 *   1. Check for new versions on the update server
 *   2. Download the new installer in the background
 *   3. Install on app quit / restart
 *
 * Server format (generic provider expects):
 *   https://updates.darksea.network/syncera/latest/
 *     ├── latest.yml                       ← version metadata
 *     ├── SYNCERA-Setup-1.0.1-x64.exe
 *     └── SYNCERA-Setup-1.0.1-x64.exe.blockmap
 *
 * Publish new release via:  electron-builder --win nsis --publish always
 * (requires CSC_LINK + CSC_KEY_PASSWORD if signing, or just upload manually)
 */

const { app, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

// ── Logging ────────────────────────────────────────────────────────────────
log.transports.file.level = 'info'
log.transports.console.level = 'info'
autoUpdater.logger = log

// ── Behavior config ────────────────────────────────────────────────────────
// Don't auto-download — let user click button (better UX, avoids surprise data usage)
autoUpdater.autoDownload = false
// Auto-install when user quits the app (silent, friendly)
autoUpdater.autoInstallOnAppQuit = true
// On Windows, even unsigned updates work (we set verifyUpdateCodeSignature=false in builder)
autoUpdater.allowDowngrade = false
// Check pre-release channels? (e.g. beta) — default off for stable customers
autoUpdater.allowPrerelease = false

let mainWindow = null
let checkingManually = false  // true when user explicitly clicked "Check"
let lastStatus = { state: 'idle' }

function canUseUpdater() {
  if (!app.isPackaged) return { ok: false, reason: 'dev-mode' }
  const updateConfig = path.join(process.resourcesPath || '', 'app-update.yml')
  if (!fs.existsSync(updateConfig)) return { ok: false, reason: 'missing-update-config' }
  return { ok: true }
}

function setWindow(win) { mainWindow = win }

function emit(state, data = {}) {
  lastStatus = { state, ...data, timestamp: Date.now() }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', lastStatus)
  }
  log.info('[updater]', state, data)
}

// ── Events from electron-updater ───────────────────────────────────────────
autoUpdater.on('checking-for-update', () => {
  emit('checking')
})

autoUpdater.on('update-available', (info) => {
  emit('available', {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes || '',
    fileSize: info.files && info.files[0] ? info.files[0].size : null,
  })
})

autoUpdater.on('update-not-available', (info) => {
  emit('not-available', { currentVersion: app.getVersion(), latestVersion: info.version })
  // Show a "you're up to date" toast only when user manually checked
  if (checkingManually && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'SYNCERA Up to Date',
      message: `You are running the latest version (${app.getVersion()}).`,
      buttons: ['OK'],
      defaultId: 0,
    })
  }
  checkingManually = false
})

autoUpdater.on('download-progress', (p) => {
  emit('downloading', {
    percent: Math.round(p.percent),
    bytesPerSecond: p.bytesPerSecond,
    transferred: p.transferred,
    total: p.total,
  })
})

autoUpdater.on('update-downloaded', (info) => {
  emit('downloaded', {
    version: info.version,
    releaseNotes: info.releaseNotes || '',
  })
  // Prompt user to restart now or later
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'SYNCERA Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart SYNCERA to apply the update. Your data is preserved.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    }).catch(() => {})
  }
})

autoUpdater.on('error', (err) => {
  emit('error', { message: String(err && err.message || err) })
  if (checkingManually && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates.',
      detail: String(err && err.message || err),
      buttons: ['OK'],
      defaultId: 0,
    })
  }
  checkingManually = false
})

// ── Public API ─────────────────────────────────────────────────────────────

/** Silent background check — called on app launch + periodic */
async function checkSilent() {
  const availability = canUseUpdater()
  if (!availability.ok) {
    log.info(`[updater] Skipping check: ${availability.reason}`)
    return { ok: false, reason: availability.reason }
  }
  try {
    checkingManually = false
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, result }
  } catch (e) {
    log.error('[updater] Silent check failed:', e)
    return { ok: false, error: String(e.message || e) }
  }
}

/** User clicked "Check for updates" — show feedback regardless */
async function checkManual() {
  const availability = canUseUpdater()
  if (!availability.ok) {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'SYNCERA Update',
        message: availability.reason === 'dev-mode'
          ? 'Auto-update is disabled in development mode.'
          : 'Auto-update metadata is not available in this portable build.',
        buttons: ['OK'],
      })
    }
    return { ok: false, reason: availability.reason }
  }
  try {
    checkingManually = true
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, result }
  } catch (e) {
    log.error('[updater] Manual check failed:', e)
    return { ok: false, error: String(e.message || e) }
  }
}

/** User clicked "Download Update" button */
async function startDownload() {
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (e) {
    log.error('[updater] Download failed:', e)
    return { ok: false, error: String(e.message || e) }
  }
}

/** User clicked "Restart and Install" button */
function quitAndInstall() {
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return { ok: true }
}

/** Current state — useful when renderer needs to query after late mount */
function getStatus() {
  return { ...lastStatus, currentVersion: app.getVersion() }
}

/** Schedule periodic background check */
function startPeriodicCheck(intervalHours = 4) {
  // First check 30s after launch (let app settle)
  setTimeout(() => checkSilent().catch(() => {}), 30_000)
  // Then every N hours
  setInterval(() => checkSilent().catch(() => {}), intervalHours * 60 * 60 * 1000)
}

module.exports = {
  setWindow,
  checkSilent,
  checkManual,
  startDownload,
  quitAndInstall,
  getStatus,
  startPeriodicCheck,
}
