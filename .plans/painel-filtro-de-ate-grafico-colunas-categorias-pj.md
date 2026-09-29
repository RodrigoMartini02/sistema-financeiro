# Plano de Implementação: Filtro De/Até no painel, gráfico de colunas Receita×Despesa e categorias padrão no perfil PJ

## Origem

- Arquivo de especificação: nenhum (planejado a partir de exploração de código, sem `FEATURE_FILE`)
- Data do planejamento: 2026-08-21
- Classificação: `fullstack + database`

## Resumo

Duas frentes independentes no painel financeiro:

1. Simplificar o filtro de período do painel para um seletor De/Até em granularidade mês/ano, com o painel abrindo por padrão no ano corrente; adicionar um gráfico de colunas (barras) comparando Receita × Despesa por mês, complementando os gráficos existentes (área e cascata).
2. Corrigir a ausência do card "Categorias" no perfil empresa (PJ): remover a restrição que o esconde para `profileType === 'empresa'`, e rodar um backfill retroativo das 14 categorias padrão de empresa para perfis PJ criados antes da correção anterior (commit `14cea16`), que nunca as receberam.

## Escopo

### Dentro do escopo

- `DashboardPeriodFilter.tsx`: simplificar para dois seletores mm/aaaa (De/Até), removendo os modos "Todo período"/"Ano corrente"/"Mês atual"/ano avulso.
- `FinanceDashboard.tsx`: estado inicial do período passa a ser o ano corrente completo (jan–dez do ano vigente) em vez do mês atual.
- Novo componente de gráfico de colunas (barras agrupadas Receita × Despesa por mês/ano), reaproveitando `data.serie` já retornada por `fetchDashboardPanorama` — sem mudança de backend.
- `MonthCategoriesOverview.tsx`: remover a condição `overview.profileType === 'empresa'` que esconde o card.
- Script de backfill (SQL revisável, não executado automaticamente) que roda `ensureDefaultCategories(userId, 'empresa')` para todo perfil ativo do tipo `empresa` cujo usuário ainda não tenha nenhuma categoria com `tipo = 'empresa'`.

### Fora do escopo

- Qualquer mudança de schema (`categorias.perfil_id`/`tipo` já existem — plano anterior já implementou isso).
- Selecionar meses não contíguos (ex: Jan + Mar + Jul pulando meses) — o usuário confirmou que quer apenas De/Até mm/aaaa.
- Mudanças nos gráficos de área (`AnnualTrendChart`) e cascata (`MonthWaterfallChart`) — permanecem como estão, o gráfico de colunas é adicional.
- Qualquer ajuste em `CategoriasTab.tsx` ou telas de configuração de categorias.
- Criar categorias padrão de empresa retroativamente para outros usuários além dos que já têm perfil PJ ativo sem essas categorias (o script cobre todos, mas não é uma correção manual caso a caso).

## Leitura de contexto

- `/AGENT.md` e `/sistema financas/AGENT.md` — lidos. Mesma ressalva de sempre: conteúdo genérico de projeto multi-prefeitura/RLS que não se aplica a este domínio; apliquei só as partes de workflow e qualidade de código.
- `frontend/AGENT.md`/`backend/AGENT.md` dedicados não existem neste projeto.
- Arquivos explorados nesta investigação: `FinanceDashboard.tsx`, `DashboardPeriodFilter.tsx`, `AnnualTrendChart.tsx`, `MonthWaterfallChart.tsx`, `MonthCategoriesOverview.tsx`, `useBudgetOverview.ts`, `financeService.ts` (`fetchDashboardPanorama`), `backend/src/services/defaultCategories.ts`, `backend/src/routes/categories.ts`, `backend/src/routes/profiles.ts`, `backend/src/routes/auth.ts`, `backend/src/db/schema/categories.ts`, `queryKeys.ts`, e o plano anterior `.plans/categorias-padrao-vs-custom-por-perfil.md` (já implementado, commit `14cea16`).

## Impacto por área

### Frontend

- `src/screens/finance/DashboardPeriodFilter.tsx` — simplificação da UI para De/Até mm/aaaa.
- `src/screens/finance/FinanceDashboard.tsx` — estado inicial do período (ano corrente); renderização do novo gráfico de colunas.
- Novo arquivo `src/screens/finance/charts/MonthlyComparisonBarChart.tsx` (nome sujeito a ajuste) — gráfico de barras agrupadas Receita × Despesa, no padrão visual dos outros gráficos em `charts/`.
- `src/screens/finance/MonthCategoriesOverview.tsx` — remover restrição de `profileType === 'empresa'`.

### Backend

Sem impacto de rota/endpoint — `fetchDashboardPanorama` já aceita o filtro De/Até no formato necessário. `ensureDefaultCategories` já existe e é reaproveitada como está (idempotente).

### Banco de dados

- Nenhuma mudança de schema.
- Script de dados (não migration de schema) para rodar `ensureDefaultCategories('empresa')` para perfis PJ existentes sem categorias de empresa — a query exata de identificação desses perfis será escrita durante a implementação e revisada antes de qualquer execução.

Atenção: migrations/scripts de dados não devem ser executados sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/DashboardPeriodFilter.tsx`
- `sistema financas/src/screens/finance/FinanceDashboard.tsx`
- `sistema financas/src/screens/finance/charts/MonthlyComparisonBarChart.tsx` (novo)
- `sistema financas/src/screens/finance/MonthCategoriesOverview.tsx`
- Script de backfill (local a definir, ex: `sistema financas/backend/scripts/backfill-empresa-categories.ts` ou SQL avulso revisável)

## Estratégia de implementação

1. Simplificar `DashboardPeriodFilter` para De/Até mm/aaaa; ajustar `describePeriod` conforme necessário.
2. Ajustar estado inicial em `FinanceDashboard.tsx` para abrir no ano corrente (`{ mode: 'ano', ano: THIS_YEAR }` ou equivalente após a simplificação do filtro).
3. Criar o componente de gráfico de colunas (barras agrupadas Receita × Despesa por mês), seguindo o padrão visual/estrutural de `AnnualTrendChart`/`MonthWaterfallChart` (recharts `BarChart`).
4. Inserir o novo gráfico no `FinanceDashboard.tsx`, próximo/complementando a seção "Análise do período" ou a série temporal existente (posição exata a definir durante implementação, mantendo consistência visual).
5. Remover a condição `profileType === 'empresa'` em `MonthCategoriesOverview.tsx`.
6. Escrever o script/SQL de backfill que identifica perfis `tipo = 'empresa'` ativos sem nenhuma categoria `tipo = 'empresa'` para o `usuario_id` correspondente, e chama `ensureDefaultCategories(userId, 'empresa')` para cada um.
7. Rodar build frontend + backend.
8. Parar antes de executar o script de backfill contra o banco — confirmar explicitamente qual `DATABASE_URL`/ambiente está ativo.
9. Teste manual: painel abre no ano corrente; filtro De/Até funciona; gráfico de colunas aparece corretamente; card "Categorias" aparece no perfil PJ após backfill.

## Regras de negócio identificadas

- Painel financeiro deve abrir por padrão mostrando o ano corrente completo.
- Filtro de período do painel deve ser De/Até em granularidade mês/ano apenas.
- Gráfico de colunas compara Receita × Despesa por mês dentro do período filtrado.
- Card de categorias com metas/limites deve aparecer para qualquer tipo de perfil (pessoal ou empresa), não apenas pessoal.
- Categorias padrão de empresa devem existir para todo perfil PJ, independentemente de quando o perfil foi criado.

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant. Pontos relevantes:

- O script de backfill deve operar apenas sobre perfis pertencentes aos `usuario_id` corretos (já garantido pela própria assinatura de `ensureDefaultCategories`, que recebe `userId` explícito).
- `ensureDefaultCategories` é idempotente (`ON CONFLICT DO NOTHING`), reduzindo risco de duplicar categorias em execução repetida.

## Validações necessárias

- Seletores De/Até mm/aaaa: garantir que "De" não seja posterior a "Até" (mesma validação já existente no `IntervalPicker` atual, reaproveitada).
- Script de backfill: validar que só afeta perfis `tipo = 'empresa'` e `ativo = true`, e só quando não há nenhuma categoria `tipo = 'empresa'` já existente para aquele usuário (evitar rodar para quem já tem).

## Testes necessários

### Frontend

- Painel abre no ano corrente ao carregar, sem interação do usuário.
- Filtro De/Até mm/aaaa aplica corretamente e reflete no gráfico de colunas e nos demais cards.
- Gráfico de colunas renderiza Receita × Despesa corretamente para múltiplos meses.
- Card "Categorias" aparece no perfil PJ quando há categorias com metas/gastos no período.

### Backend

Não aplicável (sem mudança de rota).

### E2E

- Perfil PJ sem categorias de empresa → rodar backfill → card "Categorias" passa a exibir as 14 categorias padrão de empresa.
- Rodar o backfill duas vezes seguidas não duplica categorias (idempotência).

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- **Confirmar banco-alvo antes de qualquer execução do backfill** — mesmo risco já sinalizado no plano anterior (`.env` local pode estar apontando para produção real).
- Simplificar o filtro para só De/Até mm/aaaa remove os atalhos "Todo período" e "Mês atual" — se algum outro fluxo do painel depender desses modos específicos (`mode: 'tudo'` ou `mode: 'mes'` com comportamento distinto, como `singleMonth` em `FinanceDashboard.tsx` que ativa cards de "Contratos"/"Parcelas futuras" só quando o período colapsa a um único mês), a lógica de detecção de "mês único" precisa continuar funcionando quando De = Até no novo seletor simplificado.
- Card "Categorias" passando a aparecer em PJ pode revelar categorias sem metas definidas ainda (todas "sem meta") — comportamento esperado, mas vale conferir visualmente após o backfill.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` — decisões sobre exibição do card em PJ e forma do backfill já confirmadas.

## Critérios de aceite do plano

- Painel abre no ano corrente por padrão, sem exigir interação do usuário.
- Filtro De/Até mm/aaaa funcional, substituindo os modos anteriores.
- Gráfico de colunas Receita × Despesa por mês visível e correto no painel.
- Card "Categorias" aparece também no perfil PJ.
- Perfis PJ existentes recebem as 14 categorias padrão de empresa após o backfill (executado só com confirmação explícita).
- Builds frontend e backend passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Antes de executar o script de backfill contra o banco, confirmar explicitamente qual `DATABASE_URL`/ambiente está ativo.
- Preservar a lógica de `singleMonth` em `FinanceDashboard.tsx` (cards de Contratos/Parcelas futuras) ao simplificar o filtro — ela deve continuar detectando quando De = Até.
- Manter alterações restritas aos arquivos listados; não tocar em `CategoriasTab.tsx` ou telas de configuração.
