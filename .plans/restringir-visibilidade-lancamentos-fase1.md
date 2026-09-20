# Plano de Implementação: Restringir visibilidade de lançamentos ao próprio usuário por padrão (Fase 1)

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature — levantamento e decisões feitos interativamente, com 2 rodadas de investigação por agentes Explore)
- Data do planejamento: 2026-09-20
- Classificação: `fullstack` (backend + frontend; sem impacto em banco de dados)

## Resumo

Hoje, o backend expande automaticamente a visibilidade de dados financeiros para todos os membros de uma conta (família/equipe) sempre que a permissão correspondente está ativa (`acesso_lancamentos_familia`/`acesso_cartoes_familia`) — a expansão é incondicional em relação à intenção do usuário: não existe hoje nenhum parâmetro que signifique "me mostre só os meus dados, mesmo que eu tenha permissão de ver mais". Onde existe algum filtro na UI (Despesas, Painel), ele reduz um conjunto que já veio misturado do servidor, em vez de a requisição já vir restrita.

Este plano (Fase 1) inverte esse comportamento nas rotas que já implementam a carteira compartilhada: passam a ser restritas ao próprio usuário por padrão, exigindo um parâmetro explícito de escopo (mais a permissão correspondente) para expandir. Cobre: Despesas, Receitas, Cartões, Orçamento, Categorias (catálogo usado nos gráficos) e o Painel/Panorama.

Uma Fase 2, fora do escopo deste plano, tratará separadamente Fechamento de mês, Reservas, Calendário e Relatórios/PDF — rotas que hoje nunca implementaram a carteira compartilhada (sempre restritas ao próprio usuário, mesmo com a permissão ativa) e que exigem lógica adicionada do zero em cada uma, sem uma função central reaproveitável.

## Escopo

### Dentro do escopo

- `backend/src/utils/familyVisibility.ts`: `resolveByScope` (privada), `resolveVisibleUserIds` e `resolveVisibleCardOwnerIds` passam a receber um parâmetro `expandir: boolean` — quando `false` (ou omitido), retornam sempre `[requesterId]` sem consultar a tabela de permissões; quando `true`, mantêm o comportamento atual (checa permissão e expande para a conta inteira, se permitido).
- `backend/src/utils/dashboardScope.ts`: inverter o default de `resolveDashboardScope` — hoje `memberId === null` retorna todos os visíveis (linha 32); passa a retornar `[requesterId]` quando nenhum escopo ampliado for pedido.
- Rotas atualizadas para propagar a nova intenção via parâmetro de query e só chamar as funções acima com `expandir: true` quando o parâmetro estiver presente:
  - `backend/src/routes/expenses.ts` (linha ~205, `GET /`)
  - `backend/src/routes/incomes.ts` (linha ~33, `GET /`)
  - `backend/src/routes/cards.ts` (linha ~24, `GET /`)
  - `backend/src/services/budgetService.ts` (linha ~201, `getBudgetOverview`) e `backend/src/routes/budget.ts` (`GET /resumo`)
  - `backend/src/routes/categories.ts` (linha ~79, `GET /`)
  - `backend/src/routes/financial.ts` (`GET /panorama`, linhas ~90-128) — já tem o parâmetro `membro_id`; ajustar só o comportamento de default.
- Frontend:
  - `src/screens/despesas/DespesasScreen.tsx`: substituir o filtro `filtroAutor` (hoje client-side, `linha ~342`, filtrando um array já expandido) por um parâmetro real enviado à API.
  - `src/screens/receitas/ReceitasScreen.tsx`: adicionar seletor de escopo (hoje inexistente).
  - Tela de Cartões (a localizar durante implementação — consome `configService.fetchCartoes`): adicionar seletor de escopo (hoje inexistente).
  - Tela de Orçamento (consome `budgetService.fetchBudgetOverview`/`fetchBudgetOverviewRange`): adicionar seletor de escopo (hoje inexistente).
  - `src/screens/finance/FinanceDashboard.tsx`: ajustar o estado inicial de `membroId` (hoje `null` = família inteira, comentário explícito nas linhas ~42-43) para refletir "só eu" como padrão, mantendo a opção de trocar para "Família"/outro membro.
  - Query keys correspondentes atualizadas para incluir o parâmetro de escopo, evitando cache cruzado entre visualizações diferentes.

### Fora do escopo

- Fechamento de mês (`months.ts`), Reservas (`reserves.ts`), Calendário/Compromissos (`appointments.ts`), Relatórios/PDF (`reports.ts`) — tratados em um plano futuro (Fase 2), já que não usam a função central e cada uma exigiria lógica de expansão escrita do zero em múltiplas queries SQL raw.
- `backend/src/utils/familyVisibility.ts` → `resolveAccountOwnerId` — usado para dados de catálogo (categorias/cartões como entidade, não como lançamento), não depende de permissão e não deve mudar.
- `backend/src/routes/financial.ts` → `GET /anual` — já restrito ao próprio usuário sempre (linhas 42, 51, 60, 69), sem uso de `resolveVisibleUserIds`; não precisa de alteração.
- Qualquer alteração de schema, migration ou nova coluna/tabela.
- Qualquer nova permissão granular — reaproveita as duas já existentes (`acesso_lancamentos_familia`, `acesso_cartoes_familia`).

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo)
- `backend/AGENT.md`, `frontend/AGENT.md` — não existem como arquivos dedicados neste projeto; seguido apenas o `/AGENT.md` da raiz
- Duas rodadas de investigação por agentes Explore nesta conversa: a primeira mapeou o problema em termos gerais; a segunda (mais recente) revalidou tudo linha por linha contra o código atual, já refletindo a renomeação de papéis (`titular`/`membro`) aplicada em refactor anterior nesta mesma sessão

## Impacto por área

### Frontend

- **Despesas**: `filtroAutor` (estado local, `DespesasScreen.tsx` linha ~246) hoje filtra `allItems` já recebido do servidor (linha ~342). Passa a virar um parâmetro (`escopo`/`membro_id`) enviado na chamada a `fetchFinanceDashboard`, e o servidor devolve já filtrado.
- **Receitas**: hoje não tem `filtroAutor` nem seletor de escopo — precisa ganhar a mesma UI usada em Despesas (reaproveitando o componente, não recriando).
- **Cartões**: idem — sem seletor hoje, precisa ganhar um.
- **Orçamento**: idem — sem seletor hoje, precisa ganhar um.
- **Painel**: `FinanceDashboard.tsx` já tem o seletor (`membroId`, linha ~44, com opção `{ id: null, label: 'Família' }` na UI, linhas ~319-338) — só o estado inicial e o significado de "nenhuma seleção" mudam.
- Query keys: `queryKeys` correspondentes a despesas, receitas, cartões, orçamento e painel precisam incorporar o novo parâmetro de escopo, para que trocar o filtro dispare nova busca e não reutilize cache de outro escopo.
- Estados de loading/error/empty: sem mudança estrutural — os componentes já tratam esses estados; a única mudança é o parâmetro passado à query.

### Backend

- `familyVisibility.ts`: mudança de assinatura de `resolveByScope`, `resolveVisibleUserIds`, `resolveVisibleCardOwnerIds`. Como são usadas em 5 pontos diferentes, todos precisam ser atualizados na mesma implementação para não quebrar build.
- `dashboardScope.ts`: `resolveDashboardScope` já aceita `memberId`; a mudança é conceitual (o que significa `null`), não de assinatura.
- Rotas: cada uma passa a ler um novo parâmetro de query (nome sugerido: `escopo` com valores `'eu' | 'familia'`, ou reaproveitar o padrão `membro_id` já usado no Painel — decisão de implementação, mantendo consistência entre todas as rotas).
- Permissões: nenhuma nova — a validação de que o solicitante realmente tem `acesso_lancamentos_familia`/`acesso_cartoes_familia` continua ocorrendo dentro de `resolveByScope`, nunca confiando apenas no parâmetro do cliente.

### Banco de dados

`Sem impacto esperado` — nenhuma coluna, tabela ou índice novo.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/utils/familyVisibility.ts`
- `backend/src/utils/dashboardScope.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/cards.ts`
- `backend/src/routes/categories.ts`
- `backend/src/routes/budget.ts`
- `backend/src/routes/financial.ts`
- `backend/src/services/budgetService.ts`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- Tela(s) de Cartões e Orçamento (nomes exatos a confirmar durante a implementação)
- `src/services/queryKeys.ts` e services correspondentes (`financeService.ts`, `configService.ts`, `budgetService.ts` do frontend)

## Estratégia de implementação

1. Atualizar `familyVisibility.ts`: adicionar parâmetro `expandir: boolean` a `resolveByScope`/`resolveVisibleUserIds`/`resolveVisibleCardOwnerIds`.
2. Atualizar `dashboardScope.ts`: inverter o significado de `memberId === null` em `resolveDashboardScope`.
3. Atualizar as 6 rotas backend chamadoras (`expenses.ts`, `incomes.ts`, `cards.ts`, `budgetService.ts`/`budget.ts`, `categories.ts`, `financial.ts`) para ler o novo parâmetro de query e propagar `expandir`/`membro_id` corretamente.
4. Frontend: Despesas (substituir filtro client-side), Receitas, Cartões, Orçamento (adicionar seletor), Painel (ajustar default).
5. Atualizar query keys afetadas.
6. Rodar builds (`tsc --noEmit` backend e frontend, `vite build`).
7. Buscar novamente por todos os call sites de `resolveVisibleUserIds`/`resolveVisibleCardOwnerIds`/`resolveDashboardScope` para confirmar que nenhum ficou com a assinatura antiga.
8. Produzir resumo final e perguntar sobre envio para produção.

## Regras de negócio identificadas

- Visibilidade ampliada (ver dados de outros membros/colaboradores) é sempre uma ação explícita do usuário, nunca o estado inicial de uma tela.
- A permissão (`acesso_lancamentos_familia`/`acesso_cartoes_familia`) continua sendo pré-requisito obrigatório para a expansão — o parâmetro do cliente pedindo escopo ampliado nunca basta sozinho.
- Conta empresa nunca compartilha entre colaboradores — comportamento inalterado (já garantido dentro de `resolveByScope`, que só expande em conta `pessoal`).

## Regras multi-tenant e segurança

- O parâmetro de escopo vindo do cliente é sempre revalidado no backend contra a permissão real do solicitante — nunca confiar em flag enviada pelo frontend para decidir sozinho.
- Nenhuma mudança na prevenção de vazamento entre contas: a resolução de `accountId` e a checagem de vínculo em `conta_membros` dentro de `resolveByScope` permanecem intactas.
- Atenção especial ao propagar a mudança de assinatura: qualquer call site esquecido continuaria chamando a função sem o novo parâmetro, o que (dependendo do valor default escolhido na assinatura) pode restringir demais (falha seguindolado, aceitável) ou nunca expandir (regressão de funcionalidade, não de segurança) — nunca o inverso, pois o default é `false`.

## Validações necessárias

- Confirmar que o parâmetro de escopo aceito pelas rotas é validado contra um conjunto fechado de valores (nunca texto livre repassado a SQL).
- Confirmar que pedir escopo ampliado sem a permissão correspondente retorna o comportamento restrito (nunca erro que vaze informação sobre a existência de outros membros).

## Testes necessários

### Frontend

- Despesas: sem seleção de escopo, mostra só os próprios lançamentos; ao selecionar "Família", mostra todos (se o usuário tiver permissão).
- Receitas, Cartões, Orçamento: mesmo comportamento, com o seletor novo.
- Painel: abre por padrão mostrando só os próprios dados; trocar para "Família" resulta nos mesmos números de hoje.

### Backend

- `GET /despesas` sem parâmetro de escopo retorna só os lançamentos do solicitante, mesmo com `acesso_lancamentos_familia = true`.
- `GET /despesas` com parâmetro de escopo ampliado, solicitante COM permissão, retorna todos os membros visíveis.
- `GET /despesas` com parâmetro de escopo ampliado, solicitante SEM permissão, retorna só os próprios (nunca erro que revele a existência de outros membros).
- Mesmo padrão de teste replicado para `incomes`, `cards`, `budget`/`categories` (via `budgetService`), `financial/panorama`.

### E2E

- Fluxo completo: membro sem permissão de família abre Despesas/Receitas/Cartões/Orçamento/Painel e vê só os próprios dados em todas; gestor com permissão alterna para "Família" em cada tela e confirma que os totais batem com o que aparecia antes desta mudança (quando tudo vinha misturado por padrão).

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Mudança de contrato de API em 6 rotas ao mesmo tempo — risco de algum call site do frontend não ser atualizado e continuar sem enviar o parâmetro (resultando em visão restrita onde antes era ampliada — regressão funcional, não de segurança).
- Cache do React Query: trocar de escopo na mesma tela precisa invalidar/differenciar a query corretamente via key, ou o usuário verá dados desatualizados ao alternar.
- Escopo ainda considerável (6 rotas + 5 telas) — se durante a implementação ficar claro que é maior que o esperado, considerar sub-dividir ainda mais (ex: back-end primeiro, frontend depois, em commits/branches separados dentro da mesma feature).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — nome exato do parâmetro de query (`escopo` vs. reaproveitar `membro_id` em todas as rotas) fica como decisão de implementação, favorecendo consistência com o padrão já existente no Painel.

## Critérios de aceite do plano

- Nenhuma das 6 rotas cobertas expande visibilidade sem um parâmetro de escopo explícito enviado pelo cliente E a permissão correspondente validada no backend.
- Despesas, Receitas, Cartões, Orçamento e Painel compartilham o mesmo padrão de seletor de escopo, com "só eu" como estado inicial em todas.
- Builds (`tsc` backend, `tsc` frontend, `vite build`) passam sem erros.
- Nenhuma migration executada (não é necessária neste plano).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Este é o Plano 1 de 2 (Fase 1) — não expandir para Fechamento de mês, Reservas, Calendário ou Relatórios/PDF; isso será um plano separado.
- Ao mudar a assinatura de `resolveByScope`/`resolveVisibleUserIds`/`resolveVisibleCardOwnerIds`, atualizar TODOS os call sites na mesma implementação — build quebrado é sinal de call site esquecido, não de erro de tipo a ser silenciado.
- Reaproveitar o componente/padrão de seletor de escopo já usado no Painel para as novas telas (Receitas, Cartões, Orçamento) em vez de criar um novo do zero.
- Manter alterações focadas no escopo deste plano — não tocar nas 4 rotas de SQL espalhado reservadas para a Fase 2.
- Não executar migrations (não são necessárias neste plano).
