# Plano de Implementação: Ajustes no Modal de Subcategoria Direta e Card Visual

## Origem

- Arquivo de especificação: solicitação direta do usuário no chat (sem `.md` de feature associado; segue a partir do plano anterior "Melhorar Criação e Vínculo de Categorias", já parcialmente implementado em `CategoriasTab.tsx`)
- Data do planejamento: 2026-08-04
- Classificação: `frontend-only`

## Resumo

O componente `CategoriaDialog` em `sistema financas/src/screens/config/CategoriasTab.tsx` já implementa o seletor "Categoria principal / Subcategoria", o bloqueio de reclassificação quando há filhos, e o botão `+ Subcategoria` em cada categoria principal. Faltam dois ajustes de UX:

1. Quando o modal é aberto via `+ Subcategoria` (criação direta vinda de uma categoria principal específica), remover o seletor "Tipo da categoria" e o campo "Vincular a uma categoria principal" — o contexto já é fixo (subcategoria daquela categoria), então essas escolhas são redundantes e confusas.
2. Afinar visualmente o card de subcategoria na lista (metade da largura) para reforçar que é uma subcategoria.

Ao editar uma subcategoria já existente (clique na lista), o modal mantém o seletor completo de Tipo + campo de vínculo, permitindo trocar o pai ou promover a categoria principal.

## Escopo

### Dentro do escopo

- Ocultar o bloco "Tipo da categoria" e o campo "Vincular a uma categoria principal" no modal, apenas quando for criação nova disparada pelo botão `+ Subcategoria` (`!cat && initialParentId` definido).
- Garantir que o `parent_id` correto ainda é enviado ao salvar nesse fluxo enxuto, sem exigir interação do usuário.
- Reduzir a largura do card de subcategoria (`CategoriaRow` com `isChild`) na lista, aproximadamente pela metade.

### Fora do escopo

- Alterações no modal de edição de categoria/subcategoria existente (mantém seletor completo).
- Alterações de backend, schema, migrations ou endpoints.
- Botão "Excluir" continua fora da interface.
- Comportamento de "Desativar"/"Ativar" inalterado.

## Leitura de contexto

- `/AGENT.md`
- `sistema financas/AGENT.md`
- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/types/config.ts`
- `sistema financas/src/services/configService.ts`

## Impacto por área

### Frontend

- `CategoriaDialog` (dentro de `CategoriasTab.tsx`):
  - Nova variável derivada `isDirectSubcategoryCreation` = `!cat && !!initialParentId`.
  - Quando verdadeira: ocultar o `Field label="Tipo da categoria"` (bloco com os dois botões) e o `Field label="Vincular a uma categoria principal"` (o `Select`).
  - `tipoCategoria` e `selectedParentId` continuam sendo resolvidos como hoje via `resolveInitialKind()`/`resolveInitialParent()`, garantindo que o submit envie `parent_id: initialParentId` mesmo sem os campos visíveis.
  - Título do modal já trata esse caso ("Nova subcategoria"), sem mudança.
- `CategoriaRow`:
  - Ajustar o wrapper do card quando `isChild` for verdadeiro para reduzir a largura pela metade (ex.: `max-w-[50%]`), mantendo o recuo (`ml-6`) já existente.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/CategoriasTab.tsx`

## Estratégia de implementação

1. Em `CategoriaDialog`, adicionar `const isDirectSubcategoryCreation = !cat && !!initialParentId;` logo após as declarações de `categoryHasChildren`/`parentOptions`.
2. Envolver o `Field label="Tipo da categoria"` com a condição `{!isDirectSubcategoryCreation && (...)}`.
3. Ajustar a condição de exibição do `Field label="Vincular a uma categoria principal"` de `{isSubcategory && (...)}` para `{isSubcategory && !isDirectSubcategoryCreation && (...)}`.
4. Confirmar que `handleSubmit` continua funcionando sem o campo visível: `selectedParentId` já é inicializado por `resolveInitialParent()` a partir de `initialParentId`, então o valor é enviado mesmo com o campo oculto.
5. Em `CategoriaRow`, localizar a `div` wrapper (`className={['relative', isChild ? 'ml-6' : '', ...]}`) e adicionar classe de largura reduzida condicionada a `isChild` (ex.: `isChild ? 'ml-6 max-w-[50%]' : ''`).
6. Rodar `npm --prefix "sistema financas" run build` para validar.
7. Testar manualmente os fluxos descritos no Test Plan abaixo.

## Regras de negócio identificadas

- Criação de subcategoria via `+ Subcategoria` no card de uma categoria principal: sem seletor de tipo, sem campo de vínculo visível; `parent_id` fixo e implícito.
- Edição de categoria/subcategoria existente: mantém seletor completo de Tipo + Vincular a uma categoria principal (decisão confirmada com o usuário).
- Categoria principal com subcategorias continua bloqueada para virar subcategoria (regra já implementada, sem mudança).

## Regras multi-tenant e segurança

Não aplicável — este é um sistema pessoal (`sistema financas`) sem arquitetura multi-tenant. Sem impacto de segurança; mudança é puramente visual/UX no frontend, sem novos endpoints ou dados expostos.

## Validações necessárias

- Garantir que, no fluxo enxuto (`isDirectSubcategoryCreation`), o `parent_id` submetido corresponde exatamente à categoria principal de onde o botão `+ Subcategoria` foi acionado.
- Nenhuma validação de backend nova é necessária; validações existentes em `backend/src/routes/categories.ts` continuam cobrindo os casos (impedir subcategoria-de-subcategoria, validar pai por usuário).

## Testes necessários

### Frontend

- Clicar em `+ Subcategoria` numa categoria principal → modal mostra apenas o campo "Nome da categoria", sem seletor de Tipo nem Select de vínculo.
- Salvar essa subcategoria → confirmar que é criada com o `parent_id` correto (aparece aninhada sob a categoria principal certa).
- Clicar em `Nova categoria` (botão do cabeçalho) → modal continua completo, com seletor de Tipo, padrão "Categoria principal".
- Editar uma subcategoria já existente → modal mostra seletor completo de Tipo + Vincular a uma categoria principal.
- Editar uma categoria principal com subcategorias → seletor de Tipo continua bloqueado em "Categoria principal" com a mensagem explicativa.
- Verificar visualmente que os cards de subcategoria na lista ficam com largura reduzida (metade) em relação aos cards de categoria principal.
- Confirmar que `Excluir` não aparece em nenhum modal.
- Confirmar que `Desativar` (vermelho) e `Ativar` (discreto) continuam funcionando normalmente.

### Backend

Sem impacto esperado.

### E2E

Não aplicável — sem suíte E2E identificada para esta tela.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Baixo risco: mudança isolada em um único arquivo/componente, sem alteração de contrato com o backend.
- Atenção ao CSS de largura reduzida: garantir que `max-w-[50%]` (ou equivalente) não quebre o layout responsivo já usado dentro do card (`lg:grid lg:grid-cols-[2fr_1fr]`) nem cause overflow/corte de texto em nomes longos.
- Atenção para não remover acidentalmente o comportamento de submit do `parent_id` ao ocultar os campos — o valor deve continuar sendo enviado de forma implícita.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Modal de criação via `+ Subcategoria` mostra apenas o campo "Nome da categoria".
- `parent_id` correto é enviado mesmo sem os campos de Tipo/Vínculo visíveis.
- Modal de edição de subcategoria (e de categoria principal) mantém o seletor completo de Tipo + vínculo, sem alteração de comportamento.
- Cards de subcategoria na lista ficam visualmente mais estreitos (aproximadamente metade da largura).
- Botão `Excluir` continua fora da interface; `Desativar`/`Ativar` inalterados.
- Build do frontend (`npm --prefix "sistema financas" run build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Alterar apenas `sistema financas/src/screens/config/CategoriasTab.tsx`.
- Não criar componentes ou abstrações novas — os ajustes são condicionais dentro do `CategoriaDialog` e do `CategoriaRow` já existentes.
- Não alterar backend, schema, migrations ou `.env`.
- Seguir `/AGENT.md` e `sistema financas/AGENT.md` (nenhuma regra de multi-tenant/PDF se aplica aqui, mas mantenha o padrão de código explícito e legível já usado no arquivo).
- Manter alterações pequenas e focadas nos dois pontos descritos.
- Rodar o build do frontend ao final e reportar o resultado.
