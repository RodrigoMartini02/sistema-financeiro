# Plano de Implementação: Atualização automática de dados (remover botão "Atualizar")

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, seguido de investigação read-only (subagente Explore) na tela de Movimentações e hooks de dados
- Data do planejamento: 2026-08-20
- Classificação: `frontend-only`

## Resumo

O botão "Atualizar" existe em `MovimentacoesScreen.tsx` porque as queries `dashboardAnual` (KPIs do topo) e `reservas` não são invalidadas automaticamente pelas mutations de criação/edição/exclusão/pagamento/movimentação de despesas e receitas — só `queryKeys.dashboard(month, year)` é invalidado hoje. O usuário precisa clicar em "Atualizar" para ver esses dados frescos. A correção amplia a invalidação de cache nas mutations existentes e remove o botão, tornando a atualização 100% automática via React Query.

## Escopo

### Dentro do escopo

- Ampliar a invalidação de cache das mutations de despesa/receita em `useFinanceDashboard.ts` para também invalidar `queryKeys.dashboardAnual` (todas as chaves, já que é parametrizada por `year` — usar `predicate` ou key parcial `['dashboard-anual']`) e `queryKeys.reservas`
- Ampliar a invalidação de cache das mutations locais de `DespesasScreen.tsx` (`pagarMut`, `moverMut`, `cancelarMut`) da mesma forma
- Investigar e ampliar, se existirem, mutations equivalentes em `ReceitasScreen.tsx` que hoje só invalidam `queryKeys.dashboard`
- Remover o botão "Atualizar" (`RefreshCw` + `handleRefresh`) de `MovimentacoesScreen.tsx` (duas ocorrências: view calendário e view lista, linhas ~217 e ~251)
- Remover o handler `handleRefresh` e o import de `RefreshCw` se não for mais usado

### Fora do escopo

- Qualquer mudança em `staleTime` das queries (mantido como está, pois a invalidação explícita já resolve o problema)
- Mudanças em outras telas que não envolvem despesas/receitas/reservas
- Mudanças no backend (o problema é 100% de cache no frontend)

## Leitura de contexto

- `/CLAUDE.md` e `/AGENT.md` (raiz do projeto "sistema financas")
- `src/screens/finance/MovimentacoesScreen.tsx` (lido: linhas 130-260 — queries, mutations, botão "Atualizar")
- `src/hooks/useFinanceDashboard.ts` (lido integralmente — hook compartilhado por 7 arquivos)
- `src/screens/despesas/DespesasScreen.tsx` (lido: linhas 200-250 — mutations `pagarMut`/`moverMut`/`cancelarMut`)
- `src/services/queryKeys.ts` (lido integralmente — confirmado que `dashboardAnual` é parametrizada por `year` e `reservas` é key fixa)
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados: não existem como arquivos separados neste projeto; só o `AGENT.md` da raiz, que é genérico (parece voltado a um contexto multi-tenant/prefeitura não totalmente aplicável a este projeto pessoal/pequena empresa)
- `src/screens/receitas/ReceitasScreen.tsx`: identificado como consumidor de `useFinanceDashboard`, mas mutations próprias específicas dessa tela ainda precisam ser lidas em detalhe na implementação

## Impacto por área

### Frontend

- **Hook `useFinanceDashboard.ts`**: função `invalidate` (linha 20) passa a invalidar também `queryKeys.dashboardAnual` (via predicate, pois é parametrizada) e `queryKeys.reservas`
- **`DespesasScreen.tsx`**: `pagarMut.onSuccess` (linha 226-229), `moverMut.onSuccess` (linha 234), `cancelarMut.onSuccess` (linha 239) ganham a mesma invalidação ampliada
- **`ReceitasScreen.tsx`**: mutations equivalentes (a mapear na implementação) ganham a mesma invalidação ampliada
- **`MovimentacoesScreen.tsx`**: remoção do botão "Atualizar" (linhas ~217 e ~251) e do handler `handleRefresh` (linhas 199-203); remoção do import `RefreshCw` se ficar sem uso
- Sem novas query keys, sem mudança de schema de dados, sem mudança de formulários

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/hooks/useFinanceDashboard.ts`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`

## Estratégia de implementação

1. Em `useFinanceDashboard.ts`, expandir `invalidate` para também chamar `qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'dashboard-anual' })` e `qc.invalidateQueries({ queryKey: queryKeys.reservas })`
2. Aplicar a mesma expansão de invalidação em `pagarMut`, `moverMut`, `cancelarMut` de `DespesasScreen.tsx`
3. Ler `ReceitasScreen.tsx` por completo, localizar mutations equivalentes (criar/editar/excluir/confirmar receita) e aplicar a mesma expansão
4. Remover o botão "Atualizar" e `handleRefresh` de `MovimentacoesScreen.tsx`, em ambas as ocorrências (view calendário e view lista)
5. Remover import não utilizado de `RefreshCw`, se aplicável
6. Rodar `npx tsc --noEmit` e `npx vite build`
7. Testar visualmente: criar/editar/excluir/pagar/mover/cancelar uma despesa; criar/editar/excluir uma receita; movimentar uma reserva — confirmar que os KPIs do topo da tela de Movimentações (dashboard anual) e a lista de reservas atualizam automaticamente sem precisar de nenhum botão

## Regras de negócio identificadas

- Qualquer alteração em despesas, receitas ou reservas deve refletir automaticamente nos indicadores visíveis ao usuário, sem exigir ação manual de "atualizar"

## Regras multi-tenant e segurança

Não aplicável — projeto de uso pessoal/pequena empresa (single-tenant por usuário autenticado), mudança isolada de invalidação de cache no frontend, sem alterar queries de backend nem permissões.

## Validações necessárias

Nenhuma validação de formulário nova — mudança de comportamento de cache/invalidação.

## Testes necessários

### Frontend

- Criar uma despesa nova e confirmar que o KPI de despesas do topo (dashboard anual) atualiza sem clicar em nada
- Editar/excluir uma despesa e confirmar o mesmo
- Pagar, mover para próximo mês e cancelar uma despesa (fluxos de `DespesasScreen.tsx`) e confirmar que os KPIs atualizam
- Criar/editar/excluir uma receita e confirmar que os KPIs atualizam
- Movimentar uma reserva e confirmar que a lista de reservas em `MovimentacoesScreen.tsx` atualiza
- Confirmar visualmente que o botão "Atualizar" não existe mais em nenhuma das duas visualizações (calendário e lista)

### Backend

Sem impacto esperado.

### E2E

Não aplicável inicialmente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Risco de esquecer algum ponto de mutation que também deveria invalidar `dashboardAnual`/`reservas` — mapear todos os pontos de mutation de despesa/receita/reserva antes de remover o botão, para não perder a única forma de "forçar" atualização caso algo escape
- Invalidação por `predicate` em vez de key exata precisa ser testada para não invalidar queries de anos que não estão em uso (impacto mínimo, apenas refetch desnecessário)
- Baixo risco geral — mudança aditiva de cache, reversível

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O botão "Atualizar" não existe mais em nenhuma tela
- Após qualquer criação, edição, exclusão, pagamento, movimentação de mês ou cancelamento de despesa/receita/reserva, os dados exibidos (incluindo KPIs do dashboard anual e lista de reservas) atualizam automaticamente
- `npx tsc --noEmit` e `npx vite build` passam sem erros
- Nenhuma outra tela ou fluxo é afetado negativamente

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Mapear `ReceitasScreen.tsx` com cuidado antes de alterar — pode ter mutations não previstas neste plano
- Manter a mudança focada em invalidação de cache; não introduzir refetch manual em nenhum ponto
- Ao finalizar localmente, perguntar ao usuário se deseja seguir para `/finalizar`
