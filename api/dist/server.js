"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config.js");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pg_1 = require("pg");
const status_js_1 = require("./domain/status.js");
const monitored_apis_js_1 = require("./monitored-apis.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173' }));
app.use(express_1.default.json());
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres' });
const frankfurterUrl = process.env.FRANKFURTER_URL || 'https://api.frankfurter.dev/v2/rate/EUR/USD';
const checkTimeoutMs = Number(process.env.FRANKFURTER_TIMEOUT_MS) || 8000;
const modes = new Map();
let httpServer;
let monitorStop;
async function serviceBySlug(slug) {
    return (await pool.query('select * from services where slug=$1', [slug])).rows[0];
}
function activeMode(id) {
    const value = modes.get(id);
    if (!value || value.until <= Date.now()) {
        modes.delete(id);
        return null;
    }
    return value;
}
function validFrankfurterResponse(value) {
    if (!value || typeof value !== 'object')
        return false;
    const result = value;
    return typeof result.date === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(result.date)
        && typeof result.base === 'string'
        && /^[A-Z]{3}$/.test(result.base)
        && typeof result.quote === 'string'
        && /^[A-Z]{3}$/.test(result.quote)
        && typeof result.rate === 'number'
        && Number.isFinite(result.rate)
        && result.rate > 0;
}
async function checkFrankfurter() {
    const started = performance.now();
    let statusCode = 0;
    try {
        const response = await fetch(frankfurterUrl, { signal: AbortSignal.timeout(checkTimeoutMs), headers: { accept: 'application/json' } });
        statusCode = response.status;
        const latency = Math.round(performance.now() - started);
        if (!response.ok)
            return { ok: false, latency, statusCode, reason: `Frankfurter retornou HTTP ${statusCode}` };
        if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
            return { ok: false, latency, statusCode, reason: 'Frankfurter não retornou JSON' };
        }
        const payload = await response.json();
        const completedLatency = Math.round(performance.now() - started);
        return validFrankfurterResponse(payload)
            ? { ok: true, latency: completedLatency, statusCode, reason: null }
            : { ok: false, latency: completedLatency, statusCode, reason: 'Resposta do Frankfurter fora do formato esperado' };
    }
    catch (error) {
        const reason = error instanceof Error && error.name === 'TimeoutError'
            ? `Timeout após ${checkTimeoutMs} ms`
            : error instanceof Error ? error.message : 'Erro de conexão com Frankfurter';
        return { ok: false, latency: Math.round(performance.now() - started), statusCode, reason };
    }
}
async function getServices() {
    const { rows } = await pool.query('select * from services order by id');
    return Promise.all(rows.map(async (s) => {
        const checks = (await pool.query('select ok, latency_ms from checks where service_id=$1 order by checked_at desc limit 5', [s.id])).rows.reverse();
        const avg = (await pool.query("select coalesce(avg(latency_ms),0) value from checks where service_id=$1 and checked_at > now()-interval '5 minutes'", [s.id])).rows[0].value;
        const uptime = (await pool.query("select coalesce(avg((ok)::int)*100,0) value from checks where service_id=$1 and checked_at > now()-interval '24 hours'", [s.id])).rows[0].value;
        const incident = (await pool.query('select * from incidents where service_id=$1 and resolved_at is null', [s.id])).rows[0] || null;
        return { ...s, status: (0, status_js_1.getStatus)(checks, s.base_latency_ms), avg_latency_ms: Number(avg), uptime_24h: Number(uptime), incident, simulation: activeMode(s.id) };
    }));
}
app.get('/api/health', async (_, res) => {
    try {
        await pool.query('select 1');
        res.json({ ok: true, database: true });
    }
    catch {
        res.status(503).json({ ok: false, database: false });
    }
});
app.use('/api/monitored-apis', (0, monitored_apis_js_1.createMonitoredApiRouter)(pool));
app.get('/api/services', async (_, res, next) => { try {
    res.json(await getServices());
}
catch (e) {
    next(e);
} });
app.get('/api/services/:slug', async (req, res, next) => { try {
    const service = (await getServices()).find(x => x.slug === req.params.slug);
    service ? res.json(service) : res.status(404).json({ erro: 'NOT_FOUND', mensagem: 'Serviço não encontrado' });
}
catch (e) {
    next(e);
} });
app.get('/api/services/:slug/availability', async (req, res, next) => {
    try {
        const service = await serviceBySlug(req.params.slug);
        if (!service)
            return res.status(404).json({ erro: 'NOT_FOUND' });
        const minutes = Math.min(1440, Math.max(1, Number(req.query.minutes) || 60));
        const { rows } = await pool.query("select date_trunc('minute', checked_at) as time, round(avg((ok)::int)*100, 2) success_percent, round(avg(latency_ms), 2) average_latency_ms from checks where service_id=$1 and checked_at > now()-($2::int * interval '1 minute') group by 1 order by 1", [service.id, minutes]);
        res.json({ service: service.slug, minutes, buckets: rows });
    }
    catch (e) {
        next(e);
    }
});
app.get('/api/incidents', async (req, res, next) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const values = [limit];
        let filter = '';
        if (req.query.service) {
            values.push(req.query.service);
            filter = 'where s.slug=$2';
        }
        const { rows } = await pool.query(`select i.*, s.slug service_slug, s.name service_name, extract(epoch from (coalesce(i.resolved_at, now())-i.started_at))::int duration_seconds from incidents i join services s on s.id=i.service_id ${filter} order by i.resolved_at is null desc, i.started_at desc limit $1`, values);
        res.json(rows);
    }
    catch (e) {
        next(e);
    }
});
app.post('/api/services/:slug/simulate', async (req, res, next) => {
    try {
        const service = await serviceBySlug(req.params.slug);
        const { mode, seconds } = req.body || {};
        if (!service)
            return res.status(404).json({ erro: 'NOT_FOUND' });
        if (!['degraded', 'down'].includes(mode) || !Number.isInteger(seconds) || seconds < 10 || seconds > 300)
            return res.status(400).json({ erro: 'INVALID_SIMULATION' });
        const until = Date.now() + seconds * 1000;
        modes.set(service.id, { mode, until });
        res.status(202).json({ service: service.slug, mode, expires_at: new Date(until).toISOString() });
    }
    catch (e) {
        next(e);
    }
});
app.delete('/api/services/:slug/simulate', async (req, res, next) => {
    try {
        const service = await serviceBySlug(req.params.slug);
        if (!service)
            return res.status(404).json({ erro: 'NOT_FOUND' });
        const cancelled = modes.delete(service.id);
        res.status(cancelled ? 204 : 404).end();
    }
    catch (e) {
        next(e);
    }
});
async function runCheckCycle() {
    try {
        const { rows } = await pool.query('select * from services');
        for (const service of rows) {
            const forced = activeMode(service.id);
            const result = forced
                ? { ok: forced.mode === 'degraded', latency: Math.round(service.base_latency_ms * (forced.mode === 'degraded' ? 4 : 1)), statusCode: forced.mode === 'degraded' ? 200 : 503, reason: `Simulação ${forced.mode}` }
                : await checkFrankfurter();
            await pool.query('insert into checks(service_id, latency_ms, ok, status_code) values($1,$2,$3,$4)', [service.id, result.latency, result.ok, result.statusCode]);
            const recentChecks = (await pool.query('select ok, latency_ms from checks where service_id=$1 order by checked_at desc limit 5', [service.id])).rows.reverse();
            const status = (0, status_js_1.getStatus)(recentChecks, service.base_latency_ms);
            const open = (await pool.query('select * from incidents where service_id=$1 and resolved_at is null', [service.id])).rows[0];
            if (!open && status !== 'operational') {
                const cause = forced ? result.reason : result.reason || 'Latência acima do limite esperado';
                await pool.query('insert into incidents(service_id,severity,cause,simulated) values($1,$2,$3,$4)', [service.id, status, cause, Boolean(forced)]);
            }
            if (open && status === 'operational')
                await pool.query('update incidents set resolved_at=now() where id=$1', [open.id]);
            if (open && status !== 'operational' && open.severity !== status) {
                const cause = forced ? result.reason : result.reason || 'Status da API Frankfurter alterado';
                await pool.query('update incidents set severity=$1,cause=$2 where id=$3', [status, cause, open.id]);
            }
        }
    }
    catch (e) {
        console.error('[v0] ciclo de status:', e);
    }
}
app.use((err, _req, res, _next) => res.status(500).json({ erro: 'INTERNAL_ERROR', mensagem: err.message }));
const port = Number(process.env.PORT) || 3001;
async function startServer() {
    while (true) {
        try {
            await pool.query('select 1');
            break;
        }
        catch {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    await pool.query(`
    CREATE TABLE IF NOT EXISTS monitored_apis (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('GET','POST','PUT','DELETE')),
      headers_encrypted TEXT NOT NULL DEFAULT '', params JSONB NOT NULL DEFAULT '{}'::jsonb,
      body_encrypted TEXT NOT NULL DEFAULT '', auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none','bearer','basic','api_key')),
      auth_encrypted TEXT NOT NULL DEFAULT '', interval_seconds INTEGER NOT NULL CHECK (interval_seconds BETWEEN 15 AND 3600),
      timeout_ms INTEGER NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 30000), paused BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS monitored_api_checks (
      id BIGSERIAL PRIMARY KEY, monitored_api_id BIGINT NOT NULL REFERENCES monitored_apis(id) ON DELETE CASCADE,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(), latency_ms INTEGER NOT NULL, status_code INTEGER,
      ok BOOLEAN NOT NULL, error TEXT
    );
    CREATE INDEX IF NOT EXISTS monitored_api_checks_time ON monitored_api_checks(monitored_api_id, checked_at DESC);
  `);
    const host = process.env.NODE_ENV !== 'production' && process.env.ADMIN_AUTH_DISABLED === 'true' ? '127.0.0.1' : undefined;
    httpServer = host
        ? app.listen(port, host, () => console.log(`API Olho de Zeus na porta ${port}`))
        : app.listen(port, () => console.log(`API Olho de Zeus na porta ${port}`));
    monitorStop = (0, monitored_apis_js_1.startApiMonitor)(pool);
    setInterval(runCheckCycle, 5000);
    void runCheckCycle();
}
void startServer();
exports.default = app;
async function shutdown() {
    if (monitorStop)
        monitorStop();
    if (httpServer) {
        httpServer.close();
        httpServer.closeAllConnections();
    }
    await pool.end();
    process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
