# Plano de Implementação: Painel financeiro — panorama completo com filtro de período próprio

## Origem

- Arquivo de especificação: `.plans/tasks/painel-panorama-financeiro-sem-filtro-global.md`
- Data do planejamento: `2026-08-19`
- Classificação: `frontend + backend`

## Resumo

O Painel financeiro deixa de depender do seletor de mês/ano global do cabeçalho
e ganha filtro de período próprio (mês / ano / intervalo de-até / todo o
período), mostrando a real situação financeira consolidada do usuário. Os
gráficos e KPIs existentes (receitas, despesas, saldo, comprometimento,
cascata, donuts de categoria/forma de pagamento/origem) passam a somar sobre o
período filtrado, sem mudança de forma — apenas o gráfico de barras "Receitas
× Despesas × Saldo" precisa decidir se cada barra representa um mês ou um ano,
conforme o tamanho do intervalo (automático, corte em ~24 meses). O seletor de
período do cabeçalho é removido do app inteiro; a tela de Movimentações (que
usa "mês" estruturalmente para fechar/reabrir mês e lançar) passa a controlar
seu próprio período local, sem depender mais de contexto global.

## Escopo

### Dentro do escopo

- Novo endpoint de backend para totais/série agregados por intervalo de datas
  (`de`/`ate`), com granularidade automática mês/ano na série de barras.
- Remoção de `month`/`year` do `AppContext` global.
- `MovimentacoesScreen` ganha state local de período (`useState`), repassado
  para `ReceitasScreen`/`DespesasScreen` (que já são views internas dela, não
  rotas próprias).
- `NotificationPanel` e `FinancialAssistant` passam a usar o mês corrente real
  (hoje), fixo, sem seletor.
- `FinanceDashboard` reescrito: filtro de período próprio, padrão = ano
  corrente; KPIs/cascata/donuts consumindo totais do período filtrado;
  gráfico de barras com granularidade automática.

### Fora do escopo

- Cálculo/lançamento automático de impostos para perfil PJ (MEI/ME/etc.) —
  lacuna identificada durante o planejamento (ver seção "Observação
  registrada"), fica para tarefa futura separada por decisão do usuário.
- Qualquer alteração em `escalacao futebol`.
- Migrations de schema (não são necessárias — sem tabela nova).

## Leitura de contexto

- `sistema financas/AGENT.md` — lido. É um template genérico de projeto
  multi-tenant/prefeitura com Drizzle; não reflete a realidade deste projeto
  (app financeiro single-user com `usuario_id`/`perfil_id`, backend usa
  `pool.query` raw SQL, não Drizzle, para as rotas de dashboard). A
  implementação segue o padrão real do código existente (raw SQL
  parametrizado com `usuario_id`/`perfil_id`, como em `financial.ts`) em vez
  do template, mantendo o espírito das regras (sempre filtrar por
  usuário/perfil, nunca confiar em ID vindo do client sem validar sessão).
- Não existe `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos
  separados neste projeto — só o `AGENT.md` da raiz.
- `.plans/tasks/painel-panorama-financeiro-sem-filtro-global.md` (spec de
  origem, criada nesta sessão).
- Arquivos de código lidos: `src/screens/finance/FinanceDashboard.tsx`,
  `src/hooks/useFinanceDashboard.ts`, `src/context/AppContext.tsx`,
  `src/layout/AppShell.tsx`, `src/screens/finance/MovimentacoesScreen.tsx`,
  `src/services/financeService.ts`, `src/services/queryKeys.ts`,
  `src/types/finance.ts`, `backend/src/routes/financial.ts`,
  `backend/src/db/schema/profiles.ts`, `backend/src/db/schema/reserves.ts`,
  `backend/src/services/budgetService.ts`.

## Impacto por área

### Frontend

- `src/context/AppContext.tsx`: remove `month`, `year`, `setMonth`,
  `setYear`, `setPeriod`.
- `src/layout/AppShell.tsx`: remove o componente `PeriodSelector` do header;
  `NotificationPanel` passa a usar `new Date()` fixo em vez do contexto.
- `src/screens/finance/MovimentacoesScreen.tsx`: `useState` local de
  `month`/`year` (inicia no mês/ano atual real); passa a repassar
  `month`/`year` (e setters, se necessário) para `ReceitasScreen`/
  `DespesasScreen` via props, no lugar do contexto global.
- `src/screens/receitas/ReceitasScreen.tsx`,
  `src/screens/despesas/DespesasScreen.tsx`: trocam `useAppContext()` por
  props recebidas de `MovimentacoesScreen`.
- `src/components/financial-assistant/FinancialAssistant.tsx`: usa mês/ano
  corrente real fixo em vez do contexto global.
- `src/screens/finance/FinanceDashboard.tsx`: reescrito com filtro de
  período próprio (novo componente de UI: mês / ano / intervalo de-até /
  todo o período), consumindo o novo endpoint de panorama. KPIs, cascata e
  donuts passam a consumir totais agregados do período filtrado.
- `src/screens/finance/charts/AnnualTrendChart.tsx`: generaliza para aceitar
  N pontos, rotulados por mês ou por ano conforme a granularidade recebida
  do backend.
- Novo componente: filtro de período do Painel (mês / ano / intervalo /
  tudo).
- `src/services/financeService.ts`, `src/services/queryKeys.ts`: nova
  função de fetch + query key para o endpoint de panorama.

Estados de loading/error/empty devem seguir o padrão já usado no Painel
(`ErrorState`, skeletons/"Carregando..." já presentes nos cards existentes).

### Backend

- `backend/src/routes/financial.ts`: novo endpoint (ex:
  `GET /api/financial/panorama`) aceitando `de_mes`/`de_ano`/`ate_mes`/
  `ate_ano` (todos opcionais — ausência de todos = todo o histórico do
  usuário). Retorna:
  - Totais do período: receitas, despesas, saldo inicial (saldo acumulado
    antes do início do período filtrado), saldo final, total de
    lançamentos, primeira e última data com lançamento.
  - Breakdown por categoria, forma de pagamento e origem (contrato vs.
    avulsa) — reaproveitando os `LEFT JOIN`s já usados em `/anual`, trocando
    o filtro `ano = $1` por um filtro de intervalo de datas
    (ano/mês combinados).
  - Série para o gráfico de barras, agregada por mês quando o intervalo tiver
    até ~24 meses, ou por ano quando for maior — decidido e calculado no
    próprio SQL.
- Segue o padrão do endpoint `/anual` já existente: `pool.query` com SQL
  parametrizado, sempre filtrando por `usuario_id` (obtido de `req.user!.id`,
  nunca do client) e `perfil_id` opcional vindo de query string, replicando a
  mesma lógica de fallback de perfil pessoal usada hoje.
- Middleware `authenticate` + `requireActivePlan`, iguais aos já usados nas
  rotas de `financial.ts`.

### Banco de dados

Sem impacto esperado. Nenhuma tabela ou coluna nova — apenas query nova sobre
tabelas já existentes (`receitas`, `despesas`, `meses`, `perfis`).

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção. Como este
plano não inclui migrations, essa nota é apenas preventiva.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/routes/financial.ts`
- `src/context/AppContext.tsx`
- `src/layout/AppShell.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/services/financeService.ts`
- `src/services/queryKeys.ts`
- `src/screens/finance/charts/AnnualTrendChart.tsx`

## Estratégia de implementação

1. Backend: criar endpoint de panorama (`GET /api/financial/panorama`) com
   totais + breakdown + série (mês/ano automático), seguindo o padrão SQL de
   `/anual`.
2. Frontend: adicionar fetch (`financeService.ts`) e query key
   (`queryKeys.ts`) para o novo endpoint.
3. `AppContext.tsx`: remover `month`/`year`/`setMonth`/`setYear`/`setPeriod`
   globais.
4. `AppShell.tsx`: remover `PeriodSelector` do header; ajustar
   `NotificationPanel` para usar data corrente fixa.
5. `MovimentacoesScreen.tsx`: introduzir state local de período; repassar
   para `ReceitasScreen`/`DespesasScreen` via props.
6. `FinancialAssistant.tsx`: usar mês/ano corrente fixo.
7. `FinanceDashboard.tsx`: implementar novo componente de filtro de período
   e reescrever KPIs/cascata/donuts para consumir totais do período
   filtrado, mantendo o layout visual atual dos cards.
8. `AnnualTrendChart.tsx`: generalizar rótulos de eixo para mês ou ano
   conforme granularidade recebida.
9. Validar manualmente os fluxos afetados (ver seção de testes) e rodar os
   comandos de validação.

## Regras de negócio identificadas

- Filtro padrão do Painel ao abrir: ano corrente.
- Granularidade da série de barras: mês se o intervalo filtrado tiver ≤24
  meses, ano se for maior — decidido automaticamente pelo backend, sem
  controle manual do usuário.
- KPIs, cascata e donuts sempre mostram totais agregados do período
  filtrado, nunca sub-divididos — não têm granularidade.
- "Saldo anterior" na cascata passa a significar "saldo acumulado antes do
  início do período filtrado", não mais "mês anterior ao mês selecionado".
- Movimentações mantém o conceito de "um mês por vez" para fechar/reabrir
  mês e lançar receitas/despesas — não afetado pela remoção do contexto
  global; apenas a origem do state muda de global para local à tela.

## Regras multi-tenant e segurança

Este projeto não é multi-tenant no sentido do `AGENT.md` genérico (não há
prefeituras/tenants) — o equivalente aqui é isolamento por usuário e por
perfil (`usuario_id`/`perfil_id`).

- Toda query do novo endpoint filtra por `usuario_id` vindo da sessão
  autenticada (`req.user!.id`), nunca aceito diretamente do client.
- `perfil_id`, quando informado via query string, é validado exatamente como
  já ocorre em `/anual` (checagem de posse do perfil pelo usuário autenticado
  via fallback de perfil pessoal).
- Nenhuma mudança introduz acesso a dados de outro usuário; o padrão de
  isolamento já existente é replicado, não alterado.

## Validações necessárias

- Backend: validar que `de_mes`/`de_ano`/`ate_mes`/`ate_ano`, quando
  informados, formam um intervalo coerente (`de` não pode ser depois de
  `ate`); anos dentro de uma faixa razoável (mesma faixa 2000–2100 já usada
  em `/anual`).
- Frontend: filtro de período do Painel deve impedir estados inválidos (ex:
  "de" depois de "até") na própria UI, além da validação do backend.

## Testes necessários

### Frontend

- Painel abre no ano corrente por padrão.
- Trocar para mês específico, ano específico, intervalo de-até e "todo o
  período" — KPIs e gráficos refletem corretamente os totais do período.
- Movimentações: fechar/reabrir mês, lançar receita/despesa, navegação por
  calendário — continuam funcionando com state local de período.
- Notificações e Assistente financeiro continuam funcionando com mês
  corrente fixo, sem regressão.

### Backend

- Endpoint de panorama: intervalo de 1 mês, de 1 ano, multi-ano (>24 meses),
  e sem parâmetros (todo o histórico).
- Isolamento por `usuario_id`/`perfil_id` mantido (usuário A não vê dados do
  usuário B).

### E2E

- Fluxo completo: abrir Painel → trocar filtro de período → ver dados
  mudarem → ir para Movimentações → lançar despesa → voltar ao Painel → ver
  refletido no período correspondente.

## Comandos de validação sugeridos

```bash
npm run lint
npm run typecheck
npm run build

npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend run build
```

## Riscos e pontos de atenção

- Mudança cross-cutting no contexto global — risco de esquecer algum
  consumidor de `month`/`year` durante a migração.
- `MovimentacoesScreen` é a tela mais acoplada ao conceito de mês (fechar/
  reabrir mês é uma operação inerentemente mensal) — maior atenção ao migrar
  de contexto global para state local sem quebrar esse fluxo.
- Nova query de intervalo longo deve ser validada quanto a performance
  (índices existentes em `ano`/`usuario_id` devem cobrir os casos comuns,
  mas vale checar em históricos grandes).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões de escopo foram
resolvidas durante o planejamento (filtro dentro do Painel, padrão ano
corrente, sem controle manual de granularidade, lacuna de imposto PJ fora de
escopo).

## Observação registrada (fora de escopo)

Durante o planejamento foi identificada uma lacuna de dado para perfis PJ:
não há cálculo, lançamento ou lembrete de imposto/tributação (DAS, Simples
Nacional, etc.) vinculado ao `enquadramento` do perfil empresa
(`MEI | ME | EPP | SLU | EIRELI | LTDA | SA`, ver
`backend/src/db/schema/profiles.ts`). Isso pode fazer o saldo do Painel
parecer mais otimista do que a realidade para usuários PJ, já que uma
obrigação previsível não é descontada automaticamente. Por decisão do
usuário, isso fica fora deste plano e deve virar uma tarefa própria no
futuro.

## Critérios de aceite do plano

- Seletor de período global não existe mais em nenhuma tela do app.
- Painel mostra filtro de período próprio (mês/ano/intervalo/tudo), com
  padrão de ano corrente ao abrir.
- Todos os gráficos e KPIs do Painel refletem corretamente o período
  filtrado, incluindo intervalos multi-ano.
- Movimentações continua funcionando integralmente (fechar/reabrir mês,
  lançamentos, calendário) com period state local.
- Nenhuma regressão observável em Notificações ou Assistente financeiro.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations sob nenhuma circunstância (não são necessárias
  neste plano).
- Seguir o padrão de código real já existente no projeto (raw SQL
  parametrizado no backend, React Query + query keys no frontend), não o
  template genérico do `AGENT.md` da raiz.
- Manter alterações pequenas e focadas por etapa, seguindo a ordem da
  "Estratégia de implementação".
- Preservar o layout visual atual dos cards do Painel sempre que possível —
  a mudança é de fonte de dados e filtro, não de redesign visual.
- Ao alterar `MovimentacoesScreen.tsx`, testar manualmente fechar/reabrir
  mês antes de considerar a etapa concluída.
