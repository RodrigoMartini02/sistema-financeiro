# Plano de Implementação: Correção de categorias PF/PJ misturadas e catálogo compartilhado para membros

## Origem
- Origem: diagnóstico conversacional (sem arquivo `.md` de especificação — escopo definido em conversa)
- Data do planejamento: 2026-09-15
- Classificação: **fullstack + database**

## Resumo
Duas correções no domínio de categorias do `sistema financas`: (a) três telas do frontend listam categorias sem passar `conta_id`, causando mistura de categorias pessoais e empresariais quando o fallback via `localStorage` falha; (b) o modelo de dados trata categoria custom como pertencente a quem criou (`usuario_id`), não à conta (`conta_id`) — isso quebra o catálogo compartilhado de família quando um membro cria uma categoria, já que o modelo de "conta é dona do dado" foi aplicado a lançamentos (migration 0031) mas nunca replicado a categorias.

## Escopo

### Dentro do escopo
- Frontend: `CategoriasTab.tsx`, `useOnboardingChecklist.ts`, `FinancialAssistant.tsx` passam a chamar `fetchCategorias` com `conta_id` explícito.
- Backend: `POST/PUT/DELETE /api/categories` (`categorias`) passam a resolver dono/escopo de dedup por **conta pessoal compartilhada** (dono + membros ativos) em vez de só `usuario_id`, quando a conta é pessoal.
- Banco: nova migration substituindo o índice único de categoria custom, de `(usuario_id, LOWER(nome), conta_id)` para `(conta_id, LOWER(nome))`.
- Testes: novos testes de unidade para a função de resolução de dono/dedup de categoria custom.

### Fora do escopo
- Reclassificação retroativa de categorias órfãs já mal atribuídas no banco (migration 0018b) — é uma limpeza de dados separada, não desta correção estrutural.
- Mudança em conta empresa (permanece isolada por usuário, sem catálogo compartilhado).
- Qualquer alteração em `.env` ou execução de migration.

## Leitura de contexto
- `sistema financas/AGENT.md` — lido. Único AGENT.md do projeto (não existem `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos dedicados; o projeto não tem pasta `frontend/` separada — o código de UI fica em `src/` na raiz). O conteúdo é um template genérico de sistema multi-prefeitura/RLS que não corresponde ao domínio real deste projeto (financeiro pessoal/PJ); apliquei os princípios transferíveis (Drizzle-first, filtro explícito de escopo de dados — aqui `conta_id` cumpre o papel do "tenant" —, validar origem no backend, nomes claros, sem `any`, sem `catch` silencioso) e ignorei o que é específico de prefeitura/PDF/RLS.
- `CLAUDE.md` da raiz do repo — regras de workflow `/planejar → aprovação → /implementar → /finalizar`, sem PR, direto pra main.
- Arquivos investigados no projeto: `backend/src/db/schema/categories.ts`, `backend/src/routes/categories.ts`, `backend/src/utils/familyVisibility.ts`, `backend/src/services/defaultCategories.ts`, `backend/drizzle/0017*.sql`, `0018*.sql`, `0018b*.sql`, `0024*.sql`, `0031*.sql`, `backend/src/services/catalogo.test.ts` (padrão de teste), `src/services/configService.ts`, `src/services/apiClient.ts`, `src/services/queryKeys.ts`, `src/screens/config/CategoriasTab.tsx`, `src/hooks/useOnboardingChecklist.ts`, `src/components/financial-assistant/FinancialAssistant.tsx`, `src/screens/finance/ExpenseForm.tsx` (padrão correto de referência), `src/screens/finance/ExpenseDialog.tsx`.

## Impacto por área

### Frontend
- **`src/screens/config/CategoriasTab.tsx:251`** — trocar `fetchCategorias()` por `fetchCategorias(getActiveAccountId())`, e usar `queryKeys.categorias(accountId)` na chave, seguindo o padrão de `ExpenseForm.tsx:138`. Adicionar `enabled: !!accountId` não está no escopo aprovado (decisão foi só corrigir a chamada); mas caso `getActiveAccountId()` retorne `null`, o comportamento de fallback do backend (sem filtro) permanece — ver "Perguntas em aberto".
- **`src/hooks/useOnboardingChecklist.ts:67`** — mesma correção.
- **`src/components/financial-assistant/FinancialAssistant.tsx:338-343`** — mesma correção. Avaliar se deve usar `draft?.contaId` (conta selecionada no lançamento em edição) em vez de `getActiveAccountId()`, já que o componente já resolve `contaEhEmpresa` a partir do draft — usar consistentemente a mesma fonte evita nova divergência.
- Sem mudança em `queryKeys.ts` (já suporta parametrização).
- Sem impacto em `ExpenseForm.tsx`/`ExpenseDialog.tsx` (já corretos).

### Backend
- **`backend/src/routes/categories.ts`**:
  - `POST /` (linha 171-236): ao criar categoria custom em conta pessoal com membros, resolver o `usuario_id` gravado como o **dono da conta** (via `resolveAccountOwnerId`), não `req.user!.id`, para que a categoria pertença à conta desde a criação — igual já acontece na leitura.
  - Checagem de duplicidade (linha 214-217): trocar `WHERE usuario_id = $1 ... AND conta_id IS NOT DISTINCT FROM $3` por checagem escopada a `conta_id` quando houver conta pessoal compartilhada.
  - `PUT /:id` (linha 239-290) e `DELETE /:id` (linha 349-387): hoje buscam a categoria existente com `AND eq(categories.userId, req.user!.id)` — isso já bloquearia o dono de editar uma categoria criada por um membro (e vice-versa) mesmo depois da correção de `POST`. Precisa trocar para checagem por conjunto de usuários visíveis da conta (mesmo padrão de `resolveVisibleUserIds`), preservando a regra de permissão (só quem tem acesso à conta edita).
  - `GET /stats/usage` (linha 100-118) e `GET /:id` (linha 144-168): mesma limitação de `userId` fixo — avaliar se precisam do mesmo tratamento (ficará mais claro na implementação, mas é provável que sim para consistência).
- **`backend/src/utils/familyVisibility.ts`**: possivelmente adicionar uma função nova, ex. `resolveCategoryWriteScope`, que devolve o `conta_id`/`usuario_id` corretos para gravação/dedup de categoria custom em conta pessoal compartilhada — reaproveitando a mesma checagem de vínculo ativo já usada em `resolveAccountOwnerId`, sem duplicar a query de `conta_membros`.
- Sem mudança em `defaultCategories.ts` (categorias PADRÃO já funcionam corretamente por tipo).

### Banco de dados
- Nova migration `0040_categorias_custom_por_conta.sql`:
  - Trocar índice único `idx_categorias_usuario_nome_conta_custom` de `(usuario_id, LOWER(nome), conta_id)` para `(conta_id, LOWER(nome))` — unicidade passa a ser por conta, não por usuário+conta.
  - Antes de criar o índice novo, checar duplicatas existentes (mesmo nome, mesma conta, usuários diferentes) — se existirem, a criação do índice único falha. O plano inclui uma query de diagnóstico (somente leitura) para checar isso antes de decidir a estratégia de deduplicação (não decidido ainda — ver perguntas em aberto).
- **Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

Rascunho do SQL (baseado no padrão dos arquivos existentes em `backend/drizzle/`):

```sql
-- 0040_categorias_custom_por_conta.sql
--
-- Corrige o modelo de categoria CUSTOM: ate aqui a unicidade e a gravacao
-- eram por (usuario_id, nome, conta_id) — a categoria pertencia a quem
-- criou, nao a conta. Isso quebra o catalogo compartilhado de familia (ver
-- 0031_lancamentos_compartilhados_familia.sql, que ja tornou a conta dona
-- dos LANCAMENTOS): categoria custom criada por um membro ficava presa ao
-- usuario_id dele e nao aparecia nem para ele nem para o resto da familia.
--
-- A partir desta migration, unicidade de categoria custom e por
-- (conta_id, nome) — a conta e a dona do catalogo, usuario_id continua
-- existindo apenas como autoria (quem criou).
--
-- Do not execute automatically. Confirm the target database before applying.

-- Diagnostico (rodar manualmente antes, fora desta migration): duplicatas de
-- nome dentro da mesma conta, sob usuarios diferentes, que vao colidir no
-- indice novo:
--
-- SELECT conta_id, LOWER(nome), COUNT(DISTINCT usuario_id)
--   FROM categorias
--  WHERE conta_id IS NOT NULL
--  GROUP BY conta_id, LOWER(nome)
-- HAVING COUNT(*) > 1;

DROP INDEX IF EXISTS idx_categorias_usuario_nome_conta_custom;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_conta_nome_custom
  ON categorias (conta_id, LOWER(nome))
  WHERE conta_id IS NOT NULL;
```

## Arquivos provavelmente afetados
- `sistema financas/backend/drizzle/0040_categorias_custom_por_conta.sql` (novo)
- `sistema financas/backend/src/routes/categories.ts`
- `sistema financas/backend/src/utils/familyVisibility.ts`
- `sistema financas/backend/src/utils/familyVisibility.test.ts` (novo, se não existir)
- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/hooks/useOnboardingChecklist.ts`
- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx`

## Estratégia de implementação
1. Rodar a query de diagnóstico (leitura) para checar duplicatas de nome por conta antes de decidir se a migration precisa de um passo de deduplicação.
2. Escrever `resolveCategoryWriteScope` (ou nome equivalente) em `familyVisibility.ts`, cobrindo: conta pessoal com membro → devolve dono; conta empresa ou sem membros → devolve `usuario_id` do próprio requester.
3. Ajustar `POST /api/categories` para usar essa resolução ao gravar `usuario_id` e ao checar duplicidade.
4. Ajustar `PUT/DELETE/GET /:id` e `GET /stats/usage` para localizar a categoria pelo conjunto de usuários visíveis da conta, não só `req.user!.id`.
5. Escrever a migration `0040` (índice novo), sem executar.
6. Escrever testes de unidade para `resolveCategoryWriteScope` (padrão `node:test`, ver `catalogo.test.ts`).
7. Corrigir os 3 call sites do frontend para passar `conta_id` explícito.
8. Validar manualmente: dono cria categoria → membro vê; membro cria categoria → dono e outros membros veem; conta empresa continua isolada.

## Regras de negócio identificadas
- Categoria PADRÃO: global por `tipo` (pessoal/empresa) do usuário, nunca muda.
- Categoria CUSTOM em conta pessoal compartilhada: pertence à conta, visível e editável por dono + membros ativos com vínculo, independente de quem criou.
- Categoria CUSTOM em conta empresa: continua isolada por usuário (colaboradores não compartilham catálogo).
- Autoria (quem criou de fato) deixa de ser o critério de posse/visibilidade — vira metadado, igual já é para lançamentos.

## Regras multi-tenant e segurança
- "Tenant" aqui é `conta_id`/vínculo de membro — toda resolução de escopo deve continuar validando o vínculo ativo (`conta_membros.status = 'ativo'`) e nunca confiar em `conta_id` vindo do client sem checar propriedade/vínculo, seguindo o padrão já usado em `resolveAccountOwnerId`.
- Cuidado para não abrir uma brecha onde um membro sem `acesso_lancamentos_familia` (mas com permissão de cadastrar categoria) ganhe acesso indevido a editar/apagar categoria de outro membro além do previsto — restringir à intenção original: catálogo compartilhado, não permissão ampliada de edição de dados de terceiros.

## Validações necessárias
- Confirmar que `conta_id` enviado em `POST/PUT/DELETE` pertence de fato a uma conta que o requester acessa (dono ou membro ativo) — já existe via `resolveAccountType`, reaproveitar.
- Validar que a query de diagnóstico de duplicatas roda antes da migration.

## Testes necessários

### Backend
- `resolveCategoryWriteScope`: dono em conta pessoal sem membros → próprio id; membro ativo em conta pessoal → id do dono; conta empresa → sempre próprio id; vínculo inativo/inexistente → próprio id (nunca abre acesso).
- Dedup de nome por conta (não mais por usuário).

### Frontend
- Sem teste automatizado previsto (projeto não tem suíte de teste de componentes para essas telas); validação manual conforme passo 8.

### E2E
- Nenhum previsto (projeto não usa E2E atualmente, pelo que foi observado).

## Comandos de validação sugeridos
```bash
npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" test
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção
- Migration pode falhar na criação do índice se já existirem duplicatas de nome dentro da mesma conta sob usuários diferentes — precisa rodar o diagnóstico antes.
- Banco pode estar em produção — migration não deve ser executada nesta etapa nem na de implementação sem confirmação explícita separada.
- Mudança de `PUT/DELETE` para aceitar múltiplos `usuario_id` visíveis amplia superfície de quem pode editar/apagar — precisa ficar restrito exatamente ao vínculo de conta pessoal compartilhada, não geral.
- `FinancialAssistant.tsx` pode precisar usar `draft?.contaId` em vez de `getActiveAccountId()` para consistência com `contaEhEmpresa` já calculado ali — decidir na implementação olhando o fluxo real do componente.

## Perguntas em aberto
1. Ao rodar a query de diagnóstico, se houver duplicatas de nome dentro da mesma conta (ex.: dono criou "Mercado" e um membro também criou "Mercado" antes desta correção), qual critério de deduplicação usar (manter a mais antiga? mesclar lançamentos apontando pra ela)? Isso só pode ser decidido depois de ver o resultado real da query — não decidir agora às cegas.
2. `GET /api/categories` sem `conta_id` (quando `getActiveAccountId()` retorna `null` mesmo após a correção do frontend) deve continuar retornando tudo misturado como fallback, ou deve passar a retornar vazio/erro explícito para não mascarar o problema de novo no futuro?

## Critérios de aceite do plano
- Dono de conta pessoal compartilhada cria categoria → membro vê a mesma categoria.
- Membro com permissão cria categoria → dono e demais membros veem a mesma categoria.
- Conta empresa não sofre nenhuma mudança de comportamento.
- `CategoriasTab`, `useOnboardingChecklist`, `FinancialAssistant` nunca mais chamam a listagem sem `conta_id` explícito.
- Migration nova documentada e revisada, mas não executada.

## Observações para a skill implementar
- Usar este plano como fonte principal de contexto.
- Não executar a migration `0040` sem confirmação explícita do usuário — o ambiente pode estar apontando para produção.
- Rodar a query de diagnóstico de duplicatas antes de decidir a forma final do índice.
- Seguir o `AGENT.md` da raiz nos princípios transferíveis (Drizzle-first, nomes claros, sem `any`, sem `catch` silencioso, validar tenant/escopo no backend).
- Manter alterações pequenas e focadas — não misturar com a limpeza de categorias órfãs (fora de escopo).
- Resolver as duas perguntas em aberto antes ou durante a implementação, não assumir uma resposta.
