# Plano: edição de despesas (parcelada e à vista) e juros das parcelas

Origem: pedido do dono em 20/10/2026 (campos bloqueados na edição de despesa parcelada e à vista; juros embutido das parcelas que não aparece em lugar nenhum). Análise somente leitura, sem código alterado. **Aguarda as decisões abaixo antes de qualquer implementação** (CLAUDE.md: planejar, aprovação explícita, implementar).

Confirmado em teste do dono (20/10/2026): o juros da parcela é gravado no cadastro e conta em "Juros a vencer" (cadastro de 3 × R$ 35,00 com à vista de R$ 90,00: o valor subiu R$ 15,00 e caiu R$ 15,00 ao excluir a compra). O que falta é exibição e edição.

## Resposta e análise

1. RESPOSTA CURTA
- No print, os campos cinza são duas travas diferentes, as duas de propósito: a Cobrança (fixa em toda edição) e "Pago em / Valor pago" (despesa no crédito com cartão só se paga pela fatura). A despesa à vista tem as mesmas duas. Não basta tirar um "disabled".
- Sugestão: não destravar essas duas. Dar um atalho para "Pagar fatura". E destravar de verdade o que hoje está escondido: o "pago" automático da à vista, o à vista/juros da parcelada e a proteção das parcelas pagas na edição em série. Nenhuma fatia precisa de migration. Nada de código antes do seu OK (CLAUDE.md: /planejar, aprovação, /implementar).

2. O QUE TRAVA HOJE (parcelada e à vista)
CERTEZA:
- Cobrança: texto fixo na edição (ExpenseRow.tsx:225-229). Decisão do redesign de 29/09 (git 2c73b19d, .plans/analise-redesign-modal-despesa.md:249). O servidor ignora cobrança, nº de parcelas e à vista no PUT (expenseInput.ts:195-204; expenseService.ts:263-279).
- Pago em / Valor pago no crédito com cartão: decisão 2 de 07/10 (.plans/pagamento-fatura-cartao.md:11-16). Tela: ExpenseDialog.tsx:283-288 e ExpenseRow.tsx:295-319. Servidor recusa: cardInvoiceRules.ts:404-406; o /pay também (routes/expenses.ts:566-569). Fora do crédito, parcela e única são editáveis: marcar "Já foi paga" libera os dois campos.
- Valor, Compra, Vencimento, forma e cartão são editáveis nas duas, salvo linha ligada a pagamento de fatura (cardInvoiceRules.ts:395-402).
- À vista (única) fora do crédito, com vencimento até hoje: ao salvar, o servidor grava como paga de novo (expenseService.ts:65 e 269; espelho em draftRules.ts:290 e 353). Não dá para desmarcar "paga", e o valor pago vira o valor. Veio com o modal novo (2c73b19d, 29/09); não achei decisão em .plans.
- Parcelada, "Esta e as próximas / Todas": copia o mesmo valor para todas do alcance, pagas inclusive (expenseSeries.ts:91-99, 176, 229-231). Isso foi decisão sua de 07/10, com risco aceito (.plans/recorrente-editar-proximas.md:18 e 263-265). Não regrava valor pago, data de pagamento nem juros (expenseService.ts:307-317).
DEDUÇÃO: no print, a trava é o crédito (a caixa "Já foi paga" só fica desabilitada por ele, ExpenseRow.tsx:295). "Não paga" sozinha só desliga os dois campos até marcar a caixa (ExpenseRow.tsx:306 e 318).

3. A SITUAÇÃO ANTERIOR: JUROS EMBUTIDO DAS PARCELAS
CERTEZA:
- O servidor grava o juros só na criação (expenseService.ts:98-109). O PUT não recebe nem grava. O à vista não é guardado (.plans/juros-embutido-parcelado.md:120): não dá para informar nem corrigir em parcela já criada.
- Nenhuma tela lê Expense.interest (só é mapeado, financeService.ts:135). A lista só mostra "+ R$" quando se pagou a mais (LancamentosTable.tsx:834-839; ExpenseCard.tsx:134-136).
- O painel só conta juros de parcela PAGA, no mês do pagamento (painelCalculos.ts:287); parcela aberta vai para "Juros a vencer" (painelCalculos.ts:316-318). No crédito, a parcela só fica paga quando a fatura é paga. Logo, parcela de crédito nova não entra no gráfico de juros pagos, mesmo com o juros gravado.
- O assistente grava o à vista como nulo (cardDraft.ts:82): as parcelas criadas por ele nunca têm juros.
- O plano de 19/10 deixou FORA o retroativo e o recálculo ao editar o valor (.plans/juros-embutido-parcelado.md:42-43, 125-126, 183). A melhoria entrou em 19/10 (d3710aba).
DEDUÇÃO (causa do gráfico, não confirmada; não acessei o banco), da mais provável para a menos: (1) parcela de crédito ainda sem fatura paga; (2) à vista deixado em branco; (3) parcela criada pelo assistente; (4) migration 0084e/0084f não aplicada em produção.

4. SUGESTÃO (fatias na ordem, da menor para a maior)
1. Só tela: atalho "Pagar fatura" no lugar dos campos de pagamento do crédito, com o motivo da Cobrança fixa.
2. Só tela: mostrar o juros guardado de cada parcela (lista, celular e resumo da edição).
3. Servidor e tela: à vista editável de verdade (desligar o pagamento automático na edição; não reescrever em silêncio o valor pago de linha paga). Muda regra de 29/09: pede seu OK.
4. Servidor: proteger a série. Parcelas pagas ficam fora de vencimento, forma e cartão, e o servidor recusa forma "crédito com cartão" que atingiria parcela paga.
5. Servidor e tela: campo "À vista" na edição da parcelada, com o juros recalculado só nas parcelas abertas e fora de fatura. Reabre decisão do plano de 19/10: pede seu OK.
6. Só tela: aviso do que a edição em série muda (novo total, parcelas pagas atingidas, limite do cartão).
7. Fora desta rodada: mudar Cobrança ou nº de parcelas. É mudança grande (cria, apaga ou regrava linhas, grupo e limite). Só se você pedir.
Proteções em toda fatia: pagas nunca recebem pagamento ou juros novos pela série; cada campo liberado precisa de entrada, UPDATE e teste no servidor, e a tela reenvia anexos e NF (o PUT apaga o que faltar, expenseService.ts:276-278); regras duplicadas (pagamento automático, caixa) mudam nos dois lados, com teste nos dois.

5. NÃO CONFERIDO E REGRA DE TRABALHO
- Não acessei o banco: não sei se o à vista foi gravado nas suas parcelas nem se 0084e/0084f estão em produção.
- Não vi o print; as travas do print são dedução a partir do código.
- A seção exata da decisão da Cobrança no git não foi conferida (achei a linha 249).
- Somente leitura: nada foi editado, migrado, commitado ou enviado.

## Decisões do dono

1. **Pagamento de despesa no crédito com cartão: o que fazer com 'Pago em / Valor pago' travados?**
   - Manter travado e pôr um atalho 'Pagar fatura' na edição
   - Destravar o pagamento por linha (contradiz a decisão de 07/10 e exige mexer no servidor, no /pay e na fatura)
   - Deixar como está, só melhorar o texto
   - Recomendação: Atalho 'Pagar fatura'. A fatura é quem fecha o pagamento, o juros e o limite do cartão; destravar por linha reabre o que você decidiu em 07/10.

2. **Despesa à vista (única) fora do crédito: desligar o pagamento automático na edição? Hoje, ao salvar com vencimento até hoje, ela volta a ficar paga, com valor pago igual ao valor, e não dá para desmarcar.**
   - Sim, o pagamento automático fica só na criação (muda regra de 29/09)
   - Não, manter como está
   - Recomendação: Sim. Sem isso, liberar 'Pago em / Valor pago' na à vista é só aparência.

3. **Editar o Valor de uma linha já paga: o que acontece com o valor pago?**
   - Continua o valor pago antigo, e o campo 'Valor pago' aparece para corrigir se quiser
   - Acompanha o valor novo em silêncio (como hoje quando estava exato)
   - Acompanha, mas só depois de uma confirmação que diz que o realizado do mês do pagamento muda
   - Recomendação: Continua o valor pago antigo. O realizado de mês fechado e o saldo anterior dos meses seguintes não devem mudar sem você ver.

4. **Edição em série (parcelada) com 'Esta e as próximas' ou 'Todas': as parcelas já pagas devem ficar de fora de vencimento, forma e cartão? Hoje entram, e o vencimento muda sem guardar o original.**
   - Sim, pagas ficam fora de vencimento, forma e cartão
   - Não, manter como decidido em 07/10
   - Recomendação: Sim. A decisão de 07/10 é anterior à regra de 'em dia/com atraso' de 19/10 e à regra de caixa; deslocar parcela paga reclassifica meses antigos e pode criar crédito pago sem fatura.

5. **Valor em série: continua igual em todas as parcelas do alcance (inclusive pagas), ou passa a ser 'valor da parcela' ou 'total da compra'?**
   - Manter igual para todas (decisão de 07/10) e só avisar o novo total, as pagas atingidas e o impacto no limite do cartão
   - Pagas fora do valor
   - Campo 'Total' redistribuído com centavos na última, só nas abertas (fatia maior no servidor)
   - Recomendação: Manter e avisar (fatia 6). O total só entra se você sentir falta.

6. **Reabrir o juros embutido? O plano de 19/10 deixou fora o juros retroativo e o recálculo ao editar. Quer um campo 'À vista' na edição da parcelada?**
   - Não reabrir
   - Sim, valor digitado por você, recalculando só parcelas abertas e fora de fatura (passado intacto)
   - Sim, incluindo as pagas (o gráfico dos meses passados muda; mostrar prévia dos meses e valores)
   - Recomendação: Segunda opção. Cobre o seu caso (parcelas novas ainda abertas) sem mexer em mês fechado. O à vista não seria reconstruído por conta: seria sempre digitado por você.

7. **Guardar o valor à vista da compra em coluna nova (migration), para a edição já abrir preenchida?**
   - Não agora, pedir o valor a cada correção
   - Sim (migration, só com sua confirmação explícita, como manda o CLAUDE.md)
   - Recomendação: Não agora. Resolve o que você pediu sem tocar no banco; a coluna só se valer a pena depois.

8. **Mudar Cobrança (nº de parcelas, à vista virar parcelado ou o contrário) na edição?**
   - Manter fixa (para mudar, excluir e lançar de novo)
   - Tratar como mudança grande, à parte, em outro plano
   - Recomendação: Manter fixa nesta rodada. Mexe em linhas, grupo, parcela atual e limite do cartão; só planejar se você pedir.

## Fatias de entrega

### Fatia 1: Atalho 'Pagar fatura' e texto das travas (só tela)

- Esforço: pequeno (cerca de meio dia)
- Arquivos: src/screens/finance/expense-dialog/ExpenseRow.tsx, src/screens/finance/expense-dialog/ExpenseDialog.tsx, src/utils/cardInvoice.ts
- Detalhe: Só tela, sem mudar regra. No crédito com cartão, os campos de pagamento ganham um atalho para abrir 'Pagar fatura' (InvoicePaymentModal) e a Cobrança fixa ganha o motivo no texto. O rodapé já explica o crédito (ExpenseDialog.tsx:299-300); falta o atalho. Conferir: abrir uma parcela no crédito e clicar no atalho.

### Fatia 2: Mostrar o juros guardado de cada parcela (só tela)

- Esforço: pequeno
- Arquivos: src/screens/finance/LancamentosTable.tsx, src/screens/despesas/ExpenseCard.tsx, src/screens/finance/expense-dialog/draftRules.ts, src/utils/expenseValue.ts
- Detalhe: O dado já vem (Expense.interest, financeService.ts:135). Mostrar 'inclui R$ X de juros' na lista (LancamentosTable.tsx:834-839), no cartão do celular (ExpenseCard.tsx:134-136) e no resumo da edição. Cuidado: linhas da fatura (restante, parcela, encargos) também têm interest; o texto precisa distinguir. Não troca o '+ R$' de pago a mais. Sem servidor e sem migration. Já deixa você ver quais parcelas ficaram sem juros gravado.

### Fatia 3: À vista editável de verdade: pagamento automático e valor pago (servidor e tela, sem migration)

- Esforço: pequeno a médio
- Arquivos: backend/src/services/expenseService.ts, src/screens/finance/expense-dialog/draftRules.ts, src/screens/finance/expense-dialog/draftState.ts, backend/src/services/expenseInput.test.ts, src/screens/finance/expense-dialog/draftRules.test.ts
- Detalhe: Passar autoPay=false na edição (expenseService.ts:269; draftRules.ts:290 e 353), mantendo só na criação. Em linha paga, reenviar o valor pago antigo em vez de null quando estava exato (draftState.ts:110; draftRules.ts:453-457), para o realizado do mês não mudar em silêncio. Testes nos dois lados (regra duplicada). Muda regra de 29/09: precisa do seu OK. Conferir: editar uma à vista vencida e não paga, e uma paga com o valor mudado.

### Fatia 4: Proteger a série: pagas fora de vencimento, forma e cartão (servidor, sem migration)

- Esforço: médio
- Arquivos: backend/src/services/expenseSeries.ts, backend/src/services/expenseService.ts, backend/src/services/expenseSeries.test.ts, src/utils/expenseSeries.ts
- Detalhe: Em 'Esta e as próximas / Todas', as parcelas pagas não recebem vencimento, forma nem cartão novos (isInstallmentInScope e planInstallmentUpdates, expenseSeries.ts:91-99 e 223-237). O servidor recusa (ou pula) forma 'crédito com cartão' que atingiria parcela paga, para não criar crédito pago sem fatura (estado que a edição e o /pay depois recusam). A contagem 'Todas (2)' na tela (src/utils/expenseSeries.ts) acompanha. Teste obrigatório; a trava fica no servidor, não só na tela. O valor segue como decidido em 07/10, salvo decisão sua.

### Fatia 5: Campo 'À vista' na edição da parcelada, com juros recalculado nas abertas (servidor e tela, sem migration)

- Esforço: médio a grande
- Arquivos: backend/src/services/expenseInput.ts, backend/src/services/expenseService.ts, backend/src/services/installmentSplit.ts, src/screens/finance/expense-dialog/ExpenseRow.tsx, src/screens/finance/expense-dialog/draftRules.ts, backend/src/services/expenseInput.test.ts
- Detalhe: Reabre a decisão do plano de 19/10: só com seu OK. cashPrice opcional no PUT: ausente significa 'não mexe' (nunca zerar o juros), e é recusado com alcance diferente de 'Todas'. O servidor soma as parcelas ativas, calcula o juros total, desconta o já gravado nas pagas ou ligadas à fatura (que não mudam) e divide o restante nas abertas com embeddedInstallmentInterests/splitInterestWithinInstallments (juros nunca passa do valor da parcela). A tela mostra o campo só com 'Todas'; qualquer pré-preenchimento é estimativa. Se você escolher incluir as pagas, mostrar antes os meses e valores que mudam no gráfico. Nenhuma coluna nova: valor_juros já existe. O PUT segue sem apagar anexos e NF (a tela os reenvia). Conferir: parcelada de crédito com 2 parcelas, informar o à vista e ver 'Juros a vencer' no painel.

### Fatia 6: Aviso do que a edição em série muda (só tela)

- Esforço: pequeno a médio
- Arquivos: src/screens/finance/expense-dialog/ExpenseDialog.tsx, src/utils/expenseSeries.ts, backend/src/services/cardLimitService.ts
- Detalhe: Ao escolher 'Esta e as próximas' ou 'Todas' com o valor mudado, mostrar: o novo total da série, quantas parcelas pagas entram e o impacto no limite do cartão (o limite usado soma valor_original das abertas, cardLimitService.ts:85, e muda na hora). Cobre o risco de o valor igual em todas fazer a soma deixar de bater com a compra (centavos de resto da última se perdem).

### Fatia 7: Cobrança e nº de parcelas na edição (fora desta rodada)

- Esforço: grande
- Arquivos: backend/src/services/expenseService.ts, src/screens/finance/expense-dialog/ExpenseRow.tsx, src/screens/finance/expense-dialog/BillingPopover.tsx
- Detalhe: Só se você pedir. Mudar nº de parcelas ou transformar à vista em parcelado cria, apaga ou regrava linhas e mexe em grupo_parcelamento_id, parcela_atual, numero_parcelas e no limite do cartão. Contradiz a decisão de 29/09 (Cobrança só leitura). Precisa de plano próprio. Alternativa que já existe: excluir e lançar de novo.

## Conferências que a análise corrigiu

- Recomendação estava vazia (bloqueador dos dois céticos): reescrita do zero, nas 5 partes, com CERTEZA e DEDUÇÃO separadas e arquivo:linha conferidos no repositório.
- Aceito e confirmado: pagamento automático da despesa à vista (expenseService.ts:65 e 269; draftRules.ts:290 e 353). Virou a fatia 3. Ajuste: a regra veio com o modal novo (2c73b19d, 29/09) e não achei decisão em .plans; o termo 'legado do PUT antigo' dos céticos não foi confirmado e não foi usado.
- Aceito e confirmado: mudar forma ou cartão com alcance em série não passa por trava de crédito nas outras parcelas (a rota só confere a linha editada, routes/expenses.ts:322-333; expenseService.ts:399-408). Fatia 4.
- Aceito e confirmado: a série desloca o vencimento das parcelas pagas sem gravar data_vencimento_original (só overdueExpenses.ts:80 e routes/expenses.ts:635 gravam), e painelCalculos.ts:260 usa essa data para 'em dia/com atraso'. A regra de séries é de 07-08/10 e a de atraso é de 19/10: conflito entre duas decisões. Fatia 4.
- Rejeitado como regra geral: 'excluir pagas do alcance do valor'. Você decidiu em 07/10 que as pagas entram e aceitou o risco (.plans/recorrente-editar-proximas.md:18 e 263-265). Excluí as pagas só de vencimento, forma e cartão (fatia 4) e deixei o valor como decisão sua, com aviso (fatia 6).
- Aceito: editar o valor de linha paga 'exata' regrava o valor pago com o valor novo (draftState.ts:110; expenseService.ts:69). Entrou na fatia 3 e nas decisões.
- Aceito: o à vista não pode ser reconstruído por soma menos juros (dado não existe; série editada dá número errado). A fatia 5 pede o valor ao dono, usa embeddedInstallmentInterests (juros nunca passa da parcela), mexe só em parcelas abertas e fora de fatura, e não precisa de migration. Guardar o à vista em coluna nova ficou como decisão do dono.
- Aceito: cashPrice ausente no PUT significa 'não mexe' (nunca zerar o juros de quem não informou) e é recusado com alcance diferente de 'Todas'. O PUT descarta chaves desconhecidas em silêncio e apaga anexos e NF que a tela não reenviar: virou regra de toda fatia. Recusar chaves desconhecidas fica como possibilidade, sem fatia.
- Aceito com nuance: 'Pago em / Valor pago' também ficam desligados por 'não paga' (ExpenseRow.tsx:306 e 318), mas a caixa 'Já foi paga' só é desligada pelo crédito (ExpenseRow.tsx:295). Por isso a trava do print é o crédito, como dedução.
- Aceito: Cobrança e pagamento no crédito são decisões suas (29/09 e 07/10), não um disabled solto. Proposta: atalho 'Pagar fatura' (fatia 1) e mudança de nº de parcelas fora da rodada (fatia 7). A seção '§12' citada pelo cético não foi confirmada; achei a decisão na linha 249 do arquivo do commit 2c73b19d.
- Aceito: o plano de 19/10 deixou fora o retroativo e o recálculo ao editar o valor. Por isso a fatia 5 depende de decisão sua. A causa do gráfico continua DEDUÇÃO, com a hipótese das migrations em produção listada como não conferida.
- Aceito: informar quais fatias são só tela, servidor sem migration ou fora de rodada (nenhuma exige migration) e que nada é feito antes do seu OK. Ordem das fatias ajustada: texto e atalho, juros na lista, pagamento automático, proteção da série, à vista na parcelada, aviso da série.

## Situação (25/10/2026)

Decisões do dono: fatias 1 a 6 aprovadas ("1"); pagamento no crédito continua só pela fatura, com o atalho "Pagar fatura"; nº de parcelas e Cobrança ficam fora (fatia 7 não entrou). Nas demais decisões vale a recomendação da análise. Sem migration e sem coluna nova.

Implementado (ainda sem commit no momento desta nota):

- **Fatia 1:** atalho "Pagar fatura de mmm/aaaa" na linha de resumo da edição (despesa em aberto no crédito com cartão; o mês é o do vencimento) e o motivo da Cobrança fixa na dica do campo e no rodapé. Conferido no navegador: o atalho abre o pagamento da fatura do cartão certo.
- **Fatia 2:** "inclui R$ X de juros" na lista, no cartão do celular e no resumo da edição, só para parcela de compra parcelada (fora as linhas geradas pela fatura, a compra renegociada e a cancelada). O "+ R$" do pago a mais continua separado.
- **Fatia 3:** a edição não religa "paga" sozinha (pagamento automático só na criação, servidor e tela, `expensePayment.ts`). Em parcela paga, a tela reenvia o valor pago gravado: corrigir o valor não reescreve o que foi pago.
- **Fatia 4:** em "Esta e as próximas" e "Todas", as parcelas pagas ficam fora de vencimento, forma e cartão; o servidor recusa trocar uma despesa **paga** para crédito com cartão (`paidCreditRefusal`). Desvio da análise: a recusa vale também para a despesa **única** paga (a análise só citava parcelas); sem isso, uma única paga em PIX passava para o crédito sem fatura.
- **Fatia 5:** `cashPrice` opcional no PUT (ausente não mexe; só com "Todas"; só em compra parcelada). O juros das parcelas abertas é refeito (`recalculatedInstallmentInterests`): paga e da fatura mantêm o juros, o valor novo da mesma edição já vale e o juros nunca passa do valor da parcela. A resposta traz `interestUpdated`. Tela: campo "À vista (opcional)" só com "Todas", sem pré-preencher, com a prévia do juros.
- **Fatia 6:** aviso do que o valor novo faz na série (novo total da compra, parcelas pagas atingidas e, no crédito com cartão, o impacto no limite).

Validação: front 366 testes, backend 681 testes, 14 testes de banco de finanças (6 novos, em Postgres local), tipos do front e do backend e build do front sem erro. Conferência ponta a ponta no navegador contra o backend e um Postgres descartável: editar a compra 3 × R$ 35,00 para R$ 40,00 com à vista de R$ 90,00 gravou R$ 10,00 de juros em cada parcela e a lista passou a mostrar "inclui R$ 10,00 de juros".

Fora desta entrega (sugestões, sem decisão): barra de "juros a vencer" por mês no gráfico do Painel; mudar nº de parcelas ou a Cobrança (fatia 7, plano próprio); atalho "Pagar fatura" na edição aberta pelo calendário (só a lista de Movimentações o oferece); atalho nas linhas geradas pela fatura ainda em aberto.

Pendente do dono: testar na tela real e decidir o commit, o push e o merge (CLAUDE.md, /finalizar).
