# Plano de Implementação: Categorias padrão (globais por tipo) vs. custom (exclusivas do perfil)

## Origem

- Arquivo de especificação: nenhum `.md` de feature fornecido — plano originado de correção de modelo pedida diretamente pelo usuário após identificar comportamento incorreto em produção.
- Data do planejamento: `2026-08-19`
- Classificação: `fullstack + database`

## Resumo

O modelo de categorias implementado anteriormente (coluna `categorias.tipo`) trata **toda** categoria — padrão do sistema ou criada manualmente pelo usuário — da mesma forma: filtra só por `tipo` ('pessoal'/'empresa'), compartilhando qualquer categoria entre todos os perfis do mesmo tipo. Isso está incorreto. O usuário esclareceu o modelo real desejado:

1. **Categorias padrão do sistema** (as listas em `defaultCategories.ts`) continuam globais por tipo — aparecem em qualquer perfil do mesmo tipo (ex.: uma categoria padrão de empresa aparece tanto em "PJ" quanto em "Aether").
2. **Categorias criadas manualmente pelo usuário** (via tela de Categorias) devem ficar **exclusivas do perfil específico** onde foram criadas — não mais compartilhadas entre perfis do mesmo tipo.

Dado real confirmado em produção: o usuário tem 25 categorias — 7 batem por nome com a lista padrão pessoal (criadas no cadastro inicial via `ensureDefaultCategories`), 18 são claramente customs criadas ao longo do tempo (Academia, Uber, Pedágio, Farmácia, etc.), todas hoje com `tipo = NULL` misturadas.

## Escopo

### Dentro do escopo

- Nova coluna `categorias.perfil_id` (nullable, FK para `perfis.id`) — reintroduzida com significado diferente da tentativa anterior: preenchida **só** em categorias custom, nunca em categorias padrão.
- Regra de dados: uma categoria é **padrão** quando `tipo IS NOT NULL` e `perfil_id IS NULL` — global, aparece em qualquer perfil daquele tipo. Uma categoria é **custom** quando `perfil_id IS NOT NULL` e `tipo IS NULL` — exclusiva daquele perfil específico. Um registro nunca tem os dois campos preenchidos simultaneamente.
- Backend: `GET /categorias` passa a retornar a união de: categorias padrão do tipo do perfil ativo + categorias custom com `perfil_id` = perfil ativo.
- Backend: `POST /categorias` passa a gravar `perfil_id` (não mais `tipo`) para categorias criadas manualmente pelo usuário — toda criação via tela vira custom.
- Backend: `ensureDefaultCategories` mantém o comportamento atual (grava `tipo`, sem `perfil_id`) — já está correto, sem mudança.
- Backend: categoria "Comissão" auto-criada (em `incomes.ts`) passa a ser custom, gravando `perfil_id` do perfil que originou a receita, em vez de `tipo`.
- **Migração de dados** das 25 categorias existentes do usuário real: as 7 que batem por nome exato com a lista padrão pessoal (`Alimentação`, `Moradia`, `Transporte`, `Saúde`, `Educação`, `Lazer`, `Outros`) recebem `tipo = 'pessoal'` (permanecem/ficam com `perfil_id = NULL`); as 18 restantes recebem `perfil_id` = id do perfil "Pessoal" do usuário (permanecem/ficam com `tipo = NULL`).
- Constraint de unicidade ajustada para contemplar os dois modos (nome único dentro do mesmo tipo padrão, OU nome único dentro do mesmo perfil custom).
- `src/types/config.ts`: adicionar `perfil_id` ao tipo `Categoria`.

### Fora do escopo

- Mudar o conteúdo das listas de categorias padrão (`PERSONAL_DEFAULT_CATEGORIES`/`BUSINESS_DEFAULT_CATEGORIES`) — permanece como está.
- Permitir "promover" uma categoria custom para padrão (ou vice-versa) via UI — não solicitado.
- Criar retroativamente as 14 categorias padrão de empresa para os perfis PJ/Aether do usuário — fica como pedido separado, após este plano corrigir o modelo.
- Qualquer mudança em cartões (`cartoes`) — não afetado por este plano.
- Qualquer mudança em `CategoriasTab.tsx` além do necessário — a tela já envia/consome os campos corretos, não deve precisar de mudança estrutural.

## Leitura de contexto

- `AGENT.md`/`CLAUDE.md` da raiz — lidos (mesma ressalva de sempre: seções multi-tenant/prefeitura não se aplicam a este projeto).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivos inspecionados nesta sessão: `backend/src/routes/categories.ts` (estado atual pós-correção anterior, já em produção), `backend/src/services/defaultCategories.ts`, `backend/src/db/schema/categories.ts`, `backend/src/db/schema/profiles.ts`, `src/services/configService.ts`. Dados reais de produção consultados diretamente via `DATABASE_URL` real (confirmada após descoberta de que a sessão anterior operou por engano contra um banco local): 25 categorias do usuário real (`usuario_id = 1`), 7 batendo por nome com a lista padrão pessoal, 18 customs identificadas por não baterem com nenhum nome da lista padrão.

## Impacto por área

### Frontend

- `src/types/config.ts`: `Categoria.perfil_id?: number | null` adicionado (paralelo ao `tipo` que já existe no tipo).
- `src/services/configService.ts`: nenhuma mudança de assinatura necessária — `saveCategoria` já envia `perfil_id` no payload de criação; o backend passa a usar esse valor corretamente.
- Sem mudança estrutural em `CategoriasTab.tsx`.

### Backend

- `backend/src/db/schema/categories.ts`: adicionar `profileId: integer('perfil_id').references(() => profiles.id)`.
- `backend/src/routes/categories.ts`:
  - `GET /`: query passa a filtrar `WHERE usuario_id = $1 AND (tipo = <tipo do perfil ativo> OR perfil_id = <perfil ativo>)` quando `perfil_id` é enviado.
  - `POST /`: grava `perfil_id` (do perfil ativo recebido) em vez de `tipo`; toda categoria nova criada pelo usuário é custom.
  - `PUT /:id`: checagem de duplicidade ajustada para considerar `tipo` OU `perfil_id`, dependendo de qual campo a categoria existente já tem preenchido.
- `backend/src/routes/expenses.ts` (`GET /categories`, dropdown duplicado): mesmo ajuste de filtro união.
- `backend/src/routes/incomes.ts`: criação automática da categoria "Comissão" passa a gravar `perfil_id` em vez de `tipo`.

### Banco de dados

- Nova coluna `categorias.perfil_id` (integer, nullable, FK para `perfis.id`).
- Nova constraint de unicidade contemplando os dois modos (padrão por tipo / custom por perfil).
- **Migração de dados** (além de schema): classificar as 25 categorias existentes do usuário real conforme a regra combinada — 7 viram padrão (`tipo` preenchido), 18 viram custom (`perfil_id` preenchido).

Atenção: migrations e a migração de dados não devem ser executadas sem confirmação explícita do usuário. Antes de rodar qualquer comando desta vez, será confirmado explicitamente qual `DATABASE_URL`/banco está ativo (local vs. produção real), evitando repetir o erro da sessão anterior onde uma migration foi aplicada por engano contra um banco local em vez do banco real de produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/db/schema/categories.ts`
- `backend/drizzle/0018_categorias_perfil_custom.sql` (nova migration de schema)
- script/SQL de migração de dados (separado da migration de schema, para revisão isolada)
- `backend/src/routes/categories.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `src/types/config.ts`

## Estratégia de implementação

1. Atualizar `backend/src/db/schema/categories.ts` com `profileId`.
2. Gerar migration `0018_categorias_perfil_custom.sql` (não executar): adicionar `perfil_id`, ajustar constraint de unicidade para cobrir os dois modos.
3. Escrever a migração de dados como SQL separado e revisável: promover as 7 categorias que batem por nome exato com a lista padrão pessoal para `tipo = 'pessoal'`; atribuir `perfil_id` do perfil "Pessoal" às 18 categorias restantes do usuário real.
4. Backend `categories.ts`: `GET /` com filtro união; `POST /` gravando `perfil_id`; `PUT /:id` com duplicidade considerando tipo OU perfil_id conforme o registro existente.
5. `expenses.ts` (`GET /categories` duplicado): mesmo ajuste de filtro união.
6. `incomes.ts` (categoria "Comissão"): gravar com `perfil_id` em vez de `tipo`.
7. `src/types/config.ts`: adicionar `perfil_id` ao tipo `Categoria`.
8. Rodar build backend + frontend.
9. Parar antes de aplicar migration/migração de dados — confirmar explicitamente qual banco está ativo antes de rodar qualquer coisa.
10. Teste manual: perfil Pessoal mostra as 7 categorias padrão + as 18 customs do usuário; perfil PJ mostra só categorias padrão de empresa (nenhuma, já que ainda não existem — ver "fora do escopo"); criar categoria nova em PJ e confirmar que não aparece em Aether (mesmo tipo, perfis diferentes).

## Regras de negócio identificadas

- Categoria padrão do sistema: `tipo` preenchido, `perfil_id` nulo — global, compartilhada entre todos os perfis do mesmo tipo do usuário.
- Categoria custom (criada manualmente pelo usuário ou por automação como "Comissão"): `perfil_id` preenchido, `tipo` nulo — exclusiva daquele perfil específico, nunca aparece em outro perfil, mesmo do mesmo tipo.
- Um registro de categoria nunca tem `tipo` e `perfil_id` preenchidos simultaneamente.

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant. Validar que o `perfil_id` recebido em `POST /categorias` sempre pertence ao `usuario_id` autenticado (mesma checagem já existente via `resolveProfileType`/consulta a `perfis`).

## Validações necessárias

- `perfil_id` enviado deve pertencer ao usuário autenticado.
- Duplicidade de nome passa a ser verificada por `(usuario_id, nome, tipo)` para padrão OU `(usuario_id, nome, perfil_id)` para custom, dependendo do tipo do registro.

## Testes necessários

### Frontend
- Perfil Pessoal mostra as categorias padrão pessoal + as customs do perfil Pessoal.
- Perfil PJ/Aether mostra só categorias padrão de empresa (se existirem) — customs de PJ não vazam para Aether e vice-versa.
- Criar categoria nova em um perfil não a torna visível em outro perfil do mesmo tipo.

### Backend
- `GET /categorias?perfil_id=X` retorna união correta de padrão (por tipo) + custom (por perfil_id).
- `POST /categorias` sempre grava como custom (`perfil_id`), nunca como padrão.
- Categoria "Comissão" criada com `perfil_id` correto, não `tipo`.

### E2E
- Fluxo manual completo: migrar dados reais, conferir perfil Pessoal com as 25 categorias corretamente separadas (7 padrão + 18 custom); criar categoria em PJ, conferir que não aparece em Aether.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- **Confirmar banco-alvo antes de qualquer execução**: a sessão anterior aplicou uma migration contra um banco local por engano, achando que era produção. Desta vez, antes de rodar qualquer migration/UPDATE, o banco ativo será confirmado explicitamente.
- A migração de dados classifica por **nome exato** — se o usuário tiver uma categoria custom chamada literalmente igual a uma da lista padrão (ex.: "Outros" com propósito diferente do genérico), ela seria incorretamente promovida a padrão. Vale revisão da lista das 7 antes de aplicar.
- Categorias padrão de empresa (14 itens) ainda não existem para o usuário — este plano não as cria automaticamente; é decisão separada a ser pedida depois.
- `.env` local está atualmente apontando para o banco de produção real (alteração já autorizada pelo usuário em sessão anterior) — qualquer comando local roda contra dados reais por padrão até isso ser revertido/separado.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (Decisões sobre classificação das 25 categorias existentes e sobre a categoria "Comissão" já resolvidas.)

## Critérios de aceite do plano

- Categorias padrão continuam globais por tipo.
- Categorias custom ficam exclusivas do perfil onde foram criadas.
- As 25 categorias existentes do usuário real são corretamente classificadas (7 padrão + 18 custom).
- Categoria "Comissão" passa a ser custom por perfil.
- Nenhuma migration/UPDATE executado sem confirmação explícita, com banco-alvo claramente confirmado antes.
- Build backend + frontend passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Antes de qualquer execução de SQL contra o banco (migration de schema ou migração de dados), confirmar explicitamente com o usuário qual `DATABASE_URL`/ambiente está ativo.
- Gerar a migration de schema e o script de migração de dados, mas não executar nenhum dos dois sem aprovação explícita separada.
- Manter alterações restritas aos arquivos listados.
