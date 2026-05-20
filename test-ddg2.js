const axios = require('axios')
;(async () => {
  try {
    const cookieJar = []
    const home = await axios.get('https://duckduckgo.com/?q=test', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
      validateStatus: () => true,
    })
    if (home.headers['set-cookie']) cookieJar.push(...home.headers['set-cookie'])
    console.log('Home cookies:', cookieJar.length)

    const cookies = cookieJar.map(c => c.split(';')[0]).join('; ')

    const status = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'x-vqd-accept': '1',
        'Cache-Control': 'no-store',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://duckduckgo.com/',
        'Cookie': cookies,
      },
      timeout: 10000,
      validateStatus: () => true,
    })
    console.log('Status code:', status.status, 'vqd-4:', status.headers['x-vqd-4']?.slice(0,30) || '(none)')
    if (status.status !== 200) console.log('Body:', String(status.data).slice(0,300))
  } catch (e) { console.log('ERR:', e.message) }
})()
