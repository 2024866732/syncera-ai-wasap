import { useEffect, useState } from 'react'
import { Download, RotateCw, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react'

type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdateStatus {
  state: UpdateState
  version?: string
  releaseDate?: string
  releaseNotes?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  message?: string
  currentVersion?: string
  fileSize?: number | null
  timestamp?: number
}

/**
 * Floating update banner — appears bottom-right when an update is available,
 * downloading, or ready to install. Auto-hides on dismiss or success.
 */
export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.wa?.updaterStatus?.().then((s) => { if (s) setStatus(s as UpdateStatus) }).catch(() => {})
    const off = window.wa?.on('updater:status', (s) => {
      setStatus(s as UpdateStatus)
      setDismissed(false)
    })
    return () => { if (off) off() }
  }, [])

  // Don't show banner for idle, not-available, error (unless from manual check)
  const shouldShow =
    !dismissed &&
    (status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded')

  if (!shouldShow) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 animate-slide-in-right">
      <div className="bg-bg-tertiary border border-accent-green/40 rounded-2xl shadow-2xl backdrop-blur p-4 w-[360px]">
        {status.state === 'available' && <AvailableCard status={status} onDismiss={() => setDismissed(true)} />}
        {status.state === 'downloading' && <DownloadingCard status={status} />}
        {status.state === 'downloaded' && <ReadyCard status={status} onDismiss={() => setDismissed(true)} />}
      </div>
    </div>
  )
}

function AvailableCard({ status, onDismiss }: { status: UpdateStatus; onDismiss: () => void }) {
  const [starting, setStarting] = useState(false)
  const sizeMB = status.fileSize ? (status.fileSize / 1024 / 1024).toFixed(1) : null

  const handleDownload = async () => {
    setStarting(true)
    try { await window.wa?.updaterDownload?.() }
    finally { setStarting(false) }
  }

  return (
    <>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-green to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-accent-green/30">
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">SYNCERA Update Available</p>
          <p className="text-xs text-text-muted mt-0.5">
            Version {status.version}{sizeMB ? ` · ${sizeMB} MB` : ''}
          </p>
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
      </div>

      {status.releaseNotes && (
        <div className="mb-3 max-h-20 overflow-y-auto text-xs text-text-secondary bg-bg-secondary/40 rounded-lg p-2.5 border border-border/40">
          {String(status.releaseNotes).slice(0, 240)}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={starting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-green text-bg-primary hover:bg-green-400 text-xs font-bold transition-colors disabled:opacity-60">
          <Download size={13} />
          {starting ? 'Starting…' : 'Download Update'}
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-2 rounded-lg bg-bg-hover text-text-secondary hover:bg-bg-active text-xs font-medium">
          Later
        </button>
      </div>
    </>
  )
}

function DownloadingCard({ status }: { status: UpdateStatus }) {
  const pct = status.percent ?? 0
  const speed = status.bytesPerSecond ? `${(status.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s` : ''
  const done = status.transferred && status.total
    ? `${(status.transferred / 1024 / 1024).toFixed(0)} / ${(status.total / 1024 / 1024).toFixed(0)} MB`
    : ''
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent-blue/15 flex items-center justify-center">
          <RotateCw size={18} className="text-accent-blue animate-spin" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-text-primary">Downloading update…</p>
          <p className="text-xs text-text-muted mt-0.5">{done} {speed && `· ${speed}`}</p>
        </div>
        <p className="text-sm font-bold text-accent-blue">{pct}%</p>
      </div>
      <div className="h-2 bg-bg-active rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent-blue to-cyan-400 transition-all duration-300"
          style={{ width: `${pct}%` }} />
      </div>
    </>
  )
}

function ReadyCard({ status, onDismiss }: { status: UpdateStatus; onDismiss: () => void }) {
  const handleInstall = () => window.wa?.updaterInstall?.()
  return (
    <>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-green to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-accent-green/30">
          <CheckCircle2 size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">Update Ready to Install</p>
          <p className="text-xs text-text-muted mt-0.5">
            Version {status.version} · Restart to apply
          </p>
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleInstall}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-green text-bg-primary hover:bg-green-400 text-xs font-bold transition-colors">
          <RotateCw size={13} />
          Restart & Install
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-2 rounded-lg bg-bg-hover text-text-secondary hover:bg-bg-active text-xs font-medium">
          Later
        </button>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// "Check for Updates" button — used in Settings → About
// ──────────────────────────────────────────────────────────────────────────────

export function CheckForUpdatesButton() {
  const [checking, setChecking] = useState(false)
  const [version, setVersion] = useState<string>('1.0.0')
  const [statusText, setStatusText] = useState('')

  useEffect(() => {
    window.wa?.appVersion?.().then((v) => setVersion(String(v))).catch(() => {})
    const off = window.wa?.on('updater:status', (raw) => {
      const s = raw as UpdateStatus
      if (s.state === 'checking') setStatusText('Checking for updates…')
      else if (s.state === 'available') setStatusText(`Update found: v${s.version}`)
      else if (s.state === 'not-available') setStatusText('You are up to date')
      else if (s.state === 'downloading') setStatusText(`Downloading ${s.percent || 0}%`)
      else if (s.state === 'downloaded') setStatusText('Update ready — restart to apply')
      else if (s.state === 'error') setStatusText('Update check failed')
    })
    return () => { if (off) off() }
  }, [])

  const handleCheck = async () => {
    setChecking(true)
    setStatusText('Checking…')
    try { await window.wa?.updaterCheck?.() }
    catch (e) { setStatusText('Check failed') }
    finally { setTimeout(() => setChecking(false), 1500) }
  }

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-bg-tertiary/40 border border-border rounded-xl">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">Software Updates</p>
        <p className="text-xs text-text-muted mt-0.5">
          Current: v{version}{statusText && ` · ${statusText}`}
        </p>
      </div>
      <button
        onClick={handleCheck}
        disabled={checking}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 text-xs font-bold transition-colors disabled:opacity-60">
        <RotateCw size={13} className={checking ? 'animate-spin' : ''} />
        {checking ? 'Checking…' : 'Check for Updates'}
      </button>
    </div>
  )
}
