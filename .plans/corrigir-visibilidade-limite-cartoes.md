# Plano de Implementação: Corrigir visibilidade e clareza da faixa de limite de cartões

## Origem

- Arquivo de especificação: pedido direto no chat (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-21
- Classificação: `frontend + backend` (sem banco de dados)

## Resumo

A faixa de limite de cartões em Movimentações (`CardLimitRow`) hoje ignora o filtro de
Membros da tela: a rota `GET /cartoes/limites` sempre expande para cartões de toda a
família (parâmetro `expandir` hardcoded como `true` em `cardLimitService.ts`), mostrando
cartões de membros não selecionados no filtro. Além disso, a apresentação hoje só mostra
"usado / limite" + barra — o campo `disponivel` (já calculado no backend) não é exibido.
Este plano corrige a visibilidade para respeitar o filtro de Membros já unificado em
`MovimentacoesScreen.tsx`, e reapresenta os três valores (Limite, Usado, Disponível) lado
a lado na faixa de cartões.

## Escopo

### Dentro do escopo

- Backend: `GET /cartoes/limites` passa a ler `escopo` da query string (mesmo padrão já
  usado por `GET /cartoes` na mesma rota, e por `expenses.ts`/`categories.ts`/
  `accountMembers.ts`), repassando `escopo === 'familia'` para `getCardLimits`.
- `getCardLimits(userId, accountId, expandir)` passa a receber `expandir` como parâmetro
  explícito, em vez de `true` fixo, repassando para `resolveVisibleCardOwnerIds`.
- Frontend: `fetchCardLimits(escopo?: 'familia')` propaga o escopo na query string.
- `ExpenseForm.tsx`: mantém o comportamento atual (sempre expandido), passando
  `escopo: 'familia'` fixo nessa chamada específica — decisão explícita do usuário para
  não alterar o formulário de lançamento.
- `MovimentacoesScreen.tsx`: passa `escopoFamilia ? 'familia' : undefined` (já calculado
  na tela) para `fetchCardLimits`.
- `queryKeys.cardLimits` passa a aceitar `(accountId?, escopo?: 'familia')`, mesmo padrão
  já usado por `queryKeys.cartoes` (linha 22 de `queryKeys.ts`), para não colidir cache
  entre as duas chamadas (`ExpenseForm` sempre família, `MovimentacoesScreen` variável).
- `CardLimitRow.tsx`: redesenhar para mostrar `Limite: R$X · Usado: R$Y · Disponível: R$Z`
  lado a lado, mantendo a barra de progresso e as cores de alerta (70%/90%) já existentes.

### Fora do escopo

- Nenhuma migration/alteração de schema.
- `resolveVisibleCardOwnerIds`/`familyVisibility.ts` — já implementados corretamente,
  só não eram usados com o parâmetro certo nesta rota específica.
- `GET /cards` (listagem de cartões) — já usa `escopo === 'familia'` corretamente, não
  precisa de mudança.
- Qualquer mudança em `ExpenseForm.tsx` além de passar o escopo fixo na chamada de
  `fetchCardLimits` — o formulário continua se comportando exatamente como hoje.

## Leitura de contexto

- `CLAUDE.md` da raiz do workspace — fluxo obrigatório de planejar → aprovar → implementar
  → finalizar, considerado; não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste
  projeto.
- `backend/src/services/cardLimitService.ts` — lido por completo; `getCardLimits` com
  `resolveVisibleCardOwnerIds(userId, accountId, true)` hardcoded (linha 51).
- `backend/src/routes/cards.ts` — lido por completo; rota `GET /` (linha 16-55) já usa
  `escopo === 'familia'` corretamente (linha 25); rota `GET /limites` (linha 58-68) não lê
  `escopo` nem repassa nada além de `accountId`.
- `backend/src/utils/familyVisibility.ts` — lido por completo; `resolveVisibleCardOwnerIds`
  e `resolveByScope` já implementam a regra de `expandir` explícito corretamente — a
  correção é só no chamador (`cardLimitService.ts`/`cards.ts`), não nessas funções.
- `src/services/cardLimitsService.ts` — lido por completo; `fetchCardLimits()` sem
  parâmetros hoje.
- `src/screens/finance/CardLimitRow.tsx` — lido por completo (39 linhas); componente
  puramente apresentacional, recebe `nome`, `usado`, `limite`.
- `src/screens/finance/MovimentacoesScreen.tsx` — já calcula `escopoFamilia` (derivado do
  filtro de Membros único) para `useFinanceDashboard`; `cardLimits` query hoje sem escopo.
- `src/services/queryKeys.ts` — lido por completo; `queryKeys.cartoes` (linha 22) já é o
  padrão de referência (`accountId`, `escopo?: 'familia'`) a replicar em `cardLimits`
  (hoje linha 63, sem parâmetros).
- Confirmado por grep: `fetchCardLimits`/`queryKeys.cardLimits` são usados em exatamente
  dois pontos do frontend — `ExpenseForm.tsx:140` e `MovimentacoesScreen.tsx:138`.

## Impacto por área

### Frontend

- `src/services/cardLimitsService.ts`: `fetchCardLimits(escopo?: 'familia')`, adiciona
  `&escopo=familia` na query string quando presente.
- `src/services/queryKeys.ts`: `cardLimits: (accountId?: number | null, escopo?: 'familia') => [...]`,
  mesmo padrão de `cartoes`.
- `src/screens/finance/ExpenseForm.tsx`: `fetchCardLimits('familia')` na `queryFn`, query
  key correspondente com escopo fixo `'familia'`.
- `src/screens/finance/MovimentacoesScreen.tsx`: `fetchCardLimits(escopoFamilia ? 'familia' : undefined)`,
  query key com o mesmo escopo calculado.
- `src/screens/finance/CardLimitRow.tsx`: nova prop `disponivel: number`; layout com os
  três valores lado a lado, mantendo barra de progresso e cores de alerta.

Sem impacto em hooks compartilhados, estados de loading/error/empty (queries já tratam
isso via React Query).

### Backend

- `backend/src/routes/cards.ts`: rota `GET /limites` lê `escopo` da query string e repassa
  `escopo === 'familia'` para `getCardLimits`.
- `backend/src/services/cardLimitService.ts`: `getCardLimits(userId, accountId, expandir: boolean)`
  — parâmetro explícito, sem default `true`; chamador sempre informa.
- Sem mudança de permissões — a permissão `acesso_cartoes_familia` já é a mesma checada
  hoje dentro de `resolveByScope`, só o parâmetro `expandir` que chega até ela muda.

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário — não se
aplica a este plano (nenhuma migration envolvida).

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `backend/src/routes/cards.ts`
- `backend/src/services/cardLimitService.ts`
- `src/services/cardLimitsService.ts`
- `src/services/queryKeys.ts`
- `src/screens/finance/ExpenseForm.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/CardLimitRow.tsx`

## Estratégia de implementação

1. Backend: ajustar `getCardLimits` para receber `expandir: boolean` explícito.
2. Backend: ajustar rota `GET /cartoes/limites` para ler `escopo` da query string e
   repassar `escopo === 'familia'`.
3. Frontend: ajustar `fetchCardLimits` para aceitar e propagar `escopo?: 'familia'`.
4. Frontend: ajustar `queryKeys.cardLimits` para incluir `accountId`/`escopo`.
5. Frontend: `ExpenseForm.tsx` passa `escopo: 'familia'` fixo (preserva comportamento).
6. Frontend: `MovimentacoesScreen.tsx` passa `escopoFamilia` calculado da tela.
7. Frontend: redesenhar `CardLimitRow.tsx` com os três valores lado a lado.
8. Rodar `npx tsc --noEmit` e `npx vite build` (frontend); rodar build do backend se
   houver script equivalente.

## Regras de negócio identificadas

- Visibilidade de cartões de outros membros só deve ocorrer quando o solicitante pede
  explicitamente (escopo família) — regra já existente em `familyVisibility.ts`, este
  plano apenas conecta a tela de Movimentações a essa regra corretamente.

## Regras multi-tenant e segurança

- `resolveVisibleCardOwnerIds` já valida conta pessoal, vínculo ativo e permissão
  `acesso_cartoes_familia` antes de expandir — nenhuma mudança nessa validação.
- Conta empresa nunca expande (regra já garantida por `resolveByScope`).
- Nenhum vazamento novo: a mudança reduz o escopo de dados exibidos por padrão (antes
  sempre família, agora respeita o filtro), nunca amplia.

## Validações necessárias

- Confirmar que `GET /cartoes/limites?conta_id=X` (sem `escopo`) retorna só os cartões do
  próprio usuário.
- Confirmar que `GET /cartoes/limites?conta_id=X&escopo=familia` retorna cartões de todos
  os membros visíveis (comportamento atual, preservado quando pedido explicitamente).
- Confirmar que `ExpenseForm.tsx` continua mostrando limite de cartões de todos os membros
  (comportamento inalterado).
- Confirmar que a faixa de cartões em Movimentações muda ao alterar o filtro de Membros.

## Testes necessários

### Frontend

- Validação manual: alternar filtro de Membros em Movimentações e confirmar que a faixa
  de cartões reflete a seleção.

### Backend

- Validação manual via chamada direta à rota com e sem `escopo=familia`.

### E2E

`Sem impacto esperado` (sem suíte E2E no projeto)

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Baixo risco — segue padrão já usado e testado em outras rotas do mesmo arquivo
  (`GET /cards`) e de outras rotas (`expenses.ts`, `categories.ts`).
- Cuidado ao trocar a query key de `cardLimits`: garantir que os dois call sites
  (`ExpenseForm.tsx`, `MovimentacoesScreen.tsx`) usem chaves diferentes (escopos
  diferentes) para não compartilhar cache incorretamente — mesmo cuidado já documentado
  no comentário de `queryKeys.cartoes`.
- Produção real: a rota `/cartoes/limites` está em uso ativo; testar localmente antes de
  enviar para produção.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões fechadas nas respostas do usuário
(corrigir visibilidade respeitando o filtro de Membros; layout de 3 valores lado a lado;
`ExpenseForm.tsx` mantém sempre expandido).

## Critérios de aceite do plano

- `GET /cartoes/limites` sem `escopo=familia` retorna só cartões do próprio usuário.
- `GET /cartoes/limites?escopo=familia` retorna cartões de todos os membros visíveis.
- Faixa de cartões em Movimentações reflete o filtro de Membros da tela.
- `ExpenseForm.tsx` continua mostrando cartões de todos os membros (comportamento atual).
- `CardLimitRow` mostra Limite, Usado e Disponível lado a lado.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir exatamente o padrão já usado em `GET /cards` (mesma rota) e em
  `expenses.ts`/`categories.ts` para leitura de `escopo` da query string.
- Não tocar em `familyVisibility.ts` — já está correto.
- Não alterar o comportamento de `ExpenseForm.tsx` além de passar o escopo fixo.
- Manter a barra de progresso e cores de alerta existentes em `CardLimitRow.tsx`.
