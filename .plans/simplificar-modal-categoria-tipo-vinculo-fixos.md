# Plano de Implementação: Simplificar Modal de Categoria — Tipo e Vínculo Fixos na Criação

## Origem

- Arquivo de especificação: `.portal/tasks/simplificar-modal-categoria-tipo-vinculo-fixos.md`
- Data do planejamento: `2026-08-05`
- Classificação: `frontend + backend`

## Resumo

Simplifica o modal de categoria/subcategoria do `sistema financas`: o campo "Tipo da categoria" e o `Select` de vínculo a uma categoria principal deixam de existir em qualquer fluxo (criação ou edição). "Nova categoria" sempre cria uma categoria principal; "+ Subcategoria" sempre cria já vinculada à categoria de origem, sem seleção; editar uma categoria/subcategoria existente mostra apenas o campo Nome. A mudança remove lógica correspondente tanto no frontend quanto no backend (que hoje permite alterar `parent_id` via `PUT`), e corrige o guia de primeiro acesso `categorias:sub-v1`, que aparece cortado dentro do card da categoria.

## Escopo

### Dentro do escopo

- Remover o seletor de "Tipo da categoria" do `CategoriaDialog`, em qualquer fluxo (criação ou edição).
- Remover o `Select` de "Vincular a uma categoria principal" do `CategoriaDialog`.
- Simplificar `handleSubmit` do `CategoriaDialog`: edição envia apenas `{ nome }`; criação envia `{ nome, parent_id }`, onde `parent_id` vem exclusivamente de `initialParentId` (fixado pelo botão de origem — "Nova categoria" não passa `initialParentId`, logo sempre cria principal; "+ Subcategoria" sempre passa).
- Remover funções/estados que ficam órfãos: `resolveInitialKind`, `resolveInitialParent`, `handleKindChange`, `canChooseSubcategory`, `categoryHasChildren`, `forcedPrincipalMessage`, estados `tipoCategoria`/`selectedParentId`.
- Remover o guia `categorias:vincular-principal-v1` (`vincularGuide`) e a mensagem `categoriasVincularPrincipal` em `firstAccessGuideMessages.ts`.
- Remover, na rota `PUT /api/categories/:id`, o processamento e a validação de `parent_id` — a rota passa a atualizar apenas `nome`, `cor`, `icone`.
- Corrigir o posicionamento do guia `categorias:sub-v1` (dentro de `CategoriaRow`) para que não fique cortado dentro do card, reaproveitando a técnica já validada em `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`.

### Fora do escopo

- Migração de dados existentes — categorias/subcategorias já cadastradas mantêm seu `parent_id` atual, sem qualquer alteração de schema ou dado.
- Alteração da rota `POST /api/categories` (criação) — continua aceitando `parent_id` normalmente, é o único ponto onde o vínculo é definido.
- Revisão de outros guias do módulo de Categorias (`categorias:nova-v1`, `categorias:desativar-v1`) — não reportados com problema.
- Qualquer mudança na regra "subcategoria de subcategoria não é permitida" — permanece como está na criação.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — ambos descrevem contexto genérico "multi-prefeitura, multi-tenant + RLS" que não se aplica a este projeto pessoal solo-dev; seções de tenant/RLS desconsideradas, mantidas as práticas gerais (validação no backend, não mascarar erros, simplificar quando seguro).
- `.portal/tasks/simplificar-modal-categoria-tipo-vinculo-fixos.md` (especificação de entrada).
- `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md` (técnica de correção de posicionamento de guias já validada, a reaproveitar).
- `sistema financas/src/screens/config/CategoriasTab.tsx` (leitura completa).
- `sistema financas/backend/src/routes/categories.ts` (leitura completa das rotas `POST`/`PUT`).
- `sistema financas/src/services/configService.ts` (`saveCategoria`, único ponto de chamada de `PUT /categorias/:id` no frontend).
- `sistema financas/src/screens/finance/ExpenseDialog.tsx` (único outro consumidor de `saveCategoria`, usado apenas para criação sem `parent_id` — confirmado que não depende de reparenting via edição).
- `sistema financas/src/components/firstAccessGuideMessages.ts` (mensagem `categoriasVincularPrincipal` a remover).

## Impacto por área

### Frontend

- `CategoriaDialog` (dentro de `CategoriasTab.tsx`):
  - Remover o bloco JSX de "Tipo da categoria" (botões "Categoria principal"/"Subcategoria") por completo, em qualquer fluxo.
  - Remover o bloco JSX do `Select` de "Vincular a uma categoria principal" por completo.
  - Remover estados `tipoCategoria`, `selectedParentId`.
  - Remover funções `resolveInitialKind`, `resolveInitialParent`, `handleKindChange`.
  - Remover variáveis derivadas `categoryHasChildren`, `canChooseSubcategory`, `forcedPrincipalMessage`, `isSubcategory` (ou substituir por lógica direta baseada em `cat?.parent_id`/`initialParentId`, apenas para exibir o título correto do modal — "Editar categoria"/"Nova subcategoria"/"Nova categoria" — sem envolver escolha do usuário).
  - Simplificar `handleSubmit`: ao editar (`cat` definido), enviar `{ nome }`; ao criar, enviar `{ nome, parent_id: initialParentId ?? null }`.
  - Remover `vincularGuide` (`useFirstAccessGuide('categorias:vincular-principal-v1')`) e sua renderização (`FirstAccessGuideCard` correspondente).
- `firstAccessGuideMessages.ts`: remover a chave `categoriasVincularPrincipal`.
- `CategoriaRow` (dentro de `CategoriasTab.tsx`): corrigir o posicionamento do `FirstAccessGuideCard` do guia `categorias:sub-v1` (linhas 287-311 do arquivo atual), hoje dentro de um wrapper que fica visualmente cortado dentro do card — mover o wrapper `relative` do guia para fora do elemento problemático, seguindo o mesmo padrão já aplicado com sucesso em outras 11 telas (`DespesasScreen.tsx`, `ReceitasScreen.tsx`, `MesesScreen.tsx`, etc.) no plano anterior.
- `queryKeys`/React Query: sem mudança — `saveCategoria` já é usado via `useMutation` existente, só muda o payload enviado.

### Backend

- `POST /api/categories`: `Sem impacto esperado` — continua aceitando `parent_id` normalmente.
- `PUT /api/categories/:id` (`sistema financas/backend/src/routes/categories.ts`, linhas 163-233 do arquivo atual):
  - Remover a leitura de `parent_id` do corpo da requisição.
  - Remover o bloco de validação de reparenting (auto-referência, categoria pai inexistente, subcategoria-de-subcategoria — linhas 178, 180-197).
  - Remover a montagem condicional de `setParent`/`parent_id = $6` na query `UPDATE` (linhas 216-218) — a query passa a sempre atualizar apenas `nome`, `cor`, `icone`.
  - Qualquer `parent_id` eventualmente enviado no corpo da requisição de edição é simplesmente ignorado (não processado), sem necessidade de erro explícito — mantém compatibilidade caso algum client antigo ainda envie o campo.

### Banco de dados

`Sem impacto esperado` — a coluna `parent_id` na tabela `categorias` continua existindo e sendo usada normalmente na criação (`POST`); apenas deixa de ser alterável via `PUT`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável a este plano — nenhuma migration identificada.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/components/firstAccessGuideMessages.ts`
- `sistema financas/backend/src/routes/categories.ts`

## Estratégia de implementação

1. Backend: em `categories.ts`, simplificar a rota `PUT /:id`, removendo processamento e validação de `parent_id`.
2. Frontend: em `CategoriasTab.tsx`, remover o bloco de seleção de "Tipo da categoria" e o `Select` de vínculo do `CategoriaDialog`, em ambos os fluxos (criação e edição).
3. Remover funções/estados órfãos resultantes (`resolveInitialKind`, `resolveInitialParent`, `handleKindChange`, `canChooseSubcategory`, `categoryHasChildren`, `forcedPrincipalMessage`, `tipoCategoria`, `selectedParentId`).
4. Simplificar `handleSubmit` para o novo payload (edição só `nome`; criação `nome` + `parent_id` fixo de `initialParentId`).
5. Remover `vincularGuide` e a mensagem `categoriasVincularPrincipal` em `firstAccessGuideMessages.ts`.
6. Corrigir o posicionamento do guia `categorias:sub-v1` em `CategoriaRow`.
7. Rodar `npx vite build` (frontend) e `tsc --noEmit` (backend) para validar.

## Regras de negócio identificadas

- Tipo (principal/subcategoria) e vínculo são decididos exclusivamente no momento da criação, nunca alterados depois.
- "Nova categoria" (botão principal da tela) sempre cria uma categoria principal.
- "+ Subcategoria" (botão dentro de cada categoria principal) sempre cria uma subcategoria já vinculada àquela principal.
- O modal de edição de categoria/subcategoria existente permite alterar apenas o nome (e ativar/desativar, que já existia e não muda).

## Regras multi-tenant e segurança

Não aplicável — projeto solo-dev sem multi-tenancy. Sem dados sensíveis novos envolvidos. A mudança reduz a superfície de validação necessária no backend (menos casos de reparenting para validar).

## Validações necessárias

- Backend: `PUT /:id` continua validando `nome` obrigatório e duplicidade de nome (já existente); deixa de validar `parent_id`, já que não é mais processado.
- Frontend: `handleSubmit` não precisa mais validar `selectedParentId` (a validação "Selecione uma categoria principal" deixa de existir, pois não há mais escolha do usuário nesse campo).

## Testes necessários

### Frontend

- Não aplicável nesta implementação (sem testes automatizados de frontend identificados no projeto para este fluxo); validar por build.

### Backend

- Não aplicável nesta implementação (sem suíte de testes automatizados identificada para esta rota); validar por typecheck (`tsc --noEmit`).

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build

cd "sistema financas/backend" && npm run build
```

## Riscos e pontos de atenção

- Confirmado por busca que nenhum outro consumidor do frontend depende do `PUT /api/categories/:id` aceitar `parent_id` (`ExpenseDialog.tsx` só usa `saveCategoria` sem `id`, ou seja, sempre `POST`) — remoção no backend é segura.
- Confirmado por busca que `categoryHasChildren`, `canChooseSubcategory` e `forcedPrincipalMessage` são usados exclusivamente dentro do bloco de seleção de tipo que será removido — sem uso órfão em outras partes do componente.
- Categorias/subcategorias já cadastradas no banco não são afetadas pela mudança (dado existente permanece íntegro).

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (Ambas as pendências da task original foram resolvidas por investigação direta no código durante o planejamento: não há consumidor externo dependente do reparenting via PUT, e as variáveis/funções relacionadas ao seletor de tipo não têm uso fora do bloco a ser removido.)

## Critérios de aceite do plano

- O botão "Nova categoria" cria uma categoria principal diretamente, sem qualquer pergunta de tipo ou vínculo.
- O botão "+ Subcategoria" cria uma subcategoria já vinculada à categoria de origem, sem qualquer pergunta de tipo ou vínculo.
- O modal de edição de uma categoria ou subcategoria existente mostra apenas o campo Nome (e o botão de ativar/desativar).
- A rota `PUT /api/categories/:id` não altera mais `parent_id`, mesmo que enviado no corpo da requisição.
- O guia `categorias:vincular-principal-v1` não existe mais em nenhum lugar do código (hook, componente, mensagem).
- O guia `categorias:sub-v1` aparece corretamente posicionado, sem ficar cortado dentro do card da categoria.
- Categorias e subcategorias já cadastradas continuam funcionando normalmente após a mudança.
- Build do frontend e typecheck do backend passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Reaproveitar exatamente a técnica de correção de posicionamento já validada em `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md` ao corrigir o guia `categorias:sub-v1`.
- Remover apenas o que foi confirmado como órfão pela investigação deste planejamento — não remover nada além do escopo listado.
- Não executar migrations (não aplicável, mas mantido por padrão do projeto).
- Não realizar testes manuais em tela; validar apenas via build/typecheck.
