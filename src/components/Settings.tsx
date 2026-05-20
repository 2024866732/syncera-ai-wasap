import { useState, useEffect } from 'react'
import { useStore } from '../store'
import {
  X, User, Bell, Palette, Bot, Info, Save, Loader2,
  Moon, Sun, Monitor, LogOut, Shield, ChevronRight,
  CheckCircle2, AlertTriangle, Cloud, Download, Upload,
  RefreshCw, Trash2, ExternalLink, Link as LinkIcon, Languages,
} from 'lucide-react'
import type { DriveStatus, DriveBackup } from '../types'
import { LANG_META, applyLangAttr, useT } from '../i18n'
import type { Lang } from '../i18n'
import { CheckForUpdatesButton } from './UpdateBanner'

// Labels are i18n keys
const SECTIONS = [
  { id: 'profile',  icon: User,      labelKey: 'settings.profile' },
  { id: 'ai',       icon: Bot,       labelKey: 'settings.ai' },
  { id: 'backup',   icon: Cloud,     labelKey: 'settings.backup' },
  { id: 'language', icon: Languages, labelKey: 'settings.language' },
  { id: 'notify',   icon: Bell,      labelKey: 'settings.notifications' },
  { id: 'appear',   icon: Palette,   labelKey: 'settings.appearance' },
  { id: 'security', icon: Shield,    labelKey: 'settings.security' },
  { id: 'about',    icon: Info,      labelKey: 'settings.about' },
]

export default function Settings() {
  const store = useStore()
  const t = useT()
  const [section, setSection] = useState('profile')
  const [settings, setSettings] = useState<Record<string, string>>(store.appSettings)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    setSettings(store.appSettings)
  }, [store.appSettings])

  const set = (k: string, v: string) => setSettings(s => ({ ...s, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      await Promise.all(Object.entries(settings).map(([k, v]) => window.wa.setSetting(k, v)))
      store.setAppSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const handleLogout = async () => {
    if (confirm('Logout dari akaun WhatsApp ini?\n\nAuth lama akan dipadam. QR baru akan muncul untuk login akaun lain.')) {
      await window.wa.logout()
      store.setConnected(false)
      store.setQR(null)
      store.setShowSettings(false)  // close settings so user sees fresh QR
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-secondary border border-border rounded-2xl w-[760px] max-w-[95vw] h-[540px] flex overflow-hidden shadow-2xl animate-slide-in-up">

        {/* Sidebar nav */}
        <div className="w-52 bg-bg-primary border-r border-border flex flex-col py-4 flex-shrink-0">
          <div className="px-4 mb-4">
            <p className="text-sm font-bold text-text-primary">{t('settings.title')}</p>
          </div>
          <nav className="flex-1 space-y-0.5 px-2">
            {SECTIONS.map(({ id, icon: Icon, labelKey }) => (
              <button key={id} onClick={() => setSection(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  section === id
                    ? 'bg-bg-active text-text-primary'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}>
                <Icon size={15} />
                <span>{t(labelKey)}</span>
                {section === id && <ChevronRight size={12} className="ml-auto opacity-50" />}
              </button>
            ))}
          </nav>
          <div className="px-2 mt-auto">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-status-danger hover:bg-status-danger/10 transition-colors">
              <LogOut size={15} /> {t('settings.disconnect')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
            <h2 className="text-sm font-semibold text-text-primary">
              {(() => { const sec = SECTIONS.find(s => s.id === section); return sec ? t(sec.labelKey) : '' })()}
            </h2>
            <button onClick={() => store.setShowSettings(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {section === 'profile'  && <ProfileSection s={settings} set={set} user={store.waUser} />}
            {section === 'ai'       && <AISection      s={settings} set={set} backends={store.aiBackends} />}
            {section === 'backup'   && <BackupSection  s={settings} set={set} />}
            {section === 'language' && <LanguageSection s={settings} set={set} />}
            {section === 'notify'   && <NotifySection  s={settings} set={set} />}
            {section === 'appear'   && <AppearSection  s={settings} set={set} />}
            {section === 'security' && <SecuritySection />}
            {section === 'about'    && <AboutSection />}
          </div>

          {/* Save button */}
          {section !== 'about' && section !== 'security' && section !== 'backup' && section !== 'language' && (
            <div className="px-6 py-4 border-t border-border flex-shrink-0">
              <button onClick={save} disabled={saving}
                className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" />
                 : saved ? <CheckCircle2 size={14} />
                 : <Save size={14} />}
                {saved ? t('common.saved') : saving ? t('common.loading') : t('common.save')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Section components ────────────────────────────────────────────────────────

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        {desc && <p className="text-xs text-text-muted mt-0.5">{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-[31px] w-[51px] flex-shrink-0 cursor-pointer items-center rounded-full border border-black/5 transition-colors duration-300 ease-out focus:outline-none ${
        value
          ? 'bg-[#34C759] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]'
          : 'bg-[#39393D] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
      }`}>
      <span
        className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] ring-0 transition-transform duration-300 ease-out ${
          value ? 'translate-x-[22px]' : 'translate-x-[1px]'
        }`}
      />
    </button>
  )
}

function ProfileSection({ s, set, user }: { s: Record<string, string>; set: (k: string, v: string) => void; user: unknown }) {
  const t = useT()
  const u = user as { name?: string; id?: string } | null
  const displayName = (s['business_name'] || '').trim() || u?.name || 'Connected Account'
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-bg-tertiary rounded-xl border border-border">
        <div className="w-12 h-12 rounded-full bg-accent-green/10 flex items-center justify-center">
          <User size={20} className="text-accent-green" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
          <p className="text-xs text-text-muted">{u?.id || 'WhatsApp Web session'}</p>
        </div>
      </div>

      <Row label={t('profile.businessName')} desc={t('profile.businessNameDesc')}>
        <input value={s['business_name'] || ''} onChange={e => set('business_name', e.target.value)}
          placeholder={t('profile.businessNamePh')} className="field text-sm w-56" />
      </Row>
      <Row label={t('profile.currency')} desc={t('profile.currencyDesc')}>
        <input value={s['currency'] || 'RM'} onChange={e => set('currency', e.target.value)}
          placeholder="RM" className="field text-sm w-20 text-center" />
      </Row>

      {/* Business Profile - the AI's brain */}
      <div className="pt-3">
        <p className="text-sm font-semibold text-text-primary mb-1">{t('profile.businessProfile')}</p>
        <p className="text-xs text-text-muted mb-3">{t('profile.businessProfileDesc')}</p>
        <textarea value={s['business_profile'] || ''} onChange={e => set('business_profile', e.target.value)}
          placeholder={`Contoh:\n\nNama: Kedai Maju\nJenis: Online retail accessories phone\nLokasi: Shah Alam\nWaktu operasi: Isnin-Jumaat 9am-6pm\n\nProduk utama:\n- Casing iPhone (RM35-RM89)\n\nPolisi:\n- Free shipping order RM100+\n- Refund 7 hari kalau rosak`}
          rows={10} className="field text-sm w-full resize-none font-mono text-xs leading-relaxed" />
        <p className="text-xxs text-text-muted mt-2">{t('profile.businessProfileTip')}</p>
      </div>

      <div className="pt-3">
        <p className="text-sm font-semibold text-text-primary mb-1">{t('profile.persona')}</p>
        <p className="text-xs text-text-muted mb-2">{t('profile.personaDesc')}</p>
        <textarea value={s['ai_default_persona'] || ''} onChange={e => set('ai_default_persona', e.target.value)}
          placeholder="Anda adalah Aisha, sales staff Kedai Maju yang mesra…"
          rows={4} className="field text-sm w-full resize-none" />
      </div>
    </div>
  )
}

function AISection({ s, set, backends }: { s: Record<string, string>; set: (k: string, v: string) => void; backends: unknown[] }) {
  const t = useT()
  const b = backends as Array<{ id: string; name: string; models: string[] }>
  const selectedBackend = b.find(x => x.id === (s['ai_default_backend'] || b[0]?.id))
  return (
    <div className="space-y-1">
      <Row label={t('ai.autoEnable')} desc={t('ai.autoEnableDesc')}>
        <Toggle value={s['ai_auto_enable'] !== '0'} onChange={v => set('ai_auto_enable', v ? '1' : '0')} />
      </Row>
      <Row label={t('ai.groupsEnabled')} desc={t('ai.groupsEnabledDesc')}>
        <Toggle value={s['ai_groups_enabled'] === '1'} onChange={v => set('ai_groups_enabled', v ? '1' : '0')} />
      </Row>
      <Row label={t('ai.webEnabled')} desc={t('ai.webEnabledDesc')}>
        <Toggle value={s['ai_web_enabled'] !== '0'} onChange={v => set('ai_web_enabled', v ? '1' : '0')} />
      </Row>
      <Row label={t('ai.defaultBackend')} desc={`${b.length} ${t('ai.defaultBackendDesc')}`}>
        <select value={s['ai_default_backend'] || ''} onChange={e => set('ai_default_backend', e.target.value)}
          className="field text-sm w-40 appearance-none">
          <option value="">{t('ai.autoSelect')}</option>
          {b.map(backend => <option key={backend.id} value={backend.id}>{backend.name}</option>)}
        </select>
      </Row>
      <Row label={t('ai.defaultModel')} desc={selectedBackend ? `${selectedBackend.models.length} ${t('ai.defaultModelDesc')}` : t('ai.pickBackendFirst')}>
        <select value={s['ai_default_model'] || ''} onChange={e => set('ai_default_model', e.target.value)}
          className="field text-sm w-48 appearance-none" disabled={!selectedBackend}>
          <option value="">{t('ai.autoSelect')}</option>
          {selectedBackend?.models.map(m => <option key={m} value={`${selectedBackend.id}:${m}`}>{m}</option>)}
        </select>
      </Row>
      <Row label={t('ai.replyDelay')} desc={t('ai.replyDelayDesc')}>
        <div className="flex items-center gap-2">
          <input type="number" min="0" max="30" value={Math.round(parseInt(s['ai_reply_delay'] || '2500') / 1000)}
            onChange={e => set('ai_reply_delay', String(parseInt(e.target.value) * 1000))}
            className="field text-sm w-16 text-center" />
          <span className="text-xs text-text-muted">s</span>
        </div>
      </Row>

      <Row label="WA Send Delay (Anti-ban)" desc="Min delay between outgoing messages. Recommended 1200–2000ms.">
        <div className="flex items-center gap-2">
          <input type="number" min="250" max="6000" value={s['wa_send_delay_ms'] || '1200'}
            onChange={e => set('wa_send_delay_ms', e.target.value)}
            className="field text-sm w-20 text-center" />
          <span className="text-xs text-text-muted">ms</span>
        </div>
      </Row>
      <Row label={t('ai.maxLength')} desc={t('ai.maxLengthDesc')}>
        <input type="number" min="50" max="2000" value={s['ai_max_tokens'] || '600'}
          onChange={e => set('ai_max_tokens', e.target.value)}
          className="field text-sm w-20 text-center" />
      </Row>
      <Row label={t('ai.showBadge')} desc={t('ai.showBadgeDesc')}>
        <Toggle value={s['ai_show_badge'] !== '0'} onChange={v => set('ai_show_badge', v ? '1' : '0')} />
      </Row>
      <Row label={t('ai.showDisclaimer')} desc={t('ai.showDisclaimerDesc')}>
        <Toggle value={s['ai_show_disclaimer'] !== '0'} onChange={v => set('ai_show_disclaimer', v ? '1' : '0')} />
      </Row>

      {/* Disclaimer preview */}
      {s['ai_show_disclaimer'] !== '0' && (
        <div className="mt-3 p-3 bg-bg-tertiary/40 border border-border rounded-xl">
          <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted mb-2">Preview disclaimer (first contact only)</p>
          <div className="bg-accent-green/8 border-l-2 border-accent-green/40 pl-3 py-1.5">
            <p className="text-[11px] text-text-secondary italic leading-relaxed">
              📌 Nota: Mesej di atas dijawab oleh sistem AI kami untuk respon segera dan pengumpulan maklumat awal. Wakil sebenar akan menyusul untuk pengesahan dan bantuan lanjut. Terima kasih atas kesabaran anda. 🙏
            </p>
          </div>
          <p className="text-[10px] text-text-muted mt-2">↑ Dilampirkan SEKALI sahaja — pada mesej pertama setiap perbualan baru.</p>
        </div>
      )}

      {/* Tip box */}
      <div className="mt-5 p-3.5 bg-accent-green/5 border border-accent-green/20 rounded-xl">
        <p className="text-xs font-semibold text-accent-green mb-1">💡 Tip Sales</p>
        <p className="text-xxs text-text-secondary leading-relaxed">
          Untuk AI lagi pandai jual: pergi tab <strong>Profile</strong> dan isi <strong>Profil Perniagaan</strong> dengan detail (produk, harga, polisi, gaya cakap). Pergi tab <strong>Knowledge</strong> kat sebelah chat untuk tambah Q&A common.
        </p>
      </div>
    </div>
  )
}

function NotifySection({ s, set }: { s: Record<string, string>; set: (k: string, v: string) => void }) {
  const t = useT()
  return (
    <div className="space-y-1">
      <Row label={t('notify.desktop')} desc={t('notify.desktopDesc')}>
        <Toggle value={s['notify_desktop'] !== '0'} onChange={v => set('notify_desktop', v ? '1' : '0')} />
      </Row>
      <Row label={t('notify.sound')} desc={t('notify.soundDesc')}>
        <Toggle value={s['notify_sound'] !== '0'} onChange={v => set('notify_sound', v ? '1' : '0')} />
      </Row>
      <Row label={t('notify.preview')} desc={t('notify.previewDesc')}>
        <Toggle value={s['notify_preview'] !== '0'} onChange={v => set('notify_preview', v ? '1' : '0')} />
      </Row>
      <Row label={t('notify.aiError')} desc={t('notify.aiErrorDesc')}>
        <Toggle value={s['notify_ai_error'] !== '0'} onChange={v => set('notify_ai_error', v ? '1' : '0')} />
      </Row>
    </div>
  )
}

function AppearSection({ s, set }: { s: Record<string, string>; set: (k: string, v: string) => void }) {
  const t = useT()
  const themes = [
    { id: 'dark',   icon: Moon,    labelKey: 'theme.dark',   desc: '' },
    { id: 'light',  icon: Sun,     labelKey: 'theme.light',  desc: '' },
    { id: 'system', icon: Monitor, labelKey: 'theme.system', desc: '' },
  ]
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-text-primary mb-1">{t('theme.title')}</p>
        <p className="text-xs text-text-muted mb-3">{t('theme.desc')}</p>
        <div className="grid grid-cols-3 gap-2">
          {themes.map(({ id, icon: Icon, labelKey, desc }) => {
            const label = t(labelKey)
            return (
            <button key={id}
              onClick={() => {
                set('theme', id)
                // Live-apply immediately
                import('../hooks/useTheme').then(m => m.applyTheme(id as 'dark'|'light'|'system'))
                // Persist
                window.wa.setSetting('theme', id).catch(() => {})
                useStore.getState().updateSetting('theme', id)
              }}
              className={`flex flex-col items-center gap-2 py-4 px-3 rounded-2xl border-2 transition-all ${
                (s['theme'] || 'dark') === id
                  ? 'border-accent-green bg-accent-green/10 text-accent-green shadow-md shadow-accent-green/20'
                  : 'border-border bg-bg-tertiary/40 text-text-muted hover:border-border-light hover:bg-bg-hover'
              }`}>
              <Icon size={22} />
              <div className="text-center">
                <p className="text-xs font-bold">{label}</p>
                {desc && <p className="text-[10px] opacity-70 mt-0.5">{desc}</p>}
              </div>
            </button>
          )})}
        </div>
      </div>
      <Row label={t('theme.fontSize')} desc={t('theme.fontSizeDesc')}>
        <select value={s['font_size'] || '14'} onChange={e => set('font_size', e.target.value)}
          className="field text-sm w-28 appearance-none">
          {['12','13','14','15','16'].map(s => <option key={s} value={s}>{s}px</option>)}
        </select>
      </Row>
      <Row label="Message Bubbles" desc="Show timestamps on all bubbles">
        <Toggle value={s['show_timestamps'] === '1'} onChange={v => set('show_timestamps', v ? '1' : '0')} />
      </Row>
    </div>
  )
}

function BackupSection({ s, set }: { s: Record<string, string>; set: (k: string, v: string) => void }) {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [backups, setBackups] = useState<DriveBackup[]>([])
  const [connecting, setConnecting] = useState(false)
  const [backing, setBacking] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [showClientId, setShowClientId] = useState(false)
  const [clientIdInput, setClientIdInput] = useState('')

  const refresh = async () => {
    const st = await window.wa.driveStatus()
    setStatus(st)
    setClientIdInput('') // never display saved clientId for safety
    if (st.connected) {
      const r = await window.wa.driveListBackups()
      if (r.ok && r.files) setBackups(r.files)
    } else {
      setBackups([])
    }
  }

  useEffect(() => { refresh() }, [])

  const connect = async () => {
    if (!status?.hasClientId && !clientIdInput.trim()) {
      alert('Sila masukkan Google OAuth Client ID dulu (lihat panduan di bawah).')
      setShowClientId(true)
      return
    }
    setConnecting(true)
    try {
      const r = await window.wa.driveConnect(clientIdInput.trim() || undefined)
      if (r.ok) {
        await refresh()
      } else {
        alert(`Gagal connect: ${r.error}`)
      }
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setConnecting(false) }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect dari Google Drive? Backup tetap kekal di Drive, hanya akses sahaja akan dimatikan.')) return
    await window.wa.driveDisconnect()
    await refresh()
  }

  const backupNow = async () => {
    setBacking(true)
    try {
      const r = await window.wa.driveBackupNow()
      if (r.ok) {
        await refresh()
      } else {
        alert(`Backup gagal: ${r.error}`)
      }
    } finally { setBacking(false) }
  }

  const restore = async (id: string, name: string) => {
    if (!confirm(`Restore "${name}"?\n\nDB semasa akan disimpan sebagai .bak sebelum digantikan. App perlu di-restart selepas restore.`)) return
    setRestoring(id)
    try {
      const r = await window.wa.driveRestore(id)
      if (r.ok) {
        alert('Restore berjaya! Sila restart SYNCERA untuk apply changes.')
        await refresh()
      } else {
        alert(`Restore gagal: ${r.error}`)
      }
    } finally { setRestoring(null) }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Padam backup "${name}" dari Google Drive selamanya?`)) return
    const r = await window.wa.driveDelete(id)
    if (r.ok) await refresh()
    else alert(`Padam gagal: ${r.error}`)
  }

  const toggleAutoBackup = async () => {
    const next = status?.autoBackup ? '0' : '1'
    set('drive_auto_backup', next)
    await window.wa.setSetting('drive_auto_backup', next)
    await refresh()
  }

  const formatSize = (bytes: string | number) => {
    const b = typeof bytes === 'string' ? parseInt(bytes) : bytes
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b/1024).toFixed(0)} KB`
    return `${(b/1024/1024).toFixed(1)} MB`
  }

  if (!status) return <div className="py-8 text-center text-text-muted text-sm"><Loader2 className="inline animate-spin" size={14} /> Loading…</div>

  return (
    <div className="space-y-5">
      {/* Header card — connection state */}
      <div className={`rounded-2xl p-5 border ${status.connected
        ? 'bg-accent-green/5 border-accent-green/30'
        : 'bg-bg-tertiary border-border'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${status.connected ? 'bg-accent-green/20' : 'bg-bg-hover'}`}>
            <Cloud size={22} className={status.connected ? 'text-accent-green' : 'text-text-muted'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">
              {status.connected ? 'Google Drive Connected' : 'Google Drive — Disconnected'}
            </p>
            {status.connected ? (
              <>
                <p className="text-xs text-text-secondary mt-0.5 truncate">{status.email}</p>
                {status.lastBackup && (
                  <p className="text-xxs text-text-muted mt-1">
                    Last backup: {new Date(status.lastBackup).toLocaleString('ms-MY')}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-text-muted mt-0.5">Backup SYNCERA database (chats, contacts, KB, orders) ke Drive untuk sync antara device</p>
            )}
          </div>
          {status.connected ? (
            <button onClick={disconnect} className="text-xxs px-3 py-1.5 rounded-lg bg-status-danger/10 text-status-danger hover:bg-status-danger/20">
              Disconnect
            </button>
          ) : (
            <button onClick={connect} disabled={connecting}
              className="text-xs px-4 py-2 rounded-lg bg-accent-green text-bg-primary font-semibold hover:bg-green-400 disabled:opacity-50 flex items-center gap-2">
              {connecting ? <Loader2 size={13} className="animate-spin" /> : <LinkIcon size={13} />}
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* If not connected: show client ID setup */}
      {!status.connected && (
        <div className="bg-bg-tertiary/50 border border-border rounded-xl p-4 space-y-3">
          <button onClick={() => setShowClientId(v => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold text-text-primary hover:text-accent-blue">
            <span>🔑 Setup Google OAuth Client ID {status.hasClientId ? '(saved)' : '(required)'}</span>
            <ChevronRight size={14} className={`transition-transform ${showClientId ? 'rotate-90' : ''}`} />
          </button>
          {showClientId && (
            <div className="space-y-3 text-xs">
              <div className="bg-bg-secondary border border-border rounded-lg p-3 space-y-2">
                <p className="font-semibold text-text-primary">Setup sekali sahaja (5 minit):</p>
                <ol className="space-y-1.5 text-text-secondary list-decimal pl-4">
                  <li>Pergi <a className="text-accent-blue hover:underline inline-flex items-center gap-0.5"
                    href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console <ExternalLink size={10} /></a>, buat project baru (nama: SYNCERA)</li>
                  <li>Enable <a className="text-accent-blue hover:underline inline-flex items-center gap-0.5"
                    href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Drive API <ExternalLink size={10} /></a></li>
                  <li>Pergi <strong>APIs & Services → OAuth consent screen</strong>, pilih <strong>External</strong>, isi nama app & email, save</li>
                  <li>Pergi <strong>APIs & Services → Credentials → Create credentials → OAuth client ID</strong></li>
                  <li>Application type: <strong>Desktop app</strong>, name: SYNCERA, click Create</li>
                  <li>Copy <strong>Client ID</strong> (format: <code className="bg-bg-hover px-1 rounded text-[10px]">xxxxxx.apps.googleusercontent.com</code>) dan paste di bawah</li>
                </ol>
              </div>
              <input
                value={clientIdInput}
                onChange={e => setClientIdInput(e.target.value)}
                placeholder={status.hasClientId ? 'Client ID dah disimpan — kosongkan untuk guna yang ada' : 'xxxxxx.apps.googleusercontent.com'}
                className="field text-sm w-full font-mono text-xs" />
              {clientIdInput.trim() && (
                <button onClick={async () => {
                  await window.wa.driveSetClientId(clientIdInput.trim())
                  await refresh()
                  alert('Client ID disimpan. Sekarang klik "Connect".')
                }} className="text-xxs px-3 py-1.5 rounded-lg bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 font-semibold">
                  Save Client ID
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* If connected: show actions + backup list */}
      {status.connected && (
        <>
          <Row label="Auto-backup harian"
               desc="Sistem akan upload backup baru setiap 24 jam secara automatik">
            <Toggle value={status.autoBackup} onChange={toggleAutoBackup} />
          </Row>

          <div className="flex gap-2">
            <button onClick={backupNow} disabled={backing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-green text-bg-primary text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-all">
              {backing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {backing ? 'Uploading…' : 'Backup Sekarang'}
            </button>
            <button onClick={refresh}
              className="px-3 py-2.5 rounded-xl bg-bg-tertiary border border-border text-text-secondary hover:bg-bg-hover">
              <RefreshCw size={14} />
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center justify-between">
              <span>Backups di Google Drive</span>
              <span className="text-text-muted">{backups.length} file</span>
            </p>
            {backups.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-muted bg-bg-tertiary/30 rounded-xl border border-border">
                <Cloud size={28} className="mx-auto mb-2 opacity-30" />
                Belum ada backup. Klik "Backup Sekarang" untuk mula.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {backups.map(b => (
                  <div key={b.id} className="flex items-center gap-3 p-3 bg-bg-tertiary/40 border border-border rounded-lg hover:bg-bg-hover transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
                      <Cloud size={15} className="text-accent-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{b.name}</p>
                      <p className="text-xxs text-text-muted">
                        {new Date(b.modifiedTime).toLocaleString('ms-MY')} · {formatSize(b.size)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => restore(b.id, b.name)} disabled={!!restoring}
                        title="Restore this backup"
                        className="w-8 h-8 rounded-lg bg-accent-green/10 hover:bg-accent-green/20 text-accent-green flex items-center justify-center transition-colors disabled:opacity-30">
                        {restoring === b.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      </button>
                      <button onClick={() => del(b.id, b.name)}
                        title="Delete from Drive"
                        className="w-8 h-8 rounded-lg bg-status-danger/10 hover:bg-status-danger/20 text-status-danger flex items-center justify-center transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 bg-status-info/5 border border-status-info/20 rounded-lg text-xxs text-text-secondary">
            <Info size={13} className="text-accent-blue flex-shrink-0 mt-0.5" />
            <p>Backup termasuk <strong>semua chats, contacts, AI memory, orders, knowledge base, templates</strong>. Hanya app SYNCERA boleh baca backup ini (private folder di Drive).</p>
          </div>
        </>
      )}
    </div>
  )
}

function LanguageSection({ s, set }: { s: Record<string, string>; set: (k: string, v: string) => void }) {
  const [applied, setApplied] = useState<Lang | null>(null)
  const stored = (s['app_language'] || 'ms') as Lang
  const current: keyof typeof LANG_META = (stored === 'en' || stored === 'ms') ? stored : 'ms'

  const choose = async (lang: Lang) => {
    set('app_language', lang)
    applyLangAttr(lang)
    useStore.getState().updateSetting('app_language', lang)
    try { await window.wa.setSetting('app_language', lang) } catch {}
    setApplied(lang)
    setTimeout(() => setApplied(null), 1500)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-bold text-text-primary">🌐 Pilih Bahasa Aplikasi</p>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Tukar bahasa antara muka aplikasi sahaja. Perbualan customer & balasan AI <strong>tidak terjejas</strong> — AI tetap balas dalam bahasa customer.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(LANG_META) as Array<keyof typeof LANG_META>).map(code => {
          const meta = LANG_META[code]
          const isActive = current === code
          return (
            <button key={code} onClick={() => choose(code)}
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                isActive
                  ? 'border-accent-green bg-accent-green/10 shadow-md shadow-accent-green/15'
                  : 'border-border bg-bg-tertiary/40 hover:border-accent-green/40 hover:bg-bg-hover'
              }`}>
              <span className="text-3xl flex-shrink-0">{meta.flag}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${isActive ? 'text-accent-green' : 'text-text-primary'}`}>
                  {meta.native}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">{meta.label}</p>
              </div>
              {isActive && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-green/20 border border-accent-green/40">
                  <CheckCircle2 size={11} className="text-accent-green" />
                  <span className="text-[10px] font-bold text-accent-green uppercase tracking-wider">Aktif</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {applied && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-accent-green/10 border border-accent-green/30 animate-fade-in">
          <CheckCircle2 size={14} className="text-accent-green" />
          <p className="text-xs font-semibold text-accent-green">
            Bahasa diaplikasi! ({LANG_META[applied as keyof typeof LANG_META]?.native || applied})
          </p>
        </div>
      )}

      <div className="p-3 bg-accent-blue/5 border border-accent-blue/20 rounded-xl">
        <p className="text-[11px] text-text-secondary leading-relaxed">
          💡 <strong>Tip:</strong> Pilihan ini disimpan automatik. Antara muka akan terus translate apabila anda tukar tanpa perlu restart.
          AI auto-reply <strong>kepada customer</strong> akan ikut bahasa yang customer guna, bukan bahasa app ini.
        </p>
      </div>
    </div>
  )
}

function SecuritySection() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-status-success/5 border border-status-success/20 rounded-xl">
        <CheckCircle2 size={18} className="text-status-success flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-text-primary">Local-Only Storage</p>
          <p className="text-xs text-text-muted mt-1">All messages and contacts are stored locally on your PC only. Nothing is sent to external servers.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 p-4 bg-status-info/5 border border-status-info/20 rounded-xl">
        <Shield size={18} className="text-accent-blue flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-text-primary">WhatsApp End-to-End Encryption</p>
          <p className="text-xs text-text-muted mt-1">Messages are protected by WhatsApp's own E2E encryption. SYNCERA only reads messages on your device.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 p-4 bg-status-warning/5 border border-status-warning/20 rounded-xl">
        <AlertTriangle size={18} className="text-status-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-text-primary">Unofficial WhatsApp Client</p>
          <p className="text-xs text-text-muted mt-1">This app uses the WhatsApp Web protocol. Use responsibly and be aware of WhatsApp's Terms of Service.</p>
        </div>
      </div>
    </div>
  )
}

function AboutSection() {
  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div className="relative w-20 h-20 mx-auto mb-3">
          <div className="absolute inset-0 rounded-3xl bg-accent-green/30 blur-xl" />
          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-green via-emerald-500 to-emerald-700 flex items-center justify-center shadow-2xl shadow-accent-green/40 ring-1 ring-white/10">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
        </div>
        <h3 className="text-2xl font-bold text-text-primary tracking-tight">SYNCERA</h3>
        <p className="text-xs text-text-muted font-semibold tracking-[0.2em] uppercase mt-1">AI Messenger · Business OS</p>
        <p className="text-xxs text-text-muted mt-3">Version 1.0.0</p>
      </div>

      {/* Auto-Update — check button + status */}
      <CheckForUpdatesButton />

      {[
        { label: 'Framework',    value: 'Electron 31 + React 18' },
        { label: 'WA Protocol', value: '@whiskeysockets/baileys' },
        { label: 'Database',    value: 'SQLite (better-sqlite3)' },
        { label: 'AI',          value: 'Ollama / LM Studio / Jan' },
        { label: 'Platform',    value: 'Windows 11' },
      ].map(({ label, value }) => (
        <div key={label} className="flex justify-between py-2 border-b border-border/50 last:border-0">
          <span className="text-sm text-text-muted">{label}</span>
          <span className="text-sm text-text-primary font-medium font-mono">{value}</span>
        </div>
      ))}

      {/* Credits — Developer / Company */}
      <div className="mt-6 rounded-2xl border border-accent-green/25 bg-gradient-to-br from-accent-green/8 via-bg-tertiary/40 to-transparent overflow-hidden">
        <div className="px-5 py-3 border-b border-accent-green/15 bg-accent-green/5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent-green">Credits</span>
          <span className="text-[10px] text-text-muted font-mono">© {new Date().getFullYear()}</span>
        </div>

        <div className="p-5 space-y-4">
          {/* Developer */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-green to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-accent-green/30 ring-1 ring-white/10">
              <span className="text-base font-black text-white">N</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Developed by</p>
              <p className="text-sm font-bold text-text-primary mt-0.5">Nazrin Zainal</p>
              <p className="text-xs text-text-muted">Lead Engineer · Full-Stack Architect</p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* Company */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/30 ring-1 ring-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">A Product of</p>
              <p className="text-sm font-bold text-text-primary mt-0.5">Darksea Network Sdn Bhd</p>
              <p className="text-xs text-text-muted">Software Studio · Kuala Lumpur, Malaysia</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border/40">
            <p className="text-[10px] text-text-muted leading-relaxed text-center">
              Crafted with precision in Malaysia.<br />
              All rights reserved · Darksea Network Sdn Bhd
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
