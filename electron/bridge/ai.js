'use strict'

const axios = require('axios')

// Supported AI backends (local + free cloud)
const BACKENDS = {
  ollama:     { url: 'http://localhost:11434',          type: 'ollama' },
  lmstudio:   { url: 'http://localhost:1234',           type: 'openai' },
  jan:        { url: 'http://localhost:1337',           type: 'openai' },
  localai:    { url: 'http://localhost:8080',           type: 'openai' },
  duckduckgo: { url: 'https://duckduckgo.com/duckchat', type: 'duckduckgo' },  // FREE, no auth
  pollinations: { url: 'https://text.pollinations.ai', type: 'pollinations' },  // FREE, no auth
}

// DuckDuckGo AI Chat — free models. No API key needed.
const DDG_MODELS = [
  'gpt-4o-mini',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  'claude-3-haiku-20240307',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
  'o3-mini',
]
let ddgVqd = null

async function ddgGetVqd() {
  if (ddgVqd) return ddgVqd
  const r = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
    headers: { 'x-vqd-accept': '1', 'User-Agent': 'Mozilla/5.0' },
    timeout: 8000,
  })
  ddgVqd = r.headers['x-vqd-4']
  return ddgVqd
}

async function callDuckDuckGo(model, sysPrompt, ctx, userMessage) {
  const vqd = await ddgGetVqd()
  const messages = [
    { role: 'user', content: `${sysPrompt}\n\n${ctx.map(c => `${c.role}: ${c.content}`).join('\n')}\n\nuser: ${userMessage}\nassistant:` },
  ]
  const r = await axios.post('https://duckduckgo.com/duckchat/v1/chat', { model, messages }, {
    headers: { 'x-vqd-4': vqd, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/event-stream' },
    timeout: 60_000,
    responseType: 'text',
  })
  // DDG returns SSE stream as text body — parse "message" deltas
  const lines = String(r.data).split('\n')
  let out = ''
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const obj = JSON.parse(payload)
      if (obj.message) out += obj.message
    } catch {}
  }
  // Refresh vqd from response headers for next call
  if (r.headers['x-vqd-4']) ddgVqd = r.headers['x-vqd-4']
  return out.trim()
}

// Pollinations.ai — free, no auth, GET-based
const POLLINATIONS_MODELS = ['openai', 'mistral', 'llama', 'qwen', 'searchgpt', 'gemini']
async function callPollinations(model, sysPrompt, ctx, userMessage) {
  const messages = [
    { role: 'system', content: sysPrompt },
    ...ctx,
    { role: 'user', content: userMessage },
  ]
  const r = await axios.post('https://text.pollinations.ai/openai', {
    model, messages, temperature: 0.6, max_tokens: 600,
  }, { timeout: 60_000 })
  return (r.data?.choices?.[0]?.message?.content || '').trim()
}

let detectedBackend = null
let lastDetectTime = 0

// ─── Backend Detection ──────────────────────────────────────────────────────

async function detectBackends() {
  const now = Date.now()
  if (now - lastDetectTime < 10000 && detectedBackend) return detectedBackend

  const results = []
  try {
    const r = await axios.get(`${BACKENDS.ollama.url}/api/tags`, { timeout: 2000 })
    const models = (r.data?.models || []).map(m => m.name)
    if (models.length) results.push({ id: 'ollama', name: 'Ollama (Local)', url: BACKENDS.ollama.url, type: 'ollama', models })
  } catch (_) {}

  for (const [key, backend] of Object.entries(BACKENDS)) {
    if (['ollama', 'duckduckgo', 'pollinations'].includes(key)) continue
    try {
      const r = await axios.get(`${backend.url}/v1/models`, { timeout: 2000 })
      const models = (r.data?.data || []).map(m => m.id)
      if (models.length) {
        const names = { lmstudio: 'LM Studio', jan: 'Jan AI', localai: 'LocalAI' }
        results.push({ id: key, name: names[key] || key, url: backend.url, type: 'openai', models })
      }
    } catch (_) {}
  }

  // ── ALWAYS-AVAILABLE FREE CLOUD BACKEND ──────────────────────────────────
  // Pollinations.ai: free OpenAI/Mistral/Llama/Gemini — no API key, no auth, no quota
  // (DuckDuckGo dropped — they added JS challenge anti-bot that requires real browser)
  results.push({
    id: 'pollinations',
    name: '🌸 Pollinations AI (Free, no key)',
    url: BACKENDS.pollinations.url,
    type: 'pollinations',
    models: POLLINATIONS_MODELS,
  })

  lastDetectTime = now
  return results
}

async function getAvailableModels() { return await detectBackends() }

// ─── 🌐 Web Search Tool ─────────────────────────────────────────────────────
// AI can fetch live info from internet. Uses DuckDuckGo (no API key needed).

async function webSearch(query) {
  const results = []
  try {
    // 1. DuckDuckGo Instant Answer API (structured data)
    const ia = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_redirect: 1, no_html: 1, skip_disambig: 1 },
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WA-BizAI/1.0)' },
    }).catch(() => null)

    if (ia?.data) {
      if (ia.data.AbstractText) results.push({ title: ia.data.Heading || query, snippet: ia.data.AbstractText, url: ia.data.AbstractURL })
      if (ia.data.Answer)       results.push({ title: 'Answer', snippet: ia.data.Answer, url: '' })
      if (ia.data.Definition)   results.push({ title: 'Definition', snippet: ia.data.Definition, url: ia.data.DefinitionURL })
      const topics = (ia.data.RelatedTopics || []).filter(t => t.Text).slice(0, 3)
      for (const t of topics) results.push({ title: t.Text.split(' - ')[0], snippet: t.Text, url: t.FirstURL || '' })
    }
  } catch (_) {}

  // 2. HTML SERP fallback for richer results
  if (results.length < 2) {
    try {
      const html = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
      })
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
      let m, count = 0
      while ((m = re.exec(html.data)) && count < 5) {
        const title = m[2].replace(/<[^>]+>/g, '').trim()
        const snippet = m[3].replace(/<[^>]+>/g, '').trim()
        const url = decodeURIComponent((m[1].match(/uddg=([^&]+)/) || [])[1] || m[1])
        if (title && snippet) { results.push({ title, snippet, url }); count++ }
      }
    } catch (_) {}
  }

  return results.slice(0, 5)
}

// ─── 🛠️ Tool Loop: AI can request searches mid-reply ────────────────────────
// We embed a syntax: [SEARCH: query] in AI's response → resolve and re-prompt.

async function resolveTools(text, depth = 0) {
  if (depth > 2) return { text, sources: [] }
  const matches = [...text.matchAll(/\[SEARCH:\s*([^\]]+)\]/g)]
  if (!matches.length) return { text, sources: [] }

  const sources = []
  let resolvedContext = ''
  for (const m of matches.slice(0, 3)) {
    const q = m[1].trim()
    const results = await webSearch(q)
    sources.push({ query: q, results })
    resolvedContext += `\n[Search "${q}"]\n` + results.map((r, i) => `${i+1}. ${r.title}: ${r.snippet}`).join('\n')
  }
  return { resolvedContext, sources, hasSearches: true }
}

// ─── Reply Generation (Smart Agent) ─────────────────────────────────────────

async function generateReply({ message, history, knowledgeBase, persona, backendId, backendUrl, model, contact, businessProfile }) {
  const hasProfile = businessProfile && businessProfile.trim().length > 30
  const hasKB = knowledgeBase && knowledgeBase.length > 0
  const isProactiveOutreach = /\[AI_PROACTIVE_OUTREACH\]/i.test(message || '')

  // Build/update memory from history
  const jid = contact?.phone || contact?.id || 'unknown'
  rebuildMemoryFromHistory(jid, history)

  const cancelReply = generateCancelReply(message)
  if (!isProactiveOutreach && cancelReply) return cancelReply

  const alreadyInfoReply = generateAlreadyGaveInfoReply(message, history)
  if (!isProactiveOutreach && alreadyInfoReply) return alreadyInfoReply

  const discountReply = generateDiscountReply(message)
  if (!isProactiveOutreach && discountReply) return discountReply

  const emergencyReply = generateEmergencyReply(message, contact)
  if (!isProactiveOutreach && emergencyReply) return emergencyReply

  const checkingFeeReply = generateCheckingFeeReply(message)
  if (!isProactiveOutreach && checkingFeeReply) return checkingFeeReply

  const chandelierReply = generateChandelierReply(message, contact)
  if (!isProactiveOutreach && chandelierReply) return chandelierReply

  const aircondTripReply = generateAircondTripReply(message, contact)
  if (!isProactiveOutreach && aircondTripReply) return aircondTripReply

  const directFaultReply = generateDirectFaultReply(message, contact)
  if (!isProactiveOutreach && directFaultReply) return directFaultReply

  const bookingReply = generateBookingReply(message, history, contact)
  if (!isProactiveOutreach && bookingReply) return bookingReply

  const siteVisitReply = generateSiteVisitReply(message, contact, history)
  if (!isProactiveOutreach && siteVisitReply) return siteVisitReply

  const generalServiceReply = generateGeneralElectricalServiceReply(message, contact)
  if (!isProactiveOutreach && generalServiceReply) return generalServiceReply

  // ─── KB-first lookup: any message about services/products → match KB ────
  // Triggers on price/order/inquiry intent. Most reliable path when KB has pricing.
  const isDateChange = /\b(tukar|ubah|reschedule|postpone|pinda)\b/i.test(message || '') && /\b(tarikh|date|hari|masa|time|jam|pukul)\b/i.test(message || '')
  const recentlyQuoted = (history || []).slice(-6).some(m => m.is_from_me && /\bRM\s*\d+|harga|quote|quotation|kos\b/i.test(m.content || ''))
  const asksPriceNow = /\b(harga|price|berapa|cost|kos|charge|rate|cas|brapa|quotation|quote|sebut harga)\b/i.test(message || '')
  const isServiceQuery = !isProactiveOutreach && !isDateChange && !isGenericElectricalServiceRequest(message) && (!recentlyQuoted || asksPriceNow) && /\b(harga|price|berapa|cost|kos|charge|rate|cas|brapa|nak|order|book|pasang|install|tukar|repair|servis|service|baiki|bina|buat)\b/i.test(message || '')
  if (isServiceQuery && hasKB) {
    const kbAnswer = findKBPriceMatch(message, knowledgeBase, contact)
    if (kbAnswer) return kbAnswer
  }

  // ─── Hard fallback: no business setup → use smart template (NO LLM) ─────
  if (!hasProfile && !hasKB) {
    return await generateSmartFallback(message, contact, jid)
  }

  const backends = await detectBackends()
  const backend = backends.find(b => b.id === backendId) || backends[0]
  if (!backend) throw new Error('No local AI found. Please install Ollama or LM Studio.')

  const sysPrompt = buildSystemPrompt({ knowledgeBase, persona, contact, businessProfile, history, currentMessage: message })
  const ctxMessages = buildContextMessages(history, hasProfile)

  // Validate model: if user-saved model isn't available on the chosen backend
  // (e.g. they picked a DuckDuckGo model that no longer exists), fall back
  // to the first available model on this backend.
  let useModel = model
  if (!useModel || !backend.models.some(m => m === useModel || m.startsWith(useModel) || useModel.startsWith(m))) {
    useModel = backend.models[0]
    console.log(`[ai] Model "${model}" not on backend "${backend.id}" — using "${useModel}" instead`)
  }
  const useUrl = backendUrl || backend.url

  // ── Round 1: AI thinks, may emit [SEARCH: ...] tags ─────────────────────
  let aiText = await callAI(backend.type, useUrl, useModel, sysPrompt, ctxMessages, message)
  const tools = await resolveTools(aiText, 0)

  if (tools.hasSearches) {
    const followUpMsg = `User asked: "${message}"\n\nSearch results:${tools.resolvedContext}\n\nNow give the final concise reply to the user, incorporating these facts. Do NOT include [SEARCH:] tags this time.`
    aiText = await callAI(backend.type, useUrl, useModel, sysPrompt, ctxMessages, followUpMsg)
  }

  // Clean any leftover tool syntax + cap length defensively
  return sanitizeCustomerOutput(polishCustomerReply(aiText))
    .replace(/\[SEARCH:[^\]]+\]/g, '')
    .replace(/\[AI_PROACTIVE_OUTREACH\]/gi, '')
    .trim()
}

function analyseBookingState(message, history = []) {
  const customerTexts = (history || [])
    .filter(m => !m.is_from_me && (m.content || '').trim())
    .map(m => m.content || '')
  const current = (message || '').toLowerCase()
  const currentRaw = message || ''
  const all = [...customerTexts, currentRaw].join('\n').toLowerCase()

  const wantsVisit = /\b(datang|dtg|turun|come|visit|site visit|checking|check|cek|semak|tengok|periksa|technician|juruteknik)\b/i.test(current)
  const wantsReschedule = /\b(tukar|ubah|reschedule|postpone|pinda)\b/i.test(current) && /\b(tarikh|date|hari|masa|time|jam|pukul|may|mei|jan|feb|mac|apr|jun|jul|aug|ogo|sep|oct|okt|nov|dec|dis|\d{1,2})\b/i.test(current)
  const issue = inferIssueFromCustomerTexts([currentRaw])

  const timeSource = current
  const timeMatch = timeSource.match(/\b(?:jam|pukul)\s*(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)?\b/i)
    || timeSource.match(/\b(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)\b/i)
  let time = ''
  if (timeMatch) {
    const suffix = timeMatch[3] ? ` ${timeMatch[3]}` : ''
    time = `jam ${timeMatch[1]}${timeMatch[2] ? ':' + timeMatch[2] : ''}${suffix}`.trim()
  }

  const addressSignals = /\b(no\.?|nombor|jalan|jln|lorong|taman|kampung|kg|bandar|kota|tinggi|johor|selangor|kl|kuala|poskod|\d{5})\b/i
  const currentAddress = addressSignals.test(currentRaw) && /\d/.test(currentRaw) ? currentRaw : ''
  const historyAddress = [...customerTexts].reverse().find(t => addressSignals.test(t) && /\d/.test(t)) || ''
  const addressLine = currentAddress || (wantsReschedule ? historyAddress : '')
  const hasAddress = !!addressLine
  const confirmsTimeNow = /\b(datang\s+)?jam\s*\d{1,2}|boleh datang.*\d{1,2}|pukul\s*\d{1,2}|\besok\b|\bhari ini\b|\bmalam ni\b/i.test(current)
  const gaveAddressOrTime = !!currentAddress || !!time || /\besok|hari ini|malam ni|malam ini|tomorrow|today\b/i.test(current)

  const dateText = extractHumanDateText(current)
  return { wantsVisit, wantsReschedule, issue, time, dateText, hasAddress, addressLine: addressLine || '', gaveAddressOrTime, confirmsTimeNow }
}

function generateBookingReply(message, history, contact) {
  const state = analyseBookingState(message, history)
  if (!state.wantsVisit && !state.gaveAddressOrTime && !state.wantsReschedule) return null

  const current = (message || '').toLowerCase()
  if (state.wantsReschedule && (state.dateText || state.time)) {
    const when = [state.dateText, state.time].filter(Boolean).join(' ')
    if (state.hasAddress) {
      return `Baik tuan/puan, saya update appointment kepada ${when || 'tarikh/masa baru'} untuk checking ${state.issue}.\n\nLokasi masih sama seperti yang tuan/puan beri. Saya susun technician ikut jadual baru ini.`
    }
    return `Baik tuan/puan, saya update appointment kepada ${when || 'tarikh/masa baru'} untuk checking ${state.issue}.\n\nBoleh share lokasi penuh sekali supaya technician boleh terus ke tempat yang betul?`
  }
  if (state.wantsReschedule) {
    return `Baik tuan/puan, boleh. Nak tukar appointment ke tarikh dan jam berapa ya?\n\nSaya akan update jadual technician untuk checking ${state.issue}.`
  }

  const isCustomerProvidingSlot = state.gaveAddressOrTime && (
    state.confirmsTimeNow ||
    /\b(no\.?|nombor|jalan|jln|taman|kg|kampung|kota|tinggi|johor|\d{5})\b/i.test(current)
  )
  if (!isCustomerProvidingSlot) return null

  if (!state.time) {
    const whenText = state.dateText ? `pada ${state.dateText}` : 'untuk appointment ini'
    if (state.hasAddress) {
      return `Baik tuan/puan, saya dah terima lokasi ${whenText} untuk checking ${state.issue}.\n\nPukul berapa technician boleh datang?`
    }
    return `Baik tuan/puan, boleh. Pukul berapa technician boleh datang untuk checking ${state.issue}?`
  }

  const timeText = [state.dateText, state.time].filter(Boolean).join(' ')
  if (state.hasAddress) {
    return `Baik tuan/puan, saya dah terima lokasi dan masa ${timeText} untuk checking ${state.issue}.\n\nSaya susun technician datang ikut masa tersebut. Tolong pastikan ada orang di rumah dan elakkan reset breaker berkali-kali sementara tunggu kami sampai.`
  }
  return `Baik tuan/puan, saya reserve ${timeText} untuk checking ${state.issue}.\n\nBoleh share lokasi penuh rumah supaya technician boleh terus gerak ke tempat yang betul?`
}

function inferIssueFromCustomerTexts(texts = []) {
  const allCustomerText = (texts || []).join('\n').toLowerCase()
  if (/\b(trip|blackout|short|terputus|tiada elektrik|tak ada elektrik|elektrik trip|breaker|mcb|rccb|elcb|db|main switch)\b/i.test(allCustomerText)) {
    return 'troubleshoot elektrik rumah'
  }
  for (const raw of [...texts].reverse()) {
    const t = (raw || '').toLowerCase()
    if (/\b(lampu|light|downlight)\b/i.test(t)) return 'masalah lampu'
    if (/\b(kipas|fan)\b/i.test(t)) return 'masalah kipas'
    if (/\b(soket|socket|plug|point)\b/i.test(t)) return 'masalah soket'
  }
  return 'masalah elektrik'
}

function extractHumanDateText(text = '') {
  const t = String(text || '').toLowerCase()
  const numeric = t.match(/\b(\d{1,2})[\/\-. ](\d{1,2})(?:[\/\-. ](\d{2,4}))?\b/)
  if (numeric) {
    const year = numeric[3] ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : String(new Date().getFullYear())
    return `${numeric[1]}/${numeric[2]}/${year}`
  }
  const month = t.match(/\b(\d{1,2})\s*(jan(?:uari)?|feb(?:ruari)?|mac|apr(?:il)?|may|mei|jun|jul(?:ai)?|aug|ogo(?:s)?|sep(?:tember)?|oct|okt(?:ober)?|nov(?:ember)?|dec|dis(?:ember)?)\s*(\d{2,4})?\b/i)
  if (month) return `${month[1]} ${month[2]} ${month[3] || new Date().getFullYear()}`.trim()
  if (/\besok|tomorrow\b/i.test(t)) return 'esok'
  if (/\bhari ini|today|malam ni|malam ini\b/i.test(t)) return 'hari ini'
  return ''
}

function latestHistoryAddress(history = []) {
  const signals = /\b(no\.?|nombor|jalan|jln|lorong|taman|kampung|kg|bandar|kota|tinggi|johor|selangor|kl|kuala|poskod|\d{5})\b/i
  return [...(history || [])]
    .reverse()
    .filter(m => !m.is_from_me)
    .map(m => m.content || '')
    .find(t => signals.test(t) && /\d/.test(t)) || ''
}

function latestHistoryTime(history = []) {
  const line = [...(history || [])]
    .reverse()
    .filter(m => !m.is_from_me)
    .map(m => m.content || '')
    .find(t => /\b(?:jam|pukul)\s*\d{1,2}|\b\d{1,2}(?::\d{2})?\s*(pagi|tengahari|petang|malam|am|pm)\b/i.test(t))
  if (!line) return ''
  const m = line.match(/\b(?:jam|pukul)\s*(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)?\b/i)
    || line.match(/\b(\d{1,2})(?::(\d{2}))?\s*(pagi|tengahari|petang|malam|am|pm)\b/i)
  if (!m) return ''
  return `jam ${m[1]}${m[2] ? ':' + m[2] : ''}${m[3] ? ' ' + m[3] : ''}`.trim()
}

function generateCancelReply(message = '') {
  const m = String(message || '').toLowerCase()
  if (!/\b(cancel|batal|tak jadi|jangan datang|hold dulu|pause dulu|nanti dulu|postpone dulu)\b/i.test(m)) return null
  return `Baik tuan/puan, saya hold/cancel appointment itu dulu. Technician tidak akan datang sehingga tuan/puan confirm semula.\n\nKalau nak susun tarikh baru nanti, boleh mesej saya semula ya.`
}

function generateAlreadyGaveInfoReply(message = '', history = []) {
  const m = String(message || '').toLowerCase()
  if (!/\b(dah|sudah|already)\b/i.test(m) || !/\b(bagi|beri|share|hantar)\b/i.test(m) || !/\b(alamat|lokasi|masa|jam|tarikh)\b/i.test(m)) return null
  const address = latestHistoryAddress(history)
  const time = latestHistoryTime(history)
  if (address || time) {
    return `Maaf tuan/puan, betul, saya dah nampak info yang tuan/puan beri tadi.\n\n${address ? `Lokasi: ${address}` : ''}${address && time ? '\n' : ''}${time ? `Masa: ${time}` : ''}\n\nTak perlu hantar semula kecuali ada perubahan.`
  }
  return `Maaf tuan/puan, saya semak semula chat tadi. Kalau maklumat itu belum masuk jelas di pihak saya, boleh hantar sekali lagi secara ringkas supaya technician tak tersalah lokasi/masa.`
}

function generateDiscountReply(message = '') {
  const m = String(message || '').toLowerCase()
  if (!/\b(diskaun|discount|kurang|murah|best price|harga baik|nego|nego)\b/i.test(m)) return null
  return `Boleh tuan/puan, saya boleh cuba semak harga terbaik ikut scope kerja.\n\nBoleh confirm dulu kerja apa, berapa unit/point, dan kawasan lokasi? Lepas jelas scope, saya tengok ruang diskaun yang sesuai.`
}

function generateEmergencyReply(message = '', contact) {
  const m = String(message || '').toLowerCase()
  const urgent = /\b(emergency|urgent|sekarang|now|tak boleh naik|tak boleh on|tak hidup langsung|blackout|bau hangit|terbakar|spark|percik|db panas|bunyi buzz|buzzing)\b/i.test(m)
  const electrical = /\b(elektrik|trip|db|mcb|elcb|rccb|breaker|main switch|soket|socket|wiring|power)\b/i.test(m)
  if (!urgent || !electrical) return null
  const name = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''
  const hi = name ? `Hi ${name}.` : 'Baik tuan/puan.'
  if (/\b(db panas|bunyi buzz|buzzing|bau hangit|terbakar|spark|percik)\b/i.test(m)) {
    return `${hi} Ini boleh jadi risiko bahaya, elakkan sentuh DB/soket itu dulu dan jangan reset breaker berkali-kali.\n\nKalau selamat, matikan appliance berat dan jauhkan orang dari kawasan tersebut. Share lokasi penuh sekarang, saya susun checking urgent dengan technician.`
  }
  return `${hi} Untuk emergency elektrik trip tak boleh naik, jangan reset breaker berkali-kali dulu.\n\nBoleh share lokasi penuh dan nombor rumah/kedai sekarang? Saya semak availability technician untuk datang checking secepat mungkin.`
}

function generateCheckingFeeReply(message = '') {
  const m = String(message || '').toLowerCase()
  const asksCheckingFee = /\b(caj|harga|berapa|kos|charge|fee|rate)\b/i.test(m)
    && /\b(datang|site visit|visit|check|checking|semak|inspect|inspection|tengok)\b/i.test(m)
    && !/\b(aircond|cuci|kimia|chemical)\b/i.test(m)
  if (!asksCheckingFee) return null
  return `Untuk caj datang/checking sahaja, saya kena semak ikut kawasan lokasi dan jenis masalah dulu.\n\nBoleh share kawasan atau alamat ringkas? Lepas itu saya boleh confirm caj call-out/checking sebelum technician datang.`
}

function generateChandelierReply(message = '', contact) {
  const m = String(message || '').toLowerCase()
  if (!/\b(chandelier|candelier|lampu gantung)\b/i.test(m)) return null
  const name = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''
  const hi = name ? `Hi ${name}.` : 'Baik tuan/puan.'
  return `${hi} Boleh, kami boleh semak pemasangan chandelier.\n\nUntuk siling tinggi, saya perlu tahu anggaran tinggi siling, berat/saiz chandelier, jenis siling, dan sama ada akses tangga/scaffold mudah. Kalau boleh share gambar tempat dan chandelier, saya boleh bagi anggaran yang lebih tepat.`
}

function generateAircondTripReply(message = '', contact) {
  const m = String(message || '').toLowerCase()
  if (!/\b(aircond|air cond|ac)\b/i.test(m) || !/\b(trip|jatuh|terputus|tak boleh on|padam)\b/i.test(m)) return null
  const name = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''
  const hi = name ? `Hi ${name}.` : 'Baik tuan/puan.'
  return `${hi} Kalau aircond trip setiap kali ON, punca boleh datang dari wiring/isolator/MCB/RCCB atau fault dalaman aircond seperti compressor.\n\nKami boleh check bahagian elektrik dulu: isolator, soket/supply, wiring dan DB. Bila ON aircond, yang jatuh breaker DB rumah atau breaker aircond sahaja?`
}

function generateDirectFaultReply(message, contact) {
  const m = (message || '').toLowerCase()
  const name = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''
  const hi = name ? `Hi ${name}.` : 'Baik tuan/puan.'

  if (/\b(water heater|heater|pemanas air)\b/i.test(m) && /\b(trip|jatuh|terputus|short)\b/i.test(m)) {
    return `${hi} Kalau elektrik trip bila buka water heater, biasa punca dari leakage ke bumi, element heater rosak, isolator/socket bermasalah, atau RCCB/ELCB yang detect fault.\n\nUntuk keselamatan, jangan guna water heater itu dulu. Boleh share lokasi dan gambar DB/isolator water heater supaya kami boleh arrange checking.`
  }

  if (/\b(wifi|router|modem|onu|network|internet)\b/i.test(m) && /\b(trip|elektrik|power|terputus|padam)\b/i.test(m)) {
    return `${hi} Kalau WiFi terganggu bila elektrik trip, kami boleh check bahagian elektrik yang supply ke router/office seperti soket, DB, breaker atau UPS.\n\nBila masalah berlaku, breaker DB jatuh atau router sahaja yang mati? Share lokasi dan gambar DB/soket router kalau ada.`
  }

  if (/\b(elektrik|db|mcb|elcb|rccb|main switch|power|karan)\b/i.test(m) && /\b(trip|jatuh|terputus|padam|blackout|short)\b/i.test(m)) {
    return `${hi} Kalau elektrik trip berulang, biasanya punca dari beban berlebihan, leakage ke bumi, appliance rosak, wiring lembap, atau MCB/RCCB yang sudah lemah.\n\nUntuk keselamatan, jangan reset berkali-kali. Boleh matikan semua suis besar/appliance berat dulu, kemudian share lokasi dan bila trip berlaku supaya kami boleh arrange checking.`
  }

  if (/\b(lampu|light|downlight)\b/i.test(m) && /\b(berkelip|kelip|malap|padam|rosak)\b/i.test(m)) {
    return `${hi} Masalah lampu berkelip atau malap biasanya datang dari sambungan longgar, driver/ballast rosak, neutral tak stabil, atau bekalan voltan tak cantik.\n\nBoleh share jenis lampu dan kawasan mana yang bermasalah? Kalau ada video pendek, lagi mudah untuk kami semak sebelum datang.`
  }

  if (/\b(soket|socket|plug|point)\b/i.test(m) && /\b(panas|hangit|spark|percik|longgar|rosak|tak hidup)\b/i.test(m)) {
    return `${hi} Kalau soket panas, berbau hangit, longgar atau keluar spark, jangan guna soket itu dulu sebab risiko overheating.\n\nBoleh share gambar soket dan appliance apa yang biasa digunakan di situ? Kami boleh semak sama ada perlu tukar soket, wiring, atau breaker.`
  }

  return null
}

function isGenericElectricalServiceRequest(message = '') {
  const m = String(message || '').toLowerCase().trim()
  if (!m) return false
  const asksGenericService = /\b(nak|mahu|mau|perlu|need|want|cari|looking)\b/i.test(m)
    && /\b(servis|service|repair|baiki|check|checking|maintenance)\b/i.test(m)
    && /\b(elektrik|electrical|wiring|power)\b/i.test(m)
  if (!asksGenericService) return false

  const hasSpecificIssue = /\b(trip|blackout|short|terputus|tiada elektrik|tak ada elektrik|lampu|kipas|soket|socket|plug|point|db|mcb|elcb|rccb|main switch|breaker|wiring|wayar|pendawaian|aircond|isolator|panas|hangit|spark|berkelip|rosak|pasang|install|tukar)\b/i.test(m)
  const asksPrice = /\b(harga|price|berapa|cost|kos|charge|rate|cas|quotation|quote|sebut harga)\b/i.test(m)
  return !hasSpecificIssue && !asksPrice
}

function generateGeneralElectricalServiceReply(message, contact) {
  if (!isGenericElectricalServiceRequest(message)) return null
  const name = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''
  const greet = name ? `Hi ${name}.` : 'Baik tuan/puan.'
  return `${greet} Boleh, kami boleh bantu untuk servis elektrik.\n\nBoleh saya tahu servis ni untuk rumah/kedai dan masalah apa ya? Contohnya elektrik trip, lampu/kipas, soket, wiring atau DB. Share kawasan lokasi sekali supaya saya boleh semak sama ada perlu checking atau boleh terus bagi anggaran.`
}

function polishCustomerReply(text = '') {
  let out = String(text || '').trim()
  const replacements = [
    [/\bBagaimana hari Anda\b/gi, 'Apa khabar tuan/puan'],
    [/\bAnda\b/g, 'tuan/puan'],
    [/\banda\b/g, 'tuan/puan'],
    [/\bkamu\b/gi, 'tuan/puan'],
    [/\bbisnis\b/gi, 'bisnes'],
    [/\bpertanyaan\b/gi, 'soalan'],
    [/\bsolusi\b/gi, 'penyelesaian'],
    [/\bdisebabkan oleh\b/gi, 'berpunca daripada'],
    [/\bmenyalakan kembali\b/gi, 'hidup semula'],
    [/\bmesin panel\b/gi, 'panel elektrik'],
    [/\bpapan pembuka arus\b/gi, 'breaker/MCB'],
    [/\bsekering\b/gi, 'fius'],
    [/\bahli kejuruteraan elektrik\b/gi, 'juruteknik elektrik'],
    [/\bPanggil ahli kejuruteraan elektrik\b/gi, 'Hubungi juruteknik elektrik'],
    [/\bJangan gunakan\b/gi, 'Elakkan guna'],
  ]
  for (const [re, val] of replacements) out = out.replace(re, val)

  out = out
    .replace(/^\s*Salam sejahtera!\s*\n+/i, 'Baik tuan/puan. ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // If model still writes a helpdesk article, trim to a WhatsApp-sized technical answer.
  const lines = out.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length > 8 || out.length > 900) {
    out = lines.slice(0, 7).join('\n')
  }
  return out
}

function hasInternalLeak(text = '') {
  return /\b(margin|markup|profit|untung|supplier|harga supplier|kos bahan|threshold|deposit\s*50|rm500|rm2000|rm10000|internal|rahsia|tidak untuk customer)\b/i.test(String(text || ''))
    || /\b(Soalan biasa|Masalah\/intent|Kategori tempat|Tahap risiko|Cadangan awal|Cara jawab pelanggan)\b/i.test(String(text || ''))
}

function sanitizeCustomerOutput(text = '') {
  let out = String(text || '').trim()
  if (!out) return out
  if (hasInternalLeak(out)) {
    if (/\b(diskaun|discount|kurang|murah|best price|nego)\b/i.test(out)) {
      return generateDiscountReply('boleh bagi diskaun') || ''
    }
    return `Baik tuan/puan, saya semak semula supaya maklumat yang diberi tepat.\n\nBoleh share detail ringkas tentang kerja elektrik yang diperlukan dan kawasan lokasi? Saya akan bantu susun jawapan atau quotation yang sesuai.`
  }
  return out
}

function generateSiteVisitReply(message, contact, history = []) {
  const m = (message || '').toLowerCase()
  const wantsUsToCome = /\b(datang|dtg|come|visit|turun|onsite|on-site|site|rumah saya|kedai saya|tempat saya|sini|lokasi saya)\b/i.test(m)
  const wantsChecking = /\b(check|checking|cek|semak|inspect|inspection|troubleshoot|tengok|periksa|diagnose|diagnosis)\b/i.test(m)
  const asksPriceOnly = /\b(harga|berapa|kos|price|rate|charge|quotation|quote|sebut harga)\b/i.test(m)
  if (!(wantsUsToCome && (wantsChecking || /\b(baiki|repair|servis|service)\b/i.test(m))) || asksPriceOnly) return null

  const name = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''
  const greeting = name ? `Hi ${name}!` : 'Baik tuan/puan.'
  const issue = /\b(trip|blackout|short|tiada elektrik|tak ada elektrik)\b/i.test(m)
    ? 'masalah elektrik trip/terputus'
    : /\b(lampu|light)\b/i.test(m)
      ? 'masalah lampu'
      : /\b(kipas|fan)\b/i.test(m)
        ? 'masalah kipas'
        : 'masalah elektrik tersebut'

  const booking = analyseBookingState(message, history)
  if (booking.hasAddress && booking.time) {
    return `Baik tuan/puan, saya dah terima lokasi dan masa ${booking.time} untuk checking ${issue}.\n\nSaya susun technician datang ikut masa tersebut. Sementara tunggu kami sampai, elakkan reset breaker berkali-kali ya.`
  }
  if (booking.hasAddress) {
    return `${greeting} Boleh, kami boleh datang untuk checking ${issue} di lokasi yang tuan/puan beri.\n\nMasa yang sesuai untuk technician datang bila ya?`
  }
  return `${greeting} Boleh, kami boleh datang untuk checking ${issue}.\n\nBoleh share lokasi penuh dan masa yang sesuai? Kalau ada gambar/video DB atau kawasan yang bermasalah, boleh hantar sekali supaya technician kami boleh prepare awal.`
}

// ─── Conversation Memory (per JID) ──────────────────────────────────────────
// Tracks what's been said so AI doesn't loop "boleh share detail?" forever.

const convMemory = new Map()  // jid → { subjects: Set, locationGiven: boolean, priceAnswered: boolean, clarifyAttempts: int }

function getMemory(jid) {
  if (!convMemory.has(jid)) {
    convMemory.set(jid, {
      subjects: new Set(),
      locationGiven: false,
      city: null,
      priceAnswered: new Set(),
      clarifyAttempts: 0,
      lastSubject: null,
    })
  }
  return convMemory.get(jid)
}

function rebuildMemoryFromHistory(jid, history) {
  const mem = getMemory(jid)
  // Only rebuild from CUSTOMER messages (is_from_me=0); don't poison from old AI replies
  for (const msg of (history || [])) {
    if (msg.is_from_me) continue
    const text = msg.content || ''
    const subj = extractSubject(text)
    if (subj) { mem.subjects.add(subj); mem.lastSubject = subj }
    const c = extractCity(text)
    if (c) { mem.locationGiven = true; mem.city = c }
  }
}

const lastReplies = new Map()  // jid → last reply (avoid repeating)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

async function generateSmartFallback(message, contact, jid) {
  const rawName = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''
  const name = rawName || ''
  const You = name || 'anda'
  const m = (message || '').toLowerCase().trim()

  const mem = getMemory(jid)

  // ── Frustration detector — escalate, don't push template ──
  const isFrustrated = /\b(bodoh|stupid|tolol|bahalol|babi|sial|lancau|hadui|haduh|penat|bosan|tak faham|bengong|dungu|gila|geram|babiii|babi+|dah berkali|lain kali|lagi sekali|buat apa|x faham|ulang|ulang ulang|sama je|same je)\b/i.test(m)
  if (isFrustrated) {
    mem.clarifyAttempts = 99  // stop further clarification loops
    return pick([
      `Maaf sangat ${name} 🙏 saya patut respond lebih baik. Owner kami akan reply ${You} terus secepat mungkin.`,
      `Sorry ${name}, saya akan eskalasi ke admin untuk reply ${You} terus dengan info yang specific. Sekejap ya.`,
      `Aduh, maaf bila reply tadi tak membantu ${name}. Saya akan susulkan ke owner — dia akan reply ${You} sendiri.`,
    ])
  }

  // ── Subject: prefer current msg, else use memory's last known ──
  const currentSubject = extractSubject(m)
  if (currentSubject) { mem.subjects.add(currentSubject); mem.lastSubject = currentSubject }
  const subject = currentSubject || mem.lastSubject

  // ── City: check current msg + memory ──
  const currentCity = extractCity(m)
  if (currentCity) { mem.locationGiven = true; mem.city = currentCity }
  const city = currentCity || mem.city

  // Detect intent
  const isComplaint = /\b(salah|bukan|tak betul|wrong|incorrect|complain|tak puas|tak sesuai)\b/i.test(m)
  const isPrice     = /\b(harga|price|berapa|cost|kos|charge|rate|cas|brapa)\b/i.test(m)
  const isOrder     = /\b(nak|order|book|pesan|tempah|beli|purchase|tempahan|booking)\b/i.test(m)
  const isAsking    = /\b(servis|service|services|ada|boleh|jasa|provide|sediakan|tawarkan)\b/i.test(m)
  const isGreeting  = /^(hai|hi|hello|helo|asalam|assalam|salam|good|hey|yo)\b/i.test(m)
  const isThanks    = /\b(terima kasih|thanks|tq|thank you)\b/i.test(m)
  const isYesNo     = /^(ye|ya|yes|ok|okay|baik|tak|no|nope|tidak)\b/i.test(m)
  const isShort     = m.length < 6

  // ───── PRICE QUESTION → SEARCH INTERNET, GIVE PRICE DIRECTLY ─────
  if (isPrice) {
    // Build search query — use whatever context we have, don't ask back
    const topic = subject || extractFreeText(m) || 'servis'
    const cacheKey = `${topic}|${city||'general'}`

    // Already answered for this topic+city — pivot to closing
    if (mem.priceAnswered.has(cacheKey)) {
      const r = pick([
        `Harga pasaran ${topic} dah saya share tadi ya. Nak saya susulkan order untuk ${You}, atau ada soalan lain?`,
        `Pasal harga ${topic} dah explain tadi. ${You} nak proceed atau ada specs lain yang nak ditanya?`,
        `Macam yang saya kongsi tadi pasal ${topic}. Boleh saya tolong arrange untuk ${You}?`,
      ])
      lastReplies.set(jid, r); return r
    }

    // Search market prices — multiple query variants for best chance
    const queries = []
    if (city && subject) {
      queries.push(`harga ${subject} ${city} Malaysia`, `${subject} price ${city}`, `kos ${subject} ${city}`)
    }
    if (subject) {
      queries.push(`harga ${subject} Malaysia 2025`, `${subject} price malaysia`, `harga pasaran ${subject}`)
    }
    if (!subject) {
      queries.push(`harga ${topic} Malaysia`, `${topic} price malaysia`)
    }

    let results = []
    for (const q of queries) {
      try {
        const r = await webSearch(q)
        if (r && r.length) { results = r; break }
      } catch (e) { console.error('[ai] webSearch:', e.message) }
    }

    if (results.length) {
      const top = results.slice(0, 4)
      const bullets = top.map(r => `• ${(r.snippet || '').slice(0, 200).replace(/\s+/g, ' ').trim()}`).filter(b => b.length > 5).join('\n')
      mem.priceAnswered.add(cacheKey)
      const where = city ? ` di ${city}` : ' di Malaysia'
      const reply = `Berdasarkan harga pasaran${where} untuk ${topic}:\n\n${bullets}\n\n💡 Ni harga pasaran je ya — untuk quote actual dari kami, boleh confirm scope kerja dengan ${You}. Nak proceed?`
      lastReplies.set(jid, reply); return reply
    }

    // Search returned nothing — give honest answer, don't ask back
    const r = `Hmm, saya tak jumpa info harga pasaran tepat untuk ${topic}${city?` di ${city}`:''} dalam carian. Saya akan susulkan dengan team kami untuk quote khas — sekejap ya 🙏`
    lastReplies.set(jid, r); return r
  }

  let candidates = []

  if (isComplaint) {
    candidates = [
      `Maaf sangat ${name}! 🙏 Boleh ceritakan apa yang patut diperbetulkan? Saya akan cuba bantu lagi.`,
      `Aduh, sorry ${name}. Boleh ${You} jelaskan sikit apa yang silap? Saya akan tolong betulkan.`,
      `Maaf ya ${name} kalau jawapan tadi tak tepat. Apa sebenarnya yang ${You} cari? Saya akan reply lebih jelas.`,
    ]
  } else if (isOrder && subject) {
    if (mem.locationGiven) {
      candidates = [
        `Best ${name}! Untuk ${subject}, saya akan susulkan dengan team — confirm availability dan timeline. Sekejap ya.`,
        `Noted ${subject} ya ${name}. Saya susul team untuk arrangement. Tunggu sekejap.`,
      ]
    } else {
      candidates = [
        `Best ${name}! Untuk ${subject}, boleh share lokasi kerja & masa preferred? Saya akan susulkan dengan team.`,
        `Noted untuk ${subject} ya ${name}. Lokasi mana, dan bila timeline yang ${You} fikir?`,
      ]
    }
  } else if (isOrder) {
    candidates = [
      `Best ${name}! Apa specifically yang nak di-book?`,
      `Terima kasih berminat ${name} 🙏 Detail sikit boleh — apa yang ${You} cari?`,
    ]
  } else if (isAsking && subject) {
    if (mem.subjects.has(subject) && mem.clarifyAttempts >= 1) {
      // Already clarifying — pivot to action
      candidates = [
        `Untuk ${subject}, saya akan susulkan dengan team kami. Boleh share kontak & lokasi terbaik untuk follow-up?`,
        `${name}, pasal ${subject} — kalau ${You} berminat, saya boleh arrange consultation. Bila masa sesuai?`,
      ]
    } else {
      mem.clarifyAttempts++
      candidates = [
        `Untuk ${subject}, ya kami sediakan. ${mem.locationGiven ? 'Apa specifically yang dicari?' : 'Lokasi kerja di mana?'}`,
        `Re: ${subject} — kami ada. ${mem.locationGiven ? 'Boleh detail apa yang ' + You + ' nak?' : You + ' base di mana?'}`,
      ]
    }
  } else if (isAsking) {
    candidates = [
      `Boleh ceritakan apa yang ${You} cari? Saya akan tolong cari yang sesuai.`,
    ]
  } else if (isGreeting || (isShort && !currentSubject)) {
    // FORMAL first-contact greeting — use "Encik/Cik" not customer's pushname (often misleading)
    // Ask qualifying questions: nature of issue, location, severity
    const isFirstContact = (mem.subjects.size === 0) && !mem.locationGiven
    if (isFirstContact) {
      candidates = [
        `Ye, Encik / Cik 🙏\n\nTerima kasih kerana menghubungi kami. Apa yang boleh kami bantu ya?\n\nUntuk memudahkan kami susulkan, mohon kongsikan:\n• Jenis kerosakan / perkhidmatan yang diperlukan\n• Lokasi (bandar / kawasan)\n• Tahap kerosakan (sedikit / sederhana / serius)\n\nKami akan respond secepat mungkin.`,
        `Salam sejahtera Encik / Cik 🙏\n\nTerima kasih menghubungi kami. Bagaimana kami boleh membantu hari ini?\n\nBoleh ceritakan sedikit:\n• Apa masalah yang dihadapi?\n• Di mana lokasi anda?\n• Berapa serius kerosakannya?\n\nMaklumat ini membantu kami berikan cadangan yang tepat.`,
        `Selamat sejahtera 🙏\n\nYe, Encik / Cik, apa yang boleh kami bantu ya?\n\nSila kongsikan:\n• Jenis kerja / kerosakan\n• Lokasi (untuk anggaran masa & kos)\n• Tahap urgency\n\nKami sedia membantu.`,
      ]
    } else {
      candidates = [
        `Ye, Encik / Cik, apa lagi yang boleh kami bantu? 🙏`,
        `Boleh, Encik / Cik. Apa yang anda perlukan sekarang?`,
        `Sila Encik / Cik, kami sedia membantu.`,
      ]
    }
  } else if (isThanks) {
    candidates = [
      `Sama-sama ${name} 🙏 Ada apa-apa lagi yang boleh saya bantu?`,
      `Welcome ${name}! Bila-bila masa boleh tanya 😊`,
    ]
  } else if (isYesNo) {
    candidates = [
      `Noted ${name}. Apa next step?`,
      `Ok ${name}, lepas ni macam mana?`,
    ]
  } else if (subject) {
    candidates = [
      `${name}, pasal ${subject} — apa yang ${You} nak tahu specifically?`,
      `Re: ${subject}, ${You} cari yang macam mana?`,
    ]
  } else {
    candidates = [
      `Terima kasih message kami ${name}! Boleh share sikit detail apa yang dicari?`,
      `Hi ${name}, boleh ceritakan apa yang ${You} perlukan?`,
    ]
  }

  // Avoid repeating last reply for this contact
  const last = lastReplies.get(jid)
  let pool = candidates.filter(c => c !== last)
  if (!pool.length) pool = candidates
  const reply = pick(pool)
  lastReplies.set(jid, reply)
  return reply
}

// Strict subject extraction — ONLY match known business keywords. No random word grab.
const SUBJECT_KEYWORDS = [
  'aircond','air-cond','airconditioner','aircon',
  'wiring','elektrik','electric','electrical',
  'lampu','soket','plug','breaker','elcb','mcb','genset','ups','solar',
  'installation','install','penyaman udara',
  'baju','seluar','tudung','kasut','beg','barang','produk',
  'makanan','katering','catering','kek','kuih','minuman',
  'hantaran','perkahwinan','wedding','event','majlis',
  'tuition','kelas','course','training','workshop',
  'website','app','design','logo','poster','editing',
  'service','servis','repair','maintenance','quotation','quote',
  'plumbing','paip','tandas','sinki','toilet',
  'cleaning','cuci','vacuum',
  'paint','cat','renovation','renovate','renovasi',
]
const SUBJECT_NORMALIZE = {
  'air-cond': 'aircond', 'aircon': 'aircond', 'airconditioner': 'aircond', 'penyaman udara': 'aircond',
  'electric': 'elektrik', 'electrical': 'elektrik',
  'service': 'servis',
}

function extractSubject(text) {
  if (!text) return null
  const t = text.toLowerCase()
  for (const k of SUBJECT_KEYWORDS) {
    const re = new RegExp(`\\b${k.replace(/-/g, '[-\\s]?')}\\b`, 'i')
    if (re.test(t)) return SUBJECT_NORMALIZE[k] || k
  }
  return null  // STRICT: no random fallback grab
}

// Comprehensive Malaysian location detector
const MY_CITIES = [
  // Major cities
  'kuala lumpur','kl','selangor','johor','penang','pulau pinang','melaka','perak','pahang','kedah','kelantan','terengganu','sabah','sarawak','perlis','negeri sembilan',
  'putrajaya','cyberjaya','shah alam','petaling jaya','pj','subang','klang','ampang','cheras','kajang','seri kembangan','bangi','nilai','seremban','ipoh','kuantan','alor setar','kota bharu','jb','johor bahru',
  // Smaller towns
  'kota tinggi','kota damansara','kota kemuning','kota raya','kota bahru','kota kinabalu','kota marudu','kota belud','kota samarahan',
  'taiping','sungai petani','kulim','bukit mertajam','nibong tebal','butterworth','batu pahat','muar','kluang','segamat','pontian','kulai','pasir gudang','tampoi','skudai','iskandar puteri','nusajaya','simpang renggam','yong peng','ayer hitam',
  'tawau','sandakan','lahad datu','keningau','beaufort','papar','tuaran','semporna','kudat',
  'miri','sibu','bintulu','mukah','sri aman','sarikei','kapit','limbang','lawas','kuching','samarahan','kota samarahan',
  'kuala terengganu','dungun','kemaman','besut','marang',
  'machang','tumpat','pasir mas','rantau panjang',
  'kuala lipis','jerantut','temerloh','mentakab','raub','bentong','kuala krau','muadzam shah','rompin',
  'kangar','padang besar','arau','kaki bukit',
  'tanjung malim','teluk intan','manjung','sitiawan','batu gajah','lumut','kampar','tapah','kuala kangsar','gerik',
  // Common KL areas
  'mont kiara','bangsar','ttdi','damansara','sri petaling','desa parkcity','setapak','wangsa maju','kepong','sentul','titiwangsa','taman tun','sri hartamas','dutamas','setiawalk','puchong','seri kembangan','damansara perdana',
]
const CITY_RE = new RegExp(`\\b(${MY_CITIES.map(c => c.replace(/\s+/g, '\\s+')).join('|')})\\b`, 'i')

function extractCity(text) {
  if (!text) return null
  const m = text.toLowerCase().match(CITY_RE)
  if (m) return m[1].replace(/\s+/g, ' ')
  // Generic pattern: "Kampung X", "Taman X", "Bandar X" — single follow-up word
  const generic = text.toLowerCase().match(/\b(?:kampung|kampong|taman|bandar)\s+([a-z]+)/i)
  if (generic) return `${generic[0]}`
  return null
}

// Match user's price question against KB entries — return formatted answer if matched.
// Malay ↔ English synonyms for KB matching. Lowercase, single words or short phrases.
const KB_SYNONYMS = [
  ['point', 'soket', 'socket', 'plug', 'plak', 'outlet'],
  ['elektrik', 'electric', 'electrical', 'letrik', 'power', 'kuasa'],
  ['lampu', 'light', 'bulb', 'lighting', 'mentol'],
  ['pasang', 'install', 'installation', 'pemasangan', 'fix', 'sediakan'],
  ['aircond', 'ac', 'penyaman', 'air-cond', 'aircon', 'air'],
  ['wiring', 'wayar', 'wire', 'kabel', 'cable'],
  ['rumah', 'home', 'house', 'kediaman'],
  ['kedai', 'shop', 'store', 'kilang', 'factory', 'office', 'pejabat'],
  ['tukar', 'replace', 'change', 'gantikan'],
  ['baiki', 'repair', 'fix', 'membaiki', 'service', 'servis'],
  ['db', 'mainboard', 'distribution', 'switchboard', 'meter'],
  ['elcb', 'rccb', 'safety', 'breaker'],
  ['solar', 'panel surya'],
  ['cctv', 'kamera', 'camera', 'surveillance'],
  ['fan', 'kipas', 'siling'],
  ['water heater', 'pemanas air', 'heater'],
  ['ev charger', 'ev', 'kereta elektrik', 'tesla', 'charger'],
]

// Build a quick lookup: each word → canonical set of synonyms
const SYN_LOOKUP = (() => {
  const map = new Map()
  for (const group of KB_SYNONYMS) for (const w of group) map.set(w, new Set(group))
  return map
})()

// Expand a token set with all its synonyms
function expandSynonyms(words) {
  const out = new Set()
  for (const w of words) {
    out.add(w)
    const syns = SYN_LOOKUP.get(w)
    if (syns) for (const s of syns) out.add(s)
  }
  return out
}

// Stopwords for tokenising
const KB_STOPWORDS = new Set([
  'harga','berapa','brapa','kos','price','cost','charge','rate','cas','quote',
  'untuk','di','ke','dari','dengan','dan','atau','yang','ini','itu','tu','ni',
  'la','lah','je','jer','sahaja','saja','sikit','tolong','dah','dahla',
  'aku','saya','kau','engkau','kamu','dia','kita','kami','korang',
  'a','an','the','to','of','in','on','at','for','about','please','sila',
  'apa','macam','mana','bila','siapa','kena','perlu','nak','mahu',
  'boleh','can','bagi','beri','beritahu','tahu','tanya',
  // generic words found in too many KB titles — too noisy if matched
  'baru','setiap','dengan','dalam','untuk',
])

function tokeniseQuery(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(w => w.length >= 2 && !KB_STOPWORDS.has(w))
}

function detectPricingIntent(text) {
  const m = (text || '').toLowerCase()
  const has = (re) => re.test(m)
  if (has(/\b(caj|harga|berapa|kos|charge|fee|rate)\b/i) && has(/\b(datang|site visit|visit|check|checking|semak|inspect|inspection|tengok)\b/i) && !has(/\b(aircond|cuci|kimia|chemical)\b/i)) return 'checking_fee'
  if (has(/\b(maintenance|maintain|contract|kontrak|tahunan|annual|periodic|berkala)\b/i)) return 'maintenance'
  if (has(/\b(kipas|fan|ceiling fan|exhaust fan)\b/i)) return 'fan'
  if (has(/\b(lampu|light|lighting|downlight|spotlight|bulb|mentol)\b/i)) return 'light'
  if (has(/\b(troubleshoot|trouble shoot|check|checking|cek|semak|inspect|inspection|masalah|problem|rosak|fault|trip|blackout|short|tiada elektrik|tak ada elektrik|repair|baiki|servis)\b/i)) return 'troubleshoot'
  if (has(/\b(soket|socket|plug|power point|point elektrik|outlet)\b/i)) return 'socket'
  if (has(/\b(wiring|wayar|pendawaian|rewiring|cable|kabel)\b/i)) return 'wiring'
  if (has(/\b(db|mcb|elcb|rccb|main switch|breaker|distribution board)\b/i)) return 'db'
  if (has(/\b(aircond|air cond|ac|isolator)\b/i)) return 'aircond'
  return 'general'
}

function entryMatchesPricingIntent(entry, intent) {
  if (!entry || intent === 'general') return true
  const hay = `${entry.category || ''} ${entry.title || ''} ${entry.content || ''}`.toLowerCase()
  const title = (entry.title || '').toLowerCase()
  if (intent === 'checking_fee') {
    if (/\b(aircond|cuci|kimia|chemical|maintenance|contract|kontrak|tahunan|annual)\b/i.test(hay)) return false
    return /\b(checking|check|semak|inspect|inspection|site visit|call.?out|datang|troubleshoot)\b/i.test(hay)
  }
  if (intent === 'fan') {
    const askedLightKit = /\b(light kit|lampu|light)\b/i.test(hay) && /\b(light kit|lampu|light)\b/i.test(title)
    if (!/\b(light kit|lampu|light)\b/i.test((globalThis.__pricingQuery || '')) && askedLightKit) return false
    return /\b(kipas|fan)\b/i.test(hay)
  }
  if (intent === 'light') {
    return /\b(lampu|light|lighting|downlight|spotlight|bulb|mentol)\b/i.test(hay)
      && !/\b(kipas|fan)\b/i.test(title)
  }
  if (intent === 'troubleshoot') {
    if (/\b(maintenance|contract|kontrak|tahunan|annual|periodic|berkala)\b/i.test(hay)) return false
    return /\b(troubleshoot|trouble shoot|checking|check|semak|inspection|fault|repair|baiki|servis|diagnos|diagnostic|trip|blackout|masalah)\b/i.test(hay)
  }
  if (intent === 'maintenance') return /\b(maintenance|contract|kontrak|tahunan|annual|periodic|berkala)\b/i.test(hay)
  if (intent === 'socket') {
    return /\b(soket|socket|plug|power point|point elektrik|outlet|13a)\b/i.test(hay)
      && !/\b(lampu|light|downlight|kipas|fan)\b/i.test(title)
  }
  if (intent === 'wiring') return /\b(wiring|wayar|pendawaian|rewiring|cable|kabel)\b/i.test(hay)
  if (intent === 'db') return /\b(db|mcb|elcb|rccb|main switch|breaker|distribution board)\b/i.test(hay)
  if (intent === 'aircond') return /\b(aircond|air cond|ac|isolator)\b/i.test(hay)
  return true
}

function findKBPriceMatch(message, knowledgeBase, contact) {
  if (!message || !knowledgeBase || !knowledgeBase.length) return null
  const m = message.toLowerCase()
  const name = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : ''

  // STEP 1: Filter out internal-only entries — never offer to customer
  const isInternal = (cat) => /internal|tidak untuk customer|rahsia|confidential/i.test(cat || '')
  const hasPriceSignal = (e) => /\bRM\s*\d+|\brm\s*\d+|harga|price|kos|charge|rate/i.test(`${e.title || ''} ${e.content || ''}`)
  const kb = knowledgeBase.filter(e => e.is_active !== 0 && !isInternal(e.category) && hasPriceSignal(e))
  if (!kb.length) return null

  // STEP 2: Tokenise + expand with synonyms
  const queryTokens = tokeniseQuery(m)
  if (!queryTokens.length) return null
  const expandedQuery = expandSynonyms(queryTokens)
  const pricingIntent = detectPricingIntent(message)
  globalThis.__pricingQuery = m

  // STEP 3: Score each entry
  const intentFiltered = kb.filter(entry => entryMatchesPricingIntent(entry, pricingIntent))
  const sourceEntries = intentFiltered.length ? intentFiltered : kb

  const scored = sourceEntries.map(entry => {
    const titleTokens = tokeniseQuery(entry.title)
    const contentTokens = tokeniseQuery(entry.content)
    const expandedTitle = expandSynonyms(titleTokens)

    let score = 0
    if (entryMatchesPricingIntent(entry, pricingIntent)) score += 10
    // Title matches weighted x3
    for (const t of expandedTitle) if (expandedQuery.has(t)) score += 3
    // Content matches weighted x1 (lower since content often has incidental words)
    for (const t of contentTokens) if (expandedQuery.has(t)) score += 1
    // Category match weighted x2
    const cat = (entry.category || '').toLowerCase()
    for (const w of cat.split(/\s+/)) if (expandedQuery.has(w)) score += 2

    // BOOST: if the entry's title contains "standard" / "biasa" / "basic" AND
    // query mentions a generic noun (point/soket/lampu) without qualifier,
    // promote it as the most likely intent (basic 13A socket > niche oven point).
    const isStandard = /standard|biasa|basic|umum|asas|13a/i.test(entry.title)
    const hasGenericNoun = queryTokens.some(t => ['point','soket','socket','lampu','light','wiring','kabel'].includes(t))

    // Niche qualifiers — if user types any of these, they want specialised version
    const NICHE_TERMS = ['oven','aircond','ac','industrial','3-phase','floor','isolator','usb','smart',
                          'heater','dryer','solar','ev','lampu','light','bulb','chandelier','downlight',
                          'ceiling','fan','strip','outdoor','garden','emergency','cctv','autogate']
    const hasQualifier = queryTokens.some(t => NICHE_TERMS.includes(t))

    if (isStandard && hasGenericNoun && !hasQualifier) score += 8   // strong boost for default

    // PENALTY: entry is niche but query has no matching qualifier → demote
    const NICHE_TITLE_REGEX = /oven|usb|industrial|isolator|heater|dryer|smart|floor box|chandelier|downlight|ceiling fan|strip|outdoor|garden|emergency|cctv|autogate|solar|ev charger|3.phase|aircond|lampu/i
    if (NICHE_TITLE_REGEX.test(entry.title) && !hasQualifier) {
      score -= 5
    }

    // BIG penalty: cross-category contamination
    // Query "point elektrik" should NOT match "Install lampu siap point" from Lighting category
    // unless user said "lampu" explicitly
    const queryHasPointTerm = queryTokens.some(t => ['point','soket','socket','plug','outlet'].includes(t))
    const queryHasLightTerm = queryTokens.some(t => ['lampu','light','bulb','mentol','downlight'].includes(t))
    const queryHasFanTerm = queryTokens.some(t => ['kipas','fan'].includes(t))
    const queryHasTroubleTerm = queryTokens.some(t => ['troubleshoot','check','checking','cek','semak','masalah','problem','rosak','fault','trip','blackout','short'].includes(t))
    const entryIsLighting = /^lighting$/i.test(entry.category) || /lampu|light|bulb|downlight|chandelier/i.test(entry.title)
    const entryIsFan = /kipas|fan/i.test(entry.title)
    const entryIsMaintenance = /maintenance|contract|kontrak|tahunan|annual|periodic|berkala/i.test(`${entry.category || ''} ${entry.title || ''}`)
    if (queryHasPointTerm && !queryHasLightTerm && entryIsLighting) score -= 6
    if (queryHasLightTerm && !queryHasFanTerm && entryIsFan) score -= 20
    if (queryHasFanTerm && !queryHasLightTerm && entryIsLighting && !entryIsFan) score -= 20
    if (queryHasTroubleTerm && entryIsMaintenance && pricingIntent !== 'maintenance') score -= 40

    return { entry, score, isStandard, hasQualifier }
  })
  .filter(x => x.score > 0)
  .sort((a, b) => b.score - a.score)

  if (!scored.length) {
    if (pricingIntent === 'troubleshoot') {
      return `${name ? `Hi ${name}!` : 'Hi!'} Untuk masalah elektrik trip selalu, kami kena buat checking dahulu untuk cari punca sebenar.\n\nBoleh share kawasan rumah dan bila biasanya trip berlaku? Saya semak scope dulu sebelum bagi anggaran yang tepat.`
    }
    return null
  }

  // STEP 4: Pick top results — if there's a clear winner with much higher score, show alone
  const topScore = scored[0].score
  let top
  if (topScore >= scored[1]?.score + 4 || scored.length === 1) {
    // Clear winner — show just this one
    top = [scored[0]]
  } else {
    // Multiple competitive — show top 3, but ONLY those within 30% of top score
    const threshold = Math.max(topScore * 0.7, topScore - 4)
    top = scored.filter(x => x.score >= threshold).slice(0, 3)
  }

  const intro = name ? `Hi ${name}!` : `Hi!`
  const intentLabel = {
    fan: 'pasang kipas',
    light: 'pasang lampu',
    troubleshoot: 'troubleshoot/check masalah elektrik',
    maintenance: 'maintenance elektrik',
    socket: 'soket/point elektrik',
    wiring: 'wiring/pendawaian',
    db: 'DB/breaker elektrik',
    aircond: 'aircond/isolator',
    general: 'kerja elektrik ini',
  }[pricingIntent] || 'kerja elektrik ini'

  const quantity = extractRequestedQuantity(message)
  const quantityLine = quantity && ['socket','fan','light'].includes(pricingIntent)
    ? `\n\nUntuk ${quantity} unit/point, anggaran total bergantung scope dan material. Saya boleh confirm lebih tepat lepas tengok lokasi/jenis pemasangan.`
    : ''

  if (top.length === 1) {
    const e = top[0].entry
    return `${intro} Untuk *${intentLabel}*, harga kami:\n\n💰 *${e.title}*\n${e.content}${quantityLine}\n\nNak proceed atau nak saya semak detail lokasi/scope dulu?`
  }

  const lines = top.map(x => `• *${x.entry.title}*\n  ${x.entry.content}`).join('\n\n')
  return `${intro} Untuk *${intentLabel}*, ini harga yang relevan:\n\n${lines}${quantityLine}\n\nKalau confirm scope/lokasi, saya boleh bagi quote yang lebih tepat.`
}

function extractRequestedQuantity(text = '') {
  const m = String(text || '').toLowerCase()
  const direct = m.match(/\b(\d{1,2})\s*(unit|pcs|point|poin|biji)\b/i)
    || m.match(/\b(unit|pcs|point|poin|biji)\s*(\d{1,2})\b/i)
  if (!direct) return 0
  return parseInt(direct[1] || direct[2], 10) || 0
}

// Free-text extraction: when no strict keyword matches, grab the meaningful phrase
// from the user's message to use as a search topic.
function extractFreeText(text) {
  if (!text) return null
  const stopwords = new Set([
    'harga','berapa','kos','price','cost','charge','rate','cas',
    'untuk','di','ke','dari','dengan','dan','atau','yang','ini','itu','tu','ni',
    'la','lah','je','jer','sahaja','saja','sikit','tolong',
    'aku','saya','kau','engkau','kamu','dia','kita','kami',
    'bandar','kampung','taman','kawasan','tempat',
    'a','an','the','to','of','in','on','at','for','about','please','sila',
    'apa','macam','mana','bila','siapa',
  ])
  const words = (text.toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length >= 3 && !stopwords.has(w))
  if (!words.length) return null
  // Take up to 3 most distinctive words
  return words.slice(0, 3).join(' ')
}

async function callAI(type, url, model, sysPrompt, ctx, userMessage) {
  // Free cloud backends (no auth)
  if (type === 'duckduckgo') {
    return await callDuckDuckGo(model, sysPrompt, ctx, userMessage)
  }
  if (type === 'pollinations') {
    return await callPollinations(model, sysPrompt, ctx, userMessage)
  }

  const messages = [
    { role: 'system', content: sysPrompt },
    ...ctx,
    { role: 'user', content: userMessage },
  ]
  if (type === 'ollama') {
    const r = await axios.post(`${url}/api/chat`, {
      model, messages, stream: false,
      options: { temperature: 0.55, num_predict: 220, top_p: 0.9, num_ctx: 4096, repeat_penalty: 1.1 },
      keep_alive: '10m',
    }, { timeout: 45_000 })
    return (r.data?.message?.content || '').trim()
  } else {
    const r = await axios.post(`${url}/v1/chat/completions`, {
      model, messages, temperature: 0.55, max_tokens: 220, top_p: 0.9,
    }, { timeout: 45_000 })
    return (r.data?.choices?.[0]?.message?.content || '').trim()
  }
}

// ─── 🧠 Smart System Prompt Builder ─────────────────────────────────────────

function buildSystemPrompt({ knowledgeBase, persona, contact, businessProfile, history, currentMessage = '' }) {
  const now = new Date()
  const dateStr = now.toLocaleString('ms-MY', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
  const customerName = contact?.name && !/^\d+$/.test(contact.name) ? contact.name : 'pelanggan'
  const customerLabel = contact?.label && contact.label !== 'none' ? contact.label : null
  const hasProfile = businessProfile && businessProfile.trim().length > 30
  const hasKB = knowledgeBase && knowledgeBase.length > 0

  let p = ''

  // ── 1. CRITICAL ROLE DEFINITION (top priority) ──────────────────────────
  p += `# WHO YOU ARE (PENTING — JANGAN LUPA)\n`
  p += `Anda adalah EJEN TEKNIKAL ELEKTRIK untuk perniagaan ini yang sedang BALAS WHATSAPP customer.\n`
  p += `Customer adalah orang yang HANTAR mesej kepada anda — DIA cari servis/produk anda.\n`
  p += `Anda BUKAN AI. Anda BUKAN helpdesk generik. Anda adalah staff teknikal elektrik yang faham wiring, DB, MCB, RCCB/ELCB, fault finding, pemasangan lampu/kipas/soket, dan kerja site.\n`
  p += `\n`
  p += `Role mapping:\n`
  p += `  • "user" message dalam history = MESEJ DARI CUSTOMER (${customerName}) kepada anda\n`
  p += `  • "assistant" message = balasan ANDA sendiri sebelum ni kepada customer\n`
  p += `  • Anda tak sebut "saya AI" / "saya bot" / "saya assistant"\n`
  p += `\n`
  p += `Masa sekarang: ${dateStr}\n`

  // ── 2. Persona ──────────────────────────────────────────────────────────
  if (persona && persona.trim()) {
    p += `\n# CARA ANDA BERCAKAP\n${persona.trim()}\n`
  }

  // ── 3. Business Profile (the source of truth) ───────────────────────────
  if (hasProfile) {
    p += `\n# MAKLUMAT BISNES ANDA (gunakan ini untuk jawab customer)\n${businessProfile.trim()}\n`
  } else {
    p += `\n# ⚠️ MAKLUMAT BISNES BELUM DI-SETUP\n`
    p += `Owner BELUM mengisi profil perniagaan dalam Settings.\n`
    p += `JANGAN reka maklumat (nama syarikat, harga, services, alamat, telefon).\n`
    p += `Untuk balasan, layan customer mesra, sapa dengan nama dia, tapi cakap:\n`
    p += `"Terima kasih hubungi kami. Saya akan reply lebih detail sekejap lagi" atau\n`
    p += `"Boleh saya tahu apa yang ${customerName} cari? Saya akan susulkan dengan info yang spesifik."\n`
    p += `JANGAN bagi senarai bullet maklumat yang anda reka sendiri.\n`
  }

  // ── 4. Customer Context ─────────────────────────────────────────────────
  p += `\n# TENTANG CUSTOMER YANG ANDA SEDANG LAYAN\n`
  p += `Nama: ${customerName}\n`
  if (contact?.phone) p += `Telefon: ${contact.phone}\n`
  if (customerLabel) p += `Label: ${customerLabel}\n`
  if (contact?.notes) p += `Notes private: ${contact.notes}\n`

  // ── 5. Knowledge Base ───────────────────────────────────────────────────
  if (hasKB) {
    // Separate public KB from internal-only entries
    const isInternal = (cat) => /internal|tidak untuk customer|rahsia|confidential/i.test(cat || '')
    const publicKB = rankKnowledgeForPrompt(knowledgeBase.filter(e => !isInternal(e.category)), currentMessage, history)
    const internalKB = knowledgeBase.filter(e => isInternal(e.category))

    if (publicKB.length) {
      p += `\n# 📚 Q&A / PENGETAHUAN BISNES (boleh dikongsi dengan customer)\n\n`
      const grouped = {}
      for (const e of publicKB) {
        if (!grouped[e.category]) grouped[e.category] = []
        grouped[e.category].push(e)
      }
      for (const [cat, entries] of Object.entries(grouped)) {
        p += `## ${cat}\n`
        for (const e of entries) p += `Q: ${e.title}\nA: ${e.content}\n\n`
      }
    }

    if (internalKB.length) {
      p += `\n# 🔒 INTERNAL KNOWLEDGE TERSEDIA TETAPI TIDAK DIBERIKAN KEPADA AI\n`
      p += `Ada ${internalKB.length} entry internal/rahsia dalam database. Kandungan internal sengaja tidak dimasukkan dalam prompt customer.\n`
      p += `Jika customer tanya diskaun/kos dalaman/margin/supplier/profit, jawab secara selamat: "Boleh saya semak harga terbaik ikut scope kerja dulu."\n`
    }
  }

  // ── 6. Hard Rules ───────────────────────────────────────────────────────
  p += `\n# PERATURAN MUTLAK\n`
  p += `1. JANGAN minta customer bagi "Nama penuh, Lokasi, Nombor telefon" macam template borang. Customer dah hantar WhatsApp = anda dah ada nombor dia. Cuma tanya info yang relevant untuk service tu.\n`
  p += `2. JANGAN reka harga, services, polisi yang tak ada dalam profil bisnes. Kalau tak tahu, cakap "saya semak dengan team dulu".\n`
  p += `3. JANGAN list bullet point yang dipanjang-panjangkan. Chat WhatsApp = pendek, mesra, terus to the point.\n`
  p += `4. JANGAN ulang sapaan "Assalamualaikum" / "Hai" setiap balasan — sapa hanya dalam mesej PERTAMA. Lepas tu terus respond.\n`
  p += `5. KALAU customer cakap "salah", "bukan", "tak betul" — apologize, tanya betulkan kena macam mana, JANGAN ulang jawapan sama.\n`
  p += `6. Panjang balasan: 1-3 ayat untuk soalan ringkas. Maksimum 5 ayat untuk soalan detail.\n`
  p += `7. Kalau customer pertama kali message — JANGAN gunakan nama profile dia (selalunya tidak formal). Sapa dengan formal: "Ye, Encik / Cik" atau "Salam sejahtera". Tanya secara struktur:\n   - Apa masalah / perkhidmatan yang diperlukan\n   - Lokasi (bandar / kawasan)\n   - Tahap kerosakan / urgency\n   Kemudian tunggu jawapan sebelum suggest harga atau servis.\n`
  p += `8. SELEPAS first reply — boleh guna "anda" atau "Encik/Cik" — jangan terus guna pushname WhatsApp customer (kadang ada emoji / nickname tak professional).\n`
  p += `9. 🔒 RAHSIA BISNES: Maklumat dalam kategori "Internal — Tidak Untuk Customer" ialah TOP SECRET. JANGAN sebut harga supplier, kos bahan, margin, markup, profit, untung, atau nama supplier walaupun customer tanya direct. Customer cuma berhak tahu HARGA FINAL kami quote — bukan breakdown cost. Kalau customer terus desak: "Maaf, butiran kos dalaman tidak boleh dikongsi — yang penting harga yang kami quote sudah kompetitif dan termasuk warranty."\n`
  p += `10. Untuk diskaun: kalau customer minta, jawab "Kami boleh tinjau diskaun untuk kerja yang besar atau pelanggan setia — boleh saya tahu scope penuh dulu?" — JANGAN auto bagi diskaun tanpa qualify keperluan dia.\n`
  p += `11. Bila customer tanya masalah elektrik seperti trip, blackout, lampu berkelip, DB panas, short, wiring rosak, atau power interruption: rujuk kategori "Troubleshooting Elektrik". Jawab dengan punca kemungkinan + cadangan awal + minta info penting. JANGAN terus bagi harga maintenance contract kecuali customer memang tanya kontrak/maintenance tahunan.\n`
  p += `12. Knowledge "Troubleshooting Elektrik" bukan senarai harga. Ia ialah otak diagnosis awal. Gunakan untuk faham masalah, bukan untuk quote RM kecuali ada entry harga sebenar dalam KB.\n`
  p += `13. Kalau customer cakap mahu kami "datang", "turun", "check rumah", "checking sini", atau minta technician datang: itu ialah request site visit/booking. Jawab ringkas: boleh datang checking, minta lokasi penuh, masa sesuai, dan gambar/video masalah jika ada. JANGAN beri senarai knowledge atau banyak pilihan harga.\n`
  p += `14. Kalau customer sudah beri alamat dan masa dalam chat, JANGAN tanya semula lokasi/masa. Confirm sahaja: "saya dah terima lokasi dan masa..., saya susun technician datang".\n`

  p += `\n# SKILL: CARA BERCAKAP MACAM MANUSIA SEBENAR\n`
  p += `Tulis seperti technician/ejen teknikal WhatsApp yang berpengalaman: natural, kemas, dan tidak terlalu sempurna seperti karangan.\n`
  p += `Gunakan ayat pendek, satu idea setiap ayat, dan satu soalan follow-up yang jelas sahaja.\n`
  p += `Elakkan gaya helpdesk/blog seperti "ini boleh disebabkan oleh 1,2,3,4" yang panjang. Jawab sebagai orang teknikal yang mahu bantu customer dan arrange next step.\n`
  p += `Jangan ulang perkataan customer secara kaku. Faham niat dia, kemudian jawab macam orang yang sedang membantu.\n`
  p += `Boleh guna sedikit emoji profesional seperti 🙏 atau 😊, tetapi maksimum satu jika sesuai.\n`
  p += `Kalau info ada dalam Knowledge Base, jadikan ia jawapan ringkas yang yakin. Kalau info tak ada, jangan reka — cakap anda semak dulu.\n`

  p += `\n# MODE KHAS: AI_PROACTIVE_OUTREACH\n`
  p += `Jika mesej user mengandungi [AI_PROACTIVE_OUTREACH], anda sedang MULAKAN chat kepada customer dahulu.\n`
  p += `Output WAJIB satu mesej WhatsApp sahaja, maksimum 2 ayat pendek. Tiada subject, tiada sign-off, tiada "Best,", tiada nama palsu.\n`
  p += `JANGAN guna placeholder seperti [Nama Customer], [Nama Anda], [Nama Perniagaan/Bisnes], {nama}, atau apa-apa tanda kurung template.\n`
  p += `JANGAN tulis macam email formal/marketing: elakkan "kami ingin memastikan", "terima kasih atas kesempatan", "saya akan sangat senang", "apakah Anda".\n`
  p += `Tulis macam staff elektrik Malaysia yang sebenar: ringkas, jelas, dan terus kepada keperluan customer.\n`
  p += `Rujuk Business Profile dan Knowledge Base untuk pilih konteks bisnes yang relevan, tetapi jangan senaraikan semua servis.\n`
  p += `Jika history kosong, jangan pura-pura customer pernah bertanya. Contoh tone yang betul: "Salam sejahtera, saya dari Kejuruteraan Elektrik Sinar Bahagia. Ada apa-apa kerja elektrik yang tuan/puan perlukan bantuan sekarang?"\n`
  p += `Jika history ada tapi lama senyap, buat follow-up lembut berdasarkan konteks terakhir. Contoh tone yang betul: "Salam tuan/puan, saya follow up semula pasal quotation elektrik sebelum ini. Masih nak kami bantu semak dan teruskan?"\n`
  p += `Jangan sebut "AI", "bot", "sistem automatik", atau ayat teknikal.\n`

  // ── BAHASA RULES (CRITICAL — ALWAYS Malaysian Malay) ────────────────────
  p += `\n# BAHASA — WAJIB MALAYSIAN MALAY FORMAL/PROFESSIONAL\n`
  p += `Anda adalah bisnes Malaysia. WAJIB pakai Bahasa Melayu Malaysia, BUKAN Bahasa Indonesia.\n\n`
  p += `BETUL (gunakan ini):\n`
  p += `  ✓ "anda" / "encik" / "puan" / "tuan"\n`
  p += `  ✓ "rumah anda" / "perniagaan anda" / "bisnes anda"\n`
  p += `  ✓ "Selamat sejahtera" / "Hai" / "Salam sejahtera"\n`
  p += `  ✓ "Boleh saya tahu..." / "Adakah anda perlu..."\n`
  p += `  ✓ "Terima kasih" / "Sama-sama"\n\n`
  p += `SALAH (JANGAN guna — ini Bahasa Indonesia):\n`
  p += `  ✗ "kamu" / "rumahmu" / "padamu" / "denganmu" / "milikmu" / "untukmu"\n`
  p += `  ✗ "engkau" / "anda sekalian"\n`
  p += `  ✗ "bisnis" (guna "bisnes" atau "perniagaan")\n`
  p += `  ✗ "kalian" / "antum"\n\n`
  p += `Kalau customer text Melayu → balas Bahasa Melayu Malaysia formal/santai.\n`
  p += `Kalau customer text English → balas English (professional).\n`
  p += `Mixed? Boleh mix, tapi sama level dengan customer.\n`

  // ── 7. Sales Flow (gentle, only when relevant) ──────────────────────────
  p += `\n# OBJEKTIF\n`
  p += `Bantu customer dapat info → bina trust → kalau dia berminat, ajak proceed (book service / dapat quotation / order). Tak pushy. Conversational.\n`

  // ── 8. Web Search Tool ──────────────────────────────────────────────────
  p += `\n# TOOL: SEARCH INTERNET\n`
  p += `Bila customer tanya benda yang TIADA dalam profil bisnes anda DAN bukan tentang produk/services anda (e.g. cuaca, alamat luar, harga competitor, definisi, fakta umum), boleh tulis: [SEARCH: query] dalam balasan. Sistem akan cari, lepas tu balas dengan info real.\n`
  p += `JANGAN guna [SEARCH:] untuk benda dalam bisnes sendiri.\n`

  return p
}

function rankKnowledgeForPrompt(entries = [], currentMessage = '', history = []) {
  if (!entries.length) return []
  const recentText = [
    currentMessage,
    ...(history || []).slice(-6).map(m => m.content || ''),
  ].join(' ')
  const query = expandSynonyms(tokeniseQuery(recentText))
  const isTroubleQuery = /\b(trip|blackout|short|tiada elektrik|tak ada elektrik|masalah|rosak|troubleshoot|check|checking|cek|semak|repair|baiki|lampu.*kelip|panas|terbakar|bau hangit|renjatan)\b/i.test(recentText)

  const scored = entries.map(e => {
    const text = `${e.category || ''} ${e.title || ''} ${e.content || ''}`
    const tokens = expandSynonyms(tokeniseQuery(text))
    let score = 0
    for (const t of query) if (tokens.has(t)) score += 2
    if (/Troubleshooting Elektrik/i.test(e.category || '') && isTroubleQuery) score += 12
    if (/Troubleshooting Elektrik/i.test(e.category || '') && !isTroubleQuery) score -= 5
    if (/\bRM\s*\d+|\brm\s*\d+|harga|price|kos/i.test(text) && /\b(harga|berapa|kos|price|rate|charge|quote|quotation|nak|pasang|install)\b/i.test(recentText)) score += 8
    return { entry: e, score }
  })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)

  const troubleshooting = scored
    .filter(x => /Troubleshooting Elektrik/i.test(x.entry.category || ''))
    .slice(0, isTroubleQuery ? 12 : 3)
  const priced = scored
    .filter(x => !/Troubleshooting Elektrik/i.test(x.entry.category || ''))
    .slice(0, 18)

  const selected = [...troubleshooting, ...priced]
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map(x => x.entry)

  // If nothing matched, keep a tiny non-troubleshooting baseline so the AI still has business facts.
  if (!selected.length) {
    return entries
      .filter(e => !/Troubleshooting Elektrik/i.test(e.category || ''))
      .slice(0, 20)
  }
  return selected
}

function buildContextMessages(history, hasProfile = true) {
  if (!history || !history.length) return []

  // Detect "poisoned" assistant messages — bullet-list templates / fake company info
  // These were generated when AI had no profile and hallucinated. Strip them out.
  const isPoisoned = (m) => {
    if (!m.is_from_me) return false
    const c = m.content || ''
    // Heuristic: long bullet lists with template-like field requests
    if (/\* (Nama penuh|Lokasi|Nombor telefon)/i.test(c)) return true
    if (c.length > 500 && c.split('*').length > 4) return true
    return false
  }

  let recent = history.slice(-12)
  recent = recent.filter(m => !isPoisoned(m))

  // If profile not set, strip ALL assistant replies — they may contain hallucinations
  if (!hasProfile) recent = recent.filter(m => !m.is_from_me)

  // Keep last 8 turns of clean context
  recent = recent.slice(-8)

  return recent.map(msg => ({
    role: msg.is_from_me ? 'assistant' : 'user',
    content: (msg.content || '').slice(0, 500),  // trim very long messages
  }))
}

// ─── Connectivity Test ──────────────────────────────────────────────────────

async function testBackend(url, type) {
  try {
    if (type === 'ollama') await axios.get(`${url}/api/tags`, { timeout: 3000 })
    else                   await axios.get(`${url}/v1/models`, { timeout: 3000 })
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

module.exports = { detectBackends, getAvailableModels, generateReply, testBackend, webSearch }
