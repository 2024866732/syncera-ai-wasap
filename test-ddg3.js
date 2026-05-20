const axios = require('axios')
;(async () => {
  const status = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'x-vqd-accept': '1',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://duckduckgo.com/',
    },
    timeout: 10000,
    validateStatus: () => true,
  })
  console.log('Headers:')
  for (const [k, v] of Object.entries(status.headers)) console.log(`  ${k}: ${v}`)
  console.log('\nBody:', String(status.data).slice(0, 500))
})()
