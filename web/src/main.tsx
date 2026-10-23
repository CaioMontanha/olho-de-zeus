import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './style.css'
import { ApiManager } from './ApiManager'

type Service = {
  name: string
  slug: string
  status: 'operational' | 'degraded' | 'down'
  avg_latency_ms: number
  uptime_24h: number
  simulation: { mode: SimulationMode; until: number } | null
}

type Incident = {
  id: number
  service_slug: string
  service_name: string
  severity: 'degraded' | 'down'
  cause: string
  started_at: string
  resolved_at?: string | null
  duration_seconds: number
  simulated: boolean
}

type Bucket = { time: string; success_percent: number; average_latency_ms: number }
type Availability = { service: string; buckets: Bucket[] }
type SimulationMode = 'degraded' | 'down'

const lineColors = ['#2563eb', '#059669', '#7c3aed', '#d97706']

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`
}

function formatStatus(status: Service['status']) {
  if (status === 'operational') return 'Operacional'
  if (status === 'degraded') return 'Degradado'
  return 'Indisponível'
}

function formatIncidentSeverity(severity: Incident['severity']) {
  return severity === 'down' ? 'SEV-1' : 'SEV-2'
}

function App() {
  const [tab, setTab] = useState<'dashboard' | 'apis'>('dashboard')
  const [services, setServices] = useState<Service[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [series, setSeries] = useState<Record<string, Bucket[]>>({})
  const [modes, setModes] = useState<Record<string, SimulationMode>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [now, setNow] = useState(Date.now())

  const load = async () => {
    try {
      const [serviceResponse, incidentResponse] = await Promise.all([
        fetch('/api/services'),
        fetch('/api/incidents?limit=20'),
      ])
      if (!serviceResponse.ok || !incidentResponse.ok) throw new Error('API indisponível')

      const nextServices: Service[] = await serviceResponse.json()
      const nextIncidents: Incident[] = await incidentResponse.json()
      const availability = await Promise.all(nextServices.map(async (service) => {
        const response = await fetch(`/api/services/${service.slug}/availability?minutes=60`)
        if (!response.ok) throw new Error('Não foi possível carregar a disponibilidade')
        return response.json() as Promise<Availability>
      }))

      const nextSeries: Record<string, Bucket[]> = {}
      availability.forEach(({ service, buckets }) => {
        nextSeries[service] = buckets.map(bucket => ({
          ...bucket,
          success_percent: Number(bucket.success_percent),
          average_latency_ms: Number(bucket.average_latency_ms),
        }))
      })

      setServices(nextServices)
      setIncidents(nextIncidents)
      setSeries(nextSeries)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { window.clearInterval(timer); window.clearInterval(clock) }
  }, [])

  const chartData = useMemo(() => {
    const times = [...new Set(Object.values(series).flat().map(bucket => bucket.time))].sort()
    const latest = times.length ? new Date(times[times.length - 1]).getTime() : 0
    return times.map(time => {
      const offset = Math.max(0, Math.round((latest - new Date(time).getTime()) / 60_000))
      return Object.fromEntries([
        ['time', offset === 0 ? 'Agora' : `-${offset}m`],
        ...services.map(service => [
          service.slug,
          series[service.slug]?.find(bucket => bucket.time === time)?.success_percent ?? null,
        ]),
      ])
    })
  }, [series, services])

  const chartValues = chartData.flatMap(point => services
    .map(service => point[service.slug])
    .filter(value => value !== null && Number.isFinite(Number(value)))
    .map(Number))
  const lowestUptime = chartValues.length ? Math.min(...chartValues) : 95
  const chartMinimum = lowestUptime >= 95 ? 95 : Math.max(0, Math.floor(lowestUptime / 5) * 5)

  const simulate = async (slug: string) => {
    setBusy(slug)
    setActionError('')
    try {
      const response = await fetch(`/api/services/${slug}/simulate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: modes[slug] || 'degraded', seconds: durations[slug] || 60 }),
      })
      if (!response.ok) throw new Error('A simulação não pôde ser iniciada.')
      await load()
    } catch {
      setActionError('Não foi possível iniciar a simulação. Confira a conexão e tente novamente.')
    } finally {
      setBusy(null)
    }
  }

  const cancelSimulation = async (slug: string) => {
    setBusy(slug)
    setActionError('')
    try {
      const response = await fetch(`/api/services/${slug}/simulate`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw new Error('A simulação não pôde ser cancelada.')
      await load()
    } catch {
      setActionError('Não foi possível cancelar a simulação. Confira a conexão e tente novamente.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo" src="/logo_montanha_2_VERSAO_2.png" alt="Logo Olho de Zeus" />
          <div>
            <h1>OLHO DE ZEUS</h1>
            <p>Monitor de incidentes de APIs</p>
          </div>
        </div>
        <div className="refresh-badge"><span className="live-dot" /><span>Atualização automática: 5s</span></div>
      </header>

      <nav className="dashboard-tabs" aria-label="Navegação principal">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={tab === 'apis' ? 'active' : ''} onClick={() => setTab('apis')}>Adicionar API</button>
      </nav>

      {tab === 'apis' ? <ApiManager /> : <>

      {offline && <div className="notice notice-error" role="alert">Sem conexão com a API. Tentando reconectar automaticamente.</div>}
      {actionError && <div className="notice notice-error" role="alert">{actionError}</div>}

      {loading ? (
        <section className="service-grid" aria-label="Carregando serviços">
          {[0, 1, 2].map(item => <div className="skeleton-card" key={item} />)}
        </section>
      ) : (
        <>
          <section className="service-grid" aria-label="Status dos serviços">
            {services.map(service => (
              <article className="service-card" key={service.slug}>
                <div className="service-heading">
                  <span className="service-name">{service.slug}</span>
                  <span className={`status-pill ${service.status}`}><i />{formatStatus(service.status)}</span>
                </div>

                <div className="metrics-grid">
                  <div className="metric">
                    <span>Latência média</span>
                    <strong>{Math.round(service.avg_latency_ms)} <small>ms</small></strong>
                  </div>
                  <div className="metric">
                    <span>Uptime 24h</span>
                    <strong>{service.uptime_24h.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>%</small></strong>
                  </div>
                </div>

                {service.simulation && (
                  <div className={`simulation-active ${service.simulation.mode}`} role="status">
                    <span><strong>Simulação ativa</strong><small>{service.simulation.mode === 'down' ? 'Indisponível' : 'Degradado'} · termina em {formatDuration(Math.max(0, Math.ceil((service.simulation.until - now) / 1000)))}</small></span>
                    <button className="cancel-simulation-button" disabled={busy !== null} onClick={() => void cancelSimulation(service.slug)}>Cancelar</button>
                  </div>
                )}

                <div className="simulation-controls">
                  <label>
                    <span>Modo</span>
                    <select disabled={Boolean(service.simulation) || busy !== null} value={modes[service.slug] || 'degraded'} onChange={event => setModes(current => ({ ...current, [service.slug]: event.target.value as SimulationMode }))}>
                      <option value="degraded">Degradado</option>
                      <option value="down">Indisponível</option>
                    </select>
                  </label>
                  <label>
                    <span>Duração</span>
                    <select disabled={Boolean(service.simulation) || busy !== null} value={durations[service.slug] || 60} onChange={event => setDurations(current => ({ ...current, [service.slug]: Number(event.target.value) }))}>
                      <option value={60}>60 segundos</option>
                      <option value={120}>120 segundos</option>
                      <option value={300}>5 minutos</option>
                    </select>
                  </label>
                  <button className="simulate-button" disabled={busy !== null || Boolean(service.simulation)} onClick={() => void simulate(service.slug)}>
                    {busy === service.slug ? 'Iniciando…' : 'Simular'}
                  </button>
                </div>
              </article>
            ))}
            {!services.length && <div className="empty-state">Nenhum serviço cadastrado.</div>}
          </section>

          <section className="panel availability-panel">
            <div className="panel-heading">
              <div>
                <h2>Disponibilidade — última hora</h2>
                <p>Percentual de uptime e telemetria contínua por serviço</p>
              </div>
              <div className="chart-legend">
                {services.map((service, index) => <span key={service.slug}><i style={{ backgroundColor: lineColors[index % lineColors.length] }} />{service.slug}</span>)}
              </div>
            </div>
            {chartData.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 16, right: 12, bottom: 2, left: 0 }}>
                    <CartesianGrid stroke="#e7edf5" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="time" axisLine={{ stroke: '#dbe3ed' }} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} minTickGap={30} />
                    <YAxis domain={[chartMinimum, 100]} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} width={54} tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Uptime']} contentStyle={{ borderRadius: 8, borderColor: '#dbe3ed', fontSize: 12 }} />
                    {services.map((service, index) => <Line key={service.slug} connectNulls type="monotone" dataKey={service.slug} name={service.slug} stroke={lineColors[index % lineColors.length]} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="empty-state">Ainda não há dados de disponibilidade.</div>}
          </section>

      <section className="panel incidents-panel">
            <div className="panel-heading">
              <div>
                <h2>Incidentes recentes</h2>
                <p>Histórico de eventos mitigados e resolvidos nas últimas 72 horas</p>
              </div>
              <span className="history-count">{incidents.length} {incidents.length === 1 ? 'registro' : 'registros'}</span>
            </div>
            {incidents.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Serviço</th><th>Severidade</th><th>Causa</th><th>Início</th><th>Duração</th><th>Simulado</th></tr></thead>
                  <tbody>{incidents.map(incident => (
                    <tr key={incident.id}>
                      <td className="service-name">{incident.service_name}</td>
                      <td><span className={`severity-pill ${incident.severity}`}>{formatIncidentSeverity(incident.severity)}</span></td>
                      <td>{incident.cause}</td>
                      <td className="timestamp">{new Date(incident.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="timestamp">{formatDuration(incident.duration_seconds)}{!incident.resolved_at && <span className="open-label">Em aberto</span>}</td>
                      <td>{incident.simulated ? 'Sim' : 'Não'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="empty-state">Nenhum incidente registrado.</div>}
      </section>
        </>
      )}
      </>}
      <a className="portfolio-launcher" href="/portfolio/index.html" target="_blank" rel="noreferrer" aria-label="Abrir meu portfólio em uma nova aba" title="Meu portfólio">
        <span className="portfolio-mark" aria-hidden="true"><img src="/logo_montanha_2_VERSAO_2.png" alt="" /></span>
        <span>Portfólio</span>
      </a>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
