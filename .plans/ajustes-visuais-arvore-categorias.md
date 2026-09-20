# Plano de Implementação: Ajustes visuais e de interação na árvore de categorias

## Origem

- Arquivo de especificação: pedido direto do usuário (3 prints comentados), consolidado em sessão de planejamento
- Data do planejamento: 2026-09-20
- Classificação: **frontend-only**

## Resumo

Três correções de UX sobre a implementação anterior de categorias (`.plans/revisao-categorias-selecao-metas-painel.md`, já mesclada em `main`): (1) reforçar o contraste visual pai/sub no seletor de despesas; (2) transformar o filtro de despesas em árvore colapsável com seleção em cascata (marcar o pai marca todas as subs, com estado indeterminado quando a seleção é parcial); (3) aplicar o mesmo padrão de árvore colapsável já usado em `BudgetPanel.tsx` ao painel "Categorias" do Planejamento (`MonthCategoriesOverview.tsx`), mostrando cada subcategoria com seu valor próprio ao expandir o pai, com as raízes iniciando colapsadas.

## Escopo

### Dentro do escopo

1. `CategoryFloatingSelect.tsx`: reforçar o contraste visual do cabeçalho de grupo (categoria-pai) contra os itens (subcategorias) — peso maior e cor mais escura no cabeçalho, peso normal nas subs, seguindo o padrão de contraste já usado no grupo de filtro (`MultiFilterPanel`).
2. `MultiFilterPanel.tsx` + `DespesasScreen.tsx`: estender `FilterGroupOption` com hierarquia opcional; renderizar cabeçalho do pai em negrito com as subs indentadas abaixo como checkboxes próprios; implementar seleção em cascata (marcar o pai marca todas as subs; desmarcar uma sub deixa o pai em estado indeterminado).
3. `MonthCategoriesOverview.tsx`: reestruturar de lista plana para árvore colapsável (mesmo padrão de `BudgetPanel.tsx`/`BudgetTreeNode`) — categorias-raiz iniciam colapsadas, clicáveis para expandir, mostrando as subs com seu valor próprio (`projectedAmount`) abaixo da raiz; o corte "top 5 visíveis / ver mais" passa a contar só raízes; a árvore vale tanto no modo normal quanto no modo "por membro".

### Fora do escopo

- Mudanças em `BudgetPanel.tsx` — já está correto, serve de modelo de referência.
- Mudanças na tela de Configurações (`CategoriasTab.tsx`) — já colapsada, sem pedido de ajuste aqui.
- `ReceitasScreen.tsx` — usa `MultiFilterPanel`, mas sem grupo de categoria hoje; a extensão de tipo é aditiva/opcional, então essa tela deve continuar funcionando sem mudança de comportamento (a ser confirmado visualmente na implementação).
- Qualquer mudança em backend, schema ou API — nenhum dado novo é necessário.

## Leitura de contexto

- `CLAUDE.md` da raiz do repositório e de `sistema financas/` — já lidos em sessão anterior; mesmas regras se aplicam (plano → aprovação → implementação → finalização; nunca migration sem confirmação).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Arquivos revisados nesta sessão de planejamento: `src/ui/CategoryFloatingSelect.tsx`, `src/ui/MultiFilterPanel.tsx`, `src/screens/despesas/DespesasScreen.tsx`, `src/screens/receitas/ReceitasScreen.tsx` (para identificar outros consumidores de `MultiFilterPanel`), `src/screens/finance/BudgetPanel.tsx` (modelo de árvore de referência, com `BudgetTreeNode`, estado `collapsed`, `BudgetRow`), `src/screens/finance/MonthCategoriesOverview.tsx`, `src/types/budget.ts`, `src/utils/categorySuggestions.ts`.
- `.plans/revisao-categorias-selecao-metas-painel.md` — plano anterior, já implementado e mesclado em `main`, cujo resultado em produção gerou os 3 ajustes deste plano.

## Impacto por área

### Frontend

**Item 1 — `src/ui/CategoryFloatingSelect.tsx`**
- Ajustar o `<p>` de cabeçalho do grupo (`group.parent.nome`): manter uppercase, mas aumentar o peso (ex.: 700→800) e trocar a cor de `C.placeholder` (clara demais, causa do baixo contraste reportado) para um tom mais escuro/contrastante, coerente com o restante da paleta do componente.
- Ajustar os itens de subcategoria (`category.nome`) para manter peso normal (400–500) quando não selecionados, sem competir visualmente com o cabeçalho.
- Validar visualmente a legibilidade nos dois temas (claro/escuro).

**Item 2 — `src/ui/MultiFilterPanel.tsx` + `src/screens/despesas/DespesasScreen.tsx`**
- `FilterGroupOption` ganha campos opcionais para hierarquia (ex.: `parentValue?: string` nas subs, e uma opção própria representando o pai/cabeçalho selecionável). A extensão é aditiva — nenhum grupo existente que não usa esses campos muda de comportamento.
- Novo agrupamento interno no componente: opções são organizadas por `parentValue` antes de renderizar, exibindo o pai como cabeçalho com seu próprio checkbox (que representa "todas as subs") e as subs indentadas abaixo.
- Lógica de cascata: marcar/desmarcar o checkbox do pai marca/desmarca todas as subs associadas de uma vez; o estado do checkbox do pai é **computado** a partir do estado das subs (não armazenado separadamente): todas marcadas → marcado; nenhuma → desmarcado; parcial → indeterminado (setado via `ref` + `useEffect`, já que HTML checkbox não expõe uma prop declarativa para isso).
- `DespesasScreen.tsx`: ajustar a montagem de `categoriaOptions` (hoje com label composto "Pai › Sub" via `groupSelectableCategories`) para produzir a estrutura hierárquica que o `MultiFilterPanel` passa a aceitar, com o pai como opção de cabeçalho e as subs com `parentValue` apontando para ele.
- O `value` do pai é usado apenas como controle de UI para a cascata — não precisa necessariamente entrar no `Set` de selecionados consumido pelo filtro real (`filtroCategoria.has(i.categoria)`), já que uma despesa nunca é lançada diretamente numa categoria-pai que tem subs ativas (regra do plano anterior). A implementação deve decidir e documentar esse detalhe ao codar, evitando um valor "fantasma" na contagem de filtros ativos.

**Item 3 — `src/screens/finance/MonthCategoriesOverview.tsx`**
- Trocar a lista plana filtrada/ordenada (`items`) por uma árvore `{ root: BudgetOverviewItem; children: BudgetOverviewItem[] }[]`, replicando a lógica já existente em `BudgetPanel.tsx` (incluindo o tratamento de subcategoria "órfã" — pai desativado/ausente da lista visível — que vira raiz própria).
- Estado `collapsed`/`expanded` por `categoryId` de raiz, iniciando **todas colapsadas**.
- Renderização: linha da raiz sempre exibe o valor agregado (`root.projectedAmount`, já é o rollup existente) com um controle de expandir/colapsar; ao expandir, renderiza uma linha por item em `children`, cada uma com sua própria barra e valor individual (`child.projectedAmount`) e seu próprio `statusLabel`/`statusColor` (subcategoria pode ter meta própria, já suportado pelo plano anterior via `hasActiveSubcategories`/`targetAmount`).
- O corte "top 5 visíveis / ver mais" (`CATEGORIAS_VISIVEIS`) passa a contar e paginar **só as raízes** da árvore — subs não ocupam vaga nesse corte, aparecendo apenas ao expandir uma raiz específica.
- Os contadores do cabeçalho (`acimaCount`, `semMetaCount`, `noLimiteCount`, `total`) continuam somando todos os itens carregados (raiz + sub), como hoje — são resumos globais do período, não da paginação visual.
- Modo "por membro" (`segmentosPorCategoria`, chaveado por `categoryName`) recebe a mesma estrutura de árvore: cada nível (raiz ou sub) busca sua segmentação por `item.categoryName`, sem mudança na forma do `Map` — só na forma como as linhas são percorridas (agora via árvore em vez de lista plana).

### Backend

`Sem impacto esperado` — nenhum dado novo é necessário; `BudgetOverviewItem` já expõe `parentId`, `projectedAmount`, `hasActiveSubcategories` e `targetAmount`.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável a este plano — nenhuma mudança de schema prevista.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/ui/CategoryFloatingSelect.tsx`
- `src/ui/MultiFilterPanel.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/finance/MonthCategoriesOverview.tsx`

## Estratégia de implementação

1. Item 1: ajustar estilos (peso/cor) em `CategoryFloatingSelect.tsx` — cabeçalho de grupo vs. item de subcategoria.
2. Item 2a: estender o tipo `FilterGroupOption`/renderização em `MultiFilterPanel.tsx` com suporte a hierarquia, cascata de seleção e estado indeterminado.
3. Item 2b: ajustar `DespesasScreen.tsx` para montar `categoriaOptions` no novo formato hierárquico esperado pelo componente.
4. Item 3a: reestruturar `MonthCategoriesOverview.tsx` para árvore colapsável, seguindo o padrão de `BudgetPanel.tsx`, ajustando a paginação "top 5" para contar só raízes.
5. Item 3b: validar que o modo "por membro" continua funcionando corretamente dentro da árvore.
6. Rodar build/typecheck do frontend.
7. Validação manual visual: temas claro/escuro, categorias com e sem subs, com e sem metas, conta com e sem membros vinculados (para o modo por membro), e confirmar que `ReceitasScreen.tsx` não foi afetada pela mudança em `MultiFilterPanel.tsx`.

## Regras de negócio identificadas

- O cabeçalho de grupo (categoria-pai) nunca é uma opção de lançamento em si — já definido no plano anterior; aqui só muda o estilo dele.
- No filtro de despesas, marcar o pai equivale a marcar todas as subs; desmarcar uma sub individual tira o pai do estado "todas marcadas" e o deixa "indeterminado" (nem todas, nem nenhuma marcada).
- No painel de Categorias do Planejamento, toda categoria-raiz inicia colapsada; expandir mostra o valor individual de cada subcategoria, nunca a soma (a soma já está sempre visível na própria linha da raiz).
- O corte "top 5 categorias visíveis" no painel de Planejamento passa a contar e paginar só raízes.
- A árvore de categorias do painel de Planejamento vale igualmente no modo normal e no modo "por membro" (família).

## Regras multi-tenant e segurança

Sem impacto — mudanças puramente de apresentação sobre dados já filtrados por usuário/conta pelas camadas existentes (nenhuma nova consulta ou alteração de autorização).

## Validações necessárias

- Cascata do filtro: marcar o pai com N subs deve refletir corretamente no `Set` de categorias selecionadas usado pelo filtro real (`filtroCategoria.has(i.categoria)`), sem introduzir um valor de pai que nunca corresponde a uma despesa real e que poderia distorcer contagens de "filtros ativos".
- Árvore do painel de Planejamento: subcategoria "órfã" (pai desativado ou ausente da lista visível) deve continuar aparecendo como raiz própria, replicando o tratamento já existente em `BudgetPanel.tsx`.
- Estado indeterminado do checkbox do pai deve refletir corretamente transições: todas as subs marcadas → desmarcar uma → indeterminado → marcar de novo → volta a "todas marcadas".

## Testes necessários

### Frontend

- `CategoryFloatingSelect`: validação manual do contraste visual pai/sub (sem teste automatizado dedicado a estilo neste projeto até aqui).
- `MultiFilterPanel`: marcar o pai marca todas as subs; desmarcar uma sub deixa o pai indeterminado; marcar manualmente todas as subs deixa o pai marcado (não indeterminado).
- `MonthCategoriesOverview`: árvore inicia colapsada; expandir mostra subs com valor individual; "ver mais" pagina só raízes; modo por membro continua exibindo a segmentação corretamente dentro da árvore.

### Backend

`Sem impacto esperado`.

### E2E

- Fluxo manual: no filtro de despesas, marcar a categoria-pai e conferir que a lista filtrada inclui despesas de todas as subs; desmarcar uma sub e conferir que o checkbox do pai fica indeterminado e a lista atualiza corretamente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- O atributo `indeterminate` de um checkbox HTML não é uma prop declarativa do React — precisa ser setado imperativamente via `ref.current.indeterminate = true` dentro de um `useEffect`, o que adiciona uma pequena complexidade a um componente hoje simples e sem refs por item.
- A extensão de `MultiFilterPanel` é aditiva (campos opcionais), mas a implementação deve confirmar visualmente que `ReceitasScreen.tsx` (outro consumidor do componente) não foi afetada.
- O modo "por membro" de `MonthCategoriesOverview` é o ponto mais arriscado de acoplar corretamente à árvore, pois hoje mistura segmentação por pessoa com uma lista plana — testar visualmente com uma conta que tenha membros vinculados antes de considerar concluído.
- Se o "value" de controle do pai no filtro for tratado incorretamente, pode gerar um valor que nunca corresponde a uma despesa real dentro do `Set` de selecionados — não quebra o filtro (é um OR lógico, um valor a mais que nunca casa não teria efeito), mas pode distorcer contagens de "filtros ativos" exibidas na UI.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as decisões de escopo (corte "top 5" contando só raízes; árvore aplicada também no modo "por membro") foram confirmadas pelo usuário durante o planejamento.

## Critérios de aceite do plano

- Seletor de despesas (`CategoryFloatingSelect`): cabeçalho de categoria-pai visualmente destacado (negrito/cor mais forte) das subcategorias (peso normal).
- Filtro de despesas: categoria-pai aparece como cabeçalho com as subs listadas abaixo; marcar o pai marca todas as subs; desmarcar uma sub deixa o pai em estado indeterminado.
- Painel de Categorias do Planejamento: categorias-raiz iniciam colapsadas por padrão, são expansíveis, e mostram cada subcategoria com seu valor próprio ao expandir; "ver mais" pagina só raízes; a barra da raiz sempre exibe o valor agregado, colapsada ou expandida.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Reaproveitar o padrão de árvore já implementado em `BudgetPanel.tsx` (`BudgetTreeNode`, tratamento de órfã, estado de colapso) como referência direta para o item 3, em vez de reinventar a lógica de agrupamento.
- Testar manualmente `ReceitasScreen.tsx` após alterar `MultiFilterPanel.tsx`, para confirmar que a extensão de tipo não afetou o grupo "Membros" já existente ali.
- Nenhuma migration prevista neste plano.
- Seguir `CLAUDE.md` da raiz do repositório e de `sistema financas/`.
- Manter alterações pequenas e focadas por arquivo.
