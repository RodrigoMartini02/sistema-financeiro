# Plano de Implementação: Parcelamento Completo + Saldo de Reservas

## Origem

- Data do planejamento: 2026-06-29
- Classificação: `frontend + backend + database`

## Resumo

Dois ajustes independentes no mesmo branch:

1. **ExpenseDialog** — parcelamento liberado para qualquer forma de pagamento. Quando marcado, o usuário entra com **valor inicial** (sem juros), **valor total com juros** e **desconto**. O sistema calcula juros, valor efetivo e valor por parcela automaticamente. O campo `valor` da parcela passa a ser derivado.

2. **Reservas** — o SQL que valida saldo disponível antes de um depósito em reserva não subtrai as despesas dos meses abertos, permitindo reservar dinheiro já comprometido. A correção adiciona esse bloco à query.

## Escopo

### Dentro do escopo

- Remover restrição `isCredito` do checkbox Parcelado no ExpenseDialog
- Remover `form.setValue('parcelado', false)` do handler de pagamento não-crédito
- Novos campos no formulário: valor inicial, valor total com juros, desconto, número de parcelas
- Preview automático: juros (calculado), valor efetivo, valor por parcela
- `valor` derivado automaticamente como `(valor_total_com_juros - desconto) / num_parcelas` quando parcelado = true
- Novo campo no banco: `ALTER TABLE despesas ADD COLUMN IF NOT EXISTS desconto DECIMAL(10,2)`
- Backend aceita e persiste `desconto` em POST e PUT de despesas
- Corrigir `AVAILABLE_BALANCE_SQL` nas reservas para subtrair despesas dos meses abertos

### Fora do escopo

- Desconto em despesas não parceladas
- Juros em modo não parcelado
- Modificar a lógica de replicação de parcelas no banco (já funciona)
- Testes automatizados

## Leitura de contexto

- `/AGENT.md` — lido
- `src/screens/finance/ExpenseDialog.tsx` — lido
- `src/types/finance.ts` — lido
- `src/services/financeService.ts` — lido
- `backend/src/routes/expenses.ts` — lido
- `backend/src/routes/reserves.ts` — lido
- `backend/src/db/schema/expenses.ts` — lido

## Impacto por área

### Frontend

**`src/screens/finance/ExpenseDialog.tsx`**

- Remover `isCredito &&` da renderização condicional do `<CompactCheck label="Parcelado">`
- Remover `form.setValue('parcelado', false)` do `else` branch em `handlePaymentSelect`
- Adicionar ao schema Zod: `valor_original`, `valor_total_com_juros`, `desconto`
- Quando `parcelado = true`:
  - Ocultar o campo `valor` (torna-se calculado)
  - Exibir bloco de parcelamento com:
    - Campo: Valor inicial (R$) → `valor_original`
    - Campo: Total com juros (R$) → `valor_total_com_juros`
    - Campo: Desconto (R$) → `desconto` (opcional)
    - Campo: Número de parcelas → `total_parcelas`
    - Preview read-only: Juros = valor_total_com_juros - valor_original, Por parcela = (valor_total_com_juros - desconto) / num_parcelas
  - Setar `form.setValue('valor', valorPorParcela)` via `useEffect` ou `useWatch` sempre que os campos mudam
- Quando `parcelado = false`:
  - Campo `valor` normal (comportamento atual)
  - Campos valor_original, valor_total_com_juros, desconto ocultos
- Modo edição de parcelada existente: exibir calculado mas manter `valor` editável como fallback se `valor_total_com_juros` não estiver preenchido

**`src/types/finance.ts`**

- Adicionar a `ExpenseFormValues`:
  ```ts
  valor_original?: number;
  valor_total_com_juros?: number;
  desconto?: number;
  ```
- Adicionar a `Expense`:
  ```ts
  valorOriginal?: number | null;
  valorTotalComJuros?: number | null;
  desconto?: number | null;
  ```

**`src/services/financeService.ts`**

- Adicionar a `RawExpense`:
  ```ts
  valor_original?: string | null;
  valor_total_com_juros?: string | null;
  desconto?: string | null;
  ```
- Em `expenseFromApi`: mapear os três campos novos
- Em `saveExpense`: adicionar ao body:
  ```ts
  valor_original: values.valor_original ?? null,
  valor_total_com_juros: values.valor_total_com_juros ?? null,
  desconto: values.desconto ?? null,
  ```

### Backend

**`backend/src/routes/expenses.ts`**

- POST `/api/expenses`: aceitar `desconto` no body, incluir no INSERT
  - `desconto ?? null` no array de params
  - Adicionar coluna na query INSERT
- PUT `/api/expenses/:id`: aceitar `desconto`, incluir no UPDATE SET
- `createFutureInstallments`: não precisa propagar `desconto` para as parcelas futuras (desconto é atributo da compra total, não da parcela individual)

**`backend/src/routes/reserves.ts`**

Substituir `AVAILABLE_BALANCE_SQL` para subtrair despesas dos meses abertos após o último mês fechado:

```sql
WITH uf AS (
  SELECT ano, mes, saldo_final
  FROM meses
  WHERE usuario_id = $1 AND fechado = true
    AND (ano < $2 OR (ano = $2 AND mes <= $3))
  ORDER BY ano DESC, mes DESC
  LIMIT 1
)
SELECT
  COALESCE((SELECT saldo_final FROM uf), 0)
  + COALESCE((
      SELECT SUM(r.valor)
      FROM receitas r
      WHERE r.usuario_id = $1
        AND r.descricao NOT ILIKE 'Saldo Anterior%'
        AND (r.ano < $2 OR (r.ano = $2 AND r.mes <= $3))
        AND NOT EXISTS (
            SELECT 1 FROM meses m
            WHERE m.usuario_id = $1 AND m.ano = r.ano AND m.mes = r.mes AND m.fechado = true
        )
        AND (
            NOT EXISTS (SELECT 1 FROM uf)
            OR r.ano > (SELECT ano FROM uf)
            OR (r.ano = (SELECT ano FROM uf) AND r.mes > (SELECT mes FROM uf))
        )
  ), 0)
  - COALESCE((
      SELECT SUM(d.valor)
      FROM despesas d
      WHERE d.usuario_id = $1
        AND (d.ano < $2 OR (d.ano = $2 AND d.mes <= $3))
        AND NOT EXISTS (
            SELECT 1 FROM meses m
            WHERE m.usuario_id = $1 AND m.ano = d.ano AND m.mes = d.mes AND m.fechado = true
        )
        AND (
            NOT EXISTS (SELECT 1 FROM uf)
            OR d.ano > (SELECT ano FROM uf)
            OR (d.ano = (SELECT ano FROM uf) AND d.mes > (SELECT mes FROM uf))
        )
  ), 0)
  - COALESCE((
      SELECT SUM(valor) FROM reservas
      WHERE usuario_id = $1 AND (ano < $2 OR (ano = $2 AND mes <= $3))
  ), 0)
  AS saldo_disponivel
```

### Banco de dados

**Migration necessária:**
```sql
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS desconto DECIMAL(10, 2);
```

- Não-destrutiva: ADD COLUMN IF NOT EXISTS com valor NULL por padrão
- Nenhuma linha existente é afetada
- **Atenção: não executar sem confirmação explícita do usuário — o banco pode estar em produção**

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/ExpenseDialog.tsx`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/reserves.ts`

## Estratégia de implementação

1. **Confirmar e executar migration** — `ALTER TABLE despesas ADD COLUMN IF NOT EXISTS desconto DECIMAL(10,2)` — aguardar confirmação do usuário
2. **`backend/src/routes/expenses.ts`** — aceitar `desconto` no POST e PUT, incluir nas queries
3. **`backend/src/routes/reserves.ts`** — substituir `AVAILABLE_BALANCE_SQL` pela versão corrigida
4. **`src/types/finance.ts`** — adicionar campos à `ExpenseFormValues` e `Expense`
5. **`src/services/financeService.ts`** — mapear e enviar novos campos
6. **`src/screens/finance/ExpenseDialog.tsx`** — remover gate `isCredito`, adicionar campos e preview
7. **Build de validação** — `npm run build` na raiz e `cd backend && npm run build`

## Regras de negócio identificadas

- `valor` (por parcela) = `(valor_total_com_juros - (desconto ?? 0)) / num_parcelas`
- `juros` exibido = `valor_total_com_juros - valor_original` (somente display, não persiste)
- Parcelado disponível para todas as formas de pagamento
- `desconto` e `valor_total_com_juros` são opcionais; se ausentes, `valor` continua como campo de entrada normal
- Saldo disponível para reservas = `saldo_final fechado + receitas abertas − despesas abertas − reservas`
- Despesas/receitas "abertas" = apenas meses posteriores ao último mês fechado

## Regras multi-tenant e segurança

- Todas as queries já filtram por `usuario_id = $1` derivado do JWT via `req.user!.id`
- O novo campo `desconto` segue o mesmo padrão — nenhum dado de outro usuário é acessível
- A correção do SQL de reservas mantém o filtro `usuario_id = $1` em todas as subconsultas

## Validações necessárias

- `valor_original`: número >= 0, opcional
- `valor_total_com_juros`: número >= 0, deve ser >= `valor_original` se ambos preenchidos
- `desconto`: número >= 0, deve ser < `valor_total_com_juros` se preenchido
- `num_parcelas`: inteiro >= 2 quando `parcelado = true`
- Frontend: bloquear submit se parcelado e os campos obrigatórios estiverem ausentes

## Riscos e pontos de atenção

- **Migration em produção** — `ADD COLUMN IF NOT EXISTS` é seguro, mas confirmar ambiente antes
- **Saldo de reservas menor após correção** — depósitos que antes passavam podem começar a falhar (comportamento correto, mas usuário deve estar ciente)
- **`valor` derivado no modo parcelado** — modo edição de parcelada existente sem `valor_total_com_juros` preenchido deve fazer fallback para `valor` editável manualmente

## Perguntas em aberto

Nenhuma.

## Critérios de aceite

- Checkbox "Parcelado" aparece sem necessidade de selecionar cartão de crédito
- Ao marcar Parcelado: campos valor inicial, valor total com juros, desconto e parcelas aparecem
- Preview mostra: juros calculado e valor por parcela
- Campo `valor` é derivado automaticamente quando parcelado
- `desconto` é persistido no banco
- Depósito em reserva é rejeitado quando `saldo_disponivel` (incluindo despesas abertas) for insuficiente
- Build passa sem erros de TypeScript

## Observações para a skill implementar

- Executar migration ANTES de qualquer alteração de backend — e aguardar confirmação do usuário
- Seguir `/AGENT.md`: queries filtradas por `usuario_id`, sem `any`, sem SQL raw desnecessário
- `valor` derivado: usar `useWatch` nos três campos (valor_original, valor_total_com_juros, desconto, total_parcelas) e setar via `form.setValue('valor', calculado)` em um `useEffect`
- Não alterar `.env`
- Não executar migrations sem confirmação explícita
- Branch: `feat/R/parcelamento-reservas`
