import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './api-manager.css'

type ApiRecord = { id: number; name: string; url: string; method: string; headers: Record<string, string>; params: Record<string, string>; body_configured: boolean; auth_type: string; auth_configured: boolean; interval_seconds: number; timeout_ms: number; paused: boolean; status: string; last_check: string | null; latency_ms: number | null; http_status: number | null; last_error: string | null; availability: number | null }
type Check = { id: number; checked_at: string; latency_ms: number; status_code: number | null; ok: boolean; error: string | null }
type Result = { ok: boolean; status_code: number | null; latency_ms: number; checked_at: string; error: string | null }
type FormState = { name: string; url: string; method: string; headers: string; params: string; body: string; auth_type: string; token: string; username: string; password: string; key_name: string; key_value: string; key_location: string; interval_seconds: number; timeout_ms: number }
const empty: FormState = { name: '', url: '', method: 'GET', headers: '{}', params: '{}', body: '', auth_type: 'none', token: '', username: '', password: '', key_name: '', key_value: '', key_location: 'header', interval_seconds: 60, timeout_ms: 10000 }

function objectText(text: string, label: string) {
  const value = JSON.parse(text || '{}')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} deve ser um objeto JSON.`)
  for (const entry of Object.values(value)) if (typeof entry !== 'string') throw new Error(`${label}: use valores de texto.`)
  return value as Record<string, string>
}
function timestamp(value: string | null) { return value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não verificada' }
function statusLabel(status: string) { return ({ online: 'Online', unstable: 'Instável', slow: 'Lenta', offline: 'Offline', paused: 'Pausada', pending: 'Aguardando verificação' } as Record<string, string>)[status] || status }

export function ApiManager() {
  const [token, setToken] = useState(() => sessionStorage.getItem('zeus-admin-token') || '')
  const [loggedIn, setLoggedIn] = useState(() => Boolean(sessionStorage.getItem('zeus-admin-token')))
  const [authRequired, setAuthRequired] = useState<boolean | null>(null)
  const [apis, setApis] = useState<ApiRecord[]>([])
  const [history, setHistory] = useState<Check[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(empty)
  const [editing, setEditing] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const authorized = loggedIn
  const apiRequest = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('content-type', 'application/json')
    if (token) headers.set('authorization', `Bearer ${token}`)
    const response = await fetch(`/api/monitored-apis${path}`, { ...init, headers })
    const data = response.status === 204 ? null : await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.message || data?.error || `Falha HTTP ${response.status}`)
    return data
  }, [token])
  const refresh = useCallback(async () => {
    if (!token || !loggedIn) return
    try { setApis(await apiRequest('')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar as APIs.') }
  }, [apiRequest, token, loggedIn])
  useEffect(() => {
    let mounted = true
    void fetch('/api/monitored-apis/access').then(response => response.json()).then(data => {
      if (!mounted) return
      setAuthRequired(Boolean(data.auth_required))
      if (!data.auth_required) {
        sessionStorage.removeItem('zeus-admin-token')
        setToken('')
        setLoggedIn(true)
      }
    }).catch(() => { if (mounted) setAuthRequired(true) })
    return () => { mounted = false }
  }, [])
  useEffect(() => { void refresh(); if (!authorized) return; const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer) }, [refresh, authorized])
  useEffect(() => {
    if (!selected || !token) { setHistory([]); return }
    let mounted = true
    const load = async () => { try { const checks = await apiRequest(`/${selected}/checks?limit=100`); if (mounted) setHistory(checks.reverse()) } catch { /* dashboard refresh reports authentication/connection errors */ } }
    void load(); const timer = window.setInterval(() => void load(), 5000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [selected, token, apiRequest])
  const chartData = useMemo(() => history.map(check => ({ time: new Date(check.checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), availability: check.ok ? 100 : 0, latency: check.latency_ms })), [history])
  const patch = (key: keyof FormState, value: string | number) => setForm(current => ({ ...current, [key]: value }))
  const makeConfig = () => {
    const auth: Record<string, string> = {}
    if (form.auth_type === 'bearer' && form.token) auth.token = form.token
    if (form.auth_type === 'basic') { if (form.username) auth.username = form.username; if (form.password) auth.password = form.password }
    if (form.auth_type === 'api_key') { if (form.key_name) auth.name = form.key_name; if (form.key_value) auth.value = form.key_value; auth.location = form.key_location }
    return { name: form.name, url: form.url, method: form.method, headers: objectText(form.headers, 'Headers'), params: objectText(form.params, 'Parâmetros'), body: form.body, auth_type: form.auth_type, auth, interval_seconds: Number(form.interval_seconds), timeout_ms: Number(form.timeout_ms), api_id: editing }
  }
  const test = async () => {
    setBusy(true); setError(''); setMessage(''); setResult(null)
    try { const data = await apiRequest('/test', { method: 'POST', body: JSON.stringify(makeConfig()) }); setResult(data); setMessage(data.ok ? 'Requisição real concluída.' : 'A requisição falhou. Confira o resultado abaixo.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao testar a API.') } finally { setBusy(false) }
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const config = makeConfig(); await apiRequest(editing ? `/${editing}` : '', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(config) }); setMessage(editing ? 'Configuração atualizada.' : 'API cadastrada e monitoramento iniciado.'); setForm(empty); setEditing(null); setResult(null); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a API.') } finally { setBusy(false) }
  }
  const edit = (api: ApiRecord) => {
    setEditing(api.id); setSelected(api.id)
    setForm({ ...empty, name: api.name, url: api.url, method: api.method, headers: JSON.stringify(api.headers, null, 2), params: JSON.stringify(api.params, null, 2), auth_type: api.auth_type, interval_seconds: api.interval_seconds, timeout_ms: api.timeout_ms })
    setMessage('Credenciais mascaradas são preservadas se deixadas em branco. Informe valores novos para substituí-las.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const state = async (api: ApiRecord, paused: boolean) => { try { await apiRequest(`/${api.id}/state`, { method: 'PATCH', body: JSON.stringify({ paused }) }); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao alterar estado.') } }
  const remove = async (api: ApiRecord) => { if (!window.confirm(`Excluir “${api.name}” e o histórico de verificações?`)) return; try { await apiRequest(`/${api.id}`, { method: 'DELETE' }); if (selected === api.id) setSelected(null); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao excluir API.') } }

  return <section className="api-manager">
    <div className="api-section-heading"><div><p className="eyebrow">MONITORAMENTO PERSONALIZADO</p><h2>Adicionar API</h2><p>Configure endpoints reais. As requisições e credenciais ficam no backend.</p></div><span className="live-indicator"><i /> Verificação contínua</span></div>
    {authRequired === null ? <div className="api-auth-card">Verificando acesso</div> : (!authorized && authRequired) ? <div className="api-auth-card"><h3>Acesso administrativo</h3><p>Informe o ZEUS_ADMIN_TOKEN configurado no servidor para gerenciar endpoints.</p><form onSubmit={event => { event.preventDefault(); sessionStorage.setItem('zeus-admin-token', token); setLoggedIn(true) }}><label>Token administrativo<input value={token} onChange={e => setToken(e.target.value)} type="password" autoComplete="current-password" required /></label><button className="primary-action">Entrar</button></form><small>O token permanece apenas nesta sessão do navegador.</small></div> : <>
      <div className="api-toolbar"><span>{apis.length} {apis.length === 1 ? 'API monitorada' : 'APIs monitoradas'}</span>{authRequired && <button className="secondary-action" onClick={() => { sessionStorage.removeItem('zeus-admin-token'); setToken(''); setLoggedIn(false); setApis([]) }}>Sair</button>}</div>
      {error && <div className="api-message error" role="alert">{error}</div>}{message && <div className="api-message" role="status">{message}</div>}
      <form className="api-form panel" onSubmit={save}>
        <div className="api-form-heading"><h3>{editing ? 'Editar configuração' : 'Configuração do endpoint'}</h3><span>Campos marcados com * são obrigatórios</span></div>
        <div className="api-form-grid">
          <label>Nome da API *<input required maxLength={120} value={form.name} onChange={e => patch('name', e.target.value)} placeholder="Minha API" /></label>
          <label className="span-two">URL do endpoint *<input required type="url" value={form.url} onChange={e => patch('url', e.target.value)} placeholder="https://api.exemplo.com/v1/health" /></label>
          <label>Método HTTP<select value={form.method} onChange={e => patch('method', e.target.value)}>{['GET', 'POST', 'PUT', 'DELETE'].map(method => <option key={method}>{method}</option>)}</select></label>
          <label>Intervalo (segundos)<input type="number" min={15} max={3600} value={form.interval_seconds} onChange={e => patch('interval_seconds', Number(e.target.value))} /></label>
          <label>Timeout (ms)<input type="number" min={1000} max={30000} step={500} value={form.timeout_ms} onChange={e => patch('timeout_ms', Number(e.target.value))} /></label>
          <label>Autenticação<select value={form.auth_type} onChange={e => patch('auth_type', e.target.value)}><option value="none">Nenhuma</option><option value="bearer">Bearer token</option><option value="basic">Basic</option><option value="api_key">API key</option></select></label>
          {form.auth_type === 'bearer' && <label className="span-two">Bearer token<input type="password" autoComplete="new-password" value={form.token} onChange={e => patch('token', e.target.value)} placeholder={editing ? 'Vazio preserva o token atual' : 'Token secreto'} /></label>}
          {form.auth_type === 'basic' && <><label>Usuário<input value={form.username} onChange={e => patch('username', e.target.value)} /></label><label>Senha<input type="password" autoComplete="new-password" value={form.password} onChange={e => patch('password', e.target.value)} placeholder={editing ? 'Vazio preserva a senha atual' : 'Senha'} /></label></>}
          {form.auth_type === 'api_key' && <><label>Nome do campo<input value={form.key_name} onChange={e => patch('key_name', e.target.value)} placeholder="X-API-Key" /></label><label>Valor da API key<input type="password" autoComplete="new-password" value={form.key_value} onChange={e => patch('key_value', e.target.value)} placeholder={editing ? 'Vazio preserva a chave atual' : 'Chave secreta'} /></label><label>Enviar em<select value={form.key_location} onChange={e => patch('key_location', e.target.value)}><option value="header">Header</option><option value="query">Parâmetro da URL</option></select></label></>}
          <label className="span-two">Headers (objeto JSON)<textarea rows={4} value={form.headers} onChange={e => patch('headers', e.target.value)} spellCheck={false} placeholder={'{\n  "accept": "application/json"\n}'} /></label>
          <label className="span-two">Parâmetros (objeto JSON)<textarea rows={3} value={form.params} onChange={e => patch('params', e.target.value)} spellCheck={false} placeholder={'{\n  "status": "active"\n}'} /></label>
          {form.method !== 'GET' && <label className="span-two">Corpo da requisição<textarea rows={4} value={form.body} onChange={e => patch('body', e.target.value)} spellCheck={false} placeholder="JSON ou texto enviado no corpo" /></label>}
        </div>
        <div className="api-form-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => void test()}>{busy ? 'Aguarde…' : 'Testar API'}</button><button className="primary-action" disabled={busy}>{editing ? 'Salvar alterações' : 'Cadastrar e monitorar'}</button>{editing && <button type="button" className="text-action" onClick={() => { setEditing(null); setForm(empty); setMessage('') }}>Cancelar edição</button>}</div>
        {result && <div className={`test-result ${result.ok ? 'success' : 'failure'}`} role="status"><strong>{result.ok ? 'Disponível' : 'Indisponível'}</strong><span>HTTP {result.status_code ?? '—'}</span><span>{result.latency_ms} ms</span><span>{timestamp(result.checked_at)}</span>{result.error && <p>{result.error}</p>}</div>}
      </form>
      <div className="managed-api-list">{apis.map(api => <article className="managed-api panel" key={api.id}>
        <div className="managed-api-head"><div><div className="managed-api-title"><h3>{api.name}</h3><span className={`api-status ${api.status}`}>{statusLabel(api.status)}</span></div><p><code>{api.method}</code> {api.url}</p></div><div className="managed-api-actions"><button onClick={() => edit(api)}>Editar</button><button onClick={() => void state(api, !api.paused)}>{api.paused ? 'Reativar' : 'Pausar'}</button><button className="danger-action" onClick={() => void remove(api)}>Excluir</button></div></div>
        <div className="managed-api-metrics"><span><small>HTTP</small><strong>{api.http_status ?? '—'}</strong></span><span><small>Latência</small><strong>{api.latency_ms === null ? '—' : `${api.latency_ms} ms`}</strong></span><span><small>Disponibilidade 24h</small><strong>{api.availability === null ? '—' : `${api.availability}%`}</strong></span><span><small>Última verificação</small><strong>{timestamp(api.last_check)}</strong></span><span><small>Intervalo</small><strong>{api.interval_seconds}s</strong></span></div>
        {api.last_error && <p className="api-last-error">Falha mais recente: {api.last_error}</p>}
        <button className="history-toggle" onClick={() => setSelected(selected === api.id ? null : api.id)}>{selected === api.id ? 'Ocultar histórico' : 'Ver histórico e gráficos'}</button>
        {selected === api.id && <div className="api-history"><div className="api-chart-grid"><div><h4>Disponibilidade</h4><div className="api-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid stroke="#e7edf5" strokeDasharray="3 5" /><XAxis dataKey="time" hide /><YAxis domain={[0, 100]} unit="%" width={42} /><Tooltip /><Line dataKey="availability" name="Disponibilidade" stroke="#2563eb" dot={false} /></LineChart></ResponsiveContainer></div></div><div><h4>Latência</h4><div className="api-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid stroke="#e7edf5" strokeDasharray="3 5" /><XAxis dataKey="time" hide /><YAxis unit=" ms" width={52} /><Tooltip /><Line dataKey="latency" name="Latência" stroke="#d97706" dot={false} /></LineChart></ResponsiveContainer></div></div></div><div className="api-checks-scroll"><table><thead><tr><th>Data e hora</th><th>Estado</th><th>HTTP</th><th>Latência</th><th>Erro</th></tr></thead><tbody>{history.map(check => <tr key={check.id}><td>{timestamp(check.checked_at)}</td><td>{check.ok ? 'Disponível' : 'Falha'}</td><td>{check.status_code ?? '—'}</td><td>{check.latency_ms} ms</td><td>{check.error || '—'}</td></tr>)}{!history.length && <tr><td colSpan={5}>Nenhuma verificação registrada.</td></tr>}</tbody></table></div></div>}
      </article>)}{!apis.length && <div className="empty-state">Nenhuma API personalizada cadastrada.</div>}</div>
    </>}
  </section>
}
