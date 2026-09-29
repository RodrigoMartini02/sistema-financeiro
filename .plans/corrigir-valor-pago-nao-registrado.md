# Plano de Implementação: Corrigir valor pago não registrado/exibido quando difere do valor lançado

## Origem

- Arquivo de especificação: não houve `.md` de feature fornecido — a origem foi um relato do usuário com screenshots do modal "Confirmar Pagamento" e da tabela de despesas, seguido de investigação de código via agente Explore.
- Data do planejamento: 2026-08-19
- Classificação: `fullstack` (frontend + backend, sem alteração de banco de dados)

## Resumo

O modal "Confirmar Pagamento" (`sistema financas`) calcula e exibe corretamente o acréscimo/desconto entre valor original e valor pago, e envia o `valor_pago` corretamente para o backend, que o persiste na coluna `despesas.valor_pago`. Porém, ao recarregar a lista de despesas, o frontend descarta esse campo no mapeamento API → estado (`expenseFromApi`), então a tabela, o card mobile e o formulário de edição nunca têm acesso ao valor realmente pago — apenas ao valor lançado (`valor_final`). Além disso, os cálculos de saldo do mês e dos relatórios no backend somam sempre o valor lançado, ignorando o valor efetivamente pago mesmo em despesas já pagas. O usuário aprovou corrigir ambos os pontos (exibição e cálculo de saldo/relatórios).

## Escopo

### Dentro do escopo

- Adicionar `valor_pago` em `RawExpense` e `valorPago` em `Expense` (tipo de domínio do frontend), e mapear em `expenseFromApi()`.
- Exibir o valor pago real (quando diferente do valor lançado e a despesa estiver paga) em:
  - Tabela de despesas desktop (`DespesasScreen.tsx`)
  - Card de despesa mobile (`ExpenseCard.tsx`)
  - Formulário de edição de despesa (`ExpenseDialog.tsx`), como exibição somente leitura
- Corrigir o cálculo de saldo do mês no backend (`months.ts`, função `calculateBalanceBreakdown`) para priorizar `valor_pago` quando a despesa estiver paga.
- Corrigir os agregados de relatórios/panorama no backend (`financial.ts`) para o mesmo comportamento.
- Verificar `CalendarView.tsx` e `FinancialAssistant.tsx` (consumidores de `Expense`) e ajustar exibição pontual se fizer sentido.

### Fora do escopo

- Qualquer alteração de schema/migration (a coluna `valor_pago` já existe).
- Alterações no `BatchPaymentModal.tsx` além do que já é herdado automaticamente pelo fix do mapeamento (ele já envia `valor_pago` corretamente; não precisa de mudança estrutural).
- Mudanças em regras de negócio não relacionadas a este bug (ex.: fluxo de parcelamento, recorrência).
- Qualquer execução de migration.

## Leitura de contexto

- `/AGENT.md` — lido. Regras multi-tenant/RLS, Drizzle, evitar SQL raw quando possível, nunca executar migrations sem confirmação, nunca alterar `.env`.
- `frontend/AGENT.md` — não existe como arquivo dedicado neste projeto; não há separação de pastas `frontend/`/`backend/` no root do repositório multi-projeto. O `AGENT.md` da raiz e o `sistema financas/AGENT.md` têm conteúdo idêntico e cobrem todo o repositório.
- `backend/AGENT.md` — não existe como arquivo dedicado; mesma observação acima. As regras de banco/Drizzle/multi-tenant do `AGENT.md` já cobrem o backend de "sistema financas".
- `sistema financas/AGENT.md` — lido (idêntico ao da raiz).
- `sistema financas/CLAUDE.md` — lido (regras de fluxo /planejar → /implementar → /finalizar).
- Arquivos de código lidos/investigados: `sistema financas/src/services/financeService.ts`, `sistema financas/src/types/finance.ts`, `sistema financas/src/screens/despesas/DespesasScreen.tsx`, `sistema financas/src/screens/despesas/ExpenseCard.tsx`, `sistema financas/src/screens/finance/PaymentModal.tsx`, `sistema financas/src/screens/finance/BatchPaymentModal.tsx`, `sistema financas/backend/src/routes/expenses.ts`, `sistema financas/backend/src/routes/months.ts`, `sistema financas/backend/src/routes/financial.ts`, `sistema financas/backend/src/db/schema/expenses.ts`.

## Impacto por área

### Frontend

- **Tipos**: `sistema financas/src/types/finance.ts` — adicionar campo `valorPago?: number | null` na interface `Expense` (perto de `valorOriginal`, linha ~61).
- **Mapeamento API**: `sistema financas/src/services/financeService.ts`:
  - `RawExpense` (linhas 18-28): adicionar `valor_pago?: string | null`.
  - `expenseFromApi()` (linhas 61-86): mapear `valorPago: r.valor_pago != null ? asNumber(r.valor_pago) : null`.
- **Tabela desktop**: `DespesasScreen.tsx:647-654` — quando `item.pago && item.valorPago != null && item.valorPago !== item.valorFinal`, exibir o valor pago real como valor principal (destacado, não riscado) e manter `valorFinal` como referência secundária junto ao "inicial" já existente.
- **Card mobile**: `ExpenseCard.tsx:100-103` — mesmo tratamento; hoje nem exibe o "inicial" riscado, então também alinhar visualmente com o padrão da tabela desktop (exibir original riscado + valor pago real quando pago e diferente).
- **Formulário de edição**: `ExpenseDialog.tsx` — ao editar uma despesa já paga, exibir o valor pago real como informação somente leitura (não editável neste formulário, já que a edição do valor pago é feita via `PaymentModal`).
- **BatchPaymentModal.tsx**: sem alteração estrutural — já envia `valor_pago` via `pagarDespesa`; passa a exibir corretamente após o fix de tipos/mapeamento se reaberto.
- **CalendarView.tsx / FinancialAssistant.tsx**: revisar uso de `expense.valorFinal` e decidir, durante a implementação, se cabe mostrar o valor pago real nesses contextos (calendário e respostas do assistente).
- Sem impacto em query keys, hooks de fetch ou loading/error states — é só ampliação de campos já buscados.

### Backend

- **Saldo do mês**: `sistema financas/backend/src/routes/months.ts`, função `calculateBalanceBreakdown` (query de despesas, linhas 62-65) — trocar `COALESCE(valor_final, valor_original)` por `COALESCE(valor_pago, valor_final, valor_original)` no `SUM` de despesas do mês. Manter a mesma lógica de rateio por parcela (`/ numero_parcelas`) já existente.
- **Relatórios/panorama**: `sistema financas/backend/src/routes/financial.ts` — ajustar as queries que hoje usam `COALESCE(valor_final, valor_original)` para considerar `valor_pago` quando `pago = true`:
  - linha 109 (série mensal)
  - linha 204 (detalhe por data)
  - linha 223 (por forma de pagamento)
  - linha 266 (outro detalhe)
  - linhas 277-284 (juros, descontos, fixas, variáveis, opex, capex, pagas, pendentes)
  - linha 320, 338 (séries anuais)
  
  Em cada caso, a expressão deve virar algo como `CASE WHEN pago THEN COALESCE(valor_pago, valor_final, valor_original) ELSE COALESCE(valor_final, valor_original) END`, preservando o comportamento atual para despesas não pagas.
- **Rota de pagamento** (`expenses.ts:534-566`, `POST /:id/pay`): sem alteração — já persiste `valor_pago` corretamente.
- **Rota de listagem** (`GET /despesas`): sem alteração — já retorna `valor_pago` via `SELECT d.*`.
- Todas as queries já filtram por `usuario_id`/`perfil_id`; nenhuma mudança nesse filtro é necessária.

### Banco de dados

`Sem impacto esperado` — a coluna `valor_pago` (Drizzle: `amountPaid`, `backend/src/db/schema/expenses.ts:42`) já existe na tabela `despesas`. Não é necessária nova migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/types/finance.ts`
- `sistema financas/src/services/financeService.ts`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/screens/despesas/ExpenseCard.tsx`
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/finance/calendar/CalendarView.tsx` (verificação)
- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx` (verificação)
- `sistema financas/backend/src/routes/months.ts`
- `sistema financas/backend/src/routes/financial.ts`

## Estratégia de implementação

1. Adicionar `valor_pago` em `RawExpense` e `valorPago` em `Expense`; mapear em `expenseFromApi()`.
2. Ajustar `DespesasScreen.tsx` e `ExpenseCard.tsx` para exibir o valor pago real quando `pago = true` e `valorPago` diferir de `valorFinal`, mantendo o valor original riscado como hoje.
3. Ajustar `ExpenseDialog.tsx` para exibir (somente leitura) o valor pago real quando aplicável.
4. Verificar `CalendarView.tsx` e `FinancialAssistant.tsx`; aplicar ajuste de exibição se necessário.
5. Ajustar `calculateBalanceBreakdown` em `months.ts` para usar `COALESCE(valor_pago, valor_final, valor_original)` no cálculo de despesas pagas.
6. Ajustar as queries de `financial.ts` (linhas listadas acima) para o mesmo padrão condicional (`pago` → prioriza `valor_pago`).
7. Rodar validações (lint/typecheck/build) no frontend e no backend de "sistema financas".
8. Testar manualmente o fluxo: pagar uma despesa com valor diferente do lançado, conferir tabela, card, saldo do mês e relatórios.

## Regras de negócio identificadas

- O valor pago só deve prevalecer sobre o valor lançado quando a despesa estiver marcada como paga (`pago = true`) e `valor_pago` não for nulo.
- Despesas não pagas continuam usando `valor_final`/`valor_original` como hoje (comportamento inalterado).
- O "valor original" (`valorOriginal`) continua sendo exibido riscado como referência histórica, independentemente do valor pago.

## Regras multi-tenant e segurança

- Todas as queries afetadas em `months.ts` e `financial.ts` já filtram por `usuario_id` (e `perfil_id` via `profileWhere`); a mudança é apenas na expressão de valor somada, não no filtro de linhas — nenhum novo risco de vazamento entre usuários/perfis.
- Nenhuma nova rota é criada; nenhum novo ponto de entrada de dados do client é confiado sem validação.
- Sem impacto em relatórios/PDFs além dos agregados numéricos já cobertos.

## Validações necessárias

- Garantir que `valor_pago` nulo (despesa não paga) não quebre `asNumber()` no frontend — já tratado por `!= null` antes de converter.
- Garantir que as expressões `CASE WHEN pago THEN COALESCE(valor_pago, valor_final, valor_original) ELSE ... END` no backend não alterem o resultado para despesas com `pago = false`.
- Conferir que despesas pagas via fluxo antigo (antes desta correção, com `valor_pago` possivelmente nulo mesmo estando pagas) caem no fallback (`COALESCE(valor_pago, valor_final, valor_original)`) sem gerar `NaN`/erro.

## Testes necessários

### Frontend

- Teste manual: pagar uma despesa com valor diferente do lançado (acréscimo e desconto) e conferir exibição na tabela desktop e no card mobile.
- Teste manual: reabrir `ExpenseDialog` de uma despesa já paga e conferir exibição do valor pago.

### Backend

- Teste manual/via API: `GET /despesas` após um `POST /:id/pay` com valor divergente — conferir que `valor_pago` retorna no payload.
- Teste manual: `GET /meses/:ano/:mes/saldo` antes e depois de pagar uma despesa com acréscimo — conferir que o saldo reflete o valor pago real.
- Teste manual: endpoints de `financial.ts` (panorama/relatórios) — conferir que os agregados de "pagas" refletem o valor pago real.

### E2E

- Não há suíte E2E identificada no projeto; testes manuais via UI cobrem o fluxo crítico.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
```

(Ajustar nomes de scripts conforme os `package.json` reais encontrados durante a implementação, caso divirjam.)

## Riscos e pontos de atenção

- Mudar o cálculo de saldo/relatórios altera números já exibidos ao usuário: saldos de meses passados com despesas pagas com acréscimo/desconto vão mudar de valor ao recarregar a tela. Isso é o comportamento correto desejado, mas é uma mudança visível que o usuário deve estar ciente ao validar.
- Despesas pagas antes desta correção podem ter `valor_pago` nulo mesmo com `pago = true` (se o usuário sempre aceitou o valor sugerido, ou se o campo nunca foi populado corretamente antes) — o fallback em cadeia (`valor_pago` → `valor_final` → `valor_original`) cobre esse caso sem exigir backfill.
- Nenhuma migration necessária; risco de banco é mínimo.
- Risco de quebrar contrato frontend/backend é baixo — o campo `valor_pago` já é retornado pela API, só não era consumido.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Escopo validado com o usuário, incluindo a correção do cálculo de saldo/relatórios além da exibição na listagem.

## Critérios de aceite do plano

- Após pagar uma despesa com valor diferente do lançado, a tabela de despesas (desktop) e o card (mobile) exibem o valor realmente pago, mantendo o valor original riscado como referência.
- O formulário de edição de despesa exibe o valor pago real quando a despesa já está paga.
- O saldo do mês (`/meses/:ano/:mes/saldo`) passa a refletir o valor efetivamente pago para despesas pagas.
- Os relatórios/panorama (`financial.ts`) refletem o valor efetivamente pago nos agregados de despesas pagas.
- Despesas não pagas continuam se comportando exatamente como antes.
- Nenhuma migration foi executada.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations sem confirmação explícita — não deve ser necessário neste caso, já que a coluna existe.
- Seguir `/AGENT.md` e `sistema financas/AGENT.md` (idênticos): Drizzle preferencial, mas as queries afetadas em `months.ts`/`financial.ts` já são SQL raw parametrizado existente — manter o padrão já usado nesses arquivos em vez de migrar para Drizzle nesta correção, para manter o escopo focado no bug.
- Manter alterações pequenas e focadas no bug relatado; não refatorar estruturas não relacionadas.
- Validar visualmente no navegador o fluxo de pagamento com valor divergente antes de considerar a tarefa concluída, conforme a diretriz geral do projeto para mudanças de UI.
