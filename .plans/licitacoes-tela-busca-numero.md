# Plano de Implementação: Licitações — tela de Favoritos, paginação no fim e busca por número

## Origem

- Arquivo de especificação: nenhum. Pedidos feitos na conversa de 06/10/2026, com print da tela Favoritos em produção.
- Data do planejamento: `2026-10-06`
- Classificação: `frontend + backend + database`

## Resumo

Três ajustes no módulo de Licitações, pedidos depois da entrega de Favoritos:

1. **Favoritos:** um card por linha, na largura toda, igual a Buscar. Hoje a tela usa 2 colunas em telas largas.
2. **Paginação no fim da página, em Favoritos e em Buscar:** com poucos resultados, a paginação desce até o rodapé da tela; com muitos, aparece depois do último card.
3. **Busca por número:** um campo "Número, processo ou controle PNCP" e um filtro "Ano" no painel de filtros de Buscar. Um índice novo no banco (migration 0079) deixa a busca rápida.

## Decisões aplicadas

- **Pedidos do usuário:**
  - notificações ficam como estão;
  - busca pelo nome do órgão fica como está (só por CNPJ);
  - os ajustes de Favoritos entram neste plano;
  - a paginação no fim da página vale também para Buscar.
- **Decisão 1:** a busca por número usa índice no banco, com a migration 0079.
- **Decisão 2:** com número informado, só o prazo mínimo de 3 dias deixa de valer. "Só editais abertos" continua valendo.
- **Fontes de dados:** a ampliação vai para um plano próprio e bem analisado, depois deste.

## Escopo

### Dentro do escopo

**1. Favoritos em uma coluna**
- `FavoritesScreen` deixa o `xl:grid-cols-2`: um card por linha, como em Buscar.

**2. Paginação no fim da página (Buscar e Favoritos)**
- A barra de paginação ("1–N de N", "Por página", "Anterior" e "Próxima") fica no rodapé da tela quando a lista é curta.
- Com lista longa, ela continua logo depois do último card, sem ficar fixa na tela.
- A tela passa a ocupar no mínimo a altura útil abaixo da barra superior, e a paginação usa `mt-auto`.

**3. Busca por número e ano**
- **Campo "Número, processo ou controle PNCP"**, no topo do painel de filtros, com a seção "Número e ano".
  - O texto vira grupos de dígitos, sem os zeros à esquerda. Exemplo: "PE 352/2026" vira 352 e 2026.
  - O edital entra se **todos** os grupos estiverem num mesmo campo:
    - número da compra mais o ano da compra;
    - processo mais o ano da compra;
    - número de controle do PNCP.
  - O número vale ao sair do campo ou com Enter. Texto sem nenhum dígito mostra "Informe ao menos um número." e não busca.
- **Filtro "Ano"**, uma lista com "Qualquer ano" e os anos do próximo até 4 anos atrás. Compara com o ano da compra.
- **URL e chips:** `numero=` e `ano=` na URL, e os chips "Número: …" e "Ano: …".
- **Regras de prazo:**
  - com número informado, o prazo mínimo de 3 dias não vale (decisão 2);
  - "Só editais abertos" continua valendo e pode ser desligado no painel.
- **Busca salva:**
  - número e ano não são travados quando há busca salva aberta: valem por cima dela, como datas e acompanhamento;
  - "Salvar esta busca" avisa que número e ano ficam de fora da busca salva;
  - o mesmo aviso passa a valer para "Só favoritos", que ficou sem aviso na entrega anterior.

### Fora do escopo

- Tabela, ordenação e alternância cards/tabela em Favoritos.
- Busca pelo nome do órgão.
- Mudanças nas notificações (título "Novo edital: <busca>").
- Novas fontes de dados (plano próprio depois).
- Busca por número na barra superior (busca rápida).
- Paginação no fim nas outras telas paginadas: Notificações e histórico da Coleta.

## Leitura de contexto

- `/AGENT.md` e `CLAUDE.md`.
- Não existem no projeto: `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`.
- **Front:**
  - `src/tenders/screens/SearchScreen.tsx` (estrutura de resultados e paginação) e `FavoritesScreen.tsx`;
  - `layout/TendersShell.tsx`: o `main` tem `py-6` e a barra superior tem `h-16`;
  - `components/SearchFiltersPanel.tsx`, `Pagination.tsx`;
  - `utils/searchFilters.ts` e o teste;
  - `utils/savedSearchForm.ts` (`LEFT_OUT_LABELS` e `searchStateToForm`);
  - `ui/form.tsx` (`Input` e `Select`).
- **Backend:**
  - `services/noticeSearch.ts` (`NoticeSearchFilters`, `filterConditions`, `criteriaOnlyFilters`);
  - `services/dashboard.ts`;
  - `routes/validators.ts` e `routes/requestReaders.ts`;
  - `db/schema.ts`, que já declara os índices de `licitacoes.edital`;
  - migration `0073` (colunas `numero_compra`, `ano_compra`, `processo` e `numero_controle_pncp`; `busca_tsv` cobre só objeto e informação complementar).
- **Medições no banco local** (só leitura, 24.867 editais):
  - todos os editais têm número da compra, ano, processo e controle PNCP preenchidos;
  - os formatos variam: "PE 352/26", "00002826", "154.00015971/2026-66", "SEI-080001/003961/2026";
  - a regra por grupos de dígitos, calculada sem índice, leva de 140 a 250 ms por busca (a busca atual leva de 4 a 17 ms);
  - resultados medidos:

    | Busca | Editais encontrados |
    | --- | --- |
    | Processo completo ("154.00015971/2026-66") | 1 |
    | Controle PNCP completo | 1 |
    | "352/26" | 2 |
    | "PE 352/2026" | 25 |
    | "213/2026" | 71 |
    | "38/2026" | 354 |

    Números curtos dão muitos resultados porque muitos órgãos têm compra nº 38 de 2026.

## Impacto por área

### Frontend

- **`utils/searchFilters.ts`:**
  - `SearchState` ganha `number` (texto aparado, com até 60 caracteres e ao menos um dígito; senão vazio) e `purchaseYear` (`number | null`, de 2000 a 2100);
  - URL: `numero` e `ano`;
  - API: `number` e `purchaseYear`, enviados só quando preenchidos;
  - chips: "Número: <texto>" e "Ano: <ano>";
  - `appliesMinimumDeadline` falso quando o número tem dígito;
  - nova função pura `purchaseYearOptions(todayIso)`: do ano seguinte até 4 anos atrás.
- **`components/SearchFiltersPanel.tsx`:**
  - seção "Número e ano" no topo, com o campo de texto (rascunho local e confirmação ao sair ou com Enter) e o `Select` de ano;
  - não fica travada com busca salva;
  - mensagem de erro inline para texto sem dígito.
- **`utils/savedSearchForm.ts`:** `LEFT_OUT_LABELS` ganha número, ano e "Só favoritos", e `searchStateToForm` os inclui no aviso.
- **`utils/screenLayout.ts` (novo):** constante com a altura útil da tela, `min-h-[calc(100dvh-7rem)]` (barra de 4 rem mais o `py-6` do main), documentada.
- **`screens/SearchScreen.tsx`:**
  - a seção vira coluna flexível com a altura útil;
  - a coluna de resultados estica até o fim, com `self-stretch`, e o filtro lateral continua fixo no topo;
  - a paginação fica num bloco com `mt-auto`.
- **`screens/FavoritesScreen.tsx`:** uma coluna; mesma estrutura de altura e paginação com `mt-auto`.
- **Estados:** carregando, erro e vazio continuam como estão. Sem lista, não há paginação.

### Backend

- **`services/noticeSearch.ts`:**
  - `NoticeSearchFilters` ganha `numberGroups: string[]` e `purchaseYear: number | null`;
  - nova função pura e exportada `numberGroupsOf(text)`: grupos de dígitos sem zeros à esquerda, sem repetição;
  - em `filterConditions`, com grupos, um `OR` dos três campos. A expressão é exatamente a mesma dos índices, para o planner usá-los:

    ```sql
    licitacoes.fn_grupos_digitos(coalesce(e.numero_compra, '') || ' ' || coalesce(e.ano_compra::text, '')) @> $grupos
    OR licitacoes.fn_grupos_digitos(coalesce(e.processo, '') || ' ' || coalesce(e.ano_compra::text, '')) @> $grupos
    OR licitacoes.fn_grupos_digitos(e.numero_controle_pncp) @> $grupos
    ```

    É SQL pelo `sql` do Drizzle, porque a API dele não cobre índice de expressão com operador de array;
  - com ano: `eq(searchedNotice.purchaseYear, ano)`;
  - `criteriaOnlyFilters` usa `numberGroups: []` e `purchaseYear: null`.
- **`services/dashboard.ts`:** passa os valores neutros.
- **`routes/validators.ts`:**
  - `query('number')`: texto com até 60 caracteres e ao menos um dígito; mensagem "Número: até 60 caracteres, com ao menos um dígito";
  - `query('purchaseYear')`: inteiro de 2000 a 2100; mensagem "Ano inválido".
- **`routes/requestReaders.ts`:** lê `number` (via `numberGroupsOf`) e `purchaseYear`.
- **`db/schema.ts`:** declara os 3 índices de expressão, com `index(...).using('gin', sql\`...\`)`.
- Sem rota nova.

### Banco de dados

**Migration `backend/drizzle/0079_licitacoes_busca_numero.sql`:**

```sql
CREATE FUNCTION licitacoes.fn_grupos_digitos(p_texto TEXT) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(array_agg(coalesce(nullif(ltrim(g, '0'), ''), '0')), '{}')
    FROM regexp_split_to_table(coalesce(p_texto, ''), '\D+') AS g
   WHERE g <> ''
$$;

CREATE INDEX ix_edital_numero_grupos ON licitacoes.edital
  USING GIN (licitacoes.fn_grupos_digitos(coalesce(numero_compra, '') || ' ' || coalesce(ano_compra::text, '')));
CREATE INDEX ix_edital_processo_grupos ON licitacoes.edital
  USING GIN (licitacoes.fn_grupos_digitos(coalesce(processo, '') || ' ' || coalesce(ano_compra::text, '')));
CREATE INDEX ix_edital_controle_grupos ON licitacoes.edital
  USING GIN (licitacoes.fn_grupos_digitos(numero_controle_pncp));
```

- **Sem coluna nova:** a tabela não é reescrita. `CREATE INDEX` trava só a gravação (a coleta) durante a criação, por alguns segundos; a leitura continua.
- **`concat_ws`:** não serve, porque não é imutável. Por isso a concatenação usa `||` com `coalesce`.
- **Ordem:** aplicar depois da 0078 e antes do deploy. Sem a função, só a busca por número falha; o resto funciona.
- **Reversão:**

  ```sql
  DROP INDEX licitacoes.ix_edital_numero_grupos;
  DROP INDEX licitacoes.ix_edital_processo_grupos;
  DROP INDEX licitacoes.ix_edital_controle_grupos;
  DROP FUNCTION licitacoes.fn_grupos_digitos(TEXT);
  ```

- **Conferência no banco local:** EXPLAIN com os índices em uso (BitmapOr) e tempo da busca por número.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Ordem:**
  1. aplicar a 0079 no banco local, para os testes;
  2. aplicar na produção, com a confirmação do usuário, fora do modo automático e fora do horário da varredura (06:00);
  3. só então fazer o merge em `main`.
- Sem variáveis novas.

## Arquivos provavelmente afetados

- **Banco:** `backend/drizzle/0079_licitacoes_busca_numero.sql`
- **Backend** (`backend/src/modules/tenders`):
  - `db/schema.ts`;
  - `services/noticeSearch.ts` e `services/dashboard.ts`;
  - `routes/validators.ts` e `routes/requestReaders.ts`;
  - `services/noticeSearch.db.test.ts` e `routes/routes.db.test.ts`;
  - `README.md` e `tenders.http`.
- **Front** (`src/tenders`):
  - `utils/searchFilters.ts` e `utils/searchFilters.test.ts`;
  - `utils/savedSearchForm.ts` e `utils/savedSearchForm.test.ts`;
  - `utils/screenLayout.ts` (novo);
  - `components/SearchFiltersPanel.tsx`;
  - `screens/SearchScreen.tsx` e `screens/FavoritesScreen.tsx`.

## Estratégia de implementação

1. Criar a branch `feat/R/licitacoes-tela-busca-numero` a partir de `main`.
2. **Banco:**
   - escrever a 0079;
   - mostrar o status das migrations nos dois bancos, só leitura;
   - aplicar **só no banco local**;
   - conferir o EXPLAIN e o tempo.
3. **Backend:**
   - `numberGroupsOf`;
   - filtros em `searchNotices`, validators e leitor da query;
   - valores neutros em `criteriaOnlyFilters` e no painel do Início;
   - índices no schema;
   - testes de banco.
4. **Front:**
   - `searchFilters` (estado, URL, API, chips, prazo mínimo e anos), com testes;
   - seção "Número e ano" no painel;
   - aviso do "Salvar esta busca", com teste;
   - `screenLayout`;
   - Favoritos em uma coluna;
   - paginação no fim em Buscar e Favoritos.
5. README do módulo e `tenders.http`.
6. **Conferência no navegador local**, no desktop (1920 px) e no celular:
   - busca por número e por ano, com chips e URL;
   - sem o aviso de prazo curto quando há número;
   - paginação no rodapé com lista curta e com lista longa;
   - Favoritos em uma coluna.
7. Rodar os checks.
8. **No `/finalizar`, antes do merge:** pedir a confirmação para aplicar a 0079 na produção e só depois fazer o merge.

## Regras de negócio identificadas

- **Comparação do número:**
  - só pelos dígitos, por grupos, sem zeros à esquerda;
  - todos os grupos precisam estar num mesmo campo (número mais ano, processo mais ano, ou controle PNCP).
- O número e o ano são filtros da tela: valem por cima de uma busca salva e não são gravados nela.
- Com número informado, o prazo mínimo de 3 dias não vale. "Só editais abertos" continua valendo.
- Ano: o ano da compra no PNCP.
- A paginação fica no fim da página: no rodapé com lista curta, depois do último card com lista longa.

## Regras multi-tenant e segurança

- O edital é dado público e global. A busca continua com a conta e a pessoa vindas da trava do módulo (`tenderAccessOf`), sem mudança.
- Entrada validada no backend: tamanho do texto, presença de dígito e faixa do ano.
- Os grupos vão como parâmetro (`$1::text[]`), nunca concatenados no SQL.

## Validações necessárias

- **API:**
  - `number`: texto com até 60 caracteres e ao menos um dígito; senão, 400;
  - `purchaseYear`: inteiro de 2000 a 2100; senão, 400.
- **Front:**
  - `numero` na URL sem dígito ou com mais de 60 caracteres é ignorado;
  - `ano` fora de 2000–2100 ou fora do formato AAAA é ignorado;
  - no campo, texto sem dígito mostra erro e não aplica.

## Testes necessários

### Frontend

- **`searchFilters`:**
  - `FULL_STATE` com `number` e `purchaseYear`;
  - ida e volta pela URL (`numero` e `ano`);
  - query da API (`number` e `purchaseYear`);
  - chips "Número" e "Ano", e cada chip remove só o seu;
  - valores inválidos na URL ignorados;
  - `appliesMinimumDeadline` falso com número;
  - `purchaseYearOptions`.
- **`savedSearchForm`:** o aviso lista número, ano e "Só favoritos".

### Backend

Testes de banco, no banco local, com `numberGroupsOf` coberto também sem banco:
- **Acha:** "352/2026" e "PE 352/26" para número "PE 352/26" de 2026; "00015971/2026" para o processo "154.00015971/2026-66"; o controle PNCP completo.
- **Não acha:** outro ano; grupos espalhados em campos diferentes.
- **Filtro de ano** sozinho e junto com o número.
- **HTTP:** 400 para número sem dígito, número com mais de 60 caracteres e ano fora da faixa; 200 com número válido.
- A paridade com a busca salva e a prévia continuam passando.

### E2E

- Conferência no navegador local (passo 6 da estratégia).

## Comandos de validação sugeridos

```bash
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0079 --banco local
npx tsc --noEmit -p .
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
```

## Riscos e pontos de atenção

- **Ordem do deploy:** a 0079 precisa ir para a produção antes do merge. Sem ela, a busca por número falha.
- **Criação do índice:** trava a gravação da coleta por alguns segundos. Aplicar fora das 06:00.
- **Índice ignorado:** o planner só usa o índice se a expressão da consulta for idêntica à do índice. A conferência no EXPLAIN do banco local cobre isso.
- **Números curtos:** trazem muitos resultados (cerca de 350 para "38/2026"). Dá para refinar com UF, município ou órgão.
- **Altura útil:** a constante depende da barra superior (`h-16`) e do `py-6` do main. Se o layout geral mudar, ela precisa mudar junto.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação está pronta quando:

- Favoritos mostra um card por linha, na largura toda;
- a paginação fica no fim da página em Buscar e em Favoritos (no rodapé com lista curta);
- o campo "Número, processo ou controle PNCP" e o filtro "Ano" funcionam, com chips e URL;
- com número informado, o prazo mínimo não vale e "Só editais abertos" continua valendo;
- "Salvar esta busca" avisa que número, ano e "Só favoritos" ficam de fora;
- a 0079 está aplicada no banco local, com os índices em uso no EXPLAIN, e na produção só com confirmação, antes do merge;
- os testes e checks de front e backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Aplicar a 0079 só no banco local durante a implementação. A produção fica para o `/finalizar`, com a confirmação do usuário e antes do merge.
- Seguir o AGENT.md:
  - Drizzle nas queries; SQL só onde ele não cobre (a condição dos índices de expressão);
  - nomes em inglês no código e textos em português na tela.
- Manter a expressão da consulta idêntica à dos índices.
- Não mexer nas notificações nem na busca pelo órgão.
- Deixar `.portal/` e `GLOSSARIO.md` fora dos commits.
