# Plano de Implementação: Corrigir cadastro incompleto (ON CONFLICT quebrado + falta de transação no /register) e reparar contas afetadas

## Origem

- Arquivo de especificação: nenhum `.md` de feature — plano originado de investigação de bug relatado pelo usuário (tela "Categorias" vazia após cadastro de conta CNPJ).
- Data do planejamento: 2026-08-20
- Classificação: `backend + database` (correção de código + reparo de dados; nenhuma migration de schema nova é necessária)

## Resumo

Dois bugs distintos e relacionados causam cadastros incompletos no sistema:

1. **Causa raiz determinística**: a migration `backend/drizzle/0018_categorias_perfil_custom.sql` substituiu o índice único de `categorias` — dropou `idx_categorias_usuario_nome_tipo` (`usuario_id, LOWER(nome), COALESCE(tipo,'pessoal')`) e criou dois índices parciais: `idx_categorias_usuario_nome_tipo_padrao` (`usuario_id, LOWER(nome), tipo` WHERE `perfil_id IS NULL`) e `idx_categorias_usuario_nome_perfil_custom` (`usuario_id, LOWER(nome), perfil_id` WHERE `perfil_id IS NOT NULL`). Porém `backend/src/services/defaultCategories.ts:60-64` nunca foi atualizado — o `INSERT ... ON CONFLICT (usuario_id, LOWER(nome), COALESCE(tipo, 'pessoal')) DO NOTHING` referencia uma expressão que não corresponde a nenhum índice único existente. O Postgres rejeita essa query com erro (`there is no unique or exclusion constraint matching the ON CONFLICT specification`). Confirmado via consulta read-only aos índices reais em produção.

2. **Falta de atomicidade em `POST /register`**: em `backend/src/routes/auth.ts` (linhas ~169-200), a rota insere o `usuario` (Drizzle), depois chama `ensureDefaultCategories` (que falha pelo motivo acima), e só depois insere o `perfil`. Como não há transação, quando `ensureDefaultCategories` lança exceção, o `usuario` já criado permanece no banco, mas o `perfil` nunca é criado — o cadastro fica pela metade.

**Impacto confirmado em produção** (consulta read-only, banco Render): de 6 usuários totais, 2 contas ficaram com cadastro quebrado (sem perfil e sem categoria alguma):
- `id=11` — "teste", email `fingerence@gmail.com`, CPF `08996441989`, cadastrada em 2026-08-19.
- `id=12` — "Aether Software", email `admin@aethersoftware.com.br`, CNPJ `66849164000104`, cadastrada em 2026-08-20 (a conta que motivou esta investigação).

`id=9` ("Admin") e `id=10` ("Admin Dev") têm perfil mas zero categorias — criadas via `POST /users` (rota administrativa que não chama `ensureDefaultCategories`), portanto não são afetadas pelo mesmo bug e ficam fora do escopo deste reparo.

## Escopo

### Dentro do escopo

- Corrigir o `ON CONFLICT` em `backend/src/services/defaultCategories.ts` para corresponder ao índice único real (`idx_categorias_usuario_nome_tipo_padrao`): `ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE perfil_id IS NULL DO NOTHING` — coerente com o fato de que `ensureDefaultCategories` sempre insere com `perfil_id` implicitamente `NULL` e `tipo` preenchido.
- Envolver a sequência de `POST /register` (insert de `users` + `ensureDefaultCategories` + insert de `profiles`) em uma transação Drizzle (`db.transaction`), com rollback automático se qualquer etapa falhar — nenhum registro parcial (nem o usuário) deve persistir se o cadastro não completar.
- Adaptar `ensureDefaultCategories` para aceitar opcionalmente um executor de transação Drizzle, preservando compatibilidade total com as chamadas existentes fora de transação (`backend/src/routes/categories.ts:85`, `backend/src/routes/users.ts:678`, `backend/src/routes/profiles.ts:53,81`).
- Reparar as contas `id=11` e `id=12` via script one-off (não migration): criar o perfil faltante e as categorias padrão correspondentes.
  - `id=11`: perfil tipo `pessoal`, nome "Pessoal" (mesmo default usado em cadastro normal via CPF) + categorias padrão pessoais (`PERSONAL_DEFAULT_CATEGORIES`).
  - `id=12`: perfil tipo `empresa`, nome/nome_fantasia "Aether" (a partir do `nome_fantasia` já usado no cadastro original), documento `66849164000104` + categorias padrão de empresa (`BUSINESS_DEFAULT_CATEGORIES`).
- Validar manualmente após a correção: novo cadastro de teste (CPF e CNPJ) cria perfil + categorias corretamente, sem erro 500.

### Fora do escopo

- `POST /profiles` (`backend/src/routes/profiles.ts`) — mesmo padrão de falta de transação (insert de perfil + `ensureDefaultCategories` sem transação), mas não está quebrado pelo bug do `ON CONFLICT` da mesma forma crítica confirmada em `/register`. Fica registrado como risco para um plano futuro, não é alterado aqui.
- Contas `id=9` e `id=10` (zero categorias por motivo diferente — criadas via rota administrativa).
- Qualquer migration nova de schema — os índices únicos já existem corretamente em produção (migration `0018` já aplicada); o problema é exclusivamente o código desalinhado com o schema atual.
- Alterações em `POST /categories/default` ou `DELETE /users/:id/clear-data` além do que a correção de `ensureDefaultCategories` já resolve automaticamente (ambas chamam a mesma função corrigida).

## Leitura de contexto

- `sistema financas/AGENT.md` — lido (mesma ressalva já registrada em plano anterior: descreve contexto multi-tenant/multi-prefeitura genérico que não corresponde a este projeto; aplicadas as diretrizes gerais de qualidade — Drizzle, nomes claros, evitar `any`, seguir padrão existente — e ignoradas as específicas de isolamento multi-prefeitura).
- `frontend/AGENT.md` — não existe como arquivo separado neste projeto.
- `backend/AGENT.md` — não existe como arquivo separado neste projeto.
- `sistema financas/backend/src/routes/auth.ts` — lido por completo (rota `POST /register` com o bug de atomicidade).
- `sistema financas/backend/src/services/defaultCategories.ts` — lido por completo (função com o `ON CONFLICT` quebrado).
- `sistema financas/backend/src/routes/categories.ts` — lido por completo (outro chamador de `ensureDefaultCategories`, e referência do filtro de exibição de categorias).
- `sistema financas/backend/src/routes/profiles.ts` — lido parcialmente (padrão similar de `ensureDefaultCategories` fora de transação, fora do escopo).
- `sistema financas/backend/src/routes/users.ts` — outro chamador de `ensureDefaultCategories` (linha 678).
- `sistema financas/backend/src/db/schema/profiles.ts` — lido por completo (confirma ausência de constraint unique em `document`).
- `sistema financas/backend/src/db/client.ts` — lido (confirma que `db` é `drizzle(pool, {...})`, suporta `db.transaction` nativamente).
- `sistema financas/backend/src/services/plan-lifecycle.ts` — lido (padrão existente de uso de `db.transaction(async (transaction) => {...})` no projeto, usado como referência de estilo).
- `sistema financas/backend/drizzle/0017_categorias_tipo.sql` e `0018_categorias_perfil_custom.sql` — lidos por completo (histórico das migrations que criaram/substituíram os índices únicos de `categorias`).
- Consultas read-only ao banco de produção (Render), autorizadas explicitamente pelo usuário: índices reais de `categorias`, contas sem perfil/categoria, contagem total de usuários.

## Impacto por área

### Frontend

`Sem impacto esperado`. O bug e a correção são inteiramente no backend; a tela "Categorias" já consome `GET /categories?perfil_id=X` corretamente — ela mostra vazio porque não há dado, não porque o frontend está errado.

### Backend

- `backend/src/services/defaultCategories.ts`:
  - Corrigir a cláusula `ON CONFLICT` do `INSERT` em `categorias` (linha ~60-64) para `ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE perfil_id IS NULL DO NOTHING`, compatível com o índice `idx_categorias_usuario_nome_tipo_padrao` realmente existente.
  - Adaptar a assinatura de `ensureDefaultCategories` para aceitar um executor opcional (Drizzle `transaction` ou `db`/`pool` padrão), permitindo que a função rode dentro de uma transação quando chamada por `POST /register`, sem quebrar as chamadas existentes que não usam transação.
- `backend/src/routes/auth.ts`:
  - Envolver o bloco de `POST /register` que insere `users`, chama `ensureDefaultCategories` e insere `profiles` em `db.transaction(async (transaction) => {...})`, seguindo o padrão já usado em `backend/src/services/plan-lifecycle.ts`.
  - Garantir que o `INSERT` de `profiles` (hoje via `db.insert(profiles)...`) use o `transaction` em vez do `db` global dentro do bloco.
- Nenhuma mudança de validação, permissão ou regra de negócio de autenticação — só correção de bug de persistência.

### Banco de dados

`Sem impacto de migration`. Os índices únicos corretos (`idx_categorias_usuario_nome_tipo_padrao`, `idx_categorias_usuario_nome_perfil_custom`) já existem em produção desde a migration `0018`. O reparo de dados (criar perfil + categorias para `id=11` e `id=12`) é uma operação pontual via script Node, não uma migration versionada — mas mexe em dados de produção e precisa de confirmação explícita antes de executar, seguindo a mesma régua de cautela usada para migrations.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/services/defaultCategories.ts`
- `sistema financas/backend/src/routes/auth.ts`
- Script one-off temporário (fora do controle de versão, em `sistema financas/backend/scripts/`, removido após uso) para reparar `id=11` e `id=12`.

## Estratégia de implementação

1. Em `defaultCategories.ts`, corrigir o `ON CONFLICT` do `INSERT` em `categorias` para `ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE perfil_id IS NULL DO NOTHING`, testando a sintaxe exata contra o índice parcial real.
2. Ajustar a assinatura de `ensureDefaultCategories(userId, profileType, executor?)` para aceitar um executor Drizzle opcional (tipo compatível com `db` e com o `transaction` recebido em `db.transaction(async (transaction) => ...)`), usando esse executor para as queries em vez de `pool` fixo, com fallback para o comportamento atual quando nenhum executor for passado.
3. Atualizar as chamadas existentes (`categories.ts:85`, `users.ts:678`, `profiles.ts:53,81`) apenas se a mudança de assinatura exigir — o objetivo é manter compatibilidade sem alterar comportamento dessas rotas.
4. Em `auth.ts`, envolver o bloco de criação do usuário (`db.insert(users)...`), chamada a `ensureDefaultCategories` e criação do perfil (`db.insert(profiles)...`) dentro de `db.transaction(async (transaction) => {...})`, substituindo `db` por `transaction` nessas três operações.
5. Rodar o backend localmente e testar um cadastro novo de CPF e um de CNPJ, confirmando que perfil e categorias são criados corretamente sem erro 500.
6. Escrever e revisar com o usuário um script one-off (não versionado) que, para `id=11` e `id=12`:
   - Insere o perfil faltante (`pessoal`/`empresa` conforme o caso).
   - Chama a versão corrigida de `ensureDefaultCategories` para popular as categorias padrão.
7. Executar o script de reparo somente após confirmação explícita do usuário, rodando contra o banco de produção (Render).
8. Validar no banco (SELECT read-only) que `id=11` e `id=12` agora têm perfil e categorias corretas.
9. Remover o script one-off após uso bem-sucedido.

## Regras de negócio identificadas

- Categorias padrão "pessoal" (`PERSONAL_DEFAULT_CATEGORIES`, 10 itens) devem ser criadas para todo cadastro com CPF.
- Categorias padrão "empresa" (`BUSINESS_DEFAULT_CATEGORIES`, 14 itens) devem ser criadas para todo cadastro com CNPJ.
- Uma categoria padrão (tipo preenchido, `perfil_id` nulo) é global para todos os perfis daquele tipo do usuário — não é reinserida se já existir (`ON CONFLICT DO NOTHING`), o que deve continuar valendo após a correção.
- O cadastro de usuário deve ser tudo-ou-nada: se perfil ou categorias padrão não puderem ser criados, o usuário também não deve ser persistido.

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant. Nenhuma mudança em autenticação/autorização.

## Validações necessárias

- Nenhuma validação de input nova. A correção é inteiramente de persistência/consistência de dados.

## Testes necessários

### Frontend

- Não aplicável — sem mudança de frontend.

### Backend

- Teste manual: `POST /auth/register` com CPF novo → confirmar perfil `pessoal` + 10 categorias criadas.
- Teste manual: `POST /auth/register` com CNPJ novo → confirmar perfil `empresa` + 14 categorias criadas.
- Teste manual: simular falha proposital durante `ensureDefaultCategories` (ex: nome de categoria inválido) e confirmar que o usuário NÃO fica persistido (rollback da transação funcionando).
- Não há suíte de testes automatizados identificada para essas rotas.

### E2E

- Não aplicável — sem framework E2E identificado no projeto.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas/backend" run lint
```

## Riscos e pontos de atenção

- **Ambiente é produção**: o banco conectado via `DATABASE_URL` no `.env` aponta para o Render (confirmado). O reparo de `id=11`/`id=12` deve ser feito com cautela redobrada, script revisado antes de executar, e confirmação explícita por conta.
- Ao adaptar `ensureDefaultCategories` para aceitar um executor opcional, garantir que o tipo TypeScript do parâmetro seja compatível tanto com `db` (padrão) quanto com o `transaction` passado por `db.transaction()` — evitar `any`.
- Verificar se `pool.query` cru (usado hoje dentro de `ensureDefaultCategories`) precisa ser convertido para a API do Drizzle (`transaction.execute(sql...)` ou equivalente) para realmente participar da mesma transação — misturar `pool.query` direto com uma transação Drizzle não garante atomicidade, pois abriria uma conexão separada do pool.
- Após a correção, `POST /categories/default` e `DELETE /users/:id/clear-data` também passam a funcionar corretamente (hoje também estão quebrados pelo mesmo `ON CONFLICT`) — vale confirmar rapidamente que não há regressão nelas.
- Não commitar o script de reparo one-off — é uma operação pontual, não parte do código do produto.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisão sobre o reparo de `id=11` já confirmada com o usuário (reparar com perfil "Pessoal").

## Critérios de aceite do plano

- `ensureDefaultCategories` insere categorias sem erro de `ON CONFLICT`.
- `POST /register` cria usuário + perfil + categorias de forma atômica (tudo ou nada) para CPF e CNPJ.
- Contas `id=11` e `id=12` passam a ter perfil e categorias padrão corretas em produção.
- Tela "Categorias" no frontend mostra as categorias padrão para a conta Aether Software após o reparo.
- Nenhuma migration de schema foi executada (não é necessária).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária (os índices já existem em produção).
- O reparo de dados (`id=11`, `id=12`) só deve ser executado após confirmação explícita do usuário, mesmo sendo um script pontual e não uma migration — mesma régua de cautela por afetar produção diretamente.
- Seguir `sistema financas/AGENT.md` para convenções de código (Drizzle, nomes claros, evitar `any`), ignorando as seções de multi-tenant/prefeitura que não se aplicam a este projeto.
- Seguir o padrão de transação já estabelecido em `backend/src/services/plan-lifecycle.ts` (`db.transaction(async (transaction) => {...})`).
- Remover qualquer script one-off criado para o reparo de dados após uso — não deve ser commitado.
- Manter alterações pequenas e focadas: não alterar `profiles.ts` neste plano, mesmo tendo padrão similar.
