# Plano de Implementação: Tipo de Despesa vinculado à Categoria

## Origem

- Data do planejamento: `2026-06-30`
- Classificação: `frontend + backend + database`

## Resumo

O campo OPEX/CAPEX sai do modal de despesa e passa a ser definido na categoria-mãe. Ao registrar uma despesa, o `tipo_despesa` é derivado automaticamente: se a categoria selecionada é filha, busca-se o tipo da mãe; se é mãe, usa-se o tipo dela. O usuário não precisa nem ver o campo no cadastro de despesa.

## Escopo

### Dentro do escopo

- Coluna `tipo_despesa` na tabela `categorias` (migration)
- Backend `categorias.js`: GET/POST/PUT passam a incluir `tipo_despesa`
- `Categoria` type + `CategoriaFormValues`: adicionar campo
- `configService.ts`: repassar `tipo_despesa` no `saveCategoria`
- `CategoriasTab.tsx`: toggle OPEX / CAPEX visível **apenas em categorias-mãe** (sem `parent_id`)
- `ExpenseDialog.tsx`: remover pills OPEX/CAPEX; derivar `tipo_despesa` silenciosamente da categoria selecionada

### Fora do escopo

- Renomear `opex`/`capex` para português
- Alterar despesas já existentes no banco
- Tocar em `financeService.ts` (já envia `tipo_despesa` para o backend — sem mudança necessária)
- Backend TypeScript de despesas (`expenses.ts`) — sem mudança

## Leitura de contexto

- `/AGENT.md`
- `backend/routes/categorias.js`
- `src/types/config.ts`
- `src/services/configService.ts`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/services/financeService.ts`
- `backend/src/db/schema/expenses.ts`
- `backend/src/routes/expenses.ts`

## Impacto por área

### Frontend

- **`src/types/config.ts`**: adicionar `tipo_despesa?: 'opex' | 'capex' | null` em `Categoria` e `CategoriaFormValues`
- **`src/services/configService.ts`**: passar `tipo_despesa` no body de `saveCategoria`
- **`src/screens/config/CategoriasTab.tsx`**: no dialog de categoria, exibir toggle "Operacional (OPEX) / Capital (CAPEX)" somente quando `parent_id` é nulo (categoria raiz). Subcategorias não mostram o campo — herdam do pai
- **`src/screens/finance/ExpenseDialog.tsx`**: remover as pills OPEX/CAPEX; quando `categoria_id` muda, buscar na lista de categorias em cache: se for subcategoria → pegar `tipo_despesa` da mãe; se for mãe → usar o próprio; passar silenciosamente para `onSave` via `ExpenseFormValues`

### Backend

- **`backend/routes/categorias.js`** (legado JS, não TypeScript):
  - GET: adicionar `c.tipo_despesa` ao SELECT
  - POST: aceitar `tipo_despesa` do body, inserir na coluna
  - PUT: aceitar `tipo_despesa` do body, atualizar a coluna
  - Manter padrão JS existente (`query()` direto) — não converter para Drizzle

### Banco de dados

Migration necessária (confirmar com o usuário antes de executar):

```sql
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_despesa VARCHAR(10) DEFAULT 'opex';
```

**Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

Riscos:
- Se a coluna não existir quando o GET rodar, o SELECT vai falhar — a migration deve ser executada antes do deploy do código

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/routes/categorias.js`
- `src/types/config.ts`
- `src/services/configService.ts`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/finance/ExpenseDialog.tsx`

## Estratégia de implementação

1. Solicitar confirmação do usuário para executar a migration:
   ```sql
   ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_despesa VARCHAR(10) DEFAULT 'opex';
   ```
2. Após confirmação, executar a migration via Node.js (psql não está no PATH)
3. Atualizar `backend/routes/categorias.js`: GET/POST/PUT com `tipo_despesa`
4. Atualizar `src/types/config.ts`: adicionar campo em `Categoria` e `CategoriaFormValues`
5. Atualizar `src/services/configService.ts`: incluir `tipo_despesa` no body de `saveCategoria`
6. Atualizar `src/screens/config/CategoriasTab.tsx`: toggle no dialog somente para categorias raiz
7. Atualizar `src/screens/finance/ExpenseDialog.tsx`: remover pills OPEX/CAPEX; derivar `tipo_despesa` automaticamente ao mudar categoria
8. Rodar `npx vite build` para validar o frontend
9. Rodar `npx tsc --noEmit` no backend para validar TypeScript

## Regras de negócio identificadas

- Apenas categorias-mãe (sem `parent_id`) possuem o campo `tipo_despesa`
- Subcategorias herdam o `tipo_despesa` da mãe — não exibem nem permitem sobrescrever
- O valor padrão de uma nova categoria é `opex`
- No modal de despesa, o `tipo_despesa` é invisible para o usuário — derivado automaticamente
- A derivação ocorre no frontend: quando `categoria_id` muda, busca na lista de categorias em cache (já carregadas pelo `useQuery`)

## Regras multi-tenant e segurança

- Categorias já são filtradas por `usuario_id` no backend — o novo campo não altera essa regra
- Nenhum dado sensível novo é exposto
- O `tipo_despesa` vindo do client no POST/PUT de categorias é aceito normalmente (campo de classificação, sem risco de segurança)

## Validações necessárias

- `tipo_despesa` aceita apenas `'opex'` ou `'capex'` — backend deve ignorar ou rejeitar outros valores
- No frontend, o toggle garante que só um dos dois valores seja enviado

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npx tsc --noEmit
```

## Riscos e pontos de atenção

- O backend legado `categorias.js` usa `query()` direto (não Drizzle) — manter padrão para não introduzir drift
- A migration deve ser executada ANTES do código novo entrar em produção
- Se houver categorias criadas por enquadramento automático (MEI, ME, etc.) no momento da criação de perfil, elas receberão `tipo_despesa = 'opex'` por default — adequado para a maioria

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite

- Ao criar/editar uma categoria-mãe, o campo OPEX/CAPEX aparece
- Ao criar/editar uma subcategoria, o campo NÃO aparece
- No modal de nova/editar despesa, as pills OPEX/CAPEX não existem mais
- Ao selecionar uma categoria ou subcategoria na despesa, o `tipo_despesa` correto é enviado ao backend silenciosamente
- Build frontend e typecheck backend passam sem erros

## Observações para a skill implementar

- Executar a migration antes de qualquer alteração de código
- Backend de categorias é `backend/routes/categorias.js` (JS legado), não o `backend/src/` TypeScript
- `financeService.ts` não precisa ser alterado — já envia `tipo_despesa`
- A derivação do tipo na despesa ocorre via lista de categorias em cache (`useQuery`) — não fazer fetch extra
- Não alterar `.env`
- Não executar migrations sem confirmação explícita
