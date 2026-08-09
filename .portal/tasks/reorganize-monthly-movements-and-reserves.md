# Task: Reorganizar movimentacoes mensais e reservas

## Contexto

O Sistema Financeiro possui hoje as secoes principais `Painel`, `Receitas`, `Despesas` e `Reservas` na navegacao. As telas de receitas e despesas consultam o mesmo recorte mensal do dashboard, mas cada uma repete seletor de mes, controle de fechamento e indicadores. As tabelas, contudo, possuem informacoes e acoes operacionais diferentes que devem ser preservadas.

Arquivos verificados no projeto:

- `src/layout/AppShell.tsx`
- `src/App.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/reservas/ReservaDialog.tsx`
- `src/services/reservasService.ts`
- `backend/src/routes/reserves.ts`

Receitas e despesas ja usam `useFinanceDashboard(month, year)`. Receitas possui busca, faturamento de contratos, cliente/representante, tipo de receita, comissao, anexos e confirmacao de recebimento. Despesas possui vencimento, data de compra, categoria, forma de pagamento, parcela/recorrencia, valores original/final, NF para perfil empresa, anexos, pagamento individual/em lote, mover de mes e cancelamento.

Reservas sao exibidas como saldo global e possuem configuracao/metas em cards. A movimentacao de reserva ja tem formulario com deposito ou retirada, valor, data e descricao, mas exige navegar ate a reserva e abrir a aba interna de movimentacao. O backend recebe uma data no formulario, porem atualmente grava a movimentacao no dia 15 do mes informado ou corrente. As rotas de listagem de movimentacoes de reserva nao aceitam filtro por mes e ano.

## Problema

A navegacao separa atividades que pertencem ao mesmo periodo financeiro. Para comparar entradas e saidas, a pessoa precisa alternar entre paginas distintas, enquanto os mesmos controles mensais e indicadores aparecem repetidos.

Ao mesmo tempo, unificar receitas e despesas em uma tabela hibrida reduziria colunas importantes e prejudicaria operacoes como faturar contratos, pagar em lote, mostrar NF e exibir forma de pagamento. Reservas tambem nao esta contextualizada pelo mes, apesar de aportes e retiradas acontecerem em datas especificas e serem bloqueados quando o mes esta fechado.

## Objetivo

Reorganizar a experiencia mensal sob a tela **Movimentacoes**, mantendo as tabelas e acoes atuais de receitas e despesas. Centralizar o periodo e os cards mensais padrao, permitir alternar entre as tabelas sem sair da tela e tornar o aporte ou a retirada de reserva uma operacao direta em modal, vinculada ao mes e a data selecionados.

## Decisao Tecnica Desejada

- Substituir as entradas de navegacao de alto nivel `Receitas`, `Despesas` e `Reservas` por uma entrada principal `Movimentacoes`.
- Exibir dentro de Movimentacoes uma navegacao simples entre as tabelas existentes de `Receitas` e `Despesas`; nao criar uma terceira tabela hibrida nem remodelar suas colunas.
- Exibir uma vez o seletor de mes, o estado de fechamento/reabertura e os cards mensais padrao que ja existem no painel. Nao criar uma faixa adicional de cards complementares.
- Manter os botoes `Nova receita` e `Nova despesa` lado a lado no cabecalho da tela.
- Disponibilizar a operacao diaria de reservas em modal direto, sem exigir a navegacao atual por card e aba interna. O modal deve permitir escolher a reserva, adicionar ou retirar, informar valor, data e descricao.
- Preservar a gestao existente de cadastro, meta, cor e exclusao de reservas; a localizacao final desse fluxo deve ser definida no planejamento sem criar uma nova estrutura de dados sem necessidade.

## Escopo Funcional

### Dentro do escopo

- Criar a tela/area Movimentacoes no lugar das entradas independentes de receitas, despesas e reservas na navegacao principal.
- Reutilizar o seletor de mes e o controle de fechar/reabrir mes uma unica vez na nova tela.
- Reutilizar os cards padrao de resumo mensal, evitando duplicar os cards especificos atualmente exibidos em Receitas e Despesas.
- Preservar integralmente as colunas, filtros, acoes, estados vazios e fluxos existentes das tabelas de Receitas e Despesas.
- Alternar entre as tabelas de Receitas e Despesas por navegacao interna simples, sem tabela hibrida e sem ocultar campos existentes.
- Manter os botoes de nova receita e nova despesa visiveis lado a lado no cabecalho.
- Criar ou adaptar um modal de movimentacao de reserva que permita selecionar a reserva e executar deposito ou retirada com valor, data e descricao.
- Vincular a movimentacao de reserva ao mes escolhido e respeitar o bloqueio de mes fechado.
- Corrigir o backend para persistir a data enviada na movimentacao da reserva, em vez de gravar sempre no dia 15.
- Permitir consultar as movimentacoes de reserva por mes e ano, respeitando o perfil ativo.

### Fora do escopo inicial

- Criar uma tabela unica que misture receitas, despesas e reservas em linhas com colunas reduzidas.
- Renomear campos, tipos, categorias ou formas de pagamento existentes.
- Alterar as regras atuais de faturamento de contratos, comissao, parcelamento, recorrencia, pagamento em lote, cancelamento ou fechamento de mes.
- Transformar aporte em despesa ou retirada em receita.
- Alterar metas, valores, dados historicos ou schema de reservas sem necessidade comprovada.
- Alterar o modulo Escalacao FC, planos, autenticacao ou e-mails de cobranca.

## Requisitos de Frontend

- A navegacao deve apresentar `Movimentacoes` como a entrada mensal principal.
- A tela deve manter o periodo selecionado em sincronia com os dados de receitas, despesas e reservas.
- Os cards exibidos na tela devem ser somente os indicadores mensais padrao ja presentes no sistema; evitar repeticao dos KPIs atuais das telas individuais.
- A selecao interna entre Receitas e Despesas deve reutilizar as tabelas atuais, incluindo todas as suas colunas e acoes.
- O modal de reserva deve oferecer selecao de reserva, deposito/retirada, valor, data e descricao com validacoes e mensagens de erro existentes ou equivalentes.
- O botao de reserva deve permitir a operacao diaria de forma direta. A criacao e configuracao de reserva deve continuar acessivel sem duplicar formularios.
- Usar React Query, `queryKeys` centralizadas e invalidar os dados mensais/reservas necessarios apos cada mutacao.
- Garantir bom comportamento em telas pequenas, sem colunas ou botoes sobrepostos.

## Requisitos de Backend

- Preservar as rotas existentes de receitas, despesas, meses e reservas, salvo ajustes necessarios para a nova consulta mensal de movimentacoes de reserva.
- Na rota de movimentacao de reserva, validar e usar a data enviada pelo cliente. O mes e ano para verificacao de fechamento devem derivar dessa data validada.
- Adicionar filtro parametrizado de mes e ano para a listagem agregada de movimentacoes de reserva, sem alterar o comportamento de consumidores existentes quando o filtro nao for informado, se houver compatibilidade necessaria.
- Continuar validando saldo da reserva e saldo disponivel antes de deposito ou retirada, conforme as regras atuais.
- Manter mensagens de erro genericas e sem expor dados de outras contas.
- Para novas consultas, usar Drizzle quando o padrao existente permitir; se uma consulta SQL existente precisar ser estendida, manter parametros seguros e justificativa clara.

## Requisitos de Banco de Dados

Nao ha alteracao de schema identificada inicialmente. A tabela existente `movimentacoes_reservas` ja armazena tipo, valor, observacoes e `data_hora`.

O planejamento deve confirmar se a data enviada pode ser persistida corretamente com os campos existentes. Nenhuma migration deve ser criada ou executada sem confirmacao explicita do usuario.

## Requisitos de Seguranca e Multi-Tenant

- Todas as operacoes de receitas, despesas, reservas e meses devem continuar determinadas pelo usuario autenticado.
- A selecao de reserva deve ser validada no backend com `reserva_id` e `usuario_id`; nunca confiar somente no ID enviado pelo modal.
- O filtro de movimentacoes de reserva deve respeitar `usuario_id` e o filtro de `perfil_id` ja existente.
- Nao expor movimentacoes, saldos, anexos ou metas de outra conta/perfil.
- O mes a fechar ou movimentar deve ser validado pelo backend, nao apenas pela interface.

## Requisitos de Migracao ou Compatibilidade

- Preservar URLs, payloads e respostas usados hoje pelas telas de receitas, despesas e reservas sempre que possivel.
- Reaproveitar componentes e servicos atuais em vez de reescrever a logica das tabelas.
- Tratar o portugues existente no codigo como legado; novos identificadores de codigo devem usar ingles.
- Nao executar migrations, alterar `.env` ou modificar dados existentes durante o planejamento ou a implementacao sem autorizacao explicita.

## Requisitos de Testes

### Frontend

- Verificar que o seletor de mes atualiza a tabela ativa e os cards padrao de Movimentacoes.
- Verificar que alternar entre Receitas e Despesas preserva as colunas e acoes atuais de cada tabela.
- Verificar que os botoes Nova receita e Nova despesa permanecem acessiveis no cabecalho.
- Verificar que o modal de reserva envia tipo, valor, data, descricao e reserva selecionada.
- Verificar loading, erro, estado vazio e mes fechado nos fluxos alterados.

### Backend

- Cobrir movimentacao de reserva com data informada e confirmar persistencia da data correta.
- Cobrir bloqueio de deposito/retirada quando o mes correspondente a data estiver fechado.
- Cobrir filtro de movimentacoes de reserva por mes, ano, usuario e perfil.
- Confirmar que um usuario nao movimenta ou consulta reserva de outro usuario.

### E2E

- Em uma conta de teste, selecionar um mes, alternar entre Receitas e Despesas e confirmar que cada tabela continua com suas acoes existentes.
- Criar um aporte e uma retirada com datas distintas e confirmar que ambos aparecem apenas no mes correspondente.
- Confirmar que movimentar reserva em mes fechado e recusado pela API e pela interface.

## Arquivos Provavelmente Afetados

### Frontend

- `src/App.tsx`
- `src/layout/AppShell.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/reservas/ReservaDialog.tsx`
- `src/services/reservasService.ts`
- `src/services/queryKeys.ts`
- `src/types/reservas.ts`

### Backend

- `backend/src/routes/reserves.ts`

### Banco de Dados

- Sem migration prevista inicialmente; confirmar durante o planejamento se a estrutura existente e suficiente.

## Criterios de Aceite

- A navegacao principal apresenta Movimentacoes no lugar de Receitas, Despesas e Reservas como entradas independentes.
- Movimentacoes possui um unico seletor de mes e um unico controle de fechamento/reabertura.
- A tela mostra somente os cards mensais padrao, sem repetir os cards atuais de Receitas e Despesas.
- A pessoa alterna entre as tabelas atuais de Receitas e Despesas sem perder colunas, filtros ou acoes.
- Nova receita e Nova despesa ficam lado a lado no cabecalho.
- A operacao de reserva esta acessivel por modal direto, com selecao de reserva, deposito/retirada, valor, data e descricao.
- A data selecionada no modal e a data persistida e usada para o mes da movimentacao.
- A listagem de movimentacoes de reserva pode ser filtrada por mes e ano e respeita usuario/perfil autenticados.
- Um mes fechado impede a movimentacao de reserva naquela data.
- Nenhuma tabela hibrida, campo novo ou migration desnecessaria e criada.

## Perguntas Para o Planejamento

- Os cards mensais padrao devem permanecer tambem no Painel ou devem ser somente reutilizados em Movimentacoes para evitar repeticao visual?
- A gestao completa de reservas (nova reserva, meta, cor, edicao e exclusao) deve ficar em uma tela de configuracao existente ou em uma area secundaria do modal de reservas?
- A navegacao interna deve iniciar em Receitas, Despesas ou lembrar a ultima tabela escolhida pelo usuario?
- A listagem mensal de reservas deve aparecer dentro do modal ou em uma area compacta da tela Movimentacoes, sem criar uma nova tabela hibrida?
- A consulta atual de saldo disponivel deve considerar a data exata das movimentacoes de reserva ou manter a regra existente durante a primeira entrega?

## Instrucoes Para a Skill Planejar

- Use este arquivo como especificacao de entrada.
- Leia `AGENT.md` e `CLAUDE.md` na raiz. Nao existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto.
- Inspecione os arquivos citados antes de escrever o plano e confirme os contratos atuais de API e tipos.
- Classifique a implementacao como `frontend + backend`; banco de dados somente se a investigacao comprovar necessidade.
- Mantenha a implementacao pequena: reorganizar componentes e fluxos existentes tem prioridade sobre criar novas estruturas.
- Nao implemente codigo durante o planejamento.
- Nao instale dependencias durante o planejamento.
- Nao execute migrations e nao altere `.env`.
- Gere o plano em `.plans/` com etapas pequenas, revisaveis e seguras para producao.
