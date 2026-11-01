OLHO DE ZEUS
Monitor de incidentes de APIs


COMO USAR COM A IA

Cole este documento inteiro e peça: construa o projeto completo de uma vez, sem me fazer perguntas. Onde faltar detalhe, decida e anote a decisão no README. Siga os contratos de API ao pé da letra, escreva testes para tudo que estiver marcado como função pura e entregue com um único comando para subir (docker compose up).


A IDEIA EM DUAS LINHAS

Um painel que vigia três APIs fictícias de uma empresa de pagamentos. Um worker no backend faz checagens a cada 5 segundos, o status de cada API é calculado a partir dessas checagens e o incidente abre e fecha sozinho quando o status muda.


O QUE TIRA ISSO DO NÍVEL DE TUTORIAL

O status nunca é digitado nem gravado à mão. Ele é consequência das checagens. O botão Simular incidente não escreve um incidente no banco: ele piora as checagens futuras daquele serviço, e o resto do sistema reage como reagiria a uma falha de verdade. Se o botão só inserir uma linha na tabela de incidentes, o projeto vira um CRUD com fantasia de observabilidade.


STACK

Frontend: React + TypeScript + Vite + Recharts
Backend: Node + Express + TypeScript, SQL puro com o pacote pg
Banco: PostgreSQL 16
Infra: docker compose com três serviços (db, api, web)


ESTRUTURA DE PASTAS

olho-de-zeus/
  docker-compose.yml
  .env.example
  db/init.sql                       tabelas, índices e seed
  api/src/server.ts
  api/src/db.ts
  api/src/routes/services.ts
  api/src/routes/incidents.ts
  api/src/domain/status.ts          função pura que decide o status
  api/src/domain/status.test.ts
  api/src/worker/checker.ts         loop de checagem e ciclo dos incidentes
  api/src/worker/simulation.ts      modos forçados guardados em memória
  web/src/api.ts
  web/src/types.ts
  web/src/hooks/usePolling.ts
  web/src/components/ServiceCard.tsx
  web/src/components/IncidentTable.tsx
  web/src/components/AvailabilityChart.tsx
  web/src/components/SimulateButton.tsx
  web/src/App.tsx


MODELO DE DADOS

services: id, slug (unique), name, base_latency_ms
checks: id, service_id, checked_at, latency_ms, ok (boolean), status_code
incidents: id, service_id, severity (degraded ou down), cause, started_at, resolved_at (nulo enquanto aberto), simulated (boolean)

Índice em checks (service_id, checked_at desc).
Só pode existir um incidente aberto por serviço. Garanta isso no banco com um índice único parcial em incidents (service_id) where resolved_at is null.


REGRAS

Checagem: a cada 5 segundos o worker gera, para cada serviço, uma latência igual a base_latency_ms com variação de mais ou menos 25%, e 2% de chance de falhar sozinho (ok false, status 500). Se houver modo forçado ativo, ele altera isso: degraded multiplica a latência por 4 e faz 30% das checagens falharem; down faz 100% falharem.

Status (função pura getStatus(ultimasChecagens, baseLatency)): olha as últimas 5 checagens. down se 3 ou mais falharam. degraded se 1 ou 2 falharam, ou se a latência média passou de 2 vezes a base. operational em todo o resto.

Incidente: quando o status sai de operational, abre um incidente. Se já existe um aberto e o status piorou de degraded para down, atualiza a severidade em vez de abrir outro. Fecha (resolved_at) quando o status volta a operational. A janela de 5 checagens já funciona como histerese, então não precisa de contador extra. A causa é sorteada de uma lista realista: timeout no gateway de cartão, pool de conexões esgotado, deploy com rollback, certificado perto de expirar, fila de mensagens acumulada.

Uptime 24h: checagens ok dividido pelo total das últimas 24 horas, em porcentagem com uma casa decimal.

Simulação: o modo forçado fica em memória, por serviço, com expiração (padrão 60 segundos). Incidentes abertos enquanto ele está ativo recebem simulated true.


CONTRATO DA API

GET   /api/health
GET   /api/services
      lista com status, latência média de 5 min, uptime 24h e incidente aberto (ou null)
GET   /api/services/:slug
GET   /api/services/:slug/availability?minutes=60
      buckets de 1 minuto com t, ok_pct e avg_latency_ms
GET   /api/incidents?limit=20&service=slug
      mais recentes primeiro, com duração calculada
POST  /api/services/:slug/simulate
      corpo: mode (degraded ou down) e seconds (de 10 a 300). Responde 202.

Erros sempre no formato { erro, mensagem }.


TELAS (uma página só)

Topo: três cards. Cada um tem nome, bolinha de status colorida (verde, amarelo, vermelho) junto com o texto do status, latência média, uptime 24h e o botão Simular com um select de modo.
Meio: gráfico de linha da disponibilidade da última hora, uma linha por serviço.
Base: tabela de incidentes com serviço, severidade, causa, início, duração e um selo Simulado. O incidente aberto fica no topo e a duração dele continua correndo.

O hook usePolling busca tudo a cada 5 segundos. Se a API cair, aparece uma faixa Sem conexão com a API em vez de tela quebrada. Cor nunca é a única informação: sempre vem com texto.


DADOS DE SEED (no init.sql)

payment-api, base de 120 ms
auth-api, base de 60 ms
orders-api, base de 180 ms

24 horas de checagens históricas geradas com generate_series, para o gráfico não nascer vazio, e quatro incidentes antigos já resolvidos, com durações entre 4 e 38 minutos.


ORDEM DE CONSTRUÇÃO

passo 1: init.sql, docker compose e conexão com o banco
passo 2: status.ts com testes (0 falhas, 1 falha, 3 falhas, latência em 2 vezes a base, latência exatamente no limite)
passo 3: worker de checagem e o ciclo de abrir e fechar incidente
passo 4: rotas da API
passo 5: frontend


O QUE PRECISA ESTAR LÁ PARA PARECER INTERMEDIÁRIO

Função pura testada. Índice parcial garantindo um incidente aberto por serviço. Tipos compartilhados entre api e web. Tratamento de erro no polling. .env.example. README curto com o fluxo desenhado em texto: worker, checks, status, incidente.


FORA DO ESCOPO

Login, websocket (polling basta), alertas por e-mail, várias empresas.


PRONTO QUANDO

Clicar em Simular down na Payment API deixa o card vermelho em até 15 segundos, aparece um incidente aberto na tabela e, passada a duração, o card volta a ficar verde e o incidente fecha sozinho com a duração registrada.
