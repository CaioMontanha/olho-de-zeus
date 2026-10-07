"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pg_1 = require("pg");
const status_js_1 = require("./domain/status.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://zeus:zeus@localhost:5432/zeus' });
const causes = ['timeout no gateway de cartão', 'pool de conexões esgotado', 'deploy com rollback', 'certificado perto de expirar', 'fila de mensagens acumulada'];
const modes = new Map();
async function services() { const { rows } = await pool.query('select * from services order by id'); return Promise.all(rows.map(async (s) => { const c = (await pool.query('select ok,latency_ms from checks where service_id=$1 order by checked_at desc limit 5', [s.id])).rows; const avg = (await pool.query("select coalesce(avg(latency_ms),0) v from checks where service_id=$1 and checked_at>now()-interval '5 minutes'", [s.id])).rows[0].v; const up = (await pool.query("select coalesce(avg((ok)::int)*100,0) v from checks where service_id=$1 and checked_at>now()-interval '24 hours'", [s.id])).rows[0].v; const inc = (await pool.query('select * from incidents where service_id=$1 and resolved_at is null', [s.id])).rows[0] || null; return { ...s, status: (0, status_js_1.getStatus)(c, s.base_latency_ms), avg_latency_ms: Number(avg), uptime_24h: Number(up), incident: inc }; })); }
app.get('/api/health', (_, r) => r.json({ ok: true }));
app.get('/api/services', async (_, r) => r.json(await services()));
app.get('/api/services/:slug', async (req, r) => { const all = await services(); const s = all.find(x => x.slug === req.params.slug); if (!s)
    return r.status(404).json({ erro: 'NOT_FOUND', mensagem: 'Serviço não encontrado' }); r.json(s); });
app.get('/api/incidents', async (req, r) => { const { rows } = await pool.query('select i.*,s.slug service_slug,s.name service_name,coalesce(i.resolved_at,now())-i.started_at duration from incidents i join services s on s.id=i.service_id order by started_at desc limit $1', [Number(req.query.limit) || 20]); r.json(rows); });
app.post('/api/services/:slug/simulate', async (req, r) => { const s = (await pool.query('select id from services where slug=$1', [req.params.slug])).rows[0]; if (!s)
    return r.status(404).json({ erro: 'NOT_FOUND', mensagem: 'Serviço não encontrado' }); modes.set(s.id, { mode: req.body.mode, until: Date.now() + (Math.min(300, Math.max(10, Number(req.body.seconds) || 60)) * 1000) }); r.status(202).json({ ok: true }); });
async function tick() { for (const s of (await pool.query('select * from services')).rows) {
    const forced = modes.get(s.id);
    const active = forced && forced.until > Date.now() ? forced : null;
    const fail = active?.mode === 'down' || (active?.mode === 'degraded' ? Math.random() < .3 : Math.random() < .02);
    const latency = Math.round(s.base_latency_ms * (active?.mode === 'degraded' ? 4 : 0.75 + Math.random() * .5));
    await pool.query('insert into checks(service_id,latency_ms,ok,status_code) values($1,$2,$3,$4)', [s.id, latency, !fail, fail ? 500 : 200]);
    const current = (await services()).find(x => x.id === s.id);
    const open = (await pool.query('select * from incidents where service_id=$1 and resolved_at is null', [s.id])).rows[0];
    if (current?.status !== 'operational' && !open)
        await pool.query('insert into incidents(service_id,severity,cause,simulated) values($1,$2,$3,$4)', [s.id, current?.status, causes[Math.floor(Math.random() * causes.length)], Boolean(active)]);
    else if (open && current?.status === 'down' && open.severity === 'degraded')
        await pool.query("update incidents set severity='down' where id=$1", [open.id]);
    else if (open && current?.status === 'operational')
        await pool.query('update incidents set resolved_at=now() where id=$1', [open.id]);
} }
setInterval(() => tick().catch(console.error), 5000);
app.listen(Number(process.env.PORT) || 3001, () => console.log('Zeus API online'));
