# Plano de Implementacao: Corrigir bloqueio de planos e notificacao de vencimento

## Origem

- Arquivo de especificacao: `.portal/tasks/billing-access-and-expiration-notification.md`
- Data do planejamento: `2026-08-08`
- Classificacao: `frontend + backend + database + infra/deploy`

## Resumo

O Sistema Financeiro deve bloquear imediatamente o acesso quando um trial ou plano pago vencer, mesmo que o usuario mantenha um JWT valido ou chame a API diretamente. A decisao de acesso deixara de depender somente da interface e a rota de leitura de status deixara de alterar o banco.

Para planos pagos, o sistema enviara um unico e-mail quando a falta de pagamento efetivamente encerrar o acesso. Nao havera e-mails antecipados nem e-mail de fim de trial. O processamento sera disparado por um Render Cron Job, com a regra de negocio avaliada em `America/Sao_Paulo` e protegida por idempotencia persistida no banco.

## Escopo

### Dentro do escopo

- Bloquear imediatamente trial e plano pago vencidos.
- Aplicar a elegibilidade de plano no backend das rotas protegidas do Sistema Financeiro.
- Preservar a liberacao de usuarios `master`.
- Tornar o status de plano consistente sem escrita em `GET /api/planos/status`.
- Encerrar acesso de assinatura recorrente quando houver cancelamento, pausa ou rejeicao final de cobranca.
- Remover avisos antecipados de e-mail e enviar somente um aviso de vencimento de plano pago sem renovacao confirmada.
- Persistir os eventos de notificacao para impedir duplicidade em reexecucoes, reinicios ou mais de uma instancia.
- Ajustar a interface para aguardar a decisao de acesso antes de buscar dados financeiros e para distinguir trial encerrado de plano pago vencido.
- Configurar o processamento por Render Cron Job sem expor segredos no repositorio.

### Fora do escopo

- Alterar EmailJS, Mercado Pago, PayPal, precos ou modalidades de plano.
- Enviar e-mail pelo encerramento de trial, campanhas, recibos ou marketing.
- Alterar o modulo Escalacao FC.
- Alterar o formulario de contato ou recuperacao de senha.
- Executar migrations, alterar `.env`, configurar valores reais de producao, alterar dados existentes ou publicar o deploy sem confirmacao explicita.

## Leitura de contexto

- `sistema financas/AGENT.md`
- `sistema financas/CLAUDE.md`
- `.portal/tasks/billing-access-and-expiration-notification.md`
- `backend/src/routes/plans.ts`
- `backend/src/cron/cobrancas.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/db/schema/users.ts`
- `backend/src/server.ts`
- `src/App.tsx`
- `src/hooks/useFinanceDashboard.ts`
- `src/screens/planos/PlanosScreen.tsx`
- `src/services/apiClient.ts`
- `src/services/queryKeys.ts`
- `package.json` e `backend/package.json`

Nao existem `frontend/AGENT.md` nem `backend/AGENT.md` no repositorio. Tambem nao foi identificado framework de testes proprio; o script atual de testes do backend falha propositalmente.

## Impacto por area

### Frontend

- Atualizar `App.tsx` para obter o status do plano antes de liberar consultas e mutacoes financeiras no app autenticado.
- Adicionar uma query key para status de plano e evitar chaves literais duplicadas entre `App.tsx` e `PlanosScreen.tsx`.
- Ajustar `useFinanceDashboard` para receber uma flag de habilitacao e nao chamar o dashboard antes de existir acesso valido.
- Ajustar a tela de bloqueio para apresentar a causa correta: trial encerrado ou plano pago vencido. A tela deve manter a navegacao para contratacao e revalidar o status apos pagamento confirmado.
- Preservar o comportamento de redirecionamento de sessao invalida e a exibicao dos dados apos uma reativacao confirmada pelo backend.
- Tratar erros de acesso por plano de forma coerente para que respostas de API bloqueadas nao aparecam como erro generico enquanto o gate de plano estiver ativo.

### Backend

- Extrair as regras de elegibilidade e vencimento de plano para um servico reutilizavel, baseado em `req.user.id`, no tipo do usuario e nos dados persistidos em `usuarios`.
- Criar middleware de acesso ao plano para rotas de dados e operacoes do Sistema Financeiro. Ele deve liberar `master`, trial valido e plano ativo; deve negar acesso expirado mesmo se o job externo ainda nao tiver persistido a transicao.
- Manter fora desse middleware os fluxos necessarios para autenticacao, verificacao de sessao, consulta/compra/cancelamento de plano, captura de pagamento e webhooks. Auditar a lista de rotas montadas em `server.ts` antes de aplicar a protecao.
- Alterar `GET /api/planos/status` para somente relatar o estado efetivo e nao atualizar `plano_status`.
- Transformar o processamento atual de `cron/cobrancas.ts` em uma rotina idempotente de ciclo de planos: encontrar trials e planos pagos vencidos, atualizar o status quando necessario e criar o evento de notificacao apenas para plano pago sem pagamento confirmado.
- Remover a inicializacao do timer em memoria no bootstrap do servidor. O backend deve expor um endpoint interno autenticado por segredo para disparar a rotina a partir do cron externo.
- No webhook do Mercado Pago, tratar `cancelled`, `paused` e cobranca recorrente `rejected` como perda imediata de acesso. Pagamento confirmado deve restaurar `ativo` e evitar que um evento de vencimento posterior do ciclo anterior libere ou bloqueie indevidamente a conta.
- Reutilizar EmailJS somente depois de a transicao de acesso e o evento de notificacao estarem registrados. Registrar resultado, tentativas e erro sem logar credenciais ou o conteudo do e-mail.

### Banco de dados

- Criar uma nova tabela de eventos de notificacao de plano, por exemplo `plan_notification_events`, com identificador, usuario, tipo de evento, referencia do ciclo/vencimento, status de envio, quantidade de tentativas, erro seguro, timestamps de criacao e envio.
- Garantir unicidade por usuario, tipo de evento e referencia do vencimento para que o mesmo ciclo nao gere novo e-mail.
- Adicionar os indices necessarios para consultas por estado e data de expiracao, se os indices atuais nao cobrirem `plano_status + plano_expiracao`.
- Manter os campos existentes de `usuarios` compativeis: `plano_status`, `plano_tipo`, `plano_expiracao`, `preapproval_id`, `plano_inicio` e identificadores de pagamento.
- Criar uma migration nova numerada apos `0013_analytics_events.sql`; nao editar migrations existentes.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

- Criar no Render um Cron Job separado do web service, apontando para o repositorio e para um comando que chame o endpoint interno de ciclo de planos com um segredo em header.
- Configurar o cron em UTC, pois essa e a referencia de agenda do Render, mantendo a regra de vencimento no backend em `America/Sao_Paulo`. Usar uma cadencia curta o suficiente para o e-mail ocorrer logo apos o vencimento; a recomendacao inicial e `*/5 * * * *`.
- Compartilhar de forma segura entre web service e cron job as variaveis de conexao ao banco, URL interna/externa do backend e um novo segredo, por exemplo `BILLING_CRON_SECRET`. Nao incluir valores em arquivos versionados.
- Confirmar no deploy as variaveis atuais do EmailJS, incluindo a configuracao especifica do template de cobranca.
- Usar o historico de execucoes do Render para auditoria operacional. O Render garante uma unica execucao ativa por Cron Job, mas a unicidade no banco continua obrigatoria para seguranca contra reexecucoes e chamadas manuais.

## Arquivos provavelmente afetados

- `backend/src/routes/plans.ts`
- `backend/src/routes/internal-jobs.ts` ou rota interna equivalente, a criar
- `backend/src/cron/cobrancas.ts`
- `backend/src/services/plan-lifecycle.ts`, a criar
- `backend/src/middleware/auth.ts` ou middleware dedicado de plano
- `backend/src/db/schema/users.ts`
- `backend/src/db/schema/plan-notification-events.ts`, a criar
- `backend/src/db/schema/index.ts`
- `backend/src/server.ts`
- `backend/drizzle/0014_plan_notification_events.sql`, a criar com o proximo numero disponivel
- `backend/package.json`
- `src/App.tsx`
- `src/hooks/useFinanceDashboard.ts`
- `src/screens/planos/PlanosScreen.tsx`
- `src/services/queryKeys.ts`
- `src/services/apiClient.ts`, se necessario para padronizar o erro de plano expirado
- Arquivos de teste de backend e, se viavel sem nova dependencia, helpers puros de frontend

## Estrategia de implementacao

1. Mapear e classificar todas as rotas autenticadas montadas em `server.ts` entre rotas que exigem plano ativo e excecoes de autenticacao, conta minima, planos e pagamentos. Definir uma resposta padronizada de acesso por plano que o frontend possa reconhecer sem confundir com sessao invalida.

2. Criar o modelo de dados para eventos de notificacao e a migration nova. Adicionar uma restricao unica que represente o ciclo de vencimento e os indices de consulta necessarios. Revisar os valores ja persistidos para que planos ativos vencidos possam ser reconciliados com seguranca apos o deploy.

3. Implementar o servico de ciclo de planos. Ele deve calcular trial e plano pago usando horario de Brasilia, identificar vencimentos, persistir transicoes de forma condicional/idempotente e criar eventos de notificacao apenas para planos pagos que perderam acesso sem pagamento confirmado.

4. Implementar middleware de elegibilidade que consulte o estado efetivo do plano para cada rota protegida. O middleware deve negar acesso no instante do vencimento mesmo antes da proxima execucao do job, preservar o bypass `master` e nunca usar status enviado pelo cliente.

5. Refatorar `plans.ts` e o webhook de Mercado Pago para usar o servico central. Remover escrita de `GET /status`, manter pagamentos aprovados como fonte de reativacao e mudar rejeicao recorrente para bloqueio imediato. Garantir que cancelamento e pausa continuem bloqueando.

6. Substituir o cron em memoria por um endpoint interno protegido e pela rotina exportada do servico. O endpoint deve validar segredo constante no servidor, executar uma vez e retornar somente resultado operacional seguro. Remover `startCobrancaCron()` do bootstrap para evitar duplicidade.

7. Implementar o dispatcher de EmailJS para os eventos pendentes. Ele deve marcar tentativas e sucesso de forma atomica conforme o desenho escolhido, permitir retentativas controladas de falhas e nunca reenviar um evento ja confirmado como enviado. Excluir completamente os avisos de 7, 3 e 1 dias e qualquer e-mail de trial.

8. Ajustar o frontend: consultar status de plano antes do dashboard, desabilitar `useFinanceDashboard` enquanto o acesso estiver indefinido ou negado, centralizar a query key e corrigir a experiencia da tela de bloqueio. Revalidar o status apos confirmacao de pagamento sem liberar por resposta apenas visual.

9. Adicionar testes para as regras de ciclo, middleware, webhook e idempotencia. Como nao ha framework configurado, preferir a infraestrutura ja instalada (`tsx` e `node:test`) para testes de backend; para o frontend, cobrir helpers puros quando extraidos e executar build mais checklist manual dos fluxos de gate.

10. Executar typechecks/builds, validar o endpoint interno em ambiente seguro e documentar no handoff a configuracao manual do Render Cron Job e das variaveis sem registrar segredos no repositorio.

## Regras de negocio identificadas

- O trial dura 15 dias a partir de `data_cadastro` e termina sem e-mail de cobranca.
- Plano pago sem pagamento confirmado bloqueia imediatamente no vencimento.
- Vencimento, bloqueio e referencia do e-mail seguem `America/Sao_Paulo`.
- Um ciclo de plano pago vencido gera no maximo um e-mail, inclusive apos reinicio, reexecucao ou mais de uma instancia.
- Nao existem avisos antecipados de cobranca.
- Usuario `master` permanece com acesso ativo independentemente de campos de plano.
- Cancelamento, pausa ou rejeicao final de cobranca recorrente removem acesso imediatamente; nova confirmacao de pagamento reativa o acesso.
- A falha no EmailJS nao pode reabrir acesso nem causar envios ilimitados.
- Dados financeiros sao preservados durante o bloqueio e voltam a ficar acessiveis somente apos confirmacao de reativacao pelo backend.

## Regras multi-tenant e seguranca

- O usuario alvo e sempre determinado por `req.user.id` ou pelo identificador confirmado pelo provedor de pagamento; nunca pelo corpo da requisicao de um cliente autenticado.
- O middleware de plano complementa `authenticate`, `requireAdmin` e `requireMaster`; ele nao deve enfraquecer autorizacao existente.
- As rotas financeiras devem continuar filtrando dados pelo usuario autenticado. A nova tabela de notificacoes deve guardar o `userId` correto e nao permitir que uma conta consulte ou dispare eventos de outra.
- O endpoint chamado pelo cron nao pode ser publico. Validar um segredo de ambiente em header, usar comparacao segura quando aplicavel e retornar erro generico sem indicar configuracao interna.
- Credenciais do EmailJS e do cron ficam somente em variaveis de ambiente do Render. Nao alterar `.env`, nao registrar segredos em logs e nao expor esses valores ao frontend.
- Webhooks devem continuar consultando o Mercado Pago antes de mudar estado de plano, para nao confiar apenas no corpo recebido.

## Validacoes necessarias

- Validar a presenca e a configuracao de `BILLING_CRON_SECRET` somente no endpoint interno, sem logar o valor.
- Validar que a chamada do cron nao aceita usuario, data de vencimento ou plano arbitrarios do cliente.
- Validar estados de plano conhecidos e tratar dados legados nulos de modo compativel.
- Validar que o ciclo identificado para notificar pertence a um plano pago vencido e nao a trial, `master`, cancelamento anterior ja tratado ou pagamento confirmado posteriormente.
- Validar assinaturas/consultas do provedor conforme o comportamento ja existente antes de liberar ou revogar acesso.
- Validar no frontend estados de carregamento, resposta de plano expirado, falha temporaria da consulta de status e reativacao apos pagamento.

## Testes necessarios

### Frontend

- Verificar que o dashboard nao executa sua query antes de a consulta de plano liberar acesso.
- Verificar que status `expirado` apresenta a tela correta para trial e plano pago, sem renderizar o AppShell financeiro.
- Verificar a invalidação/reconsulta de status apos pagamento confirmado e o retorno ao painel somente com resposta ativa do backend.
- Executar checklist manual em navegador para sessao valida com plano ativo, trial ativo, trial vencido, plano pago vencido e plano reativado.

### Backend

- Cobrir a funcao de elegibilidade para `master`, trial valido, trial vencido, plano avulso ativo e plano avulso vencido em horario de Brasilia.
- Cobrir o middleware garantindo que rota financeira protegida nega usuario expirado com JWT valido e libera as excecoes previstas.
- Cobrir a rotina idempotente: primeira execucao expira e cria evento; segunda execucao nao cria novo evento.
- Cobrir que trial vencido altera o estado sem criar evento de e-mail.
- Cobrir aprovacao, cancelamento, pausa e rejeicao recorrente do Mercado Pago, incluindo reativacao por pagamento aprovado.
- Mockar EmailJS para confirmar que evento enviado nao e reenviado, falha controlada fica auditavel e falha de e-mail nao altera o bloqueio.
- Atualizar o script de testes do backend para executar a suite adicionada com ferramentas existentes, sem instalar dependencia nova salvo aprovacao especifica.

### E2E

- Em ambiente seguro, simular vencimento de plano pago, disparar o endpoint interno com segredo valido e confirmar bloqueio da API mais um unico evento de notificacao.
- Simular pagamento aprovado e confirmar reativacao sem novo login enquanto o JWT ainda estiver valido.
- Validar uma chamada sem segredo e com segredo incorreto ao endpoint de job, ambas negadas.
- Nao executar pagamento real nem migration em producao durante a validacao.

## Comandos de validacao sugeridos

```powershell
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run test
git -C "sistema financas" diff --check
git -C "sistema financas" status --short
```

O comando de testes so deve ser executado depois de o script ser substituido pela suite real. Nenhuma migration deve ser executada como parte dessas validacoes.

## Riscos e pontos de atencao

- `plano_expiracao` usa timestamp existente; a implementacao deve tratar com cuidado a conversao para `America/Sao_Paulo` para nao bloquear um dia antes ou depois.
- Usuarios existentes podem ter trial ou plano ativo com vencimento ja passado. O primeiro job precisa reconciliar sem duplicar e-mails historicos indevidos.
- Sem middleware no backend, o gate visual seria contornavel; por isso a protecao de API deve ser entregue antes ou junto da mudanca visual.
- O Render agenda cron em UTC e executa comandos que precisam terminar. A configuracao de fuso e o comando HTTP devem ser verificados no painel de deploy antes de producao.
- O Render possui garantia de uma execucao ativa por Cron Job, mas chamadas manuais, retries e multiplas origens ainda exigem unicidade no banco.
- EmailJS confirma aceite da requisicao, nao entrega final na caixa postal. O estado de envio deve refletir a resposta do provedor e permitir diagnostico sem liberar acesso.
- A ausenca de suite de testes atual aumenta o risco de regressao; manter o escopo de testes concentrado na regra de negocio e no middleware e obrigatorio.
- Nao editar migrations antigas, nao alterar `.env` e nao executar comando contra banco sem identificar o ambiente e sem confirmacao explicita.

## Perguntas em aberto

Nenhuma pergunta de regra de negocio permanece em aberto. Durante a implementacao, confirmar apenas detalhes operacionais do Render: URL do endpoint interno, comando do Cron Job e compartilhamento seguro das variaveis de ambiente.

## Criterios de aceite do plano

- Um JWT valido de usuario com plano vencido nao acessa APIs financeiras protegidas.
- O trial termina apos 15 dias sem depender de o usuario abrir o aplicativo e sem enviar e-mail de cobranca.
- Um plano pago vencido sem pagamento confirmado bloqueia imediatamente conforme horario de Brasilia.
- `GET /api/planos/status` nao altera o estado persistido.
- O sistema nao envia avisos antecipados de cobranca.
- Cada ciclo pago vencido cria no maximo um evento de e-mail, inclusive em reexecucoes do job.
- Cancelamento, pausa e rejeicao final de recorrencia removem acesso; pagamento confirmado reativa o acesso.
- Usuarios `master` continuam liberados.
- O endpoint de cron exige segredo valido e nao expoe informacao sensivel.
- Builds e testes relevantes passam sem executar migrations ou alterar ambiente.

## Observacoes para a skill implementar

- Use este plano como fonte principal de contexto e siga `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md`.
- Manter as alteracoes restritas ao Sistema Financeiro; nao modificar o modulo Escalacao FC.
- Comecar pelo servico/regra de plano, schema e middleware antes da tela, para que o frontend consuma um contrato seguro.
- Usar Drizzle para novas consultas quando possivel; SQL raw somente quando for necessario e parametrizado.
- Criar uma migration nova, mas nao executa-la sem confirmacao explicita do usuario.
- Nao alterar `.env`; documentar variaveis novas apenas no handoff e configurar valores reais fora do repositorio.
- Configurar o Render Cron Job somente como passo de deploy aprovado, usando as orientacoes atuais da documentacao oficial do Render.
- Antes de finalizar, executar os builds e os testes adicionados, revisar `git diff --check` e validar que nenhum segredo foi adicionado ao repositorio.
