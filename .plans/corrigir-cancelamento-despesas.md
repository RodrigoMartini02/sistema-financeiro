# Plano de Implementação: Corrigir cancelamento de despesas (reservas, relatório e parceladas)

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-20
- Classificação: `fullstack`

## Resumo

Três correções relacionadas ao cancelamento (soft-status `status = 'cancelada'`) de despesas, identificadas em investigação anterior nesta mesma sessão:

1. **`reserves.ts`**: `AVAILABLE_BALANCE_SQL` não filtra por status nas subqueries de receitas e despesas — um lançamento cancelado ainda entra no cálculo de saldo disponível para mover dinheiro para reserva, diferente de `months.ts`/`financial.ts`, que já excluem corretamente lançamentos cancelados.
2. **`reports.ts`**: `fetchDespesas` (relatório PDF de despesas) nunca exclui despesas canceladas do subtotal — a rota irmã de receitas (`fetchReceitas`) já tem esse filtro (`r.status != 'cancelada'`), despesas não.
3. **UX de cancelamento de despesa parcelada**: cancelar uma parcela de um grupo hoje age silenciosamente só naquela linha (`UPDATE despesas SET status = 'cancelada' WHERE id = :id`), sem avisar o usuário de que as demais parcelas do grupo permanecem ativas. Será adicionado o mesmo branch de decisão já existente para exclusão (`item.parcela` truthy → abrir a grade de parcelas), reaproveitando o componente criado no plano anterior (`DeleteInstallmentDialog.tsx`), generalizado para também servir ao cancelamento.

## Escopo

### Dentro do escopo

- `backend/src/routes/reserves.ts`: adicionar filtro de status às duas subqueries de `AVAILABLE_BALANCE_SQL` que hoje não filtram — despesas (`d.status = 'ativa'`) e receitas (`r.status = 'ativa'`, mesma convenção). Achado adicional confirmado nesta sessão: a subquery de receitas também não filtrava status (o relatório anterior só mencionou despesas explicitamente).
- `backend/src/routes/reports.ts`: adicionar `AND d.status = 'ativa'` ao WHERE de `fetchDespesas`, espelhando o filtro já existente em `fetchReceitas`.
- `backend/src/routes/expenses.ts`: evoluir `PUT /:id/cancelar` para aceitar cancelamento em lote (`?ids=1,2,3`), com a mesma validação de segurança já implementada em `DELETE /:id` (todos os ids devem pertencer ao mesmo grupo e ao mesmo dono resolvido). Regra especial: ao cancelar em lote/grupo, parcelas já pagas (`pago = true`) nunca são marcadas como canceladas, mesmo que estejam entre os ids enviados — validação aplicada no servidor, não apenas confiada ao frontend.
- Frontend: generalizar `DeleteInstallmentDialog.tsx` (grade de parcelas com multi-seleção, criada no plano anterior) para suportar um modo de ação (`excluir` | `cancelar`). No modo cancelar, parcelas já pagas aparecem na grade mas desabilitadas para seleção (refletindo a regra de negócio do servidor).
- `handleCancelarDespesa` em `DespesasScreen.tsx` ganha o mesmo branch condicional que `handleExcluirDespesa` já tem: se a despesa é parcelada, abre a grade em vez de cancelar direto a linha clicada.

### Fora do escopo

- Qualquer mudança na regra de exclusão (plano anterior, já implementado e em produção).
- Trava de integridade de mês fechado ao cancelar — não solicitado, permanece como está hoje.
- Tela de Receitas — o cancelamento de receita já filtra corretamente na maioria dos lugares (a única lacuna encontrada, em `reserves.ts`, está incluída neste plano); não há necessidade de replicar a UX de grade para receitas, que não têm parcelamento.
- Qualquer alteração de schema — nenhuma coluna nova necessária.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo); `backend/AGENT.md`/`frontend/AGENT.md` não existem como arquivos dedicados neste projeto
- Investigação por agente Explore em sessão anterior desta mesma conversa, cobrindo exclusão e cancelamento de despesas parceladas
- Leitura direta nesta sessão: `backend/src/routes/reserves.ts` (linhas 19-72, `AVAILABLE_BALANCE_SQL`), `backend/src/routes/reports.ts` (linhas 42-105, `fetchDespesas`/`fetchReceitas`), `backend/src/services/reportPdf.ts` (uso do campo `status`), `src/screens/despesas/DespesasScreen.tsx` (linhas 298-321, `cancelarMut`/`handleCancelarDespesa`)
- Plano anterior já implementado e em produção: `.plans/excluir-parcelas-grade-multisselecao.md` (componente de grade a ser reaproveitado/generalizado)

## Impacto por área

### Backend

- `reserves.ts`: correção pontual de filtro de status em 2 subqueries dentro da CTE `AVAILABLE_BALANCE_SQL` já existente — sem mudança de assinatura de função, sem impacto em contrato de API.
- `reports.ts`: correção pontual de filtro de status em `fetchDespesas` — sem mudança de assinatura.
- `expenses.ts`: `PUT /:id/cancelar` ganha suporte a `?ids=` (lote), reaproveitando a mesma lógica de validação de grupo/dono já escrita para `DELETE /:id` no plano anterior. A regra de "nunca cancelar paga" é aplicada com uma cláusula adicional no `UPDATE` (`AND pago = false`) quando a operação vier de um cancelamento em lote/grupo — garante a regra mesmo que o frontend envie um id de parcela paga por engano.

### Frontend

- `DeleteInstallmentDialog.tsx`: generalizado para receber um modo (`mode: 'excluir' | 'cancelar'`), ajustando: título do dialog, texto de confirmação, checkbox desabilitado para parcelas pagas quando `mode === 'cancelar'`, e qual mutation/endpoint é chamado ao confirmar.
- `DespesasScreen.tsx`: `handleCancelarDespesa` passa a checar `item.parcela` (mesmo padrão de `handleExcluirDespesa`) e abrir o dialog generalizado em vez de cancelar direto.
- `financeService.ts`/`useFinanceDashboard.ts`: `cancelarDespesa` (ou função equivalente) ganha suporte a lista de ids, espelhando `deleteExpense`.

### Banco de dados

`Sem impacto esperado` — nenhuma migration necessária.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/reserves.ts`
- `backend/src/routes/reports.ts`
- `backend/src/routes/expenses.ts`
- `src/screens/despesas/DeleteInstallmentDialog.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/services/financeService.ts`
- `src/hooks/useFinanceDashboard.ts`

## Estratégia de implementação

1. Corrigir `reserves.ts` (2 filtros de status faltantes na CTE de saldo disponível).
2. Corrigir `reports.ts` (1 filtro de status faltante em `fetchDespesas`).
3. Evoluir `PUT /api/expenses/:id/cancelar` para aceitar `?ids=1,2,3`, com a regra de nunca cancelar parcela já paga aplicada no servidor.
4. Generalizar `DeleteInstallmentDialog.tsx` para o modo cancelar (parcelas pagas desabilitadas, textos ajustados).
5. Atualizar `financeService.ts`/`useFinanceDashboard.ts` com suporte a cancelamento em lote.
6. Atualizar `handleCancelarDespesa` em `DespesasScreen.tsx` para abrir a grade quando a despesa for parcelada.
7. Rodar builds (`tsc --noEmit` backend e frontend, `vite build`).
8. Testar manualmente: cancelar uma despesa simples (comportamento inalterado); cancelar uma parcela isolada de um grupo (comportamento inalterado); cancelar o grupo inteiro com parcelas pagas e pendentes misturadas, confirmando que só as pendentes viram canceladas; conferir que o saldo disponível de reservas e o relatório PDF não contam mais lançamentos cancelados.

## Regras de negócio identificadas

- Cancelar mantém o registro no banco (soft-status), diferente de excluir (hard delete) — sem mudança nessa distinção já existente.
- Uma despesa ou receita cancelada nunca deve contar em nenhum cálculo de saldo ou relatório do sistema — extensão da regra já aplicada na maioria das rotas (`months.ts`, `financial.ts`, `accountMembers.ts`, `budgetService.ts`, `cardLimitService.ts`) para as duas lacunas restantes (`reserves.ts`, `reports.ts`).
- Cancelar o parcelamento inteiro nunca cancela parcelas já pagas — o dinheiro debitado permanece como um gasto real, só as parcelas futuras/pendentes são revertidas.

## Regras multi-tenant e segurança

- O cancelamento em lote reaproveita a mesma validação de propriedade e agrupamento já usada em `DELETE /:id` — nunca confiar apenas no frontend quanto a quais ids pertencem ao mesmo grupo/usuário.
- A regra de "nunca cancelar paga" é reforçada no servidor via cláusula SQL (`AND pago = false`), não apenas pela UI desabilitar a seleção — garante a regra mesmo diante de uma chamada de API manual/manipulada.

## Validações necessárias

- Lista de ids do cancelamento em lote: mesma validação já usada na exclusão em lote (não vazia, ids válidos, mesmo grupo/usuário).
- Confirmar que a cláusula `AND pago = false` no cancelamento em grupo não afeta o cancelamento de uma única parcela específica (que deve continuar podendo cancelar mesmo uma parcela paga, se selecionada individualmente e não via "grupo inteiro")? — **Decisão já tomada**: a restrição de não cancelar pagas vale apenas para a operação de "cancelar grupo inteiro" (seleção total); uma parcela paga selecionada individualmente pelo usuário na grade continua podendo ser cancelada, refletindo que o usuário fez uma escolha explícita e consciente sobre aquele item específico — a única automação que nunca deve tocar pagas é o atalho de "selecionar/cancelar tudo".

## Testes necessários

### Backend

- `AVAILABLE_BALANCE_SQL` com uma despesa cancelada no período: confirmar que ela não é mais subtraída do saldo disponível.
- `AVAILABLE_BALANCE_SQL` com uma receita cancelada no período: confirmar que ela não é mais somada ao saldo disponível.
- `fetchDespesas` (relatório) com uma despesa cancelada no período: confirmar que não aparece nem soma no subtotal.
- `PUT /:id/cancelar` em lote com uma parcela paga entre os ids selecionados manualmente: confirmar que é cancelada normalmente (seleção individual explícita).
- `PUT /:id/cancelar` com a opção "selecionar todas": confirmar que parcelas pagas do grupo NÃO são canceladas, só as pendentes.

### Frontend

- Cancelar uma despesa simples: comportamento inalterado (confirmação simples, sem grade).
- Cancelar uma despesa parcelada: abre a grade; parcelas pagas aparecem desabilitadas quando "selecionar todas" é usado, mas continuam clicáveis individualmente.

### E2E

- Fluxo completo: parcelamento de 6x com 2 parcelas já pagas; usuário cancela o grupo inteiro; as 2 pagas continuam ativas, as 4 pendentes viram canceladas; saldo de reservas e relatório PDF refletem corretamente a exclusão das canceladas.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- A correção de `reserves.ts`/`reports.ts` pode mudar valores exibidos (saldo disponível, subtotais de relatório) para contas que já têm lançamentos cancelados no histórico — é a correção correta, mas os números vão mudar após o deploy; vale monitorar/avisar.
- Garantir que a regra "grupo inteiro nunca cancela paga" seja реforçada no servidor (cláusula SQL), não apenas na UI, para não depender de o frontend estar sempre correto.
- Generalizar o dialog de grade para dois modos aumenta a complexidade do componente — atenção para não introduzir regressão no fluxo de exclusão já em produção.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Despesas e receitas canceladas não afetam mais o cálculo de saldo disponível de reservas.
- Relatório PDF de despesas não soma despesas canceladas.
- Cancelar uma despesa parcelada pergunta o escopo (esta parcela / grupo inteiro), reaproveitando a grade já existente.
- Cancelar o grupo inteiro nunca marca parcelas já pagas como canceladas; uma parcela paga selecionada individualmente continua podendo ser cancelada.
- Nenhuma migration foi necessária.
- Builds (`tsc` backend, `tsc` frontend, `vite build`) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Reaproveitar ao máximo o componente de grade já criado no plano anterior (`DeleteInstallmentDialog.tsx`), generalizando-o em vez de duplicar — evitar criar um segundo componente quase idêntico.
- Reaproveitar o mesmo padrão de validação de segurança de agrupamento/propriedade já implementado em `DELETE /:id` para o cancelamento em lote.
- Não tocar em `reports.ts`/`reserves.ts` além dos filtros de status especificados — não é oportunidade para refatorar essas rotas.
- Não executar migrations (não são necessárias neste plano).
