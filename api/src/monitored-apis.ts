import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Pool } from 'pg'

type Config = { name: string; url: string; method: string; headers?: Record<string, string>; params?: Record<string, string>; body?: string; auth_type?: string; auth?: Record<string, string>; interval_seconds: number; timeout_ms?: number }
const secretHeader = /auth|token|secret|password|api.?key|credential|cookie|session|signature|(?:^|[-_])key(?:$|[-_])/i

function key() {
  const value = process.env.API_CREDENTIALS_KEY || ''
  if (!/^[a-f\d]{64}$/i.test(value)) throw new Error('API_CREDENTIALS_KEY precisa conter 64 caracteres hexadecimais.')
  return Buffer.from(value, 'hex')
}
function encrypt(value: unknown) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${payload.toString('hex')}`
}
function decrypt(value: string) {
  if (!value) return {}
  const [iv, tag, payload] = value.split(':'); const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, 'hex')), decipher.final()]).toString('utf8'))
}
function privateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    const c = Number(ip.split('.')[2])
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 0 && c === 2))) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) || (a === 203 && b === 0 && c === 113)
  }
  const value = ip.toLowerCase()
  const first = Number.parseInt(value.split(':')[0] || '0', 16)
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value) || value.startsWith('::ffff:') || value.startsWith('2001:db8:') || first < 0x2000 || first > 0x3fff
}
async function targetUrl(raw: unknown, hasSecrets: boolean) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('URL inválida (máximo de 2048 caracteres).')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Informe uma URL HTTP(S) válida.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use uma URL HTTP(S) sem usuário/senha embutidos.')
  if (hasSecrets && url.protocol !== 'https:') throw new Error('Endpoints com credenciais precisam usar HTTPS.')
  const hostname = url.hostname.toLowerCase()
  if ([...url.searchParams.keys()].some(name => secretHeader.test(name))) throw new Error('Use o campo de autenticação para credenciais, não parâmetros secretos na URL.')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Endereços locais não podem ser monitorados.')
  let pinnedAddress: string
  if (isIP(hostname)) { if (privateIp(hostname)) throw new Error('Endereços IP privados ou reservados não podem ser monitorados.'); pinnedAddress = hostname }
  else {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error('O domínio resolve para endereço privado ou reservado.')
    pinnedAddress = addresses[0].address
  }
  return { url, pinnedAddress }
}
function validateConfig(value: any): Config {
  if (!value || typeof value !== 'object') throw new Error('Configuração inválida.')
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const method = typeof value.method === 'string' ? value.method.toUpperCase() : ''
  if (!name || name.length > 120) throw new Error('Informe um nome de até 120 caracteres.')
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('Método HTTP inválido.')
  if (!Number.isInteger(value.interval_seconds) || value.interval_seconds < 15 || value.interval_seconds > 3600) throw new Error('O intervalo deve ser entre 15 e 3600 segundos.')
  const timeout = value.timeout_ms === undefined ? 10000 : value.timeout_ms
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) throw new Error('O timeout deve ser entre 1000 e 30000 ms.')
  const headers = value.headers ?? {}; const params = value.params ?? {}; const auth = value.auth ?? {}
  for (const record of [headers, params, auth]) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).length > 50 || Object.entries(record).some(([k, v]) => !k || k.length > 200 || typeof v !== 'string' || v.length > 4000 || /[\r\n]/.test(v))) throw new Error('Headers, parâmetros e autenticação devem ser objetos de texto válidos (máximo de 50 campos).')
  }
  if (Object.keys(params).some(name => secretHeader.test(name))) throw new Error('Use o campo de autenticação para tokens e chaves, não parâmetros de texto.')
  const authType = value.auth_type || 'none'
  if (!['none', 'bearer', 'basic', 'api_key'].includes(authType)) throw new Error('Tipo de autenticação inválido.')
  if (value.body !== undefined && (typeof value.body !== 'string' || value.body.length > 100000)) throw new Error('O corpo da requisição deve ser texto com até 100 KB.')
  return { name, url: value.url, method, headers, params, body: value.body || '', auth_type: authType, auth, interval_seconds: value.interval_seconds, timeout_ms: timeout }
}
function admin(req: Request, res: Response, next: NextFunction) {
  // The local development setup is bound to loopback; never enable this bypass in production.
  if (process.env.NODE_ENV !== 'production' && process.env.ADMIN_AUTH_DISABLED === 'true') {
    try { key() } catch { return res.status(503).json({ error: 'CREDENTIAL_KEY_NOT_CONFIGURED', message: 'Configure API_CREDENTIALS_KEY no arquivo .env.' }) }
    return next()
  }
  const expected = Buffer.from(process.env.ZEUS_ADMIN_TOKEN || '')
  const actual = Buffer.from((req.header('authorization') || '').replace(/^Bearer\s+/i, ''))
  if (!expected.length) return res.status(503).json({ error: 'ADMIN_AUTH_NOT_CONFIGURED', message: 'Configure ZEUS_ADMIN_TOKEN no arquivo .env.' })
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token administrativo inválido.' })
  try { key() } catch { return res.status(503).json({ error: 'CREDENTIAL_KEY_NOT_CONFIGURED', message: 'Configure API_CREDENTIALS_KEY no arquivo .env.' }) }
  next()
}
function redactHeaders(headers: Record<string, string>) {
  return Object.fromEntries(Object.keys(headers).map(k => [k, '__REDACTED__']))
}
async function latestApis(pool: Pool) {
  const { rows } = await pool.query(`select a.*, c.checked_at last_check, c.latency_ms, c.status_code, c.ok check_ok, c.error last_error,
    (select round(avg((ok)::int)*100,2) from monitored_api_checks h where h.monitored_api_id=a.id and h.checked_at>now()-interval '24 hours') availability,
    (select count(*) from (select ok from monitored_api_checks h where h.monitored_api_id=a.id order by checked_at desc limit 5) recent where not ok) failures_5
    from monitored_apis a left join lateral (select * from monitored_api_checks where monitored_api_id=a.id order by checked_at desc limit 1) c on true order by a.created_at desc`)
  return rows.map(row => ({
    id: row.id, name: row.name, url: row.url, method: row.method, headers: redactHeaders(decrypt(row.headers_encrypted)), params: row.params,
    body_configured: !!row.body_encrypted, auth_type: row.auth_type, auth_configured: Object.keys(decrypt(row.auth_encrypted)).length > 0,
    interval_seconds: row.interval_seconds, timeout_ms: row.timeout_ms, paused: row.paused, created_at: row.created_at,
    status: row.paused ? 'paused' : row.check_ok === null ? 'pending' : !row.check_ok || Date.now() - new Date(row.last_check).getTime() > row.interval_seconds * 2500 ? 'offline' : Number(row.failures_5) > 0 ? 'unstable' : Number(row.latency_ms) >= 1500 ? 'slow' : 'online',
    last_check: row.last_check, latency_ms: row.latency_ms === null ? null : Number(row.latency_ms), http_status: row.status_code === null ? null : Number(row.status_code),
    last_error: row.last_error, availability: row.availability === null ? null : Number(row.availability),
  }))
}
async function realRequest(config: Config) {
  const headers = { ...config.headers }
  const auth = config.auth || {}; const authType = config.auth_type || 'none'
  let keyQuery: [string, string] | null = null
  if (authType === 'bearer') { if (!auth.token) throw new Error('Informe o token Bearer.'); headers.authorization = `Bearer ${auth.token}` }
  if (authType === 'basic') { if (auth.username === undefined) throw new Error('Informe o usuário da autenticação Basic.'); headers.authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64')}` }
  if (authType === 'api_key') {
    if (!auth.name || !auth.value) throw new Error('Informe o nome e o valor da API key.')
    if (auth.location === 'query') keyQuery = [auth.name, auth.value]; else headers[auth.name] = auth.value
  }
  const hasSecrets = authType !== 'none' || Object.keys(headers).some(k => secretHeader.test(k))
  const started = performance.now(); let status: number | null = null
  try {
    const { url, pinnedAddress } = await targetUrl(config.url, hasSecrets)
    for (const [k, v] of Object.entries(config.params || {})) url.searchParams.set(k, v)
    if (keyQuery) url.searchParams.set(...keyQuery)
    const timeout = config.timeout_ms || 10000
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
    const requestOptions: any = { protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, path: `${url.pathname}${url.search}`, method: config.method, headers, timeout, autoSelectFamily: false,
      lookup: (_host: string, options: any, callback: (...args: any[]) => void) => options?.all
        ? callback(null, [{ address: pinnedAddress, family: isIP(pinnedAddress) }])
        : callback(null, pinnedAddress, isIP(pinnedAddress)) }
    if (url.protocol === 'https:' && !isIP(url.hostname)) requestOptions.servername = url.hostname
    const response = await new Promise<number>((resolve, reject) => {
      const request = transport(requestOptions, (incoming) => { incoming.resume(); incoming.once('end', () => resolve(incoming.statusCode || 0)) })
      request.setTimeout(timeout, () => { const error = new Error('Timeout'); error.name = 'TimeoutError'; request.destroy(error) })
      request.once('error', reject)
      if (config.method !== 'GET' && config.method !== 'DELETE' && config.body) request.write(config.body)
      request.end()
    })
    status = response
    const latency = Math.round(performance.now() - started)
    return { ok: status >= 200 && status < 400, status_code: status, latency_ms: latency, checked_at: new Date().toISOString(), error: status >= 400 ? `Endpoint retornou HTTP ${status}.` : null }
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? `Timeout após ${config.timeout_ms || 10000} ms.` : error instanceof Error ? error.message.slice(0, 300) : 'Falha de conexão.'
    return { ok: false, status_code: status, latency_ms: Math.round(performance.now() - started), checked_at: new Date().toISOString(), error: message }
  }
}
export function createMonitoredApiRouter(pool: Pool) {
  const router = Router()
  const testWindows = new Map<string, { started: number; count: number }>()
  router.get('/access', (_req, res) => res.json({ auth_required: !(process.env.NODE_ENV !== 'production' && process.env.ADMIN_AUTH_DISABLED === 'true') }))
  router.use(admin)
  router.post('/test', (req, res, next) => {
    const key = req.ip || 'unknown'; const now = Date.now(); const window = testWindows.get(key)
    if (!window || now - window.started >= 60_000) testWindows.set(key, { started: now, count: 1 })
    else if (window.count >= 10) return res.status(429).json({ error: 'RATE_LIMITED', message: 'Limite de 10 testes por minuto atingido.' })
    else window.count++
    if (testWindows.size > 1000) for (const [ip, item] of testWindows) if (now - item.started > 60_000) testWindows.delete(ip)
    next()
  })
  router.get('/', async (_req, res, next) => { try { res.json(await latestApis(pool)) } catch (e) { next(e) } })
  router.post('/test', async (req, res) => {
    try {
      const config = validateConfig({ ...req.body, interval_seconds: req.body.interval_seconds || 15 })
      if (req.body.api_id) {
        const current = (await pool.query('select * from monitored_apis where id=$1', [req.body.api_id])).rows[0]
        if (!current) throw new Error('API cadastrada não encontrada.')
        const storedHeaders = decrypt(current.headers_encrypted) as Record<string, string>
        for (const [name, value] of Object.entries(config.headers || {})) if (value === '__REDACTED__') config.headers![name] = storedHeaders[name] || ''
        if (!Object.keys(config.auth || {}).length) config.auth = decrypt(current.auth_encrypted)
        if (!config.body) config.body = current.body_encrypted ? decrypt(current.body_encrypted) : ''
      }
      res.json(await realRequest(config))
    }
    catch (e) { res.status(400).json({ error: 'INVALID_REQUEST', message: e instanceof Error ? e.message : 'Configuração inválida.' }) }
  })
  router.post('/', async (req, res) => {
    try {
      const config = validateConfig(req.body)
      const total = Number((await pool.query('select count(*)::int total from monitored_apis')).rows[0].total)
      if (total >= 100) return res.status(429).json({ error: 'MONITOR_LIMIT', message: 'Limite de 100 APIs monitoradas atingido.' })
      const headers = config.headers || {}; const auth = config.auth || {}
      for (const [k, v] of Object.entries(headers)) if (v === '__REDACTED__') delete headers[k]
      if (Object.values(req.body.headers || {}).includes('__REDACTED__')) throw new Error('Headers mascarados não podem ser enviados no cadastro inicial.')
      await targetUrl(config.url, config.auth_type !== 'none' || Object.keys(headers).some(k => secretHeader.test(k)))
      const result = await pool.query(`insert into monitored_apis(name,url,method,headers_encrypted,params,body_encrypted,auth_type,auth_encrypted,interval_seconds,timeout_ms)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [config.name, config.url, config.method, encrypt(headers), JSON.stringify(config.params || {}), config.body ? encrypt(config.body) : '', config.auth_type || 'none', encrypt(auth), config.interval_seconds, config.timeout_ms || 10000])
      res.status(201).json({ id: result.rows[0].id })
    } catch (e) { res.status(400).json({ error: 'INVALID_REQUEST', message: e instanceof Error ? e.message : 'Configuração inválida.' }) }
  })
  router.put('/:id', async (req, res) => {
    try {
      const current = (await pool.query('select * from monitored_apis where id=$1', [req.params.id])).rows[0]
      if (!current) return res.status(404).json({ error: 'NOT_FOUND' })
      const config = validateConfig(req.body)
      const oldHeaders = decrypt(current.headers_encrypted) as Record<string, string>
      const headers = { ...config.headers }
      for (const [k, v] of Object.entries(headers)) if (v === '__REDACTED__') headers[k] = oldHeaders[k] || ''
      const oldAuth = decrypt(current.auth_encrypted)
      const auth = Object.keys(config.auth || {}).length ? config.auth : oldAuth
      await targetUrl(config.url, config.auth_type !== 'none' || Object.keys(headers).some(k => secretHeader.test(k)))
      await pool.query(`update monitored_apis set name=$1,url=$2,method=$3,headers_encrypted=$4,params=$5,body_encrypted=$6,auth_type=$7,auth_encrypted=$8,interval_seconds=$9,timeout_ms=$10,updated_at=now() where id=$11`, [config.name, config.url, config.method, encrypt(headers), JSON.stringify(config.params || {}), config.body ? encrypt(config.body) : current.body_encrypted, config.auth_type || current.auth_type, encrypt(auth), config.interval_seconds, config.timeout_ms || 10000, req.params.id])
      res.json({ ok: true })
    } catch (e) { res.status(400).json({ error: 'INVALID_REQUEST', message: e instanceof Error ? e.message : 'Configuração inválida.' }) }
  })
  router.patch('/:id/state', async (req, res) => {
    if (typeof req.body.paused !== 'boolean') return res.status(400).json({ error: 'INVALID_REQUEST' })
    const result = await pool.query('update monitored_apis set paused=$1,updated_at=now() where id=$2', [req.body.paused, req.params.id])
    res.status(result.rowCount ? 200 : 404).json({ ok: !!result.rowCount })
  })
  router.delete('/:id', async (req, res) => {
    const result = await pool.query('delete from monitored_apis where id=$1', [req.params.id])
    res.status(result.rowCount ? 204 : 404).end()
  })
  router.get('/:id/checks', async (req, res, next) => {
    try { const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100)); const { rows } = await pool.query('select id,checked_at,latency_ms,status_code,ok,error from monitored_api_checks where monitored_api_id=$1 order by checked_at desc limit $2', [req.params.id, limit]); res.json(rows) } catch (e) { next(e) }
  })
  router.get('/:id/availability', async (req, res, next) => {
    try { const minutes = Math.max(1, Math.min(10080, Number(req.query.minutes) || 1440)); const { rows } = await pool.query(`select date_trunc('minute',checked_at) time,round(avg((ok)::int)*100,2) availability,round(avg(latency_ms),2) latency_ms from monitored_api_checks where monitored_api_id=$1 and checked_at>now()-($2::int*interval '1 minute') group by 1 order by 1`, [req.params.id, minutes]); res.json(rows) } catch (e) { next(e) }
  })
  return router
}

export function startApiMonitor(pool: Pool) {
  let busy = false
  const timer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      const { rows } = await pool.query(`select a.*, c.checked_at last_check from monitored_apis a left join lateral (select checked_at from monitored_api_checks where monitored_api_id=a.id order by checked_at desc limit 1) c on true where not a.paused and (c.checked_at is null or c.checked_at <= now()-(a.interval_seconds*interval '1 second')) order by c.checked_at nulls first limit 10`)
      for (const api of rows) {
        try {
          const config: Config = { name: api.name, url: api.url, method: api.method, headers: decrypt(api.headers_encrypted), params: api.params, body: api.body_encrypted ? decrypt(api.body_encrypted) : '', auth_type: api.auth_type, auth: decrypt(api.auth_encrypted), interval_seconds: api.interval_seconds, timeout_ms: api.timeout_ms }
          const result = await realRequest(config)
          await pool.query('insert into monitored_api_checks(monitored_api_id,latency_ms,status_code,ok,error) values($1,$2,$3,$4,$5)', [api.id,result.latency_ms,result.status_code,result.ok,result.error])
        } catch { /* Never write credential/config details to process logs. */ }
      }
      await pool.query(`delete from monitored_api_checks where checked_at < now()-interval '90 days'`)
    } catch { /* The next tick retries; credentials and target URLs are not logged. */ }
    finally { busy = false }
  }, 1000)
  return () => clearInterval(timer)
}
