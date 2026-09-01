# Plano de Implementação: Redefinir senha e Alterar perfil no menu do Assistente

## Origem

- Arquivo de especificação: conversa com o usuário (pedido direto: "o menu do app precisa ter as opções redefinir senha e alterar perfis que atualmente não tem")
- Data do planejamento: `2026-08-31`
- Classificação: `frontend-only`

## Resumo

O `AssistantHeaderMenu` (menu "⋮ Mais opções" do Assistente Financeiro) hoje só tem "Conversas anteriores", "Nova conversa", "Abrir painel financeiro" e "Tamanho da letra". O usuário quer que esse menu também permita redefinir a senha e trocar o perfil ativo (CNPJ/empresa), sem precisar sair do assistente e abrir o painel financeiro completo — importante especialmente no PWA instalado (`assistant.html`), que abre direto no chat, sem sidebar nem o `AccountProfileMenu` do painel.

Investigação prévia mostrou que **ambas as funcionalidades já existem** no projeto:
- Redefinir senha: endpoint `PUT /api/users/me` (aceita `senha_atual`/`nova_senha`, já usado por `updateMe()` em `usuariosService.ts`) e UI de referência em `MinhaContaTab.tsx`.
- Trocar perfil: lógica já implementada em `AccountProfileMenu.tsx` (`fetchPerfis`, persistência em `localStorage`, reload).

Este plano não cria nada novo no backend — apenas expõe essas duas capacidades já existentes dentro do `AssistantHeaderMenu`, com UI própria adaptada ao contexto do assistente.

## Escopo

### Dentro do escopo

- Criar `src/hooks/useActiveProfile.ts`: extrair de `AccountProfileMenu.tsx` a lógica de perfil ativo (busca via `fetchPerfis`/`queryKeys.perfis`, perfil ativo atual, `useEffect` de auto-seleção com reload quando não há perfil ativo válido, função `select(perfil)` que persiste no `localStorage` e recarrega a página). Motivo: esta seria a terceira implementação do mesmo comportamento (a segunda foi `AccountProfileMenu`, que já substituiu o `PerfilSwitcher` original) — extrair evita duplicar pela terceira vez.
- Refatorar `src/layout/AccountProfileMenu.tsx` para consumir `useActiveProfile` no lugar da lógica inline hoje existente. Sem mudança de comportamento visível ou de API do componente.
- Criar `src/components/financial-assistant/ChangePasswordModal.tsx`: modal usando `Dialog` (`src/ui/dialog.tsx`, `Z_MODAL`), com 3 campos (Senha atual, Nova senha, Confirmar nova senha), replicando as validações já usadas em `MinhaContaTab.tsx` (nova senha mínimo 8 caracteres; confirmação deve bater com a nova senha; senha atual obrigatória apenas quando há nova senha preenchida). Chama `updateMe({ senha_atual, nova_senha })` de `usuariosService.ts`. Sucesso: fecha o modal e limpa os campos. Erro do backend (ex.: "Current password is incorrect"): exibe a mensagem abaixo do campo "Senha atual", sem fechar o modal.
- Estender `src/components/financial-assistant/AssistantHeaderMenu.tsx`:
  - Ampliar o tipo `MenuScreen` de `'main' | 'font-size'` para incluir `'switch-profile'`.
  - Novo item "Redefinir senha" na tela `main`, abrindo `ChangePasswordModal` (estado local de abertura do modal, renderizado fora ou dentro do próprio componente).
  - Novo item "Alterar perfil" na tela `main`, navegando para a nova tela `switch-profile` (mesmo padrão visual/interação já usado por "Tamanho da letra": cabeçalho com seta de voltar + lista).
  - Tela `switch-profile`: lista de perfis usando `useActiveProfile` (mesmo conteúdo visual por linha do `AccountProfileMenu` — nome, badge PJ/PF, check no ativo), oculta a opção "Alterar perfil" inteira no menu principal se `useActiveProfile` retornar 1 perfil ou menos (mesma regra já usada no painel).
  - Selecionar um perfil na lista fecha o menu (reload já é feito pelo próprio hook).
- Estender `src/components/financial-assistant/FinancialAssistant.tsx`: nova prop opcional `user?: AuthUser`, repassada ao `AssistantHeaderMenu`.
- Editar `src/layout/AppShell.tsx`: `<FinancialAssistant user={user} />` (o `AppShell` já recebe `user` como prop hoje).
- Editar `src/screens/assistant/AssistantPwaScreen.tsx`: usar o `user` já fornecido pelo render-prop de `AuthenticatedAppGate` (hoje descartado com `{() => <AssistantWorkspace />}`) e repassar para `FinancialAssistant`.

### Fora do escopo

- Qualquer mudança no backend — nenhuma rota nova, nenhuma migration. O endpoint `PUT /api/users/me` já cobre o caso de uso.
- Mudanças em `MinhaContaTab.tsx` ou em Configurações do painel financeiro — continuam exatamente como estão.
- Rate limiting na rota de troca de senha — gap de segurança pré-existente (a rota não tem `authRateLimiter` hoje), não introduzido nem corrigido neste plano.
- Qualquer alteração de UX/UI do `AccountProfileMenu` além da refatoração interna para usar o hook compartilhado (comportamento e aparência devem permanecer idênticos).
- Testes automatizados (projeto não possui suíte nessa área, conforme já validado em plano anterior).

## Leitura de contexto

- `/AGENT.md` (raiz) e `sistema financas/AGENT.md` — regras de workflow, sem separação `frontend/`/`backend/AGENT.md` dedicados neste projeto.
- `sistema financas/CLAUDE.md` — sequência obrigatória `/planejar → aprovação → /implementar → /finalizar`.
- `.plans/account-profile-menu-header.md` — plano anterior já implementado (`AccountProfileMenu`), cuja lógica de perfil ativo será extraída para reuso aqui.
- `src/layout/AccountProfileMenu.tsx` — implementação de referência da troca de perfil (a extrair para hook).
- `src/components/financial-assistant/AssistantHeaderMenu.tsx` — componente a estender; já tem o padrão de tela secundária (`font-size`) a replicar para `switch-profile`.
- `src/components/financial-assistant/FinancialAssistant.tsx` — não recebe `user` hoje; será estendido.
- `src/screens/assistant/AssistantPwaScreen.tsx` — entrada do PWA `assistant.html`; hoje descarta o `user` fornecido por `AuthenticatedAppGate`.
- `src/components/auth/AuthenticatedAppGate.tsx` — já resolve e fornece `session.user: AuthUser` via render-prop `children(user)`; fonte de verdade de usuário autenticado em toda a aplicação.
- `src/services/usuariosService.ts` — `updateMe(body: UsuarioMePutBody)`, já aceita `senha_atual`/`nova_senha`.
- `src/screens/config/MinhaContaTab.tsx` — UI de referência para validação de troca de senha (campos, mensagens, regra de quando exigir senha atual).
- `src/services/configService.ts` — `fetchPerfis()`.
- `src/services/queryKeys.ts` — `queryKeys.perfis`.
- `src/ui/dialog.tsx` — `Dialog` (usa `Z_MODAL`).
- `src/ui/zIndex.ts` — `Z_MODAL = 'z-50'`, `Z_DROPDOWN = 'z-40'` (modal deve ficar acima do dropdown do menu).
- Backend (investigado via leitura, sem alteração): `backend/src/routes/users.ts` (`PUT /api/users/me`, linhas ~48-149) já implementa troca de senha com `bcrypt.compare`/`bcrypt.hash(_, 10)`, mínimo 8 caracteres, dentro do mesmo endpoint de atualização de perfil.

## Impacto por área

### Frontend

- Novo hook `src/hooks/useActiveProfile.ts`: encapsula `useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis })`, cálculo de perfil ativo via `localStorage.getItem('perfilAtivoId')`, `useEffect` de auto-seleção/reload, e função `select(perfil)`.
- `AccountProfileMenu.tsx`: substituir lógica inline pelo hook, mantendo props e comportamento (`user`, `isDemoMode`) inalterados.
- Novo componente `ChangePasswordModal.tsx`: formulário controlado, `useMutation` para `updateMe`, tratamento de erro específico no campo "Senha atual".
- `AssistantHeaderMenu.tsx`: novas props (ex.: `user?: AuthUser` ou reaproveitar o hook diretamente dentro do componente, já que `useActiveProfile` não depende de props externas além de contexto de query); nova tela `switch-profile`; estado de abertura do `ChangePasswordModal`.
- `FinancialAssistant.tsx`: nova prop `user?: AuthUser`, repassada ao `AssistantHeaderMenu`.
- `AppShell.tsx` e `AssistantPwaScreen.tsx`: passagem do `user` já disponível para `FinancialAssistant`.
- Estados de loading/error da lista de perfis dentro do menu do assistente: equivalente ao já usado em `AccountProfileMenu` (sem tratamento extra não solicitado).
- Sem novas query keys — reaproveita `queryKeys.perfis` e o padrão local `['usuario-me']` se necessário invalidar cache após troca de senha (na prática, `ChangePasswordModal` não precisa invalidar `usuario-me`, pois a senha não é exibida em nenhuma tela).

### Backend

`Sem impacto esperado` — endpoint `PUT /api/users/me` já implementa o comportamento necessário e não será alterado.

### Banco de dados

`Sem impacto esperado`. Nenhuma migration necessária.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/hooks/useActiveProfile.ts` (novo)
- `sistema financas/src/layout/AccountProfileMenu.tsx` (refatorado)
- `sistema financas/src/components/financial-assistant/ChangePasswordModal.tsx` (novo)
- `sistema financas/src/components/financial-assistant/AssistantHeaderMenu.tsx` (editado)
- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx` (editado)
- `sistema financas/src/layout/AppShell.tsx` (editado — uma linha, passar `user`)
- `sistema financas/src/screens/assistant/AssistantPwaScreen.tsx` (editado — usar `user` do render-prop)

## Estratégia de implementação

1. Criar `useActiveProfile.ts` extraindo fielmente a lógica hoje em `AccountProfileMenu.tsx` (perfis, perfil ativo, auto-seleção com reload, `select`).
2. Refatorar `AccountProfileMenu.tsx` para consumir o hook novo; validar visualmente que o comportamento no painel financeiro não mudou (troca de perfil, caso de 1 perfil só, modo demo).
3. Criar `ChangePasswordModal.tsx`: campos controlados, validação de mínimo 8 caracteres e confirmação, `useMutation(updateMe)`, exibição de erro no campo "Senha atual" quando o backend retornar 400 com mensagem de senha incorreta.
4. Estender `AssistantHeaderMenu.tsx`: adicionar os dois novos itens na tela `main`, implementar a tela `switch-profile` usando `useActiveProfile`, gerenciar estado de abertura do `ChangePasswordModal`.
5. Propagar `user` de `AuthUser`: `AppShell.tsx` → `FinancialAssistant` → `AssistantHeaderMenu`; e `AssistantPwaScreen.tsx` (usar o `user` do render-prop de `AuthenticatedAppGate`) → `FinancialAssistant` → `AssistantHeaderMenu`.
6. Validar visualmente ambos os modos do assistente (`floating` no painel, `standalone` no PWA `assistant.html`): abrir "Redefinir senha", trocar perfil, casos de erro (senha atual incorreta, confirmação não bate), caso de 1 perfil só (item "Alterar perfil" deve sumir).
7. Rodar `npx tsc --noEmit` e `npm run build` no projeto `sistema financas`.

## Regras de negócio identificadas

- Troca de senha exige `senha_atual` correta (validada via `bcrypt.compare` no backend) sempre que `nova_senha` for enviada; nova senha deve ter no mínimo 8 caracteres (mesma regra do backend, replicada no frontend para feedback imediato).
- Trocar de perfil ativo grava `perfilAtivoId`, `perfilAtivoNome`, `perfilAtivoTipo` no `localStorage` e recarrega a página (comportamento herdado, sem chamada de API para "ativar" perfil).
- A opção "Alterar perfil" só aparece no menu se houver mais de 1 perfil cadastrado (mesma regra do `AccountProfileMenu` e do antigo `PerfilSwitcher`).
- O modal de senha não deve fechar automaticamente em caso de erro do backend — o usuário precisa ver a mensagem e poder corrigir.

## Regras multi-tenant e segurança

- Nenhuma nova superfície de autenticação é criada; a troca de senha usa exclusivamente o endpoint já autenticado e validado (`PUT /api/users/me`, que exige `authenticate` middleware e opera sobre `req.user!.id`, nunca sobre um ID vindo do client).
- A troca de perfil ativo já é validada no backend a cada request via `perfil_id`/`getActiveProfileId()` — mecanismo existente, não alterado.
- Nenhum dado sensível (senha, hash) é armazenado no frontend além do necessário para o envio único do formulário (campos limpos após sucesso ou fechamento do modal).

## Validações necessárias

- `ChangePasswordModal`: nova senha com no mínimo 8 caracteres; confirmação deve ser idêntica à nova senha; senha atual não pode estar vazia quando há nova senha preenchida (mesmas regras de `MinhaContaTab.tsx`).
- Tratamento do erro retornado pelo backend quando `senha_atual` estiver incorreta (mensagem "Current password is incorrect" ou equivalente em português, conforme o backend retornar) — exibir de forma amigável no campo correspondente.

## Testes necessários

### Frontend

Nenhum — projeto não possui suíte de testes automatizados nessa área (já confirmado em plano anterior).

### Backend

Sem impacto.

### E2E

Nenhum solicitado.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npx tsc --noEmit
npm run build
```

Validação manual obrigatória (UI):
- Abrir o assistente financeiro no modo flutuante (painel `app.html`) e testar "Redefinir senha" (sucesso e erro de senha atual incorreta) e "Alterar perfil" (com múltiplos perfis e com 1 perfil só).
- Abrir o PWA do assistente (`assistant.html`, se instalado, ou acessando a rota diretamente) e repetir os mesmos testes, confirmando que `user` chega corretamente via `AuthenticatedAppGate`.
- Confirmar que o `AccountProfileMenu` no painel financeiro continua funcionando de forma idêntica após a refatoração para usar `useActiveProfile` (troca de perfil, dropdown, modo demo).
- Confirmar empilhamento visual correto do `ChangePasswordModal` sobre o `AssistantHeaderMenu` (z-index).

## Riscos e pontos de atenção

- Refatorar `AccountProfileMenu.tsx` (já implementado e commitado em branch anterior) para consumir o hook novo é uma mudança em código já validado — precisa de re-teste cuidadoso para não introduzir regressão no fluxo de troca de perfil do painel financeiro.
- `ChangePasswordModal` precisa ficar visualmente acima do `AssistantHeaderMenu` (`Z_MODAL` > `Z_DROPDOWN`, já confirmado: `z-50` > `z-40`), mas também deve ser compatível com o layout do modo `standalone` do assistente, que ocupa a tela cheia.
- `AssistantPwaScreen.tsx` hoje ignora deliberadamente o `user` fornecido por `AuthenticatedAppGate` (`{() => <AssistantWorkspace />}`) — a mudança precisa capturar esse argumento e repassá-lo corretamente sem quebrar o gate de autenticação/plano já existente.
- A rota de troca de senha não tem rate limiting hoje — não é corrigido neste plano, mas fica registrado como gap de segurança pré-existente.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O menu "⋮" do assistente financeiro (ambos os modos, `floating` e `standalone`) tem as opções "Redefinir senha" e "Alterar perfil".
- "Redefinir senha" abre um modal funcional que reaproveita o endpoint `PUT /api/users/me` já existente, com validação de mínimo 8 caracteres, confirmação de senha e tratamento de erro de senha atual incorreta.
- "Alterar perfil" mostra a lista de perfis do usuário (oculto se houver apenas 1) e permite trocar o perfil ativo, com o mesmo comportamento (persistência + reload) já usado no painel financeiro.
- O `AccountProfileMenu` do painel financeiro continua funcionando de forma idêntica após a extração do hook `useActiveProfile`.
- Nenhuma alteração de backend foi necessária.
- `npx tsc --noEmit` e `npm run build` passam sem erros novos introduzidos por esta mudança.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `/AGENT.md` e `sistema financas/CLAUDE.md`.
- Não criar nenhuma rota, migration ou alteração de backend — o endpoint necessário já existe.
- Extrair a lógica de `AccountProfileMenu.tsx` para `useActiveProfile.ts` com fidelidade total ao comportamento atual antes de usá-la no novo contexto do assistente.
- Reaproveitar padrões visuais já usados em `AssistantHeaderMenu.tsx` (tela `font-size`) para a nova tela `switch-profile`, e em `MinhaContaTab.tsx` para as validações do `ChangePasswordModal`.
- Nenhuma migration ou alteração de `.env` é necessária ou permitida neste plano.
