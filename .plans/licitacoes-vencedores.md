# Plano: vencedores das licitações (Parte 3)

## Origem

- Arquivo de especificação: `.plans/licitacoes-contratos-no-r2.md`, Parte 3 (linhas 325-334). A Parte 3 do `.plans/licitacoes-base-nacional.md` está substituída; dela valem só o cliente, o piloto de um mês e a janela de até 365 dias, como referência.
- Regra da janela diária: `.plans/licitacoes-contratos-coleta-sem-perda.md`.
- Data do planejamento: 20/10/2026; revisado em 25/10/2026 (seção "Revisão de 25/10/2026", no fim).
- Classificação: `backend + frontend + database`, com infraestrutura (R2 e Cron Job). O frontend é só uma linha em Configurações › Coleta.
- Ponto de partida: `main` no commit `7660eab5` (Partes R1 e R2 já na `main`; nenhum arquivo do módulo de Licitações mudou desde o `881c99db`, então as linhas citadas neste plano continuam valendo). O estado da produção vem do usuário: migrations 0085 a 0087b aplicadas, `TENDERS_STORAGE_PREFIX=producao` nos dois serviços, deploy no ar e **0088 ainda pendente**, porque espera a exportação conferida do JSON dos editais. Eu não consultei produção.
- Trabalho somente de leitura: nada foi editado, nenhuma migration foi rodada.

## Resumo

Os resultados de licitações da Lei 14.133 (Compras.gov.br) viram o quarto conjunto do armazém Parquet do R2, o `vencedores`: uma linha por licitação e fornecedor, com o mapa item→valor em JSON, os totais, as datas e a ligação com o edital. Pasta por ano da compra, partes ordenadas pelo CNPJ do fornecedor. Entra no mesmo manifesto dos contratos, escrito por um gravador irmão que roda no Cron Job, com a mesma trava dos contratos. A agregação é idempotente: reler o mesmo dia não muda nada, e o resultado cancelado sai. Não há tabela de resultados no Postgres. O Web Service não baixa nem abre os vencedores nesta parte (a leitura é da Parte 4).

**Nada do Compras.gov.br foi lido na fonte oficial** (o host está bloqueado no ambiente do agente). O endpoint, os campos e os limites vêm de fontes de terceiros. Tudo isso está marcado como SUPOSIÇÃO (S1 a S16), e o primeiro passo é uma sondagem somente leitura que o usuário roda no computador dele, antes de qualquer mapeamento e antes de ligar a coleta na rotina diária.

Aceite sem tela: o comando `winners-lookup --cnpj` lista as vitórias de um CNPJ (o da Diretriz entra só como argumento) e é conferido contra a própria API.

## Decisões do usuário

Já tomadas (planos anteriores):
- **Custo mínimo até ter clientes (18/10/2026):** tudo o que der vai para o R2; não criar tabelas grandes no Postgres.
- **Armazém de contratos no R2 (19/10/2026):** a Parte 3 grava vencedores nele, sem tabela no Postgres.
- **Pasta por ambiente (19/10/2026):** `TENDERS_STORAGE_PREFIX` (`producao/` ou `local/`), também para o arquivo bruto.
- **CNPJ da Diretriz (22.493.902/0001-40):** só caso de teste. Nada no código é específico dele.

A aprovar neste plano (recomendação entre parênteses; detalhes em `decisionsNeeded`):
1. Cadastro de reserva (situação 3) conta como vencedor? (Não conta.)
2. A 0087c inclui uma tabela pequena de dias da carga (cerca de 2.000 linhas)? (Sim.)
3. A coleta só liga na rotina quando você definir `TENDERS_WINNERS_ENABLED=1` no Cron Job, depois do piloto? (Sim.)
4. CPF de pessoa física completo no arquivo bruto, se a fonte mandar? (Mascarar também no bruto.)
5. A carga histórica de vencedores roda depois da carga de contratos, só com o tempo que sobrar na rotina, e a coleta diária de vencedores (curta, cerca de 20 min) roda antes da carga de contratos? (Sim.)

## Escopo

### Dentro do escopo

- **Sondagem da API (passo 1):** cliente do Compras.gov.br e comando `winners-probe`, sem banco e sem R2 (o comando sai antes de abrir o runtime do coletor, que exige a URL do banco). É a porta de entrada: o mapeamento só é escrito depois dela.
- **Conjunto `vencedores` no armazém do R2:**
  - colunas, chave, pasta por ano da compra, partes por CNPJ do fornecedor;
  - chave aditiva no manifesto dos contratos (formato continua 1);
  - gravador irmão com agregação idempotente na tabela de mudanças do DuckDB.
- **Agregação:** sobrescrever o item, recalcular os totais do mapa, remover o resultado cancelado, tratar a troca de fornecedor do mesmo item.
- **Coleta:**
  - diária (`VENCEDORES_DIARIA`) com releitura dos últimos dias;
  - carga histórica (`VENCEDORES_CARGA`) do mais recente ao mais antigo, retomável.
- **Arquivo bruto no R2:** conjunto novo `comprasgov/resultados`.
- **Rotina diária:** etapa da coleta diária, etapa da carga com guarda de prazo, flag de ligar.
- **Comandos de CLI:** `winners-probe`, `winners-daily`, `winners-backfill`, `winners-lookup`.
- **Consultas de leitura mínimas** (`winnerQueries.ts`: resumo por CNPJ, principais órgãos, lista de vitórias), usadas só pelo `winners-lookup`.
- **Configurações › Coleta:** um card "Vencedores" ao lado do de Contratos.
- **Migration 0087c:** amplia o CHECK de tipos de execução e cria a tabela de dias da carga (se a decisão 2 for sim). Numerada 0087c, e não 0089, para a ferramenta aplicá-la sem esperar a 0088 (ver "Banco de dados").
- **Testes, README e piloto de um mês no banco local** (com `TENDERS_STORAGE_PREFIX=local`).

### Fora do escopo

- **Parte 4 (CNPJ):**
  - rota e tela do CNPJ;
  - validação dos dígitos do CNPJ no backend;
  - limite de taxa;
  - consultas por órgão, concorrência e itens de uma vitória;
  - o Web Service baixar e abrir o conjunto `vencedores`.
- **Parte 5:** contratos federais da lei antiga.
- **Busca por texto/objeto nos vencedores:** o resultado não traz o objeto (S6); os editais ficam só 12 meses no Postgres.
- **Segunda ordenação** (por órgão e compra) e **segunda cópia** do conjunto: a Parte 4 decide, com medição.
- **Anulação ou revogação da compra inteira** quando o resultado do item continua "informado": limite conhecido da v1.
- **Revisão dominical de 45 dias e revalidação rolante:** só entram se o piloto mostrar cancelamentos tardios relevantes. O reparo manual (`winners-backfill --from --to`) já existe.
- **Oráculo `winners-verify` e script de escala no repositório:** a conferência é contra a própria API e por releitura sem mudança; o teste de escala é um script descartável fora do repositório.
- **Refatorar `PncpClient` e o `ContractStoreWriter`** (ambos em produção): o plano duplica de propósito e registra a dívida.
- **Troca das chaves do R2:** é do usuário.
- **Tabela de resultados no Postgres:** substituída pelo armazém.

## Leitura de contexto

- `/CLAUDE.md` (regras do projeto) e `/AGENT.md` da raiz.
- Planos: `.plans/licitacoes-contratos-no-r2.md` inteiro, `.plans/licitacoes-base-nacional.md` (Partes 3, 4 e piloto) e `.plans/licitacoes-contratos-coleta-sem-perda.md`.
- Armazém (`backend/src/modules/tenders/contractStore/`): `layout.ts`, `manifest.ts`, `writer.ts`, `reader.ts`, `localCopy.ts`, `duckdb.ts`, `queries.ts`, `criteria.ts`.
- Coletor (`backend/src/modules/tenders/collector/`): `contractRuns.ts`, `contractProgress.ts`, `contractMapping.ts`, `pncpClient.ts`, `archive.ts`, `config.ts`, `runs.ts`, `runtime.ts`, `repository.ts`, `cli.ts`, `dbTestSupport.ts`.
- Outros: `db/schema.ts`, `domains.ts`, `services/collectionOverview.ts`, `services/dailyJobSteps.ts`, `services/dailyJobs.ts`, `services/contractDetail.ts`, `drizzle/0085_licitacoes_contratos.sql`.
- Front: `src/tenders/components/CollectionPanel.tsx`, `types.ts`, `utils/labels.ts`, `utils/collectionRuns.ts`.
- Conferido no código (cada item sustenta uma escolha abaixo):
  - O CHECK `coleta_execucao_tipo_check` só existe na 0085 (linhas 118-121); tipo novo falha no INSERT sem migration, e `tipo` é `varchar(20)` (`schema.ts:337`).
  - O manifesto é `z.object` não estrito, com `format: z.literal(1)` (`manifest.ts:23`). Chave nova com `.default([])` é aceita nos dois sentidos; subir o `format` congelaria o Web Service antigo.
  - `ContractStoreWriter.publish` monta o manifesto com 3 conjuntos fixos (`writer.ts:388-395`) e a limpeza apaga tudo em `contratos/arquivos/` que os 2 últimos manifestos não citam (`writer.ts:624-634`). Sem carregar `vencedores` adiante, a publicação de contratos destrói os vencedores.
  - O leitor cria uma visão por conjunto (`reader.ts:107-109`, `:225-229`) e baixa todos os arquivos do manifesto (`localCopy.ts:27-38`). Visão sobre arquivo inexistente falha na criação (verificado com DuckDB 1.5.6): por isso o Web Service não pode listar `vencedores` sem baixá-los.
  - O escritor de contratos não tem exclusão de linha (tudo em `mudancas` é escrito, `writer.ts:534-536`) e está preso a `numero_controle_pncp`. Não serve para o cancelamento.
  - `columnsOf` (`layout.ts:134-136`) é um ternário: um conjunto novo cairia em silêncio nas colunas de contratos. `SLICE_PARTITION` (`layout.ts:167`) e `ROW_GROUP_SIZE` (`:32`) são globais.
  - `supplierDocument` com tipo de pessoa nulo devolve o texto sem máscara (`contractMapping.ts:220`); o CPF mascarado mostra só 6 dos 11 dígitos (`:215`).
  - `readCollectionStatus` pega a última execução por tipo (`repository.ts:163-170`). Reusar `CONTRATOS_*` ou `MANUAL` esconderia a execução de contratos no painel.
  - O PNCP permite alterar `niFornecedor` e `dataResultado` de um resultado, e `/resultados` não tem DELETE (`collector/docs/pncp-api-openapi.json`): a troca de fornecedor do mesmo item é possível.
  - Os detalhes da execução só são gravados no fim (`runs.ts:164`; `contractRuns.ts:444-446`).
  - A edital liga pela coluna `numero_controle_pncp` (`schema.ts:59`).
- Contradições entre os planos, resolvidas (o plano do R2 prevalece sobre o da base nacional):
  - vencedores no Postgres (BN) contra vencedores no armazém (R2): armazém;
  - 0087c com tabela de resultados e dias (BN) contra 0087c só para dias, se preciso (R2): ver decisão 2;
  - limite de espaço do banco na carga (BN): saiu, vale só o limite de tempo;
  - "pilotos gravam no banco local" (BN): o piloto grava em `local/` no R2.
- Não consegui ler: o endpoint de resultados do Compras.gov.br (os planos não o nomeiam e os estudos `.plans/estudo-fontes-*.md` citados na BN não existem). Não rodei testes nem consultei banco.

## Suposições sobre a API (a confirmar na sondagem)

Fontes: terceiros (compras-mcp 0.4.0, basedosdados, GovHub) e o OpenAPI do PNCP no repositório. Nenhuma foi lida na fonte oficial.

| # | Suposição | Como o passo 1 confirma |
| --- | --- | --- |
| S1 | `GET https://dadosabertos.compras.gov.br/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133` (módulo no plural), sem autenticação, uma linha por item e resultado | Uma página real |
| S2 | Envelope `{resultado, totalRegistros, totalPaginas, paginasRestantes}`; página vazia vem 200 com lista vazia ou 204 | Chaves do topo e página além do fim |
| S3 | Janela por `dataResultadoPncpInicial` e `dataResultadoPncpFinal` (AAAA-MM-DD); o fim é **exclusivo**; o endpoint não filtra por atualização | Consulta `[d,d]` contra `[d,d+1]`, comparando as datas devolvidas |
| S4 | Página de 10 a 500; 501 dá HTTP 400 | Pedir 500 e 501 |
| S5 | Janela máxima de 365 dias (afirmação do plano). **O desenho não depende dela**: usa 1 dia na carga | Uma contagem de janela longa |
| S6 | Campos: `idContratacaoPNCP`, `numeroItemPncp`, `sequencialResultado`, `niFornecedor`, `tipoPessoa`, `nomeRazaoSocialFornecedor`, `porteFornecedorNome`, `valorTotalHomologado`, `dataResultadoPncp`, `dataAtualizacaoPncp`, `dataCancelamentoPncp`, `situacaoCompraItemResultadoId/Nome`, `unidadeOrgaoCodigoUnidade`, `unidadeOrgaoUfSigla`. O objeto da licitação não vem | Chaves e % de preenchimento |
| S7 | `idContratacaoPNCP` é o número de controle da compra, no formato do edital | % que casa com a expressão `PURCHASE_CONTROL_NUMBER` |
| S8 | Situação do resultado: 1 informado, 2 cancelado, 3 cadastro de reserva; o significado de 4 é desconhecido | Valores distintos reais, com nomes |
| S9 | Resultado cancelado continua sendo devolvido (situação 2) e `dataResultadoPncp` não muda no cancelamento | Releitura do piloto em D+7 e D+30 |
| S10 | 429 sem `Retry-After`, com o tempo de espera no corpo | Só registrar se vier (não provocar) |
| S11 | A resposta traz UF e unidade; talvez nome do órgão e município | Chaves presentes |
| S12 | A cobertura inclui estados e municípios, não só a esfera federal | Órgãos e UFs distintos num dia |
| S13 | `niFornecedor` de pessoa física chega com 11 dígitos, completo | Só o comprimento (nunca imprimir o CPF) |
| S14 | Paginação estável dentro de um dia | Duas passadas, comparando os conjuntos |
| S15 | Existe o filtro `niFornecedor` | Consulta com o CNPJ da Diretriz |
| S16 | Os dados começam por volta de 2021-04 | Contagem por mês |

## Desenho escolhido

Base: o desenho "mínimo" (fiel ao código e ao plano, o mais simples), com os acréscimos de operação dos outros dois. Onde os desenhos divergiam, a escolha e o porquê:

- **Manifesto:** o mesmo dos contratos (chave aditiva). O plano diz "conjunto novo no armazém" e a Parte 4 lê por um leitor só; o risco de rollback e de corrida é coberto por trava compartilhada, teste e ordem de deploy.
- **Gravador:** classe irmã (`winnerWriter.ts`), duplicando `writeFile` e `writeParts`. Não mexe no escritor de contratos, que está em produção; a dívida fica registrada.
- **Cliente HTTP:** cliente próprio, sem extrair o núcleo do `PncpClient`, pelo mesmo motivo.
- **Progresso da carga:** tabela pequena de dias (decisão 2), cópia do molde testado de `contrato_carga_dia`. A "fronteira e buracos" do desenho mínimo é lógica nova sem ganho, e ficar só nos detalhes perde o bloco se o processo cair.
- **Janela diária:** relê 7 dias antes do último dia completo. A fonte filtra por data do resultado e um resultado pode ser informado dias depois; o piloto ajusta.
- **Ordem na rotina:** vencedores depois da carga de contratos, com guarda de prazo. Um estouro de tempo ou falta de memória nos vencedores não tira o dia da carga de contratos.
- **Flag de ligar:** `TENDERS_WINNERS_ENABLED`, desligada por padrão. Deixa o deploy inerte até a 0087c e o piloto.
- **Bruto:** só o que é inédito, o que mudou o estado e o que foi recusado. O bruto é descarregado antes de publicar, e falha de envio aborta a publicação.
- **Leitura pelo Web Service:** fora da Parte 3. O leitor ganha a opção `datasets` e o padrão continua sem `vencedores`.
- **Regravação:** o ano inteiro de cada ano tocado, não só as faixas afetadas. Um lote diário espalha poucos milhares de linhas por quase todas as faixas de CNPJ do ano.

### Conjunto `vencedores`

- **Caminho:** `contratos/arquivos/vencedores/<ano_compra>/v<revisão>-<seq 4 dígitos>.parquet`, dentro da pasta do ambiente, pela `storeFileKey` existente (`layout.ts:195-197`). A pasta continua se chamando `contratos` por legado: assim a limpeza do bucket e a da cópia local protegem os arquivos pelo manifesto.
- **Partição:** ano da compra, tirado do sufixo `/AAAA` do número de controle. É imutável; o ano do resultado mudaria a linha de pasta quando o resultado fosse retificado.
- **Partes:** até 25.000 linhas, divididas por faixa da `chave` (como `writeParts`, `writer.ts:552-582`); row group de 10.000; zstd. Ponto de partida, remedido no piloto.
- **Ordem:** `ORDER BY chave`. `PART_KEY` é a mesma coluna.
- **Manifesto:** `datasets.vencedores: z.array(fileSchema).default([])`, `format` continua 1. O total de linhas sai da soma de `rows` dos arquivos; não há chave nova em `totals`.

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `chave` | VARCHAR NOT NULL | `<fornecedor_chave>\|<numero_controle_compra>`. PJ: 14 dígitos. PF, PE e sem documento: documento (mascarado, texto saneado ou `sem-documento`) + `#` + 8 hex do SHA-256 do nome normalizado. Nunca nula |
| `numero_controle_compra` | VARCHAR NOT NULL | Liga ao edital (`numero_controle_pncp`); sem chave estrangeira. Formato inválido: registro recusado |
| `ano_compra` | SMALLINT NOT NULL | Sufixo `/AAAA`. Pasta e poda |
| `orgao_cnpj` | VARCHAR NOT NULL | 14 primeiros dígitos do número de controle (derivado) |
| `orgao_razao_social`, `municipio_nome`, `municipio_ibge` | VARCHAR | Preenchidos só se o campo existir (S11); senão NULL. Coluna nova depois é barata (`union_by_name`) |
| `unidade_codigo`, `uf` | VARCHAR | S6; NULL se não vier |
| `fornecedor_tipo_pessoa` | VARCHAR | PJ, PF ou PE. Se faltar, deduzido pelos dígitos (14 PJ, 11 PF) **antes** de `supplierDocument` |
| `fornecedor_documento` | VARCHAR | `supplierDocument` existente: CNPJ, CPF mascarado ou texto (30). Coluna da busca por CNPJ |
| `fornecedor_nome`, `fornecedor_porte` | VARCHAR | Do registro ativo lido |
| `itens` | VARCHAR (JSON) | `{"<item>/<seq>": [valor ou null, "AAAA-MM-DD"]}`, chaves em ordem numérica. Só resultados vencedores (situação 1) |
| `quantidade_itens` | INTEGER | Itens distintos do mapa. Recalculada |
| `valor_homologado_total` | DECIMAL(18,2) | Soma do mapa em centavos inteiros. Recalculada |
| `primeira_data_resultado`, `ultima_data_resultado` | DATE | Menor e maior data do mapa. Recalculadas |
| `hash_conteudo` | VARCHAR | `payloadHash` do conteúdo canônico, sem as datas da coleta |
| `primeira_coleta_em`, `ultima_alteracao_em` | VARCHAR | ISO. `ultima_alteracao_em` só muda quando o conteúdo muda |
| `removido` | BOOLEAN | **Só na tabela de mudanças**, nunca no Parquet. Lápide |

A lista da Parte 4 que não selecionar `itens` não o lê (Parquet é colunar).

## Impacto por área

### Frontend

- `src/tenders/types.ts`: `COLLECTION_RUN_TYPES` ganha `VENCEDORES_DIARIA` e `VENCEDORES_CARGA`; novo tipo do status dos vencedores. A lista é duplicada à mão do backend, sem teste que as compare.
- `src/tenders/utils/labels.ts`: `RUN_TYPE_LABELS` ("Vencedores: coleta diária", "Vencedores: carga inicial").
- `src/tenders/utils/collectionRuns.ts`: reaproveita `dailyCollectionSummary`, `archiveSummaryLabel`, `runDurationLabel` e `backfillSummary` sem mudar; acrescenta a conversão do detalhe da carga e o rótulo das linhas na base.
- `src/tenders/components/CollectionPanel.tsx`: novo card `WinnersCard` ao lado do `ContractsCard`. Card próprio, porque a pílula de status e a "Próxima prevista" do card de contratos são da `CONTRATOS_DIARIA`.
  - Campos: status da última coleta diária, última coleta, período lido, lidos · novos · atualizados, arquivo bruto, linhas na base, carga inicial (N de M dias), próxima prevista.
- Textos neutros: nem "PNCP" nem "Compras.gov.br" na tela.
- Sem rota nova, sem tela nova.

### Backend

- **Armazém:** conjunto no layout e no manifesto, download e leitor por lista de conjuntos, gravador irmão, consultas mínimas.
- **Coletor:** cliente do Compras.gov.br, mapeamento, execuções diária e carga, progresso, arquivo bruto, configuração, CLI.
- **Rotina diária:** duas etapas novas, flag e guarda de prazo.
- **Painel:** `collectionOverview.ts` ganha o bloco `winners` e as duas chaves de `COLLECTION_SCHEDULE`.
- Sem rota HTTP nova. `GET /collection/status` é lido por qualquer membro com acesso ao módulo: só contagens e datas.

### Banco de dados

Uma migration, `0087c_licitacoes_vencedores.sql` (a letra a põe antes da 0088, como a 0087a e a 0087b):
1. Recria `coleta_execucao_tipo_check` com os 9 tipos atuais mais `VENCEDORES_DIARIA` (17 caracteres) e `VENCEDORES_CARGA` (16), que cabem em `varchar(20)`. Mesmo padrão da 0085:118-121.
2. Se a decisão 2 for sim: cria `licitacoes.resultado_carga_dia` (`dia DATE PRIMARY KEY`, `concluido_em TIMESTAMPTZ NOT NULL DEFAULT now()`, `registros_lidos INT NOT NULL DEFAULT 0`). Cerca de 2.000 linhas ao fim da carga.
3. `GRANT SELECT, INSERT, UPDATE, DELETE` na tabela nova para `licitacoes_coletor`, no mesmo bloco `DO $$` da 0085:125-132.
4. Cabeçalho com a ordem (aplicar **antes** do deploy do código e fora das 06:00 de Brasília, porque a rotina grava em `coleta_execucao`) e a reversão (apagar as linhas dos tipos novos antes de restaurar o CHECK; `DROP TABLE` da de dias).
- Por que a 0087c é obrigatória: sem ela o `startCollectionRun` falha no INSERT. A frase "se a regra da coleta sem perder dias pedir" (R2:332) estava imprecisa: a janela diária não pede tabela (usa `detalhes.queries`); quem pede é só a carga retomável, e o CHECK pede a migration de qualquer forma.
- Nunca editar 0085 a 0088. Sem coluna nova, sem índice novo.
- **Por que 0087c e não 0089:** a ferramenta (`scripts/migrations.ts`, `migrationToApply` em `src/utils/migrationStatus.ts:88-110`) aplica uma migration por vez e recusa a que tem pendente **anterior pelo número**. A 0088 está pendente na produção (a trava dentro dela exige a exportação conferida do JSON dos editais); uma 0089 só poderia ser aplicada depois dela, e o início dos vencedores ficaria preso a uma tarefa que não é deles. A 0087c fica entre a 0087b e a 0088 e é aplicada sem esperar a exportação, o mesmo caminho que a 0087a e a 0087b já seguiram (plano do R2, linha 116). A 0088 continua exatamente como está, e aplicar a 0087c antes ou depois dela dá no mesmo.

### Infra/Deploy

- **Sem disco novo no Render.** O Web Service não baixa vencedores nesta parte: memória, disco e janela "atualizando" ficam como estão. A cada publicação de vencedores a revisão do manifesto muda e o leitor troca as visões (rápido, sem download).
- **R2:** conjunto Parquet de 0,1 a 0,75 GB (piso medido em dado sintético: 87 bytes por linha; real 130 a 250) e bruto de cerca de 1,2 GB na carga completa. Soma com os contratos fica dentro dos 10 GB grátis; acompanhar no primeiro mês.
- **Variáveis novas** (todas opcionais, com padrão; só o Cron Job precisa de alguma):
  - `TENDERS_WINNERS_ENABLED`: `1` liga as duas etapas. Padrão desligado. Você coloca no Render (Cron Job) depois do piloto.
  - `COMPRASGOV_REQUEST_INTERVAL_MS`: 0 a 60000, padrão provisório 1500. O piloto define.
  - `TENDERS_WINNERS_BACKFILL_FROM`: padrão `2021-04-01`.
  - `TENDERS_WINNERS_BACKFILL_MINUTES`: 1 a 600, padrão 120.
  - Constantes no código: base `https://dadosabertos.compras.gov.br`, página 500, tempo limite de 60 s, 5 tentativas, prazo da rotina de 690 min, releitura diária de 7 dias, lote de 4.000 registros, publicação a cada 20 dias na carga.
- **Onde moram na configuração:** `config.comprasGov` (só `requestIntervalMs`; a base e o tempo limite são constantes) e `config.winners` (`enabled`, `backfillFrom`, `backfillMinutes`). Nunca dentro de `config.contracts` (o `config.test.ts:29-37` faz `deepEqual` nele).
- `.env` e Render só com confirmação, mostrando a linha. Nunca imprimir chave do R2.
- **Cron Job:** limite de 12 h citado no README e "a conferir" no plano de coleta sem perda; confira na documentação do Render antes de ligar. A rotina já chega a cerca de 9,5 h durante a carga de contratos.
- **Ordem de deploy:** 0087c na produção (fora das 06:00; não depende da 0088 nem da exportação do JSON dos editais) → merge (Cron Job e Web Service sobem com a flag desligada) → piloto aprovado → você liga a flag.

## Arquivos provavelmente afetados

Novos (`backend/src/modules/tenders/`):
- `collector/comprasGovClient.ts`, `comprasGovClient.test.ts`
- `collector/resultProbe.ts`, `resultProbe.test.ts`
- `collector/resultMapping.ts`, `resultMapping.test.ts`
- `collector/resultRuns.ts`, `resultRuns.test.ts`, `resultRuns.db.test.ts`
- `collector/resultProgress.ts`
- `collector/fixtures/comprasgov-resultados.json` (saída da sondagem, sem CPF completo)
- `contractStore/winnerRows.ts`, `winnerRows.test.ts`
- `contractStore/winnerWriter.ts`, `winnerWriter.test.ts`
- `contractStore/winnerQueries.ts`, `winnerQueries.test.ts`
- `backend/drizzle/0087c_licitacoes_vencedores.sql`

Alterados:
- `contractStore/layout.ts` (+ `layout.test.ts`): conjunto, colunas, `columnsOf` como `Record`, `CONTRACT_DATASETS`, expressão do número de controle.
- `contractStore/manifest.ts`: chave `vencedores` com `.default([])`; `manifestFiles` com lista de conjuntos.
- `contractStore/localCopy.ts`: `downloadManifestFiles` com lista de conjuntos.
- `contractStore/reader.ts` (+ `reader.test.ts`, `service.ts`): opção `datasets`; `status().winners` opcional.
- `contractStore/writer.ts` (+ `writer.test.ts`): 2 linhas (`:173` e `:394`).
- `contractStore/storeTestSupport.ts`: `sampleResult` e `publishWinnersWith`.
- `services/contractDetail.ts`: importa a expressão do número de controle em vez de declará-la.
- `collector/contractMapping.ts`: exportar `cleanText` e `isValidPncpDate`, se necessário.
- `collector/contractProgress.ts`: extrair `readLastCompletedDay(db, type, endpoint)`; a função dos contratos passa a chamá-la.
- `collector/contractRuns.ts`: só o `export` de `requireStorage` (hoje privada, `:77`); nenhuma mudança de comportamento.
- `collector/archive.ts` (+ `archive.test.ts`), `config.ts` (+ `config.test.ts`), `runs.ts`, `runtime.ts`, `repository.ts` (só comentário), `dbTestSupport.ts`, `cli.ts` (+ `cli.test.ts`).
- `db/schema.ts`, `domains.ts`, `services/collectionOverview.ts` (+ teste).
- `backend/src/services/dailyJobSteps.ts` (+ teste), `dailyJobs.ts`.
- `README.md` do módulo.
- Front: `src/tenders/types.ts`, `utils/labels.ts`, `utils/collectionRuns.ts` (+ teste), `components/CollectionPanel.tsx`.

## Estratégia de implementação

Uma parte por `/implementar`. Há duas paradas combinadas com o usuário: depois do passo 1 (ele roda a sondagem) e no passo 11 (ele roda o piloto).

### Passo 1: cliente do Compras.gov.br e sondagem (sem banco, sem R2). GATE G1

Arquivos: `collector/comprasGovClient.ts` e teste, `collector/resultProbe.ts` e teste, `collector/config.ts` e teste (só `COMPRASGOV_REQUEST_INTERVAL_MS` por enquanto), `collector/runs.ts` (campo `comprasGov` em `CollectorContext`), `collector/runtime.ts`, `collector/dbTestSupport.ts` (opção `resultsFetch`, padrão "pedido inesperado"), `collector/cli.ts` e teste, `collector/fixtures/comprasgov-resultados.json`.

1. `ComprasGovClient`, no molde do `PncpClient` (`fetch`, `sleep`, `random`, `now`, `onRetry` injetáveis):
   - `pages({from, to})` como `AsyncGenerator`, com envelope validado por zod (S2);
   - 204 e página vazia; repetição de 5xx, rede e 429 com os mesmos tempos do PNCP (1, 2, 4, 8 s com jitter; 429 em 30, 60, 120 s com teto de 2 min; `Retry-After` honrado);
   - erro tipado `ComprasGovRequestError` com `{endpoint, page, attempts, status}`, **sem o nome da fonte nem o corpo da resposta**;
   - pedido com `dataResultadoPncpFinal = to + 1` (constante `WINDOW_END_EXCLUSIVE`, S3); teto de páginas contra laço infinito;
   - intervalo entre pedidos pela variável; contador de requisições com as repetidas.
2. **`winners-probe`: um comando só, relatório curto.** Sem nenhuma opção, faz tudo e imprime um JSON de cerca de 60 linhas, sem CPF completo, sem nome de pessoa física e sem corpo de resposta:
   - **Dia da amostra:** hoje menos 10 dias, em Brasília (um dia já fechado); `--day AAAA-MM-DD` troca.
   - **Estrutura (S1, S2, S6):** HTTP, chaves do topo do envelope, `totalRegistros` e `totalPaginas` do dia, chaves de um registro e % de preenchimento de cada campo.
   - **Valores distintos (S8, S13):** situação do resultado (com o nome), tipo de pessoa e porte, e o **comprimento** do documento do fornecedor por tipo de pessoa (nunca o documento).
   - **Número da compra (S7):** % do `idContratacaoPNCP` que casa com a expressão do número de controle.
   - **Fronteira e tamanho de página (S3, S4):** `[d,d]` contra `[d,d+1]`; páginas de 500 e de 501.
   - **Cobertura (S12):** UFs distintas e órgãos distintos no dia.
   - **Ritmo (S10):** 5 páginas em sequência com o intervalo configurado, com o tempo de cada uma. Se vier 429, só registra código, tempo pedido e 200 caracteres do corpo (não provoca).
   - **Início e volume (S16):** `totalRegistros` por mês desde 2021-01 (um pedido por mês, cerca de 70), que projeta a carga e mostra o primeiro mês com dado.
   - **Defasagem (S9, parcial):** diferença entre a data de atualização e a do resultado (p50, p95, p99), se os dois campos existirem.
   - **Amostra:** dois registros de cada tipo de pessoa, com o documento mascarado e o nome de pessoa física trocado. O agente grava o fixture a partir dela.
   - Opções para depois do G1: `--max-pages N` e `--fornecedor <cnpj>` (contagem de itens e soma de `valorTotalHomologado` ativos daquele CNPJ no dia, usada na conferência da Diretriz no piloto).
   - Tempo total estimado: 2 a 4 minutos (cerca de 100 pedidos, 1,5 s entre eles).
   - **Roda sem banco e sem R2.** O `main()` do `cli.ts` hoje sempre chama `createCollectorRuntime`, que exige `TENDERS_COLLECTOR_DATABASE_URL` e abre a conexão com o banco (foi o erro que o usuário viu ao rodar o `status`). O `winners-probe` sai antes disso (conjunto `COMMANDS_WITHOUT_RUNTIME`), lê só `COMPRASGOV_REQUEST_INTERVAL_MS` por um carregador próprio (`loadComprasGovSettings`, exportado de `config.ts` e usado também por `loadCollectorConfig`) e cria o logger sozinho. Teste: o comando termina sem nenhuma variável de ambiente definida.
3. **GATE G1.** O usuário roda **uma linha** no computador dele (o host está bloqueado no ambiente do agente) e cola a saída:

   ```
   npm --prefix backend run tenders -- winners-probe
   ```

   É `tenders`, não `tenders:dev`: o comando não precisa de banco nem de arquivo de ambiente (e o `tenders` nunca carrega o `.env` de produção por padrão). Critério para seguir ao passo 2: **S1, S2, S6 e S7 confirmadas** (o endpoint responde, o envelope é o esperado, os campos do mapeamento existem e o número da compra tem o formato do edital). Se alguma falhar, o desenho do mapeamento, da chave e da ligação com o edital volta para o usuário antes do passo 2. S8, S12 e S13 não barram, mas decidem coisas: situação 4 e cancelamento (S8), cobertura só federal (S12: volta ao dono, "vale seguir?") e CPF completo (S13: define a decisão 4).

### Passo 2: núcleo puro (só depois do G1)

Arquivos: `contractStore/winnerRows.ts` e teste, `collector/resultMapping.ts` e teste, `contractStore/layout.ts` (expressão do número de controle), `services/contractDetail.ts` (importa de `layout.ts`), `collector/contractMapping.ts` (exportar helpers privados).

1. `resultMapping.ts`: zod `looseObject` com os nomes reais do relatório; `mapResult(raw)` devolve `{ok:true, record}` ou `{ok:false, purchase, reason}` (até 3 motivos, no padrão de `contractMapping.ts:131-168`). Registro inválido conta erro `record` e não derruba a página.
   - Situação → vencedor (1), cancelado (2 ou `dataCancelamentoPncp` preenchida), reserva (3) e outra.
   - Tipo de pessoa resolvido pelos dígitos quando faltar, antes de chamar `supplierDocument` (que, com tipo nulo, devolveria o CPF sem máscara).
   - Identidade do fornecedor (PJ, PF, PE, sem documento) com hash do nome normalizado.
2. `winnerRows.ts` (sem DuckDB, sem banco, sem relógio real):
   - chave, ano e órgão a partir do número de controle;
   - chave do item `<numeroItem>/<sequencial>`;
   - `applyResults(linhasDaCompra, registros)` com as regras da seção "Regras de negócio";
   - centavos inteiros; JSON canônico do mapa; `hash_conteudo`;
   - ida e volta entre a linha e o registro do Parquet.

### Passo 3: armazém, retoques aditivos (sem mudar o comportamento dos contratos)

Arquivos: `layout.ts`, `manifest.ts`, `localCopy.ts`, `reader.ts`, `service.ts`, `writer.ts`, `storeTestSupport.ts` e os testes de `contractStore/`.

1. `layout.ts`: `STORE_DATASETS` ganha `vencedores` (`:24`); `SlicedDataset` o exclui (`:28`), porque o escritor de contratos só regrava `contratos` e `fornecedor`; `MAX_ROWS_PER_FILE`, `ROW_ORDER` e `PART_KEY` ganham a entrada (`:31`, `:153-164`); `WINNER_COLUMNS`; `columnsOf` vira `Record<StoreDataset, ...>` (`:134-136`); nova `CONTRACT_DATASETS` (`vigentes`, `contratos`, `fornecedor`).
2. `manifest.ts`: `datasets.vencedores` com `.default([])`; `format` continua `z.literal(1)`; `manifestFiles(manifest, datasets = STORE_DATASETS)`.
3. `localCopy.ts`: `downloadManifestFiles(..., datasets = STORE_DATASETS)`; a limpeza local continua guardando tudo o que os manifestos em uso citam.
4. `reader.ts`: opção `datasets` (padrão `CONTRACT_DATASETS`). Conjunto não selecionado usa a tabela `vazio_<conjunto>` na visão (`:225-229`). `status()` ganha `winners?: {rows}`, presente só quando o manifesto tem arquivos de vencedores (testes que comparam o status exato continuam válidos).
5. `writer.ts`: `:173` baixa `CONTRACT_DATASETS`; `:394` monta `datasets` com `vencedores: this.manifest?.datasets.vencedores ?? []`. **Sem esta linha a publicação de contratos apaga os vencedores.**
6. O passo de avisos (`contractRuns.ts:648-654`) e o Web Service usam o padrão e não mudam.
7. Testes: manifesto de produção sem a chave é aceito; manifesto com a chave é aceito pelo schema antigo (cópia do schema antigo dentro do teste); publicar contratos depois de vencedores preserva a lista e os arquivos (o teste falha se a linha `:394` faltar); a limpeza do bucket e a da cópia local não apagam arquivo de vencedores; leitor padrão não baixa nem abre vencedores (visão vazia); leitor com `vencedores` lê.
8. Critério: os testes existentes de `contractStore/` e de `contractRuns` passam **sem edição de asserções**.

### Passo 4: gravador de vencedores e consultas de leitura

Arquivos: `contractStore/winnerWriter.ts` e teste, `contractStore/winnerQueries.ts` e teste, `contractStore/storeTestSupport.ts`.

1. `WinnerStoreWriter.open(storage, directory, version, now, logger)`:
   - lê o manifesto; baixa só `vencedores`; apaga o que o manifesto não usa;
   - recria `trabalho-vencedores.duckdb` em disco (DuckDB de 128 MB, 1 thread; mesma pasta de trabalho dos contratos, que é segura porque a trava é a mesma);
   - cria `mudancas_vencedores` (colunas do conjunto + `removido BOOLEAN NOT NULL DEFAULT false`, `PRIMARY KEY (chave)`) e a visão `atual_vencedores` sobre os arquivos (tabela vazia se não houver arquivo).
2. `readStates(compras)`: uma consulta por lote, **por compra** (para achar a troca de fornecedor), com `ano_compra IN (...)` (poda por arquivo) e `numero_controle_compra IN (literais validados)`. Mudanças da execução valem mais que os arquivos; linha dos arquivos só se a chave não estiver em `mudancas_vencedores` (`NOT EXISTS`, nunca `NOT IN`). Lápide conta como linha ausente.
3. `apply(registros)`: chama `applyResults`; grava em `mudancas_vencedores` só as linhas cujo hash mudou, mais as lápides (NDJSON + `read_json` + `INSERT OR REPLACE`, como `writer.ts:431-442`). O agrupamento por chave acontece em Node **antes**, porque duas linhas com a mesma chave no mesmo `INSERT` ficam com a primeira (verificado). Devolve contadores e quais registros alteraram o estado.
4. `publish()`: sem mudança, devolve `null`. Senão, para cada ano com mudança:
   - o conjunto do ano é os arquivos sem as chaves de `mudancas_vencedores` mais as linhas de `mudancas_vencedores` com `removido = false` (`UNION ALL BY NAME`);
   - divide em `ceil(linhas / 25.000)` partes por limites de chave e grava com `COPY ... ORDER BY chave` em Parquet zstd;
   - ano que ficou sem linha gera zero arquivos e sai do manifesto; anos sem mudança mantêm os arquivos.
   - Ordem: arquivos novos, **manifesto por último** (cópia do anterior com `revision` e `publishedAt` novos; `vigentes`, `contratos`, `fornecedor`, `today` e `totals` carregados adiante), zerar mudanças, limpar do bucket o que nem o manifesto anterior nem o novo citam, limpar o disco.
   - Sem manifesto anterior (ambiente novo): manifesto válido com contratos vazios e `totals` zerados.
5. Cópia consciente de `writeFile`/`writeParts`/limpeza (cerca de 40 linhas), com comentário apontando os gêmeos em `writer.ts:445-469`, `:552-582`, `:624-634`.
6. `winnerQueries.ts` (padrão de `queries.ts:159-187`): resumo por CNPJ (licitações, itens, valor, primeira e última data, por ano), principais órgãos, lista paginada das vitórias sem a coluna `itens`, ordem `ultima_data_resultado DESC, numero_controle_compra, chave`.
   - CNPJ validado por `^\d{14}$` e injetado como **literal** (`sqlLiteral`), mais faixa em `chave` (`>= '<cnpj>|'` e `< '<cnpj>}'`); nunca `list_contains` com parâmetro (não poda: 61 ms contra 4 a 5 ms medidos em 1,2 milhão de linhas).
   - Contagens com `::INTEGER` (nunca BigInt). Todas as consultas de um pedido cabem num único callback de `query()`.

### Passo 5: migration 0087c, schema e tipos (exige "sim" do usuário)

Arquivos: `backend/drizzle/0087c_licitacoes_vencedores.sql`, `db/schema.ts` (`tenderResultBackfillDays`, ao lado de `:121-127`), `domains.ts` (`COLLECTION_RUN_TYPES`), `services/collectionOverview.ts` (`COLLECTION_SCHEDULE` com `[DAILY_JOBS_SLOT]` para os dois) e teste, `src/tenders/types.ts`, `src/tenders/utils/labels.ts`, `collector/repository.ts` (comentário da trava).

1. Escrever o SQL conforme a seção "Banco de dados".
2. Aplicar **uma vez, nomeada, no banco local**, só com "sim" explícito; depois `migrations:status` local (só leitura).
3. Atualizar os `Record` exaustivos no mesmo passo para o `tsc` fechar (backend e front).
4. Os testes de banco de execução só passam depois da 0087c no local.
5. Trava: reusa `COLLECTOR_LOCK_KEYS.contracts` (`repository.ts:22-27`). Os dois gravadores publicam no mesmo manifesto e usam a mesma pasta de trabalho, então nunca rodam juntos.

### Passo 6: execuções diária e carga, progresso e arquivo bruto

Arquivos: `collector/resultRuns.ts` e testes, `collector/resultProgress.ts`, `collector/contractProgress.ts`, `collector/archive.ts` e teste, `collector/config.ts` e teste, `collector/runs.ts`, `collector/runtime.ts`, `collector/dbTestSupport.ts`.

1. `archive.ts`: `ARCHIVE_DATASETS.results = { source: 'comprasgov', name: 'resultados' }`.
2. `config.ts`: `config.winners` (`enabled`, `backfillFrom`, `backfillMinutes`) com as variáveis `TENDERS_WINNERS_*` (nunca dentro de `config.contracts`: `config.test.ts:29-37` faz `deepEqual` nele). `config.comprasGov` já nasceu no passo 1.
3. `contractProgress.ts`: extrair `readLastCompletedDay(db, type, endpoint)`; `readLastCompletedDailyDays` chama a nova função (mudança pequena, coberta pelos testes existentes).
4. `resultProgress.ts` (espelho de `contractProgress.ts:66-117`, sem tocar nas funções dos contratos): dias concluídos entre duas datas, dia mais recente, marcar dia (upsert), andamento (contagem, mais antigo, mais novo).
5. `runResultsDaily(context)` (molde de `contractRuns.ts:447-490`), com `withCollectionRun(context, 'VENCEDORES_DIARIA', COLLECTOR_LOCK_KEYS.contracts, ...)`:
   - **Janela:** `[from − 7, to]`, com `{from, to} = dailyContractWindow(hoje, último dia completo)` (`contractRuns.ts:341-346`). Dia normal: `[hoje − 8, hoje]`. Parada longa: segue em etapas de até 7 dias, sem perder dia.
   - **Último dia completo:** lido de `detalhes.queries` da última `VENCEDORES_DIARIA` terminada, com `{endpoint: 'resultados', completed: true}` (contenção JSONB, sem tabela).
   - **Detalhes:** `today` e `queries[] = {endpoint, from, to, completed, recordsRead}`.
   - `completed` significa: lida por inteira **e** publicada. Se a execução lançar antes de publicar, todas ficam `completed=false` (cópia da regra de `contractRuns.ts:477-483`).
   - Sem R2 configurado, falha com a mensagem de `requireStorage` (`contractRuns.ts:77-84`, hoje privada: ganha `export`, nada mais).
6. `runResultsBackfill(context, {from, to, maxMinutes, deadlineAt})` (molde de `contractRuns.ts:547-636`):
   - Sem R2: pula com "carga não iniciada", sem abrir execução. Sem dia pendente: "carga concluída", sem abrir execução.
   - Faixa: `from = --from ?? TENDERS_WINNERS_BACKFILL_FROM`; `to = --to ?? dia mais recente concluído ?? ontem`. Depois da primeira execução o fim fica fixo e os dias novos são da coleta diária.
   - Unidade de **1 dia** (pedido `[d, d+1)`), do mais recente ao mais antigo. Uma falha perde 1 dia e não um mês.
   - Antes de cada dia confere o tempo do bloco (`maxMinutes`) e o `deadlineAt` da rotina; para com motivo `time`.
   - Dia com falha da fonte fica pendente; 3 seguidos encerram o bloco com o motivo `pncp` (reaproveitado, o front já o rotula).
   - Publica a cada 20 dias concluídos e no fim do bloco, e **só depois de publicar** marca os dias em `resultado_carga_dia`.
   - `--from/--to` explícitos releem exatamente o intervalo, sem pular dias já marcados (reparo).
   - Grava `detalhes.backfill` no `finally`, no formato que `backfillRunView` lê (`collectionOverview.ts:169-181`).
7. **Laço de leitura** (diária e carga):
   - páginas → mapeia (inválido: erro `record`) → lote de 4.000 registros acumulados entre páginas, fechado no fim do dia → `readStates` → `apply`;
   - `recordsRead` soma os registros lidos; `newCount` são as linhas novas; `updatedCount` são as alteradas ou removidas (uma linha criada nesta execução e alterada de novo não conta duas vezes);
   - o bruto recebe o registro como veio (antes do mapeamento) quando ele foi recusado, alterou o estado, ou é de um dia ainda não coberto, **com o documento de pessoa física mascarado antes do `append`** (decisão 4: o `RunArchive.append` grava o objeto que receber, então a máscara é aplicada ao registro antes de ele entrar). Se a decisão 4 for "como veio", a máscara sai e nada mais muda.
8. **Proteções da coleta robusta:**
   - dia só vale como lido se as **linhas distintas** lidas (licitação, item e sequência) forem tantas quanto o `totalRegistros` que a fonte informa; faltando, o dia é lido de novo com outro tamanho de página (499, 437 e 389), aplicando só o que ainda não veio, e depois de 4 leituras sem completar ele não vale como lido (erro `incomplete`). Mudou no piloto: a contagem de páginas não pega a falha real da fonte (ver "Situação", 26/10/2026);
   - mais de 5% de registros inválidos numa janela com pelo menos 100 registros derruba a execução (provável mudança de formato; vira FALHA e nada é coberto);
   - janela diária com zero registros também falha (anomalia: a fonte entrega milhares por dia);
   - antes de cada publicação: descarregar o bruto (`flush`) e, se o envio do bruto falhou, **não publicar** e não cobrir nada. `RunArchive.flush()` pode ser chamado várias vezes (cada envio usa o número de parte seguinte), mas **não lança** quando o envio falha: ele conta em `summary().failures` e chama `onFailure` (`archive.ts:102-151`). Por isso o laço compara `summary().failures` antes e depois do `flush` e aborta a publicação se o número subiu;
   - falha de envio ao R2 (arquivo ou manifesto) lança e nada é coberto;
   - métricas em `detalhes.metrics` (páginas, requisições, repetições, tempo por página, linhas novas/atualizadas/removidas/iguais, situação de reserva e desconhecida, registros inválidos, fornecedores sem documento, defasagem de cancelamento por faixa) e `detalhes.store {revision, rows, files, bytes}`; o pico de RSS vai no log de cada publicação.
9. Testes: ver "Testes necessários". Os de execução com banco precisam da 0087c no local.

### Passo 7: rotina diária, flag, guarda de prazo e CLI

Arquivos: `services/dailyJobSteps.ts` e teste, `services/dailyJobs.ts`, `collector/cli.ts` e teste, `collector/runs.ts` (`readStatus`).

1. `DAILY_JOB_STEPS` ganha `tenders-winners-daily` e `tenders-winners-backfill`.
   - `tenders-winners-daily` entra depois de `tenders-contract-reminders` e antes da limpeza de domingo.
   - `tenders-winners-backfill` entra como **última** etapa, depois de `tenders-contracts-backfill`. O teste "a carga de contratos é sempre a última" (`dailyJobSteps.test.ts:31-35`) vira "a carga de vencedores é a última e a de contratos é a penúltima".
   - **Ordem e motivo:** a coleta diária de vencedores é curta e precisa rodar todo dia, por isso vai antes da carga de contratos (que não tem guarda de prazo e passa de 9 h). A carga de vencedores é a que se adapta ao tempo que sobrar.
   - **Risco aceito:** as etapas rodam no mesmo processo. Uma exceção comum numa etapa não impede as seguintes (`dailyJobs.ts:79-91`), mas uma falta de memória (kill) na diária de vencedores derrubaria a carga de contratos que vem depois. Mitigação: flag desligada por padrão, `rssMb` por etapa e o critério de 400 MB do piloto. Se o RSS não voltar ao nível inicial entre as etapas, o plano B é mover as duas etapas de vencedores para depois da carga de contratos, ou para um processo filho.
2. `dailyJobs.ts`: guarda o instante de início da rotina; a carga de vencedores recebe `deadlineAt = início + 690 min` (constante) e usa `min(minutos configurados, minutos restantes − 15)`. Sem tempo, a etapa sai "pulada" com o motivo, não como falha. Hoje não existe prazo global; os contratos **não mudam**. `TENDERS_RUNS` é um `Record<TendersStep, (context) => ...>`: só a etapa da carga de vencedores recebe também o prazo (`runTendersStep` passa `{ deadlineAt }` a ela); as outras mantêm a assinatura.
3. As duas etapas conferem `TENDERS_WINNERS_ENABLED`. Desligada: pulada com log "vencedores desligados". Os comandos de CLI funcionam sempre.
4. O log "Etapa finalizada" ganha o RSS (`rssMb`) de cada etapa, para ver em produção se a memória do processo sobe entre as etapas.
5. CLI: `winners-probe` (passo 1), `winners-daily`, `winners-backfill [--from] [--to] [--max-minutes]`, `winners-lookup --cnpj <14 dígitos> [--limit N]`. Atualizar `CLI_COMMANDS`, a união `CliCommand` (o `winners-backfill` e o `winners-lookup` têm campos próprios), `USAGE`, `CLI_OPTIONS` (novas: `cnpj`, `limit`, `day`, `fornecedor`; `max-pages` já existe e passa a valer também para o probe), `OPTIONS_BY_COMMAND` (`Record` exaustivo: o compilador pega o esquecimento) e o `switch` de `runCommand` (também exaustivo). **`parseBackfillOptions` devolve `name: 'contracts-backfill'` fixo (`cli.ts`, última linha da função): passa a receber o nome do comando e a devolver o certo, e os testes do `contracts-backfill` continuam iguais.** O `main()` ganha o desvio do `winners-probe` antes de `createCollectorRuntime` (passo 1).
6. `winners-lookup`: abre um `ContractStoreReader` com `datasets: ['vencedores']` numa pasta de consulta; imprime o resumo, os principais órgãos e as 20 vitórias mais recentes, com o edital ligado quando existir no banco (consulta em lote pelo número de controle) ou o link da compra. O CNPJ vai como argumento.
7. `status` mostra o progresso dos vencedores e `contractStore.winners.rows`.

### Passo 8: linha dos vencedores em Configurações › Coleta

Arquivos: `services/collectionOverview.ts` e teste, `src/tenders/types.ts`, `utils/collectionRuns.ts` e teste, `components/CollectionPanel.tsx`.

1. `CollectionStatusView` ganha `winners: { rows, backfill: { completedDays, oldestDay, lastRun } }`. `rows` vem de `contractStore.status().winners` (manifesto em memória); o andamento da carga vem de `resultado_carga_dia`; `lastRun` vem de `detalhes.backfill` da última `VENCEDORES_CARGA`. **Nunca consultar o DuckDB no endpoint de status.**
2. `WinnersCard` e as duas funções de utilitário. O card entra no mesmo grid de `StatusCards`, depois do `ContractsCard`, com `md:col-span-2` como ele (`CollectionPanel.tsx:69` e `:175`). Mensagens de erro neutras desde a origem.
3. Teste do front: "Painel da Coleta: linhas do arquivo e dos vencedores".

### Passo 9: README e plano

`backend/src/modules/tenders/README.md`: estrutura, variáveis, comandos, etapas e ordem, trava compartilhada, conjunto `vencedores` (colunas, chave, partição, ordem), regras de agregação e cancelamento, ordem de deploy, risco de rollback do Cron Job, números do piloto. `.plans/licitacoes-contratos-no-r2.md`: registrar a Parte 3 feita e as decisões (0087c com CHECK e dias, manifesto compartilhado, Web Service sem vencedores até a Parte 4).

### Passo 10: validação, um comando de cada vez

Ver "Comandos de validação sugeridos".

### Passo 11: piloto de um mês no banco local. GATE G2

Rodado pelo usuário, com `TENDERS_STORAGE_PREFIX=local` (a proteção que recusa `producao` com banco local continua) e a 0087c aplicada no local. A flag fica desligada; só os comandos de CLI são usados.

1. Fase A, contagem: `winners-probe --count --from 2021-01-01 --to <ontem>` projeta a carga completa e acha o primeiro mês com dado.
2. Fase B, um mês: `winners-backfill --from 2026-09-01 --to 2026-09-30 --max-minutes 120`. Registrar: registros, páginas, tempo por página (p50, p95, máximo), 429/5xx, linhas após a agregação, itens por linha (média, p95, máximo), bytes de Parquet por linha, tamanho do bruto, tempo e RSS de cada publicação.
3. Fase C, idempotência: repetir a mesma faixa. Esperado: nenhuma linha nova ou alterada, nenhuma publicação, nenhum arquivo novo.
4. Fase D, conferência: `winners-lookup --cnpj <um fornecedor do mês>` contra `winners-probe --fornecedor <cnpj>` no mesmo período (itens e valor total). O CNPJ da Diretriz entra aqui só como caso de teste, passado como argumento.
5. Fase E, tardios e cancelados: reler o mês em D+7 e D+30 e medir resultados inéditos com data antiga, cancelados e valores ou datas alterados. Isso decide a releitura diária (padrão 7 dias) e se vale uma revisão semanal. **A fase E não barra o G2 nem o merge:** as fases A a D e F decidem o G2; a releitura em D+7 e D+30 segue depois, com a coleta já ligada na produção, e só ajusta uma constante (a releitura diária) ou pede o plano da revisão semanal.
6. Fase F, escala: script descartável **fora do repositório** replica as linhas do mês até cerca de 2 milhões (método do piloto de 5 milhões dos contratos) e mede a publicação do ano mais cheio, a consulta de estado por lote e a consulta por CNPJ.
7. Ajustar os padrões com a medida (intervalo, linhas por parte, dias entre publicações, releitura, minutos do bloco) e registrar os números no README. A mudança de constante entra no mesmo trabalho da Parte 3 (commit, push e merge só no `/finalizar`, com autorização).

Critérios de aceite do piloto (G2):
- API confirmada: endpoint, envelope, campos, situação, fronteira e limites;
- sem 429 no intervalo escolhido (ou intervalo ajustado até não haver);
- registros inválidos abaixo de 1% e número da compra válido em pelo menos 99,9%;
- linhas distintas lidas iguais a `totalRegistros` em todos os dias (a primeira leitura vem falha na maioria dos dias com mais de duas páginas; o critério vale depois da releitura com outro tamanho de página) e nenhum dia sem completar;
- releitura sem nenhuma mudança;
- conferência da Diretriz batendo com a API;
- custo diário projetado (abrir, ler 9 dias, publicar) de até 20 min;
- carga completa projetada em até 25 h de leitura;
- pico de RSS do gravador abaixo de 400 MB com o heap do Node limitado (`NODE_OPTIONS=--max-old-space-size=200`);
- publicação do ano mais cheio em até 5 min e consulta de estado por lote em até 2 s;
- Parquet e bruto projetados, somados aos contratos, abaixo de 8 GB no R2.
- A releitura em D+7 e D+30 (fase E) fica fora dos critérios: é acompanhamento.

Se algum critério falhar, voltar ao passo correspondente. Não seguir para a produção.

### Passo 12: `/finalizar` e ligar na produção, em etapas

1. Com "sim": aplicar a 0087c na produção **antes** do merge (`--banco producao --confirmo`), fora das 06:00 de Brasília; commit, push e merge. Com a flag desligada o deploy é inerte.
2. Conferir no Render o limite de duração do Cron Job e o tamanho da instância (memória). Nenhum arquivo do repositório confirma.
3. Etapa 1: você define `TENDERS_WINNERS_ENABLED=1` no Cron Job com `TENDERS_WINNERS_BACKFILL_MINUTES=30`. Acompanhar 2 a 3 rotinas: duração total, memória do Cron Job, `rssMb` entre as etapas, tempo de publicação, card em Configurações › Coleta.
4. Etapa 2: subir os minutos da carga quando a de contratos terminar. A guarda de prazo impede estourar a rotina.
5. Plano B se a rotina estourar ou a memória não couber: rodar as etapas de vencedores em processo filho, ou um segundo Cron Job só para eles.
6. Primeira execução de vencedores só depois de o Cron Job novo estar ativo (ver risco de rollback).

## Regras de negócio

- **Unidade:** uma linha por licitação (número de controle da compra) e fornecedor. A fonte entrega uma linha por item e resultado; a agregação soma os resultados **ativos** do mesmo fornecedor na mesma compra.
- **Quem é vencedor** (S8, a sondagem confirma): situação 1 e sem `dataCancelamentoPncp`. Situação 2 ou `dataCancelamentoPncp` preenchida é cancelado. Situação 3 (cadastro de reserva) e qualquer outra não vencem; contam em `detalhes.metrics` para o piloto olhar. Decisão 1 do usuário.
- **Agregação** (função pura, ordem do lote irrelevante):
  1. Deduplica o lote por (compra, `item/seq`): fica o de maior `dataAtualizacaoPncp`; empate, o último lido.
  2. Processa em ordem (compra, item, seq). Para cada registro: **remove a chave `item/seq` de todas as linhas da compra** e, se for vencedor, grava `[valor, data]` na linha do fornecedor atual (criando-a). Isso cobre sobrescrita, cancelamento, reativação, mudança de valor ou data e troca de fornecedor do mesmo item.
  3. Recalcula as linhas tocadas **só a partir do mapa**: `quantidade_itens`, `valor_homologado_total` (centavos inteiros), primeira e última data. Nada é somado ao total anterior.
  4. Hash igual ao anterior: nenhuma mudança (não entra em `mudancas_vencedores`, não regrava parte, não toca `ultima_alteracao_em`).
  5. Mapa vazio com linha anterior: lápide. Sem linha anterior: nada.
- **Idempotência:** reler o mesmo dia, uma janela sobreposta ou a mesma página duas vezes dá o mesmo estado. Leitura parcial seguida da completa dá o estado da completa. O estado vindo das mudanças e o vindo dos arquivos dão o mesmo resultado.
- **Remoção:** só por resultado cancelado explícito. **Nenhuma remoção é feita por ausência** numa leitura (uma leitura incompleta nunca apaga vitória).
- **CPF:** pessoa física sempre mascarada (`***.DDD.DDD-**`) no conjunto. O CPF completo nunca é derivado nem guardado. O nome entra num hash curto da chave para duas pessoas com os mesmos 6 dígitos não se fundirem. Decisão 4 sobre o bruto.
- **Janela diária:** relê 7 dias antes do último dia completo (sobreposição por desenho, sem crescer a cada dia). Parada longa é recuperada em etapas de até 7 dias a partir do último dia completo, sem comando manual.
- **Carga histórica:** do mais recente ao mais antigo, um dia por vez, retomável pela tabela de dias, com limite de tempo. O dia só é marcado depois de publicado.
- **Ligação com o edital:** pelo número de controle da compra, "quando existir". O edital sai do Postgres 12 meses depois de encerrado, então a maioria dos vencedores antigos não terá edital: sem chave estrangeira; o link da compra no PNCP é o plano B.
- **Só Lei 14.133.** Contratos da lei antiga são da Parte 5.
- **Edição do fornecedor:** nome ou porte corrigidos na fonte atualizam a linha de PJ. Em PF, PE e sem documento, o nome faz parte da chave: a correção do nome cria linha nova e deixa a antiga (limitação conhecida; PF e PE são poucos).

## Regras multi-tenant e segurança

- **Vencedores:** dado público e global, sem conta, nos arquivos do R2. Bucket privado.
- **Chaves do R2:** só em variáveis de ambiente; nunca em repositório, log, detalhes da execução, manifesto ou conversa. As chaves que apareceram na conversa alcançam a pasta `producao/` até serem trocadas (o usuário vai trocá-las).
- **Pasta do ambiente obrigatória** com o R2, com a proteção de não gravar em `producao` a partir do banco local. Os vencedores e o bruto gravam sob essa pasta.
- **Erros do cliente:** mensagens neutras, sem o nome da fonte e sem o corpo da resposta. Vão para o painel de Configurações › Coleta.
- **Painel:** `GET /collection/status` é legível por qualquer membro com acesso ao módulo; o bloco `winners` tem só contagens e datas, nunca nomes de fornecedores.
- **SQL do DuckDB:** chaves e CNPJ validados por expressão regular e injetados como literais saneados (`sqlLiteral`); nunca texto de pessoa concatenado sem validação.
- **Parte 4 (fora desta parte):** a API do CNPJ só para contas com acesso ao módulo, com as mesmas travas (404, 403, 402) e limite de taxa.
- **Nada específico do CNPJ da Diretriz** no código.

## Validações necessárias

- **Número de controle da compra:** expressão `PURCHASE_CONTROL_NUMBER` (hoje privada em `contractDetail.ts:21`, movida para `layout.ts`); fora do formato, o registro é recusado com motivo.
- **Registro da fonte:** zod `looseObject`; data existente e de 1990 em diante; valor positivo (zero, negativo e ausente viram nulo e contam como 0); valor acima de 1e13 é erro de registro.
- **Resposta da fonte:** envelope validado com zod; fora do formato é falha passageira e repete; páginas lidas iguais a `totalPaginas`; mais de 5% de registros inválidos derruba a execução.
- **Variáveis:** `COMPRASGOV_REQUEST_INTERVAL_MS` 0 a 60000; `TENDERS_WINNERS_BACKFILL_FROM` data ISO; `TENDERS_WINNERS_BACKFILL_MINUTES` 1 a 600. Variável inválida derruba o runtime inteiro do coletor (varredura e contratos da mesma rotina), por isso faixas estreitas, padrões seguros e testes de faixa.
- **CLI:** `--from` até `--to`, datas válidas, `--max-minutes` de 1 a 600, `--cnpj` com 14 dígitos; opção de outro comando é recusada.
- **Manifesto:** zod; manifesto inválido mantém a versão em uso (comportamento existente do leitor).

## Testes necessários

### Frontend

- `winnersBackfillView` (ou equivalente) com detalhes reais, ausentes e malformados.
- Rótulo de linhas na base; `RUN_TYPE_LABELS` cobre todos os tipos.
- `dailyCollectionSummary` e `archiveSummaryLabel` com uma execução de vencedores.
- "Painel da Coleta: linhas do arquivo e dos vencedores".
- Sem nome da fonte nos textos.

### Backend (puros, sem banco)

- **`resultMapping.test.ts`** (fixture da sondagem):
  - PJ, PF mascarada, PE;
  - documento inválido vira fornecedor sem documento sem descartar o resultado;
  - número de controle fora do formato é recusado sem derrubar a página;
  - valor nulo, zero, negativo e acima de 1e13; data inválida;
  - situações 1, 2, 3 e desconhecida; `dataCancelamentoPncp` cancela;
  - CPF inteiro nunca sai sem máscara, com e sem `tipoPessoa`.
- **`winnerRows.test.ts`:**
  - item novo; item relido (mesmo hash); valor corrigido recalcula o total (nunca soma em dobro); cancelar 1 de 2 itens tira só a chave; cancelar o último gera lápide; cancelar item ou linha desconhecidos é ignorado;
  - **troca de fornecedor** (cancelar e readjudicar a outro): move a chave e só esvazia a linha antiga se era a única;
  - cancelado e reinformado com outra sequência;
  - retificação de data recalcula primeira e última;
  - reserva não entra e remove se estava;
  - dois CPFs com a mesma máscara e nomes diferentes na mesma compra geram duas linhas;
  - soma exata em centavos (0,10 + 0,20 = 0,30);
  - **propriedade:** mil permutações aleatórias (semente fixa) do mesmo conjunto dão o mesmo estado; leitura parcial mais completa igual à completa.
- **`comprasGovClient.test.ts`** (fetch e sleep simulados): paginação até `paginasRestantes = 0`; página vazia (200 e 204); pedido com fim `to + 1`; 5xx e rede com backoff; 429 com espera de 30, 60 e 120 s e `Retry-After`; envelope fora do formato repete; desistir dá erro tipado sem citar a fonte nem o corpo; intervalo entre pedidos; contagem de requisições com as repetidas; teto de páginas.
- **`resultProbe.test.ts`:** inventário de campos, valores distintos, defasagem, amostra sem CPF completo.
- **`resultRuns.test.ts`:** janela diária (sem histórico, dia normal de 9 dias, parada longa em etapas de 7 dias, histórico no futuro); planejamento da carga (primeira execução, continuação, fim, `--from/--to` ignora o que já foi marcado).
- **`layout.test.ts`:** colunas e ordem; `columnsOf('vencedores')` não é `CONTRACT_COLUMNS`; `storeFileKey` do conjunto novo.
- **`cli.test.ts`, `config.test.ts`:** comandos e opções novos; padrões e faixas; `config.contracts` intacto.
- **`dailyJobSteps.test.ts`:** dia útil e domingo com as etapas novas; a carga de vencedores é a última; flag desligada pula; guarda de prazo.
- **`collectionOverview.test.ts`:** `nextRuns` dos dois tipos novos às 06:00; bloco `winners` sem cópia pronta fica nulo.

### Backend (armazém, com R2 simulado, DuckDB real e pasta temporária)

- **`winnerWriter.test.ts`** (`maxRowsPerFile` pequeno para forçar a divisão):
  - primeira publicação cria uma pasta por ano, partes ordenadas, manifesto **por último** (molde de `writer.test.ts:65-99`);
  - só os anos tocados são regravados e os outros mantêm os mesmos arquivos;
  - lápide remove a linha do arquivo e ela **não volta** na regravação seguinte; ano que esvazia some do manifesto;
  - estado anterior vem das mudanças antes dos arquivos; publicar no meio de uma sequência não muda o resultado;
  - reler o mesmo conteúdo devolve `null` e não muda o manifesto;
  - falha de envio não troca o manifesto (molde de `writer.test.ts:237-253`); a publicação seguinte apaga os órfãos;
  - chave com muitas literais e nenhuma nula.
- **Interação com contratos:** publicar vencedores preserva vigentes, contratos, fornecedor, `today` e `totals`; publicar contratos preserva a lista e os arquivos de vencedores (**falha se a linha de `writer.ts:394` faltar**); a limpeza do bucket não apaga arquivo de vencedores; manifesto de produção sem a chave é aceito; escritor de vencedores sobre bucket sem manifesto cria manifesto válido.
- **Leitor:** padrão não baixa vencedores e a visão é vazia; com `vencedores` lê; `status().winners` só aparece quando o manifesto o tem.
- **`winnerQueries.test.ts`:** resumo, principais órgãos e lista paginada com desempate estável; CNPJ com letra ou 13 dígitos é recusado; contagens como número (nunca BigInt); a faixa de chave não pega CNPJ vizinho; teste de poda comparando contra varredura em dado sintético com vários arquivos.

### Backend (banco local, `*.db.test.ts`, só depois da 0087c no local)

- **`resultRuns.db.test.ts`**, com fetch e R2 simulados:
  - diária grava `queries`/`today`/`store` e publica;
  - execução que falha antes de publicar grava `completed=false` e a seguinte relê as mesmas datas;
  - janela incompleta (páginas lidas menor que `totalPaginas`) não é coberta;
  - mais de 5% de inválidos derruba a execução; janela diária sem registros falha;
  - falha do bruto aborta a publicação;
  - erro de registro conta `record` sem derrubar a página;
  - trava compartilhada: com contratos em execução a diária sai "coleta já em execução";
  - sem R2: diária falha com a mensagem e a carga sai "carga não iniciada";
  - bruto só com inéditos, alterados e recusados; a releitura idêntica não envia nada;
  - carga: ordem do mais recente ao mais antigo; retomada pula dias marcados; publica a cada 20 dias e só então marca; falha de publicação deixa os dias pendentes; para por tempo e pelo `deadlineAt`; 3 dias seguidos com falha encerram com motivo `pncp`; `--from/--to` relê dias já marcados; "carga concluída" não abre execução; execução órfã (`EXECUTANDO`, detalhes vazios) é ignorada.

## Comandos de validação sugeridos

Um de cada vez, nunca em paralelo: o computador não tem arquivo de paginação.

```bash
npx tsc --noEmit                           # tipos do front (a raiz)
npx vite build
npm test
npm --prefix backend run build             # tsc --noEmit
npm --prefix backend test
npm --prefix backend run test:tenders-db   # banco local (.env.dev), com a 0087c aplicada
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:status -- --banco producao   # só leitura
```

Sondagem e piloto (no computador do usuário, banco local só para o processo):

```bash
npm --prefix backend run tenders:dev -- winners-probe --from 2026-09-14 --to 2026-09-14 --max-pages 3
npm --prefix backend run tenders:dev -- winners-probe --count --from 2021-01-01 --to 2026-10-19
npm --prefix backend run tenders:dev -- winners-backfill --from 2026-09-01 --to 2026-09-30 --max-minutes 120
npm --prefix backend run tenders:dev -- winners-lookup --cnpj <14 dígitos>
```

## Riscos e pontos de atenção

- **Contrato da API não lido (alto):** todo o mapeamento depende de S1 a S16. Mitigação: sondagem e G1 antes do código de mapeamento; nenhum nome de campo no código sem fixture real; fixture sanitizado.
- **Número de controle da compra (alto):** se `idContratacaoPNCP` não vier no formato do edital (S7), a ligação com o edital e a pasta por ano da compra mudam. Parar e rever no G1.
- **Cobertura (alto para o produto):** se o endpoint cobrir só a esfera federal (S12), serve pouco para o cliente municipal. A contagem por UF e órgão do probe responde antes do piloto.
- **Cancelamento e retificação tardios:** o endpoint filtra só por data do resultado. A releitura de 7 dias pega os recentes; cancelamento de resultado antigo fica fora e a linha continua mostrando o item. O piloto (fase E) mede a defasagem. Reparo manual existe; revisão semanal só se a medida pedir.
- **Anulação da compra inteira** pode não cancelar o resultado do item: pode superestimar vitórias. Limite conhecido; entra se a sondagem mostrar um campo de situação da compra.
- **Falha silenciosa por mudança de formato:** erro de registro não segura o início nos contratos (`contractRuns.ts:261`) e uma execução com `recordsRead > 0` e erros sai PARCIAL, sem falhar a etapa. Mitigação: 5% de inválidos e janela sem registros viram FALHA; páginas iguais a `totalPaginas`.
- **Memória do Cron Job (512 MB, a confirmar):**
  - medido no armazém: pico de 467 MB para o gravador de contratos (plano R2:225) e 263 a 278 MB para regravação de partes de 25 mil linhas num protótipo sintético;
  - todas as etapas rodam no mesmo processo e o RSS pode não voltar ao nível inicial; um OOM derruba a rotina inteira;
  - mitigação: DuckDB de 128 MB, partes de 25 mil, row group de 10 mil, `rssMb` por etapa, vencedores depois dos contratos, critério de 400 MB no piloto; plano B de processo filho.
- **Orçamento de 12 h do Cron Job:** a rotina já chega a cerca de 9,5 h. A guarda de prazo (690 min) e a ordem (vencedores por último) protegem o que já roda. Limite de 12 h ainda "a conferir".
- **Rollback do Cron Job:** voltar só o Cron Job para uma versão sem a linha de `writer.ts:394` faz a próxima publicação de contratos apagar os vencedores do manifesto e a limpeza apagar os arquivos (refazer a carga leva semanas). Documentar no README; teste que falha sem a linha.
- **Ordem de deploy:** o escritor antigo de contratos, em produção hoje, apagaria arquivos de vencedores. Por isso a flag fica desligada até o Cron Job novo estar ativo. O Web Service antigo tolera a chave nova no manifesto.
- **Custo de regravar o ano inteiro:** 40 a 100 MB por ano tocado por publicação (estimativa), 1 a 3 anos por dia. Medido em sintético: 500 mil linhas em cerca de 9 s no disco local (2 a 4 vezes no Render, 0,5 CPU). Gatilho para otimizar: publicação diária acima de 5 min ou ano acima de 300 MB; saída barata: trocar a partição para ano-trimestre (o campo `partition` do manifesto é texto livre).
- **Consulta do estado por compra:** a coluna `numero_controle_compra` não é a ordenada; a consulta lê essa coluna dos arquivos do ano (com `ano_compra` ela poda por arquivo). Medido: 29 ms por compra com ano, cerca de 1 s por consulta de 500 a 4.000 chaves. Em escala real não medido; o teste de escala mede.
- **Linha larga (mapa JSON):** o limite de linhas por arquivo foi calibrado com linhas de contrato. Remedir no piloto; reduzir para 15 a 20 mil se o RSS passar de 350 MB.
- **Dado pessoal:** o nome da pessoa física fica no Parquet (como já ocorre em contratos) e o bruto guarda o registro; decisão 4.
- **Dias da carga com falha no topo:** se os primeiros dias da primeira execução falharem, o fim fixo da carga pode ficar abaixo deles. A coleta diária cobre os dias recentes; o reparo manual cobre o resto.
- **Duplicação consciente:** cerca de 40 linhas do motor de partes e cerca de 100 do cliente HTTP. Se as Partes 4 ou 5 pedirem outro conjunto, vale unificar o motor.
- **Fonte instável:** terceiros registraram quedas e divergências entre o swagger e o servidor em 2026. A carga trata como sujeita a falhas.
- **Licença:** o conjunto de resultados do Compras.gov.br não foi conferido (o plano só confirmou os conjuntos federais de contratos como Creative Commons Atribuição). A atribuição já está nos Termos de Uso.
- **Variável inválida** derruba todo o runtime do coletor: padrões seguros e faixas estreitas.
- **Execução derrubada:** a linha fica `EXECUTANDO` com detalhes vazios, como nos contratos. As leituras de progresso a ignoram.

## Perguntas em aberto

Só a sondagem, o piloto ou a documentação do Render respondem:
- S1 a S16 (tabela acima).
- Volume real: registros por dia, itens por linha, bytes por linha, tamanho do bruto.
- Início dos dados de resultado (S16).
- Limite de taxa e intervalo seguro (S10).
- Defasagem entre inclusão e resultado, e frequência de cancelamentos e retificações tardios.
- Cobertura de estados e municípios (S12); se for só federal, o assunto volta ao dono antes de seguir.
- Se `dataResultadoPncp` muda quando o resultado é editado ou cancelado.
- Significado da situação 4.
- Se a resposta traz nome do órgão e município.
- Limite de duração (12 h) e memória (512 MB) reais do Cron Job no Render.
- Estado real da produção: migrations 0085 a 0087b aplicadas, `TENDERS_STORAGE_PREFIX=producao` nos dois serviços, primeiro deploy conferido, andamento da carga de contratos.
- Licença e termos do conjunto de resultados.
- Quantos meses de bruto de vencedores manter no R2 (acompanhar o consumo no primeiro mês).

## Critérios de aceite do plano

- **Sondagem (G1):** relatório do probe entregue; S1, S2, S6 e S7 confirmadas; fixture sanitizada no repositório.
- **Armazém:** o conjunto `vencedores` é gravado e lido; o manifesto antigo é aceito; publicar contratos preserva os vencedores; os testes existentes de contratos passam sem edição de asserções.
- **Agregação:** vencedores agregados **sem soma em dobro**: reler o mesmo dia ou a mesma janela não muda nada (a publicação devolve `null`); item sobrescrito; cancelado removido; troca de fornecedor tratada.
- **Aceite da Diretriz sem tela:** `winners-lookup --cnpj` lista as licitações vencidas e os totais batem com a própria API no mesmo período.
- **Coleta:** a diária publica sem perder dias (parada longa recuperada); a carga retoma de onde parou, marca o dia só depois de publicar e respeita o tempo e o prazo da rotina.
- **Rotina:** etapas na ordem decidida, flag desligada por padrão, carga de vencedores por último, `rssMb` por etapa no log.
- **Painel:** card "Vencedores" em Configurações › Coleta com linhas na base, última coleta, período, bruto e carga; texto sem o nome da fonte.
- **Migration 0087c** aplicada com confirmação, primeiro no local, depois na produção antes do merge.
- **Piloto (G2):** todos os critérios da seção do passo 11.
- **Web Service:** sem mudança de memória, disco ou janela "atualizando".
- **Cada parte:** testes, `tsc` e builds passando, e o seu `/finalizar`.

## Roteiro de comandos

| # | O usuário chama | O que acontece | Ação ou confirmação do usuário |
| --- | --- | --- | --- |
| 8 | `/implementar` | Parte 3, passos 1 a 10 | Depois do passo 1, roda a sondagem (`winners-probe`) no computador dele e devolve o relatório; "sim" para a 0087c local (passo 5) |
| 8b | (usuário) | Passo 11: piloto de um mês no banco local | Roda os comandos do piloto e devolve os números; decide com o agente os ajustes de padrão |
| 9 | `/finalizar` | Commit, push e merge da Parte 3 | "Sim" à 0087c na produção (fora das 06:00) antes do merge; "sim" ao merge |
| 9b | (usuário) | Ligar a coleta | Confere o limite do Cron Job; define `TENDERS_WINNERS_ENABLED=1` (e, se preciso, os minutos e o intervalo) no Render; acompanha 2 a 3 rotinas |

A numeração 8 e 9 segue o roteiro do plano do R2 (`.plans/licitacoes-contratos-no-r2.md`, linhas 486-487); os passos 10 a 13 continuam sendo as Partes 4 e 5.

## Observações para a skill implementar

- Fonte principal: este plano; o do R2 vale para o contexto e o da base nacional só como referência do cliente e do piloto.
- Uma parte por `/implementar`. **Parar depois do passo 1** para a sondagem e **no passo 11** para o piloto.
- **Migrations:** não executar sem confirmação explícita; uma por vez, nomeada, primeiro no banco local; produção só com `--banco producao --confirmo` e novo "sim". Não editar 0085 a 0088. A nova se chama `0087c` (antes da 0088; ver "Banco de dados"). Nunca `dev:prod-db` nem `--banco producao` sem confirmação.
- **`.env` e variáveis do Render:** só com confirmação, mostrando a linha. Nunca mexer no `.env` da raiz (produção). Nunca imprimir chave do R2.
- **Sem sobreposição:** vencedores só no armazém; nada de tabela de resultados no Postgres nem caminho paralelo de leitura direta do R2.
- **Não mexer no que está em produção** além dos retoques do passo 3, do `readLastCompletedDay` do passo 6 e da guarda de prazo do passo 7. O `ContractStoreWriter` só ganha 2 linhas; o `PncpClient` não muda; os contratos não ganham limite de tempo novo.
- **Regra única:** critérios e "vigente" só em `contractStore/criteria.ts`; a expressão do número de controle em um só lugar (`layout.ts`).
- **Consultas dos vencedores:** CNPJ e chaves como literais validados; nunca `list_contains` com parâmetro; `count(*)::INTEGER`; `NOT EXISTS` em vez de `NOT IN` com chave que possa ser nula.
- **Nomes:** "resultado" é o que a fonte entrega (`resultMapping`, `resultRuns`, `resultProgress`); "vencedor" é a linha agregada e tudo o que é produto e configuração (`winnerRows`, `winnerWriter`, `winnerQueries`, tipos `VENCEDORES_*`, comandos `winners-*`, `config.winners`, variáveis `TENDERS_WINNERS_*`). A fonte e o cliente são `comprasGov` (`config.comprasGov`, `COMPRASGOV_*`). A tabela de dias é `resultado_carga_dia` (dias lidos da fonte).
- **Esquecimentos que o compilador não pega:** `columnsOf` e o ternário `oldKey` (`writer.ts:495`) falham só em execução para um conjunto novo; os tipos de execução são listados à mão no backend e no front; testes que fixam o formato do status do armazém; `parseBackfillOptions` com o nome do comando fixo; `main()` do `cli.ts` que sempre cria o runtime (o probe precisa sair antes). `OPTIONS_BY_COMMAND` e o `switch` de `runCommand` são exaustivos: o compilador pega.
- Rodar build e testes um de cada vez. Scripts com barra invertida, pela ferramenta Write.
- Seguir o `/AGENT.md`: código em inglês e textos em português; Drizzle nas queries novas do Postgres, com SQL parametrizado e comentado onde a regra é do banco; sem `any`; sem `catch` silencioso; dependências com versão de pelo menos 2 semanas e compatíveis com o Node 22.17.0 (este plano não adiciona dependência).
- Commit, push e merge só no `/finalizar`, com autorização (CLAUDE.md).

## Revisão de 25/10/2026

O rascunho de 20/10 passou por revisão e por uma conferência no código. O que mudou:

- **Migration 0087c, não 0089.** A ferramenta de migrations recusa uma migration com pendente anterior pelo número, e a 0088 está pendente na produção. A 0087c fica antes dela (como a 0087a e a 0087b) e não depende da exportação do JSON dos editais.
- **`winners-probe` roda sem banco e sem R2 de verdade.** O `main()` do CLI sempre cria o runtime, que exige a URL do banco; o probe sai antes (passo 1).
- **Um comando só no G1**, com relatório curto e critério de passagem explícito (S1, S2, S6 e S7); S8, S12 e S13 alimentam decisões.
- **G2 sem esperar 30 dias:** a fase E (D+7 e D+30) virou acompanhamento depois de ligar, e não critério do G2.
- **Ordem das etapas na rotina** explicada: diária antes da carga de contratos, carga de vencedores por último, com o risco de memória e o plano B.
- **CPF no bruto:** a máscara é aplicada ao registro antes do `append` (decisão 4), sem contradizer a regra de que o bruto "vai como veio" nos outros campos.
- **Falha de envio do bruto:** `RunArchive.flush()` não lança; o laço compara `summary().failures` antes e depois e aborta a publicação.
- **Nomes e configuração:** `config.comprasGov` e `config.winners` (nunca em `config.contracts`); `TENDERS_WINNERS_*` e `COMPRASGOV_*`.
- **Arquivos que o rascunho não listava:** `contractRuns.ts` (só o `export` de `requireStorage`), `cli.ts` (união `CliCommand`, `parseBackfillOptions` com nome fixo, desvio do probe), `CollectionPanel.tsx` (`md:col-span-2`) e `npx tsc --noEmit` na validação.
- **"Commit antes do /finalizar"** saiu: commit, push e merge só no `/finalizar`, com autorização.
- **Estado de partida atualizado:** `main` em `7660eab5`; os números de linha continuam valendo, porque o módulo de Licitações não mudou desde o `881c99db`.
- O revisor de viabilidade (memória e tempo do Cron Job) não respondeu; esses pontos ficam como medição do piloto (G2) e conferência no Render.
- O host do Compras.gov.br continua bloqueado no ambiente do agente (conferido de novo em 25/10): nada da API foi lido na fonte.

## Situação

- **25/10/2026: plano pronto e enviado** (commit `be2446bf`). As 5 decisões seguem as recomendações até o dono dizer o contrário; nenhuma delas muda o passo 1.
- **25/10/2026: passo 1 implementado, parado no G1** (o usuário roda a sondagem). Nada foi commitado ainda.
  - **Feito:** `collector/comprasGovClient.ts` (paginação, 5xx, rede, 429 com 30, 60 e 120 s e `Retry-After`, erro tipado sem nome da fonte nem corpo, `requestRaw` para a sondagem, `windowParams` com o fim exclusivo); `collector/resultProbe.ts` (relatório curto: estrutura, campos, situações, documentos só por comprimento, número da compra, fronteira da janela, página de 501, cobertura, defasagem, volume por mês, ritmo e amostra sem dado pessoal); `config.comprasGov` e `loadComprasGovSettings` (`COMPRASGOV_REQUEST_INTERVAL_MS`, padrão 1500); `CollectorContext.comprasGov` no runtime e no contexto dos testes de banco (`resultsFetch`); `winners-probe [--day] [--max-pages]` no CLI, que sai antes de criar o runtime (roda sem banco, sem R2 e sem nenhuma variável: conferido com ambiente vazio).
  - **Testes:** 12 do cliente, 9 da sondagem, 2 de configuração e 2 do CLI (novos). Backend: 735 testes, `tsc` limpo, 152 testes de banco de Licitações passando. Conferido também contra um servidor HTTP local de mentira: 75 pedidos, relatório de 80 linhas.
  - **Desvios do plano, por decisão de implementação:**
    1. A expressão do número de controle (`PURCHASE_CONTROL_NUMBER`) foi para `contractStore/layout.ts` já neste passo (o plano a punha no passo 2), porque a sondagem precisa dela (S7); `contractDetail.ts` importa de lá, sem mudar o comportamento.
    2. A sondagem para no primeiro 429 (na amostra, na fronteira ou nas contagens), registra o que veio e pede `COMPRASGOV_REQUEST_INTERVAL_MS` maior; não insiste.
    3. A amostra mascara o documento de toda pessoa que não seja empresa (CNPJ de 14 dígitos fica, é dado público) e troca o nome dela; valores de campos de documento ou de nome nunca são listados.
    4. `--fornecedor` ficou para depois do G1 (o plano já o marcava assim).
  - **Falta no passo 1:** o fixture `collector/fixtures/comprasgov-resultados.json`, que sai da amostra do relatório que o usuário colar.
- **25/10/2026: G1 rodado (sondagem real, no computador do dono) e APROVADO.** Duas execuções do `winners-probe`: dia padrão 15/10 (0 registros) e `--day 2026-09-14` (2.500 registros lidos de 18.047; 78 pedidos, nenhum 429, página de ~200 ms com o intervalo de 1.500 ms).
  - **Confirmadas:** S1 (endpoint responde, `consultarResultadoItensContratacoes_PNCP_14133`), S2 (envelope `resultado`, `totalRegistros`, `totalPaginas`, `paginasRestantes`), S6 (campos `niFornecedor`, `tipoPessoa`, `nomeRazaoSocialFornecedor`, `numeroControlePNCPCompra`, `idContratacaoPNCP`, `dataResultadoPncp`, `dataAtualizacaoPncp`, `dataCancelamentoPncp`, `orgaoEntidadeCnpj`, `unidadeOrgaoUfSigla`, `valorTotalHomologado`, `situacaoCompraItemResultado*`, todos a 100% exceto o cancelamento) e S7 (o número da compra tem o formato do edital em 100%).
  - **S12 (cobertura): não é só federal.** Na amostra, 25 UFs e 153 órgãos distintos: o "vale seguir?" fica respondido com sim.
  - **Granularidade:** uma linha por **item** e resultado (`idCompraItem`, `sequencialResultado`), como o plano supõe para o mapa item→valor. Documento de pessoa: PJ 14 dígitos, PF 11, PE (estrangeira) 9. Situações vistas: 1 Informado (2.479) e 2 Cancelado (21); a 3 não apareceu na amostra.
  - **Volume:** 6.725.912 registros desde 2021-08 (primeiro mês com dado), 13.452 páginas de 500; de 150 mil a 250 mil por mês em 2024 e 2025. Tamanho máximo de página 500 (501 dá HTTP 400). Com o intervalo de 1,5 s, o histórico inteiro leva da ordem de 6 a 7 h de espera.
  - **Defasagem de atualização:** `dataAtualizacaoPncp` menos `dataResultadoPncp`: mediana 0, p95 0, máximo 8 dias.
  - **O QUE MUDA NO PLANO (ajustar no passo 2, antes de mapear):**
    1. **S3 caiu (confirmado):** o fim da janela é **inclusivo**. Em 14/09, `[d, d]` deu 9.719 registros e `[d, d+1]` deu 18.047; a contagem por dia fechou a conta: 14/09 (9.719) + 15/09 (8.328) = 18.047. O `windowParams` com `WINDOW_END_EXCLUSIVE` (fim = dia + 1) leria o dia seguinte junto. Trocar para fim = dia e conferir de novo (a releitura é idempotente, então não corrompe, mas dobra o custo).
    2. **Defasagem da fonte (medida em 25/10/2026, contagem por dia de 14/09 a 15/10, 30 pedidos de leitura):** o último dia com resultado é **29/09/2026** (9.678 registros, um dia útil completo, com atualizações até as 18:40 desse dia). De **30/09 a 15/10, 0 registros em todos os 16 dias**. Em 25/10 a fonte está 26 dias atrás, o que parece parada, e não uma defasagem fixa (um retrato só não distingue as duas coisas). Dia útil tem de 6 mil a 10 mil registros; sábado e domingo, de 94 a 317.
   - **Consequência para o desenho:** a coleta diária parte do último dia com dado já lido, nunca de "ontem"; relê os últimos 8 a 10 dias (a atualização chega até 8 dias depois do resultado); dia vazio no fim da fonte não pode virar "dia concluído" (decidir a regra no passo 6); o card em Configurações › Coleta mostra o "último dia com dado da fonte", para a parada aparecer.
   - **Aberto:** se a fonte volta sozinha ou fica assim; vale repetir a contagem por dia antes do piloto (passo 11) e, se ainda estiver parada, conferir outro endpoint do mesmo portal para saber se a parada é do portal inteiro.
    3. **Decisão 1 (cadastro de reserva):** a situação 3 não apareceu; o campo `ordemClassificacaoSrp` (presente em 61% dos registros) pode ser o que separa o vencedor dos classificados atrás. Conferir no piloto antes de fechar a regra de "quem é vencedor".
    4. **Decisão 4 (CPF):** a sondagem só registra comprimentos; PF com 11 dígitos indica que a fonte manda o CPF inteiro. Manter a máscara também no bruto.
  - **Fixture:** `collector/fixtures/comprasgov-resultados.json` ainda sai da amostra (6 registros, sem dado pessoal); entra no `/implementar`.
- **25/10/2026: passos 2 a 10 implementados** na branch `feat/R/licitacoes-vencedores` (a partir da `claude/determined-pascal-wrve3a`), sem commit. As 5 decisões foram aprovadas como recomendadas ("5 sim"). A **0087c foi aplicada no banco local** (com o "sim" do usuário, ainda em 25/10/2026) e o `test:tenders-db` passou. **Falta:** o piloto de um mês (passo 11, do usuário) e o `/finalizar`.
  - **Feito:**
    - armazém: `layout.ts` (conjunto, colunas, `CONTRACT_DATASETS`, `columnsOf` como `Record`), `manifest.ts` (`vencedores` com `.default([])`), `localCopy.ts`, `reader.ts` (`datasets`, `status().winners`) e as duas linhas do `writer.ts` (baixa só os conjuntos de contratos e carrega `vencedores` adiante: o teste falha sem a segunda, conferido por mutação);
    - núcleo e gravador: `winnerRows.ts` (agregação pura), `resultMapping.ts`, `winnerWriter.ts`, `winnerQueries.ts`;
    - coletor: `resultProgress.ts`, `resultRuns.ts` (diária e carga), `config.winners`, `archive.ts` (`comprasgov/resultados`), `contractProgress.ts` (`readLastCompletedDay`), `contractRuns.ts` (só o `export` de `requireStorage`), `runs.ts`/`repository.ts` (status), `winnersLookup.ts`;
    - rotina: `dailyJobSteps.ts` e `dailyJobs.ts` (duas etapas, flag, prazo de 690 min e `rssMb` por etapa), CLI (`winners-daily`, `winners-backfill`, `winners-lookup`);
    - migration `0087c_licitacoes_vencedores.sql` (escrita, **não aplicada**), `schema.ts`, `domains.ts`, painel (`collectionOverview.ts`, `CollectionPanel.tsx` com o card "Vencedores", tipos, rótulos e utilitários do front) e README.
  - **Validações:** `tsc` do backend e do front limpos; backend com testes sem banco passando (735 no passo 1, 831 depois das partes 2 a 10, mais os do `--fornecedor`) e front 406; `vite build` ok. **Testes de banco: 177 passando** (os 23 novos de `resultRuns.db.test.ts` e os 154 que já existiam), com a 0087c no banco local. O `test:tenders-db` agora roda **um arquivo por vez** (`--test-concurrency=1`): em paralelo, os arquivos disputavam a trava dos contratos, que os vencedores dividem de propósito, e uma execução saía "coleta já em execução". Esse paralelismo já podia causar a queda intermitente de 2 em 51 testes de banco registrada antes, sem causa achada.
  - **Desvios do plano, por decisão de implementação (todos sustentados pelo que a sondagem mediu):**
    1. **Fim da janela inclusivo (S3 caiu):** `windowParams` pede o último dia como ele é; `WINDOW_END_EXCLUSIVE` saiu, e a detecção de fronteira da sondagem passou a comparar os totais.
    2. **A coleta diária parte do último dia COM DADO, não do fim da janela.** O fim gravado da consulta (`queries[].to`) é o último dia em que a fonte tinha registro, e `windowTo` guarda o fim pedido. Com a fonte parada, a janela se repete sem publicar nada, e quando ela volta nenhum dia fica para trás. Sem coleta diária anterior, a primeira janela parte do dia mais recente da carga, se houver. Janela sem registro algum continua falhando (a janela sempre inclui dias que já tinham dado).
    3. **Carga:** o dia sem registro **depois** do último dia com dado da fonte não é carregado e não fica pendente (`skippedEmptyDays`; é da coleta diária). Dia vazio abaixo do último dia com dado conta como concluído (o início dos dados). `TENDERS_WINNERS_BACKFILL_FROM` tem padrão `2021-08-01` (o primeiro mês com dado), e não `2021-04-01`.
    4. **Linhas novas e alteradas** da execução vêm de conjuntos de chaves (`insertedKeys`, `updatedKeys`, `removedKeys` do `applyResults`), para uma linha criada e alterada de novo na mesma execução não contar duas vezes.
    5. `TENDERS_WINNERS_ENABLED` só aceita `0` ou `1`. O card "Vencedores" só mostra "Próxima prevista" depois de alguma execução (o Web Service não sabe se a flag está ligada no Cron Job).
    6. Arquivo novo fora da lista do plano: `collector/winnersLookup.ts` (o `winners-lookup`, com o edital ligado em lote e o endereço da compra). `status` da CLI mostra `winners.backfill` e `contractStore.winners.rows`.
    7. **`winners-probe --fornecedor <cnpj> (--day | --from e --to)`** (`collector/supplierCheck.ts`), que o plano pedia para a conferência da Fase D e ficou de fora da primeira rodada: lê da fonte os resultados do CNPJ (a fonte aceita o filtro `niFornecedor`: em 14/09 o total caiu de 9.719 para 4) e conta itens ativos, licitações e valor exato em centavos, com a regra de "ativo" escrita de novo direto dos campos da fonte, sem passar pelo mapeamento nem pela agregação. Testado contra a fonte real (4 itens ativos em 14/09 para o CNPJ de uma empresa da amostra, R$ 143.701.488,42).
    8. **`winners-probe --count`** não foi preciso: a sondagem padrão já traz a contagem por mês desde 2021 e o primeiro mês com dado.
  - **Métricas do piloto já nos detalhes da execução:** `winnersWithRankAboveOne` (decisão 1: `ordemClassificacaoSrp` acima de 1), `cancellationLagDays`, `fetchMs`, `applyMs`, `publishMs`, `peakRssMb`.
- **25 e 26/10/2026: piloto (passo 11) rodado no banco local, na pasta `piloto-vencedores` do R2** (nunca na `producao`; a flag segue desligada). Fases A (contagem, na sondagem), B (29 dias de 09/2026), C (releituras), D (conferência por CNPJ) e F (escala); a E (D+7 e D+30) continua sendo acompanhamento.
  - **ACHADO CRÍTICO: a paginação da fonte falha na primeira leitura de um dia.** A Fase B leu 177.262 registros (a soma das páginas era igual ao total que a fonte informa), mas só 167.417 eram linhas diferentes: 9.845 vieram em duas páginas seguidas e outras 9.845 não vieram em página nenhuma (5,5%). O armazém ficou com 47.901 linhas, e o certo eram 49.950. A contagem de páginas (`totalPaginas`), que o plano usava contra truncamento, não pega isso.
    - Medido depois: dos 20 dias amostrados de 2021 a 2026, 13 vieram assim (de 1% a 12% do dia); os 7 inteiros eram, em 6 casos, de até duas páginas. Pedir a mesma página de novo devolve a mesma resposta. A leitura seguinte do mesmo dia com **outro tamanho de página** veio completa, sem uma linha repetida, nos 9 dias em que se mediu; o tamanho da primeira leitura (500 ou 437) não importou. Dias já lidos várias vezes (09/2026) vieram inteiros mais tarde. A causa na fonte não foi achada.
    - **Correção feita (`resultRuns.ts`, `comprasGovClient.ts`, `resultMapping.ts`, `supplierCheck.ts`):** cada dia é lido sozinho (a coleta diária também) e só vale se as linhas distintas (licitação, item e sequência) forem tantas quanto o `totalRegistros`; faltando, o dia é lido de novo com outro tamanho de página (499, 437 e 389), aplicando só o que ainda não veio; depois de 4 leituras sem completar, o dia não vale como lido (erro `incomplete`, execução PARCIAL, dia pendente). O conferidor de fornecedor (`winners-probe --fornecedor`) faz o mesmo e diz em `complete` se vieram todos.
    - **Conferência do conserto, com a fonte falhando de verdade:** janela fria de 04 a 15/08/2025 (10 dias úteis): todos os dias vieram falhos na primeira leitura (de 1% a 10% das linhas) e **todos fecharam na segunda**; 408 pedidos para 98 mil linhas; execução SUCESSO. Fase D nessa janela: 7 fornecedores, **licitações, itens e valor total iguais aos da fonte, com 25 itens cancelados no meio**.
  - **Fase B** (09/2026, antes do conserto): 29 dias em 12,7 min (371 páginas, 1,9 s por página com a pausa); 0 registros recusados; 176.060 vencedores, 1.163 cancelados, 39 de situação "outra" (a 4) e **nenhuma reserva (situação 3)**; 803 vencedores com `ordemClassificacaoSrp` acima de 1 (0,46%); fornecedor sem documento: 0; pico de memória do processo 384 MB com o heap limitado a 200 MB; 2 publicações, 15,5 s ao todo; bruto de 8,7 MB compactado (49 bytes por registro).
  - **Fase C** (idempotência): a releitura da Fase B trouxe mais 2.045 linhas e alterou 1.218 (o conserto da paginação ainda não existia). Depois dele, as releituras do mesmo mês davam **0 linhas novas**, mas **15 a 20 linhas alteradas a cada vez**, com a fonte igual (os totais por situação eram idênticos entre as execuções). **Segundo achado: a agregação não era idempotente.** O nome, o porte e a unidade do fornecedor variam de um item para outro da mesma linha (uma empresa vinha como "ME" nos itens de um dia e "Demais" nos do dia seguinte), e a regra "vale o resultado mais recente do lote" fazia a linha ficar com um ou outro conforme a divisão em lotes, que muda de leitura para leitura. Só as linhas com itens em mais de um dia mudavam. O teste de propriedade existente não pegava, porque os registros dele tinham o mesmo fornecedor em todos os itens.
    - **Correção (`winnerRows.ts`):** esses dados vêm sempre do **primeiro item da linha** (menor número e sequência), e não do resultado mais recente do lote; o estado final só depende dos itens da linha. O teste de propriedade passou a variar nome, porte e unidade por item (e falha sem a correção), com três testes novos. Limite conhecido: se o primeiro item é cancelado, a linha guarda os dados dele até o novo primeiro item ser lido de novo. A conferência por fornecedor da Fase D (8 CNPJs de 09/2026, do maior ao menor, mais um de R$ 244 milhões) bateu em licitações, itens e valor exato.
  - **Decisões abertas para o dono** (medidas na leitura completa de 09/2026, 177.262 registros): 1) cancelamento tardio: 212 de 1.149 cancelamentos com data (18%) chegaram de 8 a 30 dias depois do resultado, e a releitura diária de 7 dias não os pega; 2) situação 4 (34 registros, 0,02%): hoje não conta como vitória; 3) vencedores com classificação acima de 1 no registro de preços (840, 0,48%): hoje contam. Na Fase B os números saíram um pouco diferentes (239 de 1.154, 39 e 803) porque aquela leitura tinha linhas repetidas e faltando.
  - **Risco novo registrado:** dia que a fonte conta mas nunca entrega (ou entrega repetido sob a mesma identidade) não completa; o erro `incomplete` aparece na execução e, na coleta diária, a janela não avança até ele sair dela. Não apareceu em nenhum dia medido.
  - **Idempotência provada na fonte real, depois das duas correções:** reler os 29 dias de 09/2026 deu 0 linhas novas e 0 alteradas (a releitura anterior corrigiu 66 linhas que a regra velha deixava oscilando), e o mesmo numa janela de 2024 (11 dias úteis, 42.571 linhas: 0 e 0, depois de 39 correções). A divisão em lotes diferente por causa da releitura é coberta por teste de banco (fonte estável e instável dão o mesmo armazém, e reler não muda nada).
  - **Critérios do G2:** API confirmada ✓; sem 429 com um cliente só ✓ (os 429 apareceram só quando rodei três leituras ao mesmo tempo, com a resposta "Rate limit is exceeded. Try again in 1 seconds"; o coletor repete e segue); recusados abaixo de 1% ✓ (0 de 177.262); dia fechando o total ✓ (com releitura: 29 dias de 09/2026, 10 de 08/2025 e 11 de 2024, nenhum `incomplete`); releitura sem mudança ✓; conferência por CNPJ ✓ (15 fornecedores em dois períodos, licitações, itens e valor exatos); custo diário ≤ 20 min ✓ (~7 a 9 min); carga completa ≤ 25 h ✓ (~13 h); publicação do ano mais cheio ≤ 5 min e estado por lote ≤ 2 s ✓ (12 a 26 s com 2 milhões de linhas num ano; 0,94 s); R2 abaixo de 8 GB ✓ (Parquet de 44 bytes por linha, ~100 MB para a carga completa; bruto de 49 bytes por registro, ~330 MB). **Memória: ✓ nas cargas reais (pico de 384 MB com o heap em 200 MB), mas ✗ no ano sintético de 2 milhões de linhas (546 MB; os anos reais ficam abaixo de 700 mil linhas)**: cabe na instância de 2 GB, e com 512 MB não teria folga.
  - **Fase F** (2 milhões de linhas num ano só, disco local, heap em 200 MB): construção em 17,9 min; publicação do dia sobre o ano cheio em 12,1 s (85 MB regravados, 81 arquivos); estado de 3.954 compras em 0,94 s; consulta por CNPJ em ~0,1 s (maior fornecedor, 6.774 licitações, e mediano); cópia local do ano em 0,34 s.
- **Próximo:** o `/finalizar` (0087c na produção antes do merge, com a flag desligada). A Fase E (D+7 e D+30) e as três decisões acima ficam para depois de ligar.
