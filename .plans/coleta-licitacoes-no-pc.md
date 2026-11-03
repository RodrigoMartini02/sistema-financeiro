# Plano de Implementação: Coleta de editais e contratos numa máquina própria (carga do histórico e rotina diária)

## Origem

- Arquivo de especificação: nenhum. A origem é a análise de 03/11/2026 sobre o Cron Job `rotinas-diarias-planos-licitações` falhando e sobre o custo. Referências: `.plans/estabilizar-coleta-licitacoes-contratos-custo-armazenamento.md` e `.plans/estabilizar-coleta-licitacoes-contratos-validacao.md`.
- Data do planejamento: 2026-11-03.
- Classificação: `backend + infra/deploy`.
- Aprovação: "sim" do usuário em 03/11/2026 para salvar este plano. A implementação só começa com `/implementar`.

## Resumo

O cron do Render falha na carga de contratos por falta de memória do DuckDB: o gravador abre o banco de trabalho com teto fixo de 160 MB ([writer.ts:49](../backend/src/modules/tenders/contractStore/writer.ts#L49)), e as execuções 102 (31/10) e 117 (02/11) pararam com `Out of Memory Error ... (152.4 MiB/152.5 MiB used)`, jogando fora horas de leitura. O sistema ainda não tem clientes e o custo importa, então a coleta de editais e contratos passa a rodar numa máquina própria (24 h), gravando direto na produção (Postgres do Render e R2 `producao/`), com o cron do Render suspenso até haver clientes.

O código ganha duas variáveis de ambiente (memória do DuckDB e limite de disco), com padrões seguros para o Render, e um script PowerShell com dois modos: carga do histórico em laço e rotina diária. Nada muda na tela, no banco (sem migration) nem nas variáveis do Render.

## Escopo

### Dentro do escopo

- Variável `TENDERS_DUCKDB_MEMORY_MB` (padrão 1024) usada pelo gravador de contratos da coleta.
- Variável `TENDERS_DISK_LIMIT_MB` (padrão 1600) usada pelo orçamento de disco do coletor.
- Padrão do gravador de 160 para 1024 MB e atualização dos comentários e do README que citam 160 MB.
- Script `backend/scripts/run-collector-on-pc.ps1` com os modos `backfill` e `daily`.
- Arquivo de ambiente mínimo para a máquina (5 variáveis), em vez de copiar os `.env`.
- Seção "Rodar numa máquina própria" no README do módulo.
- Testes da configuração e do orçamento.

### Fora do escopo

- Publicação do armazém por tempo, log de fase do DuckDB e pico de memória (ficam para depois, se o estouro persistir).
- Página HTML de acompanhamento (a tela Configurações › Coleta e o log em debug bastam).
- Qualquer mudança no Render: o cron continua suspenso e não é deletado.
- Ensaio local com a base final (~5 milhões de contratos) para o disco do Render: plano separado, antes de religar o cron.
- Redesenho da cópia de trabalho (baixar só as partições necessárias).
- Gravador dos vencedores (128 MB, etapa desligada) e leitor do Web Service.
- Mudança de `PNCP_TERMS_INTERVAL_MS`, migrations, alteração de `.env` ou de CI/CD.

## Leitura de contexto

- `/AGENT.md`: sem código sem aprovação; Node `22.17.0` e npm `10.9.2`; identificadores de código em inglês; sem `catch` silencioso. As regras multi-tenant não se aplicam: o coletor grava em tabelas globais (`licitacoes.*`) e no R2, sem tenant.
- `frontend/AGENT.md` e `backend/AGENT.md`: não existem no projeto.
- `/CLAUDE.md`: fluxo `/planejar` → aprovação → `/implementar` → `/finalizar`; `.env` só com confirmação explícita; nenhuma migration; o banco pode ser a produção.
- Código lido: `services/dailyJobs.ts`, `services/dailyJobSteps.ts`, `collector/contractRuns.ts`, `collector/runContractStore.ts`, `collector/runtime.ts`, `collector/config.ts`, `collector/resourceBudget.ts`, `collector/repository.ts`, `collector/cli.ts`, `contractStore/writer.ts`, `contractStore/layout.ts`, `contractStore/duckdb.ts`, README do módulo de licitações.
- Evidências de ambiente (03/11/2026, somente leitura): logs do Cron no Render, tela de Billing, contagem de contratos por ano na API pública do PNCP e latência do PNCP medida a partir do PC do usuário.

## Evidências que sustentam o plano

- O teto de 160 MB do DuckDB é fixo no código desde 19/10/2026 (medido com 351 mil contratos e Cron de 512 MB). A base já tem ~2,2 milhões de contratos e a máquina do cron tem 2 GB.
- As duas quedas ocorreram no fim da geração da primeira publicação do bloco: a pasta de trabalho tinha ~330 MB e ~130 arquivos Parquet novos e nada foi enviado ao R2. O código dos vigentes mudou em `9f3cc5f` (30/10): suspeita, não prova.
- O orçamento de disco mede a pasta temporária inteira (`tmpdir()`), com limite fixo de 1,6 GB ([resourceBudget.ts:6](../backend/src/modules/tenders/collector/resourceBudget.ts#L6), [runtime.ts:59](../backend/src/modules/tenders/collector/runtime.ts#L59)).
- A trava dos contratos é um `pg_try_advisory_lock` de sessão ([repository.ts:42](../backend/src/modules/tenders/collector/repository.ts#L42)): coleta diária, carga, avisos e federais nunca rodam juntos.
- A guarda de [config.ts:247](../backend/src/modules/tenders/collector/config.ts#L247) só recusa `producao` com banco local. Banco de produção com pasta `local` não é recusado.
- Falta carregar ~3,0 milhões de contratos (PNCP, publicados antes de 25/10/2025): 2021 5 mil, 2022 41 mil, 2023 243 mil, 2024 1,09 milhão, 2025 até 24/10 1,63 milhão.
- Do PC, uma consulta de termos ao PNCP leva ~50 ms, contra um ciclo de ~0,9 a 1,0 s no Render.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

- `config.ts`: duas variáveis novas no esquema do coletor, num grupo novo da configuração (`resources`), para não alterar o formato de `config.contracts`.
- `runtime.ts`: o orçamento de disco recebe o limite configurado.
- `runContractStore.ts`: o gravador recebe a memória configurada.
- `writer.ts`: novo padrão de memória e comentários corrigidos.
- O mesmo gravador atende coleta diária, carga e federais, todos pelo `RunContractStore`.

### Banco de dados

Sem impacto esperado. Nenhuma migration e nenhum schema novo. O script usa os comandos existentes da CLI (`contracts-backfill`) e da rotina (`daily-jobs`), que gravam nas tabelas que já existem.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Render: sem mudança de variável ou serviço. O merge na `main` dispara o auto-deploy do Web Service, que não usa o gravador. O cron fica suspenso.
- Máquina 24 h (outra máquina, não este PC): ver "Preparação da máquina" abaixo.

## Arquivos provavelmente afetados

- `backend/src/modules/tenders/collector/config.ts` e `config.test.ts`
- `backend/src/modules/tenders/collector/runtime.ts`
- `backend/src/modules/tenders/collector/runContractStore.ts`
- `backend/src/modules/tenders/contractStore/writer.ts` (padrão e comentários)
- `backend/src/modules/tenders/contractStore/layout.ts` (comentário da linha 20)
- `backend/src/modules/tenders/README.md` (linhas 297 e 306, tabela de variáveis e a seção nova)
- `backend/scripts/run-collector-on-pc.ps1` (novo)

## Estratégia de implementação

1. Criar a branch nova a partir da `main` (sugestão: `feat/R/collector-on-own-machine`).
2. `config.ts`: `TENDERS_DUCKDB_MEMORY_MB` (inteiro, mínimo 128, máximo 16384, padrão 1024) e `TENDERS_DISK_LIMIT_MB` (inteiro, mínimo 512, padrão 1600, em MB decimais para manter 1.600.000.000 bytes). Expor em `CollectorConfig.resources`.
3. `runtime.ts`: criar o `CollectorResourceBudget` com `limitBytes` vindo da configuração.
4. `runContractStore.ts`: repassar `memoryLimitMb` ao `ContractStoreWriter.open`. Conferir no código se algum outro ponto abre o gravador sem passar por `RunContractStore`.
5. `writer.ts`: padrão 160 para 1024; reescrever o comentário das linhas 47 e 48 dizendo que 160 MB foi medido com 351 mil contratos e estourou com ~2,2 milhões. Corrigir `layout.ts:20` e o README.
6. Script `run-collector-on-pc.ps1`:
   - Parâmetros: `-Mode backfill|daily`, `-EnvFile` (padrão `C:\tmp\coletor\collector.env`), `-WorkDir` (padrão `C:\tmp\coletor`), `-MaxMinutes` (padrão 600) e `-Yes`.
   - Lê só 5 variáveis do arquivo de ambiente: `TENDERS_COLLECTOR_DATABASE_URL`, `TENDERS_ARCHIVE_ENDPOINT`, `TENDERS_ARCHIVE_BUCKET`, `TENDERS_ARCHIVE_ACCESS_KEY_ID`, `TENDERS_ARCHIVE_SECRET_ACCESS_KEY`. Falta de variável: erro citando só o nome.
   - Define para o processo: `TENDERS_STORAGE_PREFIX=producao`, `TEMP` e `TMP` apontando para `WorkDir\tmp` (pasta própria, porque o orçamento mede a pasta temporária inteira), `TENDERS_FEDERAL_ENABLED=1`, `TENDERS_FEDERAL_MINUTES=30`, `TENDERS_DUCKDB_MEMORY_MB=3072`, `TENDERS_DISK_LIMIT_MB=20000`, `TENDERS_COLLECTOR_LOG_LEVEL=debug`.
   - Recusa host de banco local. Imprime só o host. Sem `-Yes`, pede confirmação digitada ("gravar na produção, host X?"); o Agendador usa `-Yes`.
   - Nunca imprime valores de variáveis nem usa `catch` silencioso.
   - Grava o log em `WorkDir\logs\` (`Tee-Object`).
   - Modo `backfill`: repete `npm --prefix backend run tenders -- contracts-backfill --from 2021-01-01 --max-minutes <MaxMinutes>`. Para ao ver "Carga de contratos sem dia pendente" no log. Bloco com menos de 5 minutos sem terminar: espera 10 minutos e tenta de novo (trava presa ou PNCP fora). Para depois de 6 tentativas seguidas ou 3 saídas com erro seguidas.
   - Modo `daily`: `npm --prefix backend run daily-jobs`. A etapa `plan-lifecycle` falha por falta de `BILLING_CRON_SECRET` na máquina, o que é esperado e deixa o código de saída em 1. O script lista no fim as etapas que falharam, ignorando essa, e usa essa lista (não o código de saída) para decidir se houve problema.
7. README do módulo: seção "Rodar numa máquina própria" com a preparação, os dois modos, o arquivo de ambiente mínimo, o teste de 30 minutos, o aviso de não criar a tarefa diária antes de a carga acabar (a trava impede os dois juntos) e como religar o cron do Render no futuro.
8. Rodar build e testes, um de cada vez (limite de memória do computador).

## Preparação da máquina 24 h (feita pelo usuário, fora do código)

- Sistema operacional: a confirmar (ver perguntas em aberto). O script assume PowerShell no Windows; em Linux ou macOS o `TEMP` vira `TMPDIR` e o caminho padrão muda.
- Node `22.17.0` e npm `10.9.2` (como no `AGENT.md`), git, clone do repositório na `main` depois do merge, `npm ci` em `backend`.
- Arquivo de ambiente `C:\tmp\coletor\collector.env` com só as 5 variáveis. Não copiar os `.env` e `.env.dev` inteiros: têm outros segredos (tokens de pagamento, JWT). O arquivo fica fora do repositório e nunca vai para commit.
- O Postgres do Render (Access Control) precisa aceitar conexões da rede dessa máquina.
- Energia: sem suspensão, atualizações automáticas pausadas na semana da carga, ao menos 5 GB livres.
- Primeiro teste: `-Mode backfill -MaxMinutes 30`. Conferir no log "Armazém de contratos publicado" e, em Configurações › Coleta, os dias marcados. Só então deixar o laço rodando (~3,5 a 4 dias, estimativa).
- Depois da carga: o usuário cria a tarefa do Agendador de Tarefas (padrão 19:00) com `-Mode daily -Yes`.

## Regras de negócio identificadas

- A coleta de editais e contratos continua igual; só muda onde roda e quanto de memória e disco o gravador pode usar.
- Um gravador de contratos por vez (a trava do Postgres). Cron do Render e máquina própria nunca rodam a coleta ao mesmo tempo.
- Os dias da carga só são marcados em `contrato_carga_dia` depois da publicação no R2. Interromper o processo perde só o que ainda não foi publicado.
- Enquanto não houver clientes, a rotina de planos (`plan-lifecycle`) e os avisos não rodam. Eles voltam com o cron do Render.

## Regras multi-tenant e segurança

- Tabelas do coletor são globais: não há filtro de tenant a aplicar.
- Segredos: nunca impressos ou registrados em log; o arquivo de ambiente tem só o necessário e fica fora do repositório.
- Escrita em produção a partir de outra máquina: o script confirma o host com o usuário, recusa banco local e define a pasta `producao` sempre. Deve ser rodado pelo usuário, no próprio terminal.
- Nenhuma credencial é alterada; nenhum `.env` é editado.

## Validações necessárias

- `TENDERS_DUCKDB_MEMORY_MB` e `TENDERS_DISK_LIMIT_MB`: inteiros dentro das faixas; valor inválido gera `CollectorConfigError` com o nome da variável.
- Script: arquivo de ambiente existente e completo, host de banco não local, `Mode` válido, `MaxMinutes` entre 1 e 600.

## Testes necessários

### Frontend

Não se aplica.

### Backend

- `config.test.ts`: padrões (1024 e 1600), valores válidos, limites mínimos e máximos e erro para valor inválido.
- Orçamento: um teste de que o limite configurado chega ao `CollectorResourceBudget`.
- Gravador: o padrão novo vale quando nada é passado, e `memoryLimitMb` explícito continua valendo (os testes existentes que passam 128 ou 160 seguem como estão).
- O ensaio de volume opt-in (`TENDERS_VOLUME_TESTS=1`) continua passando.
- Os testes de PostgreSQL ficaram desligados na entrega anterior e só rodam com banco local pronto. Se não rodarem, registrar isso.

### E2E

Manual: teste de 30 minutos na máquina própria (ver acima).

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
```

Rodar um de cada vez. O `backend` não tem scripts `lint` nem `typecheck` separados: o `build` executa `tsc --noEmit`.

## Riscos e pontos de atenção

- 1 GB (padrão) e 3 GB (máquina própria) podem não bastar. O log atual não diz qual fase estoura. Se persistir, o próximo passo é registrar a fase e o pico de memória e reduzir o trabalho da publicação, não subir o teto indefinidamente.
- Queda de energia ou de internet com a conexão do Postgres aberta pode deixar a trava presa até o banco notar. O script espera e tenta de novo.
- A guarda de config só protege um lado (`producao` com banco local); o script cobre o outro. Corrigir a guarda no código fica como melhoria futura.
- A cópia de trabalho baixa a base inteira. Com a base indo a ~1,0 a 1,3 GB, o pico de uma publicação deve passar de 1,6 GB: no Render a carga e a rotina diária podem parar por "disco". Antes de religar o cron, fazer o ensaio local de ~5 milhões de contratos. O Web Service também guarda uma cópia local e não foi medido com a base maior.
- Ao religar o cron do Render: voltar `TENDERS_CONTRACTS_BACKFILL_FROM` para `2021-01-01` (a carga só sai como concluída se todos os dias já estiverem marcados) e desativar a tarefa da máquina própria.
- O mínimo de US$ 1 por mês de Cron Job pode ou não valer com o cron suspenso; conferir na fatura fechada de novembro.

## Perguntas em aberto

1. Qual é o sistema operacional da máquina 24 h (Windows ou Linux)? Define se o script é PowerShell ou shell.
2. O Postgres de produção aceita conexões da rede dessa máquina (Render › Postgres › Access Control)?
3. Horário do modo diário: 19:00 proposto.

## Critérios de aceite do plano

- `npm --prefix backend run build` e os testes do backend passam, um de cada vez.
- Sem as variáveis novas, o coletor se comporta como antes, com o teto de memória de 1024 MB no lugar de 160.
- As duas variáveis são validadas e documentadas no README.
- O script confere o banco e a pasta, imprime só o host, não imprime segredos e encerra a carga ao ver "sem dia pendente".
- O teste de 30 minutos na máquina própria publica uma revisão no R2 e marca dias carregados.
- Nenhum `.env`, migration ou configuração do Render foi alterado.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto. Seguir `/AGENT.md` e `/CLAUDE.md`: identificadores em inglês, sem `catch` silencioso, mudanças pequenas e focadas.
- Não executar migrations e não alterar `.env`.
- Não rodar o script contra a produção: quem roda é o usuário, no próprio terminal, com a máquina própria.
- Rodar build e testes um de cada vez e dizer, no relatório, o que não pôde ser rodado (testes de PostgreSQL, script na máquina própria).
