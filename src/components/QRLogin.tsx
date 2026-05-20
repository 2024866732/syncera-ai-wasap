import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Activity, Loader2, RefreshCw, ShieldCheck, Sparkles, Wifi, Zap } from 'lucide-react'
import { useT } from '../i18n'

export default function QRLogin() {
  const tr = useT()
  const { qrCode, isConnected } = useStore()
  const [loading, setLoading] = useState(true)

  // Backend auto-connects on app launch (electron/main.js).
  // QR appears via wa:qr event. We only manually retry if user clicks "Cuba semula".
  useEffect(() => {
    // Stop showing the loader once we have a QR or after 6s
    const t = setTimeout(() => setLoading(false), 6000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (qrCode) setLoading(false)
  }, [qrCode])

  const handleConnect = async () => {
    setLoading(true)
    try { await window.wa.connect() } finally {
      setTimeout(() => setLoading(false), 4000)
    }
  }

  if (isConnected) return null

  return (
    <div className="flex-1 relative overflow-hidden bg-[#020706] text-white">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(37,211,102,0.28),transparent_28%),radial-gradient(circle_at_82%_48%,rgba(37,211,102,0.20),transparent_30%),linear-gradient(115deg,#020706_0%,#06130f_44%,#020607_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] bg-[linear-gradient(rgba(37,211,102,0.32)_1px,transparent_1px),linear-gradient(90deg,rgba(37,211,102,0.24)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="absolute inset-y-0 right-0 w-1/2 opacity-60 bg-[repeating-linear-gradient(166deg,transparent_0_22px,rgba(37,211,102,0.18)_23px,transparent_24px_48px)]" />
        <div className="absolute left-[52%] top-[11%] h-[1px] w-[42%] rotate-[-14deg] bg-gradient-to-r from-transparent via-accent-green/45 to-transparent" />
        <div className="absolute left-[58%] top-[58%] h-[1px] w-[48%] rotate-[-10deg] bg-gradient-to-r from-transparent via-accent-green/35 to-transparent" />
      </div>

      <div className="relative h-full flex items-center justify-center px-8 py-6 animate-fade-in">
        <div className="grid w-full max-w-[1160px] origin-center scale-[0.88] grid-cols-1 items-center gap-9 lg:grid-cols-[minmax(0,1fr)_470px] xl:scale-[0.90] 2xl:scale-[0.96]">
          <section className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-2 rounded-2xl bg-accent-green/45 blur-xl animate-pulse-soft" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-green/45 bg-gradient-to-br from-[#28f47b] via-[#12b86d] to-[#075b45] shadow-[0_0_34px_rgba(37,211,102,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]">
                  <Activity size={26} className="text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.75)]" strokeWidth={3} />
                </div>
              </div>
              <div>
                <h1 className="text-[36px] font-black leading-none tracking-tight text-white drop-shadow-[0_0_18px_rgba(37,211,102,0.25)]">SYNCERA</h1>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.34em] text-white/70">{tr('qr.subtitle')}</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-accent-green/45 bg-accent-green/10 px-4 py-1.5 shadow-[0_0_24px_rgba(37,211,102,0.18)]">
              <Sparkles size={14} className="text-accent-green" />
              <span className="text-xs font-extrabold uppercase tracking-[0.22em] text-accent-green">{tr('qr.tag')}</span>
            </div>

            <div className="space-y-5">
              <h2 className="max-w-[650px] text-4xl font-black leading-[1.06] tracking-[-0.03em] text-white lg:text-[46px]">
                {tr('qr.heroLine1')}
                <br />
                <span className="bg-gradient-to-r from-accent-green via-emerald-300 to-accent-blue bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(37,211,102,0.30)]">
                  {tr('qr.heroLine2')}
                </span>
              </h2>
              <p className="max-w-[590px] text-[16px] leading-7 text-white/68">{tr('qr.heroDesc')}</p>
            </div>

            <div className="grid max-w-[660px] grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { icon: ShieldCheck, title: tr('qr.feature1Title'), desc: tr('qr.feature1Desc') },
                { icon: Zap, title: tr('qr.feature2Title'), desc: tr('qr.feature2Desc') },
                { icon: Wifi, title: tr('qr.feature3Title'), desc: tr('qr.feature3Desc') },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="group relative overflow-hidden rounded-2xl border border-accent-green/35 bg-black/28 p-4 shadow-[0_0_28px_rgba(37,211,102,0.10),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent-green to-transparent opacity-80" />
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-accent-green/35 bg-accent-green/10 shadow-[0_0_20px_rgba(37,211,102,0.18)]">
                    <Icon size={18} className="text-accent-green" />
                  </div>
                  <p className="text-sm font-bold text-white">{title}</p>
                  <p className="mt-1 text-xs text-white/58">{desc}</p>
                </div>
              ))}
            </div>

            <div className="relative max-w-[660px] overflow-hidden rounded-2xl border border-accent-green/40 bg-black/32 p-5 shadow-[0_0_35px_rgba(37,211,102,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
              <div className="absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-accent-green to-transparent" />
              <div className="absolute bottom-0 right-10 h-28 w-44 rounded-full bg-accent-green/12 blur-3xl" />
              <p className="mb-4 text-xs font-black uppercase tracking-[0.32em] text-accent-green">{tr('qr.howTitle')}</p>
              <div className="grid gap-6 md:grid-cols-[1fr_190px]">
                <ol className="space-y-3">
                  {[tr('qr.step1'), tr('qr.step2'), tr('qr.step3'), tr('qr.step4')].map((step, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-white/75">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-green/20 text-xs font-black text-accent-green shadow-[0_0_16px_rgba(37,211,102,0.22)]">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="hidden xl:flex items-center justify-center">
                  <PhoneGlyph />
                </div>
              </div>
            </div>
          </section>

          <section className="relative flex justify-center">
            <div className="absolute -inset-8 rounded-[40px] bg-accent-green/20 blur-3xl" />
            <div className="relative w-full max-w-[460px] rounded-[34px] border border-accent-green/42 bg-black/42 p-7 shadow-[0_0_55px_rgba(37,211,102,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
              <ScannerFrame />
              <div className="relative z-10 flex flex-col items-center">
                <h3 className="text-center text-xl font-black uppercase tracking-[0.28em] text-accent-green drop-shadow-[0_0_14px_rgba(37,211,102,0.65)]">{tr('qr.scanTitle')}</h3>
                <p className="mt-3 text-center text-sm text-white/72">{tr('qr.scanDesc')}</p>

                <div className="relative mt-6">
                  <div className="absolute -inset-4 rounded-[28px] bg-accent-green/25 blur-2xl animate-pulse-soft" />
                  <div className="relative rounded-[26px] bg-white p-5 shadow-[0_22px_70px_rgba(37,211,102,0.34)]">
                    <CornerBrackets />
                    <div className="flex h-[246px] w-[246px] items-center justify-center">
                      {qrCode ? (
                        <img src={qrCode} alt="WhatsApp QR Code" className="h-full w-full object-contain animate-fade-in" />
                      ) : loading ? (
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 size={40} className="animate-spin text-accent-green" />
                          <p className="text-xs font-semibold text-gray-500">Menjana QR...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <RefreshCw size={30} className="text-gray-400" />
                          <p className="text-xs text-gray-500 text-center">QR tamat tempoh</p>
                          <button onClick={handleConnect} className="rounded-lg bg-accent-green px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-600">
                            Cuba semula
                          </button>
                        </div>
                      )}
                    </div>
                    {qrCode && <WhatsAppBadge />}
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-2 rounded-full border border-accent-green/35 bg-black/34 px-7 py-3 shadow-[0_0_24px_rgba(37,211,102,0.14)]">
                  <span className="relative flex h-3 w-3">
                    <span className={`absolute inset-0 rounded-full ${qrCode ? 'bg-accent-green animate-ping opacity-70' : 'bg-status-warning'}`} />
                    <span className={`relative h-3 w-3 rounded-full ${qrCode ? 'bg-accent-green' : 'bg-status-warning'}`} />
                  </span>
                  <span className="text-sm font-bold text-white">
                    {qrCode ? tr('qr.waiting') : loading ? tr('drive.connecting') : tr('common.success')}
                  </span>
                </div>
                <p className="mt-4 text-xs text-white/52">{tr('qr.refresh')}</p>
              </div>
            </div>
          </section>
        </div>

        <div className="absolute bottom-2 left-0 right-0 flex justify-center">
          <p className="text-xs text-white/35">Powered by Baileys WhatsApp Web - 100% data tempatan - Tiada cloud</p>
        </div>
      </div>
    </div>
  )
}

function CornerBrackets() {
  const cls = 'absolute h-8 w-8 border-accent-green'
  return (
    <>
      <div className={`${cls} left-3 top-3 rounded-tl-xl border-l-[4px] border-t-[4px]`} />
      <div className={`${cls} right-3 top-3 rounded-tr-xl border-r-[4px] border-t-[4px]`} />
      <div className={`${cls} bottom-3 left-3 rounded-bl-xl border-b-[4px] border-l-[4px]`} />
      <div className={`${cls} bottom-3 right-3 rounded-br-xl border-b-[4px] border-r-[4px]`} />
    </>
  )
}

function ScannerFrame() {
  return (
    <div className="pointer-events-none absolute inset-8 rounded-[28px] border border-accent-green/45">
      <div className="absolute left-8 right-8 top-0 h-px bg-gradient-to-r from-transparent via-accent-green to-transparent" />
      <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent-green to-transparent" />
      <div className="absolute left-0 top-12 h-24 w-px bg-gradient-to-b from-transparent via-accent-green to-transparent" />
      <div className="absolute right-0 top-12 h-24 w-px bg-gradient-to-b from-transparent via-accent-green to-transparent" />
      <div className="absolute left-4 top-4 h-12 w-12 rounded-tl-2xl border-l-4 border-t-4 border-accent-green shadow-[0_0_16px_rgba(37,211,102,0.65)]" />
      <div className="absolute right-4 top-4 h-12 w-12 rounded-tr-2xl border-r-4 border-t-4 border-accent-green shadow-[0_0_16px_rgba(37,211,102,0.65)]" />
      <div className="absolute bottom-4 left-4 h-12 w-12 rounded-bl-2xl border-b-4 border-l-4 border-accent-green shadow-[0_0_16px_rgba(37,211,102,0.65)]" />
      <div className="absolute bottom-4 right-4 h-12 w-12 rounded-br-2xl border-b-4 border-r-4 border-accent-green shadow-[0_0_16px_rgba(37,211,102,0.65)]" />
    </div>
  )
}

function WhatsAppBadge() {
  return (
    <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-accent-green shadow-xl ring-4 ring-white">
      <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.74.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18s-.22-.16-.47-.28z" />
      </svg>
    </div>
  )
}

function PhoneGlyph() {
  return (
    <div className="relative h-36 w-24 rotate-12 rounded-[22px] border border-accent-green/55 bg-black/55 shadow-[0_0_28px_rgba(37,211,102,0.28)]">
      <div className="absolute left-1/2 top-2 h-1 w-7 -translate-x-1/2 rounded-full bg-accent-green/55" />
      <div className="absolute inset-3 rounded-[16px] border border-accent-green/25 bg-gradient-to-b from-accent-green/12 to-transparent" />
      <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent-green/55 bg-accent-green/12">
        <Activity size={28} className="text-accent-green" strokeWidth={2.5} />
      </div>
      <div className="absolute -bottom-5 left-1/2 h-6 w-28 -translate-x-1/2 rounded-full border border-accent-green/20 bg-accent-green/5 blur-[1px]" />
    </div>
  )
}
