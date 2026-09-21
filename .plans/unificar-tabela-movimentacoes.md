# Plano de Implementação: Unificar tabela de Movimentações (Receitas + Despesas)

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md`), consolidada após investigação exaustiva de 2 agentes Explore nesta sessão
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Elimina as abas "Receitas"/"Despesas" da tela de Movimentações, substituindo-as por uma única tabela combinada de lançamentos. Receita e Despesa passam a ser um grupo de filtro de Tipo (multi-seleção) dentro do painel de filtros já existente, ao lado de um filtro de Membros agora único e compartilhado por toda a tela (cards, faixa de cartões e a tabela). Os filtros específicos de despesa (Status, Categoria, Forma de pagamento, Cartão, Data de pagamento) só ficam visíveis no painel quando "Despesa" está marcado no filtro de Tipo. A barra de ferramentas inteira (navegação de mês, toggle Lista/Calendário, toggle Lançamentos/Planejamento, botões Nova receita/Nova despesa, painel de filtro) passa a viver num único lugar, no componente pai.

Toda a base de dados necessária já existe: `useFinanceDashboard` já retorna `expenses` e `incomes` numa única chamada de rede — hoje ela é simplesmente invocada de forma redundante (até 3-4 vezes, com escopos de membro potencialmente divergentes entre abas). Este plano consolida isso numa única fonte de verdade.

## Escopo

### Dentro do escopo

- Novo componente de tabela combinada de lançamentos: `src/screens/finance/LancamentosTable.tsx`, com estrutura de dados unificada usando um discriminador `kind: 'despesa' | 'receita'` (mesmo padrão já usado em `CalendarView.tsx:79-109`).
- Colunas da tabela combinada: superset das colunas de Despesas (Descrição, Tipo/parcela, Vencimento, Data compra, Categoria, Usuário, Pagamento, Data pagamento, Status, Valor, NF, Anexos, Ações) — para linhas de Receita, os campos que não existem nesse tipo (Categoria, Cartão, Data compra, Vencimento vs. Data recebimento, Status de despesa, NF quando não aplicável) exibem traço (`—`). Decisão do usuário, mantida apesar do risco de esparsidade visual sinalizado durante o planejamento.
- Coluna de seleção (checkbox): ativa apenas em despesas não pagas — pagamento em lote continua exclusivo de despesa (decisão confirmada). Em linhas de receita, o checkbox fica ausente/desabilitado nessa coluna.
- Ações por linha resolvidas condicionalmente por `kind`:
  - Despesa: Editar, Pagar, Mover para o próximo mês, Cancelar, Excluir (com tratamento de parcelas via `DeleteInstallmentDialog`).
  - Receita: Editar, Confirmar recebimento (quando prevista) ou Cancelar, Excluir.
- Novo grupo de filtro **"Tipo"** no `MultiFilterPanel`: opções Receita/Despesa, multi-seleção, default com as duas marcadas.
- Visibilidade condicional dos grupos de filtro de despesa (Status, Categoria, Forma de pagamento, Cartão, Data de pagamento): aparecem no painel somente quando "Despesa" está marcado no filtro de Tipo. O grupo Membros é o único sempre visível e compartilhado, independente do filtro de Tipo.
- Elevação de estado de `DespesasScreen.tsx`/`ReceitasScreen.tsx` para `MovimentacoesScreen.tsx`: `filtroMembros`, `meQ`, `membrosQ` (hoje duplicados em ambas as telas com o mesmo shape), e `categoriasQ` (hoje só em Despesas, necessária sempre que "Despesa" estiver no filtro de Tipo).
- Consolidação de `useFinanceDashboard` numa única chamada no componente pai, com um único `escopoFamilia` derivado do filtro de Membros único, alimentando cards de resumo, faixa de limite de cartões e a tabela combinada.
- Nova barra de ferramentas única no pai, numa única linha (sem quebrar em duas fileiras; em telas estreitas usa `flex-wrap` natural, como já ocorre hoje), com layout confirmado pelo usuário:
  - **Bloco esquerdo:** `MonthYearPicker` (navegação de mês) + botões "Nova receita"/"Nova despesa".
  - **Bloco direito:** toggle Lista/Calendário + novo toggle **Lançamentos/Planejamento** (substitui o `MovementTableToggle` de 3 opções) + `FilterChip` de ordenação + `MultiFilterPanel` único (botão de filtros).
- Migração do card "Contratos — Faturamento" (hoje em `ReceitasScreen.tsx:207-270`, condicional a `isEmpresa` e contratos no mês) para acima da tabela combinada no componente pai, independente do filtro de Tipo.
- A faixa de limite de cartões (`CardLimitRow`) passa a usar o mesmo escopo de membro do filtro único — preparando terreno para a correção de backend tratada em plano separado (ver "Fora do escopo").
- Remoção de `src/screens/despesas/DespesasScreen.tsx` e `src/screens/receitas/ReceitasScreen.tsx` como telas de tabela, após validação completa da paridade funcional. As mutations que hoje vivem nelas (pagar, mover, cancelar, confirmar recebimento, excluir) migram para dentro de `LancamentosTable.tsx` ou um hook dedicado a ser criado durante a implementação.

### Fora do escopo

- Mudanças em `ExpenseDialog.tsx`, `IncomeDialog.tsx`, `PaymentModal.tsx`, `BatchPaymentModal.tsx`, `DeleteInstallmentDialog.tsx` — confirmados como componentes já independentes (reutilizados também por `CalendarView.tsx`), continuam como estão, só passam a ser invocados a partir do novo componente.
- `BudgetPanel.tsx` (aba Planejamento) — inalterado, continua existindo como o segundo lado do novo toggle Lançamentos/Planejamento.
- `CalendarView.tsx` — já tem seu próprio padrão de lista combinada (despesas + receitas + compromissos com discriminador `kind`); não é tocado por este plano, apenas usado como referência de padrão.
- Qualquer mudança de backend, incluindo rotas, services ou schema — `useFinanceDashboard`/`fetchFinanceDashboard` já retornam tudo que este plano precisa.
- **Correção da rota `/cartoes/limites`** (hoje ignora o parâmetro de escopo/família, trazendo sempre cartões de todos os membros visíveis por permissão, independente de qualquer filtro de tela — achado de uma investigação anterior nesta mesma sessão) — fica como plano técnico separado, encadeado a este. Este plano prepara o terreno elevando o filtro de Membros para o componente pai (pré-requisito direto), mas a correção do backend (`cardLimitService.ts`, ajuste de query key para incluir escopo) é tratada à parte, para não misturar uma reestruturação grande de UI com uma correção pontual de bug de backend.
- Testes automatizados novos — não há suíte cobrindo esta tela hoje; a validação desta reestruturação é manual (ver seção de testes).

## Leitura de contexto

- `AGENT.md` (raiz) e `sistema financas/CLAUDE.md` — já lidos em sessões anteriores desta conversa; sequência `/planejar → aprovação → /implementar → /finalizar` se aplica.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação exaustiva realizada nesta sessão por dois agentes Explore, cobrindo com precisão de file:line: `src/screens/despesas/DespesasScreen.tsx` (estrutura completa de colunas, filtros, mutations, toolbar), `src/screens/receitas/ReceitasScreen.tsx` (idem), `src/screens/finance/MovimentacoesScreen.tsx` (ordem visual atual, montagem de `toolbarStart`), `src/ui/MultiFilterPanel.tsx` (confirmado 100% genérico, sem necessidade de mudança estrutural), `src/hooks/useFinanceDashboard.ts` (confirmado retorno único de `expenses`+`incomes`), `src/screens/finance/calendar/CalendarView.tsx` (único precedente de lista combinada no projeto, padrão `kind` de referência), `src/screens/finance/CardLimitRow.tsx`/`src/services/cardLimitsService.ts`/`backend/src/services/cardLimitService.ts` (investigação do plano de correção de cartões, que motivou a elevação do filtro de Membros).

## Impacto por área

### Frontend

**Novo: `src/screens/finance/LancamentosTable.tsx`**
- Props: `expenses: Expense[]`, `incomes: Income[]`, filtros ativos (Tipo, Status, Categoria, Forma de pagamento, Cartão, Data de pagamento, Membros já aplicado a montante), `isEmpresa`, callbacks de mutação.
- Monta um array combinado de itens `{ kind: 'despesa'; data: Expense } | { kind: 'receita'; data: Income }`, filtrado pelo Tipo selecionado antes da renderização.
- Ordenação: adaptar o `Ordenar` de Despesas (`cadastro_desc | vencimento_asc | vencimento_desc | valor_asc | valor_desc | descricao`) para um critério que funcione nos dois tipos — campos de data e valor existem em ambos; vencimento é específico de despesa, então "vencimento ↑/↓" ordenando uma lista mista de receita+despesa precisa de uma regra explícita (ex.: usar data de recebimento como equivalente para receita), a decidir durante a implementação e documentar no código.
- Estado de seleção (`selecionadas: Set<string>`, qualificado por uma chave composta tipo `${kind}-${id}` para não colidir entre um id de despesa e um id de receita iguais) — checkbox só habilitado para despesas não pagas.
- Reaproveita `ExpenseCard.tsx` para a versão mobile de despesa; para receita, verificar se existe componente de card mobile equivalente em `ReceitasScreen.tsx` e replicar o padrão se não existir.
- Célula por célula: campos ausentes no tipo `kind='receita'` (Categoria, Cartão/Pagamento no sentido de cartão de crédito, Data de compra, Status de despesa, NF quando aplicável) renderizam `—`.

**`src/screens/finance/MovimentacoesScreen.tsx`**
- Remove `type MovementTab = 'receitas' | 'despesas' | 'planejamento'` e `MovementTableToggle` (linhas 58-105 atuais); novo tipo `'lancamentos' | 'planejamento'` com toggle de 2 opções.
- Eleva para este componente: `filtroMembros`, `meQ` (`useQuery(['usuario-me'], fetchMe)`), `membrosQ` (`fetchMembros`), `categoriasQ` (`fetchCategorias`), `filtroStatus`, `filtroCategoria`, `filtroFormaPag`, `filtroCartao`, `filtroDataPag`, e o novo `filtroTipo: Set<'receita' | 'despesa'>` (default: ambos marcados).
- Monta o array de `FilterGroup` passado ao `MultiFilterPanel` dinamicamente: grupo "Membros" sempre presente; grupo "Tipo" sempre presente; grupos "Status"/"Categoria"/"Forma de pagamento"/"Cartão"/"Data de pagamento" incluídos no array somente quando `filtroTipo.has('despesa')` for verdadeiro.
- Uma única chamada `useFinanceDashboard(month, year, true, escopoFamilia ? 'familia' : undefined)`, com `escopoFamilia` derivado do `filtroMembros` único (mesma lógica de derivação já usada hoje em `DespesasScreen.tsx:290`/`ReceitasScreen.tsx`).
- Nova barra de ferramentas única substituindo o header atual (linhas 153-199) e as toolbars internas hoje duplicadas em `DespesasScreen.tsx:568-634` e `ReceitasScreen.tsx:275-280` — layout de linha única com bloco esquerdo (navegação de mês + botões de criar) e bloco direito (toggles de visualização + ordenação + filtro), conforme confirmado com o usuário.
- Renderiza o card "Contratos — Faturamento" migrado de `ReceitasScreen.tsx`, condicional a `isEmpresa` e à existência de contratos no mês, posicionado acima da `LancamentosTable`.
- Passa a `CardLimitRow`/faixa de cartões o mesmo `escopoFamilia`/filtro de membro único (preparação para o plano de correção de backend separado).

**Removidos como telas de tabela:** `src/screens/despesas/DespesasScreen.tsx`, `src/screens/receitas/ReceitasScreen.tsx`. As mutations hoje definidas ali (`pagarDespesa`, `moverDespesa`, `cancelarDespesa`, confirmar recebimento de receita, excluir de ambos os tipos) migram para dentro de `LancamentosTable.tsx` ou para um hook novo dedicado (ex.: `useLancamentosMutations`), a decidir durante a implementação seguindo o padrão de mutations já estabelecido no projeto (uso de `useMutation` + `invalidateFinanceQueries`).

- Sem novas query keys além do necessário para o `filtroTipo` (estado local, não precisa de query key própria).
- Sem impacto em `frontend/AGENT.md` (inexistente) — seguir padrões já usados no projeto (React Query para server state, sem fetch direto em componente).

### Backend

`Sem impacto esperado` neste plano — nenhuma rota, service ou schema muda. A correção da rota `/cartoes/limites` (ignorando escopo de família) fica em plano técnico separado, conforme "Fora do escopo".

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Checklist de paridade funcional (obrigatório validar item a item antes de considerar a implementação concluída)

| Funcionalidade hoje | Onde vive hoje | Deve existir na tabela combinada |
|---|---|---|
| Editar despesa | `DespesasScreen.tsx` | Sim — abre `ExpenseDialog` |
| Marcar despesa como paga | `DespesasScreen.tsx` | Sim — abre `PaymentModal` |
| Mover despesa para o próximo mês | `DespesasScreen.tsx` | Sim |
| Cancelar despesa | `DespesasScreen.tsx` | Sim |
| Excluir despesa (com tratamento de parcelas) | `DespesasScreen.tsx` | Sim — via `DeleteInstallmentDialog` |
| Seleção múltipla + pagamento em lote | `DespesasScreen.tsx` | Sim, exclusivo de despesas não pagas (decidido) |
| Filtros Status/Categoria/Forma de pagamento/Cartão/Data de pagamento | `DespesasScreen.tsx` | Sim, visíveis só quando Tipo=Despesa está marcado |
| Ordenação (mais recentes, vencimento, valor, A-Z) | `DespesasScreen.tsx` | Sim, com critério adaptado para lista mista |
| Visualizar/gerenciar anexos | `DespesasScreen.tsx` | Sim |
| Coluna NF (só conta empresa) | `DespesasScreen.tsx` | Sim |
| Editar receita | `ReceitasScreen.tsx` | Sim — abre `IncomeDialog` |
| Confirmar recebimento (receita prevista) | `ReceitasScreen.tsx` | Sim |
| Cancelar receita | `ReceitasScreen.tsx` | Sim |
| Excluir receita | `ReceitasScreen.tsx` | Sim |
| Colunas Cliente/Representante/Comissão (só conta empresa) | `ReceitasScreen.tsx` | Sim |
| Card "Contratos — Faturamento" | `ReceitasScreen.tsx` | Sim, migrado para o componente pai |
| Filtro de Membros | Duplicado em ambas as telas | Sim, único e compartilhado por toda a tela |
| Guias de primeiro acesso (`useFirstAccessGuide`) atrelados a Despesas/Receitas | Ambas | Reavaliar individualmente quais ainda fazem sentido no novo layout; não descartar sem revisão |
| `onFilteredSummaryChange` (alimenta os cards de resumo do pai com total/contagem filtrados) | `DespesasScreen.tsx` | Sim, adaptado para refletir também o filtro de Tipo |

## Estratégia de implementação

1. Elevar `filtroMembros`/`meQ`/`membrosQ`/`categoriasQ` para `MovimentacoesScreen.tsx` e consolidar numa única `useFinanceDashboard`. Validar visualmente que os cards de resumo e a faixa de cartões continuam corretos antes de prosseguir — este passo já é validável isoladamente, sem tocar na tabela ainda.
2. Construir `LancamentosTable.tsx` do zero, ao lado do código antigo (sem remover `DespesasScreen.tsx`/`ReceitasScreen.tsx` ainda), cobrindo estrutura de dados combinada, colunas com traço, e renderização básica.
3. Migrar as mutations e os dialogs (`ExpenseDialog`, `IncomeDialog`, `PaymentModal`, `BatchPaymentModal`, `DeleteInstallmentDialog`) para serem invocados a partir do novo componente.
4. Adicionar o grupo de filtro "Tipo" e a lógica de visibilidade condicional dos grupos de despesa na montagem do array de `FilterGroup`, feita agora no componente pai.
5. Trocar a renderização de `MovimentacoesScreen.tsx` para usar `LancamentosTable` no lugar da árvore de abas Receitas/Despesas, mantendo o toggle Lançamentos/Planejamento.
6. Validar manualmente a checklist de paridade funcional completa, item a item.
7. Só então remover `src/screens/despesas/DespesasScreen.tsx` e `src/screens/receitas/ReceitasScreen.tsx`.
8. Rodar `npx tsc --noEmit` e `npx vite build`.

## Regras de negócio identificadas

- Receita e Despesa deixam de ser destinos de navegação (abas) e passam a ser uma dimensão de filtro dentro da mesma tela.
- Pagamento em lote continua sendo uma capacidade exclusiva de despesas não pagas — não é estendido a receitas.
- O filtro de Membros é único para toda a tela de Movimentações: o mesmo valor controla os cards de resumo, a faixa de limite de cartões e a tabela de lançamentos, eliminando a possibilidade de essas partes discordarem sobre "quem" está sendo mostrado.
- Quando nenhum membro está selecionado no filtro, a tabela simplesmente fica vazia, sem mensagem de aviso dedicada (decisão confirmada, unificando o comportamento hoje divergente entre Despesas e Receitas).
- Colunas que não se aplicam ao tipo de lançamento da linha (ex.: Categoria numa linha de receita) exibem traço, nunca são omitidas da tabela.

## Regras multi-tenant e segurança

Projeto não é multi-tenant. Nenhuma mudança de autorização é introduzida — a consolidação de `useFinanceDashboard` numa única chamada usa exatamente o mesmo parâmetro de escopo (`'familia'` ou ausente) que já existe hoje, só evita chamadas redundantes e potencialmente divergentes. Nenhum dado novo é exposto além do que já é retornado pela mesma rota já autenticada e filtrada por usuário/conta.

## Validações necessárias

Nenhuma validação de input nova é introduzida — é uma reestruturação de apresentação e composição de estado sobre dados já validados nas rotas existentes.

## Testes necessários

### Frontend

- Validação manual completa da checklist de paridade funcional (tabela acima), item a item, em pelo menos um mês com despesas pagas/não pagas, receitas confirmadas/previstas, e parcelamento ativo.
- Validação manual: alternar o filtro de Tipo (só Receita, só Despesa, ambos) e confirmar que a tabela e os grupos de filtro de despesa aparecem/desaparecem corretamente.
- Validação manual: alterar o filtro de Membros e confirmar que cards, faixa de cartões e tabela refletem a mesma seleção simultaneamente.
- Validação manual: pagamento em lote continua funcionando exatamente como hoje.
- Validação manual: modo Calendário (`CalendarView`) continua funcionando sem regressão, já que não é tocado por este plano mas compartilha `useFinanceDashboard`.

### Backend

`Sem impacto esperado`.

### E2E

Não aplicável — não há suíte E2E no projeto.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Risco alto de regressão**: esta é a tela mais usada do sistema, em produção com dados reais, e o plano toca múltiplos arquivos centrais simultaneamente (`MovimentacoesScreen.tsx`, remoção de `DespesasScreen.tsx`/`ReceitasScreen.tsx`, novo componente de tabela). Mitigação: seguir estritamente a ordem incremental da estratégia de implementação (construir e validar o novo antes de remover o antigo), nunca fazer isso como uma substituição direta de uma vez.
- **Ordenação de lista mista**: critérios como "vencimento" não existem de forma idêntica em receita; a implementação precisa definir e documentar explicitamente como cada opção de ordenação se comporta numa lista combinada.
- **Guias de primeiro acesso**: várias chaves de `useFirstAccessGuide` hoje são atreladas ao contexto de Despesas ou Receitas isoladamente; a reestruturação pode invalidar o sentido de algumas — cada uma precisa ser revisada individualmente, não descartada ou mantida em bloco sem análise.
- **Ausência de testes automatizados**: nenhuma suíte cobre esta tela hoje, então toda a garantia de não-regressão depende da validação manual extensa descrita.
- **Dependência com o plano de correção de cartões**: a elevação do filtro de Membros feita aqui é pré-requisito direto do plano separado que corrige a rota `/cartoes/limites` — a ordem de implementação entre os dois planos deve considerar essa dependência.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões de escopo, layout e comportamento foram confirmadas explicitamente pelo usuário durante o planejamento.

## Critérios de aceite do plano

- A checklist de paridade funcional está 100% coberta e validada manualmente.
- Nenhuma aba "Receitas" ou "Despesas" remanescente na UI — apenas o toggle Lançamentos/Planejamento.
- O filtro de Membros é único e reflete simultaneamente em cards de resumo, faixa de limite de cartões e tabela de lançamentos.
- O filtro de Tipo (Receita/Despesa) controla corretamente quais linhas aparecem na tabela e quais grupos de filtro de despesa ficam visíveis no painel.
- `npx tsc --noEmit` e `npx vite build` passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir estritamente a ordem incremental da estratégia de implementação — não remover `DespesasScreen.tsx`/`ReceitasScreen.tsx` antes de validar a paridade funcional completa da nova tabela.
- Nenhuma migration prevista neste plano.
- Não implementar a correção da rota `/cartoes/limites` (escopo de família) como parte deste plano — isso é um plano técnico separado, encadeado a este.
- Revisar individualmente cada guia de primeiro acesso (`useFirstAccessGuide`) hoje atrelada a Despesas/Receitas antes de descartar ou manter.
- Seguir `CLAUDE.md` da raiz e de `sistema financas/`.
