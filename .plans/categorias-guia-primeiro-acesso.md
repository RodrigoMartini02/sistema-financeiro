# Plano de Implementação: Conectar Guia de Primeiro Acesso em Categorias

## Origem

- Arquivo de especificação: solicitação direta do usuário no chat (sem `.md` de feature associado)
- Data do planejamento: 2026-08-04
- Classificação: `frontend-only`

## Resumo

Os componentes `FirstAccessGuideCard`, `firstAccessGuideMessages` e o hook `useFirstAccessGuide` já existem e estão em uso em várias telas (ex: `DespesasScreen.tsx`), mas em `CategoriasTab.tsx` os imports existem sem nenhum uso real — por isso o guia de primeiro acesso nunca aparece nessa tela para criar categorias ou subcategorias.

Este plano conecta dois guias em `CategoriasTab.tsx`:

1. `categoriasNova` — perto do botão `Nova categoria` no cabeçalho.
2. `categoriasSub` — ancorado no botão `+ Subcategoria` da primeira categoria principal da lista.

Como o backend sempre pré-popula 10 categorias padrão no cadastro do usuário (`ensureDefaultCategories`), a lista de categorias nunca fica vazia. Por isso, diferente do padrão usado em `DespesasScreen` (que combina `guide.isVisible` com `allItems.length === 0`), aqui a visibilidade dos dois guias depende **somente** do estado de dismiss (`guide.isVisible`).

## Escopo

### Dentro do escopo

- Instanciar `useFirstAccessGuide('categorias:nova-v1')` e `useFirstAccessGuide('categorias:sub-v1')` em `CategoriasTab()`.
- Renderizar `FirstAccessGuideCard` com `firstAccessGuideMessages.categoriasNova` ancorado perto do botão `Nova categoria`.
- Renderizar `FirstAccessGuideCard` com `firstAccessGuideMessages.categoriasSub` ancorado no botão `+ Subcategoria` da primeira categoria principal (`tree[0]`) da lista.
- Permitir dismiss independente de cada guia, persistido via localStorage (comportamento já existente no hook).

### Fora do escopo

- Alterações em outras telas que já usam o guia corretamente.
- Alterações no hook `useFirstAccessGuide` ou no componente `FirstAccessGuideCard`.
- Alterações de backend, schema, migrations ou endpoints.
- Qualquer mudança no fluxo de criação/edição de categoria já implementado.

## Leitura de contexto

- `/AGENT.md`
- `sistema financas/AGENT.md`
- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/components/FirstAccessGuideCard.tsx`
- `sistema financas/src/components/firstAccessGuideMessages.ts`
- `sistema financas/src/hooks/useFirstAccessGuide.ts`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx` (padrão de referência já implementado)
- `sistema financas/backend/src/services/defaultCategories.ts` (confirma que a lista de categorias nunca é vazia)

## Impacto por área

### Frontend

- `CategoriasTab()`:
  - Dois novos `useFirstAccessGuide(...)`: `guideNovaCategoria` (scope `categorias:nova-v1`) e `guideSubcategoria` (scope `categorias:sub-v1`).
  - Renderizar `FirstAccessGuideCard` para `categoriasNova` perto do botão `Nova categoria` no cabeçalho, seguindo o padrão visual de `DespesasScreen` (`floating`, `placement="top"`, `className="absolute right-0 top-full z-50 mt-3 w-[...]"`, dentro de wrapper `relative`).
  - Passar dados do guia de subcategoria para `CategoriaRow`, habilitado apenas na primeira categoria raiz renderizada (`index === 0`).
- `CategoriaRow`:
  - Nova prop opcional (ex.: `subcategoryGuide?: { description: string; onDismiss: () => void }`) usada apenas quando fornecida, para ancorar o `FirstAccessGuideCard` perto do botão `+ Subcategoria` daquele card específico, sem alterar o comportamento das demais linhas.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/CategoriasTab.tsx`

## Estratégia de implementação

1. Em `CategoriasTab()`, adicionar:
   ```ts
   const guideNovaCategoria = useFirstAccessGuide('categorias:nova-v1');
   const guideSubcategoria = useFirstAccessGuide('categorias:sub-v1');
   ```
2. Envolver a área do botão `Nova categoria` num wrapper `relative` (se ainda não for) e renderizar `FirstAccessGuideCard` condicionado a `guideNovaCategoria.isVisible`, com `description={firstAccessGuideMessages.categoriasNova}`, `onDismiss={guideNovaCategoria.dismiss}`.
3. Adicionar prop opcional em `CategoriaRow` para receber os dados do guia de subcategoria (descrição + dismiss), renderizado apenas quando a prop for passada e `!isChild`.
4. Em `CategoriasTab()`, ao mapear `tree`, passar a prop de guia de subcategoria somente para o item de índice `0`:
   ```tsx
   {tree.map((c, i) => (
     <CategoriaRow
       key={c.id}
       cat={c}
       index={i}
       colorScheme="red"
       onEdit={(item) => setDialog({ open: true, item })}
       onCreateSubcategory={(item) => setDialog({ open: true, parentId: item.id })}
       subcategoryGuide={i === 0 && guideSubcategoria.isVisible
         ? { description: firstAccessGuideMessages.categoriasSub, onDismiss: guideSubcategoria.dismiss }
         : undefined}
     />
   ))}
   ```
5. Garantir que o wrapper do card da primeira categoria principal seja `relative` para o `FirstAccessGuideCard` (`floating`, `absolute`) se posicionar corretamente sem deslocar o layout das demais linhas.
6. Rodar `npm --prefix "sistema financas" run build` para validar.
7. Testar manualmente os fluxos descritos no Test Plan abaixo.

## Regras de negócio identificadas

- Guia `categoriasNova` visível enquanto não dispensado, independente da quantidade de categorias existentes (lista nunca é vazia por padrão).
- Guia `categoriasSub` ancorado apenas na primeira categoria principal da lista atual (`tree[0]`), visível enquanto não dispensado.
- Cada guia é independente: dispensar um não afeta o outro (chaves de localStorage distintas).
- Se a primeira categoria principal mudar (ex.: reordenação, exclusão da atual primeira), o guia de subcategoria passa a seguir a nova `tree[0]` dinamicamente.

## Regras multi-tenant e segurança

Não aplicável — sistema pessoal (`sistema financas`) sem arquitetura multi-tenant. Sem impacto de segurança; mudança é puramente visual/UX no frontend, sem novos endpoints ou dados expostos. O dismiss é armazenado em `localStorage`, escopado por perfil ativo (comportamento já existente no hook, não alterado por este plano).

## Validações necessárias

- Nenhuma validação de formulário nova.
- Garantir que o dismiss de cada guia persiste corretamente por escopo de perfil ativo (já garantido pelo hook `useFirstAccessGuide` existente, sem alteração).

## Testes necessários

### Frontend

- Acessar Configurações > Categorias pela primeira vez (sem dismiss registrado) → os dois guias aparecem.
- Clicar no X do guia `categoriasNova` → ele some e não reaparece ao recarregar a página; o guia `categoriasSub` continua visível (se ainda não dispensado).
- Clicar no X do guia `categoriasSub` → ele some e não reaparece; `categoriasNova` (se ainda não dispensado) continua visível.
- Confirmar que o guia de subcategoria aparece apenas perto do botão `+ Subcategoria` da primeira categoria principal, não nas demais.
- Trocar de perfil ativo (pessoal/empresa) → o dismiss é por escopo de perfil, então o guia pode reaparecer em outro perfil que nunca o dispensou.
- Confirmar que nenhum guia quebra o layout dos cards de categoria (sobreposição, deslocamento).

### Backend

Sem impacto esperado.

### E2E

Não aplicável — sem suíte E2E identificada para esta tela.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Baixo risco: mudança isolada, reaproveitando componentes/hooks já testados em outras telas (`DespesasScreen.tsx`).
- Atenção ao posicionamento `absolute` do guia de subcategoria dentro do card da primeira categoria — o wrapper precisa ser `relative` para não deslocar o layout dos demais cards.
- Atenção para não quebrar a renderização quando `tree.length === 0` momentaneamente (ex.: durante loading) — a prop de guia de subcategoria só deve ser passada quando `tree[0]` de fato existir.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Guia `categoriasNova` aparece perto do botão `Nova categoria` no primeiro acesso (não dispensado), sem depender de lista vazia.
- Guia `categoriasSub` aparece ancorado no botão `+ Subcategoria` da primeira categoria principal da lista, no primeiro acesso.
- Cada guia pode ser dispensado individualmente e a preferência persiste.
- Build do frontend (`npm --prefix "sistema financas" run build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Alterar apenas `sistema financas/src/screens/config/CategoriasTab.tsx`.
- Não alterar `useFirstAccessGuide.ts`, `FirstAccessGuideCard.tsx` ou `firstAccessGuideMessages.ts` — apenas consumir o que já existe.
- Não criar novas mensagens no catálogo — `categoriasNova` e `categoriasSub` já existem.
- Seguir o padrão de posicionamento/estilo já usado em `DespesasScreen.tsx` para consistência visual entre telas.
- Não alterar backend, schema, migrations ou `.env`.
- Manter alterações pequenas e focadas nos dois pontos descritos.
- Rodar o build do frontend ao final e reportar o resultado.
