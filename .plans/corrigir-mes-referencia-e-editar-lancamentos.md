# Plano de Implementação: Corrigir mês de referência e status automático em despesas/receitas + adicionar edição

## Origem

- Arquivo de especificação: nenhum `.md` de feature fornecido — plano originado de relato direto do usuário e investigação de código (Agent Explore + leitura manual de rotas/telas).
- Data do planejamento: `2026-08-18`
- Classificação: `fullstack (frontend + backend), sem impacto em banco de dados`

## Resumo

Três problemas relatados pelo usuário no sistema financas:

1. Despesas/receitas cadastradas com data retroativa (de um mês anterior) estão sendo gravadas no mês atualmente aberto na tela, não no mês da data informada.
2. Despesas com data de pagamento/vencimento retroativa deveriam ser marcadas automaticamente como pagas, mas essa regra só existe parcialmente no frontend e não tem garantia no backend.
3. A opção "Editar despesa" (e "Editar receita") não aparece no menu de ações, embora o modo de edição já exista e funcione via `CalendarView`.

## Escopo

### Dentro do escopo

- Backend: derivar `mes`/`ano` a partir da data relevante (`data_vencimento` para despesas, `data_recebimento` para receitas) na criação (POST) e na edição (PUT), ignorando/sobrescrevendo o que o cliente mandar nesses dois campos.
- Backend: ao criar ou editar despesa, se a data relevante (`data_pagamento` ou `data_vencimento`, quando forma de pagamento ≠ crédito) for `<= hoje` (via `getTodayIsoInTimezone()`), forçar `pago = true`, `data_pagamento` preenchida e `valor_pago` calculado, independente do que o client enviar.
- Backend: no PUT de receitas, passar a gravar `mes`/`ano` recalculados (hoje o UPDATE de receitas nem toca nessas colunas).
- Frontend: adicionar item "Editar" no menu kebab (`ExpenseCard.tsx`) e botão de ação equivalente na tabela desktop (`DespesasScreen.tsx`), reaproveitando o `dialog` state e `ExpenseDialog` já existentes em modo edição.
- Frontend: mesmo tratamento espelhado em `IncomeCard.tsx` / `ReceitasScreen.tsx`, reaproveitando `IncomeDialog`.
- Manter a lógica client-side existente em `ExpenseDialog.tsx` (linhas 302-312) como está — o backend passa a ser fonte de verdade adicional, não substitui a UX atual de mostrar o status derivado no formulário.

### Fora do escopo

- Mudanças em `sistema financas` fora desses 3 problemas.
- Qualquer alteração em `escalacao futebol`.
- Mudança de schema/migrations (nenhuma coluna nova é necessária).
- Redesenho visual do menu de ações ou do dialog — só adição do item/botão de editar, sem reestilizar.
- Alterar a lógica de "mover para próximo mês", parcelamento ou recorrência além de garantir que o cálculo de mês corrigido não quebre esses fluxos.
- Receitas não têm conceito de "pendente"/"recebido" — a regra de auto-marcação de status (item 2) se aplica apenas a despesas.

## Leitura de contexto

- `AGENT.md` da raiz do projeto `sistema financas` — lido. Nota: este arquivo descreve contexto multi-tenant/multi-prefeitura com RLS que **não corresponde** ao código real (o projeto usa `perfil_id` como escopo de usuário único, sem prefeituras). As regras genéricas de qualidade/segurança/validação backend foram seguidas; as seções específicas de "prefeitura" foram ignoradas por não se aplicarem.
- `CLAUDE.md` da raiz do projeto — lido, fluxo `/planejar → /implementar → /finalizar` sendo seguido.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto — só o `AGENT.md` da raiz.
- Arquivos de código inspecionados: `src/context/AppContext.tsx`, `src/screens/despesas/DespesasScreen.tsx`, `src/hooks/useFinanceDashboard.ts`, `src/services/financeService.ts`, `backend/src/routes/expenses.ts`, `backend/src/routes/incomes.ts`, `backend/src/utils/date.ts`, `src/screens/finance/ExpenseDialog.tsx`, `src/screens/despesas/ExpenseCard.tsx`, `src/screens/receitas/IncomeCard.tsx`.

## Impacto por área

### Frontend

- `src/screens/despesas/ExpenseCard.tsx`: adicionar `onEdit` à interface `ExpenseCardProps` e um item `editar` no array `actions` do `KebabMenu`, sem `disabled` (edição deve ficar disponível mesmo com item pago/cancelado).
- `src/screens/despesas/DespesasScreen.tsx`: passar `onEdit={() => setDialog({ open: true, item })}` para `ExpenseCard`; adicionar um 4º `ActionBtn` (ícone de editar) na coluna "Ações" da tabela desktop, chamando o mesmo handler. Reaproveita o `dialog` state e `ExpenseDialog` já existentes — nenhuma mudança no dialog em si.
- `src/screens/receitas/IncomeCard.tsx` e `src/screens/receitas/ReceitasScreen.tsx`: mesmo tratamento em espelho, reaproveitando `IncomeDialog`.
- Sem mudanças em query keys, hooks de dados ou schemas de validação do frontend — a correção de `mes`/`ano` e `pago` é feita no backend; o frontend continua enviando os campos como já faz hoje.

### Backend

- `backend/src/routes/expenses.ts`:
  - POST `/`: recalcular `mes`/`ano` a partir de `data_vencimento` antes do INSERT, ignorando o valor vindo do body.
  - POST `/`: se `data_pagamento` (ou `data_vencimento`, quando `forma_pagamento !== 'credito'`) for `<= getTodayIsoInTimezone()`, forçar `pago = true`, `data_pagamento` preenchida (default para `data_vencimento` se não enviada) e `valor_pago = valor_final`.
  - PUT `/:id`: mesmo recálculo de `mes`/`ano` quando `data_vencimento` está presente no body; mesma regra de auto-`pago` quando a data mudar para uma data passada.
- `backend/src/routes/incomes.ts`:
  - POST `/`: recalcular `mes`/`ano` a partir de `data_recebimento`.
  - PUT `/:id`: passar a recalcular e gravar `mes`/`ano` (atualmente o UPDATE de receitas não toca nessas colunas).
- `backend/src/utils/date.ts`: possível novo helper (ex. `getMonthYearFromIsoDate`) para extrair mês (0-11) e ano de uma string `YYYY-MM-DD` sem depender de fuso do processo — reaproveitado pelos dois routes, seguindo o padrão de utilitário único já existente no arquivo.
- Atenção especial: `createFutureInstallments`/`createRecurringOccurrences` (parcelas futuras e recorrências) já calculam seu próprio `mes`/`ano` a partir de datas futuras geradas internamente — confirmar que não dependem do `mes`/`ano` do registro inicial de forma que quebre com a correção, e que parcelas futuras com cartão de crédito não sejam marcadas como pagas indevidamente pela nova regra de auto-`pago`.

### Banco de dados

`Sem impacto esperado` — nenhuma coluna nova, nenhuma migration necessária. As colunas `mes`, `ano`, `pago`, `data_pagamento`, `valor_pago` já existem em `despesas`; `mes`, `ano` já existem em `receitas`.

Atenção: este plano não autoriza executar migrations automaticamente.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/expenses.ts` (POST `/`, PUT `/:id`)
- `backend/src/routes/incomes.ts` (POST `/`, PUT `/:id`)
- `backend/src/utils/date.ts` (novo helper de mês/ano a partir de data ISO)
- `src/screens/despesas/ExpenseCard.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/IncomeCard.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. Criar helper em `backend/src/utils/date.ts` para extrair `{ mes, ano }` de uma string ISO `YYYY-MM-DD`, com `mes` no formato 0-11 (consistente com a validação `body('mes').isInt({min:0,max:11})` já existente).
2. Aplicar o helper no POST e PUT de `expenses.ts`, sobrescrevendo `mes`/`ano` recebidos do body a partir de `data_vencimento`.
3. Implementar a regra de auto-`pago` no POST e PUT de `expenses.ts`, comparando a data relevante com `getTodayIsoInTimezone()`, respeitando a exceção de cartão de crédito.
4. Aplicar o helper no POST e PUT de `incomes.ts`, sobrescrevendo/adicionando `mes`/`ano` a partir de `data_recebimento`.
5. Verificar `createFutureInstallments`/`createRecurringOccurrences` para confirmar que continuam corretos após a mudança (não devem herdar a regra de auto-`pago` para parcelas futuras).
6. Adicionar botão/item "Editar" em `ExpenseCard.tsx` e `DespesasScreen.tsx` (mobile + desktop), reaproveitando `dialog`/`ExpenseDialog` existentes.
7. Espelhar a mesma adição em `IncomeCard.tsx` e `ReceitasScreen.tsx`.
8. Rodar lint/typecheck/build no frontend e backend.
9. Teste manual: cadastrar despesa retroativa via UI, conferir mês correto no dashboard e status pago automático; testar edição de despesa e receita via novo botão.

## Regras de negócio identificadas

- O mês/ano de um lançamento (despesa ou receita) deve sempre corresponder ao mês/ano civil da sua data de referência (`data_vencimento` para despesas, `data_recebimento` para receitas) — nunca ao mês que estava sendo visualizado na tela no momento do cadastro/edição.
- Uma despesa com data de pagamento (ou vencimento, se forma de pagamento ≠ crédito) igual ou anterior à data atual deve ser automaticamente marcada como paga.
- Receitas não têm conceito de "pendente" — sempre são tratadas como registradas/efetivadas; a regra de auto-status não se aplica a elas.

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant (ver nota em "Leitura de contexto"). Escopo de dados é por `usuario_id`/`perfil_id`, já filtrado em todas as queries existentes (`WHERE ... usuario_id = $N`), padrão que será mantido sem alteração nas queries tocadas por este plano.

## Validações necessárias

- Backend deve continuar validando `data_vencimento`/`data_recebimento` como ISO8601 (já existe via `express-validator`).
- Decidir durante implementação se a validação `body('mes')`/`body('ano')` deve ser removida (já que o valor passa a ser recalculado no servidor e sobrescrito antes do INSERT/UPDATE) ou mantida como validação de formato inofensiva.
- Confirmar que `createFutureInstallments`/`createRecurringOccurrences` continuam calculando `mes`/`ano` corretamente a partir das datas futuras que já geram — não devem ser afetados por esta mudança além da criação inicial.

## Testes necessários

### Frontend

- Verificar que "Editar" aparece no kebab menu (mobile) e na tabela desktop para despesas e receitas.
- Clicar em "Editar" abre o dialog com os dados preenchidos e título "Editar despesa"/"Editar receita".

### Backend

- Criar despesa com `data_vencimento` de mês anterior ao mês corrente → `mes`/`ano` gravados devem corresponder ao mês da data, não ao mês atual.
- Criar despesa com `data_vencimento`/`data_pagamento` retroativa e forma de pagamento ≠ crédito → `pago` deve vir `true` do backend mesmo que o client não envie `pago: true`.
- Criar despesa com `data_vencimento` futura → `pago` deve permanecer `false`.
- Criar despesa parcelada no cartão de crédito com primeira parcela retroativa → confirmar que parcelas futuras não são marcadas como pagas indevidamente.
- Criar receita com `data_recebimento` de mês anterior → `mes`/`ano` corretos.
- Editar despesa/receita mudando a data para outro mês → `mes`/`ano` recalculados no PUT.

### E2E

- Fluxo manual: cadastrar despesa retroativa via UI → conferir que aparece no mês correto do dashboard e já como paga.
- Fluxo manual: editar uma despesa/receita existente via novo botão e salvar alterações.

## Comandos de validação sugeridos

Confirmar scripts reais em `package.json` durante a implementação; prováveis:

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- Mudar o cálculo de `mes`/`ano` no backend pode afetar `createFutureInstallments`/`createRecurringOccurrences` — checar se essas funções leem o `mes`/`ano` já recalculado do registro criado (`created`) ou recebem os valores originais do body.
- Auto-marcar `pago = true` no backend pode conflitar com parcelamento/cartão de crédito — parcelas futuras não devem ser marcadas como pagas mesmo que a data da primeira parcela seja passada. Validar interação com `forma_pagamento === 'credito'`.
- Ambiente pode estar apontando para produção — nenhuma migration é necessária, mas testes manuais end-to-end devem evitar poluir dados reais sem limpeza posterior.
- Editar despesa/receita já paga/cancelada: proposta é permitir edição sempre habilitada, sem restrição adicional (ex.: corrigir descrição de despesa já paga é caso de uso legítimo).

## Perguntas em aberto

1. Confirmar durante implementação se a validação `body('mes')`/`body('ano')` deve ser removida ou mantida como validação de formato, já que o valor será recalculado no servidor.
2. Confirmar os scripts reais de lint/typecheck/build no `package.json` do projeto e do backend.

## Critérios de aceite do plano

- Despesa e receita cadastradas com data retroativa aparecem no mês correspondente à data, não no mês da tela aberta no momento do cadastro.
- Despesa cadastrada ou editada com data de pagamento/vencimento retroativa (e forma de pagamento ≠ crédito) vem automaticamente marcada como paga.
- Botão/menu "Editar" visível e funcional em despesas e receitas, tanto na visão mobile (kebab) quanto desktop (tabela).
- Nenhuma migration executada; nenhuma mudança de schema.
- Lint/typecheck/build passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária.
- Seguir os padrões já existentes no projeto (ex.: reaproveitar `getTodayIsoInTimezone()` de `backend/src/utils/date.ts`).
- Manter alterações pequenas e focadas nos arquivos listados.
- Confirmar scripts reais de lint/typecheck/build no `package.json` antes de rodar.
- Ignorar as seções de "prefeitura"/multi-tenant do `AGENT.md` — não se aplicam a este projeto.
