# Plano de Implementação: Tentativas do código de recuperação e acesso de membro desativado

## Origem

- Arquivo de especificação: nenhum `.md`. O pedido veio da conversa de 2026-10-02. O roteiro do plano `.plans/login-recuperacao-e-logo.md` revelou o erro da etapa do código. O achado do membro desativado já estava pendente. As 3 decisões estão abaixo.
- Data do planejamento: `2026-10-02`
- Classificação: `backend-only`. Não muda o banco nem precisa de migration. O front já mostra a mensagem que o servidor envia.

## Resumo

1. **Conferir o código:** com um código errado, o contador de tentativas quebra (`jsonb_build_object('recovery_attempts', $1)` sem tipo, erro 42P18 do Postgres) e a rota responde "Server error". Por isso, o limite de 3 tentativas nunca entra em ação.
2. **Redefinir a senha:** um código errado não conta tentativa. Por essa rota, dá para testar os 6 dígitos sem limite.
3. **Pedidos simultâneos:** o contador lê o valor, compara e só depois grava. Vários pedidos ao mesmo tempo passam do limite.
4. **Mensagens:** as desta etapa estão em inglês.
5. **Membro desativado:** ele ainda entra com senha, porque o login só barra `bloqueado`, e continua usando uma sessão que já estava aberta. Isso contradiz o aviso da tela de desativar: "O login dele será bloqueado" (`src/screens/config/ContasTab.tsx:922`).

## Decisões registradas

- **Decisão 1:** a tentativa é gravada no banco antes de comparar o código, numa única operação. Assim, nem pedidos em paralelo passam de 3.
- **Decisão 2:** a mensagem mostra quantas tentativas restam.
- **Decisão 3:** o membro desativado é barrado no login (com senha e com Google) e também nas sessões já abertas. O status passa a ser conferido em todo pedido autenticado.

## Escopo

### Dentro do escopo

- **Conferir o código e redefinir a senha:**
  - antes de comparar, cada pedido reserva uma tentativa com um `UPDATE` condicional;
  - a reserva só passa se houver código pedido, dentro do prazo e com menos de 3 tentativas usadas;
  - acertar na conferência devolve a tentativa, porque acerto não conta;
  - acertar na redefinição grava a senha nova e apaga o código, como hoje.
- **Mensagens:**
  - "Código incorreto. Restam 2 tentativas."
  - "Código incorreto. Resta 1 tentativa."
  - "Código incorreto. Você usou as 3 tentativas: peça um novo código."
  - "Muitas tentativas com este código. Peça um novo código."
  - "Código expirado. Peça um novo código."
  - "Nenhum código foi pedido para este e-mail."
  - "E-mail não cadastrado. Confira o e-mail usado no cadastro." (404)
  - "Código confirmado." e "Senha redefinida."
  - erros 500 em português: "Não foi possível conferir o código agora. Tente de novo em instantes." e "Não foi possível redefinir a senha agora. Tente de novo em instantes."
- **Login com senha:** o status é conferido depois da senha.
  - `inativo` → 403 "Acesso desativado pelo titular da conta."
  - `bloqueado` → 403 "Conta bloqueada. Fale com o suporte."
  - Senha errada mostra "Senha incorreta", qualquer que seja o status.
- **Login com Google:**
  - aplica a mesma regra e as mesmas mensagens;
  - status vazio passa a entrar, como já entra no login com senha.
- **Sessões abertas:**
  - o `authenticate` confere o status a cada pedido, com uma consulta pela chave primária;
  - `inativo` ou `bloqueado` recebe 401 com a mensagem do status, e usuário que não existe mais também recebe 401;
  - o app já encerra a sessão no 401 e volta para a entrada.

### Fora do escopo

- Avisar na tela por que a sessão foi encerrada. A pessoa vê o motivo ao tentar entrar de novo.
- Guardar o código com hash. Hoje ele fica em texto no cadastro.
- Limite por IP nas rotas de conferir e redefinir. O limite de 3 por código e o limite de pedidos de código já bastam.
- A mensagem genérica "Validation error".
- Qualquer mudança no front.

## Leitura de contexto

- `/AGENT.md` e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md` não existem; o `AGENT.md` da raiz cobre o repositório.
- **Servidor:**
  - `backend/src/routes/auth.ts`: login, Google, `verify-recovery-code` e `reset-password`;
  - `backend/src/middleware/auth.ts`: `authenticate` e `requireActivePlan`;
  - `backend/src/routes/accountMembers.ts`: `PUT /:id/deactivate` grava `inativo` no usuário e no vínculo. Não existe rota de reativar;
  - `backend/src/services/plan-lifecycle.ts`;
  - `backend/src/db/schema/users.ts`: `status` é `varchar` que aceita nulo, com padrão `ativo`, e só pode valer `ativo`, `inativo` ou `bloqueado`;
  - `backend/src/utils/requestInput.ts`: `RequestInputError` e `sendRequestError`.
- **Front, só leitura:**
  - `src/services/apiClient.ts`: um 401 das rotas autenticadas faz `logout()`;
  - `src/hooks/useAuthSession.ts`;
  - `src/App.tsx`: sem token, volta para `/index.html`;
  - `src/screens/public/LoginPage.tsx`;
  - `src/screens/config/ContasTab.tsx`.

## Impacto por área

### Frontend

Sem impacto esperado.

- As telas do código e da nova senha já mostram a mensagem do servidor.
- O 401 de uma sessão encerrada já leva de volta à entrada: o `logout()` limpa a sessão e `App.tsx` redireciona para `/index.html`.

### Backend

- **Novo `services/passwordRecoveryCode.ts`:**
  - `reserveRecoveryAttempt(email)` faz um `UPDATE … RETURNING` condicional, com Drizzle e `sql` só nas expressões de JSONB.
    - O incremento usa o valor da própria linha: `COALESCE((dados_financeiros->>'recovery_attempts')::int, 0) + 1`.
    - O `WHERE` exige código presente, prazo não vencido e tentativas abaixo de 3.
    - Sem reserva, ele lança `RequestInputError` com o motivo: e-mail não cadastrado (404), nenhum código, código expirado ou muitas tentativas (400).
  - `releaseRecoveryAttempt(userId)` devolve a tentativa com `GREATEST(tentativas - 1, 0)`.
- **Novo `utils/authMessages.ts`:**
  - `wrongCodeMessage(attemptsUsed)` monta a mensagem de código errado com as tentativas restantes.
  - `blockedAccessMessage(status)` devolve a mensagem de quem não pode entrar, ou `null` quando pode. Só `inativo` e `bloqueado` são barrados.
- **`routes/auth.ts`:**
  - A conferência e a redefinição usam o serviço e respondem os erros com `sendRequestError`.
  - O login confere o status depois da senha, com `blockedAccessMessage`.
  - O Google usa a mesma função.
- **`middleware/auth.ts`:** o `authenticate` fica assíncrono e, depois de validar o token, consulta `users.status` pelo id.
  - Usuário barrado: 401 com a mensagem de `blockedAccessMessage`.
  - Usuário inexistente: 401.
  - Erro: 500 em português.

### Banco de dados

Sem impacto esperado. O contador continua no JSON `dados_financeiros`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Nenhuma variável nova.
- Cada pedido autenticado faz uma consulta a mais no banco, uma busca pela chave primária.
- Depois do deploy, um membro desativado com sessão aberta sai no próximo pedido. Pela auditoria de 2026-10-01, a produção não tem nenhum.

## Arquivos provavelmente afetados

- `backend/src/routes/auth.ts`
- `backend/src/middleware/auth.ts`
- Novo: `backend/src/services/passwordRecoveryCode.ts`
- Novos: `backend/src/utils/authMessages.ts` e `backend/src/utils/authMessages.test.ts`

## Estratégia de implementação

**Fase 0 — Branch**

1. Atualizar a `main` e criar `fix/R/codigo-recuperacao-e-acesso-desativado`.

**Fase 1 — Remover**

2. Em `verify-recovery-code` e `reset-password`, remover:
   - a leitura do JSON seguida das verificações em sequência;
   - o contador quebrado;
   - o `INVALID_MSG`;
   - as mensagens em inglês.
3. No login, remover a verificação de `bloqueado` feita antes da senha.
4. No Google, remover a verificação `status !== 'ativo'` e a mensagem dela.

**Fase 2 — Aplicar**

5. `utils/authMessages.ts`, com o teste unitário.
6. `services/passwordRecoveryCode.ts`: reserva e devolução da tentativa.
7. Conferência e redefinição com o serviço e as mensagens novas. O código recebido é comparado como texto, sem espaços nas pontas.
8. Login: status conferido depois da senha. Google com a mesma regra.
9. `authenticate` conferindo o status a cada pedido.

**Fase 3 — Validar**

10. Rodar `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build` e `npm --prefix backend test`.
11. Roteiro da API local numa porta livre, com o EmailJS interceptado:
    - **Recuperação:**
      - 2 erros mostram "Restam 2" e depois "Resta 1";
      - o acerto seguinte passa, e o contador volta a 2;
      - um erro na redefinição mostra "Você usou as 3 tentativas", e depois até o código certo é barrado;
      - o reenvio zera o contador, e o fluxo completo segue até entrar com a senha nova;
      - redefinir de novo dá "Nenhum código foi pedido";
      - 20 pedidos errados em paralelo dão exatamente 3 "Código incorreto" e 17 "Muitas tentativas";
      - código vencido mostra a mensagem de expirado;
      - e-mail não cadastrado dá 404.
    - **Acesso:**
      - desativar o membro corta a sessão aberta dele com 401;
      - o login dele com a senha certa dá "Acesso desativado pelo titular da conta.", e com a senha errada dá "Senha incorreta";
      - conta bloqueada se comporta do mesmo jeito, com a mensagem dela;
      - usuário ativo continua normal;
      - usuário com status vazio continua entrando.
12. Fumaça jsdom da tela do código:
    - o erro mostra "Restam 2 tentativas";
    - o reenvio funciona;
    - o código certo leva à tela da nova senha;
    - a senha nova volta ao login com "Senha redefinida com sucesso!".
13. Apagar os dados de teste e encerrar o backend pela árvore de processos.

## Regras de negócio identificadas

- Cada código aceita até 3 erros, somando a conferência e a redefinição. Acerto não conta.
- Pedir um código novo zera as tentativas. Isso já funciona desde o plano anterior.
- Membro desativado não entra nem continua uma sessão aberta. O mesmo vale para conta bloqueada.
- Cadastros antigos com status vazio continuam entrando.

## Regras multi-tenant e segurança

- A reserva atômica da tentativa impede que pedidos simultâneos passem do limite. Isso se apoia no bloqueio de linha do `UPDATE`: o Postgres reavalia o `WHERE` na versão nova da linha.
- O status é conferido depois da senha, então só quem sabe a senha descobre que a conta está desativada ou bloqueada.
- O status vem sempre do banco, nunca do token.
- Contas e permissões não mudam.

## Validações necessárias

- Continuam como hoje:
  - e-mail válido;
  - código obrigatório;
  - senha nova com pelo menos 8 caracteres.
- O código recebido é tratado como texto, sem espaços nas pontas.

## Testes necessários

### Frontend

- Fumaça jsdom da tela do código (passo 12).

### Backend

- Teste unitário de `wrongCodeMessage` e `blockedAccessMessage`.
- Roteiro da API (passo 11).

### E2E

- Roteiro e fumaça locais, com limpeza dos dados de teste.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **Consulta extra por pedido:** é rápida, mas soma nas telas que fazem muitos pedidos.
- **`authenticate` assíncrono:** no Express 4, o erro precisa ser tratado no próprio middleware.
- **Status vazio:** a regra barra só `inativo` e `bloqueado`. Se fosse "diferente de `ativo`", cadastros antigos com status vazio perderiam o acesso.
- **Devolução da tentativa:** se ela falhar, quem acertou depois de 2 erros fica bloqueado na redefinição. O roteiro cobre esse caso.
- **Google:** com status vazio, o login pelo Google passa a entrar, como no login com senha.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação está pronta quando:

- código errado nunca mais responde "Server error";
- a mensagem mostra as tentativas restantes, e depois de 3 erros até o código certo é barrado;
- a redefinição também conta código errado;
- 20 pedidos errados em paralelo avaliam no máximo 3;
- as mensagens da etapa estão em português;
- o membro desativado não entra com senha nem com Google, e a sessão aberta dele cai no próximo pedido;
- usuários ativos e com status vazio seguem funcionando;
- tsc, testes e builds passam.

## Observações para a skill implementar

- **Ordem:** a Fase 1 remove e a Fase 2 aplica.
- **Consultas novas:** em Drizzle, com `sql` só nas expressões de JSONB. O `UPDATE` final da redefinição fica como está.
- **Backend local:** subir numa porta livre, com o EmailJS interceptado (módulo `--import` no scratchpad, que também confere se o banco é o local), e encerrar pela árvore de processos.
- **Proibições:**
  - não fazer commit nem push;
  - não alterar o `.env`;
  - não executar migrations (este plano não tem nenhuma).
