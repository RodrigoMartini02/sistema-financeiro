# Plano de Implementação: Adicionar opção "Excluir" em Despesas e Receitas

## Origem

- Arquivo de especificação: nenhum `.md` de feature fornecido — plano originado de relato direto do usuário ("lembro que tinha a opção de excluir despesa e receita, não tem mais?") e investigação de código.
- Data do planejamento: `2026-08-18`
- Classificação: `frontend-only`

## Resumo

O backend (`DELETE /api/expenses/:id`, `DELETE /api/incomes/:id`) e a camada de dados (`deleteExpense`/`deleteIncome` em `financeService.ts`, `deleteExpenseMut`/`deleteIncomeMut` em `useFinanceDashboard.ts`) já existem e funcionam, mas nenhuma tela chama essas mutations — a opção "Excluir" nunca foi conectada (ou foi removida) do menu de ações de Despesas e Receitas. Este plano adiciona o gatilho de UI reaproveitando toda a infraestrutura já pronta.

## Escopo

### Dentro do escopo

- Item "Excluir" no `KebabMenu` de `ExpenseCard.tsx` e `IncomeCard.tsx` (tone `danger`, ícone `Trash2`).
- Botão "Excluir" na coluna de ações da tabela desktop em `DespesasScreen.tsx` e `ReceitasScreen.tsx`.
- Receitas e despesas **não parceladas**: confirmação simples via `useConfirm()`, mesmo padrão já usado em "Cancelar" (`variant: 'danger'`).
- Despesas **parceladas** (`item.parcela` preenchido, ex. "2/3"): novo diálogo local dedicado (`DeleteInstallmentDialog`), com duas ações distintas — "Excluir só esta parcela" e "Excluir parcelamento inteiro" — mais cancelar.
- Ajuste em `deleteExpense` (`financeService.ts`) para aceitar parâmetro opcional que acrescente `?delete_group=true` na URL (o backend já suporta esse query param).

### Fora do escopo

- Qualquer mudança no backend — endpoints já existem e cobrem o caso, incluindo exclusão de grupo de parcelamento.
- Mudança de schema/migrations.
- Alterar o comportamento de "Cancelar" existente ou o `ConfirmContext`/`ConfirmDialog` compartilhado (usado em várias telas do projeto — não será modificado).
- Exclusão em outras telas (Calendário, Reservas, etc.) — só Despesas e Receitas conforme relatado.
- Soft-delete/lixeira/histórico de exclusões — mantém `DELETE` físico como já implementado no backend.

## Leitura de contexto

- `AGENT.md` da raiz do projeto `sistema financas` — lido. Mesma nota de planos anteriores: este arquivo descreve contexto multi-tenant/multi-prefeitura com RLS que não corresponde ao código real do projeto (que usa `perfil_id` como escopo de usuário único). Regras genéricas de qualidade seguidas; seções de "prefeitura" ignoradas.
- `CLAUDE.md` da raiz — lido, fluxo `/planejar → /implementar → /finalizar` sendo seguido.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Arquivos de código inspecionados: `src/hooks/useFinanceDashboard.ts`, `backend/src/routes/expenses.ts` (DELETE, linhas 491-518), `backend/src/routes/incomes.ts` (DELETE, linhas 344-363), `src/screens/despesas/DespesasScreen.tsx` (padrão `useConfirm`/`handleCancelarDespesa`), `src/screens/receitas/ReceitasScreen.tsx` (padrão equivalente `handleCancelarReceita`), `src/types/finance.ts` (campo `parcela` em `Expense`), `src/screens/despesas/ExpenseCard.tsx`, `src/screens/receitas/IncomeCard.tsx`, `src/ui/KebabMenu.tsx`, `src/context/ConfirmContext.tsx` (confirmado: binário, `Promise<boolean>`, sem suporte nativo a 3 opções), `src/services/financeService.ts` (`deleteExpense`/`deleteIncome`, linhas 148-186).

## Impacto por área

### Frontend

- `src/services/financeService.ts`: `deleteExpense(id, options?: { deleteGroup?: boolean })` — acrescenta `?delete_group=true` na URL quando `deleteGroup` for `true`. `deleteIncome` permanece sem alteração (receitas não têm parcelamento).
- `src/hooks/useFinanceDashboard.ts`: `deleteExpenseMut` passa a aceitar `{ id, deleteGroup? }` em vez de só `id` — ajuste mínimo de assinatura da `mutationFn`.
- `src/screens/despesas/ExpenseCard.tsx`: nova prop `onDelete: () => void`; item "Excluir" adicionado ao array `actions` do `KebabMenu` (ícone `Trash2`, `tone: 'danger'`).
- `src/screens/despesas/DespesasScreen.tsx`:
  - `handleExcluirDespesa(item)`: se `item.parcela` ausente, usa `useConfirm()` simples (mesmo padrão de `handleCancelarDespesa`); se presente, abre o novo `DeleteInstallmentDialog`.
  - Novo estado local para controlar abertura do `DeleteInstallmentDialog` com o item selecionado.
  - `onDelete={() => handleExcluirDespesa(item)}` passado ao `ExpenseCard`; novo `ActionBtn` (ícone `Trash2`) na coluna "Ações" da tabela desktop.
- `src/screens/despesas/DeleteInstallmentDialog.tsx` (novo arquivo): modal com título, mensagem explicativa, dois botões de ação nomeados lado a lado ("Excluir só esta parcela" / "Excluir parcelamento inteiro") e botão cancelar — seguindo o padrão visual dos outros dialogs do projeto (ex. `PaymentModal`).
- `src/screens/receitas/IncomeCard.tsx`: nova prop `onDelete: () => void`; item "Excluir" no array `actions` do kebab.
- `src/screens/receitas/ReceitasScreen.tsx`: `handleExcluirReceita(item)` com `useConfirm()` simples (mesmo padrão de `handleCancelarReceita`); `onDelete` passado ao `IncomeCard`; botão "Excluir" na tabela desktop.
- Sem mudança em query keys — `finance.deleteExpense`/`finance.deleteIncome` já invalidam o dashboard corretamente via `onSuccess: invalidate` existente.

### Backend

`Sem impacto esperado` — endpoints `DELETE /api/expenses/:id` (com suporte a `?delete_group=true`) e `DELETE /api/incomes/:id` já implementados e não serão alterados.

### Banco de dados

`Sem impacto esperado`. Nenhuma coluna nova, nenhuma migration necessária.

Atenção: este plano não autoriza executar migrations automaticamente.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/services/financeService.ts`
- `src/hooks/useFinanceDashboard.ts`
- `src/screens/despesas/ExpenseCard.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/despesas/DeleteInstallmentDialog.tsx` (novo)
- `src/screens/receitas/IncomeCard.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. `financeService.ts`: ajustar `deleteExpense` para aceitar `deleteGroup` opcional e montar a query string `?delete_group=true` quando aplicável.
2. `useFinanceDashboard.ts`: ajustar `deleteExpenseMut` para repassar `{ id, deleteGroup }` para `deleteExpense`.
3. Criar `DeleteInstallmentDialog.tsx`: dois botões de ação nomeados + cancelar, sem opção pré-selecionada, com ênfase visual diferenciando a ação mais grave (excluir grupo inteiro).
4. `ExpenseCard.tsx`: adicionar prop `onDelete`, item "Excluir" no kebab.
5. `DespesasScreen.tsx`: `handleExcluirDespesa` com branching (parcelada vs. simples); estado para `DeleteInstallmentDialog`; conectar `onDelete`/`ActionBtn`.
6. `IncomeCard.tsx`: adicionar prop `onDelete`, item "Excluir" no kebab.
7. `ReceitasScreen.tsx`: `handleExcluirReceita` com `useConfirm()`; conectar `onDelete`/botão na tabela desktop.
8. Rodar build do frontend (`npm run build`).
9. Teste manual: excluir despesa simples, despesa parcelada (as duas opções separadamente), receita.

## Regras de negócio identificadas

- Exclusão é uma ação destrutiva e irreversível — deve sempre passar por confirmação explícita do usuário antes de disparar a mutation.
- Despesa não parcelada e receita: confirmação binária simples, mesmo padrão de "Cancelar".
- Despesa parcelada: usuário escolhe explicitamente entre excluir só a parcela atual ou o parcelamento inteiro, via diálogo com duas ações nomeadas (nunca um padrão binário ambíguo tipo "Sim/Não" para esse caso).

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant (ver nota em "Leitura de contexto"). Endpoints DELETE já filtram por `usuario_id` em todas as queries, padrão mantido sem alteração.

## Validações necessárias

- Garantir que o `id` correto é sempre passado para `mutate()`.
- Garantir que `deleteGroup` só é enviado quando o usuário escolhe explicitamente "excluir parcelamento inteiro" no `DeleteInstallmentDialog" — nunca como default ou em despesas não parceladas.

## Testes necessários

### Frontend

- "Excluir" aparece no kebab (mobile) e na tabela (desktop) para despesas e receitas.
- Despesa simples/receita: diálogo de confirmação padrão aparece e cancela corretamente se o usuário recusar.
- Despesa parcelada: `DeleteInstallmentDialog` aparece com as duas opções; cada botão dispara a chamada correta (`delete_group` presente ou ausente na request).

### Backend

Nenhum teste novo necessário — endpoints existentes não são alterados.

### E2E

- Fluxo manual: excluir despesa simples, receita, uma parcela isolada de um parcelamento, e um parcelamento inteiro — conferir que a lista e o saldo do mês refletem corretamente em cada caso.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- Exclusão é `DELETE` físico no banco, sem soft-delete — o ambiente atual pode estar apontando para produção; testes manuais devem ser feitos com cautela, evitando excluir dados reais sem certeza.
- Risco de UX: usuário escolher "excluir parcelamento inteiro" por engano — mitigado com dois botões claramente rotulados e visualmente distintos (o mais grave com ênfase adicional), sem opção pré-selecionada por padrão.
- Baixo risco técnico geral — nenhuma mudança de backend; endpoints já em uso por outros fluxos possivelmente existentes.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

## Critérios de aceite do plano

- Botão/menu "Excluir" visível e funcional em Despesas e Receitas, tanto na visão mobile (kebab) quanto desktop (tabela).
- Confirmação obrigatória antes de excluir em todos os casos, sem exceção.
- Despesas parceladas oferecem escolha clara entre excluir parcela ou grupo inteiro via diálogo dedicado, sem padrão pré-selecionado.
- Nenhuma migration executada; nenhuma mudança de schema ou backend.
- Build do frontend passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária.
- Seguir o padrão visual dos dialogs existentes do projeto (ex. `PaymentModal`) para o novo `DeleteInstallmentDialog`.
- Não alterar `ConfirmContext`/`ConfirmDialog` compartilhado — o novo dialog de parcelamento é local e isolado.
- Manter alterações restritas aos arquivos listados.
