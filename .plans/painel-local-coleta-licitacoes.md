# Plano de Implementação: Painel local da coleta de Licitações (atalho + painel com botão e relógio)

## Origem

- Arquivo de especificação: nenhum. A origem é o pedido do usuário em 15/11/2026, depois de a carga histórica terminar e a rotina diária (`-Mode daily`) passar a rodar neste PC. Referência: `.plans/coleta-licitacoes-no-pc.md` e o README de Licitações (`apps/tenders/api/README.md`).
- Data do planejamento: 2026-11-15.
- Classificação: `infra/ferramenta local` (sem mudança em tela do sistema, banco ou deploy).
- Aprovação: "pode salvar" do usuário em 15/11/2026 para salvar este plano. A implementação só começa com `/implementar` e aprovação explícita.

## Resumo

Hoje a rotina diária é iniciada por comando de PowerShell. O usuário quer iniciá-la com um botão e escolher o horário da execução automática, sem depender do Claude (custo de tokens). Uma página HTML sozinha não consegue iniciar programas no PC, então o plano cria um servidor local pequeno, em Node puro e só em `127.0.0.1`, que serve a página e executa comandos fixos. Junto vem um atalho de clique duplo (opção 1).

O painel **não** fica dentro do sistema Fingerence: o sistema roda no Render e não alcança o PC, e um botão que grava na produção não pode ficar exposto na internet.

O relógio usa o Agendador de Tarefas do Windows (tarefa "Licitacoes - rotina diaria"), não um timer do painel, para valer com o painel fechado e depois de reinício do PC.

## Escopo

### Dentro do escopo

Pasta nova `apps/tenders/api/scripts/painel-coleta/`:

| Arquivo | Função |
|---|---|
| `rodar-coleta.cmd` | Opção 1. Clique duplo abre o PowerShell com `run-collector-on-pc.ps1 -Mode daily`, mantendo o `SIM` digitado e a janela aberta no fim |
| `abrir-painel.cmd` | Sobe o servidor e abre `http://localhost:3099` no navegador |
| `servidor.mjs` | Servidor HTTP em Node puro, sem dependência nova nem build |
| `logica.mjs` | Funções puras: ler o log, validar horário, validar token, mascarar segredos |
| `logica.test.mjs` | Testes das funções puras, com `node --test` |
| `index.html` | Tela com HTML, CSS e JS simples |

Tela do painel:

- **Estado:** Rodando ou Parado, detectado pelo processo `dailyRoutineCli` (vale também para rodadas do Agendador ou de outra janela).
- **Última rodada:** data, duração, etapas com o tempo de cada uma e quantas "Etapa falhou", lidas do log mais recente em `C:\tmp\coletor\logs`.
- **Rodar agora:** abre uma janela de PowerShell independente do painel, com confirmação no navegador no lugar do `SIM` digitado, e roda com `-Yes`.
- **Conferir (DryRun):** roda `-DryRun` e mostra a saída, sem gravar.
- **Log ao vivo:** últimas ~100 linhas, atualizadas a cada poucos segundos.
- **Relógio:** mostra a tarefa "Licitacoes - rotina diaria" (horário, próxima execução, estado), permite mudar o horário diário (um horário por dia) e ligar ou desligar. Se a tarefa não existir, o painel a cria com os parâmetros do documento de 15/11/2026 (diária, `-StartWhenAvailable`, `-MultipleInstances IgnoreNew`, limite de 14 h).

Também dentro do escopo:

- Seção curta no [README de Licitações](../apps/tenders/api/README.md) explicando como abrir o painel.
- Criar a branch `feat/painel-coleta-local` a partir da atual (`fix/collector-retry-1-minute`), para não misturar com as correções de retry.

### Fora do escopo

- Qualquer mudança no coletor, em `.env`, no banco, em migrations, no Render ou no frontend do sistema.
- Acesso remoto ao painel (só `127.0.0.1`).
- Horários diferentes por dia da semana ou mais de um horário por dia (possível evolução).
- Iniciar o painel automaticamente com o Windows (possível evolução).
- Push, merge ou deploy.

## Segurança

- Escuta só em `127.0.0.1`. Valida o cabeçalho `Host` e o `Origin` para impedir que um site aberto no navegador dispare o botão (CSRF e DNS rebinding).
- Token aleatório gerado a cada subida do painel, exigido em todo POST.
- **Rodar agora** é recusado com 409 se já houver rodada em andamento (trava de dois escritores).
- O navegador nunca envia comando nem caminho: só `rodar`, `conferir` e um horário `HH:mm` validado. O servidor monta os comandos fixos.
- Não lê o `collector.env`. O log é filtrado antes de ir para a tela, mascarando qualquer `postgres://usuario:senha@`.
- Usa `-EnvFile` e `-WorkDir` padrão; se o usuário usar outros, define por variável de ambiente.

## Decisões

1. **`.mjs` em vez de `.ts`:** roda direto no Node, sem tsx, build ou typecheck. Custo: foge um pouco do padrão TypeScript do projeto.
2. **Atalho no `package.json`:** adicionar `"painel-coleta": "node scripts/painel-coleta/servidor.mjs"` em `apps/tenders/api`. Uma linha; o usuário pode recusar na aprovação.
3. **Branch:** `feat/painel-coleta-local` a partir da atual.

## Passos de implementação

1. Criar a branch `feat/painel-coleta-local`.
2. Escrever `logica.mjs` e `logica.test.mjs` (ler log, `HH:mm`, token, mascarar segredo) e rodar `node --test`.
3. Escrever `servidor.mjs`: `GET /`, `GET /api/estado`, `GET /api/log`, `POST /api/rodar`, `POST /api/conferir`, `POST /api/agenda`.
4. Escrever `index.html`.
5. Escrever `rodar-coleta.cmd` e `abrir-painel.cmd`.
6. Adicionar o script no `package.json` (se aprovado) e a seção no README.

## Verificação

1. `node --test` nos testes da `logica.mjs`.
2. Subir o painel e conferir que mostra **Rodando** durante uma coleta ativa.
3. POST sem token ou com `Origin` estranho deve dar 403.
4. **Rodar agora** durante uma rodada deve ser recusado (409).
5. **Conferir (DryRun)** deve mostrar `Banco: ...fingerence_licitacoes (producao)`.
6. Mudar o horário da tarefa pelo painel e ler de volta no Agendador.
7. O teste do botão **Rodar agora** em produção fica com o usuário.

## Finalização

- `/finalizar`: revisar e preparar commit **local**. Nenhum push, merge ou deploy sem confirmação explícita, porque um push pode acionar autodeploy na Render.

## Observações operacionais

- O PC precisa estar ligado e sem suspender; para a tarefa agendada, também logado.
- A rotina leva horas (documentação: ~11,5 h na primeira vez, não medido); a tarefa tem limite de 14 h.
- O cron do Render precisa continuar suspenso; dois escritores ao mesmo tempo não funcionam.
- Rodar à mão perto do horário agendado faz a trava recusar a execução do Agendador daquele dia.

## Ajustes feitos na implementação (2026-11-15)

- **Nomes em inglês:** o `AGENT.md` exige identificadores, arquivos, pastas e rotas da API em inglês (textos da tela seguem em português). A pasta ficou `apps/tenders/api/scripts/collector-panel/`, com `run-collection.cmd`, `open-panel.cmd`, `index.html`, `logic.mjs`, `server.mjs`, `main.mjs`, `windows.mjs`, `log-reader.mjs` e os testes `*.test.mjs`. Rotas: `/api/status`, `/api/log`, `/api/run`, `/api/dry-run`, `/api/schedule`.
- **Servidor dividido:** `server.mjs` só faz HTTP (os adaptadores entram por parâmetro, para testar sem o Windows), `windows.mjs` fala com o PowerShell e o Agendador, `main.mjs` monta tudo e `log-reader.mjs` lê o log aos poucos.
- **Janela da coleta pelo `start` do cmd:** um processo `detached` do Node no Windows nasce sem console, então a janela não apareceria.
- **`package.json`:** dois scripts em `apps/tenders/api` (`collector-panel` e `test:collector-panel`); o plano previa só o primeiro.
- **Variável extra:** `PANEL_TASK_NAME` permite testar com uma tarefa de teste, sem tocar na tarefa real.
- **Memória e disco da coleta:** o plano não previa, mas o documento de operação manda preservar `-DuckDbMemoryMb` e `-DiskLimitMb` da carga já feita no PC (o padrão do script, 3072/20000 MB, pode ser alto para a máquina). Entraram `PANEL_DUCKDB_MEMORY_MB` e `PANEL_DISK_LIMIT_MB`, repassados na janela da coleta, no DryRun e na tarefa agendada (e lidos pelo `run-collection.cmd`).
- **Painel sem janela (2026-11-16):** a janela preta do servidor não tinha função para o usuário e confundia. `open-panel.cmd` agora usa `main.mjs --background`: sobe o painel num processo próprio, sem console, espera ele responder e sai; as mensagens vão para `<WorkDir>\panel.log`. `close-panel.cmd` encerra o processo que escuta na porta do painel. `npm run collector-panel` continua subindo na própria janela.
