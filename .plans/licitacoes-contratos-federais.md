# Plano de Implementação: contratos federais do Compras.gov.br (Licitações, Parte 5)

## Origem

- Arquivo de especificação: não houve `.md` novo. A origem é a Parte 5 de `.plans/licitacoes-contratos-no-r2.md` (que este plano detalha e substitui) e a da `.plans/licitacoes-base-nacional.md` (já substituída), o estudo `.plans/estudo-fontes-contratos.md` (seção 4.3) e a sondagem de 26/10/2026, registrada abaixo.
- Data do planejamento: `2026-10-26`
- Classificação: `frontend + backend + database` (com mudança pequena na rotina diária do Render)

## Resumo

Ler no Compras.gov.br (dados abertos, sem chave) os contratos dos órgãos federais e gravá-los no mesmo armazém do R2 (conjunto `contratos` e, a partir dele, `fornecedor` e `vigentes`), **só os que o PNCP não tem**. Eles entram em tudo o que já existe (Contratos a vencer, busca, favoritos, buscas salvas, avisos de vencimento e página do CNPJ), sem tela nova. Vale pela lei antiga (8.666), pelo que o PNCP nunca recebeu e pelo histórico de empenhos de 2021 a 2025: na UFMG, 22% dos contratos vigentes não estão no PNCP.

## Decisões do usuário (26/10/2026)

1. **Empenhos:** incluir todos os tipos (82% das linhas). O armazém já guarda todos os tipos, o PNCP já traz empenhos federais de 2026, e o histórico de empenhos completa a página do CNPJ.
2. **Padrões aprovados junto com o plano** (podem ser mudados antes de implementar): encerrados desde 2021 (igual ao PNCP) e vigentes de qualquer ano (pelo fim da vigência); sem link do documento original (o sistema federal não dá endereço público); etapa nasce desligada por variável; migration 0087d só com o "sim" dele.

## Achados da sondagem (26/10/2026, só leitura; os scripts ficaram na pasta temporária da sessão e o `federal-probe` do passo 4 os substitui)

**A API** (`https://dadosabertos.compras.gov.br`, pública, sem chave):
- `modulo-contratos/1_consultarContratos` (por início da vigência) e `1.2_consultarContratos_FimVigencia` (por fim da vigência): exigem `codigoOrgao` e uma janela de datas de **no máximo 365 dias** ("Período inicial e final maior que 365 dias" com 367 dias; 2024-01-01 a 2024-12-31 passa). `tamanhoPagina` de **10 a 500**. Filtros opcionais: `codigoTipo`, `niFornecedor`, unidade, número. O endpoint "por Id" só aceita `idCompra` ou `numeroControlePncpContrato`.
- Órgãos: `modulo-uasg/2_consultarOrgao?statusOrgao=true` (12.096 ativos, 25 páginas fixas de 500; **1.159 federais** pela `esfera = F`, 1.104 deles no SISG; 15 sem CNPJ de 14 dígitos). Unidades: `modulo-uasg/1_consultarUasg` (22.175 ativas, 45 páginas), com UF, código IBGE, município e CNPJ.
- Resposta do contrato (sem id próprio): `codigoOrgao`, `nomeOrgao`, `codigoUnidadeGestora`, `nomeUnidadeGestora`, `numeroContrato`, `codigoTipo`/`nomeTipo`, `codigoCategoria`/`nomeCategoria`, `niFornecedor`, `nomeRazaoSocialFornecedor`, `processo`, `objeto`, `informacoesComplementares`, `dataVigenciaInicial`, `dataVigenciaFinal`, `valorGlobal`, `valorAcumulado`, `dataHoraInclusao`, `numeroControlePncpContrato`, `numeroControlePncpCompra`, `contratoExcluido`, `dataHoraExclusao`.

**Chave:** a combinação **unidade gestora + tipo + número** é única, com cerca de 0,4% de colisão (4 em 1.012 contratos da UFMG: o mesmo contrato registrado duas vezes com datas de fim diferentes e horas de inclusão diferentes; vale a última inclusão). O número vem como `00586/2023` (contrato) ou `2023NE000033` (empenho), até 12 caracteres; **no PNCP, o número do contrato vem sem o ano** (`05`, `00026`), e o do empenho vem igual (`2026NE000096`). A chave "órgão + número + tipo" **não** é única (618 de 1.122): a unidade precisa entrar.

**Paginação intermitente:** a primeira leitura da UFMG 2024 com páginas de 500 trouxe 1.122 linhas com só 857 distintas; as leituras de 437 e 389 vieram completas. Repetida sozinha, depois, todos os tamanhos (100 a 500) fecharam completos (1.122 e 4.112 linhas). Conferir sempre: linhas completas distintas = `totalRegistros`.

**Tipos** (`codigoTipo`): 50 Contrato, 99 Empenho, 98 Outros, 95 Termo de compromisso, 94 Carta contrato, 57 Convênio, 96 Acordo de cooperação técnica, 54 Concessão, 56 Termo de adesão, 52 Comodato, 51 Credenciamento. `codigoCategoria` é código de grupo (60, 48, 999); o **nome** da categoria bate com os do PNCP (Compras, Serviços, Serviços de Engenharia, Obras, Mão de Obra, Informática (TIC), Internacional, Cessão, Locação Imóveis, Serviços de Saúde). Fornecedor: 14 dígitos (CNPJ), 11 (CPF) ou outro formato (cerca de 0,8%).

**CNPJ do órgão:** nos 7 órgãos testados (175 contratos presentes nas duas fontes), o CNPJ do PNCP é o do **órgão** do Compras (não o da unidade). Na UFMG o cadastro traz `17217985005840` (filial) e o PNCP usa `17217985000104` (matriz: raiz + 0001 + dígitos). Não foi testado um órgão cujo cadastro e PNCP usem filiais diferentes da matriz (ex.: regionais do DNIT).

**Atualidade: o módulo parou por volta de 03/09/2026.** Em 158 órgãos (1 em cada 7): 1.925 registros com vigência iniciada em 23/05–13/07, 1.432 em 14/07–03/09 e **8** em 04/09–26/10. A UFMG não tem inclusão depois de 03/09. Os resultados (vencedores) estão parados desde 29/09.

**Volume** (a mesma amostra, vigência iniciada em 2025, ×7): cerca de **131 mil registros por ano**: 107 mil empenhos (82%), 20 mil contratos (16%), 4 mil de outros tipos. Só 24% dos órgãos (38 de 158) têm algum registro; os 5 maiores da amostra somam 49%. Em 2021–2026, cerca de 750 mil linhas. Estaduais e municipais: praticamente vazios (2 de 67 órgãos estaduais e 3 de 206 municipais com algo, 45 e 112 registros).

**Cobertura do PNCP (UFMG, tipo Contrato, por ano de início da vigência):** 2019 0% (59), 2020 0% (92), 2021 0% (130), 2022 6% (229), 2023 52% (180), 2024 91% (163), 2025 97% (114), 2026 96% (45). Dos 316 vigentes, **71 (22%) não estão no PNCP**. Os 952 empenhos de 2024 da UFMG também não estão. O armazém local (publicações de 15/07 a 31/08/2026) tem 38.741 contratos federais, quase todos de 2026, com empenhos do PNCP; 45.379 contratos vigentes vencem no mesmo dia, 31/12/2026.

**Vencimento:** a `dataVigenciaFinal` do Compras acompanha os aditivos só em parte. Em 12 contratos presentes nas duas fontes, 8 batem com o fim original do PNCP; dos 5 com aditivo de prazo no PNCP, só 1 bate com o último termo (2 ficaram no primeiro aditivo, 1 no original e 1 não acompanhou uma redução).

**Termos de uso:** os Termos e a Privacidade (`src/screens/public/legalContent.ts`, linhas 18, 43 e 100) citam só o PNCP. Os vencedores e os federais vêm do Compras.gov.br (licença Creative Commons Atribuição): é preciso creditar a fonte.

## Escopo

### Dentro do escopo

- Cliente do Compras.gov.br para órgãos, unidades e contratos (por início e por fim da vigência), com conferência de completude e releitura em outro tamanho de página.
- Mapeamento do contrato federal para o contrato do armazém, com a chave `comprasgov-<unidade>-<tipo>-<número>` e as regras de CNPJ, tipo, categoria, UF e CPF abaixo.
- Entrada só das linhas **sem** número de controle do PNCP, fora as excluídas na origem e as incluídas há menos de 45 dias; tratamento das colisões da chave.
- Carga por órgão e ano (de 2021 até hoje) e ciclo de 7 dias dos vigentes (pelo fim da vigência) e dos iniciados nos últimos 120 dias, só nos órgãos com dado.
- Tabela do andamento por órgão (migration 0087d) e dois tipos de execução novos.
- Etapas na rotina diária, desligadas por variável; a carga de contratos passa a respeitar o prazo da rotina.
- Comandos `federal-probe`, `federal-load` e `federal-cycle`.
- Arquivo bruto no R2 (`comprasgov/contratos`), com o CPF mascarado.
- Chave nova no backend e no front; link do documento original nulo nos federais; `origin` no detalhe; aviso do vencimento.
- Card "Contratos federais" em Configurações › Coleta.
- Crédito ao Compras.gov.br nos Termos e na Privacidade (redação aprovada por ele).
- Testes, README e conferência local com a UFMG.

### Fora do escopo

- Estaduais e municipais (o módulo é praticamente vazio para eles) e outras fontes (tribunais, Portal da Transparência).
- Aditivos e itens dos contratos federais (a API de contratos não traz termos).
- Remover do armazém um contrato excluído depois de gravado (o gravador não apaga; fica contado no painel).
- Selo ou filtro de origem nas telas; mudar o padrão de "Contratos a vencer" (por exemplo, esconder empenhos).
- Ligar a variável em produção e aplicar a migration na produção (decisões dele, depois do piloto).
- Os vencedores (Parte 3) e qualquer mudança neles, além do crédito nos Termos.

## Leitura de contexto

- `/AGENT.md` (raiz) e `/CLAUDE.md`. **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md`: o da raiz cobre o repositório todo.
- Memória do projeto (como trabalhar, plano do R2, base nacional, estudo de fontes, sondagem federal) e os planos `.plans/licitacoes-contratos-no-r2.md`, `.plans/licitacoes-base-nacional.md`, `.plans/estudo-fontes-contratos.md`, `.plans/licitacoes-vencedores.md` e `.plans/licitacoes-pagina-cnpj.md`.
- Código lido: `collector/comprasGovClient.ts`, `resultRuns.ts`, `resultMapping.ts`, `resultProgress.ts`, `contractRuns.ts`, `contractMapping.ts`, `contractProgress.ts`, `config.ts`, `runtime.ts`, `archive.ts`, `contractStore/layout.ts`, `writer.ts`, `service.ts`, `domains.ts`, `db/schema.ts`, migrations `0087c` e `0088`, `src/services/dailyJobs.ts` e `dailyJobSteps.ts`, `services/collectionOverview.ts`, `contractDetail.ts`, `contractSearch.ts`, `routes/handler.ts`; front: `contractKey.ts`, `ContractDetailView.tsx`, `ContractCard.tsx`, `types.ts`, `labels.ts`.

## Impacto por área

### Frontend

- `utils/contractKey.ts`: a chave passa a aceitar `comprasgov-<unidade>-<tipo>-<número>` (o mesmo padrão do backend), com teste.
- `types.ts`: `ContractListItem.pncpLink` e `ContractDetail.pncpLink` viram `string | null`; `ContractDetail` ganha `origin: 'NATIONAL' | 'FEDERAL'` (os valores não levam a marca da fonte: `screenTexts.test.ts` varre o código das telas); `CollectionStatus` ganha o bloco `federal`; os dois tipos de execução entram na união.
- `ContractDetailView.tsx`: sem o botão "Ver documento original" quando o link é nulo; no federal, "Número do contrato" no lugar de "Número de controle", e o aviso "O vencimento vem do sistema de contratos do governo federal e pode não incluir aditivos recentes". A regra do aviso e do link fica em função de `utils/` (testável), já que o repositório testa só utilitários.
- `utils/labels.ts`: rótulos dos dois tipos de execução. Painel da Coleta: card "Contratos federais" (órgãos com dado e já carregados, última carga, último ciclo, "dados da fonte até dd/mm", linhas puladas por motivo).
- `src/screens/public/legalContent.ts`: crédito ao Compras.gov.br nos Termos e na Privacidade (texto aprovado por ele antes de entrar).
- `screenTexts.test.ts` continua conferindo que nenhum texto de tela cita o PNCP.
- Estados de carregando, vazio e erro: sem tela nova, valem os existentes.

### Backend

- `collector/comprasGovClient.ts`: o cliente deixa de ser só dos resultados: endpoint e parâmetros por consulta (contratos por início e por fim da vigência, órgãos e unidades), o erro `ComprasGovRequestError` com o endpoint certo e a mesma conferência de tamanho de página (`RESULTS_RETRY_PAGE_SIZES` vira constante comum). O comportamento dos resultados não muda (os testes atuais continuam passando).
- `collector/federalMapping.ts` (novo): validação com zod, `mapFederalContract`, chave, CNPJ do órgão, tipo, categoria, tipo de pessoa e CPF mascarado, vencimento, `contractYear`, hash dos campos guardados.
- `collector/federalProgress.ts` (novo): acesso à tabela dos órgãos (sincronizar a lista, escolher os próximos da carga e do ciclo, marcar o andamento só depois de publicar).
- `collector/federalRuns.ts` (novo): `runFederalLoad` e `runFederalCycle`, com a trava dos contratos, o gravador do armazém (`RunContractStore`, movido para `collector/runContractStore.ts` e usado também por `contractRuns.ts`), o arquivo bruto e o prazo da rotina.
- `contractStore/writer.ts`: `upsert` passa a devolver também as chaves novas e alteradas (para arquivar só o que mudou) e, se o piloto pedir, uma busca de gêmeos no armazém (`findPncpTwins`).
- `contractStore/layout.ts`: `CONTRACT_KEY_PATTERN` novo, estrito (sem aspas), e `isFederalContractKey`.
- `services/contractSearch.ts` e `contractDetail.ts`: `pncpLink` nulo no federal, `origin` no detalhe; `originPncpLink` continua valendo quando há número da compra no PNCP.
- `collector/config.ts`: `TENDERS_FEDERAL_ENABLED`, `TENDERS_FEDERAL_FROM`, `TENDERS_FEDERAL_MINUTES`. `domains.ts`: os tipos `FEDERAIS_CARGA` e `FEDERAIS_CICLO`.
- `collector/cli.ts`: `federal-probe` (sem banco e sem R2), `federal-load` e `federal-cycle` (funcionam sempre, como os de vencedores).
- `src/services/dailyJobSteps.ts` e `dailyJobs.ts`: etapas novas e o prazo na carga de contratos.
- `services/collectionOverview.ts`: bloco `federal` em `GET /collection/status` e a agenda. Sem rota nova.
- `collector/archive.ts`: conjunto `federalContracts` (`comprasgov/contratos`).

### Banco de dados

**Migration `0087d_licitacoes_contratos_federais.sql`** (com letra, como a 0087a, b e c, para entrar antes da 0088, que espera a exportação dos editais: a ferramenta aplica em ordem):
- recria o CHECK de `coleta_execucao.tipo` com `FEDERAIS_CARGA` e `FEDERAIS_CICLO` (14 caracteres, cabem em `varchar(20)`);
- cria `licitacoes.federal_orgao` (global, dado público, sem conta e sem RLS, como `contrato_carga_dia` e `resultado_carga_dia`): `codigo_orgao` (PK), `nome`, `cnpj_cadastro`, `cnpj_pncp` (aprendido dos números de controle), `com_dados` (nulo = não medido), `carga_ano_mais_antigo`, `vigentes_lidos_em`, `recentes_lidos_em`, `maior_fim_visto`, `medido_em`, `registros`, `atualizado_em`; cerca de 1.159 linhas;
- concede ao `licitacoes_coletor`, se existir (como na 0087c). Só acrescenta: o código atual continua funcionando. Cabeçalho com ordem de aplicação e reversão, no molde da 0087c.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.** Local primeiro, com o "sim" dele; na produção, depois, também com o "sim" (e `--confirmo`), **antes** do deploy do código que a usa e fora das 06:00 de Brasília.

### Infra/Deploy

- Variáveis só no **Cron Job** (ele coloca; nunca pedir nem imprimir valores): `TENDERS_FEDERAL_ENABLED` (`0` ou `1`, padrão `0`), `TENDERS_FEDERAL_FROM` (padrão `2021-01-01`), `TENDERS_FEDERAL_MINUTES` (1 a 600, padrão 60). `COMPRASGOV_REQUEST_INTERVAL_MS` (1500) já existe e vale para os contratos.
- Rotina das 06:00: a ordem passa a ser `... contratos (carga), federais (ciclo), federais (carga), vencedores (carga)`. Os dois últimos usam só o tempo que sobrar das 11,5 h; hoje a carga de contratos não olha o prazo (blocos de 8 h): passa a olhar.
- **Custo (US$, Cron Job a 1c-2g, US$ 0,00058 por minuto):** carga única de cerca de 10 mil pedidos (~6 h) ≈ US$ 0,2; ciclos de cerca de 1 h por semana ≈ US$ 0,15 por mês. R2 em centavos (~0,3 GB de contratos, mais o bruto). Sem mudar de plano.
- Web Service: passa a baixar uns 0,5 GB a mais de arquivos no disco temporário (cabia pela medição de 19/10; o piloto confirma).
- Ordem: aplicar a 0087d na produção, merge e deploy com a variável desligada, piloto aprovado, e só então ligar.

## Arquivos provavelmente afetados

- `backend/src/modules/tenders/collector/`: `comprasGovClient.ts`, `federalMapping.ts` (novo), `federalProgress.ts` (novo), `federalRuns.ts` (novo), `runContractStore.ts` (novo, extraído de `contractRuns.ts`), `contractRuns.ts`, `resultRuns.ts` (helper do bloco com prazo, compartilhado), `config.ts`, `archive.ts`, `cli.ts`, `fixtures/comprasgov-contratos.json` (novo) e os testes.
- `backend/src/modules/tenders/`: `contractStore/layout.ts`, `contractStore/writer.ts`, `domains.ts`, `db/schema.ts`, `services/contractSearch.ts`, `services/contractDetail.ts`, `services/collectionOverview.ts`, `README.md`.
- `backend/drizzle/0087d_licitacoes_contratos_federais.sql` (novo).
- `backend/src/services/dailyJobSteps.ts` e `dailyJobs.ts` e os testes.
- `src/tenders/`: `utils/contractKey.ts`, `types.ts`, `components/ContractDetailView.tsx`, o painel da Coleta, `utils/labels.ts`, um util novo da origem do contrato e os testes.
- `src/screens/public/legalContent.ts`.
- `.plans/licitacoes-contratos-federais.md` (a "Situação" ao final).

## Estratégia de implementação

1. **Branch** `feat/R/licitacoes-federais`, a partir da `main`. O `CLAUDE.md` alterado e a pasta `.portal/` não entram nos commits.
2. **Cliente** (`comprasGovClient.ts`): generalizar endpoint, parâmetros e erro; órgãos e unidades paginados (lista completa, conferindo as chaves distintas contra o total); janelas de até 365 dias; tamanho de página de 500 com releitura em 499, 437 e 389 (no máximo 4 leituras). Testes com `fetch` simulado, inclusive a paginação que falha.
3. **Mapeamento e fixtures:** guardar 30 a 40 linhas reais em `fixtures/comprasgov-contratos.json` (contrato, empenho, convênio, ACT, CPF, sem fim, fim anterior ao início, excluído, colisão, com número do PNCP, unidade sem cadastro) e escrever `federalMapping.ts` com os testes.
4. **Piloto sem gravar** (`federal-probe`): lê órgãos escolhidos (a UFMG, 26238, e uns 8 de portes diferentes) e imprime, por órgão e ano: linhas lidas, completude e releituras, colisões, excluídas, parcela com número do PNCP por tipo, CNPJ resolvido contra o dos números de controle e tipos desconhecidos. Registrar os números neste plano e ajustar os limites (carência, tamanho de página, intervalo).
5. **Chave e armazém:** novo padrão em `layout.ts` e `contractKey.ts` (mesmos casos de teste nos dois), `pncpLink` nulo, `origin`, `upsert` devolvendo as chaves alteradas, extração do `RunContractStore`.
6. **Migration 0087d e `federalProgress.ts`:** escrever o `.sql`, **pedir o "sim"** e aplicar no banco local (`migrations:status -- --banco local` antes e depois); esquema Drizzle; testes de banco.
7. **Execuções** (`federalRuns.ts`):
   - sincronizar órgãos federais (os 1.159) e carregar a lista de unidades (22 mil, na memória da execução);
   - **carga:** por órgão, do ano atual para trás até `TENDERS_FEDERAL_FROM`, uma janela por ano, e cada janela só vale se vier completa; em cada janela, primeiro aprender o `cnpj_pncp` pelos números de controle e depois mapear; publicar a cada 25 janelas e no fim do bloco, e só então marcar o andamento; o primeiro ano com registro marca o órgão `com_dados`;
   - **ciclo** (só órgãos `com_dados`, do mais antigo lido para o mais novo): vigentes pelo fim da vigência (de 30 dias atrás até o maior fim visto, no mínimo um ano, em janelas de 365 dias) e iniciados nos últimos 120 dias; órgãos sem dado são remedidos a cada 90 dias (ano atual e anterior);
   - ambos: arquivo bruto com o CPF mascarado só do que entrou ou mudou, contagem por motivo de linha pulada, `sourceLastInclusion` (maior `dataHoraInclusao` lida), prazo da rotina, trava dos contratos, fonte parada sem falha;
   - comandos `federal-probe`, `federal-load` e `federal-cycle` (aceitam `--orgao`, `--from` e `--max-minutes`).
8. **Rotina diária:** as etapas, a variável, o prazo na carga de contratos e os testes de `dailyJobSteps`.
9. **Painel e front:** bloco `federal` no status da coleta, card, rótulos, detalhe (link, número, aviso do vencimento); texto dos Termos e da Privacidade **apresentado a ele antes de entrar**.
10. **Documentação:** README do módulo (seção nova), este plano (a "Situação") e a memória.
11. **Validações**, um comando de cada vez (abaixo).
12. **Conferência local, com o "sim" dele para gravar no `local/`:** `federal-load --orgao 26238`, depois um segundo `federal-load` e um `federal-cycle` (devem gravar 0 linhas se nada mudou); abrir "Contratos a vencer" e a página do CNPJ da UFMG; medir as duplicatas sem número contra o PNCP e decidir a checagem suave; registrar os números.

## Regras de negócio identificadas

- **Quem entra:** órgãos com `esfera = F`; linhas **sem** `numeroControlePncpContrato` (com ele, vale o PNCP, que traz os termos); fora as com `contratoExcluido`; fora as incluídas há menos de 45 dias (podem ganhar o número do PNCP logo); todos os tipos.
- **Vigentes de qualquer ano** pelo fim da vigência; encerrados desde `TENDERS_FEDERAL_FROM` (2021) pelo início.
- **Chave:** `comprasgov-<unidade gestora>-<tipo>-<número>` (ex.: `comprasgov-153254-50-00586/2023`), até 60 caracteres; caracteres do número fora de `[0-9A-Za-z/_.-]` viram `_`. Na colisão, vale a linha de `dataHoraInclusao` mais recente (empate: a de maior fim); a perdedora é contada.
- **Órgão:** `agencyCnpj` = `cnpj_pncp` (aprendido dos números de controle das linhas que têm o do PNCP) ou, sem evidência, o CNPJ do cadastro na forma da matriz (raiz + 0001 + dígitos verificadores); órgão sem CNPJ de 14 dígitos: linha pulada e contada. `agencyName` = `nomeOrgao`; `governmentSphere` = `F`; unidade = código e nome da UASG; UF, município e IBGE da UASG (nulos se a unidade não estiver no cadastro).
- **Tipo** (`contractTypeId`): 50→1, 52→2, 53→3, 54→4, 56→5, 57→6, 99→7, 98→8, 96→10, 95→11, 94→12; 51 e códigos desconhecidos→8 (Outros), guardando o nome da origem. **Categoria** pelo nome (sem acento nem maiúsculas) contra `CONTRACT_CATEGORIES`; desconhecida: sem id, com o nome.
- **Fornecedor:** 14 dígitos = PJ; 11 = PF com CPF mascarado (`***.456.789-**`); outro formato = sem tipo, texto limpo até 30 caracteres.
- **Datas e valores:** `termStart` = `dataVigenciaInicial`; `originalTermEnd` e `expiresOn` = `dataVigenciaFinal` (sem data, ou mais de 35 anos depois do início: contrato sem vencimento, contado à parte; fim antes do início: erro contado, linha pulada); `publishedAt` = `dataHoraInclusao` (Brasília, sem fuso); `globalValue` = `valorGlobal` positivo; sem valor inicial, sem data de assinatura e sem aditivos (`amendments = null`).
- **Ano e sequência:** `contractYear` = o ano do número (`/AAAA` ou os 4 primeiros dígitos do empenho), senão o do início da vigência; `contractSequence` = 0 (só servia para o link do PNCP).
- **Atualização:** o hash vem dos **campos guardados** (não do registro bruto), para o `valorAcumulado` e as parcelas, que mudam a cada pagamento, não reescreverem linhas.
- **Duplicata com o PNCP:** a linha sem número do PNCP que tem gêmea no armazém (mesmo órgão, ano, fornecedor e número normalizado; no empenho, o número exato) não entra. A checagem só liga se o piloto mostrar duplicatas relevantes (acima de 1% das linhas sem número).
- **Fonte parada** não é falha: ciclo e carga terminam com sucesso, e o painel mostra até quando há dado.
- A busca de texto, os avisos de 90 e 30 dias, os favoritos e as buscas salvas valem para os federais sem mudança (a chave cabe nos 60 caracteres das colunas de favoritos e notificações).

## Regras multi-tenant e segurança

- Os contratos federais são **dado público e global**, como os do PNCP: sem filtro de conta na leitura. O que é da pessoa (favoritos, buscas salvas, avisos) segue filtrado por conta e usuário, como hoje.
- A chave vem do armazém e é conferida pelo padrão estrito antes de virar literal SQL (sem aspas nem espaços); nada vem do cliente sem validação.
- A tabela nova é global e só o coletor escreve (a concessão ao `licitacoes_coletor`); sem RLS, como as outras tabelas de andamento do módulo (a conferência das regras de tabela da raiz está nos precedentes 0085 e 0087c).
- LGPD: CPF do fornecedor mascarado no armazém e no arquivo bruto (o `maskPersonDocument` dos vencedores serve, o campo tem o mesmo nome); o nome de MEI e de pessoa segue como no cadastro público, como já decidido.
- Mensagens de erro da fonte sem o nome dela nem o corpo da resposta (vão para o painel da Coleta); sem segredo novo; nada de `.env` alterado por mim.
- Cada leitura respeita o intervalo configurado (1,5 s), sem contornar limite nem bloqueio.

## Validações necessárias

- Resposta da fonte: zod (`looseObject`) em cada linha; linha inválida conta erro e não derruba a execução; mais de 5% de linhas inválidas (com ao menos 100 lidas) falha a execução (mudança de formato).
- Parâmetros: janela de no máximo 365 dias, página de 10 a 500, código do órgão inteiro, datas AAAA-MM-DD.
- Variáveis de ambiente com zod: `TENDERS_FEDERAL_ENABLED` só `0` ou `1`; `TENDERS_FEDERAL_FROM` data; `TENDERS_FEDERAL_MINUTES` de 1 a 600.
- Chave, CNPJ (14 dígitos e matriz com dígitos verificadores), datas do calendário, valores positivos e `contractYear` entre 1990 e 2100.
- Sem `any`, sem `catch` silencioso; erros do banco e do R2 derrubam a execução, e os da fonte só encerram a janela.

## Testes necessários

### Frontend

- `utils/contractKey.test.ts`: chaves do PNCP e dos federais, com os mesmos casos do backend; rejeição de aspas, espaços e tamanho acima de 60.
- Util da origem do contrato: sem link, número exibido e aviso do vencimento nos federais; nada muda nos do PNCP.
- Rótulos dos dois tipos de execução e o bloco `federal` do status; `screenTexts.test.ts` (nenhum texto cita o PNCP).

### Backend

- Cliente: janelas, tamanhos de página, 204, 400, 429, repetição, erro tipado, lista completa de órgãos e unidades; leitura que falha na primeira e fecha na releitura.
- Mapeamento (fixtures reais): cada tipo e categoria, CPF, estrangeiro, sem fim, fim antes do início, excluído, número do PNCP (pulada), carência de 45 dias, colisão, unidade sem cadastro, órgão sem CNPJ, hash estável com `valorAcumulado` diferente.
- Armazém de exemplo: gravar federais e ler pelos conjuntos `contratos`, `fornecedor` e `vigentes`; chave aceita em favoritos e avisos; `upsert` devolvendo as chaves alteradas; reescrita zero na segunda passada.
- Banco (`*.db.test.ts`): sincronização dos órgãos, escolha dos próximos, marcar andamento só depois de publicar, carga retomável por órgão e ano, ciclo por ordem de leitura, prazo da rotina, fonte parada sem falha, `cnpj_pncp` aprendido e corrigido depois.
- Rotina: ordem das etapas, variável desligada pulando com o motivo, carga de contratos respeitando o prazo, carga federal "sem tempo" pulada sem falha.
- Detalhe e lista: `pncpLink` nulo e `origin`; rota `/collection/status` com o bloco `federal`; CLI (`federal-probe`, `federal-load`, `federal-cycle`).

### E2E

- Local, com o "sim" dele para gravar no `local/`: carga da UFMG; "Contratos a vencer" e a busca com os federais; detalhe sem link e com o aviso; página do CNPJ de `17.217.985/0001-04` somando os dois lados; segunda passada sem gravar; Configurações › Coleta com o card.

## Comandos de validação sugeridos

Um de cada vez (o computador não tem arquivo de paginação):

```bash
npx tsc --noEmit -p .
npx vite build
npm test
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
npm --prefix backend run migrations:status -- --banco local
```

## Riscos e pontos de atenção

- **Fonte parada desde cerca de 03/09/2026:** os federais novos continuam vindo pelo PNCP (91% a 97% dos contratos da UFMG), então o impacto é no legado e nos poucos que o PNCP não recebe. Nada falha por falta de dado novo; o painel mostra a data do último dado. Quando a fonte voltar, o ciclo recupera pelas janelas de início e de fim.
- **Tamanho real da primeira carga:** ~1.159 órgãos × 6 anos de janelas (a maioria vazia, mas cada uma precisa de um pedido) mais as páginas: cerca de 10 mil pedidos (~6 h) em blocos de 60 min, em torno de uma semana de rotinas, e a carga de contratos disputa o mesmo tempo (hoje 8 h por rotina, por uns 9 dias). Medir no piloto.
- **CNPJ do órgão:** a matriz só foi confirmada em 7 órgãos e na UFMG; órgão com filial própria no PNCP exige o `cnpj_pncp` aprendido. Se um órgão não tiver evidência e tiver filial diferente da matriz, o contrato pode ir para o CNPJ errado até aparecer um número do PNCP; o ciclo corrige depois.
- **Vencimento:** só do Compras, pode estar sem o último aditivo (1 de 5 casos acompanhou); a tela avisa, e o contrato do PNCP não é afetado.
- **Duplicata com o PNCP:** pode haver gêmea sem número (contrato que o PNCP recebeu sem vincular) ou que ganhou o número depois de entrar; a carência de 45 dias e a checagem suave reduzem; a taxa vem do piloto.
- **Contrato excluído na origem depois de gravado fica no armazém** (o gravador não apaga): contado no painel; fora do escopo.
- **Colisão da chave (cerca de 0,4%):** uma das duas versões some; registrada em contagem.
- **Ciclo semanal com 107 mil empenhos do ano:** ~10 min de leitura; se pesar, o ciclo passa a ler empenhos só pela janela de início.
- **Rotina de 12 h:** as etapas novas respeitam o prazo; a carga de contratos também passa a respeitar (mudança em etapa em produção, com teste).
- **Disco do Web Service:** +0,5 GB nos arquivos baixados.
- **Texto jurídico:** muda a página pública de Termos e Privacidade, só com a redação aprovada por ele.
- **Migration:** só com o "sim" dele, local e produção; na produção, antes do deploy do código que a usa.

## Perguntas em aberto

- Redação do crédito ao Compras.gov.br nos Termos (linhas 18 e 43) e na Privacidade (linha 100): proposta ao chegar no passo 9, para ele aprovar. Vale também para ligar os vencedores.
- Checagem suave de duplicata: liga ou não, conforme o piloto (passos 4 e 12).
- Ligar `TENDERS_FEDERAL_ENABLED` na produção: decisão dele, depois do piloto e de 1 ou 2 rotinas estáveis.
- Se, depois da carga, ele quiser esconder os empenhos no padrão de "Contratos a vencer" (45 mil contratos vencem em 31/12/2026 só no armazém local): é uma tela/regra à parte, fora deste plano.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- o `federal-probe` lê a UFMG 2024 completa (1.122 linhas, mesmo se a primeira leitura vier falha) e imprime completude, colisões, excluídas, parcela com número do PNCP por tipo e o CNPJ resolvido;
- o mapeamento passa nos testes com as fixtures reais, e a chave, o tipo, a categoria, o CPF e o vencimento seguem as regras acima;
- no banco local, a carga da UFMG grava no `local/` os federais sem número do PNCP (os 71 vigentes aparecem em "Contratos a vencer" e a busca), não duplica os que têm número, e a segunda passada e o ciclo gravam 0 linhas quando nada mudou;
- o detalhe do federal não tem link do documento original, mostra o número do contrato e o aviso do vencimento; o do PNCP não muda;
- a página do CNPJ da UFMG soma os contratos federais aos do PNCP sob o mesmo CNPJ;
- a rotina com a variável desligada pula as etapas com o motivo; ligada e sem tempo, a carga federal sai "sem tempo" sem falha; a carga de contratos respeita o prazo;
- fonte sem dado novo termina com sucesso, e o card de Configurações › Coleta mostra os números e "dados da fonte até dd/mm";
- a migration 0087d está aplicada no banco local e documentada para a produção, na ordem certa;
- os Termos e a Privacidade citam o Compras.gov.br com a redação aprovada;
- `npx tsc`, `npx vite build`, `npm test`, `npm --prefix backend run build`, `npm --prefix backend test` e `test:tenders-db` passam, sem `any` e sem `catch` silencioso;
- este plano ganha a "Situação" (números do piloto e da conferência) e a memória é atualizada.

## Observações para a skill implementar

- Usar este plano como fonte principal; a sondagem acima dispensa refazer as consultas, e o piloto (passo 4) confirma os limites.
- **Migrations:** nenhuma sem o "sim" dele, no local e na produção. Nunca `dev:prod-db` nem `--banco producao` por conta própria.
- **Gravar no R2 do `local/`** (passo 12) só com o "sim" dele; a CLI no banco local usa a URL do banco passada só para o processo (`TENDERS_COLLECTOR_DATABASE_URL`) e `DOTENV_CONFIG_PATH=../.env.dev`, sem mexer em `.env` (ver a memória "CLI de Licitações no banco local").
- **Texto jurídico** (Termos e Privacidade): apresentar a redação antes de editar.
- **Sem sobreposição:** generalizar o cliente existente em vez de criar outro; um só helper de bloco com prazo; um só `RunContractStore`; a mesma regra de CPF.
- Seguir o `/AGENT.md`: código em inglês e textos em português; Drizzle nas consultas novas do Postgres; sem `any`; `orderBy` explícito com desempate estável nas listas.
- A fonte pode estar parada ou lenta: nada supõe dado novo. Respeitar o intervalo entre pedidos; não rodar a sondagem em paralelo com outras (a API recusou pedidos quando havia 4 scripts ao mesmo tempo).
- Scripts com barra invertida, pela ferramenta Write; build e testes um de cada vez.
- Commit, push e merge só no `/finalizar`, com a autorização dele. Branch a partir da `main`; `CLAUDE.md` e `.portal/` ficam fora.
- Ao terminar: a "Situação" neste plano, a nota na Parte 5 de `.plans/licitacoes-contratos-no-r2.md` e a memória.

## Situação (implementação de 26/10/2026, na branch `feat/R/licitacoes-federais`, sem commit)

Implementado e conferido no banco local e no `local/` do R2. **Nada na produção:** a migration não foi aplicada lá, a variável fica desligada, e os Termos e a Privacidade esperam a redação dele (abaixo).

### O que mudou em relação ao plano

- **Migration `0087d`**, não 0089: a ferramenta de migrations aplica em ordem e recusou a 0089 com a 0088 pendente; a letra (como nas 0087a, b e c) a põe antes da 0088, que espera a exportação dos editais. Na produção a ordem é 0087c → **0087d** → deploy; a 0088 segue independente.
- **Tabela `federal_orgao`:** uma coluna `ciclo_lido_em` (vigentes e recentes são lidos no mesmo ciclo) no lugar de duas, sem `registros`, e com `ultima_inclusao` (até quando a fonte tem dado, para o painel).
- **A janela de 365 dias** é "o fim a até 365 dias do início" (o ano de 2024 inteiro passa; de 01/01/2024 a 01/01/2025, HTTP 400), não "365 dias contados com os dois extremos".
- **Leitura de janela que não completa** (`federalSource.ts`): o plano previa 4 leituras. A sondagem mostrou que não basta: no Ministério da Saúde (17 mil linhas em 2025), nem 4 leituras fecharam (faltaram 2). Agora a janela é lida 2 vezes (normal e 499) e, faltando linha, **dividida ao meio** (até 5 vezes, faixas de uns 11 dias), cada metade conferida sozinha; a janela de um dia não se divide e lê as 4 vezes.
- **CNPJ do cadastro** sem o zero à esquerda (a ANP vem com 13 dígitos): completa e confere os dígitos. Só 5 dos 1.159 órgãos ficam sem CNPJ válido (a sondagem antiga contava 15).
- **Tipo 97 (TED)** entrou na tabela de tipos (→ 9, "Termo de execução descentralizada"); não estava na sondagem.
- **Fim da vigência antes do início** passou de erro a **linha pulada contada à parte** (`termEndsBeforeStart`): o ciclo relê as mesmas janelas toda semana, e a linha errada deixaria a execução sempre "Parcial" (cerca de 2 em 50 mil linhas).
- **Checagem de duplicata com o PNCP ligada** (era condicional): a UFMG tinha **365 de 7.245 federais (5,0%)** com gêmeo no PNCP (mesmo órgão, ano, fornecedor e número normalizado), todos empenhos de 2026 que a fonte não ligou ao número do PNCP; nos 451 contratos, 0. Passou do limite de 1% do plano. A busca é `ContractStoreWriter.findPncpTwins`, e o que tem gêmeo vira `pncpTwin`. **Os 365 já gravados na primeira carga local ficam no armazém** (o gravador não apaga).
- **Mesmo contrato registrado duas vezes em anos diferentes:** a inclusão mais antiga que chega de outra janela não sobrescreve a mais recente já gravada (`supersededRows`). Sem isso, a segunda passada da UFMG alterou 1 contrato (2 atualizações) e publicou 78 arquivos e 48 MB; o ciclo semanal publicaria o armazém por causa de um contrato só.
- **Valores de `origin`:** `NATIONAL` e `FEDERAL` (não `PNCP` e `COMPRASGOV`), porque `screenTexts.test.ts` varre o código das telas atrás da marca.
- **Extraído:** `runContractStore.ts` (o `RunContractStore` e o `requireStorage`, que viviam em `contractRuns.ts`) e `blockTime.ts` (o tempo do bloco dentro do prazo da rotina e o envio do bruto antes de publicar, que viviam em `resultRuns.ts`). A carga de contratos passou a respeitar o prazo da rotina (`deadlineAt`), como combinado.

### Números da sondagem (`federal-probe`, 26/10/2026, só leitura)

- **Lista da fonte:** 12.096 órgãos ativos, 1.159 federais, 1.104 no SISG, 5 sem CNPJ válido; 22.175 unidades.
- **UFMG 2024** (1.122 linhas, completa na primeira leitura): 148 já no PNCP (90,8% dos contratos), 974 entrariam (952 empenhos, 15 contratos, 6 outros, 1 termo de compromisso); o CNPJ aprendido do PNCP é a matriz nas 148.
- **UFMG 2025** (4.112 linhas): 111 no PNCP, 4 excluídas, 7 chaves registradas duas vezes, 1 credenciamento (tipo fora da tabela).
- **Amostra de 8 órgãos + UFMG, 2025:** 4.217 linhas, só 3 órgãos com dado (UFMG, Centro Nacional de Tecnologia Eletrônica e Ministério dos Povos Indígenas); os outros 6 vieram vazios (consistente com os 24% de órgãos com dado).
- **10 órgãos grandes, 2025** (49.968 linhas, 281 pedidos, 9 min): 33.134 entrariam, 16.729 já no PNCP (95,6% dos contratos, 0% dos empenhos), 103 excluídas, 96 chaves registradas duas vezes (0,3%), 2 linhas inválidas; **a primeira leitura veio incompleta em 6 dos 10**, de 78% a 99% das linhas (Polícia Federal 1.680 de 2.161; FIOCRUZ 6.652 de 8.642), e a segunda leitura fechou todos menos o Ministério da Saúde. Fonte parada: última inclusão entre 02/07 e 03/09/2026.
- **CNPJ do órgão:** a matriz bate nos 8 órgãos grandes com número do PNCP; na amostra de 8, o Ministério dos Povos Indígenas usa no PNCP o CNPJ de outro órgão (`00394460000141`, não o do cadastro). O Exército publica o mesmo órgão no PNCP com 3 CNPJs (9.117, 1.463 e 130 contratos de 2025), e **dentro da mesma unidade** (212 de 378 unidades têm mais de um): nenhuma regra por unidade acerta; fica o mais frequente do órgão (85% na matriz).
- Tipos: aparecem 97 (TED) e 53 (arrendamento); credenciamento (51) é 16% das linhas do Exército (2.610), e cai em "Outros" com o nome da origem.

### Conferência local com a UFMG (órgão 26238, banco local e `local/` do R2, 26/10/2026)

- **Carga** (2021 a 2026, 6 janelas): 106 pedidos (a leitura leva ~80 s, e a publicação ~130 s), 7.675 linhas lidas, **7.245 contratos novos**, 0 erros; 407 já no PNCP e 11 excluídas ficaram de fora; **7.223 linhas vieram repetidas** pela paginação da fonte (4 releituras extras) e foram descartadas; 9 chaves registradas duas vezes. Publicou 97 arquivos e 88 MB.
- **Dados no armazém:** 7.245 federais ao lado dos 373 do PNCP sob o mesmo CNPJ do órgão (`17217985000104`): R$ 711,6 milhões de valor global nos federais; 1.477 vigentes hoje no conjunto `contratos`, e 2.954 no `vigentes` (66 deles do tipo Contrato, contra os 71 da sondagem: a carência de 45 dias, as excluídas e as chaves repetidas explicam a diferença). Maior chave: 33 caracteres. Detalhe de exemplo (`comprasgov-153262-50-00019/2024`): unidade, UF e município vindos da lista de unidades, tipo "Contrato", sem aditivos, sem número de compra.
- **Ciclo** (vigentes pelo fim da vigência e recentes): 79 pedidos, 2.012 linhas lidas, **5 contratos novos** (vigentes que começaram antes de 2021, que a carga não lê: é para isso que o ciclo lê pelo fim da vigência) e 1 atualizado. Publicou 82 arquivos e 49 MB.
- **Estabilidade:** a segunda carga (antes do conserto da inclusão mais recente) deu 0 novos e **2 atualizações** de 1 contrato que alternava entre as duas inclusões da fonte; publicou 78 arquivos e 48 MB por causa dele. Com o conserto, o **segundo ciclo deu 0 novos e 0 atualizados**, sem publicar. Uma terceira carga (também com o conserto) ainda deu **2 atualizações**: a hipótese é que sejam as trocas que as passadas anteriores deixaram gravadas (corrigidas uma vez na primeira releitura seguinte), **não confirmada** por uma quarta passada; o mecanismo está coberto por teste (`federalRuns.db.test.ts`, "o mesmo contrato registrado duas vezes"). Se uma releitura de rotina voltar a atualizar contrato, o primeiro suspeito é empate de data e hora de inclusão entre as duas versões.
- **Duplicatas com o PNCP** (medidas antes de ligar a checagem): 365 de 7.245 (5,0%), todos empenhos de 2026; contratos 0 de 451. A carga seguinte já os pulou (`ingestible` caiu de 7.257 para 6.892).
- **Custo do armazém:** publicar reescreve dezenas de arquivos (partes por ano e UF), então o tempo e o tráfego da carga de 1.159 órgãos vêm das publicações (a cada 25 janelas), não da leitura. Medir no piloto antes de ligar na produção.
- **Não feito:** abrir as telas (Contratos a vencer, detalhe, página do CNPJ) no navegador; os dados e os serviços foram conferidos por consulta direta ao armazém e por testes. A conferência na tela fica com ele.

### Pendente para ele

1. **Termos e Privacidade** (`src/screens/public/legalContent.ts`, linhas 18, 43 e 100): crédito ao Compras.gov.br, redação proposta na mensagem final, **não editada**.
2. **Produção, nesta ordem:** `/finalizar`; aplicar a **0087d** (`migrations:aplicar -- 0087d --banco producao --confirmo`, fora das 06:00); merge e deploy com `TENDERS_FEDERAL_ENABLED` desligada; piloto; só então ligar no Cron Job com `TENDERS_FEDERAL_MINUTES=30` ou 60.
3. Decidir o que fazer com os 365 empenhos duplicados que ficaram no armazém **local** (o gravador não apaga; na produção a checagem já nasce ligada).
