# Task: Corrigir validação de validade do cartão, mensagens técnicas expostas e simplificar tela de Acessos

## Contexto

O projeto `sistema financas` possui uma tela de configuração de cartões (`CartaoTab.tsx`) e uma tela de acessos/analytics (`AcessosTab.tsx`), ambas no frontend React + TypeScript, com backend Express + TypeScript + PostgreSQL (Drizzle ORM).

Durante uma sessão de revisão exploratória (sem alteração de código), foram identificados problemas relacionados a dois temas: informação técnica/formato inválido chegando até a experiência do usuário final sem tratamento adequado, e excesso de informação na tela de Acessos além do que o usuário considera útil.

Arquivos verificados nesta investigação:

- `sistema financas/src/screens/config/CartaoTab.tsx` (linhas 26-69, componente `CartaoDialog` e campo de validade)
- `sistema financas/backend/src/routes/cards.ts` (linhas 63-125, rota `POST /api/cards`)
- `sistema financas/backend/src/db/schema/cards.ts` (linha 31, coluna `expiration: varchar('validade', { length: 7 })`)
- `sistema financas/src/screens/config/AcessosTab.tsx` (linhas 130-138, aviso de captura de acessos)
- `sistema financas/backend/src/routes/analytics.ts` (linhas 36-38 e 160-198, detecção de tabela ausente via erro Postgres `42P01`)
- `sistema financas/backend/drizzle/0013_analytics_events.sql` (migration ainda não aplicada em produção)

## Problema

### 1. Campo "Validade" do cartão aceita formato inválido

O campo de validade no dialog "Novo cartão" (`CartaoTab.tsx:67-69`) é um `<Input>` de texto livre com `hint="MM/AA"` e `placeholder="12/28"`, mas não força esse formato. O único controle é `maxLength={5}`, que limita quantidade de caracteres, não o padrão `MM/AA`. Isso permite que o usuário digite, por exemplo, `"12222"` (5 dígitos sem barra), que passa despercebido pela validação de frontend.

### 2. Erro genérico e não tratado ao salvar validade inválida

Ao submeter um valor de validade fora do formato esperado, o payload é enviado para `POST /api/cards` (`cards.ts:63-125`), que não valida o formato de `validade` antes do insert. O valor segue cru para o banco (`cards.ts:117`). A coluna `validade` é `varchar(7)` (`db/schema/cards.ts:31`), então não deveria estourar por tamanho com uma string de 5 caracteres — a causa exata do erro 500 não foi confirmada, pois o `catch` genérico da rota (`cards.ts:121-124`) mascara a mensagem real do Postgres, apenas logando no console do servidor. O usuário final vê apenas "Failed to create card", sem entender o que precisa corrigir.

### 3. Mensagem técnica interna exposta na tela de Acessos em produção

A tela "Config › Acessos" (`AcessosTab.tsx:130-138`) exibe, quando a tabela `analytics_events` não existe no banco, um aviso amarelo contendo o caminho literal de um arquivo de migration: *"Aplique a migration backend/drizzle/0013_analytics_events.sql para gravar acessos e logins."* Essa condição (`eventsAvailable: false`) é retornada pelo backend em `analytics.ts:160-198` quando detecta o erro Postgres `42P01` (tabela inexistente).

Isso ocorre porque a migration `0013_analytics_events.sql` foi aplicada no ambiente local, mas não no banco de produção/remoto — portanto o aviso técnico aparece atualmente para o ambiente que o cliente final acessa. Independentemente de a migration ser aplicada ou não, uma mensagem citando caminho de arquivo interno e nome de migration não deveria estar acessível a um usuário final, mesmo que a aba tenha alguma restrição de acesso.

### 4. Tela de Acessos mostra mais informação do que o necessário

A tela "Config › Acessos" (`AcessosTab.tsx`) atualmente exibe: 4 cards de resumo (Acessos na página, Logins, Contas criadas, Usuários ativos), um gráfico de "Movimento diário" (`AcessosTab.tsx:160-206`), "Páginas mais acessadas" (`AcessosTab.tsx:208-231`) e "Últimas contas criadas" (`AcessosTab.tsx:233-256`).

Segundo o usuário, o que interessa de fato é: os cards de resumo (mantendo o de "Contas criadas") e a lista de "Últimas contas criadas". Devem ser removidos: o bloco "Movimento diário" (gráfico de barras diário), o card "Acessos na página" e o bloco "Páginas mais acessadas" — este último também depende dos mesmos dados de `analytics_events` de navegação, que o usuário confirmou não interessarem.

## Objetivo

Garantir que:

1. O campo de validade do cartão só aceite e envie valores no formato `MM/AA`, prevenindo o erro na origem.
2. Caso ocorra falha ao salvar um cartão, o usuário receba uma mensagem de erro compreensível e específica, não um erro genérico de servidor.
3. Nenhuma mensagem técnica interna (caminhos de arquivo, nomes de migration, detalhes de schema/infra) seja exibida na interface para o cliente final, em nenhum ambiente.
4. A tela "Config › Acessos" mostre apenas o que o usuário considera relevante: os cards de resumo e a lista de "Últimas contas criadas", removendo o gráfico de movimento diário, o card "Acessos na página" e "Páginas mais acessadas".

## Decisão Técnica Desejada

- Frontend: aplicar máscara de entrada `MM/AA` no campo de validade (auto-inserção de "/" após o 2º dígito, restrição a dígitos) e validar o formato antes do submit, bloqueando o envio se inválido.
- Backend: validar o formato de `validade` (regex `MM/AA`) na rota `POST /api/cards` e `PUT /api/cards/:id` antes do insert/update, retornando erro 400 com mensagem clara quando inválido — seguindo o mesmo padrão já usado para outras validações da rota (ex.: `cards.ts:69-84`).
- Investigar e registrar, durante o planejamento ou implementação, a causa exata do erro 500 atual (via log do Postgres) para confirmar se há alguma constraint adicional além do tamanho da coluna.
- Frontend (Acessos): substituir a mensagem técnica por um texto genérico voltado ao usuário final (ex.: "Estatísticas de acesso ainda não disponíveis"), sem citar caminhos de arquivo ou nomes de migration.
- Avaliar, durante o planejamento, se a aba "Acessos" deveria estar oculta da navegação para usuários que não sejam o dono/admin do sistema (o backend já restringe a API por CPF em `requireAnalyticsAccess`, mas não está confirmado se o frontend também restringe a visibilidade da aba).
- Frontend (Acessos): remover da tela o bloco "Movimento diário" (`AcessosTab.tsx:160-206`), o card "Acessos na página" (parte do array `cards`, `AcessosTab.tsx:63-92`) e o bloco "Páginas mais acessadas" (`AcessosTab.tsx:208-231`), mantendo os demais cards de resumo (Logins, Contas criadas, Usuários ativos) e o bloco "Últimas contas criadas" (`AcessosTab.tsx:233-256`).
- Avaliar, durante o planejamento/implementação, se a remoção desses blocos torna dispensável parte dos dados hoje calculados no backend (`analytics.ts`, ex.: `dailyResult`, `pagesResult`, `page_views_*`) — não é obrigatório remover o backend nesta task, mas deve ficar registrado se algo ficou órfão.
- A aplicação da migration `0013_analytics_events.sql` em produção é uma ação de banco separada, que **não faz parte desta task de código** e exige confirmação explícita do usuário antes de ser executada, conforme regra do projeto.

## Escopo Funcional

### Dentro do escopo

- Máscara e validação de formato `MM/AA` no campo de validade do cartão (frontend).
- Validação de formato de `validade` no backend (rotas de criação e edição de cartão).
- Mensagem de erro específica e compreensível quando a validade for rejeitada.
- Investigação da causa exata do erro 500 atual ao salvar validade inválida.
- Substituição da mensagem técnica exibida em "Config › Acessos" por uma mensagem genérica, sem detalhes de infraestrutura.
- Revisão de visibilidade da aba "Acessos" para usuários comuns vs. usuário autorizado.
- Remoção dos blocos "Movimento diário", card "Acessos na página" e "Páginas mais acessadas" da tela de Acessos, mantendo cards de resumo restantes e "Últimas contas criadas".

### Fora do escopo inicial

- Aplicar a migration `0013_analytics_events.sql` em produção (ação de banco separada, requer confirmação explícita do usuário).
- Redesenhar a tela de Acessos/analytics além da remoção dos blocos indicados e da mensagem de aviso.
- Remover ou alterar as rotas/queries de backend que hoje alimentam "Movimento diário" e "Páginas mais acessadas" (`analytics.ts`) — a menos que o planejamento identifique que isso deve ser limpo junto; se não for trivial/seguro, pode ficar como dívida técnica registrada.
- Alterar o schema da coluna `validade` no banco (tipo, tamanho) — a menos que a investigação do erro 500 mostre que isso é estritamente necessário, o que deve ser tratado como decisão à parte.
- Revisão geral de outras mensagens técnicas expostas em outras telas do sistema (não identificadas nesta sessão).

## Requisitos de Frontend

- Adicionar máscara de input para o campo "Validade" em `CartaoTab.tsx`, formatando automaticamente para `MM/AA` enquanto o usuário digita.
- Validar o formato antes de permitir o submit do formulário (bloquear ou exibir erro inline).
- Exibir mensagem de erro amigável vinda do backend quando a validade for rejeitada no submit.
- Em `AcessosTab.tsx`, substituir o texto do aviso amarelo por uma mensagem sem referência a arquivos, migrations ou detalhes de schema.
- Confirmar (e ajustar se necessário) a condição de exibição/navegação da aba "Acessos" para que não fique visível a usuários sem permissão.
- Em `AcessosTab.tsx`, remover o bloco "Movimento diário" (gráfico de barras por dia), o card "Acessos na página" e o bloco "Páginas mais acessadas", mantendo os cards "Logins", "Contas criadas", "Usuários ativos" e o bloco "Últimas contas criadas".
- Ajustar o layout da tela (grid) após a remoção desses blocos, já que hoje eles ocupam a maior parte do espaço vertical/horizontal da página.

## Requisitos de Backend

- Adicionar validação de formato `MM/AA` (ex.: regex `^\d{2}\/\d{2}$`) para o campo `validade` nas rotas `POST /api/cards` e `PUT /api/cards/:id` em `cards.ts`, retornando `400` com mensagem clara quando inválido, seguindo o padrão das validações já existentes na mesma rota.
- Investigar a causa exata do erro 500 atual ao inserir `validade` fora do formato esperado (checar log do Postgres via `console.error` já existente em `cards.ts:122`).
- Nenhuma alteração nas rotas de `analytics.ts` é esperada além de, se necessário, garantir que o payload retornado não inclua detalhes internos adicionais.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente para o problema de validação do cartão.

A aplicação da migration `0013_analytics_events.sql` em produção é necessária para que a tela de Acessos funcione plenamente, mas essa execução está fora do escopo desta task de código e deve ser tratada separadamente, com confirmação explícita do usuário antes de rodar em produção.

## Requisitos de Segurança e Multi-Tenant

Este projeto é de uso pessoal/solo-dev (não multi-tenant, conforme memória de projeto), portanto não há isolamento entre prefeituras a considerar. Ainda assim:

- Mensagens de erro para o usuário final não devem expor detalhes de implementação, infraestrutura, nomes de arquivos internos ou stack traces.
- Confirmar que o controle de acesso à API de analytics (`requireAnalyticsAccess`, restrito por CPF) permanece intacto e que a visibilidade da aba no frontend é consistente com essa restrição.

## Requisitos de Migração ou Compatibilidade

- Cartões já cadastrados com valores de `validade` fora do formato `MM/AA` (se existirem) não devem quebrar a tela ao serem exibidos; validar apenas na escrita (criação/edição), não impedir leitura de dados legados.
- Nenhuma alteração de contrato de API é esperada além de mensagens de erro mais específicas.

## Requisitos de Testes

### Frontend

- Testar que o campo de validade formata automaticamente para `MM/AA` durante a digitação.
- Testar que o submit é bloqueado (ou exibe erro) quando a validade está incompleta ou fora do formato.
- Testar que a tela de Acessos não exibe mais texto técnico (caminho de arquivo/migration) quando `eventsAvailable` for `false`.
- Testar que a tela de Acessos não renderiza mais "Movimento diário", card "Acessos na página" nem "Páginas mais acessadas", e que "Últimas contas criadas" e os demais cards continuam funcionando normalmente.

### Backend

- Testar que `POST /api/cards` e `PUT /api/cards/:id` retornam 400 com mensagem clara para `validade` fora do formato `MM/AA`.
- Testar que valores válidos (`"12/28"`) continuam sendo aceitos e persistidos corretamente.

### E2E

- Não aplicável inicialmente.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/src/screens/config/AcessosTab.tsx`
- Possivelmente `sistema financas/src/ui/form.tsx` ou componente `Input`, caso a máscara seja implementada como componente reutilizável (a identificar durante o planejamento).

### Backend

- `sistema financas/backend/src/routes/cards.ts`

### Banco de Dados

- Nenhuma alteração de schema identificada para o problema de validação do cartão.
- `sistema financas/backend/drizzle/0013_analytics_events.sql` — aplicação pendente em produção, fora do escopo desta task, tratar separadamente.

## Critérios de Aceite

- O campo "Validade" do cartão não aceita mais valores fora do formato `MM/AA` no frontend.
- O backend rejeita com erro 400 e mensagem clara qualquer `validade` fora do formato `MM/AA`, nas rotas de criação e edição de cartão.
- O erro genérico "Failed to create card" não ocorre mais para esse cenário específico de validade inválida.
- A tela "Config › Acessos" não exibe mais caminhos de arquivo, nomes de migration ou qualquer detalhe técnico de infraestrutura na mensagem ao usuário.
- Fica documentada (no plano ou na implementação) a conclusão sobre se a aba "Acessos" está ou não visível para usuários sem permissão, com ajuste se necessário.
- A tela "Config › Acessos" exibe apenas os cards de resumo restantes ("Logins", "Contas criadas", "Usuários ativos") e o bloco "Últimas contas criadas"; "Movimento diário", card "Acessos na página" e "Páginas mais acessadas" não são mais renderizados.
- Nenhuma migration é executada como parte desta task.

## Perguntas Para o Planejamento

- Qual é a causa exata do erro 500 atual no Postgres ao inserir `validade` fora do formato — é uma constraint de schema, erro de tipo, ou outro motivo? (Deve ser confirmada via log antes de decidir se há necessidade de alterar o schema.)
- A aba "Acessos" já está de alguma forma oculta da navegação para usuários comuns, ou está visível para todos que acessam `Config`?
- Existe algum componente de input com máscara já usado em outras partes do projeto (ex.: telefone, CPF) que possa ser reaproveitado para o padrão `MM/AA`?
- Existem outros pontos no sistema com mensagens técnicas semelhantes expostas ao usuário final, que valeriam uma varredura mais ampla (fora do escopo desta task, mas podem justificar uma task futura)?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` e `sistema financas/AGENT.md`. Nota: ambos os arquivos encontrados descrevem um contexto genérico de "sistema multi-prefeitura, multi-tenant + RLS" que não corresponde a este projeto (uso pessoal, solo-dev, sem multi-tenancy) — desconsiderar as seções específicas de isolamento entre prefeituras/tenants ao planejar, mas manter as práticas gerais de qualidade de código, validação no backend e não mascarar erros importantes, que são aplicáveis.
- Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` separados neste projeto.
- Inspecione os arquivos citados antes de escrever o plano, especialmente o log real do erro 500 em `cards.ts`, se possível reproduzi-lo.
- Classifique a implementação como `frontend + backend`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere um plano em `.plans/` (padrão deste projeto, conforme `CLAUDE.md`) com etapas pequenas, revisáveis e seguras.
