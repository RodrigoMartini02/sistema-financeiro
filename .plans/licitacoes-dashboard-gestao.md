# Plano de Implementação: Dashboard de gestão de Licitações (antigo Início), menu Editais e exclusão de Notificações

## Origem

- Arquivo de especificação: nenhum. A origem é o pedido do usuário na conversa de 26/10/2026 (dashboard de números e gráficos de quantidade, um card por modalidade, exclusão da tela Notificações, renomeações).
- Substitui a parte do Início do plano `.plans/licitacoes-inicio-painel.md` (já entregue na `main`, commit `b57ab577`): o Início daquele plano é apagado e refeito.
- Data do planejamento: `2026-10-26`
- Classificação: `frontend + backend` (mais documentação). Sem banco de dados e sem infra/deploy.

## Resumo

Primeiro apagar: a tela Notificações (e o que só existia por causa dela) e o Início de hoje inteiro. Depois construir do zero o Dashboard: cards de quantidade, um card por modalidade e gráficos fáceis de ler. Sem valor de edital em R$ e sem listas (as listas ficam nas telas próprias). "Início" passa a se chamar "Dashboard" e o título do menu "Buscar" passa a "Editais". O código antigo é eliminado por completo: sem comentário de "removido", sem função, prop, parâmetro ou filtro que só existia por causa dele.

## Decisões aplicadas

- Publicações (cards e gráficos): contam todos os editais da base, não só os das buscas salvas.
- "Participei": derivado do prazo (edital marcado como Vou participar com prazo de proposta vencido). Não cria status novo nem migration. Assumido na sugestão; o usuário não objetou.
- Início de hoje: apagado por inteiro e refeito do zero, sem listas nem valor em R$ de edital; o guia da conta vazia também sai.
- Cartão "Editais alterados": sai junto com as notificações.
- Sino: passa a ser o único lugar das notificações, com as 10 mais recentes (sem filtro por tipo, sem "só não lidas" e sem histórico além dessas).
- Backend: perde os filtros `type` e `unreadOnly` de `GET /notifications` e o `notificationTypes` do `/domains` (nenhum cliente os usa mais).
- Endereço antigo `/licitacoes/app/notificacoes`: cai em "Página não encontrada", sem redirecionamento.
- "Buscar" para "Editais": só o título do menu e os textos que citam a tela pelo nome; o endereço `/buscar` e a chave `buscar` continuam (o endereço `/editais` colidiria com `/editais/:id`).
- Branch: a ativa, `feat/R/licitacoes-inicio-painel` (já mesclada na `main`; vai um commit novo e um merge depois).

## Escopo

### Dentro do escopo

**Parte A: exclusão**
- Tela Notificações, o item de cartão que só ela usa (`NotificationItem`), a rota, o item de menu (com ícone e teste do menu) e o "Ver todas" do sino.
- Chave de query `notificationInfiniteList` e a asserção dela no teste do cache das listas.
- Sobras sem uso: `highlighted` do `ListCard` (e "notificações" nos comentários dele e do `queryKeys.ts`); `NotificationFilters`, `notificationsQuery` e `NOTIFICATION_PANEL_FILTERS` (viram uma constante da consulta do sino); `onOpen` de `useOpenNotification` passa a ser obrigatório.
- Backend: filtros `type` e `unreadOnly` (validação da rota, `readNotificationFilters`, `NotificationListFilters`; `listNotifications` passa a receber `page` e `perPage`), `notificationTypes` do `/domains` (e do tipo `DomainLists` no front), com os testes.

**Parte B: Dashboard**
- Apagar o Início de hoje: `HomeScreen`, `DashboardCards`, `DashboardAgenda`, `DashboardSearches`, `DashboardActivity`, `DashboardPanel`, `DashboardSetupGuide` e a lista de `DashboardContracts`; as funções de agenda, de selo de busca, de funil e de texto de indicador de `utils/dashboard.ts`; `formatCompactMoney`; os testes delas.
- Backend: refazer a resposta do `/dashboard` sem `pipeline`, `closingSoon`, `favorites`, listas de buscas, `notifications`, `unreadChanges`, `enteredLast…` e `setup`; tirar `newBySearch` de `savedSearchMatches.ts`; a rota `/dashboard/contracts` fica sem a lista `nearest` (só contagens e divisão por categoria).
- 8 cards, todos em quantidade:
  1. Publicados ontem, com 7 e 30 dias na legenda.
  2. Abertos agora.
  3. Novos hoje nas minhas buscas.
  4. Em análise.
  5. Vou participar.
  6. Encerrando em 7 dias.
  7. Participei.
  8. Contratos vencendo em 30 dias (com 60 e 90 na legenda).
- Um card por modalidade: número grande de publicados em 30 dias; linhas de abertos, em análise, vou participar e participei; mini-barras dos 30 dias (sem eixo); clique abre Editais filtrado pela modalidade. Aparecem só as modalidades que a base tem.
- 7 gráficos:
  1. Publicações por dia (30 dias) ou por mês (12 meses), com alternador, barras empilhadas por modalidade, com o aviso "dados desde dd/mm" quando a coleta é mais recente que a janela.
  2. Funil dos últimos 30 dias: acompanhados (editais com entrada de Analisar ou Vou participar no histórico), vou participar e participei, com a % entre as etapas.
  3. Carga de prazos: quantos acompanhados encerram em cada uma das próximas 4 semanas.
  4. Abertos por UF (top 10), que já existe.
  5. Esfera dos abertos (federal, estadual, municipal), em barras horizontais.
  6. Quem mais publica: top 10 órgãos no período, com link para a página do CNPJ.
  7. Contratos que vencem em 30, 60 e 90 dias, com a divisão por categoria.
- Renomeações: "Início" para "Dashboard" (menu, título, chave `inicio` para `dashboard`, `HomeScreen` para `DashboardScreen`, "Voltar para o Início", as frases do cartão de busca salva que citam o Início, comentários e README); título do menu "Buscar" para "Editais" (menu e título da barra, os textos "Ir para Buscar" e "em Buscar", comentários e README).
- README do módulo: remover a tela Notificações (linhas 623, 631, 679-681), descrever o Dashboard (linha 640) e o menu Editais.

### Fora do escopo

- Status novo "Participei" (exigiria migration) e qualquer indicador de ganhou/perdeu.
- Coletar mais modalidades ou editais sem prazo (aumenta o tempo do Cron Job, a US$ 0,00058 por minuto).
- Acompanhamentos por pessoa da equipe e valores em R$ de edital.
- Mudar o endereço `/buscar`.
- O sistema de notificações do app de Finanças (`/api/notificacoes`, AppShell e push); a geração dos avisos pelo coletor; as rotas de contar e marcar como lida; o sino além do "Ver todas".
- O parâmetro `enabled` de `useUnreadNotificationsCount` (já era constante antes desta mudança).
- Os `.plans/` antigos.

## Leitura de contexto

- `/AGENT.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem neste projeto; o `AGENT.md` da raiz cobre o repositório inteiro.
- Arquivo `.md` da feature: não há; a origem é a conversa.
- Arquivos do projeto lidos:
  - Front (`src/tenders/`): `HomeScreen.tsx`, `DashboardCards.tsx`, `NotificationsScreen.tsx`, `NotificationsBell.tsx`, `NotificationItem.tsx`, `ListCard.tsx`, `TendersApp.tsx`, `layout/TendersSidebar.tsx`, `utils/navigation.ts`, `utils/notifications.ts` (e teste), `utils/searchFilters.ts`, `hooks/useNotificationActions.ts`, `hooks/useUnreadNotificationsCount.ts`, `services/queryKeys.ts`, `services/listCache.test.ts`, `types.ts`.
  - Gráficos do Painel de finanças: `src/screens/finance/painel/graficos/Barras.tsx`, `Pizza.tsx`, `BarrasHorizontais.tsx`, `coresGrafico.ts`, `base.tsx`.
  - Back (`backend/src/modules/tenders/`): `services/dashboard.ts`, `savedSearchMatches.ts`, `notificationInbox.ts`, `contractSavedSearches.ts`, `dashboardContracts.ts`, `routes/notifications.ts`, `routes/overview.ts`, `routes/requestReaders.ts`, `contractStore/queries.ts`, `db/schema.ts`, `domains.ts`, `collector/config.ts`, `collector/runs.ts`, `collector/repository.ts` (limpeza), `README.md`.

## Impacto por área

### Frontend

- Telas: `DashboardScreen` (renomeada de `HomeScreen`, refeita); `NotificationsScreen` apagada.
- Componentes: apagar `NotificationItem`, `DashboardAgenda`, `DashboardSearches`, `DashboardActivity`, `DashboardPanel`, `DashboardSetupGuide`; refazer `DashboardCards` e `DashboardContracts`; criar os cards por modalidade e os gráficos (publicações, funil, carga de prazos, esfera, órgãos), reaproveitando `Barras` e a paleta do Painel de finanças (`coresGrafico.ts`) e `CountBars`. Tirar `highlighted` de `ListCard`.
- Hooks e query keys: `useExpiringContracts` mantido (resposta só com contagens); sai `notificationInfiniteList`; `useOpenNotification(onOpen)` com parâmetro obrigatório; o sino com `NOTIFICATION_PANEL_QUERY` constante.
- Estados: carregando, erro e vazio em cada bloco (conta sem acompanhamento vê zeros e gráficos vazios com texto), alternador de período, aviso "dados desde".
- Navegação: `dashboard` e título "Dashboard"; título "Editais"; sem `notificacoes`.
- Tema claro e escuro e celular: cards em 2 colunas no celular, sem rolagem horizontal.
- Testes: funções puras em `utils/` (séries com zeros, empilhamento, % do funil, semanas, aviso de cobertura, cards por modalidade), menu e títulos, cache das listas.

### Backend

- `GET /api/tenders/dashboard`: resposta nova com cards, publicações (por dia e por mês, por modalidade, até ontem), cards por modalidade, funil, carga de prazos, abertos por UF, esfera, top órgãos, início da coleta e a última atualização. Sugestão de organização: serviço novo para as consultas globais sobre `edital` e `dashboard.ts` para o que é da conta e a montagem.
- `GET /api/tenders/dashboard/contracts`: contagens 30, 60 e 90 dias e por categoria; sem `nearest`; `summarizeExpiring` passa a uma consulta só.
- `GET /api/tenders/notifications`: só `page` e `perPage`; `GET /domains` sem `notificationTypes`.
- Multi-tenant: `edital` é tabela global e pública; acompanhamentos, funil e carga de prazos filtram por `accountId`; buscas por `accountId` e `userId`; sempre a partir de `tenderAccessOf(req)`.
- Testes de banco e do armazém atualizados e novos (ver "Testes").

### Banco de dados

Sem impacto esperado. As consultas novas usam colunas e índices existentes (`data_publicacao_pncp`, `modalidade_id`, `uf`, `esfera`, `orgao_cnpj`, `data_encerramento_proposta`, histórico de acompanhamento).

Importante: este plano não autoriza executar migrations automaticamente.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado. Nenhuma variável de ambiente, job ou storage novo; sem custo adicional no Render.

## Arquivos provavelmente afetados

Frontend (`src/tenders/`):
- `screens/HomeScreen.tsx` (renomeado para `DashboardScreen.tsx`), `components/DashboardCards.tsx`, `components/DashboardContracts.tsx`, `components/CountBars.tsx`
- Apagar: `screens/NotificationsScreen.tsx`, `components/NotificationItem.tsx`, `components/DashboardAgenda.tsx`, `components/DashboardSearches.tsx`, `components/DashboardActivity.tsx`, `components/DashboardPanel.tsx`, `components/DashboardSetupGuide.tsx`
- Novos componentes do dashboard (cards por modalidade, publicações, funil, carga de prazos, esfera, órgãos)
- `utils/dashboard.ts` e `utils/dashboard.test.ts`, `utils/money.ts`, `utils/navigation.ts`, `utils/notifications.ts` e `utils/notifications.test.ts`, `utils/tendersUtils.test.ts`
- `types.ts`, `TendersApp.tsx`, `layout/TendersSidebar.tsx`, `layout/NotificationsBell.tsx`, `hooks/useNotificationActions.ts`, `hooks/useExpiringContracts.ts`, `services/queryKeys.ts`, `services/listCache.test.ts`, `components/ListCard.tsx`
- Textos: `screens/NotFoundScreen.tsx`, `components/SavedSearchCard.tsx`, `components/NoticeDetailView.tsx`, `screens/CnpjScreen.tsx`, `screens/NoticeScreen.tsx`, `screens/FavoritesScreen.tsx`, `screens/TrackingScreen.tsx`, e comentários que citam Início ou Buscar
- Reaproveitados sem mudar (ou só consumidos): `src/screens/finance/painel/graficos/Barras.tsx`, `src/screens/finance/painel/coresGrafico.ts`

Backend (`backend/src/modules/tenders/`):
- `services/dashboard.ts` e `services/dashboard.db.test.ts`, serviço novo de consultas globais (e seu teste de banco)
- `services/savedSearchMatches.ts`, `services/dashboardContracts.ts` e `services/dashboardContracts.db.test.ts`, `contractStore/queries.ts` e `contractStore/queries.test.ts`
- `services/notificationInbox.ts` e `services/notificationInbox.db.test.ts`, `routes/notifications.ts`, `routes/requestReaders.ts`, `services/domainLists.ts`, `routes/overview.ts`, `routes/routes.db.test.ts`

Documentação: `backend/src/modules/tenders/README.md`.

## Estratégia de implementação

Regra: apagar o antigo antes de construir o novo, sem sobras e sem comentários de "removido".

1. **Backend, apagar:** tirar da resposta do `/dashboard` o que sai; tirar `newBySearch`; a rota de contratos sem `nearest`; a API de notificações sem `type` e `unreadOnly` (e `notificationTypes` do `/domains`); ajustar os testes e os imports que sobrarem.
2. **Frontend, apagar:** a tela Notificações e o item de cartão, a rota, o item de menu e o ícone, o "Ver todas" do sino (consulta do sino vira constante; `onOpen` obrigatório), `notificationInfiniteList`, `highlighted`, o Início de hoje (telas, componentes, funções e testes), `formatCompactMoney`, e os tipos antigos.
3. **Backend, construir:** consultas de publicações (por dia, mês e modalidade, até ontem, em dia de Brasília), abertos agora, esfera e top órgãos (globais); acompanhamentos por modalidade e status, Participei, funil e carga de prazos (por conta); contratos com a divisão por categoria; início da coleta; montagem da resposta; testes de banco.
4. **Frontend, construir:** `DashboardScreen` com os 8 cards, os cards por modalidade e os 7 gráficos; alternador de período; estados vazios e links (cada card e barra leva à tela com a lista); as renomeações Dashboard e Editais; seguir a skill `dataviz` nas cores, legendas e acessibilidade; testes das funções puras.
5. **README:** reescrever o trecho do Início como Dashboard, o menu Editais, e tirar as menções à tela Notificações.
6. **Validação** (um comando de cada vez): ver "Comandos". Busca final por restos: `notificacoes`, `NotificationItem`, `NotificationsScreen`, `unreadOnly`, `unreadChanges`, `notificationInfiniteList`, `pipeline`, `HomeScreen`, `Início`, `Ir para Buscar`; e checagem de imports sem uso nos arquivos alterados.
7. Medir o tempo do `/dashboard` e o tamanho do pacote `tenders-*.js` antes e depois.

## Regras de negócio identificadas

- Publicado: dia de Brasília a partir de `data_publicacao_pncp`. Card e gráfico vão até ontem, porque a coleta roda 1 vez por dia (06:00) e "hoje" é parcial. Contam só situação divulgada, como as buscas.
- Abertos agora: prazo não vencido e situação divulgada (a mesma regra de Editais, `fn_edital_aberto`).
- Em análise e Vou participar: acompanhamentos da conta com edital aberto. Participei: Vou participar com prazo de proposta vencido (não prova que a proposta foi enviada). Descartado não entra nos cards.
- Funil: acompanhados no período são os editais com entrada de Analisar ou Vou participar nos últimos 30 dias no histórico; vou participar e participei usam o status atual; % de cada etapa sobre a anterior.
- Carga de prazos: acompanhados abertos (Analisar ou Vou participar) por semana de encerramento, nas próximas 4 semanas.
- Contratos: pessoais, vindos das buscas de contratos ativas e dos favoritos da pessoa; janelas 30, 60 e 90 dias acumuladas; cada contrato conta uma vez.
- Modalidades mostradas: só as que existem na base. Por padrão a coleta traz Pregão Eletrônico, Dispensa, Concorrência Eletrônica e Pregão Presencial (salvo `PNCP_MODALITIES` no Render).
- Limites avisados na tela: a base não é o total do PNCP (só editais com prazo de proposta, nas modalidades coletadas); "ano" vira "últimos 12 meses" (a limpeza apaga os encerrados há mais de 12 meses, salvo acompanhados e favoritados); no começo da coleta os dias e meses antigos aparecem menores que o real.

## Regras multi-tenant e segurança

- Conta e usuário vêm sempre de `tenderAccessOf(req)`, nunca do client.
- `edital` é global (dado público do PNCP); tudo que é da conta (acompanhamento, histórico, carga de prazos, funil) filtra por `accountId`; buscas e favoritos filtram também por `userId`.
- As rotas ficam atrás da trava de acesso do módulo, como as demais; mensagens de erro no padrão `tenderRoute`, sem detalhe interno.
- O armazém de contratos continua sendo lido na cópia local do servidor; sem cópia pronta, a rota de contratos responde 503 e só esse bloco avisa.

## Validações necessárias

- `GET /dashboard` e `GET /dashboard/contracts` não recebem parâmetros.
- `GET /notifications` valida só `page` e `perPage` (`paginationQuery`).
- Limites fixos nas consultas (top 10, 4 semanas, 30 dias, 12 meses).

## Testes necessários

### Frontend

- Séries por dia e por mês com zeros nos dias e meses vazios; empilhamento por modalidade; alternador de período.
- % do funil, semanas da carga de prazos, aviso "dados desde", derivação dos cards por modalidade.
- Menu e títulos (Dashboard, Editais, sem Notificações) e o cache das listas sem a chave removida.
- `notificationTarget` mantém os testes; saem os de `notificationsQuery`.

### Backend

- Publicações por dia, mês e modalidade, até ontem, com limite de fuso (dia de Brasília); só situação divulgada.
- Abertos agora, esfera e top órgãos; isolamento entre contas; conta sem dados.
- Acompanhamentos por modalidade, Participei, funil, carga de prazos.
- Início da coleta. Rotas: `/dashboard`, `/dashboard/contracts` (inclusive 503) e `/notifications` só com paginação.
- `queries.test.ts` com contratos por categoria; `notificationInbox.db.test.ts` sem os casos de filtro.

### E2E

- Conferência manual no navegador: conta vazia e conta com acompanhamentos, alternador de período, clique dos cards e das modalidades, tema claro e escuro, celular, sino, e o endereço antigo de Notificações.

## Comandos de validação sugeridos

Um de cada vez (memória do computador):

```bash
# frontend (raiz)
npx tsc --noEmit
npm test
npx vite build

# backend
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
```

Os testes de banco só rodam no banco local (o script usa o `.env.dev`). Nunca rodar `.db.test.ts` com o `.env` da raiz (produção).

## Riscos e pontos de atenção

- Tamanho do pacote do módulo: o gráfico do Painel de finanças puxa a biblioteca de animação; medir o `tenders-*.js` antes e depois.
- Tempo do `/dashboard`: as consultas novas em base maior que a local; medir antes e depois, como na entrega do Início.
- Série incompleta no começo da coleta: avisada na tela ("dados desde").
- Aba aberta com o Início de hoje: dá erro até recarregar, porque a resposta do painel muda por inteiro (o Início tem menos de um dia; risco pequeno).
- Muito código de hoje é apagado: por isso apagar vem antes de construir, e a busca final por restos é obrigatória.
- Perda de função no sino: filtro por tipo, "só não lidas" e histórico além das 10 mais recentes (assumida pelo usuário).
- Testes de banco apontando para o ambiente errado: usar só o script `test:tenders-db`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Não há referência à tela Notificações, ao Início antigo, aos campos e filtros removidos nem aos nomes antigos em `src` e em `backend/src` (as notificações do app de Finanças ficam fora da busca).
- O menu mostra Dashboard e Editais; o endereço `/licitacoes/app/notificacoes` cai em "Página não encontrada".
- O dashboard mostra os 8 cards, os cards por modalidade e os 7 gráficos, tudo em quantidade, no desktop e no celular, em tema claro e escuro, com estados vazios e os avisos de limite dos dados.
- O sino continua abrindo, listando as 10 mais recentes, marcando como lida e marcando todas, com o contador.
- `GET /notifications` sem `type` e `unreadOnly`, e `/domains` sem `notificationTypes`.
- Todos os builds e testes passam (os de banco só no banco local), com o tempo do `/dashboard` e o tamanho do pacote medidos.
- O README descreve o Dashboard e o menu Editais e não cita a tela Notificações.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto e seguir o `/AGENT.md`.
- Trabalhar na branch ativa `feat/R/licitacoes-inicio-painel`; nada de commit ou push sem o `/finalizar`.
- Apagar antes de construir; eliminar por completo, sem comentário ou anotação de "removido" e sem função, prop, parâmetro ou filtro obsoleto.
- Identificadores de código em inglês; textos da tela em português.
- Não executar migrations e não alterar `.env`. Testes de banco só pelo script `test:tenders-db`.
- Rodar build e testes um de cada vez.
- Carregar a skill `dataviz` antes de escrever o código dos gráficos.
