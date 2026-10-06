# Plano de Implementação: Planos Starter e Premium (parte 1)

## Origem

- Arquivo de especificação: `.plans/proposta-empresa-produtos-site.md` (seção 5), com as decisões tomadas depois na conversa de 06/10/2026
- Data do planejamento: `2026-10-06`
- Classificação: `fullstack` (frontend + backend, sem migration)

Decisões do planejamento:

1. Este plano cobre só a parte 1 da proposta (planos do FINGERENCE). Licitações como produto, site novo e marca/domínio são as partes 2 a 4, com planos próprios.
2. Starter: uma conta (pessoal ou empresa), só o titular, todo o financeiro. Premium: várias contas, equipe e a parte comercial (regras abaixo).
3. Ninguém paga o Plus usando recurso do Premium hoje, e ninguém está no plano anual: não há regra de transição, e o reembolso do anual sai.

## Resumo

O plano Plus vira **Starter** (R$ 4,99/mês) e o **Premium** (R$ 9,99/mês) passa a vender de verdade (hoje o backend recusa o tipo `premium`). Os dois são só mensais. Os recursos do Premium passam a ser travados no backend, com aviso no app.

Entram junto três correções:
- o Premium recusado ao assinar;
- o cancelamento que dá 404 (o app chama `/planos/cancelar`, a rota é `/cancel`);
- o webhook que decide o plano pelo valor e só pelo id do usuário.

## Escopo

### Dentro do escopo

- Tipos de plano `starter` e `premium`, com leitura dos valores antigos (`mensal` = Starter; `anual` = Premium até vencer).
- Rotas de pagamento (Pix, cartão avulso, checkout e recorrente) com os dois planos e sem o anual.
- Referência de pagamento por módulo (`fin:<usuário>:<plano>`), aceitando a referência antiga.
- Trava do Premium no backend e o aviso "Disponível no Premium" no app.
- Starter restrito à Conta Padrão; membro de titular no Starter bloqueado.
- Loja pública indisponível para quem não tem Premium.
- Tela de assinatura, cancelamento sem reembolso e status com o nível do plano.
- Troca de "Plus" por "Starter" no site atual (página de planos, SEO e gerador de páginas).
- Testes unitários das regras novas.

### Fora do escopo

- Licitações como produto, site novo, marca e domínio (partes 2 a 4 da proposta).
- Migration ou remoção de colunas antigas (`payment_id_anual`, `plano_inicio`).
- Textos e templates de e-mail (EmailJS).
- Redesenho das páginas públicas (só a troca de nome e da tabela de planos).
- Validação de assinatura (`x-signature`) do webhook do Mercado Pago.

## Leitura de contexto

- `/AGENT.md` (raiz)
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md` (fluxo obrigatório e regras de `.env` e migrations)
- `.plans/proposta-empresa-produtos-site.md`
- Código lido:
  - `backend/src/routes/plans.ts`, `backend/src/services/plan-access.ts`, `backend/src/services/plan-lifecycle.ts`
  - `backend/src/middleware/auth.ts`, `backend/src/middleware/permissions.ts`, `backend/src/server.ts`
  - `backend/src/routes/auth.ts` (cadastro: CPF cria conta pessoal; CNPJ cria só conta empresa, padrão)
  - `backend/src/routes/accounts.ts`, `backend/src/routes/accountMembers.ts`, `backend/src/db/schema/{users,accounts,accountMembers,memberPermissions}.ts`
  - `backend/src/modules/catalogo/routes/*` (rotas autenticadas sem `requireActivePlan`; `/public` sem login)
  - `src/App.tsx`, `src/screens/planos/PlanosScreen.tsx`, `src/components/auth/PlanExpiredGate.tsx`, `src/utils/screenAccess.ts`
  - `src/screens/finance/income-dialog/IncomeDialog.tsx`, `src/components/financial-assistant/FinancialAssistant.tsx`, `src/screens/finance/painel/ExtrasContaEmpresa.tsx`
  - `src/screens/public/{PlanosPage.tsx,components/PublicSeo.tsx}`, `scripts/generate-public-route-html.mjs`
  - `src/tenders/hooks/useFinanceAccess.ts` (só lê `status`; não muda)

Contexto multi-tenant: o `AGENT.md` fala em "prefeitura"; aqui o isolamento é por **conta/titular**. O dono do plano vem do token (`resolvePlanHolder`), nunca do cliente.

## Impacto por área

### Frontend

- **Assinatura** (`PlanosScreen.tsx`):
  - `PLANO_DEF` passa a ter `starter` (R$ 4,99) e `premium` (R$ 9,99), com a lista de recursos das regras 3 e 4;
  - `PlanTipo` passa a ser `'starter' | 'premium'`;
  - o nome do plano atual vem de `plano_nivel`.
- **Cancelamento:** chama `POST /planos/cancel`; sai a busca de prévia e o texto de reembolso.
- **Status do plano:** `PlanoStatus` (em `PlanExpiredGate.tsx` e onde for usado) ganha `plano_nivel` e `recursos_premium`.
- **Hook novo `usePlanFeatures`:**
  - usa a mesma query de `queryKeys.planStatus` e devolve `{ premium, tier }`;
  - na demonstração (`demo.html`), considera Premium, para a demo seguir mostrando tudo;
  - a regra pura fica em `src/utils/planFeatures.ts`, com teste.
- **Componente novo `PremiumUpsell`:** aviso "Disponível no Premium" com o botão que abre Configurações → Assinatura.
- **Telas com trava** (mostram o `PremiumUpsell` no Starter):
  - Clientes (`ClientsScreen.tsx`);
  - em Configurações: Produtos e estoque, Pedidos, Setores, Cargos e Permissões;
  - onde se cria ou reativa membro e colaborador.
- **Contas:**
  - o botão de nova conta fica travado no Starter;
  - as outras contas aparecem com cadeado;
  - a conta ativa é sempre a Conta Padrão: o hook da conta ativa força a padrão quando não há Premium.
- **Sem buscar o que é do Premium no Starter** (`enabled` da query):
  - produtos, clientes e contratos no modal de receita e no assistente;
  - contratos nos extras da conta empresa do painel;
  - a etapa de clientes do checklist de primeiro acesso (`useOnboardingChecklist`).
- **Nome do plano em outras telas:** conferir onde `plano_tipo` aparece (ex.: `src/services/usuariosService.ts`) e mostrar Starter ou Premium.
- **Site atual:**
  - `PlanosPage.tsx`: Starter e Premium, tabela comparativa pelas regras 3 e 4 e perguntas sem "Plus";
  - `PublicSeo.tsx` e `scripts/generate-public-route-html.mjs`: título e descrição de `/planos/`.
- **Estados:** o aviso do Premium substitui o erro genérico nas telas com trava. As demais telas seguem os estados atuais.

### Backend

- **`services/plan-access.ts`:**
  - `PLAN_TIER` e `planTier(planType)`: `premium` e `anual` dão Premium; o resto (`starter`, `mensal`, nulo) dá Starter;
  - `hasPremiumFeatures({ userType, status, planType })`: verdadeiro para admin, teste e Premium ativo.
- **`services/planPayments.ts` (novo):**
  - `PLAN_OFFERS`: `starter` R$ 4,99 "Starter"; `premium` R$ 9,99 "Premium";
  - `parsePlanChoice(tipo)`: aceita `starter`, `premium` e `mensal` (apelido de Starter, para o app antigo aberto no navegador durante a publicação); o resto dá nulo;
  - `buildPaymentReference(userId, plan)`: `fin:<id>:<plano>`;
  - `parsePaymentReference(ref)`: aceita `fin:<id>:<plano>` e a antiga, só dígitos (lida como Starter). Formato inválido dá nulo.
- **`services/plan-lifecycle.ts`:** o status passa a trazer `planTier`, `premiumFeatures` e `holderId`.
- **`routes/plans.ts`:**
  - **status:** `/status` devolve `plano_nivel` e `recursos_premium`;
  - **pagamento** (`/subscribe`, `/pix`, `/pay-card`, `/subscribe-recurring`, `/activate`):
    - usam `parsePlanChoice` e `PLAN_OFFERS`;
    - descrição `FINGERENCE - Plano <nome>`;
    - `external_reference` com a referência nova;
    - uma parcela;
    - pagamento avulso vale 30 dias;
    - gravam `plano_tipo` = `starter` ou `premium` e `payment_id_anual` = nulo;
  - **cancelamento:** sai `/cancel/preview`; `/cancel` perde o reembolso e mantém o cancelamento da assinatura recorrente no Mercado Pago e a expiração na hora;
  - **`/webhook`:** o plano vem da referência, não do valor. Os três tipos de evento (pagamento, assinatura e cobrança da assinatura) usam `parsePaymentReference` para achar usuário e plano;
  - saem `planAmount`, `planLabel` e as constantes do anual.
- **`middleware/auth.ts`:**
  - `requireActivePlan`, além de exigir plano ativo, quando não há Premium:
    - bloqueia membro ou colaborador (403 `PLAN_UPGRADE_REQUIRED`, "O plano da conta não inclui equipe. Peça ao titular para assinar o Premium.");
    - bloqueia `conta_id` (query ou corpo) diferente da Conta Padrão do dono do plano (403 `PLAN_UPGRADE_REQUIRED`, "No plano Starter, só a Conta Padrão fica liberada.");
  - `requirePremiumPlan` (novo): 403 `PLAN_UPGRADE_REQUIRED`, "Recurso do plano Premium.".
- **Onde a trava entra:**
  - `server.ts`: `requirePremiumPlan` depois de `requireActivePlan` em `/api/clients`, `/api/contracts`, `/api/service-catalog`, `/api/sectors` e `/api/job-titles`;
  - catálogo (`modules/catalogo/routes`): `requireActivePlan` + `requirePremiumPlan` nas rotas autenticadas de `produtos`, `storefront`, `pedidos` e `mercado-pago` (`/status`, `/connect`, `DELETE /`). O `/mercado-pago/callback` fica sem trava (retorno do OAuth);
  - `routes/accounts.ts`: `POST /` e `PUT /:id/reactivate` exigem Premium;
  - `routes/accountMembers.ts`: `POST /` e a reativação de membro em `PUT /:id` exigem Premium;
  - `modules/catalogo/routes/public.ts`: `GET /:storefront` e `POST /:storefront/pedidos` dão 404 "Loja indisponível" quando o dono da loja não tem Premium. Ficam como estão `GET /:storefront/pedidos/:pedidoId`, as imagens e o `/mercado-pago/webhook`.
- **Relatórios e PDFs:** sem impacto.

### Banco de dados

Sem impacto esperado no schema. Nenhuma migration.

- `usuarios.plano_tipo` (varchar 10) passa a receber `starter` e `premium`. Os valores antigos continuam válidos pela leitura de `planTier`.
- `payment_id_anual` e `plano_inicio` ficam como estão.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Nenhuma variável de ambiente nova. Valores e nomes dos planos ficam no código (`PLAN_OFFERS`).
- **Teste local:**
  - `.env.dev`, com as credenciais de teste do Mercado Pago (cuidadas pelo usuário; nunca imprimir chave);
  - não alterar `.env`.
- **Publicação:** backend e site são publicados separadamente no Render. O apelido `mensal` evita erro no app antigo aberto no navegador durante a janela.
- Rotina diária (`daily-jobs`): sem mudança. O plano continua expirando por `plano_status` e `plano_expiracao`.

## Arquivos provavelmente afetados

Backend:

- `backend/src/services/plan-access.ts` e `plan-access.test.ts`
- `backend/src/services/planPayments.ts` e `planPayments.test.ts` (novos)
- `backend/src/services/plan-lifecycle.ts`
- `backend/src/routes/plans.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/server.ts`
- `backend/src/routes/accounts.ts`
- `backend/src/routes/accountMembers.ts`
- `backend/src/modules/catalogo/routes/{produtos,storefront,orders,mercadoPago,public}.ts`
- `backend/src/services/storefront.ts` (achar o dono da loja pelo endereço, se ainda não houver função)

Frontend:

- `src/screens/planos/PlanosScreen.tsx`
- `src/components/auth/PlanExpiredGate.tsx`
- `src/App.tsx` (tipo do status)
- `src/utils/planFeatures.ts` e `planFeatures.test.ts` (novos)
- `src/hooks/usePlanFeatures.ts` (novo)
- `src/components/PremiumUpsell.tsx` (novo)
- `src/screens/clients/ClientsScreen.tsx`
- `src/screens/config/` (Contas, Produtos e estoque, Pedidos, Setores, Cargos, Permissões e criação de membro)
- hook da conta ativa (`useActiveAccount`)
- `src/screens/finance/income-dialog/IncomeDialog.tsx`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/screens/finance/painel/ExtrasContaEmpresa.tsx`
- `src/hooks/useOnboardingChecklist.ts`
- `src/services/usuariosService.ts` (se mostrar o tipo do plano)
- `src/screens/public/PlanosPage.tsx`
- `src/screens/public/components/PublicSeo.tsx`
- `scripts/generate-public-route-html.mjs`

## Estratégia de implementação

1. **Regras puras (backend):** `planTier` e `hasPremiumFeatures` em `plan-access.ts`; `planPayments.ts` com ofertas e referência. Testes dessas funções primeiro.
2. **Status:** `plan-lifecycle.ts` devolve `planTier`, `premiumFeatures` e `holderId`; `/status` devolve `plano_nivel` e `recursos_premium`.
3. **Rotas de pagamento e webhook** em `plans.ts`: tipos novos, ofertas, referência nova e remoção do anual e do reembolso.
4. **Middlewares:** `requirePremiumPlan` e a extensão de `requireActivePlan` (membro e Conta Padrão).
5. **Aplicar a trava:** em `server.ts`, no catálogo, em contas, em membros e na loja pública.
6. **Frontend, base:** `planFeatures.ts` (com teste), `usePlanFeatures` e `PremiumUpsell`.
7. **Frontend, assinatura:** `PlanosScreen` e `PlanExpiredGate` (Starter e Premium, nível do plano e cancelamento).
8. **Frontend, travas:** telas com aviso, conta ativa fixa na padrão, `enabled` das buscas de produtos, clientes e contratos.
9. **Site atual:** `PlanosPage`, SEO e gerador de páginas sem "Plus".
10. **Validação:** comandos abaixo e conferência manual no banco local com o Mercado Pago de teste.

## Regras de negócio identificadas

1. **Pagamento:**
   - Starter custa R$ 4,99/mês e Premium, R$ 9,99/mês;
   - só mensal;
   - Pix e cartão avulso dão 30 dias; o cartão recorrente renova sozinho.
2. **Teste grátis:** 15 dias com tudo do Premium (como hoje).
3. **Starter:** só a Conta Padrão (a do cadastro: pessoal com CPF, empresa com CNPJ) e só o titular. Inclui lançamentos (com lote), cartões, painel, planejamento, relatórios, agenda, avisos, assistente Juca, categorias, representantes e sócios.
4. **Premium:** tudo do Starter, mais outras contas, membros e colaboradores (com setores e cargos), clientes, contratos e catálogo de serviços, e produtos, estoque, vitrine e pedidos.
5. **Recurso do Premium usado no Starter:** o backend responde 403 `PLAN_UPGRADE_REQUIRED` e o app mostra "Disponível no Premium". Nada é apagado: o que foi criado no teste fica guardado e travado.
6. **Equipe sem Premium:** membro ou colaborador de titular sem Premium não entra no app.
7. **Loja pública de quem não tem Premium** (Starter ou plano vencido): fica indisponível. Pedidos já feitos seguem consultáveis e o webhook segue funcionando.
8. **Cancelamento:** o acesso termina na hora e não há reembolso.
9. **Troca de plano:** assinar outro plano substitui o anterior. O recorrente anterior é cancelado no Mercado Pago, como hoje.
10. **Admin da plataforma:** continua com tudo.
11. **Representantes:** ficam nos dois planos, porque fazem parte do modal de receita (comissão).

## Regras multi-tenant e segurança

- **Dono do plano:** sempre de `resolvePlanHolder` a partir do token. O nível do plano nunca vem do cliente.
- **`conta_id` vindo do cliente:** comparado com a Conta Padrão do dono do plano. O pedido fora dela é recusado sem revelar dado de outra conta.
- **Loja pública:** o dono vem do endereço (`slug`) no banco, e o 404 não diz o motivo.
- **Webhook:**
  - a referência só vale nos formatos `fin:<id>:<starter|premium>` ou só dígitos;
  - o pagamento continua sendo buscado na API do Mercado Pago pelo id, sem confiar no corpo recebido;
  - referência inválida é ignorada, com log de contexto (sem dados sensíveis).
- **Rotas de pagamento:** seguem com `requireNotAccountMember`, porque só o titular assina e cancela.
- **Mensagens de erro:** em português, sem dado de outra conta. Nada de `catch {}` silencioso.

## Validações necessárias

- `tipo` em `/subscribe`, `/pix`, `/pay-card`, `/subscribe-recurring` e `/activate`: `starter`, `premium` ou `mensal` (apelido). O resto dá 400 "Invalid plan type".
- `card_token` obrigatório no cartão avulso e no recorrente (como hoje).
- `conta_id` (query ou corpo): numérico. Comparado com a Conta Padrão só quando não há Premium.
- `external_reference` no webhook: o formato validado por `parsePaymentReference`.
- `dias` em `/activate` (admin): inteiro positivo, se informado.

## Testes necessários

### Frontend

- `src/utils/planFeatures.test.ts`:
  - Premium liberado em teste, Premium ativo e admin;
  - Premium bloqueado em Starter ativo e em plano vencido;
  - leitura de `plano_nivel` ausente (resposta antiga).

### Backend

- `plan-access.test.ts`:
  - `planTier` de `mensal`, `starter`, `anual`, `premium` e nulo;
  - `hasPremiumFeatures` para admin, teste, Starter ativo, Premium ativo e vencido.
- `planPayments.test.ts`:
  - ofertas (valores e nomes);
  - `parsePlanChoice` com `starter`, `premium`, `mensal`, `anual` e lixo;
  - `buildPaymentReference` e `parsePaymentReference` com formato novo, antigo (só dígitos) e inválido.

### E2E

Conferência manual no banco local (`.env.dev`), com o Mercado Pago de teste:

- **Pagamento:**
  - assinar Starter e Premium por Pix, cartão avulso, checkout e recorrente; o webhook ativa o plano certo;
  - cancelar a assinatura sem 404.
- **No Starter:**
  - segunda conta, novo membro, Clientes, Produtos, Pedidos, Setores, Cargos e Permissões mostram o aviso, e a API responde 403 `PLAN_UPGRADE_REQUIRED`;
  - o financeiro funciona completo na Conta Padrão, inclusive numa conta empresa criada pelo cadastro com CNPJ;
  - o modal de receita e o assistente abrem sem erro.
- **Equipe e loja:**
  - membro de titular no Starter fica bloqueado, com a mensagem;
  - a loja pública de titular no Starter fica indisponível, e um pedido antigo segue consultável.
- **Sem bloqueio:** no teste grátis e para o admin, tudo liberado.
- **Site:** a página de planos sem "Plus".

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
npx tsc --noEmit
npm test
npm run build
```

## Riscos e pontos de atenção

- **Webhook:** precisa seguir aceitando a referência antiga (só dígitos), porque as assinaturas recorrentes já criadas continuam chegando assim.
- **Teste grátis em andamento:** quem está no teste hoje e escolher o Starter ao fim dele perde o acesso ao que criou de Premium. Os dados ficam guardados.
- **Loja pública:** passa a sair do ar também para plano vencido, o que muda o comportamento atual.
- **Conta ativa:** o app precisa fixar a Conta Padrão no Starter. Senão, uma conta ativa antiga no navegador faz todos os pedidos darem 403.
- **Buscas no Starter:** produtos, clientes e contratos no modal de receita, no assistente e no painel precisam ficar desligadas. Senão, aparecem erros onde hoje não aparecem.
- **Pagamento em produção:** testar só no ambiente de teste do Mercado Pago; nunca imprimir chaves.
- **Desempenho:** a checagem de `conta_id` faz uma consulta a mais por pedido, só quando o plano não é Premium.
- **Branch:** uma branch por vez. Antes de começar, confirmar que a branch atual (`feat/R/licitacoes-tela-busca-numero`) já foi finalizada.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

Premissa registrada na decisão 3: não há assinante no plano anual. Se aparecer algum, ele é lido como Premium até vencer, sem reembolso automático.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Starter e Premium puderem ser assinados por Pix, cartão avulso, checkout e recorrente, com o plano certo ativado pelo webhook.
- O cancelamento funcionar sem 404 e sem cálculo de reembolso.
- No Starter, todos os recursos da regra 4 responderem 403 `PLAN_UPGRADE_REQUIRED` na API e mostrarem "Disponível no Premium" no app.
- O financeiro funcionar completo na Conta Padrão no Starter, pessoal ou empresa.
- O teste grátis e o admin continuarem com tudo.
- Membro de titular sem Premium ficar bloqueado com a mensagem certa.
- A loja pública de quem não tem Premium ficar indisponível, sem quebrar pedidos já feitos.
- Não sobrar "Plus" no app nem no site.
- Build e testes passarem nos comandos acima.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (nenhuma prevista) nem alterar `.env`.
- Seguir o `/AGENT.md`: identificadores em inglês, textos ao usuário em português, Drizzle nas queries novas, sem `any` e sem `catch {}` silencioso.
- Manter o escopo: não redesenhar o site (parte 3) nem mexer em Licitações (parte 2).
- Lógica pura em `services/` e `src/utils/`, para entrar nos scripts de teste existentes (`npm --prefix backend test` e `npm test`).
- `.portal/` e `GLOSSARIO.md` nunca entram em commit.
