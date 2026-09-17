# Plano de Implementação: Completar dados cadastrais no modal de edição de membro

## Origem

- Arquivo de especificação: pedido direto do usuário (print do modal "Editar Mirian Antonin" comparado ao modal "Editar conta")
- Data do planejamento: 2026-09-17
- Classificação: `fullstack` (sem impacto em banco de dados — os campos já existem na tabela `usuarios`)

## Resumo

O modal de edição de membro (`EditarUsuarioDialog`, dentro de `ContasTab.tsx`), introduzido na feature anterior (`feat/R/editar-membro-senha-simplificada`), só expõe nome, foto e senha. O usuário aponta que um membro é um usuário completo do sistema (lança despesa/receita) e precisa dos mesmos campos cadastrais do modal de conta (`ContaDialog`): CPF, e-mail, telefone e data de nascimento.

A tabela `usuarios` já possui todas as colunas necessárias (`document`, `email`, `telefone`, `dataNascimento`, `country`, `state`, `city`) — não há necessidade de migration. O trabalho é: (1) a rota backend `PUT /account-members/:id` aceitar esses campos com a mesma validação de unicidade já usada em `PUT /usuarios/me`; (2) a rota `GET /account-members` retornar esses campos para popular o formulário; (3) o frontend expandir o dialog e o fluxo de salvamento, inclusive quando o próprio usuário edita a si mesmo (`isSelf`), conforme decisão do usuário.

## Escopo

### Dentro do escopo

- Backend: `PUT /account-members/:id` passa a aceitar `email`, `documento`, `telefone`, `data_nascimento`, `pais`, `estado`, `cidade`, reaproveitando as validações de e-mail/CPF únicos já existentes em `PUT /usuarios/me`.
- Backend: `GET /account-members` (ambas as variantes de query, com e sem `accessMembers`) passa a retornar `telefone`, `data_nascimento`, `pais`, `estado`, `cidade` além dos campos já existentes (`email`, `documento`).
- Frontend: `MembroListItem` (membrosService.ts) ganha os novos campos.
- Frontend: `MembroUpdateBody` e `updateMembro` (membrosService.ts) ganham os novos campos.
- Frontend: `EditarUsuarioDialog` (ContasTab.tsx) ganha os campos CPF, e-mail, telefone e data de nascimento — mesmo layout/padrão visual do `ContaDialog` — para **todo mundo que abre o dialog**, seja `isSelf` (o próprio usuário, gestor ou membro) ou gestor editando outro membro.
- Frontend: fluxo de salvamento do `isSelf` (hoje chama `updateMe({ nome, nova_senha })`) passa a enviar todos os campos preenchidos no formulário.

### Fora do escopo

- Qualquer alteração em `ContaDialog` (dados da CONTA, já correto e completo).
- Qualquer alteração em schema/migration — os campos já existem.
- Alterar regras de permissão (`accessMembers`) já implementadas.
- Alterar o fluxo de criação de membro (`NovoMembroDialog`) — este plano cobre apenas edição.

## Leitura de contexto

- `/AGENT.md` (raiz) — regras gerais de git flow, multi-tenant, permissões
- `backend/AGENT.md` — não existe como arquivo dedicado; seguido apenas o `/AGENT.md` da raiz
- `frontend/AGENT.md` — não existe como arquivo dedicado; seguido apenas o `/AGENT.md` da raiz
- `backend/src/db/schema/users.ts` — confirma que `document`, `telefone`, `dataNascimento`, `country`, `state`, `city` já existem na tabela `usuarios`
- `backend/src/routes/users.ts` (`PUT /me`, linhas 52-149) — padrão de validação de e-mail/CPF único a ser reaproveitado
- `backend/src/routes/accountMembers.ts` (`GET /`, linhas 61-101; `PUT /:id`, linhas 369-418+) — rotas a expandir
- `src/services/membrosService.ts` — tipos e funções de serviço a expandir
- `src/screens/config/ContasTab.tsx` — `EditarUsuarioDialog`, `MembrosDaConta`, `ContaDialog` (referência de layout)

## Impacto por área

### Frontend

- `EditarUsuarioDialog`: adicionar campos de CPF (com máscara/formatação existente, mesma usada em `ContaDialog`), e-mail, telefone, data de nascimento — reaproveitando os mesmos componentes/estilos (`labelStyle`, `fieldInputStyle`) já usados no próprio arquivo.
- `MembrosDaConta`: a mutation `editarUsuarioMut` precisa repassar todos os novos campos tanto no branch `editandoSouEu` (chamando `updateMe` com o payload completo) quanto no branch de gestor editando outro (`updateMembro`).
- Estados de erro: reaproveitar o tratamento já existente (`mutError`), incluindo mensagens de "E-mail já em uso" / "CPF/CNPJ inválido" retornadas pelo backend.
- Loading/empty states: sem mudança — já cobertos pela estrutura existente do dialog.

### Backend

- `PUT /account-members/:id`: expandir para aceitar e validar `email`, `documento`, `telefone`, `data_nascimento`, `pais`, `estado`, `cidade`, com a mesma lógica de unicidade de `email`/`documento` já usada em `PUT /usuarios/me` (checar duplicidade excluindo o próprio usuário via `ne(users.id, memberUserId)`).
- `GET /account-members`: adicionar as colunas que faltam (`telefone`, `data_nascimento`, `pais`, `estado`, `cidade`) nas duas variantes da query SQL raw (com e sem `accessMembers`).
- Permissões: nenhuma mudança — `PUT /:id` já é `requireGestor` + valida pertencimento à conta; `GET /` já filtra por `accessMembers`/auto-visualização.

### Banco de dados

`Sem impacto esperado` — todas as colunas necessárias já existem em `usuarios` (`documento`, `email`, `telefone`, `data_nascimento`, `pais`, `estado`, `cidade`).

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/accountMembers.ts`
- `backend/src/routes/users.ts` (referência de padrão, possivelmente sem alteração se a validação for extraída ou apenas replicada)
- `src/services/membrosService.ts`
- `src/screens/config/ContasTab.tsx`

## Estratégia de implementação

1. Backend `accountMembers.ts` — `GET /`: adicionar `u.telefone, u.data_nascimento, u.pais, u.estado, u.cidade` às duas queries SQL raw.
2. Backend `accountMembers.ts` — `PUT /:id`: expandir body destructuring e `updateData` para os novos campos, replicando a validação de e-mail único e CPF único (mesmo padrão de `users.ts:85-121`), com exclusão do próprio `memberUserId` nas checagens de duplicidade.
3. Frontend `membrosService.ts`: expandir `MembroListItem` e `MembroUpdateBody`/`updateMembro` com os novos campos opcionais.
4. Frontend `ContasTab.tsx`:
   - Expandir `EditarUsuarioDialog` com os campos CPF, e-mail, telefone, data de nascimento (mesmo padrão visual de `ContaDialog`), preenchidos com `defaultValue` a partir do `membro` recebido.
   - Ajustar `handleSubmit` do dialog para montar o payload completo.
   - Ajustar `editarUsuarioMut` em `MembrosDaConta`: branch `editandoSouEu` passa a chamar `updateMe` com todos os campos (não só nome/senha); branch de gestor editando outro continua chamando `updateMembro`, agora com payload completo.
5. Rodar build (`tsc --noEmit` backend e frontend, `vite build`) para validar.
6. Produzir resumo final e perguntar sobre envio para produção.

## Regras de negócio identificadas

- E-mail e CPF/CNPJ devem ser únicos entre todos os usuários do sistema (não apenas dentro da conta) — mesma regra já aplicada em `PUT /usuarios/me`.
- Gestor pode editar dados cadastrais completos de qualquer membro da própria conta, sem exigir senha atual do membro (poder administrativo já estabelecido na feature anterior).
- Qualquer usuário (gestor ou membro) pode editar os próprios dados cadastrais completos via o mesmo dialog.

## Regras multi-tenant e segurança

- `PUT /account-members/:id` já valida que o membro pertence à conta do gestor solicitante (`resolveAccountIdForGestor` + checagem de `accountMembers`) — mantido sem alteração.
- Validação de unicidade de e-mail/CPF deve ser global (todos os usuários), não escopada à conta — mesmo comportamento de `PUT /usuarios/me`, evitando que dois usuários no sistema tenham o mesmo e-mail/documento.
- Nenhum dado sensível deve vazar em mensagens de erro (manter mensagens genéricas como "Email already in use" / "Invalid CPF/CNPJ", já no padrão atual).

## Validações necessárias

- CPF/CNPJ: formato válido (reaproveitar `validateDocument`, já usado em `users.ts`).
- E-mail: formato válido e único (exceto para o próprio registro sendo editado).
- Data de nascimento: campo de data simples, sem validação adicional além do que já existe em `ContaDialog`.
- Nome: obrigatório (já validado hoje via `body('nome').notEmpty()`).

## Testes necessários

### Frontend

- Abrir modal de edição de outro membro (gestor) e confirmar que todos os campos aparecem preenchidos com os dados atuais do membro.
- Editar CPF/e-mail/telefone/data de nascimento de outro membro e salvar — confirmar persistência.
- Abrir o próprio dialog (isSelf) e confirmar que os mesmos campos aparecem e podem ser editados.

### Backend

- `PUT /account-members/:id` com e-mail já em uso por outro usuário → 400.
- `PUT /account-members/:id` com CPF inválido → 400.
- `PUT /account-members/:id` com membro de outra conta → 404 (comportamento já existente, não deve regredir).

### E2E

- Fluxo completo: gestor abre Contas → expande conta → clica em membro → edita CPF/telefone/e-mail → salva → reabre o modal → confirma que os dados persistiram.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Risco baixo de regressão: os campos novos são opcionais no payload (`undefined` não altera o valor atual), seguindo o mesmo padrão condicional já usado para `foto` e `nova_senha`.
- Atenção ao aplicar a checagem de unicidade de e-mail/CPF corretamente excluindo o próprio `memberUserId` (não o `req.user!.id` do gestor) — erro fácil de copiar/colar do padrão de `PUT /usuarios/me`.
- Nenhum risco de vazamento multi-tenant: a validação de pertencimento à conta já existe e não é alterada.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (decisão sobre isSelf já confirmada pelo usuário: campos completos também para edição da própria conta)

## Critérios de aceite do plano

- Gestor consegue ver e editar CPF, e-mail, telefone e data de nascimento de qualquer membro da conta, com as mesmas validações de unicidade já aplicadas em `PUT /usuarios/me`.
- Qualquer usuário (gestor ou membro) consegue ver e editar os próprios dados completos pelo mesmo dialog.
- Nenhuma migration foi necessária.
- Builds (tsc backend, tsc frontend, vite build) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Reaproveitar ao máximo o padrão de validação já existente em `backend/src/routes/users.ts` (`PUT /me`) para evitar duplicar lógica de forma divergente.
- Manter alterações pequenas e focadas — não tocar em `ContaDialog`, `NovoMembroDialog` ou fluxo de criação de membro.
- Não executar migrations (não são necessárias neste plano).
