# Plano de Implementação: Edição de membros pelo gestor e senha simplificada

## Origem

- Arquivo de especificação: nenhum `.md` fornecido — especificação construída interativamente (pedido do usuário + investigação de código + decisões coletadas).
- Data do planejamento: `2026-09-17`
- Classificação: `fullstack`

## Resumo

Corrige o bug de clique não abrir nada ao selecionar outro membro na tela Contas, e reestrutura toda a troca de senha do sistema: remove a aba "Segurança" e seu atalho no header, elimina a exigência de "senha atual" em todos os fluxos, e adiciona a capacidade do gestor editar (nome, foto, senha) qualquer membro/colaborador da própria conta diretamente pelo modal que abre ao clicar nele.

## Escopo

### Dentro do escopo

- Nova rota backend `PUT /account-members/:id` (gestor edita nome/foto/senha de um membro da própria conta, sem exigir senha atual do membro).
- `PUT /usuarios/me` deixa de exigir `senha_atual` — campo único `nova_senha`, se enviado, troca a senha.
- `MembrosDaConta` (`ContasTab.tsx`): toda linha de membro passa a ser clicável para o gestor (não só a própria); ao clicar em outro membro, abre um dialog de edição completo (nome, foto, senha) daquele membro.
- Generalizar `MeusDadosDialog` em um único componente reutilizável que serve tanto para "editar a mim mesmo" quanto para "gestor editando outro membro", com um campo de senha (único, opcional) em ambos os casos.
- Adicionar campo de senha (único) também no `ContaDialog` (o gestor editando a própria conta).
- Remover a aba "Segurança" (`SecurityTab.tsx` deixa de ser referenciada como tela) e o atalho "Segurança" no dropdown do header (`AccountMenu.tsx`).
- Limpar `ConfigItemId`/`ITEMS`/`CONFIG_ITEM_IDS` (`ConfigPanel.tsx`, `AppShell.tsx`) removendo `'seguranca'`.
- Simplificar `ChangePasswordModal.tsx` (assistente financeiro) para campo único de senha, sem exigir senha atual.

### Fora do escopo

- Qualquer mudança nas permissões (`PermissoesTab.tsx`) ou no fluxo de criação de membro novo (`NovoMembroDialog`, que já define senha na criação).
- Qualquer mudança de schema/banco de dados.
- Deletar fisicamente `SecurityTab.tsx` do repositório (só deixa de ser referenciado); decisão de removê-lo do disco fica para uma limpeza futura, não faz parte deste plano.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — lidos (idênticos).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivos investigados: `src/screens/config/ContasTab.tsx`, `src/screens/config/SecurityTab.tsx`, `src/layout/ConfigPanel.tsx`, `src/layout/AccountMenu.tsx`, `src/layout/AppShell.tsx`, `src/components/financial-assistant/ChangePasswordModal.tsx`, `backend/src/routes/users.ts`, `backend/src/routes/accountMembers.ts`, `src/services/usuariosService.ts`, `src/services/membrosService.ts`.

## Impacto por área

### Frontend

- `ContasTab.tsx`:
  - Generalizar `MeusDadosDialog` → recebe `membro`, `isSelf: boolean`; título "Meus dados" quando `isSelf`, "Editar {termo.singular}" quando não; campo de senha único e opcional em ambos os casos; `onSave` recebe `{ nome, novaSenha? }`.
  - `MembrosDaConta`: `clicavel = isGestor || souEu` (gestor sempre pode clicar; membro só clica em si mesmo). Estado de dialog aberto passa a guardar qual membro está sendo editado (`editandoMembro: MembroListItem | null`), não só um boolean.
  - Nova mutation para o gestor: `mutationFn: (input) => updateMembro(membro.usuario_id, input, conta.id)`, chamando a rota nova.
  - `ContaDialog`: adicionar campo de senha único e opcional, ligado a `updateMe` via um novo parâmetro.
- `ConfigPanel.tsx`: remover import de `SecurityTab`, remover `'seguranca'` de `ConfigItemId` e `ITEMS`, remover bloco de renderização condicional.
- `AccountMenu.tsx`: remover `handleOpenSecurity`, a entrada em `menuItems`, e o botão "Segurança" do JSX; reajustar índices de `itemRefs` (voltam ao padrão anterior: `data.length` para Configurações).
- `AppShell.tsx`: remover `'seguranca'` de `CONFIG_ITEM_IDS`.
- `ChangePasswordModal.tsx`: remover campos "senha atual"/"confirmar", manter um único campo de nova senha; `updateMut.mutateAsync({ ...user, nova_senha: senhaNova })` sem `senha_atual`.
- `src/services/usuariosService.ts`: `UsuarioMePutBody` — `senha_atual` deixa de ser necessário; manter campo opcional por compatibilidade de tipo, mas não obrigatório no fluxo.
- `src/services/membrosService.ts`: nova função `updateMembro(usuarioId, body: { nome?, foto?, novaSenha? }, contaId?)`.

### Backend

- `backend/src/routes/accountMembers.ts`: nova rota `PUT /:id`, protegida por `requireGestor`, reaproveitando `resolveAccountIdForGestor` + checagem de `accountMembers` pertencente à conta (mesmo padrão de `/:id/deactivate`). Atualiza `users.name`, `users.photo` (se enviados) e `users.password` (hash de `nova_senha`, se enviada) — sem exigir senha atual, pois é o gestor agindo administrativamente.
- `backend/src/routes/users.ts`: `PUT /me` — remover a exigência de `senha_atual` quando `nova_senha` for enviada; trocar direto.
- Rota de foto do membro: verificar se `PUT /usuarios/current/photo` já cobre a própria foto (sim, `updateFoto`); para o gestor definir foto de outro, incluir `foto` no payload da nova rota `PUT /account-members/:id`.

### Banco de dados

`Sem impacto esperado` — nenhuma coluna ou tabela nova.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/accountMembers.ts`
- `backend/src/routes/users.ts`
- `src/screens/config/ContasTab.tsx`
- `src/layout/ConfigPanel.tsx`
- `src/layout/AccountMenu.tsx`
- `src/layout/AppShell.tsx`
- `src/components/financial-assistant/ChangePasswordModal.tsx`
- `src/services/usuariosService.ts`
- `src/services/membrosService.ts`

## Estratégia de implementação

1. Backend: remover exigência de `senha_atual` em `PUT /usuarios/me`.
2. Backend: criar `PUT /account-members/:id` (gestor edita nome/foto/senha de um membro).
3. Frontend: `usuariosService.ts`/`membrosService.ts` — ajustar tipos e criar `updateMembro`.
4. Frontend: generalizar `MeusDadosDialog` em `ContasTab.tsx` para servir a ambos os casos (self/gestor), com campo de senha único.
5. Frontend: `MembrosDaConta` — permitir clique do gestor em qualquer membro, abrindo o dialog generalizado no modo correto.
6. Frontend: `ContaDialog` — adicionar campo de senha único para o gestor trocar a própria senha.
7. Frontend: remover aba "Segurança" (`ConfigPanel.tsx`, `AppShell.tsx`) e atalho no dropdown (`AccountMenu.tsx`).
8. Frontend: simplificar `ChangePasswordModal.tsx` para campo único.
9. Rodar `tsc --noEmit` (frontend e backend) e `npx vite build`.
10. Validar manualmente: gestor clica em membro, edita nome/foto/senha; membro loga com a senha nova; gestor troca a própria senha pelo `ContaDialog`; dropdown do header não mostra mais "Segurança".

## Regras de negócio identificadas

- Gestor pode editar/resetar a senha de qualquer membro da própria conta sem precisar da senha atual do membro (poder administrativo).
- Qualquer pessoa trocando a própria senha não precisa mais confirmar a senha atual — simplificação de UX assumida pelo usuário.
- Campo de senha vazio nunca altera a senha existente, em nenhum fluxo.
- Membro comum só pode clicar/editar a própria linha; nunca a de outro membro, mesmo com `accessMembers`.

## Regras multi-tenant e segurança

- A nova rota `PUT /account-members/:id` deve validar que o membro pertence à conta do gestor autenticado (via `resolveAccountIdForGestor` + `accountMembers`), nunca confiando no `id` da URL isoladamente.
- Remover a exigência de senha atual reduz uma camada de fricção de segurança; isso é uma decisão explícita do usuário, documentada aqui para rastreabilidade — se o usuário reconsiderar no futuro, esse é o ponto de reversão.
- Nenhuma mudança amplia acesso entre contas diferentes — a nova rota é sempre escopada à conta do gestor.

## Validações necessárias

- Backend: `nova_senha`, quando enviada, deve ter no mínimo o tamanho mínimo já usado hoje (8 caracteres em `users.ts`, 6 em `accountMembers.ts` na criação — decidir qual usar; recomenda-se manter 8 por consistência com a troca de senha existente).
- Frontend: campo de senha vazio não deve ser enviado ao backend (omitir do payload, não enviar string vazia).

## Testes necessários

### Frontend

- Gestor clica em outro membro → abre dialog de edição completo.
- Gestor deixa campo de senha vazio e salva → senha do membro não muda.
- Gestor preenche senha e salva → membro consegue logar com a nova senha.
- Membro comum clica em outro membro → nada acontece (ou dialog não abre), preservando a regra de que só edita a si mesmo.
- Dropdown do header não mostra mais "Segurança".

### Backend

- `PUT /account-members/:id` como gestor de outra conta (não dona do membro) → 404.
- `PUT /account-members/:id` sem `requireGestor` (membro tentando chamar) → 403.
- `PUT /usuarios/me` com `nova_senha` e sem `senha_atual` → senha trocada com sucesso.

### E2E

- Fluxo completo: gestor esquece a senha de um membro, abre Contas, clica no membro, define nova senha, membro loga com sucesso.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
```

## Riscos e pontos de atenção

- Remover a exigência de senha atual é uma redução de segurança deliberada — documentar isso claramente no commit para rastreabilidade futura.
- A nova rota administrativa de reset de senha é poderosa (gestor pode assumir controle de qualquer membro da conta) — já é consistente com o modelo existente (gestor já pode desativar/gerenciar permissões de qualquer membro), mas vale ter isso em mente.
- Mudança em 3 fluxos de senha simultaneamente (Contas, header, assistente) aumenta a superfície de teste manual necessária.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões foram coletadas.

## Critérios de aceite do plano

- Clicar em qualquer membro (não só a si mesmo) abre um modal de edição para o gestor.
- Gestor consegue definir uma nova senha para qualquer membro sem a senha atual dele.
- Trocar a própria senha (em qualquer um dos 3 pontos: Contas, header removido, assistente) não pede mais senha atual.
- A aba "Segurança" e seu atalho no header não existem mais.
- Nenhuma regressão nas funcionalidades existentes de Contas/Membros (criar, desativar, transferir pendências).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não há necessidade).
- Reaproveitar o padrão de validação de `resolveAccountIdForGestor` + checagem de `accountMembers` já usado em `/:id/deactivate` para a rota nova.
- Ao generalizar `MeusDadosDialog`, preferir renomear para algo mais genérico (ex: `EditarUsuarioDialog`) já que passa a servir dois papéis.
