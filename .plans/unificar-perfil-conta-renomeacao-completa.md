# Plano de Implementação: Unificação completa de "Perfil" em "Conta"

## Origem

- Arquivo de especificação: descrição textual do usuário (decisão de modelo de dados após bug crítico) + 2 investigações profundas por agentes Explore (somente leitura)
- Data do planejamento: 2026-09-02
- Classificação: `frontend + backend + database`

## Resumo

Após o bug crítico desta sessão (Perfil Pessoal arquivado sem proteção, porque o item sintético "Conta" fingia sempre estar disponível na UI sem ser uma linha real do banco), o usuário decidiu eliminar a distinção entre "Perfil" (tabela `perfis`) e "Conta principal" (usuário/login). A partir de agora existe um único conceito: **Conta**. A Conta criada no cadastro externo (vinculada à cobrança do plano) é a "Conta Padrão" e aparece na mesma lista que as demais Contas (hoje Perfis PJ/PF), distinguida apenas por uma flag/tag visual — não por um tipo de dado ou tratamento de código diferente.

`usuarios` continua sendo a única tabela de autenticação (senha, JWT, dados de cobrança/plano) — isso não muda. O que muda é que a Conta Padrão passa a ter também uma linha correspondente na tabela renomeada `contas` (ex-`perfis`), assim como as demais Contas do usuário.

Investigação prévia (2 agentes Explore) mapeou o alcance completo: ~80 arquivos (39 backend + 40 frontend), ~16 tabelas de banco referenciando `perfil_id`, nenhuma dependência de consumidor externo às rotas `/api/profiles`/`/api/perfis` (seguro renomear), e confirmação de que todas as chamadas de perfil no frontend já passam por services centralizados (nenhuma chamada "selvagem" escaparia de uma renomeação coordenada).

## Escopo

### Dentro do escopo

- Renomear tabela `perfis` → `contas`; coluna `perfil_id` → `conta_id` em todas as tabelas relacionadas (via Drizzle: `expenses`, `incomes`, `cards`, `categories`, `reserves`, `months`, `partners`, `representatives`, `copilot_conversas`, `orcamento_metas`, `ia_eventos_uso`; via SQL bruto: `clientes`, `contratos`, `compromissos`, `socios`)
- Nova coluna `contas.eh_padrao BOOLEAN DEFAULT false` — marca a Conta nascida no cadastro externo
- Backfill: criar uma linha nova em `contas` para cada usuário existente, com `eh_padrao = true`, copiando nome/documento de `usuarios` — sem promover/mesclar nenhuma linha de perfil já existente
- Renomear rotas `/api/profiles` e `/api/perfis` (montagem dupla existente) para `/api/contas` (prefixo único)
- Renomear arquivos, tipos, variáveis e services no backend e frontend conforme detalhado abaixo
- Atualizar todos os textos de UI visíveis ao usuário que mencionam "Perfil"/"perfil" (telas de produto, páginas públicas de marketing, Termos de Uso)
- Renomear a chave do `localStorage` de `perfilAtivoId` para `contaAtivaId`
- Remover o sentinel `CONTA_PRINCIPAL_ID = 'conta'`, o tipo `ContaPrincipalItem` e o discriminador `tipo: 'conta'` — a Conta Padrão passa a ser uma linha comum de `Conta[]`, identificada só pela flag `eh_padrao`
- Adaptar a lógica já implementada nesta sessão (proteção de arquivamento, toggle ativos/desativados, reativação manual, tag de "perfil original") ao novo modelo: a Conta Padrão passa a ser sempre-protegida contra arquivamento (equivalente ao que antes era "o único perfil pessoal"), e a tag antiga "Perfil original" é substituída pela tag oficial "Conta Padrão" baseada na flag `eh_padrao`, não mais numa heurística de data de criação

### Fora do escopo

- Repensar autenticação multi-usuário por conta (permitir login direto numa Conta específica que não seja a Padrão) — decisão explícita do usuário de não expandir para isso agora
- Qualquer mudança na tabela `usuarios` além do que já foi feito em planos anteriores desta sessão (telefone/data de nascimento) — ela continua sendo a única fonte de autenticação/cobrança
- Migrar dados entre Contas (ex.: mesclar despesas do Perfil Pessoal antigo com a nova Conta Padrão) — as linhas antigas de `perfis`/`contas` continuam existindo lado a lado com a nova linha de Conta Padrão, sem merge automático de dados financeiros
- Alterar a regra de negócio de segregação financeira em si (como despesas/receitas são filtradas por `perfil_id`/`conta_id`) além da renomeação — a lógica de fallback para dados órfãos (`conta_id IS NULL`) permanece, só o nome muda

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto; não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Relatório do agente Explore #1 (causa raiz do bug de arquivamento do Perfil Pessoal — já usado no plano anterior desta sessão)
- Relatório do agente Explore #2 (mapeamento completo da superfície "perfil"/"profile": 39 arquivos backend, 40 arquivos frontend, ~16 tabelas, rotas HTTP, migrations históricas, confirmação de ausência de consumidores externos)
- `.plans/corrigir-protecao-perfil-pessoal-e-reativacao.md` (plano já implementado nesta sessão — trabalho a ser preservado/adaptado, não descartado)
- `backend/src/db/schema/profiles.ts`, `users.ts`, e os ~10 arquivos de schema com `perfil_id`
- `backend/src/routes/profiles.ts`, `server.ts` (montagem de rotas)
- `backend/src/utils/profileFilter.ts`, `ownerAndProfileWhere.ts`, `services/profileBackfill.ts`, `budgetService.ts`
- `src/types/config.ts`, `src/hooks/useActiveProfile.ts`, `src/services/apiClient.ts`, `src/services/configService.ts`, `src/screens/config/PerfisTab.tsx`, `src/layout/AccountProfileMenu.tsx`

## Impacto por área

### Frontend

**Renomeação de arquivos:**
- `src/hooks/useActiveProfile.ts` → `src/hooks/useActiveAccount.ts` (`useActiveProfile()` → `useActiveAccount()`, remove `CONTA_PRINCIPAL_ID`)
- `src/screens/config/PerfisTab.tsx` → `src/screens/config/ContasTab.tsx` (componente `ContaDialog` no lugar de `PerfilDialog`)
- `src/layout/AccountProfileMenu.tsx` — mantém o nome (já em inglês genérico), mas remove a lógica de `isContaSelecionada` como caso especial (toda Conta, incluindo a Padrão, segue o mesmo caminho de renderização)

**Tipos (`src/types/config.ts`):**
- `Perfil` → `Conta` (adiciona `eh_padrao: boolean`)
- Remove `ContaPrincipalItem` e `PerfilOuConta` — em todo lugar que usava `PerfilOuConta`, passa a usar só `Conta`

**Services:**
- `src/services/configService.ts`: `fetchPerfis` → `fetchContas`, `savePerfil` → `saveConta`, `deletePerfil` → `deleteConta`, `reactivatePerfil` → `reactivateConta`, `updateFotoPerfil` → `updateFotoConta`; endpoint `/perfis` → `/contas`
- `src/services/apiClient.ts`: `getActiveProfileId` → `getActiveAccountId`; `localStorage['perfilAtivoId']` → `localStorage['contaAtivaId']`
- Demais services que enviam `perfil_id` como query/body param (`appointmentsService.ts`, `assistantService.ts`, `budgetService.ts`, `clientesService.ts`, `financeService.ts`, `reportsService.ts`, `representantesService.ts`, `reservasService.ts`, `sociosService.ts`): `perfil_id` → `conta_id`
- `src/services/session.ts`: limpar `contaAtivaId`/`contaAtivaNome`/`contaAtivaTipo` no logout (renomeados de `perfilAtivo*`)

**Telas e componentes com textos visíveis (renomear "Perfil"/"perfil" → "Conta"/"conta"):**
- `src/screens/config/ContasTab.tsx` (ex-`PerfisTab.tsx`): todos os textos listados na investigação (`'Arquivar perfil'`, `'Novo perfil'`, `'TIPO DE PERFIL'`, `'Perfil incompleto'`, etc.)
- `src/layout/ConfigPanel.tsx`: `label: 'Perfis'` → `'Contas'`; remover o sinônimo legado `'conta'` em `ConfigItemId` (não é mais necessário — não há mais duas entradas de menu diferentes)
- `src/layout/AccountProfileMenu.tsx`: `'Trocar perfil'` → `'Trocar conta'`; badge `'Conta'` (hoje usado só para a conta-login) passa a ser a tag `'Conta Padrão'`, exibida condicionalmente via `eh_padrao`, e não mais um tipo diferente de item
- `src/components/financial-assistant/AssistantHeaderMenu.tsx`: `'Alterar perfil'` → `'Alterar conta'` (2 ocorrências)
- `src/components/financial-assistant/FinancialAssistant.tsx`: `'Nenhuma conversa salva neste perfil.'` → `'...nesta conta.'`
- `src/components/AvatarUploadDialog.tsx`: `title="Foto de perfil"` → `"Foto da conta"`
- `src/components/firstAccessGuideMessages.ts`: revisar as 2 mensagens que mencionam "perfil"
- `src/screens/finance/FinanceDashboard.tsx`: `'Perfil das despesas'` → `'Conta das despesas'`; texto de resumo com `perfil ${...}`
- `src/screens/finance/BudgetPanel.tsx`: `'...apenas no perfil pessoal.'` → `'...apenas na conta pessoal.'` (ajustar conforme nova nomenclatura de tipo, se aplicável)
- `src/screens/public/FuncionalidadesPage.tsx`, `PlanosPage.tsx`: revisar textos de marketing (`'Separe por perfil'`, `'Perfil empresarial'`, etc.)
- `src/screens/public/TermosModal.tsx`: revisar a frase `'Controles de acesso baseados em perfil...'` com cuidado, preservando o sentido jurídico do texto — troca pontual de palavra, não reescrita da cláusula

**Query keys:** `queryKeys.perfis` → `queryKeys.contas` (`src/services/queryKeys.ts`, se aplicável)

### Backend

**Schema Drizzle:**
- `backend/src/db/schema/profiles.ts` → `accounts.ts`: `pgTable('contas', ...)`, export `accounts`, tipos `Account`/`NewAccount`, nova coluna `ehPadrao: boolean('eh_padrao').default(false)`
- `backend/src/db/schema/index.ts`: atualizar barrel export
- Nos 10 arquivos de schema com `perfil_id` (`expenses.ts`, `incomes.ts`, `cards.ts`, `categories.ts`, `reserves.ts`, `months.ts`, `partners.ts`, `representatives.ts`, `copilot.ts` [3 tabelas]): `profileId: integer('perfil_id')` → `accountId: integer('conta_id')`, ajustar referência de FK para `accounts.id`

**Rotas:**
- `backend/src/routes/profiles.ts` → `accounts.ts`: renomear rotas internas mantendo os paths relativos (`/`, `/:id`, `/:id/photo`, `/:id/reactivate`, `/migrate-orphans`), variáveis e mensagens de erro em inglês ajustadas (`'Profile not found'` → `'Account not found'`, etc.)
- `backend/src/server.ts`: `import accountRoutes from './routes/accounts'`; montar em `app.use('/api/contas', authenticate, requireActivePlan, accountRoutes)` — remover a montagem dupla antiga (`/api/profiles`, `/api/perfis`), já que nenhum consumidor externo depende delas
- As ~15 rotas que hoje leem `perfil_id` como query/body param (`appointments.ts`, `assistant.ts`, `budget.ts`, `cards.ts`, `categories.ts`, `expenses.ts`, `financial.ts`, `incomes.ts`, `partners.ts`, `reports.ts`, `representatives.ts`, `reserves.ts`, `users.ts`, `clients.ts`, `contracts.ts`): `perfil_id` → `conta_id`
- Regra de "arquivar/reativar Conta": adaptar a proteção implementada no plano anterior (`DELETE /:id` em `profiles.ts`) — em vez de "nunca pode arquivar o único perfil `pessoal` ativo", passa a ser "nunca pode arquivar a Conta com `eh_padrao = true`" (proteção mais direta e alinhada ao novo modelo)

**Services/utils:**
- `backend/src/utils/profileFilter.ts` → `accountFilter.ts` (`profileWhere` → `accountWhere`)
- `backend/src/utils/ownerAndProfileWhere.ts` → `ownerAndAccountWhere.ts` (`buildOwnerAndProfileWhere` → `buildOwnerAndAccountWhere`)
- `backend/src/services/profileBackfill.ts` → `accountBackfill.ts` (`ensureUserHasProfile` → `ensureUserHasAccount`, ajustado para também garantir/criar a Conta Padrão marcada com `eh_padrao`, não mais depender de achar um tipo `pessoal`)
- `backend/src/services/budgetService.ts`: `resolveFinancialProfile` → `resolveFinancialAccount`, tipo `FinancialProfile` → `FinancialAccount`; a resolução quando nenhum `conta_id` é enviado passa a considerar a Conta com `eh_padrao = true` como padrão, em vez de exigir tipo `pessoal`
- `backend/src/services/financialCopilot.ts`, `commissionService.ts`, `defaultCategories.ts`: renomear parâmetros/tipos correspondentes
- `backend/src/routes/auth.ts`: no cadastro (`POST /register`), passa a criar também a linha de Conta Padrão (`eh_padrao: true`) junto com o Perfil inicial (que pode, inclusive, ser a mesma linha — a decidir na implementação se o cadastro cria 1 linha combinada ou continua criando o "Perfil" normal e a marca como padrão)

### Banco de dados

**Migration principal** (`backend/drizzle/00XX_renomear_perfis_para_contas.sql`):
```sql
ALTER TABLE perfis RENAME TO contas;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS eh_padrao BOOLEAN DEFAULT false;

ALTER TABLE despesas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE receitas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE cartoes RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE categorias RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE reservas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE meses RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE socios RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE representantes RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE copilot_conversas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE orcamento_metas RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE ia_eventos_uso RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE clientes RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE contratos RENAME COLUMN perfil_id TO conta_id;
ALTER TABLE compromissos RENAME COLUMN perfil_id TO conta_id;

-- Renomear índices/constraints (nomes exatos a confirmar no banco antes de aplicar)
ALTER INDEX idx_perfis_usuario RENAME TO idx_contas_usuario;
-- ... demais índices listados na investigação
```

**Migration de backfill** (`backend/drizzle/00XX_backfill_conta_padrao.sql`, ou script Node equivalente para maior controle/logging):
```sql
INSERT INTO contas (usuario_id, tipo, nome, documento, eh_padrao, ativo, data_criacao)
SELECT id, 'pessoal', nome, documento, true, true, data_cadastro
FROM usuarios
WHERE id NOT IN (SELECT usuario_id FROM contas WHERE eh_padrao = true);
```

**Riscos de schema:**
- `RENAME COLUMN`/`RENAME TABLE` no Postgres são operações rápidas (não reescrevem a tabela inteira), mas exigem que a aplicação pare de usar o nome antigo simultaneamente — backend e frontend devem subir juntos após a migration
- Nomes exatos de índices/constraints precisam ser confirmados no banco (via `pg_indexes`/`information_schema`) antes de escrever o `RENAME INDEX` definitivo, pois nomes gerados automaticamente pelo Postgres podem diferir do padrão assumido
- A tabela `perfis` foi criada fora do fluxo de migrations versionadas — não há uma migration "0000" para servir de referência de nomes exatos de constraint; a implementação deve consultar o banco diretamente antes de escrever os `RENAME` finais

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado` além do deploy coordenado (backend+frontend) já mencionado nos riscos.

## Arquivos provavelmente afetados

**Backend (39):** `db/schema/profiles.ts` (→ `accounts.ts`), `db/schema/{expenses,incomes,cards,categories,reserves,months,partners,representatives,copilot}.ts`, `db/schema/index.ts`, `routes/profiles.ts` (→ `accounts.ts`), `routes/{appointments,assistant,budget,cards,categories,expenses,financial,incomes,partners,reports,representatives,reserves,users,clients,contracts,auth}.ts`, `server.ts`, `utils/profileFilter.ts` (→ `accountFilter.ts`), `utils/ownerAndProfileWhere.ts` (→ `ownerAndAccountWhere.ts`), `services/profileBackfill.ts` (→ `accountBackfill.ts`), `services/{budgetService,financialCopilot,commissionService,defaultCategories}.ts`.

**Frontend (40):** `hooks/useActiveProfile.ts` (→ `useActiveAccount.ts`), `screens/config/PerfisTab.tsx` (→ `ContasTab.tsx`), `layout/{AccountProfileMenu,ConfigPanel,AppShell}.tsx`, `types/config.ts`, `services/{apiClient,configService,session,appointmentsService,assistantService,budgetService,clientesService,financeService,reportsService,representantesService,reservasService,sociosService}.ts`, `components/{AvatarUploadDialog,firstAccessGuideMessages}.ts(x)`, `components/financial-assistant/{AssistantHeaderMenu,FinancialAssistant}.tsx`, `screens/despesas/DespesasScreen.tsx`, `screens/finance/{BudgetPanel,ExpenseDialog,FinanceDashboard,IncomeDialog,MovimentacoesScreen}.tsx`, `screens/receitas/ReceitasScreen.tsx`, `screens/relatorios/RelatoriosScreen.tsx`, `screens/public/{FuncionalidadesPage,PlanosPage,TermosModal}.tsx`, `types/{appointments,budget,reservas}.ts`, `hooks/useOnboardingChecklist.ts`, `services/demo/{demoFakeDatabase,fakeApiResolver}.ts`.

**Migrations novas:** `backend/drizzle/00XX_renomear_perfis_para_contas.sql`, `backend/drizzle/00XX_backfill_conta_padrao.sql`.

## Estratégia de implementação

1. Consultar o banco (`information_schema`/`pg_indexes`) para confirmar nomes exatos de todos os índices/constraints envolvidos, antes de escrever a migration final
2. Escrever (sem executar) as 2 migrations: rename de tabela/colunas + backfill de Conta Padrão
3. Backend: renomear schema Drizzle (arquivo por arquivo, confirmando build a cada bloco lógico)
4. Backend: renomear rota dedicada + atualizar `server.ts`
5. Backend: atualizar services/utils compartilhados (`accountFilter.ts`, `ownerAndAccountWhere.ts`, `accountBackfill.ts`, `budgetService.ts`)
6. Backend: atualizar as ~15 rotas que recebem `conta_id` como parâmetro (renomear query param)
7. Rodar `cd backend && npm run build`
8. Frontend: renomear arquivos centrais (`useActiveAccount.ts`, `ContasTab.tsx`), tipos (`types/config.ts`), services (`configService.ts`, `apiClient.ts`)
9. Frontend: atualizar os demais services que enviam `conta_id`
10. Frontend: atualizar textos de UI (produto, depois páginas públicas/Termos)
11. Rodar `npx tsc --noEmit -p .` e `npx vite build`
12. Apresentar resumo, pedir confirmação explícita separada para aplicar as 2 migrations em produção
13. Após aplicar migrations: testar manualmente login, troca de conta, Planejamento, Painel, arquivamento/reativação de conta

## Regras de negócio identificadas

- Toda Conta pertence a exatamente um usuário (`usuario_id`), preservando o isolamento de dados já existente
- A Conta Padrão (`eh_padrao = true`) nunca pode ser arquivada — substitui a antiga regra "nunca arquivar o único perfil pessoal"
- Dados sem `conta_id` (legado) continuam sendo herdados implicitamente pela Conta Padrão do usuário, mesma lógica de fallback já existente (renomeada de "perfil pessoal" para "conta padrão")
- Só a Conta Padrão está associada a um login (via `usuarios`) — as demais Contas não autenticam sozinhas

## Regras multi-tenant e segurança

- Não há dimensão multi-tenant/prefeitura neste projeto
- Toda rota continua validando propriedade via `usuario_id` do JWT — a renomeação não introduz novo vetor de acesso indevido
- Atenção redobrada ao migrar `conta_id` em rotas com SQL bruto (`clients.ts`, `contracts.ts`, `appointments.ts`, `partners.ts`) para não deixar nenhuma referência ao nome antigo da coluna, o que quebraria silenciosamente o isolamento entre contas

## Validações necessárias

- Toda query SQL bruta (fora do Drizzle) que referencia `perfil_id` precisa ser localizada e atualizada — nenhuma pode escapar, sob risco de erro de coluna inexistente em produção
- Validar que o backfill não cria Conta Padrão duplicada se rodado mais de uma vez (idempotência via `WHERE id NOT IN (SELECT usuario_id FROM contas WHERE eh_padrao = true)`)
- Validar que a proteção de arquivamento da Conta Padrão funciona mesmo quando é a única Conta do usuário

## Testes necessários

### Frontend

- Menu de troca de conta mostra a Conta Padrão com a tag correta, junto às demais Contas, sem tratamento visual divergente
- Tela de Contas (ex-Perfis) lista tudo numa única lista, toggle ativos/desativados funciona, reativação funciona
- Nenhum texto residual "Perfil"/"perfil" visível ao usuário após a mudança

### Backend

- `GET /api/contas` retorna a Conta Padrão junto com as demais
- `POST /api/auth/register` cria corretamente a Conta Padrão do novo usuário
- `DELETE /api/contas/:id` bloqueia arquivamento da Conta Padrão
- Rotas de despesas/receitas/etc. continuam filtrando corretamente por `conta_id` após o rename

### E2E

- Fluxo completo: cadastro novo → Conta Padrão criada automaticamente → aparece na lista de Contas com a tag correta → Planejamento e Painel funcionam sem exigir nenhuma configuração adicional

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- **Este é o maior risco técnico desta sessão**: renomeação de tabela/coluna em produção, tocando ~16 tabelas com dados reais — deve ser tratado com o mesmo rigor de uma migration crítica, testado em etapas, nunca aplicado de uma vez sem revisão
- Contrato de API muda (`perfil_id` → `conta_id`) — backend e frontend precisam subir coordenados; não há período de transição com ambos os nomes convivendo, a menos que se decida adicionar isso na implementação
- Working tree já tem ~80 arquivos não commitados de trabalho em andamento — cada arquivo deve ser relido antes de editar, para não sobrescrever trabalho de outra frente
- Textos em `TermosModal.tsx` são conteúdo legal — troca pontual de palavra, sem reescrever cláusulas
- Nomes de índices/constraints devem ser confirmados diretamente no banco antes da migration final, já que a tabela original não tem uma migration de criação versionada para servir de referência

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões de design já confirmadas com o usuário (nome de tabela/coluna, chave de localStorage, nome da flag, estratégia de backfill).

## Critérios de aceite do plano

- Tabela `contas` existe com a coluna `eh_padrao`; todas as ~16 tabelas relacionadas usam `conta_id`
- Toda referência a "Perfil"/"perfil"/"profile" no código de produto (não histórico de migrations antigas) foi substituída por "Conta"/"conta"/"account"
- A Conta Padrão aparece na lista de Contas como mais um item, com a tag "Conta Padrão", protegida contra arquivamento
- Nenhum consumidor quebra por rota/coluna renomeada (validado por build + testes manuais)
- `cd backend && npm run build`, `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhuma migration executada sem confirmação explícita separada do usuário

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Antes de escrever a migration final de rename de índices/constraints, consultar o banco diretamente (`information_schema`/`pg_indexes`) para confirmar nomes exatos — não assumir os nomes listados aqui como definitivos
- Reler cada arquivo do working tree antes de editar (já modificado por outras frentes desta sessão)
- Preservar e adaptar (não descartar) o trabalho já implementado em `.plans/corrigir-protecao-perfil-pessoal-e-reativacao.md`
- Não executar migrations sem confirmação explícita separada — o ambiente aponta para produção
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Dado o tamanho, considerar dividir a implementação em sub-etapas com build intermediário a cada bloco lógico (schema → rotas → services → frontend), em vez de uma única passada
