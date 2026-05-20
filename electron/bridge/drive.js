'use strict'
/**
 * Google Drive integration for SYNCERA.
 * - OAuth 2.0 with PKCE (no client_secret needed — safe for desktop apps)
 * - Uses limited "drive.file" scope: app can only access files it created
 * - Tokens stored encrypted in app DB via Electron safeStorage
 */

const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { shell, safeStorage, app } = require('electron')
const axios = require('axios')

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const BACKUP_PREFIX = 'syncera-backup'

// ─── State ───────────────────────────────────────────────────────────────────
let clientId = null
let accessToken = null
let refreshToken = null
let expiresAt = 0
let userEmail = null
let _db = null  // injected after init

function init(database) {
  _db = database
  // Load saved client_id + tokens from settings
  clientId = _db.getSetting('drive_client_id', '') || null
  loadStoredTokens()
}

function encryptTok(plain) {
  if (!safeStorage.isEncryptionAvailable()) return plain
  return safeStorage.encryptString(plain).toString('base64')
}
function decryptTok(blob) {
  if (!blob) return ''
  if (!safeStorage.isEncryptionAvailable()) return blob
  try { return safeStorage.decryptString(Buffer.from(blob, 'base64')) } catch { return '' }
}

function loadStoredTokens() {
  if (!_db) return
  const at = _db.getSetting('drive_access_token', '')
  const rt = _db.getSetting('drive_refresh_token', '')
  const exp = _db.getSetting('drive_expires_at', '0')
  const email = _db.getSetting('drive_user_email', '')
  if (at)    accessToken  = decryptTok(at)
  if (rt)    refreshToken = decryptTok(rt)
  if (exp)   expiresAt    = parseInt(exp, 10)
  if (email) userEmail    = email
}

function persistTokens() {
  if (!_db) return
  if (accessToken)  _db.setSetting('drive_access_token',  encryptTok(accessToken))
  if (refreshToken) _db.setSetting('drive_refresh_token', encryptTok(refreshToken))
  _db.setSetting('drive_expires_at', String(expiresAt))
  if (userEmail)    _db.setSetting('drive_user_email', userEmail)
}

function clearTokens() {
  accessToken = null
  refreshToken = null
  expiresAt = 0
  userEmail = null
  if (_db) {
    _db.setSetting('drive_access_token',  '')
    _db.setSetting('drive_refresh_token', '')
    _db.setSetting('drive_expires_at', '0')
    _db.setSetting('drive_user_email', '')
  }
}

// ─── PKCE Helpers ────────────────────────────────────────────────────────────
function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function pkceChallenge() {
  const verifier  = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

// ─── OAuth Flow ──────────────────────────────────────────────────────────────
async function startOAuth(providedClientId) {
  const cid = providedClientId || clientId
  if (!cid) throw new Error('No Google Client ID configured. Setup OAuth client first.')
  clientId = cid
  if (_db) _db.setSetting('drive_client_id', cid)

  const { verifier, challenge } = pkceChallenge()

  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const redirectUri = `http://127.0.0.1:${port}/callback`

      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('client_id', cid)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', `${SCOPE} https://www.googleapis.com/auth/userinfo.email`)
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')

      shell.openExternal(url.toString()).catch(reject)
    })

    // 60 second timeout
    const timer = setTimeout(() => { try { server.close() } catch {}; reject(new Error('OAuth timeout — user did not authorize within 60s')) }, 60_000)

    server.on('request', async (req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost')
        if (!reqUrl.pathname.startsWith('/callback')) {
          res.writeHead(404); res.end(); return
        }
        const code = reqUrl.searchParams.get('code')
        const err  = reqUrl.searchParams.get('error')

        // Pretty HTML response in user's browser
        res.writeHead(err ? 400 : 200, { 'Content-Type': 'text/html; charset=utf-8' })
        const htmlOk = `<!doctype html><html><head><title>SYNCERA · Drive Connected</title><style>
          body { background:#0d1117; color:#e6edf3; font-family:system-ui,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
          .card { background:#161b22; border:1px solid #30363d; padding:48px 56px; border-radius:24px; text-align:center; box-shadow:0 30px 80px rgba(37,211,102,.3); }
          h1 { color:#25D366; margin:0 0 12px; font-size:28px; }
          p  { color:#8b949e; margin:0; }
          .check { font-size:64px; margin-bottom:16px; }
        </style></head><body><div class="card"><div class="check">✅</div><h1>Google Drive Connected</h1><p>You can close this tab and return to SYNCERA.</p></div></body></html>`
        const htmlErr = `<!doctype html><html><body style="font-family:sans-serif; background:#0d1117; color:#f85149; text-align:center; padding:60px;"><h1>Authorization failed</h1><p>${err}</p></body></html>`
        res.end(err ? htmlErr : htmlOk)

        setTimeout(() => { try { server.close() } catch {} }, 500)
        clearTimeout(timer)

        if (err)  return reject(new Error(`OAuth error: ${err}`))
        if (!code) return reject(new Error('No authorization code received'))

        const port = server.address().port
        // Exchange code → tokens
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token',
          new URLSearchParams({
            client_id: cid,
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: `http://127.0.0.1:${port}/callback`,
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

        accessToken  = tokenRes.data.access_token
        refreshToken = tokenRes.data.refresh_token
        expiresAt    = Date.now() + (tokenRes.data.expires_in * 1000)

        // Fetch user email
        try {
          const u = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          userEmail = u.data.email
        } catch {}

        persistTokens()
        resolve({ ok: true, email: userEmail })
      } catch (e) {
        clearTimeout(timer); try { server.close() } catch {}
        reject(e)
      }
    })
  })
}

async function refreshAccessToken() {
  if (!refreshToken || !clientId) throw new Error('No refresh token / client id')
  const res = await axios.post('https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  accessToken = res.data.access_token
  expiresAt   = Date.now() + (res.data.expires_in * 1000)
  persistTokens()
  return accessToken
}

async function ensureToken() {
  if (!accessToken) throw new Error('Not connected to Google Drive')
  if (Date.now() > expiresAt - 60_000) {
    await refreshAccessToken()
  }
  return accessToken
}

// ─── Drive API ───────────────────────────────────────────────────────────────
async function findFileByName(name) {
  const token = await ensureToken()
  const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
    params: {
      q: `name='${name.replace(/'/g, "\\'")}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id,name,modifiedTime,size)',
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data.files?.[0] || null
}

async function uploadFile(localPath, remoteFileName) {
  const token = await ensureToken()
  if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`)
  const fileBuffer = fs.readFileSync(localPath)

  // Check if file with same name exists — if so, update
  const existing = await findFileByName(remoteFileName)

  const metadata = { name: remoteFileName, description: `SYNCERA backup created ${new Date().toISOString()}` }
  const boundary = '----SYNCERA' + Date.now()
  const CRLF = '\r\n'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${CRLF}Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}`),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(`${CRLF}--${boundary}${CRLF}Content-Type: application/octet-stream${CRLF}${CRLF}`),
    fileBuffer,
    Buffer.from(`${CRLF}--${boundary}--`),
  ])

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
  const method = existing ? 'patch' : 'post'

  const res = await axios({
    url, method, data: body,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    maxContentLength: Infinity, maxBodyLength: Infinity,
  })
  return { id: res.data.id, name: res.data.name, size: fileBuffer.length, replaced: !!existing }
}

async function downloadFile(fileId, destPath) {
  const token = await ensureToken()
  const res = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    maxContentLength: Infinity,
  })
  fs.writeFileSync(destPath, Buffer.from(res.data))
  return { path: destPath, size: res.data.byteLength }
}

async function listBackups() {
  const token = await ensureToken()
  const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
    params: {
      q: `name contains '${BACKUP_PREFIX}' and trashed=false`,
      fields: 'files(id,name,modifiedTime,size,description)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data.files || []
}

async function deleteFile(fileId) {
  const token = await ensureToken()
  await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return true
}

// ─── High-level backup / restore ─────────────────────────────────────────────
async function backupNow() {
  const dbPath = path.join(app.getPath('userData'), 'wa-bizai.db')
  if (!fs.existsSync(dbPath)) throw new Error('Database file not found')
  // Flush DB to disk first
  if (_db && _db.flush) _db.flush(true)

  const fileName = `${BACKUP_PREFIX}-${new Date().toISOString().slice(0,10)}.db`
  const result = await uploadFile(dbPath, fileName)

  if (_db) _db.setSetting('drive_last_backup', new Date().toISOString())
  return result
}

async function restoreBackup(fileId) {
  const dbPath = path.join(app.getPath('userData'), 'wa-bizai.db')
  const tmp = path.join(app.getPath('userData'), 'wa-bizai-restore.db')
  await downloadFile(fileId, tmp)

  // Atomic swap (close DB connection first — caller should handle)
  if (fs.existsSync(dbPath)) {
    const backup = `${dbPath}.bak-${Date.now()}`
    fs.copyFileSync(dbPath, backup)
  }
  fs.copyFileSync(tmp, dbPath)
  fs.unlinkSync(tmp)
  return { ok: true, path: dbPath }
}

function getStatus() {
  return {
    connected: !!accessToken,
    email: userEmail,
    hasClientId: !!clientId,
    lastBackup: _db?.getSetting('drive_last_backup', '') || null,
    autoBackup: _db?.getSetting('drive_auto_backup', '0') === '1',
  }
}

function disconnect() {
  clearTokens()
  return { ok: true }
}

function setClientId(id) {
  clientId = id
  if (_db) _db.setSetting('drive_client_id', id)
}

module.exports = {
  init, startOAuth, disconnect, getStatus, setClientId,
  backupNow, restoreBackup, listBackups, deleteFile,
}
