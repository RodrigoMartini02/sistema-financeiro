# Task: Reformular "Cartão" para "Conta" com tipo crédito/débito

## Contexto

O sistema de despesas (`sistema financas`) permite vincular cada despesa a uma forma de pagamento (`forma_pagamento`: `dinheiro`/`pix`/`debito`/`credito`) e, opcionalmente, a um cartão cadastrado (`cartao_id`). O cadastro de cartões vive em Configurações › Cartões (`src/screens/config/CartaoTab.tsx`, tabela `cartoes` no backend).

O modelo de dados atual trata "forma de pagamento" e "cartão" como dois campos independentes, sem vínculo estrutural entre eles:

- `backend/src/db/schema/cards.ts` — tabela `cartoes`: `nome`, `limite`, `dia_fechamento`, `dia_vencimento`, `cor`, `numero_cartao` (últimos dígitos), `bandeira`, `validade`, `perfil_id`, `ativo`. **Não tem campo de tipo** (crédito/débito) — um cartão cadastrado não declara se é de crédito, débito, ou ambos.
- `backend/src/db/schema/expenses.ts` — tabela `despesas`: tem `cartaoId` (FK opcional para `cartoes`) e `paymentMethod`/`forma_pagamento` (varchar livre) como colunas **independentes**.
- `src/screens/finance/ExpenseDialog.tsx` — no formulário de nova despesa, o usuário escolhe a forma de pagamento primeiro (chips: dinheiro/pix/débito/crédito); a seleção de cartão só aparece como bloco secundário quando a forma é crédito ou débito, e só é exibida como lista de opções quando há mais de 1 cartão ativo (linhas ~613-659). Nada no código impede que o mesmo cartão seja lançado ora como crédito, ora como débito, em despesas diferentes.
- `src/services/financeService.ts` — a função `expenseFromApi` (linhas 61-87), que converte a resposta da API de despesas para o tipo usado no frontend, **descarta o campo `cartao_id`** vindo do backend. O tipo `Expense` (`src/types/finance.ts`, linhas 56-80) não tem `cartaoId` nem nome do cartão, apenas `formaPagamento: string`.
- `src/screens/despesas/DespesasScreen.tsx` — a coluna "Pagamento" da tabela de despesas exibe `getFormaLabel(item.formaPagamento)` (linha 647) e o filtro "Pagamento" (`filtroFormaPag`) filtra pela mesma forma de pagamento genérica (linhas 439-446, com opções derivadas de `formas = [...new Set(allItems.map(i => i.formaPagamento))]`).
- `backend/src/routes/cards.ts` — o endpoint `POST /api/cards` limita a **3 cartões por perfil** (linha ~97).
- `receitas` (schema e telas) não têm nenhum campo de cartão ou forma de pagamento — essa dimensão é exclusiva do fluxo de despesas.

## Problema

O filtro e a coluna "Pagamento" na tela de Despesas mostram apenas a forma de pagamento genérica (Crédito/Débito/Dinheiro/PIX), nunca o cartão específico usado — mesmo quando a despesa já tem um cartão vinculado no banco de dados. Isso impede o usuário de responder perguntas simples como "quanto gastei no cartão X este mês", já que despesas de múltiplos cartões de crédito diferentes ficam agregadas sob o mesmo rótulo "Crédito".

Investigação confirmou dois problemas sobrepostos:

1. **Perda de dado na camada de apresentação**: o backend já retorna `cartao_id` na listagem de despesas, mas o frontend descarta esse campo ao montar o objeto `Expense` usado por toda a UI (tabela, filtros, edição). O dado existe no banco e não chega à interface.
2. **Modelagem sem vínculo estrutural**: "forma de pagamento" e "cartão" são campos independentes que podem divergir sem nenhuma validação — um cartão cadastrado não declara se é de crédito ou débito, e uma despesa pode escolher qualquer combinação dos dois campos livremente. Isso mistura dois conceitos que deveriam ser distintos: **onde o dinheiro sai** (a conta — banco, carteira) e **como sai** (o método — débito direto daquela conta, ou crédito de um cartão atrelado a ela).

Dados reais em produção (levantamento read-only já realizado, sem alteração): de 570 despesas, 345 (60%) já têm `cartao_id` preenchido — não é um caso raro. Das despesas com `cartao_id`, 100% são da forma `credito` (ou o valor legado inconsistente `cartao_credito`, presente em 2 registros); nenhuma despesa de débito tem cartão vinculado na prática hoje, apesar do formulário permitir essa combinação. Há poucos cartões cadastrados no total (4 combinações usuário/perfil, entre 1 e 2 cartões cada).

## Objetivo

Reformular o conceito de "cartão" para "conta", de forma que cada conta possa representar um método de pagamento coerente (débito direto da conta, e/ou um cartão de crédito atrelado a ela, com seus próprios limite/fechamento/vencimento), eliminando a possibilidade de forma de pagamento e cartão divergirem sem sentido. A cadeia completa — cadastro de contas, lançamento de despesas, listagem/filtro de despesas e qualquer visualização no painel/relatórios — deve refletir esse novo modelo, mostrando de forma clara qual conta/cartão foi usado em cada despesa, e permitindo filtrar e (futuramente) analisar gastos por conta específica.

## Decisão Técnica Desejada

O usuário confirmou que quer a reformulação completa, não uma correção mínima isolada. A direção pretendida, em suas palavras: "em cartão pode ser 'conta' e nela cadastrar os cartões débito/crédito... e precisa analisar toda a cadeia que isso influencia desde cadastro, movimentações e painel".

O modelo de dados exato ainda não está definido e deve ser avaliado e decidido durante `/planejar`, apresentando opções ao usuário. Abordagens possíveis a considerar (não exaustivo):

- **Opção A — Conta única com crédito opcional**: uma entidade `conta` com campo indicando se tem débito habilitado, crédito habilitado (com limite/fechamento/vencimento próprios), ou ambos. Uma despesa vincula à conta e escolhe o método dentre os habilitados naquela conta.
- **Opção B — Conta e cartão como entidades relacionadas**: uma entidade `conta` (banco/carteira) e uma entidade `cartao_credito` que referencia uma conta (fatura cai naquela conta). Débito vincula direto à conta; crédito vincula ao cartão, que por sua vez aponta para a conta.
- **Outra abordagem** que a skill `planejar` julgar mais alinhada aos padrões já existentes no projeto.

Independente da opção escolhida, o registro de forma de pagamento em cada despesa deve deixar de ser um campo textual solto e desacoplado — deve ser derivado de forma consistente da conta/cartão selecionado, sem permitir combinações inválidas (ex.: crédito sem cartão associado, ou o mesmo cartão registrado ora como crédito ora como débito).

## Escopo Funcional

### Dentro do escopo

- Definir e implementar o novo modelo de dados para "conta" (substituindo ou estendendo `cartoes`), incluindo tipo/capacidades de pagamento.
- Migrar o cadastro (Configurações › Cartões, `CartaoTab.tsx` e rota correspondente) para o novo conceito de conta, incluindo os campos de tipo/crédito quando aplicável.
- Corrigir o fluxo de lançamento de despesa (`ExpenseDialog.tsx`) para que a escolha de conta e método de pagamento sejam coerentes entre si (não dois campos independentes).
- Corrigir a perda de dado no frontend: `expenseFromApi` deve preservar `cartao_id`/nome da conta, e o tipo `Expense` deve expor essa informação.
- Atualizar a listagem de Despesas (`DespesasScreen.tsx`): coluna "Pagamento" deve exibir a conta/cartão real, e o filtro correspondente deve filtrar por conta, não apenas por forma de pagamento genérica.
- Avaliar e decidir, junto ao usuário, o tratamento de dados legados: despesas com `forma_pagamento` preenchido mas sem `cartao_id` (dinheiro, PIX — sem conta associada, esperado); despesas de crédito/débito sem cartão vinculado (histórico anterior ao vínculo); o valor legado inconsistente `cartao_credito`.
- Avaliar se o limite de 3 cartões por perfil (`backend/src/routes/cards.ts`) deve ser revisado, mantido ou removido no novo modelo.
- Mapear e ajustar qualquer ponto do Painel ou Relatórios que hoje leia `forma_pagamento`/`cartao_id`, mesmo que apenas de forma indireta.

### Fora do escopo inicial

- Criar novas visualizações/gráficos de gastos por conta no Painel ou Relatórios — a task cobre garantir que o dado esteja disponível e correto na cadeia; novas análises agregadas são uma entrega futura, não parte desta reformulação.
- Aplicar o mesmo conceito de conta/cartão a `receitas` — receitas não têm essa dimensão hoje e não foi solicitado estendê-la.
- Qualquer mudança de tema, layout genérico ou reformulação visual não relacionada diretamente à exibição de conta/cartão.
- Execução de migração de dados em produção sem confirmação explícita do usuário a cada etapa — planejamento deve propor a estratégia de migração, mas a execução fica condicionada à aprovação separada.

## Requisitos de Frontend

- `src/screens/config/CartaoTab.tsx` (ou sucessor): formulário de cadastro/edição precisa refletir o novo modelo de conta, incluindo qualquer novo campo de tipo/capacidade de pagamento.
- `src/screens/finance/ExpenseDialog.tsx`: fluxo de seleção de forma de pagamento e conta/cartão deve ser reformulado para impedir combinações inconsistentes.
- `src/services/financeService.ts` (`expenseFromApi`) e `src/types/finance.ts` (`Expense`): preservar e expor o vínculo de conta/cartão da despesa, hoje descartado.
- `src/services/configService.ts` e `src/types/config.ts` (`Cartao`, `CartaoFormValues`): atualizar tipos e funções de acesso conforme o novo modelo.
- `src/screens/despesas/DespesasScreen.tsx`: coluna "Pagamento" e filtro correspondente devem refletir a conta/cartão real, não apenas a forma de pagamento genérica.
- Tratar estados de loading/error/empty já existentes nos formulários e listagens afetados, sem introduzir padrões novos não solicitados.
- Reutilizar componentes e padrões de UI já existentes (`Dialog`, `FilterChip`, tokens de formulário) em vez de criar novos.

## Requisitos de Backend

- `backend/src/db/schema/cards.ts`: schema deve ser estendido ou substituído para representar o novo conceito de conta, conforme a opção de modelagem escolhida no planejamento.
- `backend/src/db/schema/expenses.ts`: avaliar se `forma_pagamento` continua como campo solto ou passa a ser derivado da conta/cartão vinculado.
- `backend/src/routes/cards.ts`: rotas de CRUD devem refletir os novos campos e regras (incluindo o limite de 3 por perfil, a ser revisado).
- `backend/src/routes/expenses.ts`: garantir que a listagem continue retornando o vínculo de conta/cartão (já retorna `cartao_id` hoje via `SELECT d.*`; validar se passa a precisar de dado adicional, como nome da conta, via JOIN).
- Validar entradas no backend (não confiar apenas em validação client-side) para as novas regras de consistência entre conta e forma de pagamento.
- Preservar o padrão de filtro por perfil (`perfil_id`) já usado em `cartoes` e `despesas`, aplicando-o à nova entidade de conta.

## Requisitos de Banco de Dados

Mudança de schema é esperada — extensão ou substituição da tabela `cartoes` (possivelmente renomeada ou complementada por uma nova tabela de "contas"), e possível ajuste em `despesas` para formalizar o vínculo com a nova entidade.

Dados existentes a considerar na migração: 345 despesas (de 570) já têm `cartao_id` preenchido, todas com forma de pagamento `credito`/`cartao_credito` (nenhuma com `debito`); cartões cadastrados hoje não têm informação de tipo, então a migração precisará inferir ou solicitar essa informação (ex.: assumir "crédito" para cartões já usados exclusivamente em despesas de crédito, ou perguntar ao usuário).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Toda alteração de schema e qualquer script de backfill de dados devem ser apresentados para revisão antes da execução.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant; sem isolamento de tenant a considerar. O isolamento relevante é por `usuario_id`/`perfil_id`, já aplicado em `cartoes` e `despesas` — esse padrão deve ser preservado integralmente na nova entidade de conta. Nenhum dado sensível novo é introduzido; a mudança é de modelagem e correção de exibição de dados já pertencentes ao usuário autenticado.

## Requisitos de Migração ou Compatibilidade

- Definir estratégia para os dados legados: despesas com `forma_pagamento = 'credito'` mas `cartao_id IS NULL` (histórico anterior ao vínculo, ou lançamentos sem cartão específico); despesas com o valor inconsistente `forma_pagamento = 'cartao_credito'` (2 registros); cartões cadastrados sem informação de tipo (todos, hoje).
- Qualquer migration de schema ou backfill de dados deve ser apresentada como proposta explícita durante `/implementar`, com confirmação do usuário antes da execução — nunca executada automaticamente.
- Avaliar impacto em contratos de API existentes (`GET /api/cards`, `POST/PUT /api/cards`, rotas de despesas) — mudanças de shape de resposta devem ser coordenadas com as telas que os consomem.

## Requisitos de Testes

### Frontend

Não há suíte de testes automatizados nesta área do projeto (confirmado em investigações anteriores) — validação manual é obrigatória e deve ser detalhada no plano de implementação.

### Backend

Idem — validação manual das rotas afetadas, incluindo casos de dados legados (despesa com forma de pagamento crédito sem cartão vinculado, cartão sem tipo definido).

### E2E

Não aplicável — não há suíte E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/services/financeService.ts`
- `sistema financas/src/services/configService.ts`
- `sistema financas/src/types/finance.ts`
- `sistema financas/src/types/config.ts`
- `sistema financas/src/services/demo/demoFakeDatabase.ts` e `sistema financas/src/services/demo/fakeApiResolver.ts` (modo demo referencia `cartao_id` — confirmar se precisa de ajuste)

### Backend

- `sistema financas/backend/src/db/schema/cards.ts`
- `sistema financas/backend/src/db/schema/expenses.ts`
- `sistema financas/backend/src/routes/cards.ts`
- `sistema financas/backend/src/routes/expenses.ts`

### Banco de Dados

- Nova migration para o schema de conta (estrutura exata a definir no planejamento) — a identificar durante o planejamento.
- Possível script de backfill para os dados legados descritos acima — a identificar durante o planejamento, execução condicionada a confirmação explícita.

## Critérios de Aceite

- O cadastro em Configurações reflete o novo conceito de conta, com informação clara de tipo/capacidade de pagamento (crédito e/ou débito).
- Ao lançar uma despesa, a combinação de conta e forma de pagamento é sempre consistente — não é possível vincular uma despesa a uma conta de um jeito que ela não suporta.
- A coluna "Pagamento" e o filtro correspondente na tela de Despesas mostram e filtram pela conta/cartão real usado, não apenas pela forma de pagamento genérica.
- O vínculo de conta/cartão de cada despesa, já existente no banco para 60% dos registros, deixa de ser descartado pelo frontend.
- Dados legados (despesas sem cartão vinculado, valor inconsistente `cartao_credito`) têm tratamento definido e documentado, sem perda de informação nem quebra de exibição.
- Nenhuma migration ou alteração de dado em produção é executada sem confirmação explícita do usuário.
- Frontend e backend permanecem compatíveis; nenhuma rota existente quebra sem uma migração de contrato coordenada.

## Perguntas Para o Planejamento

- Qual das abordagens de modelagem (conta única com crédito opcional, conta+cartão como entidades relacionadas, ou outra) melhor se encaixa nos padrões já existentes no projeto e no volume de trabalho aceitável para esta entrega?
- O limite de 3 cartões por perfil deve ser mantido, ajustado (ex.: 3 contas, com crédito ilimitado dentro de cada uma) ou removido no novo modelo?
- Como tratar as despesas legadas com forma de pagamento crédito mas sem cartão vinculado — pedir para o usuário associar retroativamente, deixar como "conta desconhecida", ou outra estratégia?
- O valor inconsistente `forma_pagamento = 'cartao_credito'` (2 registros) deve ser normalizado para `credito` como parte desta task, ou tratado à parte?
- Esta reformulação deve ser dividida em múltiplos planos/entregas menores (ex.: primeiro corrigir a perda de dado no frontend, depois a reformulação de schema) ou entregue como um plano único, dado o tamanho da mudança?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz do workspace) e `sistema financas/AGENT.md`/`sistema financas/CLAUDE.md`. Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto — considerar apenas os arquivos de contexto que de fato existem.
- Inspecione os arquivos citados antes de escrever o plano, especialmente os schemas de `cards.ts`/`expenses.ts`, as rotas correspondentes, e as telas de cadastro/lançamento/listagem.
- Classifique a implementação como `frontend + backend + database`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations nem qualquer comando de escrita em banco de dados.
- Dado o tamanho da mudança, considerar propor ao usuário uma divisão em etapas/planos menores, sequenciados, em vez de um único plano monolítico — mas apresentar essa divisão como proposta a ser confirmada, não decidir unilateralmente.
- Gere um plano em `.plans/` (padrão já usado neste projeto) com etapas pequenas, revisáveis e seguras, seguindo a sequência obrigatória `/planejar → aprovação → /implementar → /finalizar` definida em `sistema financas/CLAUDE.md`.
