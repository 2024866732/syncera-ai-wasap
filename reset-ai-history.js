// Reset all AI replies from all conversations
const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

;(async () => {
  const dbPath = path.join(process.env.APPDATA, 'wa-bizai', 'wa-bizai.db')
  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const before = db.exec("SELECT COUNT(*) FROM messages WHERE is_ai_reply=1")[0].values[0][0]
  db.run("DELETE FROM messages WHERE is_ai_reply=1")
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  console.log(`Deleted ${before} AI replies from all conversations`)
  db.close()
})().catch(e => console.error(e))
