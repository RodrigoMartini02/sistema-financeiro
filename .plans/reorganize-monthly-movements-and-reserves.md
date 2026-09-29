# Plano: Reorganizar Movimentacoes Mensais e Reservas

## Origem

- Tarefa: `.portal/tasks/reorganize-monthly-movements-and-reserves.md`
- Data: 2026-08-08
- Classificacao: Fullstack

## Resumo

Reorganizar o fluxo financeiro mensal sem alterar os dados nem simplificar as tabelas existentes. A navegacao principal passara a ter `Movimentacoes` como contexto mensal unico, contendo os cards padrao, seletor de mes, fechamento/reabertura e botoes lado a lado para criar receita ou despesa. As tabelas detalhadas atuais de receitas e despesas permanecem intactas e sao alternadas por uma navegacao simples dentro da tela.

Reservas deixam de ser uma aba principal. A movimentacao diaria de uma reserva ficara disponivel em modal pratico, com data efetivamente respeitada no backend. A administracao completa de reservas continuara acessivel por uma acao secundaria `Gerenciar reservas`.

## Escopo

### Dentro do escopo

- Renomear a area principal mensal para `Movimentacoes`.
- Centralizar seletor de mes e acao de fechar/reabrir mes nessa tela.
- Mover os cards mensais padrao do painel para Movimentacoes.
- Manter tabelas e acoes detalhadas de receitas e despesas, alternando entre elas sem abas principais separadas.
- Posicionar `Nova receita` e `Nova despesa` lado a lado no cabecalho de Movimentacoes.
- Retirar `Reservas` da navegacao principal.
- Oferecer modal direto para adicionar ou retirar valor de uma reserva, com data, valor e descricao.
- Manter criacao, edicao, exclusao, meta e cor de reservas em `Gerenciar reservas`.
- Corrigir backend para persistir a data informada na movimentacao de reserva.
- Permitir que historico de movimentacoes de reserva seja filtrado por mes e ano com isolamento por usuario/perfil.
- Preservar o calculo atual de `Saldo projetado` nesta entrega.

### Fora do escopo

- Alterar o modelo financeiro ou unir receitas e despesas em uma unica tabela.
- Remover colunas, filtros, acoes em lote, anexos ou regras das tabelas existentes.
- Alterar regras de disponibilidade de saldo de reserva.
- Incluir movimentacoes de reservas no calculo de `Saldo projetado`.
- Criar migracao de banco ou alterar infraestrutura de deploy.

## Contexto Atual

- `src/layout/AppShell.tsx` mantem as secoes principais e hoje expoe `Receitas`, `Despesas` e `Reservas` como navegacao independente.
- `src/App.tsx` monta telas separadas para painel, receitas, despesas e reservas.
- `src/screens/finance/FinanceDashboard.tsx` concentra cards mensais e analises/graficos anuais.
- `src/screens/receitas/ReceitasScreen.tsx` e `src/screens/despesas/DespesasScreen.tsx` possuem cada uma seletor de mes, fechamento/reabertura, indicadores e suas tabelas completas.
- `src/screens/reservas/ReservasScreen.tsx` e `src/screens/reservas/ReservaDialog.tsx` permitem administrar reservas e movimenta-las.
- `src/services/reservasService.ts` ja envia o campo `data` na movimentacao.
- `backend/src/routes/reserves.ts` ignora essa data, grava sempre o dia 15 do mes atual/solicitado e nao filtra historico por mes/ano.

## Impacto Tecnico

### Frontend

- Nova composicao de tela para Movimentacoes, reutilizando logica e componentes atuais de receitas e despesas.
- Ajuste de tipos e navegacao do `AppShell`.
- Extracao ou reutilizacao dos cards mensais existentes sem duplicar consultas de dashboard.
- Ajuste no fluxo visual de reservas para separar operacao diaria de administracao completa.

### Backend

- Atualizacao das rotas de movimentacao de reserva para validar e usar a data recebida.
- Inclusao opcional de filtro mensal nas rotas de historico/agregacao, sempre limitado ao usuario e perfil autenticados.

### Banco de dados

- Sem migracao prevista. A correcao usa a coluna de data ja existente em `movimentacoes_reservas`.

### Infraestrutura

- Sem alteracoes previstas.

## Arquivos Provavelmente Afetados

- `src/layout/AppShell.tsx`
- `src/App.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx` (novo ou equivalente conforme composicao final)
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/reservas/ReservaDialog.tsx`
- `src/services/reservasService.ts`
- `backend/src/routes/reserves.ts`
- Testes front-end e back-end relacionados, conforme convencoes existentes no repositorio.

## Estrategia de Implementacao

1. Mapear componentes reutilizaveis de contexto mensal, cards e tabelas em receitas/despesas para evitar regressao das colunas e acoes atuais.
2. Criar a tela `Movimentacoes` com um unico seletor de mes, estado de fechamento e os botoes de criacao de receita/despesa no mesmo cabecalho.
3. Mover os cards mensais padrao para Movimentacoes; deixar no Painel somente os graficos e analises existentes.
4. Adaptar receitas e despesas para funcionarem como conteudo interno selecionavel de Movimentacoes, preservando sua tabela integral, busca, filtros, dialogos, acoes e regras atuais.
5. Retirar receitas, despesas e reservas da navegacao principal e atualizar as rotas/estado de secao para o novo fluxo, sem quebrar acessos internos necessarios.
6. Criar acesso pratico para a movimentacao diaria de reservas no contexto mensal, com os campos reserva, adicionar/retirar, valor, data e descricao.
7. Manter uma acao secundaria `Gerenciar reservas` que leve ao gerenciamento completo atual, incluindo cadastro, meta, cor, edicao e exclusao.
8. Corrigir a rota de movimentacao de reserva para validar a data recebida, definir o mes/ano de bloqueio a partir dela e persistir exatamente a data escolhida.
9. Estender as consultas de movimentacoes de reservas com filtros opcionais de mes/ano usando intervalo de datas e mantendo filtros de usuario/perfil no servidor.
10. Cobrir as regras novas com testes direcionados e executar validacoes de tipos, lint e build.

## Regras de Negocio

- Movimentacoes e o ponto unico de trabalho mensal para receitas, despesas e operacoes de reserva.
- A alternancia entre receitas e despesas muda somente o conteudo principal; nao elimina detalhes, colunas ou acoes de nenhuma tabela.
- `Tipo` da tabela de despesas continua significando parcelada/recorrente; a forma de pagamento continua na coluna `Pagamento`.
- Os cards mensais continuam apresentando os mesmos indicadores ja disponiveis, apenas em outra tela.
- Um mes fechado nao permite criar, editar ou movimentar itens vinculados a ele, inclusive operacoes de reserva cuja data pertença a esse mes.
- A data selecionada em uma movimentacao de reserva determina a data salva, o mes exibido no historico e o mes verificado para bloqueio.
- Movimentacoes de reserva mantem verificacoes de saldo e disponibilidade existentes.
- O `Saldo projetado` conserva o comportamento atual e nao passa a considerar depositos/retiradas de reserva nesta entrega.

## Multi-tenant e Seguranca

- Rotas de reservas devem continuar a obter usuario autenticado pelo contexto da requisicao, sem aceitar usuario como fonte confiavel no corpo ou query string.
- Validar que a reserva movimentada pertence ao usuario autenticado.
- Quando aplicavel, validar e aplicar `perfil_id` no backend com a mesma regra atual de acesso.
- Filtros de mes/ano devem apenas restringir o resultado dentro do escopo autenticado; nunca ampliar acesso a dados de outros usuarios ou perfis.
- Validar formato de data, valor positivo e tipo permitido antes de persistir movimentacoes.

## Validacoes Necessarias

- O menu principal exibe Movimentacoes e nao exibe Receitas, Despesas ou Reservas como abas independentes.
- Movimentacoes apresenta seletor de mes, estado de fechamento/reabertura, cards padrao e os dois botoes de inclusao.
- Alternar entre receitas e despesas preserva cada tabela atual, incluindo todas as colunas, filtros e acoes.
- O Painel continua exibindo graficos e analises, sem duplicar os cards mensais transferidos.
- A operacao de reserva abre fluxo direto com todos os campos definidos e mantem o gerenciamento completo acessivel por acao secundaria.
- Uma movimentacao de reserva datada em um dia especifico e gravada nesse dia, inclusive para um mes diferente do atual.
- Tentar movimentar uma reserva com data de mes fechado e bloqueado adequadamente.
- Historico mensal de reservas retorna somente lancamentos do mes/ano solicitado e respeita usuario/perfil.
- O valor de Saldo projetado permanece com a mesma semantica anterior.

## Testes

### Backend

- Testar persistencia da data explicitamente enviada na movimentacao de reserva.
- Testar bloqueio de mes usando o mes/ano derivados da data da movimentacao.
- Testar filtros de mes/ano em rotas de movimentacoes, incluindo fronteiras de mes.
- Testar que usuario nao movimenta nem consulta reserva de outro usuario/perfil.

### Frontend

- Testar renderizacao de Movimentacoes com cards, seletor mensal e alternancia Receita/Despesa.
- Testar preservacao de acoes importantes nas tabelas existentes atraves dos componentes reutilizados.
- Testar abertura do modal de reserva e envio da data escolhida ao servico.
- Testar acesso a `Gerenciar reservas` no fluxo secundario.

### Integracao/E2E

- Criar receita e despesa no mesmo mes pelo novo ponto de entrada e confirmar nas respectivas tabelas.
- Depositar e retirar de reserva em datas distintas e confirmar no historico mensal.
- Fechar um mes e confirmar bloqueio para receita, despesa e reserva naquele periodo.

## Comandos Sugeridos

- `npm run lint`
- `npm run typecheck` ou o comando equivalente definido no projeto
- `npm run build`
- `npm test` ou os testes direcionados existentes para frontend e backend
- `git diff --check`

## Riscos e Mitigacoes

- Regressao em colunas ou acoes das tabelas ao compor a nova tela: reutilizar componentes e adicionar testes de renderizacao e fluxo.
- Duplicacao de chamadas do dashboard: centralizar a consulta mensal e passar dados/componentes quando o desenho atual permitir.
- Diferenca de fuso horario ao tratar data: parsear e persistir data de forma consistente com o formato adotado no backend, sem converter indevidamente para o dia anterior.
- Mudanca visual pode afetar navegacao existente: validar desktop e mobile, incluindo mes fechado e alternancia de tabelas.
- Regras de saldo de reserva sao sensiveis: limitar a mudanca ao uso da data e filtros, sem alterar calculos de disponibilidade ou saldo projetado.

## Questoes em Aberto

Nenhuma. Decisoes confirmadas durante o planejamento:

- Cards padrao ficam em Movimentacoes; Painel fica com graficos e analises.
- Gerenciamento completo de reservas fica em acao secundaria no fluxo de reserva.
- Saldo projetado nao sera alterado nesta entrega.

## Criterios de Aceite

- A experiencia mensal e acessada por `Movimentacoes`, sem abas principais separadas para receitas, despesas e reservas.
- O usuario consegue alternar entre as tabelas detalhadas atuais de receitas e despesas sem perder informacoes ou recursos.
- Os cards mensais padrao aparecem uma unica vez em Movimentacoes e o Painel preserva seus graficos/analises.
- O usuario cria receita ou despesa pelos botoes lado a lado e opera uma reserva rapidamente pelo modal dedicado.
- O usuario ainda administra reservas completas via `Gerenciar reservas`.
- A data de cada deposito/retirada de reserva e respeitada no banco e no bloqueio mensal.
- Consultas mensais de reservas respeitam mes, ano, usuario e perfil.
- O Saldo projetado se mantem inalterado em regra e apresentacao.

## Observacoes para Implementacao

- Antes de editar, consultar os AGENT.md/CLAUDE.md efetivos no repositorio e seguir os padroes locais.
- Nao executar migracoes, deploy, commit, push ou merge sem a acao/aprovacao correspondente do usuario.
- Preservar alteracoes nao relacionadas que ja existam no worktree.
