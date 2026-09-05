# Plano de Implementação: Padronizar listagem de Planejamento com hierarquia de categorias

## Origem

- Arquivo de especificação: não há `.md` de feature. A especificação é o pedido do
  usuário: *"a listagem de categorias em 'planejamento' poderia ser igual ao que foi
  feito em configurações, o que acha, e lembrar das subcategorias"*.
  O padrão de referência é o já aplicado nas 10 telas de Configurações.
- Data do planejamento: `2026-09-05`
- Classificação: `fullstack (frontend + backend)`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Duas frentes distintas, e a mais séria não é visual.

### Frente visual

`BudgetPanel.tsx` (299 linhas) mantém **duas implementações paralelas da mesma
lista**: uma `<table>` para desktop (linhas 241–296) e cards para mobile
(linhas 195–239), com o bloco de botões de ação duplicado nas duas. É a última
listagem do sistema ainda em `<table>`. Não usa `ConfigListRow`,
`ConfigTabHeader` nem os tokens `CFG`. O editor de meta é um painel inline com
campos de 40px e as cores `#0C9EAF` / `#087B89` hardcoded — que não são sequer os
tokens do projeto (`C.primary` é `#0891b2`).

### Frente de comportamento

A query de categorias em `backend/src/services/budgetService.ts:167`:

```ts
db.select({ id: categories.id, name: categories.name })
  .from(categories).where(eq(categories.userId, userId))
```

Traz apenas `id` e `name`. Disso decorrem três defeitos:

| # | Defeito | Efeito prático |
|---|---|---|
| 1 | `parentId` não é lido | Pai e filha aparecem lado a lado, sem hierarquia |
| 2 | Despesas somadas por `categoryId` exato | Meta no pai **ignora** o lançado nas filhas — parece cumprida sem estar |
| 3 | `ativo` não é filtrado | Categorias desativadas aparecem na lista de metas |

O defeito 2 faz a tela informar números errados hoje. É a principal justificativa
técnica deste plano.

### Correção de uma análise anterior

Em conversa anterior foi afirmado que faltava filtro por `type` e que categorias de
receita entrariam na lista de metas. **Isso está errado e foi verificado**: a coluna
`tipo` em `categorias` assume `'pessoal' | 'empresa'` (tipo de conta), não
receita/despesa — e `BudgetPanel` já bloqueia conta empresa (`accountType ===
'empresa'` retorna cedo). O que de fato falta é o filtro de `ativo` e o filtro por
`conta_id` (a rota de Configurações filtra por conta; a do orçamento não).

## Decisões aplicadas

- **Decisão 1:** Rollup — a meta do pai soma as despesas das subcategorias. Meta
  continua cadastrável apenas na categoria raiz; subcategorias exibem consumo.
- **Decisão 2:** Aplicar `.config-scope` no wrapper do `BudgetPanel`, mesma solução
  já usada em `ClientesTab`.
- **Decisão 3:** Categoria desativada some da lista; a meta permanece gravada em
  `budget_targets` e volta a aparecer se a categoria for reativada.

## Escopo

### Dentro do escopo

**Backend:**

- Selecionar `parentId` e `ativo` na query de categorias do orçamento
- Filtrar categorias desativadas (meta preservada — Decisão 3)
- Implementar rollup: despesa lançada em subcategoria soma no total do pai
- Adicionar `parentId` a `BudgetOverviewItem`
- Validar em `saveBudgetTarget` que a meta só é aceita em categoria raiz

**Frontend:**

- Deletar a `<table>` e os cards mobile; uma única implementação com `ConfigListRow`
- Hierarquia: índices `01` na raiz e `1.1` na subcategoria, badge "N sub",
  expandir/recolher — reaproveitando o padrão já validado em `CategoriasTab`
- `ConfigTabHeader` no lugar do cabeçalho atual
- Editor de meta: painel inline → `Dialog` no padrão novo (campo 32px, footer
  com `dialogFooterStyle` e `saveButtonStyle`)
- Aplicar `.config-scope` no wrapper (Decisão 2)
- Substituir `#0C9EAF` / `#087B89` pelos tokens do projeto
- Botão de meta apenas na raiz; subcategoria exibe consumo sem ação de meta

### Fora do escopo

- Qualquer migration (nenhuma é necessária — `parent_id` e `ativo` já existem)
- Alterar a tabela `budgetTargets`
- Adicionar `ativo` ao schema Drizzle de `categories` — **dívida técnica
  registrada**: a coluna existe no banco e é usada via SQL raw em
  `routes/categories.ts` (`COALESCE(c.ativo, true)`), mas não está declarada em
  `backend/src/db/schema/categories.ts`
- Demais abas de `MovimentacoesScreen`
- Permitir meta em subcategoria (excluído pela Decisão 1)

## Leitura de contexto

- `CLAUDE.md` da raiz e de `sistema financas/` — regras de workflow aplicadas
- `AGENT.md` da raiz — **lido, com divergência registrada**: descreve um backend
  multi-prefeitura com multi-tenant + RLS que não corresponde a este projeto
  (sistema financeiro isolado por `usuario_id`). As regras de multi-tenant/RLS não
  se aplicam; as de Drizzle, TypeScript e performance sim.
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- Arquivos inspecionados: `src/screens/finance/BudgetPanel.tsx`,
  `backend/src/services/budgetService.ts`, `backend/src/routes/budget.ts`,
  `backend/src/routes/categories.ts`, `backend/src/db/schema/categories.ts`,
  `src/types/budget.ts`, `src/services/budgetService.ts`,
  `src/screens/config/CategoriasTab.tsx` (padrão de árvore de referência),
  `src/screens/finance/MovimentacoesScreen.tsx`

## Impacto por área

### Frontend

- **Tela:** aba "Planejamento" dentro de Movimentações
- **Componentes:** passa a usar `ConfigListRow`, `ConfigTabHeader`, `Dialog`
- **Query keys:** `queryKeys.budgetOverview(month, year)` inalterada
- **Forms:** editor de meta migra de painel inline para `Dialog`
- **Validações:** preservadas; botão de meta deixa de aparecer em subcategoria
- **Estados:** loading, error e o caso `accountType === 'empresa'` preservados
- **Testes:** o projeto não possui suíte de frontend

### Backend

- **Rotas:** `routes/budget.ts` sem alteração de contrato de entrada
- **Services:** `budgetService.ts` — query, agregação (rollup) e validação
- **Validações:** nova regra rejeitando meta em categoria com `parent_id`
- **Permissões:** inalteradas
- **Testes:** o projeto tem suíte real (`npm test`, 23 testes passando)

### Banco de dados

`Sem alteração de schema.`

As colunas `parent_id` e `ativo` já existem na tabela `categorias`. Nenhuma
migration é criada ou executada por este plano.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário,
pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

| Arquivo | Alteração |
|---|---|
| `src/types/budget.ts` | adicionar `parentId` a `BudgetOverviewItem` |
| `backend/src/services/budgetService.ts` | query, filtro `ativo`, rollup, validação |
| `src/screens/finance/BudgetPanel.tsx` | reescrita da listagem e do editor de meta |

## Estratégia de implementação

1. Adicionar `parentId` a `BudgetOverviewItem` em `src/types/budget.ts`.
2. Backend: selecionar `parentId` e `ativo` na query de categorias; filtrar
   desativadas.
3. Backend: implementar o rollup — despesas de subcategorias somam no
   `projectedAmount` e `paidAmount` do pai. Ajustar também `suggestedAmount`
   (média dos 3 meses anteriores) para considerar o rollup.
4. Backend: validar em `saveBudgetTarget` que a categoria não tem `parent_id`,
   retornando `BudgetInputError` com mensagem clara.
5. Frontend: **deletar** a `<table>` (linhas ~241–296) e os cards mobile
   (~195–239) — não sobrepor.
6. Frontend: montar a árvore com `ConfigListRow`, `ConfigTabHeader` e
   `.config-scope`, seguindo o padrão de `CategoriasTab`.
7. Frontend: converter o editor de meta em `Dialog` no padrão novo.
8. Validar com `tsc --noEmit`, `vite build` e, no backend, `npm run build` +
   `npm test`.

## Regras de negócio identificadas

Preservadas:

- Meta é mensal e recorrente, escalada por `mesesNoIntervalo`
- Modo `amount` (R$) ou `income_percent` (percentual da receita)
- Status: `over` ≥ 100%, `attention` ≥ 80%, `healthy` abaixo, `without_target`
  quando não há meta
- Sugestão pela média dos três meses anteriores
- Conta empresa não possui planejamento (metas são de conta pessoal)

Novas:

- Meta só pode ser cadastrada em categoria raiz
- Categoria desativada não aparece na listagem; sua meta permanece gravada
- O total de uma categoria raiz inclui as despesas de suas subcategorias

## Regras multi-tenant e segurança

Este projeto **não é multi-tenant** no sentido descrito no `AGENT.md` da raiz: não
há prefeituras, `tenantId` nem RLS. O isolamento relevante é por `usuario_id`
combinado com `conta_id`, já aplicado nas queries existentes
(`expenseAccountCondition`, `incomeAccountCondition`, `resolveFinancialAccount`).

Cuidados:

- O rollup deve agregar **apenas dentro do mesmo `usuario_id` e conta resolvida** —
  a agregação é feita em memória sobre linhas já filtradas, sem nova query
- Nenhum filtro de usuário/conta existente pode ser removido
- A validação de meta em subcategoria deve ocorrer no backend, não apenas no
  frontend

## Validações necessárias

- Meta maior que zero (existente, preservar)
- `income_percent` não superior a 100 (existente, preservar)
- **Nova:** rejeitar `saveBudgetTarget` quando a categoria possuir `parent_id`,
  com mensagem clara e sem vazar dados de outras entidades
- Backend valida independentemente do frontend

## Testes necessários

### Frontend

- Não aplicável — o projeto não possui suíte de testes de frontend. Validação por
  typecheck, build e conferência visual.

### Backend

- Rollup: despesa lançada em subcategoria deve somar no `projectedAmount` do pai
- Categoria desativada não deve aparecer nos `items` do overview
- `saveBudgetTarget` deve rejeitar categoria com `parent_id`
- Os 23 testes existentes devem continuar passando

### E2E

- Não aplicável. Conferência manual: abrir Planejamento, expandir/recolher,
  definir meta na raiz, verificar que subcategoria não oferece ação de meta.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build

cd backend && npm run build
cd backend && npm test
```

## Riscos e pontos de atenção

- **Os números exibidos vão mudar.** Com o rollup, metas hoje classificadas como
  `healthy` podem passar a `attention` ou `over`. É a correção de um cálculo
  errado, mas o usuário verá a diferença sem ter alterado nada — vale avisar.
- **Metas já cadastradas em subcategorias**, se existirem, ficam órfãs: a validação
  nova impede novas, mas dados antigos podem existir no banco. Verificar antes de
  implementar e reportar ao usuário o que for encontrado (sem apagar nada).
- **`BudgetPanel` está fora do `.config-scope`** — é a mesma armadilha que causou o
  botão invisível em `ClientesTab`. Tratado pela Decisão 2, mas exige conferência
  visual, porque nem typecheck nem build detectam esse tipo de falha.
- **Categorias desativadas com meta somem da lista** (Decisão 3): a meta continua
  no banco sem forma de removê-la pela interface até a categoria ser reativada.
- **Backend tem suíte real:** qualquer regressão na agregação aparece nos 23 testes.
- Erro pré-existente em `src/screens/despesas/DespesasScreen.tsx:726` continuará
  aparecendo no `tsc --noEmit`; não é regressão e está fora do escopo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. As três decisões pendentes foram
respondidas pelo usuário e estão registradas em "Decisões aplicadas".

## Critérios de aceite do plano

- Nenhuma `<table>` remanescente no `BudgetPanel`; uma única implementação
  atendendo desktop e mobile
- Hierarquia visível: índices `01` / `1.1`, badge "N sub", expandir/recolher
- O total de uma categoria raiz reflete as despesas lançadas em suas subcategorias
- Categorias desativadas ausentes da listagem, com metas preservadas no banco
- Meta em subcategoria rejeitada pelo backend com mensagem clara
- Nenhuma cor hardcoded fora dos tokens (`#0C9EAF` / `#087B89` eliminados)
- Botão de meta presente apenas em categorias raiz
- `tsc --noEmit` sem erros novos; `vite build` passando; backend `npm run build`
  limpo e `npm test` com 23/23

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Deletar antes de aplicar**, em etapas explícitas — nunca sobrepor a estrutura
  nova sobre a antiga. Duas versões do mesmo elemento significa tarefa incompleta.
- Não executar migrations — nenhuma é necessária neste escopo.
- Não alterar `.env`.
- Preservar `usuario_id` e `conta_id` em todas as queries; não remover filtros
  existentes.
- Conferir visualmente que o `.config-scope` foi aplicado e que os componentes
  aparecem corretamente fora do drawer de Configurações.
- Antes de implementar a validação, verificar se já existem metas gravadas em
  subcategorias e reportar ao usuário — sem apagar dados.
