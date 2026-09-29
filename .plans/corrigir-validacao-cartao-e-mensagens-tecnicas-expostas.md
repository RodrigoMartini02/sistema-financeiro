# Plano de Implementação: Corrigir validação de validade do cartão, mensagens técnicas expostas e simplificar tela de Acessos

## Origem

- Arquivo de especificação: `.portal/tasks/corrigir-validacao-cartao-e-mensagens-tecnicas-expostas.md`
- Data do planejamento: `2026-08-05`
- Classificação: `frontend + backend`

## Resumo

Implementa três correções relacionadas identificadas em revisão exploratória do `sistema financas`: (1) o campo "Validade" do cartão passa a aceitar e validar apenas o formato `MM/AA`, no frontend e no backend, evitando o erro genérico "Failed to create card"; (2) a tela "Config › Acessos" deixa de expor caminho de arquivo/nome de migration em sua mensagem de aviso; (3) a mesma tela é simplificada para mostrar só o que interessa (cards de resumo + últimas contas criadas), removendo "Movimento diário", o card "Acessos na página" e "Páginas mais acessadas", com a limpeza correspondente no backend.

## Escopo

### Dentro do escopo

- Máscara `MM/AA` no campo de validade do cartão (frontend), seguindo o padrão já usado em `formatCNPJ` (`ClientesTab.tsx`).
- Validação de formato `validade` no backend (`POST /api/cards`, `PUT /api/cards/:id`), com erro 400 e mensagem clara.
- Mensagem genérica (sem caminho de arquivo/migration) no aviso de "Config › Acessos".
- Remoção de "Movimento diário", card "Acessos na página" e "Páginas mais acessadas" do frontend (`AcessosTab.tsx`).
- Remoção das queries/campos correspondentes no backend (`analytics.ts`, rota `GET /overview`): `dailyResult`, `pagesResult`, `page_views_total`, `page_views_in_period`.
- Ajuste de layout/grid da tela de Acessos após a remoção dos blocos.
- Documentar que a visibilidade da aba "Acessos" já está corretamente restrita — nenhuma mudança de código necessária nesse ponto.

### Fora do escopo

- Aplicar a migration `0013_analytics_events.sql` em produção (ação de banco separada, requer confirmação explícita).
- Remover `recordAnalyticsEvent`/tracking de `page_view` em si (continua sendo usado para o card "Logins", que depende de `event_type = 'login'` na mesma tabela).
- Alterar o schema da coluna `validade` no banco.
- Investigar/corrigir outras mensagens técnicas expostas em outras telas do sistema.
- Testes manuais em tela/navegador — a validação desta implementação se limita a lint/typecheck/build (e testes automatizados, se existirem).

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — ambos descrevem um contexto genérico "sistema multi-prefeitura, multi-tenant + RLS" que não se aplica a este projeto pessoal solo-dev; as seções de isolamento entre tenants/prefeituras e RLS foram desconsideradas. Mantidas as práticas gerais aplicáveis: validar no backend, não mascarar erros importantes, nomes claros, seguir padrões existentes.
- `.portal/tasks/corrigir-validacao-cartao-e-mensagens-tecnicas-expostas.md` (especificação de entrada).
- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/backend/src/routes/cards.ts`
- `sistema financas/backend/src/db/schema/cards.ts`
- `sistema financas/src/screens/config/AcessosTab.tsx`
- `sistema financas/backend/src/routes/analytics.ts`
- `sistema financas/backend/src/services/analytics.ts`
- `sistema financas/src/screens/config/ConfigScreen.tsx`
- `sistema financas/src/layout/AppShell.tsx`
- `sistema financas/src/screens/config/ClientesTab.tsx` (padrão de máscara `formatCNPJ`)
- `sistema financas/src/services/configService.ts`
- `sistema financas/backend/drizzle/*.sql` (nenhuma migration versionada cobre a tabela `cartoes`)

## Impacto por área

### Frontend

- `CartaoTab.tsx`: adicionar função `formatValidade(raw)` (extrai dígitos, limita a 4, insere `/` após o 2º dígito) e trocar o `<Input name="validade" defaultValue={...} />` (linhas 67-69) por um componente controlado (`value`/`onChange`), seguindo o mesmo padrão de `formatCNPJ` em `ClientesTab.tsx:22-29,44,76-80`. Bloquear submit quando o valor estiver preenchido mas incompleto (ex.: `"12/2"`).
- `CartaoTab.tsx`: exibir mensagem de erro vinda do backend na área de erro já existente do dialog (`error` prop, linha 142) quando a validade for rejeitada no submit.
- `AcessosTab.tsx`: remover o card "Acessos na página" do array `cards` (linhas 63-92); remover o bloco "Movimento diário" (linhas 160-206) e o bloco "Páginas mais acessadas" (linhas 208-231); ajustar o grid `xl:grid-cols-[1.4fr_0.9fr]` (linha 160) para um layout adequado ao conteúdo restante (cards de resumo + "Últimas contas criadas").
- `AcessosTab.tsx`: substituir o texto do aviso em `eventsAvailable === false` (linhas 130-138) por uma mensagem genérica, sem caminho de arquivo nem nome de migration (ex.: "Estatísticas de acesso ainda não disponíveis").
- Ajustar `analyticsService.ts` (ou equivalente) se o tipo de retorno do overview precisar refletir a remoção de campos do payload do backend.

### Backend

- `cards.ts` (rota): adicionar validação de `validade` com regex `^\d{2}\/\d{2}$` em `POST /` (antes do insert, próximo às validações existentes em linhas 69-84) e em `PUT /:id` (antes do update, próximo às validações existentes em linhas 191-202). Campo continua opcional — só validar formato quando um valor for enviado. Retornar 400 com mensagem clara (ex.: "Validade must be in MM/AA format") quando inválido.
- `analytics.ts` (rota `GET /overview`): remover a query `dailyResult` (bloco `WITH days AS...`, linhas 93-126) e a query `pagesResult` (linhas 128-137); remover os campos `page_views_total`/`page_views_in_period` de `eventsResult` (linhas 82-91) e do objeto de resposta (`summary`, `daily`, `topPages`); manter `logins_total`, `logins_in_period`, `login_users_in_period`, `accountsResult` e `recentAccountsResult` intactos. Ajustar o branch de fallback `isMissingTableError` (linhas 160-198) na mesma proporção, removendo os campos correspondentes da resposta simplificada.
- `analytics.ts` (service): nenhuma alteração — `recordAnalyticsEvent` continua registrando `page_view` e `login`, pois o card "Logins" depende de `event_type = 'login'` na mesma tabela `analytics_events`.

### Banco de dados

`Sem impacto esperado` — nenhuma migration nova nesta implementação. A aplicação de `0013_analytics_events.sql` em produção permanece pendente e fora de escopo, a ser tratada separadamente com confirmação explícita do usuário.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/backend/src/routes/cards.ts`
- `sistema financas/src/screens/config/AcessosTab.tsx`
- `sistema financas/backend/src/routes/analytics.ts`
- `sistema financas/src/services/analyticsService.ts` (se existir e precisar de ajuste de tipos)

## Estratégia de implementação

1. Backend: adicionar validação de formato `validade` em `cards.ts` (`POST /` e `PUT /:id`), com mensagem de erro clara em caso de formato inválido.
2. Frontend: implementar `formatValidade` e trocar o input de validade para controlado em `CartaoTab.tsx`; propagar mensagem de erro do backend na UI existente.
3. Backend: simplificar `GET /api/analytics/overview` em `analytics.ts`, removendo `dailyResult`, `pagesResult` e os campos `page_views_*` do summary e do payload de resposta (incluindo o branch de fallback de tabela ausente).
4. Frontend: remover os blocos "Movimento diário", card "Acessos na página" e "Páginas mais acessadas" de `AcessosTab.tsx`; ajustar grid/layout; trocar o texto do aviso de tabela ausente para uma mensagem genérica.
5. Ajustar tipos no frontend (`analyticsService.ts` ou equivalente) caso o payload do backend tenha mudado de forma incompatível com o tipo TypeScript existente.
6. Rodar comandos de validação (lint/typecheck/build) de frontend e backend.

## Regras de negócio identificadas

- Validade do cartão deve seguir estritamente o formato `MM/AA` quando informada; o campo continua opcional.
- Mensagens de erro/aviso na UI nunca devem expor caminhos de arquivo, nomes de migration ou detalhes de schema/infraestrutura.
- A tela de Acessos deve mostrar apenas: cards "Logins", "Contas criadas", "Usuários ativos" e o bloco "Últimas contas criadas".

## Regras multi-tenant e segurança

Não aplicável — projeto solo-dev, sem multi-tenancy. Pontos mantidos:

- Validação de formato sempre reforçada no backend, não apenas no frontend.
- Mensagens de erro não vazam detalhes de implementação/infraestrutura.
- O controle de acesso à aba/API de Acessos permanece via CPF (`ANALYTICS_ALLOWED_DOCUMENT`), já confirmado como corretamente restrito em três camadas: navegação (`AppShell.tsx:355-357`), conteúdo (`ConfigScreen.tsx:62-65`) e API (`requireAnalyticsAccess` em `analytics.ts`). Nenhuma mudança necessária aqui.

## Validações necessárias

- Frontend: campo `validade` só aceita dígitos, formata automaticamente para `MM/AA`, bloqueia submit se preenchido de forma incompleta.
- Backend: `validade` deve casar com `^\d{2}\/\d{2}$` quando fornecido; string vazia ou ausente continua sendo aceita (campo opcional).

## Testes necessários

### Frontend

- Não aplicável nesta implementação (sem testes automatizados de frontend identificados para esse fluxo; validação por lint/typecheck/build).

### Backend

- Não aplicável nesta implementação, a menos que existam testes automatizados já cobrindo `cards.ts`/`analytics.ts` no projeto — nesse caso, ajustá-los para refletir as novas validações e o payload simplificado.

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
```

Os comandos exatos devem ser confirmados durante a implementação, de acordo com os scripts reais definidos nos `package.json` do projeto.

## Riscos e pontos de atenção

- **Causa exata do erro 500 relatado não foi confirmada nesta investigação**: não há migration versionada no repositório para a tabela `cartoes` (as 13 migrations existentes em `backend/drizzle/` cobrem outras tabelas). Não é possível garantir, sem acesso a logs de produção, que o schema real do banco corresponde ao `cards.ts` (Drizzle). A validação de formato implementada deve prevenir o cenário relatado (`"12222"`), mas se a causa raiz for outra (ex.: divergência de schema em produção), o erro genérico pode persistir para outros casos — isso ficaria como investigação separada.
- Remover campos do payload de `GET /api/analytics/overview` (`page_views_*`, `daily`, `topPages`) é uma mudança de contrato de API — considerada segura porque o frontend deste mesmo projeto é o único consumidor conhecido dessa rota.
- Ambiente pode estar apontando para produção; nenhuma migration será executada nesta implementação.

## Perguntas em aberto

- A causa exata do erro 500 (schema real do banco de produção para a tabela `cartoes`) não pôde ser confirmada nesta investigação — pode exigir checar logs do servidor durante ou após a implementação, caso o erro persista mesmo após a validação de formato.

## Critérios de aceite do plano

- Campo de validade do cartão só aceita e envia valores no formato `MM/AA`.
- Backend rejeita com 400 (mensagem clara) qualquer `validade` fora do formato, nas rotas de criação e edição de cartão.
- Tela "Config › Acessos" não exibe mais texto técnico (caminho de arquivo/migration) na mensagem de aviso.
- Tela "Config › Acessos" não renderiza mais "Movimento diário", card "Acessos na página" nem "Páginas mais acessadas"; mantém "Logins", "Contas criadas", "Usuários ativos" e "Últimas contas criadas".
- Backend de `GET /api/analytics/overview` não calcula mais os dados não utilizados pelo frontend (`dailyResult`, `pagesResult`, `page_views_*`).
- Nenhuma migration é executada como parte desta implementação.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations sem confirmação explícita do usuário.
- Seguir as práticas gerais de `/AGENT.md` e `sistema financas/AGENT.md` que são aplicáveis a este projeto (validação no backend, não mascarar erros, nomes claros, seguir padrões existentes), ignorando as seções específicas de multi-tenant/RLS que não correspondem a este projeto pessoal.
- Manter alterações pequenas e focadas; podem ser feitas em commits/revisões separáveis (cartão vs. Acessos), se fizer sentido durante a implementação.
- Não é necessário alterar a visibilidade da aba "Acessos" — já está corretamente restrita em três camadas.
- Não realizar testes manuais em tela/navegador; validar apenas via lint/typecheck/build (e testes automatizados existentes, se houver).
