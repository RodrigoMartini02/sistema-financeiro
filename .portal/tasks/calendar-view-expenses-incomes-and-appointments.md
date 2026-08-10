# Task: Visão de calendário para despesas, receitas e compromissos

## Contexto

O sistema financas (frontend React + TypeScript + Vite + Tailwind, backend Express.js + TypeScript + PostgreSQL) hoje gerencia despesas e receitas exclusivamente por meio de telas em formato de lista:

- `sistema financas/src/screens/despesas/DespesasScreen.tsx` — lista despesas do mês, com filtros de status (pago/em dia/atrasada), botão "Nova despesa" que abre `ExpenseDialog`.
- `sistema financas/src/screens/finance/ExpenseDialog.tsx` — formulário de criação/edição de despesa (descrição, valor, data de compra, categoria, cartão, forma de pagamento, parcelamento/recorrência mensal, NF, anexos).
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx` e `sistema financas/src/screens/finance/IncomeDialog.tsx` — equivalentes para receitas.
- Backend expõe despesas/receitas via `sistema financas/backend/src/routes/expenses.ts` e `sistema financas/backend/src/routes/incomes.ts`, com isolamento por `usuario_id` (e opcionalmente `perfil_id`) via SQL parametrizado (`pg`/`pool.query`), sem Drizzle nessas rotas.

Não existe hoje nenhuma visualização temporal (calendário) desses lançamentos, nem qualquer conceito de "compromisso"/lembrete sem valor financeiro — foi confirmado por busca no código (`compromisso`, `evento`, `lembrete`, `agenda`) que os únicos resultados pertencem ao módulo de futebol (agenda de partidas) ou a `plan-notification-events`, sem relação com este domínio.

O usuário trouxe um mockup visual (HTML estático, não é código do projeto) ilustrando a direção desejada de UI. O mockup **não deve ser usado como fonte de verdade de dados** (os itens exibidos são fictícios), mas define decisões de interação e estrutura de tela que substituem/refinam pontos que antes estavam em aberto nesta task — descritas na seção "Decisão Técnica Desejada" e refletidas nas "Perguntas Para o Planejamento" já respondidas abaixo.

## Problema

O fluxo atual de lançamento exige que o usuário sempre informe manualmente a data no formulário, mesmo quando a intenção já nasce associada a um dia específico (ex: "lançar essa despesa que vence dia 15"). Além disso, a lista não comunica visualmente a distribuição de vencimentos ao longo do mês — para enxergar concentração de vencimentos, parcelas futuras ou dias livres, o usuário precisa varrer a lista mentalmente.

Não há também um espaço para registrar compromissos/lembretes que não envolvem valor financeiro (ex: reunião com cliente, prazo), o que hoje força o usuário a usar ferramentas externas (Google Agenda) para esse tipo de anotação dentro do mesmo contexto financeiro.

## Objetivo

Oferecer uma visão de calendário mensal, complementar à lista já existente, nas telas de Despesas e Receitas, permitindo:

1. Visualizar despesas/receitas/compromissos distribuídos pelos dias do mês.
2. Criar uma despesa, receita ou compromisso a partir do clique em um dia do calendário, com a data já pré-preenchida (reduzindo um campo a preencher no formulário).
3. Abrir um item existente (despesa, receita ou compromisso) a partir do calendário para edição, reaproveitando os diálogos e regras de negócio já existentes.
4. Registrar compromissos/lembretes sem valor financeiro associados a uma data, como novo tipo de marcador no calendário.

## Decisão Técnica Desejada

- A visão de calendário deve ser um **modo alternativo de visualização** (toggle "Lista / Calendário"), não uma substituição da lista existente. No modo Lista, mantém-se o toggle atual Receitas/Despesas.
- O modo Calendário é **unificado**: despesas, receitas e compromissos aparecem juntos na mesma grade/visão (não é uma instância separada por tela de Despesas e de Receitas). Isso é diferente do modo Lista, que continua separado por aba.
- O modo Calendário tem **4 sub-visões alternáveis** por um seletor secundário (pills): **Mês**, **Semana**, **Dia** e **Agenda** (lista cronológica agrupada por dia, mostrando só os dias com itens). Essas visões não estavam no escopo original desta task (que previa apenas visão mensal) — o mockup do usuário deixou claro que as 4 variações são desejadas já nesta entrega.
  - **Mês**: grade de 6 semanas x 7 dias. Cada dia mostra até N chips (item configurável, ex: 3) com prioridade para compromissos primeiro, depois por valor; excedente vira "+N mais". Cada dia exibe também um indicador de atraso quando há despesa vencida não paga. Uma coluna lateral por semana mostra o total de receitas, despesas e saldo líquido da semana.
  - **Semana**: grade com uma coluna por dia (7 dias) dividida em duas áreas — uma faixa superior "dia inteiro" para itens financeiros (despesas/receitas, sem horário) e uma grade de horários (ex: 07h–19h) abaixo para compromissos, posicionados pela hora/duração.
  - **Dia**: layout de duas colunas — a coluna principal é uma agenda de horários (igual à semana, mas só um dia, com indicador de "agora") para compromissos; a coluna lateral mostra um resumo do dia (a receber/a pagar/líquido) e a lista de itens financeiros do dia, com botões rápidos "+ Despesa / + Receita / + Compromisso".
  - **Agenda**: lista cronológica agrupada por dia (só dias com itens), cada grupo mostrando dia da semana/número/saldo líquido do dia à esquerda e os itens (financeiros e compromissos, ordenados por horário) à direita.
- **Criação rápida via popover**, não abertura direta do dialog completo: clicar em um dia vazio (ou em um slot de horário, nas visões Semana/Dia) abre um **popover pequeno e contextual** (não um modal cheio) com: seletor de tipo (Despesa/Receita/Compromisso), campo de nome/descrição, campo de valor (oculto para Compromisso) ou campo de horário (só para Compromisso), data pré-preenchida (mostrada, não editável nesse popover), chips de sugestão rápida (categorias/ações comuns), e ações "Cancelar" / "Criar" / "Mais opções". "Mais opções" é o gancho para abrir o dialog completo existente (`ExpenseDialog`/`IncomeDialog`) quando o usuário precisar de campos avançados (parcelamento, cartão, NF, anexos) que o popover não expõe.
- **Detalhe/edição via popover também**: clicar em um item existente (chip no mês, bloco na semana/dia, linha na agenda ou na lista) abre um **popover de detalhe** com valor, status (badge), campos-resumo em grid (categoria/cartão/forma/repetição/NF/anexos para financeiro; horário/duração/local/lembrete para compromisso), e ações "Marcar como paga"/"Registrar recebimento"/"Concluir" (contextual ao tipo), "Editar" (abre o dialog completo) e um menu de mais ações.
- Compromissos são uma entidade nova, sem valor financeiro, com campos: `titulo`/nome, `data`, `hora` (opcional — o mockup mostra compromissos com horário e duração, diferentemente de despesas/receitas que são só "dia"), `duracao` (minutos, opcional), `local` (opcional), `descricao`/observação (opcional), `usuario_id`, `perfil_id`. Tratados como um terceiro tipo de marcador no calendário, com cor própria distinta de receita (verde/emerald) e despesa (vermelho/rose) — o mockup usa um tom "violeta/roxo" configurável. Não devem ser confundidos com receitas previstas nem gerar lançamentos financeiros automaticamente.
- Cada dia/visão precisa de indicadores de **status por cor de badge**: pago/faturado (verde), atrasado (vermelho mais intenso, com contorno diferenciado), em dia/previsto (âmbar), compromisso (cor própria) — reaproveitando o mapeamento de status que já existe em `DespesasScreen.tsx`/`ReceitasScreen.tsx`, sem reinventar as categorias de status.
- A escolha de biblioteca de calendário (ex: construção própria simples baseada em grid de dias vs. lib como `react-big-calendar`/`FullCalendar`) deve ser avaliada durante o planejamento, considerando tamanho de bundle, licenciamento e aderência ao design system (Tailwind) já usado no projeto. Dado que o mockup usa layouts customizados (grid manual, popovers próprios, sem calendário de terceiros), a implementação com componente próprio é a direção sugerida, mas a decisão final é do planejamento.

## Escopo Funcional

### Dentro do escopo

- Toggle de visualização "Lista / Calendário" na tela de Movimentações (`MovimentacoesScreen.tsx`, que hoje já embute `DespesasScreen`/`ReceitasScreen` com toggle Receitas/Despesas). No modo Lista, mantém-se o comportamento atual. No modo Calendário, a visão é unificada (despesas + receitas + compromissos juntos).
- Sub-visões Mês, Semana, Dia e Agenda dentro do modo Calendário, com um seletor secundário para alternar entre elas.
- Indicadores visuais por dia/item (cores por tipo e status) para despesas, receitas e compromissos, incluindo destaque para vencimentos atrasados (reaproveitando a lógica de status já existente, ex: `getStatus` em `DespesasScreen.tsx`).
- Popover de criação rápida ao clicar em dia vazio (visão Mês) ou slot vazio (visões Semana/Dia), com seleção de tipo (Despesa/Receita/Compromisso), campos mínimos e data pré-preenchida.
- Gancho "Mais opções" no popover de criação rápida que abre o diálogo completo existente (`ExpenseDialog`/`IncomeDialog`) com a data pré-preenchida e o campo de data oculto/travado, para os casos que exigem campos avançados (parcelamento, cartão, NF, anexos).
- Popover de detalhe ao clicar em item existente, com ação rápida contextual (marcar como paga/registrar recebimento/concluir) e ação "Editar" que abre o diálogo completo correspondente.
- Navegação entre períodos (mês/semana/dia, conforme a sub-visão ativa).
- CRUD de compromissos (criar, listar, editar, excluir), vinculado a `usuario_id` (e `perfil_id` quando aplicável, seguindo o padrão já usado em despesas/receitas/reservas), com campos de horário/duração/local opcionais.
- Endpoint(s) de backend para compromissos, seguindo o padrão de autenticação e isolamento por usuário já usado em `expenses.ts`/`incomes.ts`/`reserves.ts`.

### Fora do escopo inicial

- Compromissos que geram lançamentos financeiros automáticos (ex: "cobrança agendada" virando receita prevista) — tratado como possível evolução futura, não nesta entrega.
- Visão de calendário anual (por enquanto: Mês, Semana, Dia e Agenda cobrem o escopo desejado).
- Integração com calendários externos (Google Agenda, iCal, etc.).
- Notificações/lembretes push ou por e-mail para compromissos (o mockup mostra um campo "lembrete" no detalhe do compromisso, mas sem mecanismo de disparo real — tratar como campo informativo nesta entrega, não como feature de notificação).
- Recorrência de compromissos (ex: reunião semanal recorrente) — compromissos nesta entrega têm data única.
- Ações em lote (ex: marcar múltiplas despesas como pagas a partir do calendário).

## Requisitos de Frontend

- Adicionar componente de calendário unificado (despesas + receitas + compromissos) com 4 sub-visões (Mês/Semana/Dia/Agenda) na tela de Movimentações (`MovimentacoesScreen.tsx`).
- Adicionar toggle de alternância entre modo Lista (atual) e modo Calendário, coexistindo com o toggle Receitas/Despesas já usado no modo Lista.
- Construir o(s) componente(s) de popover de criação rápida (seleção de tipo, campos mínimos por tipo, data/horário pré-preenchidos não editáveis nesse contexto, ação "Mais opções") e de detalhe do item (campos-resumo em grid, ação rápida contextual, ação "Editar").
- Adaptar `ExpenseDialog.tsx` e `IncomeDialog.tsx` para aceitar uma data pré-preenchida vinda do popover "Mais opções" ou do calendário, ocultando ou travando o campo de data nesse fluxo (hoje `dataCompra`/campo equivalente é sempre editável).
- Criar um novo diálogo/formulário para criação/edição completa de compromisso (`titulo`, `data`, `hora`, `duracao`, `local`, `descricao`), seguindo os tokens de formulário já usados (`ui/dialogFormTokens.tsx`, `ui/dialog`) — usado a partir do "Editar" no popover de detalhe.
- Criar service de API para compromissos (padrão similar a `reservasService.ts`/`financeService.ts`), incluindo chamadas ao endpoint novo.
- Garantir que os indicadores de dia/status no calendário reaproveitem a lógica de status já existente (`getStatus`, `StatusBadge`) em vez de duplicar regras.

## Requisitos de Backend

- Criar rota(s) para CRUD de compromissos (ex: `sistema financas/backend/src/routes/appointments.ts` ou nome equivalente em inglês), seguindo o padrão de `authenticate` middleware e isolamento por `usuario_id`/`perfil_id` já usado em `reserves.ts`/`clients.ts`.
- Avaliar se um endpoint agregado (ex: "buscar despesas + receitas + compromissos de um mês, já agrupados por dia") é necessário para performance do calendário, evitando múltiplas chamadas separadas no frontend — a decidir no planejamento.
- Validar entrada no backend (data obrigatória, título obrigatório) mesmo que o frontend já valide.

## Requisitos de Banco de Dados

- Nova tabela para compromissos (ex: `compromissos`), com colunas mínimas: `id`, `usuario_id`, `perfil_id` (nullable, seguindo padrão de `reservas`/`clientes`), `titulo`, `descricao` (nullable), `data`, `hora` (nullable), `duracao_minutos` (nullable), `local` (nullable), `criado_em`.
- Migration nova a ser criada seguindo o padrão de arquivos em `sistema financas/backend/drizzle/*.sql` (nomenclatura sequencial), mas **nenhuma migration deve ser executada sem confirmação explícita do usuário**, conforme regra do projeto.
- Sem alteração nas tabelas existentes de `despesas`, `receitas` ou `reservas` identificada até o momento.

## Requisitos de Segurança e Multi-Tenant

- Todas as queries relacionadas a compromissos devem filtrar por `usuario_id` (e `perfil_id` quando aplicável), seguindo exatamente o padrão já usado em `reserves.ts`/`clients.ts`/`contracts.ts` (não há multi-tenant/RLS de "prefeitura" neste projeto — o isolamento real observado no código é por `usuario_id`, apesar do `AGENT.md` genérico do repositório mencionar um contexto multi-prefeitura/RLS que não corresponde ao domínio deste sistema).
- Nunca confiar em `usuario_id` vindo do client sem validação — sempre usar `req.user!.id` do middleware `authenticate`, como já é feito nas demais rotas.
- Mensagens de erro não devem revelar dados de outro usuário.

## Requisitos de Migração ou Compatibilidade

- A introdução do modo calendário não deve alterar o comportamento do modo lista existente.
- Os diálogos `ExpenseDialog`/`IncomeDialog` devem continuar funcionando normalmente quando abertos a partir do fluxo atual (botão "Nova despesa/receita"), sem o campo de data pré-preenchido/travado nesse caso.
- Novo código (arquivos, endpoints, nomes de tabela/colunas de código) deve seguir nomenclatura em inglês onde for identificador técnico novo (ex: nome de arquivo de rota, nome de função), tratando os nomes em português já existentes no domínio (`despesas`, `receitas`, `reservas`) como padrão legado a ser respeitado, não substituído.

## Requisitos de Testes

### Frontend

- Testar renderização de cada sub-visão (Mês/Semana/Dia/Agenda) com dias/slots contendo despesas, receitas e compromissos.
- Testar que o clique em dia/slot vazio abre o popover de criação rápida com a data/horário pré-preenchidos.
- Testar que "Mais opções" no popover de criação rápida abre o diálogo completo correto com a data pré-preenchida e campo de data oculto/travado.
- Testar que o clique em item existente abre o popover de detalhe com os dados corretos, e que "Editar" abre o diálogo completo correspondente.
- Testar toggle entre modo Lista e modo Calendário, e entre as sub-visões do modo Calendário.

### Backend

- Testar CRUD de compromissos (criação, listagem por mês, edição, exclusão) com isolamento por `usuario_id`.
- Testar validação de campos obrigatórios (data, título).

### E2E

- Fluxo: usuário alterna para modo calendário, clica em um dia, cria uma despesa, e o item aparece corretamente no calendário e na lista.
- Fluxo: usuário cria um compromisso a partir do calendário e o vê listado no dia correto, sem impacto em saldo/receitas/despesas.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx` (ponto de integração do toggle Lista/Calendário)
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/finance/IncomeDialog.tsx`
- `sistema financas/src/screens/finance/MetricCard.tsx`, `MonthSelector.tsx`, `formatters.ts` (possível reuso de padrões visuais/formatação)
- `sistema financas/src/services/reservasService.ts` (referência de padrão para novo service de compromissos)
- Novo(s) componente(s) de calendário (grade Mês/Semana/Dia, view Agenda, popover de criação rápida, popover de detalhe) — a identificar/definir durante o planejamento (ex: `sistema financas/src/screens/finance/calendar/`).
- Novo diálogo/formulário completo de compromisso — a identificar durante o planejamento.
- Novo service de compromissos — a identificar durante o planejamento (ex: `sistema financas/src/services/appointmentsService.ts`).

### Backend

- `sistema financas/backend/src/server.ts` (registro da nova rota)
- Novo arquivo de rota para compromissos — a identificar durante o planejamento (ex: `sistema financas/backend/src/routes/appointments.ts`).
- `sistema financas/backend/src/routes/expenses.ts` e `sistema financas/backend/src/routes/incomes.ts` — possível necessidade de endpoint agregado por mês (a confirmar no planejamento).

### Banco de Dados

- Nova migration em `sistema financas/backend/drizzle/` para tabela de compromissos — a identificar número sequencial durante o planejamento.

## Critérios de Aceite

- Usuário consegue alternar entre modo Lista (atual) e modo Calendário na tela de Movimentações.
- No modo Calendário, usuário consegue alternar entre as sub-visões Mês, Semana, Dia e Agenda.
- Calendário exibe indicadores visuais de despesas, receitas e compromissos no dia/horário correspondente, incluindo destaque para despesas atrasadas, em todas as sub-visões.
- Clicar em um dia/slot vazio abre o popover de criação rápida com seleção de tipo (Despesa/Receita/Compromisso) e a data/horário já preenchidos, sem exigir preenchimento manual desse campo.
- "Mais opções" no popover de criação rápida abre o diálogo completo (`ExpenseDialog`/`IncomeDialog` ou o novo diálogo de compromisso) com a data pré-preenchida.
- Clicar em um item existente abre o popover de detalhe com os dados corretos e ação rápida contextual (marcar como paga/registrar recebimento/concluir); "Editar" abre o diálogo completo correspondente.
- Compromissos são criados, editados e excluídos sem afetar saldo, receitas ou despesas.
- Todas as rotas novas exigem autenticação e filtram por `usuario_id`/`perfil_id`, sem vazamento entre usuários.
- Nenhuma migration é executada sem confirmação explícita do usuário.
- Fluxo atual de criação de despesa/receita pelo botão "Nova despesa/receita" continua funcionando sem regressão.

## Perguntas Para o Planejamento

- Faz sentido criar um endpoint agregado por período (mês/semana/dia — despesas + receitas + compromissos, já agrupados) para evitar múltiplas chamadas no frontend a cada troca de sub-visão, ou reaproveitar os endpoints existentes de listagem por mês e filtrar/agrupar no cliente?
- O componente de calendário deve ser construído do zero (grid próprio com Tailwind, como sugere o mockup) ou vale avaliar uma lib como `react-big-calendar`/`FullCalendar` para as visões Semana/Dia com posicionamento por horário (que são mais complexas de implementar manualmente)?
- Compromissos devem ter algum campo de categoria/cor própria (o mockup tem uma cor de "accent" configurável para compromissos), ou usar uma cor fixa de marcador no calendário nesta entrega?
- O toggle Lista/Calendário e a sub-visão ativa (Mês/Semana/Dia/Agenda) devem persistir a preferência do usuário (ex: localStorage), ou sempre iniciar em modo Lista/visão Mês?
- O popover de criação rápida deve ficar posicionado relativo ao elemento clicado (como no mockup) em todas as resoluções de tela, incluindo mobile/tablet — dado que o projeto tem tela pública e provavelmente suporte a telas menores, como o popover deve se comportar em viewport estreito?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `CLAUDE.md` e `AGENT.md` na raiz de `sistema financas` antes de planejar; observe que o conteúdo desses arquivos descreve um contexto genérico de "multi-prefeitura" com RLS e Drizzle ORM que não corresponde ao padrão real observado no código (SQL parametrizado via `pg`, isolamento por `usuario_id`/`perfil_id`) — priorize o padrão real do código sobre o texto genérico do AGENT.md ao tomar decisões técnicas, mas mantenha as regras de segurança, migrations e confirmação explícita descritas em ambos os arquivos.
- Inspecione os arquivos citados na seção "Arquivos Provavelmente Afetados" antes de escrever o plano.
- Classifique a implementação como `frontend + backend + database`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere um plano em `.plans/` (ou `.portal/plans/`, seguindo o padrão já usado no projeto) com etapas pequenas, revisáveis e seguras, considerando que o ambiente pode estar apontando para produção.
