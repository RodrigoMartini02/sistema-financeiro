# Plano de Implementacao: Consolidar Env na Raiz

## Origem

- Arquivo de especificacao: `pedido direto no chat; sem arquivo .md fornecido`
- Data do planejamento: `2026-07-11`
- Classificacao: `infra/deploy`

## Resumo

Consolidar as variaveis locais dos dois projetos em um unico arquivo `.env` na raiz do workspace (`C:\Users\rodri\Music\Particular\.env`). Ajustar o backend unificado e os dois frontends Vite para lerem esse arquivo raiz, corrigindo tambem o conflito de portas que faz o acesso ao financeiro abrir a escalacao.

## Escopo

### Dentro do escopo

- Criar um unico `.env` na raiz do workspace com as variaveis hoje espalhadas nos tres `.env` locais.
- Ajustar carregamento de ambiente do backend financeiro/unificado para o `.env` raiz.
- Ajustar Vite do financeiro e da escalacao para ler variaveis do `.env` raiz.
- Corrigir portas locais: financeiro em `5173`, escalacao em `5175`, backend em `3010`.
- Corrigir `dev:local` da escalacao para nao ocupar `5173`.
- Atualizar CORS local do backend para aceitar `5175`.
- Apagar os `.env` antigos apos consolidar o conteudo no `.env` raiz.
- Validar builds e conferencia basica das portas.

### Fora do escopo

- Alterar variaveis de ambiente no Render.
- Executar migrations.
- Alterar banco de dados.
- Remover servicos do Render.
- Fazer commit, push ou merge.
- Expor valores sensiveis no chat.

## Leitura de contexto

- `/AGENT.md`
- `/CLAUDE.md`
- `C:\Users\rodri\.codex\skills\planejar\SKILL.md`
- `sistema financas/vite.config.ts`
- `escalacao futebol/vite.config.js`
- `sistema financas/package.json`
- `sistema financas/backend/package.json`
- `escalacao futebol/package.json`
- `sistema financas/backend/src/server.ts`
- `sistema financas/backend/src/db/client.ts`
- `sistema financas/backend/drizzle.config.ts`
- Nomes de variaveis dos arquivos `.env` atuais, sem leitura/exposicao de valores no plano.

## Impacto por area

### Frontend

Financas:

- `sistema financas/vite.config.ts` deve usar `envDir` apontando para a raiz do workspace.
- Manter servidor local em `5173` com `strictPort: true`.
- Manter proxy `/api` apontando para `http://localhost:3010`.

Escalacao:

- `escalacao futebol/vite.config.js` deve usar `envDir` apontando para a raiz do workspace.
- Manter servidor local em `5175` com `strictPort: true`.
- `escalacao futebol/package.json` deve trocar `dev:local` de `--port 5173` para `--port 5175 --strictPort`.
- `VITE_API_URL` deve vir do `.env` raiz e continuar apontando para o backend unificado em `http://localhost:3010`.

### Backend

- `sistema financas/backend/src/server.ts` deve carregar o `.env` raiz por caminho explicito ou por fallback robusto.
- `sistema financas/backend/src/db/client.ts` deve usar o mesmo caminho raiz para `DATABASE_URL`, `DB_SCHEMA` e demais variaveis.
- `sistema financas/backend/drizzle.config.ts` deve carregar o `.env` raiz para comandos do Drizzle.
- `sistema financas/backend/package.json` deve ajustar scripts locais que hoje apontem para `.env.dev` ou `.env` interno, se necessario.
- CORS deve aceitar:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
  - `http://localhost:5175`
  - `http://127.0.0.1:5175`

### Banco de dados

Sem impacto esperado.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

- Impacto apenas em execucao local.
- No Render, as variaveis continuam sendo configuradas por servico. O `.env` raiz local nao substitui variaveis do Render.
- Nao alterar deploy, servicos, banco ou variaveis remotas nesta implementacao.

## Arquivos provavelmente afetados

- `.env`
- `sistema financas/vite.config.ts`
- `sistema financas/backend/src/server.ts`
- `sistema financas/backend/src/db/client.ts`
- `sistema financas/backend/drizzle.config.ts`
- `sistema financas/backend/package.json`
- `escalacao futebol/vite.config.js`
- `escalacao futebol/package.json`
- `escalacao futebol/DEV_LOCAL.md`
- `sistema financas/.env`
- `sistema financas/backend/.env`
- `escalacao futebol/.env`

## Estrategia de implementacao

1. Conferir novamente os `.env` existentes e consolidar o conteudo no `.env` raiz sem imprimir valores no chat.
2. Criar `C:\Users\rodri\Music\Particular\.env` com as variaveis dos tres arquivos atuais.
3. Ajustar `sistema financas/backend/src/server.ts`, `src/db/client.ts` e `drizzle.config.ts` para carregar o `.env` raiz como padrao local.
4. Ajustar `sistema financas/vite.config.ts` para `envDir` na raiz do workspace, mantendo porta `5173` e `strictPort`.
5. Ajustar `escalacao futebol/vite.config.js` para `envDir` na raiz do workspace, porta `5175` e `strictPort`.
6. Corrigir `escalacao futebol/package.json` para o script `dev:local` usar `5175`.
7. Atualizar CORS local no backend para incluir `5175`.
8. Apagar os `.env` antigos somente depois de confirmar que o `.env` raiz foi criado.
9. Rodar validacoes:
   - build do backend financeiro/unificado
   - build do frontend financeiro
   - build do frontend escalacao
   - conferencia de portas e arquivos `.env` restantes

## Regras de negocio identificadas

- Financas e escalacao devem continuar acessando o mesmo backend unificado em `3010`.
- Financas deve abrir em `5173`.
- Escalacao deve abrir em `5175`.
- Deve existir apenas um `.env` local na raiz do workspace apos a consolidacao.
- Valores sensiveis nao devem ser exibidos no chat.

## Regras multi-tenant e seguranca

- Nao ha nova regra multi-tenant nesta mudanca.
- Garantir que variaveis sem prefixo `VITE_` nao sejam usadas no frontend.
- O frontend Vite so expoe variaveis prefixadas por `VITE_`; manter segredos de backend sem esse prefixo.
- Evitar logs ou mensagens que imprimam `DATABASE_URL`, tokens, secrets ou senhas.

## Validacoes necessarias

- Verificar que restou apenas `.env` na raiz.
- Verificar que o backend encontra `DATABASE_URL` ao iniciar/buildar.
- Verificar que o Vite do financeiro encontra `VITE_GOOGLE_CLIENT_ID`.
- Verificar que o Vite da escalacao encontra `VITE_API_URL`.
- Verificar que `dev:local` da escalacao nao usa mais `5173`.
- Verificar que CORS inclui `5175`.

## Testes necessarios

### Frontend

- `npm run build` em `sistema financas`.
- `npm run build` em `escalacao futebol`.
- Conferir que `localhost:5173` corresponde ao financeiro.
- Conferir que `localhost:5175` corresponde a escalacao.

### Backend

- `npm run build` em `sistema financas/backend`.
- Conferir que `DATABASE_URL` e demais variaveis sao carregadas via `.env` raiz.

### E2E

- Smoke manual local:
  - abrir financeiro em `http://localhost:5173`
  - abrir escalacao em `http://localhost:5175`
  - confirmar que ambos chamam `http://localhost:3010`

## Comandos de validacao sugeridos

```bash
npm run build
```

Executar em:

- `sistema financas/backend`
- `sistema financas`
- `escalacao futebol`

Conferencias:

```bash
rg --files -g .env
rg "5173|5175|3010|3001|DOTENV_CONFIG_PATH|dotenv.config|envDir" "sistema financas" "escalacao futebol" -g "!node_modules/**" -g "!dist/**"
```

## Riscos e pontos de atencao

- O workspace ja possui muitas alteracoes pendentes; a implementacao deve ser pequena e focada.
- Apagar `.env` antigos antes de consolidar pode causar perda de valores sensiveis. A ordem correta e criar o `.env` raiz primeiro, conferir existencia e so entao apagar os antigos.
- `package.json` da escalacao estava bloqueado por outro processo em tentativa anterior; pode ser necessario fechar servidor/editor que esteja segurando o arquivo.
- Se houver processos antigos nas portas `3001`, `5173` ou `5175`, eles podem confundir a validacao.
- Render nao deve ser alterado por este plano.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Criterios de aceite do plano

A implementacao deve ser considerada pronta quando:

- existir apenas `C:\Users\rodri\Music\Particular\.env` como `.env` local do workspace;
- `sistema financas/.env`, `sistema financas/backend/.env` e `escalacao futebol/.env` tiverem sido removidos;
- backend unificado carregar variaveis do `.env` raiz;
- financeiro rodar em `5173`;
- escalacao rodar em `5175`;
- backend rodar em `3010`;
- builds dos tres alvos passarem;
- nenhum segredo tiver sido exposto no chat ou em logs finais.

## Observacoes para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nao executar migrations.
- Nao alterar Render.
- Nao imprimir valores de `.env` no chat.
- Consolidar o `.env` raiz antes de apagar os antigos.
- Apagar os `.env` antigos somente depois de confirmar que o `.env` raiz existe.
- Manter alteracoes pequenas e focadas.
- Trabalhar com as alteracoes pendentes existentes sem revertelas.
