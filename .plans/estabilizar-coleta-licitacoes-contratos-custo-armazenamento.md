# Plano: Estabilizar a coleta de licitações e contratos com controle de armazenamento e custo

## Origem

- Task de origem: `.plans/tasks/estabilizar-coleta-licitacoes-contratos-custo-armazenamento.md`.
- Classificação: `backend-only`, com validação de infraestrutura e custos.
- Proposta apresentada ao usuário e registro autorizado em 30/10/2026 com a resposta "pode salvar".
- Implementação autorizada pelo comando `/implementar` e realizada localmente em 30/10/2026. Compilação, testes isolados e ensaio de volume concluídos; testes PostgreSQL e validação no ambiente de produção permanecem pendentes.
- Evidências e limitações: [relatório de validação](estabilizar-coleta-licitacoes-contratos-validacao.md).

## Resumo

Estabilizar a coleta dentro da capacidade temporária disponível, reduzir reconstruções e transferências repetidas e preservar publicação consistente e retomada. Manter Render, R2 e PostgreSQL, o formato dos dados publicados e os fluxos existentes de consulta e acompanhamento.

A solução combina orçamento de disco e tempo, atualização dos vigentes por partes, renovação do banco DuckDB após publicações confirmadas, confirmação dos arquivos brutos antes do progresso e prioridade das atualizações sobre o histórico. Medir os resultados usando os logs e detalhes de execução existentes, sem introduzir um serviço pago de observabilidade.

## Escopo

### Dentro do escopo

- Medir a ocupação temporária durante toda a execução, incluindo cópias locais, DuckDB, WAL, temporários de consultas e Parquets novos.
- Verificar a capacidade antes dos downloads e de novas unidades de trabalho; reservar espaço e tempo para terminar a publicação ou interromper com segurança.
- Atualizar somente partes afetadas dos vigentes, incluindo a virada do dia em Brasília, sem materializar o conjunto completo em uma tabela intermediária.
- Renovar o banco de trabalho vazio após publicações confirmadas para evitar crescimento acumulado entre blocos.
- Uniformizar a ordem entre envio dos brutos, publicação do armazém, confirmação do progresso e avisos dependentes da publicação.
- Priorizar atualizações diárias e ciclo federal antes das cargas históricas; executar os avisos de contratos depois das atualizações de contratos.
- Validar compatibilidade dos leitores, buscas, detalhes, favoritos, buscas salvas e acompanhamento.
- Comparar recursos e custo antes/depois, distinguindo medição, estimativa, carga parcial e conclusão.

### Fora do escopo

- Novas telas, aplicações, fontes de dados ou funcionalidades comerciais.
- Migração de provedor ou reformulação geral da arquitetura.
- Contratação de planos maiores ou serviços adicionais.
- Exclusão de históricos ou brutos por uma nova política de retenção.
- Alterações de schema, migrations, credenciais ou arquivos `.env` e `.env.dev`.
- Deploy, execução manual de cargas ou alteração de configuração em produção nesta etapa.
- PR, staging ou fluxo obrigatório de branches.

## Leitura de Contexto

### Regras e especificação

- Lidos `AGENT.md`, `CLAUDE.md`, a task de origem e a skill `planejar` em `C:/Users/rodri/.codex/skills/planejar/SKILL.md`.
- Aplicam-se as regras de autorização para implementação e produção, isolamento por conta/usuário e prefeitura quando pertinente, Drizzle no PostgreSQL e preservação dos dados.

### Evidências do código

- `collector/runtime.ts`: diretório de trabalho derivado de `tmpdir()`, compartilhado pelas etapas da rotina.
- `contractStore/writer.ts`: baixa os três conjuntos de contratos, reconstrói todos os vigentes em publicações com mudanças e gera os novos Parquets antes de enviá-los. A limpeza local ocorre depois da publicação do manifesto.
- `contractStore/layout.ts`: partes com limite de linhas e faixas de vencimento relativas ao dia de referência; os limites de 365, 730 e 3650 dias também precisam ser considerados na passagem de um dia para outro.
- `contractStore/writer.ts`: `publish()` retorna sem atualizar o manifesto quando não existem mudanças, mesmo se o dia de referência já mudou.
- `contractStore/duckdb.ts`: configura memória e diretório temporário, mas não um orçamento global do espaço usado pelo coletor.
- `collector/runContractStore.ts`: centraliza publicações e avisos de vencimento; o indicador global `published` não basta para confirmar individualmente consultas após a introdução de publicações intermediárias.
- `collector/contractRuns.ts` e `collector/runs.ts`: no fluxo PNCP, o envio final dos brutos ocorre depois do trabalho que publica o armazém; na carga, dias podem ser marcados antes desse envio final.
- `collector/federalRuns.ts` e `collector/blockTime.ts`: o fluxo federal descarrega brutos antes de publicar e marcar progresso; o helper compara falhas ocorridas durante o `flush`, sem barrar por si só todas as falhas anteriores do bloco.
- `collector/archive.ts`: falhas de envio são contabilizadas e a parte em memória é descartada. Uma falha anterior precisa impedir a confirmação do bloco correspondente.
- `services/dailyJobSteps.ts`: a carga histórica PNCP vem antes do ciclo federal e os avisos de contratos vêm antes desse ciclo.
- `services/dailyJobs.ts`: há prazo global de 690 minutos; as cargas usam a folga de 15 minutos definida em `collector/blockTime.ts`. As etapas compartilham o mesmo processo.
- `contractStore/reader.ts`: mantém versão local válida durante falhas de atualização, troca visões em transação e preserva a versão local anterior. A publicação remota conserva arquivos referenciados pelos dois últimos manifestos.
- `contractStore/winnerWriter.ts`: compartilha o manifesto e a pasta de trabalho, preservando os conjuntos de contratos. Mudanças em helpers compartilhados precisam manter esse comportamento.
- `services/contractFavorites.ts`: favoritos pertencem à conta e ao usuário; o armazém público de contratos não substitui essa autorização.

Os caminhos acima de `collector/`, `contractStore/` e `services/contractFavorites.ts` são relativos a `backend/src/modules/tenders/`, exceto os arquivos da rotina diária, em `backend/src/services/`.

### Evidências de ambiente, consultadas somente em leitura em 30/10/2026

- Cron no Render: `crn-db011mid0e5s739mop2g`, tipo `cron_job`, plano `1c-2g`, região Oregon, agenda `0 9 * * *`.
- O limite de 2 GB de `/tmp` é a causa registrada nos eventos recuperados no diagnóstico anterior. O plano de CPU/RAM não deve ser interpretado como prova da capacidade de disco.
- As credenciais locais apontam para o prefixo R2 `local`. Esse manifesto foi distinguido do de produção e não foi usado para dimensionar a base de produção.
- O prefixo `producao` foi identificado na configuração efetiva do cron, sem imprimir credenciais e sem abrir conexão com o PostgreSQL.
- Manifesto de produção observado: revisão `94.1`, publicado em `2026-10-30T12:57:26.600Z` (09h57 em Brasília), dia de referência `2026-10-30`.

| Conjunto | Arquivos | Linhas | Bytes publicados |
|---|---:|---:|---:|
| Contratos | 133 | 1.975.955 | 279.643.660 |
| Vigentes | 83 | 878.827 | 179.752.123 |
| Fornecedor | 89 | 1.975.955 | 140.552.501 |
| Vencedores | 0 | 0 | 0 |

Os três conjuntos de contratos somavam 599.948.284 bytes, aproximadamente 600 MB decimais. Eles são representações sobrepostas dos contratos, portanto suas linhas não devem ser somadas como contratos distintos. Havia 1.861 contratos sem vencimento nos totais do manifesto.

Esses números descrevem somente a versão publicada observada: não incluem o arquivo bruto histórico, versões anteriores, banco de trabalho, WAL ou temporários. Ainda não existe medição que decomponha o pico da execução que falhou. Nenhuma configuração, objeto ou dado de produção foi alterado para elaborar este plano.

### Referências técnicas

- [Render: cron jobs](https://render.com/docs/cronjobs): limite de 12 horas, armazenamento efêmero sem disco persistente e cobrança do cron por tempo de execução.
- [DuckDB 1.5: configuração](https://duckdb.org/docs/1.5/configuration/overview): `max_temp_directory_size` limita o diretório temporário do DuckDB, sem cobrir automaticamente Parquets e banco de trabalho.
- [DuckDB 1.5: recuperação de espaço](https://duckdb.org/docs/1.5/operations_manual/footprint_of_duckdb/reclaiming_space): apagar linhas não equivale a liberar imediatamente todo o espaço físico; `VACUUM` não recupera o espaço de linhas apagadas nessa versão.
- [Cloudflare R2: preços](https://developers.cloudflare.com/r2/pricing/): considerar armazenamento, operações, classe dos objetos e franquias aplicáveis. O R2 não cobra tráfego de saída; bytes transferidos e economia monetária são medidas distintas.

## Impacto por Área

### Frontend

Sem alteração de interface ou contrato HTTP prevista. Validar os fluxos existentes por seus serviços e testes, com conferência funcional quando houver ambiente de teste adequado.

### Backend

Alterações no gravador, uso de disco do coletor, limites dos blocos, publicação e confirmação de progresso, prioridade das etapas e métricas. Preservar o formato 1 do manifesto e os nomes e tipos das colunas dos conjuntos.

### Banco de Dados

Sem alteração de schema prevista. Reutilizar o JSON de detalhes das execuções e as estruturas existentes de progresso. Manter Drizzle e os filtros de autorização nas operações PostgreSQL. O SQL do DuckDB segue os padrões próprios do armazém.

### Infra/Deploy

Manter os serviços e planos atuais durante a implementação. A meta inicial é caber no ambiente disponível com margem e reduzir trabalho repetido. Qualquer necessidade posterior de configurar limites por ambiente ou ampliar capacidade deve ser apresentada com medições e aprovação específica.

## Arquivos Provavelmente Afetados

Todos os caminhos abaixo foram verificados durante o planejamento:

| Caminho | Mudança esperada |
|---|---|
| `backend/src/modules/tenders/contractStore/writer.ts` | Publicação incremental dos vigentes, orçamento por operação e renovação do banco de trabalho. |
| `backend/src/modules/tenders/contractStore/layout.ts` | Reutilização das regras de faixas e partes para vigentes, preservando o formato existente. |
| `backend/src/modules/tenders/contractStore/duckdb.ts` | Limite de temporários e ciclo de abertura/fechamento do banco de trabalho. |
| `backend/src/modules/tenders/contractStore/localCopy.ts` | Verificação antes dos downloads, métricas e limpeza restrita aos arquivos elegíveis. |
| `backend/src/modules/tenders/collector/runtime.ts` | Orçamento e métricas compartilhados pela rotina. |
| `backend/src/modules/tenders/collector/runs.ts` | Contexto do coletor e registro de resultados, limites e pendências. |
| `backend/src/modules/tenders/collector/runContractStore.ts` | Resultado de publicação e avisos vinculados aos dados confirmados. |
| `backend/src/modules/tenders/collector/contractRuns.ts` | Limites durante a coleta, publicação dos brutos antes do progresso e confirmação por unidade completa. |
| `backend/src/modules/tenders/collector/federalRuns.ts` | Integração dos limites e da confirmação segura nos ciclos e cargas federais. |
| `backend/src/modules/tenders/collector/blockTime.ts` | Limites dos blocos e barreira de publicação dos brutos. |
| `backend/src/modules/tenders/objectStorage.ts` | Contagem agregada de operações e bytes, preservando isolamento pelo prefixo de ambiente. |
| `backend/src/services/dailyJobSteps.ts` | Prioridade das atualizações e posição dos avisos de contratos. |
| `backend/src/services/dailyJobs.ts` | Resumo de recursos e resultados por etapa, mantendo o prazo global. |
| `backend/src/modules/tenders/contractStore/reader.ts` | Ajustes somente se os testes de atualização e limpeza identificarem necessidade para preservar a compatibilidade. |

Testes existentes a estender conforme as mudanças: `contractStore/writer.test.ts`, `reader.test.ts`, `layout.test.ts`, `collector/contractRuns.test.ts`, `contractRuns.db.test.ts`, `federalRuns.test.ts`, `federalRuns.db.test.ts`, `blockTime.test.ts`, `archive.test.ts`, `objectStorage.test.ts`, `services/dailyJobSteps.test.ts` e `dailyJobs.test.ts`, nas respectivas pastas já existentes do backend.

`collector/archive.ts`, `contractStore/manifest.ts` e `winnerWriter.ts` são pontos de compatibilidade a conferir. Alterá-los somente se necessário à estratégia aprovada, sem ampliar a tarefa para reestruturar outras coletas.

## Estratégia de Implementação

### 1. Estabelecer a linha de base e o orçamento de recursos

- Medir antes dos downloads, antes de iniciar novas páginas/janelas e nas etapas de geração, envio, publicação e limpeza. Complementar as medições de fronteira com amostragem durante operações longas para não confundir o tamanho final com o pico.
- Separar cópia publicada, Parquets novos, banco, WAL e temporários; considerar outros diretórios da mesma execução e registrar a ocupação total observável. Informações do sistema de arquivos são complementares e não substituem o limite de quota informado pelo provedor.
- Usar como alvo inicial 1.600.000.000 bytes de ocupação operacional total diante dos 2 GB diagnosticados. A diferença de pelo menos 400 MB é margem proposta, sujeita a confirmação no ensaio representativo, e não capacidade livre garantida.
- Reservar antecipadamente disco e tempo para a publicação do lote em andamento. Definir a admissão de novas unidades pelo consumo atual, tamanho dos arquivos envolvidos e espaço de trabalho medido, não apenas pelo número de linhas.
- Aplicar um limite próprio ao diretório temporário do DuckDB compatível com a folga restante. Esse limite não substitui o orçamento geral.
- Quando não houver capacidade para admitir outra unidade, terminar o bloco e publicar apenas o que puder ser confirmado com segurança. Se nem a publicação couber, preservar a versão anterior e deixar o trabalho não confirmado pendente.
- Se a própria abertura da base já não couber com margem, interromper antes do download completo e registrar insuficiência de capacidade. Evitar repetir um processamento longo sem possibilidade de concluir.
- Usar opções internas e limites injetáveis nos testes inicialmente; não modificar arquivos de ambiente para implantar o controle.

### 2. Tornar a publicação dos vigentes incremental

- Preservar o manifesto e o layout existentes. Reutilizar arquivos de partes não afetadas.
- Calcular as partes de origem e destino dos contratos alterados, incluindo mudança de vencimento, UF, entrada/saída de vigência e redistribuição de faixas.
- Considerar o dia efetivo em Brasília em cada publicação e comparar com o dia do manifesto. Na virada, remover vencidos e mover os registros atingidos pelos limites das faixas, mesmo sem mudanças recebidas das fontes.
- Gerar os arquivos por faixa e parte de tamanho controlado, sem uma tabela persistente contendo todos os vigentes. A primeira publicação também deve seguir processamento limitado por partes.
- Preservar os totais exatos de contratos, vigentes e sem vencimento; comparar os resultados com uma consulta de referência sobre o estado completo em testes.
- Sem alterações de conteúdo ou de dia, não publicar novamente. Uma mudança somente de dia pode exigir atualização do manifesto mesmo quando não houver arquivos para regravar.

### 3. Conter o banco de trabalho e preservar o ponto de publicação

- Depois de confirmar o manifesto, renovar o banco DuckDB de trabalho vazio e reabrir as visões sobre os Parquets publicados, evitando carregar crescimento físico entre blocos. Não criar uma segunda cópia completa do banco para compactação.
- Fechar conexões antes de remover banco, WAL e temporários pertencentes à execução, respeitando as diferenças entre Windows e Linux.
- Manter os arquivos necessários às visões antigas até encerrar seu uso. A limpeza local só pode atingir arquivos elegíveis dentro do diretório de trabalho verificado.
- Continuar enviando os arquivos referenciados pelo novo manifesto antes de publicar o manifesto. Nenhum leitor deve receber uma versão que referencie objetos ainda ausentes.
- Distinguir publicação durável de manutenção local posterior: falha de limpeza ou reabertura não apaga o fato de que o manifesto já foi confirmado. Registrar o ocorrido e suspender novo trabalho quando necessário.
- Preservar a versão válida durante falhas de download dos leitores e conferir o caso de um manifesto ficar ultrapassado durante publicações rápidas. Evitar que limpeza ou retry exponham uma mistura de versões.
- Preservar os conjuntos do outro gravador no manifesto compartilhado; não apagar dados dos vencedores ao publicar contratos, nem o inverso.

### 4. Uniformizar envio dos brutos, progresso e retomada

- No PNCP e no fluxo federal, aplicar a ordem: confirmar brutos do bloco, publicar Parquets e manifesto, registrar unidades integralmente concluídas e executar avisos dependentes da publicação.
- Considerar falhas de arquivo bruto ocorridas durante `append` e durante o `flush`; uma falha que já descartou uma parte não pode ser ignorada por uma comparação apenas antes/depois do `flush` final.
- Interromper a confirmação do bloco afetado e deixar suas unidades pendentes para releitura. Preservar os blocos anteriores já publicados e confirmados.
- Permitir publicações intermediárias por pressão de recursos sem marcar consulta, dia ou janela incompleta como concluída. Não usar o indicador global `published` como prova de que todas as mudanças posteriores chegaram ao armazenamento durável.
- Nas consultas diárias, controlar quais unidades já estão cobertas por uma publicação confirmada; nas cargas, manter dias e janelas pendentes quando interrompidos. A retomada pode reler a unidade não concluída, com aplicação idempotente.
- Diferenciar nos detalhes o término do bloco e a conclusão da carga: uma execução pode encerrar normalmente com histórico ainda pendente. Registrar motivo de parada e progresso restante.

### 5. Priorizar atualizações e medir o resultado

- Manter as atualizações diárias antes das cargas históricas; mover o ciclo federal para antes das cargas e dos avisos de contratos. Preservar as flags de ativação e a limpeza semanal.
- Manter o prazo global e as margens de publicação existentes, combinando-os ao orçamento de disco. Dados históricos avançam com o orçamento restante.
- Registrar por etapa e publicação: duração, pico observado de disco, ocupação por componente, arquivos e bytes lidos/enviados, operações R2, linhas alteradas, revisão, unidades confirmadas e pendências.
- Reutilizar logs e detalhes JSON existentes; não registrar credenciais nem payloads de contratos nas métricas.
- Comparar a mesma base e os mesmos cenários antes/depois. Considerar CPU/tempo do cron, armazenamento, operações e transferências relevantes de cada provedor; não transformar automaticamente uma redução de bytes em economia de mesmo percentual na fatura.
- Consultar as tarifas vigentes e franquias na entrega da medição. Não extrapolar apenas um trecho do cron para o custo total do projeto ou prometer um valor mensal sem linha de base.

## Segurança, Dados e Multi-Tenant

- Preservar identificadores por origem, histórico, mascaramento de documentos pessoais e regras atuais de retenção.
- Dados públicos do armazém não tornam públicos favoritos, buscas salvas, avisos ou acompanhamento. Manter filtros por conta, usuário e prefeitura quando aplicáveis.
- Manter as consultas PostgreSQL em Drizzle, com parâmetros e filtros de autorização; os literais e parâmetros do DuckDB devem seguir os padrões seguros já existentes.
- Preservar prefixos separados de ambiente no R2. Testes e ensaios não podem publicar ou limpar o prefixo de produção.
- Nenhuma limpeza recursiva pode usar caminho sem validação de pertencimento ao diretório de trabalho. Medir `/tmp` não autoriza apagar seu conteúdo geral.
- Preservar travas do coletor e a consistência do manifesto compartilhado.
- Não executar migrations, operações destrutivas de banco, alterações de ambiente ou ações de produção durante a implementação sem autorização específica aplicável.

## Validações Necessárias

- Conferir a base de referência e seu tamanho ao iniciar a implementação: o manifesto observado é uma fotografia, não um valor permanente.
- Ensaiar volume, largura de registros e concentração de vencimentos representativos dos aproximadamente 2 milhões de contratos observados. Usar dados de teste ou cópia controlada com destino isolado, sem gravar em produção.
- Demonstrar publicação dentro do orçamento proposto com pico medido, repetindo o cenário por vários blocos para detectar crescimento acumulado do banco.
- Validar também crescimento da base e recusa controlada quando a capacidade mínima não couber. Não apresentar uma execução simplesmente interrompida pelo guard como comprovação de processamento completo.
- Comparar consultas, totais, revisões, partes reaproveitadas e resultados de acompanhamento antes/depois.
- Entregar resumo do ambiente do ensaio, dados utilizados, métricas observadas, limitações e estimativa de custo correspondente.

## Testes Recomendados

- Compilar o backend com `npm --prefix backend run build` após as alterações.
- Executar os testes unitários e de armazém afetados; depois, a suíte padrão do backend com `npm --prefix backend test`.
- Estender testes de vigentes para inserção, alteração, vencimento, prorrogação, ausência de vencimento, mudança de UF, partes cheias e passagem pelos limites de faixas.
- Cobrir virada do dia sem novas mudanças, execução que cruza meia-noite e repetição no mesmo dia sem regravação desnecessária.
- Simular orçamento pequeno, espaço consumido fora do banco, pausa antes do download, pausa durante a coleta e falta de capacidade para concluir a publicação.
- Simular falhas em brutos durante `append` e `flush`, Parquets, manifesto e manutenção após publicação. Verificar progresso e estado publicado em cada ponto.
- Adaptar o teste PNCP que atualmente permite publicar contratos mesmo com falha no arquivo bruto à nova garantia de confirmação do bloco.
- Testar retomada após múltiplas publicações parciais e interrupção da unidade seguinte, sem duplicação lógica nem confirmação prematura.
- Testar leitores consultando durante trocas, downloads que atravessam publicações sucessivas, preservação dos conjuntos do outro gravador e comportamento de limpeza no Windows/Linux.
- Validar a nova ordem das etapas, flags, domingo em Brasília e prazo global nos testes da rotina diária.
- Executar testes de integração de coleta, busca, detalhe, favoritos, buscas salvas e avisos somente contra banco local verificado. O suporte existente exige `localhost:5433/sistema_financas_dev` e usa rollback; não ativar testes de banco apontando para produção nem criar schema por migration sem aprovação.
- Não executar coletor real, `daily-jobs` ou ações que enviem notificações reais como substituto de testes isolados.

## Riscos e Pontos de Atenção

- Incrementalidade dos vigentes pode omitir remoções ou mudanças de faixa; referência de resultado completo e cenários de datas são obrigatórios.
- Amostragem de disco pode perder picos curtos, e contagem de arquivos pode não refletir arquivos removidos ainda abertos. Combinar medições com operações limitadas e reservas; não prometer uma garantia de quota baseada apenas em amostragem.
- Parquets pequenos não permitem inferir diretamente o tamanho do DuckDB descompactado. A margem final depende do ensaio e da largura real dos dados.
- Renovar o banco ou falhar depois do manifesto exige distinguir estado publicado de estado local disponível; não considerar perdidos dados já duráveis.
- Retenção de dois manifestos remotos pode ser insuficiente para um download que atravesse várias publicações; preservar a cópia válida e validar atualização/retry antes de considerar a compatibilidade atendida.
- Uma página, dia ou janela grande pode exceder a folga disponível; limites devem atuar durante a coleta e não apenas entre dias ou anos.
- A barreira de brutos torna o comportamento PNCP mais estrito: indisponibilidade do arquivo bruto deixa o bloco pendente, preservando os dados já confirmados anteriormente.
- Mover o ciclo federal altera a ordem de execução e pode reduzir o orçamento diário do histórico; medir atualização e avanço das pendências sem presumir que toda a base histórica ficará pronta imediatamente.
- Redução de I/O pode não reduzir a fatura se o uso permanecer dentro de franquias ou se houver outro gargalo. Separar economia técnica de economia monetária.

## Perguntas em Aberto

- Qual teto mensal total de Render e R2 deve orientar futuras decisões de capacidade?
- Qual prazo desejado para concluir a carga histórica?
- Qual atraso máximo aceitável para atualização das fontes e dos avisos?
- O alvo inicial de 1,6 GB e as reservas por operação são suficientes na base representativa e em seu crescimento esperado? Confirmar no ensaio, antes de recomendar produção.
- Quais componentes dominam o pico após eliminar a materialização integral dos vigentes? A medição ainda será necessária.

As três primeiras respostas não bloqueiam a implementação da estabilização e das medições. Não presumir valores aprovados para elas.

## Critérios de Aceite

- A base representativa conclui a publicação com pico medido dentro do orçamento operacional validado e margem perante o limite temporário diagnosticado.
- Múltiplas publicações na mesma execução não acumulam crescimento de banco e temporários que leve ao estouro.
- Aproximação dos limites de disco/tempo provoca parada controlada, pendência explícita e retomada sem perda ou duplicação lógica.
- Brutos não confirmados impedem a confirmação do bloco; nenhuma consulta, dia ou janela incompleta avança seu progresso.
- Falhas antes do manifesto preservam a versão anterior; falhas posteriores não ocultam uma publicação já confirmada. O manifesto não referencia arquivos ausentes por uma publicação incompleta.
- Alterações pequenas reaproveitam partes não afetadas dos vigentes e reduzem regravações ou transferências em comparação à linha de base, preservando resultados e totais exatos.
- A virada do dia atualiza a classificação dos vigentes mesmo sem mudanças das fontes; no mesmo dia sem mudanças, não há publicação desnecessária.
- Atualizações diárias e ciclo federal precedem as cargas históricas; avisos de contratos usam os dados atualizados disponíveis. Pendências históricas continuam identificadas e retomáveis.
- Leitores mantêm versões consistentes durante atualização e limpeza. Busca, filtros, detalhes, favoritos, buscas salvas e acompanhamento não apresentam regressões nos cenários validados.
- Logs e detalhes distinguem bloco encerrado, carga concluída, carga parcial e falha, com recursos e progresso suficientes para avaliar o resultado.
- A comparação antes/depois apresenta medições e estimativas de custo com suas limitações, sem depender de contratação adicional por padrão.
- Histórico, brutos confirmados, identificadores e autorização dos dados privados permanecem preservados.

## Instruções Para /implementar

- Usar este plano e a task de origem; reler as regras aplicáveis antes de alterar código.
- Executar a estratégia na ordem prevista, mantendo as mudanças restritas ao escopo aprovado. Inspecionar novamente os pontos citados se o código tiver mudado.
- A autorização recebida nesta etapa foi para salvar o plano. Iniciar código quando o usuário solicitar `/implementar` ou der autorização explícita equivalente para executar o plano.
- Manter Node.js 22.17.0 e a compatibilidade das dependências; não atualizar o DuckDB ou acrescentar serviços por conveniência.
- Reutilizar os padrões existentes e nomes em inglês no código. Evitar abstrações genéricas e testes que apenas reproduzam a implementação.
- Não alterar `.env`, `.env.dev`, secrets ou schema; não executar migrations.
- Usar testes e dados isolados; não iniciar coleta, envio de avisos ou publicação no ambiente de produção durante validações locais.
- Documentar as medições, resultados dos testes e limitações. Caso a base representativa não caiba, registrar a evidência e propor ajuste de escopo/capacidade, sem contratar ou alterar produção automaticamente.
- Não fazer commit, push, PR ou deploy durante `/implementar`. Após implementação e validações, seguir para `/finalizar`, com confirmação explícita antes de qualquer envio para produção.
