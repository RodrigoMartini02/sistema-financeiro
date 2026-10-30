# Validação: coleta de licitações e contratos

Data: 30/10/2026.

Plano: [estabilizar coleta com controle de armazenamento e custo](estabilizar-coleta-licitacoes-contratos-custo-armazenamento.md).

## Resultado local

- `npm --prefix backend run build`: aprovado, sem erros de TypeScript.
- `npm --prefix backend test`: 980 testes aprovados, zero falhas, duração aproximada de 72,9 segundos na rodada final, incluindo o ensaio de volume.
- Os testes PostgreSQL ficaram desativados com `TENDERS_DB_TESTS=0` e `FINANCE_DB_TESTS=0`. O volume foi habilitado com `TENDERS_VOLUME_TESTS=1` somente no processo de validação.
- A execução padrão do runner no sandbox recebeu `spawn EPERM` antes das verificações. A mesma suíte passou após a permissão de execução revisada; não foi necessário alterar scripts ou dependências para contornar o bloqueio.
- Nenhum arquivo de ambiente, schema, credencial, serviço Render ou objeto R2 real foi alterado. Durante a implementação não houve migrations, commit, push ou deploy; o commit local foi autorizado depois, pelo comando `/finalizar`.

## Revisão de finalização

- Branch local: `main`. Os arquivos de código, testes, task, plano e este relatório compõem o escopo do commit local autorizado.
- Duas revisões independentes, somente de leitura, não encontraram defeitos bloqueantes novos no armazém, orçamento, coletores ou rotina diária.
- Conferidos diff e arquivos novos: sem alteração de `.env`, credenciais, migrations, schema, lockfiles, CI/CD ou artefatos de build.
- `git diff --check`: aprovado.
- Scripts disponíveis relevantes: `build` e `test` do backend. Não existem scripts `lint` ou `typecheck` separados nesse package; `build` executa `tsc --noEmit`.
- Validação adicional com Node.js **22.22.3** e npm **10.9.8**, selecionados apenas no processo dos comandos: compilação aprovada e **980 testes aprovados**, zero falhas, incluindo volume, em aproximadamente **121,0 segundos**.
- O ensaio nessa versão manteve os mesmos 627.641.757 bytes publicados iniciais e os mesmos resultados lógicos, com pico de **641.441.792 bytes**, aproximadamente **641,4 MB**, abaixo do alvo de 1,6 GB e sem falhas de medição. A variação em relação ao ensaio Node 24 não foi isolada como efeito da versão: carga e condições locais também variam.
- Os testes PostgreSQL permaneceram desativados; nenhum dado externo foi alterado. Não houve push nem deploy.
- Limitações adicionais conferidas na revisão: as consultas preexistentes de preparação dos cadastros federais ainda não recebem callbacks de prazo por página; a mudança também não introduz uma fila durável de recuperação de avisos após falhas persistentes do banco.

## Ambiente e limites da evidência

- Windows; Node.js local v24.15.0 e npm 8.19.3.
- O projeto mantém Node.js 22.17.0 como runtime de referência. A implementação não atualizou dependências e compilou com as tipagens Node 22 existentes. A finalização também validou a família Node 22 usando o binário 22.22.3 disponível, sem executar a versão exata 22.17.0 nem alterar o Node global.
- PostgreSQL e fontes externas não foram acessados. Os testes de S3 utilizam um servidor de exemplo em loopback; os demais armazenamentos são simulados.
- O ensaio de volume usa um bucket simulado em disco fora da pasta medida, representando o armazenamento remoto. A medição cobre a pasta de trabalho; em runtime o orçamento é criado sobre o diretório temporário do contêiner, incluindo os arquivos de outras etapas.
- Dados sintéticos com textos únicos evitam compressão artificial de milhões de registros iguais. O volume físico aproxima a base publicada observada durante o planejamento, sem reproduzir toda a diversidade ou distribuição das fontes reais.
- CPU, disco, rede e cobrança locais não reproduzem o Render. Os resultados não comprovam ainda o custo mensal, o tempo do cron em produção ou o pico exato dos dados reais.

## Ensaio representativo

Arquivo: `backend/src/modules/tenders/contractStore/writerVolume.test.ts`.

| Medida | Resultado |
|---|---:|
| Contratos iniciais | 1.975.955 |
| Vigentes iniciais | 878.827 |
| Contratos sem vencimento | 1.861 |
| Parquets publicados iniciais | 627.641.757 bytes, aproximadamente 627,6 MB |
| Base publicada observada em produção no planejamento | 599.948.284 bytes, aproximadamente 599,9 MB |
| Pico observado da cópia de trabalho no ensaio | 635.936.768 bytes, aproximadamente 635,9 MB |
| Alvo operacional | 1.600.000.000 bytes |
| Reserva de publicação | 128.000.000 bytes |
| Falhas de medição | 0 |
| Registros de medição | 1.074 |
| Limite operacional ultrapassado | Não |
| Geração da base sintética | 38,7 segundos |
| Ensaio completo, incluindo geração | 63,1 segundos |

MB e GB neste relatório são unidades decimais. A margem configurada é uma política de admissão, não uma quota garantida pelo sistema operacional; a amostragem pode perder picos curtos e não captura necessariamente arquivos removidos ainda abertos.

### Publicações pequenas na base completa

Referência de regravação integral dos vigentes: 147.363.831 bytes, correspondentes aos arquivos vigentes da base sintética inicial.

| Publicação | Arquivos novos, todos os conjuntos | Bytes enviados em Parquet | Bytes de vigentes regravados | Tempo local de publicação |
|---|---:|---:|---:|---:|
| Alteração 1 | 3 | 6.000.999 | 1.836.567 | 2,135 s |
| Alteração 2 | 3 | 5.993.238 | 1.835.070 | 2,194 s |
| Alteração 3 | 3 | 5.813.040 | 1.642.219 | 2,179 s |

Os vigentes regravados representam aproximadamente 1,1% a 1,25% da referência integral, com reaproveitamento dos arquivos não afetados. Essa comparação usa bytes da base inicial como referência; não executa o algoritmo legado nem demonstra redução equivalente do custo total ou do tempo do cron.

### Crescimento, repetição e virada do dia

- Inserção de uma página de 1.000 contratos novos: todos inseridos, três arquivos novos e 4.873.535 bytes publicados em Parquet; aplicação e publicação em aproximadamente 2,633 segundos locais.
- Totais após a inserção: 1.976.955 contratos e 879.827 vigentes, preservando os 1.861 sem vencimento.
- Releitura da mesma página: 1.000 registros sem mudanças, sem nova publicação.
- Na passagem de 30 para 31/10 em Brasília, um contrato expirou: o total de vigentes passou a 879.826. A parte inteira vencida foi retirada sem regravar os outros arquivos, e o dia do manifesto foi atualizado.
- Publicações sucessivas renovaram o banco de trabalho vazio; o teste confere que o arquivo do banco volta ao tamanho inicial nas três primeiras publicações.

## Comportamentos cobertos pelos testes

- Partes vigentes não afetadas são reutilizadas; mudanças de UF e vencimento atingem origem e destino.
- Prorrogação, vencimento e ausência de data preservam conjuntos e totais corretos.
- Virada do dia sem mudanças das fontes trata vencidos e transições dos limites de 365, 730 e 3650 dias, inclusive quando a execução atravessa meia-noite em Brasília.
- Um manifesto que não cabe é recusado antes do primeiro download. Páginas largas são recusadas antes de criar seu JSON sem reserva suficiente.
- Arquivos órfãos de uma execução interrompida são removidos antes da admissão dos downloads; os arquivos referenciados pelo manifesto permanecem protegidos.
- Parquet inválido na abertura libera o banco de trabalho e permite recuperar a cópia.
- Falhas antes do manifesto preservam a publicação anterior. Falhas de limpeza ou reabertura depois do manifesto não ocultam o commit; indisponibilidade da cópia local impede o próximo bloco.
- Falhas de arquivo bruto durante o bloco ou no envio final impedem publicação e confirmação de progresso.
- Consultas completas são confirmadas pela publicação correspondente, e interrupções por limites deixam a unidade incompleta pendente.
- O leitor preserva uma cópia válida quando o manifesto fica ultrapassado durante downloads e não remove arquivos antigos enquanto houver consultas ativas, mesmo atravessando mais de duas versões.
- A nova ordem das etapas prioriza o ciclo federal sobre o histórico e sobre os avisos de contratos, preservando flags e calendário de Brasília.
- Métricas S3 cobrem operações e bytes com respostas de sucesso e falha; métricas operacionais não registram chaves ou credenciais.

## Arquivos de código alterados

### Coletor e limites

- `backend/src/modules/tenders/collector/resourceBudget.ts` — novo orçamento de recursos, classificação de ocupação e amostragem de picos.
- `backend/src/modules/tenders/collector/blockTime.ts` — barreira dos brutos, confirmação por publicação e motivos de parada.
- `backend/src/modules/tenders/collector/contractRuns.ts` — limites entre páginas e consultas de termos, confirmação das consultas e retomada PNCP.
- `backend/src/modules/tenders/collector/federalRuns.ts` — limites federais, confirmação e avisos somente de alterações aplicadas.
- `backend/src/modules/tenders/collector/federalSource.ts` — interrupção entre páginas antes de ultrapassar os limites do bloco.
- `backend/src/modules/tenders/collector/runContractStore.ts` — integração do orçamento e ordem brutos/publicação/progresso/avisos.
- `backend/src/modules/tenders/collector/runs.ts` — orçamento opcional no contexto e recursos nos detalhes existentes.
- `backend/src/modules/tenders/collector/runtime.ts` — orçamento compartilhado da execução.

### Armazém e rotina

- `backend/src/modules/tenders/contractStore/writer.ts` — vigentes incrementais, mudança de dia, banco renovado, reserva de disco e recuperação após falhas.
- `backend/src/modules/tenders/contractStore/layout.ts` — documentação do layout incremental preservado.
- `backend/src/modules/tenders/contractStore/duckdb.ts` — opção de limite dos temporários.
- `backend/src/modules/tenders/contractStore/localCopy.ts` — admissão dos downloads e validação dos caminhos locais.
- `backend/src/modules/tenders/contractStore/reader.ts` — atualização tolerante a manifestos ultrapassados e limpeza com consultas ativas.
- `backend/src/modules/tenders/objectStorage.ts` — contadores agregados de operações e bytes.
- `backend/src/services/dailyJobSteps.ts` — prioridade do ciclo federal e dos avisos.
- `backend/src/services/dailyJobs.ts` — prazo da coleta diária e métricas por etapa/rotina.

### Testes

- `backend/src/modules/tenders/collector/blockTime.test.ts`.
- `backend/src/modules/tenders/collector/contractRuns.db.test.ts` — expectativas atualizadas; integração PostgreSQL não executada.
- `backend/src/modules/tenders/collector/federalSource.test.ts`.
- `backend/src/modules/tenders/collector/resourceBudget.test.ts` — novo.
- `backend/src/modules/tenders/contractStore/localCopy.test.ts` — novo.
- `backend/src/modules/tenders/contractStore/reader.test.ts`.
- `backend/src/modules/tenders/contractStore/writer.test.ts`.
- `backend/src/modules/tenders/contractStore/writerVolume.test.ts` — novo, habilitado por variável apenas no processo de teste.
- `backend/src/modules/tenders/objectStorage.test.ts`.
- `backend/src/services/dailyJobSteps.test.ts`.
- `backend/src/services/dailyJobs.test.ts`.

## Pendências antes de comprovar o resultado em produção

- Executar a integração PostgreSQL em ambiente local verificado, com autorização para as operações de teste exigida pelas regras do projeto; nenhuma migration foi executada para preparar esse ambiente.
- Conferir a versão exata Node.js 22.17.0 de referência se ela for mantida no ambiente alvo; a validação adicional na família Node 22 passou em 22.22.3.
- O envio do commit local para produção e qualquer execução manual em produção exigem confirmação explícita.
- Após implantação autorizada, conferir atualização das fontes, consultas, avisos, retomada e consumo do contêiner real, incluindo as demais etapas que compartilham `/tmp`.
- Comparar duração, operações, armazenamento e transferências do ambiente real com sua linha de base e tarifas/franquias vigentes. A economia monetária mensal permanece não medida; não foi estimada a partir do tempo deste computador.
- Definir teto mensal, prazo para o histórico e atraso aceitável de atualização para orientar futuras decisões de capacidade.
