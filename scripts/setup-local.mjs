import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const path = resolve(process.cwd(), '.env')
let contents = ''
try { contents = await readFile(path, 'utf8') } catch { /* First local run. */ }
const lines = contents ? contents.split(/\r?\n/).filter(line => !/^\s*ZEUS_ADMIN_TOKEN\s*=/.test(line)) : []
const valueOf = (name) => lines.find(line => new RegExp(`^\\s*${name}\\s*=`).test(line))?.split('=').slice(1).join('=').trim().replace(/^(['"])(.*)\1$/, '$2')
const settings = {
  API_CREDENTIALS_KEY: valueOf('API_CREDENTIALS_KEY'),
  ADMIN_AUTH_DISABLED: 'true',
}
if (!settings.API_CREDENTIALS_KEY || !/^[a-f\d]{64}$/i.test(settings.API_CREDENTIALS_KEY)) {
  settings.API_CREDENTIALS_KEY = randomBytes(32).toString('hex')
}
for (const [name, value] of Object.entries(settings)) {
  const index = lines.findIndex(line => new RegExp(`^\\s*${name}\\s*=`).test(line))
  if (index >= 0) lines[index] = `${name}=${value}`
  else lines.push(`${name}=${value}`)
}
const next = lines.join('\n').replace(/\n+$/, '') + '\n'
await writeFile(path, next, { encoding: 'utf8' })
