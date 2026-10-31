# Plano: Adequação das despesas fixas no lote e nos gráficos

## Origem

- Task: [adequação de despesas fixas, lote, gráficos e limpeza](tasks/adequacao-despesas-fixas-lote-graficos-limpeza.md).
- Classificação: **fullstack + database**.
- Data: **30/10/2026**, referência America/Sao_Paulo.
- Base inspecionada: `main`, commit `b85f49d6a7f7190eef83179c639132503849bdc8`.
- Plano preliminar apresentado na conversa e salvamento aprovado pelo usuário com **"pode salvar"**.
- Primeiro cadastro decidido explicitamente: **"Lançar a atual; prever as próximas"**.
- Este plano substitui os comportamentos conflitantes do [plano anterior](despesas-fixas-previsao-anual-confirmacao-modal.md), mantido como histórico.
- A autorização desta etapa é para salvar o plano. Implementação segue `/implementar`; novas migrations, testes que alterem banco e publicação exigem suas autorizações específicas.

## Resumo

Reaproveitar linha, estado do lote, botão final e gráficos. Fixa recebe somente Até mês/ano na mesma célula. Previsões elegíveis entram no lote com Adiar persistente por ocorrência. Primeiro cadastro lança a atual e prevê as próximas. Remover painéis, gerência/renovação separados, card de projeção e código exclusivo.

O botão final existente de registrar/salvar é a ação que grava. O + continua sendo somente Adicionar ao lote. Lançar a ocorrência atual não significa pagá-la: pagamento é explícito e, no crédito, segue a fatura.

## Escopo

### Dentro do escopo

- Fixa + Até [mês/ano] lado a lado em Cobrança, com limite obrigatório e sem assumir dezembro. Primeiro mês derivado do vencimento; mês final inclusive, com passagem de ano.
- Usar os campos normais de compra, vencimento, pagamento e comprovantes; manter bloqueios reais de fatura. Suprimir notas, resumos repetidos e sufixos explicativos exclusivos do antigo modo de template.
- O + apenas adiciona ao lote e funciona igualmente para fixa e comum. Escolher Fixa antes ou depois do + tem o mesmo resultado. Não há saveFixed separado na entrada.
- Ao registrar uma fixa nova, uma transação grava cadastro, primeira ocorrência ativa e seguintes previstas. Pagamento/anexos/NF somente na atual; futuras sem pagamento/anexos. Pagamento da fixa é explícito, não inferido pela data.
- Uma despesa única existente pode originar a repetição pela cobrança no editor habitual, preservando ID/pagamento/anexos e gerando somente as próximas. Preservar recusas de conversão de parcela, recorrente, comissão e linha de fatura.
- Ao abrir Nova despesa, consultar previsões do mês contextual (Movimentações/calendário; atalho sem mês usa atual), com data de compra <= hoje em America/Sao_Paulo. Para previsões em aberto, mês de apresentação segue vencimento como na tabela; competência permanece como identidade.
- Crédito: compra pode ser no mês anterior e apenas controla disponibilidade; vencimento calculado da fatura controla mês e último mês de geração. Preservar a primeira compra e vencimento informados. Datas mensais ancoradas na referência original, com ajuste de dia 29/30/31.
- Desmarcado inclui a previsão; Adiar marcado exclui do registro e persiste por conta/autor/ocorrência. Adiar todas só alcança previsões visíveis e admite estado parcial; não altera novas despesas nem futuras competências.
- Adiar é persistido sem confirmar ou pagar. Durante persistência ou falha da marcação, não confirmar por corrida com o botão final. Em falha, manter exclusão local e erro recuperável.
- Valor vazio/inválido não vira zero e a previsão permanece pendente, sem bloquear as demais válidas; assegurar adiamento persistente para que reabrir não lance silenciosamente a estimativa anterior.
- O botão final existente registra novas e confirma previsões não adiadas pelo mesmo ID. Contagem e soma excluem adiadas/sem valor. Sucessos saem do lote; falhas e rascunhos ficam. Enter no checkbox de Adiar não registra o lote.
- A edição comum mantém a situação da ocorrência: editar previsão pode manter prevista. A confirmação financeira ocorre no salvamento do lote, sem outro botão individual.
- Até pode ser editado no editor habitual da despesa vinculada: ampliar gera competências ausentes; reduzir cancela somente previsões futuras fora do limite; confirmadas, pagas e passado preservados. Competências canceladas não são recriadas. Encerrar repetição usa o próprio limite, sem gerente/deactivate separado.
- Editar valor/descrição/pagamento da ocorrência não altera as outras. Alterar Até modifica somente o intervalo da fonte e suas previsões futuras permitidas, sem espalhar os outros campos.
- As previsões continuam visíveis na tabela e gráficos, inclusive antes da disponibilidade no modal e quando adiadas.

### Fora do escopo

- novos painéis, gestores, cards, botões individuais de lançamento, cron ou notificações
- alterar receitas/recorrência existente, infraestrutura, dependências/runtime ou refatorar módulos fora das fixas
- apagar dados/regravar migrations aplicadas, executar DB writes, commit/push/deploy durante planejar/implementar

## Leitura de Contexto

- Foram lidos `AGENT.md`, `CLAUDE.md`, a skill de planejamento e a task desta adequação.
- `ExpenseDialog` mantém um estado próprio de abertura/gerenciamento de fixas e `saveFixed` separado da gravação normal; o lote aceita Fixa por um caminho distinto que infere o primeiro mês.
- `ExpenseRow` trata Fixa como template e esconde pagamento/anexos; `withRecurringOnCredit` também apaga os campos de pagamento dessa cobrança a cada atualização.
- `batchState` já oferece reducer, validação, progresso e remoção de itens gravados, preservando os não gravados em falha parcial.
- `EntryDialogFrame.extraContent` e os marcadores de salvamento independente foram encontrados somente nos fluxos de fixas descartados; conferir os consumidores novamente antes de removê-los.
- O backend já possui cadastro, agenda, confirmação e unicidade fonte/competência, além de guards de conta, categoria, cartão, cancelamento e concorrência.
- O painel atual busca previsões para o card separado, enquanto os agregados comuns usam as despesas lançadas. As consultas compartilhadas também atendem relatórios e não podem ser alargadas indiscriminadamente.
- `Barras` já suporta séries empilhadas e hachuras (`pilha`/`padrao`). `Pizza` e `BarrasHorizontais` podem receber extensões pequenas para a parcela prevista, sem introduzir outra biblioteca de gráficos.
- A migration 0089 foi aplicada em produção na entrega anterior. Nenhum banco foi consultado ou alterado durante este planejamento.
- O próximo identificador SQL encontrado no repositório é 0090; reconferir antes de preparar a migration.

## Impacto por Área

### Frontend

- Uma coleção de linhas e uma gravação pelo lote existente, com metadados mínimos de previsão/adiamento/limite.
- Campos habituais preservados, seletor Até ao lado de Fixa, carregamento automático e checkbox por previsão.
- Extensões dos gráficos atuais e remoção dos componentes descartados, incluindo os contratos e estados que perderem os consumidores.
- Demonstração e testes ajustados ao mesmo comportamento.

### Backend

- Geração por intervalo, primeira ocorrência lançada, adiamento persistente e confirmação no registro existente.
- Alteração de limite integrada à edição habitual e agregações do painel separadas entre previsto e lançado.
- Remoção dos endpoints/helpers exclusivos do gerenciamento e da renovação anual depois de verificar consumidores.

### Banco de Dados

- Migration posterior à 0089 para mês final e adiamento, com compatibilidade dos dados e do código existente.
- Preservar fonte/competência, FKs, unicidade e histórico; revisar o índice de pendências conforme o filtro real.

### Infra/Deploy

- Sem nova infraestrutura, dependência, cron ou alteração de configuração.
- Aplicação futura da migration e publicação no Render em ordem compatível, mediante confirmação específica. Sem PR ou staging obrigatório.

## Arquivos Provavelmente Afetados

Caminhos inspecionados. A lista indica áreas de alteração, remoção ou regressão; não exige mudar todos os arquivos:

- `src/screens/finance/expense-dialog/FixedExpensesSection.tsx`
- `src/screens/finance/expense-dialog/FixedExpenseManager.tsx`
- `src/screens/finance/painel/ExpenseProjectionCard.tsx`
- `src/screens/finance/expense-dialog/ExpenseDialog.tsx`
- `src/screens/finance/expense-dialog/ExpenseRow.tsx`
- `src/screens/finance/expense-dialog/BillingPopover.tsx`
- `src/screens/finance/expense-dialog/draftState.ts`
- `src/screens/finance/expense-dialog/draftRules.ts`
- `src/screens/finance/expense-dialog/expenseGrid.ts`
- `src/screens/finance/expense-dialog/fixedExpenseDrafts.ts`
- `src/screens/finance/expense-dialog/fixedExpenseDrafts.test.ts`
- `src/screens/finance/entry-dialog/batchState.ts`
- `src/screens/finance/entry-dialog/EntryDialogFrame.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/painel/ReceitaDespesa.tsx`
- `src/screens/finance/painel/ComoDinheiroSaiu.tsx`
- `src/screens/finance/painel/Comprometido.tsx`
- `src/screens/finance/painel/Planejado.tsx`
- `src/screens/finance/painel/OndeMaisGastou.tsx`
- `src/screens/finance/painel/graficos/Barras.tsx`
- `src/screens/finance/painel/graficos/Pizza.tsx`
- `src/screens/finance/painel/graficos/BarrasHorizontais.tsx`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/services/fixedExpensesService.ts`
- `src/services/queryKeys.ts`
- `src/services/demo/fixedExpensesDemo.ts`
- `src/services/demo/panelDemo.ts`
- `src/services/demo/fakeApiResolver.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/fixedExpenses.ts`
- `backend/src/services/fixedExpenseInput.ts`
- `backend/src/services/fixedExpenseSchedule.ts`
- `backend/src/services/fixedExpenseService.ts`
- `backend/src/services/expenseInput.ts`
- `backend/src/services/expenseService.ts`
- `backend/src/services/painelService.ts`
- `backend/src/services/painelCalculos.ts`
- `backend/src/db/schema/expenses.ts`
- `backend/src/db/schema/fixedExpenses.ts`
- `backend/src/services/fixedExpenseInput.test.ts`
- `backend/src/services/fixedExpenseSchedule.test.ts`
- `backend/src/services/fixedExpenseService.db.test.ts`
- `backend/src/services/clearFinancialDataService.db.test.ts`
- `backend/src/services/painelCalculos.test.ts`
- `src/utils/fixedExpensesDemo.test.ts`
- `src/utils/fixedExpenseCalendar.test.ts`
- Nova migration em `backend/drizzle/`, com identificação a reconferir durante `/implementar`.

## Estratégia de Implementação

### 1. Persistência e agenda

- Preparar nova migration aditiva; próximo ID encontrado foi 0090, a conferir novamente em implementar. Não editar nem remover 0089 aplicada.
- Adicionar mês final na fonte (ex.: mes_final / endMonth, DATE no primeiro dia do mês) e flag de adiamento na ocorrência (ex.: adiada / deferred, boolean default false). Não trocar status por causa de Adiar.
- Backfill conservador do mês final a partir dos dados já gerados/ano registrado, preservando as ocorrências existentes e faturas que passam de ano; não gerar, excluir ou cancelar despesas durante a migration.
- Preservar colunas de 0089 necessárias à compatibilidade durante publicação; ano_registrado perde a função de renovação, mas não deve ser derrubado enquanto código antigo puder usá-lo. Novos cadastros exigem mês final; leitura de fontes antigas trata fallback de forma delimitada.
- Reavaliar o índice parcial de pendências para conta/autor/vencimento da consulta nova. Evitar índices adicionais sem relação com filtro real.
- Não habilitar RLS sem contexto de tenant nas conexões; manter escopo explícito Drizzle, conta/autor e permissões.

### 2. Contratos, criação, confirmação e edição

- Reaproveitar POST /expenses/fixed para criar fonte + atual ativa + próximas previstas atomicamente, aceitando endMonth e campos da ocorrência atual. Derivar início no servidor pelo vencimento; validar toda a operação e não criar comum e converter em duas requisições.
- Manter GET /expenses/fixed/pending, usado automaticamente; incluir ID/competência/adiamento/limite e filtrar pelo mês financeiro das previstas e disponibilidade por compra. Retornar adiadas também.
- Manter POST /expenses/:id/confirm para o botão final do lote, com locks e transição condicional prevista->ativa no mesmo ID; recusar adiadas no banco e limpar flag ao confirmar.
- Acrescentar a operação mínima para persistir adiamento individual/em grupo (mesmo contrato com ids + deferred), limitada a IDs previstos autorizados. Conferir pertencimento e status em transação, com atualização atômica do conjunto e sem efeito nas somas.
- Integrar alteração opcional de endMonth ao PUT habitual da ocorrência em transação com sua edição. Reaproveitar executor/transaction existente, sem duas requisições parcialmente independentes. Travar na ordem compatível com cartão/fonte/ocorrência e revalidar concorrência.
- Substituir fixedExpenseYearDates/writeYear por geração do intervalo até o último mês de vencimento. Unicidade fonte+competência continua incluindo canceladas.
- Eliminar listagem/edição genérica de fonte, renovação anual e desativação exclusiva do gerente quando os consumidores forem removidos; manter apenas helpers que passam a servir geração/intervalo/autorização no fluxo normal.

Na edição habitual de uma ocorrência, preservar a autorização e as travas financeiras já existentes. Quando o limite também mudar, a atualização do intervalo e a edição precisam compartilhar a transação e uma ordem de locks compatível, sem chamadas independentes que possam deixar somente uma metade salva.

### 3. Linha e lote existentes

- Estender ExpenseDraft com metadados mínimos por linha (origem/ID existente, mês final, adiamento), sem manter segunda coleção e segundo formulário para fixas.
- Reconciliar previsões consultadas no batch existente por ID, com chaves estáveis e rascunhos sujos preservados. Impedir reinserção de confirmadas por resposta antiga/refetch e impedir reaproveitamento entre contas/meses.
- Usar batchReducer/collectBatchErrors/saveInOrder existentes. Preparar itens a gravar excluindo adiadas/sem valor e escolher createExpense para novas ou confirmFixedExpense para ID previsto. Uma única preparação/gravação cobre entrada e lote.
- Conservar o dispatcher createExpense existente para POST comum ou POST fixo, encaminhando dados completos da atual e endMonth; remover fallback que infere firstMonth de forma distinta da entrada.
- Reaproveitar input month atual movido para a célula Cobrança; ajustar grids entry/batch para Até e Adiar sem esconder os demais campos. Mobile segue empilhamento existente.
- Remover extraContent e data-independent-save do frame somente após conferir ausência de outros consumidores; ajustar guarda de teclado para checkbox/seletores sem impactar receitas.
- Retirar de withRecurringOnCredit a limpeza automática de paid/paymentDate/amountPaid para Fixa; preservar somente a coerção mensal restrita ao crédito. Ajustar singlePayment/summary de fixa para respeitar pagamento explícito, inclusive na primeira ocorrência.

Na preparação do salvamento, distinguir rascunho novo de previsão existente por metadado estável, não pelo texto da descrição ou pela posição na lista. O adiamento e os rascunhos não devem se misturar entre contas. Atualizar o estado exibido após resposta da API sem reaplicar silenciosamente um snapshot antigo.

### 4. Gráficos existentes

- Não ampliar globalmente expenseBaseConditions, expenseCounting, relatórios, orçamento consumido, faturas ou saldos. Buscar previstas em consulta própria com os mesmos filtros de conta/pagador/categoria/cartão/forma e período adequado.
- Separar lançadas e previstas antes de agregar. Reaproveitar agregadores existentes e acrescentar campos de previsão aos DTOs dos gráficos, sem somar status mutuamente exclusivos.
- Entradas e saídas: parte prevista hachurada na coluna de despesas, aproveitando SerieBarras.pilha/padrao; entradas intactas. Distinguir previsão de uma despesa lançada que apenas vence no futuro.
- Categorias/forma/tipo de gasto: mesmas pizzas/ranking com parcelas de previsão distinguíveis e detalhe Lançado/Previsto. Estender Pizza minimamente para parte prevista da mesma categoria, sem duplicar cards ou criar novo sistema de gráficos.
- Comprometido: incluir previstas em série distinta dentro da janela de seis meses já existente; uma confirmada em aberto migra de série sem duplicar; pagas seguem a regra atual.
- Metas: barra indica lançado e previsto separadamente, sem transformar previsto em consumo confirmado. Reaproveitar BarrasHorizontais e manter percentuais/alertas de gasto efetivo coerentes.
- OndeMaisGastou: alinhar apresentação por categoria com parcelas previstas quando necessário para não contradizer a pizza; não alterar os gráficos de receita/pessoa ou criar indicadores novos.
- Cards de saldo/Saiu/Resultado, pagamentos, atraso, juros e limites continuam com suas regras atuais para lançadas/pagas; uma previsão adiada não se torna atraso ou pagamento.
- Remover ExpenseProjectionCard, campo expenseProjection e projectExpenseTotals/types exclusivos quando substituídos pelas séries dos gráficos. Preservar suporte a painel contendo só previsões e opções de filtros nesse caso.

### 5. Limpeza do código descartado

Remover os componentes:

- `src/screens/finance/expense-dialog/FixedExpensesSection.tsx`
- `src/screens/finance/expense-dialog/FixedExpenseManager.tsx`
- `src/screens/finance/painel/ExpenseProjectionCard.tsx`

Remover ou substituir suas dependências exclusivas:

- fixedOpened/fixedVisible/fixedBusy/managerOpened e estados específicos dos painéis
- primeiro mês global, preview de datas automático para esse seletor e saveFixed separado
- botões Despesas fixas/Gerenciar/Confirmar selecionadas/Salvar despesa fixa e conversão por painel separado
- hidePayment/template como causa de ocultação de pagamento/anexos, mensagens e resumos exclusivos
- readFixedRenewalYear, renewFixedExpense, renovação anual e clientes/rotas exclusivos de listagem/gerente/deactivate após auditoria
- queryKeys de catálogo de fontes e DTOs/configurações de gerente sem uso
- seleção/merge de um lote paralelo e helpers/testes exclusivos do primeiro mês e renovação anual
- expenseProjection/projectExpenseTotals antigos e suporte extraContent exclusivo dos fluxos removidos

Preservar o que continua necessário:

- cadastro/vínculo mínimo e unicidade fonte+competência
- guards de conta/autor, cartão/fatura, categoria, cancelamento e confirmação concorrente
- helpers de contagem/caixa ainda usados e status Previsão na tabela/calendário
- clearFinancialDataService/yearService e guards de exclusão de categoria/cartão, porque continuam protegendo FKs e tombstones
- contexto do mês e metadados necessários ao carregamento automático

Busca global de referências + revisão dos arquivos removidos/ajustados, TypeScript/build e regressões. Não deixar componentes ocultos, funções sem chamador, rotas órfãs, contratos duplicados ou novas dependências.

## Segurança, Dados e Multi-Tenant

- Conta, autor e permissões precisam ser validados no servidor para criação, consulta, edição, adiamento em grupo e confirmação. IDs do cliente não autorizam acesso.
- Respeitar a semântica de quem paga uma despesa em cartão compartilhado ao agregar dados; preservar os filtros de pessoas/conta já resolvidos pelo backend.
- Queries novas seguem Drizzle, escopo explícito e mensagens sem detalhes de recursos de outra conta.
- Manter a ordem de locks e as transições condicionais para não sobrescrever uma confirmação concorrente ou incluir uma previsão adiada.
- Comprovantes, NF e pagamento pertencem à ocorrência; futuras previstas permanecem sem pagamento e fora de fatura/limite até serem lançadas.
- Cancelamentos conservam a competência, inclusive ao retirar mês ou excluir ano. Os guards de reset e de categorias/cartões continuam necessários às FKs existentes.
- Não alterar `.env`, secrets, dependências/runtime ou configuração do Render.
- A informação de ausência de fixas foi fornecida pelo usuário; não equivale a uma auditoria global nem autoriza apagar dados.

## Validações Necessárias

- Revisar diff e referências globais aos componentes, funções, endpoints e DTOs retirados; não deixar uma implementação antiga escondida ou um segundo caminho de salvamento.
- `npm test` no frontend.
- `npm --prefix backend test`, com testes de banco e volume desativados na execução normal.
- `npm run build` no frontend e `npm --prefix backend run build`.
- Checagem do frontend pelo script TypeScript existente: `npm --prefix backend run build -- --project ../tsconfig.json`.
- `git diff --check` e conferência de que `.env`, lockfiles, dependências, CI e configuração não foram alterados.
- Não existem scripts separados de lint/typecheck no frontend inspecionado; não inventar comandos ou instalar ferramentas para esta demanda.
- Integração financeira por `test:finance-db` somente após verificar o alvo e autorizar especificamente a nova migration, preferindo cópia local descartável. A autorização anterior para testar somente 0089 não cobre automaticamente a nova migration.
- Conferência visual em desktop/celular e temas claro/escuro. Registrar limitações reais se a ferramenta de navegador estiver indisponível.
- Runtime de referência continua Node.js 22.17.0/npm 10.9.2; não atualizar dependências para executar os checks.

## Testes Recomendados

- Mesmo resultado escolhendo Fixa antes/depois do +; duas fixas com limites diferentes no mesmo lote; + não grava; checkbox/Enter não registra.
- Compra anterior/igual/posterior a hoje, mês contextual, crédito com compra no mês anterior, virada de mês/ano e dias 29/30/31.
- Primeira ativa e futuras previstas até limite inclusivo, pagamento/NF/anexos somente na atual, sem pagamento inferido de data.
- Adiar individual/todas persistente, estado parcial, falha ao persistir, confirmação concorrente com adiamento e reabertura sem lançamento indevido.
- Linha sem valor permanece prevista e não bloqueia válidas; mistura de novas/previstas, rascunhos sujos/refetch e falha parcial sem reinserção/duplicação de confirmadas.
- Editar ocorrência só nela; ampliar/reduzir Até preserva pagas/confirmadas/passado/canceladas e unicidade, incluindo conversão de única existente.
- Graph tests: previstas/lançadas disjuntas; confirmar R$100 por R$120 substitui a estimativa; adiar mantém projeção; recortes de período/filtros/conta/pagador; painel só com previsões.
- Não contam previstas em fatura/limite, pagamento/atraso/juros, saldo e orçamento consumido; proteção de reset/exclusão de ano/categoria/cartão preservada.
- Demonstração equivalente; verificação visual desktop/celular/temas com pagamento/anexos visíveis e campo Até ao lado de Fixa.

## Riscos e Pontos de Atenção

- Confundir checkbox marcado com inclusão em vez de Adiar; rótulo e contagem precisam ser claros.
- Falha/concorrência do adiamento não pode permitir confirmação involuntária; servidor revalida.
- Misturar previstas aos agregados compartilhados contaminaria indicadores reais; manter consulta/partições explícitas.
- Gráfico futuro já usa cor própria para lançamento a vencer; previsão deve ser distinguível sem depender apenas da data.
- Limpeza não pode remover guards necessários às tabelas e FKs que continuam existindo.
- Aplicar nova migration exige autorização específica e compatibilidade com código antigo durante publicação; 0089 é histórico aplicado.
- Usuário informou que não há fixas criadas; não presumir ausência global ou usar isso para autorizar exclusão de dados.

## Perguntas em Aberto

- **Primeiro cadastro resolvido:** o usuário escolheu lançar a atual e prever as próximas.
- Os critérios de mês de vencimento, edição pelo Até, cancelamento somente de previsões futuras e representação visual foram apresentados como recomendações do plano preliminar e integram o plano aprovado para salvamento.
- Não há outra pergunta de produto bloqueante identificada para iniciar `/implementar` neste escopo. Se uma necessidade real exigir ampliá-lo ou contrariar uma decisão, apresentar o caso antes de alterá-la.
- Execução de migrations/testes com escrita no banco e publicação permanecem decisões específicas posteriores.

## Critérios de Aceite

- Fixa mostra Até mês/ano ao lado de Cobrança e mantém os campos normais visíveis em entrada, lote e edição; nenhuma seção extra de primeiro mês ou explicações repetidas.
- Escolher Fixa antes ou depois de adicionar ao lote produz os mesmos dados e resultado. O + apenas adiciona um rascunho e funciona para fixas.
- No primeiro cadastro, a ocorrência atual fica lançada e as seguintes ficam previstas até o limite inclusivo escolhido, inclusive entre anos.
- Pagamento explícito, comprovantes e nota fiscal da atual não se propagam às futuras; a data sozinha nunca confirma ou paga uma fixa.
- As previsões permanecem na tabela e nos gráficos independentemente de terem chegado à data de disponibilização no modal.
- O modal carrega uma única vez cada previsão do mês financeiro correspondente cuja compra já chegou, preservando os rascunhos da mesma conta.
- Adiar individual e Adiar todas persistem por ocorrência; linhas adiadas continuam previstas e visíveis, sem afetar despesas novas ou outros meses.
- Uma falha ou gravação pendente de Adiar não permite confirmar a linha por corrida com o botão final.
- O botão final existente grava as novas e confirma as previstas aptas e não adiadas pelo ID existente; contagem e soma representam os itens a gravar.
- Uma previsão sem valor válido permanece pendente sem virar valor zero e sem impedir o salvamento das demais válidas; a reabertura não provoca lançamento involuntário.
- Falha parcial preserva rascunhos e itens não salvos; sucessos não reaparecem nem são confirmados duas vezes após refetch ou nova tentativa.
- Editar uma ocorrência altera somente ela. Editar Até amplia com competências ausentes ou cancela apenas previsões futuras fora do limite, preservando passado, pagas, lançadas e competências canceladas.
- Entradas e saídas, categorias, formas, tipo de gasto, comprometimento e metas mostram previsto/lançado de modo distinguível e consistente com seus filtros e janelas.
- Confirmar substitui a estimativa pelo valor informado sem duplicação. Adiar mantém a estimativa nos gráficos; pagamentos, saldo, atraso, juros e orçamento consumido não passam a contar previsões.
- FixedExpensesSection, FixedExpenseManager e ExpenseProjectionCard são removidos, assim como funções/estados/rotas/contratos/testes exclusivos dos fluxos descartados e referências órfãs.
- Demonstração, verificações visuais e testes/builds pertinentes refletem o fluxo único, com limitações registradas quando alguma validação não puder ser realizada.

## Instruções Para /implementar

- Usar este plano e a task vinculada como especificação, respeitando a decisão explícita sobre a primeira ocorrência e as regras de `AGENT.md`/`CLAUDE.md`.
- Reconfirmar estado do repositório e arquivos antes de editar. Reaproveitar o fluxo atual e evitar novos painéis, camadas genéricas ou bibliotecas.
- Implementar persistência/API, integração ao lote, gráficos e limpeza como uma adequação coerente; não entregar apenas elementos ocultos mantendo fluxos antigos ativos.
- Registrar na task a resolução da primeira ocorrência e conservar os documentos antigos como histórico, sem aplicar novamente seus comportamentos substituídos.
- Não executar migrations ou testes que alterem banco sem autorização específica e verificação do destino; não alterar `.env`.
- Não fazer commit, push, PR, staging ou deploy durante `/implementar`. Seguir `/finalizar` quando solicitado, com confirmação antes do envio à produção.
- Registrar checks executados, resultados e limitações reais. Builds e testes locais não comprovam publicação ou validação visual em produção.
