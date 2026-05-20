import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { ReportStats } from '../types'
import {
  FileText, Calendar, Building2, Image as ImageIcon, Download,
  Loader2, RefreshCw, X, CheckCircle2, Eye, Sparkles, TrendingUp,
} from 'lucide-react'
import { useT } from '../i18n'

const PRESET_DEFS = [
  { id: 'today',     labelKey: 'reports.today',     days: 0 },
  { id: 'yesterday', labelKey: 'reports.yesterday', days: 1 },
  { id: 'week',      labelKey: 'reports.week',      days: 7 },
  { id: 'month',     labelKey: 'reports.month',     days: 30 },
  { id: 'quarter',   labelKey: 'reports.quarter',   days: 90 },
  { id: 'custom',    labelKey: 'reports.custom',    days: -1 },
]
const PRESETS = PRESET_DEFS  // alias for compat with rest of file

interface CompanyProfile {
  name: string
  logo: string  // base64 data URL
  address: string
  phone: string
  email: string
}

export default function Reports() {
  const t = useT()
  const store = useStore()
  const [preset, setPreset] = useState('week')
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 7*86400000).toISOString().slice(0, 10))
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [savedPath, setSavedPath] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Company profile — persisted in localStorage so user can switch between companies
  const [companies, setCompanies] = useState<CompanyProfile[]>(() => {
    try { return JSON.parse(localStorage.getItem('syncera_report_companies') || '[]') } catch { return [] }
  })
  const [activeCompany, setActiveCompany] = useState<CompanyProfile>(() => {
    try {
      const saved = localStorage.getItem('syncera_report_active_company')
      if (saved) return JSON.parse(saved)
    } catch {}
    return {
      name: store.appSettings['business_name'] || 'SYNCERA Business',
      logo: '',
      address: '',
      phone: '',
      email: '',
    }
  })
  const logoInputRef = useRef<HTMLInputElement>(null)

  const saveActiveCompany = (c: CompanyProfile) => {
    setActiveCompany(c)
    try { localStorage.setItem('syncera_report_active_company', JSON.stringify(c)) } catch {}
  }
  const saveCompaniesList = (list: CompanyProfile[]) => {
    setCompanies(list)
    try { localStorage.setItem('syncera_report_companies', JSON.stringify(list)) } catch {}
  }

  const getDateRange = (): { from: string; to: string } => {
    if (preset === 'custom') return { from: customFrom, to: customTo }
    const p = PRESETS.find(x => x.id === preset)
    const today = new Date()
    const from = new Date(today.getTime() - (p?.days || 0) * 86400000)
    if (preset === 'today') return { from: today.toISOString().slice(0,10), to: today.toISOString().slice(0,10) }
    if (preset === 'yesterday') {
      const y = new Date(today.getTime() - 86400000)
      return { from: y.toISOString().slice(0,10), to: y.toISOString().slice(0,10) }
    }
    return { from: from.toISOString().slice(0,10), to: today.toISOString().slice(0,10) }
  }

  const loadStats = async () => {
    setLoading(true)
    try {
      const range = getDateRange()
      const s = await window.wa.getReportStats({ startDate: range.from, endDate: range.to })
      setStats(s)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadStats() }, [preset, customFrom, customTo])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Saiz logo maksimum 2MB'); return }
    const reader = new FileReader()
    reader.onload = () => saveActiveCompany({ ...activeCompany, logo: reader.result as string })
    reader.readAsDataURL(file)
  }

  const saveCurrentAsCompany = () => {
    if (!activeCompany.name.trim()) { alert('Isi nama syarikat dulu'); return }
    const existing = companies.findIndex(c => c.name.toLowerCase() === activeCompany.name.toLowerCase())
    let newList: CompanyProfile[]
    if (existing >= 0) {
      newList = [...companies]
      newList[existing] = activeCompany
    } else {
      newList = [...companies, activeCompany]
    }
    saveCompaniesList(newList)
    alert(`Profil "${activeCompany.name}" disimpan ✓`)
  }

  const generatePDF = async () => {
    if (!stats) { alert('Stats belum siap'); return }
    setGenerating(true); setSavedPath('')
    try {
      const html = buildReportHTML(stats, activeCompany)
      const fileName = `report-${activeCompany.name.replace(/[^a-zA-Z0-9]/g,'_')}-${stats.range.from}-to-${stats.range.to}.pdf`
      const r = await window.wa.saveReportPDF({ html, defaultFileName: fileName })
      if (r.ok) {
        setSavedPath(r.path || '')
      } else if (!r.canceled) {
        alert('Gagal generate PDF: ' + (r.error || 'unknown'))
      }
    } finally { setGenerating(false) }
  }

  return (
    <div className="h-full overflow-hidden flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-blue to-cyan-600 flex items-center justify-center shadow-md shadow-accent-blue/30">
            <FileText size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-text-primary">{t('reports.title')}</h1>
            <p className="text-xs text-text-muted">{t('reports.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-[420px_1fr] gap-0">
        {/* LEFT: configuration */}
        <div className="border-r border-border/60 overflow-y-auto p-5 space-y-5">

          {/* Company profile */}
          <section className="bg-bg-tertiary/40 border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={12} className="text-accent-green" /> {t('reports.companyProfile')}
              </p>
              <button onClick={saveCurrentAsCompany}
                className="text-[10px] px-2 py-1 rounded-lg bg-accent-green/10 text-accent-green hover:bg-accent-green/20 font-semibold">
                {t('reports.save')}
              </button>
            </div>

            {/* Saved companies list */}
            {companies.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-text-muted uppercase mb-1.5">{t('reports.switchCompany')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {companies.map(c => (
                    <button key={c.name}
                      onClick={() => saveActiveCompany(c)}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                        activeCompany.name === c.name
                          ? 'bg-accent-green/15 text-accent-green border-accent-green/40'
                          : 'bg-bg-secondary text-text-secondary border-border hover:border-accent-green/30'
                      }`}>
                      {c.name}
                      <button onClick={(e) => { e.stopPropagation(); saveCompaniesList(companies.filter(x => x.name !== c.name)) }}
                        className="ml-1.5 text-text-muted hover:text-status-danger">×</button>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <input value={activeCompany.name}
                onChange={e => saveActiveCompany({ ...activeCompany, name: e.target.value })}
                placeholder={t('reports.companyNamePh')}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60" />
              <input value={activeCompany.address}
                onChange={e => saveActiveCompany({ ...activeCompany, address: e.target.value })}
                placeholder={t('reports.addressPh')}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60" />
              <div className="grid grid-cols-2 gap-2">
                <input value={activeCompany.phone}
                  onChange={e => saveActiveCompany({ ...activeCompany, phone: e.target.value })}
                  placeholder={t('common.phone')}
                  className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60" />
                <input value={activeCompany.email}
                  onChange={e => saveActiveCompany({ ...activeCompany, email: e.target.value })}
                  placeholder={t('common.email')}
                  className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-green/60" />
              </div>

              {/* Logo */}
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <div className="flex items-center gap-3 mt-2">
                {activeCompany.logo ? (
                  <img src={activeCompany.logo} alt="logo" className="w-14 h-14 rounded-lg object-contain bg-white p-1 border border-border" />
                ) : (
                  <div className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-text-muted">
                    <ImageIcon size={20} />
                  </div>
                )}
                <div className="flex-1 flex flex-col gap-1.5">
                  <button onClick={() => logoInputRef.current?.click()}
                    className="text-xs px-3 py-2 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 flex items-center gap-1.5 transition-colors">
                    <ImageIcon size={12} /> {activeCompany.logo ? t('reports.changeLogo') : t('reports.uploadLogo')}
                  </button>
                  {activeCompany.logo && (
                    <button onClick={() => saveActiveCompany({ ...activeCompany, logo: '' })}
                      className="text-[10px] text-status-danger hover:underline text-left">{t('reports.removeLogo')}</button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Date range */}
          <section className="bg-bg-tertiary/40 border border-border rounded-2xl p-4">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Calendar size={12} className="text-accent-purple" /> {t('reports.dateRange')}
            </p>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => setPreset(p.id)}
                  className={`text-[11px] px-2 py-2 rounded-lg font-semibold transition-all ${
                    preset === p.id
                      ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/40'
                      : 'bg-bg-secondary text-text-secondary border border-border hover:border-accent-purple/30'
                  }`}>
                  {t(p.labelKey)}
                </button>
              ))}
            </div>

            {preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('reports.from')}</label>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-purple/60" />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('reports.to')}</label>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-purple/60" />
                </div>
              </div>
            )}

            {stats && (
              <p className="text-[10px] text-text-muted mt-2">
                📅 {stats.range.from} → {stats.range.to} · <strong className="text-accent-green">{stats.summary.totalMessages}</strong> mesej
              </p>
            )}
          </section>

          {/* Actions */}
          <section className="space-y-2">
            <button onClick={() => setShowPreview(true)} disabled={!stats}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-bg-tertiary border border-border text-text-primary hover:bg-bg-hover transition-colors text-sm font-bold disabled:opacity-40">
              <Eye size={14} /> {t('reports.previewReport')}
            </button>
            <button onClick={generatePDF} disabled={!stats || generating || !activeCompany.name.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-accent-blue to-cyan-600 text-white shadow-lg shadow-accent-blue/25 hover:shadow-accent-blue/40 transition-all text-sm font-bold disabled:opacity-40 disabled:from-bg-hover disabled:to-bg-hover disabled:shadow-none disabled:text-text-muted">
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {generating ? t('reports.generating') : t('reports.generatePDF')}
            </button>
            {savedPath && (
              <div className="p-2.5 bg-accent-green/10 border border-accent-green/30 rounded-lg flex items-start gap-2">
                <CheckCircle2 size={14} className="text-accent-green flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-accent-green">{t('reports.saved')}</p>
                  <p className="text-[10px] text-text-secondary truncate" title={savedPath}>{savedPath}</p>
                </div>
              </div>
            )}
          </section>

        </div>

        {/* RIGHT: live stats preview */}
        <div className="overflow-y-auto p-5">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-text-muted" />
            </div>
          ) : !stats ? (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              Pilih julat tarikh untuk mula
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-text-muted">{t('reports.previewLive')}</p>
                  <p className="text-lg font-bold text-text-primary">{activeCompany.name || 'Untitled Company'}</p>
                </div>
                <button onClick={loadStats}
                  className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-secondary">
                  <RefreshCw size={11} /> {t('common.refresh')}
                </button>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <KPI label={t('reports.totalMsg')} value={stats.summary.totalMessages} color="#58A6FF" />
                <KPI label={t('reports.newCustomers')} value={stats.summary.newCustomers} color="#3FB950" />
                <KPI label={t('reports.returningCustomers')} value={stats.summary.returningCustomers} color="#BC8CFF" />
                <KPI label={t('reports.aiReplyRate')} value={`${stats.summary.aiRate}%`} color="#F78166" />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <KPI label={t('reports.msgReceived')} value={stats.summary.messagesIn} color="#58A6FF" sub={t('reports.fromCustomer')} />
                <KPI label={t('reports.msgSent')} value={stats.summary.messagesOut} color="#3FB950" sub={`${stats.summary.manualReplies} ${t('reports.manual')} · ${stats.summary.aiReplies} AI`} />
                <KPI label={t('reports.activeChats')} value={stats.summary.activeConversations} color="#BC8CFF" sub={t('inbox.conversations')} />
                <KPI label={t('reports.avgResponse')} value={`${stats.summary.avgResponseMinutes}m`} color="#D29922" sub={t('reports.avgResponseDesc')} />
              </div>

              {/* Top contacts */}
              {stats.topContacts.length > 0 && (
                <section className="bg-bg-tertiary/40 border border-border rounded-xl p-4 mb-3">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingUp size={11} className="text-accent-orange" /> {t('reports.top5')}
                  </p>
                  <div className="space-y-1">
                    {stats.topContacts.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                        <span className="text-xs font-bold w-5 text-text-muted">{i+1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-text-primary truncate">{c.name || c.phone}</p>
                          <p className="text-[10px] text-text-muted">{c.phone}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-accent-blue">{c.msg_count}</p>
                          <p className="text-[10px] text-text-muted">{t('reports.msgsCount')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Daily chart */}
              {stats.daily.length > 0 && (
                <section className="bg-bg-tertiary/40 border border-border rounded-xl p-4 mb-3">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">{t('reports.dailyTrend')}</p>
                  <DailyChart data={stats.daily} />
                </section>
              )}

              <div className="p-3 bg-accent-blue/5 border border-accent-blue/20 rounded-xl flex items-start gap-2">
                <Sparkles size={13} className="text-accent-blue flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-text-secondary leading-relaxed">{t('reports.tip')}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {showPreview && stats && (
        <PreviewModal html={buildReportHTML(stats, activeCompany)} onClose={() => setShowPreview(false)} />
      )}
    </div>
  )
}

function KPI({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div className="bg-bg-tertiary/40 border border-border rounded-xl p-3">
      <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function DailyChart({ data }: { data: ReportStats['daily'] }) {
  const max = Math.max(...data.map(d => (d.in_count || 0) + (d.out_count || 0)), 1)
  return (
    <div className="flex items-end gap-1 h-28">
      {data.map((d, i) => {
        const total = (d.in_count || 0) + (d.out_count || 0)
        const h = Math.max(2, (total / max) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full bg-gradient-to-t from-accent-blue/40 to-accent-blue/80 rounded-t-sm transition-all"
              style={{ height: `${h}%` }} title={`${d.d}: ${total} mesej`} />
            <span className="text-[8px] text-text-muted">{d.d.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b bg-bg-secondary">
          <p className="text-sm font-bold text-text-primary">Preview Report (sebenar PDF akan kelihatan sama)</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-hover flex items-center justify-center text-text-secondary"><X size={16} /></button>
        </div>
        <iframe srcDoc={html} className="flex-1 w-full bg-white" title="Report preview" />
      </div>
    </div>
  )
}

// ─── HTML Report Template ──────────────────────────────────────────────────
function buildReportHTML(stats: ReportStats, company: CompanyProfile): string {
  const labelText: Record<string, string> = {
    none: 'No Label', new_lead: 'New Lead', customer: 'Customer',
    vip: 'VIP', support: 'Support', closed: 'Closed',
  }
  const labelColor: Record<string, string> = {
    none: '#6E7681', new_lead: '#58A6FF', customer: '#3FB950',
    vip: '#D29922', support: '#F78166', closed: '#94A3B8',
  }

  const dateRangeLabel = stats.range.from === stats.range.to
    ? new Date(stats.range.from).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })
    : `${new Date(stats.range.from).toLocaleDateString('ms-MY', { day:'numeric', month:'short', year:'numeric' })} — ${new Date(stats.range.to).toLocaleDateString('ms-MY', { day:'numeric', month:'short', year:'numeric' })}`

  const dailyMax = Math.max(...stats.daily.map(d => (d.in_count||0)+(d.out_count||0)), 1)

  return `<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<title>Report — ${escapeHTML(company.name)}</title>
<style>
  /* margins controlled by Electron printToPDF — keep CSS minimal */
  @page { size: A4 portrait; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; color: #1F2937; background: white; font-size: 11pt; line-height: 1.5; }

  /* Header */
  .header {
    display: flex; align-items: center; gap: 18px;
    padding-bottom: 18px; border-bottom: 3px solid #25D366; margin-bottom: 24px;
  }
  .header-logo { width: 72px; height: 72px; object-fit: contain; border-radius: 8px; flex-shrink: 0; }
  .header-fallback {
    width: 72px; height: 72px; border-radius: 8px; flex-shrink: 0;
    background: linear-gradient(135deg, #25D366, #128C7E); display: flex;
    align-items: center; justify-content: center; color: white;
    font-size: 28pt; font-weight: 900;
  }
  .header-text h1 { font-size: 22pt; font-weight: 800; color: #0F172A; letter-spacing: -0.3px; }
  .header-text .subtitle { color: #64748B; font-size: 10pt; margin-top: 3px; }
  .header-text .meta { color: #94A3B8; font-size: 9pt; margin-top: 6px; }

  /* Title block */
  .title-bar {
    background: linear-gradient(135deg, #25D366, #128C7E);
    color: white; padding: 14px 18px; border-radius: 10px; margin-bottom: 20px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .title-bar .title { font-size: 14pt; font-weight: 700; }
  .title-bar .range { font-size: 10pt; opacity: 0.92; }

  /* KPI grid */
  .kpi-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    margin-bottom: 20px;
  }
  .kpi {
    padding: 14px; border-radius: 10px; border: 1px solid #E2E8F0;
    background: #F8FAFC;
  }
  .kpi .label { font-size: 8pt; color: #64748B; text-transform: uppercase;
    letter-spacing: 1px; font-weight: 700; margin-bottom: 5px; }
  .kpi .value { font-size: 22pt; font-weight: 800; line-height: 1; }
  .kpi .sub { font-size: 8pt; color: #94A3B8; margin-top: 4px; }

  /* Section */
  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 12pt; font-weight: 700; color: #0F172A; margin-bottom: 10px;
    padding-bottom: 6px; border-bottom: 2px solid #E2E8F0;
    display: flex; align-items: center; gap: 6px;
  }
  .section-title::before {
    content: ''; width: 4px; height: 16px; background: #25D366; border-radius: 2px;
  }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: #F1F5F9; padding: 8px 10px; text-align: left;
    font-weight: 700; color: #475569; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; }
  td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; color: #334155; }
  tr:last-child td { border-bottom: 0; }
  .label-chip { display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: white; }

  /* Daily bar chart */
  .chart { display: flex; align-items: flex-end; gap: 4px; height: 100px;
    padding: 12px; background: #F8FAFC; border-radius: 10px; border: 1px solid #E2E8F0; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; height: 100%; justify-content: flex-end; }
  .bar { width: 100%; background: linear-gradient(180deg, #25D366, #128C7E); border-radius: 3px 3px 0 0; min-height: 2px; }
  .bar-label { font-size: 7pt; color: #94A3B8; transform: rotate(-45deg); margin-top: 4px; }

  /* Footer */
  .footer {
    margin-top: 30px; padding-top: 14px; border-top: 1px solid #E2E8F0;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 8pt; color: #94A3B8;
  }

  /* Page break helper */
  .page-break { page-break-after: always; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  <!-- ─── HEADER ─── -->
  <div class="header">
    ${company.logo
      ? `<img src="${company.logo}" class="header-logo" alt="logo">`
      : `<div class="header-fallback">${escapeHTML((company.name || 'S').charAt(0).toUpperCase())}</div>`}
    <div class="header-text">
      <h1>${escapeHTML(company.name || 'Untitled Company')}</h1>
      ${company.address ? `<div class="subtitle">${escapeHTML(company.address)}</div>` : ''}
      <div class="meta">
        ${company.phone ? `📞 ${escapeHTML(company.phone)} · ` : ''}
        ${company.email ? `📧 ${escapeHTML(company.email)} · ` : ''}
        Dijana: ${new Date().toLocaleString('ms-MY', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
      </div>
    </div>
  </div>

  <!-- ─── TITLE BAR ─── -->
  <div class="title-bar">
    <div class="title">📊 Laporan Aktiviti Perniagaan</div>
    <div class="range">${escapeHTML(dateRangeLabel)}</div>
  </div>

  <!-- ─── EXECUTIVE SUMMARY ─── -->
  <div class="section">
    <div class="section-title">Ringkasan Eksekutif</div>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="label">Total Mesej</div>
        <div class="value" style="color:#58A6FF">${stats.summary.totalMessages}</div>
        <div class="sub">${stats.summary.messagesIn} masuk · ${stats.summary.messagesOut} keluar</div>
      </div>
      <div class="kpi">
        <div class="label">Customer Baru</div>
        <div class="value" style="color:#3FB950">${stats.summary.newCustomers}</div>
        <div class="sub">pertama kali hubungi</div>
      </div>
      <div class="kpi">
        <div class="label">Customer Lama</div>
        <div class="value" style="color:#BC8CFF">${stats.summary.returningCustomers}</div>
        <div class="sub">hubungi semula</div>
      </div>
      <div class="kpi">
        <div class="label">AI Rate</div>
        <div class="value" style="color:#F78166">${stats.summary.aiRate}%</div>
        <div class="sub">${stats.summary.aiReplies} dari ${stats.summary.messagesOut} reply</div>
      </div>
      <div class="kpi">
        <div class="label">Chat Aktif</div>
        <div class="value" style="color:#0F172A">${stats.summary.activeConversations}</div>
        <div class="sub">conversations</div>
      </div>
      <div class="kpi">
        <div class="label">Reply Manual</div>
        <div class="value" style="color:#0F172A">${stats.summary.manualReplies}</div>
        <div class="sub">oleh staff</div>
      </div>
      <div class="kpi">
        <div class="label">Avg Response</div>
        <div class="value" style="color:#D29922">${stats.summary.avgResponseMinutes}m</div>
        <div class="sub">masa balas purata</div>
      </div>
      <div class="kpi">
        <div class="label">Orders</div>
        <div class="value" style="color:#3FB950">${stats.summary.ordersCount}</div>
        <div class="sub">RM ${stats.summary.totalRevenue.toFixed(2)} diterima</div>
      </div>
    </div>
  </div>

  <!-- ─── DAILY ACTIVITY ─── -->
  ${stats.daily.length > 0 ? `
  <div class="section">
    <div class="section-title">Trend Harian</div>
    <div class="chart">
      ${stats.daily.map(d => {
        const total = (d.in_count||0) + (d.out_count||0)
        const h = Math.max(2, (total / dailyMax) * 100)
        const dt = new Date(d.d)
        return `<div class="bar-col">
          <div style="font-size:7pt;color:#475569;font-weight:700">${total}</div>
          <div class="bar" style="height:${h}%"></div>
          <div class="bar-label">${dt.toLocaleDateString('ms-MY',{day:'numeric',month:'short'})}</div>
        </div>`
      }).join('')}
    </div>
  </div>
  ` : ''}

  <!-- ─── TOP CUSTOMERS ─── -->
  ${stats.topContacts.length > 0 ? `
  <div class="section">
    <div class="section-title">Customer Paling Aktif</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Nama / Nombor</th>
          <th>Label</th>
          <th style="text-align:center">Mesej Total</th>
          <th style="text-align:center">Dari Mereka</th>
          <th style="text-align:center">Kepada Mereka</th>
        </tr>
      </thead>
      <tbody>
        ${stats.topContacts.map((c, i) => `
          <tr>
            <td><strong>${i+1}</strong></td>
            <td>
              <div style="font-weight:600;color:#0F172A">${escapeHTML(c.name || c.phone)}</div>
              <div style="font-size:8pt;color:#94A3B8">${escapeHTML(c.phone)}</div>
            </td>
            <td><span class="label-chip" style="background:${labelColor[c.label]||'#6E7681'}">${labelText[c.label]||c.label}</span></td>
            <td style="text-align:center;font-weight:700">${c.msg_count}</td>
            <td style="text-align:center;color:#58A6FF">${c.msgs_from_them}</td>
            <td style="text-align:center;color:#3FB950">${c.msgs_to_them}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- ─── NEW CUSTOMERS ─── -->
  ${stats.newCustomersList.length > 0 ? `
  <div class="section">
    <div class="section-title">Customer Baru (${stats.newCustomersList.length})</div>
    <table>
      <thead>
        <tr><th>Nama</th><th>Nombor</th><th>Pertama Kali Hubung</th></tr>
      </thead>
      <tbody>
        ${stats.newCustomersList.map(c => `
          <tr>
            <td><strong>${escapeHTML(c.name || '-')}</strong></td>
            <td style="font-family:monospace;color:#475569">${escapeHTML(c.phone)}</td>
            <td>${new Date(c.first_msg).toLocaleString('ms-MY',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- ─── ORDERS ─── -->
  ${stats.orders.length > 0 ? `
  <div class="section">
    <div class="section-title">Transaksi (${stats.orders.length})</div>
    <table>
      <thead>
        <tr><th>Customer</th><th>Order</th><th style="text-align:right">Amaun</th><th>Status</th><th>Tarikh</th></tr>
      </thead>
      <tbody>
        ${stats.orders.slice(0, 50).map(o => `
          <tr>
            <td>
              <div style="font-weight:600">${escapeHTML(o.customer_name || o.customer_phone)}</div>
              <div style="font-size:8pt;color:#94A3B8">${escapeHTML(o.customer_phone)}</div>
            </td>
            <td>${escapeHTML(o.title || '-')}</td>
            <td style="text-align:right;font-weight:700;color:${o.paid ? '#3FB950' : '#D29922'}">RM ${(o.amount||0).toFixed(2)}</td>
            <td>
              <span class="label-chip" style="background:${o.paid ? '#3FB950' : '#D29922'}">
                ${o.paid ? 'PAID' : (o.status||'-').toUpperCase()}
              </span>
            </td>
            <td>${new Date(o.created_at).toLocaleDateString('ms-MY',{day:'numeric',month:'short',year:'numeric'})}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- ─── FOOTER ─── -->
  <div class="footer">
    <div>
      <strong style="color:#475569">${escapeHTML(company.name || 'SYNCERA')}</strong>
      · Laporan dijana oleh sistem SYNCERA AI Messenger
    </div>
    <div>Halaman 1</div>
  </div>

</body>
</html>`
}

function escapeHTML(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string,string>)[c])
}
