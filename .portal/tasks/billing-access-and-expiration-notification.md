# Task: Corrigir bloqueio de planos e notificacao de vencimento

## Contexto

O FINGERENCE possui planos `trial`, `ativo` e `expirado` na tabela `usuarios`. O frontend consulta `/api/planos/status` ao carregar `app.html` e, quando recebe `expirado`, substitui o painel por uma tela de renovacao.

Foram verificados os seguintes pontos do fluxo atual:

- `backend/src/routes/plans.ts` calcula o fim do trial e do plano avulso dentro de `GET /api/planos/status` e grava `plano_status = 'expirado'` nessa consulta.
- `backend/src/cron/cobrancas.ts` usa um `setTimeout` em memoria para enviar e-mails de aviso antecipado de plano e trial, sem registrar os envios.
- `backend/src/middleware/auth.ts` valida somente o JWT. As rotas financeiras autenticadas nao verificam o status do plano.
- `backend/src/routes/plans.ts` mantem um plano recorrente ativo quando recebe uma cobranca recorrente rejeitada; nesse caso apenas registra um aviso no log.
- O EmailJS e o provedor atual dos e-mails de cobranca. O ambiente local nao possui as variaveis dele configuradas; a configuracao de producao deve ser confirmada separadamente.

## Problema

O bloqueio de acesso por plano ocorre principalmente na interface. Enquanto o JWT for valido, um usuario com plano expirado pode consumir endpoints financeiros diretamente. Alem disso, a transicao para `expirado` depende de o usuario consultar o status do plano, o que deixa estados vencidos persistidos como ativos ou trial ate a proxima abertura do app.

Os e-mails de cobranca sao enviados em marcos antecipados e nao possuem registro de entrega ou idempotencia. Isso permite repeticoes em execucoes futuras, em multiplas instancias e, para trials que continuam com status `trial`, em todos os dias posteriores ao termino.

## Objetivo

Fazer com que o direito de acesso ao FINGERENCE seja decidido e aplicado pelo backend, com estados de plano consistentes, e enviar no maximo uma notificacao de e-mail quando um plano pago vencer sem pagamento confirmado.

## Decisao Tecnica Desejada

Aplicar o status do plano no backend por meio de uma verificacao centralizada nas rotas que concedem acesso aos dados e operacoes do sistema financeiro. A expiracao deve ser tratada por um processamento idempotente, independente de uma consulta de leitura da interface.

O e-mail de cobranca deve ser disparado somente apos a transicao efetiva de um plano pago para estado sem acesso por falta de pagamento, com registro persistente por ciclo de plano para impedir duplicidade. A falha de entrega nao deve reabrir o acesso.

A definicao de bloqueio imediato no vencimento ou de um periodo de carencia deve ser decidida durante o planejamento antes da implementacao.

## Escopo Funcional

### Dentro do escopo

- Corrigir a expiracao de trial e de planos avulsos no Sistema Financeiro.
- Proteger no backend as rotas que permitem consultar ou alterar dados financeiros, preservando os caminhos necessarios para login, consulta/contratacao de plano e confirmacao de pagamento.
- Preservar a excecao de acesso para usuarios `master` ja existente no produto.
- Revisar o tratamento de eventos do Mercado Pago para cancelamento, pausa e cobranca recorrente rejeitada.
- Remover avisos antecipados de plano e trial do fluxo de cobranca atual.
- Enviar uma unica notificacao para o titular quando um plano pago vencer sem pagamento confirmado.
- Garantir idempotencia da transicao de plano e do envio de e-mail, inclusive em reinicios e multiplas instancias do backend.
- Ajustar a tela de bloqueio para representar corretamente plano pago vencido ou trial encerrado e revalidar o acesso apos pagamento confirmado.
- Manter os dados do usuario preservados durante o bloqueio.

### Fora do escopo inicial

- Alterar o provedor de e-mail ou de pagamentos.
- Criar campanhas, newsletters, recibos ou e-mails de marketing.
- Alterar o modulo Escalacao FC.
- Redesenhar os planos, precos ou meios de pagamento.
- Alterar o formulario de contato ou o fluxo de recuperacao de senha.
- Executar migrations, atualizar variaveis de ambiente de producao ou alterar dados existentes sem aprovacao explicita.

## Requisitos de Frontend

- Tratar explicitamente os estados de carregamento, acesso ativo e acesso bloqueado ao consultar o status do plano.
- Nao renderizar o painel financeiro enquanto a decisao de acesso estiver pendente para uma sessao autenticada.
- Diferenciar visualmente trial encerrado, plano vencido e eventual periodo de carencia, caso seja aprovado.
- Disponibilizar revalidacao do status apos o retorno de um pagamento confirmado, sem liberar o painel antes da confirmacao do backend.
- Preservar rotas e contratos existentes sempre que possivel.

## Requisitos de Backend

- Centralizar a regra de elegibilidade do plano em middleware ou servico especifico, baseado no usuario autenticado e nunca em dados enviados pelo cliente.
- Garantir que uma solicitacao com plano expirado receba resposta de acesso negado nas rotas protegidas, mesmo com JWT valido.
- Manter abertas apenas as rotas estritamente necessarias para autenticacao, consulta de status, compra, webhook e reativacao do plano.
- Remover efeitos de escrita de `GET /api/planos/status`; a rota deve refletir o estado calculado ou ja persistido.
- Definir um processamento de expiracao idempotente e seguro para execucao em mais de uma instancia; nao depender apenas de um temporizador em memoria para a consistencia do acesso.
- No vencimento sem pagamento confirmado, atualizar o estado do plano antes de enfileirar ou disparar a notificacao.
- Tratar cobrancas recorrentes rejeitadas segundo a regra de negocio aprovada, sem manter acesso indevido indefinidamente.
- Manter logs com contexto seguro de usuario, ciclo de plano e resultado do envio, sem expor credenciais ou conteudo sensivel.

## Requisitos de Banco de Dados

- Avaliar uma estrutura persistente para registrar eventos de notificacao por usuario e ciclo de plano, com unicidade que impeça novo envio do mesmo vencimento.
- Avaliar indices para as consultas frequentes de expiracao por `plano_status` e `plano_expiracao`.
- Preservar os valores existentes de `plano_status`, `plano_tipo`, `plano_expiracao`, `preapproval_id` e dados de pagamento.
- Caso haja schema ou migration nova, criar uma migration nova; nao editar migrations ja aplicadas e nao executa-la sem aprovacao explicita.

## Requisitos de Seguranca e Multi-Tenant

- O status de plano deve ser obtido a partir de `req.user.id` e de dados do banco, nunca de payloads do cliente.
- O bloqueio de plano deve complementar, e nao substituir, autenticacao JWT e autorizacao por tipo de usuario.
- Consultas e atualizacoes de plano/notificacao devem ser restritas ao usuario correto para nao expor dados financeiros entre contas.
- Credenciais do EmailJS devem permanecer apenas no ambiente do servidor e nunca aparecer em respostas, logs ou bundles do frontend.
- O webhook de pagamento deve continuar confirmando o estado com o provedor antes de liberar acesso.

## Requisitos de Migracao ou Compatibilidade

- Prever reconciliacao segura para usuarios ja ativos com data de expiracao passada e trials que ultrapassaram 15 dias.
- Preservar contratos atuais de `/api/planos/status` enquanto o frontend for atualizado de forma compativel.
- Garantir que o pagamento aprovado reative o acesso sem exigir novo login quando a sessao ainda for valida.
- Usar ingles em novos identificadores de codigo; textos de produto podem continuar em portugues.

## Requisitos de Testes

### Frontend

- Testar que um usuario expirado nao visualiza ou opera o painel financeiro.
- Testar as mensagens para trial encerrado e plano pago vencido.
- Testar a revalidacao apos pagamento confirmado.

### Backend

- Testar expiracao de trial apos 15 dias e de plano avulso na data/hora definida.
- Testar que rotas financeiras protegidas negam acesso a plano expirado e liberam `trial` valido, plano ativo e usuario `master`.
- Testar cancelamento, pausa, aprovacao e rejeicao de cobranca recorrente conforme a regra aprovada.
- Testar que o mesmo vencimento gera no maximo um evento de notificacao, mesmo com nova execucao do job.
- Testar falha do EmailJS sem reverter o bloqueio ou duplicar envio em tentativa posterior.

### E2E

- Cobrir cadastro em trial, fim do trial, renovacao de plano, vencimento sem pagamento e retorno ao acesso apos pagamento aprovado.

## Arquivos Provavelmente Afetados

### Frontend

- `src/App.tsx`
- `src/screens/planos/PlanosScreen.tsx`

### Backend

- `backend/src/routes/plans.ts`
- `backend/src/cron/cobrancas.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/server.ts`
- `backend/src/db/schema/users.ts`

### Banco de Dados

- `backend/src/db/schema/users.ts`
- Nova migration em `backend/drizzle/`, caso o planejamento confirme a necessidade de persistir eventos de notificacao.

## Criterios de Aceite

- Um usuario com plano vencido nao consegue acessar APIs financeiras protegidas usando apenas um JWT ainda valido.
- O trial encerra apos 15 dias conforme a regra definida, sem depender de o usuario abrir o sistema.
- Um plano avulso vencido sem pagamento confirmado passa ao estado definido pela regra de negocio apenas uma vez.
- O sistema nao envia avisos antecipados de cobranca.
- Um mesmo ciclo vencido de plano pago gera no maximo um e-mail de notificacao, inclusive com reinicio ou mais de uma instancia do backend.
- A aprovacao confirmada de pagamento restaura o acesso e nao gera notificacao de vencimento indevida.
- Uma rejeicao de cobranca recorrente nao mantem acesso sem obedecer a regra aprovada.
- Nenhuma credencial de e-mail e exposta, e os testes relevantes passam.

## Perguntas Para o Planejamento

- O acesso deve ser bloqueado imediatamente no instante do vencimento ou deve existir periodo de carencia? Se existir, qual duracao e quais operacoes ficam liberadas?
- O unico e-mail de vencimento deve ser enviado tambem ao final do trial ou somente para planos pagos que nao foram renovados?
- Qual timezone e horario de negocio definem o vencimento para o produto?
- Quais rotas autenticadas devem continuar disponiveis para usuarios bloqueados alem de planos e autenticacao?
- A infraestrutura de producao possui cron externo, worker ou banco que possa executar o processamento de expiracao com exclusao mutua?

## Instrucoes Para a Skill Planejar

- Use este arquivo como especificacao de entrada.
- Leia `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md`; nao ha `frontend/AGENT.md` nem `backend/AGENT.md` neste repositorio.
- Inspecione os arquivos citados e todas as rotas autenticadas do Sistema Financeiro antes de escrever o plano.
- Classifique a implementacao como `frontend + backend + database + infra` conforme a estrategia de agendamento confirmada.
- Nao implemente codigo durante o planejamento.
- Nao instale dependencias durante o planejamento.
- Nao execute migrations nem altere arquivos de ambiente.
- Gere um plano em `.portal/plans/` com etapas pequenas, revisaveis e seguras para staging/producao.
