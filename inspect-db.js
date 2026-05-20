// Quick DB inspector to verify AI state
const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

;(async () => {
  const dbPath = path.join(process.env.APPDATA, 'wa-bizai', 'wa-bizai.db')
  if (!fs.existsSync(dbPath)) { console.log('No DB at', dbPath); return }
  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const db = new SQL.Database(fs.readFileSync(dbPath))

  console.log('═══ SETTINGS ═══')
  const settings = db.exec("SELECT key,value FROM settings")
  if (settings[0]) settings[0].values.forEach(([k,v]) => console.log(`  ${k} = ${(v||'').toString().slice(0,80)}`))

  console.log('\n═══ CONVERSATIONS ═══')
  const convs = db.exec(`SELECT c.id, ct.name, ct.phone, c.ai_enabled, c.ai_model, c.last_message
                          FROM conversations c JOIN contacts ct ON c.contact_id=ct.id`)
  if (convs[0]) convs[0].values.forEach(r => {
    console.log(`  ${(r[1]||r[2]||'').padEnd(20)} ai=${r[3]} model="${r[4]||'(empty)'}" last="${(r[5]||'').slice(0,40)}"`)
  })

  console.log('\n═══ KNOWLEDGE BASE ═══')
  const kb = db.exec("SELECT category, title, is_active FROM knowledge_base")
  if (kb[0]) kb[0].values.forEach(r => console.log(`  [${r[2]?'ON':'off'}] ${r[0]} > ${r[1]}`))
  else console.log('  (empty)')

  console.log('\n═══ MESSAGES (last 10) ═══')
  const msgs = db.exec(`SELECT timestamp, conversation_id, is_from_me, is_ai_reply, content
                         FROM messages ORDER BY timestamp DESC LIMIT 10`)
  if (msgs[0]) msgs[0].values.forEach(r => {
    const dir = r[2] ? '→' : '←'
    const ai = r[3] ? '🤖' : '  '
    console.log(`  ${ai} ${dir} ${(r[4]||'').slice(0,60)}`)
  })

  db.close()
})().catch(e => console.error(e))
