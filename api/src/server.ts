import express from 'express'
import cors from 'cors'
import { Pool } from 'pg'
import { getStatus } from './domain/status.js'

const app = express()
app.use(cors())
app.use(express.json())
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://zeus:zeus@localhost:5432/zeus' })
const modes = new Map<number, { mode: 'degraded' | 'down'; until: number }>()
const causes = ['timeout no gateway de cartão', 'pool de conexões esgotado', 'deploy com rollback', 'certificado perto de expirar', 'fila de mensagens acumulada']

async function serviceBySlug(slug: string) {
  return (await pool.query('select * from services where slug=$1', [slug])).rows[0]
}
function activeMode(id: number) { const value = modes.get(id); if (!value || value.until <= Date.now()) { modes.delete(id); return null }; return value }
async function getServices() {
  const { rows } = await pool.query('select * from services order by id')
  return Promise.all(rows.map(async (s) => {
    const checks = (await pool.query('select ok, latency_ms from checks where service_id=$1 order by checked_at desc limit 5', [s.id])).rows
    const avg = (await pool.query("select coalesce(avg(latency_ms),0) value from checks where service_id=$1 and checked_at > now()-interval '5 minutes'", [s.id])).rows[0].value
    const uptime = (await pool.query("select coalesce(avg((ok)::int)*100,0) value from checks where service_id=$1 and checked_at > now()-interval '24 hours'", [s.id])).rows[0].value
    const incident = (await pool.query('select * from incidents where service_id=$1 and resolved_at is null', [s.id])).rows[0] || null
    return { ...s, status: getStatus(checks, s.base_latency_ms), avg_latency_ms: Number(avg), uptime_24h: Number(uptime), incident, simulation: activeMode(s.id) }
  }))
}

app.get('/api/health', (_, res) => res.json({ ok: true }))
app.get('/api/services', async (_, res, next) => { try { res.json(await getServices()) } catch (e) { next(e) } })
app.get('/api/services/:slug', async (req, res, next) => { try { const s = (await getServices()).find(x => x.slug === req.params.slug); s ? res.json(s) : res.status(404).json({ erro: 'NOT_FOUND', mensagem: 'Serviço não encontrado' }) } catch (e) { next(e) } })
app.get('/api/services/:slug/availability', async (req, res, next) => { try { const service = await serviceBySlug(req.params.slug); if (!service) return res.status(404).json({ erro: 'NOT_FOUND' }); const minutes = Math.min(1440, Math.max(1, Number(req.query.minutes) || 60)); const { rows } = await pool.query("select date_trunc('minute', checked_at) as time, round(avg((ok)::int)*100, 2) success_percent, round(avg(latency_ms), 2) average_latency_ms from checks where service_id=$1 and checked_at > now()-($2::int * interval '1 minute') group by 1 order by 1", [service.id, minutes]); res.json({ service: service.slug, minutes, buckets: rows }) } catch (e) { next(e) } })
app.get('/api/incidents', async (req, res, next) => { try { const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20)); const values: unknown[] = [limit]; let filter = ''; if (req.query.service) { values.unshift(req.query.service); filter = 'where s.slug=$2' } const { rows } = await pool.query(`select i.*, s.slug service_slug, s.name service_name, extract(epoch from (coalesce(i.resolved_at, now())-i.started_at))::int duration_seconds from incidents i join services s on s.id=i.service_id ${filter} order by i.resolved_at is null desc, i.started_at desc limit $1`, values); res.json(rows) } catch (e) { next(e) } })
app.post('/api/services/:slug/simulate', async (req, res, next) => { try { const service = await serviceBySlug(req.params.slug); const { mode, seconds } = req.body || {}; if (!service) return res.status(404).json({ erro: 'NOT_FOUND' }); if (!['degraded', 'down'].includes(mode) || !Number.isInteger(seconds) || seconds < 10 || seconds > 300) return res.status(400).json({ erro: 'INVALID_SIMULATION' }); modes.set(service.id, { mode, until: Date.now() + seconds * 1000 }); res.status(202).json({ service: service.slug, mode, expires_at: new Date(Date.now() + seconds * 1000).toISOString() }) } catch (e) { next(e) } })

setInterval(async () => { try { const { rows } = await pool.query('select * from services'); for (const s of rows) { const forced = activeMode(s.id); const ok = forced?.mode === 'down' ? false : forced?.mode === 'degraded' ? Math.random() >= 0.3 : Math.random() >= 0.02; const latency = Math.round(s.base_latency_ms * (forced?.mode === 'degraded' ? 4 : 0.8 + Math.random() * 0.4)); await pool.query('insert into checks(service_id, latency_ms, ok, status_code) values($1,$2,$3,$4)', [s.id, latency, ok, ok ? 200 : 503]); const severity = ok ? null : forced?.mode === 'degraded' ? 'degraded' : 'down'; const open = (await pool.query('select * from incidents where service_id=$1 and resolved_at is null', [s.id])).rows[0]; if (!open && severity) await pool.query('insert into incidents(service_id,severity,cause,simulated) values($1,$2,$3,$4)', [s.id, severity, forced ? `simulação ${forced.mode}` : causes[Math.floor(Math.random() * causes.length)], Boolean(forced)]); if (open && ok) await pool.query('update incidents set resolved_at=now() where id=$1', [open.id]) } } catch (e) { console.error('[v0] ciclo de status:', e) } }, 5000)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ erro: 'INTERNAL_ERROR', mensagem: err.message }))
app.listen(Number(process.env.PORT) || 4000, () => console.log('API Olho de Zeus na porta 4000'))
export default app

function _keepTypes() { return causes }
export { _keepTypes }

app.set('trust proxy', true)
app.get('/', (_, res) => res.json({ name: 'olho-de-zeus-api' }))
app.get('/api/_noop', (_, res) => res.status(204).end())
void app

// O servidor é iniciado acima para manter compatibilidade com o MVP original.

// eslint-disable-next-line no-unused-vars
const _serverReady = true
void _serverReady

// A exportação facilita testes de rota sem alterar o ciclo de execução.

// fim

// manter o módulo vivo em runtimes que removem listeners
process.on('SIGTERM', () => pool.end())
