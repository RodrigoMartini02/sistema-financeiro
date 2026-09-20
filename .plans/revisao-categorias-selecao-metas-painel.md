# Plano de Implementação: Revisão do sistema de categorias

## Origem

- Arquivo de especificação: pedido direto do usuário (sem `.md`), consolidado em sessão de planejamento
- Data do planejamento: 2026-09-20
- Classificação: **frontend + backend + database** (sem migration — ver seção Banco de dados)

## Resumo

Revisão do fluxo de categorias em 6 frentes: colapso padrão em Configurações, ocultar categorias desativadas em seletor de despesas e filtros, impedir seleção de categoria-pai quando ela tem subcategorias ativas, diferenciar visualmente categoria/subcategoria no seletor de despesas, tornar categoria obrigatória ao lançar despesa, e permitir meta própria em subcategoria (com a raiz que tiver subs perdendo a meta própria e virando puramente informativa/agregada).

O sétimo item do pedido original (gráfico de categorias no painel deve somar subs no pai e também mostrar as subs com valor próprio) já é satisfeito hoje por `MonthCategoriesOverview.tsx` (consome `BudgetOverview`, que já faz rollup) — não requer mudança de agregação, só se beneficia automaticamente do ajuste do item de metas (raiz-com-subs deixa de mostrar meta/status, mostra só o agregado). A cascata "maiores despesas" do `FinanceDashboard.tsx` (`porCategoria`) é um componente diferente (waterfall) e foi confirmado que deve continuar tratando raiz e sub como entradas independentes, sem rollup — portanto fica fora do escopo.

## Escopo

### Dentro do escopo

1. `CategoriasTab.tsx` (Configurações): categorias iniciarem colapsadas por padrão.
2. `CategoryFloatingSelect.tsx` (seletor no modal de despesas): manter filtro de desativadas (já existe, revisar edge case de categoria selecionada que foi desativada depois); ocultar da seleção qualquer categoria-raiz que tenha subcategoria ativa (só as subs ficam selecionáveis); diferenciar visualmente categoria "pura" (sem subs) vs. subcategoria (agrupamento/indentação por pai) na lista.
3. `ExpenseForm.tsx`: tornar `categoria_id` obrigatório (schema Zod + UI de erro).
4. `DespesasScreen.tsx` (filtro de despesas): trocar fonte das opções de filtro (hoje: nomes usados nas despesas já carregadas) para a lista mestra de categorias ativas, aplicando a mesma regra de ocultar raiz-com-subs-ativas da seleção direta (mantendo hierarquia visível).
5. `backend/src/db/schema/categories.ts`: declarar a coluna `ativo` no schema Drizzle (já existe fisicamente no banco, só falta no ORM).
6. `budgetService.ts` + `BudgetPanel.tsx`: inverter a regra de meta — permitida em categoria-folha (sem subs) e em subcategoria; bloqueada em categoria-raiz que tenha subcategorias ativas. Raiz-com-subs passa a ser exibida no Planejamento sem meta/status própria, só com o valor agregado (rollup já existente).
7. `MonthCategoriesOverview.tsx`: validar/ajustar exibição para que raiz-com-subs (agora permanentemente sem `targetAmount`) continue com leitura visual coerente como "sem meta".

### Fora do escopo

- Suporte a mais de 1 nível de hierarquia (sub de sub) — continua bloqueado como hoje.
- Mudanças no fluxo de criação/edição de categorias em si (nome, cor, ícone).
- Qualquer mudança em `backend/src/routes/financial.ts` (`porCategoria`) ou `FinanceDashboard.tsx` — confirmado que a cascata de maiores despesas deve continuar tratando raiz e sub como barras/entradas independentes, sem rollup.
- Tratamento de meta órfã/migração de dados — não se aplica: usuário confirmou que não há metas cadastradas no sistema hoje.
- Mudança em `DonutChart.tsx` genérico ou nos outros donuts do painel (forma de pagamento, origem, membro).

## Leitura de contexto

- `AGENT.md` (raiz do repositório) — lido; contém as regras de fluxo `/planejar → /implementar → /finalizar`, git flow.
- `sistema financas/CLAUDE.md` — lido; não existe `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto (não há essa separação de pastas na raiz do repo — `src/` e `backend/` convivem dentro de `sistema financas/`). O `CLAUDE.md` do subprojeto cobre as regras operacionais: ambiente pode estar apontando para produção, nunca alterar `.env` sem confirmação, nunca migration sem confirmação explícita.
- Arquivos de código explorados (via subagente de investigação + leitura direta nesta sessão):
  - `backend/config/schema-dev.sql` (tabela `categorias`, linhas 426-441; índices únicos 2803-2813)
  - `backend/src/db/schema/categories.ts` (schema Drizzle atual, sem `ativo`)
  - `backend/src/routes/categories.ts` (endpoints CRUD + `toggle-active`, bloqueio de sub-de-sub linha 249-252)
  - `backend/src/db/schema/copilot.ts` (tabela `budgetTargets`, linhas 66-82)
  - `backend/src/services/budgetService.ts` (rollup `withSubcategories` linhas 302-319; validação de meta linhas 385-392)
  - `backend/src/routes/budget.ts` (rotas `/resumo`, `/metas`)
  - `backend/src/routes/financial.ts` (query `porCategoria`, linhas 176-186 — mantida sem alteração)
  - `src/screens/config/CategoriasTab.tsx` (estado `collapsed`, `mostrarDesativadas`)
  - `src/screens/finance/ExpenseForm.tsx` (schema Zod, campo opcional hoje)
  - `src/ui/CategoryFloatingSelect.tsx` (lista plana alfabética, filtro de ativas)
  - `src/screens/despesas/DespesasScreen.tsx` (fonte do filtro de categoria, linha 358)
  - `src/screens/finance/BudgetPanel.tsx` (árvore raiz/filho, botão de meta só na raiz)
  - `src/screens/finance/MonthCategoriesOverview.tsx` (consumo de `BudgetOverview` já com rollup)
  - `src/screens/finance/FinanceDashboard.tsx` (cascata `waterfallSteps`, consumo de `porCategoria` — mantido sem alteração)
  - `src/types/config.ts` (`Categoria`, `CategoriaFormValues`)
  - `src/types/budget.ts` (`BudgetOverviewItem`)

## Impacto por área

### Frontend

- **`src/screens/config/CategoriasTab.tsx`**: mudar o valor inicial de `collapsed` (hoje `useState<number[]>([])`, linha ~250) para já conter os ids de todas as categorias-raiz com subcategoria no primeiro render, em vez de iniciar vazio (que hoje resulta em tudo expandido).
- **`src/ui/CategoryFloatingSelect.tsx`**:
  - Excluir da lista selecionável (`active`/`alphabetical`/`filtered`) qualquer categoria-raiz que tenha ao menos uma subcategoria ativa — ela deixa de ser um item clicável e passa a ser renderizada só como cabeçalho/label do grupo.
  - Agrupar visualmente: nome da raiz como separador de seção (não clicável), subcategorias indentadas/com estilo distinto logo abaixo; categorias sem subs (folhas "soltas", sem pai) continuam como itens normais, intercalados ou em seção própria.
  - Ajustar lógica de busca (`normalizedQuery`/`filtered`) para continuar funcionando sobre essa estrutura agrupada.
- **`src/screens/finance/ExpenseForm.tsx`**: trocar `categoria_id: z.coerce.number().optional()` (linha ~34) por `categoria_id: z.coerce.number({ required_error: '...' }).min(1, 'Selecione uma categoria')`; remover o `undefined` do `default` e do payload de envio (linha ~478); exibir mensagem de erro de validação no campo do formulário.
- **`src/screens/despesas/DespesasScreen.tsx`**: substituir a origem das opções do filtro (`[...new Set(allItems.map(i => i.categoria))]`, linha 358) pela lista mestra de categorias ativas (via serviço já existente `fetchCategorias`/equivalente), aplicando a mesma regra do item 2 (ocultar raiz com subs ativas da seleção direta, preservando a hierarquia visualmente).
- **`src/screens/finance/BudgetPanel.tsx`**:
  - Habilitar `onEditTarget`/`onRemoveTarget` para `BudgetRow` quando for subcategoria (`isChild`).
  - Remover a exibição do botão de meta em categoria-raiz quando ela tiver subcategorias ativas (inverter a condição hoje baseada em `node.root.parentId === null`, linhas ~447-464, para considerar "tem subs ativas" em vez de "é raiz").
  - Ajustar a exibição da raiz-com-subs para não mostrar barra de "% da meta"/status (`over`/`attention`/`healthy`), já que não haverá `targetAmount` — mostrar só o valor agregado.
- **`src/screens/finance/MonthCategoriesOverview.tsx`**: validar visualmente que `statusLabel` (linha 38-41, já cai em "sem meta" quando `!item.targetAmount`) e `statusColor` continuam com leitura adequada agora que esse é o estado permanente de toda raiz-com-subs, não uma exceção pontual. Ajuste pontual de texto/estilo se necessário — sem mudança de lógica de dados.
- **`src/types/budget.ts`**: sem mudança estrutural esperada (`BudgetOverviewItem` já tem `parentId`, `targetAmount` opcional/nulo já é suportado).
- **`src/types/config.ts`**: sem mudança estrutural esperada.

### Backend

- **`backend/src/db/schema/categories.ts`**: adicionar `ativo: boolean('ativo').default(true)` ao `pgTable` de categorias — a coluna já existe fisicamente no banco (`schema-dev.sql:426-441`); esta é uma mudança de declaração no ORM, não uma migration.
- **`backend/src/routes/categories.ts`**: nenhuma mudança de contrato esperada; validar que `GET /` (listagem) continua retornando `ativo` corretamente tipado depois da mudança acima (hoje já retorna via SQL bruto/comentado em `budgetService.ts:216-217`).
- **`backend/src/services/budgetService.ts`**:
  - Em `saveBudgetTarget` (linhas 385-392): inverter a validação — em vez de bloquear quando `category.parentId !== null`, bloquear quando a categoria (raiz ou não) **tiver subcategorias ativas**. Isso exige buscar se existem subcategorias ativas com `parent_id = categoryId` antes de validar. Mensagem de erro nova, ex.: "Categorias com subcategorias não podem ter meta própria — defina a meta em cada subcategoria."
  - Em `getBudgetOverview`/`withSubcategories` (linhas 302-351): a raiz que tiver subcategorias ativas nunca deve carregar `targetAmount`/`mode`/`status` de meta própria no item retornado (mesmo que uma linha antiga exista em `orcamento_metas` — não se aplica hoje, mas a leitura deve ser resiliente); ela mantém apenas `projectedAmount`/`paidAmount` agregados (rollup já existente, sem alteração nessa parte).
- **`backend/src/routes/budget.ts`**: sem mudança de rota/contrato HTTP — a mudança de regra fica inteiramente dentro do service.

### Banco de dados

- **Nenhuma migration de schema é necessária.** A coluna `ativo` já existe fisicamente na tabela `categorias` (`schema-dev.sql:426-441`); falta apenas declará-la no schema Drizzle (mudança de código de aplicação, não de estrutura de banco).
- **Nenhuma migration de dados necessária.** Usuário confirmou que não há metas cadastradas hoje em `orcamento_metas` — não existe caso de "meta órfã" a tratar retroativamente.

> Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não prevê nenhuma migration; se a implementação identificar necessidade de uma, deve parar e pedir confirmação antes de prosseguir.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/ui/CategoryFloatingSelect.tsx`
- `sistema financas/src/screens/finance/ExpenseForm.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/screens/finance/BudgetPanel.tsx`
- `sistema financas/src/screens/finance/MonthCategoriesOverview.tsx`
- `sistema financas/backend/src/db/schema/categories.ts`
- `sistema financas/backend/src/services/budgetService.ts`

## Estratégia de implementação

1. Backend base: declarar `ativo` no schema Drizzle de categorias (`categories.ts`).
2. Backend metas: inverter a regra de validação em `saveBudgetTarget` (bloquear meta em categoria com subs ativas, permitir em folha e em sub) e ajustar `getBudgetOverview`/`withSubcategories` para raiz-com-subs nunca carregar meta própria.
3. Frontend Configurações: `CategoriasTab.tsx` — categorias iniciam colapsadas.
4. Frontend seletor de despesas: `CategoryFloatingSelect.tsx` — ocultar raiz-com-subs-ativas da seleção direta, agrupar visualmente pai/sub.
5. Frontend obrigatoriedade: `ExpenseForm.tsx` — `categoria_id` obrigatório no schema Zod e na UI de erro.
6. Frontend filtro: `DespesasScreen.tsx` — trocar fonte das opções do filtro para a lista mestra de categorias ativas, mesma regra de ocultar raiz-com-subs.
7. Frontend Planejamento: `BudgetPanel.tsx` — habilitar meta em subcategoria, remover de raiz-com-subs, ajustar exibição visual.
8. Validar consistência visual em `MonthCategoriesOverview.tsx` com a nova realidade (raiz-com-subs sempre "sem meta").
9. Rodar validações (lint/typecheck/build) em frontend e backend.

## Regras de negócio identificadas

- Categoria com subcategorias ativas nunca é diretamente selecionável em despesas — só as subs.
- Categoria com subcategorias ativas nunca tem meta própria — meta só em categorias-folha (sem subs) e em subcategorias.
- Categoria é obrigatória ao lançar despesa.
- Categorias desativadas nunca aparecem em seletores de lançamento nem em filtros.
- Agregação de categoria no Planejamento (`BudgetOverview`) continua somando sub no pai e apresentando ambos na mesma listagem (comportamento já existente, preservado).
- A cascata de "maiores despesas" no painel principal continua tratando categoria e subcategoria como entradas independentes, sem rollup (comportamento já existente, preservado por decisão explícita do usuário).
- Hierarquia limitada a 1 nível (já existente, mantida sem alteração).

## Regras multi-tenant e segurança

Projeto é single-tenant por usuário autenticado (`usuario_id`), sem conceito de prefeitura/multi-tenant. Todas as rotas envolvidas já passam por `authenticate`, `requireActivePlan` e `requireScreenAccess` e já filtram por `usuario_id`/`accountId`. Nenhuma mudança nesse contrato é necessária — as alterações deste plano ficam inteiramente dentro da lógica de negócio das rotas/services já autenticados, sem novos endpoints nem mudança de escopo de acesso.

## Validações necessárias

- Zod: `categoria_id` obrigatório em `ExpenseForm.tsx`, com mensagem de erro visível.
- Backend: `saveBudgetTarget` deve rejeitar meta em categoria com subcategorias ativas, com mensagem clara.
- Backend/frontend: ao desativar (`toggle-active`) a última subcategoria ativa restante de uma raiz, essa raiz volta a ficar naturalmente selecionável e elegível para meta própria — deve funcionar apenas pela query de "tem subs ativas", sem lógica extra dedicada.

## Testes necessários

### Frontend

- `CategoriasTab`: categorias iniciam colapsadas ao montar o componente.
- `CategoryFloatingSelect`: categoria-raiz com sub ativa não aparece como opção clicável; subcategorias aparecem agrupadas sob o nome do pai; categorias inativas não aparecem em nenhum caso.
- `ExpenseForm`: submissão sem categoria é bloqueada com mensagem de erro visível.
- `DespesasScreen`: filtro de categoria não lista categorias desativadas nem raízes com subcategorias ativas como opção direta.
- `BudgetPanel`: botão de meta aparece em subcategoria e em categoria-folha; não aparece em categoria-raiz com subs ativas.

### Backend

- `budgetService.saveBudgetTarget`: rejeita meta em categoria-raiz com subcategorias ativas; aceita em categoria-folha e em subcategoria.
- `getBudgetOverview`: item de categoria-raiz com subs ativas nunca retorna `targetAmount`/`mode` de meta própria, mesmo que uma linha exista em `orcamento_metas` (defensivo).

### E2E

- Fluxo completo: criar categoria com subcategoria → lançar despesa (só a subcategoria é selecionável, seleção obrigatória) → definir meta na subcategoria → conferir que o Planejamento mostra o valor agregado na raiz e a meta correta na sub.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run test
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run test
npm --prefix "sistema financas/backend" run build
```

*(ajustar prefixos/scripts conforme o `package.json` real de cada pasta, a confirmar durante a implementação)*

## Riscos e pontos de atenção

- **Regressão em despesas antigas sem `categoria_id`**: a obrigatoriedade vale para novos lançamentos/edições; despesas legadas sem categoria continuam existindo e devem seguir sendo exibidas normalmente (ex.: como "Sem categoria" onde aplicável) — este plano não altera esse tratamento.
- **Consistência de "tem subcategoria ativa"**: a mesma checagem (raiz com pelo menos 1 sub ativa) precisa ser aplicada de forma idêntica em `CategoryFloatingSelect`, `DespesasScreen` (filtro) e `budgetService` (validação de meta) — risco de divergência se a lógica for duplicada de formas ligeiramente diferentes em cada lugar; preferir uma função utilitária única reaproveitada nos três pontos quando possível.
- **UX do seletor agrupado**: ao ocultar a raiz como opção clicável, garantir que buscar pelo nome da raiz no campo de busca ainda ajude o usuário a encontrar as subs (ex.: busca por "Alimentação" deve mostrar as subs de Alimentação, não retornar vazio).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões de escopo (regra de meta em raiz-com-subs, comportamento da cascata do painel, ausência de dado legado de metas) foram resolvidas e confirmadas pelo usuário durante o planejamento.

## Critérios de aceite do plano

- Configurações: categorias iniciam colapsadas.
- Modal de despesas: só categorias ativas e "selecionáveis" (folha ou sub) aparecem, agrupadas visualmente por pai; campo obrigatório.
- Filtro de despesas: mesma regra de visibilidade do modal de despesas.
- Planejamento: meta disponível em categoria-folha e em subcategoria; categoria-raiz com subs ativas só mostra valor agregado, sem meta própria.
- Nenhuma mudança de comportamento na cascata do painel principal (`FinanceDashboard`) nem na query `porCategoria`.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma está prevista neste plano; se a implementação encontrar necessidade de uma, parar e pedir confirmação explícita antes de prosseguir.
- Seguir `CLAUDE.md` da raiz do repositório e de `sistema financas/`.
- Manter alterações pequenas e focadas por arquivo.
- Preferir centralizar a checagem "categoria tem subcategoria ativa" em uma única função reaproveitada nos três pontos que dela precisam (seletor de despesas, filtro de despesas, validação de meta), em vez de duplicar a lógica.
- Não tocar em `backend/src/routes/financial.ts` nem em `src/screens/finance/FinanceDashboard.tsx` — fora do escopo por decisão explícita do usuário.
