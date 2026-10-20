# Plano de Implementação: contratos no R2 (Parquet + DuckDB)

## Origem

- Arquivo de especificação: `.plans/licitacoes-base-nacional.md`, com a decisão "custo mínimo até ter clientes" (18/10/2026) e o relatório do piloto da Parte 6 (19/10/2026, commit `cba8c7e6`).
- Data do planejamento: `2026-10-19`
- Classificação: `frontend + backend + database`, com infraestrutura (Cloudflare R2 e DuckDB).
- Substitui, no plano da base nacional: a decisão 2 (contratos no Postgres), o "Vigentes no Render", o marco de produção e as Partes 3, 4 e 5. As Partes 1, 2 e 7 e a exportação do JSON dos editais (0088) continuam valendo.

## Resumo

Os contratos saem do Postgres e passam a viver em arquivos Parquet no R2, como no piloto. O Cron Job grava os arquivos; o Web Service baixa uma cópia para o disco temporário dele e busca com o DuckDB. Tudo o que a tela de contratos faz hoje continua: busca com os mesmos filtros, detalhe, favoritos, buscas salvas e avisos de 90 e 30 dias. No Postgres ficam só os dados de cada conta (favoritos, buscas salvas e avisos) e os dias da carga. Cada ambiente grava numa pasta própria do bucket (`producao/` ou `local/`). Custo: US$ 0 a mais, com o disco do Render em 1 GB.

## Decisões do usuário

Antes do plano:
- **Custo mínimo até ter clientes (18/10/2026):** tudo o que der vai para o R2, aceitando consulta mais lenta; o disco do Render fica em 1 GB.
- **Piloto aprovado (19/10/2026):** seguir com "tudo de contratos no R2, com cópia no disco temporário do Web Service".

No plano (19/10/2026):
1. **Separação dos ambientes no R2:** mesmo bucket (`licitacoes-dados`), com uma pasta por ambiente, definida pela variável `TENDERS_STORAGE_PREFIX` (`producao` no Render, `local` no `.env.dev`). O usuário escolheu esta opção sabendo que as chaves que apareceram na conversa alcançam o bucket inteiro; ele vai trocá-las em breve (e então atualiza o `.env.dev` e o Render).

## Escopo

### Dentro do escopo

- **Parte R1, armazém de contratos:**
  - formato dos arquivos, manifesto, gravação (Cron Job) e leitura (Web Service) com DuckDB;
  - cópia local com troca de versão sem parar;
  - pasta por ambiente, também no arquivo bruto da Parte 1;
  - os 351 mil contratos do banco local passados para o armazém (`local/`);
  - limpeza dos objetos de teste do piloto, com o "sim" do usuário;
  - migration 0087a (achada na implementação): as frases de cada termo da busca numa função própria, para o armazém buscar com a mesma regra de singular e plural dos editais.
- **Parte R2, a troca:**
  - coletor (diária, carga, reconsulta de termos e avisos) gravando no armazém;
  - API e telas lendo do armazém, com o número de controle como identificador;
  - migration 0087b: sai `licitacoes.contrato`; favoritos e avisos passam a usar o número de controle.
- **Marco de produção revisto:** sem aumento de disco.
- **Parte 3, vencedores:** no armazém, sem tabela no Postgres.
- **Parte 4, página do CNPJ:** contratos e vencedores do armazém; editais do Postgres.
- **Parte 5, contratos federais:** no conjunto de contratos do armazém.

### Fora do escopo

- Editais no R2: continuam no Postgres. Só vão quando o espaço pedir; hoje são 121 MB num banco de 348 MB.
- Ler direto do R2 sem cópia local: é só o plano B, se o disco temporário do Render não comportar.
- Índice de palavras próprio ou motor de busca dedicado.
- Troca das chaves do R2: é do usuário.
- Tudo o que já estava fora no plano da base nacional (tribunais, estados, MG/SP/SC, PCA etc.).

## Leitura de contexto

- `/AGENT.md` (raiz) e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem no projeto; vale o `/AGENT.md` da raiz.
- `.plans/licitacoes-base-nacional.md` inteiro, com a "Situação" da Parte 6 (piloto).
- Migrations `0074` (`fn_tsquery_termos`), `0079` (`fn_grupos_digitos`), `0085`, `0086`, `0087` e `0088`.
- Backend: `db/schema.ts`, `collector/contractRuns.ts`, `contractRepository.ts`, `contractMapping.ts`, `contractNotifications.ts`, `archive.ts`, `config.ts`, `services/contractSearch.ts`, `contractSavedSearches.ts`, `contractDetail.ts`, `collectionOverview.ts`, `noticeSearch.ts` (`termsQuery`), `searchText.ts` e `services/dailyJobSteps.ts`.
- Front: telas, componentes, serviços e utilitários de contratos em `src/tenders/` (o id numérico aparece em rotas, links, query keys, favoritos e notificações).
- Conferências feitas no planejamento:
  - `@duckdb/node-api` 1.5.6-r.1 sem restrição de `engines` (roda no Node 22.17), com binário para Linux x64;
  - lendo do disco, o DuckDB usa só as extensões embutidas (parquet, json, icu);
  - a sequência de radicais do Postgres reproduz a busca de hoje: em 20 mil contratos locais e 6 termos, de 0 a 3 contratos a mais por termo, nenhum a menos;
  - Render: Web Service com limite de 512 MB e uso de 166 MB, e disco temporário com 57 GB livres na máquina.

## Impacto por área

### Frontend

- **Identificador:** o contrato passa a ser identificado pelo número de controle (`chave`, texto), no lugar do `id` numérico, em:
  - tipos (`types.ts`);
  - serviços (`contractsService.ts`, `contractSearchesService.ts`);
  - query keys (`queryKeys.ts`);
  - rota `/contratos/:chave` (`TendersApp.tsx`, `navigation.ts`), com `encodeURIComponent`;
  - painel lateral (`?contrato=`), favoritos (`FavoriteButton`, `useContractFavorite`) e links das notificações (`utils/notifications.ts`).
- **Estado "atualizando":** quando a API responde 503 com o código de armazém em atualização, as telas de contratos mostram "Os contratos estão sendo atualizados. Tente de novo em instantes.", com botão para tentar de novo.
- **Busca longa:** "Buscando em todos os contratos…" enquanto a busca com encerrados roda.
- **Buscas salvas:** o total "vigentes agora" mostra a data da contagem.
- Nada mais muda nas telas. Padrões: React Query, query keys centralizadas e estado na URL.

### Backend

- **Módulo novo `modules/tenders/contractStore/`**, a única porta de entrada dos contratos:
  - `layout.ts`: conjuntos, faixas, partes e nomes dos arquivos;
  - `manifest.ts`: formato e validação (zod) do manifesto;
  - o cliente do R2 com a pasta do ambiente ficou em `modules/tenders/objectStorage.ts` (e a simulação em `objectStorageTestSupport.ts`), fora da pasta do armazém, porque o arquivo bruto usa o mesmo cliente;
  - `writer.ts`: cópia de trabalho, mudanças da execução, publicação e limpeza;
  - `reader.ts`: cópia local do Web Service, troca de versão, fila e limite de tempo;
  - `criteria.ts`: a regra única dos critérios em SQL do DuckDB, usada pela tela, pelas buscas salvas e pelos avisos;
  - `textSearch.ts`: radicais e grupos de dígitos calculados pelo Postgres.
- **Coletor:** `contractRuns.ts` passa a usar o armazém. O estado anterior de cada página sai dos arquivos e das mudanças da execução; a gravação acontece na publicação. `contractRepository.ts` sai, e só os dias da carga ficam no Postgres. `contractNotifications.ts` calcula os avisos com o DuckDB e grava em `licitacoes.notificacao`.
- **Serviços e rotas:** `contractSearch.ts`, `contractDetail.ts`, `contractSavedSearches.ts`, `collectionOverview.ts` ("Contratos na base" vem do manifesto), `routes/contracts.ts`, `routes/contractSearches.ts` e `validators.ts` (chave no lugar do id).
- **Configuração (`config.ts`):**
  - `TENDERS_STORAGE_PREFIX` junto com as 4 do R2 (todas ou nenhuma);
  - sai `TENDERS_CONTRACTS_MAX_DB_MB`;
  - a carga roda com o R2 configurado e dias pendentes.
- **Rotina diária:** as etapas mantêm os nomes. A dos avisos também atualiza o total "vigentes agora" das buscas salvas.

### Banco de dados

- **0087a (Parte R1, aplicada no banco local em 19/10/2026):** a montagem das frases de cada termo da busca sai da `licitacoes.fn_tsquery_frase` para `licitacoes.fn_frases_termo` (o mesmo código), e `fn_tsquery_frase` passa a usá-la. A busca dos editais não muda; o armazém busca pelas mesmas frases. Só funções.
- **0087b (Parte R2):**
  - `licitacoes.favorito_contrato`:
    - `contrato_chave VARCHAR(60) NOT NULL` no lugar de `contrato_id`;
    - chave primária (conta, usuário, contrato_chave) e índice por `contrato_chave`;
    - no banco local, preenche a partir do `contrato_id` antes de remover a coluna.
  - `licitacoes.notificacao`:
    - `contrato_chave VARCHAR(60)` no lugar de `contrato_id`, com o mesmo CHECK de edital ou contrato;
    - índice único (conta, usuário, tipo, contrato_chave, referência) e índice por `contrato_chave`;
    - preenchida do mesmo jeito no banco local.
  - `licitacoes.busca_salva_contrato`: `total_vigentes INTEGER` e `total_em TIMESTAMPTZ`.
  - Saem `fn_contrato_atende_criterios`, `fn_contrato_vigente` e a tabela `licitacoes.contrato`. `licitacoes.contrato_carga_dia` fica.
  - Permissões do `licitacoes_coletor` ajustadas.
  - Cabeçalho com ordem e reversão. Na produção, a 0087b vem depois da 0085 a 0087a, na mesma janela, e antes do merge: o código que está na `main` não usa contratos.
- As migrations 0085 a 0087 ficam como estão (não se edita migration já aplicada). A 0088 continua como estava.
- **Números:**
  - 0087a (Parte R1) e 0087b (Parte R2) ficam antes da 0088, porque a ferramenta aplica em ordem, e a 0088 espera a exportação do JSON dos editais;
  - 0089 fica reservada para a tabela de dias da carga dos vencedores (Parte 3), se precisar.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Dependência:** `@duckdb/node-api` 1.5.6-r.1, de 28/09/2026 (mais de 2 semanas), no backend. Conferir o lockfile e o binário Linux x64 no build do Render.
- **Variável nova `TENDERS_STORAGE_PREFIX`:**
  - `producao` no Web Service e no Cron Job, criada pelo usuário antes do marco;
  - `local` no `.env.dev`, com a confirmação do usuário (o agente mostra a linha antes).
- **Disco temporário:**
  - o Web Service guarda cerca de 1 GB de cópia, e cerca de 2 GB durante a troca de versão;
  - o Cron Job baixa a cópia de trabalho a cada execução;
  - o primeiro deploy confirma o espaço.
- **R2:**
  - armazém de cerca de 1 GB para 5 milhões de contratos, mais cerca de 200 MB por ano;
  - arquivo bruto de cerca de 1 a 2 GB (213 bytes por contrato, medido na execução 3330);
  - pedidos dentro do grátis.
  - Custo: US$ 0.
- **Render:** sem mudança de disco nem de instância.
- **Cron Job:** cerca de 5 a 10 min a mais por dia para publicar os arquivos (estimativa), menos de US$ 0,05 por mês.

## Arquivos provavelmente afetados

- `backend/package.json` e o lockfile.
- `backend/drizzle/0087a_licitacoes_frases_da_busca.sql` (R1) e `0087b_licitacoes_contratos_no_r2.sql` (R2).
- `backend/src/modules/tenders/`:
  - `contractStore/` (novo) e testes;
  - `collector/`: `archive.ts`, `config.ts`, `cli.ts`, `contractRuns.ts`, `contractNotifications.ts`, `runtime.ts` e testes; `contractRepository.ts` sai;
  - `services/`: `contractSearch.ts`, `contractDetail.ts`, `contractSavedSearches.ts`, `collectionOverview.ts` e testes;
  - `routes/`: `contracts.ts`, `contractSearches.ts`, `validators.ts`, `index.ts` e testes;
  - `db/schema.ts`, `README.md` e `tenders.http`.
- `backend/src/services/dailyJobSteps.ts` e `dailyJobs.ts`.
- `backend/src/server.ts`: o leitor do armazém começa junto com o servidor, sem atrasar o `/health`.
- `src/tenders/`: `types.ts`, `TendersApp.tsx`, `services/`, `hooks/useContractFavorite.ts`, `components/` e `screens/` de contratos, e `utils/` (`navigation.ts`, `notifications.ts`, `contractFilters.ts`).
- `.plans/licitacoes-base-nacional.md`: as notas de substituição.

## Estratégia de implementação

Cada parte é uma rodada: o usuário chama `/implementar`, o agente implementa e valida, e o usuário chama `/finalizar` (commit e push, sem merge até o marco). Tudo na branch `feat/R/licitacoes-base-nacional`.

### Parte R1: armazém de contratos

1. **Dependência:** `@duckdb/node-api` 1.5.6-r.1, instalado com `--before` de 2 semanas.
2. **Pasta do ambiente:**
   - `TENDERS_STORAGE_PREFIX` em `config.ts`: obrigatória com as 4 do R2, no formato `^[a-z0-9][a-z0-9-]{0,30}$`;
   - proteção: com o banco em `localhost` ou `127.0.0.1`, a pasta `producao` dá erro de configuração;
   - o arquivo bruto passa a gravar em `<pasta>/pncp/...`;
   - a linha `TENDERS_STORAGE_PREFIX=local` entra no `.env.dev` com a confirmação do usuário.
3. **Formato** (`layout.ts`), a partir do piloto:
   - `vigentes`: vencimento de hoje em diante. Uma faixa por semana nos próximos 12 meses, por mês até 24 meses, por ano até 10 anos e uma pasta "depois", cada uma em partes de até 30 mil linhas. Ordem por vencimento e UF. É refeito a cada publicação;
   - `contratos`: todos, uma pasta por ano do contrato, em partes de até 30 mil linhas por faixa de UF e número de controle;
   - `fornecedor`: todos, só as colunas da lista, uma pasta por ano, em partes de até 60 mil linhas por faixa do CNPJ do fornecedor;
   - **colunas:** as de `licitacoes.contrato` (menos `busca_tsv`), mais `chave`, `radicais` (sequência de radicais do `licitacoes.pt_unaccent`, entre espaços) e os grupos de dígitos de número, processo, controle do contrato e da compra;
   - **ajuste fino:** medir nos 5 milhões do piloto a ordem dentro do ano por UF e número contra só por número. Escolher pela medida (a busca "palavra e UF" com encerrados contra o detalhe e o órgão) e registrar no plano.
4. **Radicais e grupos** (`textSearch.ts`): calculados no Postgres, em lote, por `to_tsvector('licitacoes.pt_unaccent', ...)` e `licitacoes.fn_grupos_digitos`. É SQL parametrizado, com o motivo comentado: a regra fica num lugar só. Os termos da busca passam pela mesma conta.
5. **Manifesto** (`manifest.ts`): versão (id da execução), data, totais (contratos, vigentes, sem vencimento) e os arquivos por conjunto (caminho, linhas, bytes, faixa), validado com zod. Os arquivos levam a versão no nome; o manifesto é enviado por último e troca a versão de uma vez.
6. **Gravação** (`writer.ts`, Cron Job):
   1. baixa o manifesto e os arquivos que faltam para uma pasta local;
   2. guarda as mudanças da execução numa tabela do DuckDB, no banco de trabalho em disco (160 MB, 1 linha de execução);
   3. responde o estado anterior por número de controle, vindo das mudanças ou dos arquivos;
   4. na publicação: regrava só as partes com mudança, refaz os vigentes, envia os arquivos novos e por último o manifesto, e apaga os que não aparecem nas 2 últimas versões.

   Um gravador por vez: a trava dos contratos que já existe.
7. **Leitura** (`reader.ts`, Web Service):
   - ao subir, baixa o manifesto e os arquivos para a pasta temporária (`os.tmpdir()`), sem atrasar o `/health`, e abre o DuckDB (128 MB, 1 linha de execução) com as tabelas sobre os arquivos locais;
   - confere o manifesto a cada 10 minutos, baixa só os arquivos novos e troca a versão sem parar as buscas em andamento;
   - fila de até 2 consultas ao mesmo tempo e limite de 20 s por consulta;
   - sem cópia pronta, responde "armazém em atualização" (503).
8. **Critérios** (`criteria.ts`): a regra dos critérios e de "vigente" em SQL do DuckDB, num lugar só:
   - termos: frase pelos radicais, nos modos OU e E, e exclusões;
   - UF, município, órgão, categoria e fornecedor;
   - faixa de valor, com a opção "sem valor".
9. **Contratos locais:** um script na pasta temporária (fora do repositório) usa o próprio `writer.ts` para passar os 351 mil contratos do banco local para `local/contratos/`.
10. **Limpeza do bucket, com o "sim" do usuário:** `piloto/teste`, `piloto/v1` e o arquivo bruto antigo da execução 3330 (na raiz, sem pasta de ambiente).
11. **Testes:**
    - formato (faixas, partes e nomes);
    - manifesto de ida e volta;
    - gravação com o R2 simulado: só as partes com mudança, limpeza das versões e falha no envio sem publicar o manifesto;
    - leitura: troca de versão e 503 sem cópia;
    - critérios contra resultados esperados;
    - radicais contra o Postgres (banco local);
    - pasta do ambiente e a proteção da `producao`.
12. README.

**Situação (19/10/2026):** implementada na branch `feat/R/licitacoes-base-nacional`, sem commit. A 0087a foi aplicada no banco local com o "sim" do usuário; a linha `TENDERS_STORAGE_PREFIX=local` entrou no `.env.dev` com o "sim" dele, e os objetos de teste do piloto saíram do bucket, também com o "sim" dele.

- **Código:**
  - `contractStore/`: `layout.ts`, `manifest.ts`, `localCopy.ts`, `duckdb.ts`, `textSearch.ts`, `criteria.ts`, `writer.ts`, `reader.ts`, os testes e o apoio dos testes;
  - cliente do R2 único, com a pasta do ambiente, em `modules/tenders/objectStorage.ts`: envia, baixa, lista e apaga; o arquivo bruto passou a usá-lo, e as três simulações do R2 dos testes viraram uma (`objectStorageTestSupport.ts`);
  - `config.ts`: as 5 variáveis do R2 todas ou nenhuma, em `loadStorageSettings` (o Web Service vai usar a mesma na R2), com a proteção da `producao` contra o banco local; no coletor, `config.archive` virou `config.storage` e `context.archive`, `context.storage`;
  - nada no coletor, na API ou nas telas usa o armazém ainda: isso é a R2.
- **Ajuste fino da ordem** (5 milhões do piloto, do disco, 1 linha de execução):

  | Busca | Só número de controle | UF e número de controle |
  |---|---|---|
  | palavra e UF (SP) | 3,0 s | 0,9 s |
  | palavra e UF (AC) | 2,0 s | 0,23 s |
  | ano, UF e palavra | 0,71 s | 0,16 s |
  | palavra no país | 3,5 s | 3,5 s |
  | órgão por CNPJ | 0,11 s | 0,10 s |
  | detalhe | 36 ms | 46 ms |

  Ficou a ordem por UF e número de controle.
- **Memória da gravação** (importação dos 351 mil contratos locais, no Windows):
  - parte de 50 mil linhas não coube em 128 MB do DuckDB; com até 30 mil, coube em 160 MB e em 128 MB;
  - a faixa da semana de 31/12 (fim do ano fiscal) pode ter centenas de milhares de contratos na produção, então os vigentes também são divididos em partes;
  - a tabela dos vigentes novos fica no banco de trabalho em disco: tabela TEMP fica só na memória;
  - pico do processo: 467 MB com o DuckDB em 160 MB e 434 MB com 128 MB, com o heap do Node limitado a 128 MB e lotes de 2.000 contratos (a coleta usa páginas de 500). O DuckDB ficou em 160 MB; os 128 MB ficam como alternativa testada se a primeira execução no Render mostrar pouca folga.
- **Busca de texto igual à de hoje** (achado na conferência real):
  - a busca de hoje acha também as formas de singular e plural de cada palavra (`fn_tsquery_termos`, 0075 e 0077), e o armazém só achava a forma escrita ("material de expediente": 2.282 contra 11.451). Correção: a 0087a separa a montagem das frases em `fn_frases_termo`, e o armazém busca por todas as frases de cada termo;
  - as palavras ignoradas no meio da frase ("de", "do") ocupam a posição delas, como no Postgres: no texto do contrato viram a marca `_`, e na frase a marca aceita uma palavra qualquer. Sem isso, "manutenção predial" achava "manutenção do prédio" (prédio e prediais têm o mesmo radical): 964 contra 855;
  - conferido: a consulta dos editais para 52 termos ficou idêntica antes e depois da 0087a.
- **Conferência real no R2** (pasta `local/`):
  - importação dos 351.138 contratos locais: 122 arquivos, 132 MB, versão 1.1, com 214.401 vigentes e 604 sem vencimento;
  - leitura: o leitor do produto baixou a cópia em 35 a 92 s daqui, e 14 critérios deram exatamente as contagens do Postgres. Entre eles, termos com frase, singular e plural, E/OU e exclusão, UF, valor, categoria, fornecedor, órgão e município;
  - tempo na cópia local: de 17 a 540 ms por contagem; memória do processo do leitor: 154 a 181 MB.
- **Validações:** tsc e vite ok; backend 594, banco 145, front 309.
- **Para a R2:**
  - a 0087a precisa estar na produção antes do deploy do código que busca no armazém;
  - o `CLAUDE.md` aparece alterado (3 linhas em branco no fim), de outra sessão: não entra nos commits deste plano.

### Parte R2: a troca

1. **Coletor (`contractRuns.ts`) no armazém:**
   - diária, carga e reconsulta dos termos usam o estado anterior do armazém e publicam no fim da execução;
   - a carga publica a cada 10 dias concluídos e só então marca os dias em `contrato_carga_dia`. Processo derrubado perde no máximo esses dias, que ficam pendentes;
   - a reconsulta dos termos pendentes vem de uma consulta do DuckDB;
   - sai o limite de espaço do banco; a carga exige o R2 configurado.
2. **Avisos (`contractNotifications.ts`):**
   - favoritos (chaves do Postgres) e buscas salvas ativas com "Notificar" (critérios do Postgres), cruzados no DuckDB com as janelas de 84 a 90 e 24 a 30 dias e com a janela inteira dos favoritos;
   - gravação em `licitacoes.notificacao`, sem repetir (índice único pela chave e pelo vencimento);
   - `CONTRATO_ALTERADO` para quem favoritou um contrato com vencimento novo;
   - atualiza `total_vigentes` e `total_em` das buscas salvas.
3. **Migration 0087b**, aplicada no banco local com confirmação.
4. **API:**
   - `GET /contracts` com os mesmos filtros:
     - "Só favoritos" passa as chaves da pessoa;
     - a busca por número usa os grupos de dígitos;
     - ordens por vencimento, publicação e valor, e relevância simplificada (quantos termos batem e a posição do primeiro);
     - o trecho destacado vem do `ts_headline` do Postgres, só para as linhas da página;
   - `GET /contracts/:chave`, `PUT` e `DELETE /contracts/:chave/favorite`;
   - buscas salvas: prévia e contagem ao salvar no DuckDB; a lista mostra o total gravado e a data;
   - Coleta: "Contratos na base" pelo manifesto;
   - travas de acesso (404/403/402) e limite de taxa como hoje; 503 com código próprio enquanto o armazém atualiza.
5. **Telas:** a chave no lugar do id; os estados "atualizando" e "buscando em todos".
6. **Saem:** `contractRepository.ts`, as funções e o uso de `licitacoes.contrato`, a variável `TENDERS_CONTRACTS_MAX_DB_MB` e os testes de banco que só testavam a tabela.
7. **Testes:**
   - coletor com o PNCP e o R2 simulados (diária, carga com publicação a cada 10 dias, reconsulta e avisos);
   - API sobre um armazém de exemplo (busca, detalhe, favoritos, buscas salvas, travas e 503);
   - banco local: favoritos, avisos e buscas salvas pela chave;
   - front: chave nas rotas e links, notificações e estado "atualizando".
8. **Conferência local:**
   - coleta diária real no banco local, publicando em `local/`;
   - navegador com a busca, o detalhe, os favoritos, as buscas salvas e os avisos;
   - medição do tempo e da memória do Web Service local.
9. README e o plano.

**Situação (20/10/2026):** implementada a partir da `540db987` (a branch `feat/R/licitacoes-base-nacional`), no commit da branch de trabalho `claude/determined-pascal-wrve3a`; falta o usuário levá-la para a `feat/R/licitacoes-base-nacional`. Sem aplicar a 0087b no banco do usuário, sem R2 de verdade e sem navegador: falta a conferência local do item 8, que é do usuário (abaixo).

- **Migration `0087b_licitacoes_contratos_no_r2.sql`** (testada no banco de teste do sandbox, com favoritos e avisos preenchidos antes):
  - `favorito_contrato` e `notificacao` trocam `contrato_id` por `contrato_chave VARCHAR(60)`, preenchida a partir da tabela antes de a coluna sair; chave primária (conta, pessoa, chave), CHECK de edital ou contrato e índice único dos avisos pela chave;
  - o **link dos avisos que já existem** também muda (`/contratos/<id>` → `/contratos/<chave com %2F>`), senão o clique abriria um contrato que não existe;
  - `busca_salva_contrato` ganha `total_vigentes` e `total_em`;
  - saem `fn_contrato_atende_criterios`, `fn_contrato_vigente` e `licitacoes.contrato`; `contrato_carga_dia` fica;
  - permissão do `licitacoes_coletor`: só `UPDATE (total_vigentes, total_em)` em `busca_salva_contrato` (os privilégios da tabela e das funções saem com elas);
  - **desvio do plano:** o índice só por `contrato_chave` na `notificacao` não volta. Ele existia para a cascata da chave estrangeira, que sai com a tabela, e nenhuma consulta procura aviso só pela chave. O índice por chave em `favorito_contrato` volta (o `CONTRATO_ALTERADO` procura quem favoritou).
- **Coletor:**
  - `contractRepository.ts` saiu; os dias da carga e o último dia lido da coleta diária ficaram em `collector/contractProgress.ts`;
  - a coleta grava nas mudanças do armazém e **publica no fim** (diária) ou **a cada 10 dias concluídos** (carga, `BACKFILL_PUBLISH_EVERY_DAYS`); os dias só são marcados em `contrato_carga_dia` depois da publicação;
  - **efeito na janela da coleta diária:** como o que foi lido só é durável na publicação, a execução que falha antes de publicar grava as consultas como **não concluídas**, e a próxima relê as mesmas janelas (antes, uma consulta terminada contava mesmo se a execução falhasse depois);
  - `CONTRATO_ALTERADO` sai **depois** da publicação, para ninguém ser avisado de uma mudança que o app ainda não mostra;
  - a reconsulta dos termos lê os pendentes do DuckDB (`countPendingTerms`, `readPendingTerms`, `saveCheckedTerms` no gravador); as mudanças da execução valem mais que os arquivos;
  - os avisos (`contractNotifications.ts`) cruzam favoritos e buscas salvas do Postgres com as janelas do armazém, em lotes, e `updateSavedSearchTotals` atualiza o total de todas as buscas das contas com acesso;
  - a coleta e os avisos usam a mesma pasta de trabalho no disco temporário (`licitacoes-contratos-coletor`): o que a coleta publicou já está lá quando os avisos começam;
  - sem o R2, a coleta diária e os avisos **falham com o motivo registrado** (aparece em Configurações › Coleta), e a carga sai com "carga não iniciada: R2 não configurado";
  - saem `TENDERS_CONTRACTS_MAX_DB_MB`, `--max-db-mb` e a parada `space` da carga; o `status` do CLI mostra a versão em uso do armazém.
- **API:**
  - `GET /contracts` (mesmos filtros), `GET /contracts/:chave` e `PUT`/`DELETE /contracts/:chave/favorite`; a chave é conferida pelo formato antes de qualquer consulta (fora dele, 404);
  - o trecho destacado e o favorito de cada linha vêm do Postgres, só para as linhas da página;
  - **tirar o favorito não consulta o armazém** (vale com os contratos atualizando); favoritar confere que o contrato está nele;
  - buscas salvas: total e data gravados (`activeCount`, `countedAt`); salvar com o armazém atualizando grava a busca sem total;
  - sem cópia pronta: **503** com `code: CONTRACT_STORE_UPDATING`; consulta lenta demais: **504** com `CONTRACT_SEARCH_TIMEOUT`;
  - `GET /collection/status`: "Contratos na base" e os vigentes vêm do manifesto, com o dia da contagem (`countedOn`);
  - `server.ts` inicia o leitor em segundo plano (`contractStore/service.ts`): R2 incompleto ou recusado não derruba o servidor, só deixa os contratos indisponíveis, com o motivo no log.
- **Telas:** a chave no lugar do id (rota `/contratos/:chave`, painel `?contrato=`, favoritos, notificações, query keys); "Atualizando os contratos" (não é falha, tenta de novo a cada 15 s, com botão) na lista, no detalhe e nos Favoritos; "Buscando em todos os contratos…" com "Incluir encerrados"; o total das buscas salvas com a data da contagem (e "—" quando ainda não foi contado); a Coleta mostra os totais do manifesto com a data.
- **Validações:** tsc e vite ok; backend 608 testes sem banco e 152 de banco (2 pulados, como antes); front 312.
- **Testes novos:** consultas do armazém (`queries.test.ts`), chave do contrato, termos pendentes e reconsulta no gravador, armazém do Web Service sem o R2, publicação e janela da coleta, carga com publicação a cada N dias e falha na publicação, avisos pelo armazém, `CONTRATO_ALTERADO`, totais das buscas salvas, 503 por HTTP, e no front a chave nas rotas e links, as notificações e o total com a data. Os testes de banco que só testavam a tabela (`contractRepository.db.test.ts`) saíram.
- **Ficou para depois, de propósito:** a restrição por ano na busca "Só favoritos" (o DuckDB já pula os arquivos pelo mínimo e máximo da chave; medir no primeiro uso real antes de complicar).

**Conferência local (do usuário, item 8), nesta ordem:**
1. Mostrar o status das migrations no banco local (`migrations:status -- --banco local`) e aplicar a **0087b** com o "sim": `migrations:aplicar -- 0087b --banco local`. Os favoritos e avisos que já existirem ganham a chave.
2. Coleta diária real publicando em `local/` (`tenders:dev -- contracts-daily`) e, depois, `contract-reminders`; conferir o `status` (versão do armazém) e Configurações › Coleta.
3. Web Service local: o leitor baixa a cópia sozinho (a busca de contratos fica "atualizando" até ele terminar); medir o tempo da primeira cópia, o da busca de uma palavra com "Incluir encerrados" e a memória do processo.
4. Navegador: busca (filtros, número, ordens, paginação), detalhe pela página própria e pelo painel (a chave com `%2F`), favoritar e tirar, "Só favoritos", buscas salvas (total com a data), clique numa notificação de contrato e o celular sem transbordo.

### Marco de produção (revisto)

1. O usuário cria `TENDERS_STORAGE_PREFIX=producao` no Web Service e no Cron Job. As outras 4 do R2 ficam como estão.
2. Status das migrations nos dois bancos.
3. Produção: 0085, 0086, 0087, 0087a e 0087b, uma por vez, com confirmação, fora das 06:00 e fora do modo automático.
4. Merge na `main` (Partes A, B e a branch nova), com confirmação.
5. Primeiro deploy:
   - conferir no Shell o espaço do disco e a memória (`/sys/fs/cgroup/memory.current`);
   - conferir o download da cópia; no começo, o armazém ainda está vazio.
6. Carga de contratos no Cron Job: blocos de 8 h, cerca de 10 dias, gravando em `producao/`, acompanhada em Configurações › Coleta.
7. Exportação do JSON dos editais na produção, conferência e então a 0088, com confirmação (sem mudança).

### Parte 3: vencedores

1. Cliente do Compras.gov.br e piloto de um mês no banco local, como no plano da base nacional.
2. **Conjunto novo no armazém, `vencedores`:**
   - uma linha por licitação e fornecedor, com o mapa item→valor em JSON, os totais, as datas e o edital ligado;
   - pasta por ano, em partes por CNPJ do fornecedor.
3. A agregação idempotente (sobrescrever o item, recalcular os totais e remover o resultado cancelado) acontece na tabela de mudanças do DuckDB. Reler o mesmo dia não soma em dobro.
4. Dias da carga no Postgres (0089), se a regra da coleta sem perder dias pedir.
5. CPF mascarado; bruto no arquivo; etapa na rotina diária, Coleta, comandos e README.
6. Testes: os do plano da base nacional, com o R2 simulado.

### Parte 4: página do CNPJ

1. Validação do CNPJ (14 dígitos, com ou sem máscara, e dígitos verificadores) no front e no backend.
2. **API:**
   - `GET /api/tenders/cnpj/:cnpj` com o resumo;
   - listas de contratos como fornecedor (conjunto `fornecedor`) e como órgão (conjunto `contratos`), de vencedores (conjunto `vencedores`) e de editais (Postgres);
   - travas de acesso e limite de taxa.
3. Tela `/cnpj/:cnpj` e caixas de busca que reconhecem CNPJ.
4. Conferência com o CNPJ da Diretriz (22.493.902/0001-40), só como caso de teste.

### Parte 5: contratos federais

1. Cliente do Compras.gov.br (órgãos da esfera federal e contratos) e piloto, como no plano da base nacional.
2. **No conjunto `contratos`:**
   - origem `COMPRASGOV` e chave `comprasgov-<id>`;
   - com `numeroControlePncpContrato` já no armazém, não duplica: vale o PNCP.
3. Etapa semanal dos vigentes e carga por órgão; Coleta, comandos e README.
4. Testes: mapeamento, deduplicação, origem e carga retomável.

## Regras de negócio identificadas

- **Contratos:** todos os tipos, vigentes e encerrados, desde 2021, como na Parte 2.
  - "A vencer" são os vigentes com vencimento.
  - Avisos e buscas salvas valem só para vigentes.
- **Identificador:** o número de controle do PNCP; na Parte 5, `comprasgov-<id>`.
- **Busca de texto:** a mesma regra dos editais (dicionário `licitacoes.pt_unaccent`, cada termo como frase, com as formas de singular e plural de cada palavra e as mesmas distâncias da frase, modos OU e E e exclusões). Conferido na Parte R1: 14 critérios com as mesmas contagens do Postgres nos 351 mil contratos locais.
- **Avisos:**
  - buscas salvas: só os contratos que entraram na janela nos últimos 7 dias;
  - favoritos: a janela inteira, um aviso por janela;
  - vencimento novo gera os avisos de novo e `CONTRATO_ALTERADO` para quem favoritou.
- **Atualização:** os dados novos aparecem depois da publicação do Cron Job, uma vez por dia, como hoje.
- **Disponibilidade:** depois de deploy ou reinício, a busca de contratos fica cerca de 1 minuto "atualizando"; editais e o resto do sistema não param.
- **Vencedores:** uma linha por licitação e fornecedor; resultado cancelado sai; CPF mascarado.
- **Federais:** quando o contrato está nos dois, vale o PNCP.

## Regras multi-tenant e segurança

- **Contratos, vencedores e federais:** dado público e global, sem conta, nos arquivos do R2.
- **Favoritos, buscas salvas e avisos:** continuam no Postgres, filtrados por conta e pessoa como hoje. As chaves e os critérios de uma pessoa nunca entram em consulta de outra.
- **Travas e erros:** as rotas de contratos e do CNPJ mantêm as travas de acesso do módulo e o limite de taxa. As mensagens de erro não vazam detalhes internos nem o endereço do R2.
- **Chaves do R2:**
  - só em variáveis de ambiente, colocadas pelo usuário;
  - nunca no repositório, em log, nos detalhes da execução, no manifesto ou na conversa;
  - bucket privado.
- **Pasta do ambiente:** obrigatória com o R2, com a proteção de não gravar em `producao` a partir do banco local.
- **Chave da URL:** validada por expressão regular antes de entrar em qualquer consulta. O SQL do DuckDB é sempre com parâmetros, nunca concatenado com texto da pessoa.

## Validações necessárias

- **Chave do contrato:** formato do número de controle do PNCP (`^\d{14}-\d-\d{6}/\d{4}$`) ou `comprasgov-<id>`; fora disso, 404.
- **Filtros de contratos:** os mesmos de hoje (`requestReaders.ts`), com os limites atuais de termos, página e por página.
- **Variáveis:** `TENDERS_STORAGE_PREFIX` com o formato e a proteção acima; as 5 do R2 todas ou nenhuma.
- **Manifesto e arquivos:** manifesto validado com zod; arquivo citado e ausente faz a leitura tentar de novo com o manifesto seguinte; manifesto inválido mantém a versão anterior e registra erro.
- **CNPJ (Parte 4):** 14 dígitos e dígitos verificadores; senão, 400.

## Testes necessários

### Frontend

- Chave do contrato nas rotas, nos links, no painel lateral e nos links das notificações (codificação de `/`).
- Estado "atualizando" (503) e "buscando em todos".
- Total "vigentes agora" com a data da contagem.
- Parte 4: utilitário do CNPJ e caixas de busca.

### Backend

- **Armazém:**
  - formato, manifesto e gravação parcial com o R2 simulado;
  - limpeza das versões e falha no envio;
  - leitura com troca de versão, fila, limite de tempo e 503;
  - critérios;
  - radicais e grupos contra o Postgres (banco local).
- **Coletor:**
  - diária, carga (publicação a cada 10 dias e dias marcados só depois);
  - reconsulta dos termos e avisos, com o PNCP e o R2 simulados;
  - pasta do ambiente e proteção da `producao`.
- **API:** busca (todos os filtros e ordens), detalhe, favoritos, buscas salvas (prévia, contagem e limite de 50), travas e 503.
- **Banco local:** 0087b (favoritos e avisos pela chave, preenchidos a partir do id) e avisos sem repetir.
- **Partes 3 e 5:** os testes do plano da base nacional, com o R2 simulado.
- Os testes existentes que não são de contratos continuam passando.

### E2E

- Conferência local: coleta real publicando em `local/`, Web Service local baixando a cópia, navegador com todas as telas de contratos e celular sem transbordo.
- Primeiro deploy: disco, memória, download da cópia e a primeira publicação do Cron Job.
- Parte 4 com o CNPJ da Diretriz.

## Comandos de validação sugeridos

Um de cada vez, nunca em paralelo: o computador não tem arquivo de paginação.

```bash
npx vite build
npm test
npm --prefix backend run build             # tsc --noEmit
npm --prefix backend test
npm --prefix backend run test:tenders-db   # banco local (.env.dev)
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:status -- --banco producao   # só leitura
```

Coletas locais: o script da pasta temporária passa o banco local só para o processo, como antes.

## Riscos e pontos de atenção

- **Palavra em todos os contratos, com encerrados:** de 6 a 12 s no Render (estimativa; medida aqui em 3 s). As outras buscas ficam abaixo de ~1 s.
- **CPU do servidor (0,5 CPU):** uma busca pesada deixa o resto mais lento enquanto roda. A proteção é a fila de 2 consultas e o limite de 20 s; medir no primeiro deploy.
- **Minuto "atualizando":** acontece depois de cada deploy ou reinício.
- **Disco temporário do Render:** não é documentado. O primeiro deploy confirma; o plano B é ler direto do R2 (um `/planejar` à parte).
- **Tamanho da troca:** coletor, API e telas mudam juntos na Parte R2, e muitos testes de banco viram testes com arquivos.
- **Diferenças pequenas na busca:** a relevância e o trecho destacado são refeitos (a contagem é a mesma do Postgres).
- **Chaves expostas:** enquanto não forem trocadas, as chaves que apareceram na conversa alcançam também a pasta `producao/`. A troca é do usuário, em breve, e depois o `.env.dev` e o Render precisam ser atualizados.
- **Publicação interrompida:** os arquivos novos vão antes e o manifesto por último. Uma queda no meio deixa arquivos sem uso, que a limpeza apaga; a versão em uso não muda.
- **Consumo de R2:** pedidos e espaço dentro do grátis pela estimativa. Acompanhar no painel da Cloudflare no primeiro mês.
- **Branches:** a troca acontece na branch nova, antes do merge das Partes A e B. Qualquer conflito: parar e mostrar.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **R1:**
  - o armazém grava e lê no R2, na pasta do ambiente;
  - a gravação regrava só as partes que mudaram e troca a versão de uma vez;
  - a leitura troca a cópia sem parar e responde 503 sem cópia;
  - os 351 mil contratos locais estão em `local/`.
- **R2:**
  - a tela de contratos, o detalhe, os favoritos, as buscas salvas e os avisos funcionam no banco local lendo do armazém, com os mesmos filtros de hoje;
  - `licitacoes.contrato` não existe mais no banco local;
  - a coleta diária publica uma versão nova.
- **Marco:** migrations aplicadas com confirmação, merge feito, primeiro deploy conferido (disco e memória) e carga em andamento gravando em `producao/`.
- **Parte 3:** vencedores agregados sem soma em dobro; a Diretriz mostra as licitações que venceu.
- **Parte 4:** a página do CNPJ da Diretriz mostra contratos e licitações vencidas, com as travas de acesso.
- **Parte 5:** contratos federais da lei antiga aparecem sem duplicar os do PNCP.
- **Cada parte:** testes, `tsc` e builds passando, e o seu `/finalizar`.

## Roteiro de comandos até concluir (combinado em 19/10/2026)

O usuário chama as skills; o agente pede confirmação nos pontos marcados.

| # | O usuário chama | O que acontece | Ação ou confirmação do usuário |
| --- | --- | --- | --- |
| 1 | `/implementar` | Parte R1: armazém de contratos | "Sim" para a linha `TENDERS_STORAGE_PREFIX=local` no `.env.dev` e para apagar os objetos de teste do bucket |
| 2 | `/finalizar` | Commit e push da R1 | "Não" ao merge |
| 3 | `/implementar` | Parte R2: a troca | "Sim" para a 0087b no banco local |
| 4 | `/finalizar` | Commit e push da R2 | "Não" ao merge |
| 5 | `/finalizar` (pergunta do merge) | Marco de produção | Antes: `TENDERS_STORAGE_PREFIX=producao` no Web Service e no Cron Job. Depois, "sim" ao merge, fora do modo automático: o agente aplica 0085, 0086, 0087, 0087a e 0087b na produção, uma por vez, com confirmação, e faz o merge |
| 6 | — | Primeiro deploy e carga de contratos no Cron Job (cerca de 10 dias) | Conferir no Shell o disco e a memória; acompanhar em Configurações › Coleta |
| 7 | (pedido) | Exportação do JSON dos editais na produção e a 0088 | "Sim" a cada passo, fora do modo automático |
| 8 | `/implementar` | Parte 3: vencedores (piloto local) | "Sim" para a 0089 local, se precisar |
| 9 | `/finalizar` | Commit, push e merge da Parte 3 | "Sim" ao merge (a 0089 na produção antes, se houver) |
| 10 | `/implementar` | Parte 4: página do CNPJ | — |
| 11 | `/finalizar` | Commit, push e merge da Parte 4 | "Sim" ao merge |
| 12 | `/implementar` | Parte 5: contratos federais (piloto) | — |
| 13 | `/finalizar` | Commit, push e merge da Parte 5 | "Sim" ao merge |

## Observações para a skill implementar

- Usar este plano como fonte principal; o plano da base nacional vale para as Partes 1, 2 e 7, para a 0088 e para o contexto (piloto e estudos).
- Uma parte por `/implementar`, na ordem: R1, R2, marco de produção, 3, 4 e 5.
- **Migrations:** não executar sem confirmação explícita; uma por vez, nomeada, primeiro no banco local. Não editar 0085 a 0088.
- **`.env`:** só com confirmação do usuário, mostrando a linha antes. O agente nunca mexe no `.env` da raiz (produção) e nunca imprime chave do R2.
- **Sem sobreposição:** o armazém substitui a tabela de contratos. Não manter as duas, não criar caminho paralelo de leitura direta do R2 e apagar o código antigo junto (`contractRepository.ts`, as funções da 0086 e `TENDERS_CONTRACTS_MAX_DB_MB`).
- **Regra única:** critérios e "vigente" só em `contractStore/criteria.ts`; radicais e grupos de dígitos sempre pelo Postgres.
- **Ambiente:** rodar build e testes um de cada vez. Scripts com barra invertida, pela ferramenta Write.
- Seguir o `/AGENT.md`: código em inglês e textos em português; Drizzle nas queries novas do Postgres, com SQL parametrizado e comentado onde a regra é do banco; sem `any`; sem `catch` silencioso.
