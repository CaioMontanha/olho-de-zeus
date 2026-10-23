# Olho de Zeus

Painel de monitoramento da API real [Frankfurter](https://frankfurter.dev/pt/), com verificações e incidentes persistidos em PostgreSQL.

## Executar localmente, sem Docker

Requisitos: Node.js 20 ou superior e npm.

```bash
npm install
npm run dev
```

Abra <http://localhost:5173>. O comando inicia o frontend, a API na porta 3001 e um PostgreSQL local embutido em PGlite na porta 5432. O banco cria o esquema automaticamente e persiste os dados em `.pglite-data/`.

O monitor consulta `https://api.frankfurter.dev/v2/rate/EUR/USD` a cada 5 segundos e valida o status HTTP, o tipo de conteúdo e os campos `date`, `base`, `quote` e `rate` da resposta v2. A URL e o timeout podem ser configurados com `FRANKFURTER_URL` e `FRANKFURTER_TIMEOUT_MS`.

O status considera as últimas cinco verificações: três falhas levam a `down`; uma ou duas falhas, ou latência média acima do dobro da base, levam a `degraded`; os demais casos são `operational`. Incidentes são abertos, atualizados e resolvidos conforme essas transições. Os botões do painel permitem simular estados por até cinco minutos.

Para usar um PostgreSQL já instalado, configure `DATABASE_URL` antes de executar `npm run dev`. O modo local padrão usa PGlite e não requer um servidor PostgreSQL separado.

## APIs personalizadas

No dashboard, abra **Adicionar API** para cadastrar um endpoint real HTTP/HTTPS. **Testar API** executa uma chamada pelo backend. APIs ativas são verificadas no intervalo definido (15 segundos a 1 hora); histórico e falhas ficam no PostgreSQL/PGlite por 90 dias. Redirecionamentos são tratados como a resposta do endpoint, para impedir que um destino confiável redirecione a chamada à rede privada.

No modo local, a aba **Adicionar API** abre sem token administrativo. O bypass só é habilitado pelo script de desenvolvimento e a API fica vinculada a `127.0.0.1`. Em produção, o backend continua exigindo `ZEUS_ADMIN_TOKEN`; configure também `API_CREDENTIALS_KEY` para cifrar credenciais. Mantenha a chave estável e faça backup seguro: perdê-la torna as credenciais cifradas irrecuperáveis.

Headers, Bearer, Basic, API keys e corpos de requisição são cifrados com AES-256-GCM no banco e não são devolvidos ao navegador. O token administrativo é validado no backend e fica apenas no `sessionStorage` da sessão autenticada. Use HTTPS para endpoints que recebem credenciais. Endereços locais/privados e domínios que resolvem para redes privadas são recusados. O intervalo mínimo é 15 segundos; testes manuais são limitados por cliente. Restrinja o acesso ao `.env` e mantenha backup seguro da chave.
