import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const db = new PGlite(resolve(root, '.pglite-data'))
await db.waitReady
await db.exec(await readFile(resolve(root, 'db/init.sql'), 'utf8'))
const port = Number(process.env.PGLITE_PORT) || 5432

const server = new PGLiteSocketServer({
  db,
  host: '127.0.0.1',
  port,
  maxConnections: 10,
})

await server.start()
console.log(`[db] PGlite pronto em 127.0.0.1:${port}`)

let closing = false
async function shutdown() {
  if (closing) return
  closing = true
  await server.stop()
  await db.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
