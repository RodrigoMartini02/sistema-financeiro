# Validação: adequação das despesas fixas

Data: 30/10/2026, America/Sao_Paulo.

Plano: [adequação de despesas fixas no lote e nos gráficos](adequacao-despesas-fixas-lote-graficos-limpeza.md).

## Resultado local

Implementação local preparada, com testes sem banco, integração real com PostgreSQL em cópia descartável, builds e checagens de tipos aprovados. A conferência visual manual permanece pendente, conforme os limites descritos abaixo. Nenhum commit, stage, push ou deploy foi realizado nesta etapa.

## Comportamentos implementados

- Cobrança Fixa com Até mês/ano na própria linha, incluindo passagem de ano e último mês inclusivo.
- Pagamento e anexos permanecem nos campos normais. Foram retirados o primeiro mês separado, textos exclusivos e o fluxo de salvar cadastro fora do lote.
- No primeiro cadastro, a atual é lançada e as próximas ficam previstas; pagamento, NF e anexos pertencem somente à atual. Pagamento da fixa é explícito e crédito segue a fatura.
- O + adiciona ao lote. O botão final existente grava as novas e confirma as previsões aptas pelo mesmo ID.
- Previsões carregadas automaticamente pelo mês de vencimento e pela disponibilidade da compra. A competência continua identificando a ocorrência mesmo após mover o vencimento.
- Adiar individual e Adiar todas persistentes, com controle também no celular, proteção durante a gravação da marcação e atualização do cache para reabertura.
- Previsão sem valor válido permanece pendente; linhas adiadas ficam fora da contagem, soma e gravação do lote.
- Refetch conserva rascunhos alterados e não reinsere previsões já confirmadas. A conta original é conferida antes das operações.
- Edição de uma ocorrência e alteração do limite são transacionais. Ampliação gera meses futuros ausentes; redução cancela somente futuras pendentes fora do intervalo. Canceladas não são recriadas.
- Conversão no editor conserva o ID e aplica os dados enviados, respeitando travas de pagamento e fatura.
- Previsões integradas aos gráficos existentes de entradas/saídas, categorias, formas, tipo de gasto, comprometimento e metas. Lançadas e previstas ficam separadas; saldo, pagamentos, atraso, juros e orçamento consumido mantêm as regras anteriores.
- Demonstração adaptada ao mesmo contrato e aos campos de previsão dos gráficos.

## Limpeza realizada

Foram removidos fisicamente:

- `src/screens/finance/expense-dialog/FixedExpensesSection.tsx`.
- `src/screens/finance/expense-dialog/FixedExpenseManager.tsx`.
- `src/screens/finance/painel/ExpenseProjectionCard.tsx`.

Também foram removidos estados e ações dos painéis, salvamento separado, renovação anual de despesas fixas, endpoints/contratos exclusivos do gerente e o agregado `expenseProjection` do card antigo. A busca em `src` e `backend/src` não encontrou referências aos componentes e símbolos descartados.

As regras que continuam necessárias foram preservadas: vínculo fonte/competência, unicidade, permissões, regime de caixa, pagamento pela fatura e guards de exclusão/reset. A migration 0089 aplicada anteriormente permanece intacta.

## Áreas de arquivos alteradas

- Modal e lote: `expense-dialog/ExpenseDialog.tsx`, `ExpenseRow.tsx`, `BillingPopover.tsx`, `draftState.ts`, `draftRules.ts`, `expenseGrid.ts`, `fixedExpenseDrafts.ts` e testes; `entry-dialog/EntryDialogFrame.tsx`.
- Contratos e clientes: `src/types/finance.ts`, `financeService.ts`, `fixedExpensesService.ts` e `queryKeys.ts`.
- Backend de fixas: schemas de despesas/fontes, rotas de despesas/fixas, validação, agenda, serviço e seus testes, além do fixture de limpeza financeira.
- Painel: serviços/cálculos e testes do backend; `FinanceDashboard.tsx`, gráficos existentes, helpers de categorias e respectivos testes.
- Demonstração: `demoFakeDatabase.ts`, `fixedExpensesDemo.ts`, `panelDemo.ts` e `fixedExpensesDemo.test.ts`.
- Schema preparado: `backend/drizzle/0090_despesas_fixas_limite_adiamento.sql`.

## Validações executadas

| Verificação | Resultado final |
| --- | --- |
| `npm test` no frontend | **470 aprovados, zero falhas** |
| `npm --prefix backend test`, sem banco e volume | **997 aprovados, zero falhas, 1 ensaio de volume desativado** |
| `npm run build` no frontend | **Aprovado**, incluindo PWA e geração de rotas públicas |
| `npm --prefix backend run build` | **Aprovado** |
| `npm --prefix backend run build -- --project ../tsconfig.json` | **Aprovado**, checagem TypeScript do frontend |
| `git diff --check` | **Aprovado** |
| Busca de referências aos fluxos removidos | **Sem referências residuais nos fontes** |
| `npm run test:finance-db` na cópia descartável autorizada | **56 aprovados em 7 suítes, zero falhas**, incluindo 17 cenários de fixas |
| Conferência visual manual | **Não executada; host de navegador indisponível** |

Os comandos que iniciam subprocessos foram executados com a permissão de execução necessária ao sandbox. Nos testes normais do backend, `FINANCE_DB_TESTS`, `TENDERS_DB_TESTS` e `TENDERS_VOLUME_TESTS` ficaram desativados apenas no processo. Nenhum `.env` foi alterado.

Durante a validação foram corrigidos fixtures que omitiam `paid:false` e preservadas as exigências de cartão para crédito e ausência de cartão em Pix/dinheiro. A execução final completa passou; as falhas intermediárias não foram mascaradas.

Runtime usado: Node.js **24.15.0**, npm **8.19.3**. O projeto mantém Node.js 22.17.0/npm 10.9.2 como referência; a versão exata de referência não foi executada nesta etapa. Não houve atualização de dependências/runtime.

Não existem scripts separados de lint/typecheck no frontend inspecionado. O build emitiu os avisos já presentes de tamanho de bundle e `inlineDynamicImports`; terminou com sucesso.

## Revisões independentes

- Conferidos isolamento, conversão, confirmação, adiamento, edição do limite e compatibilidade da migration.
- Ajustada a ordem de locks: adiamento em grupo trava fontes antes das ocorrências, evitando conflito circular com edição de limite.
- Edição histórica conserva categoria/cartão inativos quando o vínculo não mudou; criação, confirmação, troca de vínculo e ampliação continuam estritas.
- Uma edição antiga de previsão não sobrescreve uma confirmação concorrente.
- Agenda de crédito conserva o deslocamento mensal do primeiro vencimento explícito, sem duplicar o mês quando ele é postergado.
- Ajustados o topo do formulário para acesso horizontal aos campos em larguras intermediárias e Adiar todas também no celular. Cabeçalhos e linhas usam as mesmas grades. Essa conferência foi estática, não visual.

## Banco e migration

A 0090 adiciona mês final à fonte e adiamento à ocorrência, conserva compatibilidade com colunas anteriores e prepara um índice de pendências por vencimento. Foi aplicada somente na cópia descartável de teste; permanece pendente nos bancos de uso.

Foi feita somente leitura do alvo local para preparar a validação: `localhost:5433/sistema_financas_dev`, 92 registros em `schema_migrations`, sem a tabela `despesas_fixas`. O banco principal não recebeu a 0089 nem a 0090 por esta implementação. Produção não foi acessada nesta etapa.

O usuário respondeu **"Autorizar cópia local descartável"** à solicitação específica para aplicar somente 0089 e 0090 na cópia, executar `test:finance-db` e removê-la. A autorização antiga, referente somente à 0089, não foi reutilizada para a nova migration.

### Integração executada

- Destino verificado antes de qualquer escrita: `localhost:5433/sistema_financas_dev`. A origem estava sem sessões ativas ao criar a cópia; nenhuma sessão da origem foi encerrada.
- Cópia criada: `fingerence_fixed_lote_test_20261030_e2589581`.
- Aplicadas exclusivamente na cópia, em transação: `0089_despesas_fixas_previsao.sql` e `0090_despesas_fixas_limite_adiamento.sql`. Nenhuma outra migration foi executada.
- Script existente executado: `npm run test:finance-db`. A URL da cópia e `DB_SCHEMA=public` foram definidos somente no processo, sem alterar `.env`.
- Resultado: **56 testes em 7 suítes aprovados, zero falhas ou testes ignorados**, aproximadamente 4,3 segundos de testes.
- Os **17 cenários de fixas** passaram, incluindo pagamento explícito, disponibilidade por compra/vencimento, adiamento em grupo atômico, confirmação concorrente, disputa Adiar versus reduzir Até sem deadlock, edição histórica com vínculos inativos, conversão, alteração de limite, fatura, painel e exclusão de ano.
- As suítes financeiras anteriores de limite, pagamento de fatura, regime de caixa, juros embutidos, quantidade de parcelas e limpeza financeira também passaram.
- Cópia removida com sucesso ao terminar; apenas sessões dessa cópia foram encerradas para a remoção.
- A leitura do banco principal após a limpeza confirmou o mesmo estado inicial: **92 migrations registradas, sem `despesas_fixas` e sem a coluna `adiada`**. O banco principal e a produção não receberam migrations ou dados de teste.
- Log local da execução: `%TEMP%/fingerence-fixed-simplify-finance-db-final.log`.

## Pendências e limites

- A ferramenta de UI retornou `Computer Use native pipe is unavailable` e `The browser access host is unavailable`. Não foi possível conferir a tela no navegador, em celular ou nos temas; testes e revisão CSS não substituem essa conferência.
- O código usa as novas colunas. Usar com o banco principal ou publicar exige preparar a aplicação da migration no destino correto e obter autorização específica, respeitando também as pendências próprias de cada banco.
- Nada foi enviado à produção. A finalização local está registrada abaixo; aplicação no banco de uso e publicação dependem da autorização específica do usuário.

## Finalização local

- Skill `finalizar` invocada pelo usuário após a integração autorizada. Branch: `main`.
- Diff revisado com verificações independentes de backend, modal/lote e painel/demonstração. Nenhum bloqueador material identificado.
- Preservado o atalho habitual **Pagar fatura** na edição de uma fixa ativa elegível no crédito, sem retornar os resumos exclusivos descartados.
- Após esse ajuste de apresentação, `npm run build` e `npm --prefix backend run build -- --project ../tsconfig.json` passaram novamente. O primeiro build encontrou `spawn EPERM` do sandbox; a execução com a permissão necessária passou.
- Testes completos anteriores, no mesmo trabalho de implementação: 470 no frontend, 997 no backend e 56 de integração em cópia descartável, todos aprovados. Nenhuma lógica financeira foi alterada na finalização e não houve nova escrita em banco.
- `git diff --check` aprovado. Sem alterações em `.env`, secrets, dependências, lockfiles, CI/CD, configuração do Render ou migrations históricas. Artefatos de build ficaram fora do commit.
- Escopo do commit local: modal/lote, contratos/API, agenda/persistência, gráficos/demonstração, testes, migration 0090 e os três documentos desta adequação; incluindo a remoção dos três componentes descartados.
- Commit preparado com a mensagem `fix(finance): simplify fixed expenses and forecast charts`.
- Publicação prevista: verificar o destino e o estado das migrations; aplicar a **0090 antes do novo backend**, preservando a compatibilidade com o código anterior; publicar backend e frontend pelo fluxo do Render. Nenhum push, deploy ou migration de uso foi executado nesta finalização.
- Limitações mantidas: conferência visual indisponível e checks executados no Node 24.15.0/npm 8.19.3, sem teste no runtime exato de referência.
