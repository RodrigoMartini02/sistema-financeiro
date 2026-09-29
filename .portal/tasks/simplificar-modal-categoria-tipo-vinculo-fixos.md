# Task: Simplificar modal de categoria — tipo e vínculo fixos na criação, sem alteração posterior; corrigir guia cortado dentro do card

## Contexto

O módulo de Categorias do `sistema financas` (`sistema financas/src/screens/config/CategoriasTab.tsx`) permite criar categorias principais e subcategorias, e vincular subcategorias a uma categoria principal. O modal de edição (`CategoriaDialog`, dentro do mesmo arquivo) hoje permite alterar, tanto na criação quanto na edição de uma categoria já existente:

- O "Tipo da categoria" (principal ↔ subcategoria), via dois botões de seleção (`tipoCategoria`, linhas 138-171).
- A categoria principal à qual uma subcategoria está vinculada, via um `<Select name="parent_id">` (linhas 173-199), inclusive ao editar uma subcategoria já existente.

O backend (`sistema financas/backend/src/routes/categories.ts`, rota `PUT /api/categories/:id`, linhas 163-233) aceita e processa essa alteração de `parent_id` na edição: monta a cláusula `SET parent_id = $6` condicionalmente (linha 216-218) e tem toda uma lógica de validação de reparenting (linhas 180-197: impedir auto-referência, impedir vincular a uma subcategoria, verificar se a nova principal existe).

Também foi identificado, durante revisão visual do sistema, que o guia de primeiro acesso do botão "+ Subcategoria" (scope `categorias:sub-v1`, renderizado dentro de `CategoriaRow`, linhas 287-311 de `CategoriasTab.tsx`) aparece cortado/por dentro do card da categoria — o mesmo tipo de bug de posicionamento (balão dentro de um container sem espaço/overflow adequado para ele) que foi corrigido em outras 11 telas do sistema em `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`, mas que não cobriu este arquivo especificamente.

## Problema

Permitir alterar o tipo (principal/subcategoria) e o vínculo de uma categoria já existente introduz complexidade desnecessária tanto na UI quanto no backend, para um cenário que não deveria ser possível pela regra de negócio real do sistema: uma categoria criada como subcategoria de uma principal deve permanecer sempre vinculada a ela; uma categoria criada como principal nunca deve virar subcategoria. Essa decisão é tomada no momento da criação e não deve ser reversível depois.

Hoje isso exige, só no frontend: estado (`tipoCategoria`, `selectedParentId`), funções de resolução de estado inicial (`resolveInitialKind`, `resolveInitialParent`), lógica de mudança de tipo (`handleKindChange`), validação de compatibilidade (`canChooseSubcategory`, `categoryHasChildren`), um guia de UX inteiro só para explicar esse vínculo (`categorias:vincular-principal-v1`, mensagem `categoriasVincularPrincipal`), e blocos de JSX condicionais correspondentes. No backend, exige lógica de validação de reparenting (impedir ciclo, impedir subcategoria-de-subcategoria) que só existe por causa dessa permissão de alteração.

Adicionalmente, o guia de "+ Subcategoria" está posicionado de forma que aparece cortado dentro do card da categoria, prejudicando a legibilidade — o mesmo padrão de bug já corrigido em outras telas do sistema.

## Objetivo

Simplificar o modal de categoria para que tipo e vínculo sejam definidos apenas no momento da criação e nunca mais alterados depois — ao editar uma categoria ou subcategoria existente, o modal mostra apenas o campo Nome (mais o botão de ativar/desativar já existente). Reduzir a lógica correspondente no frontend e no backend que existe apenas para suportar a alteração posterior, hoje permitida. Corrigir o posicionamento do guia de "+ Subcategoria" para que não fique cortado dentro do card.

## Decisão Técnica Desejada

- **Criação de categoria principal** (botão "Nova categoria"): sempre cria uma categoria do tipo principal, sem seletor de tipo. `parent_id` sempre `null`.
- **Criação de subcategoria** (botão "+ Subcategoria" dentro de uma categoria principal existente): sempre cria uma subcategoria já vinculada àquela principal (comportamento equivalente ao `initialParentId` que já existe hoje), sem seletor de tipo nem de vínculo — o vínculo é implícito pelo botão de origem.
- **Edição de categoria existente** (principal ou subcategoria): modal mostra apenas o campo Nome (e o botão de ativar/desativar, que já existe e não muda). Nenhuma referência a tipo ou vínculo aparece no modal de edição — nem editável, nem como texto informativo (decisão já confirmada com o usuário).
- Remover do frontend: seleção de "Tipo da categoria", `Select` de "Vincular a uma categoria principal" quando editando, estados e funções que só existem para suportar essa troca (`resolveInitialKind`, `handleKindChange`, `canChooseSubcategory`, etc. — avaliar quais realmente ficam órfãos durante o planejamento), e o guia `categorias:vincular-principal-v1` (`vincularGuide`) por completo, incluindo a mensagem correspondente em `firstAccessGuideMessages.ts`.
- No backend, a rota `PUT /api/categories/:id` não deve mais aceitar alteração de `parent_id` — remover a lógica condicional de `setParent`/reparenting (linhas 178, 180-197, 216-218 do arquivo atual) e ignorar/rejeitar qualquer `parent_id` enviado no corpo da requisição de edição.
- Corrigir o posicionamento do guia `categorias:sub-v1` (dentro de `CategoriaRow`, linhas 287-311) para que não fique cortado dentro do card, seguindo o mesmo padrão de correção já aplicado em outras telas (mover o wrapper `relative` do guia para fora de qualquer ancestral com corte de overflow, ou aplicar a técnica equivalente usada nas correções anteriores).

## Escopo Funcional

### Dentro do escopo

- Simplificação do `CategoriaDialog` para que tipo e vínculo só existam na criação, nunca na edição.
- Remoção da lógica de troca de tipo/vínculo no modal de edição.
- Remoção do guia `categorias:vincular-principal-v1` e da mensagem correspondente.
- Remoção da capacidade de alterar `parent_id` via `PUT /api/categories/:id` no backend, e simplificação da lógica de validação de reparenting que se torna desnecessária.
- Correção do posicionamento do guia `categorias:sub-v1` para não ficar cortado dentro do card.

### Fora do escopo inicial

- Qualquer migração de dados existentes (categorias/subcategorias já cadastradas mantêm seu `parent_id` atual; a mudança afeta apenas a possibilidade de alterá-lo dali para frente).
- Alterações em outras entidades do sistema que também usam estrutura de hierarquia (nenhuma identificada além de categorias).
- Revisão de outros guias do módulo de Categorias além do `categorias:sub-v1` mencionado (os demais — `categorias:nova-v1`, `categorias:desativar-v1` — não foram reportados com problema).
- Qualquer alteração na regra de "subcategoria de subcategoria não é permitida" (essa regra já existe e deve ser preservada na criação).

## Requisitos de Frontend

- `CategoriaDialog` (em `CategoriasTab.tsx`): remover o bloco de seleção "Tipo da categoria" e o `Select` de vínculo quando `cat` (categoria existente) estiver definido — ou seja, esses campos só aparecem no fluxo de criação (`!cat`), nunca no de edição.
- Reavaliar e remover, se ficarem órfãos: `resolveInitialKind`, `resolveInitialParent`, `handleKindChange`, `canChooseSubcategory`, `categoryHasChildren` (usado hoje para impedir trocar de sub para principal quando já tem filhos — pode deixar de ser necessário se a troca de tipo não existir mais em nenhum cenário), e o estado `tipoCategoria`/`selectedParentId` conforme aplicável.
- Remover o guia `vincularGuide` (`useFirstAccessGuide('categorias:vincular-principal-v1')`) e sua renderização.
- Corrigir a posição do `FirstAccessGuideCard` do guia `categorias:sub-v1` em `CategoriaRow` para não ficar cortado dentro do card — seguir o padrão de correção já validado em outras telas do sistema (plano `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`).
- Simplificar `handleSubmit` do `CategoriaDialog` para não depender de `isSubcategory`/`selectedParentId` na edição (o payload de edição deve enviar apenas `nome`; o de criação continua enviando `nome` e `parent_id` conforme o fluxo de origem — botão "Nova categoria" vs "+ Subcategoria").

## Requisitos de Backend

- `PUT /api/categories/:id` (em `sistema financas/backend/src/routes/categories.ts`): remover o processamento de `parent_id` no corpo da requisição — a rota passa a atualizar apenas `nome`, `cor`, `icone`. Remover a lógica condicional de `setParent` e as validações de reparenting associadas (linhas 178, 180-197, 216-218 do arquivo atual), que deixam de ser necessárias.
- `POST /api/categories` (criação): sem alteração de comportamento — continua aceitando `parent_id` normalmente, pois é onde o vínculo deve ser definido.
- Confirmar, durante a implementação, que nenhum outro consumidor do backend depende do `PUT` aceitar `parent_id` antes de remover essa capacidade.

## Requisitos de Banco de Dados

Sem alteração de banco identificada. A coluna `parent_id` na tabela `categorias` continua existindo e sendo usada normalmente na criação; apenas deixa de ser alterável via edição.

## Requisitos de Segurança e Multi-Tenant

Não aplicável — projeto solo-dev sem multi-tenancy (conforme já registrado em tasks/planos anteriores deste mesmo projeto). Sem impacto de segurança identificado; a mudança reduz a superfície de validação necessária no backend.

## Requisitos de Migração ou Compatibilidade

- Categorias e subcategorias já existentes no banco não são afetadas — mantêm seu `parent_id` atual.
- Nenhum dado precisa ser migrado; a mudança é de comportamento (o que a API/UI permite fazer dali para frente), não de schema.
- Se algum outro ponto do frontend (fora de `CategoriasTab.tsx`) hoje depender da possibilidade de reparenting via edição, isso deve ser identificado durante o planejamento antes de remover a capacidade no backend.

## Requisitos de Testes

### Frontend

- Não aplicável inicialmente (sem testes automatizados de frontend identificados no projeto para este fluxo); validar por build/typecheck.

### Backend

- Não aplicável inicialmente (sem suíte de testes automatizados identificada no backend para esta rota); validar por typecheck (`tsc --noEmit`).

### E2E

- Não aplicável.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/components/firstAccessGuideMessages.ts` (remoção da mensagem `categoriasVincularPrincipal`)

### Backend

- `sistema financas/backend/src/routes/categories.ts`

### Banco de Dados

- Sem impacto identificado.

## Critérios de Aceite

- O modal de "Nova categoria" (botão principal) não pergunta mais tipo — sempre cria categoria principal.
- O modal de "+ Subcategoria" (dentro de uma categoria existente) não pergunta mais tipo nem vínculo — sempre cria subcategoria já vinculada à categoria de origem.
- O modal de edição de uma categoria ou subcategoria existente mostra apenas o campo Nome (e o botão de ativar/desativar), sem nenhuma referência a tipo ou vínculo.
- A rota `PUT /api/categories/:id` não altera mais `parent_id`, mesmo que enviado no corpo da requisição.
- O guia `categorias:vincular-principal-v1` não existe mais em nenhum lugar do código (hook, componente, mensagem).
- O guia `categorias:sub-v1` aparece corretamente posicionado, sem ficar cortado dentro do card da categoria.
- Categorias e subcategorias já cadastradas continuam funcionando normalmente após a mudança.
- Build do frontend e typecheck do backend passam sem erros.

## Perguntas Para o Planejamento

- Existe algum outro ponto do sistema (fora de `CategoriasTab.tsx` e da rota `PUT /api/categories/:id`) que dependa da capacidade atual de reparenting de categoria? Deve ser confirmado por busca antes de remover a lógica do backend.
- `categoryHasChildren` e a mensagem "Esta categoria possui subcategorias..." (hoje usada para impedir trocar uma principal-com-filhos para subcategoria) ainda tem alguma utilidade após a simplificação, ou pode ser removida por completo?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` e `sistema financas/AGENT.md`. Nota: ambos descrevem um contexto genérico "sistema multi-prefeitura, multi-tenant + RLS" que não corresponde a este projeto pessoal solo-dev — desconsiderar as seções de isolamento entre tenants/RLS, mantendo as práticas gerais aplicáveis (validação no backend, não mascarar erros, seguir padrões existentes, simplificar quando seguro).
- Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` separados neste projeto.
- Leia também `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md` para reaproveitar exatamente a técnica de correção de posicionamento já validada nas outras 11 telas, ao corrigir o guia `categorias:sub-v1`.
- Inspecione `CategoriasTab.tsx` e `backend/src/routes/categories.ts` por completo antes de propor o plano, confirmando quais funções/estados ficam de fato órfãos após a simplificação (evitar remover algo que ainda tenha uso).
- Classifique a implementação como `frontend + backend`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não aplicável, mas mantido por padrão do projeto).
- Gere um plano em `.plans/` (padrão deste projeto, conforme `CLAUDE.md`) com etapas pequenas, revisáveis e seguras.
