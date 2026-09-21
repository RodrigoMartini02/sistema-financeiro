# Plano de Implementação: Refazer cards de resumo em Movimentações

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md`), consolidada após a remoção do mecanismo de fechar mês
- Data do planejamento: 2026-09-20
- Classificação: `frontend + backend`

## Resumo

Substitui os 4 cards atuais de Movimentações (Saldo atual, Despesas, Saldo projetado, Comprometimento) pelos 5 cards definidos ao longo desta conversa: Saldo Anterior, Receita do Mês, Despesa do Mês, Resultado do Mês (lançado) e Saldo Atual (descontando só despesas já pagas). Corrige a ambiguidade entre "lançado" e "pago" que motivou toda a investigação anterior sobre os cards, remove o card Comprometimento (redundante — era só uma razão entre dois números já visíveis) e o card Saldo Projetado (pertence a outra pergunta, de planejamento, não de conferência do mês), e unifica a fonte de dados dos cards em `dashboard.balance` (saldo do mês exato selecionado), removendo a dependência do dashboard anual nesta tela.

## Escopo

### Dentro do escopo

- Backend: expor `despesasPagas` no retorno de `GET /meses/:ano/:mes/saldo`, calculado dentro da mesma query que já soma despesas do mês em `balanceService.ts` (um `SUM` condicional adicional, sem query nova).
- Frontend: adicionar `despesasPagas` ao tipo `MonthBalance` e ao mapeamento em `financeService.ts` (`fetchMonthBalance`).
- Frontend: substituir a grade de 4 cards em `MovimentacoesScreen.tsx` pelos 5 novos, usando `dashboard.balance` como fonte única de dados.
- Frontend: remover o hook `annual` (useQuery de `fetchDashboardAnual`), o import correspondente, e ajustar o `ErrorState` combinado para usar só `finance.dashboard.error`, já que `annual` fica sem nenhum outro consumidor neste arquivo após a mudança.
- Ajustar rótulos, tons e notas dos 5 cards conforme definido nesta conversa.
- Ajustar a classe do grid de `md:grid-cols-2 xl:grid-cols-4` para `md:grid-cols-3 xl:grid-cols-5`.

### Fora do escopo

- `BudgetPanel.tsx` (aba Planejamento) ou o painel/dashboard financeiro principal — mesmo que usem terminologia parecida ("saldo").
- Faixa de limite de cartões (exibida logo abaixo da grade de cards).
- `DashboardAnualMes`/`fetchDashboardAnual` em si — a função e o tipo continuam existindo em `financeService.ts` para uso por outras telas; só deixam de ser chamados dentro de `MovimentacoesScreen.tsx`.
- Correção de dados legados no banco.
- Qualquer nova permissão ou regra de visibilidade de carteira compartilhada.

## Leitura de contexto

- `AGENT.md` (raiz) e `sistema financas/CLAUDE.md` — já lidos em sessões anteriores desta conversa; mesmas regras de fluxo `/planejar → aprovação → /implementar → /finalizar` se aplicam.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- `.plans/remover-mecanismo-fechar-mes.md` — plano anterior, já implementado e em produção, que criou `backend/src/services/balanceService.ts` (base desta mudança) e removeu a dependência do saldo em um snapshot manual.
- Arquivos revisados nesta sessão de planejamento: `src/screens/finance/MovimentacoesScreen.tsx`, `src/screens/finance/MovementMetricCard.tsx`, `backend/src/services/balanceService.ts`, `backend/src/routes/months.ts`, `src/types/finance.ts` (`MonthBalance`), `src/services/financeService.ts` (`fetchMonthBalance`, `DashboardAnualMes`, `fetchDashboardAnual`).
- Confirmado por busca nesta sessão: `annual`/`annualMonth` são usados em `MovimentacoesScreen.tsx` apenas nas linhas de cálculo dos cards antigos (`receitasMes`, `despesasMes`) e no `ErrorState` combinado — nenhum outro trecho deste arquivo depende deles.
- Confirmado: não há testes automatizados de backend cobrindo `balanceService.ts`/`months.ts` (mesmo padrão de ausência de suíte já observado em planos anteriores desta área).

## Impacto por área

### Frontend

- **`src/types/finance.ts`**: `MonthBalance` ganha o campo `despesasPagas: number`.
- **`src/services/financeService.ts`**: `fetchMonthBalance` passa a mapear o novo campo `despesas_pagas` (vindo do backend) para `despesasPagas` no objeto `MonthBalance` retornado.
- **`src/screens/finance/MovimentacoesScreen.tsx`**:
  - Remove o `useQuery` de `annual`, o import de `fetchDashboardAnual`, e o uso de `queryKeys.dashboardAnual`.
  - Remove as variáveis `annualMonth`, `comprometimento`, `saldoProjetado`.
  - Deriva os 5 valores diretamente de `dashboard.balance` (`finance.dashboard.data?.balance`):
    - `saldoAnterior = dashboard?.balance.saldoAnterior ?? 0`
    - `receitasMes = dashboard?.balance.receitas ?? 0`
    - `despesasMes = despesasSummary?.active ? despesasSummary.total : (dashboard?.balance.despesas ?? 0)` (mantém o comportamento atual de refletir filtro ativo da tabela de Despesas)
    - `resultadoMes = receitasMes - despesasMes`
    - `saldoAtual = saldoAnterior + receitasMes - (dashboard?.balance.despesasPagas ?? 0)`
  - `ErrorState` passa a exibir apenas `finance.dashboard.error` (sem mais combinar com `annual.error`).
  - Grade de 5 `MovementMetricCard`, nesta ordem:
    1. **Saldo Anterior** — `tone` dinâmico (`income` se ≥ 0, `expense` se negativo), valor `formatCurrency(saldoAnterior)`, sem `note`.
    2. **Receita do Mês** — `tone="income"`, valor `formatCurrency(receitasMes)`, `note` com contagem de lançamentos de receita (mesmo padrão de nota já usado no card atual "Despesas").
    3. **Despesa do Mês** — `tone="expense"`, valor `formatCurrency(despesasMes)`, `note` reaproveitando `despesasSummary` (contagem filtrada ou total), igual ao comportamento atual do card "Despesas".
    4. **Resultado do Mês** — `tone` dinâmico conforme sinal, valor `formatCurrency(resultadoMes)`, `note` deixando explícito que é "lançado" (ex.: "Receita − Despesa lançada no mês"), para não ser confundido com o card seguinte.
    5. **Saldo Atual** — `tone` dinâmico conforme sinal, valor `formatCurrency(saldoAtual)`, `note` explicando a composição (ex.: "Saldo anterior X + Receitas Y − Despesas pagas Z").
  - Ajusta a classe do grid de cards para `md:grid-cols-3 xl:grid-cols-5`.
- Sem novos estados de loading/error além dos já existentes (`finance.dashboard.isLoading`/`.error`).
- Sem novas query keys.

### Backend

- **`backend/src/services/balanceService.ts`**: `calculateBalanceBreakdown` (e a interface `BalanceBreakdown`) ganham o campo `paidExpenses`, calculado com uma expressão `SUM` condicional (`CASE WHEN pago THEN ... END`) dentro da mesma query que já soma despesas do mês — sem introduzir uma query adicional nem N+1.
- **`backend/src/routes/months.ts`**: `GET /:ano/:mes/saldo` inclui `despesas_pagas: paidExpenses` no JSON de resposta, ao lado dos campos já existentes (`saldo_anterior`, `receitas`, `despesas`, `saldo_final`).
- Nenhuma rota nova, nenhuma mudança de contrato além da adição de um campo.
- Nenhuma mudança em `financial.ts` — o resumo anual (`/anual`) não é tocado por este plano.

### Banco de dados

`Sem impacto esperado` — nenhuma mudança de schema, tabela, coluna ou migration.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/services/balanceService.ts`
- `backend/src/routes/months.ts`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/finance/MovimentacoesScreen.tsx`

## Estratégia de implementação

1. Backend: adicionar `paidExpenses` em `calculateBalanceBreakdown`/`BalanceBreakdown` (`balanceService.ts`).
2. Backend: expor `despesas_pagas` na resposta de `GET /:ano/:mes/saldo` (`months.ts`).
3. Frontend: adicionar `despesasPagas` a `MonthBalance` (`types/finance.ts`) e ao mapeamento em `fetchMonthBalance` (`financeService.ts`).
4. Frontend: em `MovimentacoesScreen.tsx`, remover `annual`/`annualMonth`/`comprometimento`/`saldoProjetado`, derivar os 5 valores de `dashboard.balance`, e reescrever a grade de cards com os 5 novos, na ordem definida.
5. Ajustar `ErrorState` para usar só `finance.dashboard.error`.
6. Rodar `npx tsc --noEmit` (backend e frontend) e `npx vite build`.
7. Validação manual: conferir os 5 valores com um mês de dados conhecidos; testar um mês com despesas em aberto (Saldo Atual deve diferir de Resultado do Mês) e um mês totalmente pago (os dois devem coincidir, descontado o saldo anterior).

## Regras de negócio identificadas

- "Receita do Mês" e "Despesa do Mês" somam tudo que foi lançado no mês, independente de status de pagamento.
- "Resultado do Mês" é sempre Receita do Mês menos Despesa do Mês — resultado lançado, não considera se foi pago.
- "Saldo Atual" desconta apenas despesas já pagas do mês, nunca as em aberto — representa o dinheiro real disponível agora.
- Nenhum dos 5 cards depende mais do dashboard anual; todos usam o saldo do mês exato selecionado.
- O card "Despesa do Mês" continua refletindo um filtro ativo na tabela de Despesas abaixo, exatamente como o card "Despesas" já faz hoje.

## Regras multi-tenant e segurança

Projeto não é multi-tenant. A nova soma de `paidExpenses` reaproveita exatamente o mesmo filtro de `usuario_id`/`accountId` (via `accountWhere`) já usado na query de despesas do mês em `balanceService.ts` — nenhuma mudança de escopo de acesso ou exposição de dado novo além do valor agregado já visível ao usuário dono dos lançamentos.

## Validações necessárias

Nenhuma validação de input nova é introduzida — mudança de cálculo e leitura de dados já existentes, sem novo formulário ou payload de usuário.

## Testes necessários

### Frontend

- Validação manual: os 5 cards aparecem na ordem correta (Saldo Anterior, Receita do Mês, Despesa do Mês, Resultado do Mês, Saldo Atual), com valores batendo com os dados do mês selecionado.
- Validação manual: em um mês com despesas não pagas, "Saldo Atual" é maior que "Resultado do Mês" descontado do saldo anterior (porque não desconta as despesas em aberto).
- Validação manual: trocar de mês recalcula os 5 cards sem exigir reload da página.
- Validação manual: aplicar um filtro na tabela de Despesas altera apenas o card "Despesa do Mês", sem afetar os demais.

### Backend

- Validação manual: `GET /meses/:ano/:mes/saldo` retorna `despesas_pagas` correto, comparando com a soma manual das despesas pagas daquele mês/conta.

### E2E

Não aplicável — não há suíte E2E no projeto.

## Comandos de validação sugeridos

```bash
cd backend
npx tsc --noEmit

cd "sistema financas"
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Remover a dependência de `annual` nesta tela elimina uma requisição de rede a cada troca de mês/ano — mudança positiva de performance, mas vale confirmar visualmente que nenhum comportamento indireto (ex.: pré-aquecimento de cache do React Query usado por outra tela que também consulta `queryKeys.dashboardAnual`) dependia desse fetch acontecer aqui.
- `despesasSummary` (filtro ativo na tabela de Despesas) continua afetando só o card "Despesa do Mês" — os demais 4 cards sempre representam o mês inteiro, sem filtro, mesmo comportamento de hoje.
- O campo `despesas_pagas` é novo na resposta de `/saldo` — qualquer outro consumidor futuro dessa rota que não conheça o campo simplesmente o ignora (aditivo, não quebra contrato existente).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões de fonte de dados (`dashboard.balance` única) e remoção do hook `annual` foram confirmadas nesta sessão de planejamento.

## Critérios de aceite do plano

- A grade de Movimentações exibe exatamente 5 cards, nesta ordem: Saldo Anterior, Receita do Mês, Despesa do Mês, Resultado do Mês, Saldo Atual.
- "Saldo Atual" desconta apenas despesas pagas do mês, nunca despesas em aberto.
- Nenhum card depende mais do dashboard anual (`annual`/`annualMonth` removidos de `MovimentacoesScreen.tsx`).
- `npx tsc --noEmit` (backend e frontend) e `npx vite build` passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nenhuma migration prevista neste plano.
- Seguir `CLAUDE.md` da raiz e de `sistema financas/`.
- Não remover `fetchDashboardAnual`/`DashboardAnualMes`/`queryKeys.dashboardAnual` do projeto — apenas o uso específico dentro de `MovimentacoesScreen.tsx`, já que essas funções/tipos podem servir outras telas.
- Manter alterações pequenas e focadas nos arquivos listados.
