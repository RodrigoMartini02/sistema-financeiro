# Plano de Implementação: base nacional de dados de Licitações (fase 1)

## Origem

- Arquivo de especificação: `.plans/estudo-fontes-contratos.md` (estudo de 15 e 16/10/2026) e as decisões do usuário nesta conversa.
- Planos relacionados: `.plans/licitacoes-contratos-a-vencer.md` (Partes A e B, sem merge), `.plans/licitacoes-contratos-coleta-sem-perda.md` (rodada 1 implementada sem commit; rodada 2 pendente) e `.plans/estudo-fontes-licitacoes.md` (06/10, editais).
- Data do planejamento: `2026-10-18`
- Classificação: `frontend + backend + database`, com infraestrutura nova (Cloudflare R2).

## Resumo

O módulo de Licitações é um produto comercial, e a meta é cobertura nacional máxima de publicações e contratos, sem pagar US$ 70 a 130 por mês de banco. A fase 1 faz cinco coisas:
- guarda todo dado bruto coletado no Cloudflare R2, barato e completo;
- deixa o Postgres enxuto, só com o que a busca usa;
- passa a guardar contratos de todos os tipos, vigentes e encerrados, e os vencedores das licitações da 14.133;
- abre a busca por CNPJ, com página de fornecedor e de órgão, e traz os contratos federais da lei antiga;
- tira a marca PNCP das telas.

## Decisões do usuário

Antes do plano (15 e 16/10/2026):
- produto comercial, cobertura nacional máxima;
- não pagar US$ 70 a 130 por mês de banco;
- HD físico dispensado;
- Cloudflare R2 escolhido (o usuário está criando a conta);
- MG, SP e SC ficam de fora até as respostas dos pedidos formais (LAI) do usuário.

No plano (18/10/2026):
1. **Escopo:** as 7 partes num plano só, implementadas uma de cada vez.
2. **Contratos na base de busca:** todos os tipos (contrato, empenho, carta-contrato, termo de adesão e outros), vigentes e encerrados, desde 2021, enxutos no Postgres (cerca de 5 milhões de registros, cerca de 9 GB). O bruto fica no R2.
3. **JSON bruto dos editais:** fica só no R2. Primeiro se exporta o que já está gravado, depois uma migration remove a coluna. O histórico de editais no Postgres continua com a retenção atual de 12 meses depois do encerramento; o mais antigo fica só no R2.
4. **Vencedores:** coletados todo dia e guardados agregados no Postgres, uma linha por licitação e fornecedor (cerca de 1 a 2 GB). O detalhe item por item fica no R2.
5. **Marca PNCP nas telas:** textos neutros, mantendo o link para o documento original. Antes, conferir os termos de uso do PNCP sobre citar a fonte.

Depois da Parte 7 (18/10/2026):
- **Disco do Render:** o R2 não dispensa aumentar o disco. Ele tira o bruto (cerca de 100 GB se ficasse no Postgres), mas a base de busca fica no Render. Como o disco não diminui, o tamanho se decide depois do piloto da Parte 6, que foi adiantado para antes do marco de produção.
- **Vigentes:** ficam no Render em qualquer caso. Deles dependem os avisos, os favoritos, as buscas salvas e a busca rápida.
- **Histórico (encerrados e vencedores):** entra na busca do produto, porque é a base do preço praticado, da concorrência, da página do CNPJ e do ciclo de recontratação dos órgãos. O piloto decide se ele fica no Render (disco de 15 a 20 GB) ou no R2 (disco de 5 a 10 GB, busca mais lenta).
- **CNPJ da Diretriz (22.493.902/0001-40):** é só o caso de teste das Partes 3 e 4, indicado pelo usuário. Nada no código é específico dele.

## Escopo

### Dentro do escopo

- **Parte 1, arquivo bruto no R2:** cliente S3 compatível e gravação do bruto compactado das coletas.
- **Parte 2, base enxuta e contratos completos:**
  - contratos de todos os tipos, vigentes e encerrados, com o tipo gravado;
  - fim da limpeza dos vencidos;
  - filtros de tipo e de encerrados na tela;
  - editais sem o JSON bruto no Postgres, com a exportação do que já existe.
- **Parte 7, telas sem a marca PNCP:** conferência dos termos de uso, textos neutros e links mantidos.
- **Marco de produção:** a ordem das migrations, do merge, do disco, das variáveis e das cargas.
- **Parte 3, vencedores:** coleta diária e carga dos resultados da 14.133 pelo Compras.gov.br, agregados por licitação e fornecedor.
- **Parte 4, busca por CNPJ:** página do CNPJ como fornecedor e como órgão, e caixas de busca que reconhecem CNPJ.
- **Parte 5, contratos federais do Compras.gov.br:** inclui os da 8.666, com deduplicação contra o PNCP.
- **Parte 6, piloto do histórico em Parquet no R2:** consultado com DuckDB, só medição e recomendação.

### Fora do escopo

- Tribunais de contas, governos estaduais, diários oficiais, estatais e Sistema S (camadas 2 a 4 do estudo).
- MG, SP e SC (aguardam os pedidos formais do usuário).
- Radar de compras previstas (PCA).
- Motor de busca dedicado e troca de provedor de banco.
- Itens das contratações no Postgres (ficam no R2).
- Mudança do histórico para Parquet (a parte 6 é só o piloto).
- Mudanças de preço ou de plano do produto.

## Leitura de contexto

- `/AGENT.md` (raiz).
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem no projeto; vale o `/AGENT.md` da raiz.
- `/CLAUDE.md`.
- `.plans/estudo-fontes-contratos.md`, `.plans/licitacoes-contratos-a-vencer.md`, `.plans/licitacoes-contratos-coleta-sem-perda.md` e `.plans/estudo-fontes-licitacoes.md`.
- `backend/src/modules/tenders/README.md`.
- Código lido:
  - coletor: `collector/contractMapping.ts` (descartes por tipo, prazo e vencido), `collector/contractRuns.ts`, `collector/contractRepository.ts`, `collector/mapping.ts` e `collector/repository.ts` (`payload` só gravado e usado no hash; nenhuma leitura), `collector/runs.ts`, `collector/config.ts`, `collector/pncpClient.ts` e `collector/cli.ts`;
  - banco e rotina: `db/schema.ts`, `services/dailyJobSteps.ts` e `routes/validators.ts`;
  - telas da Parte B com "PNCP": `ContractDetailView`, `ContractFiltersPanel`, `SearchFiltersPanel`, `NoticeDetailView`, `NoticePncpTabs`, `TrackingActions` e `NotificationsScreen`.
- APIs públicas conferidas: Compras.gov.br (OpenAPI de dados abertos), PNCP (consulta e API principal), Cloudflare R2 e preços do Render.

## Impacto por área

### Frontend

- **Contratos (Parte 2):** filtros "Tipo de contrato" (vários) e "Incluir encerrados".
  - Padrão: só vigentes.
  - Com encerrados, a ordem padrão passa a ser a publicação mais recente.
  - Badge do tipo no card e no detalhe; contrato sem vencimento mostra "Sem data de fim".
- **Configurações › Coleta (Parte 1):** linha do arquivo bruto ("Arquivo: N arquivos, X MB" na última coleta). Na Parte 3, a linha dos vencedores.
- **Página do CNPJ (Parte 4):** rota `/cnpj/:cnpj`.
  - Cabeçalho com nome e CNPJ formatado.
  - Abas "Como fornecedor" (contratos, licitações vencidas, valores, principais órgãos) e "Como órgão" (editais abertos, contratos, principais fornecedores).
  - Links para o contrato e o edital; estados de carregamento, vazio e erro; celular.
- **Caixas de busca (Parte 4):** a de editais, a de contratos e a do topo reconhecem um CNPJ (com ou sem máscara) e levam à página dele.
- **Textos (Parte 7):** nenhum texto de tela cita o PNCP; os links ao documento original continuam, com rótulo neutro.
- **Padrões:** React Query com query keys centralizadas, estado na URL (parâmetros em português) e testes dos utilitários.

### Backend

- **Parte 1:**
  - módulo de arquivo bruto (`collector/archive.ts`), injetado no `CollectorContext` como os clientes do PNCP;
  - configuração "todas ou nenhuma" das variáveis do R2;
  - gravação nas coletas de contratos, aditivos e editais;
  - resumo nos detalhes da execução.
- **Parte 2:**
  - mapeamento de contratos sem descartes, com o tipo gravado e registro sem data válida entrando sem vencimento;
  - fim da limpeza dos vencidos;
  - filtros novos na busca de contratos;
  - editais sem gravar o JSON bruto;
  - comando de exportação do JSON já gravado para o R2.
- **Parte 3:**
  - cliente do Compras.gov.br;
  - coleta diária e carga dos resultados;
  - agregação idempotente por licitação e fornecedor;
  - etapas e comandos.
- **Parte 4:** API do CNPJ (resumo e listas), com as mesmas travas de acesso do módulo e limite de taxa.
- **Parte 5:**
  - coleta dos contratos federais por órgão (Compras.gov.br);
  - deduplicação pelo número de controle do PNCP;
  - origem marcada.
- **Parte 6:** script de piloto (Parquet e DuckDB) fora da build do produto.
- **Parte 7:** mensagens de erro que chegam à tela sem citar o PNCP. Logs internos não mudam.

### Banco de dados

- **0087 (Parte 2):**
  - `licitacoes.contrato`:
    - `tipo_contrato_id SMALLINT` e `tipo_contrato_nome TEXT`, com o índice `ix_contrato_tipo`;
    - `vencimento` e `vigencia_fim_original` passam a aceitar NULL;
    - `fn_contrato_vigente` continua falsa sem vencimento.
  - `licitacoes.edital`: `payload` passa a aceitar NULL.
  - Cabeçalho com ordem e reversão.
- **0088 (Parte 2):** remove `licitacoes.edital.payload`.
  - Só depois da exportação conferida no banco em questão.
  - O schema do Drizzle já deixa de declarar a coluna na Parte 2, então o código funciona antes e depois da 0088.
- **0089 (Parte 3):** `licitacoes.resultado_fornecedor` e a tabela de dias da carga dos resultados.
  - Chave: número de controle da compra mais documento do fornecedor.
  - Campos: órgão, UF, município, nome, porte, mapa item→valor em jsonb, quantidade de itens, valor homologado total, primeira e última data de resultado e o edital, quando existir.
  - Índices: por fornecedor, por órgão, por UF e data.
- **0090 (Parte 5):** `licitacoes.contrato.origem` (`PNCP` por padrão, ou `COMPRASGOV`) e o identificador do Compras.gov.br, único quando houver.
- **Volume:** contratos cerca de 9 GB; editais menos do que hoje; vencedores cerca de 1 a 2 GB; federais cerca de 1 GB. O disco precisa ir de 1 GB para 15 a 20 GB antes da carga.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Cloudflare R2 (feito pelo usuário):** conta, bucket privado (sugestão: `licitacoes-dados`, localização Western North America) e token "Object Read & Write" restrito ao bucket.
- **Variáveis novas:**
  - `TENDERS_ARCHIVE_ENDPOINT`, `TENDERS_ARCHIVE_BUCKET`, `TENDERS_ARCHIVE_ACCESS_KEY_ID` e `TENDERS_ARCHIVE_SECRET_ACCESS_KEY`, no Web Service, no Cron Job e no `.env.dev`, colocadas pelo usuário;
  - `COMPRASGOV_REQUEST_INTERVAL_MS`, com padrão definido no piloto da Parte 3.
  - Nenhum `.env` é alterado pelo agente.
- **Render (feito pelo usuário):**
  - aumentar o disco do Postgres para 15 a 20 GB antes da carga (cerca de US$ 4,50 a 6 por mês);
  - ajustar `TENDERS_CONTRACTS_MAX_DB_MB` ao disco novo (ex.: 80% dele);
  - informar o tipo de instância (aba "Plan").
- **Rotina diária:** ganha as etapas de vencedores (Parte 3) e de contratos federais (Parte 5, semanal) e perde a limpeza dos contratos vencidos (Parte 2). A coleta de contratos pode ficar mais longa com todos os tipos (mais consultas de aditivos): medir.
- **Custo:** R2 cerca de US$ 0,45 por mês (40 GB compactados, 10 GB grátis); disco cerca de US$ 4,50 a 6 por mês; Cron Job sem mudança relevante.

## Arquivos provavelmente afetados

- `backend/package.json` e o lockfile: `@aws-sdk/client-s3` (Parte 1). O `@duckdb/node-api` fica só no piloto (Parte 6).
- `backend/drizzle/0087_*.sql`, `0088_*.sql`, `0089_*.sql` e `0090_*.sql`.
- `backend/src/modules/tenders/`:
  - `db/schema.ts`, `domains.ts` e `README.md`;
  - `collector/`: `archive.ts` (novo), `comprasGovClient.ts` (novo), `resultMapping.ts` (novo), `resultRuns.ts` (novo), `federalContractRuns.ts` (novo), `config.ts`, `runs.ts`, `contractRuns.ts`, `contractMapping.ts`, `contractRepository.ts`, `mapping.ts`, `repository.ts`, `cli.ts` e testes;
  - `services/`: `contractSearch.ts`, `cnpjProfile.ts` (novo), `collectionOverview.ts` e testes;
  - `routes/`: `cnpj.ts` (novo), `index.ts`, `validators.ts`, `requestReaders.ts` e testes;
  - `tenders.http`.
- `backend/src/services/dailyJobSteps.ts` e `dailyJobs.ts`.
- `src/tenders/`:
  - telas: `screens/CnpjScreen.tsx` (nova) e as que têm busca;
  - componentes e utilitários: `ContractFiltersPanel`, `ContractCard`, `ContractDetailView`, `NoticeDetailView`, `NoticePncpTabs`, `TrackingActions`, `SearchFiltersPanel`, `CollectionPanel`, `utils/cnpj.ts` (novo), `utils/contractFilters.ts`, `utils/navigation.ts` e `services/`;
  - os textos com "PNCP".
- `.plans/licitacoes-contratos-a-vencer.md` (regra nova dos contratos) e este plano (resultados dos pilotos).

## Estratégia de implementação

Cada parte é uma rodada: o usuário chama `/implementar`, o agente implementa e valida, e o usuário chama `/finalizar`. A ordem é a deste plano.

### Pré-requisitos

1. `/finalizar` da rodada 1 do plano da coleta sem perder dias (Parte A).
2. `/implementar` e `/finalizar` da rodada 2 do mesmo plano (Parte B: merge da A e aviso na reconsulta).
3. Criar `feat/R/licitacoes-base-nacional` a partir da Parte B.

### Parte 1: arquivo bruto no R2

1. Dependência `@aws-sdk/client-s3`.
   - Versão publicada há pelo menos 2 semanas (ex.: 3.1145.0, de 01/10/2026).
   - Conferir `engines` (Node 20 ou mais, compatível com o 22.17.0) e o lockfile.
2. Configuração em `config.ts`.
   - As 4 variáveis do R2, com região `auto`: todas ou nenhuma. Parcial dá erro de configuração.
   - Sem nenhuma: arquivamento desligado, com aviso no log e `details.archive.enabled = false`.
3. `collector/archive.ts`.
   - Interface `RawArchive`, com `append(dataset, day, records)` e `flush()`, e duas implementações: S3 (PutObject de JSON Lines compactado) e desligada.
   - Injetada no `CollectorContext`; nos testes, uma simulada.
   - Chave: `<fonte>/<conjunto>/<AAAA>/<MM>/<DD>/<execução>-<parte>.jsonl.gz`.
   - Parte nova ao passar de cerca de 16 MB brutos, para limitar a memória.
   - Cada linha: o registro como veio, mais o momento da coleta.
4. O que gravar.
   - Contratos (diária e carga): todos os registros lidos, inclusive os que não entram.
   - Aditivos: a resposta bruta de cada consulta, com o número de controle.
   - Editais (varredura e incremental): só os inseridos ou alterados, pelo hash.
   - Itens e arquivos abertos na tela: não.
5. Detalhes da execução: `details.archive = { enabled, files, records, bytes, failures }`. Falha de envio conta erro (`kind: 'archive'`) e a coleta segue.
6. Configurações › Coleta: linha do arquivo na última coleta.
7. Testes:
   - chave e partes;
   - JSON Lines compactado de ida e volta;
   - configuração todas ou nenhuma;
   - coleta com o R2 simulado, inclusive falha.
8. README.
9. Conferência real quando o bucket existir: uma coleta diária local grava no R2, e os arquivos são listados e lidos de volta.

**Situação (18/10/2026):** implementada na branch `feat/R/licitacoes-base-nacional`, sem commit.
- `@aws-sdk/client-s3` 3.1146.0, de 02/10, instalado com `--before=2026-10-04`: os 25 pacotes novos têm pelo menos 2 semanas, pedem Node 18 ou 20 e não rodam script na instalação.
- O dia da pasta é o dia da coleta (Brasília), fixo no início da execução; por isso `append(dataset, records, extra)` não recebe o dia. Conjuntos: `contratos`, `contratos-termos` e `editais`.
- Cliente conferido contra um S3 local nos testes (PUT assinado, caminho `/<bucket>/<chave>`, sem checksum a mais). Coleta manual real no banco local com o arquivo desligado: grava `enabled: false` e avisa no log.
- Falta a conferência real (item 9), quando as 4 variáveis estiverem no `.env.dev`.

### Parte 2: base enxuta e contratos completos (antes da carga na produção)

1. Migration 0087. Aplicar no banco local com confirmação; na produção, só no marco de produção.
2. Mapeamento de contratos.
   - Sem os descartes por tipo, prazo curto e vencido não gravado.
   - Grava `tipoContrato` (id e nome).
   - Sem data de fim, ou com vigência acima de 35 anos: entra sem vencimento, contado à parte como hoje.
3. Aditivos.
   - Mantém a regra do sinal de alteração para todos os tipos.
   - Medir no banco local as consultas por dia (meta: coleta diária em cerca de 1 h).
   - Se passar, restringir a consulta aos tipos com vigência e registrar no README.
4. Limpeza.
   - Remover `deleteExpiredContracts`, a etapa `tenders-contracts-cleanup` e o comando `contracts-cleanup`.
   - O tipo de execução `CONTRATOS_LIMPEZA` fica só para o histórico.
5. Carga inicial: grava tudo; o limite de espaço continua, com o valor que o usuário definir.
6. API e tela de contratos.
   - Filtros `tipos` e `incluirEncerrados`.
   - Padrão: vigentes. Com encerrados, a ordem padrão passa a ser a publicação mais recente.
   - Busca salva e avisos continuam só com vigentes.
7. Editais.
   - Parar de gravar `payload`; o hash continua calculado do bruto.
   - O schema do Drizzle deixa de declarar `payload`.
8. Comando `notices-payload-export`.
   - Lê o `payload` gravado com SQL parametrizado, porque a coluna sai do schema do Drizzle; o motivo fica comentado.
   - Grava em lotes no R2 (`pncp/editais-legado/...`), retomável, e confere a contagem no fim.
   - Sem R2, não roda.
9. Migration 0088. Aplicar só depois da exportação conferida no banco em questão, com confirmação.
10. Testes:
    - mapeamento sem descartes;
    - sem vencimento;
    - filtros novos;
    - fim da limpeza;
    - exportação com o R2 simulado;
    - os testes antigos ajustados.
11. Atualizar o README e o plano dos contratos.

**Situação (18/10/2026):** implementada na branch `feat/R/licitacoes-base-nacional`, sem commit. A 0087 foi aplicada no banco local com o "sim" do usuário; a 0088 continua pendente (depende da exportação, que depende do R2).
- **Conferência real no banco local:** carga de um dia (`contracts-backfill`, publicação de 15/10/2026) em 1 min 46 s: 8.959 registros lidos e gravados, de todos os tipos, 20 consultas de termos, nenhum erro; 2 sem data de fim e 1 com vigência fora do normal entraram sem vencimento. Na base local ficaram 3.059 empenhos (1.329 já vencidos), 2.337 "Outros", 22 cartas contrato e 15 termos de adesão.
- **Navegador local:** filtro de tipo, "Incluir encerrados" com a ordem pela publicação, chips, selo do tipo, detalhe "Sem data de fim", "Contratos na base" na Coleta e celular sem transbordo, sem erro no console.
- **Coleta diária não medida no local:** o banco local não coleta desde 14/10, e a próxima diária leria 5 dias (cerca de 13 mil consultas de termos, de 3 a 4 h). O tempo por dia ficou estimado pela medição do PNCP abaixo.
- **Tipos do PNCP** (`/v1/tipos-contratos`, 18/10/2026): 12 tipos, 4 inativos (convênio, TED, ACT e termo de compromisso). Ficam em `CONTRACT_TYPES` (`domains.ts`), com nomes curtos para a tela.
- **Medição dos aditivos** (PNCP, 15/10/2026, só leitura):

  | Consulta | Registros | Termo inicial | Empenho | Outros | Demais | Com sinal de alteração |
  |---|---|---|---|---|---|---|
  | publicados | 8.959 | 3.524 | 3.059 | 2.337 | 39 | 20 |
  | atualizados | 11.658 | 5.868 | 3.305 | 2.420 | 65 | 2.732 (2.365 do termo inicial) |

  São cerca de 2.750 consultas de termos por dia, contra no máximo 2.382 só com o termo inicial (+16%). Pelo piloto (25 a 30 min com ~1.900), a coleta diária fica abaixo da meta de 1 h: os termos continuam consultados para todos os tipos. Um dia de 2023 (15/03) tem só 310 registros: a carga dos anos antigos é mais leve.
- **Decisões de implementação:**
  - contrato sem data de fim ganha o vencimento de um aditivo de prazo ou de uma rescisão, quando os termos são consultados;
  - `CONTRATO_ALTERADO` só sai quando o contrato tem vencimento (o título e a referência são a data);
  - com "Só favoritos", os encerrados já aparecem; "Incluir encerrados" não muda nada nesse caso;
  - a exportação tem trava própria e fica registrada como execução `MANUAL` (`detalhes.command = 'notices-payload-export'`). A 0088 confere esse registro com `verified: true` antes de remover a coluna;
  - o comando `contracts-cleanup` e a etapa `tenders-contracts-cleanup` saíram; o tipo `CONTRATOS_LIMPEZA` fica no histórico, sem agenda.

### Parte 7: telas sem a marca PNCP (antes da produção)

1. Conferir os termos de uso e a licença do PNCP sobre citar a fonte (páginas oficiais, art. 174 da Lei 14.133 e política de dados abertos) e registrar neste plano. Se for exigida citação, combinar com o usuário uma menção genérica fora das telas de busca, por exemplo nos termos de uso do site.
2. Trocar os textos com "PNCP" nas telas.
   - Exemplos: "Número de controle", "Abrir edital original", "Ver documento original", "Buscando os itens…".
   - Vazios e erros neutros, inclusive as mensagens da API que chegam à tela.
   - Nomes internos de código não mudam.
3. Manter os links ao documento original.
4. Testes de texto e conferência no navegador local (computador e celular).

**Conferência dos termos (18/10/2026):**
- **Lei 14.133/2021, art. 174, § 4º:** "O PNCP adotará o formato de dados abertos e observará as exigências previstas na Lei nº 12.527, de 18 de novembro de 2011" (texto do Planalto).
- **Decreto 8.777/2016 (Política de Dados Abertos):**
  - art. 1º, III: dados abertos ficam "sob licença aberta que permita sua livre utilização, consumo ou cruzamento, limitando-se a creditar a autoria ou a fonte";
  - art. 3º, IV: "permissão irrestrita de reuso das bases de dados publicadas em formato aberto".
- **Lei 9.610/1998, art. 8º, IV:** "os textos de tratados ou convenções, leis, decretos, regulamentos, decisões judiciais e demais atos oficiais" não são protegidos por direito autoral.
- **Site institucional do PNCP (gov.br/pncp):** o rodapé diz que "todo o conteúdo deste site está publicado sob a licença Creative Commons Atribuição-SemDerivações 3.0 Não Adaptada". É o rodapé padrão do gov.br e vale para as páginas do site, não para os dados da API.
- **Conjuntos federais de compras no dados.gov.br** ("Compras Públicas do Governo Federal" e "Compras.gov.br Contratos"): Creative Commons Atribuição.
- **App e API do PNCP (pncp.gov.br):** sem termos de uso nem texto de licença (conferido no código do app).
- **Conclusão:** o reuso, inclusive comercial, é livre. A única condição possível é creditar a fonte (atribuição). Ela não precisa estar em cada tela: uma menção num lugar razoável, como os termos de uso do site, atende.
- **A menção já existe:** os Termos de Uso (seções 2 e 6) e a Política de Privacidade citam o PNCP como fonte, por decisão anterior do usuário (decisão 4 do site, conferida por `src/utils/legalText.test.ts`). O site público não cita o PNCP (`src/utils/publicPages.test.ts`). Nada a combinar de novo.

**Situação (18/10/2026):** implementada na branch `feat/R/licitacoes-base-nacional`, sem commit.
- **Front:** "Número de controle", "Abrir edital original", "Ver documento original", "Ver edital de origem", "Ver todos na publicação original", "Buscando os itens…", "Edital" nas ações rápidas, filtro "Número, processo ou controle", avisos e vazios neutros, e "a fonte dos dados" nas notas da Coleta. Teste novo `src/tenders/screenTexts.test.ts` varre as telas do módulo.
- **API:** situação 1 como "Divulgada" (`noticeSituationLabel`), mensagem de indisponível dos itens e arquivos, título do aviso de edital alterado e mensagens de erro das consultas. O texto antigo já gravado (título do aviso e erros na Coleta) aparece com o novo na leitura, sem migration.
- **Conferência no navegador local:** Buscar, detalhe do edital (com Itens e Arquivos), detalhe do contrato, Contratos a vencer, Notificações, Acompanhamento, Coleta com os erros abertos e celular: nenhum "PNCP" no texto nem nos rótulos de acessibilidade, sem erro no console.

### Marco de produção (depois das partes 1, 2 e 7)

1. Status das migrations nos dois bancos.
2. Produção: 0085, 0086 e 0087, uma por vez, com confirmação e fora das 06:00.
3. Merge na `main` (Partes A, B e a branch nova), com confirmação.
4. O usuário:
   - aumenta o disco do Postgres para 15 a 20 GB;
   - coloca as variáveis do R2 no Web Service e no Cron Job;
   - define `TENDERS_CONTRACTS_MAX_DB_MB`.
5. Carga de contratos: blocos de 8 h, cerca de 10 dias, acompanhada em Configurações › Coleta.
6. Exportação do JSON dos editais na produção, conferência e então a 0088, com confirmação.

### Parte 3: vencedores

1. `comprasGovClient.ts`.
   - Base `https://dadosabertos.compras.gov.br`.
   - Paginação, repetição de falha passageira e intervalo configurável.
   - Janelas de até 365 dias (limite da API).
2. Piloto no banco local: um mês de resultados (registros, páginas, tempo e tamanho agregado). Projetar a carga desde o início dos dados e registrar neste plano.
3. Migration 0089, aplicada no banco local com confirmação.
4. Coleta diária, com a janela pela regra da coleta sem perder dias, e carga do mais recente ao mais antigo, retomável, com limite de tempo e de espaço. O bruto vai para o R2.
5. Agregação idempotente.
   - O mapa item→valor é mesclado: a chave do item sobrescreve.
   - Os totais são recalculados do mapa.
   - Resultado cancelado remove a chave.
6. Fornecedor pessoa física: CPF mascarado, como nos contratos.
7. Ligação com o edital pelo número de controle da compra.
8. Etapas na rotina diária e na agenda da Coleta, comandos, painel e README.
9. Testes:
   - mapeamento;
   - agregação idempotente, inclusive relendo o mesmo dia;
   - cancelamento;
   - mascaramento do CPF;
   - janela e carga.

### Parte 4: busca por CNPJ

1. `utils/cnpj.ts` (front) e a validação no backend: 14 dígitos, com ou sem máscara, e dígitos verificadores.
2. API.
   - `GET /api/tenders/cnpj/:cnpj`: resumo com nome, papéis, totais e principais órgãos ou fornecedores.
   - Listas paginadas: `/cnpj/:cnpj/contracts?papel=fornecedor|orgao`, `/cnpj/:cnpj/results` e `/cnpj/:cnpj/notices`.
   - Mesmas travas de acesso (404/403/402) e limite de taxa.
3. Tela `/cnpj/:cnpj`, conforme o impacto no frontend.
4. Caixas de busca reconhecem CNPJ e levam à página dele.
5. Índices conforme a medição das consultas.
6. Testes e conferência no navegador local com o CNPJ da Diretriz (22.493.902/0001-40), depois de carregar no banco local os dias de publicação dos contratos dela.

### Parte 5: contratos federais

1. Reusar o cliente do Compras.gov.br com:
   - `modulo-uasg/2_consultarOrgao` (esfera F, 1.158 órgãos);
   - `modulo-contratos/1_consultarContratos` (carga por vigência inicial);
   - `1.2_consultarContratos_FimVigencia` (atualização dos vigentes).
2. Piloto no banco local: alguns órgãos (ex.: UFMG, que tem 167 contratos com fim em 12 meses, 63 fora do PNCP).
   - Medir volume e tempo.
   - Confirmar se `dataVigenciaFinal` já traz o fim atualizado pelos aditivos.
   - Definir o ano inicial da carga (proposta: 2019, para pegar a 8.666 ainda vigente).
3. Migration 0090, aplicada no banco local com confirmação.
4. Deduplicação.
   - Com `numeroControlePncpContrato` já na base, não duplica.
   - Sem ele, entra com `origem = COMPRASGOV`.
5. Mapeamento: tipo (`nomeTipo`), fornecedor, valores e vencimento (`dataVigenciaFinal`).
6. Etapa semanal dos vigentes e carga por órgão, painel, comandos e README.
7. Testes:
   - mapeamento;
   - deduplicação;
   - origem;
   - carga retomável.

### Parte 6: piloto do histórico em Parquet no R2 (só medição)

1. Script na pasta temporária, fora da build do produto, com o `@duckdb/node-api` (versão de pelo menos 2 semanas; ex.: 1.5.6-r.1, de 28/09/2026).
2. Exportar um ano de contratos encerrados do banco local para Parquet, particionado por ano e UF, e enviar ao R2.
   - O banco local tem poucos encerrados (o piloto dos contratos só gravava vigentes). Antes, carregar alguns meses de todos os tipos com `contracts-backfill` no banco local: a carga de 15/10/2026 levou 1 min 46 s por dia útil.
   - Para medir na escala da produção (cerca de 5 milhões de registros), o piloto pode replicar as linhas até esse volume, e o relatório diz que replicou.
3. Medir com DuckDB (httpfs), do computador local:
   - busca por fornecedor;
   - por órgão;
   - por UF e ano;
   - texto no objeto;
   - o que a tela faria com o histórico: o filtro "Incluir encerrados" e a lista de contratos de um CNPJ (Parte 4).
   - Se possível, medir também de um ambiente como o do Render, com confirmação.
4. Conferir se a extensão do DuckDB baixa e funciona no Render.
5. Registrar tempos, tamanho e recomendação neste plano. A decisão é do usuário: tudo no Render (disco de 15 a 20 GB) ou só os vigentes no Render (5 a 10 GB) e o histórico no R2. Com o R2, um `/planejar` novo define a exportação periódica dos encerrados, a busca combinada e o favorito de um contrato do histórico.

## Regras de negócio identificadas

- **Contratos:** todos os tipos, vigentes e encerrados, desde 2021.
  - "A vencer" são os vigentes com vencimento; sem data de fim, não há vencimento.
  - Avisos e buscas salvas valem só para vigentes.
  - A tela mostra os vigentes por padrão e os encerrados quando o usuário pede.
- **Editais:** retenção de 12 meses depois do encerramento no Postgres. O bruto completo fica no R2.
- **Vencedores:** uma linha por licitação e fornecedor, com itens vencidos e valor homologado. Resultado cancelado sai. CPF de pessoa física sempre mascarado.
- **CNPJ:** uma página por CNPJ, com os papéis de fornecedor e de órgão. Não há busca por CPF.
- **Federais:** quando o contrato está nos dois, vale o PNCP. O do Compras.gov.br entra só quando falta.
- **Telas:** sem citar o PNCP; o link ao documento original continua.
- **Arquivo bruto:** tudo o que a coleta lê de contratos e aditivos, e os editais novos ou alterados. Sem R2 configurado, a coleta segue sem arquivo.

## Regras multi-tenant e segurança

- **Dados públicos e globais:** editais, contratos, vencedores e federais. Favoritos, buscas salvas e notificações continuam filtrados por conta e usuário, como hoje.
- **Página e API do CNPJ:** só para contas com acesso ao módulo, com as mesmas travas e limite de taxa das outras buscas. Nada além de dado já público; CPF mascarado; erros sem detalhe interno.
- **Chaves do R2:**
  - só em variáveis de ambiente, colocadas pelo usuário;
  - nunca no repositório, em log, nos detalhes da execução ou na conversa;
  - bucket privado, sem acesso público.
- **Fontes:** respeitar o ritmo do PNCP e do Compras.gov.br, sem contornar proteção, captcha ou bloqueio.
- **Banco do Finanças:** as cargas pesadas continuam em blocos com limite de tempo e de espaço, fora do horário da rotina das 06:00 quando forem manuais.

## Validações necessárias

- `:cnpj` com 14 dígitos e dígitos verificadores válidos; senão, 400 com mensagem clara.
- Filtros novos de contratos: `tipos` só com ids conhecidos e `incluirEncerrados` booleano.
- Variáveis do R2 todas ou nenhuma; endpoint `https`.
- Paginação com os limites atuais; datas dos comandos novos em AAAA-MM-DD.
- Registros do Compras.gov.br validados como os do PNCP (zod): registro inválido conta erro, sem derrubar a página.

## Testes necessários

### Frontend

- Utilitário de CNPJ: máscara, dígitos e reconhecimento na caixa de busca.
- Filtros de contratos: parâmetros na URL para tipo e encerrados.
- Painel da Coleta: linhas do arquivo e dos vencedores.
- Textos: nenhum "PNCP" nos componentes alterados.

### Backend

- Arquivo bruto: chave, partes, compactação de ida e volta, configuração todas ou nenhuma e falha do R2 simulado.
- Contratos sem descartes, sem vencimento, filtros novos e fim da limpeza (banco local).
- Exportação do `payload` com o R2 simulado, retomável e com contagem.
- Vencedores: mapeamento, agregação idempotente, cancelamento, CPF mascarado, janela e carga (banco local).
- API do CNPJ: travas (404/403/402), CNPJ inválido (400), resumo e listas (banco local).
- Federais: mapeamento, deduplicação e origem (banco local).
- Os testes existentes continuam passando.

### E2E

- Conferência real do R2 (quando houver bucket): coleta local grava e lê de volta.
- Navegador local: contratos com tipo e encerrados; página do CNPJ da Diretriz; telas sem "PNCP"; celular sem transbordo.
- Pilotos registrados: vencedores (Parte 3), federais (Parte 5) e Parquet (Parte 6).

## Comandos de validação sugeridos

```bash
npm test
npm --prefix backend test
npm --prefix backend run test:tenders-db   # banco local (.env.dev)
npx tsc -p tsconfig.json
npm --prefix backend run build             # tsc --noEmit
npx vite build
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:status -- --banco producao   # só leitura
```

Coletas locais: o `.env.dev` não tem `TENDERS_COLLECTOR_DATABASE_URL`. Até o usuário decidir incluí-la (alteração de `.env` só com confirmação dele), usar o script da pasta temporária, que passa o banco local só para o processo.

## Riscos e pontos de atenção

- **Disco:** 1 GB não comporta a carga. O aumento é do usuário, antes do marco de produção.
- **Remoção do `payload`:** é irreversível. Por isso, exportação e conferência, e só depois a 0088, banco por banco.
- **Cargas longas no mesmo banco do Finanças:** contratos cerca de 70 h; vencedores e federais a medir. Em blocos com limite.
- **Coleta de contratos mais longa:** com todos os tipos, sobem as consultas de aditivos. Medir e, se preciso, restringir aos tipos com vigência.
- **Limites das fontes:** o Compras.gov.br aceita no máximo 365 dias por consulta e pode estar lento; o PNCP também oscila.
- **Agregação dos vencedores:** reler o mesmo dia não pode somar em dobro (mapa item→valor).
- **Duplicidade:** entre os federais do Compras.gov.br e o PNCP.
- **DuckDB:** baixa a extensão httpfs na primeira execução; isso precisa funcionar no Render (piloto).
- **Termos de uso do PNCP:** não encontrados; a Parte 7 começa conferindo.
- **Branches:** merge entre A, B e a nova; conflito, parar e mostrar.
- **Volumes estimados:** vencedores, federais e aditivos de todos os tipos. Os pilotos medem antes das cargas.
- **Chaves do R2:** só o usuário manuseia.

## Perguntas em aberto

- Tipo de instância do Postgres (aba "Plan" do Render): define a velocidade da busca. Perguntar antes da Parte 4.
- Conta e bucket do R2: o usuário está criando; necessários só para a conferência real da Parte 1 (os testes usam simulação).
- Termos de uso do PNCP: resultado da conferência no início da Parte 7.

## Critérios de aceite do plano

- **Parte 1:** cada coleta grava o bruto no R2 (ou registra que está desligado), e uma falha do R2 não derruba a coleta.
- **Parte 2:**
  - a base guarda contratos de todos os tipos, vigentes e encerrados, com o tipo;
  - a tela filtra tipo e encerrados;
  - a limpeza não apaga mais;
  - o edital não grava mais o JSON bruto, e a exportação confere a contagem.
- **Parte 7:** nenhum texto de tela cita o PNCP, e o link ao documento original funciona.
- **Marco de produção:** migrations aplicadas com confirmação, merge feito, disco e variáveis do usuário, e carga em andamento sem erro de espaço.
- **Parte 3:** vencedores agregados sem soma em dobro; a Diretriz mostra as licitações que venceu.
- **Parte 4:** a página do CNPJ da Diretriz mostra contratos e licitações vencidas, com as travas de acesso.
- **Parte 5:** contratos federais da lei antiga aparecem sem duplicar os do PNCP.
- **Parte 6:** tempos medidos e recomendação registrados.
- **Cada parte:** testes, `tsc` e builds passando, e o seu `/finalizar`.

## Roteiro de comandos até concluir (combinado em 18/10/2026)

O usuário chama as skills; o agente pede confirmação nos pontos marcados. Nenhum passo deste roteiro precisa de novo `/planejar`.

| # | O usuário chama | O que acontece | Ação ou confirmação do usuário |
| --- | --- | --- | --- |
| 1 | `/implementar` | Rodada 2 da coleta sem perder dias: merge da A na B e aviso na reconsulta | — |
| 2 | `/finalizar` | Commit e push da Parte B, sem merge na `main` | Responder "não" ao merge |
| 3 | `/implementar` | Parte 1: cria `feat/R/licitacoes-base-nacional` e grava o bruto no R2 (testes com R2 simulado) | Criar conta, bucket e token do R2; pôr as 4 variáveis no `.env.dev` para a conferência real |
| 4 | `/finalizar` | Commit e push da Parte 1 | "Não" ao merge |
| 5 | `/implementar` | Parte 2: base enxuta e contratos completos | "Sim" para aplicar a 0087 no banco local |
| 6 | `/finalizar` | Commit e push da Parte 2 | "Não" ao merge |
| 7 | `/implementar` | Parte 7: telas sem "PNCP" | — |
| 8 | `/finalizar` | Commit e push da Parte 7, com este plano no commit | "Não" ao merge |
| 9 | — | Conta, bucket e token do R2 | Criar e pôr as 4 variáveis `TENDERS_ARCHIVE_*` no `.env.dev` |
| 10 | `/implementar` | Parte 6 adiantada: piloto do histórico em Parquet no R2 com DuckDB (só medição) e a conferência real da Parte 1 (coleta local grava e lê de volta no R2) | — |
| 11 | `/finalizar` | Commit do relatório do piloto | Decidir onde fica o histórico: tudo no Render (disco de 15 a 20 GB) ou só os vigentes no Render (5 a 10 GB) e os encerrados no R2. Se for o R2, `/planejar` novo antes do marco de produção |
| 12 | `/finalizar` (pergunta do merge) | Marco de produção | Antes: o disco escolhido, as variáveis do R2 e `TENDERS_CONTRACTS_MAX_DB_MB` no Render. Depois, "sim" ao merge, saindo do modo automático: o agente aplica 0085, 0086 e 0087 na produção, uma por vez, com confirmação, e faz o merge na `main` |
| 13 | — | Carga de contratos no Cron Job (cerca de 10 dias) | Acompanhar em Configurações › Coleta |
| 14 | (pedido) | Exportação do JSON dos editais na produção e a 0088 | "Sim" a cada passo, fora do modo automático |
| 15 | `/implementar` | Parte 3: vencedores (piloto local e 0089 local) | "Sim" para a 0089 local |
| 16 | `/finalizar` | Commit, push e merge da Parte 3 | "Sim" ao merge: a 0089 na produção antes, com confirmação |
| 17 | `/implementar` | Parte 4: busca por CNPJ | Antes: o print da aba "Plan" do Render |
| 18 | `/finalizar` | Commit, push e merge da Parte 4 | "Sim" ao merge |
| 19 | `/implementar` | Parte 5: contratos federais (piloto e 0090 local) | "Sim" para a 0090 local |
| 20 | `/finalizar` | Commit, push e merge da Parte 5 | "Sim" ao merge: a 0090 na produção antes |

**Mudança de 18/10/2026 (decisão do usuário):** o piloto da Parte 6 vem antes do marco de produção (passos 9 a 11). Motivo: o disco do Postgres no Render só aumenta, de 5 em 5 GB e sem parar o banco, e não pode ser reduzido depois ([documentação do Render](https://render.com/docs/postgresql-refresh)). Então o tamanho do disco se decide com os tempos medidos do histórico no R2. Pela estimativa, tudo no Render dá de 15 a 20 GB (US$ 4,50 a 6 por mês, mais uns 4 GB por ano). Só os vigentes dão de 5 a 10 GB (US$ 1,50 a 3 por mês), com a busca nos encerrados mais lenta.

Depois deste roteiro, cada tema novo começa com `/planejar`: tribunais de contas e governos estaduais (camada 2), MG, SP e SC quando chegarem as respostas da LAI, diários oficiais, estatais e Sistema S. Os planos já aprovados de outros temas ("Documentação para licitações" e "Recategorizar despesas") seguem com `/implementar` quando o usuário quiser.

## Observações para a skill implementar

- Usar este plano e o estudo `.plans/estudo-fontes-contratos.md` como fonte de contexto.
- Fazer uma parte por `/implementar`, na ordem: pré-requisitos, Parte 1, Parte 2, Parte 7, Parte 6 (piloto adiantado em 18/10/2026), marco de produção, Parte 3, Parte 4 e Parte 5.
- Na Parte 1, criar a branch `feat/R/licitacoes-base-nacional` a partir da Parte B, depois dos pré-requisitos.
- Não executar migrations sem confirmação explícita; aplicar uma por vez, nomeada, primeiro no banco local.
- Não alterar `.env`; as variáveis do R2 e o disco são do usuário.
- Nunca imprimir, registrar ou pedir os valores das chaves.
- Pilotos (Partes 3, 5 e 6) só leem das fontes e gravam no banco local.
- Seguir o `/AGENT.md`: Drizzle em queries novas (SQL só com motivo comentado e parametrizado), nomes em inglês e textos de tela em português.
- Dependências com versão de pelo menos 2 semanas e compatíveis com Node 22.17.0.
- Manter as mudanças pequenas por parte, com testes e README atualizados, e registrar os resultados dos pilotos neste plano.
