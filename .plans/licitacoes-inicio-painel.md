# Plano de Implementação: Início de Licitações como painel de gestão

## Origem

- Arquivo de especificação: nenhum. A origem é a análise feita na conversa de 26/10/2026 ("o que dá para mostrar no Início").
- Data do planejamento: `2026-10-26`
- Classificação: `frontend + backend` (sem banco de dados e sem infra/deploy)

## Resumo

Hoje o Início tem 4 cards, uma lista de 10 prazos, um gráfico por UF e as buscas salvas. Tudo depende de acompanhamentos e buscas já existirem, então numa conta nova a tela fica vazia.

O plano transforma o Início num painel de gestão. A fase 1 usa só o Postgres, dentro do `/dashboard` atual: agenda de prazos, valor estimado em disputa, funil, alterações e notificações, buscas salvas com novos hoje e em 7 dias, buscas de contratos salvas, favoritos recentes e guia da conta vazia. A fase 2 acrescenta "contratos vencendo em 30, 60 e 90 dias", lido sob demanda do armazém do R2 por um endpoint separado.

## Decisões aplicadas

- Decisão 1: fases 1 e 2. A visão de mercado (fase 3) fica fora.
- Decisão 2: sem feed de atividade da equipe.
- Decisão 3: nada novo persistido. Sem tabela, migration ou mudança no Cron Job. Contratos vencendo lidos sob demanda do armazém existente, em endpoint separado, com cache no navegador. (Interpretação de "não criar nada para isso", confirmada ao aprovar o plano.)

## Escopo

### Dentro do escopo

Fase 1 (Postgres, no `GET /api/tenders/dashboard`):

- Agenda de prazos agrupada por dia (hoje, amanhã, esta semana, depois), com destaque para o que vence em até 24 h e com a data de abertura das propostas.
- Valor estimado em disputa: soma do valor estimado dos editais abertos em Analisar e em Vou participar, mais a quantidade de editais sem valor estimado.
- Funil de acompanhamento: quantos em Analisar, Vou participar e Descartado, e quantos entraram nos últimos 7 e 30 dias.
- Editais acompanhados alterados (aviso `EDITAL_ALTERADO` ainda não lido) e as 5 notificações não lidas mais recentes, com o total.
- Buscas salvas de editais com novos hoje e novos em 7 dias por busca, e marca para busca pausada ou sem novos há 30 dias.
- Buscas salvas de contratos ativas, com o total de vigentes que já fica gravado (`total_vigentes`), sem ler o armazém.
- Favoritos recentes com prazo aberto.
- Guia da conta vazia: criar a primeira busca, favoritar um edital, ligar notificações e ver contratos a vencer.

Fase 2 (armazém do R2, endpoint `GET /api/tenders/dashboard/contracts`):

- Contratos vencendo em 30, 60 e 90 dias, com a contagem por janela e os mais próximos, das buscas de contratos ativas da pessoa e dos contratos favoritos dela.

### Fora do escopo

- Visão de mercado (editais por modalidade, publicações por semana, faixas de valor, cobertura dos dados).
- Feed de atividade da equipe.
- Taxa de vitória, ganhou/perdeu, ranking de concorrentes, desconto médio e preço de referência (sem dado para sustentar).
- Bloco "Minha empresa" (CNPJ da conta).
- Qualquer tabela, migration, variável de ambiente ou mudança no Cron Job.

## Cards, blocos e gráficos do Início

### Cards de indicador (linha do topo)

Cada card leva à lista correspondente, como o `DashboardCards` já faz hoje.

| Card | Valor | Situação |
|---|---|---|
| Novos hoje | editais novos das buscas salvas ativas | existe |
| Encerrando em 7 dias | acompanhados com prazo próximo | existe |
| Em análise | acompanhados como Analisar | existe |
| Vou participar | acompanhados como Vou participar | existe |
| Valor estimado em disputa | soma do valor estimado dos acompanhados abertos, com "N sem valor estimado" no subtexto | novo (fase 1) |
| Alterações não lidas | editais acompanhados com `EDITAL_ALTERADO` não lido | novo (fase 1) |
| Contratos vencendo em 30 dias | contagem, com 60 e 90 dias no subtexto | novo (fase 2) |

### Blocos de conteúdo

- **Agenda de prazos:** substitui o "Encerrando em breve". Lista agrupada em Hoje, Amanhã, Esta semana e Depois; o que vence em até 24 h fica destacado; cada edital mostra também a abertura das propostas.
- **Notificações não lidas:** as 5 mais recentes, com o total e o link para a tela de notificações.
- **Buscas salvas de editais (reformulado):** por busca, abertos, novos hoje e novos em 7 dias; marca para busca pausada ou sem novos há 30 dias.
- **Buscas salvas de contratos:** nome e total de vigentes (valor já gravado, sem ler o armazém).
- **Favoritos recentes:** os últimos favoritados que ainda têm prazo aberto.
- **Contratos vencendo (fase 2):** os mais próximos, com a contagem por janela de 30, 60 e 90 dias.
- **Guia da conta vazia:** checklist de 4 passos (criar a primeira busca, favoritar um edital, ligar notificações, ver contratos a vencer), exibido só quando a conta ainda não usou o módulo.

### Gráficos

1. **Funil de acompanhamento (novo):** barras com Analisar, Vou participar e Descartado, mais os que entraram em 7 e 30 dias.
2. **Editais abertos por UF (existe):** `CountBars`, sem mudança.

Os contratos vencendo em 30, 60 e 90 dias aparecem como 3 barras simples, sem componente de gráfico novo, para o Início não pesar no celular. Não há gráfico de linha, rosca nem mapa nesta entrega.

## Leitura de contexto

- `/AGENT.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem neste projeto; o `AGENT.md` da raiz cobre o repositório inteiro.
- Arquivo `.md` da feature: não há; a origem é a análise da conversa.
- Arquivos do projeto lidos:
  - `src/tenders/screens/HomeScreen.tsx`, `src/tenders/components/DashboardCards.tsx`
  - `src/tenders/services/overviewService.ts`, `src/tenders/services/queryKeys.ts`, `src/tenders/types.ts`
  - `backend/src/modules/tenders/services/dashboard.ts`, `savedSearchMatches.ts`, `notificationInbox.ts`, `contractSavedSearches.ts`
  - `backend/src/modules/tenders/routes/overview.ts`
  - `backend/src/modules/tenders/db/schema.ts`
  - `backend/src/modules/tenders/contractStore/queries.ts`, `layout.ts`
  - `backend/src/modules/tenders/domains.ts`

## Impacto por área

### Frontend

- `HomeScreen.tsx`: reorganizar em blocos. Agenda e valor em disputa no topo, funil e alertas ao lado, buscas salvas abaixo, contratos vencendo por último.
- Componentes novos em `src/tenders/components/`, cada um com estado de carregamento, erro e vazio, em português, com ação (por exemplo "Buscar editais", "Criar busca").
- `DashboardCards.tsx`: ajustar aos indicadores novos, mantendo o link de cada indicador para a lista correspondente.
- Bloco de contratos: segundo `useQuery` próprio, com `staleTime` de alguns minutos e query key nova em `queryKeys.ts`. Falha ou demora ali não afeta o resto do Início.
- `types.ts`: `DashboardView` estendido e tipo novo para a resposta dos contratos vencendo.
- Funções puras em `src/tenders/utils/`: agrupar prazos por dia e decidir o guia da conta vazia, para serem testáveis.
- Tema claro e escuro e celular: blocos enxutos, sem rolagem horizontal.

### Backend

- `services/dashboard.ts`: estender `DashboardView`.
  - Valor em disputa e funil por status: estender `countAccountTrackings` (mesmo join com o edital, com `FILTER`).
  - Entradas em 7 e 30 dias: `acompanhamento_historico`, filtrado por `accountId` e por novo status.
  - Agenda: manter a consulta de prazos; conferir se `NoticeListItem` já traz `proposalOpensAt` e estender se faltar.
  - Alterações e notificações: reaproveitar `listNotifications` com `unreadOnly` e a contagem existente.
  - Buscas de contratos: listar as ativas com `activeCount` e `countedAt` já gravados (`contractSavedSearches.ts`), sem consultar o armazém.
  - Favoritos recentes com prazo aberto: `favorito` com join no edital, filtrado por conta e pessoa.
- `services/savedSearchMatches.ts`: acrescentar por busca os novos hoje e os novos em 7 dias (sobre `primeira_coleta_em`). Medir o tempo antes e depois.
- `contractStore/queries.ts`: `readExpiringByCriteria` e `readExpiringByKeys` devolvem todas as linhas da janela, sem limite. Criar uma variante com a contagem por janela e só os N mais próximos, com limite fixo.
- Serviço novo para os contratos vencendo: junta as buscas de contratos ativas da pessoa e os favoritos, sem duplicar o mesmo contrato.
- `routes/overview.ts`: rota nova `GET /dashboard/contracts`, atrás da trava de acesso do módulo, com conta e usuário vindos de `tenderAccessOf(req)`. Se o armazém estiver indisponível, responder 503 com a mensagem existente de `ContractStoreUnavailableError`.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

Observação: `acompanhamento_historico` só tem índice por (conta, edital). A consulta de entradas por período deve ser barata no volume atual; conferir o plano de execução. Não criar índice nem migration sem confirmação explícita.

### Infra/Deploy

Sem impacto esperado. Nenhuma variável de ambiente, job, worker ou storage novo.

## Arquivos provavelmente afetados

- `backend/src/modules/tenders/services/dashboard.ts` (+ `dashboard.db.test.ts`)
- `backend/src/modules/tenders/services/savedSearchMatches.ts`
- `backend/src/modules/tenders/contractStore/queries.ts` (+ teste)
- `backend/src/modules/tenders/services/` (serviço novo dos contratos vencendo)
- `backend/src/modules/tenders/routes/overview.ts` (+ `routes.db.test.ts`)
- `src/tenders/screens/HomeScreen.tsx`
- `src/tenders/components/` (blocos novos; `DashboardCards.tsx` ajustado)
- `src/tenders/services/overviewService.ts` e `src/tenders/services/queryKeys.ts`
- `src/tenders/types.ts`
- `src/tenders/utils/` (agenda e guia, com testes)

## Estratégia de implementação

1. Backend, fase 1: estender `dashboard.ts` e o tipo da resposta. Primeiro os blocos simples (valor em disputa, funil, notificações, buscas de contratos, favoritos), depois os novos por busca em `savedSearchMatches.ts`, medindo o tempo antes e depois.
2. Frontend, fase 1: atualizar `types.ts`, criar as funções puras com testes, e depois os componentes e o `HomeScreen.tsx`.
3. Backend, fase 2: consulta com contagem e limite no armazém, serviço, rota e tratamento do 503.
4. Frontend, fase 2: serviço, query key e bloco de contratos com carregamento próprio.
5. Validação: build e testes, um de cada vez (memória do computador). Conferir no navegador em tema claro e escuro e no celular.

## Regras de negócio identificadas

- Acompanhamento é da conta (compartilhado). Favoritos e buscas salvas são da pessoa dentro da conta.
- "Valor em disputa" é valor estimado, não receita: a tela deve dizer isso e mostrar quantos editais estão sem valor estimado.
- Contratos vencendo: só os vigentes; janelas de 30, 60 e 90 dias contadas a partir de hoje em Brasília; buscas de contratos inativas ficam de fora; o mesmo contrato vindo de busca e de favorito conta uma vez.
- Não existe status de resultado (ganhou/perdeu) nem coleta de vencedores ligada: nenhum indicador depende disso.

## Regras multi-tenant e segurança

- Toda consulta de acompanhamento e histórico filtra por `accountId`. Favoritos, buscas e notificações filtram também por `userId`.
- Conta e usuário vêm sempre de `tenderAccessOf(req)`, nunca do client.
- O armazém de contratos é dado público e igual para todos, mas as buscas e os favoritos que definem o que consultar são da pessoa.
- A rota nova fica atrás da trava de acesso do módulo, como as demais.
- Mensagens de erro ao usuário seguem o padrão `tenderRoute`, sem vazar detalhe interno.

## Validações necessárias

- A rota nova não recebe parâmetros. Se passar a aceitar `limit`, validar com `express-validator` no padrão de `validators.ts`.
- Limite fixo de linhas por janela na consulta do armazém.

## Testes necessários

### Frontend

- Agrupamento da agenda por dia, incluindo prazo hoje, amanhã e já vencido.
- Regra do guia da conta vazia.

### Backend

- `dashboard.db.test.ts`: valor em disputa e quantidade sem valor, funil, isolamento entre contas, notificações e buscas de contratos.
- `routes.db.test.ts`: resposta do `/dashboard` e da rota nova, incluindo o 503.
- Consulta com contagem e limite no armazém, nos moldes de `queries.test.ts`.

### E2E

- Conferência manual no navegador: conta vazia, conta com acompanhamentos, armazém indisponível, tema escuro e celular.

## Comandos de validação sugeridos

```bash
# frontend (raiz)
npx tsc --noEmit
npm test
npm run build

# backend
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
```

Os testes de banco usam o `.env.dev` pelo próprio script. Nunca rodar `.db.test.ts` com o `.env` da raiz (produção). Rodar build e testes um de cada vez.

## Riscos e pontos de atenção

- Desempenho da consulta de buscas salvas: é a parte mais cara do painel e hoje já roda a regra de busca duas vezes. Medir antes e depois; se piorar, calcular os novos por busca em separado ou em cache.
- Armazém no R2: latência, custo por leitura e indisponibilidade. Mitigado pelo endpoint separado, pelo cache no navegador e pelo limite de linhas.
- Cache do navegador após o deploy: conferir que uma aba aberta com o formato antigo do `/dashboard` não quebre.
- Índice do histórico de acompanhamento: ver a observação em "Banco de dados".
- Início mais longo: manter os blocos enxutos para não pesar no celular.
- Testes de banco apontando para o ambiente errado: usar só o script `test:tenders-db`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Premissa: "não criar nada" significa sem tabela, migration ou mudança no Cron Job para o bloco de contratos (confirmada ao aprovar).

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Uma conta sem acompanhamentos ou buscas vê o guia e nenhum bloco quebrado ou "0" sem explicação.
- Os indicadores da fase 1 batem com as telas para onde levam.
- O bloco de contratos aparece sem atrasar o resto do Início e mostra mensagem própria quando o armazém está fora.
- Nenhuma tabela, migration, variável de ambiente ou mudança no Cron Job foi criada.
- O tempo do `/dashboard` foi medido e não piorou de forma relevante.
- Funciona em tema claro e escuro e no celular.
- Build e testes passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto e seguir o `/AGENT.md`.
- Identificadores de código em inglês; textos exibidos na tela em português.
- Não executar migrations nem alterar `.env`.
- Manter alterações pequenas e focadas; entregar a fase 1 antes da fase 2.
- Atualizar os testes conforme descrito.
