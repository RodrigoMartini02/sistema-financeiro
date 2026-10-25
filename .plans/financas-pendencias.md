# Plano: fechar as pendências de finanças

## Origem

- Pedido do dono em 25/10/2026: "preciso fazer todos, quero finalizar isso". Sobraram quatro itens depois do PR #6 (edição de despesas, `.plans/edicao-despesas-parceladas.md`).
- Análises somente leitura de 25/10/2026, uma por item (sem acesso a banco de produção). Nada foi alterado em código.
- Regra do projeto: nada de código antes da aprovação deste plano (CLAUDE.md). Nenhuma entrega exige migration.

## Resumo e ordem de entrega

| # | Entrega | Onde mexe | Esforço |
| --- | --- | --- | --- |
| E1 | Painel lembra a escolha de pessoas e mostra quem está somado | só front | pequeno (cerca de meio dia) |
| E2 | Juros a vencer por mês no gráfico do Painel | backend pequeno + front (`Barras` compartilhado) | médio (2 a 3 dias, estimativa) |
| E3 | Saldo do cartão: composição do "Usado" e quitar faturas vencidas em lote | backend + front | médio a grande (estimativa) |
| E4 | Mudar nº de parcelas na edição e transformar única em parcelada | backend + front | 4 a 5 dias |

Cada entrega sai separada: implementa, valida (testes, tipos, build, banco local e navegador), relata, e só então o próximo. Commit e push no fim de cada uma e merge só com o "pode fazer o merge" do dono.

## E1. Painel lembra a escolha de pessoas

**Certeza (código):**
- O Painel soma, por padrão, só a pessoa logada (`backend/src/utils/dashboardScope.ts`, sem `membro_id` o escopo é `[solicitante]`). A despesa conta para quem paga: o dono do cartão, ou quem cadastrou (`entryQueries.ts` `expensePayer`).
- Não há botão "Família": é um grupo de checkboxes por pessoa nos filtros do topo (`FinanceDashboard.tsx:148-153`). A escolha fica só em memória (`useState`, linha 54), então volta para "só eu" a cada visita.
- Permissão: o membro só vê a família com "Ver lançamentos das outras pessoas da conta". O backend revalida a cada chamada.

**Proposta (só front):**
- Guardar a última escolha por usuário e conta no navegador (chave `painel:pessoas:v1:{usuario}:{conta}`), em `try/catch`, e filtrar o salvo contra a lista de pessoas atual (se a permissão sumiu, cai em "só eu").
- Mostrar sempre quem está sendo somado ao lado do período ("Só você" ou "Você + Rodrigo"), com atalho para trocar.
- Na primeira vez, com mais de uma pessoa e nada salvo, continua "só eu" com o atalho "Ver Família". A privacidade por padrão não muda.
- Esperar a lista de pessoas antes de pedir o Painel, para não fazer duas requisições nem piscar.
- Arquivos: `src/screens/finance/FinanceDashboard.tsx`; novos `src/utils/escopoPessoasSalvo.ts` e `.test.ts` (em `src/utils`, porque o `npm test` do front só cobre esse caminho).
- Fora desta entrega: Movimentações e Relatórios têm o mesmo escopo padrão, mas os cards de receita e saldo do mês somam só o solicitante mesmo com "Família". É uma inconsistência que já existe e fica para outra rodada, junto com a decisão de o saldo mensal seguir o escopo.

## E2. Juros a vencer por mês no gráfico do Painel

**Certeza (código):**
- O gráfico "Quanto paguei de juros e taxas?" mostra só o juros já pago, pela data de caixa. O "Juros a vencer" é um número único: soma de `valor_juros` das despesas não pagas, de qualquer data (`painelService.ts` `buscarJurosAVencer`, `painelCalculos.ts` `sumUpcomingInterest`).
- No crédito com cartão, `data_vencimento` da parcela já é o vencimento da fatura. A regra de caixa de uma linha em aberto usa o vencimento (`cashDate.ts`).
- Cada linha cai em um só lado: pago ou a vencer. Pagar a fatura move o juros do mês do vencimento para o mês do pagamento.

**Proposta:**
- Backend: `PontoSerie` ganha `jurosAVencer`; função pura `distribuirJurosAVencer(pontos, emAberto)` distribui a lista que já alimenta o total pelos trechos do gráfico, por `dataDeCaixa`. O que cai fora do período vai para `jurosDescontos.upcomingInterestOutside`. Sem consulta nova.
- Front: série "Juros a vencer" empilhada e hachurada sobre "Juros e taxas pagos"; legenda e tooltip; a linha "Juros a vencer" dos totais ganha "· R$ X fora deste período". `Barras.tsx` é compartilhado com outros gráficos: `pilha` e `padrao` opcionais, sem mudar o comportamento de quem não os usa. Texto de ajuda quando nenhuma parcela tem juros gravado.
- Cores: hachura e contorno em `cores.negativo` (mais contraste que `cores.despesa`); diferença de textura, não só de cor. Sem token novo.
- Arquivos: `backend/src/services/painelCalculos.ts`, `painelService.ts`, `src/types/finance.ts`, `src/screens/finance/painel/JurosDescontos.tsx`, `graficos/Barras.tsx`, `base.tsx`.
- Testes: `painelCalculos.test.ts` (3 parcelas em meses diferentes; paga sai do a vencer; vencida e não paga fica no mês do vencimento; fora da janela; invariante barras + fora = `sumUpcomingInterest`; semana e ano; renegociação conta uma vez; filtros). Conferência no navegador em tema claro e escuro, estreito e largo.
- Limite: só aparece o juros gravado. Parcelas sem "À vista" no cadastro e as criadas pelo assistente não têm juros (a edição com o campo "À vista" corrige as antigas).

**Decisões do dono (recomendação primeiro):**
1. Juros em aberto com vencimento já passado: ficam no mês em que venceram (recomendo); ou empurrar para o mês atual; ou só no total.
2. Janela: só o período escolhido, com a nota "fora deste período" (recomendo); ou estender para a frente.
3. Visual: empilhado hachurado, 2 colunas por mês (recomendo); ou 3 barras lado a lado.
4. O saldo do cabeçalho do bloco não inclui o a vencer (recomendo manter).

## E3. Saldo do cartão (plano `.plans/saldo-cartao-movimentacoes.md`)

- Item 1: mostrar de que é feito o "Usado" (composição por fatura e por tipo, e o total vencido em aberto). Backend em `/cartoes/limites` e card com detalhes. Sem mudar a regra.
- Item 2: quitar as faturas vencidas em lote, no padrão de "Despesas vencidas", reaproveitando `payCardInvoice`, com endpoint novo em lote. A data do pagamento fica visível e editável, padrão o vencimento da fatura: com a regra de caixa, o valor sai do mês da data do pagamento.
- Já feito: item 3 (o Usado soma toda compra do cartão, de qualquer autor, PR #4).
- Ficam de fora desta rodada: item 4 (dados antigos, depende de consulta em produção e de migration com confirmação) e item 5 (compra com data futura, decisão do dono).
- Decisão do dono: data padrão do pagamento em lote = vencimento da fatura, editável (recomendo).

## E4. Nº de parcelas e Cobrança na edição

**Certeza (código):**
- O PUT só grava descrição, compra, categoria, vencimento, pagamento, anexos e NF, mais valor, forma e cartão quando não travados. A Cobrança é texto fixo (decisão de 29/09). O servidor descarta cobrança e nº de parcelas.
- Parcelada = uma linha por parcela (`parcelado`, `numero_parcelas`, `parcela_atual`, `grupo_parcelamento_id`). O total e o "à vista" não são guardados. Reduzir hoje é excluir pela grade, e isso deixa "3/10" com 8 linhas.
- Limite usado do cartão = soma de `valor_original` das abertas, na hora. O servidor não recusa passar do limite, nem na criação.

**Proposta (nesta ordem; sem migration):**
- Regra de ouro: só mexe em linha aberta (não paga e sem vínculo com fatura). Linha paga ou de fatura nunca é apagada nem regravada. A trava fica no servidor, na transação, depois de travar a série.
- A0 e A1, mudar o nº de parcelas (só com "Todas"): aumentar cria parcelas novas com os campos da compra (vencimento pela regra da criação, valor da parcela mantido, sem juros, sem anexos). Reduzir apaga a cauda de parcelas abertas. Se alguma da cauda estiver paga ou na fatura, ou for a parcela editada, recusa e diz até quantas dá para reduzir. O rótulo "x/N" é atualizado em todas as linhas, pagas incluídas (só o rótulo). Corrida entre dois PUT e "Pagar fatura" coberta por lock.
- A2, tela: "Parcelas [- N +]" na faixa "Aplicar a", só com "Todas", com avisos (parcelas apagadas e criadas, novo total, limite do cartão, juros) e confirmação ao apagar.
- B1, única vira parcelada: só se não paga, sem vínculo com fatura, não recorrente, sem grupo e sem receita de origem. A linha vira a parcela 1 e as outras são criadas.
- Fora: parcelada vira única (B2, apaga linhas e muda a classificação do Painel; alternativa: excluir e lançar de novo), recorrente (cascade das renovações e ocorrências passadas intocáveis), e o modo "manter o total e reratear" (A3).
- Arquivos: `expenseInput.ts`, `expenseService.ts`, `routes/expenses.ts`, novo `installmentCount.ts` (funções puras `installmentCountRefusal` e `planInstallmentCountChange`), `src/types/finance.ts`, `ExpenseDialog.tsx`, `src/utils/expenseSeries.ts`, `draftRules.ts`; testes puros, de banco (`expenseInstallmentCount.db.test.ts`, com FINANCE_DB_TESTS) e no navegador.

**Decisões do dono (recomendação primeiro):**
1. Ao mudar o nº de parcelas: manter o valor da parcela e o total muda (recomendo); ou manter o total e reratear (A3, só se sentir falta).
2. Parcelas que sobram: apagar (recomendo); cancelar deixa linha fantasma e numeração repetida.
3. Juros: as novas ficam sem juros, as apagadas levam o delas, e o aviso sugere informar o "À vista" (recomendo).
4. Rótulo "x/N" das pagas: atualizar em todas (recomendo).
5. B2 (parcelada vira única): não nesta rodada (recomendo).
6. Limite do cartão estourado: só avisar, como na criação (recomendo).
7. Escopo: só "Todas" (recomendo).

## Riscos gerais

- A previsão dos meses futuros muda ao criar ou apagar parcelas, e o limite do cartão muda na hora (avisar na tela). O caixa realizado não muda, porque só linha aberta entra ou sai.
- `Barras.tsx` é compartilhado: conferir visualmente os outros gráficos que o usam (E2).
- Apagar parcelas é definitivo. Desfazer é aumentar o nº de novo, e as parcelas voltam sem anexos e sem juros (E4).

## Critérios de aceite

- Cada entrega: testes puros e de banco verdes, tipos e build sem erro, conferência ponta a ponta no navegador (backend e Postgres descartáveis) e nenhuma migration.
- E1: a Mirian escolhe "Você + Rodrigo" uma vez e o Painel volta assim na próxima visita, e o texto mostra quem está somado.
- E2: o Painel mostra a barra hachurada nos meses das parcelas abertas com juros gravado, e as barras mais o "fora deste período" somam o total "Juros a vencer".
- E3: o card do cartão abre a composição do "Usado" e dá para quitar as faturas vencidas em lote com a data editável.
- E4: aumentar de 3 para 5 parcelas cria 2 parcelas abertas certas, reduzir apaga só a cauda aberta, e a recusa com parcela paga não grava nada.

## Situação das entregas

- **E1 (25/10/2026): feita.** O Painel lembra a escolha de pessoas por usuário e conta (navegador, `src/utils/escopoPessoasSalvo.ts`) e mostra quem está sendo somado ao lado do período, com o atalho "Ver todos" e "Só eu" (`FinanceDashboard.tsx`). O Painel só é pedido depois de restaurar a escolha (uma consulta, sem piscar). Na primeira visita continua "só eu". Conferido no navegador contra o backend e um Postgres descartável com duas pessoas na conta: alternar, recarregar (uma consulta só, com `membro_id=familia`) e voltar a "só eu" (a chave some). Sem backend e sem migration. Movimentações e Relatórios seguem como estão (outra rodada).
- **E2 (25/10/2026): feita.** O gráfico "Quanto paguei de juros e taxas?" mostra o juros a vencer por mês: barra hachurada empilhada sobre o juros pago, legenda e tooltip ("Juros do mês (pago + a vencer)"), e o total "Juros a vencer" ganha "· R$ X fora deste período". Backend: `distribuirJurosAVencer` (`painelCalculos.ts`) distribui pelo `dataDeCaixa` a mesma lista (e os mesmos filtros) do total, e `painelService.ts` devolve `serie.pontos[].jurosAVencer` e `jurosDescontos.upcomingInterestOutside`. Sem consulta nova e sem migration. Decisões aplicadas: vencido em aberto fica no mês em que venceu; só o período escolhido, com a nota de fora; empilhado hachurado; o saldo do cabeçalho não inclui o a vencer. `Barras.tsx` ganhou `pilha` e `padrao` opcionais (os outros 8 usos não mudam). Testes: 7 novos em `painelCalculos.test.ts` (meses, paga fora, vencida, fora da janela, invariante barras + fora = total, semana e ano, renegociada). Conferido no navegador em tema claro, escuro e largura de celular, e nos outros gráficos do Painel (sem mudança).
