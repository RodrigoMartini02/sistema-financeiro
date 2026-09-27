# Plano de Implementação: Painel financeiro novo + visibilidade da conta empresa

## Origem

- Arquivo de especificação: `.plans/painel-novo-levantamento.md` (rascunho com decisões e levantamento da Fase 1)
- Data do planejamento: `2026-09-27`
- Classificação: `fullstack` (frontend + backend; sem alteração de banco)

## Resumo

Reescrever o Painel financeiro do zero, a partir das perguntas de gestão definidas
com o usuário, com um endpoint novo `/financial/painel` (Drizzle, regra do mês do
vencimento, visibilidade e permissões validadas no backend). Na mesma entrega:
ampliar a regra central de visibilidade para a conta empresa (dono vê/edita/usa
tudo; colaborador com permissão), corrigir o saldo inicial no cálculo de saldo, e
remover o painel antigo e todo o código que só ele usava. Uma branch, um merge —
sem janela com o painel quebrado em produção.

## Decisões aplicadas

- Regra de datas: despesa pertence à **data de vencimento**, receita à **data de recebimento** (mesma regra do resto do sistema). Regime de caixa descartado.
- Período: filtro **`dd/mm/aaaa` até `dd/mm/aaaa`**, abrindo no mês atual; usuário escolhe qualquer período.
- Visibilidade da conta empresa entra neste plano (D1).
- Saldo acumulado sempre inclui o saldo inicial (`aporte_inicial`), uma única vez — no painel e no `balanceService` (D2).
- Conta empresa: editar lançamentos de outros segue a regra da conta pessoal (D3).
- Conta empresa: ver/usar cartões de outros segue a regra da conta pessoal (D4).
- Permissão **Painel** (`acesso_painel`) conferida no backend e válida para todos os blocos; "quem gastou o quê" não exige mais Relatórios.
- Limite dos cartões visível para quem vê os lançamentos de outros (segue `acesso_lancamentos_familia`).
- Orçamento para membro só com Planejamento (`acesso_planejamento`).
- Filtro de checkbox com grupos **Membros** e **Contas** sempre visíveis; "Todas as contas" desabilitada com explicação para quem não tem `acesso_panorama_geral`.
- Panorama Geral vira o bloco "Todas as suas contas", no topo quando marcado.
- Receitas por origem: conta pessoal = por membro (some sem membros); conta empresa = contratos × avulsas.

## Escopo

### Dentro do escopo

**Parte A — Visibilidade (regra central, todas as telas)**
- `familyVisibility.ts`: conta empresa passa a ter o mesmo modelo da conta pessoal (lançamentos, edição e cartões).
- Tela de permissões: grupo "Carteira" também na conta empresa, com rótulos por tipo de conta.

**Parte B — Backend do painel**
- Endpoint `GET /financial/painel` + `painelService.ts` + `painelCalculos.ts` (com testes).
- Correção do saldo inicial em `balanceService.ts`.
- Variante de `getCardLimits` que recebe a lista de pessoas.
- Remoção de `/financial/panorama`, `/financial/anual`, `/despesas/parcelas-futuras`, `/account-members/summary`.

**Parte C — Frontend do painel**
- `FinanceDashboard.tsx` reescrito + seções em `screens/finance/painel/`.
- `DashboardPeriodFilter` adaptado para dia; `MultiFilterPanel` com opção desabilitada.
- Remoção dos componentes, serviços, chaves e tipos do painel antigo e das simulações mortas do modo demonstração.

### Fora do escopo

- Catálogo de categorias compartilhado na conta empresa (continua por pessoa).
- Redesenho do painel de conta empresa (contratos, faturado × recebido, clientes) — rodada própria; aqui só se mantém o que existe (estoque baixo, carteira de contratos, receitas por origem).
- Mudança da regra de datas nas demais telas (continuam no vencimento, como o painel).
- Índice novo por `data_vencimento` (só com confirmação, se a performance exigir).
- Mock do painel no modo demonstração (hoje o `/panorama` também não é simulado).
- Checagens de qualidade em produção (dependem do usuário rodar o script ou liberar a permissão).

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` (mesmo conteúdo; diferem só em quebra de linha)
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem como arquivos dedicados
- `.plans/painel-novo-levantamento.md`
- Backend: `routes/financial.ts`, `routes/accountMembers.ts`, `routes/expenses.ts`, `routes/incomes.ts`, `routes/cards.ts`, `routes/budget.ts`, `services/budgetService.ts`, `services/cardLimitService.ts`, `services/balanceService.ts`, `utils/familyVisibility.ts`, `utils/dashboardScope.ts`, `utils/accountFilter.ts`, `middleware/permissions.ts`, `db/schema/{expenses,incomes,cards,memberPermissions}.ts`
- Frontend: `screens/finance/FinanceDashboard.tsx`, `DashboardPeriodFilter.tsx`, `PanoramaGeralView.tsx`, `MonthCategoriesOverview.tsx`, `charts/*`, `ui/MultiFilterPanel.tsx`, `services/{financeService,membrosService,queryKeys,cardLimitsService}.ts`, `services/demo/fakeApiResolver.ts`, `screens/config/PermissoesTab.tsx`, `layout/AppShell.tsx`, `utils/cardDueDate.ts`

## Impacto por área

### Frontend

**Tela**: Painel financeiro (`FinanceDashboard.tsx`, montado pelo `AppShell` — gate de `accessDashboard` mantido).

**Estrutura (ordem)**
0. **Todas as suas contas** — só quando "Todas as contas" está marcado; aparece no topo. Entrou × saiu × resultado por conta + total, no período. Fonte: `/account-members/overview` (existente).
1. **Cards**: Entrou · Saiu (embaixo "R$ X pago · R$ Y a pagar") · Resultado (entrou − saiu, com sinal e % sobre a receita) · Comprometimento (saiu ÷ entrou, faixas 70%/100% coerentes entre número e barra) · Saldo acumulado (saldo final + "anterior R$ …"). Entrou/Saiu com "↑/↓ x% vs período anterior".
   - Conta empresa, logo abaixo: Estoque baixo · Carteira de contratos (`getContratosFaturamento`, mês base 1) · Receitas por origem (contratos × avulsas).
2. **Receita × despesa** — barras agrupadas (receita, despesa) + linha do resultado por mês.
3. **Como o dinheiro saiu**
   - Linha 1: Forma de pagamento (pizza grande, ~60%) + lista com forma, %, valor, nº de compras, ticket médio, juros · Cartões de crédito (pizza, ~40%) com valor e % do limite (só com gasto em cartão).
   - Linha 2: À vista × parcelado (pizza) · Tipo de gasto: fixo × parcela × livre (pizza).
   - Linha 3: Uso do crédito por mês (% do gasto no crédito).
4. **Em dia com as contas?** — números do período: cadastrado (vencem no período) · pago em dia · pago com atraso · em aberto · quitado no período de vencimentos anteriores; + em atraso total e próximos 30 dias ("hoje"); + barras cadastrado × pago por mês.
5. **Estou dentro do planejado?** — metas × gasto por categoria (barras de progresso). Só conta pessoal; membro precisa de Planejamento.
6. **O que já está comprometido?** — próximos 6 meses a partir de hoje: não pagas por mês, parcelas × demais.
7. **Quem trouxe e quem gastou** — conta pessoal com membros e todos marcados: receitas por membro (pizza — é a "receita por origem" da conta pessoal) · despesas por membro (pizza) · comparativo (tabela receita/despesa/saldo por pessoa).
8. **Quanto perdi com atraso** — juros e descontos no período e no acumulado do ano (números).
9. **Categorias** — `MonthCategoriesOverview` (top 5 + "ver mais").

Blocos que ignoram o período declaram no título ("hoje", "a partir de hoje").

**Filtros**
- `DashboardPeriodFilter` adaptado: campos `dd/mm/aaaa` passam a valer com o dia; padrão = primeiro e último dia do mês atual (calculado na renderização, não no carregamento do módulo). Remover a prop morta `primeiraData`.
- `MultiFilterPanel`: `FilterGroupOption` ganha `disabled?: boolean` e `hint?: string` (retrocompatível). Grupos: **Membros** (uma opção por pessoa; rótulo por tipo de conta via `TERMOS`) e **Contas** ("Todas as contas"; desabilitada com "sem permissão" sem `acesso_panorama_geral`). Sempre visíveis.
- Forma de pagamento, cartão e categoria não são filtros.

**Componentes**
- Novos em `screens/finance/painel/`: `PainelFiltros`, `CardsResumo`, `ReceitaDespesaMensal`, `ComoDinheiroSaiu`, `EmDiaComContas`, `Planejado`, `Comprometido`, `QuemTrouxeQuemGastou`, `JurosDescontos`, `TodasAsContas`, `ExtrasContaEmpresa` (nomes podem ser ajustados na implementação, mantendo uma responsabilidade por arquivo).
- Novo gráfico único de barras mensais (`charts/BarrasMensaisChart.tsx`), configurável por séries, usado em receita × despesa, cadastrado × pago e comprometido; uso do crédito pode usar o mesmo com série percentual.
- Reaproveitados: `DonutChart`, `MonthCategoriesOverview`, `Card`, `ErrorState`, `FirstAccessGuideCard` (guias `painel:mes-v1` sem lançamentos e `painel:comprometimento-v1` no card de Comprometimento).
- Cabeçalho de card e de seção como componentes locais, sem `div`s espaçadoras vazias nem wrappers de filho único.

**Dados**
- `fetchPainel({ de, ate, membroId })` em `financeService.ts`; tipos `PainelData` em `types/finance.ts`; `queryKeys.painel(de, ate, membroId)`.
- `fetchAccountsOverview` (existente) com `queryKeys.accountsOverview`, habilitado só com "Todas as contas" marcado.
- Estados: loading, erro (`ErrorState`), vazio por bloco.

**Remoções**
- `charts/AnnualTrendChart.tsx`, `charts/JurosDescontosChart.tsx`, `charts/ParcelasFuturasChart.tsx`, `charts/MonthWaterfallChart.tsx`, `PanoramaGeralView.tsx`.
- `fetchDashboardPanorama`, `fetchDashboardAnual`, `fetchParcelasFuturas`, `fetchAccountSummary` e tipos associados; `queryKeys.dashboardPanorama`, `accountSummary`, `parcelasFuturas` (conferir consumidores antes).
- `services/demo/fakeApiResolver.ts`: simulações de `/financial/anual` e `/despesas/parcelas-futuras`.

**Tela de permissões**
- `PermissoesTab.tsx`: grupo "Carteira" visível também em conta empresa, com rótulos por tipo (ex.: "Ver lançamentos de outros colaboradores"). Ajustar labels em `permissoesService.ts`.

### Backend

**Parte A — `utils/familyVisibility.ts`**
- Extrair a decisão para função pura (ex.: `decidirAcessoCarteira({ tipoConta, ehDono, vinculoAtivo, permissao, expandir })`) com testes.
- `resolveByScope` (lançamentos e cartões) e `canEditOthersEntries`: remover a restrição `tipo !== 'pessoal'`. Regra final, nas duas contas: dono vê/edita/usa tudo; membro/colaborador com vínculo ativo só com a permissão correspondente; `expandir` continua obrigatório para ampliar a visão.
- `resolveAccountOwnerId` (catálogo) não muda.
- Atualizar comentários de `familyVisibility.ts` e `db/schema/memberPermissions.ts` que dizem "somente conta pessoal".
- Consumidores afetados (sem alteração de código esperada, mas no teste manual): `routes/{accountMembers,budget,cards,categories,expenses,incomes,notifications}.ts`, `services/{budgetService,cardLimitService}.ts`, `utils/dashboardScope.ts`.

**Parte B — Painel**
- `services/painelService.ts` (novo), consultas em **Drizzle** (`db.select` com `sql`/`sum`/`count` para agregações, `groupBy`), em paralelo (`Promise.all`), selecionando só os campos necessários. Entrada: `{ escopoUserIds, accountId, de, ate, hoje }`.
  - Filtro de conta único (mesma semântica de hoje: `conta_id = conta` ou `conta_id` nulo pertencente à conta pessoal do dono) reaproveitado por todas as consultas — corrige estoque baixo e categorias.
  - Despesas: período por `data_vencimento` entre `de` e `ate`, `status = 'ativa'`; valor efetivo = `pago ? COALESCE(valor_pago, valor_original) : valor_original`.
  - Receitas: `status = 'ativa'`, período por `data_recebimento`.
  - Funções: `resumo` (período e período anterior), `saldoAcumulado`, `seriesMensais` (receita, despesa, resultado, % crédito, cadastrado × pago), `formasDePagamento` (valor, qtd, juros), `cartoes` (gasto) + limites, `aVistaParcelado`, `tipoDeGasto` (fixa = `recorrente`; parcela = `parcelado AND NOT recorrente`; livre = resto), `emDia` (cadastrado, pago em dia, pago com atraso, em aberto, quitado de vencimentos anteriores), `emAberto` (atraso total e próximos 30 dias, em relação a hoje), `comprometido` (6 meses a partir de hoje), `porMembro`, `jurosDescontos` (período e ano), `categorias` (mesmo formato de hoje para `MonthCategoriesOverview`), conta empresa: `receitasPorOrigem`, `estoqueBaixo`.
- `services/painelCalculos.ts` (novo) + `painelCalculos.test.ts`: período anterior equivalente, variação %, comprometimento, classificação pago em dia × com atraso (sem `data_pagamento` = em dia), tipo de gasto, ticket médio, % pago, meta proporcional aos dias, granularidade da série (mês/ano).
- `services/balanceService.ts`: saldo anterior = `aporte_inicial` + receitas − despesas antes do início, sempre (remover a condição "só no início do histórico"). O painel usa a mesma regra com o escopo de pessoas.
- `services/cardLimitService.ts`: extrair `getCardLimitsForOwners(ownerIds, accountId)`; `getCardLimits` continua igual para os demais consumidores.
- Orçamento: `getBudgetOverview` (metas); meta proporcional aos dias do período; gasto no período exato; bloco nulo em conta empresa (`BudgetInputError`) ou sem `accessBudget` para membro.
- `routes/financial.ts`: `GET /painel` com `authenticate`, `requireActivePlan`, `requireScreenAccess('accessDashboard')`; valida `de`/`ate` (ISO, `de <= ate`, intervalo máximo razoável, ex. 10 anos), `membro_id` (mesmo contrato de hoje via `resolveDashboardScope`) e `conta_id`. Handler fino; regras no service.
- Remover: `GET /financial/panorama`, `GET /financial/anual`, `GET /despesas/parcelas-futuras`, `GET /account-members/summary` (únicos consumidores eram o painel). Manter `GET /account-members/overview`.
- Após remover, conferir funções órfãs (ex.: `calculatePreviousBalance` se só `/anual` usava).

### Banco de dados

Sem impacto esperado. Nenhuma tabela, coluna ou migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado. Backend e frontend precisam subir juntos (mesmo merge).

## Arquivos provavelmente afetados

Backend
- `backend/src/utils/familyVisibility.ts` (+ teste da função pura)
- `backend/src/db/schema/memberPermissions.ts` (comentários)
- `backend/src/routes/financial.ts`
- `backend/src/routes/expenses.ts` (remover `/parcelas-futuras`)
- `backend/src/routes/accountMembers.ts` (remover `/summary`)
- `backend/src/services/painelService.ts` (novo)
- `backend/src/services/painelCalculos.ts` (novo) + `painelCalculos.test.ts` (novo)
- `backend/src/services/balanceService.ts`
- `backend/src/services/cardLimitService.ts`

Frontend
- `src/screens/finance/FinanceDashboard.tsx` (reescrito)
- `src/screens/finance/painel/*` (novos)
- `src/screens/finance/charts/BarrasMensaisChart.tsx` (novo)
- `src/screens/finance/DashboardPeriodFilter.tsx`
- `src/ui/MultiFilterPanel.tsx`
- `src/screens/config/PermissoesTab.tsx`, `src/services/permissoesService.ts`
- `src/services/financeService.ts`, `src/services/membrosService.ts`, `src/services/queryKeys.ts`, `src/types/finance.ts`
- `src/services/demo/fakeApiResolver.ts`
- Removidos: `charts/AnnualTrendChart.tsx`, `charts/JurosDescontosChart.tsx`, `charts/ParcelasFuturasChart.tsx`, `charts/MonthWaterfallChart.tsx`, `PanoramaGeralView.tsx`

## Estratégia de implementação

0. Branch `feat/R/painel-financeiro-novo` a partir de `main` atualizada.
1. **Visibilidade (Parte A)**: função pura + testes → aplicar em `resolveByScope` e `canEditOthersEntries` → comentários → `PermissoesTab`/labels.
2. **Saldo**: corrigir `balanceService` (saldo inicial sempre).
3. **Cálculos**: `painelCalculos.ts` + testes.
4. **Serviço**: `painelService.ts` (Drizzle), variante de `getCardLimits`, orçamento proporcional.
5. **Rota**: `GET /financial/painel` com validações e permissão.
6. **Conferência**: no banco local, comparar Entrou/Saiu/categorias/formas de um mês inteiro entre `/financial/painel` e `/financial/panorama` (mesma regra → devem bater, exceto onde a regra mudou de propósito: saldo inicial).
7. **Remover o antigo (frontend)**: apagar componentes, serviços, chaves e tipos do painel antigo e simulações mortas — antes de escrever o novo (sem código sobreposto).
8. **Frontend novo**: `MultiFilterPanel` (opção desabilitada) → `DashboardPeriodFilter` (dia) → `BarrasMensaisChart` → seções → `FinanceDashboard`.
9. **Remover o antigo (backend)**: `/panorama`, `/anual`, `/parcelas-futuras`, `/summary` e funções órfãs.
10. **Validação**: builds, testes, grep de resíduos, conferência manual (matriz abaixo).

## Regras de negócio identificadas

- Despesa pertence à data de vencimento; receita à data de recebimento; só `status = 'ativa'`.
- Saldo acumulado = saldo inicial + receitas − despesas até o fim do período (saldo inicial uma única vez).
- Comparação: período que é mês inteiro → mês anterior inteiro; demais → mesmo número de dias imediatamente antes.
- Séries: período dentro de um mês → 12 meses até ele; período que atravessa meses → meses do período; acima de 24 meses → por ano; meses das pontas contam só os dias dentro do período.
- Pago em dia = `data_pagamento <= data_vencimento`; pago sem `data_pagamento` = em dia.
- Atraso = não pago com vencimento antes de hoje (qualquer período); próximos 30 dias = não pago com vencimento de hoje até hoje + 30; comprometido = não pago com vencimento nos 6 meses a partir de hoje.
- Tipo de gasto: fixa = recorrente; parcela = parcelado e não recorrente; livre = resto.
- Meta de orçamento mensal proporcional aos dias do período.
- Juros/descontos = diferença positiva/negativa entre valor pago e valor original.
- Receitas por origem: conta pessoal = por membro; conta empresa = contrato × avulsa.

## Regras multi-tenant e segurança

- "Tenant" aqui = conta + escopo de pessoas. Nunca confiar em `conta_id`/`membro_id` do client sem validação: escopo sempre por `resolveDashboardScope` → `resolveVisibleUserIds` (vínculo ativo + permissão + `expandir`).
- Permissão Painel conferida no backend (`requireScreenAccess('accessDashboard')`).
- Orçamento para membro só com `accessBudget`; "Todas as contas" só com `acesso_panorama_geral` (já validado no `/overview`).
- Limite de cartões pelo escopo de lançamentos (decisão do usuário).
- Mudança da regra central afeta todas as telas: validar com a matriz de testes; falha na resolução deve continuar restringindo (lista com só o solicitante), nunca abrindo.
- Mensagens de erro sem revelar dados de outras contas/pessoas.

## Validações necessárias

- `de`, `ate`: datas ISO válidas; `de <= ate`; intervalo máximo (ex. 10 anos) → 400 com mensagem clara.
- `membro_id`: mesmo contrato atual (ausente = só eu; `familia`; id; lista de ids) → 400 "Membro não disponível" quando fora do escopo.
- `conta_id`: inteiro; conta resolvida pelas regras existentes.
- Frontend: `DashboardPeriodFilter` não aplica período inválido (`de > ate` ou data malformada).

## Testes necessários

### Frontend

- Sem infraestrutura de testes no frontend: `npx vite build` + conferência manual.

### Backend

- `painelCalculos.test.ts`: período anterior (mês inteiro e dias soltos), variação com base zero, comprometimento, pago em dia/atraso/sem data, tipo de gasto, ticket médio com zero compras, meta proporcional, granularidade.
- Teste da função pura de visibilidade: conta pessoal e empresa × dono/membro × com/sem permissão × com/sem `expandir` × vínculo inativo.

### E2E

- Manual (matriz):
  - Visibilidade: dono e colaborador/membro, com e sem permissão, em conta pessoal e empresa — Despesas, Receitas, Cartões, Painel, edição de lançamento de outro.
  - Painel: conta pessoal sem membros; com membros todos marcados; seleção parcial; membro sem permissão Painel (403), sem Planejamento (bloco some), sem Panorama Geral (opção desabilitada); conta empresa (extras aparecem, orçamento e membros não).
  - Período: mês atual; dias soltos; vários meses; mais de 24 meses.
  - Conferência de totais contra `/financial/panorama` antes de removê-lo.

## Comandos de validação sugeridos

```bash
cd "sistema financas/backend" && npm run build && npm test
cd "sistema financas" && npx vite build
```

## Riscos e pontos de atenção

- Mudança de visibilidade atinge todas as telas: alto impacto de segurança — matriz de testes obrigatória antes do merge.
- Correção do saldo inicial muda o saldo exibido em `/api/meses` (correção esperada).
- Entrega grande em um único merge: revisar por partes (A, B, C) e conferir totais contra o painel antigo antes de removê-lo.
- Primeira agregação em Drizzle no projeto: manter as consultas legíveis e parametrizadas.
- Performance: ~12 consultas agregadas por requisição em paralelo; filtro por `data_vencimento` sem índice dedicado (volume atual não exige; índice só com migration confirmada).
- Checagens de qualidade em produção pendentes (casos de borda: pagas sem data, lançamentos de colaboradores, receitas previstas).
- `PUT /receitas/:id/receber` mantém a data prevista quando nenhuma data é informada — afeta "Entrou" na conta empresa (fora do escopo corrigir).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Painel novo na ordem e com os blocos definidos, filtros `dd/mm/aaaa` até `dd/mm/aaaa` (abre no mês atual), Membros e Contas sempre visíveis.
- `/financial/painel` confere a permissão Painel, valida parâmetros e respeita escopo/visibilidade.
- Totais de um mês inteiro batem com o painel antigo (exceto saldo inicial, corrigido de propósito).
- Saldo acumulado inclui o saldo inicial em qualquer período.
- Conta empresa: dono vê/edita/usa tudo; colaborador só com permissão; grupo "Carteira" aparece nas permissões da conta empresa.
- Painel antigo, endpoints e componentes removidos, sem resíduos (grep).
- Builds e testes passam; matriz manual conferida.

## Observações para a skill implementar

- Usar este plano e `.plans/painel-novo-levantamento.md` como fontes.
- Remover o antigo antes de aplicar o novo em cada parte (sem código sobreposto); não ocultar código.
- Consultas novas em Drizzle; SQL escrito à mão só se o Drizzle não resolver, parametrizado e com motivo no código.
- Não executar migrations. Não alterar `.env`. Não ler o banco de produção.
- Manter uma responsabilidade por arquivo nas seções do painel.
