# Plano: Resultado do Painel por regime de caixa (mês fechado não muda)

## Origem

- Bate-papo de 2026-10-19: o gráfico "Resultado · 2026" do Painel muda meses anteriores por causa de lançamentos e pagamentos feitos em outubro.
- Data do planejamento: 2026-10-19
- Classificação: `backend` (cálculo do painel) e testes. Frontend só se o texto dos cards mudar.
- Situação: **rascunho, aguardando decisões** (seção "Decisões em aberto"). Nada foi implementado.

## Problema verificado no código

Rodado com dados de teste sobre `montarSerie` (`backend/src/services/painelCalculos.ts`):

- Receita e despesa **novas** com data de outubro só mudam a barra de outubro. Não há rateio por data.
- Despesa **paga** é colocada no mês do **vencimento** com `valorEfetivo()` (valor pago, se houver). Pagar em outubro uma conta de março, com juros ou ajuste (R$ 400 → R$ 450), muda a barra de **março** (400 → 450) e deixa outubro igual. É o único caminho achado que reescreve um mês fechado.
- Pagamento de fatura parcial ou parcelado reparte o valor pago entre as compras (cada uma com `valor_pago`), com o mesmo efeito nos meses de vencimento delas. Mesmo mecanismo; não foi rodado.
- `buscarDespesas` (`painelService.ts`) já traz as despesas pelo vencimento **ou** pelo pagamento na janela. Os dados para a regra nova já chegam ao cálculo.

## Regra proposta (regime de caixa)

- Receita: mês do recebimento (já é assim).
- Despesa **paga**: mês do **pagamento**, pelo valor pago.
- Despesa **em aberto** de mês atual ou futuro: mês do vencimento, como previsão.
- Despesa **em aberto** de mês que já passou: não entra no resultado daquele mês; segue em "contas em aberto" e entra no mês em que for paga.
- Resultado: um mês fechado não muda depois. O negativo continua negativo e o positivo vira sobra.

## Decisões em aberto (precisam do usuário)

1. Despesa vencida e ainda não paga some do resultado do mês passado até ser paga? (proposta: sim)
2. Mês negativo leva a dívida para o mês seguinte, ou cada mês negativo fica isolado e o seguinte começa do zero? Hoje o "Saldo acumulado" soma tudo com sinal, então o negativo acumula.
3. As barras mostram o resultado do mês ou o saldo acumulado até o mês? O número grande do topo continua sendo o total do ano (entrou − saiu)?
4. Lançamento retroativo (despesa nova com data de março, registrada em outubro): entra em março ou em outubro? Mês fechado = todo mês anterior ao atual (a função "fechar mês" foi removida do projeto).

## Escopo provável (a confirmar depois das decisões)

- `montarSerie`, `resumirPeriodo`, `despesasDoPeriodo` e `calcularSaldoAnterior` passam a usar a data de pagamento para a despesa paga (`painelCalculos.ts`, `painelService.ts`).
- Cuidar dos demais cards que reutilizam a série (`ComoDinheiroSaiu`, `EmDiaComContas`, `JurosDescontos`, `Comprometido`): conferir se mudam junto ou continuam por vencimento.
- Testes de `painelCalculos.test.ts`: conta de março paga em outubro com juros (março não muda), parcial de fatura, mês passado em aberto, saldo acumulado.
- Sem migration.

## Fora do escopo

- Regra do limite do cartão (já tratada no PR de limite).
- Mudança de layout do gráfico.
