# Plano de Implementação: Backfill de Perfil para contas legadas + filtro de período do Painel

## Origem

- Arquivo de especificação: descrição textual do usuário (bugs reportados ao vivo, sem `.md` de feature), com investigação de código feita via agentes Explore
- Data do planejamento: 2026-09-02
- Classificação: `frontend + backend + database`

## Resumo

O usuário reportou 3 problemas na tela de Planejamento/Painel:

1. Tela de Planejamento quebrada com erro "Perfil financeiro não encontrado"
2. Card de categorias que "não aparece" no Painel
3. Filtro de período do Painel (dropdown mês/ano "De"/"Até") que deveria ser 2 campos de texto `dd/mm/aaaa` preenchidos manualmente

Investigação (2 rodadas de agentes Explore, sem edição de código) revelou:

**Causa raiz de (1) e (2), unificada**: no modelo de dados atual, todo usuário deveria sempre ter pelo menos um Perfil real na tabela `perfis` — o cadastro novo (`POST /api/auth/register`) já cria isso automaticamente numa transação atômica (`backend/src/routes/auth.ts:173-208`), criando um Perfil `pessoal` (CPF) ou `empresa` (CNPJ) junto com o usuário. A "Conta principal" não é uma entidade financeira separada da tabela `perfis` — é, conceitualmente, o primeiro Perfil do usuário, no mesmo modelo de "múltiplas contas vinculadas independentes" citado pelo usuário (ex.: Nubank).

O problema é que **contas criadas antes dessa lógica existir** (como a conta do usuário atual, Rodrigo) nunca ganharam essa linha em `perfis` retroativamente. Existe uma rota de backfill parcial, `POST /api/profiles/migrate-orphans` (`backend/src/routes/profiles.ts:239-...`), mas ela:
- Nunca é chamada por nenhuma tela do frontend (código morto do ponto de vista de uso real)
- Não *cria* um Perfil do zero — exige que já exista um Perfil `pessoal` (retorna 404 "Personal profile not found" se não houver), só reatribui despesas/receitas/meses/reservas órfãs (`perfil_id IS NULL`) para um Perfil Pessoal pré-existente

Como consequência, `resolveFinancialProfile` (`backend/src/services/budgetService.ts:107-119`), usado pelo Orçamento/Planejamento, lança `BudgetInputError('Perfil financeiro não encontrado.')` quando o usuário não tem nenhum Perfil `pessoal` — o que quebra tanto a tela de Planejamento quanto o card `MonthCategoriesOverview` do Painel (que consome o mesmo endpoint `/orcamento/resumo` via `useBudgetOverviewRange`, e retorna `null` silenciosamente quando a query falha — por isso o usuário via isso como "gráfico que não aparece", não como um erro visível).

Importante: diferente de despesas/receitas/panorama (onde `perfil_id` é uma coluna **nullable**, e `NULL` já significa "sem perfil específico" sem exigir nenhuma linha em `perfis`), a tabela `orcamento_metas` tem `perfil_id INTEGER NOT NULL REFERENCES perfis(id)` (`backend/src/db/schema/copilot.ts:71`) — não há hoje like nenhuma forma de uma meta de orçamento existir sem um Perfil real por trás. Por isso a correção não é "fazer o Orçamento tratar ausência de perfil", e sim "garantir que todo usuário sempre tenha um Perfil real", via backfill automático — consistente com aگ diretriz do usuário de que a Conta principal não deve ser tratada como um caso especial.

**Causa de (3)**: independente das anteriores. `DashboardPeriodFilter.tsx` é usado exclusivamente no Painel (`FinanceDashboard.tsx:174`), não é compartilhado com Relatórios/Movimentações/outras telas — trocar sua UI interna não tem efeito colateral em nenhuma outra tela. O projeto não tem hoje nenhum campo de texto livre com máscara automática `dd/mm/aaaa` (o padrão mais próximo, em Relatórios, usa `<input type="date">` nativo do browser, que o usuário não pediu).

## Escopo

### Dentro do escopo

- Nova função de backend que, para um usuário sem nenhum Perfil ativo: cria um Perfil `pessoal` padrão (nome "Pessoal", mesmo padrão do `/register`) e migra despesas/receitas/meses/reservas órfãs (`perfil_id IS NULL`) para esse Perfil, tudo dentro de uma transação
- Chamar essa função a partir de `GET /api/auth/verify` (ponto único por onde toda sessão autenticada passa ao carregar o app), de forma idempotente e barata quando o usuário já tem Perfil (nenhuma escrita extra nesse caso)
- Refatorar `POST /api/profiles/migrate-orphans` para reusar a mesma função de backfill internamente (sem quebrar seu contrato HTTP atual), evitando duas implementações divergentes da mesma lógica
- Reescrever `DashboardPeriodFilter.tsx`: 2 campos de texto com máscara automática `dd/mm/aaaa` (usuário digita só números, barras inseridas automaticamente), validação de data real (rejeita dia/mês inválidos) antes de habilitar "Aplicar", mantendo o mesmo contrato de saída (`DashboardPeriod`/`onChange`) já consumido por `FinanceDashboard.tsx`

### Fora do escopo

- Qualquer mudança em `resolveFinancialProfile`/`budgetService.ts` — não deve ser necessária após o backfill
- Qualquer mudança na tabela `orcamento_metas` ou sua constraint `NOT NULL` em `perfil_id`
- Qualquer mudança em `buildOwnerAndProfileWhere`/`profileFilter.ts` (helpers de despesas/receitas), que já funcionam corretamente
- Adicionar um gráfico dedicado de categorias que nunca existiu — o "gráfico sumido" era o card `MonthCategoriesOverview`, que volta a funcionar com o backfill, sem trabalho de UI adicional
- Qualquer mudança na feature de foto por perfil ou no bug de telefone/data de nascimento da Conta (plano `.plans/conta-telefone-data-nascimento.md`, em andamento separado)
- Estender o filtro `dd/mm/aaaa` para outras telas (Relatórios, Movimentações) — escopo restrito ao Painel, único consumidor de `DashboardPeriodFilter`

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto; não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- `backend/src/services/budgetService.ts` (`resolveFinancialProfile`, `expenseProfileCondition`)
- `backend/src/routes/budget.ts` (`GET /resumo`)
- `backend/src/routes/auth.ts` (`/register` linhas 173-208, `/login` linhas 55-128, `/verify` linhas 246-286)
- `backend/src/routes/profiles.ts` (`POST /migrate-orphans`, linhas 209-250)
- `backend/src/db/schema/copilot.ts` (`orcamento_metas.perfil_id`, `NOT NULL`)
- `backend/src/utils/ownerAndProfileWhere.ts`, `backend/src/utils/profileFilter.ts` (padrão de referência de como perfil nulo já é tratado em despesas/receitas)
- `backend/src/routes/financial.ts` (`/panorama`, padrão de referência de perfil nulo = sem filtro)
- `src/hooks/useActiveProfile.ts` (`CONTA_PRINCIPAL_ID`, `selectConta`)
- `src/services/apiClient.ts` (`getActiveProfileId`)
- `src/screens/finance/FinanceDashboard.tsx`, `src/screens/finance/DashboardPeriodFilter.tsx`
- `src/screens/relatorios/RelatoriosScreen.tsx` (padrão de referência de 2 inputs de data, ainda que com `type="date"`)
- `src/screens/finance/MonthCategoriesOverview.tsx` (consumidor de `useBudgetOverviewRange`, retorna `null` silenciosamente em erro)
- Investigação feita via 2 agentes Explore (somente leitura) para mapear o padrão de perfil nulo e o fluxo de cadastro

## Impacto por área

### Frontend

- `src/screens/finance/DashboardPeriodFilter.tsx`: reescrita completa da UI interna (2 inputs de texto com máscara `dd/mm/aaaa` em vez de 4 `<select>`), mantendo a mesma interface `DashboardPeriod { mes, ano, ateMes, ateAno }` e prop `onChange` — `FinanceDashboard.tsx` não precisa mudar
- Validação client-side: rejeitar datas com dia/mês fora de faixa (ex: 31/02), input incompleto não deve permitir "Aplicar"
- Nenhuma mudança em query keys, React Query, ou outros componentes — `MonthCategoriesOverview.tsx` volta a funcionar automaticamente assim que o backend deixar de retornar erro

### Backend

- Nova função (ex.: `backend/src/services/profileBackfill.ts`, exportando `ensureUserHasProfile(userId, transaction?)`):
  - Verifica se existe algum Perfil ativo do usuário (`SELECT` barato)
  - Se não existir: dentro de uma transação, cria Perfil `pessoal` "Pessoal" (mesmo padrão de `auth.ts:204`) e reatribui despesas/receitas/meses/reservas com `perfil_id IS NULL` para esse novo Perfil (mesma lógica de `profiles.ts:239-...`)
  - Idempotente: chamadas subsequentes são no-op (usuário já tem Perfil)
- `GET /api/auth/verify`: chamar `ensureUserHasProfile(req.user!.id)` antes de montar a resposta — ponto único de entrada de toda sessão autenticada ativa
- `POST /api/profiles/migrate-orphans`: refatorar para delegar à mesma função (sem mudar request/response da rota)
- Sem mudança em autenticação/autorização — tudo já opera sobre `req.user!.id`
- Sem impacto em relatórios/PDFs

### Banco de dados

- Nenhuma migration de schema necessária — `perfis`, `despesas`, `receitas`, `meses`, `reservas` já têm as colunas certas (`perfil_id` nullable nas últimas 4)
- Escrita de dados em produção: criação de linha em `perfis` + `UPDATE` de `perfil_id` em até 4 tabelas para o usuário atual (e, no futuro, qualquer conta legada sem Perfil) — não é uma migration de arquivo `.sql`, é lógica de aplicação rodando sob demanda
- Risco caracterizado como escrita de dados (não schema), mas sensível por rodar contra produção — testar primeiro manualmente com a conta do usuário antes de considerar concluído

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `backend/src/services/profileBackfill.ts` (novo)
- `backend/src/routes/auth.ts`
- `backend/src/routes/profiles.ts`
- `src/screens/finance/DashboardPeriodFilter.tsx`

## Estratégia de implementação

1. Criar `backend/src/services/profileBackfill.ts` com `ensureUserHasProfile(userId)`, reaproveitando os padrões já existentes em `auth.ts` (criação de Perfil) e `profiles.ts` (migração de órfãos)
2. Integrar a chamada em `GET /api/auth/verify` (`backend/src/routes/auth.ts`)
3. Refatorar `POST /api/profiles/migrate-orphans` para usar a nova função internamente
4. Rodar `cd backend && npm run build`
5. Reescrever `src/screens/finance/DashboardPeriodFilter.tsx` com os 2 campos de texto mascarados
6. Rodar `npx tsc --noEmit -p .` e `npx vite build`
7. Testar manualmente: logar com a conta atual (sem Perfil), confirmar que `/auth/verify` cria o Perfil Pessoal automaticamente, e que a tela de Planejamento e o card de Categorias no Painel passam a funcionar
8. Testar o novo filtro de período do Painel manualmente (digitação, máscara, validação, aplicar)

## Regras de negócio identificadas

- Todo usuário deve ter ao menos um Perfil ativo — invariante que o cadastro novo já garante; o backfill estende essa garantia para contas legadas
- A Conta principal não é uma entidade financeira distinta de Perfil — é semanticamente o primeiro Perfil do usuário
- Dados órfãos (`perfil_id IS NULL`) pertencem ao Perfil Pessoal do usuário, por convenção já estabelecida em `ownerAndProfileWhere.ts`

## Regras multi-tenant e segurança

- Não há dimensão multi-tenant/prefeitura neste projeto
- `ensureUserHasProfile` opera exclusivamente sobre `req.user!.id` do token autenticado — nenhum novo vetor de acesso a dados de outro usuário
- A escrita (criação de Perfil + reatribuição de dados) deve ocorrer dentro de uma transação, para não deixar o usuário num estado parcialmente migrado em caso de falha no meio do processo

## Validações necessárias

- `ensureUserHasProfile`: idempotência (rodar 2x seguidas não deve criar 2 Perfis nem duplicar reatribuições)
- Máscara de data: rejeitar meses `> 12` ou `= 0`, dias inválidos para o mês/ano informado (ex.: 31/02, 30/02)

## Testes necessários

### Frontend

- Digitar uma data válida no novo filtro e confirmar que `onChange` dispara com os valores corretos
- Digitar uma data inválida (dia/mês fora de faixa) e confirmar que "Aplicar" fica desabilitado ou erro é exibido
- Confirmar que o Painel carrega corretamente após a correção, incluindo o card de Categorias

### Backend

- `GET /api/auth/verify` com usuário sem Perfil: confirmar criação do Perfil Pessoal e migração de dados órfãos
- `GET /api/auth/verify` com usuário que já tem Perfil: confirmar que nenhuma escrita extra ocorre (idempotência)
- `GET /orcamento/resumo` após o backfill: confirmar que não lança mais `BudgetInputError`

### E2E

- Login com conta legada sem Perfil → Painel carrega card de Categorias → Planejamento carrega sem erro

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- `.env` atual aponta para produção (Render) — qualquer teste da criação/migração de Perfil deve ser feito com cuidado, idealmente primeiro validando com a própria conta do usuário antes de considerar o backfill "pronto para todos"
- Escrita de dados (não é uma migration de arquivo, mas altera linhas em produção) — rodar dentro de transação é obrigatório
- Custo de uma query extra (`SELECT` de verificação) a cada `/auth/verify` — deve ser leve o suficiente para não impactar performance de carregamento do app
- Máscara de data manual mal implementada pode frustrar mais que ajudar — testar UX de digitação (backspace, colar texto, etc.) antes de considerar concluído

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Usuário sem Perfil (conta legada) consegue usar a tela de Planejamento sem erro "Perfil financeiro não encontrado", após um `/auth/verify` (ex.: reload da página ou novo login)
- Card de Categorias volta a aparecer no Painel para essa mesma conta
- Despesas/receitas/meses/reservas pré-existentes do usuário continuam visíveis e corretos após o backfill (nada se perde, só passa a ter `perfil_id` preenchido)
- Filtro de período do Painel aceita digitação manual `dd/mm/aaaa` com máscara automática, valida datas inválidas, e continua controlando o mesmo intervalo que o dropdown antigo controlava
- `cd backend && npm run build`, `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhuma escrita em produção sem confirmação explícita separada do usuário antes do teste real

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Antes de testar o backfill contra a conta real do usuário em produção, confirmar explicitamente que pode prosseguir — é uma escrita de dados, mesma régua de cautela usada para migrations neste projeto
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Manter alterações pequenas e focadas exatamente no escopo acima
- Reaproveitar ao máximo a lógica já existente em `auth.ts` (criação de Perfil) e `profiles.ts` (migração de órfãos) em vez de duplicar
