# Plano de Implementação: Refatorar Campos de Valor em Despesas

## Origem

- Data do planejamento: `2026-07-02`
- Classificação: `frontend + backend + database`

## Resumo

Substituir três campos de valor ambíguos (`valor`, `valor_original`, `valor_total_com_juros`, `desconto`) por dois campos semânticos claros:

- **`valor_original`** — preço base / valor inicial (serve também para despesas simples e não parceladas)
- **`valor_final`** — valor efetivamente pago/total, incluindo juros de atraso, desconto ou total parcelado

O campo `valor` (por parcela) e `desconto` são removidos completamente do banco e do código.
`valor_final` é sempre visível e editável no formulário, inclusive para despesas simples (ex: pago com atraso e juros).
`total_parcelas` fica sempre visível mas desabilitado quando não parcelado.

## Escopo

### Dentro do escopo

- Migration SQL: rename `valor_total_com_juros → valor_final`, backfill `valor_original` e `valor_final` para registros sem parcelamento, DROP `valor` e `desconto`
- Drizzle schema `expenses.ts`: remover `amount` (valor), `discount` (desconto); renomear `totalAmountWithInterest → finalAmount`
- Backend legado `backend/routes/despesas.js`: atualizar INSERT, UPDATE, SELECT e `criarParcelasFuturas`
- Backend TS `backend/src/routes/expenses.ts`: idem
- Frontend types `src/types/finance.ts`: remover `valor`, `valorTotalComJuros`, `desconto`; adicionar `valorFinal`
- `src/services/financeService.ts`: atualizar mapeamento da resposta da API
- `src/screens/finance/ExpenseDialog.tsx`: layout unificado — 3 campos sempre visíveis, `total_parcelas` disabled quando não parcelado; remover ternário parcelado/simples
- Todos os componentes que exibem `expense.valor` → usar `valorFinal`

### Fora do escopo

- Reprocessar cálculos históricos de saldo mensal já fechado
- Alterar lógica de agrupamento de parcelas (mantém `grupo_parcelamento_id`)
- Alterar tabela de receitas
- `valor_pago` — mantido sem alteração neste plano

## Leitura de contexto

- `AGENT.md` — regras de banco, multi-tenant, Drizzle, anti-patterns
- `backend/src/db/schema/expenses.ts` — schema atual
- `backend/routes/despesas.js` — rota legada JS com SQL raw
- `backend/src/routes/expenses.ts` — rota TS
- `src/types/finance.ts` — tipos frontend
- `src/screens/finance/ExpenseDialog.tsx` — formulário atual

## Impacto por área

### Frontend

- **`src/types/finance.ts`**: interface `Expense` — remover `valor`, `valorTotalComJuros`, `desconto`; adicionar `valorFinal?: number | null`. Interface `ExpenseFormValues` — remover `valor`, `valor_total_com_juros`, `desconto`; adicionar `valor_final?: number`
- **`src/services/financeService.ts`**: mapear `valor_final` da resposta da API
- **`src/screens/finance/ExpenseDialog.tsx`**:
  - Remover ternário `parcelado ? <bloco-parcelado> : <bloco-simples>`
  - Layout único sempre visível: `valor_original` | `valor_final` | `total_parcelas`
  - `total_parcelas` com `disabled={!parcelado}`
  - `valor_final` sempre editável
  - Hints: "Valor inicial" + "Valor final (com juros ou desconto)"
  - Preview de parcelas só aparece quando parcelado e `total_parcelas >= 2`
  - `form.setValue('valor_final', ...)` remove o `form.setValue('valor', ...)` existente
- **Componentes de exibição** (verificar e atualizar cada um):
  - `src/screens/finance/ExpensePanel.tsx`
  - `src/screens/finance/FinanceDashboard.tsx`
  - `src/screens/despesas/DespesasScreen.tsx`
  - `src/layout/AppShell.tsx`
  - `src/screens/relatorios/RelatoriosScreen.tsx`
  - `src/screens/finance/IncomePanel.tsx` (se referencia despesas)

### Backend

- **`backend/routes/despesas.js`** (SQL raw):
  - GET: `SELECT d.*` já retorna tudo, mas remover referências a `valor` no mapeamento; adicionar `valor_final` no retorno
  - POST INSERT: trocar `valor` por `valor_final` calculado; trocar `valor_total_com_juros` por `valor_final`; remover `desconto`
  - PUT UPDATE: idem
  - `criarParcelasFuturas`: trocar `despesaBase.valor` por `Math.round((despesaBase.valor_final / totalParcelas) * 100) / 100` — **atenção: este campo não existirá mais, precisa calcular**
  - **Observação:** como `valor` será removido do banco, o INSERT das parcelas futuras precisará de novo campo para armazenar o valor por parcela. Ver perguntas em aberto.

- **`backend/src/routes/expenses.ts`** (TS):
  - Remover `amount` (valor) do INSERT/UPDATE
  - Renomear `totalAmountWithInterest → finalAmount` no código
  - Remover `discount`

### Banco de dados

**Migration SQL — executar na ordem exata:**

```sql
-- 1. Renomear coluna
ALTER TABLE despesas RENAME COLUMN valor_total_com_juros TO valor_final;

-- 2. Backfill: registros sem parcelamento têm valor_original NULL
--    Preenche com o valor da despesa simples
UPDATE despesas
SET valor_original = valor
WHERE valor_original IS NULL AND valor IS NOT NULL;

-- 3. Backfill: registros sem parcelamento têm valor_final NULL
--    Preenche com o mesmo valor (sem juros/desconto)
UPDATE despesas
SET valor_final = valor
WHERE valor_final IS NULL AND valor IS NOT NULL;

-- 4. Remover desconto (derivável: valor_original - valor_final quando positivo)
ALTER TABLE despesas DROP COLUMN IF EXISTS desconto;

-- 5. Remover valor (coluna principal, substituída por valor_original/valor_final)
ALTER TABLE despesas DROP COLUMN valor;
```

**Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**Riscos de banco:**
- DROP COLUMN `valor` é irreversível sem backup
- Registros parcelados têm `valor` = valor por parcela; após migration, esse valor fica implícito em `valor_final / total_parcelas`

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/db/schema/expenses.ts`
- `backend/routes/despesas.js`
- `backend/src/routes/expenses.ts`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/ExpensePanel.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/layout/AppShell.tsx`
- `src/screens/relatorios/RelatoriosScreen.tsx`

## Estratégia de implementação

```
1. Apresentar SQL de migration ao usuário e aguardar confirmação explícita
2. Executar migration após confirmação
3. Atualizar Drizzle schema (expenses.ts)
4. Atualizar backend/routes/despesas.js (INSERT, UPDATE, criarParcelasFuturas)
5. Atualizar backend/src/routes/expenses.ts
6. Atualizar src/types/finance.ts
7. Atualizar src/services/financeService.ts
8. Atualizar ExpenseDialog.tsx (layout unificado, sem ternário)
9. Atualizar todos os componentes de exibição (varrer .valor)
10. npx vite build para validar frontend
11. npx tsc --noEmit no backend para validar tipos
```

## Regras de negócio identificadas

- `valor_original` = preço base acordado (nunca muda após parcelamento)
- `valor_final` = total pago (pode ser > original com juros, < com desconto, = com parcelamento sem juros)
- Para parcelado: valor por parcela = `valor_final / total_parcelas` (derivado, não armazenado)
- `valor_final` é relevante para qualquer despesa, não só parcelada
- `total_parcelas` só é habilitado quando `parcelado = true`

## Regras multi-tenant e segurança

- Todas as queries em `despesas.js` já filtram por `usuario_id` — manter esse padrão
- Não há risco adicional de vazamento multi-tenant nesta refatoração
- Não alterar `.env`, não alterar configuração de autenticação

## Validações necessárias

- `valor_original`: obrigatório, > 0
- `valor_final`: opcional (pode ser igual a `valor_original` quando sem juros/desconto)
- `total_parcelas`: obrigatório e >= 2 quando `parcelado = true`; null ou disabled quando não parcelado
- Backend deve rejeitar `valor_original <= 0`

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npx tsc --noEmit
```

## Riscos e pontos de atenção

- **Alto:** `valor` referenciado em muitos arquivos de exibição — varrer todos antes de finalizar
- **Alto:** migration DROP COLUMN `valor` é irreversível — confirmar ambiente antes
- **Médio:** `criarParcelasFuturas` usa `despesaBase.valor` para replicar valor de parcela — após remoção, calcular como `valor_final / total_parcelas`
- **Baixo:** `valor_pago` não é alterado — manter como está

## Perguntas em aberto

1. **Exibição de parcelado em listas/painéis:** mostrar `valor_final` (total da compra) ou `valor_final / total_parcelas` (valor por parcela)?
2. **`valor_pago`:** entra em alguma refatoração futura ou fica fora do escopo?

## Critérios de aceite

- Nenhuma referência a `valor` (coluna removida) no código após implementação
- Nenhuma referência a `valor_total_com_juros` ou `desconto` no código
- Build frontend e backend passam sem erros
- Modal de despesa mostra sempre 3 campos de valor; `total_parcelas` disabled quando não parcelado
- Despesas simples salvas com `valor_original` e `valor_final` preenchidos
- Despesas parceladas com `valor_final` = total e `valor_original` = base

## Observações para a skill implementar

- Iniciar SEMPRE pela migration — apresentar SQL ao usuário e aguardar confirmação explícita antes de executar
- Nunca executar migration sem confirmação, pois o ambiente pode apontar para produção
- Após migration, seguir a ordem: schema → backend → types → service → dialog → displays
- Varrer todos os arquivos com `grep "\.valor"` antes de finalizar para garantir que nenhuma referência foi esquecida
- Seguir padrões de `AGENT.md`: queries com filtro `usuario_id`, sem `any` desnecessário
- Perguntas em aberto (exibição de parcelado) podem ser respondidas durante implementação com o usuário
