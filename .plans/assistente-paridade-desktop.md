# Plano de Implementação: Juca grava despesas como o desktop e passa a pagar

## Origem

- **Arquivo de especificação:** não houve `.md` de entrada. O pedido veio de uma conversa direta com o usuário em 2026-10-02.
- **Contexto do pedido:** surgiu depois da análise do valor pago × previsto (`.plans/valor-efetivo-despesas.md`). O usuário pediu: "o assistente deve ter o mesmo comportamento de registro que o desktop, pois os dados vão para a mesma tabela".
- **Data do planejamento:** 2026-10-02.
- **Classificação:** `fullstack` (frontend + backend). Não muda o esquema do banco nem as variáveis de ambiente.

## Resumo

Hoje o card do assistente (Juca) monta a despesa a partir de regras próprias e diverge do desktop em vários pontos:
- **Valor do parcelado multiplicado:** "3000 em 10x" grava 10 parcelas de R$ 3.000.
- **Datas vazias travam o Salvar.**
- **Vencimento no crédito:** usa a data da compra, e não o vencimento da fatura.
- **Data do pagamento:** não existe "Pago em".
- **Parcelas já pagas:** entram sempre pelo valor previsto.

Também não há como pagar uma despesa que já foi lançada.

Com o plano, o card passa a gravar pela mesma função do modal do desktop (`buildCreateInput`, em `src/screens/finance/expense-dialog/draftRules.ts`). Com uma regra só, as duas telas deixam de divergir. Além disso, o assistente ganha o chip "Pagar despesa". Ele mostra um card de pagamento no mesmo formato do card de despesa e grava pela mesma rota do botão "Pagar" do desktop (`POST /expenses/:id/pay`).

## Decisões do usuário (2026-10-02)

1. **Formato do "Pagar despesa":** o mesmo card do print do usuário, ou seja, a frase vira um card para conferir e salvar.
2. **Como o assistente sabe que é pagamento:** pelo chip "Pagar despesa" no menu, ao lado de "Lançar despesa", "Lançar receita" e "Consultar".
3. **Frase sem o chip:** "paguei a luz 121,29" continua lançando uma despesa nova, como hoje, sem aviso. Só o chip paga.
4. **Parcelas já pagas:** o card ganha uma lista de parcelas, como a grade do desktop. Cada parcela tem "paga", "Pago em" e "Valor pago", e há um aviso para as vencidas. No crédito, só "paga".

## Escopo

### Dentro do escopo

- **Valor do parcelado:** o card de despesa grava pelas regras do desktop, e o valor do parcelado passa a ser o **total**.
- **Datas:**
  - sem data na frase, a data da compra fica como hoje;
  - o vencimento em branco é calculado como no desktop: pela fatura do cartão no crédito, pelo dia do mês no recorrente e pela data da compra nos demais casos.
- **Despesa paga** (única ou recorrente): ganha "Pago em" e mostra juros ou desconto.
- **Linha de situação** igual à do desktop (`summarizeDraft`).
- **Parcelado:**
  - a linha "Parcelas" mostra "10x de R$ 300,00 · N de 10 pagas" e abre a lista de parcelas;
  - saem do parcelado os campos "Esta despesa já foi paga", "Valor pago" e "N já pagas".
- **Validação ao salvar** igual à do desktop (`validateDraft`): passam a ser obrigatórios a categoria e, no crédito, o cartão, quando existe algum cartão compatível.
- **Leitor de frases (servidor):**
  - quando o "de X" vem depois do número de parcelas ("10x de 300"), X é o valor da parcela e vira o total;
  - o leitor passa a entender "ontem".
- **Chip "Pagar despesa":**
  - lista as despesas em aberto, com busca por nome no chat;
  - abre o card de pagamento;
  - grava pela rota do desktop.
- **Menu do chip:** o chip entra no menu padrão, e o servidor completa no menu salvo o chip que faltar, sem gravar no banco.
- **Editor do fluxo:** passa a reconhecer a intenção nova, que fica sem ligação com as perguntas.
- **Medição na produção, só leitura,** de compras parceladas que foram gravadas com o valor multiplicado.

### Fora do escopo

- **Receitas.** Achado: a receita também trava em "Informe a data antes de salvar." quando a frase não tem data. A correção é a mesma e pode virar outra entrega.
- **Consultas e leitura de anexos.** O rascunho que vem de um anexo passa pelas mesmas regras ao salvar, sem trabalho extra.
- **Pagar a fatura inteira do cartão.**
- **Pagar a despesa de outra pessoa da conta.** Achado: a rota de pagar só aceita `usuario_id = req.user.id`, enquanto editar e excluir usam `resolveOwnerForWrite`, que considera a permissão de editar a carteira. O assistente segue a rota de pagar, e alinhar a rota fica fora.
- **Ajustar o valor previsto de uma parcela específica** (`installmentAdjustments`). Continua só no desktop.
- **Aviso "você tem X em aberto"** quando a frase é escrita sem o chip (decisão 3).
- **Checagem de duplicata no servidor** (`duplicateQuery` do desktop). O card mantém a checagem local dele.
- **Correção de dados que a medição da Fase 0 encontrar.** Fica para o usuário decidir à parte.
- **Remover o código do fluxo guiado.** Ele continua fora do produto, preservado de propósito (`.plans/card-preenchido-no-assistente.md`).

## Leitura de contexto

- `/AGENT.md`: lido. Descreve um sistema multi-prefeitura com RLS, que **não corresponde a este projeto**. Foram aplicadas só as regras transversais: nada de `any`, nada de catch silencioso, nomes explícitos, Drizzle, React Query com query keys centralizadas e nunca executar migration sem confirmação.
- `/CLAUDE.md`: fluxo obrigatório `/planejar → aprovação → /implementar → /finalizar`. Migrations e `.env` só com confirmação.
- `frontend/AGENT.md` e `backend/AGENT.md`: **não existem** neste projeto.
- **Arquivos inspecionados:**
  - Assistente (frontend): `src/components/financial-assistant/FinancialAssistant.tsx`, `src/types/financialAssistant.ts`, `src/types/financialCopilot.ts`, `src/services/assistantFlowService.ts`, `src/services/assistantService.ts`.
  - Modal do desktop: `src/screens/finance/expense-dialog/{draftRules,draftState,ExpenseRow,InstallmentsPopover}.ts(x)`, `src/screens/finance/PaymentModal.tsx`, `src/screens/finance/LancamentosTable.tsx`.
  - Utilitários e editor do fluxo: `src/services/financeService.ts`, `src/utils/expenseSchedule.ts`, `src/utils/screenAccess.ts`, `src/screens/config/fluxo/{flowValidation.ts,FluxoAssistenteTab.tsx}`.
  - Copiloto e leitor de frases (backend): `backend/src/services/{financialCopilot,copilotIntent,assistantSlotSession,assistantSlotParser,financialAssistant}.ts`.
  - Fluxo, consultas e despesas (backend): `backend/src/services/{assistantFlowSchema,assistantFlowDefault,assistantFlowStore,assistantQueries,expenseService}.ts`.
  - Rotas, permissões e esquema (backend): `backend/src/routes/{assistant,assistantFlows,expenses}.ts`, `backend/src/middleware/permissions.ts`, `backend/src/utils/familyVisibility.ts`, `backend/src/db/schema/{expenses,copilot}.ts`, `backend/src/server.ts`.

## Achados da investigação (verificados no código em 2026-10-02)

| # | Achado | Onde |
|---|---|---|
| 1 | O fluxo guiado está fora do produto desde 2026-09-15 (`f7ddd1fc`). A frase vira o card (`runSlotFlow` → `readDraftFromMessage`). Do fluxo salvo em `assistant_flows`, só a **abertura** ainda é usada (saudação e chips). | `financialCopilot.ts` `runSlotFlow`; `routes/assistantFlows.ts` `GET /abertura` |
| 2 | `comAberturaPadrao` só preenche a abertura quando ela falta inteira. Por isso, um fluxo salvo com abertura própria não mostraria um chip novo. | `assistantFlowDefault.ts:258` |
| 3 | O card trata o Valor como valor da parcela, e o salvamento repete esse valor em todas as parcelas. Com "3000 em 10x", grava 10 × R$ 3.000. O desktop divide o total (`installmentAmounts`). | `FinancialAssistant.tsx:1014-1024` |
| 4 | Sonda do leitor: "comprei um celular 3000 em 10x no credito" → 3000/10. "tênis 600 em 3x" → 600/3. "notebook de 4.500,00 em 12 parcelas" → 4500/12. Nos três, o valor é o total, e hoje o salvamento multiplica. "parcelei a tv em 12 vezes de 250" → 250/12: é o valor da parcela, e hoje grava certo. "geladeira em 10x no credito de 300 reais" → 300/10. "10x de 300 no cartão" → valor null e descrição "cartã". "luz ontem" → data null. | `assistantSlotParser.ts` `seedDraftFromMessage` |
| 5 | Sem data na frase, o card abre com as datas vazias, e o Salvar recusa com "Informe a data antes de salvar.". O desktop usa hoje como data da compra (`purchaseDateIso`) e calcula o vencimento (`computedDueDate`). | `FinancialAssistant.tsx:961-966` |
| 6 | No crédito, sem vencimento digitado, o card usa a data da compra. O desktop usa o vencimento da fatura (`invoiceDueDate`). | `draftRules.ts:83-90` |
| 7 | Na despesa paga, o card grava `paymentDate: null`, e o servidor assume o vencimento. No desktop, "Pago em" vem como hoje ao marcar "paga". | `FinancialAssistant.tsx:1032`; `ExpenseRow.tsx:153-155` |
| 8 | No parcelado, o card mostra "Esta despesa já foi paga" e "Valor pago", mas ignora os dois ao salvar. "N já pagas" marca as N primeiras parcelas pelo valor previsto, com a data do vencimento. | `FinancialAssistant.tsx:1541-1586` |
| 9 | O `validateDraft` do desktop exige categoria e, no crédito, o cartão, quando existe cartão compatível. O card aceita "Sem categoria". | `draftRules.ts:347-375` |
| 10 | O "Pagar" do desktop abre o `PaymentModal`: data de pagamento com hoje, valor pago com o previsto, aviso de "Acréscimo de" ou "Economia de", e mostra o valor original e o vencimento. Ao confirmar, chama `pagarDespesa` → `POST /expenses/:id/pay`, que filtra `usuario_id = req.user.id` e grava `valor_pago = COALESCE(valor, valor_original)`. | `PaymentModal.tsx`; `routes/expenses.ts:428` |
| 11 | O `flowValidation.ts` trata como despesa ou receita qualquer intenção que não seja `ask`. O `FluxoAssistenteTab.tsx` liga ao nó Consulta toda intenção que não seja de registro. | `flowValidation.ts:205-210`; `FluxoAssistenteTab.tsx:121-130` |
| 12 | Os chips são filtrados por `allowedAssistantIntents`, e "Lançar despesa" depende de `accessExpenses`. | `screenAccess.ts:152` |
| 13 | `/api/expenses` exige `accessExpenses`, e `/api/assistant` exige `accessAssistant`. | `server.ts:115,145` |
| 14 | `extractDateFromText` entende hoje, amanhã, ISO, dd/mm e "dia N", mas não "ontem". | `financialAssistant.ts:331` |
| 15 | Restaurar uma conversa não reabre o rascunho. Por isso, o card de pagamento não precisa ser restaurado. | `FinancialAssistant.tsx:874-895` |
| 16 | `expenses.status` vale `'ativa'` ou `'cancelada'`, e toda leitura financeira filtra por ele. As parcelas têm `parcela_atual`, `numero_parcelas` e `grupo_parcelamento_id`. | `db/schema/expenses.ts` |

## Impacto por área

### Frontend

**Card de despesa** (`FinancialAssistant.tsx` e arquivos novos na mesma pasta):

- **Novo `src/components/financial-assistant/cardDraft.ts`.** É lógica pura, sem React, com teste em `cardDraft.test.ts`.
  - `fillExpenseDefaults(draft, todayIso)`: na despesa sem `date`, preenche `date = todayIso`. Se a despesa estiver paga e sem `paymentDate`, usa `paymentDate = date` (o dia da frase ou hoje).
  - `toExpenseDraft(draft, { categories })`: converte o rascunho do assistente no `ExpenseDraft` do desktop.
    - `amountCents`: o total, convertido com `toCents`.
    - `billingType`: `nao` → `single`, `parcelas` → `installments`, `mensal` → `monthly`.
    - `installmentCount`.
    - `installmentPayments`, `paid`, `paymentDate` e `amountPaidCents`.
    - `categoryId`: vem do nome, com a mesma comparação de hoje (`normalizeComparable`).
    - Datas: ISO → dd/mm/aaaa com `isoToBrDate`. O `dueDate` fica `''` quando não foi digitado, porque vazio significa calculado.
    - `recurrenceDay`: o dia do vencimento digitado; senão, o dia da data da compra.
    - Valores fixos: `installmentAdjustments: {}`, `knowsCashPrice: false` e `paymentMethodTouched: true`.
    - Também passa anexos, nota fiscal e `overdueDismissed`.
  - `buildExpenseSave(draft, ruleContext, categories, accountId)`: roda `validateDraft`. Se houver erro, devolve `errorMessage`. Se não houver, devolve `buildCreateInput(...)`.
- **Novos campos opcionais em `FinancialAssistantDraft`** (`src/types/financialAssistant.ts`), usados só pelo frontend:
  - `paymentDate?: string | null` (ISO);
  - `installmentPayments?: Record<number, InstallmentPaymentDraft>`, no mesmo formato do desktop (dd/mm/aaaa e centavos), para reaproveitar `installmentGrid` e `markOverdueAsPaid` sem conversão;
  - `overdueDismissed?: boolean`.
- **`RuleContext` do card:** `{ todayIso: getLocalTodayIso(), cards: cartões ativos }`. Os cartões vêm da mesma query do modal (`queryKeys.cartoes(undefined, 'familia')`), que o assistente já usa.
- **Mudanças no card:**
  - **Rótulo do valor:** "Valor total" no parcelado.
  - **Datas:** a data da compra já vem preenchida (`fillExpenseDefaults` roda quando o rascunho chega, em `handleSend`). O vencimento em branco é calculado.
  - **Linha de situação** com `summarizeDraft`: status, vencimento, total e badges ("+ R$ X de multa e juros", "R$ X de desconto", "N vencidas em aberto").
  - **Despesa paga** (única ou recorrente):
    - a linha "Pago em" (input date) fica junto de "Valor pago";
    - ao marcar "paga", "Pago em" recebe hoje se estiver vazio, como no `togglePaid` do desktop;
    - ao desmarcar, "Pago em" e "Valor pago" são limpos.
  - **Parcelado:**
    - a linha "Parcelas" mostra o campo de quantidade e o resumo "10x de R$ 300,00 · N de 10 pagas[ · M vencidas]";
    - tocar no resumo abre ou fecha a `InstallmentList`;
    - o parcelado não mostra mais "Esta despesa já foi paga" nem "Valor pago".
- **Novo `src/components/financial-assistant/InstallmentList.tsx`:**
  - **Linhas:** vêm de `installmentGrid(expenseDraft, ruleContext)`. Cada uma mostra "Nª · vence dd/mm · R$ x · [paga]", mais o `status` com o `tone` da linha.
  - **Parcela paga fora do crédito:** aparecem "Pago em" (input date, convertendo ISO ↔ dd/mm/aaaa) e "Valor pago" (vazio significa o valor da parcela).
  - **Marcar e desmarcar:** a mesma lógica do `togglePaid` do `InstallmentsPopover`. Ao marcar, cria `{ paymentDate: vencimento, amountPaidCents: null }`; ao desmarcar, remove.
  - **Aviso das vencidas:** aparece quando `overdueOpenCount > 0 && !overdueDismissed`. Texto: "N parcelas já venceram. Já foram pagas?", com os botões [Marcar como pagas no vencimento] (`markOverdueAsPaid`) e [Deixar em aberto] (`overdueDismissed = true`).
  - **"Limpar pagamentos":** aparece quando há parcelas pagas.
  - **Crédito com cartão:** o cabeçalho diz "no cartão X · marque as faturas pagas", e cada parcela tem só a caixa "paga".
- **`handleSave` da despesa:** passa a ser `createExpense(buildExpenseSave(...))`. Um erro de validação aparece em `setError`, com o texto do desktop. A receita continua igual, inclusive com a recusa de data.
- **`findDuplicate`:**
  - no parcelado, compara o valor da primeira parcela (`installmentAmounts(expenseDraft)[0]`), e não o total;
  - a data usada passa a ser o vencimento efetivo (`effectiveDueDate`).
- **`buildReceiptRows`** (resumo depois de salvar):
  - **Parcelado:** "Total R$ 3.000,00 · 10x de R$ 300,00" e "Parcelas pagas: N de 10".
  - **Despesa paga:** "Pago em".
  - **Vencimento:** o efetivo.

**Pagar despesa:**

- **Tipos:**
  - `FinancialCopilotIntentHint` e `FlowIntent` ganham o valor `'pay_expense'`;
  - `FinancialCopilotResponse.mode` ganha `'payment'`;
  - entra o campo `payment?: { candidates: PaymentCandidate[]; amountPaid: number | null; paymentDate: string | null }`;
  - entra o tipo `PaymentCandidate`: `{ id, descricao, valor, vencimento, parcelaAtual, totalParcelas, formaPagamento, vencida }`.
- **`screenAccess.allowedAssistantIntents`:** passa a incluir `'pay_expense'` quando há `accessExpenses`, logo depois de `register_expense`.
- **Chip:**
  - `ABERTURA_PADRAO` ganha `{ intent: 'pay_expense', label: 'Pagar despesa', abertura: 'Qual despesa você pagou?' }`, na segunda posição;
  - `INTENT_ICONS` ganha um ícone de pagamento do lucide;
  - `WELCOME_CHIP_CLASS_BY_INTENT` ganha uma cor própria, azul ou ciano, diferente do vermelho, do verde e do âmbar. É preciso atualizar o comentário "os três".
- **`selectIntent('pay_expense')`:**
  - mostra as mensagens locais, como os outros chips;
  - busca `fetchDespesasEmAberto(getActiveAccountId())` (React Query, `queryKeys.despesasEmAberto(contaId)`);
  - mostra até 8 botões de despesa, mais o botão "Voltar".
- **Modo pagamento:**
  - O `intentHint` continua `'pay_expense'` enquanto nenhum card de pagamento for salvo ou descartado e enquanto não houver "Voltar". Assim, o que o usuário digitar continua sendo busca de pagamento. Hoje o `handleSend` limpa o `intentHint` depois de toda resposta; no modo `'payment'`, não deve limpar.
  - **Resposta `mode: 'payment'`:** se houver exatamente um candidato, o card de pagamento abre direto. Com mais de um, os candidatos viram botões. Rótulos: "Luz · R$ 99,00 · vence 10/10"; numa parcela, "TV 3/10 · …".
  - **Tocar num botão:** abre o card localmente, usando `amountPaid` e `paymentDate` da última resposta de pagamento, se houver.
  - **"Voltar":** sai do modo pagamento e devolve o menu, com a mesma mensagem de quem descarta.
  - O card de despesa e o card de pagamento nunca aparecem juntos.
- **Novo `src/components/financial-assistant/PaymentCard.tsx`:** usa o mesmo visual do card de despesa (cabeçalho, linhas com rótulo de 92px e botões Salvar e Descartar).
  - **Cabeçalho:** "Pagamento", com o badge "Vencida" quando for o caso.
  - **Campos só de leitura:** Despesa (descrição, com "3/10" se for parcela), Vencimento e Valor previsto.
  - **Campos editáveis:**
    - Valor pago: vem com o valor da frase ou, se não houver, com o previsto;
    - Pago em: vem com o dia da frase ou, se não houver, com hoje.
  - **Diferença:** "Acréscimo de R$ X" ou "Economia de R$ X", no texto do `PaymentModal`.
  - **Validação:** valor pago maior que 0 e data válida.
  - **Salvar:**
    - chama `pagarDespesa(id, pagoEm, valorPago)`;
    - invalida as queries de despesa e do dashboard, como o salvamento atual faz;
    - mostra a mensagem "Prontinho, pagamento registrado!" com o resumo (Despesa, Valor pago, Pago em e a diferença) e `showWelcomeActions`;
    - sai do modo pagamento.
  - **Descartar:** funciona igual ao `discardDraft` e sai do modo pagamento.
- **`financeService.ts` e `queryKeys.ts`:** ganham `fetchDespesasEmAberto(contaId)` e `despesasEmAberto(contaId)`.

**Editor do fluxo:**

- **`flowValidation.ts`:** `pay_expense` é ignorado na checagem, como `ask`.
- **`FluxoAssistenteTab.tsx`:**
  - o destino passa a ser explícito: `ask` → Consulta, `pay_expense` → sem ligação;
  - a opção continua aparecendo no bloco da abertura.

**Estados:**
- **Lista em aberto:**
  - enquanto carrega, mostra "digitando…";
  - se der erro, mostra a mensagem do servidor;
  - se estiver vazia, mostra "Você não tem despesas em aberto." e devolve o menu.
- **Pagamento:** se der erro, mostra a mensagem e mantém o card aberto.

### Backend

- **`assistantFlowSchema.ts`:** `FLOW_INTENTS` ganha `'pay_expense'`.
- **`copilotIntent.ts`:** `CopilotIntentHint` ganha `'pay_expense'`. A intenção de pagamento é desviada antes de chegar a `inferDeterministicCopilotIntent`, que fica igual.
- **`routes/assistant.ts`:** `asIntentHint` passa a aceitar `'pay_expense'`. Qualquer outro valor continua respondendo 400.
- **`assistantFlowDefault.ts`:**
  - a abertura padrão ganha a opção "Pagar despesa" depois de "Lançar despesa";
  - `comAberturaPadrao` passa a completar uma abertura salva com as opções padrão cujas intenções estejam faltando, na posição do padrão;
  - as opções salvas ficam intactas, inclusive os textos;
  - nada é gravado no banco: a linha só muda quando o dono salvar no editor.
- **Novo `backend/src/services/assistantPayment.ts`,** com teste:
  - **`listOpenExpenses(scope, { until? })`:**
    - lê com Drizzle, filtrando `userId = scope.userId` e a conta (pessoal: a conta ou `null`; empresa: a conta), como `expenseAll` de `assistantQueries`;
    - filtra também `paid = false` e `status = 'ativa'` e, quando houver `until`, `dueDate <= until`;
    - ordena por `dueDate` crescente.
  - **`nextOpenPerGroup(rows)`:** em cada `installmentGroupId`, mantém só a parcela em aberto mais antiga.
  - **`matchOpenExpenses(message, rows)`:** é função pura.
    - Normaliza o texto (NFD, sem acento, minúsculas).
    - Ignora números, valores, datas e palavras de ligação ou de verbo, como "paguei", "pagar", "quitei", "conta", "de", "da", "do", "a", "o", "reais", "ontem", "hoje" e "no".
    - Pontua cada despesa pelos termos que aparecem na descrição e devolve as de maior pontuação, ordenadas pelo vencimento.
    - Diz também se a mensagem tinha algum termo de busca.
- **`routes/expenses.ts`, nova rota `GET /em-aberto?conta_id=&limite=`:**
  - fica junto dos outros `GET`, porque não existe `GET /:id` que a capture;
  - resolve a conta com `resolveFinancialAccount(req.user.id, conta_id)`;
  - busca `listOpenExpenses` até o fim do mês corrente (no fuso do servidor, `getTodayIsoInTimezone`), aplica `nextOpenPerGroup` e limita o resultado (padrão 8, máximo 50);
  - `accessExpenses` já vem exigido na montagem do router;
  - devolve uma lista de `PaymentCandidate`.
- **`financialCopilot.ts`:**
  - a resposta ganha `mode: 'payment'` e o campo `payment`;
  - em `runFinancialCopilot`, logo depois de gravar a mensagem do usuário, `intentHint === 'pay_expense'` desvia para `runPayFlow`. Esse desvio vem antes da consulta por IA e da inferência de intenção.
- **`runPayFlow`:**
  1. Sem `hasScreenAccess(userId, 'accessExpenses')`, responde que não há acesso às despesas, com `mode: 'help'` e sem candidatos.
  2. Lê o valor com `extractAmountFromText` e a data com `extractDateFromText`.
  3. Busca as despesas em aberto, sem limite de data, e aplica `nextOpenPerGroup`. Em seguida, roda `matchOpenExpenses`.
  4. O resultado é:
     - um candidato: "Achei. Confira e salve o pagamento.";
     - vários: "Achei mais de uma. Qual delas?", com até 8 candidatos;
     - nenhum com termo de busca: "Não achei despesa em aberto com esse nome. Estas são as próximas:", com a lista até o fim do mês;
     - sem termo de busca, só valor ou data: "Qual delas?", com a lista até o fim do mês;
     - nenhuma despesa em aberto: "Você não tem despesas em aberto.".
  5. Grava a mensagem do assistente com o payload `{ mode: 'payment' }`. No modo voz, gera o `spokenReply`. Registra o uso como determinístico (`recordUsageQuietly`).
  6. Nenhuma escrita financeira acontece no chat.
- **Leitor de frases:**
  - **`assistantSlotParser.ts` (`seedDraftFromMessage`):**
    - Quando há "de X" **depois** do marcador de parcelas, X é o valor da parcela, e o rascunho guarda `amount = N × X` (o total). Vale para "10x de 300", "12 vezes de 250", "10 parcelas de 300" e "em 10x no crédito de 300 reais".
    - Quando o valor vem **antes** do marcador ("3000 em 10x", "de 4.500,00 em 12 parcelas"), continua sendo o total.
    - Corrigir a descrição "cartã" em "10x de 300 no cartão": nesse caso ela deve ficar `null`.
  - **`financialAssistant.ts` (`extractDateFromText`):** passa a entender "ontem" como hoje − 1, no fuso do servidor.
- **Fase 1, sem leitor:** `slotDraftToAssistantDraft` deixa de mapear `paidInstallments`, e o campo sai do tipo da resposta caso fique sem leitor. O `SlotDraft.paidInstallments` do fluxo guiado preservado **fica**.

### Banco de dados

`Sem impacto esperado.` Não há tabela, coluna nem índice novos, e nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

A **medição da Fase 0** é só leitura na produção. Ela segue o padrão dos scripts de conferência anteriores: confere que a URL é da produção, roda só `SELECT` e não abre transação de escrita.

### Infra/Deploy

`Sem impacto esperado.` Não há variável de ambiente nova, job, worker nem mudança no Render.

O frontend e o backend sobem separados no deploy. Se o frontend novo chegar antes, tocar em "Pagar despesa" responde "Comando da assistente inválido." por alguns minutos. O frontend antigo continua compatível com o backend novo.

## Arquivos provavelmente afetados

### Frontend

- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/components/financial-assistant/cardDraft.ts` (novo) e `cardDraft.test.ts` (novo)
- `src/components/financial-assistant/InstallmentList.tsx` (novo)
- `src/components/financial-assistant/PaymentCard.tsx` (novo)
- `src/types/financialAssistant.ts`
- `src/types/financialCopilot.ts`
- `src/services/assistantFlowService.ts`
- `src/services/financeService.ts`
- `src/services/queryKeys.ts`
- `src/utils/screenAccess.ts`
- `src/screens/config/fluxo/flowValidation.ts`
- `src/screens/config/fluxo/FluxoAssistenteTab.tsx`
- `package.json`: o script `test` passa a incluir `src/components/financial-assistant/*.test.ts`.

### Backend

- `backend/src/services/assistantFlowSchema.ts`
- `backend/src/services/assistantFlowDefault.ts`
- `backend/src/services/copilotIntent.ts`
- `backend/src/routes/assistant.ts`
- `backend/src/services/financialCopilot.ts`
- `backend/src/services/assistantPayment.ts` (novo) e `assistantPayment.test.ts` (novo)
- `backend/src/routes/expenses.ts`
- `backend/src/services/assistantSlotParser.ts`
- `backend/src/services/financialAssistant.ts`
- Testes existentes que serão ampliados: `assistantSlotFilling.test.ts` (frases), `assistantFlowEngine.test.ts` ou o teste do `comAberturaPadrao` (abertura) e `financialAssistant.test.ts` ("ontem").

## Estratégia de implementação

### Fase 0: preparar

1. A branch atual, `fix/R/valor-efetivo-despesas`, já está na `main`. Rodar `git checkout main`, `git pull origin main` e `git checkout -b feat/R/assistente-paridade-desktop`.
2. **Medição na produção, só leitura.** Script no scratchpad.
   - Selecionar em `copilot_mensagens` as mensagens com `papel = 'assistant'`, `payload->>'mode' = 'draft'` e `payload->'draft'->>'billingType' = 'parcelas'`, com junção em `copilot_conversas` (usuário).
   - Para cada uma, trazer a mensagem do usuário imediatamente anterior (a frase) e as despesas `parcelado = true` do mesmo usuário criadas até 2 h depois. Elas precisam ter a mesma `numero_parcelas`, `valor_original = draft.amount` e a descrição parecida.
   - Mostrar ao usuário quantas são, a frase e o que foi gravado (N × valor).
   - Se `copilot_mensagens` não existir na produção, avisar e seguir.
   - Não corrigir nada.

### Fase 1: remover

1. Em `FinancialAssistant.tsx`, no ramo de despesa do `handleSave`, remover:
   - a montagem de `fields`;
   - o parcelado com `paidInstallments` e o valor previsto;
   - o `paymentDate: null` fixo;
   - a recusa de data só da despesa;
   - o import de `installmentDueDates`, que fica sem uso.
2. No card, remover o campo "N já pagas" e o bloco "Esta despesa já foi paga" / "Valor pago" quando a cobrança for parcelada. O bloco continua para a despesa única e a recorrente e será reescrito na Fase 2.
3. Em `buildReceiptRows`, remover as linhas de despesa que mudam: Valor, Parcelas, Pago e Valor pago.
4. No frontend e no backend, remover `paidInstallments` do rascunho do card e o mapeamento em `slotDraftToAssistantDraft`, caso fiquem sem leitor. O fluxo guiado preservado fica intacto.

### Fase 2: aplicar

**A. Gravação igual à do desktop (frontend)**

1. `cardDraft.ts` com `fillExpenseDefaults`, `toExpenseDraft` e `buildExpenseSave`, com testes.
2. Os novos campos opcionais em `FinancialAssistantDraft`.
3. O card:
   - o rótulo "Valor total";
   - as datas preenchidas;
   - a linha de situação;
   - "Pago em";
   - o resumo das parcelas, com `InstallmentList`.
4. O `handleSave` da despesa passa a usar `buildExpenseSave`, e o `findDuplicate` passa a usar o valor da parcela e o vencimento efetivo.
5. Reescrever `buildReceiptRows` para a despesa.

**B. Leitor de frases (backend)**

1. O "de X" depois do marcador de parcelas passa a gerar o total, e a descrição "cartã" é corrigida.
2. "ontem" em `extractDateFromText`.
3. Testes das frases da sonda (achado 4).

**C. Pagar despesa**

1. Backend:
   - intenção `pay_expense` (schema, tipo e rota do chat);
   - abertura padrão e `comAberturaPadrao` completando o que falta;
   - `assistantPayment.ts`;
   - `GET /expenses/em-aberto`;
   - `runPayFlow` em `financialCopilot.ts`;
   - testes.
2. Frontend:
   - tipos;
   - `allowedAssistantIntents`;
   - chip (padrão, ícone e cor);
   - `fetchDespesasEmAberto` e query key;
   - modo pagamento em `FinancialAssistant.tsx`;
   - `PaymentCard.tsx`.
3. Editor do fluxo: `flowValidation.ts` e `FluxoAssistenteTab.tsx`.

### Fase 3: validar

1. Rodar `npx tsc --noEmit`, `npm test`, `npx vite build`, `npm --prefix backend run build` e `npm --prefix backend test`.
2. **Roteiro local.**
   - Subir o backend na porta 3013 com `DOTENV_CONFIG_PATH=../.env.dev` e o preload `mock-emailjs.mjs`, como nos roteiros anteriores, usando o banco local.
   - Casos:
     - `GET /expenses/em-aberto`:
       - mostra só as suas despesas da conta ativa, não pagas e ativas;
       - respeita a janela, a ordem, a próxima parcela por grupo e o limite;
       - um membro sem `accessExpenses` recebe 403.
     - Chat com `intent_hint: 'pay_expense'`:
       - "luz 121,29": um candidato e `amountPaid` 121,29;
       - "luz ontem": `paymentDate` igual a ontem;
       - várias correspondências;
       - nenhuma correspondência;
       - só o valor;
       - nenhuma despesa em aberto;
       - sem `accessExpenses`, a recusa.
     - `POST /expenses/:id/pay` grava `valor_pago` e `data_pagamento`.
     - Um `intent_hint` inválido continua respondendo 400.
     - `GET /assistant-flows/abertura` devolve as 4 opções mesmo com um fluxo salvo de abertura própria. Gravar esse fluxo de teste no banco local e restaurar o original no fim.
     - `POST /expenses` com a entrada montada pelo card (`buildExpenseSave`) para "3000 em 10x": o servidor grava 10 parcelas de R$ 300.
   - Limpar com `cleanup_roteiro.cjs`.
3. **Teste básico do card em jsdom,** se for viável com a API simulada:
   - a frase do print salva sem digitar data;
   - o parcelado mostra "10x de R$ 300,00" e a lista;
   - o chip "Pagar despesa" leva aos botões, ao card e ao salvamento, que chama `/expenses/:id/pay`.

   Se não for viável, registrar o motivo.
4. Depois do deploy, o usuário confere no celular.

## Regras de negócio identificadas

- **Parcelado:** o valor do card é o **total**, dividido como no desktop: em centavos, com o resto na última parcela.
- **"de X" na frase:** quando vem depois do número de parcelas, X é o valor da parcela. Quando o valor vem antes, é o total.
- **Data da compra:** sem data na frase, é hoje.
- **Vencimento em branco:** é calculado. No crédito com cartão, é o vencimento da fatura. Na despesa recorrente, é o dia do mês na data da compra. Nos demais casos, é a data da compra.
- **"Pago em" da despesa única ou recorrente:** vem com o dia da frase ou, se não houver, com hoje.
- **Parcela marcada como paga:** "Pago em" vem com o vencimento. "Valor pago" vazio significa o valor da parcela.
- **Parcela no crédito:** quando paga, usa o vencimento e o valor previsto, e não oferece campos, como no desktop.
- **Salvar:** exige descrição, categoria e valor. No crédito, exige também o cartão, quando existe cartão compatível.
- **Pagamento:** usa a mesma rota e os mesmos padrões do desktop. A data do pagamento vem com hoje (ou o dia da frase) e o valor pago com o previsto (ou o valor da frase). A diferença aparece como acréscimo ou economia.
- **Lista ao tocar no chip:** até 8 despesas em aberto, primeiro as vencidas e depois as do mês corrente. Numa compra parcelada, só a próxima parcela em aberto.
- **Busca pelo chat:** procura entre todas as despesas em aberto, sem limite de data, sempre com a próxima parcela por grupo.
- **Frase sem o chip:** continua lançando uma despesa nova (decisão 3).
- **Chip "Pagar despesa":** aparece só para quem tem `accessExpenses`.

## Regras multi-tenant e segurança

- O projeto **não é multi-tenant**: não há prefeitura nem RLS. O isolamento é por usuário e por conta.
- **Usuário e conta:** o usuário vem da sessão (`req.user.id`). A conta passa por `resolveFinancialAccount`, que valida se a conta pedida pertence ao usuário. O cliente nunca define o escopo.
- **Despesas listadas:** `GET /expenses/em-aberto` e `runPayFlow` listam só as despesas do próprio usuário (`usuario_id = req.user.id`), que é o mesmo critério da rota de pagar. Assim, nenhum candidato listado devolve 404 ao pagar.
- **Permissão:** `/api/expenses` já exige `accessExpenses`. O chat exige `accessAssistant` e, para pagar, também `hasScreenAccess(userId, 'accessExpenses')`. O frontend só esconde o chip; quem barra é o servidor.
- **Pagamento:** o id do candidato vem do servidor, mas a rota de pagar confere de novo o dono.
- **Chat:** não faz nenhuma escrita financeira. Quem grava são as rotas `/expenses`.

## Validações necessárias

- **`intent_hint`:** só aceita `register_expense`, `register_income`, `ask` e `pay_expense`. Qualquer outro valor responde 400.
- **`GET /em-aberto`:** `conta_id` deve ser um inteiro positivo ou ausente, e `limite` um inteiro de 1 a 50 (padrão 8).
- **Card de despesa:** `validateDraft` e `errorMessage` do desktop.
- **Card de pagamento:** valor pago finito e maior que 0, e "Pago em" em ISO válido.
- **Leitor de frases:** mantém os limites atuais. Parcelas vão de 2 a 360 e o valor deve ser menor que 10.000.000; o total N × X também precisa respeitar esse teto. A descrição não pode sair cortada.

## Testes necessários

### Frontend

`cardDraft.test.ts`, com `node:test` via `tsx`:

- **"3000 em 10x" (parcelas):** `buildCreateInput` gera 10 parcelas de 300, com total de 3000.
- **Divisão com resto:** 100,00 em 3 vira 33,33 / 33,33 / 33,34.
- **Crédito com cartão** (fechamento 5, vencimento 12), compra em 2026-10-02, sem vencimento digitado: o vencimento é 2026-10-12. Para uma compra depois do fechamento, cai na fatura seguinte.
- **Sem datas:** a compra é hoje, e o vencimento é igual à data da compra (Pix).
- **Recorrente:** `recurrenceDay` vem do vencimento digitado ou, se não houver, da data da compra.
- **Despesa paga com "Pago em" e valor pago:** gera `paid: true`, `paymentDate` e `amountPaid`. Paga sem valor gera `amountPaid: null`, e o servidor completa.
- **Parcelas pagas fora do crédito:** a parcela 0 paga com 310 em X grava `amountPaid` 310 e `paymentDate` X. Uma parcela paga sem valor usa o valor da parcela.
- **Parcelas pagas no crédito:** usam o vencimento e o valor previsto.
- **Categoria:** o nome vira o id. Sem categoria, a validação acusa "categoria".
- **`fillExpenseDefaults`:** preenche a data e o "Pago em" sem sobrescrever o que veio da frase.

### Backend

- **Leitor de frases:**
  - "comprei um celular 3000 em 10x no credito" → 3000 / 10;
  - "parcelei a tv em 12 vezes de 250" → 3000 / 12;
  - "comprei uma geladeira em 10x no credito de 300 reais" → 3000 / 10;
  - "10x de 300 no cartão" → 3000 / 10, com descrição `null` (não "cartã");
  - "tênis 600 em 3x" → 600 / 3;
  - "comprei um notebook de 4.500,00 em 12 parcelas" → 4500 / 12.
- **"ontem":** `extractDateFromText('paguei a luz ontem')` devolve hoje − 1, e "hoje" e "dia 5" continuam funcionando.
- **Abertura:**
  - a abertura salva com 3 opções vira 4, com "Pagar despesa" na posição padrão e os textos salvos preservados;
  - a abertura que já tem as 4 não é duplicada;
  - a abertura ausente continua recebendo a padrão;
  - `parseIntentOption` aceita `pay_expense`.
- **`assistantPayment.test.ts`:**
  - a busca ignora acento ("agua" encontra "Água");
  - descarta as palavras de ligação e de verbo;
  - pontua por termos e desempata pelo vencimento;
  - devolve só a próxima parcela por grupo;
  - indica quando a mensagem não tem termo de busca;
  - devolve lista vazia quando não há despesas.

### E2E

O projeto não tem suíte E2E. A cobertura fica com o roteiro local da Fase 3 (servidor + banco local), o teste básico em jsdom e a conferência do usuário no celular depois do deploy.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build

npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

1. **A categoria passa a ser obrigatória no card.** É a regra do desktop, e quem lançava com "Sem categoria" vai encontrar a mensagem do desktop. Foi apresentado ao usuário no plano.
2. **Mudança de leitura nas frases ambíguas de parcelado.** "geladeira em 10x no crédito de 300 reais" passa a gerar total de R$ 3.000. A linha "10x de R$ 300,00" mostra a leitura antes de salvar.
3. **Fluxo salvo:** o chip é completado só em memória. Quando o dono salvar no editor, ele passa a ficar gravado, sem efeito colateral.
4. **Ordem do deploy:** a tela nova antes do servidor gera um 400 temporário no chip.
5. **Tamanho do `FinancialAssistant.tsx`** (2.011 linhas): as partes novas vão em arquivos próprios (`cardDraft.ts`, `InstallmentList.tsx` e `PaymentCard.tsx`), para não inchar o componente.
6. **Dois formatos de data no rascunho:** `installmentPayments` usa dd/mm/aaaa (formato do desktop), e os demais campos usam ISO. A conversão fica em um único lugar, nos inputs da `InstallmentList` e em `toExpenseDraft`, e é coberta por teste.
7. **Dados já gravados com o valor multiplicado:** a Fase 0 só mede. A correção depende do usuário.
8. **Despesas de outras pessoas da conta não aparecem para pagar,** porque a rota do desktop também não as aceita. Está registrado como fora do escopo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. O rótulo do chip ("Pagar despesa"), a fala ("Qual despesa você pagou?") e a cor do chip podem ser ajustados durante a implementação sem mudar a estrutura.

## Critérios de aceite do plano

- **Parcelado com o valor antes das parcelas.** "comprei um celular 3000 em 10x no crédito":
  - o card mostra Valor total de 3000 e "10x de R$ 300,00";
  - salvar grava 10 parcelas de R$ 300;
  - com cartão, o vencimento segue a fatura.
- **Parcelado com o valor da parcela.** "parcelei a tv em 12 vezes de 250" dá total de R$ 3.000 em 12 parcelas de R$ 250.
- **Frase do print.** "Gastei no mercado 10 reais no Pix" abre com a data da compra de hoje, "paga" marcada e "Pago em" de hoje. Escolhida a categoria, salva sem digitar data.
- **Pagamento com juros.** Uma despesa paga com valor pago de 121,29 e previsto de 99 mostra "+ R$ 22,29 de multa e juros" e grava `data_pagamento` igual ao "Pago em".
- **Parcelas pagas.**
  - Com 2 parcelas vencidas, o aviso aparece.
  - "Marcar como pagas no vencimento" e a edição da parcela 2 (R$ 310, em outra data) são gravadas assim.
  - No crédito, só "paga".
- **Validação.** Sem categoria, o Salvar mostra a mensagem do desktop e não grava.
- **Chip no menu.**
  - "Pagar despesa" aparece para quem tem `accessExpenses`, mesmo com o fluxo salvo de abertura própria.
  - Para quem não tem, o chip não aparece e o servidor recusa.
- **Chip em uso.**
  - Ao tocar, a lista mostra as vencidas e as do mês, até 8, com o botão "Voltar".
  - "luz 121,29" abre o card com valor pago de 121,29; "luz ontem" põe "Pago em" de ontem.
  - Várias correspondências viram botões, e numa compra parcelada aparece só a próxima parcela.
  - Salvar grava o pagamento, mostra o resumo e devolve o menu.
- **Sem o chip.** "paguei a luz 121,29" abre o card de despesa nova, como hoje.
- **Editor do fluxo.** Mostra o chip novo sem acusar erro e sem ligá-lo à Consulta.
- **Validações técnicas.** tsc, testes e builds passam no frontend e no backend, e o roteiro local passa. Nenhuma migration é criada nem executada.

## Observações para a skill implementar

- **Fonte de contexto:** usar este plano como fonte principal, inclusive a tabela de achados, que traz as linhas de referência de 2026-10-02.
- **Ordem das fases:** seguir **remover, depois aplicar** (Fase 1 antes da Fase 2), sem deixar código morto nem sobreposto.
- **Regras do desktop:** reaproveitar `draftRules.ts`, `expenseSchedule.ts` e `PaymentModal` como referência. **Não duplicar regras do desktop no assistente**; se faltar uma função pura exportada, exportá-la de lá.
- **Fluxo guiado:** **não remover** o fluxo guiado, o motor nem o editor. Só o mapeamento de `paidInstallments` para o card sai, e apenas se ficar sem leitor.
- **Migrations:** não executar nenhuma; esta feature não tem. A medição da Fase 0 é só `SELECT` na produção, com a mesma checagem de URL dos scripts anteriores.
- **`.env`:** não alterar.
- **Roteiro e servidor local:**
  - roteiro e scripts ficam no scratchpad;
  - o servidor local roda na porta 3013;
  - para encerrar, matar a árvore do processo `tsx` (`taskkill /T /F`).
- **Comunicação durante a implementação:** execução enxuta, só com status breve. O resumo fica para o fim, conforme a preferência do usuário.
- **Após concluir:** seguir para `/finalizar`, que faz commit, push e pergunta sobre o merge em `main`, sem PR.
