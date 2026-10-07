# Olho de Zeus

MVP de monitoramento da API real [Frankfurter](https://api.frankfurter.dev/), com checks persistidos em PostgreSQL.

## Execução
`docker compose up --build`

O worker consulta o endpoint oficial do Frankfurter (`FRANKFURTER_URL`) a cada 5 segundos, mede a latência real e grava `checked_at`, `latency_ms`, `ok` e `status_code` em PostgreSQL. Timeout, erro de conexão, status HTTP não-2xx ou JSON inválido geram um check inválido, sem interromper o worker. A função `getStatus` observa as últimas cinco checagens: três falhas levam a `down`; uma ou duas falhas, ou latência média acima do dobro da base, levam a `degraded`; os demais casos são `operational`. Incidentes são derivados desse status, abertos na transição, atualizados quando pioram e encerrados quando o serviço se recupera. A simulação altera as checagens futuras em memória e expira automaticamente.

Decisões: o frontend usa polling de 5 segundos e o gráfico inicial usa uptime agregado quando a série detalhada ainda não foi carregada; o MVP prioriza a API e o ciclo completo de incidentes para a Parte 2.
