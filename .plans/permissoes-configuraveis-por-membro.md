# Plano de Implementação: Permissões Configuráveis por Membro — Fase 3 de 3

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário em conversa, com análise profunda feita por agente Explore (somente leitura) e decisões coletadas via perguntas ao longo da sessão.
- Data do planejamento: 2026-09-04
- Classificação: `frontend + backend + database`
- Este é o **plano 3 de 3**. Depende de `.plans/vinculo-membros-conta-familiar.md` (Fase 2) estar implementada e validada em produção primeiro.

## Resumo

Hoje o backend não tem nenhum sistema de permissões granular — apenas 2 middlewares fixos (`requireAdmin`/`requireGestor`, redefinidos na Fase 1) que checam o papel do usuário direto do JWT. Não existe tabela de permissões, ACL, nem qualquer mecanismo configurável.

Esta fase introduz um sistema de permissões por membro dentro de uma conta, permitindo que o `gestor` (dono da conta) configure o que cada membro `padrao` vinculado pode ou não fazer — por exemplo: ver lançamentos de outros membros, ver a visão agregada da família, editar/excluir lançamentos de terceiros, gerenciar categorias/cartões da conta, e acessar os endpoints que hoje são "self-only" (`categorias`, `cartões`, `clear-data` de outro usuário).

O modelo é **restritivo por padrão**: um membro recém-criado (Fase 2) só vê os próprios lançamentos até o gestor liberar mais acesso explicitamente através da tela de permissões criada nesta fase.

## Escopo

### Dentro do escopo

**Modelo de dados de permissões:**
- Nova tabela `membro_permissoes` (ou nome equivalente): vincula `usuario_id` (o membro) a um conjunto de permissões booleanas/flags dentro do contexto da sua conta. Estrutura sugerida: uma linha por membro com colunas booleanas explícitas (mais simples de auditar e consultar que uma tabela chave-valor genérica, seguindo a preferência do projeto por código explícito) — ex.: `ver_lancamentos_outros`, `editar_lancamentos_outros`, `excluir_lancamentos_outros`, `ver_visao_agregada`, `gerenciar_categorias`, `gerenciar_cartoes`, `acessar_dados_outros_membros` (cobre os endpoints self-only da Fase 1: `/:id/categorias`, `/:id/cartoes`, `/:id/clear-data`).
- Linha de permissões é criada automaticamente (todas `false`) quando um membro é criado na Fase 2 — nenhum membro existe sem uma linha de permissão correspondente.

**Enforcement no backend:**
- Novo helper/middleware (ex.: `requirePermission(flag)` ou função de checagem inline nos pontos relevantes) que consulta `membro_permissoes` para o `usuario_id` autenticado antes de liberar acesso a dados de outro autor da mesma conta.
- Pontos de enforcement a atualizar (construídos sobre a infraestrutura de vínculo da Fase 2):
  - `buildOwnerAndAccountWhere` (`expenses.ts`, `incomes.ts`): quando o autor solicitado (`usuario_id` alvo) é diferente do usuário autenticado, checar `ver_lancamentos_outros` antes de incluir esses dados na resposta.
  - Edição/exclusão de despesa/receita de outro autor: checar `editar_lancamentos_outros`/`excluir_lancamentos_outros`.
  - Endpoint de visão agregada (criado na Fase 2, hoje exclusivo do gestor): passa a também aceitar membro com `ver_visao_agregada = true`.
  - `GET/PUT /:id/categorias`, `GET /:id/cartoes`, `DELETE /:id/clear-data` (hoje self-only, `backend/src/routes/users.ts`): passam a aceitar acesso de um gestor (ou membro com `acessar_dados_outros_membros`) sobre outro membro da mesma conta, além do próprio dono continuar tendo acesso automático aos próprios dados.
  - Gerenciamento de categorias/cartões da conta (rotas correspondentes): checar `gerenciar_categorias`/`gerenciar_cartoes` quando quem está agindo não é o autor original do recurso.

**Endpoints novos:**
- `GET` das permissões atuais de um membro (visão do gestor).
- `PUT`/`PATCH` para o gestor atualizar as permissões de um membro específico.

**Frontend — Tela de permissões:**
- Nova tela (dentro da tela/aba de gestão de membros criada na Fase 2, ou uma aba própria "Permissões"): para cada membro, lista de toggles correspondentes às flags acima, com salvamento explícito.
- Estado de carregamento/erro/vazio seguindo os padrões já usados em outras telas de configuração do projeto (`src/ui/states.tsx`, `ConfigListRow.tsx`).
- Acesso à tela restrito ao papel `gestor` (e `admin`), usando os guards definidos na Fase 1.

### Fora do escopo

- Qualquer granularidade além do que está listado (ex.: permissão por categoria específica, por período, por valor máximo) — não pedido, ficaria como possível extensão futura.
- Templates/perfis de permissão predefinidos (ex.: "perfil criança" vs "perfil cônjuge" com conjuntos pré-configurados) — não pedido; cada membro é configurado individualmente.
- Auditoria/histórico de mudanças de permissão (quem mudou o quê e quando) — não pedido.
- Notificação ao membro quando suas permissões mudam — não pedido.

## Leitura de contexto

- `sistema financas/CLAUDE.md`, `sistema financas/AGENT.md` — mesmas notas das Fases 1 e 2.
- `frontend/AGENT.md`, `backend/AGENT.md` — não existem como arquivos dedicados neste projeto.
- `backend/src/middleware/auth.ts` — modelo atual de guards fixos (base a ser complementada, não substituída — papéis continuam existindo, permissões são uma camada adicional dentro do papel `padrao`/membro).
- `backend/src/utils/ownerAndAccountWhere.ts` — ponto de enforcement principal, já estendido na Fase 2 para navegar vínculo de conta; nesta fase, passa a também consultar permissão antes de liberar dados de terceiro.
- `backend/src/routes/users.ts` — os 3 endpoints self-only identificados no inventário da análise inicial (`/:id/categorias`, `/:id/cartoes`, `/:id/clear-data`), confirmados como escopo desta fase.
- `.plans/redefinicao-papeis-admin-gestor-padrao.md` (Fase 1), `.plans/vinculo-membros-conta-familiar.md` (Fase 2) — pré-requisitos diretos.
- `src/ui/ConfigListRow.tsx`, `src/ui/states.tsx` — padrões de UI de configuração já existentes no projeto, a reaproveitar na nova tela em vez de criar componentes novos do zero.

## Impacto por área

### Frontend

- Novo serviço (ex.: `src/services/permissoesService.ts`) para buscar/atualizar permissões de um membro.
- Nova tela/seção "Permissões" (dentro da área de gestão de membros da Fase 2): lista de membros, ao selecionar um, exibe os toggles de permissão com salvamento.
- Reaproveitar componentes existentes de configuração (`ConfigListRow.tsx`, padrões de toggle/switch já usados em outras telas do projeto, a identificar durante a implementação).
- Nas telas de despesas/receitas: se o membro passa a ter `ver_lancamentos_outros`, a listagem precisa exibir de forma clara quem é o autor de cada lançamento de terceiro (evitar confusão sobre "de quem é isso").

### Backend

- `backend/src/db/schema/`: nova tabela `membroPermissoes` (arquivo `memberPermissions.ts` ou `permissoesMembro.ts`, seguindo convenção do projeto).
- `backend/src/middleware/`: novo helper de checagem de permissão (ex.: `permissions.ts`), consultando a nova tabela.
- `backend/src/routes/`: novas rotas de leitura/escrita de permissões (ex.: dentro do arquivo de rotas de membros criado na Fase 2, ou um arquivo dedicado `permissions.ts`).
- `backend/src/utils/ownerAndAccountWhere.ts`: adicionar checagem de permissão ao resolver autores visíveis.
- `backend/src/routes/expenses.ts`, `incomes.ts`: pontos de edição/exclusão de recurso de terceiro passam a checar a permissão correspondente antes de autorizar.
- `backend/src/routes/users.ts`: os 3 endpoints self-only passam a aceitar acesso de gestor/membro autorizado, mantendo o acesso automático do próprio dono.
- Endpoint de visão agregada (criado na Fase 2): passa a checar `ver_visao_agregada` para membros (gestor sempre tem acesso).

### Banco de dados

**Nova tabela** (`backend/drizzle/00XX_membro_permissoes.sql`):

```sql
CREATE TABLE membro_permissoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  ver_lancamentos_outros BOOLEAN NOT NULL DEFAULT false,
  editar_lancamentos_outros BOOLEAN NOT NULL DEFAULT false,
  excluir_lancamentos_outros BOOLEAN NOT NULL DEFAULT false,
  ver_visao_agregada BOOLEAN NOT NULL DEFAULT false,
  gerenciar_categorias BOOLEAN NOT NULL DEFAULT false,
  gerenciar_cartoes BOOLEAN NOT NULL DEFAULT false,
  acessar_dados_outros_membros BOOLEAN NOT NULL DEFAULT false,
  data_atualizacao TIMESTAMP DEFAULT NOW()
);
```

**Backfill/criação automática**: sempre que um membro é criado (endpoint da Fase 2), o backend deve criar também a linha correspondente em `membro_permissoes` com todos os valores `false`, na mesma transação da criação do membro. Isso deve ser adicionado retroativamente ao endpoint de criação de membro da Fase 2 durante esta implementação (ou, se membros já existirem de testes da Fase 2 sem linha de permissão, rodar um backfill idempotente aqui).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/db/schema/` (novo arquivo `memberPermissions.ts`)
- `backend/src/db/schema/index.ts`
- `backend/src/middleware/` (novo helper de permissão)
- `backend/src/routes/` (rotas de leitura/escrita de permissões; possivelmente extensão do arquivo de membros da Fase 2)
- `backend/src/routes/users.ts` (3 endpoints self-only)
- `backend/src/routes/expenses.ts`, `incomes.ts`
- `backend/src/utils/ownerAndAccountWhere.ts`
- `src/services/permissoesService.ts` (novo)
- Nova tela/seção em `src/screens/config/`
- Nova migration em `backend/drizzle/`

## Estratégia de implementação

1. Escrever (sem executar) a migration da nova tabela `membro_permissoes`.
2. Backend: schema Drizzle da nova tabela.
3. Backend: garantir criação automática da linha de permissão junto da criação de membro (ajuste retroativo no endpoint da Fase 2).
4. Backend: helper de checagem de permissão.
5. Backend: endpoints de leitura/escrita de permissões (`requireGestor`-only).
6. Backend: aplicar checagem de permissão nos pontos de enforcement listados (`ownerAndAccountWhere`, edição/exclusão de terceiro, visão agregada, 3 endpoints self-only).
7. Rodar `cd backend && npm run build`.
8. Frontend: `permissoesService.ts`.
9. Frontend: tela de permissões (toggles por membro), reaproveitando componentes existentes.
10. Frontend: exibir autor em listagens quando lançamentos de terceiros passam a ser visíveis.
11. Rodar build do frontend.
12. Apresentar resumo, pedir confirmação explícita separada para aplicar a migration em produção.
13. Testes manuais: gestor libera cada permissão individualmente para um membro de teste, confirma que o comportamento muda exatamente como esperado, e que nada além do liberado passa a ser acessível.

## Regras de negócio identificadas

- Toda permissão começa `false` (restritivo por padrão) e é liberada explicitamente pelo gestor.
- Permissões são por membro individual, não por "papel padrao" como grupo — cada membro tem sua própria configuração.
- `gestor` sempre tem acesso total à própria conta (visão agregada, edição de qualquer lançamento) — as permissões desta fase regulam apenas o que os membros `padrao` podem fazer.
- `admin` (dev/plataforma) não é afetado por este sistema de permissões — continua com os guards da Fase 1.

## Regras multi-tenant e segurança

- Toda checagem de permissão deve ocorrer no backend — nunca confiar em uma flag de permissão vinda do client/frontend.
- A permissão de um membro só é válida dentro da própria `conta_id` à qual está vinculado (Fase 2) — não pode ser usada para acessar dados de qualquer outra conta.
- Alteração de permissões só pode ser feita pelo `gestor` dono da conta correspondente (ou `admin`), nunca por outro membro, mesmo que esse outro membro tenha `gerenciar_categorias`/etc. habilitado — gestão de permissões não é uma permissão delegável nesta fase.
- Mensagens de erro de acesso negado por falta de permissão devem ser genéricas, sem revelar detalhes de outros membros/dados que o solicitante não deveria saber que existem.

## Validações necessárias

- Endpoint de atualização de permissões: validar que todas as flags enviadas são booleanas, que o `usuario_id` alvo é de fato um membro vinculado à conta do gestor solicitante.
- Toda rota que passa a aceitar acesso de terceiro (com base em permissão) deve validar tanto o vínculo de conta (Fase 2) quanto a flag específica antes de liberar — as duas condições são obrigatórias, nunca uma sozinha.

## Testes necessários

### Backend

- Membro sem nenhuma permissão: tenta ver/editar lançamento de outro autor → bloqueado.
- Gestor libera `ver_lancamentos_outros` para o membro → membro passa a ver, mas não editar/excluir (permissões independentes).
- Gestor libera `ver_visao_agregada` → membro passa a acessar o endpoint agregado.
- Gestor libera `acessar_dados_outros_membros` → membro consegue acessar `/:id/categorias`, `/:id/cartoes` de outro membro da mesma conta.
- Membro tenta acessar dado de usuário fora da própria conta, mesmo com todas as permissões ligadas → bloqueado (vínculo de conta da Fase 2 continua sendo pré-condição).
- Membro tenta alterar as próprias permissões ou as de outro membro → bloqueado (só gestor/admin podem).

### Frontend

- Tela de permissões carrega o estado atual corretamente por membro.
- Alternar um toggle e salvar reflete no backend e persiste ao recarregar.
- Listagem de despesas passa a exibir autor quando o usuário logado tem `ver_lancamentos_outros`.

### E2E

- Fluxo completo: gestor cria membro (Fase 2) → member só vê os próprios lançamentos → gestor abre tela de permissões, libera "ver lançamentos de outros" e "ver visão agregada" → membro loga novamente (ou refresca) → passa a ver os lançamentos da família e o agregado, mas ainda não consegue editar/excluir os de terceiros até essa permissão também ser liberada.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- **Maior risco desta fase**: esquecer de aplicar a checagem de permissão em algum ponto de enforcement (ex.: um novo endpoint futuro que segue o padrão antigo sem passar pelo helper novo) — vazamento de dados entre membros da mesma conta. Revisar exaustivamente todos os pontos listados em "Backend" acima, e ao final desta fase, rodar checagem de dupla verificação: `gestor` liga tudo, membro vê tudo esperado; `gestor` desliga tudo, membro volta a não ver nada.
- Toda a superfície tocada pela Fase 2 (`ownerAndAccountWhere`) é tocada de novo aqui — cuidado para não regressão do comportamento já validado na Fase 2 (membro sem permissão nenhuma deve continuar exatamente como estava antes desta fase).
- Este plano assume que o modelo de colunas booleanas explícitas é suficiente; se o usuário pedir mais granularidade no futuro (ex.: por categoria), o modelo precisaria evoluir para uma tabela mais flexível — não antecipar isso agora (YAGNI), mas registrar como possível ponto de retrabalho.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada além do conjunto de flags de permissão listado — se o usuário quiser ajustar/adicionar flags específicas durante a implementação, isso deve ser tratado como ajuste de escopo pontual, não como bloqueio ao início da Fase 3.

## Critérios de aceite do plano

- Todo membro tem uma linha de permissões, criada automaticamente ao ser vinculado (Fase 2).
- Gestor consegue visualizar e alterar as permissões de cada membro individualmente, pela nova tela.
- Todos os pontos de enforcement listados respeitam a permissão configurada, com padrão restritivo.
- Nenhuma permissão pode ser usada para acessar dados fora da própria conta vinculada.
- Nenhuma migration executada sem confirmação explícita separada do usuário.
- Build do backend e do frontend passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Depende da Fase 2 (`vinculo-membros-conta-familiar.md`) estar concluída — confirmar isso antes de iniciar.
- Não executar a migration sem confirmação explícita separada.
- Revisar exaustivamente todos os pontos de enforcement listados — este é o plano com maior risco de vazamento de dado entre membros se algum ponto for esquecido.
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados).
- Reaproveitar componentes de UI de configuração já existentes (`ConfigListRow.tsx`, padrões de toggle) em vez de criar do zero.
- Este é o último plano da sequência de 3 fases desta iniciativa.
