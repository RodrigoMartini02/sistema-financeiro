# Plano de Implementação: Laço de render da tabela de Lançamentos

## Origem

- Arquivo de especificação: nenhum `.md`. O diagnóstico é de 2026-10-02 e saiu de uma reprodução jsdom, `repro_lancamentos_loop.mts` no scratchpad da sessão. Com os callbacks iguais aos da tela real, ela mediu 225 renders em 1,5 s, com o aviso "Maximum update depth exceeded"; sem os callbacks, 1 render. O item estava aberto desde o plano de permissões. As 3 decisões estão abaixo.
- Data do planejamento: `2026-10-02`
- Classificação: `frontend-only`. Servidor e banco não mudam.

## Resumo

Na aba Lançamentos de Movimentações, em modo lista, a tela renderiza sem parar. A causa está em dois efeitos da `LancamentosTable` (commit `596ceb3a`, de 2026-09-20):

- **Efeito do resumo** (`LancamentosTable.tsx:389`): depende de `expensesFiltered`, uma lista nova a cada render. Ele roda depois de todo render e manda um objeto novo para `setDespesasSummary` da `MovimentacoesScreen`. O pai renderiza, a tabela renderiza, e o ciclo recomeça.
- **Efeito dos dados** (`LancamentosTable.tsx:379`): enquanto o dashboard carrega, `?? []` cria uma lista nova a cada render. O laço é curto, mas não termina se a consulta falhar.

O plano faz três coisas:

- leva a filtragem das despesas para uma função pura compartilhada, e o pai passa a calcular o resumo sozinho, o que elimina o efeito do resumo;
- faz o efeito dos dados depender do resultado da consulta, que é estável;
- faz o efeito dos dados enviar só o que o pai usa.

## Decisões registradas

- **Decisão 1:** abordagem maior. A filtragem vai para uma função compartilhada, o pai calcula o resumo, e o efeito do resumo sai.
- **Decisão 2:** o efeito dos dados (`onDataLoaded`) continua, com dependência estável, e envia só `formas` e `cartoes`. Relatórios não muda de comportamento.
- **Decisão 3:** a proteção é um teste unitário permanente da função de filtro, em `src/utils/`, mais a reprodução jsdom local. Nenhuma dependência nova.

## Escopo

### Dentro do escopo

- **Novo `src/utils/expenseFilters.ts`:**
  - **`filterExpenses(expenses, filters, visibility, month, year, referenceDates)`.** Usa a mesma regra de hoje e cobre:
    - tipo (sem `despesa`, devolve lista vazia);
    - status;
    - categoria;
    - forma de pagamento;
    - cartão;
    - data de pagamento (hoje, semana, mês);
    - visibilidade: quem paga está marcado, ou quem cadastrou é o usuário logado e está marcado. Com `meId` ainda carregando, nada é escondido.
  - **`getExpenseStatus`**, que sai da `LancamentosTable`.
  - **Os tipos dos filtros, com nomes em inglês** (regra de código em inglês do `AGENT.md`): `TipoLancamento` → `EntryType`, `FiltroStatus` → `ExpenseStatus`, `FiltroDataPag` → `PaymentDateWindow`.
  - **`referenceDates` (`{ today, weekAgo }`):** o padrão é o dia atual, com `getLocalTodayIso()` e `daysAgoLocalIso(7)`, para o teste ser determinístico. "7 dias atrás" passa a ser calculado no horário local; hoje é em UTC e pode errar por um dia depois das 21h.
- **`LancamentosTable`:**
  - usa `filterExpenses` e `getExpenseStatus` do util;
  - perde a prop `onFilteredSummaryChange` e o efeito do resumo;
  - o efeito dos dados depende de `finance.dashboard.data` e de `onDataLoaded`, e envia `{ formas, cartoes }`;
  - saem os dois `eslint-disable`.
  - A prop `hasFilter` continua, porque o estado vazio a usa.
- **`MovimentacoesScreen`:**
  - sai o estado `despesasSummary`; o resumo vira um `useMemo` com `filterExpenses` sobre `finance.dashboard.data`, a mesma consulta da tabela, só quando `filters.hasActiveFilters`;
  - `tableData` passa a ter só `{ formas, cartoes }`.
- **`useEntryFilters.ts` e `ReportsScreen.tsx`:** só mudam a importação e o nome dos tipos.

### Fora do escopo

- **Tirar o `onDataLoaded`:** o `useEntryFilters`, compartilhado com Relatórios, recebe formas e cartões quando é chamado. A consulta do pai depende do escopo da família, que sai desse mesmo hook, e isso forma uma dependência circular.
- **Filtragem das receitas:** continua na tabela.
- **Os efeitos com `eslint-disable` em `AppShell.tsx:304` e `painel/base.tsx:48`:** dependem de uma chave primitiva. Foram conferidos e não entram em laço.
- **Teste permanente de renderização com jsdom e Testing Library.**
- **Funções de status parecidas em `calendar/calendarStatus.ts` e `despesas/expenseStatus.tsx`.**

## Leitura de contexto

- **Regras:**
  - `/AGENT.md`, inclusive "English-Only Codebase" e a regra de renomear o legado quando o módulo é refeito;
  - `/CLAUDE.md`;
  - `/frontend/AGENT.md` não existe.
- **Arquivos do projeto:**
  - `src/screens/finance/LancamentosTable.tsx`: efeitos nas linhas 379 e 389, filtragem nas linhas 316–346, tipos nas linhas 28–30 e `getExpenseStatus` na linha 37;
  - `src/screens/finance/MovimentacoesScreen.tsx`: `tableData` na linha 110, `despesasSummary` nas linhas 113, 134 e 222, `useFinanceDashboard` na linha 128, props da tabela nas linhas 256–273;
  - `src/screens/finance/useEntryFilters.ts`;
  - `src/screens/reports/ReportsScreen.tsx`;
  - `src/hooks/useFinanceDashboard.ts`;
  - `src/utils/date.ts` (`getLocalTodayIso`, `daysAgoLocalIso`).
- **Testes:** o `npm test` roda `src/utils/*.test.ts` e os testes dos diálogos de despesa e de receita.

## Impacto por área

### Frontend

- **Movimentações:**
  - a tela fica igual, sem o laço;
  - com filtro ativo, o card "Despesa do mês" passa a acompanhar os filtros em qualquer visão. Hoje, com a tabela fora da tela (calendário ou orçamento), ele fica parado no último valor.
- **Relatórios:** só o nome dos tipos muda.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- Novos:
  - `src/utils/expenseFilters.ts`
  - `src/utils/expenseFilters.test.ts`
- `src/screens/finance/LancamentosTable.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/useEntryFilters.ts`
- `src/screens/reports/ReportsScreen.tsx`

## Estratégia de implementação

**Fase 0 — Branch**

1. Atualizar a `main` e criar `fix/R/laco-render-lancamentos`.

**Fase 1 — Remover**

2. Na tabela, remover:
   - o efeito do resumo e a prop `onFilteredSummaryChange`;
   - o efeito dos dados atual, com os dois `eslint-disable`;
   - a filtragem de despesas feita ali;
   - `getExpenseStatus`;
   - os tipos dos filtros.
3. No pai, remover o estado `despesasSummary`, o `setDespesasSummary` passado à tabela e os campos `expenses` e `incomes` de `tableData`.

**Fase 2 — Aplicar**

4. Criar `src/utils/expenseFilters.ts` e `expenseFilters.test.ts`.
5. Na tabela, usar `filterExpenses` e `getExpenseStatus` do util e criar o novo efeito dos dados. O tipo de `onDataLoaded` ganha um comentário: o callback precisa ser estável.
6. No pai, calcular o resumo com `useMemo` (total, contagem e `active`) a partir de `finance.dashboard.data`, `filters.state`, `meIdStr`, `nomesVisiveis`, mês e ano.
7. Em `useEntryFilters.ts` e `ReportsScreen.tsx`, trocar a importação e os nomes dos tipos.

**Fase 3 — Validar**

8. Rodar `npx tsc --noEmit`, `npm test` e `npm run build`.
9. Fumaça jsdom da `MovimentacoesScreen` real, com `fetch` simulado e sem backend:
   - no máximo 5 renders em 1,5 s e nenhum aviso "Maximum update depth";
   - sem filtro, o card "Despesa do mês" mostra o total do mês;
   - com um filtro de status aplicado pelo painel, mostra o total filtrado e "N lançamento(s) filtrado(s)".
10. Reprodução isolada da tabela (`repro_lancamentos_loop.mts`): no máximo 5 renders e nenhum aviso.

## Regras de negócio identificadas

- O resumo filtrado soma o `valorFinal` das despesas que passam nos filtros. Ele só vale com filtro ativo; sem filtro, o card mostra o total de despesas do mês, como hoje.
- Uma despesa aparece para quem paga e para quem a cadastrou, se o nome estiver marcado no filtro de pessoas. É a mesma regra de hoje.
- Desmarcar "despesa" no tipo zera a lista e o resumo.

## Regras multi-tenant e segurança

Sem mudança. Os dados vêm da mesma consulta, filtrada no servidor pela conta.

## Validações necessárias

Nenhuma validação de entrada nova. É filtragem de dados que já chegaram ao front.

## Testes necessários

### Frontend

- **`filterExpenses`, com datas fixas:**
  - sem filtro, passam todas;
  - sem "despesa" no tipo, a lista fica vazia;
  - status (pago, em dia, atrasada);
  - categoria;
  - forma de pagamento;
  - cartão;
  - data de pagamento (hoje, semana, mês);
  - visibilidade por quem paga e por quem cadastrou, inclusive com `meId` ainda carregando.
- **`getExpenseStatus`.**
- **Fumaça jsdom** do passo 9.

### Backend

- Nenhum.

### E2E

- Fumaça e reprodução locais.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
```

## Riscos e pontos de atenção

- **Divergência na filtragem:** uma regra diferente da atual mudaria a tabela e o resumo juntos. O teste unitário cobre cada filtro.
- **Callback instável:** se o `onDataLoaded` deixar de ser estável, o efeito dos dados volta a rodar em todo render. Hoje ele é um setter do `useState`, e o comentário no tipo avisa disso.
- **Renomeação dos tipos:** é mecânica, em 3 arquivos, e o tsc acusa qualquer sobra.
- **Semana de pagamento:** "7 dias atrás" passa a usar o horário local. A diferença só aparece depois das 21h.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação está pronta quando:

- a tela de Lançamentos não entra mais em laço: no máximo 5 renders em 1,5 s, sem aviso;
- a tabela mostra as mesmas despesas de hoje para os mesmos filtros;
- com filtro, o card "Despesa do mês" mostra o total filtrado e a contagem; sem filtro, o total do mês;
- os filtros de forma de pagamento e de cartão continuam com as opções do mês;
- Relatórios funciona igual;
- tsc, testes e build passam.

## Observações para a skill implementar

- **Ordem:** a Fase 1 remove e a Fase 2 aplica.
- **Escopo:** sem mudança visual e sem dependência nova.
- **Fumaça e reprodução:** usam o jsdom do scratchpad da sessão 067fade8 e um `fetch` simulado, sem backend.
- **Proibições:** não fazer commit nem push.
