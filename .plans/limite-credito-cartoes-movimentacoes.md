# Plano de Implementação: Limite de crédito por cartão no card Comprometimento

## Origem

- Arquivo de especificação: descrição textual do usuário (memória de feature antiga + investigação de código)
- Data do planejamento: 2026-09-02
- Classificação: `frontend + backend`

## Resumo

O usuário lembrava de um controle de "limite de cartão de crédito usado no mês" que existiu no sistema. Investigação (2 agentes Explore) confirmou que essa feature **nunca teve UI real** — existiu só como cálculo de backend por 1 dia (commit `5f47cb3`, 5 ago 2026), removida no mesmo dia como código morto (commit `a09babe`) porque o valor nunca era lido pelo frontend. Não há "tela antiga" para restaurar — a exibição precisa ser desenhada do zero, reaproveitando apenas a ideia da fórmula de cálculo.

Após discussão, o formato final não é um card novo isolado: as linhas de limite por cartão de crédito passam a viver **dentro do card "Comprometimento"** já existente na tela de Movimentações, logo abaixo da barra de comprometimento de renda que já está lá — evitando poluir a tela com mais um card quando o espaço já existente comporta a informação.

## Escopo

### Dentro do escopo

- Nova rota backend `GET /api/cartoes/limites`, com service dedicado, calculando por cartão de crédito ativo: `limite`, `usado`, `disponivel`
- Fórmula: `usado` = soma de `COALESCE(valor_final, valor_original)` de todas as despesas em aberto (`pago = false`, `status = 'ativa'`) daquele cartão, de qualquer mês (passado, presente ou futuro) — não só o mês corrente
- Regra de tipo de cartão: só cartões com `tipo IN ('credito', 'ambos')` ou `tipo IS NULL` entram no cálculo; para cartões `tipo = 'ambos'` ou `tipo IS NULL`, filtrar adicionalmente `despesas.forma_pagamento = 'credito'` (cartões `tipo = 'credito'` puro não precisam desse filtro adicional, pois a validação de compatibilidade já impede forma de pagamento divergente)
- Frontend: `MovementMetricCard.tsx` ganha uma prop `children`/`extra` opcional para renderizar conteúdo adicional abaixo da barra existente — usada exclusivamente pelo card "Comprometimento"; os outros 3 usos (Saldo atual, Despesas, Saldo projetado) continuam idênticos, sem essa prop
- Novo mini-componente de linha (label do cartão + valor usado + barra de progresso), renderizado uma vez por cartão de crédito, dentro do slot novo do card Comprometimento
- Corrigir `src/screens/finance/ExpenseDialog.tsx:649`: o texto hoje mostra `limite disponível ${limite bruto}` (sem descontar nada) — passa a mostrar o valor real (`disponivel`) vindo do novo endpoint

### Fora do escopo

- Qualquer mudança na tela de Cartões (`CartaoTab.tsx`) além do estritamente necessário
- Mudar a fórmula/exibição de qualquer outro card já existente em Movimentações ou no Painel
- Corrigir o bug paralelo de `status` não filtrado em `budgetService.ts` (documentado como achado, não corrigido aqui)
- Gerar ocorrências futuras de despesas recorrentes (não existe hoje, não é para criar agora)
- Migrations de schema — a coluna `status` já existe na tabela real, só não está mapeada no Drizzle; usar SQL cru ou `sql\`\`` para essa condição específica, sem alterar schema

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto; não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- `backend/src/db/schema/expenses.ts`, `backend/src/db/schema/cards.ts` (lidos por completo)
- `backend/src/routes/cards.ts`, `backend/src/routes/expenses.ts` (lidos por completo, incluindo `validateCardTypeCompatibility`)
- `backend/src/routes/budget.ts` + `backend/src/services/budgetService.ts` (padrão de referência: rota fina + service dedicado combinando cadastro + cálculo agregado)
- `backend/src/routes/financial.ts` (padrão de referência para o cálculo `COALESCE(valor_final, valor_original)`)
- `src/screens/finance/MovimentacoesScreen.tsx` (lido por completo — grid dos 4 cards, hooks de dados atuais)
- `src/screens/finance/MovementMetricCard.tsx` (lido por completo)
- `src/screens/finance/ExpenseDialog.tsx:649` (texto atual do "limite disponível")
- `src/services/configService.ts`, `src/types/config.ts` (cadastro de cartões já existente, `fetchCartoes`)
- `src/services/queryKeys.ts` (padrão de nomenclatura de query keys — `budgetOverview` usado como referência)
- 2 investigações via agente Explore (histórico git da feature original, schema real vs. Drizzle, análise de sobreposição e código morto)

## Impacto por área

### Frontend

**Telas:**
- `src/screens/finance/MovimentacoesScreen.tsx`: nova query React Query para `GET /api/cartoes/limites`; card "Comprometimento" passa a receber o novo conteúdo via prop `children`/`extra` do `MovementMetricCard`

**Componentes:**
- `src/screens/finance/MovementMetricCard.tsx`: adicionar prop opcional `children` (ou `extra`), renderizada abaixo da barra/nota existente, sem alterar o comportamento dos outros 3 usos
- Novo mini-componente de linha de cartão (nome sugerido: `CardLimitRow.tsx`, mesma pasta `src/screens/finance/`), recebendo `nome`, `usado`, `limite`, `disponivel` — renderiza label + valor + barra de progresso (`Math.min(100, usado/limite*100)`), inspirado visualmente na barra já usada em `MovementMetricCard` (altura fina, cantos arredondados)
- `src/screens/finance/ExpenseDialog.tsx`: linha 649 passa a consumir o valor `disponivel` do novo endpoint (via a mesma query ou uma busca pontual) em vez de `selectedCard.limite` bruto

**Services:**
- Novo `src/services/cardLimitsService.ts` (ou função adicionada a `financeService.ts`), com `fetchCardLimits()` chamando `GET /api/cartoes/limites`

**Query keys:**
- Nova chave em `src/services/queryKeys.ts`, ex.: `cardLimits: ['card-limits'] as const` (seguindo o padrão de `budgetOverview`)

**Estados de loading/error/empty:**
- Se não houver nenhum cartão de crédito ativo, a seção extra do card Comprometimento simplesmente não renderiza nada (sem mensagem de erro nem estado vazio chamativo — é uma seção opcional)
- Erro na busca dos limites não deve quebrar o card Comprometimento inteiro (ele continua mostrando o comprometimento de renda normalmente mesmo se a busca de limites falhar)

### Backend

**Rotas:**
- Nova rota `GET /api/cartoes/limites` em `backend/src/routes/cards.ts` (ou arquivo dedicado, a critério da implementação, mas mantendo o padrão de montagem já usado para `/api/cartoes`)

**Services:**
- Novo `backend/src/services/cardLimitService.ts`, com função (ex.: `getCardLimits(userId, accountId)`) retornando array de `{ id, nome, limite, usado, disponivel }` para cada cartão de crédito ativo do usuário/conta

**Query SQL (esboço, a refinar na implementação):**
```sql
SELECT c.id, c.nome, c.limite, c.tipo,
  COALESCE(SUM(
    CASE WHEN d.id IS NOT NULL THEN COALESCE(d.valor_final, d.valor_original) ELSE 0 END
  ), 0) AS usado
FROM cartoes c
LEFT JOIN despesas d ON d.cartao_id = c.id
  AND d.pago = false
  AND d.status = 'ativa'
  AND (c.tipo = 'credito' OR d.forma_pagamento = 'credito')
WHERE c.usuario_id = $1 AND c.ativo = true
  AND (c.tipo IS NULL OR c.tipo IN ('credito', 'ambos'))
GROUP BY c.id, c.nome, c.limite, c.tipo
```
(ajustar filtro de conta/`conta_id` conforme padrão já usado em `cards.ts`)

**Validações:**
- Filtrar sempre por `usuario_id`/`conta_id` do usuário autenticado, seguindo o padrão de todas as rotas existentes
- Não vazar dados de cartão de outro usuário

**Permissões:** nenhuma nova — segue autenticação padrão já existente

### Banco de dados

`Sem impacto esperado` — nenhuma migration necessária. A coluna `status` já existe na tabela `despesas` real; o cálculo novo vai referenciá-la via SQL cru (a rota pode usar `pool.query` diretamente, como já é comum em outras rotas deste projeto, evitando a necessidade de mapear `status` no schema Drizzle só para este caso).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Esta task não deve precisar de nenhuma migration.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `backend/src/routes/cards.ts` (nova rota) ou novo arquivo de rota dedicado
- `backend/src/services/cardLimitService.ts` (novo)
- `src/services/cardLimitsService.ts` (novo) ou adição a `src/services/financeService.ts`
- `src/services/queryKeys.ts`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/MovementMetricCard.tsx`
- `src/screens/finance/CardLimitRow.tsx` (novo)
- `src/screens/finance/ExpenseDialog.tsx`

## Estratégia de implementação

1. Confirmar no banco os nomes exatos de tabela/coluna relevantes (`despesas.status`, `cartoes.tipo`) antes de escrever a query final, já que `status` não está no schema Drizzle
2. Criar `backend/src/services/cardLimitService.ts` com a lógica de cálculo (SQL cru via `pool.query`, seguindo o padrão de outras rotas que já usam SQL cru neste projeto)
3. Criar a rota `GET /api/cartoes/limites`, fina, delegando ao service
4. Rodar `cd backend && npm run build`
5. Criar `src/services/cardLimitsService.ts` (ou função em `financeService.ts`) com `fetchCardLimits()`
6. Adicionar `cardLimits` a `src/services/queryKeys.ts`
7. Adicionar prop `children`/`extra` opcional a `MovementMetricCard.tsx`, sem alterar o comportamento dos 3 usos existentes
8. Criar `CardLimitRow.tsx` (mini-componente de linha: nome do cartão, valor usado, barra)
9. Em `MovimentacoesScreen.tsx`: nova query React Query para `fetchCardLimits`; renderizar uma `CardLimitRow` por cartão dentro do `children` do card "Comprometimento"
10. Corrigir `ExpenseDialog.tsx:649` para usar o valor `disponivel` real (via a mesma query, reaproveitando cache do React Query se possível, evitando fetch duplicado)
11. Rodar `npx tsc --noEmit -p .` e `npx vite build`
12. Testar manualmente: cartão de crédito com despesas parceladas (parcela futura deve contar no "usado"), despesa paga (deve sair do "usado" ao marcar como paga), cartão tipo "ambos" com despesas mistas de débito e crédito (só a parte de crédito deve contar), cartão de débito puro (não deve aparecer na lista)

## Regras de negócio identificadas

- Limite usado = soma de despesas em aberto (não pagas, status ativa) do cartão, de qualquer mês, refletindo o comprometimento real do limite como um banco calcula (parcelamento ocupa o limite inteiro desde a compra, liberando conforme cada parcela é paga)
- Despesas recorrentes não têm linhas futuras pré-criadas, então são tratadas naturalmente pela mesma soma, sem lógica especial
- Cartões de débito puro nunca entram no cálculo
- Cartões tipo "ambos" só contam a parte das despesas marcadas com `forma_pagamento = 'credito'`
- Pagar uma despesa (mudar `pago` para `true`) libera aquele valor do limite usado imediatamente

## Regras multi-tenant e segurança

- Não há dimensão multi-tenant/prefeitura neste projeto
- A nova rota deve filtrar exclusivamente por `usuario_id`/`conta_id` do usuário autenticado (token JWT), sem exceção
- Nenhum dado de cartão de outro usuário pode vazar via essa rota

## Validações necessárias

- Cartão sem nenhuma despesa em aberto: `usado = 0`, sem erro
- Cartão com `limite = 0` ou usado maior que o limite (limite estourado): a barra de progresso deve ser limitada visualmente a 100% (`Math.min(100, ...)`), mas o valor numérico exibido deve mostrar o valor real (mesmo que ultrapasse o limite)

## Testes necessários

### Frontend

- Card Comprometimento renderiza as linhas de cartão corretamente quando há cartões de crédito ativos
- Nenhuma linha aparece quando não há cartões de crédito ativos (nem erro visual)
- Os outros 3 cards (Saldo atual, Despesas, Saldo projetado) continuam idênticos após a mudança em `MovementMetricCard`
- `ExpenseDialog.tsx` mostra o valor real de "disponível" ao selecionar um cartão de crédito

### Backend

- `GET /api/cartoes/limites` retorna corretamente o cálculo para cartão tipo `credito`, `ambos` (misto), e `débito` (não deve aparecer na lista)
- Despesa parcelada com parcela em mês futuro conta no `usado`
- Despesa marcada como paga não conta no `usado`
- Despesa com `status = 'cancelada'` não conta no `usado`

### E2E

- Fluxo: cadastrar cartão de crédito → lançar despesa parcelada → conferir que o limite usado reflete a soma de todas as parcelas em aberto → marcar uma parcela como paga → conferir que o limite usado diminui

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- A coluna `status` não está no schema Drizzle — usar SQL cru com cuidado para não esquecer o filtro `status = 'ativa'`, replicando exatamente o padrão já usado em `financial.ts`
- Cartões tipo `ambos` exigem o filtro duplo (tipo do cartão OU forma de pagamento da despesa) — testar esse caso especificamente, é o ponto mais propenso a erro
- `ExpenseDialog.tsx` hoje não depende de nenhuma query de limite — introduzir essa dependência exige cuidado para não duplicar fetch (idealmente reaproveitar a mesma query key/cache usada em Movimentações, com staleTime razoável)

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões de arquitetura já foram fechadas nesta conversa.

## Critérios de aceite do plano

- O card "Comprometimento" em Movimentações mostra, abaixo da barra de renda existente, uma linha por cartão de crédito ativo com nome, valor usado e barra de progresso
- O cálculo de "usado" reflete corretamente parcelas futuras, despesas recorrentes, exclui despesas pagas e canceladas, e trata corretamente cartões tipo "ambos"
- `ExpenseDialog.tsx` mostra o limite disponível real, não mais o bruto
- Os demais cards de Movimentações permanecem inalterados
- `cd backend && npm run build`, `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhuma migration executada sem confirmação explícita

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Confirmar no banco os nomes reais de coluna (`status`, `tipo`) antes de escrever a query final — não assumir apenas pelo schema Drizzle, que está incompleto neste ponto
- Não alterar `MovementMetricCard.tsx` além de adicionar a prop opcional — não deve haver nenhuma mudança visual/comportamental nos outros 3 cards que o usam
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Manter alterações pequenas e focadas exatamente no escopo acima
