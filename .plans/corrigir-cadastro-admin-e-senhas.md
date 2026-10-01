# Plano de Implementação: Cadastro sem admin e senhas

## Origem

- Arquivo de especificação: nenhum `.md`. São achados da implementação da conta PJ (`.plans/conta-pj-campos.md`), confirmados no código e alinhados na conversa de 2026-10-01, com as 4 decisões abaixo.
- Data do planejamento: `2026-10-01`
- Classificação: `fullstack` (frontend + backend, sem banco)

## Resumo

Cinco correções de problemas antigos:

1. **Cadastro como admin.** Qualquer pessoa consegue se cadastrar como admin, porque o `POST /auth/register` grava o tipo de usuário que vier no pedido.
2. **Redefinição de senha.** Não funciona: o front envia `nova_senha` e o servidor exige `novaSenha`. Toda redefinição volta "Validation error".
3. **"Redefinir senha" do assistente.** Apaga sobrenome, telefone e nascimento, porque usa o `PUT /users/me`, que regrava o perfil inteiro.
4. **Dica do enquadramento.** Promete criar categorias, o que o sistema não faz.
5. **Plural.** Sai "colaboradors" em três pontos de Contas.

Junto: sai a `SecurityTab` (código morto) e, depois do deploy, entra uma auditoria só de leitura dos admins de produção.

## Decisões registradas

- **Do alinhamento:**
  - A redefinição é corrigida no servidor, que passa a ler `nova_senha`, o mesmo nome das outras rotas e do site em cache.
  - A troca de senha do assistente ganha uma rota só de senha e continua sem pedir a senha atual, como o `PUT /users/me` já decide.
- **Decisão 1:** primeiro o merge da PJ (`feat/R/conta-pj-campos`) em `main`, com confirmação na hora. Depois, branch nova `fix/R/cadastro-admin-e-senhas` a partir da `main`.
- **Decisão 2:** tirar a dica do enquadramento.
- **Decisão 3:** apagar a `SecurityTab`.
- **Decisão 4:** auditoria dos admins de produção depois do deploy, só leitura e com confirmação.

## Escopo

### Dentro do escopo

- `/auth/register`: ignora o tipo de usuário vindo do pedido e grava sempre `titular`.
- `/auth/reset-password`: lê e valida `nova_senha` (mínimo 8).
- Nova rota `PUT /users/me/password`: troca só a senha do usuário logado.
- `ChangePasswordModal`: passa a usar a rota nova, pela função `updatePassword` no `usuariosService`.
- Saem a dica `contas:enquadramento-v1` e a mensagem `contasEnquadramento`.
- Plural vindo do `TERMOS` nos três pontos do `ContasTab`.
- Apagar `src/screens/config/SecurityTab.tsx`.
- Auditoria só de leitura dos admins de produção, depois do deploy.

### Fora do escopo

- Rebaixar ou bloquear admins indevidos. Isso fica para uma decisão separada, depois da auditoria.
- Recuperar dados já apagados pela troca de senha.
- Pedir a senha atual na troca de senha.
- Outros campos do corpo do cadastro (`google_id`, `pais`, `estado`, `cidade`).
- Mudar o `PUT /users/me`, que continua gravando o perfil inteiro para o "Meus dados".
- Tarefa B: colaborador usar os cadastros da empresa.

## Leitura de contexto

- `/AGENT.md` e `/CLAUDE.md`. `/frontend/AGENT.md` e `/backend/AGENT.md` **não existem** neste projeto.
- **Front:**
  - `src/services/authService.ts` (`resetPassword` envia `nova_senha`);
  - `src/services/usuariosService.ts`;
  - `src/components/financial-assistant/ChangePasswordModal.tsx`, usado em `AssistantHeaderMenu.tsx`;
  - `src/screens/config/SecurityTab.tsx`, que nenhum arquivo importa;
  - `src/screens/config/ContasTab.tsx` (`TERMOS`, `MembrosDaConta`, `ContaDialog`);
  - `src/components/firstAccessGuideMessages.ts`.
- **Servidor:**
  - `backend/src/routes/auth.ts` (`/register`, `/reset-password`);
  - `backend/src/routes/users.ts` (`PUT /me`, rotas de admin);
  - `backend/src/middleware/auth.ts` (`requireAdmin`).

## Impacto por área

### Frontend

- **`ChangePasswordModal`:**
  - deixa de buscar o perfil (`fetchMe`) e de enviá-lo;
  - chama `updatePassword(novaSenha)`;
  - o botão fica desabilitado só enquanto salva;
  - o aviso de mínimo de 8 continua.
- **`usuariosService.ts`:** nova função `updatePassword(novaSenha)`, que chama `PUT /users/me/password` com `{ nova_senha }`.
- **`ContasTab.tsx`:**
  - **`ContaDialog`:** saem o que só servia à dica do enquadramento:
    - `isNew` e `enquadramentoGuide`;
    - o `FirstAccessGuideCard` do enquadramento;
    - o import `GUIDE_LAYER_MODAL`;
    - o `position: 'relative'` da linha CNPJ/Enquadramento.
  - **`MembrosDaConta` e a linha da conta:** a contagem, o "Carregando..." e os rótulos "Expandir/Recolher" vêm de `TERMOS[tipo].plural`. Exemplos: "1 colaborador", "2 colaboradores", "Carregando colaboradores...", "Expandir colaboradores".
- **`firstAccessGuideMessages.ts`:** sai `contasEnquadramento`.
- Apagar `SecurityTab.tsx`.

### Backend

- **`auth.ts` `/register`:**
  - sai a leitura do tipo de usuário vindo do pedido;
  - `type: 'titular'` sempre;
  - admin continua só pela rota de admin (`POST /users`, com `requireAdmin`).
- **`auth.ts` `/reset-password`:** o validador e a leitura passam de `novaSenha` para `nova_senha`.
- **`users.ts` `PUT /me/password`:**
  - com `authenticate`;
  - `nova_senha` em texto, com pelo menos 8 caracteres;
  - erro "A nova senha precisa ter pelo menos 8 caracteres";
  - hash `bcrypt`;
  - atualiza só `senha` e `data_atualizacao` do `req.user.id`.

### Banco de dados

Sem impacto esperado. A auditoria é só leitura (`SELECT`).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem variáveis de ambiente novas.
- Depois do merge da PJ ficam pendentes em produção as migrations 0055 e 0056, cada uma com confirmação. Este plano não traz migration.
- O assistente antigo em cache continua chamando o `PUT /users/me` até recarregar.

## Arquivos provavelmente afetados

**Backend:**

- `backend/src/routes/auth.ts`;
- `backend/src/routes/users.ts`.

**Frontend:**

- `src/services/usuariosService.ts`;
- `src/components/financial-assistant/ChangePasswordModal.tsx`;
- `src/screens/config/ContasTab.tsx`;
- `src/components/firstAccessGuideMessages.ts`.

**Apagado:** `src/screens/config/SecurityTab.tsx`.

## Estratégia de implementação

**Fase 0 — Branch**

1. Conferir que a PJ (`feat/R/conta-pj-campos`) está em `main`. Se não estiver, perguntar ao usuário se pode fazer o merge, porque é produção, e só seguir com a confirmação.
2. Atualizar a `main` e criar `fix/R/cadastro-admin-e-senhas`. Não tocar no `GLOSSARIO.md`.

**Fase 1 — Remover**

3. `/register`: a leitura do tipo de usuário.
4. `/reset-password`: a leitura e a validação de `novaSenha`.
5. `ChangePasswordModal`: a busca do perfil e o envio do perfil inteiro.
6. A dica do enquadramento: `isNew`, `GUIDE_LAYER_MODAL`, `position: 'relative'` e a mensagem `contasEnquadramento`.
7. A montagem do plural com singular + "s".
8. `SecurityTab.tsx`.

**Fase 2 — Aplicar**

9. `/register` com `type: 'titular'`.
10. `/reset-password` com `nova_senha`.
11. `PUT /users/me/password`.
12. `updatePassword` e o `ChangePasswordModal` usando a rota.
13. Plural de `TERMOS`.

**Fase 3 — Validar**

14. `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build`, `npm --prefix backend test`.
15. Backend local (`.env.dev`) e roteiro da API, com usuários `@roteiro-*.test`:
    - cadastro PF e PJ com `tipo: 'admin'` cria um `titular`;
    - redefinição, com o código gravado direto no banco local, sem enviar e-mail:
      - `verify-recovery-code` responde 200;
      - `reset-password` com `nova_senha` responde 200;
      - entra com a senha nova e não com a antiga;
      - com 7 caracteres, responde 400;
    - `PUT /users/me/password`:
      - troca a senha e mantém sobrenome, telefone e nascimento;
      - com 7 caracteres, responde 400;
      - sem token, responde 401.
16. Fumaça das telas, com jsdom fora do projeto:
    - o plural em Contas;
    - a Nova conta sem a dica;
    - o modal do assistente troca a senha pela rota nova sem mexer no perfil.
17. Encerrar:
    - apagar os dados de teste;
    - parar o backend (TaskStop);
    - pedir ao usuário para conferir a porta, se a checagem for bloqueada.

**Depois do deploy (no `/finalizar`)**

18. Com confirmação na hora: listar só lendo os admins de produção (id, nome, e-mail e data de cadastro) e entregar ao usuário. Nenhuma alteração.

## Regras de negócio identificadas

- O cadastro pelo site cria sempre `titular`. Admin só pela rota de admin.
- **Redefinir a senha:**
  - exige mínimo de 8 caracteres;
  - o código continua igual: 6 dígitos, válido por 15 minutos, 3 tentativas.
- Trocar a senha no assistente muda só a senha e não pede a senha atual (decisão já registrada).
- A contagem e os rótulos usam o termo da conta: membro(s) na PF, colaborador(es) na PJ.

## Regras multi-tenant e segurança

- O tipo de usuário nunca vem do cliente no cadastro.
- **`PUT /users/me/password`:**
  - só altera o usuário do token (`req.user.id`);
  - senha com `bcrypt`;
  - mínimo de 8 conferido no servidor.
- As mensagens não revelam dados de outros usuários. A redefinição mantém as mensagens genéricas de hoje.
- **Auditoria:** só lê, só roda com confirmação e não altera nada.

## Validações necessárias

- **`/register`:** as validações de hoje (e-mail, documento, senha de 8, bloco da empresa no CNPJ). O tipo vindo do pedido é ignorado.
- **`/reset-password`:** `email` válido, `codigo` presente e `nova_senha` com 8 ou mais caracteres.
- **`PUT /users/me/password`:** `nova_senha` em texto, com 8 ou mais caracteres.
- **Modal:** mínimo de 8 antes de enviar, como hoje.

## Testes necessários

### Frontend

- Fumaça (jsdom):
  - o plural em Contas;
  - a Nova conta sem a dica;
  - o modal chamando a rota nova.

### Backend

- Roteiro da API do passo 15. As rotas não têm teste de unidade no projeto; o roteiro cobre.

### E2E

- Roteiro local e fumaça, com limpeza no fim.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build

npm --prefix backend run build
npm --prefix backend test
```

Backend local: `cd backend && DOTENV_CONFIG_PATH=../.env.dev NODE_ENV=development npx tsx src/server.ts` (nunca `dev:prod-db`).

## Riscos e pontos de atenção

**Admins indevidos**

- Quem se cadastrou como admin pela falha continua admin até a decisão que vem depois da auditoria.
- Os tokens já emitidos (JWT) continuam valendo, então um admin indevido segue com acesso até ser tratado.

**Cache**

- O assistente antigo em cache continua apagando dados na troca de senha até recarregar.
- O site antigo em cache passa a redefinir a senha normalmente, porque o servidor aceita o nome que ele já envia.

**Produção**

- A leitura é só `SELECT` e só roda com confirmação.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

**Cadastro e senhas**

- Cadastro PF ou PJ com `tipo: 'admin'` cria um `titular`.
- A redefinição de senha funciona de ponta a ponta com o site atual.
- Trocar a senha no assistente mantém sobrenome, telefone e nascimento. A senha nova entra e a antiga não.

**Telas e código**

- A dica do enquadramento não aparece, e `contasEnquadramento` não existe mais.
- "colaboradores" e "membros" aparecem certos na contagem, no carregamento e nos rótulos.
- `SecurityTab.tsx` foi apagada, sem import quebrado.
- tsc, testes e builds passam.

**Depois do deploy**

- A lista de admins de produção foi entregue, com confirmação.

## Observações para a skill implementar

**Fonte e ordem**

- Usar este plano como fonte principal. A Fase 1 remove e a Fase 2 aplica.

**Confirmações**

- Não fazer o merge da PJ sem confirmação.
- Não executar migrations.

**Testes**

- Testes manuais só com o `.env.dev`. Nunca `dev:prod-db`.
- A auditoria de produção não faz parte do `/implementar`: fica para depois do deploy, com confirmação.

**Código**

- Identificadores em inglês e textos ao usuário em português.
- Não alterar `.env`. Não fazer commit nem push: isso é do `/finalizar`.
