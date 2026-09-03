# Plano de Implementação: Separar categorias por perfil (PF/PJ)

## Origem

- Arquivo de especificação: nenhum `.md` de feature fornecido — plano originado de pedido direto do usuário ("separar categoria para pj e pf, ter um seletor para qual é") e investigação de código.
- Data do planejamento: `2026-08-18`
- Classificação: `frontend + backend + database`

## Resumo

Separar categorias por perfil (pessoal/empresa), replicando o padrão já usado em `cartoes`. O seletor de perfil já existe (`PerfilSwitcher` na sidebar) — a mudança conecta categorias a esse mecanismo que hoje ele já controla para despesas, receitas e cartões, mas não para categorias. Categorias existentes ficam com `perfil_id = NULL` (fallback automático para o perfil pessoal). Novos perfis empresa passam a receber a lista revisada de 14 categorias (Fornecedores, Folha de Pagamento, Impostos e Taxas, Aluguel/Condomínio, Pró-labore/Retiradas, Marketing, Tecnologia, Transporte, Contabilidade, Bancário, Seguros, Jurídico/Consultoria, Operacional, Outros).

## Escopo

### Dentro do escopo

- Adicionar coluna `perfil_id` (nullable, FK para `perfis`) na tabela `categorias`.
- Trocar a checagem de unicidade de `(usuario_id, nome)` global para escopada por perfil (`COALESCE(perfil_id, 0)`), igual ao padrão de `cartoes`.
- Backend: `categories.ts` — `GET /` filtra por `perfil_id` com fallback NULL→pessoal (mesma lógica de `cards.ts:19-22`); `POST /` e `PUT /:id` passam a aceitar/gravar `perfil_id`; checagem de duplicidade de nome passa a ser escopada por perfil.
- Backend: `expenses.ts` — endpoint duplicado `GET /api/expenses/categories` recebe o mesmo filtro por `perfil_id`, para não virar um bypass inconsistente.
- Backend: `defaultCategories.ts` — atualizar `BUSINESS_DEFAULT_CATEGORIES` para a lista revisada de 14 itens; `ensureDefaultCategories` passa a gravar `perfil_id` ao inserir.
- Backend: `profiles.ts` — as chamadas a `ensureDefaultCategories(userId, tipo)` já existentes passam a também enviar o `perfil.id` recém-criado, para que as categorias sejam gravadas já vinculadas ao perfil certo.
- Backend: `incomes.ts` — criação automática da categoria "Comissão" passa a considerar `perfil_id` do contexto da receita.
- Frontend: `configService.ts` — `saveCategoria` passa a incluir `perfil_id` do perfil ativo no payload de criação (`fetchCategorias()` já envia `perfil_id`, hoje ignorado pelo backend).
- Frontend: `CategoriasTab.tsx` — sem necessidade de nova UI de seleção (o `PerfilSwitcher` global já determina o perfil ativo); a lista simplesmente passa a refletir apenas as categorias do perfil selecionado.
- Migração de dados: categorias existentes recebem `perfil_id = NULL` (equivalente ao fallback automático "pessoal" — nenhuma migração de conteúdo é necessária além de adicionar a coluna com default `NULL`).

### Fora do escopo

- Criar uma UI de seleção de perfil nova/dedicada — reaproveita o `PerfilSwitcher` já existente.
- Duplicar/clonar categorias retroativamente entre perfis existentes — usuário revisa manualmente depois, se quiser criar versões específicas para empresa.
- Mudar `budgetTargets`/`orcamento_metas` — já é perfil-scoped estruturalmente, sem necessidade de alteração de schema (mas seu comportamento deve ser observado após a mudança, listado em riscos).
- Unificar os dois endpoints de listagem de categorias (`/api/categories` e `/api/expenses/categories`) em um só — mantém ambos, só aplica o mesmo filtro nos dois.
- Parametrizar `queryKeys.categorias` por perfil — mantém o mesmo padrão (não parametrizado) já aceito em `queryKeys.cartoes`, mascarado pelo full reload do `PerfilSwitcher`.

## Leitura de contexto

- `AGENT.md` da raiz do projeto `sistema financas` — lido. Mesma ressalva de planos anteriores: descreve contexto multi-tenant/multi-prefeitura com RLS que não se aplica a este projeto (que usa `perfil_id` como escopo de usuário único com múltiplos perfis pessoal/empresa). Regras genéricas de qualidade seguidas; seções de "prefeitura" ignoradas.
- `CLAUDE.md` da raiz — lido.
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste projeto.
- Arquivos inspecionados: `backend/src/db/schema/cards.ts` (padrão de referência), `backend/src/db/schema/categories.ts`, `backend/src/routes/cards.ts` (GET/POST com perfil_id, linhas 11-123), `backend/src/routes/categories.ts` (CRUD completo), `backend/src/routes/expenses.ts` (endpoint duplicado, linhas 206-218), `backend/src/services/defaultCategories.ts`, `backend/src/routes/profiles.ts`, `src/services/configService.ts`, `src/services/queryKeys.ts`, `src/screens/config/CategoriasTab.tsx`, `src/layout/AppShell.tsx` (`PerfilSwitcher`, linhas 78-142).

## Impacto por área

### Frontend

- `src/services/configService.ts`: `saveCategoria` passa a incluir `perfil_id: getActiveProfileId()` no body de criação (edição/`PUT` não muda de perfil, só nome/cor/ícone).
- `src/screens/config/CategoriasTab.tsx`: nenhuma mudança estrutural — a lista já vem filtrada do backend. Nenhum novo estado de loading/error/empty além dos já existentes.
- `src/types/config.ts` (path a confirmar durante implementação): tipo `Categoria` ganha campo opcional `perfil_id`.
- Sem mudança de query keys (decisão registrada em "Fora do escopo").

### Backend

- `backend/src/db/schema/categories.ts`: adicionar `profileId: integer('perfil_id').references(() => profiles.id)` + índice `idx_categorias_perfil`; ajustar a unicidade para ser escopada por perfil (via `COALESCE(perfil_id, 0)`, tratado em `ON CONFLICT` nas rotas em SQL raw — mesmo padrão de `cartoes`, a confirmar exatamente como a migration de `cartoes` implementou isso).
- `backend/src/routes/categories.ts`: `GET /` aceita `perfil_id` como query param e aplica o filtro com fallback NULL→pessoal; `POST /` aceita `perfil_id` no body e usa `ON CONFLICT (usuario_id, LOWER(nome), COALESCE(perfil_id, 0)) DO NOTHING` (ou equivalente com tratamento de erro) em vez do `SELECT` de duplicidade simples atual; `PUT /:id` mantém escopo por `usuario_id`, sem necessidade de mudar perfil ao editar.
- `backend/src/routes/expenses.ts`: `GET /categories` (linhas 206-218) recebe o mesmo filtro por `perfil_id`.
- `backend/src/services/defaultCategories.ts`: `BUSINESS_DEFAULT_CATEGORIES` atualizada para a lista de 14 itens (Fornecedores, Folha de Pagamento, Impostos e Taxas, Aluguel/Condomínio, Pró-labore/Retiradas, Marketing, Tecnologia, Transporte, Contabilidade, Bancário, Seguros, Jurídico/Consultoria, Operacional, Outros); `ensureDefaultCategories` ganha parâmetro `profileId` e grava `perfil_id` no INSERT.
- `backend/src/routes/profiles.ts`: chamadas a `ensureDefaultCategories` (linhas 53 e 81) passam a enviar o `id` do perfil recém-criado.
- `backend/src/routes/incomes.ts`: criação automática da categoria "Comissão" (linhas ~176-192) passa a considerar `perfil_id` do contexto da receita, evitando criar/reusar uma "Comissão" cross-perfil incorretamente.

### Banco de dados

- Nova coluna `categorias.perfil_id` (integer, nullable, FK para `perfis.id`).
- Novo índice `idx_categorias_perfil`.
- Ajuste da checagem de unicidade: de `unique(usuario_id, nome)` para escopo por perfil (via `COALESCE(perfil_id, 0)`, tratado na aplicação/rotas como `cartoes` já faz — a confirmar exatamente como isso é implementado na migration real de `cartoes` durante a implementação).
- Nenhuma duplicação/backfill de dados — categorias existentes ficam `perfil_id = NULL` (fallback automático, sem necessidade de UPDATE em massa).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/db/schema/categories.ts`
- `backend/drizzle/` (nova migration)
- `backend/src/routes/categories.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/profiles.ts`
- `backend/src/services/defaultCategories.ts`
- `src/services/configService.ts`
- `src/types/config.ts`
- `src/screens/config/CategoriasTab.tsx` (revisão, possivelmente sem mudança de código)

## Estratégia de implementação

1. Atualizar `backend/src/db/schema/categories.ts` com `perfil_id` + índice.
2. Gerar a migration correspondente (sem executar — só gerar o arquivo `.sql`, aguardando confirmação do usuário para aplicar).
3. Atualizar `backend/src/services/defaultCategories.ts`: nova lista de 14 categorias empresa + parâmetro `profileId` em `ensureDefaultCategories`.
4. Atualizar `backend/src/routes/profiles.ts` para passar o `perfil.id` recém-criado às chamadas de `ensureDefaultCategories`.
5. Atualizar `backend/src/routes/categories.ts`: filtro por `perfil_id` no GET, aceitar `perfil_id` no POST, ajustar checagem de duplicidade para ser por-perfil.
6. Atualizar `backend/src/routes/expenses.ts` (`GET /categories`) com o mesmo filtro.
7. Atualizar `backend/src/routes/incomes.ts` (criação da categoria "Comissão") para considerar `perfil_id`.
8. Atualizar `src/types/config.ts` e `src/services/configService.ts` (`saveCategoria` envia `perfil_id`).
9. Revisar `CategoriasTab.tsx` — confirmar que nenhuma mudança de código é necessária além do que já existe.
10. Rodar build do frontend e backend.
11. Parar antes de aplicar a migration — pedir confirmação explícita do usuário para rodá-la.
12. Teste manual: criar perfil empresa novo, conferir as 14 categorias; criar categoria específica em cada perfil com nome repetido entre perfis (deve permitir); alternar perfil e conferir que a lista de categorias muda; lançar despesa/receita e conferir que o dropdown de categorias respeita o perfil ativo.

## Regras de negócio identificadas

- Cada perfil (pessoal ou uma das N empresas) tem sua própria lista de categorias, podendo ter nomes repetidos entre perfis diferentes (ex.: "Transporte" em pessoal e "Transporte" em empresa são registros distintos).
- Categorias sem perfil definido (`perfil_id = NULL`) aparecem sob o perfil pessoal — mesmo comportamento de fallback já usado em cartões.
- Ao criar um novo perfil empresa, a lista revisada de 14 categorias é criada automaticamente para esse perfil.
- Editar uma categoria não permite trocar seu perfil (evita categorias "vazando" de um perfil para outro após criadas).

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant (ver nota em "Leitura de contexto"). Todas as queries de categorias já filtram por `usuario_id`; a adição do filtro por `perfil_id` é um refinamento adicional dentro do mesmo usuário, sem risco de vazamento entre usuários. Validar que `perfil_id` recebido no `POST`/query string sempre pertence ao `usuario_id` autenticado (mesma checagem implícita que `cartoes` já faz via `EXISTS (SELECT 1 FROM perfis p WHERE p.id = $2 ... AND p.usuario_id = $1)`).

## Validações necessárias

- `perfil_id` enviado no `POST /categorias` deve pertencer ao usuário autenticado (evitar que um usuário associe categoria a `perfil_id` de outro usuário).
- Nome de categoria deve continuar obrigatório e limitado a 255 caracteres (regra já existente, sem mudança).
- Duplicidade de nome passa a ser verificada por `(usuario_id, nome, perfil_id)` em vez de `(usuario_id, nome)`.

## Testes necessários

### Frontend

- Lista de categorias em `CategoriasTab.tsx` reflete apenas o perfil ativo.
- Dropdown de categoria em `ExpenseDialog`/`IncomeDialog` mostra só categorias do perfil ativo.
- Criar categoria com nome já existente no mesmo perfil é bloqueado; criar com mesmo nome em perfil diferente é permitido.

### Backend

- `GET /categories?perfil_id=X` retorna categorias de `X` + categorias com `perfil_id IS NULL` apenas se `X` for o perfil pessoal.
- `POST /categories` com `perfil_id` de outro usuário é rejeitado.
- Criar perfil empresa dispara `ensureDefaultCategories` com as 14 categorias corretamente vinculadas ao novo `perfil_id`.
- Duplicidade por nome dentro do mesmo perfil é bloqueada; entre perfis diferentes é permitida.

### E2E

- Fluxo manual completo: criar perfil empresa → conferir 14 categorias → alternar entre perfis → lançar despesa em cada perfil → conferir isolamento das listas.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- **Ambiente pode estar em produção** — a migration não deve ser aplicada sem confirmação explícita, dado que este banco pode estar servindo dados reais.
- **`budgetTargets`/`orcamento_metas`**: já referenciam `categoria_id` + `perfil_id` separadamente — depois da mudança, o significado de "meta de orçamento para categoria X no perfil Y" passa a ser mais coerente (categoria X passa a genuinamente pertencer ao perfil Y), mas metas criadas antes da separação podem estar referenciando uma categoria que era "global" e agora é ambígua quanto a perfil — vale revisão funcional após a migration, fora do escopo de código deste plano.
- **Dois endpoints de listagem** (`/api/categories` e `/api/expenses/categories`) precisam ficar sincronizados manualmente — risco de um ser esquecido em manutenções futuras (mitigado por já cobrir os dois neste plano).
- **Categoria "Comissão" automática** (`incomes.ts`) pode precisar de ajuste de comportamento ao lidar com múltiplos perfis empresa (não só um) — a confirmar comportamento exato durante implementação.
- **`queryKeys.categorias` não parametrizado por perfil** — risco de cache desatualizado ao trocar de perfil sem reload; mitigado hoje pelo full-reload do `PerfilSwitcher`, mas é uma fragilidade pré-existente que este plano não corrige (mesmo tratamento de `queryKeys.cartoes`).

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (Decisões de migração de dados e conteúdo da lista de categorias já resolvidas previamente: categorias existentes ficam com `perfil_id = NULL`/fallback pessoal; novos perfis empresa usam a lista revisada de 14 categorias.)

## Critérios de aceite do plano

- Categorias passam a ser isoladas por perfil (pessoal vs. cada empresa), com fallback automático para pessoal em categorias legadas (`perfil_id = NULL`).
- Novo perfil empresa recebe automaticamente as 14 categorias da lista revisada.
- Dropdowns de categoria (despesas, receitas) respeitam o perfil ativo.
- Nenhuma migration executada sem confirmação explícita.
- Build de frontend e backend passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Gerar a migration mas **não executá-la** — parar e pedir confirmação explícita do usuário antes de aplicar no banco.
- Seguir o padrão de `cartoes` como referência principal para a implementação de `perfil_id` em `categorias`.
- Manter alterações focadas nos arquivos listados; não tocar em `budgetTargets`/`orcamento_metas`.
- Confirmar scripts reais de build no `package.json` antes de rodar.
