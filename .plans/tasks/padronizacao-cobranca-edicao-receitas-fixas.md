# Task: Padronizar cobrança, edição e receitas fixas

## Contexto

Data: 31/10/2026, America/Sao_Paulo. Base local inspecionada: `main`, commit `5d73332f` (`fix(finance): simplify fixed expenses and forecast charts`), sem alterações de código nesta rodada.

Após a publicação da adequação de despesas fixas, o usuário revisou a interface e pediu ajustes no posicionamento dos controles, na edição de lançamentos e na apresentação dos status. Também aprovou a sugestão de transferir a configuração das receitas fixas das subcategorias para o próprio lançamento, seguindo o modelo de despesas revisado nesta conversa, e acrescentou a troca do rótulo PIX por Pix.

Esta task complementa a [adequação de despesas fixas, lote, gráficos e limpeza](adequacao-despesas-fixas-lote-graficos-limpeza.md). Prevalecem as decisões desta revisão sobre a posição externa do Até e os controles separados na edição. A invocação de `/criar-task` autoriza registrar a demanda, sem implementar, alterar banco ou publicar.

## Problema

- O Até das despesas fixas está fora do menu, ao lado do seletor fechado, ampliando a célula e alterando o padrão visual da linha.
- Na edição de despesa única, Parcelado sai do menu e aparece como Parcelar em abaixo da linha. Criação e edição passam a apresentar controles diferentes para a mesma finalidade.
- Cobrança e campos de pagamento podem ficar bloqueados na edição. O usuário precisa corrigir despesas já cadastradas e pagas, com tratamento coerente dos registros e das faturas.
- O modal apresenta uma etiqueta de status, como Agendado, apesar de a listagem já possuir status. Esse rótulo confunde lançamento, previsão e pagamento.
- A despesa prevista aparece como Previsão; foi proposto e consolidado na revisão o rótulo Prevista, concordando com despesa e receita.
- A receita fixa é configurada na subcategoria, com valor e dia, enquanto o modal possui outro caminho de Repetir até. A subcategoria mistura organização com regras de geração de receitas.
- Receitas previstas aparecem numa faixa separada, com confirmação individual, em vez de participar da lista e do salvamento normal.
- A configuração antiga de receitas também participa de renovação anual, rotinas e projeções do painel. Uma troca apenas visual deixaria caminhos concorrentes e risco de duplicação.
- A forma de pagamento usa o rótulo PIX em vez de Pix.

## Objetivo

Padronizar os lançamentos de despesas e receitas com os componentes e estilos existentes: controles complementares dentro da própria opção do menu, edição coerente, status somente na listagem e receitas fixas configuradas no lançamento, com previsões integradas ao lote. Preservar histórico e regras financeiras, removendo os caminhos que perderem sua finalidade.

## Escopo

### Dentro do escopo

- Manter Não repete, Parcelado e Fixa no mesmo menu Cobrança das despesas, tanto no lançamento quanto na edição, respeitando as opções aplicáveis ao registro e a recorrência do crédito já existente.
- Exibir o controle de quantidade `− número +` ao lado de Parcelado, na própria linha da opção selecionada dentro do menu.
- Exibir Até mês/ano ao lado do texto Fixa, na própria linha da opção selecionada dentro do menu. Ao fechar, a linha principal continua apenas com o seletor de cobrança.
- Retirar os controles externos de quantidade e Até substituídos pelo menu. Conservar os controles de alcance e as confirmações financeiras que continuarem necessários na edição de séries.
- Usar o mesmo padrão de componentes, dimensões e estilos no lançamento, lote e edição, inclusive no celular. Reaproveitar o seletor de quantidade e os campos de mês/ano pertinentes; evitar controles visuais paralelos.
- Permitir corrigir Cobrança, Pago em e Valor pago em despesas já cadastradas ou pagas. Tratar as alterações aplicáveis de cobrança preservando pagamentos e histórico; disponibilizar a edição na interface e na gravação, sem liberar somente um campo que o servidor continuará recusando.
- Manter o pagamento do crédito com cartão vinculado à fatura. Correções financeiras provenientes da fatura devem ocorrer nesse pagamento, de modo consistente com os totais e com os registros vinculados.
- Remover somente a etiqueta de status dos modais de despesas e receitas. Preservar os demais dados do resumo, sugestões e avisos necessários ao salvamento.
- Padronizar o texto apresentado como Prevista para despesas e receitas previstas, mantendo os demais status existentes. Não criar um status Agendado como substituto de previsão; conservar a regra já existente de Agendada para a recorrência mensal do cartão.
- Retirar da subcategoria de receitas a configuração de receita fixa, valor e dia, incluindo a apresentação exclusiva dessa configuração. Categoria e subcategoria continuam organizando os lançamentos.
- Configurar a receita fixa diretamente no lançamento, com Não repete ou Fixa e Até mês/ano dentro da opção Fixa, no mesmo padrão visual das despesas. Substituir o fluxo atual de Repetir até pelo fluxo unificado.
- Vincular a repetição à receita e sua série, à conta e à pessoa, permitindo que a subcategoria seja reutilizada sem impor a mesma repetição a todos os lançamentos.
- Usar os dados da linha para a ocorrência atual e para gerar as próximas como previstas até o limite escolhido, inclusive entre anos. Permitir ajustar o valor de cada ocorrência sem espalhar silenciosamente a alteração para os outros meses.
- Distinguir registro de recebimento e previsão: receita recebida entra no saldo; receita futura prevista permanece fora do saldo recebido até confirmação. Preservar a separação nos gráficos existentes.
- Apresentar as receitas previstas do mês consultado na mesma lista do lote, a partir da data prevista de recebimento, com campos editáveis e sem duplicar ocorrências. A disponibilidade no modal não deve esconder previsões futuras da tabela ou do painel.
- Disponibilizar Adiar individual e Adiar todas para as previstas apresentadas. Persistir a decisão por ocorrência; Adiar não confirma, cancela nem retira a previsão dos gráficos e não altera receitas novas.
- Usar o botão final existente para registrar novas receitas e confirmar as previstas aptas e não adiadas pelo mesmo registro. O + continua apenas adicionando um rascunho ao lote.
- Receita prevista sem valor válido permanece pendente, sem virar zero e sem impedir as demais válidas. Preservar rascunhos e itens não gravados quando houver falha parcial.
- Substituir a faixa Já previstas neste mês e a confirmação individual do modal pelo fluxo do lote. Adequar a renovação anual separada, que perde a finalidade com o limite no lançamento.
- Preservar as receitas, previsões, recebimentos e vínculos existentes na transição. Adequar rotinas, demonstração e painel para que a configuração antiga e a nova não gerem ou projetem a mesma receita em duplicidade.
- Preservar os vínculos e as regras próprias de contratos, faturamento, retenções, comissões, produtos e horas; receitas já geradas por contrato não devem ganhar uma segunda repetição automática.
- Remover componentes, estados, funções, contratos, rotas e testes que ficarem exclusivos dos fluxos substituídos, após conferir consumidores. Manter o código necessário às regras que continuam válidas.
- Alterar o rótulo da forma de pagamento de PIX para Pix nos seletores e apresentações pertinentes, preservando o identificador interno `pix` e as regras de pagamento.

### Fora do escopo inicial

- Criar novos painéis, gestores, cards de projeção ou botões individuais de confirmação no modal.
- Acrescentar parcelamento de receitas apenas para copiar as opções das despesas; a revisão das receitas trata de Não repete e Fixa.
- Refatoração geral do sistema, alterações de dependências/runtime ou mudanças sem relação com esta demanda.
- Reformular os demais status existentes, além da padronização Prevista e da retirada da etiqueta nos modais.
- Desvincular compras do pagamento de fatura ou apagar histórico para permitir edição.
- Apagar lançamentos financeiros, presumir que não existam receitas fixas antigas ou reescrever migrations já aplicadas.
- Alterar cobrança da assinatura da plataforma ou integrações de pagamento para mudar apenas o rótulo Pix dos lançamentos.
- Implementar código, executar migrations, alterar `.env`, fazer commit, push ou deploy nesta etapa de registro da task.

## Impacto Previsto

### Frontend

- Menu de cobrança e campos complementares consistentes entre criação, lote e edição.
- Edição dos campos solicitados com as restrições financeiras explicadas no contexto correto.
- Retirada apenas da etiqueta de status dos modais, padronização Prevista nas listagens pertinentes e rótulo Pix.
- Subcategorias de receitas simplificadas e previsões recebidas pelo fluxo normal do lote, com adiamento persistente.
- Remoção dos fluxos exclusivos substituídos, ajustes na demonstração e testes pertinentes.

### Backend

- Conferir e adequar os contratos e regras de edição de cobrança e pagamento, preservando histórico, permissões e faturas.
- Reorganizar a origem da repetição das receitas, seu limite e a confirmação de previsões editadas, com proteção contra duplicação e concorrência.
- Adequar as dependências da configuração antiga nas rotinas, renovação e painel sem interromper as funções próprias de contratos.

### Banco de Dados

- Há impacto provável para vincular a repetição ao lançamento, guardar o limite e o adiamento por ocorrência e compatibilizar fontes e previsões antigas. O planejamento deve definir a alteração mínima e a transição necessária.
- Preservar identidade, conta, autor, competências, status e histórico dos registros existentes. Não assumir ausência de dados nem escolher um número de migration sem reconferir o repositório.
- Toda execução de migration ou teste com escrita exige autorização específica e verificação do destino.

### Infra/Deploy

- Sem nova infraestrutura ou mudança de configuração identificada inicialmente.
- A publicação futura no Render deve respeitar a ordem compatível entre schema e código, com autorização explícita. Não há PR ou staging obrigatório.

## Segurança e Dados

- Preservar autenticação, permissões de edição e isolamento por conta e pessoa nas consultas, fontes de repetição, adiamentos, confirmações e agregações.
- Validar as alterações no servidor; a autorização não pode depender apenas da disponibilidade visual dos campos.
- Preservar travas e vínculos efetivos do pagamento de fatura, com tratamento explícito das correções pedidas pelo usuário.
- Manter recebimento e previsão separados nos saldos e gráficos. Alterar data, abrir modal ou adiar não confirma recebimento.
- Preservar origem de contratos, regras de comissão e retenções, impedindo geração financeira duplicada.
- Usar Drizzle nas novas queries quando aplicável e avaliar RLS conforme o contexto real das conexões.
- Nunca executar migrations sem confirmação explícita. Nunca alterar `.env`, secrets ou configuração de produção nesta etapa.

## Arquivos Provavelmente Afetados

Caminhos verificados na inspeção. A seleção final e a necessidade de alterar ou remover cada arquivo cabem ao planejamento.

- `src/screens/finance/expense-dialog/BillingPopover.tsx`
- `src/screens/finance/expense-dialog/InstallmentCountField.tsx`
- `src/screens/finance/expense-dialog/ExpenseRow.tsx`
- `src/screens/finance/expense-dialog/ExpenseDialog.tsx`
- `src/screens/finance/expense-dialog/expenseGrid.ts`
- `src/screens/finance/expense-dialog/draftRules.ts`
- `src/screens/finance/expense-dialog/draftState.ts`
- `src/screens/finance/expense-dialog/PaymentMethodPopover.tsx`
- `src/screens/finance/entry-dialog/SummaryLine.tsx`
- `src/screens/finance/entryTable.tsx`
- `src/screens/despesas/expenseStatus.tsx`
- `src/screens/receitas/IncomeCard.tsx`
- `src/screens/config/ClassificacoesReceitaTab.tsx`
- `src/screens/finance/income-dialog/RepeatPopover.tsx`
- `src/screens/finance/income-dialog/PredictedIncomesStrip.tsx`
- `src/screens/finance/income-dialog/IncomeDialog.tsx`
- `src/screens/finance/income-dialog/IncomeRow.tsx`
- `src/screens/finance/income-dialog/incomeGrid.ts`
- `src/screens/finance/income-dialog/draftRules.ts`
- `src/screens/finance/income-dialog/draftState.ts`
- `src/screens/finance/SeriesRenewalModal.tsx`
- `src/services/financeService.ts`
- `src/services/incomeClassificationsService.ts`
- `src/services/fixedIncomeRenewalsService.ts`
- `src/services/queryKeys.ts`
- `src/types/finance.ts` e `src/types/config.ts`
- `src/utils/cardInvoice.ts` e `src/utils/installmentCount.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/income-classifications.ts`
- `backend/src/routes/fixedIncomeRenewals.ts`
- `backend/src/routes/internal-jobs.ts`
- `backend/src/services/incomeService.ts` e `backend/src/services/incomeInput.ts`
- `backend/src/services/fixedIncomes.ts`
- `backend/src/services/fixedIncomeSchedule.ts`
- `backend/src/services/fixedIncomeRenewalService.ts`
- `backend/src/services/fixedExpenseService.ts`
- `backend/src/services/painelService.ts` e `backend/src/services/painelCalculos.ts`
- `backend/src/db/schema/incomes.ts`
- `backend/src/db/schema/incomeClassifications.ts`
- Testes, arquivos de demonstração, demais consumidores e eventual nova migration: identificar durante `/planejar`.

## Critérios de Aceite

- Ao selecionar Parcelado, o número de parcelas aparece ao lado do texto da opção dentro do menu, em lançamento, lote e edição aplicável; não há controle externo equivalente.
- Ao selecionar Fixa, Até mês/ano aparece ao lado do texto da opção dentro do menu; o campo não ocupa a linha externa da despesa ou receita.
- Componentes, estilos e comportamento de teclado seguem o padrão existente e funcionam em desktop e celular. Interagir nos controles do menu não salva o lote inadvertidamente.
- A edição permite corrigir os campos solicitados nas despesas aplicáveis, inclusive já pagas, com gravação coerente e preservação do histórico. Casos de pagamento controlado pela fatura mantêm correção pelo fluxo de fatura.
- Nenhuma etiqueta de status aparece nos modais de lançamento/edição. Os demais dados, sugestões e avisos necessários permanecem.
- O rótulo de previsão nas apresentações pertinentes é Prevista, mantendo os demais status e as regras financeiras já existentes.
- O cadastro de subcategoria de receita não pede configuração de fixa, valor ou dia. A receita fixa é configurada no próprio lançamento com o limite escolhido pelo usuário.
- As ocorrências futuras são previstas até o limite, inclusive entre anos; ajustes de valor em um mês não modificam silenciosamente os outros.
- Previstas elegíveis do mês aparecem uma única vez na lista normal do modal, com possibilidade de editar e adiar. Futuras ainda indisponíveis no modal permanecem na tabela e no painel.
- Adiar individual e Adiar todas persistem por ocorrência, não confirmam recebimento e não afetam receitas novas. Itens adiados permanecem previstos nos gráficos.
- Um único botão final salva novas e confirma as previstas aptas não adiadas pelo mesmo ID. Linhas sem valor e falhas parciais não provocam zeros, duplicação ou perda de rascunhos.
- A faixa separada e a confirmação individual substituídas deixam de existir, assim como o código exclusivo dos caminhos antigos sem consumidores válidos.
- Fontes antigas, recebimentos e previsões existentes são preservados na transição; as rotinas e o painel não geram ou contam a mesma ocorrência duas vezes.
- Contratos, faturamento, retenções, comissões e permissões mantêm suas regras próprias e a separação por conta e pessoa.
- A forma de pagamento é exibida como Pix, com o identificador interno e os pagamentos preservados.
- Testes e builds relevantes passam; conferência visual é feita quando disponível, com limitações reais registradas. Esta task, por si, não altera código, banco ou produção.

## Perguntas Para o Planejamento

- Como reutilizar os componentes atuais para os controles na linha de cada opção, eliminando os caminhos externos e respeitando navegação por teclado, limites de parcelas e confirmações de redução existentes?
- Quais transições de cobrança precisam ser habilitadas em despesas já pagas e em séries existentes, e como preservar pagamentos, valores e parcelas já vinculadas? Detalhar sem reduzir silenciosamente a demanda a um desbloqueio visual.
- Como representar a receita atual quando ainda não houve recebimento, mantendo a separação entre previsão e entrada efetiva e o salvamento pelo botão final já existente?
- Como compatibilizar as fixas antigas vinculadas à subcategoria e as réplicas manuais existentes com a origem por lançamento, sem perder IDs, competências ou histórico e sem duplicar projeções?
- Como permitir editar o limite de uma receita fixa pelo fluxo habitual, preservando ocorrências recebidas, canceladas e históricas?
- Como integrar ao lote as previsões originadas por contratos e as receitas faturadas, preservando os campos e efeitos financeiros que pertencem ao contrato?
- Quais consumidores de renovação, rotina diária, demonstração e painel continuam necessários e quais são exclusivos do modelo substituído?
- Qual alteração mínima de schema é necessária e qual ordem de publicação permite compatibilidade entre código antigo e novo? Autorizações de migrations anteriores não cobrem essa nova alteração.

## Instruções Para /planejar

- Usar esta task como especificação de entrada e a revisão mais recente da conversa como referência para as decisões já consolidadas.
- Ler `AGENT.md` e `CLAUDE.md`; inspecionar os arquivos citados antes de propor alterações.
- Priorizar o reaproveitamento do menu, componentes, lote e botão final. Manter Parcelado e Fixa com seus controles na mesma linha da opção dentro do menu, conforme a posição explicitamente pedida pelo usuário.
- Detalhar a preservação de dados e a limpeza real dos fluxos substituídos, incluindo os consumidores de rotinas e painel. Não tratar ocultação visual como remoção do caminho antigo.
- Resolver as questões financeiras e de migração ainda abertas antes de implementar; distinguir decisões já aprovadas de recomendações técnicas novas.
- Gerar plano em `.plans/` após aprovação, seguindo a skill de planejamento.
- Não implementar código durante o planejamento, executar migrations, alterar `.env`, fazer commit ou publicar.
- Não assumir staging ou PR; produção no Render exige confirmação explícita.
