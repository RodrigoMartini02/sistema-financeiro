# Plano de Implementação: Licitações — Fase 2 (API)

> **Status:** aprovado em 05/10/2026. A implementação só começa com `/implementar`.

## Origem

- Arquivo de especificação: `.plans/licitacoes-escopo.md` (escopo v1.2), seções 7.3, 8, 9.4, 11, 12 e 14
- Plano geral: `.plans/licitacoes-plano.md` (tarefas da Fase 2 e registro da Fase 1)
- Data do planejamento: `2026-10-05`
- Classificação: `backend + database`
- Execução: worktree `C:\Users\rodri\Music\fingerence-licitacoes`, branch `feat/R/licitacoes`

Este plano segue o escopo nos detalhes. Ele registra só o que muda ou completa o escopo, mais os ajustes que a Fase 1 mostrou serem necessários.

## Resumo

A Fase 2 entrega a API do módulo de Licitações (`/api/tenders`), com as travas de acesso por conta e por pessoa.

Antes da API, entram três ajustes da Fase 1: o ritmo das consultas ao PNCP, o singular e plural na busca e os editais sem prazo de proposta.

A exportação (CSV e XLSX) sai do módulo, por decisão do usuário. Nada vai para produção nesta fase.

## Escopo

### Dentro do escopo

- **Ajustes da Fase 1:** ritmo do PNCP; singular e plural na busca (migration 0075); editais sem prazo de proposta fora da coleta e da base.
- **Regra única de busca (migration 0076):** dividida em critérios e "edital aberto", com "incluir sem valor" também na busca salva.
- **API:** seções 8.1 a 8.4 do escopo, menos a exportação.
- **Fechamento:** testes, coleção `tenders.http`, medição de desempenho e atualização do README, do escopo (v1.3) e do plano geral.

### Fora do escopo

- **Exportação CSV/XLSX:** a rota `GET /notices/export`, o limite de taxa dela e o botão Exportar da Fase 4.
- **Busca de órgão por nome:** o filtro de órgão é por CNPJ, como na API do escopo.
- **Filtro de SRP na URL da busca:** o SRP vale pela busca salva.
- **Telas:** ficam para as Fases 3 e 4.
- **Produção:** nenhuma migration, usuário restrito ou Cron Job em produção, e nenhum merge em `main`.
- **Buscas iniciais da seção 13 do escopo:** dependem da pergunta 3.
- **Proxy de arquivos do PNCP:** o front abre o link original.

## Leitura de contexto

- `/AGENT.md` e `/CLAUDE.md`. Não há `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto.
- `.plans/licitacoes-escopo.md` e `.plans/licitacoes-plano.md`.
- **Backend:**
  - `src/server.ts` e `src/db/client.ts`;
  - `src/middleware/{auth,validation,permissions}.ts`;
  - `src/utils/{accountAccess,requestInput}.ts`;
  - `src/db/schema/{accounts,accountMembers}.ts`;
  - `src/modules/contracts/routes/{index,clients}.ts`;
  - `src/modules/tenders/{db/schema.ts,domains.ts,README.md}`;
  - `src/modules/tenders/collector/{config,pncpClient,runs,repository,dbTestSupport,mapping.test}.ts`;
  - `drizzle/0073` e `0074`;
  - `package.json`.
- **Medições só de leitura no banco local (05/10/2026):**
  - **Radicais:** os de singular e plural na configuração `licitacoes.pt_unaccent`.
    - Não batem: licitação/licitações, gestão/gestões, pão/pães, material/materiais, papel/papéis, farol/faróis, barril/barris, item/itens, bem/bens e software/softwares.
    - Batem: computador/computadores, luz/luzes, veículo/veículos e serviço/serviços.
  - **Editais abertos sem valor estimado:** 3.374 de 24.374 (14%); no pregão eletrônico, 18%.

## Impacto por área

### Frontend

Sem impacto esperado. As Fases 3 e 4 vão consumir esta API. A Fase 4 perde o botão Exportar e o filtro de órgão por nome.

### Backend

- **Coletor (`modules/tenders/collector`):** ritmo do PNCP e editais sem prazo.
- **API nova em `modules/tenders/{routes,services,middleware}`:**
  - o roteador é criado por função, recebendo o banco, e tem o `requireTenderAccess` dentro dele;
  - os serviços recebem o banco por parâmetro, como o coletor, para os testes rodarem em transação desfeita.
- **`server.ts`:** `/api/tenders/admin` (`authenticate` + `requireAdmin`) é montado antes de `/api/tenders` (`authenticate` + roteador do módulo). Nenhum dos dois usa `requireActivePlan`.
- **Validação e respostas:** `express-validator` + `validate`; envelope e erros como na seção 8 do escopo; mensagens em português.

### Banco de dados

- **0075 — `licitacoes_busca_variantes`:**
  - reescreve `licitacoes.fn_tsquery_termos`, com a mesma assinatura;
  - cada palavra de termo ou de exclusão ganha a forma singular ou plural como alternativa dentro da mesma frase, cobrindo -ção/-ções, -ão/-ões/-ães, -al/-ais, -el/-éis, -ol/-óis, -il/-is, -m/-ns e palavra estrangeira com -s;
  - o índice `busca_tsv` não muda.
- **0076 — `licitacoes_regra_unica_sem_valor`:**
  - `ALTER TABLE licitacoes.busca_salva ADD COLUMN incluir_sem_valor BOOLEAN NOT NULL DEFAULT false`;
  - novas funções `licitacoes.fn_edital_atende_criterios(e, …critérios como parâmetros)` e `licitacoes.fn_edital_aberto(e)`, esta com prazo não vencido e situação 1;
  - `licitacoes.fn_edital_bate(e, b)` é recriada como a junção das duas, com a mesma assinatura. O coletor e as notificações não mudam.
- **0077 — `licitacoes_variantes_plural_s` (acrescentada na implementação):** ajuste de `fn_variantes_palavra`, para palavra estrangeira com plural em -s (softwares → software). A 0075 já estava aplicada no banco local e não é editada.
- **Cabeçalho:** cada migration traz a ordem de aplicação, o aviso de confirmação e a reversão.
- **Numeração:** reconferida no `origin/main` antes de criar os arquivos.

> **Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Nesta fase, só no banco local.

### Infra/Deploy

- **Variáveis:** nenhuma nova. A URL da API principal do PNCP (`https://pncp.gov.br/api/pncp`) fica como constante no código.
- **Coletor:** o padrão de `PNCP_REQUEST_INTERVAL_MS` passa a 4000; o README é atualizado.
- **Sem mudança em:** `.env`, `.env.dev`, Render e Cron Jobs.

## Arquivos provavelmente afetados

- **Migrations novas:**
  - `backend/drizzle/0075_licitacoes_busca_variantes.sql`;
  - `backend/drizzle/0076_licitacoes_regra_unica_sem_valor.sql`.
- **Coletor:**
  - `backend/src/modules/tenders/collector/{config,pncpClient,runs,repository}.ts` e testes;
  - `backend/src/modules/tenders/collector/docs/`, com o OpenAPI da API principal do PNCP;
  - `backend/src/modules/tenders/collector/fixtures/`, com itens e arquivos reais.
- **Schema e regra de busca:** `backend/src/modules/tenders/db/schema.ts`, `domains.ts` e `db/matcher.db.test.ts`.
- **API nova:** `backend/src/modules/tenders/{routes,services,middleware}/**`, com testes.
- **Documentação do módulo:** `backend/src/modules/tenders/tenders.http` (novo) e `README.md`.
- **Fora do módulo:**
  - `backend/src/server.ts`, só a montagem;
  - `backend/package.json`, só se o padrão atual dos scripts de teste não cobrir as pastas novas.
- **Planos:** `.plans/licitacoes-escopo.md` (v1.3) e `.plans/licitacoes-plano.md`.

## Estratégia de implementação

1. **Preparação:**
   - reconferir a numeração das migrations no `origin/main`;
   - baixar o OpenAPI da API principal do PNCP e salvar respostas reais de itens e arquivos como fixtures.
2. **Ritmo do PNCP:**
   - padrão de 4000 ms entre consultas;
   - em 429 sem `Retry-After`, esperas de 30, 60 e 120 s;
   - 5xx e tempo esgotado mantêm 1, 2, 4 e 8 s;
   - testes do cliente.
3. **Editais sem prazo:**
   - varredura e incremental ignoram registro sem `dataEncerramentoProposta` e contam os ignorados em `detalhes` (`skippedWithoutDeadline`);
   - a limpeza apaga edital sem prazo de qualquer idade, menos os acompanhados ou com notificação não lida;
   - testes;
   - rodar `tenders:dev -- cleanup` no banco local e registrar quantos saíram.
4. **0075 (variantes):**
   - escrever a migration, pedir confirmação e aplicar no banco local;
   - testes: todos os pares medidos, o plural regular, frase com palavra de ligação ("material de limpeza") e exclusão;
   - trocar a seção de limitação do README.
5. **0076 (regra única):**
   - escrever a migration e atualizar o schema Drizzle;
   - pedir confirmação e aplicar no banco local;
   - testes de `fn_edital_bate` com "incluir sem valor" e das notificações.
6. **Base da API:** resolução da conta, `requireTenderAccess`, roteador, montagem no `server.ts`, limitador por usuário, formatação de datas e validações comuns.
7. **Editais:** conversão de `q`, busca, detalhe, acompanhamento (PUT e DELETE) e histórico.
8. **Itens e arquivos:** cliente da API principal do PNCP, reaproveitando o tempo máximo e a repetição do cliente da Fase 1; mapeamento validado com zod; cache de 24 h; cópia vencida quando o PNCP falhar.
9. **Buscas salvas:** com prévia e limite de taxa.
10. **Notificações.**
11. **Painel, domínios e coleta.**
12. **Acesso, equipe e admin.**
13. **Testes HTTP, desempenho e coleção:**
    - medir com `EXPLAIN ANALYZE` e ajustar se passar das metas;
    - rodar a `tenders.http` contra o backend local, com uma conta de teste habilitada pela rota do admin.
14. **Documentação e parada:**
    - README, escopo v1.3 e, no plano geral, as tarefas da Fase 2 (sem a exportação) e o registro de andamento;
    - parar para o aceite.

## Regras de negócio identificadas

Só o que muda ou completa o escopo.

- **Conta da requisição (decisão 2):**
  - `accountId` vai na query string de qualquer pedido;
  - titular sem `accountId`: usa a conta habilitada marcada como padrão (`eh_padrao`); se nenhuma for padrão, a de menor id;
  - colaborador: usa sempre a conta do vínculo; outro `accountId` dá 404;
  - quem é membro ativo de uma conta é tratado como colaborador, com a mesma precedência do app de finanças;
  - conta inativa (`contas.ativo = false`) dá 404.
- **Edital sem prazo de proposta (decisão 1):**
  - não entra na base; se já estiver, sai na limpeza, salvo se estiver acompanhado ou com notificação não lida;
  - modalidades sem prazo, como credenciamento, ficam fora da coleta. Registrar no README.
- **Incluir sem valor (decisão 4):**
  - com faixa de valor, o edital sem valor só entra com a opção ligada;
  - sem faixa de valor, ele entra sempre, como hoje;
  - vale para a busca da tela e para a salva, no campo `includeWithoutValue`.
- **Busca da tela:**
  - os critérios em comum com a busca salva passam por `fn_edital_atende_criterios`; `openOnly` usa `fn_edital_aberto`;
  - `q` tem até 500 caracteres: aspas = frase; `-palavra` ou `-"frase"` = exclusão; modo E por padrão;
  - termos com menos de 2 caracteres são ignorados; mais de 30 termos, ou um termo com mais de 80 caracteres, dá 400;
  - a resposta traz os termos como foram entendidos (`parsedQuery`), para "Salvar esta busca";
  - `savedSearchId` precisa ser uma busca salva do próprio usuário na conta, senão dá 404. Os critérios vêm dela, e os filtros só da tela continuam valendo;
  - `hideDiscarded` é ignorado quando `trackingStatus` pede `DESCARTADO`;
  - nas ordenações, os nulos vão para o fim e o desempate é pelo id; `relevance` sem termos dá 400;
  - `highlightedExcerpt` vem nulo quando não há `q`.
- **Itens e arquivos:**
  - quando a tela pede, cada tentativa dura até 10 s, com uma repetição curta e sem espera longa;
  - se o PNCP falhar, volta a cópia guardada com `stale: true`; sem cópia, 503 com mensagem clara;
  - itens com muitas páginas: limite de páginas por pedido, definido depois de ler o OpenAPI, com `hasMore` e o link do PNCP.
- **Acompanhamento:**
  - observação de até 2.000 caracteres;
  - o histórico é gravado na mesma transação, e só quando o status ou a observação mudam;
  - a remoção fica registrada no histórico como `REMOVIDO`;
  - DELETE sem acompanhamento dá 404.
- **Buscas salvas:**
  - duplicar gera "Cópia de {nome}", cortado em 120 caracteres, e conta no limite de 50;
  - a prévia não grava nada e devolve a contagem e os 5 primeiros por prazo.
- **Painel (decisão 5):**
  - "Novos hoje": editais com primeira coleta hoje (Brasília) que batem com ao menos uma busca salva ativa do usuário na conta;
  - "Encerrando em 7 dias": acompanhados da conta como ANALISAR ou PARTICIPAR, com prazo nos próximos 7 dias;
  - "Em análise" e "Vou participar": acompanhamentos da conta com edital ainda aberto;
  - "Encerrando em breve": até 10 editais;
  - abertos por UF: as 10 maiores, pelas buscas salvas ativas do usuário.
- **Coleta:** a próxima execução prevista vem da agenda do README, calculada no horário de Brasília.
- **Datas na resposta:** ISO 8601 com o fuso de Brasília (ex.: `2026-10-20T09:30:00-03:00`).

## Regras multi-tenant e segurança

- **Origem da conta:** sempre resolvida no servidor, pelas regras acima. O `accountId` enviado pelo app é só uma escolha, validada antes de valer.
- **Travas:**
  - conta não habilitada, inativa ou de outro titular dá 404, com o mesmo corpo da rota inexistente do `server.ts`;
  - colaborador sem linha em `acesso_membro` dá 403.
- **Filtros por conta e por usuário:**
  - buscas salvas, acompanhamento, histórico e notificações são sempre filtrados por `conta_id`;
  - buscas salvas e notificações também por `usuario_id`;
  - os joins também filtram pela conta.
- **Tabelas globais:** `edital`, `cache_detalhe` e `coleta_execucao` guardam dado público ou técnico.
- **Recurso alheio:** recurso de outra conta ou de outro usuário dá 404 genérico.
- **SQL:** sempre parametrizado, em Drizzle, com fragmentos `sql` para as funções do banco.
- **Conteúdo do PNCP:** tratado como texto puro; os arquivos abrem no link original do PNCP.
- **Limite de taxa na prévia:**
  - 60 pedidos por minuto, por usuário, em memória, no padrão do `ipRateLimiter`;
  - é por usuário, não por IP, porque o servidor não configura `trust proxy`. Atrás do proxy do Render, o IP tende a ser o mesmo para todos.
- **Quem perdeu o acesso:** o coletor continua gerando notificações para essa pessoa, mas a API não as mostra (escopo 7.4).

## Validações necessárias

Valem as da seção 8 do escopo, mais estas:

- **Identificadores:** `accountId`, `:id` e `:userId` são inteiros positivos.
- **Listas:**
  - UF entre as 27, IBGE com 7 dígitos, CNPJ com 14 dígitos e modalidade de 1 a 13;
  - no máximo 27 UFs, 100 municípios, 50 órgãos e 13 modalidades.
- **Valores:** ≥ 0, até o limite de `numeric(18,2)`, com mínimo ≤ máximo.
- **Datas:** formato `AAAA-MM-DD`, com início ≤ fim.
- **Enums:** `termsMode`, `sort`, `trackingStatus` (com `SEM`) e `type`.
- **Paginação:** `page` ≥ 1; `perPage` de 1 a 100, padrão 20.
- **Acompanhamento:** `status` é ANALISAR, PARTICIPAR ou DESCARTADO; `note` tem até 2.000 caracteres.
- **Busca salva:**
  - regras da seção 8.2, mais `includeWithoutValue` (booleano) e `priceRegistration` (nulo = indiferente);
  - o PATCH exige `active` ou `notify`.
- **Equipe e admin:** `hasAccess` booleano na equipe; `active` booleano no admin.

## Testes necessários

### Frontend

Sem testes nesta fase.

### Backend

- **Sem banco** (`npm test`):
  - conversão de `q` e validações;
  - esperas de 429;
  - regra de ignorar edital sem prazo;
  - próxima coleta prevista e formatação de datas;
  - mapeamento de itens e arquivos com fixtures reais;
  - limitador por usuário.
- **Banco local** (`test:tenders-db`, cada teste numa transação desfeita):
  - **Resolução da conta e travas:** titular com uma e com duas contas; `accountId` alheio; colaborador com e sem acesso; conta desabilitada e conta inativa.
  - **Isolamento:** entre contas e entre usuários da mesma conta.
  - **Busca:** filtros, ordenações e paginação.
  - **Paridade:** busca da tela × busca salva, com vários conjuntos de critérios, inclusive "incluir sem valor".
  - **Buscas salvas:** validações, limite de 50, `openCount`, prévia e duplicar.
  - **Acompanhamento e histórico:** inclusive `REMOVIDO` e atomicidade.
  - **Demais rotas:** notificações, cards do painel, equipe e admin.
  - **Coletor:** variantes de plural e limpeza dos editais sem prazo.
- **HTTP:**
  - o roteador é montado num app de teste, com usuário simulado e banco de teste;
  - o teste confere 404, 403, 400 e 200, o envelope e o formato do erro de validação.

### E2E

Sem E2E nesta fase. O smoke no navegador fica para a Fase 4.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test                 # no worktree, com DOTENV_CONFIG_PATH=../.env.dev (4 testes antigos precisam de DATABASE_URL)
npm --prefix backend run test:tenders-db
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run tenders:dev -- cleanup
npx vite build
```

## Riscos e pontos de atenção

- **Desempenho:** busca, `openCount` e painel sobre 24 mil editais abertos.
  - Metas: busca abaixo de 500 ms e lista de 50 buscas salvas abaixo de 1 s.
  - A busca passa os critérios como parâmetros, para o banco usar o índice GIN.
  - Se passar das metas, ajustar antes de seguir.
- **Variantes:** uma forma gerada pode coincidir com outra palavra. É um falso positivo raro.
- **0076 muda o tipo `busca_salva`:** a coluna nova muda o tipo da linha. `fn_edital_bate` é recriada na mesma migration, e o coletor continua chamando a mesma função.
- **PNCP:**
  - na hora do pedido da tela, ele pode estar lento ou limitar a taxa; o cache reduz o impacto;
  - se os caminhos da API principal divergirem do escopo, vale o OpenAPI.
- **Limpeza:** apaga cerca de 2.300 editais sem prazo do banco local. A produção não tem o módulo.
- **Pasta principal:** o status das migrations mostra 0072 a 0076 como "registro sem arquivo" até o merge.
- **Numeração em paralelo:** reconferir antes de criar as migrations.

## Perguntas em aberto

Continuam abertas e não bloqueiam a Fase 2:

- **Pergunta 3:** conta da empresa.
- **Pergunta 4:** Cron Jobs pagos no Render.
- **Pergunta 6:** espaço do Postgres no Render.

## Critérios de aceite do plano

- **Migrations:** 0075 e 0076 aplicadas só no banco local, com confirmação; `migrations:status` local sem pendências.
- **Coletor:**
  - padrão de 4000 ms e esperas de 429 testados;
  - editais sem prazo ignorados e limpos, com testes e `cleanup` local rodado, informando o total.
- **Plural:** todos os pares medidos batem, e o plural regular continua batendo.
- **Rotas:** as das seções 8.1 a 8.4, menos a exportação, respondem conforme o escopo e este plano.
- **Travas e isolamento:** 404 e 403 testados; isolamento entre contas e entre usuários testado.
- **Paridade:** busca da tela × busca salva testada.
- **Coleção:** `tenders.http` com todas as rotas, rodada contra o banco local.
- **Desempenho:** medido e registrado no plano geral.
- **Checks:** `build`, testes do backend, `test:tenders-db` e `npx vite build` passando.
- **Limites da mudança:** fora do módulo, só mudam `server.ts` e, se necessário, `package.json`. Nada em produção e sem merge.
- **Documentação:** README, escopo v1.3 e plano geral atualizados.

## Observações para a skill implementar

- Trabalhar no worktree `C:\Users\rodri\Music\fingerence-licitacoes`, no branch `feat/R/licitacoes`, sem criar branch novo.
- Seguir o `CLAUDE.md` e o `AGENT.md`:
  - Drizzle primeiro;
  - código em inglês, tabelas e colunas em português;
  - compatível com Node 22.17.
- Não executar migrations sem confirmação explícita, nem no banco local.
- Nunca usar `--banco producao`, `dev:prod-db` ou o `.env` de produção.
- Não alterar `.env` nem `.env.dev`.
- Commits pequenos, em Conventional Commits e em português (ex.: `feat(licitacoes): ...`).
- Não reintroduzir a exportação nem os complementos retirados: o filtro de SRP na URL e a busca de órgão por nome.
- O escopo v1.3 deve refletir:
  - as decisões 1 a 5;
  - a retirada da exportação nas seções 2, 8.1, 9.4, 11, 12 e 14;
  - o filtro de órgão só por CNPJ (9.4);
  - "incluir sem valor" na busca salva (7.2, 7.3, 8.2 e 9.4).
- Ao terminar, parar para o aceite da Fase 2. O `/finalizar` envia o branch sem merge; o merge espera o módulo ir para produção.

## Decisões aplicadas

- **Decisão 1 → 1:** edital sem prazo de proposta fica fora da coleta, e a limpeza apaga os já gravados.
- **Decisão 2 → 1:** `accountId` na URL. Sem ele, vale a conta padrão do titular; o colaborador fica na conta do vínculo.
- **Decisão 3:** exportação retirada do módulo, então não há biblioteca de XLSX.
- **Decisão 4 → 1:** a busca salva ganha "incluir editais sem valor informado".
- **Decisão 5 → 1:** "Novos hoje" conta pelas buscas salvas; "Encerrando em 7 dias", pelos editais acompanhados da conta.
