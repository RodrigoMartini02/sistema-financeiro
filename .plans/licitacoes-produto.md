# Plano de Implementação: Licitações como produto (parte 2)

## Origem

- Arquivo de especificação: `.plans/proposta-empresa-produtos-site.md` (v0.2: seções 1, 5, 7 e 9)
- Data do planejamento: `2026-10-06`
- Classificação: `frontend + backend + database`

Decisões do planejamento:

1. **Usuários incluídos:** o titular conta. Os 2 incluídos são o titular e mais 1; do 3º em diante, R$ 2,99/mês cada.
2. **Usuário a mais:** entra na próxima cobrança, sem cobrar a diferença do mês.
3. **Contas habilitadas hoje pelo admin:** viram **cortesia**, sem cobrança e sem limite de usuários, até o admin desligar.
4. **Teste do FINGERENCE:** o cadastro por Licitações mantém o teste do FINGERENCE, como hoje, inclusive o e-mail de acesso suspenso no fim dele.
5. **Ativação:** o titular ativa Licitações sozinho ("Ativar Licitações — 15 dias grátis").
6. **Onde fica a assinatura:** em `licitacoes.conta_habilitada`, com colunas novas.

## Resumo

Licitações passa a ser vendido à parte, sem depender do admin para liberar contas:

- **Entrada:** cadastro aberto pela entrada do módulo, ou ativação por quem já usa o FINGERENCE.
- **Teste:** 15 dias grátis.
- **Preço:** assinatura por conta, com R$ 4,99/mês para 2 usuários e R$ 2,99/mês por usuário a mais, paga pelo Mercado Pago (Pix, cartão avulso, checkout ou recorrente).
- **Usuários:** tela sem permissões.
- **Contas atuais:** seguem como cortesia.

O nome do produto continua "Licitações" até a parte 4 (marca).

## Escopo

### Dentro do escopo

- Migration 0080: colunas de assinatura em `licitacoes.conta_habilitada` e a função `licitacoes.fn_conta_com_acesso`.
- Regra de acesso com cortesia, teste, pago e recorrente. Assinatura vencida responde 402.
- Avisos do coletor só para contas com acesso válido.
- Cadastro com `modulo: 'licitacoes'` e ativação pelo titular.
- Usuários: cadastrar (já com acesso), liberar e remover, com limite e valor.
- Cobrança do módulo: status, Pix, cartão, checkout, recorrente (com troca de valor), cancelamento e webhook.
- Serviço comum do Mercado Pago, que o pagamento do FINGERENCE também passa a usar.
- Serviço comum de criação de membro, que a rota de finanças também passa a usar.
- Painéis de pagamento comuns no frontend, usados pelos dois módulos.
- No app de Licitações: "Criar conta", tela de assinatura vencida, ativação, Usuários e Assinatura.
- Admin: o interruptor passa a ser de cortesia, com a situação de cada conta.
- FINGERENCE: "Ir para Licitações" no bloqueio de plano vencido.
- Testes e README do módulo.

### Fora do escopo

- E-mail de aviso de vencimento da assinatura de Licitações.
- Site novo (parte 3) e nome, marca e domínio (parte 4).
- Mudar a regra de teste do FINGERENCE (decisão 4).
- Desabilitar a conta de vez pelo admin: o interruptor passa a ser só de cortesia.
- Reembolso.

## Leitura de contexto

- `/AGENT.md` (raiz)
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md` (fluxo, `.env` e migrations)
- `.plans/proposta-empresa-produtos-site.md` (v0.2)
- `.plans/planos-starter-premium.md` (parte 1, em produção: padrões de pagamento, referência `fin:` e trava)
- `backend/src/modules/tenders/README.md`
- Código lido:
  - `backend/src/modules/tenders/`:
    - `routes/{index,overview,deps}.ts`;
    - `middleware/tenderAccess.ts`;
    - `services/{access,team}.ts`;
    - `db/schema.ts`;
    - `collector/notifications.ts` (3 consultas com `JOIN licitacoes.conta_habilitada h ... AND h.ativa`).
  - `backend/drizzle/0073_licitacoes_tabelas.sql`
  - `backend/src/routes/{auth,accountMembers,plans}.ts`
  - `backend/src/services/{memberInput,planPayments,plan-lifecycle}.ts`
  - `backend/src/server.ts`
  - `src/screens/public/LoginPage.tsx`, `src/services/{authService,session}.ts` e `src/utils/authOrigin.ts`
  - `src/tenders/`:
    - `TendersApp.tsx`;
    - `utils/gateState.ts`;
    - `screens/{GateScreens,TendersLoginScreen,SettingsScreen,AdminAccountsScreen}.tsx`;
    - `components/TeamList.tsx`;
    - `services/tendersApi.ts`.
  - `src/screens/planos/PlanosScreen.tsx` e `src/components/auth/PlanExpiredGate.tsx`

**Isolamento:** o `AGENT.md` fala em "prefeitura"; aqui o isolamento é por **conta**. A conta vem sempre das contas do usuário do token (titular) ou do vínculo ativo (membro), nunca livre do cliente.

## Impacto por área

### Frontend

- **Pagamento comum** (`src/components/payments/`):
  - `PaymentDialog` (abas Pix, Cartão e Recorrente), `PixPanel`, `CardPaymentForm` e `CheckoutRedirectPanel`, extraídos de `PlanosScreen.tsx`;
  - recebem os endereços como parâmetro (`config`, `pix`, `card`, `checkout`, `recurring`), o corpo extra (FINGERENCE: `{ tipo }`; Licitações: `{ accountId }`) e o resumo (nome, preço e período);
  - `PlanosScreen` passa a usá-los, sem mudar o comportamento.
- **Login de Licitações** (`LoginPage.tsx` com `context="tenders"`):
  - passa a mostrar "Criar conta", com o mesmo formulário (PF ou PJ) e o aceite dos termos;
  - `authService.register` e `registerCompany` passam a aceitar `modulo` e enviam `modulo: 'licitacoes'`;
  - depois do cadastro, a pessoa entra em `/licitacoes/app`, pela `auth_origin` do módulo.
- **Portão do app** (`utils/gateState.ts`, `TendersApp.tsx`):
  - estado novo `expired` (402). O corpo traz `role`;
  - **titular:** tela de assinatura vencida, com o `BillingPanel` e "Sair";
  - **usuário:** "A assinatura da conta venceu. Peça ao titular para renovar.";
  - **`noModule` (404):** a tela consulta `GET /api/tenders/activation`. Para o titular, mostra "Ativar Licitações — 15 dias grátis", com escolha da conta quando houver mais de uma; para os demais, a mensagem atual.
- **Configurações do módulo** (`SettingsScreen.tsx`):
  - a aba **Equipe** vira **Usuários**:
    - titular fixo;
    - colaboradores com liberar ou remover (o interruptor atual);
    - "Adicionar usuário": nome, sobrenome, e-mail, senha e CPF opcional;
    - o texto do limite ("Incluídos: você e mais 1. Cada usuário a mais: R$ 2,99/mês, a partir da próxima cobrança") e o valor atual do mês;
    - na cortesia: "Cortesia: sem cobrança e sem limite";
  - aba nova **Assinatura** (titular), com o `BillingPanel`: situação, data do fim do teste ou do período pago, valor do mês, pagar (Pix, cartão, checkout ou recorrente) e cancelar o recorrente.
- **Admin** (`AdminAccountsScreen.tsx`):
  - o interruptor passa a ser **Cortesia**;
  - cada conta mostra a situação: cortesia, teste até, pago até, recorrente ou vencida.
- **FINGERENCE** (`PlanExpiredGate.tsx`): quem tem acesso a Licitações (`fetchTendersAccess`, já usado no `AppShell`) vê o botão "Ir para Licitações".
- **Services e query keys:** `src/tenders/services/` ganha cobrança, ativação e criação de usuário, com as chaves em `tenders/services/queryKeys.ts`.
- **Estados:** carregando, erro e vazio seguem os componentes do módulo (`LoadStates`, `EmptyState`).

### Backend

- **Regras puras** (`modules/tenders/services/billing.ts`):
  - `TENDERS_PRICE`: base 499 centavos, 2 incluídos, 299 centavos por usuário extra;
  - `monthlyAmountCents(usersCount)`;
  - `TRIAL_DAYS = 15`, `PAID_PERIOD_DAYS = 30`;
  - `nextPaidUntil({ now, trialUntil, paidUntil })`: o maior entre agora, fim do teste e pago até, mais 30 dias;
  - `subscriptionSituation(row, now)`: `cortesia`, `teste`, `paga`, `recorrente`, `vencida` ou `desligada`;
  - `buildTendersPaymentReference(accountId)` = `lic:<id>` e `parseTendersPaymentReference(ref)`.
- **Acesso** (`services/access.ts`, `middleware/tenderAccess.ts`):
  - a conta só entra se `licitacoes.fn_conta_com_acesso(h)`;
  - linha ativa sem acesso válido: novo motivo `subscriptionExpired`, respondido com 402 `{ code: 'TENDERS_SUBSCRIPTION_EXPIRED', role }` (titular ou colaborador);
  - `GET /access` traz a situação da assinatura e as contas do titular com o módulo.
- **Ativação** (fora da trava, em `createTendersRoutes`, antes de `createRequireTenderAccess`):
  - `GET /api/tenders/activation`: `{ canActivate, accounts }`, ou seja, as contas ativas do titular que ainda não têm linha em `conta_habilitada`;
  - `POST /api/tenders/activation { accountId }`:
    - só o titular e só uma conta dele;
    - grava `ativa = true`, `tipo_acesso = 'assinatura'` e `teste_ate = agora + 15 dias`;
    - conta que já tem linha responde 409 "O teste já foi usado nesta conta".
- **Cadastro** (`routes/auth.ts`, `POST /register`):
  - aceita `modulo` (`licitacoes` ou ausente; outro valor dá 400);
  - com o módulo, chama `startTenderTrial(transaction, accountId, userId)`, exportado pelo módulo, na mesma transação do cadastro;
  - o resto do cadastro não muda: conta pessoal ou empresa, categorias e teste do FINGERENCE (decisão 4).
- **Usuários:**
  - **serviço comum de criação de membro** (`backend/src/services/accountMemberCreation.ts`):
    - leva da rota de finanças a checagem de e-mail e documento (`checkMemberDocument`, `findAccountAccessWithDocument`), a de setor e cargo (`checkMemberPlacement`, opcional) e a transação (`usuarios`, `conta_membros`, `membro_permissoes`);
    - aceita uma etapa extra na mesma transação;
    - `POST /api/account-members` passa a usá-lo, sem mudar o comportamento;
  - **`POST /api/tenders/team`** (titular):
    - lê o pedido com `readNewMemberInput` (sem setor e cargo);
    - cria o membro e a linha em `licitacoes.acesso_membro` na mesma transação;
    - atualiza o valor do recorrente, se houver;
  - **`PUT /api/tenders/team/:userId`** (já existe) também atualiza o valor do recorrente quando liberar ou remover muda a contagem;
  - **contagem:** o titular mais os membros ativos com linha em `acesso_membro`.
- **Cobrança** (`modules/tenders/routes/billing.ts`, fora da trava, só titular):
  - `GET /api/tenders/billing?accountId=`: situação, `teste_ate`, `pago_ate`, recorrente, usuários, valor do mês e `tipo_acesso`;
  - `POST /api/tenders/billing/pix`, `/card` (avulso), `/checkout` (link), `/recurring` e `/cancel`, com o valor do mês calculado no servidor e a referência `lic:<conta>`;
  - `notification_url` = `${BACKEND_URL}/api/tenders/billing/webhook`;
  - **cancelar:** cancela o recorrente no Mercado Pago e apaga `recorrente_id`. O acesso vai até o maior entre `teste_ate` e `pago_ate`.
- **Webhook** (público; exportado por `createTendersRoutes` e registrado no `server.ts` antes de `/api/tenders/admin` e `/api/tenders`):
  - busca o pagamento ou a assinatura no Mercado Pago pelo id;
  - só aceita a referência `lic:<id>` de conta com linha;
  - **pagamento aprovado:**
    - avulso: `pago_ate = nextPaidUntil(...)`;
    - cobrança do recorrente: `pago_ate = agora + 30 dias`;
    - grava `usuarios_cobrados` e `ultimo_pagamento_id`;
    - ignora id repetido (idempotente);
  - **assinatura autorizada:** confirma `recorrente_id`;
  - **assinatura cancelada ou pausada, ou cobrança recusada:** apaga `recorrente_id`, se for o mesmo.
- **Serviço comum do Mercado Pago** (`backend/src/services/mercadoPagoCharges.ts`):
  - cliente, criação de Pix, cartão avulso, link de checkout, assinatura recorrente, cancelar, mudar o valor e consultar pagamento e assinatura;
  - `routes/plans.ts` passa a usá-lo, sem mudar o comportamento (a referência `fin:` continua; `lic:` é ignorada pelo webhook do FINGERENCE, como hoje).
- **Admin** (`services/team.ts`, `routes/index.ts`):
  - `setAccountEnabled` vira `setAccountCourtesy(db, adminId, accountId, courtesy)`:
    - ligado: `tipo_acesso = 'cortesia'` e `ativa = true`, criando a linha se não existir;
    - desligado: `tipo_acesso = 'assinatura'`, e a conta segue pela assinatura;
  - o corpo passa a ser `{ courtesy }`;
  - a lista traz `accessType`, `situation`, `trialUntil` e `paidUntil`.
- **Avisos do coletor** (`collector/notifications.ts`): as 3 consultas trocam `AND h.ativa` por `AND licitacoes.fn_conta_com_acesso(h)`.
- **Relatórios e PDFs:** sem impacto.

### Banco de dados

**Migration `backend/drizzle/0080_licitacoes_assinatura.sql`**, só acrescenta, com o cabeçalho no padrão do repositório (ordem, reversão e aviso de confirmação):

```sql
ALTER TABLE licitacoes.conta_habilitada
  ADD COLUMN tipo_acesso VARCHAR(12) NOT NULL DEFAULT 'cortesia'
    CHECK (tipo_acesso IN ('cortesia', 'assinatura')),
  ADD COLUMN teste_ate TIMESTAMPTZ,
  ADD COLUMN pago_ate TIMESTAMPTZ,
  ADD COLUMN recorrente_id VARCHAR(100),
  ADD COLUMN usuarios_cobrados INTEGER,
  ADD COLUMN ultimo_pagamento_id VARCHAR(40),
  ADD COLUMN atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Regra de acesso, usada pela trava da API e pelos avisos do coletor.
CREATE FUNCTION licitacoes.fn_conta_com_acesso(h licitacoes.conta_habilitada)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT h.ativa AND (
    h.tipo_acesso = 'cortesia'
    OR h.recorrente_id IS NOT NULL
    OR coalesce(greatest(h.teste_ate, h.pago_ate) > now(), false)
  )
$$;

-- O coletor (usuário restrito) executa a função nos avisos; local usa o mesmo usuário do app.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT EXECUTE ON FUNCTION licitacoes.fn_conta_com_acesso(licitacoes.conta_habilitada) TO licitacoes_coletor;
  END IF;
END $$;
```

- **Dados existentes:** as linhas atuais viram cortesia pelo valor padrão (decisão 3), e as desligadas (`ativa = false`) continuam sem acesso.
- **Reversão:** `DROP FUNCTION licitacoes.fn_conta_com_acesso(licitacoes.conta_habilitada);` e `ALTER TABLE licitacoes.conta_habilitada DROP COLUMN ...` (as 7 colunas).
- **Drizzle:** `tenderEnabledAccounts` (`modules/tenders/db/schema.ts`) ganha as colunas e as constantes de `tipo_acesso`.
- **Ordem:** aplicar no banco local e depois em produção, **antes do deploy**. Como só acrescenta, o código atual continua funcionando com ela.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Sem variável de ambiente nova:** o webhook usa `BACKEND_URL`, e as credenciais do Mercado Pago são as mesmas.
- **Render:** nenhum serviço novo. O webhook é uma rota do backend. A rotina diária não muda: o vencimento é calculado pela data.
- **Usuário do coletor:** a migration já concede a execução da função, se o usuário existir. As colunas novas estão cobertas pela permissão da tabela.
- **Publicação:** migration 0080 em produção → deploy do backend → deploy do site.

## Arquivos provavelmente afetados

Backend:

- `backend/drizzle/0080_licitacoes_assinatura.sql` (novo)
- `backend/src/modules/tenders/db/schema.ts`
- `backend/src/modules/tenders/services/{access,team}.ts`
- `backend/src/modules/tenders/services/billing.ts` e `billing.test.ts` (novos)
- `backend/src/modules/tenders/services/activation.ts` (novo: ativação e `startTenderTrial`)
- `backend/src/modules/tenders/middleware/tenderAccess.ts`
- `backend/src/modules/tenders/routes/{index,overview}.ts`
- `backend/src/modules/tenders/routes/billing.ts` (novo)
- `backend/src/modules/tenders/collector/notifications.ts`
- `*.db.test.ts` do módulo (access, team, notificações e os novos)
- `backend/src/modules/tenders/README.md`
- `backend/src/routes/{auth,accountMembers,plans}.ts`
- `backend/src/services/accountMemberCreation.ts` e `mercadoPagoCharges.ts` (novos)
- `backend/src/server.ts` (webhook público)

Frontend:

- `src/components/payments/*` (novos, extraídos de `PlanosScreen.tsx`)
- `src/screens/planos/PlanosScreen.tsx`
- `src/components/auth/PlanExpiredGate.tsx`
- `src/screens/public/LoginPage.tsx` e `src/services/authService.ts`
- `src/tenders/TendersApp.tsx` e `src/tenders/utils/gateState.ts` (com teste)
- `src/tenders/screens/{GateScreens,SettingsScreen,AdminAccountsScreen}.tsx`
- `src/tenders/components/TeamList.tsx` (vira `UsersPanel`), `AddUserDialog.tsx` e `BillingPanel.tsx` (novos)
- `src/tenders/services/{settingsService,adminAccountsService,queryKeys}.ts`, `billingService.ts` e `activationService.ts` (novos)
- `src/tenders/types.ts` e `src/tenders/utils/billing.ts` (textos e valores, com teste)

## Estratégia de implementação

1. **Branch:** nova, a partir da `main` atualizada (ex.: `feat/R/licitacoes-produto`).
2. **Migration 0080:** criar o arquivo e o schema Drizzle. Aplicar só no banco local, com confirmação.
3. **Regras puras:** `services/billing.ts`, com testes primeiro.
4. **Acesso:**
   - `access.ts` com a função do banco e o motivo `subscriptionExpired`;
   - o middleware responde 402;
   - `GET /access` traz a situação;
   - ajustar os testes de banco do acesso.
5. **Coletor:** trocar a condição nas 3 consultas de aviso e cobrir a conta vencida nos testes de banco.
6. **Ativação e cadastro:**
   - `activation.ts` com `startTenderTrial`;
   - rotas `/activation`;
   - `modulo` no `/register`.
7. **Criação de membro:** extrair `accountMemberCreation.ts` e passar a rota de finanças a usá-lo (os testes existentes continuam passando).
8. **Usuários de Licitações:** `POST /api/tenders/team`, com a contagem e a atualização do valor do recorrente.
9. **Mercado Pago:** extrair `mercadoPagoCharges.ts` e passar `plans.ts` a usá-lo, sem mudar o comportamento.
10. **Cobrança:** `routes/billing.ts` (status, Pix, cartão, checkout, recorrente e cancelar) e o webhook público registrado no `server.ts`.
11. **Admin:** cortesia em `team.ts`, na rota e na lista.
12. **Frontend, pagamento comum:** extrair os painéis de `PlanosScreen` para `src/components/payments/` e conferir a assinatura do FINGERENCE.
13. **Frontend, Licitações:** "Criar conta" no login do módulo, estado 402, telas de vencida e de ativação, Usuários e Assinatura, e admin com cortesia.
14. **Frontend, FINGERENCE:** "Ir para Licitações" no `PlanExpiredGate`.
15. **README do módulo:** acesso (cortesia e assinatura), cobrança e webhook, ativação, cadastro e a tela de admin.
16. **Validações:** os comandos abaixo, mais a conferência manual no banco local com o Mercado Pago de teste.

## Regras de negócio identificadas

1. **Tipos de acesso:** cada conta tem acesso ao módulo por **cortesia** (dada pelo admin, sem cobrança e sem limite de usuários) ou por **assinatura**.
2. **Assinatura:**
   - 15 dias grátis ao se cadastrar por Licitações ou ao ativar;
   - depois, R$ 4,99/mês com 2 usuários (o titular e mais 1);
   - R$ 2,99/mês por usuário a mais.
3. **Quem conta como usuário:** o titular e os membros ativos com acesso ao módulo. Mudar a contagem altera o valor a partir da próxima cobrança, sem cobrar a diferença.
4. **Pagamento:**
   - Pix, cartão avulso e checkout valem 30 dias, contados do maior entre agora, o fim do teste e o pago até;
   - o recorrente renova sozinho e acompanha o número de usuários.
5. **Assinatura vencida:**
   - o titular vê a tela de assinatura; o usuário vê "peça ao titular";
   - a conta não recebe avisos de editais;
   - os dados ficam guardados.
6. **Cancelar o recorrente:** o acesso vai até o fim do período já pago (ou do teste), sem reembolso.
7. **Um teste por conta:** a ativação só funciona em conta sem linha no módulo.
8. **Usuários:**
   - o titular cadastra (nome, e-mail, senha com 8 caracteres ou mais e CPF opcional), remove e devolve o acesso;
   - não há permissões;
   - quem é cadastrado aqui nasce sem nenhuma tela do FINGERENCE liberada.
9. **Admin:** o interruptor é de **cortesia**. Ligado, a conta não paga; desligado, ela segue pela assinatura.
10. **Cadastro por Licitações:** cria o login e a conta como hoje (CPF dá conta pessoal; CNPJ dá conta empresa), com o teste de Licitações e o do FINGERENCE (decisão 4).
11. **Bloqueio do FINGERENCE:** quem tem Licitações e cai no bloqueio de plano vencido do FINGERENCE vê "Ir para Licitações".
12. **Contas habilitadas hoje:** viram cortesia sem nenhuma ação. As desligadas continuam sem acesso.

## Regras multi-tenant e segurança

- **Origem da conta:**
  - titular: sempre uma das contas dele (`contas.usuario_id = token`);
  - membro: sempre a conta do vínculo ativo;
  - o `accountId` vindo do cliente é só uma escolha, conferida no servidor.
- **Ativação e cobrança:** só o titular, e só em conta dele. Membro recebe 403.
- **Webhook:**
  - pagamento e assinatura buscados na API do Mercado Pago pelo id, sem confiar no corpo;
  - referência validada (`lic:<id>`), e a conta precisa ter linha no módulo;
  - idempotente por `ultimo_pagamento_id`;
  - nunca mexe em conta de outro módulo; o webhook do FINGERENCE ignora `lic:`.
- **Respostas:**
  - o 402 só diz o papel (titular ou colaborador), sem dado de outra conta;
  - conta alheia continua com 404, igual à rota inexistente.
- **Valor:** sempre calculado no servidor, nunca vindo do cliente.
- **Sem `catch {}` silencioso.** Logs com conta e usuário, sem dados de cartão.
- **Relatórios e PDFs:** sem impacto.

## Validações necessárias

- **`/register`:** `modulo` ausente ou `licitacoes`; outro valor dá 400.
- **`POST /api/tenders/activation`:** `accountId` inteiro positivo, de conta ativa do titular e sem linha no módulo (senão 404 ou 409).
- **`POST /api/tenders/team`:** as regras de `readNewMemberInput`:
  - nome obrigatório;
  - e-mail válido e livre;
  - senha com 8 caracteres ou mais;
  - CPF opcional; em conta empresa, se vier, CPF válido.
- **`/api/tenders/billing/*`:** `accountId` da conta do titular com linha no módulo; `card_token` obrigatório no cartão e no recorrente.
- **`PUT /api/tenders/admin/accounts/:accountId`:** `courtesy` booleano.
- **Webhook:** referência no formato `lic:<id>`; o resto é ignorado com log.

## Testes necessários

### Frontend

- `src/tenders/utils/gateState.test.ts`: o 402 vira `expired`, e os estados atuais continuam iguais.
- `src/tenders/utils/billing.test.ts`: o valor do mês na tela (1, 2, 3 e 5 usuários) e o texto da situação (cortesia, teste, paga, recorrente e vencida).

### Backend

- **`modules/tenders/services/billing.test.ts`:**
  - `monthlyAmountCents` com 1, 2, 3 e 5 usuários (499, 499, 798 e 1396 centavos);
  - `nextPaidUntil` no teste, no pago e no vencido;
  - `subscriptionSituation`;
  - referência `lic:`, válida e inválida.
- **Banco** (local, `test:tenders-db`):
  - `fn_conta_com_acesso` nos casos cortesia, teste válido, teste vencido, pago válido, pago vencido, recorrente e desligada;
  - a trava responde 402 para a vencida (titular e colaborador) e 404 para conta sem linha ou alheia;
  - os avisos não vão para conta vencida e continuam indo para cortesia e teste;
  - a ativação cria a linha com o teste e responde 409 na segunda vez;
  - `startTenderTrial` no cadastro;
  - `POST /team` cria o membro com acesso, e a contagem fica certa;
  - o admin liga e desliga a cortesia.
- **Testes existentes:** os de membros e de plano continuam passando, depois das duas extrações.

### E2E

Conferência manual no banco local (`.env.dev`), com o Mercado Pago de teste:

- **Entrada:**
  - cadastro pelo login de Licitações, PF e PJ: entra no módulo, em teste de 15 dias;
  - titular do FINGERENCE sem o módulo: "Ativar Licitações", e na segunda vez aparece a assinatura.
- **Usuários e valor:**
  - adicionar o 2º e o 3º usuário: o valor do mês passa de R$ 4,99 para R$ 7,98;
  - remover um usuário: o valor volta.
- **Pagamento:**
  - Pix e cartão avulso: `pago_ate` com 30 dias, sem perder os dias do teste;
  - recorrente: liberado, e o valor muda quando muda o número de usuários;
  - cancelar: o acesso vai até o fim do período pago.
- **Vencimento:** com a data passada, a assinatura vence. O titular vê a tela de assinatura, o usuário vê o aviso e não saem avisos de editais.
- **Cortesia:** as contas que já usavam o módulo continuam funcionando; o admin liga e desliga.
- **FINGERENCE:**
  - pagamento de novo (Pix e recorrente), por causa da extração;
  - "Ir para Licitações" no bloqueio de plano vencido.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db   # só no banco local
npx tsc --noEmit
npm test
npm run build
```

## Riscos e pontos de atenção

- **Valor do recorrente:** é preciso confirmar no ambiente de teste se o Mercado Pago aceita mudar o valor de uma assinatura que já existe. Se não aceitar, a assinatura é cancelada e recriada com o valor novo, e o titular é avisado na tela.
- **Pagamento do FINGERENCE:** a extração do código do Mercado Pago mexe no pagamento que está no ar desde 06/10/2026. Ele entra na mesma conferência manual.
- **Criação de membro:** a extração mexe na rota de finanças (`POST /api/account-members`). Os testes e a conferência manual de criar membro no FINGERENCE precisam continuar iguais.
- **Uma conta por pessoa:** `conta_membros.usuario_id` é único, então um usuário de Licitações não pode ser membro de outra conta.
- **Webhook repetido:** o Mercado Pago pode avisar o mesmo pagamento mais de uma vez. Sem `ultimo_pagamento_id`, o período seria somado em dobro.
- **Avisos:** a conta vencida deixa de receber avisos e, ao pagar, volta sem os avisos do período vencido.
- **Ordem da publicação:** a migration vai antes do deploy. Sem as colunas, o backend novo falha nas consultas do módulo.
- **Produção:** migration só com confirmação; sem mexer no `.env`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

A regra 6 (cancelar mantém o acesso até o fim do período pago) é diferente do FINGERENCE, em que o acesso termina na hora. Ficou registrada como decisão deste plano.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- O cadastro pelo login de Licitações criar a conta com 15 dias de teste e entrar direto no módulo.
- O titular do FINGERENCE conseguir ativar Licitações uma vez, com 15 dias grátis.
- Usuários: o titular e mais 1 estarem incluídos; do 3º em diante, cada um somar R$ 2,99 ao valor do mês; não haver permissões; e o usuário criado aqui não ver telas do FINGERENCE.
- Pix, cartão, checkout e recorrente liberarem o acesso; o recorrente acompanhar o número de usuários; e cancelar manter o acesso até o fim do período pago.
- A assinatura vencida responder 402, mostrar a tela de assinatura ao titular e o aviso ao usuário, e não gerar avisos de editais.
- As contas habilitadas hoje seguirem como cortesia, sem mudança para quem usa, e o admin conseguir ligar e desligar a cortesia.
- O pagamento do FINGERENCE e a criação de membro continuarem funcionando como antes.
- O README do módulo estar atualizado.
- Build e testes passarem nos comandos acima.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Criar uma branch nova a partir da `main` atualizada. A branch da parte 1 já foi para a `main`.
- Migration 0080:
  - criar o arquivo no padrão do repositório;
  - aplicar **só no banco local**, com confirmação;
  - em produção, só com confirmação explícita (`--confirmo`), antes do deploy.
- Não alterar `.env`. As credenciais de teste do Mercado Pago são do usuário; nunca imprimir chaves.
- Seguir o `/AGENT.md`:
  - identificadores em inglês e textos em português;
  - Drizzle nas queries novas (SQL só na migration e nas consultas do coletor, que já são SQL);
  - sem `any`;
  - sem `catch {}` silencioso.
- Extrações sem mudança de comportamento: o pagamento do FINGERENCE (`plans.ts`) e a criação de membro (`accountMembers.ts`).
- Os helpers de teste (`apiTestSupport.ts`, `dbTestSupport.ts`) gravam `conta_habilitada` ativa. Com o padrão `cortesia`, os testes atuais continuam válidos.
- Usar "Licitações" como nome do produto. O nome definitivo é da parte 4.
- `.portal/` e `GLOSSARIO.md` nunca entram em commit.

## Ajustes feitos na implementação (06/10/2026)

- **Cancelar o recorrente em cortesia:** `POST /billing/cancel` vale também na conta com cortesia, porque a cortesia dada depois não cancela a cobrança no Mercado Pago. Os pagamentos seguem dando 409 em cortesia, e a tela de Assinatura mostra o "Cancelar" quando há recorrente.
- **Admin:** dar cortesia a uma conta com recorrente avisa que a cobrança no cartão continua até o titular cancelar. Tirar a cortesia pede confirmação, porque sem teste nem período pago a conta fica vencida.
- **Valor do recorrente que não muda:** a resposta traz um aviso pedindo para cancelar e assinar de novo. O sistema não recria a assinatura sozinho.
- **Pendente, avisos do recorrente:** o Mercado Pago pode mandar os avisos de assinatura (cobrança mensal, recusa, cancelamento) para a URL do painel dele, que é a do FINGERENCE, e não para a `notification_url` da requisição. Conferir no sandbox. Se for o caso, a rota do webhook do FINGERENCE precisa repassar os avisos `lic:` para Licitações.
- **Pendente:** testes de banco (`test:tenders-db`, depois da 0080 no banco local) e conferência manual no sandbox do Mercado Pago.
