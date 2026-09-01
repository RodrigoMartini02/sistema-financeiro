# Task: Corrigir precisão e composição dos cards de resumo em Movimentações

## Contexto

A tela de Movimentações (`src/screens/finance/MovimentacoesScreen.tsx`) exibe cinco cards de resumo no topo — Saldo anterior, Receitas, Despesas, Saldo projetado e Comprometimento — acima das abas Receitas/Despesas/Planejamento. Esses cards são alimentados por dados agregados vindos do backend (`useFinanceDashboard`, que consome `GET /meses/:ano/:mes/saldo`, e `fetchDashboardAnual`, que consome `GET /financial/anual`), calculados via `annualMonth?.despesas ?? dashboard?.balance.despesas ?? 0` e fórmulas locais (`src/screens/finance/MovimentacoesScreen.tsx:203-207`).

Cada aba (`DespesasScreen.tsx`, `ReceitasScreen.tsx`) renderiza sua própria tabela com filtros locais (status, categoria, forma de pagamento, data de pagamento) que nunca saem do escopo do componente filho — o componente pai (`MovimentacoesScreen.tsx`), que desenha os cards, não tem acesso ao resultado filtrado.

Investigação já confirmou, com consulta read-only ao banco de produção, a causa raiz de um dos três problemas abaixo (ver seção "Decisão Técnica Desejada").

## Problema

Foram identificados três problemas distintos, porém relacionados, nos mesmos cards:

**1. Bug de dados — cards somam R$ 0,00 para despesas com apenas a coluna legada `valor` preenchida.**
As queries SQL de agregação em `backend/src/routes/months.ts:63` (saldo do mês) e `backend/src/routes/financial.ts:109` (dashboard anual) calculam o valor de cada despesa como `COALESCE(valor_pago, valor_final, valor_original)` (quando paga) ou `COALESCE(valor_final, valor_original)` (quando não paga) — sem fallback para a coluna legada `valor`. O frontend já tem esse terceiro fallback (`expenseFromApi`, `src/services/financeService.ts:66`: `r.valor_final ?? r.valor_original ?? r.valor`). Confirmado via consulta read-only em produção que existem registros reais com `valor_final IS NULL AND valor_original IS NULL` mas `valor` preenchido (ex.: despesa "DAS", id 18852, `valor: 86.05`, `valor_final: null`) — a tabela de listagem exibe o valor corretamente (usa o fallback do frontend), mas os cards de resumo somam `NULL` para esses registros, resultando em totais subestimados ou zerados.

**2. Cards não refletem os filtros aplicados na tabela.**
Ao aplicar um filtro de Status, Categoria, Pagamento ou Data de pagamento na tabela de Despesas (ou de busca em Receitas), os cards de resumo continuam mostrando o total do mês inteiro, ignorando os itens filtrados. Isso é esperado, funcionalmente, para o propósito dos cards — mostrar os valores atualizados de acordo com os filtros aplicados — mas hoje não acontece porque o estado de filtro é local a `DespesasScreen.tsx`/`ReceitasScreen.tsx` e nunca é comunicado ao componente pai.

**3. Composição pouco clara de "Saldo anterior" e "Saldo projetado".**
"Saldo anterior" vem de `meses.saldo_final` do mês anterior (`backend/src/routes/months.ts:52-89`), que é, na prática, o saldo **acumulado de todo o histórico** até o fechamento daquele mês (não apenas o resultado de um único mês isolado) — mas nomeado e apresentado como se fosse só "o mês anterior". Além disso, esse valor só existe de fato depois que o mês anterior foi explicitamente fechado (`POST /meses/:ano/:mes/fechar`, único ponto do backend que insere em `meses`); hoje, um mês anterior não fechado e um saldo anterior real igual a zero são visualmente indistinguíveis — ambos mostram `R$ 0,00` sem nenhuma indicação de que o dado ainda não está disponível.

## Objetivo

Fazer os cards de resumo de Movimentações exibirem valores corretos e agirem redecoraram para refletir três coisas: (a) a soma real dos lançamentos, mesmo os que só têm a coluna legada `valor` preenchida; (b) os filtros aplicados na tabela abaixo, quando houver; (c) uma composição clara de onde vem o saldo acumulado e o que muda dentro do mês corrente, deixando explícito quando o mês anterior ainda não foi fechado.

## Decisão Técnica Desejada

**Sobre o bug de dados (1):** adicionar `valor` como terceiro fallback nas duas queries SQL de agregação (`months.ts:63` e `financial.ts:109`), no mesmo padrão já usado pelo frontend (`COALESCE(valor_pago, valor_final, valor_original, valor)` quando pago; `COALESCE(valor_final, valor_original, valor)` quando não pago). Correção de leitura, sem migração de dados. A opção de corrigir os dados na origem (`UPDATE despesas SET valor_final = valor WHERE valor_final IS NULL`) é uma frente separada e opcional, fora do escopo desta task — não deve ser executada sem confirmação explícita do usuário em uma iteração futura.

**Sobre os cards não reagirem a filtros (2):** quando um filtro estiver ativo na aba correspondente (Despesas ou Receitas), o card daquela categoria específica (Despesas ou Receitas) deve somar apenas os itens filtrados/visíveis na tabela. Os demais cards (Saldo anterior/atual, Saldo projetado, Comprometimento) continuam representando o mês inteiro, sem filtro próprio — eles não têm um filtro equivalente e não devem tentar recalcular a partir do subconjunto filtrado de despesas/receitas. O mecanismo exato de comunicação entre o filho (`DespesasScreen`/`ReceitasScreen`) e o pai (`MovimentacoesScreen`) — prop controlada, callback expondo o total filtrado, ou elevação de estado — deve ser decidido durante o planejamento, evitando duplicar a lógica de filtro em dois lugares.

**Sobre a composição dos cards de saldo (3):** renomear "Saldo anterior" para "Saldo atual" e mudar sua composição para somar o saldo acumulado (herdado do fechamento do mês anterior, quando existir) mais as receitas já lançadas no mês corrente — não mais apenas o saldo herdado isolado. "Saldo projetado" passa a ser esse novo "Saldo atual" menos as despesas do mês (matematicamente equivalente ao resultado final que já é exibido hoje: `saldoAnterior + receitas - despesas`, apenas reorganizando em qual ponto da cadeia cada card mostra o resultado). O card "Saldo atual" deve exibir, em texto menor, a composição (ex.: saldo herdado + receitas do mês). Quando o mês anterior ainda não tiver sido fechado, o "Saldo atual" deve mostrar apenas as receitas já lançadas no mês corrente (sem o acumulado anterior, que ainda não está disponível) e sinalizar visualmente esse estado (ícone/mensagem indicando que o mês anterior está em aberto), em vez de apresentar um valor que pareça calculado normalmente. "Receitas" e "Comprometimento" permanecem como cards independentes, sem mudança de fórmula ou posição.

## Escopo Funcional

### Dentro do escopo

- Corrigir o fallback de valor nas duas queries SQL de agregação (`months.ts`, `financial.ts`) para incluir a coluna legada `valor`.
- Levantar o total filtrado de despesas (e de receitas) do componente filho para `MovimentacoesScreen.tsx`, e usá-lo no card correspondente quando houver filtro ativo.
- Renomear "Saldo anterior" para "Saldo atual" e alterar sua fórmula/composição conforme descrito acima.
- Exibir, em texto menor dentro do card "Saldo atual", a composição do valor (saldo herdado + receitas do mês, ou apenas receitas do mês quando o mês anterior estiver em aberto).
- Adicionar indicação visual (ícone/mensagem) quando o mês anterior não estiver fechado, distinguindo esse estado de um saldo acumulado real igual a zero.
- Ajustar a fórmula de "Saldo projetado" para partir do novo "Saldo atual" (resultado final deve permanecer matematicamente equivalente ao valor já exibido hoje, quando os dados estiverem corretos).

### Fora do escopo inicial

- Corrigir os dados na origem (`UPDATE` em `despesas` preenchendo `valor_final`/`valor_original` a partir de `valor`) — fica registrado como frente separada e opcional, requer confirmação explícita antes de qualquer execução em produção.
- Estender o comportamento de cards reagindo a filtros para a aba Planejamento (`BudgetPanel`) — não foi mencionada nesta investigação.
- Qualquer mudança em "Receitas" e "Comprometimento" além de manter seu comportamento atual.
- Mudanças na tela de Calendário (`CalendarView`) ou em relatórios (`RelatoriosScreen.tsx`), mesmo que consumam rotas relacionadas (`/meses/:ano/:mes/saldo`, `/financial/anual`).
- Revisão completa dos filtros de `DespesasScreen.tsx`/`ReceitasScreen.tsx` — apenas o mecanismo de expor o resultado filtrado ao pai está no escopo, não uma reformulação dos filtros existentes.

## Requisitos de Frontend

- `MovimentacoesScreen.tsx`: consumir o total filtrado de despesas/receitas quando disponível, substituindo `annualMonth?.despesas ?? dashboard?.balance.despesas ?? 0` (e o equivalente de receitas) pelo total filtrado apenas quando um filtro estiver ativo na aba correspondente.
- `DespesasScreen.tsx` e `ReceitasScreen.tsx`: expor ao componente pai o total (e talvez a contagem) dos itens após aplicação dos filtros locais, sem duplicar a lógica de filtro em dois lugares.
- Novo cálculo de "Saldo atual": buscar (ou reaproveitar, se já disponível) o status de fechamento do mês anterior — hoje o componente já consulta o status de fechamento do mês corrente (`mesStatusQuery`, `MovimentacoesScreen.tsx:152-161`) e pode ser estendido ou reconsultado para o mês anterior.
- Ajustar rótulos, subtítulos e composição textual dos cards conforme a nova fórmula, preservando o padrão visual existente (`MovementMetricCard`).
- Tratar estados de loading/error já existentes (`finance.dashboard.error`, `annual.error`) sem introduzir novos estados não solicitados.

## Requisitos de Backend

- `backend/src/routes/months.ts`: adicionar `valor` como terceiro fallback na query de soma de despesas usada em `calculateBalanceBreakdown` (linha ~63).
- `backend/src/routes/financial.ts`: adicionar `valor` como terceiro fallback na subquery de despesas da rota `GET /anual` (linha ~109). Avaliar também, durante o planejamento, se a ausência do filtro `status = 'ativa'` nessa mesma subquery (presente na subquery de receitas equivalente, linha ~102, mas ausente na de despesas) deve ser corrigida junto, já que é uma inconsistência encontrada na mesma investigação, mesmo não tendo causado o sintoma relatado nos dados atuais.
- Nenhuma rota nova é necessária — apenas ajuste das queries existentes.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente. Nenhuma migration é necessária para esta task — a correção é inteiramente de leitura (queries SQL). A correção de dados legados (`valor_final`/`valor_original` nulos) é uma frente separada e opcional, fora do escopo, que exigiria confirmação explícita antes de qualquer execução.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant; sem isolamento de tenant a considerar. As queries afetadas já filtram por `usuario_id` e por `perfil_id` (via `profileWhere`) — este comportamento existente deve ser preservado nas duas queries corrigidas. Nenhum dado sensível novo é exposto; a mudança é puramente de precisão numérica e composição visual dos cards já existentes, para o mesmo usuário autenticado que já tinha acesso a esses valores.

## Requisitos de Migração ou Compatibilidade

- A correção do fallback SQL pode alterar valores numéricos exibidos em outros consumidores das mesmas rotas (`/meses/:ano/:mes/saldo`, `/financial/anual`) — por exemplo, gráficos ou relatórios que dependam desses endpoints. Deve ser avaliado durante o planejamento se algum outro componente consome essas rotas e se a mudança de valor (de subestimado para correto) é sempre desejável nesses outros pontos, ou se algum deles precisa de tratamento à parte.
- Nenhuma quebra de contrato de API é esperada — os endpoints continuam retornando os mesmos campos, apenas com valores mais precisos.

## Requisitos de Testes

### Frontend

- Testar manualmente: card "Despesas" com lançamentos que só têm `valor` preenchido (sem `valor_final`/`valor_original`) — deve somar corretamente.
- Testar manualmente: aplicar filtro de Status/Categoria na tabela de Despesas e confirmar que o card "Despesas" reflete apenas os itens filtrados; remover o filtro e confirmar que volta ao total do mês.
- Testar manualmente: mês anterior fechado vs. não fechado — confirmar que o card "Saldo atual" distingue os dois casos visualmente.
- Não há suíte de testes automatizados nesta área do projeto (confirmado em investigação anterior) — validação manual é obrigatória.

### Backend

- Testar manualmente as duas rotas alteradas (`GET /meses/:ano/:mes/saldo`, `GET /financial/anual`) com dados reais que incluam registros legados (`valor` preenchido, `valor_final`/`valor_original` nulos) e confirmar que os totais retornados batem com a soma esperada.

### E2E

Não aplicável inicialmente — não há suíte E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`

### Backend

- `sistema financas/backend/src/routes/months.ts`
- `sistema financas/backend/src/routes/financial.ts`

### Banco de Dados

Nenhuma alteração de schema ou migration identificada para esta task.

## Critérios de Aceite

- O card "Despesas" soma corretamente lançamentos que só têm a coluna legada `valor` preenchida (sem `valor_final`/`valor_original`).
- A mesma correção de fallback é aplicada nas duas rotas afetadas (`/meses/:ano/:mes/saldo` e `/financial/anual`), sem introduzir divergência entre elas.
- Ao aplicar um filtro na tabela de Despesas ou Receitas, o card correspondente (Despesas ou Receitas) passa a exibir o total dos itens filtrados; ao remover o filtro, volta a exibir o total do mês inteiro.
- Os demais cards (Saldo atual, Saldo projetado, Comprometimento) não tentam recalcular a partir de um subconjunto filtrado.
- O card "Saldo atual" exibe a soma do saldo acumulado (quando o mês anterior estiver fechado) mais as receitas do mês corrente, com a composição visível em texto menor.
- Quando o mês anterior não estiver fechado, o "Saldo atual" mostra apenas as receitas do mês corrente e sinaliza visualmente que o mês anterior está em aberto, sem apresentar isso como um saldo acumulado real igual a zero.
- "Saldo projetado" continua representando o resultado final da equação (saldo atual − despesas do mês), com valor numérico equivalente ao que seria calculado pela fórmula anterior, uma vez corrigidos os dados de entrada.
- "Receitas" e "Comprometimento" permanecem com o comportamento e posição atuais.
- Nenhuma migration foi executada; nenhum dado em produção foi alterado como parte desta implementação.

## Perguntas Para o Planejamento

- Qual o melhor mecanismo para o filho (`DespesasScreen`/`ReceitasScreen`) expor o total filtrado ao pai (`MovimentacoesScreen`) sem duplicar a lógica de filtro: prop controlada (filtros vivendo no pai), callback (`onFilteredTotalChange`), ou outro padrão já usado no projeto?
- A ausência de `status = 'ativa'` na subquery de despesas de `financial.ts` (`GET /anual`) deve ser corrigida nesta mesma task, já que foi encontrada na mesma investigação, ou deve virar uma task separada por ser um problema distinto (mesmo que relacionado)?
- Como obter o status de fechamento do mês anterior de forma eficiente — reaproveitar/estender o endpoint `GET /meses` já consumido por `mesStatusQuery`, ou criar um novo parâmetro/consulta específica?
- O texto exato dos rótulos e mensagens (ex.: aviso de mês anterior em aberto) deve ser validado com o usuário antes da implementação final, já que envolve escolhas de copy?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz do workspace) e `sistema financas/AGENT.md`/`sistema financas/CLAUDE.md`. Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto — considerar apenas os arquivos de contexto que de fato existem.
- Inspecione os arquivos citados antes de escrever o plano, especialmente `MovimentacoesScreen.tsx`, `DespesasScreen.tsx`, `ReceitasScreen.tsx`, `months.ts` e `financial.ts`.
- Classifique a implementação como `frontend + backend`, salvo se a investigação mostrar outro escopo.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations nem qualquer comando de escrita em banco de dados — inclusive o `UPDATE` opcional mencionado na seção "Decisão Técnica Desejada", que está fora do escopo desta task.
- Gere um plano em `.plans/` (padrão já usado neste projeto) com etapas pequenas, revisáveis e seguras, seguindo a sequência obrigatória `/planejar → aprovação → /implementar → /finalizar` definida em `sistema financas/CLAUDE.md`.
