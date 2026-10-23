import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const cwd = process.cwd()
const root = basename(cwd).toLowerCase() === 'api' ? resolve(cwd, '..') : cwd
try {
  const contents = readFileSync(resolve(root, '.env'), 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || match[1] in process.env) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch { /* Local .env is optional; production should set process environment. */ }
