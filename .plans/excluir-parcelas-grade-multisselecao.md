# Plano de Implementação: Exclusão de despesa parcelada com grade e multi-seleção

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-20
- Classificação: `fullstack`

## Resumo

O dialog atual de exclusão de despesa parcelada (`DeleteInstallmentDialog.tsx`) é genérico: mostra só um texto e 2 botões ("excluir só esta" / "excluir tudo"), sem exibir as parcelas do grupo, seus status, vencimentos ou valores. Este plano substitui esse dialog por uma grade que lista todas as parcelas do grupo (`grupo_parcelamento_id`) com status individual, permitindo ao usuário selecionar via checkbox uma parcela específica, várias, ou todas, e excluí-las numa única ação — mantendo a exclusão como hard delete real (remove o registro do banco), sem alterar a regra de negócio quanto a parcelas já pagas (podem ser excluídas livremente, sem distinção especial, conforme decisão do usuário).

## Escopo

### Dentro do escopo

- Backend: nova rota de listagem das parcelas de um grupo (`grupo_parcelamento_id`), validando que pertencem ao usuário autenticado (reaproveitando o mesmo padrão de resolução de propriedade já usado em `resolveOwnerForWrite`).
- Backend: evolução de `DELETE /api/expenses/:id` para aceitar exclusão em lote (lista de ids), validando que todos os ids pertencem ao mesmo usuário e ao mesmo `grupo_parcelamento_id` antes de excluir.
- Frontend: novo componente de dialog substituindo `DeleteInstallmentDialog.tsx` — grade com uma linha por parcela (número da parcela, vencimento, valor, status: paga/pendente/vencida), checkbox por linha, atalho "selecionar todas", contador de selecionadas, e ação "Excluir selecionadas".
- Frontend: `Expense` e `expenseFromApi` (`financeService.ts`) ganham o campo `grupoParcelamentoId` (já retornado pelo backend via `SELECT d.*`, só falta mapear).
- Frontend: `deleteExpense` (serviço) e a mutation de `useFinanceDashboard.ts` passam a aceitar uma lista de ids para exclusão em lote.
- Frontend: nova função de serviço para buscar as parcelas de um grupo.
- Atualizar o wiring em `DespesasScreen.tsx` (estado do dialog, handlers) para o novo componente e fluxo.

### Fora do escopo

- Qualquer mudança na regra de negócio quanto a excluir parcela já paga — permanece permitido sem distinção especial, conforme decisão já tomada.
- Opção "excluir a partir desta parcela em diante" (todas as futuras, preservando as passadas) — não solicitada; pode ser avaliada em plano futuro caso o usuário queira.
- Cancelamento de despesas (soft-status) — tratado em plano separado, incluindo as duas lacunas já identificadas em `reserves.ts` e `reports.ts` (despesas canceladas não filtradas corretamente) e o gap de UX de cancelar uma parcela de um grupo sem avisar o usuário.
- Qualquer alteração de schema — `grupo_parcelamento_id` já existe na tabela `despesas`.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo); `backend/AGENT.md`/`frontend/AGENT.md` não existem como arquivos dedicados neste projeto
- Investigação por agente Explore nesta conversa, cobrindo exclusão e cancelamento de despesas parceladas (relatório completo com arquivo:linha)
- Leitura direta nesta sessão: `backend/src/routes/expenses.ts` (rota `DELETE /:id`, linhas 575-608), `src/screens/despesas/DeleteInstallmentDialog.tsx` (arquivo completo, 67 linhas), `src/screens/despesas/DespesasScreen.tsx` (wiring do dialog, padrão de multi-seleção existente via `Set<number>`), `src/types/finance.ts` (interface `Expense`)

## Impacto por área

### Frontend

- **Novo componente** (substitui `DeleteInstallmentDialog.tsx`): ao abrir, dispara uma query (`useQuery`) para buscar as parcelas do grupo via a nova rota backend. Renderiza uma grade/lista com: número da parcela (`parcela_atual/numero_parcelas`), data de vencimento, valor (`valorFinal`), status (badge reaproveitando `StatusBadge`/`STATUS_LABEL` já usado em `DespesasScreen.tsx`). Cada linha tem um checkbox; um checkbox no cabeçalho seleciona/desmarca todas. Estado de seleção: `Set<number>`, mesmo padrão já usado em `DespesasScreen.tsx` (`selecionadas`, `toggleSelectAll`, `toggleItem`).
- Botão de ação: "Excluir selecionadas (N)" — desabilitado quando `N === 0`; confirmação adicional (reaproveitando `useConfirm()`, já usado no projeto) antes de disparar a exclusão em lote, para reduzir risco de exclusão acidental em massa.
- Estados de loading (buscando parcelas), error (falha ao buscar/excluir) e empty (grupo sem parcelas — caso defensivo, não deveria ocorrer na prática) tratados no novo componente.
- `DespesasScreen.tsx`: `handleExcluirDespesa` continua decidindo entre confirmação simples (despesa não parcelada) e o novo dialog (despesa parcelada, `item.parcela` truthy) — sem mudança nessa decisão, só no que o dialog faz depois de aberto.
- `types/finance.ts`: `Expense.grupoParcelamentoId?: number | null` adicionado.
- `financeService.ts`: `expenseFromApi` mapeia `grupo_parcelamento_id` → `grupoParcelamentoId`; `deleteExpense` aceita `{ ids: number[] }` além do formato atual de id único (ou é substituída por uma função que sempre trabalha com lista, mantendo compatibilidade com os chamadores existentes que passam um único id).
- Nova função de serviço, ex. `fetchExpenseGroup(grupoId: number): Promise<Expense[]>`.
- Query key nova para a busca de parcelas do grupo, centralizada em `queryKeys.ts`.

### Backend

- Nova rota, ex. `GET /api/expenses/group/:grupoId` — retorna todas as linhas com `id = :grupoId OR grupo_parcelamento_id = :grupoId` (mesmo critério já usado na exclusão de grupo), filtradas por `usuario_id` (com o mesmo tratamento de carteira compartilhada já usado em outras rotas de despesas, via `resolveOwnerForWrite`/`resolveVisibleUserIds` conforme o padrão do arquivo).
- `DELETE /api/expenses/:id` evolui para aceitar uma lista de ids — abordagem a definir na implementação entre (a) estender a rota existente para aceitar `ids` via query string ou body, ou (b) nova rota dedicada `DELETE /api/expenses/batch`. Preferir manter compatibilidade com os chamadores atuais (exclusão de um único id, exclusão de grupo inteiro via `delete_group=true`) sem quebrá-los.
- Validação obrigatória: todos os ids da lista devem pertencer ao mesmo `usuario_id` autenticado (ou dono resolvido via carteira compartilhada) E ao mesmo `grupo_parcelamento_id` — nunca confiar apenas no frontend para essa checagem, para não permitir exclusão cruzada de grupos diferentes numa única chamada.

### Banco de dados

`Sem impacto esperado` — `grupo_parcelamento_id` já existe na tabela `despesas`; nenhuma migration necessária.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/expenses.ts`
- `src/screens/despesas/DeleteInstallmentDialog.tsx` (reescrito/substituído)
- `src/screens/despesas/DespesasScreen.tsx`
- `src/services/financeService.ts`
- `src/hooks/useFinanceDashboard.ts`
- `src/types/finance.ts`
- `src/services/queryKeys.ts`

## Estratégia de implementação

1. Backend: criar a rota de listagem das parcelas de um grupo, reaproveitando a validação de propriedade já usada na rota de exclusão de grupo.
2. Backend: evoluir `DELETE /api/expenses/:id` (ou criar rota dedicada) para aceitar exclusão em lote, com a validação de mesmo grupo/usuário.
3. Frontend: adicionar `grupoParcelamentoId` ao tipo `Expense` e ao mapeamento em `financeService.ts`.
4. Frontend: criar a função de serviço para buscar parcelas do grupo e a query key correspondente.
5. Frontend: atualizar `deleteExpense`/mutation de `useFinanceDashboard.ts` para exclusão em lote.
6. Frontend: reescrever `DeleteInstallmentDialog.tsx` como a nova grade com multi-seleção, reaproveitando o padrão `Set<number>` de `DespesasScreen.tsx`.
7. Atualizar o wiring em `DespesasScreen.tsx`.
8. Rodar builds (`tsc --noEmit` backend e frontend, `vite build`).
9. Testar manualmente: abrir a grade para um grupo parcelado, conferir status/valores/vencimentos de cada parcela, selecionar uma única parcela e excluir, selecionar várias específicas (não sequenciais) e excluir, selecionar todas e excluir — confirmando que o comportamento de "excluir tudo" continua equivalente ao `delete_group=true` atual.

## Regras de negócio identificadas

- Excluir uma parcela específica remove definitivamente aquele registro do banco (hard delete), sem afetar as demais parcelas do grupo.
- Excluir múltiplas parcelas selecionadas remove todas de uma vez, na mesma operação.
- Parcelas já pagas podem ser selecionadas e excluídas livremente, sem bloqueio ou distinção especial — mesma regra de hoje, apenas com visibilidade melhor antes da ação.
- Excluir todas as parcelas do grupo (via seleção total) produz o mesmo resultado final que a opção "excluir parcelamento inteiro" já existente.

## Regras multi-tenant e segurança

- A nova rota de listagem por grupo e a exclusão em lote devem reaproveitar a mesma resolução de propriedade/carteira compartilhada já usada em `resolveOwnerForWrite` — um membro só pode excluir parcelas que já teria permissão de excluir individualmente hoje.
- Validação server-side obrigatória de que todos os ids da exclusão em lote pertencem ao mesmo `grupo_parcelamento_id` e ao mesmo dono resolvido — o frontend nunca deve ser a única barreira contra excluir parcelas de grupos ou usuários diferentes numa única chamada.

## Validações necessárias

- Lista de ids na exclusão em lote: validar que não está vazia, que todos são números válidos, e que pertencem ao mesmo grupo/usuário antes de executar o `DELETE`.
- `grupoId` da rota de listagem: validar que é um número válido e que existe pelo menos uma despesa com esse `id`/`grupo_parcelamento_id` pertencente ao usuário.

## Testes necessários

### Frontend

- Abrir a grade de um grupo com parcelas em status variados (paga, pendente, vencida) e confirmar que cada uma exibe o status correto.
- Selecionar uma parcela isolada, várias não sequenciais, e todas — confirmar que o botão de ação e o contador refletem a seleção corretamente.
- Confirmar que excluir com sucesso invalida a query de despesas do mês e fecha o dialog.

### Backend

- `GET /api/expenses/group/:grupoId` retorna só as parcelas daquele grupo e usuário — nunca de outro usuário ou grupo.
- Exclusão em lote com ids de dois grupos diferentes é rejeitada.
- Exclusão em lote com um id que não pertence ao usuário autenticado é rejeitada (nenhuma linha de nenhum usuário é afetada).
- Exclusão em lote bem-sucedida remove exatamente as linhas solicitadas, preservando as demais parcelas do grupo não selecionadas.

### E2E

- Fluxo completo: usuário abre uma despesa parcelada em 12x, clica em excluir, vê a grade com as 12 parcelas, seleciona 3 específicas (incluindo uma já paga), confirma, e as outras 9 permanecem intactas na listagem.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- A nova UI facilita selecionar e excluir várias parcelas de uma vez — risco de erro humano maior que hoje (só 2 botões). Mitigado com confirmação explícita mostrando quantas parcelas serão excluídas antes de agir.
- Exclusão continua sendo irreversível (hard delete) — nenhuma mudança nesse comportamento, apenas na visibilidade antes de agir.
- Mudança de contrato da rota `DELETE /api/expenses/:id` (ou nova rota) precisa manter compatibilidade com os chamadores existentes que hoje passam um único id ou `delete_group=true`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O dialog de exclusão de despesa parcelada mostra uma grade com todas as parcelas do grupo, com status, vencimento e valor.
- O usuário pode selecionar e excluir 1, várias ou todas as parcelas numa única ação.
- O backend valida propriedade e mesmo grupo antes de qualquer exclusão em lote.
- Nenhuma migration foi necessária.
- Builds (`tsc` backend, `tsc` frontend, `vite build`) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não implementar o plano de cancelamento (situação separada) — este plano cobre apenas exclusão.
- Manter compatibilidade com os fluxos de exclusão já existentes (excluir uma parcela, excluir grupo inteiro) durante a transição — a nova grade deve produzir os mesmos efeitos finais que esses fluxos, apenas com melhor granularidade de seleção.
- Reaproveitar o padrão de multi-seleção (`Set<number>`, checkbox por linha, "selecionar todas") já existente em `DespesasScreen.tsx`, em vez de criar um mecanismo novo.
- Não executar migrations (não são necessárias neste plano).
