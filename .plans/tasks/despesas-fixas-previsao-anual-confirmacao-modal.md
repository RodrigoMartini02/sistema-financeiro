# Task: Despesas fixas com previsão anual e confirmação no modal

## Contexto

Demanda discutida com o usuário em 30/10/2026. Aluguel, condomínio e energia elétrica são compromissos mensais cujo valor pode aumentar ou diminuir de um mês para outro. Nesta demanda, "fixa" descreve a frequência mensal, e não um valor imutável.

O pedido começou com o nome "despesas favoritas" e evoluiu para despesas fixas que geram previsões até dezembro. O usuário quer conhecer seus compromissos futuros e confirmar cada conta quando souber o valor do boleto.

O modal existente "Nova despesa" já tem lançamento em linhas, sugestões pelo histórico e gravação de vários itens. A recorrência atual é restrita ao cartão de crédito e gera ocorrências até dezembro com o mesmo valor inicial. O painel classifica como fixas as despesas marcadas com essa recorrência. Esses comportamentos precisam ser considerados durante o planejamento.

O usuário esclareceu que as contas devem ser acessadas dentro do modal de lançamento, por iniciativa dele. Não quer que todas apareçam automaticamente toda vez que abrir o modal, nem ser obrigado a confirmar valores antes de receber o boleto.

## Problema

O sistema ainda não oferece um fluxo que reúna previsão anual de despesas mensais com valores ajustáveis, acesso discreto às pendências dentro do modal e confirmação seletiva sem duplicar lançamentos.

Usar apenas o histórico facilita preencher campos, mas não organiza as previsões por mês. Usar a recorrência existente sem analisar suas regras pode misturar estimativas com despesas confirmadas, restringir indevidamente as formas de pagamento ou considerar uma conta paga apenas pela data.

## Objetivo

Cadastrar uma despesa fixa uma vez, apresentar suas previsões mensais até dezembro na tabela e no painel e permitir confirmar somente as contas escolhidas dentro do modal "Nova despesa", ajustando os dados daquele mês e preservando as demais previsões e o histórico.

## Escopo

### Dentro do escopo

- Cadastro e edição de despesas fixas no modal de lançamento, com descrição, categoria, valor de referência, forma de pagamento, cartão quando aplicável, datas necessárias e mês inicial. A apresentação exata dos campos será definida no planejamento.
- Geração das previsões mensais do período inicial escolhido até dezembro, com valor ajustável em cada ocorrência.
- Apresentação das previsões na tabela de despesas, no mês correspondente, com o texto de status **"Previsão"**.
- Apresentação dos valores previstos no painel, distinguindo previsão, despesa confirmada e pagamento realizado.
- Acesso voluntário por um botão discreto **"Despesas fixas"** no modal "Nova despesa". A posição discutida foi na faixa superior, junto de "Lançando em"; a composição visual será verificada no planejamento.
- Ao acionar esse botão, apresentar as previsões pendentes do mês como linhas editáveis dentro do próprio modal, no formato dos lançamentos existentes.
- Permitir ajustar valor, vencimento e os demais campos pertinentes e escolher quais linhas confirmar. A simples inclusão na lista do modal não autoriza salvar todas.
- Manter como previsões as linhas não escolhidas, inclusive quando o usuário ainda não recebeu os boletos.
- Confirmar uma ocorrência atualiza a previsão daquele mês, em vez de criar uma segunda despesa. A ocorrência confirmada deixa as pendências de confirmação daquele mês.
- Manter a distinção entre confirmar a despesa e registrar seu pagamento. Previsão ou passagem de data não representa pagamento.
- Preservar os valores dos meses anteriores e das outras ocorrências ao ajustar somente um mês.
- Respeitar as formas de pagamento já permitidas no sistema. A nova funcionalidade não se limita ao cartão de crédito.
- Preservar o funcionamento dos lançamentos comuns, parcelas, recorrências do cartão e das faturas existentes.

### Fora do escopo inicial

- Pagamento bancário automático, emissão ou recebimento automático de boletos e integração bancária.
- Abrir automaticamente as pendências sempre que o usuário entrar no modal.
- Obrigar a confirmar uma conta apenas porque chegou uma data, sem que o usuário conheça o valor.
- Transformar despesas antigas em fixas em massa ou alterar lançamentos existentes sem vínculo explícito.
- Refazer todo o painel, as tabelas ou o modal de lançamento.
- Implementar as melhorias antigas de pagamento individual de despesa do cartão encontradas em outra branch.
- Aplicar migrations, alterar ambientes ou publicar em produção durante a criação desta task ou durante o planejamento.

## Impacto Previsto

### Frontend

- Modal "Nova despesa": configuração de fixa, acesso às pendências e confirmação seletiva em linhas.
- Tabela e filtros: identificação e apresentação das previsões no mês correspondente.
- Painel: valores previstos identificados e totais coerentes com a confirmação e o pagamento.
- Manter o formulário utilizável para despesas comuns mesmo sem abrir as fixas; considerar desktop, celular e temas claro e escuro.

### Backend

- Cadastro e manutenção das despesas fixas, previsões mensais e confirmação das ocorrências.
- Validações de dados, conta, permissões e vínculos com categoria e cartão.
- Tratamento de repetição de requisições e confirmações concorrentes sem duplicar a ocorrência do mês.
- Consultas financeiras coerentes entre tabela, painel, saldo, faturas e demais consumidores. O planejamento deverá identificar quais precisam incluir estimativas e quais devem considerar somente despesas confirmadas ou pagas.

### Banco de Dados

- Há impacto previsto para persistir a configuração da fixa, os vínculos mensais e a distinção entre previsão e confirmação. O desenho das tabelas, colunas, índices e estados será decidido no planejamento.
- Hoje a tabela de despesas descreve os estados `ativa` e `cancelada`; não presumir que adicionar um texto de status na interface seja suficiente.
- Prever proteção contra duplicidade por fixa e mês, mantendo o isolamento por conta e pessoa.
- Avaliar RLS conforme as regras e o modelo efetivamente usados no projeto.
- Qualquer migration ou aplicação de schema exige confirmação explícita e verificação do ambiente de destino.

### Infra/Deploy

- Sem necessidade de novo serviço ou mudança de infraestrutura identificada inicialmente.
- Avaliar durante o planejamento se alguma rotina existente precisa participar da geração ou renovação; não assumir que haverá um novo cron.
- Publicação em produção no Render somente após validação e confirmação explícita. Sem PR ou staging.

## Segurança e Dados

- Derivar conta, identidade e permissões do contexto autenticado e validá-los no backend.
- Isolar configurações, previsões e confirmações por conta e pessoa, respeitando a visibilidade de membros e colaboradores.
- Validar categoria e cartão no escopo autorizado, inclusive se tiverem sido desativados após criar a previsão.
- Usar Drizzle para novas consultas e transações quando necessário.
- Preservar lançamentos confirmados, pagamentos e vínculos protegidos por fatura.
- Previsões não devem reduzir o saldo realizado ou se tornar pagas automaticamente. A criação atual possui uma regra de pagamento automático fora do crédito que precisa ser considerada explicitamente neste novo fluxo.
- Nunca executar migrations sem confirmação explícita; nunca assumir que o banco configurado é local.
- Nunca alterar `.env`, secrets ou credenciais para esta demanda sem autorização específica.

## Arquivos Provavelmente Afetados

Caminhos existentes inspecionados; a lista final e os arquivos novos serão definidos em `/planejar`.

- `src/screens/finance/expense-dialog/ExpenseDialog.tsx`
- `src/screens/finance/expense-dialog/ExpenseRow.tsx`
- `src/screens/finance/expense-dialog/BillingPopover.tsx`
- `src/screens/finance/expense-dialog/draftState.ts`
- `src/screens/finance/expense-dialog/draftRules.ts`
- `src/screens/finance/entry-dialog/batchState.ts`
- `src/screens/finance/LancamentosTable.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/despesas/expenseStatus.tsx`
- `src/services/financeService.ts`
- `src/types/finance.ts`
- `src/utils/expenseCounting.ts`
- `src/utils/expenseFilters.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/services/expenseInput.ts`
- `backend/src/services/expenseService.ts`
- `backend/src/services/expensePayment.ts`
- `backend/src/services/expenseCounting.ts`
- `backend/src/services/entryQueries.ts`
- `backend/src/services/painelService.ts`
- `backend/src/services/painelCalculos.ts`
- `backend/src/db/schema/expenses.ts`

Referências existentes para avaliar padrões, sem determinar reutilização obrigatória: `backend/src/services/fixedIncomes.ts`, `backend/src/services/fixedIncomeSchedule.ts` e `src/screens/finance/SeriesRenewalModal.tsx`.

## Critérios de Aceite

- Uma despesa fixa cadastrada para um mês inicial gera as previsões desse período até dezembro, identificadas como "Previsão" na tabela dos meses correspondentes.
- Uma previsão de aluguel de R$ 2.000 pode ser confirmada por R$ 1.900 em novembro e R$ 2.100 em dezembro, mantendo cada ocorrência e o histórico independentes.
- O painel apresenta as previsões no gasto projetado do período, com distinção clara dos valores confirmados e pagos.
- Confirmar uma previsão substitui a estimativa daquela ocorrência no cálculo aplicável, sem somar estimativa e confirmação duas vezes.
- Abrir "Nova despesa" não carrega todas as fixas como linhas automaticamente; o usuário aciona "Despesas fixas" quando quiser consultá-las.
- Acionar o botão apresenta as pendências mensais em linhas editáveis no próprio modal. Acioná-lo novamente não deve duplicar linhas ou registros.
- Com três previsões pendentes, o usuário consegue confirmar apenas uma. As outras duas continuam previstas e disponíveis para outra ocasião, sem serem gravadas como confirmadas por um salvamento geral.
- Fechar o modal, não selecionar uma previsão ou ainda não conhecer o valor do boleto preserva a previsão pendente.
- Confirmar uma conta, repetir a requisição ou confirmar simultaneamente em duas sessões não cria duas despesas para a mesma ocorrência.
- Previsões não são automaticamente pagas pela passagem da data. O saldo realizado só é reduzido pelo pagamento registrado.
- O fluxo atende despesas mensais pagas por formas já permitidas, inclusive fora do crédito, sem alterar indevidamente as regras das recorrências e faturas existentes.
- As ações respeitam autenticação, permissões e isolamento de conta e pessoa; não é possível consultar ou confirmar previsões fora do escopo autorizado.

## Perguntas Para o Planejamento

- Qual será a apresentação exata da opção "Fixa" e quais campos serão obrigatórios no cadastro? Como manter clara sua diferença em relação à recorrência atual do cartão?
- De onde vem o mês de referência do botão no modal: mês selecionado em Movimentações, data do lançamento ou um seletor próprio? Como deve funcionar quando o modal é aberto pelo calendário ou por outro atalho?
- A preocupação com a data foi discutida no contexto de evitar contas aparecendo automaticamente no modal. O acesso manual foi a solução discutida por último. Não foi aprovada uma restrição por data: é necessário algum filtro de elegibilidade, ou o acesso voluntário às pendências do mês basta?
- Como o usuário escolhe as linhas a confirmar, e como isso convive com novas despesas comuns já adicionadas ao lote?
- Como vincular uma despesa já lançada ao criar a fixa para evitar uma previsão duplicada do primeiro mês?
- Ao mudar o valor de referência, o dia ou outros dados da fixa, quais previsões futuras devem ser atualizadas e como apresentar esse alcance explicitamente?
- O valor originalmente estimado deve ser preservado para comparação com o confirmado no painel?
- Como tratar confirmação após o vencimento, confirmação antecipada, pagamento no ato e o fluxo de faturas quando a forma for crédito?
- Como definir vencimentos nos meses curtos e a relação entre mês da ocorrência, data de lançamento e vencimento?
- Como desativar uma fixa, pular uma ocorrência, cancelar, excluir ou mover uma previsão preservando o histórico e a prevenção de duplicidade?
- Como oferecer a continuidade no próximo ano? A regra de renovação não foi fechada pelo usuário.
- Em quais indicadores e gráficos as previsões devem entrar, com quais rótulos, e como manter consistência em filtros, relatórios, orçamento e limite do cartão?

## Instruções Para /planejar

- Usar esta task como especificação de entrada e preservar os comportamentos confirmados na conversa.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar os arquivos citados antes de propor alterações e mapear os consumidores de despesas e totais financeiros.
- Resolver as perguntas em aberto sem transformar sugestões anteriores sobre datas, alertas ou renovação em decisões já aprovadas.
- Apresentar o plano preliminar e seguir a skill `/planejar` para aprovação e salvamento em `.plans/`.
- Não implementar código, executar migrations, alterar `.env` ou acessar produção para escrita durante o planejamento.
- Não assumir PR, staging ou fluxo obrigatório de branch.
