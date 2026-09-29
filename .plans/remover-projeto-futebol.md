# Plano de Implementação: Remover o projeto Escalação Futebol e tornar `sistema financas` a raiz

## Origem

- Arquivo de especificação: `não fornecido; planejamento solicitado via conversa`
- Data do planejamento: `2026-09-29`
- Classificação: `backend + database + infra/deploy`

## Resumo

O app Escalação Futebol foi descontinuado. O backend e o banco passam a servir **só o sistema de finanças**, sem nenhum vínculo com o futebol. Se o app voltar no futuro, ele recomeça do zero.

Além disso, a pasta de workspace `C:\Users\rodri\Music\Particular` vai deixar de existir. `sistema financas` vira a raiz do projeto, em `C:\Users\rodri\Music\sistema financas`. Tudo o que vale na raiz de `Particular` precisa ir antes para dentro de `sistema financas`: env, skills, regras, planos, tasks e memória do Claude Code.

A classificação não inclui frontend porque o frontend de finanças não tem mudança de código. O único efeito nele é passar a ler o `.env` da nova raiz.

## Escopo

### Dentro do escopo

- Remover o módulo `futebol` do backend de finanças. Isso inclui:
  - rotas, 2 crons e autenticação própria;
  - integração com a football-data.org;
  - export do schema Drizzle;
  - CORS da porta 5175.
- Apagar as 9 migrations do futebol e os blocos do schema `futebol` em `backend/config/schema-dev.sql`.
- Apagar o schema `futebol` em produção (com um dump antes) e no banco local de dev.
- Mover `.env` e `.env.dev` da raiz para `sistema financas/`, removendo as variáveis do futebol.
- Ajustar o código que aponta para a raiz de `Particular` (`../../.env` passa a ser `../.env`).
- Levar para `sistema financas`:
  - a regra nova do `.env` do `CLAUDE.md` da raiz, alinhando também o `AGENT.md`;
  - as 8 skills, com o `/run` reescrito;
  - as permissões genéricas;
  - 35 planos;
  - 10 tasks do `.portal`.
- Migrar as memórias do Claude Code para a pasta de memória do novo caminho, substituindo as 3 memórias antigas.

### Fora do escopo

- Reescrever o histórico do git de `sistema financas`. Os commits antigos do futebol continuam no histórico.
- Editar os 19 documentos de finanças que só citam o futebol de passagem (`.plans/`, `.portal/tasks/`, `docs/features/`). São registro histórico.
- Qualquer mudança de funcionalidade em finanças.
- Ações fora da máquina, que ficam com o usuário:
  - Render;
  - GitHub (arquivar o repositório);
  - football-data.org;
  - Play Store.
- Mover a pasta `sistema financas` e apagar `Particular`. Isso é feito pelo usuário na Fase 6.
- Criar arquivo de migration para o DROP. O comando roda uma vez em cada banco e o registro fica neste plano, para não deixar rastro do futebol no repositório.

## Leitura de contexto

- `/AGENT.md` de `Particular`. É o mesmo de `sistema financas/AGENT.md`, que ainda tem a seção "English-Only Codebase".
- `sistema financas/AGENT.md`, usado como referência.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem neste projeto.
- `CLAUDE.md` da raiz e de `sistema financas`. A única diferença é a regra do `.env`, e a da raiz é a mais nova.
- `backend/src/server.ts`, `backend/src/db/client.ts`, `backend/src/db/schema/index.ts`, `backend/drizzle.config.ts`, `backend/package.json`
- `backend/src/modules/futebol/**`, `backend/drizzle/*.sql`, `backend/config/schema-dev.sql`
- `vite.config.ts` (não tem `envDir`) e `src/services/authService.ts` (lê `VITE_GOOGLE_CLIENT_ID`)
- `.gitignore` de `sistema financas`: ignora `.env`, `.env.dev`, `.claude/` e `.plans/*.json`.
- `.claude/skills/*`, `.claude/settings.json` e `.claude/settings.local.json` da raiz.
- Plano histórico `.plans/unificar-backends-financas-futebol.md` (raiz).
- Plano histórico `.plans/consolidar-env-raiz.md` (raiz).

## Impacto por área

### Frontend

Sem mudança de código.

Efeito colateral esperado: o Vite lê `.env` da raiz do projeto por padrão. Com o `.env` dentro de `sistema financas/`, o `VITE_GOOGLE_CLIENT_ID` passa a ser lido localmente, e o login com Google começa a funcionar no ambiente local. O Vite só expõe variáveis `VITE_*`, então os segredos do backend no mesmo arquivo não vão para o front.

### Backend

- Apagar `backend/src/modules/futebol/`, com 16 arquivos:
  - `championshipsCron.ts`, `cron.ts`, `password.ts`;
  - `db/schema.ts`, `middleware/auth.ts`;
  - `routes/{auth,championships,index,matches,player,players,pool,public,schedule}.ts`;
  - `services/{draw,footballData}.ts`.
- `backend/src/server.ts`:
  - linha 7: `'../../.env'` passa a ser `'../.env'`;
  - linha 24: remover `'http://localhost:5175', 'http://127.0.0.1:5175',` de `devOrigins`;
  - linhas 99–101: remover os imports de `futebolRoutes`, `startFootballCron` e `startChampionshipsCron`;
  - linha 155: remover `app.use('/api/futebol', futebolRoutes);`;
  - linhas 213–214: remover `startFootballCron();` e `startChampionshipsCron();`.
- `backend/src/db/schema/index.ts` linha 20: remover `export * from '../../modules/futebol/db/schema';`.
- `backend/src/db/client.ts` linha 7: `'../../.env'` passa a ser `'../.env'`.
- `backend/drizzle.config.ts` linha 5: `'../../.env'` passa a ser `'../.env'`.
- `backend/package.json`, script `dev`: `DOTENV_CONFIG_PATH=../../.env.dev` passa a ser `DOTENV_CONFIG_PATH=../.env.dev`.
- Continuam, porque finanças também usa:
  - `db/client`;
  - `middleware/validation` (`validateDocument`, `authRateLimiter`);
  - `utils/date` (`getTodayIsoInTimezone`).

  Nenhuma dependência do `package.json` é exclusiva do futebol.
- Não há testes que referenciem o futebol.

### Banco de dados

**Arquivos**
- Apagar as 9 migrations:
  - `0001_futebol_schema.sql`;
  - `0006_futebol_campeonatos.sql`, `0006_futebol_reset_senha.sql`;
  - `0007_futebol_campeonatos_crest.sql`, `0008_futebol_campeonatos_fase.sql`;
  - `0009_futebol_bolao.sql`, `0010_futebol_players_cpf.sql`;
  - `0011_futebol_pools_valor_prazo.sql`, `0012_futebol_users_nome_cpf.sql`.

  São SQL soltos. Não existe `drizzle/meta/_journal.json`, então nada depende deles.
- `backend/config/schema-dev.sql`: remover todos os blocos do schema `futebol`. As linhas são aproximadas; o implementar confere pelo conteúdo:
  - `CREATE SCHEMA futebol` (~30–33);
  - 10 tabelas (~106–260);
  - chaves primárias e únicas (~2040–2135);
  - índices (~2580–2685);
  - FKs (~3097–3185).

**Bancos: produção (`DATABASE_URL` do `.env`) e local (`.env.dev`)**
- Schema `futebol` com 10 tabelas:
  - `users`, `players`, `matches`, `confirmations`, `schedules`;
  - `guests`, `pools`, `pool_guesses`;
  - `championship_matches`, `championship_guesses`.
- No `schema-dev.sql`, todas as FKs do `futebol` são internas e nenhuma tabela de finanças referencia o schema. Isso é confirmado em produção antes do DROP.
- Operação: `DROP SCHEMA futebol CASCADE`, depois do deploy do backend sem o módulo. Na ordem inversa, rotas e crons em produção consultariam tabelas inexistentes.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

**Mudanças no `.env` e no `.env.dev`**

As mesmas 6 remoções nos dois arquivos, depois da mudança para `sistema financas/`. Pela regra do `CLAUDE.md`, mostrar a lista antes e confirmar com o usuário:
1. Remover a linha de comentário `Escalacao: http://127.0.0.1:5175` (linha 3 no `.env`, linha 8 no `.env.dev`).
2. Remover `VITE_API_URL`. Só o frontend do futebol usava.
3. Em `ALLOWED_ORIGINS`, remover só a entrada `http://127.0.0.1:5175`.
4. Remover `FUTEBOL_CRON_ENABLED`.
5. Remover `FUTEBOL_JWT_SECRET`.
6. Remover `FOOTBALL_DATA_API_KEY`.

Nunca imprimir valores do `.env` no chat.

**Render:** o deploy do backend acontece pelo merge na `main`. No Render as variáveis vêm do painel, então a troca do caminho do dotenv não afeta produção. As ações no painel ficam com o usuário (Fase 4).

**Workspace**

Levar para dentro de `sistema financas`:
- `CLAUDE.md`: trocar a linha `- Nunca alterar \`.env\`` pela regra da raiz:

  > `- Alterar \`.env\` requer confirmação explícita do usuário a cada alteração (mesma régua das migrations) — nunca por padrão, nunca em lote sem revisão prévia do que será mudado/removido`
- `AGENT.md` linha 433: trocar `- Nunca altere o arquivo .env` pela mesma regra (decisão 4).
- Skills: **copiar**, não mover, as 8 skills (`criar-task`, `finalizar`, `implementar`, `limpar`, `planejar`, `product-scope`, `run`, `write-a-skill`) para `sistema financas/.claude/skills/`. A sessão atual ainda usa as da raiz até o fim.
- O `/run` é reescrito para o projeto único:
  - backend em `cd backend && npm run dev` (porta 3010);
  - frontend em `npm run dev` (porta 5173);
  - env em `.env` e `.env.dev` na raiz do projeto;
  - checagem só de `/health` e `5173`;
  - sem escalação e sem `Particular`.
- `sistema financas/.claude/settings.local.json` (novo): permissões genéricas vindas do `settings.local.json` da raiz (204 entradas) e do `settings.json` da raiz. Excluir as entradas que:
  - citam futebol, escalação, 5175 ou football;
  - têm caminho absoluto de pasta (`Particular` ou o antigo `Music/sistema financas`);
  - contêm token, senha, secret ou URL de banco.

  Em `additionalDirectories`, não levar o caminho absoluto antigo das skills.
- Mover estes 35 planos de `Particular/.plans/` para `sistema financas/.plans/`. Nenhum tem conflito de nome.
  - 33 que só existem na raiz: `analise-financeira-avancada-painel`, `categorias-guia-primeiro-acesso`, `categorias-modal-subcategoria-direta`, `checklist-configuracao-inicial-onboarding`, `controle-estoque-catalogo-produtos`, `correcao-posicionamento-baloes-guia`, `correcoes-seguranca-criticas-financeiro`, `corrigir-assistente-financeiro-fluxo-e-chips`, `corrigir-bugs-funcionais-financeiro`, `corrigir-card-categorias-mes-sumido`, `corrigir-e-redesenhar-sistema-guias-primeiro-acesso`, `corrigir-guias-movimentacoes-unificadas`, `corrigir-validacao-cartao-e-mensagens-tecnicas-expostas`, `corrigir-valor-pago-nao-registrado`, `dashboard-redesign-painel-gestao`, `editor-visual-fluxo-assistente`, `faturamento-contratos-features`, `generalizar-card-categorias-todos-periodos`, `guias-primeiro-acesso-cobertura-completa`, `landing-fallback-flash-css-critico`, `multiconta-pj-panorama-geral`, `padronizar-todos-modais-sistema`, `painel-filtro-de-ate-grafico-colunas-categorias-pj`, `pwa-assistente-financeiro-auth-embutida`, `redesenhar-assistente-financeiro-chat`, `redesign-modal-contrato-unificado`, `relatorios-botao-consultar`, `reorganize-monthly-movements-and-reserves`, `revisao-modal-valores-servicos`, `roteamento-por-resposta-fluxo-assistente`, `seletor-conta-modais-despesa-receita`, `simplificar-modal-categoria-tipo-vinculo-fixos`, `status-faturamento-contratos`.
  - 2 de finanças que só citam o futebol: `remover-box-quadrado-prefixo-rs-inputs`, `consolidar-env-raiz`.
- Mover estas 10 tasks de `Particular/.portal/tasks/` para `sistema financas/.portal/tasks/`. Nenhuma tem conflito de nome:
  - `checklist-configuracao-inicial-onboarding`;
  - `corrigir-e-redesenhar-sistema-guias-primeiro-acesso`;
  - `corrigir-validacao-cartao-e-mensagens-tecnicas-expostas`;
  - `notificar-atualizacao-pwa-assistente-financeiro`;
  - `padronizar-home-publica-visual-e-largura`;
  - `padronizar-todos-modais-sistema`;
  - `readequar-guias-primeiro-acesso-sistema-financas`;
  - `redesenhar-assistente-financeiro-chat`;
  - `reformular-modal-editar-despesa-valor-pago-e-status`;
  - `simplificar-modal-categoria-tipo-vinculo-fixos`.

**Não são movidos. Vão embora quando o usuário apagar `Particular`:**
- a pasta `escalacao futebol/`. O `main` local está igual ao `origin/main`, então nada se perde;
- 27 planos só do futebol: todos os que citam futebol, exceto os 2 acima;
- 29 cópias exatas de planos que já existem em `sistema financas/.plans/`. Diferem só na quebra de linha; são 28 arquivos mais `tasks/assistente-financeiro-conversacional.md`;
- a task `destacar-links-cadastro-confirmacao-escalacao`;
- `.skill-archive/`, com versões antigas das skills do Codex;
- `.claude/worktrees/`, com 7 worktrees abandonadas que nenhum repositório usa;
- `CLAUDE.md`, `AGENT.md`, `settings.json` e `settings.local.json` da raiz;
- as skills da raiz, já copiadas.

## Arquivos provavelmente afetados

**Backend**
- `backend/src/modules/futebol/**` (apagado)
- `backend/src/server.ts`
- `backend/src/db/schema/index.ts`
- `backend/src/db/client.ts`
- `backend/drizzle.config.ts`
- `backend/package.json`
- `backend/drizzle/*futebol*.sql` (9 arquivos, apagados)
- `backend/config/schema-dev.sql`

**Raiz de `sistema financas`**
- `CLAUDE.md`, `AGENT.md`
- `.env`, `.env.dev` (movidos e editados, ignorados pelo git)
- `.claude/skills/**` e `.claude/settings.local.json` (novos, ignorados pelo git)
- `.plans/` (35 novos) e `.portal/tasks/` (10 novos)

**Memória do Claude Code**
- `C:\Users\rodri\.claude\projects\c--Users-rodri-Music-sistema-financas\memory\`

## Estratégia de implementação

### Fase 1: código e estrutura (`/implementar`), ainda dentro de `Particular`

1. Em `sistema financas`, trocar para a `main` e atualizar (`git checkout main && git pull`). Criar `chore/R/remover-projeto-futebol`.

   A `refactor/R/reports-rebuild` já foi mergeada na `main` e não tem commits pendentes. Os arquivos não versionados continuam no lugar.
2. Apagar `backend/src/modules/futebol/`.
3. Editar `server.ts` e `db/schema/index.ts` (sem o futebol).
4. Apagar as 9 migrations do futebol e limpar os blocos do futebol em `schema-dev.sql`.
5. Trocar os caminhos do env em `server.ts`, `db/client.ts`, `drizzle.config.ts` e no script `dev`.
6. Mostrar a lista de mudanças do `.env` e do `.env.dev` e pedir confirmação. Depois:
   - mover os dois arquivos para `sistema financas/`;
   - aplicar as 6 remoções em cada um;
   - conferir que a raiz de `Particular` ficou sem `.env`.
7. Editar `CLAUDE.md` e `AGENT.md` com a regra nova do `.env`.
8. Copiar as skills, reescrever o `/run` e criar o `settings.local.json` com as permissões filtradas.
9. Mover os 35 planos e as 10 tasks.
10. Validar:
    - buscar `futebol|escalacao|escalação|football|bolao|bolão|5175` em `sistema financas`, fora de `node_modules`, `dist`, `.git`, `.plans`, `.portal` e `docs`. Deve dar zero resultados;
    - `npm --prefix backend run build`, `npm --prefix backend test`, `npm run build`;
    - subir o backend com `.env.dev`: `/health` responde OK, `/api/futebol/players` dá 404, e o log não mostra `[futebol cron]` nem `[campeonatos cron]`;
    - subir o frontend: login funcionando.

### Fase 2: publicar (`/finalizar`)

11. Commit, push e merge na `main` (fluxo direto, sem PR). A `/finalizar` pergunta se os planos movidos devem ser versionados.
12. Esperar o deploy do Render e conferir o `/health` de produção.

### Fase 3: banco (só depois da Fase 2, com confirmação explícita em cada passo)

13. Confirmar o banco alvo, mostrando só host e nome do banco, nunca credenciais.
14. Rodar consultas só de leitura:
    - contagem de linhas de cada tabela do `futebol`;
    - FKs de outros schemas apontando para o `futebol` (`pg_constraint` com `confrelid` no `futebol` e `conrelid` fora dele);
    - views de outros schemas que usam tabelas do `futebol` (`information_schema.view_table_usage`).

    O resultado esperado é zero dependências externas.
15. Fazer o dump de produção com `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe --schema=futebol --no-owner --no-privileges` para `C:\Users\rodri\Documents\backups\futebol-prod-AAAA-MM-DD.sql`. Conferir que o arquivo existe, não está vazio e tem os 10 `CREATE TABLE`.
16. Ensaio em produção: `BEGIN; DROP SCHEMA futebol CASCADE; ROLLBACK;`. Conferir que a lista de "drop cascades to" só tem objetos do `futebol`.
17. Com confirmação: rodar `DROP SCHEMA futebol CASCADE;` em produção. Depois conferir que o schema não existe mais e que o `/health` continua OK.
18. Banco local (`.env.dev`): repetir os passos 13, 14 e 16. Com confirmação, rodar o DROP sem dump.
19. Scripts auxiliares ficam no scratchpad, nunca no repositório, e leem o `DATABASE_URL` sem imprimir.

### Fase 4: com o usuário (fora da máquina)

20. Render:
    - apagar o Static Site `escalacao-futebol-1`;
    - apagar o Web Service `escalacao-futebol`, se ainda existir;
    - no `sistema-financeiro-backend`, remover `FUTEBOL_JWT_SECRET`, `FUTEBOL_CRON_ENABLED` e `FOOTBALL_DATA_API_KEY`, e tirar a origem da escalação de `ALLOWED_ORIGINS`.
21. GitHub: arquivar `RodrigoMartini02/escalacao-futebol`.
22. Revogar a chave na football-data.org. Remover o app da Play Store, se tiver sido publicado.

### Fase 5: memória do Claude Code

23. Copiar as memórias atuais de `c--Users-rodri-Music-Particular\memory\` para `c--Users-rodri-Music-sistema-financas\memory\`:
    - apagar as 3 antigas (`project_dados_meses_2026`, `project_fingerence_strategy`, `project_perfil_ia_fixes_2026`), de março e da versão em JS puro (decisão 3);
    - reescrever o `MEMORY.md`;
    - ajustar as memórias que citam caminhos de `Particular` ou o futebol;
    - resumir `project_futebol_descontinuado` para "removido em AAAA-MM-DD; não reintroduzir vínculos".

### Fase 6: com o usuário

24. Antes de apagar, conferir o checklist:
    - `.env` e `.env.dev` estão em `sistema financas/`;
    - skills, planos, tasks e memória foram migrados;
    - o que sobrou em `Particular` é só o que deve ir embora (lista em Infra/Deploy).
25. Parar os servidores, fechar o VS Code e mover `sistema financas` para `C:\Users\rodri\Music\sistema financas`.
26. Apagar `C:\Users\rodri\Music\Particular`.
27. Abrir o VS Code na pasta nova, rodar `/run` e conferir que as memórias e as skills carregam.

## Regras de negócio identificadas

- O backend e o banco servem só finanças. Nenhuma rota, cron, tabela ou variável do futebol permanece.
- O futebol não é preservado dentro do sistema. O dump fica fora do projeto, só como seguro da operação.
- Documentos históricos de finanças que citam o futebol continuam como estão.

## Regras multi-tenant e segurança

- O módulo removido tinha JWT próprio (`FUTEBOL_JWT_SECRET`). Com a remoção, sai uma superfície de autenticação paralela. A chave deve sair também do Render.
- As rotas públicas do futebol (`/api/futebol/public/...`) deixam de existir, e isso reduz a superfície exposta.
- O `.env` com credenciais de produção passa a ficar dentro da pasta do repositório. O `.gitignore` já ignora `.env` e `.env.dev`; conferir com `git status` que não aparecem como não versionados.
- O `settings.local.json` novo não pode levar entradas com token, senha ou URL de banco. O antigo tinha 17 entradas assim, incluindo um JWT de teste.
- Nenhum valor do `.env` é impresso no chat ou em log. Os scripts do banco leem a URL sem exibir.
- As regras de tenant de finanças não mudam.

## Validações necessárias

- O TypeScript compila sem referências quebradas: `tsc --noEmit` no backend.
- O backend encontra o `DATABASE_URL` pelo caminho novo, tanto com `.env` quanto com `.env.dev`.
- `ALLOWED_ORIGINS` local continua com as origens de finanças, sem a 5175.
- O dump contém os 10 `CREATE TABLE` antes do DROP.
- A cascata do DROP no ensaio só atinge objetos do `futebol`.

## Testes necessários

### Frontend

- `npm run build` passa.
- O login local funciona. Com o `VITE_GOOGLE_CLIENT_ID` agora lido, o botão do Google aparece.

### Backend

- `npm --prefix backend run build` (typecheck) passa.
- `npm --prefix backend test` passa.
- Smoke local: `/health` responde OK, `/api/futebol/players` dá 404 e não há logs de cron do futebol.

### E2E

- Produção depois do deploy: `/health` OK, e login, despesas e receitas funcionando.
- Produção depois do DROP: `/health` OK, com uma navegação rápida pelo painel.
- Depois da Fase 6: `/run` na pasta nova sobe backend e frontend.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
npm --prefix backend test
npm run build
grep -rniE "futebol|escalacao|escalação|football|bolao|bolão|5175" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.plans --exclude-dir=.portal --exclude-dir=docs
git status --short   # .env / .env.dev não podem aparecer
curl -s http://localhost:3010/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/api/futebol/players   # esperado 404
```

## Riscos e pontos de atenção

- **Alto: o DROP do schema em produção é irreversível.** Mitigação: dump, consultas só de leitura, ensaio com `ROLLBACK`, confirmação explícita e execução só depois do deploy.
- **Alto: perder o `.env` com credenciais de produção** se `Particular` for apagada antes da migração. O `.env` local diverge do Render e não dá para reconstruir pelo painel. Mitigação: mover o `.env` na Fase 1 e conferir o checklist na Fase 6.
- **Médio: ordem de deploy.** Com o DROP antes do deploy, as rotas e os crons em produção quebram.
- **Médio: caminho do dotenv errado.** O backend local não sobe ("DATABASE_URL is not set"). A validação da Fase 1 pega isso.
- **Médio: memória no caminho errado.** Se o caminho final for diferente do combinado, as memórias não carregam. Conferir na Fase 6.
- **Baixo: apagar migrations já aplicadas** contraria a regra do `AGENT.md` de não editar migrations antigas. Justifica-se porque o schema que elas criam deixa de existir e não há journal do drizzle.
- **Baixo: mais pedidos de permissão no começo**, porque só as permissões genéricas são migradas.
- **Baixo: login com Google passa a funcionar localmente**, porque o `VITE_GOOGLE_CLIENT_ID` passa a ser lido. É o comportamento esperado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. As decisões tomadas foram:
- **Decisão 1:** caminho final `C:\Users\rodri\Music\sistema financas`.
- **Decisão 2:** o usuário move a pasta e apaga `Particular` (Fase 6).
- **Decisão 3:** as 3 memórias antigas são substituídas pelas atuais.
- **Decisão 4:** o `AGENT.md` é alinhado à regra do `.env` do `CLAUDE.md`.

## Critérios de aceite do plano

- Nenhuma referência ao futebol no código, na configuração nem nas skills de `sistema financas`. Os documentos históricos em `.plans`, `.portal` e `docs` ficam.
- O backend sobe localmente lendo `sistema financas/.env` e `.env.dev`. Build, typecheck e testes passam.
- Produção no ar sem as rotas nem os crons do futebol.
- O schema `futebol` não existe mais em produção nem no banco local, e o dump de produção está salvo fora do projeto.
- `CLAUDE.md` e `AGENT.md` de finanças têm a mesma regra do `.env`.
- Skills, planos, tasks e memórias estão dentro de `sistema financas` ou na pasta de memória do caminho novo.
- `Particular` pode ser apagada sem perder nada que deveria ficar.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar DROP nem qualquer comando no banco sem confirmação explícita do usuário em cada passo. A Fase 3 só começa depois do deploy da Fase 2.
- Não editar o `.env` sem mostrar antes a lista exata de mudanças e receber confirmação. Nunca imprimir valores.
- Copiar as skills, não mover: a sessão atual depende das skills da raiz até o fim.
- Mover o `.env`, não copiar, para não sobrar credencial duplicada na raiz.
- Scripts auxiliares de banco ficam no scratchpad, nunca no repositório.
- Não reescrever histórico do git. Não editar os documentos históricos que citam o futebol.
- Execução enxuta, sem narrar cada arquivo.
- Seguir `CLAUDE.md` e `AGENT.md` de `sistema financas`.
