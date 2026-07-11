# Plano de Implementação: Melhorias no Modal de Despesas

## Origem

- Data do planejamento: 2026-06-29
- Classificação: `frontend + backend + database`

## Resumo

Quatro melhorias independentes no `ExpenseDialog.tsx`:

1. **Auto-sugestão de categoria** — lookup no cache do React Query para sugerir a categoria da última despesa com descrição similar. Zero chamadas extras ao backend.
2. **NF / Nota fiscal** — campos `numero_nf` + `data_emissao_nf`, visíveis apenas em perfil empresa.
3. **OPEX / CAPEX** — toggle tipo de despesa (`opex` | `capex`), visível apenas em perfil empresa.
4. **Detecção de duplicata** — verificação no cache antes de salvar; alerta não-bloqueante se despesa similar encontrada nos últimos 7 dias.

## Escopo

### Dentro do escopo

- Auto-sugestão: lookup em todos os dashboards cacheados via `queryClient.getQueriesData(['dashboard', ...])`. Sugestão discreta abaixo do campo descrição. Só age se o usuário ainda não escolheu categoria manualmente.
- NF: dois campos (`numero_nf` VARCHAR(50), `data_emissao_nf` DATE) condicionais a `perfilAtivoTipo === 'empresa'`
- OPEX/CAPEX: coluna `tipo_despesa VARCHAR(10) DEFAULT 'opex'`, toggle pill, condicional a empresa
- Duplicata: janela de 7 dias, match em `descricao + valor + forma_pagamento`, alerta inline não-bloqueante (usuário pode ignorar e salvar mesmo assim)
- Acesso ao tipo de perfil: `localStorage.getItem('perfilAtivoTipo')` — padrão já usado em `AppShell.tsx:330`

### Fora do escopo

- Sugestão de valor ou forma de pagamento por histórico
- NF e OPEX/CAPEX para perfil pessoal
- Integração com SPED / NF-e eletrônica
- Relatório separado por OPEX/CAPEX (só armazenamento)
- Testes automatizados

## Leitura de contexto

- `/AGENT.md` — lido
- `src/screens/finance/ExpenseDialog.tsx` — lido
- `src/types/finance.ts` — lido
- `src/services/financeService.ts` — lido
- `src/services/apiClient.ts` — lido (padrão `getActiveProfileId`, base para `getActiveProfileType`)
- `src/services/queryKeys.ts` — lido (estrutura do cache)
- `src/layout/AppShell.tsx` — lido (uso de `perfilAtivoTipo` em localStorage)
- `backend/src/routes/expenses.ts` — lido
- `backend/src/db/schema/expenses.ts` — lido

## Impacto por área

### Frontend

**`src/screens/finance/ExpenseDialog.tsx`**

**Feature 1 — Auto-sugestão de categoria:**
- Usar `useQueryClient()` (já importado) para acessar todos os dashboards cacheados:
  ```ts
  const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
  const allExpenses = allCached.flatMap(([, d]) => d?.expenses ?? []);
  ```
- No `useWatch` de `descricao`, com debounce de ~300ms, buscar `allExpenses` por substring (case-insensitive)
- Se encontrado e `categoria_id` ainda não definido: mostrar sugestão discreta abaixo do campo descrição com botão "Usar categoria X?"
- Ao aceitar: `form.setValue('categoria_id', sugestao.categoria_id_historico)`

**Feature 2 — NF / Nota fiscal:**
- Ler `isEmpresa = localStorage.getItem('perfilAtivoTipo') === 'empresa'` no topo do componente (via `useMemo` ou simples leitura — não reativo, perfil não muda durante uso do modal)
- Quando `isEmpresa`: renderizar seção "Nota Fiscal" com dois campos:
  - `numero_nf`: texto, placeholder "Ex: 000123456"
  - `data_emissao_nf`: date
- Adicionar ao schema Zod: `numero_nf: z.string().optional()`, `data_emissao_nf: z.string().optional()`

**Feature 3 — OPEX / CAPEX:**
- Quando `isEmpresa`: renderizar toggle pill abaixo da categoria ou antes das opções:
  - `tipo_despesa`: `'opex'` (Operacional) | `'capex'` (Capital)
  - Default: `'opex'`
- Adicionar ao schema: `tipo_despesa: z.enum(['opex', 'capex']).default('opex')`

**Feature 4 — Detecção de duplicata:**
- Em `handleSubmit`, antes de chamar `onSave`, verificar `allExpenses` por duplicata:
  ```ts
  const sete_dias_atras = new Date();
  sete_dias_atras.setDate(sete_dias_atras.getDate() - 7);
  const duplicata = allExpenses.find(e =>
    e.descricao.toLowerCase() === data.descricao.toLowerCase() &&
    e.valor === data.valor &&
    e.formaPagamento === data.formaPagamento &&
    new Date(e.dataVencimento) >= sete_dias_atras
  );
  ```
- Se encontrada: exibir aviso inline (não modal) com data da duplicata e botões "Salvar mesmo assim" / "Cancelar"
- Usar estado local `duplicataDetectada` para controlar o aviso
- Se usuário confirmar: salvar normalmente

**`src/types/finance.ts`**

Adicionar a `Expense`:
```ts
numeroNf?: string | null;
dataEmissaoNf?: string | null;
tipoDespesa?: 'opex' | 'capex' | null;
```

Adicionar a `ExpenseFormValues`:
```ts
numero_nf?: string;
data_emissao_nf?: string;
tipo_despesa?: 'opex' | 'capex';
```

**`src/services/financeService.ts`**

- Adicionar a `RawExpense`: `numero_nf`, `data_emissao_nf`, `tipo_despesa`
- Mapear em `expenseFromApi`
- Enviar em `saveExpense`:
  ```ts
  numero_nf: isEmpresa ? (values.numero_nf ?? null) : null,
  data_emissao_nf: isEmpresa ? (values.data_emissao_nf ?? null) : null,
  tipo_despesa: isEmpresa ? (values.tipo_despesa ?? 'opex') : null,
  ```
  Nota: `financeService.ts` não tem acesso direto ao `localStorage`. Passar como campos opcionais e deixar o componente decidir se preenche ou não (campos nulos para perfil pessoal).

### Backend

**`backend/src/routes/expenses.ts`**

POST:
- Adicionar `numero_nf`, `data_emissao_nf`, `tipo_despesa` ao destructuring do body
- Adicionar às colunas do INSERT e ao array de params

PUT:
- Mesmo padrão do POST

**`backend/src/db/schema/expenses.ts`**

Documentar as três novas colunas no schema Drizzle (para manter consistência; não gera migration automaticamente):
```ts
numeroNf: varchar('numero_nf', { length: 50 }),
dataEmissaoNf: date('data_emissao_nf'),
tipoDespesa: varchar('tipo_despesa', { length: 10 }).default('opex'),
```

### Banco de dados

**Migrations necessárias (3 colunas, todas não-destrutivas):**

```sql
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS numero_nf VARCHAR(50);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS data_emissao_nf DATE;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS tipo_despesa VARCHAR(10) DEFAULT 'opex';
```

- `numero_nf`: NULL por padrão, sem impacto em registros existentes
- `data_emissao_nf`: NULL por padrão, sem impacto
- `tipo_despesa`: DEFAULT `'opex'` — registros existentes receberão `'opex'` automaticamente

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/ExpenseDialog.tsx`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/db/schema/expenses.ts`

## Estratégia de implementação

1. **Migrations** — confirmar com usuário; executar as 3 colunas
2. **`backend/src/db/schema/expenses.ts`** — adicionar 3 campos ao schema Drizzle
3. **`backend/src/routes/expenses.ts`** — aceitar e persistir `numero_nf`, `data_emissao_nf`, `tipo_despesa` em POST e PUT
4. **`src/types/finance.ts`** — adicionar campos a `Expense` e `ExpenseFormValues`
5. **`src/services/financeService.ts`** — mapear em `expenseFromApi` e enviar em `saveExpense`
6. **`ExpenseDialog.tsx`** — feature 1: auto-sugestão de categoria
7. **`ExpenseDialog.tsx`** — feature 2: campos NF para empresa
8. **`ExpenseDialog.tsx`** — feature 3: toggle OPEX/CAPEX para empresa
9. **`ExpenseDialog.tsx`** — feature 4: detecção de duplicata
10. **Build de validação** — `npx vite build` + `npx tsc --noEmit` no backend

## Regras de negócio identificadas

- Auto-sugestão não substitui seleção manual: se o usuário já escolheu uma categoria, não sobrescrever
- Auto-sugestão usa a despesa mais recente com `descricao.includes(input)` (case-insensitive)
- NF e OPEX/CAPEX são enviados ao backend como `null` para perfil pessoal (não visível no form)
- `tipo_despesa` default `'opex'` para empresa; `null` para pessoal
- Duplicata: match em `descricao` (exact, case-insensitive) + `valor` (exato) + `forma_pagamento` (exato) dentro de 7 dias por `dataVencimento`
- Aviso de duplicata é não-bloqueante: "Salvar mesmo assim" disponível

## Regras multi-tenant e segurança

- Todas as queries backend já filtram por `usuario_id = req.user!.id`
- Os três campos novos não alteram nenhuma lógica de autorização
- `perfilAtivoTipo` vem do localStorage (fonte não-confiável para backend), mas é usado apenas para exibição no frontend; o backend não toma decisões com base nesse valor

## Validações necessárias

- `numero_nf`: string opcional, max 50 chars
- `data_emissao_nf`: date string opcional (`YYYY-MM-DD`)
- `tipo_despesa`: enum `'opex' | 'capex'`, opcional
- Auto-sugestão: só ativar quando `descricao.length >= 3`
- Duplicata: checar apenas se `allExpenses.length > 0` (cache disponível)

## Riscos e pontos de atenção

- Cache pode estar vazio em sessão nova → features 1 e 4 simplesmente não agem (comportamento correto, sem erro)
- `perfilAtivoTipo` no localStorage pode estar desatualizado se o usuário trocou de perfil sem recarregar — risco baixo, comportamento já existente no sistema
- Migrations com DEFAULT em produção: `tipo_despesa DEFAULT 'opex'` vai preencher todos os registros históricos com 'opex' — comportamento esperado e correto

## Perguntas em aberto

Nenhuma.

## Critérios de aceite

- Ao digitar ≥3 caracteres em Descrição, se houver despesa histórica com aquela substring, aparece sugestão de categoria abaixo do campo
- Sugestão desaparece se usuário selecionar categoria manualmente
- Campos NF (número + data emissão) aparecem apenas para perfil empresa
- Toggle OPEX/CAPEX aparece apenas para perfil empresa, default OPEX
- Tentar salvar despesa com mesma descrição + valor + forma de pagamento nos últimos 7 dias exibe aviso com data da despesa anterior
- Aviso de duplicata tem botão "Salvar mesmo assim" funcional
- Build sem erros de TypeScript

## Observações para a skill implementar

- `getQueriesData` do React Query aceita `{ queryKey: ['dashboard'] }` para filtrar por prefixo — usar esse padrão para coletar todos os meses em cache
- Debounce na auto-sugestão: usar `useState` + `useEffect` com `setTimeout(300ms)` — sem biblioteca externa
- `isEmpresa` deve ser lido com `useMemo(() => localStorage.getItem('perfilAtivoTipo') === 'empresa', [])` — não reativo intencionalmente (perfil não muda durante o modal)
- Não executar migrations sem confirmação explícita do usuário
- Não alterar `.env`
- Manter alterações focadas no escopo descrito
