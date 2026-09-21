# Plano de Implementação: Reestruturar gráficos e filtros do Painel

## Origem

- Arquivo de especificação: pedido direto no chat (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-21
- Classificação: `frontend + backend` (sem banco de dados/migration)

## Resumo

O Painel (`FinanceDashboard.tsx`) tem hoje duas seções apresentadas como texto simples
(Juros × Descontos, Parcelas futuras) que devem virar gráficos de colunas; o card "Saldo
anterior" não tem cor condicional ao sinal como os cards vizinhos; o gráfico de categorias
(`MonthCategoriesOverview`) usa uma fonte de dado de orçamento/metas desalinhada do resto
do Painel, sem filtro real de membro nem hierarquia de subcategoria visualmente destacada;
e os controles de filtro do Painel (toggle Visão, toggle Membro, filtro de período) devem
ser consolidados, com Visão e Membro migrando para um único filtro "sanduíche"
(`MultiFilterPanel`, já usado em Movimentações) que afeta todos os gráficos igualmente.

## Escopo

### Dentro do escopo

**Backend:**
- `backend/src/routes/financial.ts`: ajustar a query `categoriaResult` (dentro de
  `GET /financial/panorama`) para agrupar por `categoria_id` em vez de `c.nome`, incluindo
  `c.parent_id` no `SELECT`/`GROUP BY`, preservando o filtro de membro/período/conta já
  existente (`escopo`, `contaFiltro`, `periodoFiltro`) — sem mudar o resto da rota.
- `backend/src/routes/expenses.ts` (`GET /despesas/parcelas-futuras`): a query hoje
  filtra `pago = false` explicitamente, então nunca existe parcela "futura já paga" com a
  semântica atual. Mudar a query para trazer, por mês, duas somas — `pagas` e `em_aberto`
  — cobrindo parcelas do intervalo de meses (removendo o filtro `pago = false` fixo e
  agregando por `pago` também). Adotar o MESMO contrato de `membro_id` de
  `/financial/panorama` (ausente / `familia` / um id / lista de ids), resolvido pelo
  mesmo `resolveDashboardScope` — sem limitação de combinações parciais.
- `backend/src/utils/dashboardScope.ts`: `resolveDashboardScope` passa a aceitar
  `memberId: number | number[] | null | undefined` — quando for array, retorna a
  interseção entre os ids pedidos e `visiveis` (ou `null` se algum id pedido não estiver
  em `visiveis`, mantendo a regra de segurança atual de nunca cair silenciosamente no
  próprio usuário). `null` continua significando "família inteira" (todos os visíveis).
- `backend/src/routes/financial.ts` (`GET /panorama`): parsing do parâmetro `membro_id`
  passa a aceitar uma lista (`membro_id=1,2,3` ou múltiplos `membro_id=1&membro_id=2`,
  decidir formato durante a implementação com base no que `req.query` já suporta
  facilmente) além de `'familia'` e um id único.

**Frontend:**
- `src/services/financeService.ts`: `fetchDashboardPanorama` e `DashboardPanoramaFiltro`
  passam a aceitar `membroId: number | number[] | null | undefined`; serialização da query
  string ajustada para o novo formato de lista.
- `src/services/financeService.ts`: `fetchParcelasFuturas` retorna `{ mes, ano, pagas,
  emAberto }` por item, e aceita parâmetro de escopo/membro.
- `src/screens/finance/FinanceDashboard.tsx`:
  - Estado de filtro consolidado: `visao: 'conta' | 'panorama'` e `membroIds: Set<string>`
    (substituindo `membroId: number | null | undefined` único) — a conversão para o
    formato que o backend espera (lista, `null`/família, `undefined`/só eu) fica isolada
    numa função auxiliar.
  - Novo `MultiFilterPanel` com dois grupos: "Visão" (seleção única: Esta conta /
    Panorama Geral) e "Membros" (multi-seleção real). NÃO existe opção "Eu" nem
    "Família": toda pessoa é uma opção nomeada identificada pelo `usuario_id`,
    incluindo o próprio usuário logado (que não vem em `conta_membros` e por isso é
    montado a partir de `fetchMe`, usando `nomeExibicao ?? nome`). Marcar todas as
    pessoas equivale a "família inteira" (`membroId === null`) sem precisar de uma opção
    dedicada. O painel abre com o próprio usuário marcado.
  - `DashboardPeriodFilter` permanece fora do sanduíche, ao lado do botão de filtro.
  - Card "Juros × Descontos" (linhas 687-727 hoje): substituir o conteúdo por um
    `BarChart` novo (recharts) com 2 colunas (Juros, Descontos), cores vermelho/verde já
    usadas hoje, mantendo o empty state quando ambos são zero.
  - Card "Parcelas futuras" (linhas 900-937 hoje): substituir por `BarChart` com uma
    coluna por mês, 2 séries empilhadas ou lado a lado (Pagas / Em aberto), cores em tom
    diferente (ex.: âmbar para em aberto, verde para pagas, mantendo a semântica de cor
    já usada no restante do Painel).
  - Card "Saldo anterior" (linhas 480-486): cor do número passa a ser condicional ao
    sinal (`text-[#067647]`/`text-emerald-300` se `>= 0`, `text-[#b42318]`/`text-rose-300`
    se negativo), replicando o padrão já usado no card "Saldo do período".
- `src/screens/finance/MonthCategoriesOverview.tsx`: reescrever para consumir
  `data.porCategoria` (agora com hierarquia via `parent_id`) em vez de
  `useBudgetOverviewRange`. Remove toda a lógica de status de meta/traço de meta e o modo
  "segmentado por membro" baseado em `summary.despesas_por_autor_categoria` (que deixa de
  ser necessário, já que o próprio `porCategoria` agora reflete o filtro de membro
  aplicado no servidor). Categoria-pai e subcategoria mantêm a diferenciação visual
  hierárquica já existente (indentação, fonte), mais a nova exigência: subcategorias em
  tom de cor diferente da categoria-pai, e barra de subcategoria mais fina que a de
  categoria-pai.
- `FinanceDashboard.tsx`: remover chamada a `useBudgetOverviewRange` se
  `MonthCategoriesOverview` for o único consumidor (confirmar durante a implementação) e
  remover a lógica de `categoriaPorMembro`/`summaryQ` se também deixarem de ser usadas em
  outro lugar da tela (o bloco "Por membro da família" com os 2 donuts usa `summaryQ`
  para outra finalidade — não remover isso, só o que era exclusivo do modo segmentado do
  gráfico de categorias).

### Fora do escopo

- `PanoramaGeralView.tsx` — nenhuma mudança interna, só o disparo do toggle (que passa a
  vir do grupo "Visão" do sanduíche em vez do toggle antigo).
- Qualquer funcionalidade de meta/orçamento em outras telas — a remoção de meta é só
  dentro do gráfico de categorias do Painel.
- `AnnualTrendChart.tsx`, `DonutChart.tsx`, `MonthWaterfallChart.tsx` — não tocados
  estruturalmente (continuam recebendo dados já filtrados pela mesma query `data`).
- Nenhuma migration de schema — `parent_id` já existe na tabela `categorias`.

## Leitura de contexto

- `CLAUDE.md` da raiz do workspace — fluxo obrigatório de planejar → aprovar → implementar
  → finalizar, considerado; não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- `src/screens/finance/FinanceDashboard.tsx` (1005 linhas, lido por completo em duas
  partes) — mapeamento completo da estrutura da tela e de como `data` (de
  `fetchDashboardPanorama`) já alimenta todos os cards/gráficos via um único `membroId`.
- `src/screens/finance/MonthCategoriesOverview.tsx` (240 linhas) — investigado por
  subagent: fonte atual (`useBudgetOverviewRange`), hierarquia visual existente, modo
  segmentado por membro.
- `src/screens/finance/DashboardPeriodFilter.tsx` (118 linhas, lido por completo) —
  confirmado: seletor de intervalo de datas com 2 inputs de texto + botão Aplicar,
  estruturalmente incompatível com `MultiFilterPanel` (checkboxes de opções finitas).
- `src/screens/finance/charts/MonthWaterfallChart.tsx` (178 linhas, lido por completo) —
  exemplo real de `BarChart`/`Bar`/`Cell` do recharts já usado no projeto, com tooltip
  customizado e paleta de cores por tipo de barra — referência direta para os dois
  gráficos de colunas novos.
- `src/ui/MultiFilterPanel.tsx` — investigado por subagent: API `FilterGroup`/
  `FilterGroupOption`, suporte a hierarquia pai/filho, multi-seleção com checkboxes.
- `src/screens/finance/MovimentacoesScreen.tsx` + `LancamentosTable.tsx` — padrão de
  filtro client-side (não aplicável da mesma forma aqui, ver decisão abaixo).
- `src/services/financeService.ts` (lido em trecho, linhas 280-400) — `ParcelaFutura`
  (`{ mes, ano, total }`, sem discriminar pago/aberto), `fetchDashboardPanorama` e
  `DashboardPanoramaFiltro` (parâmetro `membroId` hoje singular).
- `backend/src/routes/expenses.ts` (linhas 802-847, lido por completo) — query de
  `/parcelas-futuras`: `pago = false` fixo, sem filtro de membro (`usuario_id = $1` direto).
- `backend/src/routes/financial.ts` (linhas 82-400+, lido por completo) — rota
  `/panorama`: já resolve `membroId` via `resolveDashboardScope`, já filtra TODAS as
  subqueries (incluindo `categoriaResult`) por esse escopo e pelo período — achado central
  que muda a estratégia original (não é necessário trazer lançamentos brutos para o
  cliente filtrar, como se cogitou inicialmente).
- `backend/src/utils/dashboardScope.ts` (35 linhas, lido por completo) —
  `resolveDashboardScope(requesterId, accountId, memberId)`: hoje só aceita
  `undefined`/`null`/um id único; precisa aceitar lista.
- `backend/src/utils/familyVisibility.ts` — já lido em sessão anterior; `resolveVisibleUserIds`
  reaproveitado sem alteração.

## Impacto por área

### Frontend

- Telas: `FinanceDashboard.tsx` (barra de filtro, 3 cards/gráficos reescritos).
- Componentes: `MonthCategoriesOverview.tsx` (reescrita de fonte de dado e estilo de
  barra), dois gráficos novos de colunas (podem virar componentes próprios em
  `src/screens/finance/charts/`, ex. `JurosDescontosChart.tsx` e
  `ParcelasFuturasChart.tsx`, seguindo o padrão de arquivo único por gráfico já usado).
- Hooks/query keys: `queryKeys.dashboardPanorama` já inclui `membroId` na chave — ajustar
  para representar lista (ex. serializar como string ordenada) sem quebrar cache de outras
  telas que usem a mesma chave. `queryKeys.parcelasFuturas` sem parâmetro de membro hoje —
  adicionar.
- Estados de loading/error/empty: manter os mesmos padrões já usados nos cards atuais
  (skeleton/empty state existente), adaptados para os novos gráficos.

### Backend

- Rotas: `GET /financial/panorama` (query de categoria ajustada, parsing de `membro_id`
  como lista), `GET /despesas/parcelas-futuras` (query reescrita, suporte a membro).
- Services/utils: `resolveDashboardScope` (aceitar lista de ids).
- Permissões: nenhuma mudança de permissão — mesma checagem de
  `acesso_lancamentos_familia` já usada por `resolveVisibleUserIds`.
- Regras multi-tenant: lista de membros pedida sempre validada contra `visiveis`
  (resolvido por `resolveVisibleUserIds` com `expandir=true`), nunca aceita membro fora do
  conjunto permitido — mesma garantia que já existe para o caso de id único.

### Banco de dados

`Sem impacto esperado` — `categorias.parent_id` já existe; nenhuma coluna/tabela nova.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário — não se
aplica a este plano (nenhuma migration envolvida).

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `backend/src/routes/financial.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/utils/dashboardScope.ts`
- `src/services/financeService.ts`
- `src/services/queryKeys.ts`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MonthCategoriesOverview.tsx`
- `src/screens/finance/charts/` (dois arquivos novos de gráfico)

## Estratégia de implementação

1. Backend: ajustar `resolveDashboardScope` para aceitar lista de ids.
2. Backend: ajustar `GET /financial/panorama` — parsing de `membro_id` como lista, query
   `categoriaResult` agrupando por `categoria_id`/`parent_id`.
3. Backend: reescrever `GET /despesas/parcelas-futuras` — pagas + em aberto por mês,
   suporte a escopo de membro.
4. Rodar `tsc --noEmit` do backend para validar os três pontos acima antes de seguir.
5. Frontend: ajustar `financeService.ts` (`DashboardPanoramaFiltro`, `fetchDashboardPanorama`,
   `ParcelaFutura`, `fetchParcelasFuturas`) e `queryKeys.ts` (chaves com lista de membros).
6. Frontend: criar os dois componentes de gráfico de colunas novos, usando
   `MonthWaterfallChart.tsx` como referência de padrão (`BarChart`/`Bar`/`Cell`/tooltip).
7. Frontend: ajustar o card "Saldo anterior" (cor condicional).
8. Frontend: reescrever `MonthCategoriesOverview.tsx` para consumir `data.porCategoria`
   hierárquico, com cor de subcategoria diferenciada e barra mais fina.
9. Frontend: substituir o toggle Visão + toggle Membro por um `MultiFilterPanel` com os
   dois grupos, mantendo `DashboardPeriodFilter` ao lado.
10. Remover código morto: `useBudgetOverviewRange` em `FinanceDashboard.tsx` se não for
    mais usado por nenhum outro card da tela (verificar antes de remover).
11. Rodar `npx tsc --noEmit` e `npx vite build` (frontend) e `tsc --noEmit` (backend).
12. Validar manualmente: filtro de membro único, família inteira, combinação parcial de
    membros, alternância Conta/Panorama, todos os gráficos refletindo o filtro.

## Regras de negócio identificadas

- Painel nunca amplia escopo de dados sozinho: sem escolha explícita do usuário no
  filtro, mostra só os dados do próprio usuário — regra já existente em
  `resolveDashboardScope`, preservada com a extensão para lista.
- Um membro pedido que não esteja no conjunto visível ao solicitante deve ser rejeitado
  (nunca cair silenciosamente em "só eu"), preservado na extensão para lista.

## Regras multi-tenant e segurança

- Toda lista de `membro_id` pedida pelo cliente é validada contra `resolveVisibleUserIds`
  antes de ser usada em qualquer query — nenhum novo vetor de vazamento introduzido.
- Conta empresa nunca expande para outros usuários (regra já garantida por
  `resolveByScope`/`resolveVisibleUserIds`, não alterada aqui).

## Validações necessárias

- `membro_id` como lista: validar formato de entrada (múltiplos ids), rejeitar valores
  não numéricos com 400, mesma resposta de erro já usada para id único inválido.
- Parcelas futuras: validar que a nova query não quebra o filtro de intervalo de meses já
  existente (`limiteMeses`, `mes`/`ano` de referência).

## Testes necessários

### Frontend

- Validação manual: alternar filtro de membro (único, família, combinação parcial) e
  confirmar que todos os gráficos do Painel refletem a mesma seleção.
- Validação manual: gráfico de categorias mostra subcategorias com cor diferente e barra
  mais fina, hierarquia navegável mantida.

### Backend

- Validação manual via chamada direta às rotas com diferentes combinações de `membro_id`
  (ausente, `familia`, um id, lista de ids, id fora do escopo permitido → deve dar 400).

### E2E

`Sem impacto esperado` (sem suíte E2E no projeto)

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
cd backend && npx tsc --noEmit
```

## Riscos e pontos de atenção

- **Alto risco visual e comportamental** — é a tela mais usada do sistema; a mudança de
  Membro de seleção exclusiva para multi-seleção real altera a semântica de uso que o
  usuário já conhece (hoje: Eu OU Família OU um nome; depois: qualquer combinação).
- `MonthCategoriesOverview` perde a funcionalidade de status de meta/orçamento nesta
  tela — se essa informação for usada ativamente hoje, é uma perda de funcionalidade real
  a considerar, não só uma mudança visual.
- `Visão` como grupo de seleção única dentro de um componente desenhado para
  multi-seleção é um uso atípico do `MultiFilterPanel` — validar que a UX não fica
  confusa (usuário podendo tentar marcar "Esta conta" e "Panorama Geral" ao mesmo tempo,
  que não faz sentido).
- Mudança de `resolveDashboardScope` e da rota `/panorama` é uma superfície de segurança
  sensível (controla quais dados financeiros de quais usuários são retornados) — testar
  cuidadosamente os casos de borda antes de produção.
- Produção real: `/financial/panorama` e `/despesas/parcelas-futuras` estão em uso ativo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões fechadas nas respostas do usuário:
query de categoria ajustada no backend (não lançamentos brutos no cliente); parcelas
futuras passam a trazer pagas+em aberto com suporte a membro; Visão força dentro do
sanduíche como seleção única; Membro vira multi-seleção real com suporte a lista
arbitrária no backend; Período permanece fora do sanduíche.

## Critérios de aceite do plano

- Juros × Descontos e Parcelas futuras aparecem como gráficos de colunas com cores
  diferenciadas por série.
- Saldo anterior tem cor condicional ao sinal, igual ao card Saldo do período.
- Gráfico de categorias usa a mesma fonte/filtro de membro e período que o resto do
  Painel, com subcategorias em cor diferente e barra mais fina.
- Um único filtro sanduíche (`MultiFilterPanel`) controla Visão e Membros, afetando todos
  os gráficos da tela; Período permanece como controle separado ao lado.
- Multi-seleção de membros específicos (não só Eu/Família) funciona corretamente e com
  segurança (nunca expõe dado de membro fora do escopo permitido).
- `npx tsc --noEmit` (frontend e backend) e `npx vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Implementar backend primeiro (passos 1-4), validar com `tsc --noEmit`, só então seguir
  para frontend — a mudança de `resolveDashboardScope`/rota é a base de tudo.
- Não remover `useBudgetOverviewRange`/`useBudgetOverview.ts` do projeto inteiro — só a
  chamada dentro de `FinanceDashboard.tsx`, e só se nenhum outro lugar do Painel a usar
  mais (confirmar antes de remover; o hook pode ser usado em outra tela de orçamento).
- Seguir `MonthWaterfallChart.tsx` como referência de estilo/estrutura para os dois
  gráficos de colunas novos (paleta, tooltip, `ResponsiveContainer`, `maxBarSize`).
- Testar manualmente as combinações de filtro de membro antes de considerar pronto —
  este é o ponto de maior risco de segurança do plano.
