# Olho de Zeus

MVP de monitoramento de APIs fictícias.

## Execução
`docker compose up --build`

O worker gera checks a cada 5 segundos. A função `getStatus` observa as últimas cinco checagens: três falhas levam a `down`; uma ou duas falhas, ou latência média acima do dobro da base, levam a `degraded`; os demais casos são `operational`. Incidentes são derivados desse status, abertos na transição, atualizados quando pioram e encerrados quando o serviço se recupera. A simulação altera as checagens futuras em memória e expira automaticamente.

Decisões: o frontend usa polling de 5 segundos e o gráfico inicial usa uptime agregado quando a série detalhada ainda não foi carregada; o MVP prioriza a API e o ciclo completo de incidentes para a Parte 2.
