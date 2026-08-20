# Plano de Implementação: Reformular modal de despesa — valor pago e status explícitos

## Origem

- Arquivo de especificação: `.portal/tasks/reformular-modal-editar-despesa-valor-pago-e-status.md`
- Data do planejamento: `2026-08-20`
- Classificação: `frontend-only`

## Resumo

Ajustar o `ExpenseDialog.tsx` para: renomear o campo de valor para "Valor da compra"; adicionar checkbox "Pago" que revela, via link (mesmo padrão do "data de pagamento diferente"), um campo "Valor pago" editável para juros/desconto — substituindo o mecanismo atual `jurosDescontoAberto`; remover o default automático de PIX; alinhar visualmente o botão "Adicionar ao lote" ao botão "Salvar"; diferenciar por cor o campo "Data da compra". O checkbox "Pago" aplica-se somente à primeira ocorrência em despesas recorrentes/parceladas.

O sistema já possui um fluxo de pagamento separado (`PaymentModal.tsx`/`BatchPaymentModal.tsx`, usados a partir de `DespesasScreen.tsx`) para marcar despesas já existentes como pagas com valor customizado. Este plano não altera esses dois modais — apenas traz a mesma capacidade (registrar como pago, com valor diferente do original) para dentro do fluxo de criação/edição da despesa, decisão confirmada com o usuário durante o planejamento.

## Escopo

### Dentro do escopo

- Renomear label "VALOR PAGO"/"VALOR DA PARCELA"/"VALOR MENSAL" → "VALOR DA COMPRA" (mantendo variações para parcelas/mensal).
- Checkbox "Pago" controlado manualmente pelo usuário, substituindo `pagoDerivado` como fonte de verdade em `toFormValues`.
- Campo "Valor pago" atrás de link "valor pago diferente", reaproveitando `MoneyFieldSmall`/lógica de cálculo de juros e desconto já existente, mas amarrado ao checkbox em vez de heurística de data.
- Remoção do default `'pix'` em `defaultValues` e `form.reset` (modo edição).
- Restyle do botão "+ Adicionar ao lote" para o mesmo formato preenchido do botão de submit.
- Diferenciação de cor do label/borda do campo "DATA DA COMPRA".
- Ajuste em `saveExpense` (`financeService.ts`) para enviar `valor_pago` vindo do formulário em vez de sempre igualar `valor_final`.
- Adição de `pago`/`valor_pago` ao schema Zod, `FormData` e `ExpenseFormValues`.

### Fora do escopo

- Alterações em `PaymentModal.tsx`/`BatchPaymentModal.tsx` (fluxo de marcar pago depois, na tela de listagem) — permanecem como estão.
- Alteração de backend/schema/migrations (contrato já suporta os campos necessários).
- Renomear "Todo mês" → "Recorrente" (tratado como decisão/task separada, já mencionada em conversa anterior com o usuário).
- Redesenho geral do modal além dos pontos listados.

## Leitura de contexto

- `sistema financas/CLAUDE.md` — lido.
- `sistema financas/AGENT.md` — lido. Contém regras multi-tenant/prefeitura que **não se aplicam** a este projeto (verificado: não há `tenant_id`, RLS, ou isolamento por organização no código relevante) — desconsiderado para este plano.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados — o projeto usa apenas o `AGENT.md` único na raiz de `sistema financas`.
- Task de origem: `.portal/tasks/reformular-modal-editar-despesa-valor-pago-e-status.md`.
- Arquivos inspecionados: `src/screens/finance/ExpenseDialog.tsx`, `src/types/finance.ts`, `src/services/financeService.ts`, `src/ui/dialogFormTokens.tsx`, `src/screens/finance/PaymentModal.tsx`, `src/screens/finance/BatchPaymentModal.tsx`, `src/screens/despesas/DespesasScreen.tsx`, `backend/src/routes/expenses.ts` (rota `/pay` e persistência de `valor_pago`).

## Impacto por área

### Frontend

- `ExpenseDialog.tsx`: schema Zod (linhas 28-44), `defaultValues` (102-109), `resetForm`/`form.reset` no open (252-266), `toFormValues` (358-377), `valorLabel` (356), bloco de vencimento/status (789-902) para adicionar checkbox "Pago" + link "valor pago diferente" substituindo o bloco atual de `jurosDescontoAberto` (831-876), botão de lote (944-955), label "DATA DA COMPRA" (792).
- `types/finance.ts`: adicionar `valor_pago?: number` a `ExpenseFormValues`.
- Reaproveitar tokens existentes de `dialogFormTokens.tsx` (`C.primaryDark`, `chipStyle`, `cardStyle`, `MoneyFieldSmall`) — sem necessidade de novos tokens.

### Backend

Sem impacto esperado — contrato já aceita `pago`, `valor_final`, `valor_pago` (`backend/src/routes/expenses.ts`, `backend/src/db/schema/expenses.ts`).

### Banco de dados

Sem impacto esperado — colunas já existem (`pago`, `valor_pago`, `valor_final`).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não requer nenhuma migration.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/types/finance.ts`
- `sistema financas/src/services/financeService.ts`

## Estratégia de implementação

1. Adicionar `pago: z.boolean()` e `valor_pago: z.coerce.number().min(0).optional()` ao schema Zod e à `FormData`; adicionar `valor_pago?: number` a `ExpenseFormValues`.
2. Trocar `defaultValues.formaPagamento` de `'pix'` para `''`; remover `?? 'pix'` no `form.reset` do modo edição (usar `expense?.formaPagamento ?? ''`).
3. Renomear `valorLabel`: caso `'nao'` → `'VALOR DA COMPRA'` (mantendo `'VALOR DA PARCELA'`/`'VALOR MENSAL'` para os outros casos).
4. Adicionar estado/campo `pago` controlado via checkbox no bloco QUANDO, com valor inicial sugerido a partir de `statusDerivado` (pré-marcado quando data já passou), mas sempre sobrescrevível pelo usuário.
5. Adicionar link "valor pago diferente" (mesmo estilo do link de data manual) que revela `valor_pago` via `MoneyFieldSmall`, com valor sugerido = valor da compra; reaproveitar `jurosCalculado`/`descontoCalculado` para exibir a diferença, agora calculada a partir de `valor_pago` em vez de `valor_final`/heurística de data.
6. Remover o bloco atual de `jurosDescontoAberto`/`jurosDescontoTocado` (toggle "informar valor pago" dentro do bloco de vencimento) e o `useEffect` que o auto-abre por `diffDias` — substituído pelo novo mecanismo do passo 5. Antes de remover, verificar todos os usos (`jurosEmbutido`, `efetivoFinal`, `valorInputMode`) para não quebrar o fluxo de "à vista"/parcelas, que depende de `efetivoFinal`.
7. Atualizar `toFormValues`: `pago` vem do estado do checkbox (não mais de `pagoDerivado`); incluir `valor_pago` no payload quando preenchido.
8. Restyle do botão "+ Adicionar ao lote": aplicar `borderRadius`, `padding`, `background` preenchido consistente com o botão de submit, diferenciando por cor (ex: fundo neutro/secundário) mantendo o mesmo formato.
9. Ajustar label/borda de "DATA DA COMPRA" para cor de destaque (ex: `C.primaryDark`), sem alterar posição/estrutura.
10. Atualizar `saveExpense` em `financeService.ts` (linha 168): `valor_pago: values.pago ? (values.valor_pago ?? valorFinal) : null`.
11. Validar manualmente no navegador (`npm run dev` do sistema financas): criar despesa nova sem forma de pagamento pré-selecionada, marcar/desmarcar "Pago", testar link "valor pago diferente", testar lote, testar edição de despesa existente.

## Regras de negócio identificadas

- `pago` passa a ser controlado pelo usuário via checkbox, não mais 100% derivado de data/forma de pagamento.
- "Valor pago" default = valor da compra; só diverge quando o usuário abre o campo via link "valor pago diferente".
- Checkbox "Pago" em despesa recorrente/parcelada afeta apenas a ocorrência/parcela sendo criada agora (consistente com `parcelasJaPagas` já existente).
- Forma de pagamento não tem mais default automático — usuário deve escolher explicitamente (schema já exige `min(1)`, bloqueando submit até escolha).

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Validação de `valor_pago`/`pago` deve seguir o mesmo padrão de validação de input já usado para `valor_final` (não negativo, coerção numérica via Zod). Autorização segue o padrão já existente de usuário autenticado sobre a própria despesa (`req.user!.id` no backend).

## Validações necessárias

- `valor_pago`: `z.coerce.number().min(0).optional()`.
- `pago`: `z.boolean()`, default `false`.
- `formaPagamento`: mantém `z.string().min(1)` — submit bloqueado sem escolha explícita de forma de pagamento.

## Testes necessários

### Frontend

- Formulário abre sem forma de pagamento pré-selecionada.
- Checkbox "Pago" pode ser marcado/desmarcado manualmente; `toFormValues` reflete a escolha do usuário, não a inferência automática.
- Link "valor pago diferente" revela campo e permite valor distinto do valor da compra (cenário de juros e cenário de desconto).
- Botão "+ Adicionar ao lote" mantém a função de adicionar ao lote após o restyle.
- Edição de despesa existente carrega corretamente `pago`/`valor_pago` do registro salvo.

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Remover o bloco `jurosDescontoAberto` pode afetar outros pontos do código que dependem dele (`jurosEmbutido`, cálculo de parcelas à vista via `efetivoFinal`) — checar reuso antes de remover.
- Despesas antigas com `valor_final` diferente de `valor_original` (sem `valor_pago` setado) precisam continuar exibindo a diferença corretamente ao editar.
- O ambiente atual pode estar apontando para produção — nenhuma migration será executada; a mudança é puramente de código frontend + um ajuste de payload em `financeService.ts`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Campo de valor renomeado para "Valor da compra" nos casos aplicáveis.
- Checkbox "Pago" funcional e controlado manualmente pelo usuário.
- Campo "Valor pago" acessível via link "valor pago diferente", seguindo o padrão visual já usado para "data de pagamento diferente".
- Nenhum default automático de forma de pagamento (PIX) ao abrir o formulário.
- Botão "+ Adicionar ao lote" com mesmo formato visual (preenchido) do botão de submit.
- Campo "DATA DA COMPRA" com cor diferenciada do campo de descrição.
- Build/lint/typecheck passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations sem confirmação explícita do usuário.
- Seguir `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md`, desconsiderando as seções multi-tenant/prefeitura do `AGENT.md`, que não se aplicam a este projeto.
- Manter alterações pequenas e focadas em `ExpenseDialog.tsx`, `types/finance.ts` e `financeService.ts`.
- Ao remover o bloco `jurosDescontoAberto`, verificar todos os usos (`jurosEmbutido`, `efetivoFinal`, `valorInputMode`) antes de excluir para não quebrar o fluxo de "à vista"/parcelas.
