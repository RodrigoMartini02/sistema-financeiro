# Plano de Implementação: Adicionar tipo (crédito/débito) aos cartões e corrigir exibição de cartão em despesas

## Origem

- Arquivo de especificação: `.portal/tasks/Reformular cartão para conta com tipo crédito-débito.md`
- Data do planejamento: `2026-09-01`
- Classificação: `frontend + backend + database`

## Resumo

O filtro e a coluna "Pagamento" na tela de Despesas mostram apenas a forma de pagamento genérica (Crédito/Débito/Dinheiro/PIX), nunca o cartão específico usado — mesmo quando a despesa já tem um cartão vinculado no banco. Investigação identificou duas causas: (1) o frontend descarta o campo `cartao_id` ao converter a resposta da API (`expenseFromApi`), então a UI inteira nunca teve acesso a essa informação; (2) a tabela `cartoes` não tem campo de tipo (crédito/débito), então nada garante que um cartão seja usado de forma consistente — o mesmo cartão poderia, em tese, ser lançado ora como crédito ora como débito.

Este plano corrige ambos os problemas seguindo o padrão de migration já estabelecido no projeto para casos equivalentes (`categorias.tipo`, migrations `0017`/`0018b`): uma migration de schema adicionando o campo, seguida de uma migration de backfill de dados, ambas com execução manual confirmada pelo usuário — nunca automática.

A abordagem de "conta" separada (entidade nova) foi avaliada e descartada em favor de estender a tabela `cartoes` existente, por ser menos invasiva, seguir o precedente do projeto, e resolver o problema relatado sem expandir desnecessariamente o escopo.

## Escopo

### Dentro do escopo

- Migration de schema: `ALTER TABLE cartoes ADD COLUMN tipo VARCHAR(10)`.
- Migration de backfill: cartões com despesas de crédito já vinculadas (`forma_pagamento IN ('credito', 'cartao_credito')`) recebem `tipo = 'credito'`; demais cartões ficam com `tipo = NULL`, pendente de classificação manual.
- Backend: `backend/src/db/schema/cards.ts` (novo campo `type`), `backend/src/routes/cards.ts` (aceitar/validar/retornar `tipo` no CRUD), `backend/src/routes/expenses.ts` (JOIN com `cartoes` na listagem para retornar nome do cartão; validação de compatibilidade tipo↔forma de pagamento ao salvar, apenas quando `cartao_id` for enviado).
- Frontend — cadastro: `src/screens/config/CartaoTab.tsx` ganha seleção de tipo (crédito/débito/ambos) no formulário e exibição no card visual.
- Frontend — lançamento: `src/screens/finance/ExpenseDialog.tsx` filtra a lista de cartões oferecidos pela forma de pagamento escolhida (cartões com `tipo` compatível ou sem tipo definido).
- Frontend — correção da perda de dado: `src/services/financeService.ts` (`expenseFromApi`) e `src/types/finance.ts` (`Expense`) passam a expor `cartaoId`/nome do cartão.
- Frontend — listagem/filtro: `src/screens/despesas/DespesasScreen.tsx` — coluna "Pagamento" exibe o nome do cartão quando houver vínculo; filtro ganha opção de filtrar por cartão específico, mantendo a opção por forma de pagamento genérica.
- Verificação (sem alteração funcional esperada) de que o Assistente Financeiro (`src/components/financial-assistant/FinancialAssistant.tsx`, consumido também pelo PWA `assistant.html`) continua criando despesas normalmente sem exigir `cartao_id` — o assistente usa `saveExpense` diretamente, sem passar por `ExpenseDialog.tsx`, e não tem noção de cartão. Nenhuma mudança é necessária nesse fluxo; apenas confirmar que a nova validação de compatibilidade cartão↔forma no backend não bloqueia despesas enviadas sem `cartao_id`.
- Avaliação de `src/services/demo/demoFakeDatabase.ts` e `src/services/demo/fakeApiResolver.ts` (modo demo) para manter consistência visual, já que o modo demo já simula `cartao_id`.

### Fora do escopo

- Renomear "Cartão" para "Conta" na interface — decisão confirmada de manter o rótulo atual nesta entrega.
- Criar uma entidade "conta" separada — decisão confirmada de estender `cartoes` em vez disso.
- Novas visualizações ou gráficos de gastos por cartão no Painel ou Relatórios, incluindo a agregação `porFormaPagamento` do Painel Panorama (`backend/src/routes/financial.ts`, rota `/panorama`), que continua agregando apenas por forma de pagamento genérica.
- Normalizar dados existentes em produção além do que a migration de backfill cobre — em especial, o valor legado `forma_pagamento = 'cartao_credito'` (2 registros) é normalizado apenas na resposta da API de listagem (leitura), não é alterado no banco; qualquer `UPDATE` corretivo no dado armazenado é uma migration separada, fora deste plano.
- Alterar `FinancialAssistantDraft` ou o fluxo de criação de despesa por texto/voz para oferecer escolha de cartão — permanece sem cartão, como hoje.
- Revisar ou alterar o limite de 3 cartões por perfil (`backend/src/routes/cards.ts`).

## Leitura de contexto

- `/AGENT.md` (raiz do workspace) — regras de workflow, contexto multi-tenant genérico não aplicável (projeto single-tenant).
- `sistema financas/AGENT.md`, `sistema financas/CLAUDE.md` — sequência obrigatória `/planejar → aprovação → /implementar → /finalizar`; migrations nunca automáticas.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- `.portal/tasks/Reformular cartão para conta com tipo crédito-débito.md` — task de origem.
- `backend/drizzle/0017_categorias_tipo.sql` e `backend/drizzle/0018b_migrar_dados_categorias_existentes.sql` — padrão de referência seguido para a estrutura das duas novas migrations (schema + backfill separados, comentário "Do not execute automatically").
- `backend/src/db/schema/cards.ts` — schema atual da tabela `cartoes` (sem campo de tipo).
- `backend/src/routes/cards.ts` — CRUD de cartões, incluindo o limite de 3 por perfil (linha ~97) e a checagem de uso antes de excluir (linha ~206-214).
- `backend/src/db/schema/expenses.ts` — schema de `despesas`, já com `cartaoId`/`paymentMethod` como colunas independentes.
- `backend/src/routes/expenses.ts` — listagem (`SELECT d.*`, sem JOIN com cartões hoje) e queries de agregação já corrigidas em plano anterior (fallback de `valor` legado).
- `backend/src/routes/financial.ts` — rota `/panorama`, agregação `porFormaPagamento` (linha ~223-227), confirmada como fora do escopo.
- `src/screens/config/CartaoTab.tsx` — formulário de cadastro/edição de cartão, sem campo de tipo hoje.
- `src/screens/finance/ExpenseDialog.tsx` — fluxo de escolha de forma de pagamento e cartão (linhas ~116-150, ~221-260, ~613-659); `activeCards` hoje não filtra por tipo.
- `src/screens/despesas/DespesasScreen.tsx` — coluna "Pagamento" (linha ~647, `getFormaLabel(item.formaPagamento)`) e filtro `filtroFormaPag` (linhas ~439-446), ambos baseados só em forma de pagamento.
- `src/services/financeService.ts` — `expenseFromApi` (linhas 61-87), onde `cartao_id` é descartado hoje.
- `src/types/finance.ts` (`Expense`) e `src/types/config.ts` (`Cartao`, `CartaoFormValues`) — tipos a estender.
- `src/components/financial-assistant/FinancialAssistant.tsx`, `src/types/financialAssistant.ts` — confirmado que o assistente cria despesas via `saveExpense` direto, sem `cartao_id`, compatível sem alteração.
- `src/services/demo/demoFakeDatabase.ts`, `src/services/demo/fakeApiResolver.ts` — modo demo, já simula `cartao_id` em despesas fake.
- Consulta read-only já realizada em produção (nesta investigação, sem escrita): 570 despesas totais, 345 com `cartao_id` preenchido (100% delas com `forma_pagamento` `credito`/`cartao_credito`); 4 combinações usuário/perfil com cartões cadastrados (1-2 cartões cada); coluna `status` de `despesas` confirmada 100% `'ativa'` nos registros consultados.

## Impacto por área

### Frontend

- `src/screens/config/CartaoTab.tsx`: novo campo de seleção de tipo (crédito/débito/ambos) no formulário `CartaoDialog`; exibição do tipo no card visual do cartão na listagem.
- `src/screens/finance/ExpenseDialog.tsx`: `activeCards` passa a filtrar por compatibilidade — `c.tipo === formaPagamento || c.tipo === 'ambos' || c.tipo == null` (cartões sem tipo definido continuam aparecendo, para não quebrar cartões ainda não classificados após o backfill).
- `src/services/financeService.ts`: `expenseFromApi` passa a mapear `cartaoId`/`cartaoNome` a partir dos novos campos retornados pelo backend.
- `src/types/finance.ts`: `Expense` ganha `cartaoId?: number | null` e `cartaoNome?: string | null`.
- `src/types/config.ts`: `Cartao`/`CartaoFormValues` ganham `tipo?: 'credito' | 'debito' | 'ambos' | null`.
- `src/screens/despesas/DespesasScreen.tsx`: coluna "Pagamento" passa a exibir o nome do cartão quando presente (ex.: "Crédito · Nubank"); filtro por forma de pagamento é mantido, com opção adicional de filtrar por cartão específico quando aplicável.
- `src/services/demo/demoFakeDatabase.ts`/`fakeApiResolver.ts`: avaliar inclusão de `tipo` simulado nos cartões fake, para consistência visual do modo demo com o novo campo.
- Sem novas query keys — reaproveita `queryKeys.cartoes` e as query keys de despesas já existentes.
- Sem novos estados de loading/error além dos já existentes nos componentes tocados.
- Sem testes automatizados nesta área do projeto (confirmado em investigações anteriores) — validação manual obrigatória.

### Backend

- `backend/src/db/schema/cards.ts`: novo campo `type: varchar('tipo', { length: 10 })`, nullable.
- `backend/src/routes/cards.ts`: `POST`/`PUT /api/cards` passam a aceitar e validar `tipo` (valores permitidos: `'credito' | 'debito' | 'ambos'`, ou ausente/`null`); `GET` (listagem e por id) passam a retornar o campo.
- `backend/src/routes/expenses.ts`:
  - `GET /despesas` (listagem): adicionar `LEFT JOIN cartoes` para retornar nome do cartão junto de `cartao_id` (hoje só retorna o ID bruto via `SELECT d.*`).
  - `POST`/`PUT /despesas`: validação de compatibilidade — se `cartao_id` for enviado, verificar que o `tipo` do cartão referenciado é compatível com `forma_pagamento` (ou o cartão não tiver tipo definido, permitindo); despesas sem `cartao_id` não são afetadas por essa validação.
- Sem mudança em `backend/src/routes/financial.ts` (rota `/panorama`) — fora do escopo.
- Preservar o padrão de filtro por `usuario_id`/`perfil_id` já usado em todas as queries tocadas.

### Banco de dados

- Nova coluna `cartoes.tipo VARCHAR(10)`, nullable, sem valor default.
- Migration de backfill: `UPDATE cartoes SET tipo = 'credito' WHERE id IN (SELECT DISTINCT cartao_id FROM despesas WHERE cartao_id IS NOT NULL AND forma_pagamento IN ('credito', 'cartao_credito'))`.
- Ambas as migrations seguem o formato dos precedentes `0017`/`0018b`: comentário explicativo no topo do arquivo e a linha `-- Do not execute automatically. Confirm the target database before applying.`.
- Nenhuma das duas migrations deve ser executada automaticamente por esta implementação — apresentadas ao usuário para revisão e execução manual confirmada.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/backend/drizzle/0020_cartoes_tipo.sql` (novo)
- `sistema financas/backend/drizzle/0020b_migrar_dados_cartoes_existentes.sql` (novo)
- `sistema financas/backend/src/db/schema/cards.ts`
- `sistema financas/backend/src/routes/cards.ts`
- `sistema financas/backend/src/routes/expenses.ts`
- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/services/financeService.ts`
- `sistema financas/src/types/finance.ts`
- `sistema financas/src/types/config.ts`
- `sistema financas/src/services/demo/demoFakeDatabase.ts`
- `sistema financas/src/services/demo/fakeApiResolver.ts`

## Estratégia de implementação

1. Criar a migration de schema `0020_cartoes_tipo.sql`, seguindo o formato de `0017_categorias_tipo.sql`.
2. Criar a migration de backfill `0020b_migrar_dados_cartoes_existentes.sql`, seguindo o formato de `0018b_migrar_dados_categorias_existentes.sql`, com o critério de classificação já decidido (crédito para cartões com uso de crédito comprovado; `NULL` para os demais).
3. Atualizar `backend/src/db/schema/cards.ts` com o novo campo `type`.
4. Atualizar `backend/src/routes/cards.ts`: aceitar, validar e retornar `tipo` no `POST`, `PUT` e `GET`.
5. Atualizar `backend/src/routes/expenses.ts`: adicionar JOIN com `cartoes` na listagem (`GET /despesas`) para retornar nome do cartão; adicionar validação de compatibilidade tipo↔forma de pagamento no `POST`/`PUT`, aplicada apenas quando `cartao_id` estiver presente no payload.
6. Atualizar `src/types/config.ts` (`Cartao`, `CartaoFormValues`) e `src/screens/config/CartaoTab.tsx` (formulário de cadastro/edição com seleção de tipo).
7. Atualizar `src/types/finance.ts` (`Expense`) e `src/services/financeService.ts` (`expenseFromApi`) para expor `cartaoId`/`cartaoNome`.
8. Atualizar `src/screens/finance/ExpenseDialog.tsx`: filtrar `activeCards` pela compatibilidade de tipo com a forma de pagamento selecionada.
9. Atualizar `src/screens/despesas/DespesasScreen.tsx`: coluna "Pagamento" exibindo nome do cartão quando presente; filtro incluindo opção por cartão.
10. Avaliar e, se necessário, ajustar `src/services/demo/demoFakeDatabase.ts`/`fakeApiResolver.ts` para refletir o novo campo `tipo` no modo demo.
11. Rodar `npx tsc --noEmit` e `npm run build` no frontend; `npx tsc --noEmit` no backend.
12. Apresentar as duas migrations ao usuário para revisão — não executar automaticamente.
13. Validação manual: cadastrar cartão com tipo definido; lançar despesa e confirmar que apenas cartões compatíveis com a forma de pagamento escolhida aparecem; confirmar que a listagem de Despesas mostra o nome do cartão; confirmar que o filtro por cartão funciona; confirmar que o Assistente Financeiro (painel e PWA `assistant.html`) continua criando despesas sem cartão normalmente, sem erro de validação.

## Regras de negócio identificadas

- Um cartão pode ter `tipo` igual a `'credito'`, `'debito'`, `'ambos'`, ou `NULL` (sem tipo definido) — cartões sem tipo são tratados como compatíveis com qualquer forma de pagamento, para não quebrar cartões cadastrados antes desta mudança e ainda não classificados.
- Uma despesa só pode vincular um cartão cujo `tipo` seja compatível com a `forma_pagamento` escolhida, ou cujo `tipo` seja `NULL`.
- Despesas sem cartão vinculado (dinheiro, PIX, ou lançamentos originados do Assistente Financeiro) continuam funcionando normalmente, sem exigir cartão nem passar pela nova validação de compatibilidade.
- O limite de 3 cartões por perfil é mantido sem alteração.
- O backfill de `tipo` só classifica cartões com uso comprovado de crédito nos dados existentes; não infere `débito` para nenhum cartão, já que não há despesas de débito com cartão vinculado hoje.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. O isolamento relevante é por `usuario_id`/`perfil_id`, já aplicado em `cartoes` e `despesas` — deve ser preservado integralmente em todas as queries novas ou alteradas (JOIN de listagem de despesas, validação de compatibilidade ao salvar, CRUD de cartões). Nenhum dado sensível novo é introduzido; a mudança expõe apenas informação (nome do cartão) que já pertence ao usuário autenticado dono dos registros.

## Validações necessárias

- Backend (`POST`/`PUT /api/cards`): `tipo`, quando enviado, deve ser um dos valores permitidos (`'credito' | 'debito' | 'ambos'`); rejeitar outros valores com erro 400.
- Backend (`POST`/`PUT /despesas`): quando `cartao_id` for enviado, validar que o `tipo` do cartão referenciado é compatível com `forma_pagamento` (ou é `NULL`); rejeitar combinações incompatíveis com erro 400 claro.
- Frontend: refletir a mesma regra de compatibilidade na filtragem de `activeCards` em `ExpenseDialog.tsx`, evitando que o usuário tente selecionar uma combinação inválida antes mesmo de submeter o formulário.

## Testes necessários

### Frontend

Não há suíte de testes automatizados nesta área do projeto — validação manual obrigatória, conforme detalhado no passo 13 da estratégia de implementação.

### Backend

Validação manual das rotas alteradas (`cards.ts`, `expenses.ts`), incluindo casos de dados legados (despesa com forma de pagamento crédito sem cartão vinculado, cartão sem tipo definido, tentativa de combinação incompatível).

### E2E

Não aplicável — não há suíte E2E no projeto.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npx tsc --noEmit
npm run build

cd backend
npx tsc --noEmit
```

## Riscos e pontos de atenção

- Cartões sem despesas de crédito vinculadas (nunca usados até hoje) permanecem com `tipo = NULL` após o backfill — a UI deve deixar essa pendência visível (ex.: indicação de "tipo não definido" no card do cartão), em vez de tratá-la como um estado silenciosamente ambíguo.
- O novo JOIN na listagem de despesas (`GET /despesas`) adiciona uma tabela à query — impacto de performance esperado como desprezível dado o volume atual (570 despesas), mas vale observar em produção após o deploy.
- Normalizar o valor legado `forma_pagamento = 'cartao_credito'` apenas na leitura (resposta da API) mantém uma divergência entre o dado armazenado e o que é exibido; se for desejável corrigir o dado na origem futuramente, isso exige uma migration de dados separada, com confirmação própria — não faz parte deste plano.
- A validação de compatibilidade tipo↔forma de pagamento no backend precisa ser cuidadosamente restrita a "somente quando `cartao_id` for enviado", para não introduzir regressão no fluxo do Assistente Financeiro, que nunca envia esse campo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões pendentes levantadas durante o planejamento foram resolvidas com o usuário:
- Abordagem de modelagem: estender `cartoes` com campo `tipo` (confirmado).
- Rótulo na UI: manter "Cartão" nesta entrega, sem renomear para "Conta" (confirmado).
- Critério de backfill: `tipo = 'credito'` para cartões com uso comprovado, `NULL` para os demais (confirmado).
- Impacto no Assistente Financeiro/PWA: investigado e confirmado sem necessidade de alteração, já que o assistente não usa `cartao_id`.

## Critérios de aceite do plano

- A tabela `cartoes` tem o campo `tipo`, populado via backfill para os cartões com uso de crédito já comprovado nos dados.
- O cadastro de cartão permite definir/editar o tipo (crédito/débito/ambos).
- Ao lançar uma despesa, apenas cartões compatíveis com a forma de pagamento escolhida (ou sem tipo definido) são oferecidos como opção.
- A coluna "Pagamento" e o filtro correspondente na tela de Despesas mostram e permitem filtrar pelo cartão real usado, além da forma de pagamento genérica.
- O vínculo de cartão de cada despesa, já existente no banco para 60% dos registros, deixa de ser descartado pelo frontend.
- O Assistente Financeiro (painel e PWA) continua criando despesas normalmente, sem exigir cartão e sem ser bloqueado pela nova validação de compatibilidade.
- Nenhuma migration é executada automaticamente; ambas são apresentadas para revisão e execução manual confirmada pelo usuário.
- `npx tsc --noEmit` e `npm run build` passam sem erros novos introduzidos por esta mudança, tanto no frontend quanto no backend.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto; a task de origem em `.portal/tasks/` tem contexto adicional de investigação, mas este plano já incorpora as decisões técnicas confirmadas.
- Seguir `sistema financas/CLAUDE.md` (sequência `/planejar → aprovação → /implementar → /finalizar`; nunca commitar/push sem passar por `/finalizar`).
- Seguir rigorosamente o formato das migrations `0017`/`0018b` como precedente para as novas migrations `0020`/`0020b`.
- Não renomear "Cartão" para "Conta" em nenhuma parte da UI — fora do escopo confirmado.
- Não criar entidade "conta" separada — fora do escopo confirmado.
- Não alterar o fluxo do Assistente Financeiro para oferecer escolha de cartão — fora do escopo confirmado.
- Não executar nenhuma migration automaticamente — apresentar para revisão e aguardar confirmação explícita do usuário antes de qualquer execução.
- Não normalizar dados existentes em produção além do que a migration de backfill já prevista cobre.
