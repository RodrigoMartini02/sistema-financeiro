# Plano de Implementação: Despesa conta para quem paga e filtros de despesa no Painel

## Origem

- **Arquivo de especificação:** não há. Os pedidos vieram da conversa de 2026-10-05, com prints de Movimentações (outubro de 2026, conta 17).
- **Data do planejamento:** `2026-10-05`
- **Classificação:** `fullstack` (front e backend, sem banco)

## Resumo

1. **Despesa conta para quem paga.**
   - Em Movimentações, o cartão "Despesa do mês" mudava com qualquer filtro, até desmarcar "Receita":
     - sem filtro mostrava o total do servidor, que soma só o que a pessoa cadastrou (R$ 4.414,00);
     - com filtro somava a lista da tela, que inclui o que outras pessoas lançaram no cartão dela (R$ 4.785,24).
   - A diferença, R$ 371,24, são 14 despesas que a Mirian lançou no cartão Mercado-Pago do Rodrigo, conferidas na produção só lendo.
   - **Decisão do usuário:** a despesa feita no cartão de alguém conta para o dono do cartão, que paga a fatura, e sai das contas de quem só cadastrou. O Painel e os Relatórios já seguem essa regra (`expensePayer`); os saldos de Movimentações, o assistente, o orçamento e o copiloto passam a seguir.
2. **Filtros de despesa no Painel.** Categoria (com subcategorias), Cartão e Forma de pagamento, valendo só para as despesas.
   - Com filtro, aparece o aviso "Painel filtrado: …".
   - Os blocos que misturam receita com despesa mostram só a parte de despesa.

## Escopo

### Dentro do escopo

- **Regra "quem paga"** (`expensePayer`) no lugar de quem cadastrou (`expenses.userId`), nas somas de:
  - `balanceService`: saldo anterior, despesa do mês e despesas pagas de Movimentações;
  - consultas de leitura do assistente (`assistantQueries`);
  - orçamento do Planejamento (`budgetService`);
  - resumo do mês do copiloto (`financialCopilot`).
- **Movimentações:**
  - "Despesa do mês" com uma conta só, com ou sem filtro;
  - o "N lançamentos" conta as mesmas despesas da soma;
  - despesa cancelada fora da soma.
- **Painel:**
  - filtros Categoria, Cartão e Forma de pagamento, enviados ao servidor e aplicados só às despesas;
  - aviso "Painel filtrado: …";
  - blocos ajustados com filtro;
  - "Planejado" por categoria.

### Fora do escopo

- Permissões de editar e excluir despesa e as ações do assistente (pagar, editar), que continuam por quem cadastrou e pelas regras de hoje.
- O histórico das sugestões de lançamento (`expenseService.historyConditions`), que continua por quem cadastrou.
- Receitas: continuam de quem recebeu ou cadastrou.
- Filtros de Tipo, Status e Data de pagamento no Painel (decisão do usuário: não entram).
- O bloco "Todas as contas" do Painel e a contagem "N lançamentos" da receita em Movimentações.
- Banco e migrations.

## Leitura de contexto

- `/AGENT.md` (lido) e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem no projeto**.
- **Especificação:** conversa de 2026-10-05 e decisões do usuário:
  - "quem paga" (dono do cartão);
  - no Painel, os filtros Categoria, Cartão e Forma de pagamento; com filtro, saem Resultado e Comprometimento e entra o aviso;
  - um plano só, com duas partes;
  - D1: "quem paga" também no assistente, no orçamento e no copiloto;
  - D2: os blocos que misturam receita com despesa mostram só a despesa;
  - D3: "Planejado" por categoria, e sai com filtro de cartão ou forma.
- **Arquivos lidos:**
  - regra e consultas: `backend/src/services/entryQueries.ts` (`expensePayer`, `expenseBaseConditions`, `accountFilter`), `balanceService.ts`, `routes/months.ts`, `utils/ownerAndAccountWhere.ts`, `routes/expenses.ts` (lista: quem cadastrou OU dono do cartão);
  - Painel: `painelService.ts` (`montarPainel`, `buscarDespesas`, `buscarDespesasNaoPagas`, `calcularSaldoAnterior`, `montarPlanejado`) e `routes/financial.ts`;
  - Relatórios: `reportService.ts` (`filterExpenses` com `categoryIds`, `paymentMethods` e `cardIds`) e `routes/reports.ts` (`readIdList`, `readEnumList`);
  - por quem cadastrou: `assistantQueries.ts` (`expenseRange`, `expenseAll`), `budgetService.ts` (`expenseAccountCondition`), `financialCopilot.ts` (`accountExpenseCondition`), `expenseService.ts`;
  - front: `src/screens/finance/MovimentacoesScreen.tsx`, `useEntryFilters.ts`, `src/utils/expenseFilters.ts`, `src/screens/finance/FinanceDashboard.tsx`, `src/services/financeService.ts` (`fetchPainel`), `src/services/queryKeys.ts` (`painel`), `src/screens/reports/ReportsScreen.tsx`;
  - blocos do Painel: `CardsResumo`, `ReceitaDespesa`, `DeOndeVeioDinheiro`, `QuemTrouxeQuemGastou` e `Planejado`.

## Impacto por área

### Frontend

**Movimentações** (`MovimentacoesScreen.tsx`):
- **Função pura** em `src/utils/expenseFilters.ts`, com teste: `expensesPaidByPeople(items, visibility)`, ou um nome equivalente.
  - Fica com as despesas não canceladas (`status !== 'cancelada'`) cujo pagador (`pagadorNome`) está entre as pessoas selecionadas (`visibleNames`).
  - Com `meId` ainda carregando, todas entram, como o filtro de hoje.
- **"Despesa do mês":** `effectiveExpenseValue` somado sobre `expensesPaidByPeople(filterExpenses(lista, filtros, visibilidade), visibilidade)`, com ou sem filtro.
  - Sai o desvio para `balance.despesas` sem filtro.
  - A nota "N lançamento(s)" usa a mesma lista ("filtrado(s)" só com filtro ativo).
- **"Resultado do mês", "Saldo anterior" e "Saldo atual":** continuam vindo do servidor, agora com a regra "quem paga", e continuam valendo o mês inteiro.

**Painel** (`FinanceDashboard.tsx` e blocos):
- **Estado:** `categoryIds`, `paymentMethods` e `cardIds` (Sets).
- **Grupos no `MultiFilterPanel`:**
  - Categoria: opções do catálogo, com pai e filhas como em Lançamentos. A montagem das opções sai de `useEntryFilters` para uma função comum, usada nos dois lugares.
  - Forma de pagamento e Cartão: opções vindas de `dados.filterOptions` (do período, sem filtro).
- **"Limpar" e indicador de filtro ativo:** passam a considerar os três filtros.
- **Pedido:** `fetchPainel` manda `category_id`, `card_id` e `payment_method` (listas) e `queryKeys.painel` inclui os três.
- **Aviso** "Painel filtrado: <nomes>" no topo, abaixo do cabeçalho, com os nomes das categorias, formas e cartões, e cortado se for longo.
- **Com filtro ativo (D2):**
  - `CardsResumo`: saem o cartão "Resultado" (o escuro), "Comprometimento" e "Saldo acumulado". Ficam "Entrou" (inteiro) e "Saiu" (filtrado), rearrumados sem buraco na grade;
  - `ReceitaDespesa`: só a série de despesas, sem "Resultado" na dica;
  - `DeOndeVeioDinheiro`: sai o comprometimento previsto; as receitas ficam;
  - `QuemTrouxeQuemGastou`: só quanto cada pessoa gastou, sem saldo e sem "Entrou";
  - `Planejado` (D3): com filtro de categoria, só os tetos das categorias filtradas, que vêm assim do servidor; com filtro de cartão ou forma, o bloco não aparece;
  - os demais blocos (como o dinheiro saiu, em dia com as contas, comprometido, onde mais gastou, juros e descontos) mostram as despesas filtradas.
- **Tipos:** `types/finance.ts` ganha `PainelData.filterOptions` e os campos dos filtros em `PainelFiltro`.

### Backend

**Parte 1, "quem paga":**
- **`balanceService.ts`:** as duas somas de despesa (`calculatePreviousBalance` e `calculateBalanceBreakdown`), hoje em SQL cru com `usuario_id = $1`, passam a Drizzle.
  - Usam `expenseBaseConditions([userId], accountId)` (pagador, status ativa e conta) com o recorte de `ano`/`mes` de hoje.
  - As somas de receita continuam como estão.
  - O formato da resposta de `/meses/:ano/:mes/saldo` não muda.
- **`assistantQueries.ts`:** `expenseRange` e `expenseAll` trocam `eq(expenses.userId, scope.userId)` por `eq(expensePayer, scope.userId)`. Antes, conferir que só consultas de leitura (totais e listas de resposta) usam essas funções. As ações seguem com as checagens próprias.
- **`budgetService.ts`:** `expenseAccountCondition` troca `inArray(expenses.userId, userIds)` por `inArray(expensePayer, userIds)`.
- **`financialCopilot.ts`:** `accountExpenseCondition` troca `eq(expenses.userId, userId)` por `eq(expensePayer, userId)`.

**Parte 2, filtros do Painel:**
- **`routes/financial.ts`:** lê `category_id` e `card_id` (ids inteiros > 0) e `payment_method` (valores de `PAYMENT_METHODS`) com os leitores de lista dos Relatórios.
  - Esses leitores (`readList`, `readIdList`, `readEnumList`) vão para `backend/src/utils/requestInput.ts`, e os Relatórios passam a importá-los.
  - Filtro inválido devolve 400 "Filtro inválido".
- **`painelService.ts`:**
  - `PainelEntrada` ganha `filtros { categoryIds, cardIds, paymentMethods }`;
  - função pura `filtrarDespesasPainel(despesas, filtros)` em `painelCalculos.ts`, com teste, mesma regra do `filterExpenses` dos Relatórios;
  - aplicada às despesas da janela e às não pagas, logo depois da consulta;
  - `filterOptions { paymentMethods, cards: {id, name}[] }` saem das despesas do período antes do filtro, com os nomes dos cartões;
  - `montarPlanejado`: com filtro de categoria, só os tetos dessas categorias. Com filtro de cartão ou forma, o front esconde o bloco (o servidor pode devolver `null`).
- **Segurança:** os filtros só recortam despesas já limitadas ao escopo validado (`resolveDashboardScope`) e à conta checada (`canWriteToAccount`). Ids de outras contas não trazem nada.

### Banco de dados

Sem impacto esperado. Nenhuma migration: a regra é calculada na consulta.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado: sem variáveis novas e sem dependência nova.

## Arquivos provavelmente afetados

- **Backend:**
  - `backend/src/services/balanceService.ts`
  - `backend/src/services/assistantQueries.ts`
  - `backend/src/services/budgetService.ts`
  - `backend/src/services/financialCopilot.ts`
  - `backend/src/services/painelService.ts`
  - `backend/src/services/painelCalculos.ts` e `painelCalculos.test.ts` (ou um teste novo do filtro)
  - `backend/src/routes/financial.ts`
  - `backend/src/routes/reports.ts`
  - `backend/src/utils/requestInput.ts`, com teste se houver
- **Front:**
  - `src/screens/finance/MovimentacoesScreen.tsx`
  - `src/utils/expenseFilters.ts` e `expenseFilters.test.ts`
  - `src/screens/finance/useEntryFilters.ts` e uma função comum para as opções de categoria
  - `src/screens/finance/FinanceDashboard.tsx`
  - `src/services/financeService.ts`, `src/services/queryKeys.ts` e `src/types/finance.ts`
  - `src/screens/finance/painel/CardsResumo.tsx`, `ReceitaDespesa.tsx`, `DeOndeVeioDinheiro.tsx`, `QuemTrouxeQuemGastou.tsx` e `Planejado.tsx`
  - componente do aviso de painel filtrado, em `painel/`

## Estratégia de implementação

1. **Branch:** `git checkout main && git pull`, depois `git checkout -b feat/R/quem-paga-e-filtros-painel`.
2. **Parte 1, backend:**
   - `balanceService` em Drizzle com `expenseBaseConditions`;
   - `assistantQueries`, `budgetService` e `financialCopilot` com `expensePayer`;
   - `tsc` e testes do back.
   - Commit.
3. **Parte 1, front:**
   - função pura com teste;
   - "Despesa do mês" com a conta única e a nota com a mesma contagem.
   - Commit.
4. **Roteiro no banco local**, com o backend em outra porta e usuários `*@roteiro-quem-paga.test`, apagados no fim:
   - A é dono da conta e do cartão; B é membro da mesma conta com acesso à carteira;
   - B lança 2 despesas no cartão de A, e A e B lançam despesas próprias; uma delas cancelada;
   - conferir:
     - `/meses/:ano/:mes/saldo` de A (com as despesas de B no cartão dele) e de B (sem elas);
     - mês anterior com o mesmo efeito no saldo anterior;
     - `/financial/painel` e o Relatório com o mesmo total de A;
     - orçamento de A contando as de B no cartão;
     - assistente ("quanto gastei este mês") com o mesmo total;
     - cancelada fora de tudo.
   - Registro no plano.
5. **Parte 2, backend:**
   - leitores de lista para `utils/requestInput.ts`;
   - parâmetros novos em `/financial/painel`;
   - `filtrarDespesasPainel` com teste;
   - `filterOptions` e `Planejado` por categoria;
   - roteiro: filtro de categoria, de cartão e de forma, filtro inválido (400) e ids de outra conta sem efeito.
   - Commit.
6. **Parte 2, front:**
   - grupos, estado, pedido e cache;
   - aviso;
   - blocos com filtro (D2 e D3).
   - Commit.
7. **Validação:**
   - front e back com `tsc`, testes e build;
   - teste de tela no jsdom (`tmpclaude-*`):
     - Movimentações com o cartão igual sem filtro, só com "Despesa" e com os dois tipos; despesa de outra pessoa no seu cartão somada; cancelada fora;
     - Painel filtrado com o aviso, os blocos escondidos, só despesas no gráfico e o Planejado por categoria;
   - registro no plano.
8. **Prints** (computador e celular) de Movimentações e do Painel com e sem filtro. **A implementação para aqui** até o usuário aprovar.
9. **`/finalizar`:** sem migration. Depois do deploy, conferir na produção, só lendo, que o total de outubro do Rodrigo passa a R$ 4.785,24 nas telas.

## Regras de negócio identificadas

- **Pagador de uma despesa:** o dono do cartão, quando há cartão; senão, quem cadastrou (`expensePayer`).
  - As somas de despesa por pessoa usam o pagador.
  - Quem cadastrou no cartão de outra pessoa continua vendo e editando o lançamento, mas ele não entra nas somas de quem cadastrou.
- **Status:** despesa cancelada não entra em nenhuma soma.
- **"Despesa do mês" (Movimentações):** soma das despesas não canceladas pagas pelas pessoas selecionadas, dentro dos filtros. Sem filtro, é igual ao total do servidor.
- **"Resultado do mês", "Saldo anterior" e "Saldo atual":** sempre do mês inteiro da pessoa logada, com a regra do pagador.
- **Filtros do Painel:** Categoria, Cartão e Forma de pagamento valem só para despesas; Pessoas e Período continuam como hoje.
- **Painel filtrado:**
  - aviso com os filtros;
  - saem Resultado, Comprometimento, Saldo acumulado, a parte de receita do gráfico "Receita x despesa", o comprometimento previsto e o saldo por pessoa;
  - "Planejado" por categoria, ou some com filtro de cartão ou forma.

## Regras multi-tenant e segurança

- A conta continua validada no servidor (`canWriteToAccount`) e as pessoas por `resolveDashboardScope`. Os filtros novos só recortam esse conjunto.
- `expensePayer` não amplia o que cada pessoa vê. A lista de Movimentações já trazia as despesas do cartão da pessoa; só as somas passam a seguir a lista.
- Filtros com valores inválidos devolvem 400 e não aparecem em mensagens de erro.
- Relatórios: o leitor de listas só muda de arquivo, sem mudar o comportamento.

## Validações necessárias

- `category_id` e `card_id`: inteiros > 0, um ou vários. `payment_method`: valores de `PAYMENT_METHODS` (pix, dinheiro, debito, credito). Fora disso, 400 "Filtro inválido".
- Período e pessoas do Painel: como hoje.

## Testes necessários

### Frontend

- `expenseFilters.test.ts`: pagas pelas pessoas selecionadas, cancelada fora, `meId` carregando, pessoa diferente fora.
- Tela no jsdom: os cenários da etapa 7.

### Backend

- **`filtrarDespesasPainel`:** categoria, cartão, forma, combinados e vazios.
- **`filterOptions`:** saem das despesas sem filtro.
- **Leitores de lista em `requestInput`:** casos válidos e inválidos.
- **Roteiro no banco local:** etapas 4 e 5.

### E2E

- No navegador, entrar como titular e como membro com compras no cartão um do outro; conferir Movimentações, Painel, Relatórios, Planejamento e assistente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
node <roteiro no banco local>
npx tsx tmpclaude-<cenarios>.tsx
```

## Riscos e pontos de atenção

- **Saldos passados mudam:** para quem tem compras de outras pessoas no cartão, mudam o saldo anterior e os meses passados. É esperado; o roteiro mostra o antes e o depois, e o usuário é avisado.
- **Assistente:** mudar só as consultas de leitura. As ações (pagar, editar) seguem as checagens de autor e permissão de hoje.
- **Desempenho:** `expensePayer` é uma subconsulta por linha, a mesma já usada no Painel e nos Relatórios. Nas somas de todos os meses anteriores (saldo anterior) fica leve no volume atual, mas é bom medir o tempo no roteiro.
- **Painel filtrado:** muda o desenho (sem o cartão escuro) e precisa ficar sem buraco na grade. Conferir nos prints.
- **Cache:** `queryKeys.painel` tem de incluir os filtros, senão um painel filtrado aparece no lugar do inteiro.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Seus totais de outubro (Rodrigo):** "Despesa do mês" em Movimentações dá R$ 4.785,24 sem filtro, só com "Despesa" e com os dois tipos. "Resultado do mês" e os saldos contam os R$ 371,24.
- **Os totais da Mirian:** deixam de contar as 14 despesas lançadas no cartão do Rodrigo.
- **Batem entre si:** o Painel, o Relatório, o orçamento do Planejamento e o assistente dão o mesmo total de despesas do mês para a mesma pessoa.
- **Despesa cancelada:** nunca entra em nenhuma soma.
- **Filtros do Painel:**
  - Categoria, Cartão e Forma de pagamento recortam só as despesas;
  - o aviso aparece;
  - os blocos de receita com despesa mostram só a parte de despesa;
  - o "Planejado" mostra os tetos das categorias filtradas e some com filtro de cartão ou forma.
- **Filtro inválido:** a API do Painel responde 400.
- **Checks:** `tsc`, testes, builds, roteiro e teste de tela passando; prints aprovados.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal; seguir `/AGENT.md` e `/CLAUDE.md`.
- **Branch:** `feat/R/quem-paga-e-filtros-painel`, a partir da `main` atualizada. Um commit por etapa.
- **Queries:** as que forem reescritas ou novas vão em Drizzle, reaproveitando `entryQueries.ts` (`expensePayer`, `expenseBaseConditions`, `accountFilter`). Nada de SQL cru novo.
- **Código:** identificadores em inglês, textos de tela em português, nada de `any`; regras puras com teste.
- **Efeitos no front:** nunca depender de conjuntos ou listas recriados a cada render (histórico de loop em Movimentações).
- **Arquivos temporários:** `tmpclaude-*` e o roteiro no scratchpad, apagados no fim. Os dados do roteiro só no banco **local**, apagados no fim.
- **Migrations:** este plano não tem migration. Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
- **Registro:** no fim deste plano, a cada etapa concluída.

## Registro de andamento

- **Etapa 1 (branch):** `feat/R/quem-paga-e-filtros-painel` a partir da `main` em `5db6bdfe`.
- **Etapa 2 (parte 1, backend):** commit `969d5e8f`.
  - `balanceService` em Drizzle com `expenseBaseConditions` e `incomeBaseConditions`.
  - `assistantQueries`, `budgetService` e `financialCopilot` somam pelo pagador (`expensePayer`).
  - **Desvio:** `despesasEmAberto` do assistente continua por autor (`expenseAuthoredAll`), porque é a lista do "Pagar", e pagar segue a checagem de autor de `/expenses/:id/pay`.
  - **Acréscimo:** commit `65bee57c`, o assistente deixa de somar despesas canceladas (`expenseRange` e `expenseAll` só com `ativa`), como pede a regra "cancelada fora de tudo".
- **Etapa 3 (parte 1, front):** commit `90dc05a1`.
  - `expensesPaidByPeople` em `utils/expenseFilters.ts`, com teste.
  - "Despesa do mês" e a nota contam a mesma lista: não canceladas, pagas pelas pessoas selecionadas, dentro dos filtros.
- **Etapa 4 (roteiro no banco local):** 18/18; os usuários `*@roteiro-quem-paga.test` foram apagados no fim.
  - Saldo do mês: A = 360 com a compra de B no cartão dele; B = 20. Saldo anterior de A = -30.
  - Antes e depois: A 310 → 360, B 70 → 20.
  - Painel, Relatório, orçamento e assistente dão 360 para A.
  - O "em aberto" de A não traz a despesa de B; cancelada fora de tudo.
  - Tempo, no banco local do Rodrigo (507 despesas desde 2025): saldo anterior + mês com mediana de 3,5 ms e pior caso de 58,8 ms.
- **Etapa 5 (parte 2, backend):** commit `b915831b`.
  - `readQueryList`, `readQueryEnumList` e `readQueryIdList` em `utils/requestInput.ts`.
  - **Desvio:** Relatórios passam a usar esses leitores e o `sendRequestError`; os leitores locais saíram, sem mudar o comportamento.
  - `/financial/painel` com `category_id`, `card_id` e `payment_method`; `filtrarDespesasPainel` com teste; `filterOptions`; Planejado por categoria e nulo com filtro de cartão ou forma.
  - Roteiro (dentro dos 18):
    - categoria 150; cartão 260 com Planejado nulo; pix 100;
    - opções `credito` e `pix` mais o cartão de A;
    - filtro inválido → 400; cartão de outra conta → 0;
    - Relatórios iguais.
- **Etapa 6 (parte 2, front):** commit `5f1398c1`.
  - Grupos Categoria, Forma de pagamento e Cartão; estado, pedido e chave de cache com os filtros.
  - Aviso "Painel filtrado"; blocos com filtro (D2 e D3).
  - **Desvio:** as opções de forma de pagamento são as quatro de `PAYMENT_METHODS` (como em Lançamentos); os cartões vêm de `filterOptions`.
  - As opções de categoria saem de `categoryFilterOptions`, agora compartilhada com Lançamentos.
- **Etapa 7 (validação):**
  - `tsc` do front ok; testes 154/154 (front) e 334/334 (back); build do back ok; `vite build` ok.
  - Tela no jsdom: 11/11 cenários.
    - Painel sem filtro e filtrado: aviso, blocos escondidos, só saídas no gráfico, Planejado some com cartão.
    - "Limpar" volta ao Painel inteiro.
    - Movimentações: R$ 150,00 com a despesa da Mirian no cartão do Rodrigo e sem a cancelada, igual sem filtro e com "Receita" desmarcada.
- **Etapa 8 (prints):** 10 prints no Edge, em `tmpclaude-prints/` (7 de computador, 3 de celular).
  - Tela real com respostas do Painel geradas do banco local, e Movimentações com dados de exemplo.
  - **Achado para decisão do usuário:** marcar o grupo "Alimentação" no filtro envia só as subcategorias (Academia, subcat). O Painel mostra R$ 1.778,97, e as 58 despesas lançadas direto em "Alimentação" (R$ 4.272,18) ficam de fora. O "Onde mais gastou" mostra Alimentação = R$ 6.051,15. É a regra do botão de filtros, que já vale em Lançamentos e Relatórios.
  - **Prints aprovados pelo usuário em 2026-10-05.**
- **Acréscimos aprovados pelo usuário em 2026-10-05**, nesta branch e antes do `/finalizar`. Plano aprovado e salvo em `.plans/categoria-pai-e-receitas-assistente.md`:
  - categoria pai no filtro (Painel, Lançamentos e Relatórios);
  - receitas do assistente por status (cancelada nunca; prevista só na projeção).
- **Falha encontrada na etapa 2:** o copiloto (`financialCopilot`, cards de reserva do chat) passou a somar pelo pagador, mas `accountExpenseCondition` continua sem o filtro de status. Despesa cancelada entra em "Resumo do período", "Gastos por categoria", "Próximos vencimentos" e "Lançamentos". Isso fere a regra "cancelada fora de tudo"; a correção vai junto dos acréscimos.
