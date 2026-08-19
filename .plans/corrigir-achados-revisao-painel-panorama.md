# Plano de Implementação: Corrigir achados da revisão de código do Painel financeiro (panorama)

## Origem

- Arquivo de especificação: `.plans/tasks/corrigir-achados-revisao-painel-panorama.md`
- Data do planejamento: `2026-08-19`
- Classificação: `backend + frontend`

## Resumo

Corrige 4 achados levantados numa revisão de código da feature de panorama
financeiro do Painel (já em produção):

1. Granularidade da série no modo "todo o período" hoje é fixa em `'ano'`;
   deve ser calculada a partir do histórico real do usuário.
2. O campo `aporte_inicial` do perfil (`backend/src/db/schema/profiles.ts`)
   nunca é lido em nenhum cálculo de saldo do sistema — passa a ser somado
   como saldo de abertura, uma única vez, no início real do histórico do
   perfil, em `months.ts` (saldo mensal/fechamento) e no endpoint
   `/panorama`. O endpoint `/anual` fica fora do escopo por limitação
   estrutural (não acumula saldo nativamente).
3. `useBudgetOverview` é buscado duas vezes com os mesmos parâmetros
   (`FinanceDashboard` e `MonthCategoriesOverview`) — unifica em uma única
   busca, repassada por prop.
4. Grid de cards do Painel fica com buraco visual quando "Parcelas futuras"
   não é exibido (filtro fora de um único mês) — ajuste de layout.

## Escopo

### Dentro do escopo

- `backend/src/routes/financial.ts`: granularidade da série no modo "tudo"
  calculada a partir do histórico real; `saldoAnterior` do `/panorama`
  passa a considerar `aporte_inicial` quando o período filtrado começa no
  início real do histórico do perfil.
- `backend/src/routes/months.ts`: `calculateBalanceBreakdown` passa a somar
  `aporte_inicial` como saldo de abertura, uma única vez, quando o mês
  consultado é o início real do histórico do perfil (não em "buracos" no
  meio do histórico).
- `src/screens/finance/FinanceDashboard.tsx`: única chamada de
  `useBudgetOverview`, repassada como prop para `MonthCategoriesOverview`.
- `src/screens/finance/MonthCategoriesOverview.tsx`: recebe `overview` via
  prop em vez de buscar internamente.
- `src/screens/finance/FinanceDashboard.tsx`: ajuste de grid na seção
  "Análise do período" para não deixar buraco visual quando há 5 cards em
  vez de 6.

### Fora do escopo

- `backend/src/routes/financial.ts` endpoint `/anual`: não será alterado
  para considerar `aporte_inicial` — limitação estrutural conhecida e
  documentada (esse endpoint não acumula saldo nativamente entre meses,
  diferente de `months.ts`/`/panorama`).
- Qualquer outra mudança no Painel financeiro além dos 4 pontos.
- Novos cards, gráficos ou filtros.
- Alterações em `escalacao futebol`.
- Migrations de schema (não são necessárias — `aporte_inicial` já existe).

## Leitura de contexto

- `sistema financas/AGENT.md` — lido (mesmo template genérico multi-tenant
  já identificado no plano anterior desta feature; não reflete a realidade
  deste projeto single-user com `usuario_id`/`perfil_id` e raw SQL). Segue-se
  o padrão real do código existente, como no plano anterior.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados.
- `.plans/tasks/corrigir-achados-revisao-painel-panorama.md` (spec de
  origem, criada nesta sessão a partir da revisão de código).
- `.plans/painel-panorama-financeiro-sem-filtro-global.md` (plano da
  feature original, para contexto).
- Arquivos lidos nesta investigação: `backend/src/routes/financial.ts`,
  `backend/src/routes/months.ts`, `backend/src/db/schema/profiles.ts`,
  `backend/src/routes/profiles.ts`, `src/screens/finance/FinanceDashboard.tsx`,
  `src/screens/finance/MonthCategoriesOverview.tsx`.

## Impacto por área

### Frontend

- `src/screens/finance/FinanceDashboard.tsx`:
  - Mantém a única chamada `useBudgetOverview(singleMonth?.mes ?? THIS_MONTH,
    singleMonth?.ano ?? THIS_YEAR)`; passa `overviewQ.data` (e, se necessário,
    `overviewQ.isLoading`/`overviewQ.error`) como prop para
    `MonthCategoriesOverview` no lugar de deixá-lo buscar sozinho.
  - Ajusta o grid da seção "Análise do período": hoje 6 cards possíveis em
    `xl:grid-cols-3` (2 linhas cheias); quando `singleMonth` é `null`,
    "Parcelas futuras" não renderiza e sobram 5 cards, deixando buraco na
    2ª linha. Resolver reordenando para que os cards condicionais fiquem
    por último (já é o caso) e ajustando o layout (ex: last card ocupando
    largura extra, ou usando `xl:auto-rows` neutro) para não deixar vazio
    perceptível. Sem alterar conteúdo ou dados dos cards.
- `src/screens/finance/MonthCategoriesOverview.tsx`:
  - Troca a prop de entrada de `{ month, year }` para `{ overview }`
    (tipo `BudgetOverview | undefined`, já usado hoje via `useBudgetOverview`),
    removendo a chamada interna do hook.
  - Mantém o mesmo guard de retorno `null` (loading/erro/vazio/profileType
    empresa), agora avaliando o `overview` recebido em vez de um
    `overviewQuery` próprio.

Estados de loading/error permanecem tratados no componente pai
(`FinanceDashboard`), que já tem essa lógica centralizada.

### Backend

- `backend/src/routes/financial.ts`:
  - Endpoint `/panorama`: quando `deChave`/`ateChave` forem `null` (modo
    "todo o período"), calcular a granularidade da série a partir da
    `primeira_data` já retornada pela query de totais (reordenar para que
    esse dado esteja disponível antes de decidir a granularidade) até a
    data de hoje, aplicando a mesma regra de corte já existente (≤24 meses
    de intervalo = granularidade `'mes'`, senão `'ano'`).
  - Endpoint `/panorama`: na query de `saldoAnterior`, quando o período
    filtrado (`deChave`) coincide com o início real do histórico do perfil
    (nenhum lançamento anterior a essa data), somar `perfis.aporte_inicial`
    (tratando `NULL` como 0) ao resultado.
- `backend/src/routes/months.ts`:
  - `calculateBalanceBreakdown`: ao resolver `previousBalance` (hoje: busca
    `meses.saldo_final` do mês anterior, fallback `0`), adicionar uma
    verificação de "é o início real do histórico do perfil?" (nenhuma
    receita/despesa registrada antes do mês/ano consultado). Se for, somar
    `aporte_inicial` ao fallback `0`. Se não for (mês anterior sem registro
    no meio do histórico), manter `0` como hoje, sem aplicar o aporte.
  - Isso propaga automaticamente para o fechamento de mês (`POST
    /:ano/:mes/fechar`, que usa `calculateFinalBalance` →
    `calculateBalanceBreakdown`) e para qualquer consulta de saldo mensal
    (`GET /:ano/:mes/saldo`).
- Ambas as queries seguem o padrão já existente do projeto (raw SQL
  parametrizado via `pool.query`, sempre filtrando por `usuario_id` da
  sessão autenticada e `perfil_id` opcional).

### Banco de dados

Sem impacto esperado. `aporte_inicial` já existe na tabela `perfis`
(`backend/src/db/schema/profiles.ts`); nenhuma coluna ou tabela nova.

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção. Este
plano não requer nenhuma migration.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/routes/financial.ts`
- `backend/src/routes/months.ts`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MonthCategoriesOverview.tsx`

## Estratégia de implementação

1. `backend/src/routes/months.ts`: implementar a verificação de "início
   real do histórico" e aplicar `aporte_inicial` em
   `calculateBalanceBreakdown`.
2. `backend/src/routes/financial.ts`: aplicar a mesma lógica de
   `aporte_inicial` na query de `saldoAnterior` do `/panorama`.
3. `backend/src/routes/financial.ts`: corrigir o cálculo de granularidade
   no modo "todo o período" para considerar o histórico real em vez de
   assumir `'ano'`.
4. `src/screens/finance/MonthCategoriesOverview.tsx`: trocar `{ month,
   year }` por `{ overview }` como prop de entrada.
5. `src/screens/finance/FinanceDashboard.tsx`: repassar `overviewQ.data`
   para `MonthCategoriesOverview`; remover a busca duplicada.
6. `src/screens/finance/FinanceDashboard.tsx`: ajustar o grid da seção
   "Análise do período" para eliminar o buraco visual quando há 5 em vez
   de 6 cards.
7. Rodar build/typecheck de backend e frontend.
8. Validar manualmente os cenários descritos na seção de testes.

## Regras de negócio identificadas

- `aporte_inicial` deve ser somado ao saldo como "saldo de abertura" **uma
  única vez**, no início real do histórico do perfil (o mês mais antigo em
  que há alguma receita ou despesa registrada) — nunca em meses sem
  registro no meio do histórico, para não contar o aporte mais de uma vez.
- Granularidade da série no `/panorama`: mês se o intervalo (real ou
  filtrado) tiver até 24 meses, ano caso contrário — regra já existente,
  agora aplicada também quando o filtro é "todo o período".
- `/anual` permanece com seu comportamento atual (sem `aporte_inicial`),
  documentado como inconsistência conhecida e aceita.

## Regras multi-tenant e segurança

Este projeto isola dados por `usuario_id`/`perfil_id`, não por
tenant/prefeitura (ver plano anterior desta feature para o mesmo
esclarecimento sobre o `AGENT.md` genérico do projeto).

- A verificação de "início real do histórico" e a leitura de
  `aporte_inicial` devem sempre filtrar por `usuario_id` (da sessão
  autenticada) e `perfil_id`, seguindo exatamente o padrão já usado nas
  demais queries de `financial.ts`/`months.ts`.
- Nenhuma mudança introduz acesso a dados de outro usuário ou perfil.

## Validações necessárias

- Backend: garantir que a query de "início real do histórico" trate
  corretamente perfis sem nenhum lançamento (não deve quebrar nem aplicar
  aporte incorretamente).
- Backend: `aporte_inicial` nulo deve ser tratado como 0 (já é `decimal`
  nullable no schema).
- Frontend: `MonthCategoriesOverview` deve continuar retornando `null`
  corretamente nos mesmos casos de hoje (loading, erro, sem overview,
  perfil empresa) agora a partir da prop recebida.

## Testes necessários

### Frontend

- Painel com filtro "todo o período": card "Perfil" (rótulo
  pessoal/empresa) continua correto; `MonthCategoriesOverview` continua
  aparecendo/sumindo nos mesmos casos de antes.
- Grid da seção "Análise do período": conferir visualmente com filtro de
  mês único (6 cards) e com filtro de ano/intervalo/tudo (5 cards) — sem
  buraco perceptível em nenhum dos dois casos.

### Backend

- `GET /:ano/:mes/saldo` para o primeiro mês do histórico de um perfil com
  `aporte_inicial` preenchido: `saldo_anterior` deve incluir o aporte.
- Mesmo endpoint para um mês no meio do histórico sem registro do mês
  anterior (se esse cenário for reproduzível): `saldo_anterior` deve
  continuar `0`, sem aplicar o aporte de novo.
- `POST /:ano/:mes/fechar` no primeiro mês do histórico: saldo final
  persistido deve refletir o aporte inicial.
- `GET /panorama` no modo "todo o período" com histórico curto (poucos
  meses): granularidade deve vir `'mes'`, não `'ano'`.
- `GET /panorama` com `de` no início real do histórico: `saldoAnterior`
  deve incluir `aporte_inicial`.

### E2E

- Fluxo: perfil com aporte inicial cadastrado → abrir Painel com "todo o
  período" → conferir saldo inicial refletido → fechar o primeiro mês em
  Movimentações → conferir que o saldo fechado também reflete o aporte.

## Comandos de validação sugeridos

```bash
npm run build
npx tsc --noEmit

npm --prefix backend run build
```

## Riscos e pontos de atenção

- Mudança em `calculateBalanceBreakdown` afeta saldo mensal e fechamento de
  mês em todo o sistema, não só o painel — qualquer perfil com
  `aporte_inicial` preenchido verá o saldo mudar retroativamente no início
  do seu histórico. Esse é o comportamento pretendido, mas é uma mudança de
  número visível ao usuário e vale confirmar com atenção antes de finalizar.
- A verificação de "início real do histórico" adiciona uma query por
  chamada; volume de dados por usuário é pequeno, mas vale observar
  performance.
- `/anual` fica propositalmente inconsistente com `/panorama`/`months.ts`
  nesse detalhe — risco de confusão futura se não for bem documentado no
  código (comentário no `/anual` explicando a limitação).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões foram fechadas
durante o planejamento desta sessão.

## Critérios de aceite do plano

- Painel no modo "todo o período" usa granularidade `'mes'` quando o
  histórico real cabe em até 24 meses, `'ano'` caso contrário.
- Perfis com `aporte_inicial` preenchido têm esse valor refletido no saldo
  mensal (`months.ts`) e no saldo do painel (`/panorama`) a partir do
  início real do seu histórico, sem duplicar o valor em meses posteriores.
- `MonthCategoriesOverview` não faz mais sua própria busca de
  `useBudgetOverview`; recebe o dado via prop de `FinanceDashboard`.
- Grid da seção "Análise do período" não deixa buraco visual perceptível
  com 5 ou 6 cards.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não são necessárias).
- Seguir o padrão de código real já existente no projeto (raw SQL
  parametrizado no backend, React Query no frontend), não o template
  genérico do `AGENT.md` da raiz.
- Testar manualmente o fechamento de mês (`POST /:ano/:mes/fechar`) após
  a mudança em `months.ts`, dado que é um fluxo sensível já usado em
  produção.
- Manter alterações pequenas e focadas, seguindo a ordem da "Estratégia de
  implementação".
