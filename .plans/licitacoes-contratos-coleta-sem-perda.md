# Plano de Implementação: coleta diária de contratos sem perder dias

## Origem

- Arquivo de especificação: sem arquivo. É o risco encontrado em 2026-10-14, ao explicar a coleta diária dos contratos, com as três decisões do usuário nesta conversa.
- Plano relacionado: `.plans/licitacoes-contratos-a-vencer.md` (Partes A e B, ainda sem merge).
- Data do planejamento: `2026-10-14`
- Classificação: `fullstack` (backend e um pouco de front; sem migration e sem variável nova)

## Resumo

Hoje a coleta diária de contratos (`CONTRATOS_DIARIA`) lê sempre de ontem a hoje. Se uma execução falha (Render fora, PNCP fora a manhã toda, consulta interrompida), o resto do dia anterior nunca mais é lido:

- os contratos publicados naquele dia ficam de fora;
- as prorrogações daquele dia se perdem, e a limpeza apaga o contrato na data antiga.

Os editais não têm esse problema: a varredura relê todo dia os editais com proposta aberta.

O plano faz três coisas:

- cada consulta da coleta diária começa do último dia que ela leu sem falha, com até 7 dias por execução; um buraco maior continua na execução seguinte;
- os aditivos que falharam são reconsultados nos dias seguintes;
- Configurações › Coleta mostra o período lido e as duas recuperações.

## Decisões do usuário (2026-10-14)

- **Decisão 1 (limite):** até 7 dias por execução. Um buraco maior é recuperado em etapas, sem dia perdido e sem comando manual. Ajuste aprovado na revisão: no lugar do comando manual e do aviso de "dias sem coleta" da primeira versão.
- **Decisão 2 (aditivos):** reconsultar os aditivos que falharam, até 200 por dia.
- **Decisão 3 (branch):** fazer na branch da Parte A e levar para a da Parte B com merge, sem force push.

## Escopo

### Dentro do escopo

- Janela por consulta (publicados e atualizados) a partir da última coleta completa daquela consulta, com até 7 dias por execução.
- Gravar nos detalhes da execução o período e se cada consulta terminou.
- Reconsulta dos aditivos pendentes: até 200 por execução, para depois de 3 falhas seguidas.
- Na Parte B, o aviso `CONTRATO_ALTERADO` também na reconsulta.
- Configurações › Coleta, no bloco Contratos: período lido, nota de recuperação e nota da reconsulta.
- Testes, README do módulo e uma nota no plano dos contratos.
- Conferência local: o PNCP aceita uma faixa de 8 dias, e uma coleta diária completa no banco local.

### Fora do escopo

- O aditivo que o órgão não publica, ou o sinal de alteração que falha: continua sem como saber.
- Os editais: a varredura diária já relê todos os abertos.
- A carga inicial: continua igual. Só as falhas de aditivos dela passam a ser reconsultadas.
- Aviso por e-mail quando a rotina falhar.
- Comando manual de recuperação (`--from`): não precisa com a recuperação em etapas.
- Migration, índice novo e variável de ambiente nova.

## Leitura de contexto

- `/AGENT.md` (raiz).
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem no projeto; vale o `/AGENT.md` da raiz.
- `/CLAUDE.md`.
- `backend/src/modules/tenders/README.md`: seções "Contratos a vencer (dados)" e "Contratos a vencer: busca, favoritos e avisos".
- `.plans/licitacoes-contratos-a-vencer.md`.
- Código lido:
  - backend: `collector/contractRuns.ts`, `collector/runs.ts` (`withCollectionRun`, `RunTally`, varredura e incremental dos editais), `collector/contractRepository.ts` (`upsertContractPage`), `collector/contractMapping.ts` (`hasChangeSignal`), `db/schema.ts` (`tenderContracts`, `tenderCollectionRuns`, `tenderContractBackfillDays`), `collector/config.ts`, `collector/cli.ts`, `services/dailyJobSteps.ts`, `services/collectionOverview.ts` e `collector/docs/pncp-openapi.json` (sem limite de faixa de datas documentado);
  - front: `src/tenders/components/CollectionPanel.tsx` e `src/tenders/utils/collectionRuns.ts`.

## Impacto por área

### Frontend

- Configurações › Coleta, `ContractsCard` em `components/CollectionPanel.tsx`, para a última `CONTRATOS_DIARIA`:
  - linha "Período lido" (dd/mm/aaaa a dd/mm/aaaa), a partir de `details.queries` (menor início, maior fim); execução antiga sem `queries` usa `details.period`; sem nenhum dos dois, a linha não aparece;
  - nota quando a coleta estiver recuperando (algum fim antes de `details.today`): "Recuperando dias sem coleta: lido até dd/mm/aaaa; continua na próxima rotina.";
  - nota da reconsulta (só com algo a dizer): "N aditivos reconsultados; N ainda pendentes." e, se parou por falhas, "A reconsulta dos aditivos parou porque o PNCP não respondeu; continua na próxima rotina.".
- Helper novo e puro em `utils/collectionRuns.ts` (ex.: `dailyCollectionSummary(run)` → `{ period, notes }`), lendo os detalhes com checagem de tipo (eles são `unknown`).
- Sem chamada nova à API: os detalhes já chegam em `status.latestRuns`.
- Estados de carregamento e erro: os que o painel já tem.

### Backend

- **Regra da janela** (função pura em `collector/contractRuns.ts`, ex.: `dailyContractWindow(today, lastCompletedDay)` → `{ from, to }`, dias AAAA-MM-DD em Brasília):
  - `from` = `lastCompletedDay`; sem ele, ou se for depois de ontem, ontem;
  - `to` = o menor entre hoje e `from + 7` (constante `DAILY_MAX_WINDOW_DAYS = 7`);
  - o fim de uma execução em etapas é relido na seguinte (um dia de sobreposição, sem efeito).
- **Última coleta completa de cada consulta** (`collector/contractRepository.ts`, ex.: `readLastCompletedDailyDays(db)`):
  - a `CONTRATOS_DIARIA` mais recente (status diferente de `EXECUTANDO`) em que aquela consulta aparece em `detalhes.queries` com `completed: true`; o resultado é o `to` dela;
  - consulta com o Drizzle; o teste de contenção do JSONB (`@>`) vai num fragmento `sql` parametrizado, porque o Drizzle não tem esse operador. O motivo fica comentado no código;
  - uma consulta por endpoint (2 no total), em `coleta_execucao`, que é pequena;
  - valor fora do formato AAAA-MM-DD é ignorado;
  - execuções anteriores a esta mudança (sem `queries`) não contam: cai em ontem, como hoje.
- **`runContractsDaily`:**
  - lê os últimos dias completos dentro da trava (a execução atual está `EXECUTANDO` e não conta);
  - calcula a janela de cada endpoint (`contratos` e `contratos-atualizacao`);
  - grava `details.today` e `details.period` (faixa total, no formato do PNCP, mantido por compatibilidade);
  - ao terminar cada consulta, acrescenta em `details.queries` `{ endpoint, from, to, completed, recordsRead }`. Assim uma falha fatal depois da primeira consulta ainda deixa a primeira gravada (`withCollectionRun` grava os detalhes também na falha);
  - "terminou" = `counts.completed` (sem interrupção do PNCP). Erro de registro ou de aditivos não segura o início.
- **Reconsulta dos aditivos** (depois das duas consultas, na mesma execução):
  - **pendente:** contrato com sinal de alteração (`data_atualizacao_global > data_publicacao_pncp + 24 h`, como `hasChangeSignal`) e `aditivos_referencia IS DISTINCT FROM data_atualizacao_global`. É o que sobra hoje quando o PNCP falha nos termos, na diária ou na carga;
  - até 200 por execução (`TERMS_RETRY_LIMIT = 200`), do `data_atualizacao_global` mais antigo para o mais novo (desempate por `id`);
  - para depois de 3 falhas seguidas (`MAX_CONSECUTIVE_TERMS_FAILURES = 3`), como a carga faz com os dias;
  - mesma regra de vencimento: extrair de `resolveContractExpiry` a parte que consulta e interpreta os termos (ex.: `checkContractTerms`) e usá-la nos dois caminhos, sem duplicar:
    - com termos: vencimento por `contractExpiryFromTerms`, os aditivos e `aditivos_referencia` = `data_atualizacao_global`;
    - termos não encontrados (404): fim original, `aditivos = []` e a referência;
    - termo inválido: conta erro, como hoje; aditivo de prazo sem data: conta em `termsWithoutEndDate`;
  - falha do PNCP: conta erro (`kind: 'terms'`) e o contrato continua pendente;
  - grava no fim, numa transação (até 200 `UPDATE` por número de controle). Os conferidos somam em `updatedCount`;
  - detalhes: `details.termsRetry = { pendingAtStart, checked, resolved, expiryChanged, failed, stoppedByFailures }`;
  - o total pendente é um `count` com a mesma condição. Ele lê a tabela inteira (sem índice novo, para não precisar de migration): alguns segundos por dia depois da carga.
- **Parte B (rodada 2):** a reconsulta chama `notifyChangedContractExpiry(db, números com vencimento novo)` e soma em `notificationCount`, como a coleta já faz.
- **Sem mudança:** CLI, rotina diária (`dailyJobSteps`), agenda e travas.

### Banco de dados

Sem impacto esperado no schema: nenhuma migration, tabela, coluna ou índice novo. O ponto de partida fica em `licitacoes.coleta_execucao.detalhes`, que já existe. A reconsulta só atualiza colunas que já existem em `licitacoes.contrato` (`vencimento`, `aditivos`, `aditivos_referencia`).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem variável nova e sem mudança no Cron Job do Render.
- Duração: igual nos dias normais. Depois de uma falha, cada dia recuperado soma de 20 a 25 min (no máximo cerca de 2,5 h por execução, numa janela de 8 dias). A reconsulta soma no máximo cerca de 2 min (200 a 0,5 s).
- Custo: menos de US$ 0,01 por dia recuperado. Nos dias normais, nada muda.
- Durante a carga inicial (blocos de 8 h na mesma rotina), uma recuperação longa deixa a rotina perto do limite de duração do Cron Job (12 h pela documentação do Render; conferir antes do merge).
- Ordem até a produção, sem mudança: 0085, merge da Parte A (já com esta correção), carga, 0086 e merge da Parte B.

## Arquivos provavelmente afetados

Rodada 1, na branch `feat/R/licitacoes-contratos-a-vencer`:

- `backend/src/modules/tenders/collector/contractRuns.ts`
- `backend/src/modules/tenders/collector/contractRepository.ts`
- `backend/src/modules/tenders/collector/contractRuns.test.ts`
- `backend/src/modules/tenders/collector/contractRuns.db.test.ts`
- `backend/src/modules/tenders/README.md`
- `src/tenders/components/CollectionPanel.tsx`
- `src/tenders/utils/collectionRuns.ts`
- `src/tenders/utils/collectionRuns.test.ts`
- `.plans/licitacoes-contratos-a-vencer.md` (nota na seção da coleta diária)

Rodada 2, na branch `feat/R/licitacoes-contratos-parte-b`:

- `backend/src/modules/tenders/collector/contractRuns.ts`
- `backend/src/modules/tenders/collector/contractRuns.db.test.ts`
- Os arquivos que o merge da A na B tocar (provável conflito em `contractRuns.ts`, `contractRuns.db.test.ts`, `README.md`, `.plans/licitacoes-contratos-a-vencer.md` e `src/tenders/utils/collectionRuns.test.ts`).

## Estratégia de implementação

Duas rodadas, cada uma com `/implementar` e `/finalizar`, chamados pelo usuário. Não criar branch nova.

### Rodada 1: branch da Parte A

1. Encerrar os servidores locais (árvore inteira de processos) e trocar para `feat/R/licitacoes-contratos-a-vencer`. A árvore de trabalho está limpa, só com arquivos não rastreados, que não entram.
2. Função pura da janela e constantes, com testes em `contractRuns.test.ts`.
3. `readLastCompletedDailyDays` em `contractRepository.ts`.
4. `runContractsDaily`: janela por endpoint, `details.today`, `details.period` e `details.queries` gravado ao fim de cada consulta.
5. Extrair `checkContractTerms` de `resolveContractExpiry`, sem mudar o comportamento (os testes atuais continuam passando).
6. Reconsulta: contagem e leitura dos pendentes, loop com limite e parada, gravação numa transação e `details.termsRetry`.
7. Testes de banco em `contractRuns.db.test.ts` (lista abaixo).
8. Front: helper em `collectionRuns.ts`, com testes, e as linhas e notas no `ContractsCard`.
9. README ("Coleta diária e limpeza": regra da janela, recuperação em etapas e reconsulta) e nota no plano dos contratos.
10. Validações (comandos abaixo).
11. Conferência local, só leitura do PNCP e banco local:
    - consulta direta ao PNCP com faixa de 8 dias nos dois endpoints (página 1 de cada). Se o PNCP recusar, a janela vira uma consulta por dia, com a mesma regra, e o plano é atualizado;
    - uma coleta diária completa com `npm --prefix backend run tenders:dev -- contracts-daily` (de 25 a 30 min), conferindo `queries`, `today` e `termsRetry`, e o bloco Contratos no navegador local;
    - medir o tempo do `count` dos pendentes no banco local, para estimar o da produção.
12. Parar para o `/finalizar` do usuário: commit e push da Parte A, sem merge na `main`.

### Rodada 2: branch da Parte B

1. Trocar para `feat/R/licitacoes-contratos-parte-b` e fazer `git merge feat/R/licitacoes-contratos-a-vencer`, sem force push. Se der conflito, parar, mostrar os trechos e só resolver com o OK do usuário.
2. Ligar `notifyChangedContractExpiry` à reconsulta e somar em `notificationCount`.
3. Teste de banco: reconsulta com vencimento novo avisa quem favoritou, e não avisa quando o vencimento não muda.
4. Validações completas (DB tests em mais de uma rodada, porque os arquivos rodam em paralelo).
5. Parar para o `/finalizar` do usuário: commit e push da Parte B, sem merge na `main`.

## Regras de negócio identificadas

- **Dia normal:** a coleta continua de ontem a hoje.
- **Janela por consulta:** começa no dia da última coleta em que aquela consulta terminou sem falha do PNCP. Sem nenhuma, ontem. Nunca depois de ontem.
- **Fim da janela:** hoje, ou no máximo 7 dias depois do início. O que faltar fica para a próxima execução, que continua de onde parou.
- **O que não segura o início:** erro de registro (formato) e falha nos aditivos de um contrato.
- **Reconsulta:** contrato com sinal de alteração e aditivos não conferidos para a atualização atual. Até 200 por dia, do mais antigo para o mais novo, parando depois de 3 falhas seguidas. Mesma regra de vencimento da coleta.
- **Vencimento novo pela reconsulta (Parte B):** quem favoritou recebe "Vencimento de contrato favorito mudou para dd/mm/aaaa". Os avisos de 90 e 30 dias seguem a data nova (a referência do aviso é o vencimento).
- **Reler um dia já lido:** não duplica contratos (gravação pelo número de controle) nem avisos (índice único).

## Regras multi-tenant e segurança

- Dados globais e públicos do PNCP (`licitacoes.contrato` e `licitacoes.coleta_execucao`), sem dado de conta. Nada a filtrar por conta nessas consultas.
- Os detalhes da execução só guardam datas, contagens e números de controle públicos.
- Configurações › Coleta continua restrita a titular ou admin, como hoje.
- Avisos (Parte B): só pelo `notifyChangedContractExpiry`, que já filtra as contas com acesso (`fn_conta_com_acesso`) e quem favoritou.
- Não há entrada do cliente nova.

## Validações necessárias

- Sem entrada de usuário nova.
- Ao ler `detalhes.queries` das execuções anteriores: só vale o `to` no formato AAAA-MM-DD; o resto é ignorado.
- Data futura ou depois de ontem vira ontem.
- No front, cada campo dos detalhes é checado antes de exibir; o que faltar não aparece.

## Testes necessários

### Frontend

- `collectionRuns.test.ts`:
  - período a partir de `queries`;
  - período a partir de `period` (execução antiga);
  - sem nenhum dos dois, sem linha;
  - nota de recuperação quando algum fim é antes de `today`;
  - nota da reconsulta, com e sem pendentes;
  - nota de parada por falhas.

### Backend

- `contractRuns.test.ts` (janela, sem banco):
  - sem histórico: ontem a hoje;
  - última completa ontem ou hoje: ontem a hoje;
  - há 3 dias: de D-3 a hoje;
  - há 10 dias: de D-10 a D-3, e a seguinte (com D-3) fica em dia;
  - data futura: ontem a hoje.
- `contractRuns.db.test.ts`:
  - grava `queries` (período e `completed`) e `today`; num dia normal, a janela é ontem a hoje;
  - falha do PNCP só nos atualizados: a próxima pede os atualizados desde o início da que falhou, e os publicados desde ontem;
  - falha fatal (erro que não é do PNCP) na segunda consulta: a primeira fica gravada como completa e conta para a seguinte;
  - execução órfã (`EXECUTANDO`) e execuções sem `queries` não contam;
  - recuperação em etapas: última completa há 10 dias dá uma janela de 8 dias e a nota de recuperação; a seguinte fica em dia;
  - reconsulta: pendente é consultado e o vencimento e a referência gravados; 404 grava `aditivos = []`; falha mantém pendente e conta erro; 3 falhas seguidas param; limite respeitado (parâmetro de limite para o teste); sem sinal ou já conferido não entra;
  - os testes atuais da coleta, da carga e da trava continuam passando.
- Rodada 2 (`contractRuns.db.test.ts` na Parte B): a reconsulta com vencimento novo gera `CONTRATO_ALTERADO` para quem favoritou; sem mudança de vencimento, nenhum aviso.

### E2E

- Conferência local da etapa 11 da rodada 1: faixa de 8 dias aceita pelo PNCP, coleta diária completa no banco local, detalhes gravados e o bloco Contratos no navegador local.
- Na rodada 2, abrir Configurações › Coleta e a tela de contratos no navegador local, para ver que o merge não quebrou nada.

## Comandos de validação sugeridos

```bash
npm test
npm --prefix backend test
npm --prefix backend run test:tenders-db   # banco local (.env.dev)
npx tsc -p tsconfig.json
npm --prefix backend run build             # tsc --noEmit do backend
npx vite build
npm --prefix backend run tenders:dev -- contracts-daily   # conferência local
```

## Riscos e pontos de atenção

- **Execução mais longa depois de uma falha:** até cerca de 2,5 h a mais. Durante a carga inicial, isso se soma ao bloco de 8 h e chega perto do limite do Cron Job (12 h pela documentação do Render; conferir).
- **Faixa de 8 dias:** o PNCP pode recusar uma faixa assim numa só consulta (a documentação não fala em limite). A conferência local responde. Se recusar, a janela vira uma consulta por dia, com a mesma regra.
- **Contagem dos pendentes:** lê a tabela inteira uma vez por dia (cerca de 700 MB de dados depois da carga). São alguns segundos, e o tempo é medido no local. Um índice parcial exigiria migration e fica fora.
- **Falha permanente nos aditivos:** mais de 200 contratos sempre falhando atrasariam os outros. O total pendente fica nos detalhes.
- **Merge da A na B:** provável conflito nos arquivos listados. Parar e mostrar antes de resolver.
- **Trocar de branch com os servidores locais rodando:** encerrar antes, para não misturar o código das duas partes.
- **Banco local com a 0086:** o código da Parte A ignora essas tabelas, sem efeito.
- **Uma parada de mais de uma semana:** os contratos do dia demoram de 1 a 2 dias a mais para aparecer, enquanto a coleta recupera em etapas.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. A faixa aceita pelo PNCP e o tempo da contagem são conferidos na implementação.

## Critérios de aceite do plano

- Num dia normal, a coleta lê de ontem a hoje, como antes.
- Depois de uma falha do PNCP numa consulta, a execução seguinte relê aquela consulta desde o início da que falhou.
- Uma parada de mais de 7 dias é recuperada em etapas de até 8 dias, sem dia perdido.
- Os aditivos que falharam são reconsultados (até 200 por dia, parando depois de 3 falhas seguidas) e o vencimento é corrigido.
- Na Parte B, quem favoritou recebe `CONTRATO_ALTERADO` quando a reconsulta muda o vencimento.
- Configurações › Coleta mostra o período lido e as notas de recuperação e de reconsulta.
- Sem migration e sem variável nova.
- Testes, `tsc` e builds passando nas duas branches; merge da A na B sem force push.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, com o `/AGENT.md` da raiz.
- Duas rodadas, nas branches que já existem: rodada 1 na `feat/R/licitacoes-contratos-a-vencer`, rodada 2 na `feat/R/licitacoes-contratos-parte-b`. Não criar branch nova.
- Commit e push só no `/finalizar`, chamado pelo usuário. Nunca merge na `main`.
- Não executar migrations, não alterar `.env` e não rodar nada na produção. Conferência local só com `tenders:dev`.
- Reusar `withCollectionRun`, `collectContractQuery`, `contractExpiryFromTerms`, a parte de termos de `resolveContractExpiry` (extraída) e o padrão de parada da carga (`MAX_CONSECUTIVE_FAILED_DAYS`).
- Queries novas com o Drizzle. Só o teste de contenção do JSONB vai num fragmento `sql` parametrizado, com o motivo no código.
- Merge da A na B: `git merge`, sem force. Conflito, parar e mostrar ao usuário.
- Manter as mudanças pequenas e os nomes em inglês. Textos de tela em português.
