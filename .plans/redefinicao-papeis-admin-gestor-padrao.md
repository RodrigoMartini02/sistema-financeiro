# Plano de Implementação: Redefinição de Papéis (admin/gestor/padrão) — Fase 1 de 3

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário em conversa, com análise profunda feita por agente Explore (somente leitura) e decisões coletadas via perguntas ao longo da sessão.
- Data do planejamento: 2026-09-04
- Classificação: `frontend + backend + database`
- Este é o **plano 1 de 3** de uma iniciativa maior (contas familiares multiusuário). Os outros dois:
  - `.plans/vinculo-membros-conta-familiar.md` (Fase 2 — depende deste)
  - `.plans/permissoes-configuraveis-por-membro.md` (Fase 3 — depende da Fase 2)

## Resumo

Hoje `usuarios.tipo` é `'padrao' | 'admin' | 'master'`, usado como papel de **operador da plataforma** (backoffice): `padrao` é cliente comum, `admin` gerencia outros clientes `padrao` (suporte), `master` gerencia todo mundo incluindo admins. Não existe nenhum conceito de família, dependente, sub-usuário ou conta compartilhada por múltiplas pessoas — cada linha de `usuarios` é um login totalmente independente.

O usuário decidiu redefinir o significado desses 3 valores para suportar contas familiares/times no futuro (Fases 2 e 3):

- **`admin`** = desenvolvedor/dono do SaaS, acesso total à plataforma. Substitui o `master` atual.
- **`gestor`** = dono/titular de uma conta (quem vai poder, nas próximas fases, convidar membros vinculados à própria conta). Substitui o `admin` atual, mas com escopo **diferente**: o `admin` atual gerencia outros clientes do SaaS; o `gestor` (a partir da Fase 2) gerenciará apenas membros da própria conta — não outros clientes.
- **`padrao`** = usuário comum. Mantém o nome, mas nas próximas fases passa a poder ser também "membro vinculado a uown conta de um gestor".

Esta Fase 1 cobre **apenas** a redefinição do enum e a migração dos guards de autorização — não cria nenhuma tabela nova de vínculo/permissão (isso é Fase 2 e 3). O objetivo é ter a base de papéis correta antes de construir vínculo e permissões em cima dela.

**Isso reabre uma decisão de escopo anterior**: o plano `.plans/unificar-perfil-conta-renomeacao-completa.md` (2026-09-02) registrou explicitamente como fora de escopo "repensar autenticação multi-usuário por conta... decisão explícita do usuário de não expandir para isso agora" (linha 33). Esta iniciativa reverte essa decisão.

## Escopo

### Dentro do escopo

- Migration de dados: todo usuário com `tipo = 'master'` → `tipo = 'admin'`; todo usuário com `tipo = 'admin'` → `tipo = 'gestor'` (reclassificação automática, decisão confirmada do usuário — não é revisão manual caso a caso).
- Alterar o `$type<...>` do Drizzle em `backend/src/db/schema/users.ts` para `'padrao' | 'gestor' | 'admin'`.
- Atualizar `TokenPayload` em `backend/src/middleware/auth.ts` para o novo union type.
- Reescrever os guards:
  - `requireMaster` (hoje: só `master`) → vira `requireAdmin` (hoje: `admin` OU `master`) com novo significado — só o `admin` (dev/plataforma) passa.
  - `requireAdmin` atual (hoje: `admin` OU `master`) → vira `requireGestor` — passa `gestor` OU `admin` (dev sempre pode o que gestor pode, mas não o contrário).
- Atualizar todos os pontos do backend que hoje checam `req.user.type === 'admin'` ou `'master'` (inventário confirmado abaixo) para o novo significado.
- Ajustar mensagens de erro correspondentes (ex.: "Admins only" → mensagem compatível com o novo papel esperado em cada rota).
- Testes manuais de regressão em todas as rotas de backoffice.

### Fora do escopo (tratado nas próximas fases)

- Qualquer tabela nova de vínculo membro↔conta (`conta_membros` ou equivalente) — Fase 2.
- Qualquer criação de membro por um `gestor` — Fase 2.
- Qualquer sistema de permissões granular/configurável — Fase 3.
- Tornar `usuarios.document` opcional — Fase 2 (só relevante quando existir criação de membro).
- Revisão manual individual de quem deveria ou não virar `gestor` — decisão confirmada do usuário: a reclassificação é automática e definitiva nesta fase; ajustes pontuais depois (se necessário) são responsabilidade manual do usuário via banco/painel, fora deste plano.

## Leitura de contexto

- `sistema financas/CLAUDE.md` — lido (regras de fluxo `/planejar → aprovação → /implementar → /finalizar`, proibição de alterar `.env`, migrations exigem confirmação explícita).
- `sistema financas/AGENT.md` — lido por completo. Descreve um modelo multi-tenant/multi-prefeitura genérico que **não se aplica literalmente** a este projeto (aqui o isolamento é por `usuario_id`/`conta_id`, não por prefeitura). Aplicados os princípios gerais de qualidade: Drizzle para queries novas, evitar `any`, não mascarar erros, validar no backend, nomes claros, seguir padrão existente.
- `frontend/AGENT.md` — não existe como arquivo dedicado neste projeto (confirmado via busca).
- `backend/AGENT.md` — não existe como arquivo dedicado neste projeto (confirmado via busca).
- `backend/src/db/schema/users.ts` — lido por completo (enum `tipo`, colunas de billing/plano).
- `backend/src/db/schema/accounts.ts` — lido por completo (`contas.usuario_id` único dono, `eh_padrao`).
- `backend/src/db/schema/expenses.ts`, `incomes.ts` — lidos por completo (`usuario_id` NOT NULL + `conta_id` opcional em ambos).
- `backend/src/middleware/auth.ts` — lido por completo (`authenticate`, `requireAdmin`, `requireMaster`, `requireActivePlan`).
- `backend/src/routes/users.ts` — inventário completo dos 17 endpoints feito via agente Explore (ver "Regras de negócio identificadas" abaixo).
- `backend/src/utils/ownerAndAccountWhere.ts` — lido por completo (`buildOwnerAndAccountWhere`, hoje só `master` pode consultar `usuario_id` de terceiros via query param).
- Grep completo no backend por `requireAdmin|requireMaster|req.user.type|req.user?.type` — inventário abaixo.
- `.plans/unificar-perfil-conta-renomeacao-completa.md` — lido por completo (decisão anterior sendo reaberta, linha 33 "Fora do escopo").
- `.plans/unificar-conta-perfis-login-documento.md` — lido por completo (confirma modelo atual de "conta" como multi-ledger de 1 login, não multi-pessoa).
- `backend/drizzle/0024_renomear_perfis_para_contas.sql`, `0025_backfill_conta_padrao.sql` — histórico de rename `perfil→conta`, referência de como migrations de rename foram estruturadas neste projeto.

## Impacto por área

### Frontend

- `src/services/usuariosService.ts`: qualquer lugar que exiba ou compare o valor de `tipo` (ex.: badge de papel, lista de admin) precisa refletir os novos rótulos (`admin`, `gestor`, `padrao`). Levantamento fino de onde `tipo` aparece na UI deve ser feito no início da implementação (grep por `'admin'`, `'master'` em `src/`).
- Nenhuma tela nova nesta fase — telas de gestão de membros/permissões são Fase 2/3.
- Textos visíveis que hoje dizem "Admin"/"Master" (se existirem em telas de backoffice) devem ser revisados para "Admin" (dev) / "Gestor" conforme o novo significado.

### Backend

**Schema:**
- `backend/src/db/schema/users.ts`: `type: varchar('tipo', ...).$type<'padrao' | 'gestor' | 'admin'>()`.

**Middleware (`backend/src/middleware/auth.ts`):**
- `TokenPayload.type`: `'padrao' | 'gestor' | 'admin'`.
- `requireMaster` → renomear para `requireAdmin` (novo significado: só `type === 'admin'`).
- `requireAdmin` atual → renomear para `requireGestor` (novo significado: `type === 'gestor' || type === 'admin'`).
- `requireActivePlan`: sem mudança de lógica (não depende de `type`).

**Rotas e arquivos com checagem de papel (inventário confirmado via grep — todos precisam ser revisados um a um):**
- `backend/src/routes/users.ts`: linhas 280, 305, 331, 362, 515, 534, 547, 561, 568, 595, 615, 634, 653 — maior concentração de lógica de papel do backend. Destaques que exigem atenção redobrada na migração de semântica:
  - `GET /` (linha ~331): hoje se o caller é `admin` (não `master`), força `tipo = 'padrao'` na busca — precisa virar: se caller é `gestor`, essa rota deixa de fazer sentido para ele (gestor não lista "outros clientes do sistema" — isso é Fase 2/3, listagem de membros da própria conta). Definir explicitamente nesta fase que `GET /` (listagem geral de usuários da plataforma) passa a ser exclusiva do novo `admin` (dev) — `gestor` não deve mais ter acesso a este endpoint.
  - `POST /` (linha 362, hoje `requireMaster`): criação de usuário via backoffice — vira exclusiva do novo `requireAdmin` (dev). Não deve ser reaproveitada para "gestor cria membro" (isso é um endpoint novo e diferente na Fase 2).
  - `GET/PUT /:id`, `PUT /:id/status` (hoje `requireAdmin`, restrito a targets `tipo === 'padrao'`): avaliar se essas rotas de backoffice devem continuar existindo para o novo `gestor` (dono de conta) ou se, dado o novo significado, passam a ser exclusivas do novo `admin` (dev). **Decisão recomendada nesta fase**: tornar essas rotas exclusivas de `requireAdmin` (dev) — gestão de "outros clientes/usuários da plataforma" não é mais papel do `gestor`, que só gerenciará membros da própria conta a partir da Fase 2, via endpoints novos e separados.
  - `DELETE /:id` (linha ~615, hoje `requireMaster`): exclusão hard de usuário — vira exclusiva do novo `requireAdmin` (dev).
  - `GET /stats/general` (hoje `requireMaster`): estatísticas globais — vira exclusiva do novo `requireAdmin` (dev).
- `backend/src/routes/ai-integrations.ts` (linhas 12, 21, 43, hoje `requireMaster`): configuração de provedores de IA — mantém exclusivo do novo `requireAdmin` (dev), sem mudança de comportamento esperado além do rename.
- `backend/src/routes/plans.ts` (linha 342, hoje `requireAdmin` em `POST /activate`): ativação manual de plano — **decisão a confirmar na implementação**: isso é operação de backoffice (deveria ser só `admin`/dev) ou algo que um `gestor` também poderia fazer para a própria conta? Recomendação: manter como `requireAdmin` (dev-only), já que é ativação manual/excepcional de billing, tipicamente suporte.
- `backend/src/routes/cards.ts` (linha 17), `backend/src/routes/categories.ts` (linha 21): hoje `req.user.type === 'master'` permite passar `usuario_id` arbitrário via query param (inspeção tipo suporte). Vira `req.user.type === 'admin'` (novo dev).
- `backend/src/routes/expenses.ts` (linha 188), `backend/src/routes/incomes.ts` (linha 27), `backend/src/utils/ownerAndAccountWhere.ts` (linha 19): mesma checagem `userType === 'master'` dentro de `buildOwnerAndAccountWhere` — vira `userType === 'admin'`.
- `backend/src/modules/futebol/routes/championships.ts`: módulo separado (escalação futebol), tem seu próprio `requireAdminAccount` local, **não usa o enum `tipo` de `usuarios`** — fora do escopo, não precisa de alteração.

### Banco de dados

**Migration de dados** (nova, `backend/drizzle/00XX_redefinir_papeis_usuarios.sql`):

```sql
-- Reclassificação automática e definitiva, conforme decisão do usuário:
UPDATE usuarios SET tipo = 'admin' WHERE tipo = 'master';
UPDATE usuarios SET tipo = 'gestor' WHERE tipo = 'admin';
```

**Atenção à ordem**: a segunda linha não pode rodar antes da primeira terminar de fato reclassificar todos os `master`, senão os ex-`master` (já virados `admin` pela primeira linha) seriam incorretamente pegos pela segunda `UPDATE ... WHERE tipo = 'admin'` e virariam `gestor` também. **Isso é um bug real se as duas rodarem como uma única declarative UPDATE sem cuidado de ordem** — a migration final precisa:
1. Rodar a atualização `master → admin` e confirmar commit/conclusão.
2. Só então rodar `admin → gestor`, usando uma condição que não pegue os que acabaram de virar `admin` nesta mesma migration (ex.: capturar os IDs `admin` originais **antes** da primeira UPDATE, em uma CTE/tabela temporária, ou simplesmente inverter a ordem lógica: primeiro capturar todos os `id` que são `admin` hoje, depois capturar todos que são `master` hoje, aplicar as duas atualizações a partir desses conjuntos fixos, não em cascata).

Nenhuma coluna nova nesta fase — é puro UPDATE de dados existentes + mudança de tipo TypeScript no schema Drizzle (o `varchar` já comporta os novos valores string, não requer `ALTER TABLE`).

**Índice `idx_usuarios_tipo`** já existe (`users.ts` linha 52) — sem necessidade de mudança.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/db/schema/users.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/routes/users.ts`
- `backend/src/routes/ai-integrations.ts`
- `backend/src/routes/plans.ts`
- `backend/src/routes/cards.ts`
- `backend/src/routes/categories.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/utils/ownerAndAccountWhere.ts`
- `src/services/usuariosService.ts` (revisão de rótulos exibidos, se houver)
- Nova migration: `backend/drizzle/00XX_redefinir_papeis_usuarios.sql`

## Estratégia de implementação

1. Escrever (sem executar) a migration de reclassificação, com cuidado especial na ordem `master→admin` antes de `admin→gestor` (usar conjunto de IDs capturado antes de qualquer UPDATE, não cascata).
2. Rodar query de diagnóstico somente leitura (`SELECT tipo, COUNT(*) FROM usuarios GROUP BY tipo`) e reportar ao usuário quantos usuários serão afetados por cada reclassificação, antes de aplicar.
3. Atualizar `backend/src/db/schema/users.ts` (tipo TypeScript).
4. Atualizar `backend/src/middleware/auth.ts` (`TokenPayload`, renomear/reescrever guards).
5. Atualizar `backend/src/routes/users.ts` endpoint por endpoint, confirmando build a cada bloco lógico.
6. Atualizar `ai-integrations.ts`, `plans.ts`, `cards.ts`, `categories.ts`, `expenses.ts`, `incomes.ts`, `ownerAndAccountWhere.ts`.
7. Rodar `cd backend && npm run build` e `npx tsc --noEmit`.
8. Revisar frontend (`usuariosService.ts` e telas de backoffice, se existirem) por qualquer rótulo/lógica de `tipo` desatualizado.
9. Rodar build do frontend.
10. Apresentar resumo, pedir confirmação explícita separada para aplicar a migration em produção.
11. Após aplicar: testar manualmente login de um usuário de cada papel (o novo `admin`, o novo `gestor`, `padrao`), confirmar que rotas de backoffice funcionam para `admin` e são corretamente bloqueadas para `gestor`.

## Regras de negócio identificadas

- `admin` (novo) = acesso total à plataforma, substitui `master`. Único papel que pode: listar/gerenciar todos os usuários (`GET/POST/PUT/DELETE /users`), ver estatísticas globais, configurar integrações de IA, ativar planos manualmente, inspecionar dados de qualquer usuário via `usuario_id` em query params.
- `gestor` (novo) = dono de conta. Nesta fase, **não ganha nenhuma capacidade nova ainda** (isso é Fase 2/3) — apenas deixa de ter acesso às rotas de backoffice que o `admin` (antigo) tinha, já que esse acesso não faz mais sentido semântico para "dono de conta familiar".
- `padrao` = usuário comum, sem mudança de comportamento nesta fase.
- Reclassificação de dados é automática e definitiva: todo `master` vira `admin`; todo `admin` (antigo) vira `gestor`.

## Regras multi-tenant e segurança

- Não há dimensão multi-prefeitura neste projeto; o equivalente de isolamento é `usuario_id`/`conta_id`.
- **Risco central desta fase**: usuários que eram `admin` (antigo, com acesso de backoffice a outros clientes) perdem esse acesso ao virar `gestor`. Isso é uma mudança de comportamento real e intencional — precisa ser comunicada/validada com o usuário antes do deploy, pois qualquer processo operacional que dependesse desse acesso (ex.: suporte ao cliente feito por alguém com conta `admin` antiga) para de funcionar até esse usuário ser manualmente promovido a `admin` novo.
- Nenhuma rota deve permitir que um `gestor` acesse dados de outro `usuario_id` que não seja o próprio — isso só é reintroduzido de forma controlada (vínculo de conta) na Fase 2.
- Mensagens de erro dos guards devem continuar genéricas, sem revelar detalhes de papel de terceiros.

## Validações necessárias

- Migration: nenhum usuário deve escapar da reclassificação (validar `COUNT` antes/depois bate).
- Nenhuma rota deve ficar sem guard após o rename (checar se algum `requireAdmin`/`requireMaster` antigo não foi atualizado por engano, deixando uma rota sem proteção nenhuma se o nome for reaproveitado incorretamente).
- Confirmar que `requireActivePlan` continua funcionando sem alteração (não depende de `type`).

## Testes necessários

### Backend

- Login com usuário `admin` (novo) — acessa `GET /users`, `POST /users`, `DELETE /users/:id`, `GET /stats/general`, `ai-integrations`, `plans/activate`.
- Login com usuário `gestor` (ex-admin) — **não** acessa mais nenhuma das rotas acima (deve retornar 403).
- Login com usuário `padrao` — comportamento inalterado (acesso só a `/me`, `/current`, dados próprios).
- `buildOwnerAndAccountWhere`: usuário `admin` ainda consegue consultar `usuario_id` de terceiro via query param; `gestor`/`padrao` não conseguem (comportamento igual ao `master`/não-`master` de antes, só renomeado).

### Frontend

- Nenhuma tela deve quebrar ao exibir o novo valor de `tipo` (se exibido em algum lugar).

### E2E

- Fluxo: usuário que era `master` faz login após migration → confirma que ainda tem acesso total (agora como `admin`).
- Fluxo: usuário que era `admin` faz login após migration → confirma que perdeu acesso de backoffice (agora `gestor`) e recebe 403 nas rotas restritas ao novo `admin`.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- **Risco de ordem na migration** (`master→admin` antes de `admin→gestor` sem cascata incorreta) — detalhado na seção de Banco de Dados, deve ser tratado com CTE/conjunto de IDs fixado, não UPDATEs sequenciais ingênuos.
- **Mudança de comportamento real para usuários existentes** (ex-`admin` perde acesso de backoffice) — comunicar/validar com o usuário antes do deploy.
- Renomear guards (`requireMaster`→`requireAdmin`, `requireAdmin`→`requireGestor`) tem alto potencial de troca de nome incorreta em algum import — revisar cada arquivo importador após o rename, não confiar apenas no build TypeScript (nomes trocados que ainda compilam, mas com guard errado, são o pior cenário aqui).
- Este é o alicerce das Fases 2 e 3 — qualquer erro de semântica aqui se propaga.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões confirmadas com o usuário (reclassificação automática, definição dos 3 papéis).

## Critérios de aceite do plano

- `usuarios.tipo` aceita e usa `'padrao' | 'gestor' | 'admin'` em todo o backend.
- Todo usuário `master` anterior é `admin`; todo usuário `admin` anterior é `gestor`.
- Rotas de backoffice (gestão de outros usuários da plataforma, stats globais, ai-integrations, ativação manual de plano) são exclusivas do novo `admin`.
- `gestor` não tem nenhuma capacidade nova nesta fase — só perde o acesso de backoffice que o `admin` antigo tinha.
- Nenhuma migration executada sem confirmação explícita separada do usuário.
- Build do backend e do frontend passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar a migration sem confirmação explícita separada — rodar antes a query de diagnóstico somente leitura e reportar quantos usuários são afetados.
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados; aplicar princípios gerais do `AGENT.md` da raiz onde fizerem sentido — Drizzle, nomes claros, sem `any`, validação no backend).
- Este plano é a Fase 1 de 3. As Fases 2 (`vinculo-membros-conta-familiar.md`) e 3 (`permissoes-configuraveis-por-membro.md`) dependem desta estar concluída e validada em produção antes de começar.
- Revisar cada import de `requireAdmin`/`requireMaster` manualmente após o rename — não confiar só no TypeScript compilar, já que um guard trocado por engano ainda compila.
