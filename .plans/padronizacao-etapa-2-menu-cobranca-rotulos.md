# Plano: Padronização — Etapa 2 de 3 — Menu de cobrança, rótulos e etiqueta de status

## Origem

- Task: [padronizar cobrança, edição e receitas fixas](tasks/padronizacao-cobranca-edicao-receitas-fixas.md).
- Classificação: **frontend** (sem backend, sem banco).
- Data: **01/11/2026**. Depende da [etapa 1](padronizacao-etapa-1-receitas-fixas.md) fechada: reaproveita o campo compartilhado `RepeatEndField` criado nela.
- Próxima: [etapa 3 — edição financeira de despesas](padronizacao-etapa-3-edicao-financeira-despesas.md).

## Resumo

Padronizar o que o usuário vê no lançamento, no lote e na edição: controles complementares dentro da linha da opção do menu, remoção da etiqueta de status dos modais e rótulos Prevista e Pix. Nenhuma regra financeira muda.

### Decisões confirmadas

- Quantidade `− número +` ao lado de **Parcelado**; **Até mês/ano** ao lado de **Fixa**. Só o controle da opção selecionada aparece, dentro do menu.
- Mesmo padrão de componentes e estilos no lançamento, lote e edição, inclusive no celular.
- Remover **somente** a etiqueta principal de status dos modais (despesas e receitas). Preservar resumo, dados, sugestões, avisos e a ação Pagar fatura.
- Exibir **Prevista** (não "Previsão") nas listagens pertinentes; identificador interno `prevista` e demais status inalterados; **não** criar status "Agendado" para previsão; "Agendada" da recorrência mensal do crédito permanece.
- Trocar apenas o rótulo **PIX → Pix** nas formas de pagamento; identificador `pix` e textos da assinatura da plataforma ficam como estão.

## Escopo

### Dentro do escopo

- `BillingPopover`: linha de cada opção com botão/radio e controle irmão (sem `select`/`input` dentro de `button`); reaproveitar `InstallmentCountField` e `RepeatEndField`; sem segundo stepper nem calendário novo.
- `ExpenseRow` e `ExpenseDialog`: remover o Até externo, os controles externos de quantidade e as grades largas exclusivas da fixa (`ENTRY_FIXED_GRID_CLASS`, `BATCH_FIXED_GRID_CLASS`); manter coluna Adiar e alinhamento de cabeçalhos/linhas.
- Etiqueta de status: **o modal de receita já perdeu a etiqueta na etapa 1** (`SummaryContent.status` ficou opcional e a pílula só aparece quando informada). Falta o modal de despesa: `ExpenseRow` para de passar o `status` ao `SummaryLine` e, sem mais nenhum consumidor, o campo `status` e a pílula saem de `SummaryLine`. **`summarizeDraft().status` e `SUMMARY_TONE` ficam**: o card do assistente (Juca) usa a mesma situação e não é modal. Preservar resumo, sugestões, avisos e Pagar fatura.
- Rótulos: `expenseStatus.tsx`, `entryTable.tsx`, `PaymentMethodPopover.tsx` e consumidores compartilhados.
- Receitas: o menu Não repete/Fixa já usa o padrão na etapa 1; aqui só conferir paridade visual com despesas.

### Fora do escopo

- Qualquer regra de gravação, contrato de API ou banco.
- Edição de cobrança/pagamento de despesas já cadastradas (etapa 3): nesta etapa o menu na edição mostra apenas as opções que já eram permitidas.
- Reformular os demais status; assinatura da plataforma.

## Estratégia

- Reutilizar `FloatingPanel` e `fieldStyles`; navegação por teclado preservada.
- Manter a aplicação do número digitado ao sair/fechar o menu, os limites de parcelas (2 a 360) e a confirmação de redução existentes.
- Enter nos controles do popover ou em checkbox **não** salva o lote.
- Ao fechar, a linha principal mostra só o seletor de cobrança (`3x`, `Fixa`, `Não repete`).
- O patch do Codex (`c:\tmp\financas-codex\despesas-etapas-2-3.patch` e `mistos-para-etapas-2-3.patch`, ver `LEIA-ME.txt`) foi só **referência**: na etapa 1 esses arquivos voltaram ao estado do último commit e o menu foi refeito (ver "Execução"). Os trechos de edição financeira da cobrança (`draftRules`, `draftState`, `installmentCount`, `expenseInput`) são da etapa 3, não desta.

## Arquivos afetados

`src/screens/finance/expense-dialog/BillingPopover.tsx`, `InstallmentCountField.tsx`, `ExpenseRow.tsx`, `ExpenseDialog.tsx`, `expenseGrid.ts`, `PaymentMethodPopover.tsx`; `src/screens/finance/entry-dialog/SummaryLine.tsx`, `EntryDialogFrame.tsx`, `RepeatEndField.tsx`; `src/screens/finance/entryTable.tsx`; `src/screens/despesas/expenseStatus.tsx`; `src/screens/receitas/IncomeCard.tsx`; demonstração, se exibir os rótulos.

Testes a revisar: `draftRules.test.ts` e `fixedExpenseDrafts.test.ts` (despesas), `cashDate.test.ts`, `cardInvoice.test.ts`.

## Validações

- `npm test`, `npm run build`, `npx tsc --noEmit -p tsconfig.json` (um por vez), sem falhas.
- Conferência visual desktop/celular e claro/escuro: opções, alinhamento, teclado, fechamento do menu, ausência da etiqueta com resumo e Pagar fatura preservados, rótulos Prevista e Pix.
- `git diff --check`; `.env`, lockfiles e Render fora do diff.

## Testes recomendados

- Quantidade por botões, digitação, blur, Enter e fechamento; limites e confirmação de redução; Enter no menu/checkbox não salva.
- Escolher Fixa ou Parcelado antes e depois do `+`; cabeçalhos alinhados sem grade exclusiva da fixa.
- Resumo mantém total, vencimento, sugestões, avisos e Pagar fatura sem a etiqueta.
- Regressão dos demais status (incluindo Agendada do crédito mensal) e troca puramente visual de Pix.

## Riscos

- Controle dentro de `button` quebra teclado e leitores de tela: usar irmãos.
- Remover a etiqueta junto com o resumo apagaria avisos úteis ao salvamento.
- Trocar "PIX" onde é identificador ou texto da assinatura.

## Critérios de aceite

- Parcelado e Fixa mostram seus controles na linha da opção, só quando selecionadas, sem controle externo equivalente.
- Lançamento, lote e edição usam os mesmos componentes e estilos, em desktop e celular.
- Só a etiqueta principal some dos modais; Prevista e Pix aparecem nas apresentações pertinentes; identificadores e demais status inalterados.
- Testes e builds pertinentes passam.

## Instruções para /implementar

- Pré-requisito: etapa 1 fechada. Ler `AGENT.md` e `CLAUDE.md`; reconferir `git status`.
- Só interface: não alterar contratos, serviços, banco, `.env` nem Render. Sem stage, commit, push ou deploy durante `/implementar`.

## Execução (01/11/2026, mesma branch `feat/R/receitas-fixas-lancamento`)

Implementada e validada localmente; **nada commitado**. A etapa 1 ainda não foi commitada: os dois conjuntos de arquivos convivem no working tree (arquivos compartilhados: `SummaryLine.tsx`, `LancamentosTable.tsx`, `RepeatEndField.tsx`).

- **Menu de cobrança refeito como componente controlado**, e não a partir do patch do Codex. Motivo: o patch fazia `draft.billingType` virar `installments` na edição, o que mudaria o resumo da linha (descreveria a compra inteira a partir de uma parcela) e a consulta de duplicata. Agora:
  - `billingMenu.ts` (novo, puro, com testes): `BillingMenu` (opção marcada, texto do botão, opções, controles), montagem do menu do rascunho (entrada, lote, previsão) e as regras da edição (`editBillingOptions`, `editBillingValue`, `editBillingText`, `pickEditBilling`, `seriesCountHint`, `editBillingNote`);
  - `BillingPopover.tsx`: só desenha o menu recebido; o número digitado vale ao fechar (tira o foco antes de desmontar o painel), com `InstallmentCountField` e `RepeatEndField`;
  - `entry-dialog/OptionRow.tsx` (novo): a linha de opção (marcador e texto num botão, controle ao lado, nunca dentro). **O menu "Repetir" das receitas passou a usá-la**, então os dois menus são idênticos.
- **Edição**: série fixa → menu só com "Fixa" e o limite; parcelada com grupo → "Parcelado" com a quantidade (desabilitada fora de "Todas", com a explicação abaixo: mínimo, "Todas", fatura); despesa única → Não repete / Parcelado / Fixa conforme o servidor aceita (a paga só oferece Fixa); recorrente do cartão e demais → texto, sem menu. O rodapé da edição deixou de dizer "a cobrança não muda" quando o menu oferece opções (`editBillingNote`); o texto da parcelada agora aponta para o menu Cobrança.
- **Removidos**: Até externo, "Parcelar em" e "Parcelas" externos, `ENTRY_FIXED_GRID_CLASS`, `BATCH_FIXED_GRID_CLASS`, `fixedConversion`, `fixedBillingColumn`.
- **Etiqueta**: `SummaryContent.status` e a pílula saíram de `SummaryLine`; `ExpenseRow` não passa mais a situação. Resumo, avisos e Pagar fatura ficam.
- **Rótulos**: Prevista em `expenseStatus.tsx`, `LancamentosTable.tsx`, filtro de status (`useEntryFilters.ts`) e `SummaryStatus` do resumo; Pix em `entryTable.tsx`, `PaymentMethodPopover.tsx` e no comentário do `SeriesRenewalModal`. **Acréscimo fora do plano:** o PDF de relatórios (`backend/src/services/reportPdf.ts`) também dizia "PIX"; trocado para "Pix" para o relatório e a tela concordarem (uma linha, sem mudança de contrato). Ficaram "PIX" na assinatura da plataforma (`PaymentDialog`, `PixPanel`, mensagem dos planos) e as legendas de gráfico "Previsão · hachurada" (é o nome da área hachurada, não o status).
- **Validação**: `npx tsc --noEmit -p tsconfig.json`, `npm --prefix backend run build` e `npm run build` sem erro; `npm test` 491 passam, 0 falham; `npm --prefix backend test` 1003 passam, 0 falham, 1 ignorado (o de sempre); `git diff --check` limpo; nenhum arquivo de configuração alterado.
- **Conferência visual** (modo demonstração, `demo.html`, sem backend nem banco), desktop 1707 px e iframe de 390 px: menu da linha de entrada, do lote e da previsão; "Parcelado − n +" e "Fixa Até mês ano" na linha da opção; limites 2 a 360 (999 vira 360, 1 vira 2); número digitado vale ao fechar clicando fora; Enter dentro do menu não salva; colunas do lote alinhadas com a linha de entrada, com e sem a coluna Adiar; resumo sem etiqueta; edição da despesa única, da paga, da série fixa e da recorrente; menu "Repetir" das receitas; painel inferior no celular; tema escuro.
- **Não verificado visualmente:** a edição de uma **parcelada com grupo** (a demonstração não cria grupos de parcelas nem tem `/expenses/group/:id`); a lógica está coberta por `billingMenu.test.ts`, mas o desenho do menu com a quantidade desabilitada e o texto abaixo precisa de uma olhada no app com o banco local. Os screenshots do navegador também travaram várias vezes por limitação da janela (renderização pausada), contornadas conferindo pelo DOM.
