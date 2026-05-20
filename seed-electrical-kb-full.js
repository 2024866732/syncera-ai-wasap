// Comprehensive Malaysian electrical KB seeder for SYNCERA.
// Categories:
//   Public (customer-facing): Wiring, Lighting, Power Points, DB Box, Aircond,
//     Backup Power, Solar, EV Charger, CCTV, Smart Home, Maintenance,
//     Specialized, Materials, Payment, Coverage, Warranty, FAQ
//   Internal (NEVER quoted to customer): "Internal — Tidak Untuk Customer"
//
// Customer-facing entries → "What we charge customer (final)" + scope.
// Internal entries        → cost breakdown, supplier rate, margin guide.
//
// AI system prompt will treat the "Internal — Tidak Untuk Customer" category as
// confidential reference for the OWNER only. AI must never mention margin, cost,
// supplier, profit, or markup to customer even if directly asked.

const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')
const { v4: uuidv4 } = require('uuid')

const PUBLIC = [
  // ───── WIRING ─────────────────────────────────────────────────────────
  { category: 'Wiring', title: 'Wiring rumah teres 1 tingkat (baru)',
    content: 'Harga: RM4,500 – RM7,500. Termasuk 25-35 lighting points + 15-20 power points, kabel SIRIM, DB box 8-way, ELCB 30mA, certification TNB. Tempoh kerja: 3-5 hari.' },
  { category: 'Wiring', title: 'Wiring rumah teres 2 tingkat (baru)',
    content: 'Harga: RM6,500 – RM10,500. Termasuk 40-55 lighting points + 25-35 power points, riser between floors, DB utama + sub-DB, certification. Tempoh: 5-7 hari.' },
  { category: 'Wiring', title: 'Wiring rumah banglo / bungalow',
    content: 'Harga: RM9,500 – RM22,000+. Bergantung saiz (1,500-5,000+ sqft), points count, dan smart home integration. Tempoh: 1-3 minggu.' },
  { category: 'Wiring', title: 'Rewiring rumah lama (full)',
    content: 'Rumah teres: RM5,500 – RM13,500. Rumah banglo: RM12,000 – RM28,000. Termasuk tear out wiring lama, install baru ikut MS IEC 60364, certification. Tempoh: 4-7 hari.' },
  { category: 'Wiring', title: 'Wiring partial / bilik tertentu',
    content: 'RM900 – RM2,800 per bilik. Bergantung point count dan accessibility (siling concrete vs gypsum). Average 1 bilik: 4-6 lighting + 4 power points.' },
  { category: 'Wiring', title: 'Wiring tambahan untuk renovation',
    content: 'RM350 – RM850 setiap point baru (siap concealed). Tukar daripada exposed ke concealed: tambah RM150/point.' },
  { category: 'Wiring', title: 'Single phase to 3 phase upgrade',
    content: 'RM2,800 – RM6,500. Termasuk DB 3 phase baru, isolator main, kabel dari meter, TNB application & certification. Lead time TNB: 2-4 minggu.' },
  { category: 'Wiring', title: 'Wiring kedai / kilang kecil (commercial)',
    content: 'RM6,500 – RM18,500 setiap 1,000 sqft. Termasuk industrial socket, 3-phase circuit, fluorescent/LED panel, emergency lighting, MCB sub-circuits.' },
  { category: 'Wiring', title: 'Wiring extension rumah (annex / extension)',
    content: 'RM1,800 – RM5,500. Termasuk sub-DB baru, kabel dari main DB, sehingga 8-12 points. Lebih besar = quote site visit.' },

  // ───── LIGHTING ───────────────────────────────────────────────────────
  { category: 'Lighting', title: 'Install lampu siap point',
    content: 'RM30 – RM55 setiap pcs (labour). Lampu sediakan oleh customer. Tukar bulb je RM15-25/unit.' },
  { category: 'Lighting', title: 'Install downlight LED (siling gypsum)',
    content: 'RM35 – RM65 setiap pcs labour + material LED 5W-12W RM18-RM48 setiap pcs. Lubang potong + wiring siap.' },
  { category: 'Lighting', title: 'Install spotlight track',
    content: 'RM150 – RM350 setiap meter track + RM45-RM150 setiap spotlight LED.' },
  { category: 'Lighting', title: 'Install ceiling fan (no light)',
    content: 'RM85 – RM160 labour. Termasuk balancing & regulator switch. Fan sediakan customer.' },
  { category: 'Lighting', title: 'Install ceiling fan + light kit',
    content: 'RM110 – RM200 labour. Termasuk extra wiring untuk light separate switch. Branded fan (KDK, Panasonic, Acorn) install lebih kemas.' },
  { category: 'Lighting', title: 'Install chandelier (hingga 10kg)',
    content: 'RM180 – RM450 labour. Termasuk reinforcement bracket di siling, balancing, dimmer kalau ada.' },
  { category: 'Lighting', title: 'Install chandelier besar (>10kg / 5+ tier)',
    content: 'RM450 – RM1,200 labour. Perlu reinforcement structure, mungkin scaffolding. Site visit untuk quotation tepat.' },
  { category: 'Lighting', title: 'LED strip lighting installation',
    content: 'RM12 – RM28 setiap meter labour. Strip 5050 / 2835 + driver: RM35-RM180 ikut wattage. Untuk cove ceiling / kitchen cabinet / staircase.' },
  { category: 'Lighting', title: 'Smart lighting (Philips Hue / Yeelight / Aqara)',
    content: 'Setup RM90 – RM220 setiap zon. Termasuk hub configuration, app pairing, scene programming. Bulb/material asing.' },
  { category: 'Lighting', title: 'Outdoor / garden / facade lighting',
    content: 'RM65 – RM150 setiap pcs IP65 fitting. Termasuk weatherproof wiring, timer / photocell. Bollard light RM350-RM850 turnkey.' },
  { category: 'Lighting', title: 'Emergency light & exit sign',
    content: 'RM250 – RM550 setiap pcs install. Wajib untuk premis komersial mengikut UBBL. Battery backup 3 jam.' },

  // ───── POWER POINTS / SOKET ───────────────────────────────────────────
  { category: 'Power Points', title: 'Install soket 13A standard',
    content: 'RM55 – RM130 setiap point. Material socket plate (MK / Schneider): tambah RM12-RM45 / pcs. Concealed wiring di dinding concrete tambah RM30-RM80.' },
  { category: 'Power Points', title: 'Install soket USB / USB-C',
    content: 'RM95 – RM200 setiap point. Material Schneider USB socket: RM68-RM145.' },
  { category: 'Power Points', title: 'Install smart socket (WiFi / Zigbee)',
    content: 'RM85 – RM180 labour. Smart socket Sonoff/Aqara: RM45-RM135. Setup app & schedule included.' },
  { category: 'Power Points', title: 'Install isolator water heater / aircond',
    content: 'RM130 – RM280 setiap point. 20A/30A double pole. Termasuk MCB dedicated dalam DB. Wajib untuk water heater (safety).' },
  { category: 'Power Points', title: 'Install dedicated point oven / built-in cooktop',
    content: 'RM280 – RM550. 32A/40A circuit, kabel 6mm² atau 10mm². Untuk built-in induction, oven, dryer.' },
  { category: 'Power Points', title: 'Install industrial 3-phase socket (IP44)',
    content: 'RM450 – RM950 setiap point. Untuk welding machine, compressor, motor. Termasuk 3P+E+N socket Schneider/Legrand.' },
  { category: 'Power Points', title: 'Install floor box (dalam lantai)',
    content: 'RM350 – RM850 setiap floor box. Untuk pejabat / showroom. Termasuk pemotongan lantai, conduit, cover plate.' },

  // ───── DB BOX / SWITCHBOARD ───────────────────────────────────────────
  { category: 'DB Box', title: 'Tukar ELCB / RCCB 30mA',
    content: 'RM220 – RM480 (labour + ELCB unit). Branded (Schneider, ABB, Hager) RM180-RM320. Wajib test trip selepas pasang.' },
  { category: 'DB Box', title: 'Tambah MCB dalam DB sedia ada',
    content: 'RM85 – RM200 setiap MCB. Rating 6A/10A/16A/20A/32A. Branded MCB RM35-RM85 setiap pcs.' },
  { category: 'DB Box', title: 'Upgrade DB box (consumer unit) — 8 way',
    content: 'RM850 – RM2,200. Termasuk DB enclosure, 6-8 MCB, ELCB 63A, busbar, labels, certification.' },
  { category: 'DB Box', title: 'Upgrade DB box — 12 way (large home)',
    content: 'RM1,400 – RM3,200. Untuk rumah banglo / kediaman aircond banyak. ELCB 100A + sub-circuits.' },
  { category: 'DB Box', title: 'Install sub-DB (annex / outhouse)',
    content: 'RM1,200 – RM3,800. Termasuk kabel dari main DB, MCB, ELCB. Sesuai untuk extension / store.' },
  { category: 'DB Box', title: 'Surge protection device (SPD)',
    content: 'RM450 – RM1,200. Type 2 SPD untuk rumah / Type 1+2 untuk komersial. Lindungi peralatan elektronik dari lightning surge.' },

  // ───── AIRCOND ELECTRICAL ─────────────────────────────────────────────
  { category: 'Aircond Electrical', title: 'Install electrical point aircond 1.0HP',
    content: 'RM180 – RM320 setiap unit. 13A point + isolator + MCB dedicated. Single phase.' },
  { category: 'Aircond Electrical', title: 'Install electrical point aircond 1.5HP',
    content: 'RM200 – RM360 setiap unit. 13A/16A point + isolator.' },
  { category: 'Aircond Electrical', title: 'Install electrical point aircond 2.0HP – 2.5HP',
    content: 'RM240 – RM420 setiap unit. 20A point + isolator + MCB.' },
  { category: 'Aircond Electrical', title: 'Install electrical point aircond 3.0HP+',
    content: 'RM280 – RM520 setiap unit. 25A/32A point. Kabel 4mm². 3-phase optional.' },
  { category: 'Aircond Electrical', title: 'Servis aircond (cuci kimia)',
    content: 'RM85 – RM180 setiap unit (1.0-2.0HP). 2.5HP+: RM150-RM300. Termasuk cuci coil, blower, drain pipe, gas check.' },
  { category: 'Aircond Electrical', title: 'Top-up gas aircond R32 / R410A',
    content: 'RM120 – RM280 setiap unit. Bergantung jenis gas dan kebocoran.' },
  { category: 'Aircond Electrical', title: 'Install aircond bracket + piping (split unit)',
    content: 'RM180 – RM420. Termasuk bracket besi, piping copper 3-5m, drain hose, vacuum, gas charging.' },
  { category: 'Aircond Electrical', title: 'Relocation aircond (dismantle + reinstall)',
    content: 'RM280 – RM550 setiap unit. Bergantung jarak baru, piping length, condition.' },

  // ───── BACKUP POWER ───────────────────────────────────────────────────
  { category: 'Backup Power', title: 'Install genset 5kVA (residential)',
    content: 'RM5,200 – RM10,500 turnkey. Genset (China/Honda/Yamaha) + ATS + housing + electrical wiring + grounding.' },
  { category: 'Backup Power', title: 'Install genset 10kVA',
    content: 'RM10,500 – RM18,500. Untuk banglo besar atau pejabat kecil. Diesel atau gas.' },
  { category: 'Backup Power', title: 'Install genset 20-30kVA (commercial)',
    content: 'RM22,000 – RM52,000. Termasuk soundproof enclosure, fuel tank 200L, exhaust pipe, ATS panel.' },
  { category: 'Backup Power', title: 'Install UPS offline 1500VA',
    content: 'RM900 – RM2,000. Backup 10-30 minit untuk PC, TV, router. Brand APC/Eaton.' },
  { category: 'Backup Power', title: 'Install UPS online 3kVA',
    content: 'RM2,800 – RM6,500. Untuk equipment sensitive (server, medical). Backup 15-60 minit ikut battery.' },
  { category: 'Backup Power', title: 'Install UPS server room 6-10kVA',
    content: 'RM8,500 – RM18,500. Rack-mounted, redundant battery, monitoring software.' },
  { category: 'Backup Power', title: 'Install ATS (Auto Transfer Switch)',
    content: 'RM850 – RM2,800. Auto switch TNB ↔ genset dalam 5-15 saat semasa power cut.' },
  { category: 'Backup Power', title: 'Inverter rumah dengan battery 5kWh',
    content: 'RM12,500 – RM22,000. Hybrid system untuk rumah, backup essential load 6-12 jam.' },

  // ───── SOLAR ──────────────────────────────────────────────────────────
  { category: 'Solar', title: 'Solar PV residential 4kW NEM 3.0',
    content: 'Turnkey RM19,500 – RM29,500. Termasuk panel 4kW (10-12 pcs 400W), inverter hybrid, mounting, wiring, TNB NEM application. Save 40-70% bil. Payback 5-7 tahun.' },
  { category: 'Solar', title: 'Solar PV residential 6kW NEM',
    content: 'RM27,500 – RM43,500 turnkey. Sesuai banglo / aircond heavy use. Tier-1 panel (Jinko / Trina / LONGi).' },
  { category: 'Solar', title: 'Solar PV residential 8-10kW NEM',
    content: 'RM35,000 – RM58,000. Untuk rumah dengan EV charger atau aircond besar.' },
  { category: 'Solar', title: 'Solar hybrid + battery 5kWh',
    content: 'RM38,000 – RM58,000. Off-grid backup capability. Battery LiFePO4 lifespan 8-10 tahun.' },
  { category: 'Solar', title: 'Solar hybrid + battery 10kWh',
    content: 'RM55,000 – RM85,000. Untuk rumah hampir sepenuhnya self-sufficient.' },
  { category: 'Solar', title: 'Commercial solar 20-50kW (kilang / kedai)',
    content: 'RM65,000 – RM180,000. Quote selepas survey roof + load profile.' },

  // ───── EV CHARGER ─────────────────────────────────────────────────────
  { category: 'EV Charger', title: 'Install EV charger 7kW single phase (Type 2)',
    content: 'RM3,800 – RM6,800 turnkey. Termasuk charger Wallbox/Schneider/Delta, kabel 5-15m, DB upgrade kalau perlu, MCB dedicated, certification.' },
  { category: 'EV Charger', title: 'Install EV charger 11kW 3-phase',
    content: 'RM5,500 – RM9,500. Perlu supply 3 phase. Recommend untuk EV besar (Tesla Model X, BYD Sealion).' },
  { category: 'EV Charger', title: 'Install EV charger 22kW 3-phase fast',
    content: 'RM7,500 – RM13,500. Charging speed 100km dalam 1 jam.' },
  { category: 'EV Charger', title: 'Install DC fast charger 30-60kW (komersial)',
    content: 'RM45,000 – RM120,000. Untuk parking pusat beli-belah, hotel. Quote selepas site survey.' },

  // ───── CCTV & SECURITY ────────────────────────────────────────────────
  { category: 'CCTV', title: 'CCTV 4-camera package (analog HD)',
    content: 'RM1,500 – RM3,200 turnkey. DVR 4-channel + 4 cam 2MP/5MP + HDD 1TB + cabling siap + mobile app setup.' },
  { category: 'CCTV', title: 'CCTV 4-camera IP/PoE',
    content: 'RM2,500 – RM5,500. NVR + 4 IP cam 4MP + PoE switch + HDD 2TB. Resolution lebih tajam, kabel single LAN.' },
  { category: 'CCTV', title: 'CCTV 8-camera IP/PoE',
    content: 'RM4,500 – RM8,800. NVR 8ch + 8 IP cam + HDD 4TB. Termasuk smartphone alert configuration.' },
  { category: 'CCTV', title: 'CCTV 16-channel komersial',
    content: 'RM8,500 – RM18,500. Untuk kedai/kilang. NVR 16ch + cam mix indoor/outdoor + 8TB storage + 24/7 cloud backup optional.' },
  { category: 'CCTV', title: 'CCTV dengan AI / facial recognition',
    content: 'RM12,500 – RM35,000. Hikvision / Dahua AI cameras. Detect people vs vehicle, license plate recognition.' },
  { category: 'Security', title: 'Install autogate motor sliding',
    content: 'RM2,400 – RM5,800. Motor + sensor + remote 2 pcs + photo cell + installation. Brand Centurion / DEA / SECCS.' },
  { category: 'Security', title: 'Install autogate motor swing arm',
    content: 'RM2,800 – RM6,500. 2 motor untuk gate swing. Termasuk control panel + remote.' },
  { category: 'Security', title: 'Alarm system rumah (4 sensor)',
    content: 'RM950 – RM2,500. Panel + 4 sensor pintu/tingkap + motion sensor + siren + keypad. Brand Paradox / Honeywell.' },
  { category: 'Security', title: 'Door access control (card / fingerprint)',
    content: 'RM850 – RM2,400 setiap door. Reader + lock + power supply + push button + exit sensor.' },
  { category: 'Security', title: 'Intercom video (rumah teres)',
    content: 'RM1,200 – RM2,800. Outdoor unit dengan camera + indoor monitor 7" + connection ke autogate.' },

  // ───── SMART HOME ─────────────────────────────────────────────────────
  { category: 'Smart Home', title: 'Smart home basic package (1 bilik)',
    content: 'RM850 – RM1,800. Smart switch 3 pcs + smart socket 2 pcs + WiFi hub + app setup + scene programming.' },
  { category: 'Smart Home', title: 'Smart home full house (3 bilik)',
    content: 'RM4,500 – RM12,500. Sonoff/Tuya/Aqara integration. Voice control (Google/Alexa). Automation routines.' },
  { category: 'Smart Home', title: 'KNX professional smart home (banglo)',
    content: 'RM25,000 – RM85,000. Bus-based system, German standard. Untuk projek high-end. Termasuk programming.' },
  { category: 'Smart Home', title: 'Smart blinds / curtain motor',
    content: 'RM550 – RM1,400 setiap window. Motor + remote + app control + scheduling.' },

  // ───── MAINTENANCE & TROUBLESHOOTING ──────────────────────────────────
  { category: 'Maintenance', title: 'Site visit / call-out fee (Klang Valley)',
    content: 'RM50 – RM100. Refundable kalau customer proceed dengan job. Luar Klang Valley: RM150-RM400 ikut jarak.' },
  { category: 'Maintenance', title: 'Hourly rate troubleshoot',
    content: 'RM80 – RM150 setiap jam. Minimum 1 jam. Emergency / lepas waktu pejabat: tambah 50%.' },
  { category: 'Maintenance', title: 'Repair short circuit / breaker trip',
    content: 'RM180 – RM550 (labour). Material yang perlu diganti asing. Termasuk megger test selepas baiki.' },
  { category: 'Maintenance', title: 'Tukar damaged switch / socket',
    content: 'RM55 – RM135 setiap point. Material switch/socket asing (RM8-RM85 ikut brand).' },
  { category: 'Maintenance', title: 'Periodic maintenance contract (rumah)',
    content: 'RM850 – RM2,800 / tahun. 2-4 visit termasuk inspection, IR thermography, ELCB test, earthing test, report.' },
  { category: 'Maintenance', title: 'Periodic maintenance contract (komersial)',
    content: 'RM2,500 – RM12,500 / tahun. Bergantung jenis premis. Termasuk tukar consumables, emergency response.' },
  { category: 'Maintenance', title: 'Emergency call-out (24/7)',
    content: 'RM200 – RM450 call-out fee. Surcharge 50% lepas 8pm + weekend. Response 1-3 jam Klang Valley.' },

  // ───── SPECIALIZED ────────────────────────────────────────────────────
  { category: 'Specialized', title: 'Lightning protection / surge arrester install',
    content: 'RM2,500 – RM8,500 untuk rumah teres. Termasuk air terminal, conductor, earth pit (3+ rod), inspection.' },
  { category: 'Specialized', title: 'Earthing system installation',
    content: 'RM550 – RM2,200. 1-3 earth rod, copper conductor, inspection chamber. Wajib reading <1 ohm untuk wajaran TNB.' },
  { category: 'Specialized', title: 'Earthing test & megger insulation test',
    content: 'RM250 – RM550. Termasuk certificate. Wajib untuk insurance / KKM compliance.' },
  { category: 'Specialized', title: 'Infrared thermography (IR scan)',
    content: 'RM450 – RM1,200 setiap site. Scan DB / panel untuk hotspot, loose connection. Preventive maintenance.' },
  { category: 'Specialized', title: 'Power quality analysis',
    content: 'RM850 – RM2,400. Monitoring 24-72 jam untuk diagnose voltage drop, harmonics, transients.' },
  { category: 'Specialized', title: 'Energy audit (commercial)',
    content: 'RM1,500 – RM6,500. Inspection + meter logging + report cadangan jimat tenaga.' },

  // ───── MATERIALS / SUPPLY ─────────────────────────────────────────────
  { category: 'Materials', title: 'Kabel kuprum SIRIM (per meter)',
    content: '1.5mm²: RM2-3/m. 2.5mm²: RM3-5/m. 4mm²: RM5-8/m. 6mm²: RM8-12/m. 10mm²: RM14-22/m. 16mm²: RM22-35/m. Brand: Federal / Mecaline / TF.' },
  { category: 'Materials', title: 'Switch & socket Schneider AvatarOn',
    content: 'Switch 1 gang: RM18-25. Switch 2 gang: RM28-38. Socket 13A: RM32-48. USB socket: RM68-95.' },
  { category: 'Materials', title: 'Switch & socket Legrand Mallia',
    content: 'Switch 1 gang: RM22-32. Socket 13A: RM38-55. Premium feel untuk banglo.' },
  { category: 'Materials', title: 'Switch & socket MK (UK)',
    content: 'Switch 1 gang: RM28-42. Socket 13A: RM48-72. Heavy duty, lifetime warranty UK.' },
  { category: 'Materials', title: 'LED downlight 5W cool/warm white',
    content: 'RM18-32 setiap pcs. Brand Philips / Osram / Eubiq. Lifespan 25,000 jam.' },
  { category: 'Materials', title: 'LED downlight 12W premium',
    content: 'RM35-65 setiap pcs. Dimmable, 3-color CCT switchable.' },
  { category: 'Materials', title: 'Ceiling fan KDK 56" remote',
    content: 'RM450-620. Heavy duty, 10 tahun warranty motor.' },
  { category: 'Materials', title: 'Ceiling fan Panasonic ECONAVI 60"',
    content: 'RM880-1,200. DC motor, inverter, super silent.' },

  // ───── PAYMENT & POLICY ───────────────────────────────────────────────
  { category: 'Payment', title: 'Cara bayar yang diterima',
    content: 'Cash, bank transfer (Maybank / CIMB), DuitNow QR, e-wallet (TnG, GrabPay, Boost), kad kredit (Visa/MasterCard). Deposit 30-50% untuk job >RM500, balance lepas siap.' },
  { category: 'Payment', title: 'Quotation policy',
    content: 'FREE quotation untuk job >RM500 selepas site visit. Quote ringkas atas WhatsApp boleh dengan foto + maklumat scope.' },
  { category: 'Payment', title: 'Invoice & receipt',
    content: 'Invoice rasmi diberikan untuk setiap job. SST 8% tidak dikenakan (under threshold). Resit / tax invoice available kalau perlu.' },
  { category: 'Warranty', title: 'Workmanship warranty',
    content: '6 bulan untuk kerja general. 12 bulan untuk wiring / installation utama. Tidak termasuk damage akibat surge, banjir, salah guna.' },
  { category: 'Warranty', title: 'Material warranty',
    content: 'Ikut manufacturer warranty: Schneider 5 tahun, MK 25 tahun, Philips LED 3-5 tahun, KDK fan 10 tahun motor. Beg packaging + receipt diperlukan untuk claim.' },
  { category: 'Coverage', title: 'Service area utama',
    content: 'Klang Valley: KL, Selangor (semua), Putrajaya, Cyberjaya. No surcharge dalam radius 30km dari Shah Alam.' },
  { category: 'Coverage', title: 'Service area extended',
    content: 'Negeri Sembilan (Seremban, Nilai), Perak (Ipoh selatan), Johor (utara), Pahang (Bentong, Genting) — surcharge travel RM150-RM450.' },

  // ───── FAQ ────────────────────────────────────────────────────────────
  { category: 'FAQ', title: 'Berapa lama untuk rewiring rumah teres?',
    content: 'Biasanya 4-7 hari kerja untuk teres 2 tingkat. Termasuk tear out, install, certification. Boleh diatur bertahap kalau customer masih duduk dalam rumah.' },
  { category: 'FAQ', title: 'Adakah perlu re-paint selepas wiring?',
    content: 'Ya, sebahagian besar. Kami akan patching plaster selepas concealed wiring, tapi painting akhir lazimnya customer atur sendiri. Kami boleh recommend painter.' },
  { category: 'FAQ', title: 'Boleh proceed kerja tanpa quotation?',
    content: 'Untuk job kecil (<RM500) ya, atas kepercayaan customer. Untuk job besar wajib quotation bertulis + deposit sebelum mula.' },
  { category: 'FAQ', title: 'TNB approval — kami atur atau customer?',
    content: 'Untuk wiring baru / upgrade DB / 3-phase, kami atur sepenuhnya termasuk application form, drawing, certification. Customer hanya sign borang.' },
  { category: 'FAQ', title: 'Lepas job siap, apa proses?',
    content: 'Testing + commissioning di hadapan customer. Sign-off + invoice + certification copy diberikan. Warranty card diberi.' },
  { category: 'FAQ', title: 'Boleh request electrician tertentu?',
    content: 'Boleh untuk repeat customer. Untuk job besar, kami assign senior technician + helper. Same team throughout the project.' },
]

// Internal entries — NEVER quoted to customer
const INTERNAL = [
  { category: 'Internal — Tidak Untuk Customer', title: '⚠️ ATURAN UTAMA',
    content: 'KATEGORI INI ADALAH RUJUKAN OWNER SAHAJA. JANGAN SEKALI-KALI MAKLUMKAN PROFIT, MARGIN, KOS BAHAN, HARGA SUPPLIER, ATAU MARKUP KEPADA CUSTOMER. Kalau customer tanya pasal cost / margin / profit / supplier price, jawab: "Maaf, harga yang kami quote sudah termasuk semua kos, kualiti material, dan jaminan kerja kami. Kami pastikan harga kompetitif berbanding pasaran."' },

  // Material cost vs sell
  { category: 'Internal — Tidak Untuk Customer', title: 'Markup wiring (kabel)',
    content: 'Cost kabel SIRIM 2.5mm² dari supplier: RM1.80-2.20/m. Kami quote RM3-5/m material + labour install. Margin material 60-120%. Margin labour ~RM180-280/hari per technician.' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Markup switch & socket',
    content: 'Schneider AvatarOn switch 1-gang cost RM10-14, sell RM18-25 (margin 60-80%). MK socket cost RM30-38, sell RM48-72 (margin 50-90%). Branded higher margin.' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Markup LED lighting',
    content: 'LED downlight 5W cost RM8-14, sell RM18-32 (margin 100-150%). 12W premium cost RM18-32, sell RM35-65 (margin 90-130%).' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Markup aircond electrical',
    content: 'Cost per point (kabel + isolator + MCB + labour 1 jam): RM85-130. Sell RM180-320 (1HP) / RM240-420 (2HP). Margin 80-180%.' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Markup solar PV',
    content: 'System 4kW: cost panel+inverter+mount+wiring ~RM12,500-15,500. Sell RM19,500-29,500. Margin RM7,000-14,000 (45-90%). Termasuk margin maintenance 5 tahun.' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Markup EV charger 7kW',
    content: 'Wallbox/Schneider unit cost RM1,800-2,500. Installation cost RM800-1,200. Total cost RM2,600-3,700. Sell RM3,800-6,800. Margin RM1,200-3,100 (35-80%).' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Markup CCTV 4-cam analog',
    content: 'Hardware cost (DVR + 4 cam + HDD + accessories): RM650-1,200. Installation labour: RM350-500. Total cost RM1,000-1,700. Sell RM1,500-3,200. Margin RM500-1,500 (35-95%).' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Margin call-out & hourly',
    content: 'Site visit RM50-100 untung 90% selepas tolak petrol. Hourly RM80-150: net RM55-105 selepas tolak transport + tools amortization. Emergency surcharge 100% net.' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Fleksibiliti diskaun',
    content: 'Boleh diskaun maksimum 10% kalau customer sound serius + bayar cash deposit. Jangan diskaun lebih 15% — tergores margin. Untuk repeat customer / referral, ok offer 5-10% loyalty.' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Supplier rahsia',
    content: 'Kabel: Federal Cables (Klang). Switch socket: Schneider via Power Plus Engineering. LED: Eubiq direct. Aircond accessories: York Distribution. Panel solar: SolarVest / Plus Xnergy. Jangan disclose nama supplier ke customer.' },
  { category: 'Internal — Tidak Untuk Customer', title: 'Threshold negotiation',
    content: 'Job <RM500: tak boleh diskaun. Job RM500-2000: max 5%. Job RM2000-10000: max 10%. Job >RM10000: max 15% dengan deposit 50% upfront. Sentiasa kira margin sebelum bagi diskaun.' },
]

const ALL = [...PUBLIC, ...INTERNAL]

;(async () => {
  // App name in package.json was changed to "syncera", so Electron's userData dir
  // is %APPDATA%/syncera (NOT wa-bizai anymore). Pick whichever DB exists.
  const candidates = [
    path.join(process.env.APPDATA, 'syncera',  'wa-bizai.db'),
    path.join(process.env.APPDATA, 'wa-bizai', 'wa-bizai.db'),
  ]
  const dbPath = candidates.find(p => fs.existsSync(p))
  if (!dbPath) { console.error('DB not found at any of:', candidates); return }
  console.log('Using DB:', dbPath)
  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const db = new SQL.Database(fs.readFileSync(dbPath))

  // Clear all electrical/business categories so reseed gives clean slate
  const categories = [...new Set(ALL.map(e => e.category))]
  for (const c of categories) {
    db.run('DELETE FROM knowledge_base WHERE category=?', [c])
  }

  // Insert
  let n = 0
  for (const e of ALL) {
    db.run('INSERT INTO knowledge_base (id,category,title,content,is_active,sort_order) VALUES (?,?,?,?,1,?)',
      [uuidv4(), e.category, e.title, e.content, n])
    n++
  }

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  db.close()

  const summary = {}
  for (const e of ALL) summary[e.category] = (summary[e.category] || 0) + 1
  console.log('Total entries:', ALL.length)
  console.log('Categories:')
  for (const [c, count] of Object.entries(summary)) console.log(`  ${c}: ${count}`)
})().catch(e => { console.error(e); process.exit(1) })
