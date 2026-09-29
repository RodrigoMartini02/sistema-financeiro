# Plano de Implementação: Redesign do Painel Financeiro — Visão de Gestão

## Origem

- Data do planejamento: `2026-07-09`
- Classificação: `fullstack`

## Resumo

Substituir o `FinanceDashboard.tsx` atual — que tem duas abas com tabelas e gráficos sobrepostos — por um painel único de gestão visual. Sem tabelas, sem abas, sem modais de lançamento. Uma tela de rolagem com KPIs do mês selecionado, painel de contratos ativos, gráfico de tendência anual e análise de categorias/origens. Um endpoint novo no backend agrega os 12 meses do ano em uma única query SQL, substituindo as 24 chamadas paralelas do código atual.

## Decisões Aplicadas

- **Decisão 1:** Mensal com contexto anual — seletor de mês/ano permanece; KPIs refletem o mês selecionado; gráfico de tendência mostra o ano completo com mês atual destacado.
- **Decisão 2:** Remover totalmente tabelas — sem IncomePanel, sem ExpensePanel, sem dialogs de lançamento no painel. Lançamentos ficam nas telas dedicadas.
- **Decisão 3:** Endpoint agregado `GET /api/financial/anual?ano=X` — um único request retorna receitas, despesas e saldo dos 12 meses.

## Escopo

### Dentro do escopo

- Novo endpoint backend `GET /api/financial/anual?ano=X`
- Reescrita completa de `FinanceDashboard.tsx` sem abas e sem tabelas
- 5 KPI cards com variação percentual vs mês anterior (usando dados do endpoint anual)
- Painel de contratos ativos: total da carteira, progresso faturado/pendente/em atraso
- Area chart de 3 linhas (Receitas × Despesas × Saldo) para o ano completo
- Bar chart horizontal: top 8 categorias de despesa do mês (client-side)
- Donut: Receitas por origem — Contratos vs Avulsas (client-side, via `contratoId`)
- Progress bars de saúde financeira: Recebido / Pago / Pendente
- Donut compacto: forma de pagamento (client-side)
- `MetricCard` aprimorado com prop opcional `delta?: number` para variação %
- Query key `dashboardAnual(year)` em `queryKeys.ts`
- Service function `fetchDashboardAnual(ano)` em `financeService.ts`

### Fora do escopo

- Top clientes por receita (requer query adicional — defer)
- Saldo real descontando reservas (complexidade extra — defer)
- Comparação ano a ano no mesmo gráfico (defer)
- Modais de lançamento no painel (usuário vai para telas dedicadas)
- Exclusão dos arquivos `IncomePanel.tsx` / `ExpensePanel.tsx` (ficam para uso futuro)
- Alterações nas telas de Receitas e Despesas

## Layout do Novo Painel (top to bottom)

```
┌─ Header: "Painel" + botão Atualizar ─────────────────┐
│  MonthSelector (mantido)                              │
└───────────────────────────────────────────────────────┘

┌──────┬──────┬──────┬──────┬──────┐
│Saldo │Recei-│Despe-│Saldo │%Comp-│  ← 5 KPI cards com
│ ant. │ tas  │ sas  │proj. │rom.  │    variação vs mês ant.
└──────┴──────┴──────┴──────┴──────┘

┌─ Contratos Ativos ────────────────────────────────────┐
│ Carteira: R$X  Faturado █████░░░░ 60%                │
│ ✓ 3 recebidos  ⏱ 2 faturados  ⚠ 1 em atraso         │
└───────────────────────────────────────────────────────┘

┌─ Receitas × Despesas × Saldo — {ano} ────────────────┐
│  Area Chart 3 linhas (verde / vermelho / azul)         │
│  Mês selecionado destacado com ReferenceLine           │
└───────────────────────────────────────────────────────┘

┌─ Despesas por categoria ──┬─ Receitas por origem ─────┐
│  Bar chart horizontal     │  Donut:                   │
│  Top 8 categorias         │  Contratos vs Avulsas     │
└───────────────────────────┴───────────────────────────┘

┌─ Saúde financeira ────────┬─ Forma de pagamento ──────┐
│  Progress bars:           │  Donut compacto +         │
│  Recebido / Pago /        │  legenda lateral          │
│  Pendente a vencer        │                           │
└───────────────────────────┴───────────────────────────┘
```

## Impacto por Área

### Frontend

**Arquivo principal:** `src/screens/finance/FinanceDashboard.tsx` — reescrita completa.

**Removido do arquivo:**
- `useState` para `tab` (abas removidas)
- `useState` para `incomeDialog` e `expenseDialog`
- Imports de `IncomePanel`, `ExpensePanel`, `IncomeDialog`, `ExpenseDialog`
- `useQueries` (24 requests paralelos) substituído por `useQuery` no endpoint anual
- Todo o JSX das abas "Lançamentos" e "Análise"

**Adicionado ao arquivo:**
- `useQuery` para `fetchDashboardAnual(year)` via `queryKeys.dashboardAnual(year)`
- `useQuery` para `getContratosFaturamento(month+1, year)` (já existente)
- Computações client-side:
  - `catData`: `data.expenses` agrupado por `categoria`
  - `origemData`: `data.incomes` agrupado por `contratoId != null ? 'Contratos' : 'Avulsas'`
  - `formaData`: `data.expenses` agrupado por `formaPagamento`
  - `delta(field)`: `anualData[month].field - anualData[month-1].field` para variação %
  - `totalCarteira`, `totalFaturado`, `totalPendente`, `totalEmAtraso` dos contratos
- Gráficos Recharts: `AreaChart` (3 linhas + `ReferenceLine`), `BarChart` horizontal, dois `PieChart` (donut)
- Progress bars com `width: percentage%` inline style

**`MetricCard.tsx`:**
- Adicionar prop opcional: `delta?: number` — se definido, exibe `+X%` ou `-X%` embaixo do valor
- Adicionar tone opcional: `'warning'` (para % comprometimento)

**`queryKeys.ts`:**
```ts
dashboardAnual: (year: number) => ['dashboard-anual', year] as const,
```

**`financeService.ts`:**
```ts
export interface DashboardAnualMes {
  mes: number; // 0-11
  receitas: number;
  despesas: number;
  saldo_final: number;
  receitas_previstas: number;
}
export async function fetchDashboardAnual(ano: number): Promise<DashboardAnualMes[]>
```

**Estados tratados:**
- Loading: skeleton cards e gráficos com placeholder
- Error: `<ErrorState />` existente
- Empty: gráficos com mensagem "Sem dados para {ano}"

### Backend

**Arquivo:** `backend/src/routes/financial.ts`

**Novo endpoint:**
```
GET /api/financial/anual?ano=2026
Authorization: Bearer token

Response: { success: true, data: DashboardAnualMes[] }
```

**Query SQL (single round-trip):**
```sql
SELECT
  gs.mes,
  COALESCE(r.total, 0)::float AS receitas,
  COALESCE(d.total, 0)::float AS despesas,
  COALESCE(m.saldo_final, 0)::float AS saldo_final,
  COALESCE(p.total, 0)::float AS receitas_previstas
FROM generate_series(0, 11) AS gs(mes)
LEFT JOIN (
  SELECT mes, SUM(valor) AS total
  FROM receitas
  WHERE ano = $1 AND usuario_id = $2 AND status = 'ativa'
    AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
      SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
    )))
  GROUP BY mes
) r ON r.mes = gs.mes
LEFT JOIN (
  SELECT mes, SUM(valor_final) AS total
  FROM despesas
  WHERE ano = $1 AND usuario_id = $2
    AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
      SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
    )))
  GROUP BY mes
) d ON d.mes = gs.mes
LEFT JOIN (
  SELECT mes, saldo_final
  FROM meses
  WHERE ano = $1 AND usuario_id = $2
    AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
      SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
    )))
  ORDER BY perfil_id NULLS LAST LIMIT 1
) m ON m.mes = gs.mes
LEFT JOIN (
  SELECT mes, SUM(valor) AS total
  FROM receitas
  WHERE ano = $1 AND usuario_id = $2 AND status IN ('prevista', 'faturada')
    AND ($3::int IS NULL OR perfil_id = $3 OR (perfil_id IS NULL AND EXISTS (
      SELECT 1 FROM perfis pf WHERE pf.id = $3 AND pf.tipo = 'pessoal' AND pf.usuario_id = $2
    )))
  GROUP BY mes
) p ON p.mes = gs.mes
ORDER BY gs.mes
```

Parâmetros: `[$ano, $userId, $perfilId | null]`

**Validações backend:**
- `ano` obrigatório, inteiro, razoável (ex: 2000–2100)
- `perfil_id` opcional (como nos outros endpoints)
- `usuario_id` sempre do token JWT

### Banco de Dados

Sem alterações de schema. Nenhuma migration necessária.

### Infra/Deploy

Sem impacto.

## Arquivos Provavelmente Afetados

- `src/screens/finance/FinanceDashboard.tsx` — reescrita
- `src/screens/finance/MetricCard.tsx` — prop `delta` adicionada
- `src/services/financeService.ts` — `fetchDashboardAnual`, `DashboardAnualMes`
- `src/services/queryKeys.ts` — `dashboardAnual`
- `backend/src/routes/financial.ts` — novo endpoint

## Estratégia de Implementação

1. **`queryKeys.ts`** — adicionar `dashboardAnual(year)`
2. **`financeService.ts`** — adicionar interface `DashboardAnualMes` e função `fetchDashboardAnual(ano)`
3. **`financial.ts` backend** — adicionar rota `GET /anual` com query SQL agregada; validar `ano` e `perfil_id`; filtrar por `usuario_id`
4. **`MetricCard.tsx`** — adicionar prop opcional `delta?: number` com exibição condicional
5. **`FinanceDashboard.tsx`** — reescrita:
   - Remover tabs, IncomePanel, ExpensePanel, dialogs
   - Adicionar `useQuery` para `fetchDashboardAnual`
   - Adicionar `useQuery` para `getContratosFaturamento`
   - Computações client-side (catData, origemData, formaData, deltas)
   - Compor novo layout (KPIs, Contratos, Area chart, dois columns, Health row)
6. **Build** — `npx vite build` + `npx tsc --noEmit` no backend

## Regras de Negócio Identificadas

- `receitas` com `status='ativa'` contam como recebidas; `prevista` e `faturada` contam como previstas
- `despesas`: `valor_final` é o valor efetivo (já considera parcelamento)
- `saldo_final` vem da tabela `meses` quando o mês foi fechado; caso contrário calcular como `saldo_anterior + receitas - despesas` do mês atual
- Variação % vs mês anterior usa `anualData[month-1]` (pode ser undefined para Janeiro — exibir `—` nesses casos)
- Carteira de contratos = soma de `valor_mensal` dos contratos ativos
- % comprometimento = `despesas / receitas * 100` (se receitas = 0, exibir `—`)

## Regras Multi-tenant e Segurança

- Endpoint `/api/financial/anual` deve filtrar por `usuario_id = req.user!.id` (JWT)
- `perfil_id` opcional, mesmo padrão dos outros endpoints (profileWhere já existente em `months.ts`)
- Nunca retornar dados de outros usuários
- Nunca expor `usuario_id` em mensagens de erro

## Validações Necessárias

- `ano`: inteiro, obrigatório, intervalo 2000–2100
- `perfil_id`: inteiro, opcional
- Frontend: `anualData` pode ser array vazio nos primeiros renders — gráficos devem tratar graciosamente

## Riscos e Pontos de Atenção

| Risco | Impacto | Mitigação |
|---|---|---|
| `generate_series` requer PostgreSQL | Baixo | Banco já é Postgres |
| Remover dialogs do dashboard pode confundir usuário | Baixo | Botões de ação ficam nas telas dedicadas |
| `MetricCard` com nova prop | Mínimo | Prop opcional, retrocompatível |
| Query SQL com 4 subqueries | Baixo | Aggregations são leves; não há N+1 |
| `saldo_final` de mês não fechado | Médio | Calcular como receitas - despesas se `meses` não tiver registro |

## Perguntas em Aberto

- O painel deve mostrar botão de "Nova receita" / "Nova despesa" atalho mesmo sem os painéis? (Sugestão: não — o usuário navega pelas telas)
- No Area chart, o saldo acumulado deve ser o saldo_final do mês (da tabela meses) ou calculado em tempo real? (Sugestão: usar saldo_final do endpoint, que já reflete o fechamento)

## Critérios de Aceite

- [ ] Painel carrega sem nenhuma tabela visível
- [ ] 5 KPI cards exibem dados do mês selecionado
- [ ] Pelo menos 1 KPI exibe variação % vs mês anterior
- [ ] Painel de contratos mostra carteira total + progress bar
- [ ] Area chart renderiza 3 linhas para o ano (mesmo que dados parciais)
- [ ] Mês selecionado está destacado no Area chart
- [ ] Bar chart de categorias renderiza (ou mostra empty state)
- [ ] Donut de origens renderiza Contratos vs Avulsas
- [ ] Progress bars de saúde mostram proporções corretas
- [ ] Trocar o mês atualiza KPIs, contratos e highlight do gráfico
- [ ] Build frontend passa sem erros TS
- [ ] Backend typecheck passa sem erros

## Observações para a Skill Implementar

- Usar este plano como fonte principal de contexto
- Não executar migrations (não há nenhuma neste plano)
- O `FinanceDashboard.tsx` é uma reescrita — não tentar preservar o código antigo; começar limpo
- Recharts já está instalado (`recharts` no package.json) — não instalar nada novo
- `getContratosFaturamento` e `ContratoFaturamento` já estão em `financeService.ts` (implementado na sessão anterior)
- O painel de contratos pode ser omitido se `contratosQ.data?.length === 0` (usuário sem contratos ativos)
- `perfil_id` deve ser passado via `getActiveProfileId()` no service, como nos outros endpoints
- Não alterar `.env`
- Não fazer commit sem solicitação do usuário
