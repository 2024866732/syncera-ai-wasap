// Seed Knowledge Base with comprehensive Malaysian electrical service pricing
const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')
const { v4: uuidv4 } = require('uuid')

const KB = [
  // ── WIRING (House) ──────────────────────────────────────────────────────
  { category: 'Wiring', title: 'Wiring rumah teres baru (single storey)',
    content: 'RM3,500 – RM6,500 (terasing dari material). Bergantung saiz rumah & jumlah point. Average rumah teres single storey ~25-35 lighting points + 15-20 power points.' },
  { category: 'Wiring', title: 'Wiring rumah teres baru (double storey)',
    content: 'RM5,500 – RM9,500 (excluding material). Average 40-55 lighting points + 25-35 power points.' },
  { category: 'Wiring', title: 'Wiring rumah banglo / bungalow',
    content: 'RM8,000 – RM18,000+ (excluding material). Bergantung size, points, dan extra features (smart home, CCTV, security).' },
  { category: 'Wiring', title: 'Rewiring rumah lama (full)',
    content: 'RM4,500 – RM12,000 untuk rumah teres. Termasuk tear out wiring lama + install baru ikut spec terkini SIRIM.' },
  { category: 'Wiring', title: 'Wiring partial (1-2 bilik)',
    content: 'RM800 – RM2,500 setiap bilik. Bergantung jumlah point & access (siling concrete / panel).' },
  { category: 'Wiring', title: 'Single phase to 3 phase upgrade',
    content: 'RM2,500 – RM5,500 (excluding kabel utama dari TNB). Termasuk DB box baru, isolator 3 phase, certification.' },

  // ── LIGHTING ────────────────────────────────────────────────────────────
  { category: 'Lighting', title: 'Install lampu (siap point)',
    content: 'RM25 – RM50 setiap point (labour je, lampu pelanggan). Tambah RM50-RM150 kalau perlu cucuk wiring baru.' },
  { category: 'Lighting', title: 'Install downlight / spotlight',
    content: 'RM30 – RM60 setiap pcs (labour). Material LED downlight ~RM15-RM45 setiap pcs.' },
  { category: 'Lighting', title: 'Install ceiling fan',
    content: 'RM80 – RM150 setiap unit (labour). Termasuk pemasangan, balancing, regulator switch. Material fan asing.' },
  { category: 'Lighting', title: 'Install chandelier / pendant lamp',
    content: 'RM150 – RM350 (depending on weight & complexity). Heavy chandelier (>10kg) perlu reinforcement bracket.' },
  { category: 'Lighting', title: 'LED strip lighting installation',
    content: 'RM10 – RM25 setiap meter (excluding strip & driver). Power supply RM80-RM250.' },
  { category: 'Lighting', title: 'Smart lighting (Philips Hue / Yeelight)',
    content: 'RM80 – RM200 setiap point setup (excluding bulb). Include hub configuration & app pairing.' },

  // ── POWER POINTS / SOKET ────────────────────────────────────────────────
  { category: 'Power Points', title: 'Install soket biasa (13A)',
    content: 'RM50 – RM120 setiap point (labour + basic material). Tambah cost kalau perlu open siling / dinding concrete.' },
  { category: 'Power Points', title: 'Install soket USB / smart socket',
    content: 'RM80 – RM180 setiap point. Material socket sendiri lebih mahal RM45-RM120.' },
  { category: 'Power Points', title: 'Install isolator (water heater / aircond)',
    content: 'RM120 – RM250 setiap point. Termasuk MCB dedicated dalam DB.' },
  { category: 'Power Points', title: 'Install dedicated point oven / industrial',
    content: 'RM250 – RM500 setiap point. 32A/40A circuit dengan kabel khas.' },

  // ── DB BOX / SWITCHBOARD ────────────────────────────────────────────────
  { category: 'DB Box', title: 'Replace ELCB / RCCB',
    content: 'RM180 – RM450 (labour + ELCB unit). 30mA standard. Branded (Schneider, ABB) lebih mahal.' },
  { category: 'DB Box', title: 'Add MCB to existing DB',
    content: 'RM80 – RM180 setiap MCB (16A/20A/32A). Bergantung brand & rating.' },
  { category: 'DB Box', title: 'Upgrade DB box (consumer unit)',
    content: 'RM800 – RM2,800. Termasuk DB enclosure baru, MCBs, ELCB, busbar, labour, certification.' },
  { category: 'DB Box', title: 'New sub-DB installation',
    content: 'RM1,200 – RM3,500. Untuk extension rumah / outhouse / annex.' },

  // ── AIRCOND ELECTRICAL ──────────────────────────────────────────────────
  { category: 'Aircond Electrical', title: 'Install aircond electrical point baru (1HP-2HP)',
    content: 'RM180 – RM350 setiap unit. Termasuk wiring 16A, isolator, MCB dedicated.' },
  { category: 'Aircond Electrical', title: 'Install aircond electrical point (2.5HP-3HP)',
    content: 'RM250 – RM450 setiap unit. Wiring 20A/25A.' },
  { category: 'Aircond Electrical', title: 'Servis aircond (cuci & gas)',
    content: 'RM80 – RM180 setiap unit (1HP-2HP). 2.5HP+ ~RM150-RM300. Cuci + check refrigerant.' },
  { category: 'Aircond Electrical', title: 'Install aircond bracket & piping',
    content: 'RM150 – RM350. Bergantung tinggi & jenis dinding (concrete vs gypsum).' },

  // ── GENSET & UPS ────────────────────────────────────────────────────────
  { category: 'Backup Power', title: 'Install genset rumah 5kVA',
    content: 'RM4,500 – RM9,500 (genset + ATS + installation). Brand China RM3,500, Honda/Yamaha RM7,000+.' },
  { category: 'Backup Power', title: 'Install genset rumah 10kVA',
    content: 'RM9,500 – RM18,000. Untuk rumah banglo / heavy usage.' },
  { category: 'Backup Power', title: 'Install UPS (offline 1500VA)',
    content: 'RM800 – RM1,800. Untuk PC / TV. Backup time 10-30 minit.' },
  { category: 'Backup Power', title: 'Install UPS online (3kVA)',
    content: 'RM2,500 – RM6,000. Untuk equipment sensitive — server, medical.' },
  { category: 'Backup Power', title: 'Install ATS (Auto Transfer Switch)',
    content: 'RM800 – RM2,500. Auto switch antara TNB & genset bila power cut.' },

  // ── SOLAR ───────────────────────────────────────────────────────────────
  { category: 'Solar', title: 'Solar PV residential 4kW (NEM)',
    content: 'RM18,000 – RM28,000 turnkey. Termasuk panel, inverter, mounting, wiring, application TNB NEM. Save 40-70% bil letrik.' },
  { category: 'Solar', title: 'Solar PV residential 6kW (NEM)',
    content: 'RM26,000 – RM42,000 turnkey. Sesuai banglo / heavy aircond usage.' },
  { category: 'Solar', title: 'Solar hybrid dengan battery 5kWh',
    content: 'RM35,000 – RM55,000. Off-grid backup capability.' },

  // ── EV CHARGER ──────────────────────────────────────────────────────────
  { category: 'EV Charger', title: 'Install EV charger 7kW (single phase)',
    content: 'RM3,500 – RM6,500 turnkey. Termasuk charger Type 2 (Wallbox/Schneider) + cable + DB upgrade kalau perlu + certification.' },
  { category: 'EV Charger', title: 'Install EV charger 11-22kW (3 phase)',
    content: 'RM6,500 – RM12,000. Perlu 3 phase supply.' },

  // ── CCTV & SECURITY ─────────────────────────────────────────────────────
  { category: 'CCTV', title: 'CCTV 4 camera package (analog)',
    content: 'RM1,500 – RM3,000 turnkey. Termasuk DVR, 4 cam (2MP), 4x1TB HDD, cabling, installation.' },
  { category: 'CCTV', title: 'CCTV 8 camera package (IP/PoE)',
    content: 'RM3,500 – RM7,500. NVR, 8 IP cam (4MP), PoE switch, NAS storage.' },
  { category: 'CCTV', title: 'Install autogate motor',
    content: 'RM2,200 – RM5,500 (motor + gate sensors + remote + installation).' },
  { category: 'CCTV', title: 'Alarm system rumah',
    content: 'RM800 – RM2,500. Termasuk panel, sensor pintu/tingkap, motion sensor, siren.' },

  // ── INSPECTION & CERTIFICATION ──────────────────────────────────────────
  { category: 'Inspection', title: 'TNB NEM5 / SIRIM certification',
    content: 'RM350 – RM800. Wajib untuk renovation & wiring baru. Termasuk site inspection + cert document.' },
  { category: 'Inspection', title: 'JKR / KKM electrical inspection',
    content: 'RM500 – RM1,500. Untuk premis komersial / kilang.' },
  { category: 'Inspection', title: 'Earthing test & report',
    content: 'RM200 – RM450. Test resistance + report.' },

  // ── MAINTENANCE & TROUBLESHOOTING ───────────────────────────────────────
  { category: 'Maintenance', title: 'Site visit / call-out fee',
    content: 'RM50 – RM100 (Klang Valley). Refundable jika customer proceed dengan job. Luar Klang Valley: RM150-RM350.' },
  { category: 'Maintenance', title: 'Hourly rate (troubleshoot)',
    content: 'RM80 – RM120 setiap jam. Minimum charge biasanya 1 jam.' },
  { category: 'Maintenance', title: 'Repair short circuit / trip',
    content: 'RM150 – RM450 (labour). Bergantung complexity & material yang perlu diganti.' },
  { category: 'Maintenance', title: 'Replace damaged switch / socket',
    content: 'RM50 – RM120 setiap point (labour + basic material).' },
  { category: 'Maintenance', title: 'Periodic check & maintenance contract',
    content: 'RM800 – RM2,500/tahun untuk rumah. Komersial RM2,500-RM8,000/tahun. Termasuk 2-4 visit setahun.' },

  // ── PAYMENT & POLICY ────────────────────────────────────────────────────
  { category: 'Payment', title: 'Cara bayar',
    content: 'Cash, online transfer (Maybank/CIMB), DuitNow, e-wallet (TnG, GrabPay). Deposit 30-50% untuk job baru, balance after completion.' },
  { category: 'Payment', title: 'Quotation',
    content: 'FREE quotation untuk job >RM500 setelah site visit. Quote kecil boleh atas WhatsApp dengan foto.' },
  { category: 'Payment', title: 'Warranty',
    content: 'Workmanship warranty 6 bulan. Material warranty ikut manufacturer (1-3 tahun depending brand).' },

  // ── COVERAGE ────────────────────────────────────────────────────────────
  { category: 'Coverage', title: 'Service area',
    content: 'Klang Valley (KL, Selangor) main area. Luar Klang Valley boleh tapi ada surcharge travel. Kota Tinggi & Johor area tertentu boleh — confirm dengan team.' },
  { category: 'Coverage', title: 'Emergency / after-hours',
    content: 'Available untuk emergency (24/7). Surcharge 50% selepas 8pm & weekend. RM150 minimum call-out emergency.' },
]

;(async () => {
  const dbPath = path.join(process.env.APPDATA, 'wa-bizai', 'wa-bizai.db')
  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const db = new SQL.Database(fs.readFileSync(dbPath))

  // Clear existing electrical KB entries to avoid duplicates
  db.run("DELETE FROM knowledge_base WHERE category IN ('Wiring','Lighting','Power Points','DB Box','Aircond Electrical','Backup Power','Solar','EV Charger','CCTV','Inspection','Maintenance','Payment','Coverage')")

  for (const e of KB) {
    db.run(
      'INSERT INTO knowledge_base (id,category,title,content,is_active,sort_order) VALUES (?,?,?,?,1,0)',
      [uuidv4(), e.category, e.title, e.content]
    )
  }

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  console.log(`✓ Inserted ${KB.length} electrical service KB entries across ${new Set(KB.map(k=>k.category)).size} categories`)
  db.close()
})().catch(e => console.error(e))
