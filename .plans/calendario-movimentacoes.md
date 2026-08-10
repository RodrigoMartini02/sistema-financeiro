# Plano de Implementação: Visão de calendário para despesas, receitas e compromissos

## Origem

- Arquivo de especificação: `sistema financas/.portal/tasks/calendar-view-expenses-incomes-and-appointments.md`
- Data do planejamento: `2026-08-09`
- Classificação: `frontend + backend + database`

## Resumo

Hoje o sistema financas mostra despesas e receitas apenas em formato de lista, dentro da tela de Movimentações (`MovimentacoesScreen.tsx`), com um toggle simples entre as duas abas. Esta feature adiciona um segundo modo de visualização — **Calendário** — complementar ao modo Lista, com 4 sub-visões (Mês, Semana, Dia, Agenda) que mostram despesas, receitas e uma nova entidade, **compromissos** (eventos sem valor financeiro, ex: reuniões), de forma unificada.

A criação e edição rápida de itens a partir do calendário acontece via **popovers contextuais** (não pelos dialogs completos diretamente), com um gancho "Mais opções" que abre os dialogs completos existentes (`ExpenseDialog`/`IncomeDialog`) quando o usuário precisa de campos avançados (parcelamento, cartão, NF, anexos). Compromissos são uma entidade nova, com tabela e rota de backend próprias, seguindo o padrão de isolamento por `usuario_id`/`perfil_id` já usado em `reservas`/`clientes`.

## Escopo

### Dentro do escopo

- Toggle "Lista / Calendário" na tela de Movimentações, sem alterar o comportamento atual do modo Lista.
- 4 sub-visões do modo Calendário: Mês (grade 6x7), Semana (colunas por dia + slots de horário), Dia (agenda de horário + resumo lateral), Agenda (lista cronológica agrupada por dia).
- Indicadores visuais por dia/item (cores por tipo: despesa/receita/compromisso; status: pago/atrasado/em dia/previsto), reaproveitando a lógica de status já existente.
- Popover de criação rápida ao clicar em dia/slot vazio, com seleção de tipo (Despesa/Receita/Compromisso), campos mínimos, data/horário pré-preenchidos, e ação "Mais opções" que abre o dialog completo.
- Popover de detalhe ao clicar em item existente, com ação rápida contextual (marcar como paga/registrar recebimento/concluir) e ação "Editar" que abre o dialog completo.
- Nova entidade **compromisso**: tabela, migration, rota de backend (CRUD), service de frontend, dialog de criação/edição completa.
- Adaptação de `ExpenseDialog`/`IncomeDialog` para aceitar data pré-preenchida (prop opcional), sem alterar o fluxo atual quando abertos pelo botão "Nova despesa/receita".

### Fora do escopo

- Compromissos gerarem lançamentos financeiros automáticos.
- Visão de calendário anual.
- Integração com calendários externos (Google Agenda, iCal).
- Notificações/lembretes reais (push, e-mail) para compromissos — o campo "lembrete" (se existir na UI) é apenas informativo nesta entrega.
- Recorrência de compromissos.
- Ações em lote a partir do calendário.
- Endpoint agregado de backend para o calendário — decisão tomada de reaproveitar os endpoints existentes (`GET /expenses`, `GET /incomes`, `GET /appointments`), agrupando por dia no cliente.
- Uso de biblioteca de calendário de terceiros (`react-big-calendar`, `FullCalendar`) — decisão tomada de construir a grade do zero com Tailwind, seguindo o layout do mockup fornecido.

## Leitura de contexto

- `sistema financas/AGENT.md` — lido; descreve um contexto genérico de "multi-prefeitura" com RLS e Drizzle ORM que **não corresponde ao padrão real observado no código** deste sistema (SQL raw parametrizado via `pg`/`pool.query`, isolamento por `usuario_id`/`perfil_id`, sem Drizzle nas rotas de despesas/receitas/reservas — Drizzle só aparece no módulo `futebol`). As regras de segurança, confirmação antes de migrations, e cuidado com vazamento entre usuários deste AGENT.md **foram mantidas e adaptadas** ao padrão real do projeto (tenant = `usuario_id`, não "prefeitura").
- `sistema financas/CLAUDE.md` — lido; confirma o fluxo obrigatório `/planejar → aprovação → /implementar → /finalizar`, e que alterações em `.env` e migrations exigem confirmação explícita a cada vez.
- `sistema financas/.portal/tasks/calendar-view-expenses-incomes-and-appointments.md` — especificação de entrada desta feature, já validada com o usuário, incluindo decisões extraídas de um mockup de UI fornecido por ele.
- Arquivos de código inspecionados diretamente:
  - `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`
  - `sistema financas/src/screens/despesas/DespesasScreen.tsx`
  - `sistema financas/src/screens/finance/ExpenseDialog.tsx`
  - `sistema financas/src/screens/finance/IncomeDialog.tsx`
  - `sistema financas/src/ui/dialog.tsx`, `sistema financas/src/ui/zIndex.ts`
  - `sistema financas/src/services/queryKeys.ts`, `sistema financas/src/services/reservasService.ts`
  - `sistema financas/backend/src/routes/expenses.ts`, `incomes.ts`, `reserves.ts`, `clients.ts`
  - `sistema financas/backend/drizzle/*.sql` (padrão de nomenclatura de migrations)

## Impacto por área

### Frontend

- **`MovimentacoesScreen.tsx`**: adicionar estado de modo (`'lista' | 'calendario'`) e sub-visão ativa (`'mes' | 'semana' | 'dia' | 'agenda'`), toggle visual (pill), e renderização condicional do novo componente de calendário no lugar da lista quando o modo for `'calendario'`. O toggle Receitas/Despesas atual permanece exclusivo do modo Lista.
- **Novo diretório `src/screens/finance/calendar/`**:
  - `CalendarView.tsx` — componente orquestrador que busca dados (despesas, receitas, compromissos do período ativo), agrupa por dia/horário, e renderiza a sub-visão ativa.
  - `MonthGrid.tsx`, `WeekGrid.tsx`, `DayView.tsx`, `AgendaView.tsx` — um componente por sub-visão.
  - `QuickCreatePopover.tsx` — popover de criação rápida (seleção de tipo, campos mínimos, data/horário fixos, ação "Mais opções").
  - `ItemDetailPopover.tsx` — popover de detalhe/edição rápida.
  - `calendarStatus.ts` — helpers reaproveitando `getStatus`/status mapping já existente em `DespesasScreen.tsx` (extraído para local compartilhável se necessário, evitando duplicar a lógica).
- **`ExpenseDialog.tsx` / `IncomeDialog.tsx`**: adicionar prop opcional (ex: `presetDate?: string`) que, quando fornecida, preenche o campo de data e o torna somente leitura/oculto. Sem essa prop, o comportamento atual é preservado integralmente.
- **Novo `AppointmentDialog.tsx`**: dialog completo de compromisso (`titulo`, `data`, `hora`, `duracao`, `local`, `descricao`), usando os tokens de `ui/dialogFormTokens.tsx` e `ui/dialog.tsx`, seguindo o padrão visual dos dialogs existentes.
- **Novo `src/services/appointmentsService.ts`**: `fetchAppointments`, `saveAppointment`, `deleteAppointment`, seguindo o padrão de `reservasService.ts` (usa `apiClient.apiRequest`, injeta `perfil_id` via `getActiveProfileId()`).
- **`src/services/queryKeys.ts`**: adicionar chave `appointments: (month: number, year: number) => ['appointments', month, year] as const`.
- **Estados de loading/error/empty**: reaproveitar `ui/states.tsx` (`ErrorState`, padrão já usado em `DespesasScreen.tsx`) para erros de carregamento do calendário; grade vazia (mês sem nenhum item) deve renderizar normalmente, sem empty-state especial (o próprio grid já comunica "sem itens").
- **Testes de frontend**: descritos na seção "Testes necessários".

### Backend

- **Novo `backend/src/routes/appointments.ts`**: rota CRUD seguindo exatamente o padrão de `reserves.ts`/`clients.ts`:
  - `GET /api/appointments?mes=&ano=&perfil_id=` — lista compromissos do período, com o mesmo padrão de filtro de perfil usado em `reserves.ts` (`profileFilter`).
  - `POST /api/appointments` — cria compromisso, valida `titulo` e `data` obrigatórios via `express-validator` (padrão de `body(...).notEmpty()`/`isISO8601()` já usado em `expenses.ts`/`incomes.ts`).
  - `PUT /api/appointments/:id` — atualiza campos (`titulo`, `data`, `hora`, `duracao_minutos`, `local`, `descricao`).
  - `DELETE /api/appointments/:id` — remove, com verificação de posse via `usuario_id`.
  - Todas as rotas usam `authenticate` middleware e filtram por `req.user!.id`, nunca por `usuario_id` vindo do client.
- **`backend/src/server.ts`**: registrar `app.use('/api/appointments', authenticate, requireActivePlan, appointmentsRoutes)`, seguindo o padrão de registro das rotas existentes (ex: `reserveRoutes`). Confirmar se `requireActivePlan` (visto em `reserves`/`reservas`) é aplicável aqui — a inspecionar durante a implementação, mas o padrão de outras rotas financeiras sugere que sim.
- **Sem alteração** em `expenses.ts`/`incomes.ts` — o plano optou por reaproveitar os endpoints `GET` existentes (já filtram por `mes`/`ano`/`perfil_id`) em vez de criar endpoint agregado.

### Banco de dados

- **Nova tabela `compromissos`**, com colunas:
  - `id SERIAL PRIMARY KEY`
  - `usuario_id INTEGER NOT NULL REFERENCES usuarios(id)`
  - `perfil_id INTEGER NULL REFERENCES perfis(id)` (nullable, seguindo padrão de `reservas`/`clientes`)
  - `titulo VARCHAR(255) NOT NULL`
  - `descricao TEXT NULL`
  - `data DATE NOT NULL`
  - `hora TIME NULL`
  - `duracao_minutos INTEGER NULL`
  - `local VARCHAR(255) NULL`
  - `criado_em TIMESTAMP NOT NULL DEFAULT NOW()`
- Índice recomendado em `(usuario_id, data)`, seguindo o padrão de atenção a filtros de tenant + data mencionado no AGENT.md (adaptado ao padrão real do projeto).
- Nova migration a ser criada em `backend/drizzle/0015_compromissos.sql`, seguindo a nomenclatura sequencial já usada no diretório.
- Sem alteração nas tabelas existentes `despesas`, `receitas`, `reservas`.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

### Infra/Deploy

Sem impacto esperado. Não há novas env vars, jobs, workers ou mudanças de build identificadas.

## Arquivos provavelmente afetados

- `sistema financas/backend/drizzle/0015_compromissos.sql` (novo)
- `sistema financas/backend/src/routes/appointments.ts` (novo)
- `sistema financas/backend/src/server.ts`
- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/finance/IncomeDialog.tsx`
- `sistema financas/src/screens/finance/AppointmentDialog.tsx` (novo)
- `sistema financas/src/screens/finance/calendar/CalendarView.tsx` (novo)
- `sistema financas/src/screens/finance/calendar/MonthGrid.tsx` (novo)
- `sistema financas/src/screens/finance/calendar/WeekGrid.tsx` (novo)
- `sistema financas/src/screens/finance/calendar/DayView.tsx` (novo)
- `sistema financas/src/screens/finance/calendar/AgendaView.tsx` (novo)
- `sistema financas/src/screens/finance/calendar/QuickCreatePopover.tsx` (novo)
- `sistema financas/src/screens/finance/calendar/ItemDetailPopover.tsx` (novo)
- `sistema financas/src/services/appointmentsService.ts` (novo)
- `sistema financas/src/services/queryKeys.ts`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx` (referência para reuso de `getStatus`/`StatusBadge`, possível extração compartilhada)
- `sistema financas/src/types/finance.ts` (possível adição de tipo `Appointment`)

## Estratégia de implementação

1. **Migration e schema**: criar `0015_compromissos.sql` com a tabela `compromissos` e índice. Não executar — apenas gerar o arquivo, aguardando confirmação explícita do usuário para rodar.
2. **Backend — rota de compromissos**: criar `appointments.ts` com GET/POST/PUT/DELETE seguindo o padrão de `reserves.ts`. Registrar em `server.ts`.
3. **Frontend — tipos e service**: adicionar tipo `Appointment`/`AppointmentFormValues` em `types/finance.ts` (ou arquivo equivalente), criar `appointmentsService.ts`, adicionar query key.
4. **Frontend — dialog de compromisso**: criar `AppointmentDialog.tsx` reaproveitando `ui/dialog.tsx` e `dialogFormTokens.tsx`.
5. **Frontend — adaptar dialogs existentes**: adicionar prop `presetDate` opcional em `ExpenseDialog`/`IncomeDialog`, com o campo de data condicionalmente travado/oculto. Validar que o fluxo atual (sem a prop) permanece inalterado.
6. **Frontend — grade do calendário (visão Mês primeiro)**: construir `CalendarView.tsx` + `MonthGrid.tsx`, com busca de dados (3 queries paralelas: despesas, receitas, compromissos do mês) e agrupamento por dia.
7. **Frontend — popovers**: construir `QuickCreatePopover.tsx` (criação rápida, com gancho para os dialogs completos) e `ItemDetailPopover.tsx` (detalhe + ação rápida + editar).
8. **Frontend — sub-visões restantes**: `WeekGrid.tsx`, `DayView.tsx`, `AgendaView.tsx`, reaproveitando os mesmos popovers e lógica de agrupamento.
9. **Frontend — integração final**: toggle Lista/Calendário em `MovimentacoesScreen.tsx`, seletor de sub-visão, navegação entre períodos.
10. **Testes**: adicionar testes de frontend e backend conforme a seção "Testes necessários".
11. **Validação manual**: rodar a aplicação localmente (`/run`), testar os fluxos críticos (criação via popover, "Mais opções", edição, exclusão) antes de considerar a etapa concluída.

## Regras de negócio identificadas

- Compromissos nunca afetam saldo, receitas ou despesas — são puramente informativos.
- O modo Lista deve continuar funcionando exatamente como hoje; o modo Calendário é aditivo.
- Dados de despesa/receita exibidos no calendário devem refletir o mesmo status (pago/atrasado/em dia/previsto/faturado) já calculado hoje pela lista — sem introduzir uma segunda fonte de verdade para status.
- O popover de criação rápida não substitui os dialogs completos — é um atalho; qualquer campo avançado exige "Mais opções".

## Regras multi-tenant e segurança

- O "tenant" real deste projeto é `usuario_id` (não há conceito de prefeitura/multi-tenant no domínio deste sistema, apesar do texto genérico do AGENT.md do repositório).
- Toda query nova (rota de compromissos) deve filtrar por `usuario_id` derivado de `req.user!.id` (nunca do body/query do client), seguindo exatamente o padrão de `reserves.ts`/`clients.ts`.
- Quando `perfil_id` for informado, aplicar o mesmo padrão de filtro condicional já usado em `reserves.ts` (`profileFilter`), incluindo o caso de perfil pessoal com `perfil_id IS NULL`.
- Mensagens de erro da rota de compromissos não devem revelar dados de outro usuário (ex: "Appointment not found" genérico, como já é o padrão em `reserves.ts`).
- Nenhuma migration será executada durante o planejamento ou automaticamente durante a implementação — requer confirmação explícita do usuário a cada execução, dado que o ambiente pode estar apontando para produção.

## Validações necessárias

- Backend (`appointments.ts`): `titulo` não vazio, `data` em formato ISO 8601 válido, `hora` (se informada) em formato válido, `duracao_minutos` (se informada) inteiro positivo.
- Frontend (`AppointmentDialog.tsx`): schema Zod equivalente ao de `ExpenseDialog`/`IncomeDialog`, validando título e data obrigatórios.
- `ExpenseDialog`/`IncomeDialog` com `presetDate`: garantir que o schema de validação continue exigindo data válida mesmo quando o campo estiver travado (valor vem pré-preenchido e válido por construção).

## Testes necessários

### Frontend

- Renderização de cada sub-visão (Mês/Semana/Dia/Agenda) com dados mistos (despesa/receita/compromisso) no mesmo dia.
- Clique em dia/slot vazio abre `QuickCreatePopover` com data/horário corretos.
- "Mais opções" no popover abre o dialog completo correto (`ExpenseDialog`, `IncomeDialog` ou `AppointmentDialog`) com a data pré-preenchida e campo de data travado/oculto.
- Clique em item existente abre `ItemDetailPopover` com dados corretos; "Editar" abre o dialog completo em modo edição.
- Toggle entre modo Lista e Calendário, e entre sub-visões, sem perda de estado inesperada.
- `ExpenseDialog`/`IncomeDialog` sem `presetDate` continuam se comportando como hoje (regressão).

### Backend

- CRUD de compromissos (criar, listar por mês, editar, excluir) com isolamento por `usuario_id`.
- Tentativa de acessar/editar/excluir compromisso de outro usuário retorna 404 (não vaza existência do recurso).
- Validação de campos obrigatórios (`titulo`, `data`) retorna erro 400 claro.
- Filtro por `perfil_id` funciona conforme o padrão de `reserves.ts` (perfil explícito + perfil pessoal implícito).

### E2E

- Fluxo: usuário alterna para modo Calendário, clica em um dia vazio, cria uma despesa via popover, e o item aparece corretamente no calendário e ao voltar para a Lista.
- Fluxo: usuário cria um compromisso a partir do calendário e o vê listado no dia/horário correto, sem qualquer impacto nos cards de saldo/receitas/despesas.
- Fluxo: usuário abre "Mais opções" a partir do popover de criação, completa campos avançados (ex: parcelamento) no dialog completo, salva, e o item aparece corretamente no calendário.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run test
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run test
npm --prefix "sistema financas/backend" run build
```

Nota: os nomes exatos dos scripts (`lint`/`typecheck`/`test`/`build`) devem ser confirmados nos `package.json` de `sistema financas/` e `sistema financas/backend/` durante a implementação, pois não foram inspecionados neste planejamento.

## Riscos e pontos de atenção

- **Escopo grande para uma única entrega**: 4 sub-visões + 2 popovers + nova entidade + adaptação de 2 dialogs complexos. Risco de a implementação precisar ser quebrada em sub-etapas menores dentro de `/implementar`, para manter revisão segura.
- **Risco de regressão nos dialogs existentes**: `ExpenseDialog`/`IncomeDialog` têm lógica complexa (parcelamento, sugestões, duplicatas). A prop `presetDate` deve ser estritamente aditiva; qualquer mudança no fluxo padrão (sem a prop) é um risco a ser testado manualmente.
- **Cálculo de posicionamento por horário** (visões Semana/Dia) construído do zero pode ter bugs de borda (compromissos que cruzam meia-noite, sobreposição de horários) — não coberto em profundidade pelo mockup, a tratar com critério simples (não sobrepor, ou sobrepor com leve deslocamento) durante a implementação.
- **Ambiente pode estar apontando para produção**: migration não deve ser executada sem confirmação explícita, e deve ser testada isoladamente antes de qualquer rollout.
- **Múltiplas requisições paralelas** (despesas + receitas + compromissos) a cada troca de mês/semana podem gerar mais tráfego de rede que uma única chamada agregada — aceito conscientemente pela decisão de não criar endpoint agregado nesta entrega; se performance se mostrar um problema real, é candidato a revisão futura.
- **`AGENT.md` do repositório é genérico e conflita com o padrão real do código** — a implementação deve seguir o padrão observado no código (SQL raw parametrizado, `usuario_id` como tenant), não o texto do AGENT.md sobre Drizzle/RLS/prefeitura.

## Perguntas em aberto

- Os nomes exatos dos scripts de lint/typecheck/test/build em `package.json` (frontend e backend) precisam ser confirmados durante a implementação — não foram inspecionados neste planejamento.
- Se `requireActivePlan` middleware deve ser aplicado à rota de compromissos — o padrão de `reserves`/`reservas` sugere que sim, mas deve ser confirmado ao registrar a rota em `server.ts`.
- Comportamento do popover de criação rápida em telas estreitas (mobile/tablet) não foi definido em detalhe — a task de origem já registrou isso como pergunta em aberto; a implementação pode adotar um comportamento simples (popover vira modal full-width em telas pequenas) e ajustar conforme feedback visual durante a implementação.

## Critérios de aceite do plano

- Usuário consegue alternar entre modo Lista e modo Calendário na tela de Movimentações, sem qualquer regressão no modo Lista.
- As 4 sub-visões (Mês/Semana/Dia/Agenda) renderizam despesas, receitas e compromissos corretamente, com indicadores visuais de tipo e status.
- Criação rápida via popover funciona para os 3 tipos, com "Mais opções" abrindo o dialog completo correto e a data pré-preenchida.
- Edição/detalhe via popover funciona para itens existentes, com "Editar" abrindo o dialog completo correspondente.
- CRUD de compromissos funciona de ponta a ponta (criar, listar, editar, excluir), isolado por `usuario_id`.
- Nenhuma migration é executada sem confirmação explícita do usuário.
- Todos os comandos de validação (lint/typecheck/test/build) passam em frontend e backend.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a task de origem em `.portal/tasks/calendar-view-expenses-incomes-and-appointments.md` para detalhes de UI (baseados no mockup do usuário).
- Não executar migrations sem confirmação explícita do usuário a cada execução.
- Seguir o padrão real do código (SQL raw parametrizado, isolamento por `usuario_id`/`perfil_id`) em vez do texto genérico do `AGENT.md` sobre Drizzle/multi-prefeitura.
- Dado o tamanho da feature, considerar dividir a implementação em sub-entregas (ex: 1. backend de compromissos + migration; 2. adaptação dos dialogs existentes; 3. visão Mês; 4. popovers; 5. visões Semana/Dia/Agenda), cada uma revisável isoladamente, em vez de uma única mudança monolítica.
- Manter alterações pequenas e focadas por commit/etapa.
- Atualizar testes conforme descrito na seção "Testes necessários".
- Não alterar `.env`, não instalar dependências novas (a decisão de construir o calendário do zero evita a necessidade de novas libs), não rodar comandos destrutivos.
