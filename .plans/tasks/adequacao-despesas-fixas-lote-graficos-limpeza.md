# Task: Simplificar despesas fixas no lote e nos gráficos

## Contexto

O FinGerence já possui despesas fixas mensais com valor ajustável, ocorrências com status `prevista` e confirmação pelo mesmo registro. A entrega anterior criou um fluxo separado no modal: botão Despesas fixas, seção de pendências, gerenciamento de cadastros, primeiro mês, confirmação separada e explicações adicionais. Também criou o card Projeção de despesas no painel.

O usuário rejeitou essa complexidade e pediu reaproveitamento do lançamento normal, com limpeza real do código dos fluxos descartados. Informou que ainda não cadastrou despesas fixas; essa informação não foi verificada em banco nesta etapa.

Esta task consolida a revisão posterior à publicação do commit `b85f49d6`. Para esta adequação, prevalece sobre os comportamentos conflitantes da [task anterior](despesas-fixas-previsao-anual-confirmacao-modal.md) e do [plano anterior](../despesas-fixas-previsao-anual-confirmacao-modal.md), que permanecem como histórico.

O usuário invocou `/criar-task` após revisar o fluxo e a integração das previsões aos gráficos existentes. A autorização desta etapa é para registrar a demanda, sem implementar, executar migrations ou publicar.

## Problema

- Selecionar Fixa altera a estrutura da linha e oculta pagamento e comprovantes, dificultando um lançamento que deveria seguir o padrão existente.
- A interface exige abrir painéis e usar ações separadas para despesas fixas.
- A repetição termina automaticamente em dezembro e o usuário precisa controlar o último mês/ano.
- Escolher Fixa antes ou depois de adicionar ao lote segue caminhos distintos, com diferenças na determinação do primeiro mês e no retorno do salvamento.
- As previsões aparecem em um card específico, enquanto os gráficos existentes não apresentam essas estimativas.
- Esconder os elementos rejeitados deixaria estados, funções e caminhos de execução desnecessários no código.

## Objetivo

Integrar as fixas à lista e ao salvamento normal de despesas: escolher Fixa e Até mês/ano, receber automaticamente as previsões elegíveis na mesma lista, adiar as que ainda não podem ser lançadas e gravar as demais junto das despesas novas pelo botão final existente. Apresentar as previsões nos gráficos existentes e retirar os fluxos extras e seus resíduos.

## Escopo

### Dentro do escopo

- Manter a linha normal com descrição, categoria, forma de pagamento/cartão, cobrança, valor, compra, vencimento, pago em, valor pago e comprovantes. Preservar as restrições normais do cartão de crédito.
- Ao escolher Fixa, apresentar somente o seletor **Até [mês/ano]** ao lado de Cobrança. O vencimento da linha define o primeiro mês; o seletor define o último mês da geração, inclusive, permitindo atravessar anos. Retirar o campo separado Primeiro mês e a regra automática de terminar em dezembro.
- Permitir valores diferentes em cada ocorrência mensal, sem transformar ajustes de um mês em alterações silenciosas dos demais.
- Manter todas as ocorrências futuras na tabela de despesas com status **Previsão**, no período correspondente.
- Ao abrir Nova despesa, apresentar as previsões do mês na mesma lista do lote quando a data de compra de cada ocorrência já tiver chegado. A condição de data se aplica ao carregamento automático no modal; não deve esconder previsões futuras da tabela ou dos gráficos.
- Disponibilizar checkbox **Adiar** em cada previsão: desmarcado inclui a ocorrência no próximo salvamento; marcado mantém a ocorrência prevista. Disponibilizar **Adiar todas** no cabeçalho, com alcance somente sobre as fixas apresentadas, sem afetar despesas novas.
- Manter a marcação de adiar ao reabrir o modal, até o usuário desmarcar. A escolha vale apenas para aquela ocorrência mensal, não para toda a repetição.
- Permitir ajustar os dados na própria linha. Uma previsão sem valor válido permanece pendente e não impede o lançamento das demais despesas válidas; não tratar um valor ausente como zero.
- O **+ Adicionar ao lote** continua apenas colocando o rascunho na lista. O botão final existente de registrar/salvar grava as despesas novas e confirma as previsões não adiadas. Não criar botão Lançar por linha ou confirmação separada para fixas.
- Ao confirmar uma previsão, atualizar o registro existente, sem criar outra despesa ou somar novamente a estimativa. Lançamento e pagamento permanecem distintos; datas não confirmam nem pagam automaticamente uma fixa.
- Integrar previsões aos gráficos existentes: **Entradas e saídas**, despesas por **categoria**, **forma de pagamento**, **tipo de gasto**, **O que já está comprometido?** e **metas por categoria**. Identificar visualmente a parte prevista e a parte lançada, sem apresentá-las como valores já pagos ou como consumo confirmado do orçamento.
- Retirar o card **Projeção de despesas**, usando os gráficos existentes para essa finalidade. Ao confirmar, a mesma ocorrência muda de prevista para lançada, sem participar das duas partes ao mesmo tempo.
- Adiar mantém a ocorrência nas projeções. Previsão adiada não se torna automaticamente uma conta atrasada; pagamento, atraso e juros continuam seguindo a situação real da despesa.
- Retirar do modal o botão Despesas fixas, os painéis separados de pendências e gerenciamento, a confirmação de selecionadas, a renovação anual separada, os textos repetidos e os campos extras descartados na revisão.
- Excluir componentes, estados, funções, rotas, contratos, estilos e testes que ficarem exclusivos de fluxos removidos. Reaproveitar o fluxo existente; manter apenas o código necessário aos comportamentos desta task e às regras financeiras ainda usadas.
- Adequar a demonstração e os testes pertinentes, incluindo a equivalência entre escolher Fixa na entrada e em uma linha já adicionada ao lote.

### Fora do escopo inicial

- Criar outra tela, painel de gerenciamento, card de projeção ou fluxo paralelo de lançamento de fixas.
- Criar cron, renovação automática, notificações ou lembretes.
- Alterar o comportamento das receitas ou da recorrência já existente do cartão.
- Refatoração geral do projeto, mudanças de dependências/runtime ou remoção de código sem relação com esta funcionalidade.
- Resetar banco, apagar registros financeiros ou remover/regravar migrations já aplicadas como forma de limpar código.
- Executar migrations, alterar `.env`, fazer commit, push ou deploy nesta etapa.

## Impacto Previsto

### Frontend

- Linha única para despesas novas e previsões, com campos habituais, limite mês/ano e adiamento por ocorrência.
- Carregamento automático e salvamento conjunto pelo botão final existente, preservando rascunhos e apresentando o resultado real de cada operação.
- Gráficos atuais distinguindo previsto e lançado, com remoção do card e dos painéis descartados.
- Remoção efetiva das referências e do código sem uso, mantendo a demonstração coerente.

### Backend

- Ajustar geração mensal ao intervalo escolhido e os contratos necessários para data limite e adiamento persistente.
- Integrar confirmação ao salvamento conjunto, preservando identidade mensal, autorização e regras de pagamento.
- Revalidar categoria/cartão, concorrência e repetição de requisições, inclusive após falha parcial do lote.
- Fornecer aos gráficos valores previstos e lançados consistentes por período, conta, pessoa e filtros.
- Auditar e remover caminhos exclusivos dos fluxos descartados sem retirar serviços ou proteções que continuem necessários.

### Banco de Dados

- Há impacto previsto para guardar o limite da repetição e a marcação de adiar por ocorrência; definir a alteração mínima durante o planejamento.
- Preservar unicidade mensal, status de previsão, histórico e registros existentes. A migration 0089 já foi aplicada em produção e não deve ser reescrita ou apagada.
- A informação de que o usuário não cadastrou fixas não autoriza presumir que tabelas de outras contas estejam vazias.
- Preparar eventual migration posterior; executá-la somente após autorização específica e verificação do destino.

### Infra/Deploy

- Sem mudança de infraestrutura identificada inicialmente. A publicação futura deverá respeitar a compatibilidade entre schema e código.
- Produção no Render, com autorização específica para migration e envio. Sem PR ou staging obrigatório.

## Segurança e Dados

- Manter autenticação, permissões e isolamento por conta e pessoa em consultas, alterações de adiamento, confirmação e agregações dos gráficos.
- Usar Drizzle nas queries novas e avaliar RLS conforme o contexto real das conexões do projeto.
- Preservar regras do crédito e pagamento pela fatura; campos de pagamento e comprovantes pertencem à ocorrência, não devem ser replicados para meses futuros.
- Não confirmar linhas adiadas ou elegíveis apenas porque o modal foi aberto, o checkbox mudou ou uma data passou. A confirmação depende do botão final de salvar.
- Nunca executar migrations sem confirmação explícita. Nunca alterar `.env` ou expor secrets.

## Arquivos Provavelmente Afetados

Caminhos verificados; a necessidade de alterar ou remover cada um deve ser confirmada em `/planejar`:

- `src/screens/finance/expense-dialog/ExpenseDialog.tsx`, `ExpenseRow.tsx`, `BillingPopover.tsx`, `draftState.ts`, `draftRules.ts`, `expenseGrid.ts`.
- `src/screens/finance/expense-dialog/FixedExpensesSection.tsx`, `FixedExpenseManager.tsx`, `fixedExpenseDrafts.ts` e `fixedExpenseDrafts.test.ts`.
- `src/screens/finance/entry-dialog/EntryDialogFrame.tsx`, `batchState.ts`.
- `src/screens/finance/FinanceDashboard.tsx`.
- `src/screens/finance/painel/ExpenseProjectionCard.tsx`, `ReceitaDespesa.tsx`, `ComoDinheiroSaiu.tsx`, `Comprometido.tsx`, `Planejado.tsx`, `OndeMaisGastou.tsx`, `CardsResumo.tsx`, `EmDiaComContas.tsx` e `JurosDescontos.tsx`.
- `src/types/finance.ts`, `src/services/financeService.ts`, `src/services/fixedExpensesService.ts` e `src/services/queryKeys.ts`.
- `src/services/demo/fixedExpensesDemo.ts`, `panelDemo.ts` e `fakeApiResolver.ts`.
- `backend/src/routes/expenses.ts` e `backend/src/routes/fixedExpenses.ts`.
- `backend/src/services/fixedExpenseInput.ts`, `fixedExpenseSchedule.ts`, `fixedExpenseService.ts` e seus testes existentes.
- `backend/src/services/painelService.ts`, `painelCalculos.ts` e `painelCalculos.test.ts`.
- `backend/src/db/schema/fixedExpenses.ts` e `backend/src/db/schema/expenses.ts`.
- Nova migration, se necessária: a identificar durante o planejamento.

## Critérios de Aceite

- Escolher Fixa mantém os campos normais e apresenta Até mês/ano ao lado da cobrança, sem seção separada de Primeiro mês ou textos repetidos.
- Entrada e lote seguem as mesmas regras; a posição em que Fixa foi escolhida não altera datas, gravação ou mensagem de resultado.
- A repetição alcança o mês limite escolhido, inclusive em outro ano, e não cria ocorrências além dele.
- Cada ocorrência permanece identificável como Previsão na tabela e nos gráficos até ser lançada.
- Antes da data de compra, a previsão não entra automaticamente no modal; a partir dessa data, aparece uma única vez na lista do mês correspondente.
- Adiar uma fixa a mantém prevista, inclusive após reabrir o modal. A marcação não afeta outros meses ou despesas novas.
- Adiar todas controla as fixas apresentadas. O botão final salva as novas e confirma apenas as fixas não adiadas e aptas ao lançamento.
- Uma previsão sem valor válido continua pendente, sem pagamento ou confirmação implícitos e sem bloquear as demais linhas válidas.
- O + não grava dados financeiros. Não há botão individual Lançar nem confirmação separada de fixas.
- Ajustar valor, pagamento ou anexos de uma ocorrência não replica esses dados para meses futuros. Crédito continua seguindo a fatura.
- Os gráficos indicados mostram valores previstos e lançados de forma distinguível, seguindo período e filtros, sem duplicação na transição.
- Adiar não remove uma previsão dos gráficos; ela não é apresentada como pagamento, atraso, juros ou consumo confirmado de orçamento.
- O card Projeção de despesas e os painéis descartados deixam de existir; componentes e referências exclusivos desses fluxos são removidos, sem resíduos intencionais ou dois caminhos concorrentes de salvamento.
- Os cenários de rascunhos, falha parcial, reabertura, troca de conta e confirmação concorrente preservam as linhas que não foram efetivamente salvas.
- A demonstração, os testes relevantes e as verificações visuais de desktop/celular refletem o fluxo simplificado. Eventuais limitações de validação são registradas.

## Perguntas Para o Planejamento

- **Primeiro cadastro — resolvido durante `/planejar`:** o usuário escolheu expressamente **"Lançar a atual; prever as próximas"**. O botão final registra a despesa atual e gera somente as próximas como previsão, com pagamento explícito.
- Definir a semântica do primeiro e último mês para crédito com compra em um mês e vencimento no seguinte, mantendo a apresentação simples escolhida pelo usuário e a identidade das ocorrências.
- Definir o tratamento mínimo para editar o limite, interromper uma repetição ou converter uma despesa já registrada usando o fluxo habitual, sem recriar um painel de gerenciamento.
- Definir a compatibilidade de dados/API existentes e o efeito de ampliar ou encurtar o intervalo sobre previsões, confirmadas, pagas e canceladas, sem recriar competências retiradas.
- Definir a representação visual mínima de previsto versus lançado em barras, pizzas e metas, preservando os indicadores atuais de pagamento e saldo. Não ampliar a demanda para novos gráficos ou cards.
- Definir o estado de adiamento e a recuperação de falhas de modo que o fluxo simples não dependa de reabrir painéis, refazer rascunhos ou confirmar a mesma previsão duas vezes.

## Instruções Para /planejar

- Usar esta task como especificação de entrada e a revisão mais recente como prioridade sobre as decisões anteriores substituídas.
- Ler `AGENT.md` e `CLAUDE.md`; inspecionar os arquivos citados antes de propor alterações.
- Resolver as perguntas de produto ainda abertas sem atribuir ao usuário decisões que ele não confirmou.
- Priorizar reaproveitamento da linha, do lote, do botão final e dos gráficos existentes. Detalhar a limpeza dos fluxos descartados, sem apenas esconder componentes.
- Gerar o plano em `.plans/` após aprovação, seguindo a skill de planejamento.
- Não implementar código durante o planejamento, executar migrations ou alterar `.env`.
- Não assumir staging ou PR. Autorizações antigas de publicação ou de testes em cópia descartável não autorizam automaticamente novas migrations ou novo deploy.
