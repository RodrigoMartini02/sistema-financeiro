# Validação: despesas fixas com previsão anual

Data: 30/10/2026.

Plano: [despesas fixas com previsão anual e confirmação no modal](despesas-fixas-previsao-anual-confirmacao-modal.md).

## Resultado

Implementação e revisão de finalização concluídas para commit local em `main`. Publicação aguarda autorização específica. A migration foi aplicada somente em cópias descartáveis do PostgreSQL local, autorizadas pelo usuário e removidas após os testes. Não houve push, deploy ou escrita no banco de produção.

### Comportamentos implementados

- Cobrança **Fixa**, configuração mensal com valor de referência e geração de previsões até dezembro, incluindo o primeiro mês como previsão.
- Conversão de despesa única existente preservando o registro atual e gerando somente as ocorrências seguintes.
- Botão manual **Despesas fixas** no modal, seletor de mês, linhas desmarcadas e ação **Confirmar selecionadas** independente do lote comum.
- Rascunhos comuns e alterações não confirmadas preservados; proteção contra troca de conta, repetição de carregamento e confirmação por teclado indevida.
- Confirmação transacional da previsão no mesmo ID, sem pagamento automático por data nem duplicação.
- Edição da configuração com alcance futuro explícito, cancelamento das previsões futuras ao desativar e renovação manual.
- Identificação **Fixa / Previsão**, filtro e calendário; previsões fora dos pagamentos comuns em lote e das somas de despesa confirmada.
- Bloco de projeção no painel: confirmadas + agendadas + previsões, com filtros e período de caixa consistentes.
- Estimativas não ocupam limite nem entram na fatura antes de confirmar. Crédito mantém pagamento pela fatura.
- Demonstração adaptada para cadastro, pendências, confirmação, projeção e saldo sem conexão com backend real.

## Validações executadas

| Verificação | Resultado |
| --- | --- |
| `npm test` do frontend, versão final | **466 aprovados, zero falhas** |
| `npm --prefix backend test`, sem banco e volume | **994 aprovados, zero falhas, 1 ensaio de volume desativado** |
| `npm run build` do frontend | **Aprovado**, incluindo PWA e geração das rotas públicas |
| `npm --prefix backend run build` | **Aprovado**, TypeScript sem emissão |
| `npm --prefix backend run build -- --project ../tsconfig.json` | **Aprovado**, checagem TypeScript do frontend usando o script/compilador existente |
| `npm run test:finance-db` na cópia descartável, revisão final | **55 aprovados, zero falhas**, incluindo 16 cenários de fixas e 5 de limpeza financeira |
| `git diff --check` | **Aprovado** |
| Alterações de `.env`, manifests/lockfiles ou CI | **Nenhuma** |

Os comandos de teste que iniciam subprocessos receberam `spawn EPERM` no sandbox. A execução revisada desses mesmos scripts passou, mantendo os testes de banco desativados na suíte normal. Os testes de banco foram executados separadamente após a autorização específica.

Runtime usado: Node.js **24.15.0**, npm **8.19.3**. O projeto continua com Node.js 22.17.0 como referência; não houve atualização de dependências/runtime e a versão exata 22.17.0 não foi executada nesta entrega.

O Vite emitiu avisos de tamanho de bundle e da configuração `inlineDynamicImports`; o build terminou com sucesso. Não existem scripts separados de lint/typecheck no frontend; a checagem de tipos usou o script de build TypeScript já existente no backend com o projeto frontend como argumento.

## Integração real com PostgreSQL

O usuário autorizou criar uma cópia local descartável, aplicar apenas a migration 0089, executar a integração e remover a cópia. O destino foi verificado como `localhost:5433`, com origem `sistema_financas_dev`.

- Banco temporário inicial: `fingerence_fixed_test_20261030_b2c8a7e4`; repetição final: `fingerence_fixed_test_20261030_71e6ca92`.
- Migration aplicada na cópia: `0089_despesas_fixas_previsao.sql`.
- Script executado: `test:finance-db`, com `DATABASE_URL` e `DB_SCHEMA` definidos apenas no processo dos testes. Nenhum arquivo `.env` foi alterado.
- Resultado inicial: 48 testes em 6 suítes aprovados. Resultado final após os ajustes da revisão: **55 testes em 7 suítes aprovados, zero falhas**, aproximadamente 3,7 segundos de testes.
- As execuções intermediárias identificaram erros no fixture de categoria e na identificação do erro esperado de FK do teste de rollback; os testes foram corrigidos e a execução final passou integralmente.
- Todas as cópias descartáveis foram removidas com sucesso ao terminar, inclusive nas execuções intermediárias.
- O banco principal de desenvolvimento e a produção não receberam essa migration ou dados de teste.

### Casos novos verificados no banco

1. Primeiro mês e dezembro previstos, sem pagamento.
2. Confirmação preserva ID, estimativa e outra competência.
3. Edição de previsão vencida não confirma nem paga.
4. Pagamento junto à confirmação é explícito; editar previsão não permite registrar pagamento.
5. Duas confirmações concorrentes preservam uma única ocorrência e não sobrescrevem o resultado vencedor.
6. Retirada conserva competência e renovação repetida não ressuscita a ocorrência.
7. Alterar fonte afeta somente futuras pendentes; desativação preserva confirmadas.
8. Conversão de despesa única preserva o lançamento pago.
9. Mover conserva a competência.
10. Conta alheia, confirmação alheia e categoria/cartão desativados são recusados.
11. Previsão no crédito fica fora do limite/fatura e passa a participar após confirmar.
12. Projeção de três contas de R$ 100 passa de R$ 300 para R$ 320 ao confirmar uma por R$ 120, sem levar estimativas ao gasto confirmado.
13. Confirmação concorrente ao pagamento da fatura respeita a ordem de locks e não perde a compra.
14. Confirmação concorrente à desativação confirma ou cancela sem sobrescrever uma confirmação.
15. Exclusão de ano cancela fixas, remove despesas comuns e preserva outro ano e outro usuário.
16. Renovação do mesmo ano excluído não recria competências retiradas.
17. Limpeza financeira exclui ocorrências antes das fontes e do catálogo, preservando outra pessoa.
18. Fonte alheia vinculada a categoria própria impede a limpeza inteira com conflito explícito.
19. Fonte alheia vinculada a cartão próprio impede a limpeza inteira com conflito explícito.
20. Despesa alheia vinculada a cartão próprio impede a limpeza inteira.
21. Uma falha de integridade posterior reverte as exclusões anteriores e mantém o perfil.

As demais suítes financeiras também passaram: limite de cartão, composição/quitação de faturas, regime de caixa, juros embutidos e edição da quantidade de parcelas.

## Correções feitas durante a revisão

- Agenda passou a ancorar deslocamentos em `firstMonth`, preservando compra e vencimento da primeira previsão quando a fatura cai no mês seguinte.
- Renovação detecta alteração concorrente da configuração, impedindo gerar datas com um cartão antigo e salvar outro cartão.
- Conta original do modal é preservada para impedir envio de rascunhos após trocar de conta.
- Defaults de datas automáticas avançam para o mês inicial quando necessário, sem alterar datas explicitamente escolhidas. A grade mostra as datas efetivas da primeira previsão.
- O contrato de filtros de relatórios exclui `prevista`, em vez de convertê-la em situação de despesa confirmada.
- A demonstração usa conta própria estável sem ler/gravar a conta da sessão real; forma de pagamento vem da ocorrência e crédito exige cartão.
- Metadado interno de interação com a data é compatível com os rascunhos já criados pelo assistente financeiro.
- Limpeza financeira integra fontes e ocorrências em transação ordenada; dependências de outra pessoa impedem a operação sem apagar dados parcialmente.
- Exclusão de ano preserva o vínculo e a competência das fixas como canceladas, impedindo recriação pela renovação.
- Exclusões de categoria e cartão verificam também cadastros fixos ativos/inativos, inclusive de outros membros, após autorizar o recurso; retornam mensagem de uso em vez de erro genérico de FK.

Na finalização houve revisão independente do frontend e do backend. Os achados de exclusão foram corrigidos e os testes financeiros repetidos. A suíte geral do backend também foi repetida: 994 aprovados e 1 ensaio de volume desativado, zero falhas. Frontend e seus arquivos permaneceram iguais aos das validações anteriores.

## Arquivos alterados

Foram alterados/adicionados **65 arquivos de código, migration e testes**, além da task, plano e este relatório: **68 arquivos no total**.

- **Persistência/API:** `backend/drizzle/0089_despesas_fixas_previsao.sql`, `backend/src/db/schema/fixedExpenses.ts`, `expenses.ts`, `index.ts`, `backend/src/routes/fixedExpenses.ts`, `expenses.ts`, `backend/src/services/fixedExpenseInput.ts`, `fixedExpenseSchedule.ts`, `fixedExpenseService.ts` e seus testes, além dos guards de `expenseService.ts`.
- **Cálculos e proteção:** `backend/src/services/expenseCounting.ts`, `painelService.ts`, `painelCalculos.ts`, `categoryAI.ts` e testes pertinentes.
- **Exclusões:** `backend/src/routes/users.ts`, `years.ts`, `categories.ts`, `cards.ts`, novos `clearFinancialDataService.ts`, `clearFinancialDataService.db.test.ts` e `yearService.ts`.
- **Modal:** `src/screens/finance/expense-dialog/ExpenseDialog.tsx`, `ExpenseRow.tsx`, `BillingPopover.tsx`, `draftState.ts`, `draftRules.ts`; novos `FixedExpensesSection.tsx`, `FixedExpenseManager.tsx`, `fixedExpenseDrafts.ts` e testes; `entry-dialog/EntryDialogFrame.tsx`.
- **Contexto e exibição:** `src/context/AppContext.tsx`, `src/App.tsx`, `src/demoMain.tsx`, `MovimentacoesScreen.tsx`, `LancamentosTable.tsx`, `entryTable.tsx`, `useEntryFilters.ts`, `expenseStatus.tsx`, `calendarStatus.ts`, `ReportsScreen.tsx`, `FinanceDashboard.tsx` e novo `ExpenseProjectionCard.tsx`.
- **Contratos e cliente:** `src/types/finance.ts`, `src/services/financeService.ts`, `fixedExpensesService.ts`, `queryKeys.ts`, `apiClient.ts`, helpers de contagem/filtros/fatura e testes.
- **Demonstração:** `demoFakeDatabase.ts`, `fakeApiResolver.ts`, novos `fixedExpensesDemo.ts`, `panelDemo.ts` e testes do fluxo.

## Pendências e limites

- **Conferência visual manual pendente:** a ferramenta de navegador/computer use informou que o host de acesso ao navegador e o pipe nativo estão indisponíveis. Não foi possível conferir a interface no navegador, em celular ou em temas claro/escuro. Os testes de seleção/datas, builds e checagem de tipos passaram, mas não substituem essa conferência visual.
- **Migration pendente nos ambientes de uso:** a 0089 foi aplicada somente na cópia apagada. Antes de usar o código contra o banco principal de desenvolvimento ou produção, preparar e autorizar sua aplicação no destino correto.
- O status do banco principal local foi conferido antes e depois: 92 migrations registradas, pendentes **0088 e 0089**. A 0088 pertence à limpeza de payload de licitações e tem requisito próprio de exportação conferida. O runner exige ordem; não executar essa migration antiga ou ignorar seus requisitos por inferência da demanda de finanças. Esse ponto deve ser resolvido explicitamente antes da aplicação no banco principal.
- Na finalização foi executado `npm run migrations:status -- --banco producao`, em transação somente leitura: **93 migrations registradas, somente 0089 pendente**. A 0088 já está aplicada em produção. Nenhuma migration foi executada nem dado alterado nesse banco.
- Sequência de publicação preparada: após autorização explícita, aplicar somente a 0089 em produção pelo runner do projeto; conferir o status; enviar o commit da `main` para iniciar o deploy no Render; conferir os serviços. A migration é aditiva e precisa preceder o código que consulta as novas colunas.
- Não houve teste ou publicação no Render. Nada foi enviado à produção.
