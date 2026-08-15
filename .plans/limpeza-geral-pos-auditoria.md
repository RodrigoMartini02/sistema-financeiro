# Plano: Limpeza geral pos-auditoria

## Origem

- Task/arquivo de origem: auditoria `/limpar` do projeto inteiro em `sistema financas`
- Classificacao: `fullstack` + `infra/config` + `limpeza`

## Resumo

Aplicar todos os achados da auditoria de limpeza: corrigir configuracao TypeScript do frontend, remover codigo morto confirmado, limpar assets e arquivo duplicado, revisar dependencias frontend nao usadas, ajustar fallback de CORS e otimizar o leaderboard de campeonatos para evitar carregamento amplo em memoria.

## Escopo

### Dentro do escopo

- Corrigir `tsconfig.json` para voltar a validar com `typescript@5.9.3`.
- Remover `src/screens/meses/MesesScreen.tsx` caso continue sem importadores.
- Remover `src/screens/finance/IncomePanel.tsx` e `src/screens/finance/ExpensePanel.tsx` caso continuem sem importadores.
- Remover assets nao referenciados em `icons/`.
- Remover `google8ffa04c2d41f9f5c.html` duplicado da raiz, mantendo a copia em `public/`.
- Remover dependencias frontend suspeitas (`i18next`, `mercadopago`) se a verificacao confirmar que nao sao usadas pelo frontend.
- Revisar fallback de `ALLOWED_ORIGINS` em `backend/src/server.ts`.
- Melhorar `backend/src/modules/futebol/routes/championships.ts` para o leaderboard nao buscar todos os palpites e todos os usuarios sem necessidade.
- Rodar validacoes relevantes de frontend e backend.

### Fora do escopo

- Alteracoes de banco, schema ou migrations.
- Alteracoes em `.env` ou secrets.
- Deploy, push, merge ou producao.
- Refatoracoes visuais ou de produto nao ligadas aos achados.

## Leitura de Contexto

- `AGENT.md`: reforca que nao ha alteracao de codigo sem `/planejar`, aprovacao e `/implementar`.
- `CLAUDE.md`: confirma fluxo obrigatorio e proibicao de alterar `.env`, executar migrations ou fazer push sem aprovacao.
- `package.json`: frontend usa Vite, React, TypeScript e inclui `i18next` e `mercadopago`.
- `backend/package.json`: backend usa Express, TypeScript, PostgreSQL, Drizzle e possui build/test separados.
- `tsconfig.json`: contem `ignoreDeprecations: "6.0"`, que falhou com TS 5.9.3.
- `src/layout/AppShell.tsx`: `AppSection` nao possui `meses`, indicando que `MesesScreen` saiu da navegacao.
- `src/App.tsx`: renderiza `FinanceDashboard`, `MovimentacoesScreen`, `ReservasScreen`, `RelatoriosScreen`, `PlanosScreen` e `ConfigScreen`; nao renderiza `MesesScreen`, `IncomePanel` ou `ExpensePanel`.
- `backend/src/server.ts`: possui fallback de CORS com dominios antigos de Render.
- `backend/src/modules/futebol/routes/championships.ts`: leaderboard carrega palpites e usuarios amplamente.

## Impacto por Area

### Frontend

- Corrige build/typecheck.
- Reduz codigo morto.
- Reduz lockfile e dependencias se `i18next` e `mercadopago` forem removidos.
- Reduz peso de assets fonte/nao usados.

### Backend

- Ajusta fallback de CORS com cuidado para nao quebrar origens necessarias.
- Otimiza leaderboard de futebol mantendo comportamento esperado.

### Banco de Dados

- Sem alteracoes previstas.
- Nao executar migrations.
- Qualquer mudanca de query deve permanecer parametrizada e respeitar escopo de dados.

### Infra/Deploy

- Sem deploy.
- CORS deve ser validado contra `ALLOWED_ORIGINS` esperado em producao antes de remover dominios legados.

## Arquivos Provavelmente Afetados

- `tsconfig.json`
- `package.json`
- `package-lock.json`
- `google8ffa04c2d41f9f5c.html`
- `icons/logo-hero.png`
- `icons/logo-hero1.png`
- `icons/logo1.png`
- `icons/futicone.png`
- `icons/futlogo.jpeg`
- `icons/Nova logo/*`
- `src/screens/meses/MesesScreen.tsx`
- `src/screens/finance/IncomePanel.tsx`
- `src/screens/finance/ExpensePanel.tsx`
- `backend/src/server.ts`
- `backend/src/modules/futebol/routes/championships.ts`

## Estrategia de Implementacao

1. Reconfirmar referencias antes de remover arquivos com `rg`.
2. Corrigir `ignoreDeprecations` no `tsconfig.json`.
3. Remover codigo morto confirmado.
4. Remover assets e arquivo de verificacao duplicado.
5. Remover dependencias frontend nao usadas via `npm uninstall` para atualizar lockfile corretamente.
6. Ajustar fallback de CORS mantendo somente origens necessarias e documentadas no proprio codigo, se aplicavel.
7. Reescrever o leaderboard para buscar/agregar somente dados relevantes, preferencialmente com query Drizzle ou SQL parametrizado claro se a agregacao ficar mais simples.
8. Rodar validacoes e revisar diff.

## Seguranca, Dados e Multi-Tenant

- Nao alterar `.env`.
- Nao executar migrations.
- Nao remover filtros de usuario/tenant.
- No leaderboard, confirmar se o ranking deve ser global do modulo futebol ou se deve ser separado por conta antes de mudar escopo.
- CORS nao deve abrir origem ampla; evitar `*`.

## Validacoes Necessarias

- `npm exec tsc -- --noEmit`
- `npm run build`
- `npm run build` em `backend/`
- `npm test` em `backend/`, se continuar disponivel
- `git status --short`
- Revisao manual do diff

## Testes Recomendados

- Abrir build ou dev server do frontend e verificar paginas publicas e `app.html`.
- Verificar que `/icons/logo.png`, `/icons/favicon.svg`, manifest e sitemap continuam disponiveis.
- Testar endpoints de futebol relacionados a `/api/futebol/championships/leaderboard`.
- Testar login/painel se houver ambiente local seguro configurado.

## Riscos e Pontos de Atencao

- Assets em `icons/` podem ser insumos manuais fora do bundle; remover apenas os confirmadamente dispensaveis.
- Remover dominios de CORS pode quebrar algum frontend antigo ainda ativo.
- Remover `mercadopago` do frontend e manter no backend exige cuidado porque ha dependencia com mesmo nome nos dois `package.json`.
- O frontend usa `noUnusedLocals`, mas arquivos orfaos ainda nao sao detectados automaticamente se estiverem dentro do `include`.

## Perguntas em Aberto

- Os dominios `escalacao-futebol` ainda precisam chamar este backend em algum ambiente?
- O ranking de campeonatos deve ser global ou por conta/usuario dono?
- Os assets de `icons/Nova logo/` sao apenas sobras ou arquivos fonte que voce quer manter versionados?

## Criterios de Aceite

- Frontend e backend validam sem erro.
- Codigo morto confirmado removido.
- Assets/arquivo duplicado removidos sem quebrar referencias.
- Dependencias frontend refletem somente o que e usado.
- CORS nao contem fallbacks obsoletos sem motivo.
- Leaderboard evita varredura ampla desnecessaria.
- Nenhuma migration, alteracao de `.env`, commit, push ou deploy realizado.

## Instrucoes Para /implementar

- Antes de editar, reconfirmar referencias com `rg`.
- Usar `apply_patch` para edicoes manuais e `npm uninstall` somente para dependencias confirmadamente nao usadas.
- Nao tocar em `.env`.
- Nao executar migrations.
- Ao final, rodar as validacoes listadas e reportar qualquer falha.
