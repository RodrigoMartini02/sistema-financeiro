# Plano: Padronização — Etapa 3 de 3 — Edição financeira de despesas

## Origem

- Task: [padronizar cobrança, edição e receitas fixas](tasks/padronizacao-cobranca-edicao-receitas-fixas.md).
- Classificação: **fullstack** (sem migration prevista; confirmar na implementação).
- Data: **01/11/2026**. Depende das etapas [1](padronizacao-etapa-1-receitas-fixas.md) e [2](padronizacao-etapa-2-menu-cobranca-rotulos.md) fechadas.
- É a etapa de maior risco financeiro: vai por último e com testes de centavos e de caixa.

## Estado atual (revisado em 01/11/2026)

O Codex deixou, sem commit, a parte de **interface** desta etapa e quase nada do servidor:

- Frontend: `canBecomeInstallments` já não exige `!pago`; o modal envia `billingType: 'installments'` e `installmentAmountMode`; `draftFromExpense` carrega a modalidade na edição.
- Backend: `expenseInput.ts` lê `billingType` e `installmentAmountMode`; `installmentCount.ts` ganhou `splitConvertedPurchase` (que **ninguém chama**) e deixou de recusar despesa paga. **`expenseService.ts` não foi alterado**: `changeInstallmentCount` ainda cria as novas parcelas com o valor original e `paid: false`.
- Efeito: converter uma despesa paga de R$ 100 em 3x criaria **R$ 300** em despesas. A etapa 1 desliga essa liberação; esta etapa a entrega completa.
- Falhas encontradas no código do Codex: build do backend (`'credit-payment'` fora do tipo `InvoiceEditLock`), 3 testes do backend e 1 do frontend.
- **Situação desde a etapa 1 (01/11/2026):** esses arquivos voltaram ao estado do último commit, então hoje o servidor e a interface voltam a recusar "despesa paga vira parcelada" e nada multiplica o valor. O trabalho do Codex está em `c:\tmp\financas-codex\despesas-etapas-2-3.patch` (ver `LEIA-ME.txt`) para ser reaproveitado, junto do trecho de despesa de `types/finance.ts` (`billingType` e `installmentAmountMode` em `ExpenseUpdateInput`).

## Resumo

Permitir corrigir **Cobrança**, **Pago em** e **Valor pago** em despesas já cadastradas ou pagas, com contrato, transação e interface coerentes, preservando pagamentos e histórico. Correções do pagamento de crédito com cartão continuam pela fatura.

### Decisões confirmadas

- Editar Cobrança, Pago em e Valor pago em despesas cadastradas ou pagas.
- Resposta explícita do usuário: **distribuir entre as parcelas, preservando o total pago**.
- Converter despesa única paga para Parcelado: dividir valores e pagamento em centavos, conservar o total da compra, o total pago, a data de pagamento e o **ID na primeira parcela**.
- Pagamentos controlados por fatura não se alteram diretamente.
- Conversões entre modalidades de séries já existentes que exijam desfazer histórico não entram; apresentar o caso ao usuário antes.

## Escopo

### Dentro do escopo

- Despesa única comum pode permanecer única, virar Parcelado ou Fixa; "estar paga" deixa de ser recusa genérica. Comissão, fatura e canceladas seguem as validações de sua origem.
- Única paga → Parcelado:
  - modo **Total** (a quantidade reparte a compra existente; não multiplica);
  - distribuir valor previsto, valor pago e juros/desconto em centavos, com resíduo determinístico (`splitConvertedPurchase`, `splitCents`, `splitInterestWithinInstallments`);
  - parcelas quitadas conservam data real de pagamento; somas de caixa inalteradas;
  - primeiro ID preservado; anexos/NF não replicados.
  - Exemplo: R$ 100,00 em 3 parcelas soma exatamente R$ 100,00 e não muda o mês do caixa.
- Única paga → Fixa: preserva a ocorrência e seu pagamento; futuras apenas previstas até o limite.
- Séries existentes: editar quantidade (compra parcelada, alcance Todas) e limite (fixa); preservar parcelas pagas/faturadas, competência e identidade; encerrar a repetição fixa pelo Até. Não redistribuir pagamentos de outras parcelas ao corrigir só uma.
- Pago em e Valor pago corrigíveis na linha comum, sem limpar a quantia ao alterar o valor da despesa e sem pagar por inferência da data.
- Contrato explícito de intenção de cobrança na edição, validado no servidor, numa única transação (sem criar + converter em duas requisições com efeitos parciais).

### Fora do escopo

- Alterar diretamente pagamentos controlados por fatura; apagar histórico para liberar edição; regras próprias de comissões, estoque, horas e contratos.
- Menu, rótulos e etiqueta (etapa 2); receitas (etapa 1).
- Executar migration, escrever em banco, commit, push ou deploy sem autorização.

## Estratégia

1. **Servidor primeiro.** `expenseService.changeInstallmentCount` passa a usar o plano de divisão para a única que vira parcelada: atualiza a parcela 1 (mesmo ID) com valor e pagamento da divisão e cria as demais já com o pagamento repartido; `installmentAmountMode` decide entre total e por parcela. `installmentCountRefusal` volta a recusar apenas o que deve (grupo, comissão, fatura de item) e passa a tratar o pagamento de crédito com cartão pelo tipo correto de `InvoiceEditLock`; ajustar o tipo em vez de comparar com valor inexistente.
2. **Transação e locks**: o advisory lock da compra e os locks de cartão/fonte/ocorrência já usados; revalidar permissão, situação e concorrência depois dos locks.
3. **Contrato**: `readUpdateExpenseInput` valida a combinação `billingType` × `installmentCount` × `installmentAmountMode`; atualizar os testes de entrada que a nova regra quebra (`expenseInput.test.ts`) em vez de afrouxar a validação.
4. **Interface depois**: só reabrir `canBecomeInstallments` e o envio de `installmentAmountMode` quando o servidor estiver coberto por teste. O menu de cobrança já existe desde a etapa 2 (`billingMenu.ts`, `BillingPopover`, `OptionRow`): a edição da despesa única monta o menu em `ExpenseDialog` (`offerSplit`, `singleMenu`) e o nº de parcelas fica em `nextInstallmentCount`, **sem** mudar `draft.billingType`. A conversão de paga em parcelada entra aí (oferecer "Parcelado" para a paga, valor "Total" distribuído, aviso do total e do pagamento preservados), e não por `draft.billingType === 'installments'` na edição, que mudaria o resumo e a consulta de duplicata. O patch do Codex serve de referência para a prévia do total e do pagamento.
5. Pago em / Valor pago: liberar na linha comum; pagamento de crédito com cartão permanece pela fatura, com mensagem explicando.

## Arquivos afetados

- Backend: `services/expenseService.ts`, `expenseInput.ts`, `installmentCount.ts`, `installmentSplit.ts` (uso), `cardInvoiceRules.ts` (tipo), `routes/expenses.ts`.
- Frontend: `expense-dialog/ExpenseDialog.tsx`, `ExpenseRow.tsx`, `draftRules.ts`, `draftState.ts`, `BillingPopover.tsx`; `src/utils/installmentCount.ts`; `src/types/finance.ts`; `financeService.ts`.
- Testes: `backend/src/services/installmentCount.test.ts`, `expenseInput.test.ts`, `fixedExpenseService.db.test.ts`, `src/utils/installmentCount.test.ts`, `src/screens/finance/expense-dialog/draftRules.test.ts`.

## Segurança e dados

- Validar tudo no servidor; a disponibilidade visual não autoriza.
- Valores em centavos (`BigInt` já usado na divisão do pago); resíduo determinístico; nenhuma operação cria duas vezes o pagamento nem desloca o caixa para os vencimentos futuros.
- Crédito pago pela fatura permanece no fluxo da fatura; falhas desfazem a operação inteira.
- Sem `.env`, sem migrations por inferência, sem escrita em banco sem autorização e alvo verificado.

## Validações

- `npm --prefix backend run build`, `npm run build`, `npx tsc --noEmit -p tsconfig.json` (um por vez) sem erro.
- `npm test` e `npm --prefix backend test` (testes de banco desativados na execução normal): 0 falhas.
- `test:finance-db` somente em cópia local descartável e com autorização.
- Conferência visual: converter paga → parcelada (preview mostra o total e não o total × n), Pago em e Valor pago na edição, crédito com cartão orientando para a fatura.

## Testes recomendados

- Única paga → Parcelado: centavos residuais (ex.: R$ 100,00 em 3), pago com desconto/juros, mesma data de pagamento, ID inicial preservado, totais de caixa, anexos só na parcela inicial.
- Única paga → Fixa: dados e pagamento atuais preservados, futuras previstas, sem duas requisições parcialmente independentes.
- Correção de Pago em/Valor pago em ocorrência comum; alterar o valor não limpa a quantia paga; data sozinha não paga.
- Parâmetros de séries: preservar parcelas pagas/faturadas; redução recusada quando afetaria histórico protegido; não redistribuir pagamentos de outras parcelas.
- Recusas: grupo, comissão, item de fatura; crédito pago pela fatura.
- Concorrência: duas edições da mesma compra em sequência.

## Riscos

- Multiplicar a compra ou somar o pagamento mais de uma vez na conversão.
- Deslocar o caixa para os vencimentos futuros ao parcelar uma despesa já paga.
- Liberar na interface algo que o servidor ainda recusa (ou o inverso).

## Critérios de aceite

- Converter paga → parcelada conserva total da compra, total pago, data real e ID da primeira ocorrência, com centavos distribuídos sem duplicação.
- Cobrança, Pago em e Valor pago editáveis nas despesas aplicáveis, com gravação igual à interface e histórico protegido preservado.
- Pagamento do crédito com cartão continua vinculado à fatura.
- Builds e testes passam; limitações registradas.

## Instruções para /implementar

- Pré-requisito: etapas 1 e 2 fechadas. Ler `AGENT.md` e `CLAUDE.md`; reconferir `git status`.
- Ordem: servidor e testes → contrato → interface. Sem migrations, banco ou `.env` sem autorização; sem stage, commit, push ou deploy durante `/implementar`.

## Execução (01/11/2026, branch `feat/R/edicao-financeira-despesas`, a partir de `cd2cc491`)

Implementada e validada localmente; commitada pelo `/finalizar` na própria branch, **sem merge em main** (os testes de banco seguem pendentes). O patch do Codex serviu só de referência: o servidor foi feito do zero (ele nunca chamava a divisão) e a interface seguiu o menu da etapa 2, sem mudar `draft.billingType` na edição.

**Servidor**
- `installmentCount.ts`: `planSingleConversion` (puro) devolve as parcelas da despesa única que vira parcelada. Modo `perInstallment` (o que já existia: o valor se repete, o juros fica na parcela 1; recusa a paga) e modo `total`: `splitCents` no valor, divisão proporcional em centavos do valor pago (BigInt, resto na última) e `splitInterestWithinInstallments` no juros; vencimentos mês a mês a partir do original (fim de mês preservado); recusa total que não dê R$ 0,01 por parcela e quantidade fora de 2 a 360. `installmentCountRefusal` passou a receber o pagamento **antes** da edição (`paid`) e `creditWithCard`: recusa o modo `total` na série, a paga fora do modo `total`, a paga no crédito com cartão (paga pela fatura) e a mudança de pagamento na mesma edição ("Salve a mudança do pagamento antes de parcelar a despesa"). Saiu `planSingleToInstallments`.
- `expenseInput.ts`: contrato do PUT com `billingType` (`single` | `installments`) e `installmentAmountMode` (`total` | `perInstallment`), validados em conjunto com `installmentCount` (`readInstallmentIntent`): parcelado sem quantidade, quantidade sem parcelado, modo sem quantidade e valores inválidos são recusados. O pedido antigo (só `installmentCount`) continua valendo.
- `expenseService.ts`: `convertSingleToInstallments` roda **na mesma transação** da edição: a parcela 1 mantém o ID (`installmentGroupId = id`) e recebe a divisão (valor, valor pago, juros); as parcelas 2 a N entram já pagas, com a **mesma data de pagamento**, status ativo, sem anexos nem nota fiscal. `singleStillSame` relê a linha com `FOR UPDATE` depois do advisory lock da compra e devolve 409 ("A despesa mudou. Atualize a tela antes de parcelá-la.") se uma edição concorrente já parcelou, pagou ou ligou a despesa à fatura.

**Interface**
- `types/finance.ts`: `ExpenseUpdateInput.billingType` e `installmentAmountMode`.
- `utils/installmentCount.ts`: `canBecomeInstallments` deixa de exigir "em aberto" e exclui só a paga no crédito com cartão; `previewSingleInstallments(..., mode)` com as parcelas em centavos; `singleInstallmentsNotes` com o aviso da divisão e do pagamento ("todas pagas em dd/mm/aaaa: o caixa não passa para os meses seguintes"); `singleSplitBlock` espelha a recusa do pagamento mudado.
- `billingMenu.ts`: `singleCountHint` (a paga explica que o valor é o total e o pagamento se divide).
- `ExpenseDialog.tsx`: a paga usa o modo `total`, a em aberto segue `perInstallment` (texto e total de antes); envia `{ installmentCount, billingType: 'installments', installmentAmountMode }` (na série, só `installmentCount` e `billingType`); trava o salvamento com a mensagem quando o pagamento mudou na mesma edição ou quando o total não dá R$ 0,01 por parcela.
- Pago em / Valor pago: já eram editáveis na linha comum (o valor pago gravado volta no campo, então corrigir o valor não reescreve o pago; a data sozinha não paga) e o crédito com cartão segue travado pela fatura. Sem mudança nesta etapa.

**Validação**
- `npx tsc --noEmit -p tsconfig.json`, `npm --prefix backend run build` e `npm run build` sem erro; `npm test` 499 passam, 0 falham (eram 491); `npm --prefix backend test` 1017 passam, 0 falham, 1 ignorado (eram 1003); `git diff --check` limpo; nenhum arquivo de configuração, `.env` ou migration alterado.
- Conferência visual (modo demonstração, pelo DOM, porque a captura de tela travou): a despesa paga oferece "Não repete / Parcelado / Fixa"; em 2x mostra a dica, a divisão ("R$ 74,20 em 2 parcelas de R$ 37,10") e o pagamento preservado; em 3x, "R$ 24,73 cada, a última de R$ 24,74"; desmarcar "paga" na mesma edição mostra a mensagem em vermelho e o Salvar fica bloqueado (modal aberto, mensagem no rodapé); a despesa em aberto mantém o texto de antes ("R$ 218,35 cada... total R$ 436,70") e sem a dica da paga.

**Não executado / limitações**
- **Testes de banco não rodaram.** O cenário novo está escrito em `expenseInstallmentCount.db.test.ts` (R$ 100,00 em 3 parcelas, paga com R$ 105,00: `33,33 / 33,33 / 33,34` e pago `34,99 / 34,99 / 35,02`, ID e data de pagamento preservados, vencimentos `31/10, 30/11, 31/12`, soma e caixa por mês, recusas, 409 de tela velha, crédito pago, recorrente). O banco local está 5 migrations atrás (0088 a 0092) e o runner exige a ordem; rodar exige criar um banco local descartável e aplicar as migrations nele, com autorização.
- A demonstração (`demo.html`) não cria grupo de parcelas: ela mostra o menu e os avisos, mas não executa a conversão ao salvar.
- Produção: nada tocado; a leitura do `migrations:status` de produção continua pendente com o usuário.
- Decisão a confirmar depois: a despesa em aberto continua no modo "valor por parcela" (multiplica); só a paga divide o total. Padronizar a em aberto no modo "total" mudaria um comportamento que já existe e não estava neste plano.
