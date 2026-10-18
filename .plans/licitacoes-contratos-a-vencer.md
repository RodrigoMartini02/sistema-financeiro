# Plano de Implementação: Licitações — Contratos a vencer

## Origem

- Arquivo de especificação: nenhum. Pedido feito na conversa de 13/10/2026: "saber antecipadamente vencimentos de contratos, com os mesmos tipos de buscas de editais".
- Base: o estudo `.plans/estudo-fontes-licitacoes.md` e as medições desta conversa (seção "Leitura de contexto").
- Data do planejamento: `2026-10-13`
- Classificação: `frontend + backend + database` (com etapas novas na rotina diária do Render)

## Resumo

O PNCP publica os contratos com a data de fim da vigência, na mesma API de consulta que o módulo já usa. Este plano:

- guarda na base os contratos vigentes do PNCP, com o vencimento atualizado pelos aditivos (termos);
- cria a área **"Contratos a vencer"**, com os filtros de Buscar, detalhe, favoritos, buscas salvas e avisos antes do vencimento.

A API do PNCP só filtra contratos por data de publicação, data de atualização e órgão. Por isso os contratos precisam ficar na nossa base, como os editais, com uma carga inicial grande e uma coleta diária.

A entrega é em duas partes, cada uma com o seu `/implementar` e o seu `/finalizar`:
- **Parte A — dados:** banco, coletor, carga inicial e coleta diária, sem a área nova.
- **Parte B — área nova:** busca, detalhe, favoritos, buscas salvas e avisos. Começa depois que a carga terminar.

## Decisões aplicadas

- **Decisão 1:** só "Contrato (termo inicial)" com vigência original de 6 meses ou mais (180 dias). Empenhos, "Outros" e contratos curtos ficam de fora.
- **Decisão 2:** os aditivos são consultados só nos contratos com sinal de alteração no PNCP, e o vencimento é o do termo mais recente que muda a vigência.
- **Decisão 3:** Categoria no lugar de modalidade.
- **Decisão 4:** tela própria "Contratos a vencer", detalhe, favoritos e buscas salvas próprias, com as abas Editais e Contratos em Favoritos e em Buscas salvas. Sem quadro de acompanhamento: o favorito faz esse papel.
- **Decisão 5:** avisos 90 e 30 dias antes do vencimento, para as buscas salvas com "Notificar" (só os contratos que entraram na janela nos últimos 7 dias) e para os favoritos; e "vencimento alterado" para os favoritos.
- **Decisão 6:** os contratos saem da base assim que vencem, menos os favoritados.
- **Decisão 7:** duas partes. A carga inicial roda sozinha na rotina diária do Render, em blocos de até 8 h (eram 3 h; mudou com o piloto), e a Parte B entra quando ela terminar.
- **Custos (pedido do usuário):**
  - seção "Custos" neste plano;
  - trava de espaço antes da produção;
  - a carga confere o tamanho do banco antes de cada dia e para num limite definido pelo plano do Render;
  - o piloto mede o tamanho real por contrato e o tempo da busca.

## Escopo

### Dentro do escopo

**Parte A — dados**
- Coleta de contratos do PNCP por publicação e por atualização, com as regras de entrada (decisão 1).
- Consulta dos aditivos dos contratos com sinal de alteração e cálculo do vencimento atual (decisão 2).
- Carga inicial desde 01/01/2021, do dia mais recente para o mais antigo, retomável, em blocos de até 8 h na rotina diária, com limite de espaço.
- Coleta diária (ontem e hoje) e limpeza diária dos vencidos (decisão 6).
- Comandos novos no CLI do coletor e etapas novas na rotina diária.
- Configurações › Coleta: execuções de contratos e andamento da carga.
- Piloto no banco local, com relatório de medição e projeção (trava antes da produção).

**Parte B — área nova**
- Tela "Contratos a vencer" (`/contratos`), com os filtros, chips, URL compartilhável, cards ou tabela, ordenação e paginação.
- Detalhe do contrato no painel lateral (`?contrato=<id>`) e na rota `/contratos/:id`.
- Favoritos de contratos, de cada pessoa (aba Contratos em Favoritos).
- Buscas salvas de contratos, com "Ativa", "Notificar" e prévia (aba Contratos em Buscas salvas).
- Avisos `CONTRATO_VENCE_90D`, `CONTRATO_VENCE_30D` e `CONTRATO_ALTERADO`, no sino e em Notificações.

### Fora do escopo

- Atas de registro de preço.
- Modalidade nos contratos (decisão 3).
- Quadro de acompanhamento (Analisar, Vou participar, Descartado) para contratos (decisão 4).
- Exportação.
- Card ou indicador de contratos no Início. A busca rápida da barra superior continua só para editais.
- Documentos e arquivos do contrato: o detalhe tem só o link para o PNCP.
- Busca do fornecedor pelo nome (só pelo CNPJ).
- Guardar o JSON completo do PNCP e o índice de trigramas nos contratos (espaço; ver "Custos").
- Mudanças nas regras e consultas de editais, além das telas compartilhadas listadas em "Impacto por área".

## Leitura de contexto

- `/AGENT.md` e `CLAUDE.md`.
- Não existem no projeto: `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`.
- Módulo: `backend/src/modules/tenders/README.md`.
- **Backend:**
  - `collector/runs.ts` (`withCollectionRun`, `RunTally`, `collectQuery`), `pncpClient.ts` (paginação, retry, ritmo e listas da API principal), `mapping.ts` (`stableStringify` e hash), `repository.ts` (upsert com `setWhere` e travas `COLLECTOR_LOCK_KEYS`), `notifications.ts` (SQL com `ON CONFLICT DO NOTHING` e `fn_conta_com_acesso`) e `config.ts`;
  - `db/schema.ts` e `domains.ts`;
  - `services/noticeSearch.ts`, `savedSearches.ts`, `collectionOverview.ts` e `notificationInbox.ts`;
  - `src/services/dailyJobs.ts` e `dailyJobSteps.ts`;
  - migrations `0073` (CHECKs de `notificacao.tipo` e `coleta_execucao.tipo`), `0076` (`fn_edital_atende_criterios`, `fn_edital_aberto` e `fn_edital_bate`), `0079` (`fn_grupos_digitos` e índices de expressão) e `0080` (GRANT condicional ao `licitacoes_coletor`);
  - o schema `licitacoes` não usa RLS: o isolamento é feito nas consultas;
  - o índice `ix_edital_objeto_trgm` não é usado por nenhuma consulta dos serviços (nenhum `trgm`, `similarity` ou `ILIKE`).
- **Front:** `TendersApp.tsx`, `utils/navigation.ts`, `layout/TendersSidebar.tsx`, `utils/searchFilters.ts`, `types.ts` (listas próprias dos tipos de execução e de notificação) e `components/CollectionPanel.tsx`.
- **PNCP** (OpenAPI em `collector/docs/`):
  - consulta: `GET /v1/contratos` (por data de publicação) e `GET /v1/contratos/atualizacao` (por data de atualização global), com `dataInicial`, `dataFinal`, `pagina` e `tamanhoPagina` de 10 a 500. Os opcionais são só `cnpjOrgao`, `codigoUnidadeAdministrativa` e `usuarioId`: não há filtro por texto, UF, município ou vencimento;
  - API principal: `GET /v1/orgaos/{cnpj}/contratos/{ano}/{sequencial}/termos` devolve uma lista (HTTP 204 quando não há termo), com `tipoTermoContratoNome`, `qualificacaoVigencia`, `dataVigenciaFim`, `prazoAditadoDias`, `valorAcrescido`, `dataAssinatura`, `sequencialTermoContrato` e `objetoTermoContrato`;
  - o contrato traz órgão, unidade (UF, município e código IBGE), categoria do processo, tipo de contrato, fornecedor, valores, assinatura, início e fim da vigência, número de controle do contrato e da compra de origem, e as datas de publicação, atualização e atualização global.

### Medições (13/10/2026, só leitura)

**Volume de contratos no PNCP, todos os tipos:**

| Mês | Registros |
| --- | --- |
| jan/2023 | 3.343 |
| jan/2024 | 35.909 |
| jan/2025 | 116.210 |
| jan/2026 | 145.939 |
| set/2026 | 175.642 |

- Desde 2021: cerca de 4 milhões de registros, ou ~10 mil páginas de 500.
- Num dia (06/10/2026): 8.480 publicações e 10.992 atualizações.
- Num dia de out/2024 (3.000 registros lidos): 902 "Contrato (termo inicial)" (30%) e 515 com 180 dias ou mais (17%).

**Aditivos:**
- 40 contratos longos de 2024, já vencidos pela data original: 9 tinham aditivo de vigência, e só 1 mostrava a data nova no próprio contrato. Exemplo: `83831719000100-2-000007/2024`, com fim em 31/12/2025 no contrato e em 31/12/2026 no aditivo.
- O sinal de alteração (data de atualização global mais de 1 dia depois da publicação) separa os aditivos:

| Contratos longos (out/2024) | Com algum termo | Com prorrogação |
| --- | --- | --- |
| 25 com o sinal | 20 | 6 |
| 25 sem o sinal | 1 | 0 |

**Ritmo do PNCP:**
- A consulta de contratos respondeu 429 com 1 s entre páginas: vale o intervalo de 4 s do coletor.
- 50 consultas de termos a 0,3 s passaram sem 429. É pouco para concluir: o piloto mede.

**Dados ruins na origem:** a consulta de atas trouxe vigência até o ano 7203.

**Tamanho:**
- Editais no banco local (24.867): tabela com 3.502 bytes por edital e índices com 1.554 (trigramas 880, texto 230). O JSON completo ocupa 1.564 bytes por edital.
- Contratos longos reais (166 de 1.000): objeto com 242 bytes, índice de texto com 304 bytes e os demais textos com 188 bytes.
- Projeção sem o JSON completo e sem trigramas: ~2 a 2,3 KB por contrato com os índices. São ~340 mil contratos guardados no começo (~0,7 GB) e ~1 GB em um ano.

### Piloto (13 e 14/10/2026, banco local; PNCP só leitura)

**O que rodou:** setembro/2026 inteiro (30 dias); 12 dias de amostra de outras idades (um por ano de 2021 a 2025, e 2026-08, 06, 04, 02 e 2025-12); a coleta diária (13 e 14/10); e o total de contratos por mês desde 2021. Ao todo, 42 dias de carga, 251.167 registros lidos, 55.550 contratos gravados e ~11 mil consultas de termos. A carga do mês foi retomada pelo comando real (`contracts-backfill`), que pulou os 9 dias já feitos.

**Ritmo do PNCP (nenhum 429 em todo o piloto):**

| Termos a cada | Consultas | 429 |
| --- | --- | --- |
| 4 s | 89 | 0 |
| 1 s | 721 | 0 |
| 0,5 s | ~10.200 | 0 |

- Consulta de contratos (4 s entre páginas de 500): ~600 páginas, de 1 a 3 s por página (máximo de 16 s), sem 429. As únicas falhas foram de conexão (2 na consulta e 5 nos termos, estas na suspensão do computador), todas repetidas com sucesso.
- Termos: de 40 a 170 ms por consulta.

**Setembro/2026:** 175.638 registros (o total do PNCP para o mês), 43.386 contratos gravados (24,7%, e não 17%) e 2.689 consultas de termos. A 0,5 s, ~2,6 min por dia útil.

**Por idade do contrato** (parte dos registros que é gravada / consultas de termos por mil registros):

| Publicação | Gravados | Termos por mil |
| --- | --- | --- |
| até 8 meses | 23 a 31% | 15 a 39 |
| 10 meses | 17% | 50 |
| 13 a 37 meses | 3 a 4,5% | 78 a 112 |
| 4 anos ou mais | ~0 | ~0 |

- O dia 11/02/2026 ficou fora da curva: metade dos contratos com sinal, 230 termos por mil registros. A projeção mostra o resultado com e sem esse dia.
- Nos dias antigos, metade ou mais dos contratos gravados só está vigente por causa de um aditivo (10/09/2025: 184 de 401). Consultar os termos é indispensável.

**Espaço (59.533 contratos, depois de `VACUUM ANALYZE`):** 1.797 bytes por contrato: tabela 1.203, TOAST 51 e índices 543 (texto 175, número de controle 71, os demais de 9 a 39).

**Busca (local, 59,5 mil contratos):** de 0,05 a 4,7 ms. Texto com ordem por vencimento: 0,6 ms. Contagem do texto: 1,6 ms. Duas palavras com relevância: 4,7 ms. Vencimento em 90 dias: 0,05 ms. Texto + UF + vencimento: 0,8 ms (`BitmapAnd`). O banco local tem mais memória que o do Render.

**Projeção:**
- PNCP: 5,04 milhões de registros de 2021-01 a 13/10/2026 (2021: 5 mil; 2022: 41 mil; 2023: 243 mil; 2024: 1,09 milhão; 2025: 2,02 milhões; 2026: 1,64 milhão).
- Carga completa: 330 a 400 mil consultas de termos; 580 a 590 mil contratos; ~1,0 GB.

| Termos a cada | Carga completa | Blocos de 3 h |
| --- | --- | --- |
| 0,5 s | 68 a 78 h | 23 a 27 (3,3 a 3,9 semanas) |
| 1 s | 114 a 134 h | 38 a 45 |
| 4 s | 390 a 467 h | 130 a 156 |

- Em 1 ano: ~650 a 670 mil contratos, ~1,1 GB, mais o inchaço das linhas apagadas.
- Coleta diária: ~1.900 consultas de termos e ~43 páginas, ~25 a 30 min a 0,5 s (mais de 2 h a 4 s).

**Valores reais:**
- `tipoTermoContratoNome`: só "Termo Aditivo", "Termo de Apostilamento" e "Termo de Rescisão".
- `tipoContrato`: 1 Contrato (termo inicial) ~40%, 7 Empenho ~34%, 8 Outros ~25%; abaixo de 1%: 12 Carta Contrato, 5 Termo de Adesão, 2 Comodato, 4 Concessão e 3 Arrendamento.
- `categoriaProcesso` (ids 1 a 11, na base): Compras 43%, Serviços 42%, Obras 4%, Serviços de Saúde 3,5%, Serviços de Engenharia 2,9%, Locação Imóveis 1,9%, Informática (TIC) 1,7%, Mão de Obra 0,8%, Cessão 0,5%, Alienação de bens móveis/imóveis 0,2% e Internacional 0,06%.
- Fornecedor: PJ 91%, PF 9% (CPF mascarado) e PE 0,1%.
- Link do contrato: confirmado. O site do PNCP tem a rota `contratos/:cnpj/:ano/:sequencial`.

**Regras conferidas:**
- **Rescisão:** chega como "Termo de Rescisão". Só ~27% vêm com `qualificacaoVigencia`, e ~42% vêm sem data de fim; vale a data de assinatura, como já implementado.
- **Apostilamento com `qualificacaoVigencia`** (~21% deles): na amostra dos dias antigos, só 1 de 187 daria data mais tarde que o vencimento calculado. A regra de ignorá-los se mantém.
- **Aditivo de prazo sem a data nova:** ~6% dos aditivos de prazo (dias antigos), sem como saber o vencimento. Só 1 em 5 traz `prazoAditadoDias`, que bate com a data real em 74% dos casos.
- O vencimento mudou pelos termos em 21% dos contratos conferidos.

**Dados ruins na origem (hoje contam como erro e deixam toda execução "Parcial"):** registro sem data de fim (~1 em 5.500); vigência acima de 35 anos (~1 em 8.500: digitação como 2227, ou água e energia com 2100 e 3024); aditivo de prazo sem data (~40 por coleta diária).

**Ocorrências:**
- **19/09/2026 (sábado):** o PNCP responde 204 para o dia inteiro, confirmado direto na API.
- **Suspensão do computador** (23:19 a 01:16): o piloto pausou e voltou sozinho, sem perda.
- **A 1ª coleta diária, pelo `npm`,** parou sem erro depois de 15 min (código 127, sem registro no Windows). A 2ª, direta, terminou. A execução interrompida ficou "EXECUTANDO" no banco local: o coletor não fecha execução órfã, como já acontece nos editais.

**Decisões do piloto (14/10/2026):**
- Termos a cada 0,5 s: padrão de `PNCP_TERMS_INTERVAL_MS` = 500.
- Tempo da carga: blocos de 8 h (padrão de `TENDERS_CONTRACTS_BACKFILL_MINUTES` = 480), ~10 dias. As alternativas eram manter 3 h (~3,5 semanas) ou começar em 2025 (perderia ~7% dos vigentes).
- Dado que falta na origem (sem data de fim, vigência de mais de 35 anos, aditivo de prazo sem a data nova): contado à parte, sem erro. "Parcial" fica para falha do PNCP.
- Aditivo de prazo sem a data nova: mantém o vencimento anterior, sem chute (não usa `prazoAditadoDias`).

## Impacto por área

### Frontend

**Parte A**
- `types.ts`: tipos de execução novos (`CONTRATOS_DIARIA`, `CONTRATOS_CARGA` e `CONTRATOS_LIMPEZA`).
- `utils/collectionRuns.ts` e `components/CollectionPanel.tsx`: rótulos das execuções novas e um bloco "Contratos", com:
  - a última coleta diária;
  - o andamento da carga: dias concluídos de quantos e o dia mais antigo já carregado;
  - "Carga concluída" ou o motivo da parada (tempo ou espaço).

**Parte B**
- **Rotas e menu:** `/contratos` ("Contratos a vencer", no menu depois de "Buscar") e `/contratos/:id` (fora do menu), em `utils/navigation.ts`, `TendersApp.tsx` e `layout/TendersSidebar.tsx` (ícone `CalendarClock`).
- **Tela `ContractsScreen`**, no modelo de `SearchScreen`:
  - filtros, num painel próprio:
    - palavras (E/OU, aspas, exclusão);
    - UF, município e órgão (CNPJ);
    - categoria;
    - faixa de valor global, com "incluir sem valor";
    - publicação (de/até);
    - vencimento (de/até), com atalhos de 30, 90, 180 e 365 dias;
    - número do contrato, processo ou controle PNCP, e ano do contrato;
    - CNPJ do fornecedor;
    - "Só favoritos";
  - chips removíveis, "Limpar tudo", URL compartilhável e voltar do navegador;
  - ordenação: vencimento mais próximo (padrão), publicação mais recente, maior valor, menor valor e relevância (só com palavras);
  - cards ou tabela, paginação no fim da página (`utils/screenLayout.ts`), coração de favorito e "Salvar esta busca";
  - data da última coleta de contratos, como no rodapé do Início.
- **Card:**
  - objeto, órgão, UF e município, categoria, fornecedor e valor global;
  - vencimento com "vence em N dias";
  - selo "Prorrogado" (vencimento diferente do original) e "Vencido" (favorito).
- **Detalhe** (`ContractDetailView`, no painel `?contrato=<id>` e na rota):
  - objeto e botão Favoritar;
  - vigência: início, fim original e vencimento atual;
  - aditivos: tipo, número, assinatura, nova vigência e valor acrescido;
  - órgão e unidade, município, categoria, número, processo e ano;
  - fornecedor e valores inicial e global;
  - "Ver no PNCP" e "Edital de origem": abre `/editais/:id` se o edital está na base; senão, a página da compra no PNCP.
- **Favoritos:** abas Editais e Contratos. A aba Contratos lista todos os favoritos da pessoa, inclusive os vencidos, pelo vencimento.
- **Buscas salvas:**
  - abas Editais e Contratos;
  - formulário de contratos com os mesmos campos do de editais, trocando modalidade e SRP por categoria e CNPJ do fornecedor;
  - card com "vigentes agora", Ativa e Notificar;
  - editar, duplicar, excluir e prévia ao vivo.
- **Notificações e sino:** rótulos dos tipos novos, filtro por tipo e link `/contratos/<id>`.
- **Serviços e tipos:** `services/contractsService.ts` e `contractSearchesService.ts` (novos), `services/queryKeys.ts` e `types.ts`.
- **Utilitários:** `utils/contractFilters.ts` (estado ↔ URL ↔ query da API ↔ chips, no modelo de `searchFilters.ts`), formulário da busca salva de contratos e rótulos.
- Estados de carregando, erro e vazio iguais aos de Buscar (`components/LoadStates.tsx`).

### Backend

**Parte A — coletor**
- `collector/config.ts`. Todas as variáveis têm padrão, e nenhuma é obrigatória no Render:
  - `PNCP_CONTRACTS_PAGE_SIZE`: 500 (de 10 a 500);
  - `PNCP_TERMS_INTERVAL_MS`: pausa entre consultas de termos, com padrão de 500 (medido no piloto);
  - `TENDERS_CONTRACTS_BACKFILL_FROM`: `2021-01-01`;
  - `TENDERS_CONTRACTS_BACKFILL_MINUTES`: 180;
  - `TENDERS_CONTRACTS_MAX_DB_MB`: limite de tamanho do banco para a carga.
    - **Sem ela, a carga não roda.** A rotina registra "carga não iniciada: limite de espaço não definido" e segue.
    - É também o "ligar" da carga na produção: quem define é o usuário, no Cron Job.
- `collector/pncpClient.ts`:
  - consultas de contratos (`/v1/contratos` e `/v1/contratos/atualizacao`), com o tamanho de página dos contratos;
  - termos de um contrato na API principal: lista; 204 = sem termos; 404 = não encontrado, sem repetir;
  - um cliente para a API principal com o ritmo `PNCP_TERMS_INTERVAL_MS`, separado do ritmo da consulta.
- `collector/contractMapping.ts` (novo):
  - registro do PNCP → linha de `licitacoes.contrato`, com validação. Registro inválido conta como erro e não derruba a página;
  - motivos para não gravar: não é termo inicial, tem menos de 180 dias ou está vencido (contados nos detalhes da execução);
  - sinal de alteração e cálculo do vencimento atual pelos termos;
  - resumo dos aditivos para o detalhe;
  - hash com `stableStringify` (de `mapping.ts`).
- `collector/contractRepository.ts` (novo):
  - upsert por página, por `numero_controle_pncp`, sem regravar a linha igual (`setWhere`, como nos editais). Se o mesmo contrato vier duas vezes na página, fica o último;
  - leitura em lote do que já está gravado, para não reconsultar termos, sem N+1;
  - controle dos dias da carga, limpeza dos vencidos e tamanho do banco (`pg_database_size`);
  - trava própria `COLLECTOR_LOCK_KEYS.contracts` (7_274_003), para não bloquear a varredura de editais nem ser bloqueada por ela.
- `collector/contractRuns.ts` (novo): `runContractsDaily`, `runContractsBackfill` e `runContractsCleanup` (Parte A) e `runContractReminders` (Parte B), com `withCollectionRun` e `RunTally`.
- `collector/cli.ts`:
  - comandos `contracts-daily`, `contracts-backfill [--from] [--to] [--max-minutes] [--max-db-mb]` e `contracts-cleanup`;
  - o `status` passa a mostrar os contratos e o andamento da carga.
- `src/services/dailyJobSteps.ts` e `dailyJobs.ts`: etapas novas (seção "Infra/Deploy").
- `services/collectionOverview.ts`: execuções de contratos no resumo e no histórico, `COLLECTION_SCHEDULE` dos tipos novos e andamento da carga.

**Parte B — API e avisos**
- `services/contractSearch.ts` (novo):
  - critérios (`ContractCriteria`), filtros da tela, busca paginada e ordenações;
  - busca por número: grupos de dígitos em 4 campos, com as mesmas expressões dos índices.
- `services/contractDetail.ts` (novo): detalhe, edital de origem e favoritos. Os favoritos são idempotentes, e contrato inexistente dá 404.
- `services/contractSavedSearches.ts` (novo):
  - listar, criar, editar, ligar e desligar (`PATCH`), excluir, duplicar e prévia;
  - "vigentes agora" de cada busca;
  - limite de 50 por pessoa e conta, separado das buscas de editais.
- `services/domainLists.ts`: lista de categorias.
- `services/notificationInbox.ts`: `contractId` nos itens e os tipos novos no filtro.
- Rotas novas, atrás de `authenticate` e da trava do módulo:
  - `GET /api/tenders/contracts`, `GET /contracts/:id`, e `PUT` e `DELETE /contracts/:id/favorite`;
  - `GET` e `POST /contract-searches`;
  - `GET`, `PUT`, `PATCH` e `DELETE /contract-searches/:id`;
  - `POST /contract-searches/:id/duplicate`;
  - `POST /contract-searches/preview`, com 60 por minuto por usuário, como a prévia atual.
- `routes/validators.ts` e `requestReaders.ts`: validação dos parâmetros novos. `tenders.http`: requisições novas.
- Avisos (`collector/notifications.ts` ou `contractNotifications.ts`):
  - `CONTRATO_VENCE_90D` e `CONTRATO_VENCE_30D`, numa etapa diária;
  - `CONTRATO_ALTERADO`, na gravação, quando o vencimento muda.
- A limpeza passa a manter os contratos favoritados.

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**Migration `0085_licitacoes_contratos.sql` (Parte A)**
- `licitacoes.contrato` (global, dado público):
  - identificação: `id` BIGSERIAL; `numero_controle_pncp` VARCHAR(60) NOT NULL UNIQUE; `numero_controle_compra` VARCHAR(60); `ano_contrato` e `sequencial_contrato` INTEGER NOT NULL; `numero_contrato` e `processo` TEXT;
  - órgão e local: `orgao_cnpj` VARCHAR(14) NOT NULL, `orgao_razao_social`, `esfera` VARCHAR(2), `unidade_codigo` VARCHAR(30), `unidade_nome`, `uf` CHAR(2), `municipio_nome` e `municipio_ibge` VARCHAR(7);
  - `categoria_id` SMALLINT e `categoria_nome`;
  - `objeto` TEXT NOT NULL e `informacao_complementar` TEXT;
  - fornecedor: `fornecedor_tipo_pessoa` VARCHAR(2), `fornecedor_documento` VARCHAR(30) e `fornecedor_nome`. O documento é o CNPJ com 14 dígitos; o CPF só fica mascarado;
  - `valor_inicial` e `valor_global` NUMERIC(18,2);
  - datas: `data_assinatura` DATE, `vigencia_inicio` DATE NOT NULL, `vigencia_fim_original` DATE NOT NULL, `vencimento` DATE NOT NULL (o atual), `data_publicacao_pncp` TIMESTAMPTZ NOT NULL, e `data_atualizacao_pncp` e `data_atualizacao_global` TIMESTAMPTZ;
  - aditivos:
    - `aditivos` JSONB: NULL = não conferidos; `[]` = conferidos, sem termo; senão, a lista resumida;
    - `aditivos_referencia` TIMESTAMPTZ: a data de atualização global da última conferência;
  - `hash_payload` CHAR(64) NOT NULL;
  - `busca_tsv` gerada com `licitacoes.pt_unaccent`, sobre o objeto e a informação complementar;
  - `primeira_coleta_em` e `ultima_coleta_em`;
  - CHECK `vigencia_fim_original >= vigencia_inicio`;
  - sem coluna com o JSON completo do PNCP.
- Índices, só do que a busca usa:
  - GIN de `busca_tsv`;
  - B-tree de `vencimento`, `uf`, `municipio_ibge`, `orgao_cnpj`, `categoria_id`, `data_publicacao_pncp DESC`, `valor_global` e `fornecedor_documento`;
  - GIN de expressão com `fn_grupos_digitos` para número + ano, processo + ano, controle PNCP do contrato e controle da compra;
  - sem índice de trigramas.
- `licitacoes.contrato_carga_dia`:
  - colunas `dia` DATE PK (dia de publicação), `concluido_em`, `registros_lidos`, `gravados` e `aditivos_consultados`;
  - só o dia concluído ganha linha.
- `licitacoes.coleta_execucao`:
  - o CHECK de `tipo` passa a aceitar `CONTRATOS_DIARIA`, `CONTRATOS_CARGA`, `CONTRATOS_LIMPEZA` e `CONTRATOS_AVISOS`, este último usado a partir da Parte B;
  - conferir antes o nome real da constraint no banco local (provavelmente `coleta_execucao_tipo_check`). A coluna `tipo` é VARCHAR(20).
- GRANT condicional ao `licitacoes_coletor`, se a role existir, como na 0080: `SELECT, INSERT, UPDATE, DELETE` nas duas tabelas e `USAGE` na sequência de `contrato`.
- Reversão no cabeçalho, como nas outras migrations.

**Migration `0086_licitacoes_contratos_favoritos_buscas.sql` (Parte B)**
- `licitacoes.favorito_contrato` (`conta_id`, `usuario_id`, `contrato_id` e `criado_em`), com PK nas três primeiras colunas, índice por `contrato_id` e FKs com `ON DELETE CASCADE`.
- `licitacoes.busca_salva_contrato`:
  - colunas `id`, `conta_id`, `usuario_id`, `nome` VARCHAR(120), `termos`, `modo_termos` (CHECK 'OU'/'E'), `termos_exclusao`, `ufs`, `municipios_ibge`, `orgaos_cnpj`, `categorias` SMALLINT[], `fornecedores_cnpj` VARCHAR(14)[], `valor_min`, `valor_max`, `incluir_sem_valor`, `notificar`, `ativa`, `criado_em` e `atualizado_em`;
  - índice `(conta_id, usuario_id) WHERE ativa`.
- `licitacoes.notificacao`:
  - `contrato_id` BIGINT REFERENCES `licitacoes.contrato` ON DELETE CASCADE;
  - CHECK `edital_id IS NULL OR contrato_id IS NULL`;
  - CHECK de `tipo` com `CONTRATO_VENCE_90D`, `CONTRATO_VENCE_30D` e `CONTRATO_ALTERADO`;
  - índice único `(conta_id, usuario_id, tipo, contrato_id, coalesce(referencia, '')) WHERE contrato_id IS NOT NULL`.
- Funções, com a mesma ideia da 0076 (uma regra só para a tela, a busca salva e os avisos):
  - `licitacoes.fn_contrato_atende_criterios(c, consulta, exclusão, ufs, municípios, órgãos, categorias, fornecedores, valor_min, valor_max, incluir_sem_valor)`;
  - `licitacoes.fn_contrato_vigente(c)`: `vencimento >= hoje em Brasília`;
  - `licitacoes.fn_contrato_bate(c, b busca_salva_contrato)`: as duas juntas.
- GRANT condicional ao `licitacoes_coletor`: `SELECT` em `favorito_contrato` e `busca_salva_contrato`, `SELECT, INSERT` em `notificacao` e `EXECUTE` nas funções novas.

**Riscos de banco:** o volume (ver "Custos"), o nome da constraint do CHECK, e as expressões dos índices de número, que precisam ser idênticas às da consulta (senão o índice não é usado).

### Infra/Deploy

- **Rotina diária** (`npm run daily-jobs`, Cron Job das 06:00), com as etapas nesta ordem:
  1. `plan-lifecycle`;
  2. `tenders-sweep`;
  3. `tenders-deadline-reminders`;
  4. `tenders-contracts-daily` (Parte A);
  5. `tenders-contracts-cleanup` (Parte A, todo dia);
  6. `tenders-contract-reminders` (Parte B);
  7. `tenders-cleanup` (domingos);
  8. `tenders-contracts-backfill` (Parte A, por último): só roda com dias pendentes e com `TENDERS_CONTRACTS_MAX_DB_MB` definida.
- **Duração:** durante a carga (~10 dias), a rotina dura cerca de 9,5 h. Depois, de 25 a 30 min a mais que hoje. O Render encerra uma execução depois de 12 h.
- **Variável no Render:** `TENDERS_CONTRACTS_MAX_DB_MB`, definida pelo usuário no Cron Job quando for começar a carga. As demais têm padrão no código.
- **GRANTs:** ficam nas migrations, condicionais; nada manual.
- **Ordem na produção:**
  - **Parte A:**
    1. resposta sobre o plano do Postgres;
    2. 0085 na produção, com confirmação;
    3. merge;
    4. o usuário define `TENDERS_CONTRACTS_MAX_DB_MB`;
    5. acompanhar a carga em Configurações › Coleta.
  - **Parte B:**
    1. carga concluída;
    2. 0086 na produção, com confirmação;
    3. merge.

### Custos (Render)

**Rotina diária (Cron Job):** cobrada por segundo de execução, no preço da instância, com mínimo de US$ 1 por mês.

| | Starter (≈ US$ 0,0096/h) | Standard (≈ US$ 0,034/h) |
| --- | --- | --- |
| Hoje: ~25 h/mês | US$ 1 (o mínimo) | US$ 1 (o mínimo) |
| Mês da carga: até ~90 h | US$ 1 (≈ 0,86) | ~US$ 3 |
| Depois: ~40 h/mês | US$ 1 | ~US$ 1,40 |

**Confirmado em 13/10/2026:**
- o Cron Job é `0.5c-512mb` (Starter), no Oregon, a US$ 0,00016 por minuto (preço do painel do Render), e a rotina leva hoje de 52 a 55 min por dia (~27 h por mês);
- a conta do cron fica no mínimo de US$ 1 por mês. Só se a carga ocupar um mês inteiro (~117 h) ela chega a ~US$ 1,12.

**Espaço no banco:** US$ 0,30 por GB por mês, em 1 GB ou em múltiplos de 5 GB. O espaço só aumenta. Os contratos ocupam ~0,7 GB no começo e ~1 GB em um ano.

| Banco hoje | O que fazer | Custo a mais |
| --- | --- | --- |
| Plano flexível com 5 GB ou mais e folga | nada | US$ 0 |
| Plano flexível com 1 GB | subir para 5 GB | +US$ 1,20/mês |
| Antigo Starter (1 GB fixo, US$ 7) | passar para um plano flexível com 5 GB (sem volta) | ~+US$ 0,50 a 1,50/mês |
| Antigo Standard (16 GB, US$ 20) | nada | US$ 0 |

- **Tráfego:** o que vem do PNCP é entrada, e entrada é grátis.
- **Único custo maior possível:** se a busca ficar lenta com 256 MB de memória no banco, a instância de 1 GB custa ~US$ 13 a mais por mês. Não é esperado; o piloto mede o tempo da busca, e acompanhamos depois da Parte B.
- **Resumo:** no cenário mais provável, de US$ 0 a 1,50 a mais por mês.
- **Trava:** antes da 0085 na produção, confirmar o plano e ter pelo menos 2 GB livres, para os contratos e o espaço temporário que o banco usa durante a carga. Se faltar, o usuário aumenta o espaço no painel antes.
- **Proteção:** a carga confere `pg_database_size` antes de cada dia e para quando passar de `TENDERS_CONTRACTS_MAX_DB_MB` (sugestão: 70% do espaço do plano). O motivo aparece em Configurações › Coleta. Assim o FINGERENCE nunca fica sem espaço para gravar.
- **Aumento automático desligado** (decisão do usuário): se o espaço acabar, o banco para de gravar para todo o FINGERENCE, sem aviso do Render. Por isso a trava e o limite são obrigatórios.
- **Fontes:**
  - [Render: Cron Jobs](https://render.com/docs/cronjobs);
  - [custo de hospedagem](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses);
  - [planos antigos do Postgres](https://render.com/docs/postgresql-legacy-instance-types);
  - [criar o Postgres](https://render.com/docs/postgresql-creating-connecting);
  - [planos de máquina](https://render.com/docs/compute-plans);
  - o preço do cron foi confirmado no painel do Render. O do Postgres "Basic" vem de fontes não oficiais; o painel mostra o valor exato.

## Arquivos provavelmente afetados

**Parte A**
- `backend/drizzle/0085_licitacoes_contratos.sql` (novo)
- `backend/src/modules/tenders/db/schema.ts`
- `backend/src/modules/tenders/domains.ts`
- `backend/src/modules/tenders/collector/config.ts` e `config.test.ts`
- `backend/src/modules/tenders/collector/pncpClient.ts` e `pncpClient.test.ts`
- `backend/src/modules/tenders/collector/contractMapping.ts` e `contractMapping.test.ts` (novos)
- `backend/src/modules/tenders/collector/contractRepository.ts` e `contractRepository.db.test.ts` (novos)
- `backend/src/modules/tenders/collector/contractRuns.ts` e testes (novos)
- `backend/src/modules/tenders/collector/repository.ts` (trava nova)
- `backend/src/modules/tenders/collector/cli.ts` e `cli.test.ts`
- `backend/src/modules/tenders/collector/fixtures/` (respostas reais de contratos e termos)
- `backend/src/modules/tenders/collector/dbTestSupport.ts` (dados de teste de contratos)
- `backend/src/services/dailyJobSteps.ts`, `dailyJobs.ts` e testes
- `backend/src/modules/tenders/services/collectionOverview.ts` e teste; `routes/overview.ts`, se a resposta mudar
- `src/tenders/types.ts`, `src/tenders/utils/collectionRuns.ts` e `src/tenders/components/CollectionPanel.tsx`
- `backend/src/modules/tenders/README.md`

**Parte B**
- `backend/drizzle/0086_licitacoes_contratos_favoritos_buscas.sql` (novo)
- `backend/src/modules/tenders/db/schema.ts` e `domains.ts`
- `backend/src/modules/tenders/services/contractSearch.ts`, `contractDetail.ts` e `contractSavedSearches.ts`, com testes de banco (novos)
- `backend/src/modules/tenders/services/domainLists.ts` e `notificationInbox.ts`
- `backend/src/modules/tenders/collector/notifications.ts` (ou `contractNotifications.ts`), `contractRuns.ts`, `contractRepository.ts`, `cli.ts` e testes
- `backend/src/modules/tenders/routes/contracts.ts` e `contractSearches.ts` (novos), `index.ts`, `validators.ts`, `requestReaders.ts` e `routes.db.test.ts`
- `backend/src/modules/tenders/tenders.http`
- `backend/src/services/dailyJobSteps.ts` e `dailyJobs.ts`
- `src/tenders/TendersApp.tsx`, `utils/navigation.ts` e `layout/TendersSidebar.tsx`
- `src/tenders/screens/ContractsScreen.tsx` e `ContractScreen.tsx` (novos); `FavoritesScreen.tsx`, `SavedSearchesScreen.tsx` e `NotificationsScreen.tsx`
- `src/tenders/components/`: novos (`ContractFiltersPanel`, `ContractCard`, `ContractTable`, `ContractDetailView` e selos) e existentes (`SavedSearchFormDialog.tsx`, `SavedSearchCard.tsx`, `NotificationItem.tsx` e `FavoriteButton.tsx`)
- `src/tenders/hooks/` (favorito e mutações das buscas de contratos)
- `src/tenders/services/contractsService.ts` e `contractSearchesService.ts` (novos) e `queryKeys.ts`
- `src/tenders/utils/contractFilters.ts` e teste (novos); `savedSearchForm.ts`, `labels.ts`, `notifications.ts` e testes
- `backend/src/modules/tenders/README.md`

## Estratégia de implementação

**Parte A — dados** (um `/implementar` e um `/finalizar`)
1. Guardar respostas reais do PNCP em `collector/fixtures/`, só lendo: uma página de `/v1/contratos`, uma de `/v1/contratos/atualizacao` e os termos de três contratos (um com prorrogação, um sem termo e, se achar, um com rescisão).
2. Escrever a 0085 e atualizar `schema.ts` e `domains.ts`.
3. Incluir as variáveis novas em `config.ts`, com os padrões.
4. `pncpClient.ts`: consultas de contratos, termos e o cliente da API principal com ritmo próprio. Testes.
5. `contractMapping.ts`: mapeamento, validações, motivos para não gravar, sinal, vencimento atual e resumo dos aditivos. Testes.
6. `contractRepository.ts`: upsert, leitura em lote do gravado, dias da carga, limpeza, tamanho do banco e trava. Testes de banco.
7. `contractRuns.ts`: diária, carga e limpeza, seguindo a sequência de cada página (seção "Regras de negócio"). Testes.
8. `cli.ts` (comandos e `status`) e a rotina diária (etapas, ordem e carga pulada sem limite). Testes.
9. `collectionOverview.ts` e o front de Configurações › Coleta.
10. Aplicar a 0085 **só no banco local**.
11. **Piloto** no banco local:
    - rodar `contracts-backfill --from 2026-09-01 --to 2026-09-30` e `contracts-daily`;
    - medir duração, requisições, registros lidos e gravados, aditivos consultados, 429, bytes por contrato (tabela e índices) e o tempo da busca por texto e por vencimento num `EXPLAIN ANALYZE` (só leitura);
    - testar o ritmo dos termos com 4 s, 1 s e 0,5 s, sem passar disso;
    - listar os valores reais de `tipoTermoContratoNome` e de `categoriaProcesso`, e conferir o link do contrato no PNCP;
    - projetar a carga completa (tempo e GB) e um ano de uso.
12. **Parar e apresentar o relatório ao usuário.**
    - Se a carga passar de 3 semanas ou não couber no espaço do plano, trazer opções antes de seguir.
    - Ajustar o padrão de `PNCP_TERMS_INTERVAL_MS` com o valor medido.
13. README, com a seção de contratos: comandos, variáveis, rotina, medição e regras.
14. Rodar os comandos de validação.
15. `/finalizar`:
    - com a confirmação do usuário, aplicar a 0085 na produção antes do merge;
    - depois do merge, o usuário define `TENDERS_CONTRACTS_MAX_DB_MB` no Cron Job para começar a carga.

**Parte B — área nova** (outro `/implementar` e outro `/finalizar`, depois da carga concluída)
16. Escrever a 0086, aplicar só no banco local, e atualizar `schema.ts` e `domains.ts` (tipos de notificação, ordenações e categorias).
17. `contractSearch.ts`, com os testes de cada filtro e a paridade com a busca salva.
18. `contractDetail.ts`: detalhe, edital de origem e favoritos.
19. `contractSavedSearches.ts`.
20. Rotas, validações e `tenders.http`, com os testes de rota.
21. Avisos: etapa `tenders-contract-reminders`, `CONTRATO_ALTERADO` na gravação e a limpeza que mantém os favoritos. Testes.
22. Front: rotas e menu, `ContractsScreen`, detalhe, filtros, abas de Favoritos e de Buscas salvas, notificações, serviços, query keys e tipos. Testes.
23. README.
24. Validações e teste manual (seção "Testes necessários").
25. `/finalizar`: com a confirmação do usuário, aplicar a 0086 na produção antes do merge.

## Regras de negócio identificadas

**Entrada na base**
- Só entra `tipoContrato.id = 1` ("Contrato (termo inicial)").
- A vigência original tem de ter pelo menos 180 dias (`vigencia_fim_original - vigencia_inicio >= 180`).
- O vencimento atual tem de ser de hoje em diante (dia de Brasília).
  - O contrato vencido e ainda não gravado não entra.
  - O vencido já gravado é atualizado, e a limpeza o tira.
- **Registro inválido:** conta como erro na execução, com o número de controle, e não derruba a página. Casos:
  - sem número de controle;
  - CNPJ sem 14 dígitos;
  - data fora do formato ou antes de 1990;
  - fim antes do início.
- **Dado que falta na origem** (decisão do piloto): fica de fora, contado nos detalhes da execução, sem erro:
  - sem data de fim (`skippedWithoutEndDate`);
  - fim mais de 35 anos depois do início (`skippedImplausibleTerm`).
- Valor 0 ou negativo vira nulo, como nos editais.
- **Fornecedor:**
  - pessoa física: o CPF é gravado e mostrado só mascarado (`***.456.789-**`);
  - pessoa jurídica: CNPJ com 14 dígitos.

**Vencimento atual (aditivos)**
- **Sinal de alteração:** a data de atualização global fica mais de 24 h depois da publicação.
- **Quando consultar os termos:** com o sinal, se o contrato não está gravado ou se a data de atualização global mudou desde a última conferência (`aditivos_referencia`).
- **Regra:** entre os termos que mudam a vigência (`qualificacaoVigencia` ou rescisão), vale o mais recente, pela data de assinatura e depois pelo sequencial:
  - aditivo: vale a `dataVigenciaFim` do termo;
  - rescisão: vale a `dataVigenciaFim` do termo ou, sem ela, a data de assinatura. Conferir no piloto como a rescisão chega.
- Apostilamento e termo sem mudança de vigência não contam.
- Termo que muda a vigência sem a data nova: mantém a anterior. Data vazia é contada à parte (`termsWithoutEndDate`), e data fora do formato conta erro (decisão do piloto).
- Sem um termo assim, vale o fim original.
- Sem o sinal, os termos não são consultados (`aditivos` = NULL).

**Sequência de cada página** (diária e carga):
1. mapear e validar;
2. tirar os que não são termo inicial e os curtos;
3. ler o que já está gravado;
4. consultar os termos de quem precisa;
5. calcular o vencimento;
6. tirar os vencidos que não estão gravados;
7. gravar;
8. (Parte B) avisar `CONTRATO_ALTERADO` dos que mudaram de vencimento.

**Coleta**
- **Diária:** publicação e atualização de ontem a hoje.
  - Desde 2026-10-14 (plano `.plans/licitacoes-contratos-coleta-sem-perda.md`): cada consulta começa no último dia que leu sem falha do PNCP, com até 7 dias por execução, e a coleta reconsulta os termos que falharam antes (até 200 por dia).
- **Carga:**
  - um dia de publicação por vez, do mais recente (ontem, na primeira execução) para o mais antigo (`2021-01-01`);
  - o dia só é marcado ao terminar, e um dia com falha do PNCP fica pendente para a próxima execução;
  - antes de cada dia, confere o tempo do bloco (8 h) e o tamanho do banco. Se passou de um deles, para e registra o motivo.
- A trava é própria: a carga manual e a rotina não rodam juntas para contratos.

**Limpeza**
- Todo dia, apaga os contratos com vencimento antes de hoje, menos os favoritados (Parte B).
- As notificações de um contrato apagado saem junto.
- Se um aditivo for publicado depois, a coleta diária traz o contrato de volta.

**Busca (Parte B)**
- Mostra só os vigentes. Com "Só favoritos", aparecem também os favoritos vencidos.
- Palavras como nos editais, no objeto e na informação complementar: `q` até 500 caracteres, aspas, `-palavra`, E/OU, singular e plural.
- Número: grupos de dígitos em número do contrato + ano, processo + ano, controle PNCP do contrato e controle da compra (regra da migration 0079).
- Ordem padrão: o vencimento mais próximo. A relevância só vale com palavras.
- 20, 50 ou 100 por página.

**Favoritos:** de cada pessoa na conta e idempotentes. Ninguém vê os de outra pessoa.

**Buscas salvas**
- Até 50 por pessoa e conta, contadas à parte das de editais.
- Os mesmos critérios da tela, menos número, ano e "Só favoritos". O "Salvar esta busca" avisa disso, como nos editais.
- Com os botões Ativa e Notificar.

**Avisos (Parte B)**
- Só para contas com acesso (`fn_conta_com_acesso`), sem repetir: o índice único usa como referência o vencimento.
- **Buscas salvas com Notificar:**
  - `CONTRATO_VENCE_90D`, para vencimento entre hoje + 84 e hoje + 90 dias;
  - `CONTRATO_VENCE_30D`, para vencimento entre hoje + 24 e hoje + 30;
  - título "Contrato vence em até 90 (ou 30) dias: <busca>".
- **Favoritos:**
  - `CONTRATO_VENCE_90D`, para vencimento entre hoje + 31 e hoje + 90;
  - `CONTRATO_VENCE_30D`, para vencimento entre hoje e hoje + 30;
  - um só aviso por janela;
  - título "Contrato favorito vence em até 90 (ou 30) dias".
- **`CONTRATO_ALTERADO`:** para quem favoritou, quando o vencimento muda. Título "Vencimento de contrato favorito mudou para dd/mm/aaaa".
- Um vencimento novo gera os avisos de 90 e 30 dias de novo.
- Mensagem: o objeto, até 200 caracteres. Link: `/contratos/<id>`.

**Links**
- Contrato no PNCP: `https://pncp.gov.br/app/contratos/{cnpj}/{ano}/{sequencial}` (conferir no piloto).
- Compra de origem: o edital da base com o mesmo número de controle (`/editais/<id>`). Se não houver, `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}`, montado a partir do número de controle da compra.

## Regras multi-tenant e segurança

- `licitacoes.contrato` e `contrato_carga_dia` são globais (dado público do PNCP), como `edital`, e não têm conta.
- `favorito_contrato`, `busca_salva_contrato` e as notificações são sempre filtrados pela conta da requisição e pela pessoa da sessão. A conta é resolvida pela trava `tenderAccess`, nunca pelo `accountId` do client sem validação.
- Busca salva ou favorito de outra pessoa ou de outra conta dá 404, com mensagem genérica.
- Avisos: só para contas com acesso. Os destinatários saem da mesma conta (todas as junções usam `conta_id`).
- Rotas novas atrás de `authenticate` e da trava do módulo (404, 403 e 402, como hoje).
- O coletor usa o usuário restrito `licitacoes_coletor`, com GRANTs só no necessário.
- O schema `licitacoes` não usa RLS. O isolamento fica nas consultas, como no resto do módulo.
- LGPD: o CPF de fornecedor pessoa física fica só mascarado, no banco e na tela. O filtro de fornecedor aceita só CNPJ.
- Os logs do coletor não têm dados pessoais além do que o PNCP publica (número de controle e motivo).

## Validações necessárias

- **Busca (`GET /contracts`):**
  - `q` com até 500 caracteres e `termsMode` E ou OU;
  - repetíveis: `state` (2 letras, UF válida), `municipalityCode` (7 dígitos), `agencyCnpj` e `supplierCnpj` (14 dígitos) e `category` (id da lista);
  - `minValue` e `maxValue` decimais, com o mínimo menor ou igual ao máximo; `includeWithoutValue` só com faixa de valor;
  - `publishedFrom/To` e `expiryFrom/To` em AAAA-MM-DD, com o início antes do fim;
  - `number` com até 60 caracteres e ao menos um dígito; `contractYear` de 2000 a 2100;
  - `favoritesOnly`; `sort` da lista (`relevance` só com `q`);
  - `page` a partir de 1; `perPage` 20, 50 ou 100.
- **Buscas salvas:** nome obrigatório, com até 120 caracteres; os mesmos critérios; limite de 50; o `PATCH` só aceita `active` e `notify`.
- **Favorito:** `id` inteiro positivo; contrato inexistente dá 404.
- **CLI:** datas em AAAA-MM-DD, `--from` antes de `--to`, e `--max-minutes` e `--max-db-mb` inteiros positivos.
- **Config:** zod, com faixas: página de 10 a 500, intervalo de 0 a 60.000 ms e minutos de 1 a 600.
- **Front:** valores inválidos da URL ficam de fora, como em `searchFilters.ts`.

## Testes necessários

### Frontend

- `contractFilters`: URL ↔ estado ↔ query da API, chips, atalhos de vencimento (30, 90, 180 e 365) e valores inválidos ignorados.
- Formulário da busca salva de contratos: estado da tela → formulário e os campos que ficam de fora.
- Menu com "Contratos a vencer" e rota do detalhe (`navigation`).
- Rótulos e links dos tipos novos de notificação e de execução (`notifications` e `collectionRuns`).

### Backend

**Parte A**
- **Mapeamento:** registro real (fixture), validações, termo inicial e 180 dias (179 fica fora, 180 entra), CPF mascarado, valor 0 e negativo, hash estável e sinal (24 h).
- **Vencimento pelos termos:** prorrogação, rescisão, apostilamento ignorado, mesma data, o mais recente vale e data inválida mantém a anterior.
- **Cliente:** URLs de contratos (500 por página), atualização, termos (lista, 204 e 404) e ritmo separado.
- **Gravação** (banco local):
  - upsert sem regravar a linha igual;
  - termos não reconsultados com a mesma data global, e reconsultados quando ela muda;
  - vencido não gravado não entra, e vencido gravado é atualizado.
- **Carga:**
  - marca o dia só ao concluir e retoma o pendente;
  - vai do mais recente ao mais antigo;
  - para no tempo e no espaço, com o motivo;
  - não roda sem `TENDERS_CONTRACTS_MAX_DB_MB`.
- **Limpeza** dos vencidos, e **trava própria** (a segunda execução sai sem coletar).
- **Rotina diária:** ordem das etapas, com a carga por último.

**Parte B**
- **Busca:**
  - cada filtro: E/OU, exclusão, número nos 4 campos, ano, fornecedor, categoria, valor com e sem "incluir sem valor", e vencimento de/até;
  - ordenações e paginação;
  - só vigentes, e "Só favoritos" com os vencidos;
  - paridade entre a busca da tela e a busca salva.
- **Buscas salvas:** validações, limite de 50 separado do de editais, prévia, duplicar e isolamento entre contas e pessoas.
- **Detalhe e favoritos:** edital de origem presente e ausente, idempotência e 404.
- **Avisos:**
  - faixas de 90 e 30 dias nas buscas salvas;
  - favoritos sem aviso duplicado no mesmo dia;
  - só para contas com acesso, sem repetir;
  - vencimento novo gera aviso novo;
  - `CONTRATO_ALTERADO` só quando o vencimento muda, e só para quem favoritou;
  - a limpeza mantém o favorito vencido.
- **Rotas por HTTP:** travas 404, 403 e 402 e validação 400 nas rotas novas.

### E2E

- O projeto não tem testes E2E automatizados. Teste manual no local:
  - **Parte A:** o piloto (relatório da etapa 11) e Configurações › Coleta com o andamento da carga;
  - **Parte B**, com os dados do piloto, no desktop e no celular:
    - buscar e filtrar, com chips e URL;
    - abrir o detalhe, no painel e na rota;
    - favoritar e salvar busca;
    - conferir as abas de Favoritos e de Buscas salvas;
    - conferir os avisos gerados pelo comando `contract-reminders`.

## Comandos de validação sugeridos

```bash
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0085 --banco local   # Parte A
npm --prefix backend run migrations:aplicar -- 0086 --banco local   # Parte B

# Piloto (Parte A), com TENDERS_COLLECTOR_DATABASE_URL do banco local, como no README do módulo
npm --prefix backend run tenders:dev -- contracts-backfill --from 2026-09-01 --to 2026-09-30 --max-db-mb 2000
npm --prefix backend run tenders:dev -- contracts-daily
npm --prefix backend run tenders:dev -- status

npx tsc --noEmit -p .
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
```

## Riscos e pontos de atenção

- **Espaço no Render** (o maior risco): ~0,7 GB no começo e ~1 GB em um ano. Há a trava antes da 0085 na produção e o limite na carga (ver "Custos").
- **Tempo da carga:** medido no piloto, de 68 a 78 h, com os termos a 0,5 s. Em blocos de 8 h, leva ~10 dias (com blocos de 3 h, passaria de 3 semanas).
- **Ritmo do PNCP:** dá 429 com intervalos curtos. A trava impede duas coletas de contratos ao mesmo tempo, e o ritmo dos termos fica no valor medido.
- **Aditivo não publicado ou sinal que falha:** 1 dos 25 contratos sem sinal tinha termo, sem mudar o prazo. Nesses casos, o vencimento fica errado, sem como saber.
- **Apagar ao vencer:** uma prorrogação publicada com atraso faz o contrato sumir e voltar com outro `id`, e as notificações dele somem junto.
- **Avisos em massa** numa busca ampla: a faixa de 7 dias limita a quantidade.
- **Dados ruins na origem:** as datas são validadas, e o registro inválido é contado na execução.
- **Desempenho:** a busca roda sobre ~15 vezes mais linhas que a de editais. O piloto mede com `EXPLAIN ANALYZE`. Com 256 MB de memória no banco, ela pode ficar mais lenta (ver "Custos").
- **Telas compartilhadas com editais** (Favoritos, Buscas salvas, Notificações e Configurações › Coleta): testes dos dois lados. As consultas de editais não mudam.
- **CHECKs alterados** em `notificacao` e `coleta_execucao`: conferir o nome das constraints no banco local e aplicar fora das 06:00.
- **Índices de expressão:** a consulta tem de usar a mesma expressão do índice.
- **Rotina mais longa:** cerca de 4 h durante a carga. O limite do Render é de 12 h.
- **Produção:** as migrations 0085 e 0086, os merges e a variável `TENDERS_CONTRACTS_MAX_DB_MB` só com a confirmação e a ação do usuário.

## Perguntas em aberto

- Qual é o plano do Postgres no Render: tipo de instância e espaço total e usado?
  - É necessário antes da 0085 na produção e para definir `TENDERS_CONTRACTS_MAX_DB_MB`.
  - Não impede o piloto.
- **Respondido em 13/10/2026:**
  - o aumento automático de espaço fica **desligado** (decisão do usuário);
  - o Cron Job `rotinas-diarias-planos-licitações` é `0.5c-512mb` (Starter), e a rotina leva hoje de 52 a 55 min por dia.

## Critérios de aceite do plano

**Parte A**
- Piloto feito no banco local, com o relatório (tempo, requisições, aditivos, ritmo, bytes por contrato e tempo da busca) e a projeção aprovada pelo usuário.
- Só entram termos iniciais com 180 dias ou mais e vencimento de hoje em diante, com o vencimento atual pelos aditivos, conforme a regra.
- Os termos não são reconsultados enquanto a data de atualização global não muda.
- Carga retomável, do dia mais recente ao mais antigo, em blocos de até 8 h, com parada por tempo e por espaço e com o andamento em Configurações › Coleta.
- Coleta e limpeza diárias na rotina, na ordem definida. A carga não roda sem `TENDERS_CONTRACTS_MAX_DB_MB`.
- Editais sem mudança de comportamento.
- 0085 aplicada no banco local; na produção, só com confirmação e antes do merge.
- Testes e checks de front e backend passando.

**Parte B**
- "Contratos a vencer" com todos os filtros, chips, URL compartilhável, ordenações, paginação, cards ou tabela e detalhe (no painel e na rota).
- Favoritos e buscas salvas de contratos por pessoa, isolados por conta, com as abas em Favoritos e em Buscas salvas.
- Avisos de 90 e 30 dias e de vencimento alterado conforme as regras, sem repetir e só para contas com acesso.
- A limpeza mantém os favoritos.
- 0086 aplicada no banco local; na produção, só com confirmação e antes do merge.
- README atualizado, e testes e checks passando.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Implementar só a Parte A no primeiro `/implementar`** e parar na etapa 12, para o relatório do piloto. A Parte B é outro `/implementar`, depois da carga concluída na produção.
- Não executar migrations sem confirmação explícita. Durante a implementação, só no banco local (`--banco local`). A produção fica para o `/finalizar`, com a confirmação do usuário e antes do merge.
- Não alterar `.env` nem variáveis do Render. Definir `TENDERS_CONTRACTS_MAX_DB_MB` na produção é ação do usuário.
- O piloto só lê do PNCP e grava no banco local. Não rodar a carga apontando para a produção.
- Seguir o AGENT.md:
  - Drizzle nas queries;
  - SQL só onde o módulo já usa (funções do banco, notificações e índices de expressão), sempre parametrizado;
  - nomes em inglês no código e textos em português na tela.
- Reaproveitar o que já existe antes de criar algo novo: `withCollectionRun`, `RunTally`, `stableStringify`, `fn_tsquery_termos`, `fn_grupos_digitos` e os componentes de filtros, chips, paginação e favoritos.
- Não mexer nas regras e consultas de editais.
- Manter as expressões da consulta idênticas às dos índices de número.
- Deixar `.portal/` e `GLOSSARIO.md` fora dos commits.
