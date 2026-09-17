# Plano de Implementação: Corrigir acesso de membros à tela Contas→Membros

## Origem

- Arquivo de especificação: nenhum `.md` fornecido — especificação construída interativamente (teste real do usuário + investigação de código).
- Data do planejamento: `2026-09-17`
- Classificação: `fullstack` (sem impacto de banco de dados)

## Resumo

Hoje um membro (não gestor) consegue clicar na conta do gestor e abrir o modal de "Editar conta" — o `PUT` falha silenciosamente (0 linhas afetadas) mas responde 200, dando falsa impressão de sucesso. Ao mesmo tempo, `GET /api/account-members` é bloqueado totalmente por `requireGestor`, então o membro nem consegue expandir a conta para ver a si mesmo na lista — apesar de já existir infraestrutura segura para ele editar os próprios dados (`PUT /usuarios/me`, `PUT /usuarios/current/photo`). Este plano corrige os dois lados: nunca deixa um membro abrir a edição da conta do gestor, e dá a ele um caminho de fato para editar o próprio cadastro (nome, foto), com visibilidade de outros membros condicionada à permissão `accessMembers`.

## Escopo

### Dentro do escopo

- `GET /api/account-members` passa a aceitar tanto gestor quanto membro: gestor vê a lista completa; membro sem `accessMembers` recebe só a si mesmo; membro com `accessMembers` recebe a lista completa da própria conta.
- `PUT /api/contas/:id` passa a responder 404 quando a atualização não afeta nenhuma linha (hoje responde 200 mesmo sem alterar nada).
- Frontend: clique na linha da conta abre "Editar conta" apenas para gestor/admin; para membro, só expande a lista de membros.
- Frontend: dentro da lista expandida, membro comum não vê botão "Novo membro" nem ação "Desativar" em ninguém.
- Frontend: cada linha de membro passa a ser clicável — clicando em si mesmo, abre um novo diálogo "Meus dados" (nome + foto, via `updateMe`/`updateFoto`, reaproveitando `AvatarUploadDialog`).

### Fora do escopo

- Mudanças em `PermissoesTab.tsx` ou nas rotas de permissões em si.
- Mudanças no fluxo de criação/desativação de membro pelo gestor (já funciona corretamente).
- Edição de senha pelo membro através desta tela (já existe em `SecurityTab.tsx`, não duplicar aqui).
- Qualquer mudança em outras telas de configuração.

## Leitura de contexto

- `/AGENT.md` (raiz) e `sistema financas/AGENT.md` — lidos (idênticos).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivos investigados: `backend/src/routes/accountMembers.ts`, `backend/src/routes/accounts.ts`, `backend/src/middleware/auth.ts`, `backend/src/middleware/permissions.ts`, `src/screens/config/ContasTab.tsx`, `src/layout/ConfigPanel.tsx`, `src/services/usuariosService.ts`, `src/services/permissoesService.ts`, `src/screens/config/SecurityTab.tsx`, `src/components/AvatarUploadDialog.tsx`.

## Impacto por área

### Frontend

- `src/screens/config/ContasTab.tsx`: buscar `fetchMe()` (ou receber `isGestor`/`meId` via prop de `ConfigPanel`) para decidir comportamento; condicionar clique da linha da conta (expandir vs. editar); condicionar botões "Nova conta"/"Novo membro"/"Desativar"; adicionar novo diálogo "Meus dados" reaproveitando `Dialog`, `AvatarUploadDialog`, `labelStyle`/`fieldInputStyle` já importados; tornar cada linha de `MembrosDaConta` clicável.
- `src/layout/ConfigPanel.tsx`: possivelmente repassar `isGestor`/`me` como prop para `ContasTab`, evitando duplicar a query `fetchMe()` que já existe ali.
- Sem mudança em query keys além das já existentes (`queryKeys.membros`).

### Backend

- `backend/src/routes/accountMembers.ts`: `GET /` troca `requireGestor` por checagem manual — gestor sempre passa; membro passa mas a query SQL é ajustada para retornar só `usuario_id = req.user.id` quando ele não tiver `accessMembers`, ou o conjunto completo da conta quando tiver.
- `backend/src/routes/accounts.ts`: `PUT /:id` adiciona `if (!updated) { res.status(404)... return; }` após o update, tanto no branch `empresa` quanto no branch `pessoal`.

### Banco de dados

`Sem impacto esperado` — nenhuma coluna ou tabela nova.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/accountMembers.ts`
- `backend/src/routes/accounts.ts`
- `src/screens/config/ContasTab.tsx`
- `src/layout/ConfigPanel.tsx`

## Estratégia de implementação

1. Backend: corrigir `PUT /api/contas/:id` para responder 404 quando 0 linhas forem afetadas.
2. Backend: ajustar `GET /api/account-members` para aceitar membro, com visibilidade condicionada a `accessMembers`.
3. Frontend: obter `isGestor`/`meId` em `ContasTab.tsx`.
4. Frontend: condicionar clique da linha da conta (editar vs. só expandir) e visibilidade de botões de gestão conforme `isGestor`.
5. Frontend: criar diálogo "Meus dados" e ligá-lo ao clique na própria linha dentro de `MembrosDaConta`.
6. Validar manualmente com uma conta de membro de teste: não conseguir editar a conta do gestor, conseguir editar os próprios dados, ver ou não outros membros conforme `accessMembers`.

## Regras de negócio identificadas

- Gestor (`type: 'gestor'` ou `'admin'`) sempre tem acesso total à sua própria conta e a todos os membros vinculados a ela.
- Membro (`type: 'padrao'`) nunca edita a conta do gestor, mesmo que a requisição chegue ao backend — o filtro por `accounts.userId` já impede a escrita, mas a resposta precisa refletir isso corretamente (404, não 200 falso).
- Membro sempre pode editar os próprios dados de usuário (nome, foto) — nunca de outro membro, mesmo com `accessMembers`.
- Membro só enxerga outros membros da mesma conta se tiver `accessMembers` ativo; sem essa permissão, vê apenas a si mesmo na lista.

## Regras multi-tenant e segurança

- Este projeto separa dados por `usuario_id`/`conta_id` de cada gestor, não por prefeitura.
- A nova lógica em `GET /api/account-members` para membro deve nunca vazar dados de outra conta — sempre restrita a `conta_membros.usuario_id = req.user.id` (membro específico) ou à conta a que ele pertence (`resolveMemberAccountId`), nunca a um `conta_id` arbitrário vindo do client sem validação de vínculo.
- `accessMembers` deve ser lido de `memberPermissions`, nunca aceito como afirmação do client.

## Validações necessárias

- Backend: validar que o `conta_id` do membro em `GET /` é sempre o resolvido via `resolveMemberAccountId`, nunca aceito livremente do client quando o solicitante é membro.
- Backend: `PUT /api/contas/:id` deve responder 404 de forma consistente nos dois branches (empresa e pessoal).
- Frontend: `AvatarUploadDialog` já valida tipo/tamanho de imagem — reaproveitar sem duplicar validação.

## Testes necessários

### Frontend

- Membro sem `accessMembers`: expandir conta mostra só a si mesmo.
- Membro com `accessMembers`: expandir conta mostra todos, mas sem botões de gestão (criar/desativar).
- Membro clica na linha da conta → não abre editar conta, só expande.
- Membro clica em si mesmo na lista → abre "Meus dados" e consegue salvar nome/foto.

### Backend

- `GET /api/account-members` como membro sem `accessMembers` → retorna array com 1 item (ele mesmo).
- `GET /api/account-members` como membro com `accessMembers` → retorna lista completa da conta.
- `PUT /api/contas/:id` com `accountId` de outro gestor → 404, não 200.

### E2E

- Fluxo completo: gestor cria membro sem `accessMembers` → membro loga, abre Contas, edita o próprio nome/foto, não consegue ver outros membros nem editar a conta do gestor.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
```

## Riscos e pontos de atenção

- Mudança de autorização em `GET /api/account-members` (antes bloqueada totalmente para membro) precisa de atenção redobrada para não vazar dados de outra conta.
- `PUT /api/contas/:id` retornando 404 em vez de 200 pode expor, em teoria, comportamento diferente para chamadas antigas do frontend que não tratavam esse caso — mas como a única forma de chegar nesse caminho hoje era o bug que estamos corrigindo, o risco é baixo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — a investigação de componentes reaproveitáveis (`AvatarUploadDialog`) já resolveu a única dúvida levantada.

## Critérios de aceite do plano

- Membro nunca consegue editar a conta do gestor pela tela Contas.
- Membro sempre consegue editar os próprios dados (nome, foto) pela tela Contas.
- Visibilidade de outros membros na lista expandida respeita `accessMembers`.
- Gestor mantém o comportamento atual sem nenhuma regressão.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não há necessidade).
- Reaproveitar `AvatarUploadDialog`, `Dialog`, `labelStyle`/`fieldInputStyle` já importados em `ContasTab.tsx`.
- Testar manualmente com uma conta de membro real antes de considerar concluído.
