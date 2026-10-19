# Plano: Resultado do Painel por regime de caixa (mês fechado não muda)

## Origem

- Bate-papo de 2026-10-19: o gráfico "Resultado · 2026" do Painel muda meses anteriores por causa de lançamentos e pagamentos feitos em outubro.
- Data do planejamento: 2026-10-19
- Classificação: `backend` (cálculo do painel) e testes. Frontend só se o texto dos cards mudar.
- Situação: **implementado na branch `claude/determined-pascal-wrve3a`, migration 0084g criada e NÃO aplicada.** Falta o merge, a aplicação da 0084g antes do deploy e a conferência na tela.

## Problema verificado no código

Rodado com dados de teste sobre `montarSerie` (`backend/src/services/painelCalculos.ts`):

- Receita e despesa **novas** com data de outubro só mudam a barra de outubro. Não há rateio por data.
- Despesa **paga** é colocada no mês do **vencimento** com `valorEfetivo()` (valor pago, se houver). Pagar em outubro uma conta de março, com juros ou ajuste (R$ 400 → R$ 450), muda a barra de **março** (400 → 450) e deixa outubro igual. É o único caminho achado que reescreve um mês fechado.
- Pagamento de fatura parcial ou parcelado reparte o valor pago entre as compras (cada uma com `valor_pago`), com o mesmo efeito nos meses de vencimento delas. Mesmo mecanismo; não foi rodado.
- `buscarDespesas` (`painelService.ts`) já traz as despesas pelo vencimento **ou** pelo pagamento na janela. Os dados para a regra nova já chegam ao cálculo.

## Regra decidida (2026-10-19)

- Receita: mês do recebimento (já é assim).
- Despesa **paga**: mês da **data de pagamento**, pelo valor pago. Pagar em outubro uma conta de março, com juros, tira o valor de março e põe em outubro.
- Despesa **em aberto**: mês do vencimento, inclusive de mês que já passou. Ela **não some** do mês em que venceu (decisão 1: não).
- Lançamento retroativo (data de pagamento em março, registrado em outubro): entra em **março**; vale a data de pagamento (decisão 4).
- Mês fechado = todo mês anterior ao atual (a função "fechar mês" foi removida). Uma conta vencida em aberto é resolvida pelo usuário na lista abaixo, e não pelo cálculo.

## Nova função: lista de despesas vencidas ao abrir o sistema (decisão 2)

- Ao abrir o sistema, no mês atual, se houver despesa vencida e não paga de mês anterior, abre um modal com a lista.
- Cada linha tem "Mover" (uma por vez, como na tabela) e há "Mover selecionadas" em lote. O modal tem um botão para fechar sem fazer nada; as despesas então continuam em aberto no mês em que venceram.
- Hoje só existe "mover" um a um: `POST /expenses/:id/mover` soma 1 mês ao vencimento e recusa despesa paga. Não existe mover em lote, e +1 mês não leva uma conta de agosto para o mês atual.
- A lista usa o que o painel já calcula como "contas em aberto" (`agregarContasEmAberto`, `painelService.ts`).
- Perguntas para fechar: (a) o destino é o **mês atual** (mesmo dia ou hoje)? (b) despesa de cartão de crédito entra na lista ou só se paga pela fatura? (c) o modal abre a cada acesso ou uma vez por dia?

## Barras do gráfico (decisão 3, a confirmar)

- "Barras" = as barras mensais verdes e vermelhas no fim do card escuro "Resultado · 2026". Cada uma mostra o resultado de um mês (entrou − saiu).
- Proposta: as barras seguem mostrando o resultado de cada mês, e a sobra positiva acumula para os meses seguintes no card "Saldo acumulado", que já soma tudo com sinal. O número grande do topo continua sendo o total do ano.

## Escopo provável

- `montarSerie`, `resumirPeriodo`, `despesasDoPeriodo` e `calcularSaldoAnterior` passam a usar a data de pagamento para a despesa paga (`painelCalculos.ts`, `painelService.ts`).
- Endpoint para mover em lote, o modal de despesas vencidas ao abrir o sistema e o "Mover" por linha (`routes/expenses.ts`, tela de Movimentações).
- Cuidar dos demais cards que reutilizam a série (`ComoDinheiroSaiu`, `EmDiaComContas`, `JurosDescontos`, `Comprometido`).
- Testes de `painelCalculos.test.ts`: conta de março paga em outubro com juros (março não muda), pagamento retroativo, conta vencida em aberto, saldo acumulado; testes do mover em lote.
- Sem migration.

## Decisões finais (2026-10-19)

- Aprovado pelo usuário: regime de caixa, lista de vencidas, vencimento original guardado, modal uma vez por dia com aviso nos outros acessos.
- Cartão de crédito fica fora do "Mover": paga-se pela fatura (pagamento parcial já existe).
- Destino do "Mover": o mesmo dia do mês atual, nunca antes de hoje (se o dia já passou, vai para hoje; mês curto usa o último dia).
- Barras: seguem o resultado de cada mês; a sobra acumula no card "Saldo acumulado" (proposta aceita por não ter sido contestada).

## Implementação

- `0084g_despesas_vencimento_original.sql` (coluna `data_vencimento_original`, opcional). **Aplicar ANTES do deploy**: o Drizzle passa a ler a coluna em toda consulta de despesas e falha sem ela.
- `painelCalculos.ts`: `dataDeCaixa`, `despesasDoPeriodo` e `montarSerie` pela data de caixa; `classificarPagamento` compara com o vencimento original. `painelService.ts`: coluna lida e `calcularSaldoAnterior` pela data de caixa.
- `overdueExpenses.ts` e `overdueExpenseRules.ts`: lista e "Mover" em lote (transação); `routes/expenses.ts`: `GET /expenses/vencidas`, `POST /expenses/mover-vencidas` e o `mover` de um mês passa a gravar o vencimento original.
- Frontend: `OverdueExpensesPrompt.tsx` (aviso discreto + modal uma vez por dia) na tela de Movimentações, só no mês atual e para quem edita lançamentos.
- Testes: `painelCalculos.test.ts` (conta de março paga em outubro, sem data de pagamento, caixa, vencimento original) e `overdueExpenseRules.test.ts`. Lista e mover conferidos num Postgres descartável.
- Não verificado: a tela no navegador.

## Fora do escopo

- Regra do limite do cartão (já tratada no PR de limite).
- Mudança de layout do gráfico.
