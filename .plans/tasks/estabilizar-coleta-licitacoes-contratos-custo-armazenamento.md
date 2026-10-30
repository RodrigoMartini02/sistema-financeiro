# Task: Estabilizar a coleta de licitações e contratos com controle de armazenamento e custo

## Contexto

O FinGerence precisa oferecer consultas completas e confiáveis dos editais publicados e dos contratos coletados, permitindo aos usuários acompanhar licitações e contratos. A diretriz do gestor é obter o menor custo recorrente viável com Render e R2, preservando uma base reutilizável em futuras aplicações.

No diagnóstico registrado em 30/10/2026, os eventos consultados no Render apontaram encerramentos do cron entre 28 e 29/10 por ultrapassar o limite de 2 GB do volume temporário `/tmp`. O consumo de cada componente no instante da falha ainda não foi medido. O volume de tráfego mensal discutido naquela conversa é uma medida diferente da ocupação temporária.

A inspeção do código para esta task confirmou que:

- O coletor mantém a cópia de trabalho dos contratos em uma pasta derivada de `tmpdir()`.
- O gravador utiliza DuckDB e arquivos Parquet locais; em cada publicação com mudanças, regrava as partes afetadas de contratos e fornecedores e reconstrói todo o conjunto de vigentes.
- Os novos arquivos são gerados antes do envio ao R2; a limpeza das cópias locais antigas ocorre após a publicação do manifesto.
- A rotina diária posiciona a carga histórica de contratos antes do ciclo federal de atualização.
- O fluxo federal publica os arquivos brutos e o armazém antes de registrar o andamento da coleta, garantia que deve ser preservada.

## Problema

O processamento pode exceder a capacidade temporária do cron, interromper cargas e repetir trabalho. A reconstrução integral dos vigentes também gera processamento e transferências recorrentes, cujo impacto financeiro precisa ser medido. A disputa de tempo entre histórico e atualizações pode atrasar dados necessários aos usuários.

É necessário estabilizar o processamento sem perder dados, apresentar cargas incompletas como concluídas ou aumentar custos sem evidência da necessidade.

## Objetivo

Manter a coleta e a publicação confiáveis dentro da capacidade disponível, com retomada segura, prioridade para dados atuais e redução mensurável de trabalho repetido. Preservar a cobertura dos dados publicados e sua reutilização por aplicações futuras, com visibilidade de atualização, pendências e consumo de recursos.

## Escopo

### Dentro do escopo

- Controlar a ocupação temporária de toda a execução, considerando cópias locais, banco DuckDB, arquivos auxiliares e novos arquivos de publicação.
- Tratar a aproximação do limite com margem suficiente para concluir ou interromper o bloco de forma segura e retomável.
- Reduzir reconstruções, regravações e transferências desnecessárias, preservando a classificação dos vigentes quando o dia muda.
- Preservar publicação consistente, compatibilidade com leitores, dados históricos e progresso confirmado somente após os dados estarem publicados.
- Rever a prioridade entre atualizações e cargas históricas para que as cargas pendentes avancem sem impedir atualizações necessárias ao acompanhamento.
- Medir duração, ocupação de disco, volume transferido, publicações e avanço das cargas com os mecanismos existentes sempre que suficientes.
- Validar os fluxos existentes de busca, filtros, detalhes, favoritos e acompanhamento de editais e contratos que possam ser afetados.
- Registrar a cobertura e a atualização verificadas, distinguindo carga pendente, falha e conclusão.

### Fora do escopo inicial

- Criar novas aplicações, fontes de dados ou funcionalidades comerciais.
- Reestruturar toda a arquitetura ou migrar provedores sem necessidade demonstrada no planejamento.
- Contratar planos maiores ou novos serviços pagos de observabilidade como solução presumida.
- Excluir históricos ou arquivos brutos para reduzir custo sem decisão específica sobre retenção.
- Alterar a interface por razões visuais ou promover uma auditoria geral do projeto.
- Executar deploy, disparar cargas em produção, alterar configurações de produção ou realizar operações destrutivas como parte da criação desta task.

## Impacto Previsto

### Frontend

- Sem alteração de interface identificada inicialmente. Validar a continuidade das consultas e do acompanhamento existentes.

### Backend

- Coletor, orçamento de recursos, publicação do armazém, limpeza de temporários, retomada e ordem das etapas diárias.
- Compatibilidade dos dados publicados com os leitores e serviços de consulta existentes.
- Métricas operacionais suficientes para avaliar estabilidade, cobertura e custo.

### Banco de Dados

- Sem alteração de schema identificada inicialmente. Preservar os registros de progresso e sua relação com a publicação efetiva dos dados.
- Avaliar no planejamento se as estruturas existentes são suficientes para as métricas necessárias.

### Infra/Deploy

- Considerar o limite temporário de 2 GB registrado no diagnóstico e verificar a capacidade do ambiente alvo durante o planejamento.
- Comparar consumo e custo de Render e R2 a partir de medições, sem estabelecer economia monetária antes de uma linha de base.
- Qualquer envio para produção ou alteração de sua configuração exige confirmação explícita em etapa posterior.

## Segurança e Dados

- Preservar autenticação, autorização e isolamento de dados de usuários e prefeituras nos fluxos afetados; distinguir dados públicos das fontes de dados privados de acompanhamento.
- Não registrar credenciais, documentos pessoais ou outros dados sensíveis nas métricas e nos logs.
- Preservar o mascaramento de dados pessoais e as regras de retenção existentes.
- Garantir que limpeza e falhas não removam arquivos necessários à versão publicada ou a consultas em andamento.
- Não avançar o progresso de uma carga que não tenha seus dados confirmados no armazenamento durável.
- Nunca executar migrations sem confirmação explícita e verificação do ambiente alvo.
- Nunca alterar `.env`, `.env.dev` ou secrets durante esta task; eventual necessidade de configuração deve ser apresentada separadamente para aprovação.

## Arquivos Provavelmente Afetados

Caminhos verificados na inspeção; a necessidade de alteração será definida no planejamento:

- `backend/src/modules/tenders/collector/runtime.ts` — diretório de trabalho do coletor.
- `backend/src/modules/tenders/contractStore/writer.ts` — geração, publicação e limpeza dos conjuntos de contratos.
- `backend/src/modules/tenders/contractStore/reader.ts` — compatibilidade da leitura das versões publicadas, se necessário.
- `backend/src/modules/tenders/collector/federalRuns.ts` — blocos de carga, publicação e confirmação de progresso federal.
- `backend/src/services/dailyJobSteps.ts` — prioridade das etapas da rotina diária.
- Demais pontos de integração, métricas e validação: a identificar durante o planejamento.

## Critérios de Aceite

- Uma execução representativa da base atual conclui a publicação sem ultrapassar a capacidade temporária disponível, com pico medido e margem de segurança definida no plano.
- Quando não houver capacidade para continuar, o bloco termina de forma controlada antes do limite, preserva a última versão válida e informa a pendência; a execução seguinte retoma sem perda de dados ou duplicação lógica.
- Falhas antes da conclusão da publicação não avançam o progresso nem expõem um manifesto que referencie arquivos ausentes. A limpeza preserva os arquivos necessários aos leitores.
- Publicações sucessivas com alterações pequenas apresentam redução mensurável de regravações ou transferências em relação à linha de base, sem omitir alterações. Execuções sem mudanças evitam trabalho desnecessário e a virada do dia mantém a classificação correta dos vigentes.
- As atualizações necessárias aos usuários têm prioridade verificável sobre a carga histórica, e as pendências históricas continuam identificadas e retomáveis.
- Nos cenários de validação definidos no plano, buscas, filtros, detalhes, favoritos e acompanhamento continuam corretos, sem regressão nos editais publicados ou nos contratos coletados.
- Os registros permitem distinguir atualização concluída, carga parcial e falha por fonte ou etapa, com duração, ocupação medida e bytes transferidos quando aplicáveis.
- A comparação antes/depois documenta os recursos consumidos e a estimativa de custo correspondente, explicitando o que foi medido e o que foi estimado, sem depender de novos serviços pagos por padrão.
- Dados históricos, identificadores por origem e controles de acesso permanecem preservados.

## Perguntas Para o Planejamento

- Quanto do pico é ocupado pela cópia atual, pelos novos Parquets, pelo DuckDB, pelo WAL e pelos temporários? A abertura da base, antes de novas mudanças, já se aproxima do limite?
- Qual margem de disco e tempo permite concluir a publicação com segurança, e qual comportamento adotar se a própria base mínima não couber no ambiente disponível?
- Como reduzir a reconstrução dos vigentes preservando alterações de vencimento, mudanças de partição e a virada do dia em Brasília?
- Quais atualizações, avisos e dependências precisam preceder o histórico, e qual nível de atualização é necessário para os usuários?
- Quais garantias de publicação e retenção de versões são necessárias aos leitores e à retomada após falha?
- Quais métricas e registros existentes atendem ao acompanhamento de custo e cobertura sem criar infraestrutura adicional?
- Qual volume e conjunto de cenários representam a base atual e seu crescimento esperado para validar a solução?
- Qual teto mensal e qual prazo desejado para concluir o histórico devem orientar eventuais decisões de capacidade? Esses valores ainda não foram definidos pelo gestor.

## Instruções Para /planejar

- Usar esta task como especificação de entrada.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar arquivos citados e pontos de integração antes de propor alterações.
- Gerar plano em `.plans/`, com limites verificáveis, riscos, validações e dependências de aprovação.
- Separar evidências do diagnóstico, hipóteses e medições ainda necessárias; não pressupor que reduzir um único componente resolve todo o pico.
- Priorizar estabilidade e integridade; comparar alternativas pelo custo recorrente e pela capacidade de manter consultas completas e atualizadas.
- Não implementar código durante o planejamento.
- Não assumir staging ou PR.
- Aguardar aprovação do plano antes de `/implementar`; seguir com `/finalizar` ao concluir a implementação e as validações.
