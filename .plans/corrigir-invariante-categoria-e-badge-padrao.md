# Plano de Implementação: Corrigir invariante tipo/conta_id em categorias e indicador visual de categoria padrão

## Origem
- Origem: bug real reportado em conversa (categorias PJ aparecendo em conta PF) + pedido de melhoria de UX — sem arquivo `.md`
- Data do planejamento: 2026-09-16
- Classificação: **frontend + backend + database**

## Resumo
19 categorias no banco (todas do usuário 1, conta 17) têm `tipo` (padrão) e `conta_id` preenchidos ao mesmo tempo, violando a invariante original do modelo (documentada no schema: PADRÃO tem `conta_id` nulo, CUSTOM tem `tipo` nulo — nunca os dois). Isso faz a cláusula `OR c.conta_id = $2` da query de listagem capturá-las mesmo quando o `tipo` não corresponde ao tipo da conta ativa, misturando categorias empresa numa conta pessoal. A causa exata de como o `conta_id` foi parar nesses registros não foi encontrada no código versionado (nenhuma função atual grava os dois campos juntos) — provavelmente uma correção manual feita direto no banco em algum momento. Além da correção pontual dos dados, o plano adiciona uma validação preventiva no backend e um indicador visual "P" na listagem para facilitar detectar isso no futuro.

## Escopo

### Dentro do escopo
- Correção de dados: `UPDATE categorias SET conta_id = NULL WHERE tipo IS NOT NULL AND conta_id IS NOT NULL` (19 registros).
- Validação preventiva no backend (`POST`/`PUT` de categoria) impedindo gravar `tipo` e `conta_id` juntos.
- Badge "P" nas categorias padrão em `CategoriasTab.tsx` (`CategoriaRow`).

### Fora do escopo
- Investigação forense de como esses 19 registros ficaram inconsistentes originalmente (não rastreável no código atual).
- Qualquer mudança na regra de negócio de categorias padrão/custom além da correção do dado e da prevenção.
- Alteração em outras telas que também listam categorias (`ExpenseForm`, `FinancialAssistant`, etc.) — o badge é só na tela de gestão (`CategoriasTab`).

## Leitura de contexto
- `sistema financas/AGENT.md` — já lido nesta sessão, sem mudanças. Mesmos princípios transferíveis aplicados (Drizzle-first quando aplicável, validar no backend, nomes claros, sem `any`).
- `CLAUDE.md` da raiz — mesmo fluxo de workflow.
- Arquivos investigados: `backend/src/db/schema/categories.ts` (invariante documentada no comentário), `backend/src/services/defaultCategories.ts` (confirma que o INSERT nunca grava `conta_id`), `backend/scripts/backfill-empresa-categories.ts` (também usa `ensureDefaultCategories`, não é a causa), `backend/src/routes/categories.ts` (rotas `POST`/`PUT` onde a validação preventiva entra), `src/screens/config/CategoriasTab.tsx` (`CategoriaRow`, badge existente `cfgBadgeStyle` para "N sub"), `src/types/config.ts` (`Categoria.tipo` já exposto ao frontend, sem mudança de contrato necessária).

## Impacto por área

### Frontend
- **`src/screens/config/CategoriasTab.tsx`** (`CategoriaRow`, por volta da linha 176-180): adicionar um badge "P" (mesmo estilo `cfgBadgeStyle` do badge "N sub") ao lado do nome quando `cat.tipo != null` (categoria padrão). Categorias custom (`cat.tipo == null`) não recebem badge.
- Sem mudança de tipos (`Categoria.tipo` já existe), sem mudança de query/hook.

### Backend
- **`backend/src/routes/categories.ts`**: no `POST /` e `PUT /:id`, quando a categoria for gravada como custom (`conta_id` preenchido), garantir explicitamente que `tipo` seja `NULL` no INSERT/UPDATE — hoje o `POST` já não define `tipo` (correto), então a validação preventiva é mais uma garantia defensiva de schema/query do que uma mudança de comportamento. Adicionar um `CHECK` constraint no banco é a forma mais robusta (ver seção Banco de dados).

### Banco de dados
- **Migration nova** (`0041_categorias_tipo_conta_exclusivos.sql`): adicionar `CHECK (tipo IS NULL OR conta_id IS NULL)` na tabela `categorias`, tornando a invariante estrutural (o banco recusa qualquer INSERT/UPDATE futuro que viole a regra, não importa por qual caminho de código).
- **Correção de dados** (incluída na mesma migration ou script separado, a definir na implementação): `UPDATE categorias SET conta_id = NULL WHERE tipo IS NOT NULL AND conta_id IS NOT NULL` — precisa rodar antes do `CHECK`, senão o constraint falha ao ser criado com dados inconsistentes já existentes.
- Nenhuma despesa/receita é afetada (referenciam `categoria_id`, não dependem de `conta_id` da categoria).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy
`Sem impacto esperado`.

## Arquivos provavelmente afetados
- `backend/drizzle/0041_categorias_tipo_conta_exclusivos.sql` (novo)
- `backend/src/routes/categories.ts` (garantia defensiva, se necessário após revisão)
- `src/screens/config/CategoriasTab.tsx`

## Estratégia de implementação
1. Rodar `UPDATE categorias SET conta_id = NULL WHERE tipo IS NOT NULL AND conta_id IS NOT NULL` (com aprovação explícita antes da execução).
2. Escrever a migration `0041` com o `CHECK` constraint, documentando que os dados já foram corrigidos no passo 1.
3. Revisar `POST`/`PUT` de `categories.ts` para confirmar que nunca tentam gravar os dois campos juntos (garantia defensiva, sem necessariamente exigir mudança se já estiver correto).
4. Adicionar o badge "P" em `CategoriaRow` (`CategoriasTab.tsx`).
5. Rodar build/typecheck do backend e frontend.
6. Validar visualmente: badge aparece nas 17 categorias padrão do usuário 1 (7 pessoal + 12 empresa, agora sem `conta_id`), e as categorias empresa não aparecem mais na listagem filtrada por conta pessoal.

## Regras de negócio identificadas
- Categoria PADRÃO: `tipo` preenchido, `conta_id` sempre `NULL` — global por tipo+usuário.
- Categoria CUSTOM: `conta_id` preenchido, `tipo` sempre `NULL` — exclusiva da conta.
- Os dois campos nunca coexistem preenchidos — agora garantido também a nível de banco.

## Regras multi-tenant e segurança
- Nenhuma mudança de autorização — é uma correção de integridade de dado que hoje causa vazamento visual entre tipos de conta do mesmo usuário (não entre usuários diferentes).
- O `CHECK` constraint é a defesa mais forte contra essa classe de bug, independente de qual rota/script venha a escrever no futuro.

## Validações necessárias
- Confirmar que a migration com `CHECK` só é aplicada depois que os 19 registros já estiverem corrigidos (senão o `ALTER TABLE ... ADD CONSTRAINT` falha).

## Testes necessários

### Frontend
- Validação manual: abrir `CategoriasTab` e confirmar visualmente o badge "P" nas categorias padrão e ausência dele nas custom.

### Backend
- Sem teste automatizado novo (mesma decisão já tomada nos planos anteriores — projeto não tem padrão de mock de banco).

### E2E
`Sem impacto esperado`.

## Comandos de validação sugeridos
```bash
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas/backend" test
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção
- Banco é produção — a correção de dados (`UPDATE`) e a migration (`CHECK`) exigem confirmação explícita separada antes de executar, cada uma no seu momento.
- Se a correção de dados não rodar antes da migration, a criação do `CHECK` constraint falha (comportamento seguro — não corrompe nada, só recusa aplicar).

## Perguntas em aberto
Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano
- As 19 categorias inconsistentes passam a ter `conta_id = NULL`.
- Categorias empresa não aparecem mais na listagem da conta pessoal do usuário 1.
- Banco recusa (via `CHECK`) qualquer tentativa futura de gravar `tipo` e `conta_id` juntos.
- Badge "P" visível nas categorias padrão em `CategoriasTab.tsx`.

## Observações para a skill implementar
- Usar este plano como fonte principal de contexto.
- Não executar a correção de dados nem a migration sem confirmação explícita separada — o ambiente é produção.
- A correção de dados precisa rodar antes da migration com `CHECK`.
- Seguir o AGENT.md da raiz nos princípios transferíveis já aplicados nos planos anteriores.
- Manter o badge visual pequeno e consistente com `cfgBadgeStyle` já existente — não introduzir um novo padrão de estilo.
