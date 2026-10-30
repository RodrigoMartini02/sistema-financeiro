# Plano: Despesas fixas com previsão anual e confirmação no modal

## Origem

- Task: [despesas fixas com previsão anual e confirmação no modal](tasks/despesas-fixas-previsao-anual-confirmacao-modal.md).
- Demanda e análise: 30/10/2026.
- Classificação: **fullstack + database**.
- Plano preliminar apresentado ao usuário; salvamento aprovado com a resposta **"salvar"**.
- Esta aprovação autoriza registrar o plano. A implementação seguirá `/implementar`; execução de migrations e envio para produção exigem as confirmações específicas do projeto.

## Resumo

Criar o cadastro de despesas fixas mensais com valor ajustável em cada mês. Uma fixa gera previsões do mês inicial até dezembro. Essas ocorrências ficam na tabela de despesas com status persistido `prevista`, exibido como **"Previsão"**, e participam da projeção do painel.

Dentro de **"Nova despesa"**, o usuário aciona **"Despesas fixas"** para carregar as pendências como linhas editáveis. As linhas começam desmarcadas; **"Confirmar selecionadas"** atualiza somente as ocorrências escolhidas, no mesmo registro, sem duplicar a despesa. As demais continuam previstas.

A fixa representa frequência mensal; o valor pode variar. Confirmar uma conta e pagar essa conta são ações diferentes. Não transformar previsão em confirmação ou pagamento pela passagem de uma data.

### Regras de produto aprovadas no plano preliminar

1. **Cobrança ganha "Fixa"**, disponível nas formas de pagamento já permitidas. A recorrência atual do cartão continua com suas regras próprias.
2. **"Salvar despesa fixa"** cria configuração e previsões até dezembro, incluindo o primeiro mês como previsão. Não confirma ou paga a primeira ocorrência implicitamente.
3. Uma despesa única comum já lançada pode originar uma fixa: preservar e vincular o registro atual, gerando apenas os meses seguintes até dezembro.
4. O botão **"Despesas fixas"** carrega linhas apenas por iniciativa do usuário. Não apresentar automaticamente todas as pendências a cada abertura do modal.
5. **"Pendências de: mês/ano"** define explicitamente o período consultado. Inicializar pelo mês de Movimentações; pelo calendário, pelo mês da data clicada; por atalho global sem período, pelo mês atual.
6. Não há bloqueio por data para consultar ou confirmar uma previsão. A ausência do boleto não exige ação: basta deixá-la pendente.
7. Alterar uma ocorrência modifica somente aquele mês. Atualizar previsões futuras exige escolha explícita de alcance.
8. Cancelar uma ocorrência preserva a identidade mensal para não recriá-la. Desativar a fixa cancela somente previsões futuras, preservando confirmadas, pagas e o histórico.
9. Renovação para o próximo ano será **manual**, pelo cadastro, nesta primeira versão. Sem novo cron, renovação automática ou notificações novas.
10. A tabela e o calendário identificam a previsão. O painel apresenta projeção separada dos indicadores atuais de saldo.

## Escopo

### Dentro do escopo

- Cadastrar, editar, desativar e renovar manualmente a configuração de fixa no fluxo do modal existente.
- Gerar e persistir ocorrências mensais previstas até dezembro, com prevenção de duplicidade.
- Apresentar, editar e confirmar seletivamente previsões no modal e pela edição da ocorrência existente.
- Preservar rascunhos de novas despesas comuns quando as fixas forem abertas ou confirmadas.
- Identificar previsão e origem fixa em tabela, filtros e calendário.
- Apresentar valores previstos/agendados e total projetado no painel, usando o período e os filtros existentes.
- Tratar datas, confirmação, pagamento, cancelamento, exclusão e movimentação de mês dessas novas ocorrências.
- Manter isolamento por conta e pessoa, permissões, categoria e uso autorizado de cartão.
- Adaptar a demonstração e os testes relevantes.

### Fora do escopo

- Pagamento bancário, emissão/leitura automática de boletos ou integração bancária.
- Abrir pendências ou cobrar confirmação automaticamente a cada visita ao modal.
- Novo cron, notificações novas ou renovação automática para o ano seguinte.
- Conversão em massa de despesas antigas.
- Converter parcelamentos, recorrências existentes ou linhas de renegociação em outra série fixa nesta primeira versão.
- Refazer todo o painel, relatórios ou orçamento; corrigir globalmente diferenças legadas entre resultado e saldo.
- Implementar a branch antiga de pagamento individual de despesas do cartão.
- Relatório detalhado de variação entre estimado e confirmado. A estimativa pode ser preservada para rastreabilidade sem criar esse relatório nesta entrega.
- Alterar `.env`, dependências, runtime, infraestrutura ou fluxo de publicação.

## Leitura de Contexto

- `AGENT.md`, `CLAUDE.md` e a task de origem.
- Modal, estado de rascunhos, lote, atalhos de teclado e abertura por Movimentações, calendário e atalho global.
- Criação, edição, pagamento, séries, cancelamento, exclusão, movimentação de despesas e regras de fatura.
- Schema de despesas, receitas fixas e renovação, migrations existentes e script de controle de migrations.
- Regras de contagem, saldo, painel, relatórios, orçamento, alertas, preferências de histórico e assistente.
- Helpers de acesso à conta, visibilidade da família, autorização de escrita e cartão compartilhado.
- Demonstração, scripts de build/teste e proteção dos testes financeiros de banco.

### Achados que condicionam a implementação

- `ExpenseDialog.saveNew` salva todos os itens do lote e a entrada preenchida. Carregar previsões nesse lote sem distinguir origem e seleção confirmaria contas indevidamente.
- A abertura global do modal hoje não recebe o mês selecionado em Movimentações. O calendário passa `presetDate`, que também trava a data da compra da entrada; esses contextos não devem sobrescrever as datas das previsões.
- `recorrente=true` ativa restrição ao crédito, atualização de série, regra temporal de contagem e renovação própria. Não reutilizar esse indicador para as novas fixas.
- A criação comum fora do crédito pode marcar uma despesa como paga pela data. O fluxo de previsão/confirmação precisa desabilitar essa inferência.
- `expenseBaseConditions` filtra `ativa`; vários consumidores financeiros já ficam protegidos de um estado próprio `prevista`.
- O helper frontend `isCountedExpense` hoje não verifica o status. Sem adaptação, uma nova previsão não recorrente entraria nas somas de Movimentações.
- As apresentações de status de despesas estão em mais de um componente. Previsão deve ter prioridade sobre atraso e agendamento.
- A aba "Planejamento" de Movimentações é `BudgetPanel`, não uma segunda tabela de previsões.
- O saldo do painel e o saldo atual de Movimentações possuem critérios legados diferentes. Esta demanda não autoriza uma mudança global desses critérios.

## Impacto por Área

### Frontend

#### Cadastro da fixa

- Acrescentar **"Fixa"** às opções de Cobrança, mantendo "Não repete", "Parcelado" e a recorrência existente.
- Reutilizar os campos de descrição, categoria, valor, forma/cartão e datas; indicar que o valor informado é a referência para as previsões mensais.
- Exibir mês inicial e resumo do período gerado, por exemplo: "Gera previsões de novembro a dezembro. Confirme o valor de cada conta quando recebê-la".
- Usar ação específica **"Salvar despesa fixa"**. Campos de pagamento realizado não se aplicam ao cadastro de previsões.
- Manter o cadastro da fonte e o lançamento comum como intenções distintas, preservando rascunhos já existentes no modal.
- Na conversão de uma despesa única, informar que o registro atual será mantido e que serão previstas as próximas competências.
- Permitir editar a configuração a partir do contexto da fixa. Mostrar o alcance antes de atualizar previsões futuras ou desativar a fonte.

#### Pendências no modal

- Botão discreto **"Despesas fixas"** na faixa superior, junto de "Lançando em", com contagem quando disponível sem interromper a entrada comum.
- Consulta/carregamento das linhas somente após o clique. Reutilizar a grade e o espaço rolável do modal.
- Seletor **"Pendências de: mês/ano"**, independente da compra e do vencimento dos rascunhos comuns.
- Linhas previstas começam desmarcadas e mantêm a identidade da ocorrência. Carregar, refazer consulta ou trocar mês não duplica linhas.
- Guardar origem, identificador, competência, seleção e alterações de cada linha. Preservar ajustes ao alternar o mês durante a mesma abertura.
- Ação própria **"Confirmar N selecionadas"**: validar e enviar apenas as previsões escolhidas, sem obrigar o envio de uma entrada comum incompleta.
- O lote de novas despesas mantém seu comportamento. Suas linhas não são transformadas em previsões, removidas ou confirmadas pela ação das fixas.
- Contagem, soma e texto da ação devem refletir somente o conjunto selecionado para confirmar; distinguir previsões disponíveis das escolhidas.
- Em sucesso parcial, remover somente as confirmadas. Manter dados, seleção e erros das não concluídas.
- Enter e checkbox não podem confirmar linhas desmarcadas ou disparar o salvamento geral por engano.
- Categoria, forma e cartão salvos da ocorrência não devem ser substituídos automaticamente pelas sugestões do histórico.
- Ao trocar de conta, impedir o envio de rascunhos carregados da conta anterior.

#### Tabela, filtros e calendário

- Transportar `prevista` e os vínculos da fixa no contrato da API e nos tipos frontend.
- Mostrar status **"Previsão"** e origem **"Fixa"**; a confirmação passa a usar a apresentação normal de em aberto/paga.
- Previsão com data passada continua prevista; não classificá-la como dívida atrasada confirmada.
- Acrescentar filtro de previsão e impedir seleção dessas linhas para pagamento comum em lote.
- Abrir uma previsão para edição não deve confirmá-la silenciosamente. Expor ação explícita de confirmação quando aplicável.
- A mesma despesa confirmada deixa as pendências do modal, mantendo seu identificador e vínculo mensal.
- Invalidar consultas de pendências, despesas, painel e demais leituras financeiras afetadas, com chaves isoladas por conta e período.

### Backend

#### Configuração e geração

- Separar configuração da fixa e ocorrência financeira. A fonte pertence à conta e ao autor, não ao titular do catálogo.
- Cadastro novo grava fonte e previsões em uma transação. Todas nascem `prevista`, `paid=false`, sem copiar pagamento, comprovantes ou nota para outros meses.
- Usar competência mensal estável para identificar cada ocorrência. O período inicial e as datas devem ficar explícitos; a consulta financeira continuará usando o critério de caixa existente.
- Gerar datas com as funções de calendário/fatura já usadas pelo projeto, limitando dia 31 ao último dia dos meses curtos. Compra e vencimento de crédito devem seguir as regras do cartão e ser testados nas mudanças de mês.
- Não derivar confirmação ou pagamento de vencimento, dia da compra ou chegada da competência.
- Gerar o ano no cadastro, na manutenção explicitamente escolhida e na renovação manual. Não introduzir rotina que recrie automaticamente ocorrências retiradas.
- Converter somente despesa única comum autorizada: travar o registro, preservar autor, conta, valores, status e pagamento, vincular aquela competência e gerar apenas as seguintes.

#### APIs propostas

Os caminhos abaixo são novos, não endpoints já existentes. Confirmar a composição final ao implementar, mantendo os contratos em inglês e as rotas estáticas antes das genéricas.

- Recursos de configuração sob `/api/expenses/fixed`: listar, criar, editar, desativar e gerar explicitamente o próximo ano.
- Listagem de ocorrências pendentes por conta e mês, no mesmo contexto de autorização.
- `POST /api/expenses/:id/confirm`: confirmar uma previsão existente, no mesmo ID.
- `PUT /api/expenses/:id` continua edição; se o registro for previsão, alterar seus dados não equivale a confirmar.
- Reutilizar as validações de categoria e cartão existentes, extraindo helper compartilhado se necessário, sem duplicar regras entre routers.

#### Confirmação e concorrência

- Revalidar acesso à conta, permissão sobre o autor, categoria, cartão e estado da ocorrência.
- Fazer a transição `prevista -> ativa` e atualizar os dados daquele mês numa transação, com trava e condição de estado.
- Repetição ou concorrência não cria segunda linha nem sobrescreve silenciosamente outra confirmação. Uma ocorrência já confirmada deve devolver resultado inequívoco para a interface atualizar a lista; conflito de dados precisa ser apresentado.
- Cada linha selecionada pode ser confirmada em sua transação, com progresso e falhas individuais, sem desfazer outras confirmações concluídas.
- Usar pagamento explícito, com a inferência automática desabilitada. Confirmar sem pagamento mantém a conta em aberto.
- No crédito, respeitar o pagamento pela fatura e a ordem de locks do serviço de faturas, que trava cartão antes das linhas. Testar confirmação simultânea ao pagamento da fatura.
- O endpoint de pagamento comum deve recusar previsão também no backend, mesmo que a interface esconda o botão.

#### Edição, retirada e renovação

- Ajustar somente a ocorrência por padrão. Editar a fonte permite atualizar apenas previsões futuras ainda pendentes, com alcance explícito e sem tocar confirmadas/pagas.
- Preservar a estimativa de referência para rastrear a confirmação, sem introduzir relatório novo de variações nesta entrega.
- Cancelar/remover uma ocorrência fixa conserva o registro cancelado e a competência, evitando liberar a chave mensal e recriar o mês retirado.
- Desativar fonte mantém histórico e cancela apenas previsões futuras. Não apagar fisicamente a fonte nem usar exclusão de grupo parcelado.
- Mover vencimento preserva a competência da ocorrência. Mover uma ocorrência de novembro para dezembro não a transforma na ocorrência própria de dezembro.
- Renovação manual gera o ano solicitado com unicidade por competência, sem restaurar cancelamentos ou alterar confirmações anteriores.

### Banco de Dados

#### Modelo proposto

- Nova tabela `despesas_fixas`: conta, autor, descrição, categoria, valor de referência, forma/cartão, datas de referência, mês inicial, ano registrado, situação ativa/inativa e timestamps.
- Em `despesas`, adicionar vínculos anuláveis com a fonte e a competência, e valor estimado quando necessário para rastreabilidade. Identificadores de código novos em inglês, por exemplo `fixedExpenseId`, `fixedCompetence` e `estimatedAmount`; nomes de colunas seguem o padrão português do banco.
- Adotar `prevista` como estado persistido adicional; `ativa` continua representando a despesa confirmada e `pago` continua indicando pagamento.
- Índice único por fixa e competência, incluindo canceladas. Validar conta e autor correspondentes no servidor e avaliar constraints compatíveis com os registros legados.
- A competência é a identidade mensal original. Não recalculá-la ao alterar vencimento ou data do pagamento.
- Não reutilizar `grupo_parcelamento_id` ou `recorrente` para essas novas fontes.

#### Migration

- Preparar migration nova e aditiva: criar estrutura e colunas/índices necessários, sem converter ou alterar em massa despesas antigas.
- Campos novos anuláveis preservam linhas legadas; valores e significados atuais continuam válidos.
- Reconfirmar numeração disponível na implementação. A última migration observada no planejamento foi `0088_licitacoes_edital_sem_payload.sql`.
- Inspecionar o ambiente e a situação real das migrations antes de aplicar. Não executar a migration automaticamente durante planejamento ou apenas porque o código foi implementado.
- Executar somente após autorização específica, primeiro em banco local verificado. Produção segue o controle de migrations do projeto e confirmação explícita.

### Infra/Deploy

- Sem serviço, cron, dependência ou infraestrutura nova.
- Sem alteração de `.env`, credenciais ou versões de runtime.
- Planejar publicação compatível com a migration aditiva, após validação local e revisão. Produção no Render somente com confirmação explícita em `/finalizar`.
- Sem PR, staging ou exigência de branch como etapa deste plano.

## Arquivos Provavelmente Afetados

Arquivos existentes inspecionados no planejamento; a lista pode ser reduzida conforme a integração. Novos módulos de fonte, agenda, validação, interface e testes serão criados nos diretórios correspondentes, sem presumir que já existem.

### Modal e abertura

- `src/screens/finance/expense-dialog/ExpenseDialog.tsx`
- `src/screens/finance/expense-dialog/ExpenseRow.tsx`
- `src/screens/finance/expense-dialog/BillingPopover.tsx`
- `src/screens/finance/expense-dialog/draftState.ts`
- `src/screens/finance/expense-dialog/draftRules.ts`
- `src/screens/finance/entry-dialog/batchState.ts`
- `src/screens/finance/entry-dialog/EntryDialogFrame.tsx`
- `src/context/AppContext.tsx`
- `src/App.tsx`
- `src/demoMain.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/calendar/CalendarView.tsx`

### Exibição, contratos e demonstração

- `src/screens/finance/LancamentosTable.tsx`
- `src/screens/finance/entryTable.tsx`
- `src/screens/finance/useEntryFilters.ts`
- `src/screens/despesas/expenseStatus.tsx`
- `src/screens/finance/calendar/calendarStatus.ts`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/services/queryKeys.ts`
- `src/utils/expenseFilters.ts`
- `src/utils/expenseCounting.ts`
- `src/services/demo/demoFakeDatabase.ts`
- `src/services/demo/fakeApiResolver.ts`

### Backend e painel

- `backend/src/server.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/db/schema/expenses.ts`
- `backend/src/db/schema/index.ts`
- `backend/src/services/expenseService.ts`
- `backend/src/services/expenseInput.ts`
- `backend/src/services/expensePayment.ts`
- `backend/src/services/expenseCounting.ts`
- `backend/src/services/entryQueries.ts`
- `backend/src/services/cardInvoiceService.ts`
- `backend/src/services/overdueExpenses.ts`
- `backend/src/services/categoryAI.ts`
- `backend/src/services/painelService.ts`
- `backend/src/services/painelCalculos.ts`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/painel/CardsResumo.tsx`
- `src/screens/finance/painel/ReceitaDespesa.tsx`

Referências de padrões: `backend/src/services/fixedIncomes.ts`, `backend/src/services/fixedIncomeSchedule.ts`, `src/screens/finance/SeriesRenewalModal.tsx`, `backend/src/services/financeDbTestSupport.ts` e `backend/scripts/migrations.ts`. A renovação nova será manual; ler o modal existente não obriga a incluir suas notificações ou abertura automática.

## Estratégia de Implementação

1. **Contratos e persistência:** definir estados, vínculos, geração de agenda e migration aditiva; validar regras puras de datas e identidade mensal.
2. **API e segurança:** implementar configuração, geração, conversão e confirmação transacional; proteger pagamento, edição, cancelamento, exclusão e movimentação de previsões.
3. **Modal:** integrar opção Fixa, contexto do mês, acesso manual, seleção e ação próprias; preservar rascunhos e tratar repetição, falha parcial e teclado.
4. **Tabela e painel:** propagar estado/vínculos, adaptar filtros/status/calendário e acrescentar projeção consistente; preservar os totais financeiros existentes.
5. **Demonstração e validação:** espelhar o fluxo na demo, executar testes pertinentes e builds, verificar regressões financeiras e conferir interface em desktop/celular e temas claro/escuro.

### Regras de cálculo da projeção

- Não relaxar globalmente `expenseBaseConditions`: seus consumidores devem continuar usando despesas confirmadas conforme as regras atuais.
- Criar consulta/cálculo explícitos para a projeção, com o mesmo período e filtros de conta, pessoas/pagador, categoria, cartão e forma.
- Usar caixa consistentemente: previsão ou confirmada em aberto pelo vencimento; paga pela data do pagamento. Aplicar os helpers existentes de valor efetivo e tratamento de fatura/renegociação.
- A competência identifica a ocorrência; não é uma segunda fonte de soma. Ao pagar ou mover a conta para outro mês, não manter uma previsão duplicada no mês original.
- Discriminar conjuntos sem sobreposição: despesas ativas já contadas pelas regras atuais; recorrências legadas ainda agendadas; novas previsões pendentes. O total projetado considera cada registro uma vez.
- Apresentar as previsões/agendamentos no novo bloco do painel. Preservar o cálculo e os rótulos dos indicadores atuais; não chamar a projeção de saldo realizado.
- Uma fixa confirmada deve continuar classificada como fixa pelo vínculo próprio, mesmo com `recorrente=false`.
- Opções de filtro e estado vazio precisam considerar meses com apenas previsões.
- Previsões não consomem orçamento como gasto, não ocupam limite nem entram em fatura antes de confirmar. Permanecem fora de pagamento comum em lote, alertas de vencidas e consultas de despesas efetivas do assistente/relatórios.
- Excluir previsões de contagens de histórico que possam distorcer sugestões por frequência, como `categoryAI.updatePopularCategories`.
- A demonstração deve espelhar essas regras; filtros genéricos "diferente de cancelada" não podem incluir previsões em gasto realizado.

## Segurança, Dados e Multi-Tenant

- Novas rotas herdam autenticação, plano ativo e `requireScreenAccess('accessExpenses')`, como despesas existentes.
- Resolver conta ativa e vínculo autorizado no servidor. Não confiar em autor/conta enviados livremente pelo cliente.
- A configuração pertence ao autor da despesa. Categorias seguem o catálogo da conta e cartão segue carteira própria/compartilhada autorizada.
- Reutilizar `resolveOwnerForWrite`, `resolveVisibleUserIds`, `resolveVisibleCardOwnerIds`, `canEditOthersEntries`, `canWriteToAccount`, `resolveFinancialAccount` e as validações existentes de categoria/cartão conforme cada operação.
- Filtrar consultas novas explicitamente por conta e autores/pagadores autorizados, usando Drizzle. Revalidar vínculos ao confirmar, inclusive para categoria ou cartão desativado/revogado após a geração.
- Validar que ocorrência, fonte, conta e autor correspondem. Não aceitar reatribuição de competência ou fonte como edição livre de um lançamento.
- Bloquear escrita de outra pessoa sem permissão e não revelar existência de registros de conta alheia pelas mensagens de erro.
- Usar transações e locks consistentes com fatura, cancelamento e edição da fonte. Tratar conflitos sem sobrescrever mudanças de outra sessão.
- A busca em código/migrations não encontrou políticas RLS para as tabelas financeiras, e o banco real não foi consultado. Não afirmar cobertura por RLS existente. Avaliar a política aplicável à tabela nova sem ativar RLS incompatível com o contexto de conexão atual; autorização da aplicação é obrigatória.
- Nunca alterar `.env`, executar migrations, seeds, resets ou escrita em produção por inferência desta aprovação de salvamento.

## Validações Necessárias

- Compilação frontend e verificação TypeScript do backend.
- Testes normais do frontend e backend após a implementação.
- Testes financeiros de banco apenas com `FINANCE_DB_TESTS` em banco local verificado antes de importar módulos que abrem conexão; seguir `financeDbTestSupport`.
- Aplicar a nova migration em local somente após autorização específica e verificar compatibilidade das linhas antigas.
- Conferir fluxo comum, parcelas, recorrentes do cartão, fatura, saldo, relatório, orçamento, alertas e demo nas áreas afetadas.
- Validar período de caixa e filtros do painel com previsão, confirmação e pagamento em meses distintos.
- Conferir desktop/celular, claro/escuro, teclado, rolagem da grade e preservação de rascunhos.

## Testes Recomendados

1. **Geração:** cadastro novembro-dezembro produz duas previsões, incluindo primeiro mês; conta/autor corretos, valor positivo, dia 31, fevereiro e virada do ano.
2. **Conversão:** despesa única existente mantém ID, valores, conta, autor e pagamento; gera somente competências seguintes. Recusar séries e linhas de renegociação nessa conversão inicial.
3. **Seleção:** carregar três previsões, confirmar uma e manter duas pendentes; rascunho comum incompleto não bloqueia a confirmação das escolhidas.
4. **Repetição na interface:** clique repetido, refetch, troca de mês e falha parcial não duplicam linhas ou perdem ajustes. Enter/checkbox não salvam desmarcadas.
5. **Concorrência:** duas confirmações, repetição do pedido, confirmação versus cancelamento/edição e pagamento de fatura produzem resultado inequívoco, sem duplicar nem sobrescrever silenciosamente.
6. **Pagamento:** previsão vencida não vira paga ou confirmada; confirmação sem pagamento mantém em aberto. Pagamento explícito é respeitado; crédito continua pela fatura.
7. **Projeção:** três previsões de R$ 100 resultam em R$ 300 projetados. Confirmar uma por R$ 120 resulta em R$ 320, com R$ 120 confirmados e R$ 200 ainda previstos, sem segunda linha.
8. **Período:** mover vencimento ou pagar em mês seguinte mantém identidade, ajusta o período de caixa e não deixa a mesma ocorrência contada nos dois meses.
9. **Retirada e renovação:** cancelamento, remoção, desativação e nova geração/renovação não ressuscitam mês retirado nem modificam confirmadas/pagas.
10. **Isolamento:** conta alheia, membro sem acesso, edição de terceiro sem permissão, cartão compartilhado/revogado e categoria indisponível.
11. **Contagens:** mês só com previsões, filtros de categoria/cartão/forma/pessoas/todas as contas e recorrentes legadas agendadas sem dupla soma.
12. **Regressão financeira:** previsão fora de limite, fatura, alertas, vencidas, pagamento comum em lote, relatório realizado e orçamento consumido; fixa confirmada continua em Contas fixas.
13. **Demonstração e interface:** cadastro, previsão, confirmação parcial e projeção equivalentes ao fluxo real; estados vazios, erro e carregamento utilizáveis em celular e desktop.

Comandos existentes relevantes: `npm test`, `npm run build`, `npm --prefix backend test` e `npm --prefix backend run build`. O script `test:finance-db` só deve ser executado após verificar o destino e preparar o schema local com autorização. Não atualizar dependências ou runtime para executar esta demanda.

## Riscos e Pontos de Atenção

- Misturar previsões com o lote atual salva mais contas do que o usuário escolheu; origem e seleção precisam existir no estado e nos payloads.
- Tratar `prevista` apenas como texto visual inclui estimativas em pagamentos/somas. O estado deve persistir e os consumidores precisam ser auditados.
- Reutilizar `recorrente` muda crédito, edição em série e contagem temporal indevidamente.
- Usar a criação comum na confirmação aplica pagamento automático por data; usar a transição dedicada com pagamento explícito.
- Exclusão física de ocorrência libera a unicidade mensal e pode permitir recriação; preservar cancelamento e vínculo para essas novas linhas.
- Misturar competência da fixa com caixa nos totais duplica ou desloca projeções incorretamente. Usar o mesmo critério em todas as partes do novo total.
- A fonte não autoriza usar categoria/cartão depois de perder acesso. Revalidar na confirmação e apresentar correção possível no modal.
- Uma mudança no schema da aplicação sem aplicar a migration aditiva pode quebrar rotas. A publicação precisa respeitar a sequência de banco/código validada no projeto.
- Alterações compartilhadas no frame do modal, filtros e helpers de despesas precisam de regressão nos fluxos de receitas e despesas existentes.

## Perguntas em Aberto

- As decisões de produto do plano preliminar foram apresentadas antes do pedido de salvamento: primeiro mês previsto, acesso manual, seletor de mês, edição isolada por padrão, atualização futura explícita e renovação manual.
- Não há pergunta de produto bloqueante para iniciar `/implementar` dentro desse escopo. Nomes finais dos novos módulos/endpoints e composição visual devem seguir os padrões inspecionados, preservando os comportamentos descritos.
- Se a implementação revelar necessidade de mudar o comportamento aprovado, ampliar escopo ou alterar dados legados, apresentar o caso ao usuário antes dessa mudança.
- Execução de migrations e publicação permanecem decisões específicas posteriores; não estão autorizadas pela gravação deste documento.

## Critérios de Aceite

- Fixa cadastrada uma vez gera previsões mensais até dezembro com valor individual ajustável.
- Previsões são visíveis na tabela do mês correspondente e na projeção do painel.
- Nada é confirmado ou pago somente pela data; o primeiro mês também começa previsto no cadastro novo.
- O modal abre normalmente; fixas são carregadas por clique e começam desmarcadas.
- Usuário pode confirmar apenas as escolhidas, mantendo as demais e os rascunhos comuns.
- A confirmação atualiza a ocorrência original e a retira das pendências, sem duplicar registro ou soma.
- Meses passados, confirmadas e pagas são preservados ao alterar uma ocorrência ou manter a fonte.
- Previsões permanecem fora de saldo realizado, limite/fatura, pagamento comum em lote e cobrança de vencidas.
- Fonte e ocorrências respeitam conta, autor/pagador, permissões e vínculos válidos.
- Desativação, cancelamento e renovação manual conservam histórico e unicidade mensal.
- Interface, demonstração, builds e testes pertinentes passam, com evidência dos cenários financeiros e de concorrência em local verificado.

## Instruções Para /implementar

- Usar este plano e a task vinculada como especificação, respeitando `AGENT.md` e `CLAUDE.md`.
- Reconfirmar o estado atual do repositório e dos arquivos antes de alterar código.
- Implementar as etapas na ordem descrita, com módulos pequenos e identificadores novos em inglês; manter textos da interface em português.
- Preservar a diferença entre configuração, previsão, confirmação e pagamento em tipos, APIs, interface e cálculos.
- Não criar confirmações automáticas, avisos repetitivos, nova rotina de cron ou conversão em massa de despesas antigas.
- Preparar a migration aditiva, mas não executá-la sem autorização específica e ambiente verificado. Não alterar `.env`.
- Registrar validações realizadas, falhas e limitações reais; não usar build ou testes locais como prova de funcionamento em produção.
- Não fazer commit, push, PR, staging ou deploy durante `/implementar`. Seguir `/finalizar` quando solicitado, com confirmação para qualquer envio à produção.
