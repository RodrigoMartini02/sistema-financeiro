# Plano de Implementação: página do CNPJ (Licitações, Parte 4)

## Origem

- Arquivo de especificação: `.plans/licitacoes-contratos-no-r2.md` (seção "Parte 4: página do CNPJ"). O texto original da Parte 4, com o desenho da tela, está em `.plans/licitacoes-base-nacional.md` (seções "Impacto por área › Frontend" e "Parte 4"), que a Parte 4 do plano do R2 substituiu quanto ao armazenamento.
- Planos relacionados: `.plans/licitacoes-vencedores.md` (Parte 3, na `main` desde 26/10/2026, merge `a77d4e75`) e `.plans/licitacoes-contratos-no-r2.md` (armazém de contratos).
- Data do planejamento: `2026-10-26`
- Classificação: `frontend + backend`, sem migration. Na infraestrutura, o Web Service passa a abrir o conjunto `vencedores` do armazém.

## Resumo

Uma página `/cnpj/:cnpj` no app de Licitações, para o CNPJ como fornecedor e como órgão: nome, totais, licitações vencidas, contratos, editais abertos e os principais órgãos ou fornecedores. As listas de contratos e de editais são as buscas que já existem (mesmos cards e favoritos), em versão curta, com "Ver todos" para a busca já filtrada. A única lista nova é a das licitações vencidas, paginada. Para a página ser rápida, a busca de contratos passa a pular arquivos quando o filtro é por CNPJ. Três caixas de texto, os nomes do órgão e do fornecedor e os campos de filtro de CNPJ levam à página. A página funciona com o armazém incompleto: mostra uma nota de cobertura (os contratos e os vencedores ainda estão sendo carregados na produção).

## Decisões do usuário

Respondidas neste planejamento (26/10/2026):

1. **Listas de contratos e de editais:** reaproveitar as buscas atuais. A página mostra os 10 mais recentes de cada lista, com os mesmos cards e favoritos, e um "Ver todos" que abre a busca atual já filtrada pelo CNPJ. As rotas novas são só o resumo e as licitações vencidas. A busca de contratos fica rápida para filtro de CNPJ, para todo mundo.
2. **Entradas para a página:**
   - as três caixas de texto (barra do topo, Buscar e Contratos a vencer) reconhecem um CNPJ com os dígitos conferidos e levam à página; se os dígitos não conferem, a busca por texto segue como hoje;
   - os nomes do órgão e do fornecedor viram link nos cards, no detalhe do contrato, na lista de vencedores e no resumo da própria página (só com CNPJ válido);
   - os campos de filtro "Órgão (CNPJ)" e "Fornecedor (CNPJ)" ganham o atalho "Abrir página do CNPJ"; o filtro continua filtrando como hoje.
3. **CPF dentro do nome de MEI:** **não mascarar**. O nome sai como vem do cadastro público do CNPJ ("NOME COMPLETO 12345678901"). O documento de pessoa física segue mascarado (`***.456.789-**`), e não existe busca por CPF nem página de pessoa física.

Herdadas dos planos anteriores:
- acesso só para contas com o módulo, com as mesmas travas (404, 403, 402) e limite de taxa;
- o CNPJ da Diretriz (22.493.902/0001-40) é só o caso de teste: nada no código é específico dele;
- sem citar o PNCP nos textos das telas (links ao documento original com rótulo neutro).

## Escopo

### Dentro do escopo

- **Validação do CNPJ com dígitos verificadores**, no backend e no front, numa regra só por lado. O que hoje se chama `isValidCnpj` só confere o formato (14 dígitos) e passa a se chamar `isCnpjFormat`; os filtros continuam aceitando CNPJ com dígito errado, como hoje (5 de 92.281 fornecedores nos contratos reais têm dígito errado). O `isValidCnpj` novo confere os dígitos e vale para reconhecer, linkar e abrir a página.
- **Busca de contratos rápida por CNPJ** (melhoria da busca que existe, sem rota nova):
  - filtro por fornecedor: usa o conjunto `fornecedor` (já gravado, ordenado por CNPJ do fornecedor, hoje sem nenhuma consulta) quando a busca não usa termos, exclusões nem número;
  - filtro por órgão: **sem mudança**. A ideia inicial era podar arquivos pela faixa do número de controle, que começa pelo CNPJ do órgão (conferido em 351.138 de 351.138 contratos locais), mas a medição (passo 3) mostrou que a faixa não pula arquivo nenhum e só soma custo (`contratos` é ordenado por UF antes do número). Ficou de fora;
  - o resultado é exatamente o mesmo de hoje (as condições atuais continuam; a poda é só otimização).
- **Web Service abrindo o conjunto `vencedores`** (cerca de 85 MB a mais no disco com o histórico inteiro, estimado: 44 bytes por linha e cerca de 1,9 milhão de linhas).
- **`GET /api/tenders/cnpj/:cnpj`** (resumo) e **`GET /api/tenders/cnpj/:cnpj/winners`** (licitações vencidas, paginado), atrás da trava do módulo e com limite de 60 pedidos por minuto por pessoa.
- **Tela `/cnpj/:cnpj`** (rota `cnpj/:cnpj` no app, em `/licitacoes/app/cnpj/:cnpj`) com as abas "Como fornecedor" e "Como órgão", os estados de carregando, vazio, erro e "atualizando", a nota de cobertura e o celular sem transbordo.
- **Entradas** da decisão 2 (caixas de texto, links nos nomes e atalho nos campos de filtro).
- **Código compartilhado:** `findNoticeIds` e `purchaseLink` saem do comando `winners-lookup` para um lugar usado pelo comando e pela API; `isWinnerCnpj` (só formato) e o `isCnpj` dos validadores passam a usar o `isCnpjFormat` do módulo.
- Testes, README do módulo, `tenders.http` e a "Situação" da Parte 3 no plano do R2 (ficou desatualizada: o plano diz "sem commit", e ela já está na `main`).

### Fora do escopo

- Contratos federais do Compras.gov.br (Parte 5).
- Busca por CPF e página de pessoa física.
- Mascarar CPF dentro do nome (decisão 3); se mudar de ideia, é uma função aplicada na saída da API, em outro trabalho.
- Lista de licitações vencidas do órgão (só o fornecedor tem a lista de vencedores).
- Exportar ou imprimir a página, gráficos, "seguir CNPJ" e avisos por CNPJ.
- Mudar a coleta dos vencedores e as três decisões abertas da Parte 3 (cancelamento tardio, situação 4, classificação acima de 1): a página mostra o que o armazém tem, com uma nota.
- Carregar dados na produção, ligar a flag `TENDERS_WINNERS_ENABLED` e mexer no layout dos arquivos do armazém.
- Cache no servidor das respostas do CNPJ.
- Migrations.

## Leitura de contexto

Arquivos de contexto considerados:

- `/AGENT.md` (raiz) e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem** no projeto; vale o `/AGENT.md` da raiz (código em inglês, textos em português, Drizzle nas queries novas do Postgres, sem `any`, sem `catch` silencioso).
- `.plans/licitacoes-contratos-no-r2.md` inteiro, `.plans/licitacoes-base-nacional.md` (resumo, Parte 4, regras, testes e as medições do piloto da Parte 6) e `.plans/licitacoes-vencedores.md` (situação, números e decisões abertas).
- Backend lido: `routes/index.ts`, `contracts.ts`, `notices.ts`, `handler.ts`, `deps.ts`, `validators.ts`; `middleware/tenderAccess.ts` e `userRateLimiter.ts`; `services/contractSearch.ts` e `noticeSearch.ts`; `contractStore/reader.ts`, `service.ts`, `queries.ts`, `criteria.ts`, `layout.ts` e `winnerQueries.ts`; `collector/winnersLookup.ts`; `server.ts` (montagem das rotas).
- Front lido: `TendersApp.tsx`, `layout/TendersTopBar.tsx`, `utils/navigation.ts`, `contractFilters.ts`, `searchFilters.ts`, `labels.ts` e `contractKey.ts`, `services/queryKeys.ts`, `contractsService.ts` e `noticesService.ts`, `screens/ContractsScreen.tsx` e `SearchScreen.tsx`, `components/Tabs.tsx`, `LoadStates.tsx`, `ContractCard.tsx`, `ContractDetailView.tsx`, `TagInput.tsx` e `Pagination.tsx`.
- Conferências feitas no planejamento (só leitura, 26/10/2026):
  - dígitos verificadores: 0 inválidos em 31.450 fornecedores e 2.393 órgãos dos vencedores do piloto; 5 inválidos em 92.281 fornecedores (e 0 em 9.792 órgãos) dos 351.138 contratos locais (exemplos: `00000000000000`, `10337488000192`, `00000994567506`);
  - o número de controle do contrato começa pelo CNPJ do órgão em 351.138 de 351.138 contratos locais;
  - nomes com 11 dígitos seguidos (CPF no nome de MEI): 2.272 de 108.165 fornecedores nos contratos (2,1%) e 358 de 35.630 nos vencedores (1,0%), no formato "NOME COMPLETO 12345678901";
  - o conjunto `fornecedor` é gravado (`writer.ts`) e tem visão no leitor, mas nenhuma consulta o lê; o filtro de CNPJ da busca de contratos usa `list_contains` com parâmetro (`inList` em `criteria.ts`), o que não deixa o DuckDB pular arquivos;
  - o piloto da Parte 6 mediu, em 5 milhões de contratos no disco, 0,05 s (fornecedor) e 0,12 s (órgão) com consulta própria; no Render, de 2 a 4 vezes isso (estimativa);
  - Diretriz: 4 contratos como fornecedor no armazém local (3 vigentes em 26/10/2026: o "1 vigente" que constava aqui era um erro de anotação; só o de 31/08/2026 está vencido) e 3 licitações vencidas na fonte (27/06/2023, 18/09/2024 e 22/07/2026; 26 itens; R$ 484.281,92), ainda fora do armazém local.

## Impacto por área

### Frontend

- **Rota e navegação** (`utils/navigation.ts`, `TendersApp.tsx`): rota `cnpj` (`/cnpj/:cnpj`, título "CNPJ", fora do menu). `quickSearchPath(text)` leva a `/cnpj/<14 dígitos>` quando o texto é um CNPJ válido (com ou sem máscara) e continua levando a `/buscar?q=...` nos outros casos.
- **`utils/cnpj.ts` (novo)**, uma regra só: `normalizeCnpj`, `isCnpjFormat` (o `isValidCnpj` atual, renomeado), `isValidCnpj` (formato, dígitos verificadores e recusa dos 14 dígitos iguais), `cnpjFromSearchText(text)` (reconhece o texto só com dígitos e pontuação de CNPJ) e `cnpjPagePath(cnpj)`. `normalizeCnpj` e o antigo `isValidCnpj` saem de `searchFilters.ts` (atualizar `contractFilters.ts`, `SavedSearchFormDialog.tsx` e `SearchFiltersPanel.tsx`; `uniqueValid` fica onde está). `formatCnpj` continua em `labels.ts`.
- **Serviço, tipos e chaves:** `services/cnpjService.ts` (`fetchCnpjSummary`, `fetchCnpjWinners`, com `tendersRequest`); `tendersQueryKeys.cnpj(cnpj)` e `cnpjWinners(cnpj, page, perPage)`, sob o prefixo `tenders`; tipos em `types.ts` (`CnpjSummary`, `CnpjWinner` e o resultado paginado).
- **`screens/CnpjScreen.tsx` e componentes** (`CnpjHeader`, `CnpjSupplierTab`, `CnpjAgencyTab`, `WinnerCard`, lista dos principais):
  - o parâmetro é normalizado: com pontuação e válido, redireciona (`replace`) para a forma só com dígitos; inválido, mostra "CNPJ inválido" sem chamar a API;
  - cabeçalho: o nome (ou o CNPJ formatado quando não há nome), o CNPJ formatado e as etiquetas dos papéis que têm dado; abaixo, a nota de cobertura ("Contratos publicados desde dd/mm/aaaa" e "Resultados de licitações de dd/mm/aaaa a dd/mm/aaaa"), sem citar a fonte;
  - abas pelo componente `Tabs`, com o estado na URL (`aba=fornecedor|orgao`); abre em "Como fornecedor" e vai para "Como órgão" só quando só ele tem dado;
  - **Como fornecedor:** totais de contratos (total, vigentes, valor) e de licitações vencidas (licitações, itens, valor, período), valores por ano, "Órgãos que mais contrataram", **licitações vencidas** (lista paginada, cards `WinnerCard`, com a nota "Valores homologados informados pelos órgãos; resultados cancelados depois podem demorar a sair da lista") e "Contratos recentes" (10 da busca atual, `ContractCard`, com "Ver todos (N)" para `/contratos?fornecedor=<cnpj>&encerrados=1`);
  - **Como órgão:** totais de contratos (total, vigentes, valor) e de editais abertos, "Principais fornecedores", "Editais abertos" (10 da busca de editais atual, `NoticeCard`, com "Ver todos" para `/buscar?orgao=<cnpj>&abertos=1`) e "Contratos recentes" (10, com "Ver todos" para `/contratos?orgao=<cnpj>&encerrados=1`);
  - as listas curtas usam as buscas que existem (`fetchContracts` com `toContractApiQuery` e `fetchNotices` com `toApiQuery`), então favoritos e links do card funcionam como nas telas de busca;
  - estados: `LoadingBlock`, `LoadError` com "tentar de novo", `ContractsUpdating` (503 do armazém, tenta de novo a cada 15 s como as outras telas) e vazio ("Não encontramos contratos, licitações vencidas ou editais abertos para este CNPJ na base.");
  - celular: seções empilhadas, abas com rolagem horizontal própria, sem transbordo da página.
- **Entradas** (decisão 2):
  - `submitSearch` de `SearchScreen.tsx` e de `ContractsScreen.tsx`, e o da barra do topo (`TendersTopBar.tsx`, que usa `quickSearchPath`): se `cnpjFromSearchText` reconhece, `navigate(cnpjPagePath(...))`; senão, o comportamento atual. O texto da barra do topo passa a "Buscar editais ou CNPJ" (aria e placeholder);
  - links nos nomes: fornecedor no `ContractCard` e no `ContractDetailView` (campo Fornecedor), órgão no detalhe e na linha do órgão do card (a linha hoje é um texto montado por `noticePlace`; passa a ter o nome como link), órgão no `WinnerCard`, nomes das listas dos principais e no cabeçalho dos resultados; sempre só quando `isValidCnpj` (documento de pessoa física ou estrangeira fica como texto);
  - atalho nos campos "Órgão (CNPJ)" e "Fornecedor (CNPJ)" de `ContractFiltersPanel.tsx` e "Órgão (CNPJ)" de `SearchFiltersPanel.tsx`: `TagInput` ganha a propriedade opcional `renderTagAction` (ou `linkFor`) que põe, em cada etiqueta de CNPJ válido, um link "Abrir página do CNPJ"; os formulários de busca salva não mudam.
- **`Pagination`** ganha a propriedade opcional `perPageOptions` (padrão `PER_PAGE_OPTIONS`) para a lista de vencedores usar 10, 20 e 50.
- **Textos:** em português, neutros (sem "PNCP"); o link para a compra no portal oficial tem rótulo neutro ("Ver a compra no portal oficial").
- Padrões: React Query com query keys centralizadas, nada de `fetch` direto em componente, estado na URL, tema claro e escuro.

### Backend

- **`modules/tenders/cnpj.ts` (novo, na raiz do módulo, usado por rotas, serviços e armazém):** `normalizeCnpj`, `isCnpjFormat` e `isValidCnpj` (dígitos verificadores; recusa os 14 dígitos iguais). `isWinnerCnpj` (`winnerQueries.ts`) e o `isCnpj` de `routes/validators.ts` passam a chamar `isCnpjFormat` (uma regra só; o comportamento dos filtros não muda).
- **Busca de contratos rápida por CNPJ** (`contractStore/criteria.ts`, `queries.ts` e `services/contractSearch.ts`):
  - `ContractListQuery.dataset` ganha `'fornecedor'`; a regra que escolhe o conjunto fica em `criteria.ts` (regra única): com filtro de fornecedor e sem termos, exclusões nem grupos de dígitos do número, usa `fornecedor` (todos os contratos, com `activeOn` quando não é "incluir encerrados"); senão, `contratos` (todos) ou `vigentes`, como hoje. O conjunto `fornecedor` tem todas as colunas dos outros critérios (UF, município, órgão, categoria, tipo, ano, valor, vencimento, publicação), menos `radicais` e `grupos_*`;
  - **poda do fornecedor como literais** (`supplierPruneCondition`: CNPJs conferidos contra o formato e escritos como literais SQL, como `keyLiterals` já faz): `fornecedor_documento IN (...)`. As condições atuais (`list_contains`) continuam: a poda só reduz o que o DuckDB lê. A contagem do total usa as mesmas condições. **Não há poda por órgão** (medido: não pula arquivo e atrasa);
  - sem mudança de formato de arquivo nem de resposta da API.
- **Web Service com os vencedores** (`contractStore/service.ts`): constante `WEB_STORE_DATASETS = [...CONTRACT_DATASETS, 'vencedores']` passada ao `ContractStoreReader.create`. O leitor já baixa e abre só os conjuntos pedidos; sem arquivos de vencedores no manifesto, a visão fica vazia e a página mostra "sem resultados" com a nota de cobertura.
- **Consultas do CNPJ** (`contractStore/cnpjQueries.ts`, novo; SQL do DuckDB com CNPJ como literal conferido e `::INTEGER` nas contagens, somas em reais como texto):
  - fornecedor: `queryContractsAsSupplier` (total, vigentes, valor global somado, primeira e última publicação e o nome do contrato mais recente, via `arg_max`, tudo do conjunto `fornecedor`) e `queryTopAgenciesByContracts` (os 10 órgãos de maior valor, com o nome mais recente do órgão);
  - órgão: `queryContractsAsAgency` e `queryTopSuppliersOfAgency` no conjunto `contratos`, filtrando por `orgao_cnpj` (varredura do conjunto, sem poda; ver a medição no passo 3);
  - cobertura: `queryStoreCoverage` (primeira publicação de contratos; primeira e última data de resultado dos vencedores, que saem do rodapé dos arquivos);
  - vencedores: reaproveita `queryWinnerSummary` (ganha o nome do resultado mais recente) e `queryWinnerList`, e ganha `queryWinnerCount` para o total da paginação (as consultas `queryTopAgencies` e o comando `winners-lookup` continuam como estão).
- **`services/cnpjPage.ts` (novo):**
  - `getCnpjSummary(deps, cnpj)`: roda as consultas do armazém numa vaga só da fila do leitor (`contractStore.query`, em sequência, dentro do limite de 20 s) e, no Postgres, conta os editais abertos do órgão com o Drizzle (`searchedNotice`, `openCondition` e o CNPJ do órgão, sem junção com dados da conta) e busca o nome do órgão no edital mais recente quando o armazém não tem;
  - o bloco `supplier` é `null` sem contratos nem vitórias; o bloco `agency`, sem contratos nem editais; CNPJ válido sem nenhum dado volta 200 com os dois blocos `null`, o nome `null` e a cobertura;
  - `listCnpjWinners(deps, cnpj, page, perPage)`: página de vitórias (da mais recente para a mais antiga, com desempate estável), com o id do edital e o nome do órgão quando o edital ainda existe no banco (consulta em lote pelo número de controle) e o endereço da compra para o resto;
  - `findNoticeIds` (que passa a devolver também o nome do órgão) e `purchaseLink` ficam em `services/winnerLinks.ts` e são usados também por `collector/winnersLookup.ts`.
- **`routes/cnpj.ts` (novo), montado em `routes/index.ts` depois da trava do módulo:**
  - `GET /api/tenders/cnpj/:cnpj`: `{ success: true, data }` com `cnpj`, `name`, `supplier` (`contracts`, `winners` com `byYear`, `topAgencies`), `agency` (`contracts`, `openNotices`, `topSuppliers`) e `coverage` (`contractsFrom`, `winnersFrom`, `winnersTo`);
  - `GET /api/tenders/cnpj/:cnpj/winners?page=&perPage=` (padrão 10, máximo 50): `items`, `page`, `perPage`, `total`, `totalPages`;
  - validador `cnpjParam` (14 dígitos e dígitos verificadores; senão, 400 com a mensagem "CNPJ inválido") e `paginationQuery` com o teto de 50;
  - `userRateLimiter({ max: 60, windowMs: 60_000 })` nas duas rotas (429 com mensagem clara);
  - erros pelo `tenderRoute`: armazém sem cópia pronta vira 503 `CONTRACT_STORE_UPDATING`, consulta longa demais, 504; nenhum detalhe interno, nenhum endereço do R2.
- Nomes de campo e de rota em inglês (AGENT.md); as mensagens ao usuário em português.

### Banco de dados

**Sem impacto esperado.** Nenhuma tabela, coluna, índice ou migration. As consultas do Postgres são só leituras com Drizzle (editais abertos do órgão, edital e nome do órgão por número de controle), nas tabelas globais de editais; o índice `ix_edital_orgao` já existe. Os dados de contratos e de vencedores moram no armazém do R2.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não prevê nenhuma.

### Infra/Deploy

- **Variáveis de ambiente:** nenhuma nova.
- **Web Service:** baixa e abre mais um conjunto. Disco temporário: cerca de 85 MB a mais com o histórico inteiro dos vencedores (a produção ainda não tem vencedores: a flag está desligada), e o dobro disso durante a troca de versão. Memória: o limite do DuckDB (128 MB, 1 linha de execução, fila de 2 consultas, 20 s) não muda; o resumo ocupa uma vaga da fila por vez.
- **Cron Job:** sem mudança.
- **Dados na produção:** a página só fica cheia quando a carga de contratos avança e a flag dos vencedores é ligada; até lá, mostra a nota de cobertura.
- **Deploy:** não precisa de ordem especial (nenhuma migration). O primeiro deploy com a página reinicia o Web Service, e a busca de contratos fica cerca de 1 minuto "atualizando", como em qualquer deploy.

## Arquivos provavelmente afetados

Backend (`backend/src/modules/tenders/`):
- novos: `cnpj.ts` (e teste), `services/cnpjPage.ts`, `services/winnerLinks.ts`, `routes/cnpj.ts`, `contractStore/cnpjQueries.ts` (e testes);
- alterados: `contractStore/criteria.ts`, `queries.ts`, `service.ts` e `winnerQueries.ts`, `services/contractSearch.ts`, `routes/index.ts` e `validators.ts`, `collector/winnersLookup.ts`, `contractStore/storeTestSupport.ts` (linhas de exemplo), `routes/routes.db.test.ts`, `README.md` e `tenders.http`.

Front (`src/tenders/`):
- novos: `screens/CnpjScreen.tsx` e os componentes da página, `services/cnpjService.ts`, `utils/cnpj.ts` (e testes);
- alterados: `TendersApp.tsx`, `utils/navigation.ts`, `searchFilters.ts` e `contractFilters.ts` (e testes), `services/queryKeys.ts`, `types.ts`, `layout/TendersTopBar.tsx`, `screens/SearchScreen.tsx` e `ContractsScreen.tsx`, `components/ContractCard.tsx`, `ContractDetailView.tsx`, `NoticeCard.tsx` (nome do órgão), `TagInput.tsx`, `Pagination.tsx`, `ContractFiltersPanel.tsx`, `SearchFiltersPanel.tsx` e `SavedSearchFormDialog.tsx` (renome de `isValidCnpj`).

Documentação: `.plans/licitacoes-contratos-no-r2.md` (a "Situação" da Parte 3 e o apontamento para este plano).

## Estratégia de implementação

1. **Branch** `feat/R/licitacoes-cnpj`, a partir da `main` (já atualizada: Parte 3 mesclada). O `CLAUDE.md` com 3 linhas em branco e a pasta `.portal/` já estavam alterados antes e não entram.
2. **CNPJ no backend:** `cnpj.ts` com os testes (a Diretriz vale; `10337488000192`, `00000000000000`, repetidos e tamanho errado não). Trocar `isWinnerCnpj` e o `isCnpj` dos validadores por `isCnpjFormat`.
3. **Busca de contratos rápida por CNPJ:** escolha do conjunto em `criteria.ts`, condições de poda e uso em `queryContractPage` e `searchContracts`. Testes de equivalência no armazém de exemplo (vários órgãos e fornecedores, com e sem encerrados, com favoritos e filtros combinados) e das regras de escolha do conjunto (com termos, nunca `fornecedor`). **Medir** no armazém local de 351 mil contratos o tempo de `GET /contracts` com `supplierCnpj` e com `agencyCnpj`, antes e depois, e registrar.
   - **Feito em 2026-10-26** (pasta `local/` do R2, leitor de 1 thread e 128 MB como o do Web Service; consulta da página mais a contagem do total, 10 linhas, melhor de 3 rodadas): **fornecedor** com 925 contratos, 160–277 ms antes e 63–83 ms depois; com 19 contratos, 188–200 ms antes e 92–110 ms depois; com 2 contratos, 148–230 ms antes e 66–92 ms depois (cerca de 2x mais rápido, no conjunto `fornecedor`). **Órgão** com 987, 34 e 19 contratos: 140–234 ms antes e 132–230 ms depois, ou seja, igual ou pior com a poda pela faixa do número de controle. A poda por órgão foi **retirada**; o filtro por órgão segue como era, uma varredura de `contratos` (cerca de 170 ms com 351 mil contratos, crescendo com a base).
   - **Risco que fica:** com a base na casa dos milhões de contratos (cerca de 1 GB no `contratos`, estimado pelo piloto), a busca por órgão e as consultas de órgão da página varrem tudo, em segundos e dentro do limite de 20 s. Se pesar, o conserto é um conjunto novo `orgao`, ordenado pelo CNPJ do órgão, como o `fornecedor` (mudança de formato do armazém; fora deste plano).
4. **Web Service com os vencedores:** `WEB_STORE_DATASETS` em `service.ts` (com teste da constante e do leitor com o conjunto) e conferir que sem arquivos de vencedores a consulta devolve zeros.
5. **Consultas, serviço e rotas do CNPJ:**
   - mover `findNoticeIds` e `purchaseLink` para `services/winnerLinks.ts` (o `winners-lookup` passa a importar de lá);
   - `cnpjQueries.ts`, `queryWinnerCount` e o nome em `queryWinnerSummary`;
   - `cnpjPage.ts`, `routes/cnpj.ts`, o validador e o limite de taxa; montar em `routes/index.ts`;
   - testes das consultas (armazém de exemplo, com vencedores gravados pelo `WinnerStoreWriter` como em `winnersLookup.test.ts`) e da API em `routes.db.test.ts` (404, 403 e 402; 400 com CNPJ inválido; 200 vazio; resumo e vencedores de um CNPJ com os dois papéis; paginação; 503; 429).
6. **Front, base:** `utils/cnpj.ts` (e o renome em `searchFilters.ts`, `contractFilters.ts` e nos dois painéis), `cnpjService.ts`, query keys e tipos, com testes.
7. **Front, página:** rota e `navigation.ts`, `CnpjScreen` e componentes, `Pagination` com `perPageOptions`.
8. **Front, entradas:** reconhecimento nas três caixas, links nos nomes (cards, detalhe, vencedores, listas) e o atalho em `TagInput` nos campos de filtro.
9. **Documentação:** README (estrutura, API, telas), `tenders.http` e o plano do R2.
10. **Validações**, um comando de cada vez (ver abaixo).
11. **Conferência local com a Diretriz**, com o "sim" do usuário antes de gravar no R2: carregar no armazém `local/` os três dias de vitória (`winners-backfill --from D --to D` para 2023-06-27, 2024-09-18 e 2026-07-22, com `TENDERS_STORAGE_PREFIX=local`), subir o app e abrir `/cnpj/22493902000140`; conferir também uma busca por CNPJ nas três caixas, os links, os atalhos, o "Ver todos", o celular e o estado "atualizando". Registrar os números no plano.

## Regras de negócio identificadas

- **Papéis:** o mesmo CNPJ pode ser fornecedor, órgão ou os dois. A página mostra as abas dos papéis e deixa a aba sem dado com o estado vazio.
- **Contratos:** todos os tipos, vigentes e encerrados, desde 2021, como na Parte 2; "vigente" é vencimento a partir de hoje (`activeContractCondition`). As listas curtas da página ordenam pela publicação mais recente e incluem encerrados.
- **Licitações vencidas:** uma linha por licitação e fornecedor, com o mapa de itens somado em centavos exatos; resultado cancelado já saiu na coleta. Entram todos os vencedores do armazém, inclusive os de classificação acima de 1 no registro de preços, e a situação 4 segue como não vencedora (comportamento da Parte 3, com as três decisões ainda abertas).
- **Nome:** o do contrato mais recente (os nomes de uma empresa mudam: a Diretriz aparece como EIRELI e como LTDA); sem contrato, o do resultado mais recente; para órgão, o do contrato mais recente ou, sem contrato, o do edital mais recente.
- **Editais abertos:** a mesma regra da busca de editais (`licitacoes.fn_edital_aberto`); editais encerrados saem do banco 12 meses depois.
- **Principais órgãos e fornecedores:** os 10 de maior valor global de contratos (desempate pelo número de contratos e depois pelo CNPJ).
- **Cobertura:** a página mostra desde quando há contratos e o período dos resultados carregados, para um CNPJ sem dado não parecer "sem histórico" quando a carga ainda está em andamento.
- **Documento de pessoa física:** sempre mascarado; não há página para ele. O nome de MEI sai como no cadastro (decisão 3).
- **Atualização:** os dados novos aparecem depois da publicação do Cron Job, uma vez por dia, como nas telas de contratos.

## Regras multi-tenant e segurança

- **Dado público e global:** contratos, vencedores e editais não são de uma conta. A página e a API do CNPJ só leem esses dados; nada tenant-specific entra no resumo (a contagem de editais abertos não junta acompanhamento nem favorito da conta).
- **Dados da pessoa e da conta nas listas curtas:** favoritos e acompanhamento aparecem pelas buscas atuais (`GET /contracts` e `GET /notices`), que já filtram por conta e pessoa vindas da sessão (`tenderAccessOf`). Nenhum `accountId` ou `userId` vem do client sem a trava.
- **Acesso:** a rota passa pela trava do módulo (`createRequireTenderAccess`): conta sem o módulo ou alheia, 404; colaborador sem acesso, 403; assinatura vencida, 402. Sem sessão, 401.
- **Limite de taxa** por pessoa (60 por minuto, em memória por instância, como o limitador atual) contra raspagem de CNPJs.
- **Entrada:** o CNPJ do caminho é conferido (14 dígitos e dígitos verificadores) antes de qualquer consulta; no DuckDB entra só como literal conferido pelo formato, nunca como texto livre. Páginas e tamanhos são limitados.
- **Erros** sem detalhe interno, sem endereço do R2 e sem nome de arquivo; log com o contexto (operação e pessoa) e sem dado sensível.
- **Privacidade (decisão 3):** o nome sai como no cadastro público do CNPJ, que pode trazer o CPF do MEI. Decisão registrada do usuário; o documento de pessoa física segue mascarado. A página facilita achar o nome a partir do CNPJ, que já é possível no cadastro público.
- **Relatórios e PDFs:** sem impacto (a página não exporta nada).

## Validações necessárias

- **`:cnpj` (backend):** 14 dígitos, dígitos verificadores válidos e não todos iguais; senão, 400 com "CNPJ inválido". Só dígitos no caminho (a máscara tem `/`).
- **`/winners`:** `page` inteiro de 1 a 100.000 e `perPage` de 1 a 50 (padrão 10).
- **Busca de contratos com CNPJ:** continua validando `agencyCnpj` e `supplierCnpj` pelo formato (14 dígitos), no máximo 50 de cada; CNPJ fora do formato não vira literal.
- **Front:** o parâmetro `:cnpj` e o texto das caixas passam por `normalizeCnpj` e `isValidCnpj`; o parâmetro de URL `aba` só aceita `fornecedor` ou `orgao` (outro valor volta ao padrão); `pagina` positiva.
- **Resposta do armazém:** DECIMAL e DATE chegam como texto; contagens com `::INTEGER`; nada de BigInt na resposta.

## Testes necessários

### Frontend

- `utils/cnpj.test.ts`: normalização, formato, dígitos verificadores (Diretriz válido; `10337488000192`, `00000000000000`, repetidos, curto e longo inválidos), reconhecimento do texto de busca (com máscara, com espaços, só dígitos, texto comum, número com 14 dígitos inválido), caminho da página.
- `navigation.test.ts`: `quickSearchPath` com CNPJ e com texto, `routeForPath('/cnpj/22493902000140')` e o título da rota.
- Utilitários da página (escolha da aba padrão, rótulos da cobertura, montagem das buscas curtas e dos links "Ver todos").
- `searchFilters.test.ts` e `contractFilters.test.ts` com o renome (`isCnpjFormat`): filtros continuam aceitando CNPJ com dígito errado.
- `screenTexts.test.ts`: nenhum "PNCP" nos componentes novos e alterados.
- Os 406 testes do front que já existem continuam passando.

### Backend

- `cnpj.test.ts`: as mesmas regras do front, com os CNPJs reais.
- **Busca de contratos:** equivalência com e sem a poda (mesmas chaves e mesmo total), regras de escolha do conjunto (termos, exclusões e número nunca usam `fornecedor`; só com CNPJ de fornecedor usa), vigentes e encerrados, favoritos, vários CNPJs juntos e CNPJ fora do formato.
- **Consultas do CNPJ** (armazém de exemplo, com vencedores gravados pelo `WinnerStoreWriter`): totais e vigentes, valor somado, nome mais recente, principais órgãos e fornecedores, cobertura, vencedores com contagem e página, CNPJ sem dado.
- **API** (`routes.db.test.ts`): 404, 403 e 402 nas duas rotas; 400 com CNPJ inválido e com `perPage` acima de 50; 200 vazio para CNPJ sem dado; resumo de um CNPJ com os dois papéis; vencedores com edital no banco e sem; 503 com o armazém sem cópia; 429 no limite de taxa.
- **Armazém do Web Service:** a constante `WEB_STORE_DATASETS` e o leitor abrindo o conjunto `vencedores`.
- `winners-lookup` continua igual depois de mover `findNoticeIds` e `purchaseLink`.
- Os 846 testes sem banco e os 182 de banco que já existem continuam passando.

### E2E

- Conferência local com a Diretriz (item 11 da estratégia): cabeçalho, abas, totais, as 3 licitações vencidas, contratos, "Ver todos", links e atalhos.
- Um CNPJ digitado na barra do topo, em Buscar e em Contratos abre a página; um número de 14 dígitos inválido faz a busca por texto de sempre.
- Um órgão (ex.: a Câmara Municipal de Elói Mendes): aba "Como órgão" com contratos, editais abertos e principais fornecedores.
- Estados: vazio, erro, armazém atualizando, tema escuro e celular sem transbordo.
- Primeiro deploy: o Web Service baixa a cópia com o conjunto novo (espaço em disco e tempo) e a página responde.

## Comandos de validação sugeridos

Um de cada vez, nunca em paralelo: o computador não tem arquivo de paginação.

```bash
npx vite build
npm test
npx tsc --noEmit -p .
npm --prefix backend run build             # tsc --noEmit
npm --prefix backend test
npm --prefix backend run test:tenders-db   # banco local (.env.dev)
npm --prefix backend run migrations:status -- --banco local   # só leitura: nenhuma migration nova esperada
```

## Riscos e pontos de atenção

- **Dados incompletos na produção:** contratos com cerca de 10 dias de histórico e vencedores desligados. A página sai quase vazia nos primeiros dias; a nota de cobertura é a mitigação, e as entradas só levam a ela. Se preferir esconder as entradas até a carga avançar, é uma decisão de lançamento, não de código.
- **Regressão na busca de contratos:** escolher outro conjunto e podar arquivos mexe no caminho de todas as buscas por fornecedor. Mitigação: as condições atuais ficam, a poda só reduz o que se lê, e há testes de equivalência (`cnpjFilters.test.ts`).
- **Busca por órgão sem ganho de velocidade:** o conjunto `contratos` não é ordenado pelo órgão (passo 3). Cresce com a base; o conserto, se for preciso, é um conjunto `orgao` (fora deste plano).
- **Desempenho do resumo no Render (0,5 CPU):** várias consultas por visita. Mitigação: uma vaga da fila, consultas com literais e poda, limite por pessoa, `staleTime` no React Query. Medir no primeiro deploy.
- **Memória e disco do Web Service** (512 MB; disco temporário não documentado pelo Render): conjunto novo na cópia local. O limite do DuckDB não muda.
- **Nome de MEI com CPF** (decisão 3): aparece no cabeçalho da página e já aparece nas telas de contratos. Registrado como decisão do usuário.
- **Números dependem das decisões abertas da Parte 3** (cancelamento tardio, situação 4 e classificação acima de 1): a página mostra o que o armazém tem, com a nota. Mudar a regra depois muda os números, não a tela.
- **Renome de `isValidCnpj`:** toca cinco arquivos do front; o compilador pega os esquecimentos, e os testes dos filtros garantem o comportamento.
- **CNPJ com dígito inválido nos dados** (0,005% dos fornecedores): ficam sem link e sem página. É o esperado.
- **Raspagem:** a trava do módulo e o limite de taxa cobrem; não há busca por CPF.
- **Diretriz sem vitórias no armazém local:** a conferência pede carregar três dias de resultados na pasta `local/` do R2 (grava no R2; precisa do "sim" do usuário).
- **Plano do R2 com a "Situação" da Parte 3 desatualizada:** corrigir junto com este trabalho.

## Perguntas em aberto

Nenhuma pergunta bloqueante. Padrões assumidos, ajustáveis na implementação:
- 60 pedidos por minuto por pessoa nas rotas do CNPJ;
- listas curtas de 10; vencedores com 10, 20 ou 50 por página;
- a aba "Como fornecedor" abre por padrão;
- a nota dos valores homologados com o texto acima.

Herdadas da Parte 3 e não bloqueantes: a revisão semanal de 30 dias para cancelamento tardio, a situação 4 e a classificação acima de 1 no registro de preços.

## Critérios de aceite do plano

A implementação está pronta quando:
- `/cnpj/22493902000140`, no ambiente local, mostra o nome, os 4 contratos (3 vigentes em 26/10/2026), as 3 licitações vencidas (26 itens, R$ 484.281,92), os valores por ano e os órgãos que mais contrataram, com a aba "Como órgão" no estado vazio e a nota de cobertura;
- o CNPJ de um órgão com contratos e editais mostra a aba "Como órgão" com totais, editais abertos, contratos recentes e principais fornecedores;
- um CNPJ válido digitado na barra do topo, em Buscar e em Contratos abre a página, e um número com dígito errado faz a busca por texto de antes;
- os nomes do órgão e do fornecedor são links nos cards, no detalhe e na lista de vencedores (só com CNPJ válido), e os campos "Órgão (CNPJ)" e "Fornecedor (CNPJ)" têm o atalho;
- `GET /contracts` com `supplierCnpj` ou `agencyCnpj` devolve exatamente o resultado de antes, e a medição no armazém local mostra o tempo antes e depois;
- as rotas do CNPJ respeitam as travas (404, 403, 402), validam o CNPJ (400), limitam a taxa (429) e respondem 503 enquanto o armazém atualiza;
- o Web Service abre o conjunto `vencedores`, e a página funciona também com ele vazio;
- sem migration; o texto das telas não cita o PNCP; o documento de pessoa física segue mascarado;
- `npx vite build`, `tsc` do front e do backend, os testes do front, do backend e de banco passam, e a "Situação" da Parte 3 no plano do R2 está corrigida.

## Observações para a skill implementar

- Usar este plano como fonte principal; o plano do R2 e o dos vencedores valem para o contexto.
- **Migrations:** nenhuma prevista. Não executar sem confirmação explícita (o ambiente pode estar apontando para a produção). Nunca `dev:prod-db` nem `--banco producao`.
- **`.env` e variáveis do Render:** não mexer. Carregar os três dias da Diretriz no `local/` só com o "sim" do usuário (grava no R2), com o `.env.dev` que já tem `TENDERS_STORAGE_PREFIX=local`.
- **Sem sobreposição** (preferência do usuário): melhorar o que existe em vez de criar caminho paralelo. `isValidCnpj` vira `isCnpjFormat` e o novo `isValidCnpj` confere os dígitos; `findNoticeIds` e `purchaseLink` saem do comando e vão para um lugar só; as listas curtas usam as buscas atuais; a regra de escolha do conjunto fica só em `criteria.ts`.
- **Poda só como otimização:** manter as condições atuais da busca e acrescentar os literais; os CNPJs entram no SQL como literais depois de conferidos pelo formato, nunca concatenando texto da pessoa.
- Seguir o `/AGENT.md`: código em inglês e textos em português; Drizzle nas queries novas do Postgres; sem `any`; sem `catch` silencioso; `orderBy` explícito com desempate estável nas listas.
- A página precisa funcionar com o armazém sem vencedores e com poucos contratos: nunca supor dado presente.
- Não citar o PNCP nos textos das telas (o `screenTexts.test.ts` confere); o link para a compra usa rótulo neutro.
- Rodar build e testes um de cada vez. Scripts com barra invertida, pela ferramenta Write.
- Commit, push e merge só no `/finalizar`, com autorização (CLAUDE.md). A branch sai da `main`; o `CLAUDE.md` alterado e a pasta `.portal/` não entram nos commits.
- Ao terminar, acrescentar uma "Situação" a este plano (o que foi feito, as medições do item 3 e da conferência local, os desvios) e atualizar a memória do projeto.

## Situação (26/10/2026)

**Implementada na branch `feat/R/licitacoes-cnpj`.** Backend, front, testes e documentação prontos; a carga dos 3 dias da Diretriz no `local/` e a conferência dos números foram feitas (abaixo); falta o usuário abrir a página no navegador.

**O que ficou como o plano previa**
- `cnpj.ts` (formato, dígitos verificadores, `requireCnpjFormat` e `InvalidCnpjError`, que substituiu o `InvalidWinnerCnpjError`); `isWinnerCnpj` e o `isCnpj` dos validadores saíram.
- Busca de contratos por fornecedor no conjunto `fornecedor`, com a regra de escolha só em `criteria.ts` (`contractListDataset`) e a poda em `supplierPruneCondition`; testes de equivalência em `contractStore/cnpjFilters.test.ts` (13 casos × 5 combinações de conjunto, mais filtros, ordens, páginas e totais).
- `WEB_STORE_DATASETS` no Web Service (`vencedores` junto com os de contratos); o leitor com o conjunto vazio devolve zeros (teste em `service.test.ts`).
- `cnpjQueries.ts`, `winnerQueries` (`name` no resumo e `queryWinnerCount`), `services/cnpjPage.ts`, `services/winnerLinks.ts` (`findNotices` e `purchaseLink`, usados também pelo `winners-lookup`), `routes/cnpj.ts` com 60 pedidos por minuto por usuário.
- Front: `utils/cnpj.ts`, `utils/cnpjPage.ts`, `CnpjScreen` (abas, indicadores, valores por ano, ranking, listas curtas, vencedores paginados), `CnpjLink` nos nomes (cards, tabelas, quadro e tabela de acompanhamento, detalhes), atalho "Abrir a página do CNPJ" nas etiquetas dos filtros, reconhecimento do CNPJ nas três caixas de busca, `Pagination` com `perPageOptions`.

**Desvios do plano**
- **Sem poda por órgão.** A medição do passo 3 (acima) mostrou que a faixa do número de controle não pula arquivo e atrasa a busca; o filtro por órgão ficou como era. A busca por fornecedor ficou cerca de 2x mais rápida. O risco (órgão com a base na casa dos milhões) está nos "Riscos"; o conserto, se for preciso, é um conjunto `orgao`.
- **`isValidCnpj` do front não foi criado de novo:** o app já tinha um com dígitos verificadores em `src/utils/brazilDocuments.ts`, que é o usado agora. O que era `isValidCnpj` (só o formato) em `searchFilters.ts` virou `isCnpjFormat` em `utils/cnpj.ts`, e o `normalizeCnpj` do módulo foi trocado pelo `onlyDigits` que já existia.
- O `SearchFiltersPanel` passou a usar o `parseCnpj` do `SavedSearchFormDialog` (o mesmo do `ContractFiltersPanel`), em vez de repetir o conferidor inline.
- A cobertura (`queryStoreCoverage`) fica guardada por armazém e por publicação (a conta varre uma coluna).
- O atalho "Abrir a página do CNPJ" ficou só nos painéis de filtros (Buscar e Contratos a vencer), não nos formulários de busca salva (o diálogo ficaria aberto).

**Validações (26/10/2026, uma de cada vez)**
- `npx vite build`: passou. `npx tsc --noEmit -p .` (front) e `npm --prefix backend run build` (tsc do backend): passaram.
- `npm test` (front): 418 testes, todos passando. `npm --prefix backend test`: 876 testes, todos passando. `npm --prefix backend run test:tenders-db`: 184 testes, todos passando (banco local).
- `migrations:status -- --banco local`: só a 0088 pendente (de outro plano); este trabalho não tem migration.
- No armazém `local/` do R2 (leitura apenas, 351.138 contratos): resumo de um fornecedor com 925 contratos em 107 ms (62 ms na segunda vez) e de um órgão com 987 contratos em 82 ms. Renderização da tela no servidor com dados de exemplo (com dados, aba órgão, sem dados, CNPJ inválido, carregando): sem erro.

**Conferência local com a Diretriz (item 11), feita em 26/10/2026 com o "sim" do usuário**
- Carga dos 3 dias no `local/` do R2 (`winners-backfill --from D --to D`, um dia por vez, com o `.env.dev` e o banco local passado só ao processo): 27/06/2023 (execução 4429: 1.752 registros, 691 linhas), 18/09/2024 (4430: 9.623 registros, 2.600 linhas) e 22/07/2026 (4431: 7.998 registros, 2.541 linhas). Nos dois primeiros dias a primeira leitura veio incompleta (1.709 de 1.752 e 9.104 de 9.623 linhas distintas) e a segunda, com outro tamanho de página, completou: o conserto da Parte 3 funcionou. O armazém `local/` passou a ter 5.832 linhas de vencedores.
- `getCnpjSummary` e `listCnpjWinners` sobre o armazém real (leitura): **DIRETRIZ INFORMATICA LTDA**, 4 contratos (3 vigentes, R$ 674.195,04), 3 licitações vencidas, 26 itens, R$ 484.281,92, de 27/06/2023 a 22/07/2026 (2026: 1 licitação, 4 itens, R$ 54.241,92; 2024: 1, 21, R$ 420.040,00; 2023: 1, 1, R$ 10.000,00), 4 órgãos que mais contrataram e a nota de cobertura (contratos desde 09/08/2022; resultados de 27/06/2023 a 22/07/2026, os 3 dias carregados). Tempo do resumo: 115 a 190 ms. Como o banco local não tem os editais dessas licitações, o órgão aparece pelo CNPJ nos cards (com o edital no banco, aparece o nome).
- **Falta o usuário abrir `/cnpj/22493902000140` no navegador** (inclusive no celular e no estado "atualizando"): `/run`, login e o endereço `/licitacoes/app/cnpj/22493902000140`.

**Falta**
- Depois do merge: o Web Service passa a baixar o conjunto `vencedores` (cerca de 85 MB a mais no disco com o histórico inteiro; vazio enquanto a flag `TENDERS_WINNERS_ENABLED` estiver desligada).
