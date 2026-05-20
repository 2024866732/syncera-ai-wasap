import { useEffect, useState } from 'react'
import { Package, Play, FolderOpen, Loader2, CheckCircle2, AlertCircle, X, Shield, Rocket, Crown, FlaskConical } from 'lucide-react'

interface BuildStatus {
  state: 'idle' | 'starting' | 'vite-build' | 'electron-build' | 'progress' | 'done' | 'error' | 'warning'
  installer?: string
  path?: string
  sizeMB?: string
  message?: string
  line?: string
  plan?: PlanId
  planName?: string
}

type PlanId = 'demo' | 'basic' | 'pro' | 'pro_max'

const PLANS: Array<{
  id: PlanId
  name: string
  icon: typeof Shield
  color: string
  desc: string
  features: string[]
}> = [
  {
    id: 'demo',
    name: 'Demo',
    icon: FlaskConical,
    color: '#f59e0b',
    desc: 'Untuk customer cuba app sebelum upgrade.',
    features: ['Inbox + sync chat', 'AI reply basic', 'AI Knowledge', 'Quick Send single', 'Calendar basic', 'Templates'],
  },
  {
    id: 'basic',
    name: 'Basic',
    icon: Shield,
    color: '#58A6FF',
    desc: 'Untuk kedai kecil yang nak AI reply asas.',
    features: ['Inbox + sync chat', 'AI reply basic', 'AI Knowledge', 'Quick Send single', 'Calendar basic', 'Templates'],
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Rocket,
    color: '#22c55e',
    desc: 'Untuk bisnes service yang aktif handle customer.',
    features: ['Semua Basic', 'Broadcast + bulk', 'Status WA', 'Reports PDF', 'Analytics', 'Orders + reminders', 'Drive backup'],
  },
  {
    id: 'pro_max',
    name: 'Pro Max',
    icon: Crown,
    color: '#d946ef',
    desc: 'Untuk owner/reseller dengan full toolkit.',
    features: ['Semua Pro', 'Installer Generator', 'Bundle Ollama', 'Customer package', 'Advanced AI tools', 'Finance import'],
  },
]

export default function InstallerBuilder({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<BuildStatus>({ state: 'idle' })
  const [bundleOllama, setBundleOllama] = useState(true)
  const [plan, setPlan] = useState<PlanId>('demo')
  const [logs, setLogs] = useState<string[]>([])
  const isRunning = ['starting', 'vite-build', 'electron-build', 'progress'].includes(status.state)

  useEffect(() => {
    setBundleOllama(plan === 'pro_max')
  }, [plan])

  useEffect(() => {
    window.wa?.genStatus?.().then((s) => { if (s) setStatus(s as BuildStatus) }).catch(() => {})
    const off = window.wa?.on('generator:status', (raw) => {
      const s = raw as BuildStatus
      setStatus(s)
      if (s.line) setLogs(prev => [...prev.slice(-30), s.line!])
    })
    return () => { if (off) off() }
  }, [])

  const handleBuild = async () => {
    setLogs([])
    await window.wa?.genBuild?.({ bundleOllama: plan === 'pro_max' && bundleOllama, plan })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
      <div className="bg-bg-secondary rounded-2xl border border-border shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-accent-green/10 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-green to-emerald-600 flex items-center justify-center shadow-md shadow-accent-green/30">
              <Package size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">SYNCERA Installer Generator</h2>
              <p className="text-xs text-text-muted">Build latest app installer by package plan</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-hover flex items-center justify-center text-text-muted">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* Options */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Package Plan</p>
            <div className="grid grid-cols-4 gap-3">
              {PLANS.map(({ id, name, icon: Icon, color, desc, features }) => {
                const active = plan === id
                return (
                  <button
                    key={id}
                    onClick={() => setPlan(id)}
                    disabled={isRunning}
                    className={`text-left rounded-xl border p-3 transition-all ${
                      active ? 'bg-bg-active border-accent-green shadow-lg shadow-black/10' : 'bg-bg-tertiary border-border hover:border-accent-blue/40'
                    }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, color }}>
                        <Icon size={15} />
                      </div>
                      <p className="text-sm font-black text-text-primary">{name}</p>
                    </div>
                    <p className="text-[11px] text-text-muted leading-relaxed min-h-[34px]">{desc}</p>
                    <div className="mt-3 space-y-1">
                      {features.slice(0, 4).map(f => (
                        <p key={f} className="text-[10px] text-text-secondary truncate">• {f}</p>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Build Options</p>
            <label className={`flex items-start gap-3 p-3 bg-bg-tertiary border border-border rounded-xl transition-colors ${
              plan === 'pro_max' ? 'cursor-pointer hover:border-accent-green/40' : 'cursor-not-allowed opacity-70'
            }`}>
              <input type="checkbox" checked={bundleOllama} onChange={e => setBundleOllama(e.target.checked)}
                className="mt-1 accent-accent-green" disabled={isRunning || plan !== 'pro_max'} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-text-primary">Bundle Ollama installer</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Pro Max sahaja: include OllamaSetup.exe supaya customer dapat AI engine ready. Drop file di <code className="bg-bg-active px-1 py-0.5 rounded text-accent-blue">build/extras/OllamaSetup.exe</code> sebelum build.
                </p>
              </div>
            </label>
          </div>

          {/* Action */}
          {!isRunning && status.state !== 'done' && (
            <button onClick={handleBuild}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-accent-green to-emerald-600 text-bg-primary font-bold text-sm shadow-lg shadow-accent-green/25 hover:shadow-accent-green/40 transition-all">
              <Play size={15} />
              Generate {PLANS.find(p => p.id === plan)?.name} Fresh Installer
            </button>
          )}

          {/* Progress */}
          {isRunning && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-accent-blue/10 border border-accent-blue/30 rounded-xl">
                <Loader2 size={18} className="text-accent-blue animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-accent-blue">
                    {status.state === 'starting' && 'Initializing build…'}
                    {status.state === 'vite-build' && 'Building UI (Vite)…'}
                    {status.state === 'electron-build' && 'Packaging installer (Electron)…'}
                    {status.state === 'progress' && 'Working…'}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{status.planName || PLANS.find(p => p.id === plan)?.name} package · latest source build · this may take 2-5 minutes.</p>
                </div>
              </div>

              {/* Live log */}
              {logs.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-bg-primary/60 border border-border rounded-xl p-3 font-mono text-[10px] text-text-muted leading-relaxed">
                  {logs.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {status.state === 'done' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-accent-green/10 border border-accent-green/30 rounded-xl">
                <CheckCircle2 size={20} className="text-accent-green flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-accent-green">Installer Generated!</p>
                  <p className="text-xs text-text-secondary mt-0.5 truncate" title={status.path}>{status.planName ? `${status.planName} · ` : ''}{status.installer}</p>
                  <p className="text-xs text-text-muted">Size: {status.sizeMB} MB</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.wa?.genReveal?.()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 text-xs font-bold transition-colors">
                  <FolderOpen size={13} /> Show in Folder
                </button>
                <button onClick={() => setStatus({ state: 'idle' })}
                  className="px-4 py-2.5 rounded-lg bg-bg-hover text-text-secondary hover:bg-bg-active text-xs font-medium">
                  Build Another
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {status.state === 'error' && (
            <div className="flex items-start gap-3 p-4 bg-status-danger/10 border border-status-danger/30 rounded-xl">
              <AlertCircle size={20} className="text-status-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-status-danger">Build Failed</p>
                <p className="text-xs text-text-secondary mt-0.5">{status.message}</p>
              </div>
              <button onClick={() => setStatus({ state: 'idle' })}
                className="text-xs text-text-muted hover:text-text-primary">Reset</button>
            </div>
          )}

          {/* Tip */}
          <div className="text-[11px] text-text-muted leading-relaxed p-3 bg-bg-tertiary/40 border border-border/40 rounded-xl">
            💡 <strong>Tip:</strong> Generator always runs Vite + Electron Builder from the current source first, so the installer uses the latest SYNCERA update. Customer build is empty: no WhatsApp auth, no owner database, no chat history.
          </div>
        </div>
      </div>
    </div>
  )
}
