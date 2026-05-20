// Test all AI backends to see which actually work
const axios = require('axios')

async function testDuckDuckGo() {
  console.log('\n🦆 Testing DuckDuckGo AI Chat...')
  try {
    // Step 1: get vqd token
    const status = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
      headers: { 'x-vqd-accept': '1', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    })
    const vqd = status.headers['x-vqd-4']
    console.log('  ✓ Got vqd token:', vqd?.slice(0, 20) + '...')

    // Step 2: send chat
    const start = Date.now()
    const r = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi! Reply in Malay: berapa harga aircond service?' }],
    }, {
      headers: { 'x-vqd-4': vqd, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/event-stream' },
      timeout: 30000,
      responseType: 'text',
    })

    // Parse SSE
    const lines = String(r.data).split('\n')
    let out = ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try { const obj = JSON.parse(payload); if (obj.message) out += obj.message } catch {}
    }
    const elapsed = ((Date.now() - start)/1000).toFixed(1)
    if (out) {
      console.log(`  ✓ WORKS (${elapsed}s):`)
      console.log('  →', out.slice(0, 250))
    } else {
      console.log(`  ✗ Empty response (${elapsed}s). Raw data length:`, r.data?.length)
      console.log('  First 300 chars:', String(r.data).slice(0, 300))
    }
  } catch (e) {
    console.log('  ✗ FAILED:', e.message)
    if (e.response) console.log('    Status:', e.response.status, 'Data:', JSON.stringify(e.response.data).slice(0, 200))
  }
}

async function testPollinations() {
  console.log('\n🌸 Testing Pollinations.ai...')
  try {
    const start = Date.now()
    const r = await axios.post('https://text.pollinations.ai/openai', {
      model: 'openai',
      messages: [
        { role: 'system', content: 'Reply in Malay, max 2 sentences.' },
        { role: 'user', content: 'Hi! Berapa harga aircond service?' },
      ],
      temperature: 0.6,
      max_tokens: 200,
    }, { timeout: 30000 })
    const elapsed = ((Date.now() - start)/1000).toFixed(1)
    const content = r.data?.choices?.[0]?.message?.content
    if (content) {
      console.log(`  ✓ WORKS (${elapsed}s):`)
      console.log('  →', content.slice(0, 250))
    } else {
      console.log(`  ✗ No content. Response:`, JSON.stringify(r.data).slice(0, 300))
    }
  } catch (e) {
    console.log('  ✗ FAILED:', e.message)
    if (e.response) console.log('    Status:', e.response.status, 'Data:', JSON.stringify(e.response.data).slice(0, 200))
  }
}

async function testOllama() {
  console.log('\n🦙 Testing Ollama (local)...')
  try {
    const r = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 })
    console.log(`  ✓ Detected. Models:`, r.data.models?.map(m=>m.name).join(', ') || '(none)')
  } catch (e) {
    console.log('  ✗ Not running:', e.message)
  }
}

;(async () => {
  await testOllama()
  await testDuckDuckGo()
  await testPollinations()
})()
