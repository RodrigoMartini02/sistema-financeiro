# Plano de Implementação: Readequação da tabela de despesas

## Origem

- Arquivo de especificação: `.portal/tasks/Readequar tabela de despesas e area fixa de Movimentacoes.md`
- Data do planejamento: `2026-09-07`
- Branch atual: `refactor/R/padronizar-modal-configuracoes`
- Classificação: `frontend + backend + correção de dados` (sem migration)

## Resumo

Aplicar as 13 decisões de coluna tomadas pelo usuário em revisão coluna a coluna, padronizar o tratamento de informação secundária, redistribuir as larguras conforme o conteúdo real, compactar as linhas, tornar a tela de altura total com scroll apenas no corpo da tabela, e compactar a faixa de cards de resumo e limites de cartão.

Duas correções de dados em produção acompanham a mudança, porque a apresentação nova depende de o dado estar correto.

## Classificação e motivo

`frontend + backend + correção de dados`.

O frontend concentra o grosso do trabalho: 13 colunas, visão mobile e a estrutura de área fixa. O backend tem duas mudanças cirúrgicas: parar de concatenar o sufixo `(x/y)` na descrição e passar a enviar o nome da categoria-pai. O banco **não muda de schema** — `parent_id` já existe e nenhuma coluna é criada, alterada ou removida. O que há são dois `UPDATE` de correção de dados já existentes.

## Escopo

### Dentro do escopo

- As 13 decisões de coluna (detalhadas em "Regras de negócio identificadas")
- Nova coluna "Data pagamento"
- Padrão único de informação secundária: `text-[11px] text-slate-400`
- Redistribuição de larguras, centralização de todas as células e compactação das linhas
- Área fixa via `fillViewport`: cabeçalho, filtros e totais fixos, só o corpo da tabela rolando
- Compactação dos cards de resumo e da faixa de limites de cartão
- Backend: remover a concatenação do sufixo na criação de parcelada
- Backend: enviar o nome da categoria-pai na listagem
- Aplicar os mesmos ajustes na visão mobile (`ExpenseCard`)
- Duas correções de dados em produção (158 descrições, 12 registros de tipo)

### Fora do escopo

- **Tabela de receitas** — não foi revisada. A mesma readequação provavelmente se aplica depois, como task própria
- **Colunas redimensionáveis** e **seletor de colunas visíveis** — avaliados e adiados; a decisão foi ver primeiro se a tabela mais leve resolve o desconforto
- **Reordenar as colunas** — decisão explícita de manter a sequência atual
- **Seletor de cor de categoria** — seria feature nova em outra tela
- **Redesign da visão mobile além dos ajustes decididos** — só o que está listado, não uma reformulação do card
- Alterar a lógica de cálculo de `valorFinal`, o fluxo de pagamento em lote ou as regras de cancelamento
- Alterar qualquer regra de visibilidade, permissão ou a carteira compartilhada da família

## Leitura de contexto

Arquivos de contexto considerados:

- `CLAUDE.md` da raiz e do projeto — fluxo obrigatório `/planejar` → aprovação → `/implementar` → `/finalizar`; regra de redesign remover-antes-de-aplicar
- `AGENT.md` (raiz e `sistema financas/`, idênticos, 491 linhas) — **apenas as partes genéricas**. O arquivo descreve um sistema multi-prefeitura com RLS que **não corresponde a este projeto**: verificado que não há nenhuma ocorrência de `tenant`/`prefeitura` em `backend/src/` nem referência a Row Level Security nas migrations. É boilerplate desalinhado
- `frontend/AGENT.md` — **não existe** neste projeto
- `backend/AGENT.md` — **não existe** neste projeto
- `.portal/tasks/Readequar tabela de despesas e area fixa de Movimentacoes.md` — especificação de entrada

Arquivos do projeto inspecionados:

- `src/screens/despesas/DespesasScreen.tsx` (871 linhas)
- `src/screens/despesas/ExpenseCard.tsx` (126 linhas)
- `src/screens/finance/MovimentacoesScreen.tsx` (390 linhas)
- `src/screens/finance/MovementMetricCard.tsx`, `src/screens/finance/CardLimitRow.tsx`
- `src/context/AppContext.tsx`, `src/App.tsx`, `src/layout/AppShell.tsx`
- `src/types/finance.ts`
- `backend/src/routes/expenses.ts`, `backend/src/routes/categories.ts`
- `backend/src/db/schema/categories.ts`

## Descobertas da investigação

Quatro pontos em que o código real diverge do que a task assumiu. Cada um alterou o plano:

**1. `fillViewport` já existe como mecanismo global.** `AppContext.tsx:11` → `App.tsx:181` → `AppShell.tsx:362`, que troca o `<main>` para `h-[calc(100vh-64px)] overflow-hidden`. Hoje é ativado apenas pelo modo Calendário (`MovimentacoesScreen.tsx:137`). Não é preciso inventar arquitetura de altura — é ligar o que existe.

**2. `CardLimitRow` já é vertical.** O componente usa `flex-col`: nome e valores em cima, barra embaixo. O que é horizontal é o **grid distribuidor** em `MovimentacoesScreen.tsx:362` (`repeat(auto-fit,minmax(150px,1fr))`), que põe os cartões lado a lado. Empilhá-los aumentaria a altura — o oposto do objetivo.

**3. Os totais não estão dentro da tabela.** Vivem nos `MovementMetricCard` do componente pai, alimentados via `onFilteredSummaryChange` → `despesasSummary`. Não há `<tfoot>` a fixar: eles ficam fixos automaticamente quando o `fillViewport` entra, por estarem acima da área rolável.

**4. `ExpenseCard` repete os padrões que estamos removendo.** Além de importar `StatusBadge` e `TipoBadge`, o card tem seu próprio chip de categoria, cápsula de anexos, `inicial R$ X` em `text-[10px]` e valor riscado.

## Decisões aplicadas

- **Decisão 1 (limite de crédito):** Manter o grid lado a lado e apenas compactar a faixa. A faixa já é vertical por cartão; empilhar aumentaria a altura, contrariando o objetivo de liberar espaço.
- **Decisão 2 (área fixa):** Reaproveitar o `fillViewport` existente, ligando-o também no modo lista. É o padrão do projeto.
- **Decisão 3 (mobile):** Aplicar todos os ajustes também no `ExpenseCard`, para as duas visões ficarem coerentes.
- **Decisão 4 (correções em produção):** Executar no `/finalizar`, imediatamente após o merge, minimizando a janela nos dois sentidos.

## Impacto por área

### Frontend

**Telas e componentes:**

- `DespesasScreen.tsx` — tabela desktop, `StatusBadge` (L49), `TipoBadge` (L72), `<colgroup>` (L586-598), células (L640-805)
- `ExpenseCard.tsx` — visão mobile (`md:hidden`)
- `MovimentacoesScreen.tsx` — `fillViewport` no modo lista, compactação da faixa de cards e limites
- `MovementMetricCard.tsx` — compactação
- `CardLimitRow.tsx` — compactação (sem mudar a orientação, que já é vertical)

**Estados:** nenhuma mudança em loading/error/empty. Os `EmptyState` e `ErrorState` atuais permanecem.

**Query keys:** nenhuma mudança. `queryKeys.dashboard(month, year)` continua igual.

**Forms:** nenhuma mudança. Os modais de despesa não são tocados.

**Pontos de atenção específicos:**

- Preservar as variantes `dark:` em cada célula reescrita — o sistema tem modo escuro ativo e praticamente toda célula tem par claro/escuro
- Manter as colunas condicionais funcionando: checkbox (só não paga), "Quem lançou" (`mostrarAutor`), NF (`isEmpresa`). Com a nova coluna, são 3 condicionais sobre 14 posições possíveis, e o `<colgroup>` precisa acompanhar cada combinação
- Os `FirstAccessGuideCard` da tela (`loteGuide`, `moverMesGuide`) são `floating` sobre um container `relative` — conferir posicionamento após a mudança de altura
- Nomenclatura de código novo em inglês; nomes em português existentes (`DespesasScreen`, `TipoBadge`) são legado e não devem ser renomeados

### Backend

**Rotas alteradas:** `backend/src/routes/expenses.ts`, em dois pontos isolados.

1. **`expenses.ts:129`** — remover a concatenação `${baseExpense['descricao']} (1/${totalInstallments})` do `UPDATE` que roda logo após a criação da parcelada. Preservar `parcela_atual` e `numero_parcelas`, que continuam sendo a fonte real da informação de parcela.

2. **`expenses.ts:209`** — estender o `SELECT` com o nome da categoria-pai. O padrão já existe em `categories.ts:78` (`LEFT JOIN categorias p ON c.parent_id = p.id`) e deve ser reaproveitado em vez de inventar outro.

**Validações:** verificar se o filtro/busca por descrição é afetado pela ausência do sufixo.

**Permissões:** nenhuma alteração. O `buildWhereClause` com `resolveVisibleUserIds` (carteira compartilhada da família) permanece intocado — a query alterada é a mesma, só ganha uma coluna no `SELECT`.

**Relatórios/PDFs:** verificar durante a implementação se algum relatório consome a descrição com o sufixo.

### Banco de dados

**Sem alteração de schema. Nenhuma migration é necessária** — `parent_id` já existe em `categories.ts:41`, e nenhuma coluna é criada, alterada ou removida.

Duas **correções de dados** em produção:

| O quê | Volume | Natureza |
|---|---|---|
| Remover sufixo `(x/y)` do fim das descrições | 158 registros | `UPDATE` de texto |
| Corrigir `recorrente = false` | 12 registros (Renner, Pratique) | `UPDATE` de booleano |

**Cuidados obrigatórios:**

- `SELECT` de conferência antes de cada `UPDATE`, com os registros afetados listados
- A limpeza das descrições deve usar expressão **ancorada no fim da string**, para não atingir descrições com parênteses legítimos no meio do texto
- Nenhum `UPDATE` sem `WHERE`
- As 12 correções de tipo são identificadas por `parcelado = true AND recorrente = true`

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.** O mesmo vale para os dois `UPDATE` acima.

### Infra/Deploy

`Sem impacto esperado`. Nenhuma env var, job, worker, fila ou timeout é afetado.

## Arquivos provavelmente afetados

**Frontend:**

- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/despesas/ExpenseCard.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/MovementMetricCard.tsx`
- `src/screens/finance/CardLimitRow.tsx`
- `src/types/finance.ts` (campo aditivo de categoria-pai)

**Backend:**

- `backend/src/routes/expenses.ts` (L129 e L209)
- `backend/src/routes/categories.ts` — apenas como referência do padrão de `LEFT JOIN`, não alterado

**Banco de dados:**

- Sem migration. Dois `UPDATE` de correção.

## Estratégia de implementação

Cada etapa que reescreve estilo deve **remover o antigo antes de aplicar o novo**, como passos distintos — nunca sobrepor.

**Etapa 1 — Backend**

1. Remover a concatenação do sufixo em `expenses.ts:129`
2. Estender o `SELECT` de `expenses.ts:209` com o `LEFT JOIN` da categoria-pai
3. Verificar se a busca por descrição é afetada

**Etapa 2 — Tipo e mapeamento**

4. Adicionar o campo de categoria-pai ao tipo `Expense` em `src/types/finance.ts` (aditivo, não alterar os existentes)
5. Ajustar o mapeamento da resposta da API

**Etapa 3 — Badges compartilhados**

6. `TipoBadge`: três estados exclusivos, com **parcelada tendo prioridade** quando o dado vier inconsistente
7. `StatusBadge`: texto colorido sem cápsula e sem ícones; **cancelada em cinza**

**Etapa 4 — Células da tabela**

8. Descrição: peso normal
9. Vencimento: remover a linha "pago em"
10. Nova coluna Data pagamento
11. Categoria: texto com hierarquia, remover o chip
12. Quem lançou: primeiro nome
13. Pagamento: nome do cartão no padrão secundário
14. Status: aplicar o novo componente
15. Valor: um valor colorido pelo estado, sem riscado, diferença como secundária só quando houver
16. Anexos: clipe + número, remover a cápsula
17. Ações: estilo alinhado, **preservando os `title` de bloqueio**

**Etapa 5 — Estrutura da tabela**

18. `<colgroup>` redistribuído, resolvendo a definição concorrente de Descrição (`<col>` 180px vs. `max-w-[200px]` na célula)
19. Centralizar todas as células
20. Reduzir o padding vertical, calibrando para o caso de uma linha
21. `sticky` no `<thead>`

**Etapa 6 — Mobile**

22. Aplicar os mesmos ajustes no `ExpenseCard`: categoria sem chip, anexos sem cápsula, valor sem riscado e sem `inicial` redundante

**Etapa 7 — Área fixa**

23. Ligar o `fillViewport` também no modo lista em `MovimentacoesScreen`
24. Ajustar a estrutura para que só o corpo da tabela role
25. Compactar os `MovementMetricCard`
26. Compactar a faixa de limites (mantendo o grid lado a lado)

**Etapa 8 — Build**

27. `npx vite build` e `npm run build` no backend

**Etapa 9 — Finalização**

28. `/finalizar`: commit, push, merge em main
29. **Imediatamente após o merge**, executar os dois `UPDATE` com confirmação explícita do usuário

## Regras de negócio identificadas

**Por coluna** (todas decididas pelo usuário, uma a uma):

| # | Coluna | Regra |
|---|---|---|
| 1 | Seleção | Manter. Checkbox só em despesa não paga; o do cabeçalho seleciona todas as não pagas |
| 2 | Descrição | Peso normal. Sem sufixo `(x/y)` — a coluna Tipo já informa a parcela |
| 3 | Tipo | Três estados exclusivos. **Parcelada vence** quando o dado vier inconsistente |
| 4 | Vencimento | Só a data |
| — | Data pagamento | **Nova.** A data, ou `—`. Já existe filtro por ela, mas o dado era invisível |
| 5 | Data compra | Manter |
| 6 | Categoria | Texto `Pai › Filha`, sem chip. O pai é secundário. **Sem cor** — todas estão no mesmo azul padrão, já que nenhuma tela oferece seleção |
| 7 | Quem lançou | Primeiro nome |
| 8 | Pagamento | Manter conteúdo; cartão no padrão secundário |
| 9 | Status | Texto colorido, sem cápsula nem ícone. Pago verde, Atrasada vermelho, Em dia âmbar, **Cancelada cinza** |
| 10 | Valor | Um valor, cor do estado, sem riscado. Diferença como secundária só quando houver |
| 11 | NF | Manter |
| 12 | Anexos | Clipe + número, sem cápsula. O clipe fica porque identifica o anexo |
| 13 | Ações | As cinco visíveis. `title` de bloqueio preservados |

**Ordem das colunas:** manter a sequência atual — decisão explícita.

**Transversais:**

- Informação secundária sempre `text-[11px] text-slate-400`, substituindo os três estilos atuais (`text-slate-400` herdado, `text-[11px] text-slate-400`, `text-[10px] text-green-600`)
- Posicionamento conforme o caso: mesma linha quando complementa, abaixo quando é outra informação
- Tudo centralizado, **incluindo valores e datas**. O usuário foi alertado de que valores à direita facilitam a comparação e ainda assim optou por centralizar — decisão informada
- Linhas mais finas, calibradas para o caso de uma linha, **sem altura fixa que corte conteúdo**

**Semântica confirmada durante a revisão:**

- **Cancelar ≠ excluir.** Cancelar mantém o registro no histórico e o tira dos cálculos (`status = 'ativa'`); serve para despesa que existiu mas não vai acontecer. Excluir é para cadastro errado. Ambas as ações existem
- **Os três valores:** `valorOriginal` é o que o usuário digitou; `valorFinal` é **calculado pelo backend** (juros, descontos, divisão de parcelas); `valorPago` é o que saiu ao marcar como pago. Como os dois primeiros coincidem na maioria dos casos, o `inicial R$ X` hoje repete o mesmo número
- Em despesa parcelada, o valor da linha é o **da parcela**, não o total
- `getStatus` deriva "atrasada" de `dataVencimento < hoje`; não é campo do banco

## Regras multi-tenant e segurança

**Projeto não é multi-tenant; sem isolamento de tenant a considerar.**

Verificado: nenhuma ocorrência de `tenant`/`prefeitura` em `backend/src/`, nenhuma referência a Row Level Security nas migrations. O `AGENT.md` descreve um sistema multi-prefeitura que não corresponde a este projeto.

O isolamento relevante é por `usuario_id` e conta, com a carteira compartilhada da família permitindo visibilidade entre membros conforme permissões (`acesso_lancamentos_familia`, `editar_lancamentos_familia`, `acesso_cartoes_familia`).

Cuidados:

- **Não alterar nenhuma regra de visibilidade ou permissão.** Esta entrega é de apresentação. O `buildWhereClause` com `resolveVisibleUserIds` permanece intocado
- A coluna "Quem lançou" expõe autoria entre membros; sua condicional atual (só aparece com mais de um autor no período) deve ser preservada
- As correções de dados devem ser restritas aos registros identificados, **sem `UPDATE` sem `WHERE`**

## Validações necessárias

- O campo novo de categoria-pai é **aditivo** ao tipo `Expense` — não alterar os campos existentes
- Categoria raiz (sem pai) deve exibir só o nome, sem o separador `›`
- A diferença em Valor só aparece quando `valorPago` difere de `valorFinal`
- O `<colgroup>` deve ter exatamente tantos `<col>` quantas colunas renderizadas, em cada combinação de condicionais
- A expressão de limpeza das descrições deve casar apenas o sufixo no **fim** da string

## Testes necessários

### Frontend

- Cada coluna alterada, com despesas nos quatro estados (paga, atrasada, em dia, cancelada)
- Despesa parcelada, recorrente e avulsa — confirmando que Tipo mostra um único estado
- Despesa com `valorPago` diferente de `valorFinal` (linha de diferença) e sem diferença (um valor só)
- Categoria com pai (`Saúde › Farmácia`) e sem pai (`Farmácia`)
- As três colunas condicionais aparecendo e sumindo, com o `<colgroup>` acompanhando
- Scroll: cabeçalho, filtros e cards fixos, só o corpo rolando
- **Altura em telas baixas** (notebook ~768px) — o `fillViewport` não pode espremer a tabela a ponto de inutilizá-la
- Modo escuro em todas as colunas alteradas
- Visão mobile (`ExpenseCard`) após os ajustes
- `FirstAccessGuideCard` (`loteGuide`, `moverMesGuide`) posicionados corretamente
- Seleção em lote, ordenação, filtros e abertura de anexos continuam funcionando

### Backend

- Criar despesa parcelada nova: descrição gravada **sem** sufixo, `parcela_atual`/`numero_parcelas` corretos
- Listagem retorna o nome da categoria-pai quando existe e nulo quando a categoria é raiz
- A visibilidade da carteira compartilhada continua correta após a mudança no `SELECT`

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
```

Validação funcional via `/run` (PostgreSQL na 5433, backend 3010, frontend 5173).

## Riscos e pontos de atenção

| Risco | Gravidade | Mitigação |
|---|---|---|
| `UPDATE` das descrições atingir parêntese legítimo | **Alta** | Expressão ancorada no fim da string; `SELECT` de conferência antes; executar com confirmação |
| `fillViewport` apertar demais telas baixas | Média | Verificar em 768px de altura; é reversível por ser um booleano |
| Modo escuro quebrar em células reescritas | Média | Preservar as variantes `dark:` em cada célula |
| `<colgroup>` dessincronizar das condicionais | Média | 3 condicionais sobre 14 posições — conferir cada combinação |
| `FirstAccessGuideCard` deslocar | Baixa | São `floating` sobre `relative`; conferir após a mudança de altura |
| Relatório consumir a descrição com sufixo | Baixa | Verificar durante a implementação |
| Janela entre merge e correção de dados | Baixa | Decisão 4: executar imediatamente após o merge |

**Erro de tipo pré-existente:** `DespesasScreen.tsx:764` (`Property 'disabled' is missing`) é **anterior a este trabalho**. Não deve ser confundido com regressão nem corrigido silenciosamente.

## Perguntas em aberto

- A linha de diferença em Valor (`+ R$ 5,00`) deve distinguir juros de desconto no texto, ou basta o sinal (`+`/`−`)?
- A hierarquia de categoria pode ter mais de dois níveis no modelo atual? Se sim, como exibir?
- O erro de tipo pré-existente em `DespesasScreen.tsx:764` entra nesta entrega, já que o arquivo será mexido de qualquer forma, ou vira task separada?

Nenhuma delas bloqueia o início da implementação. Se não houver resposta, adotar o padrão mais conservador: apenas o sinal no valor, dois níveis na hierarquia, e o erro de tipo tratado à parte.

## Critérios de aceite do plano

- Nenhuma coluna usa cápsula (`rounded-full` com fundo e padding) — Categoria, Status e Anexos passam a texto/ícone simples
- Status não exibe ícones, e "Cancelada" aparece em cinza
- Toda informação secundária usa `text-[11px] text-slate-400`; não restam `text-[10px]` nem cor divergente nesse papel
- A coluna Valor exibe **um único valor** no caso comum; a diferença aparece só quando `valorPago` difere de `valorFinal`
- O valor não é riscado quando pago, e sua cor corresponde ao estado do Status
- Existe coluna "Data pagamento" própria, e Vencimento não contém mais a linha "pago em"
- Categoria exibe `Pai › Filha` quando há hierarquia, com o pai em estilo secundário
- "Quem lançou" exibe apenas o primeiro nome
- Uma despesa parcelada criada após a mudança tem a descrição gravada **sem** o sufixo
- `TipoBadge` exibe um único estado por despesa, com parcelada tendo prioridade
- Cabeçalho, filtros e cards de resumo permanecem visíveis ao rolar; apenas o corpo da tabela rola
- Todas as células estão centralizadas, incluindo valores e datas
- As larguras não têm definição concorrente entre `<colgroup>` e `max-w-*`
- As linhas estão mais compactas que `py-3`, sem conteúdo cortado nas de duas linhas
- As três colunas condicionais continuam corretas, com o `<colgroup>` correspondente
- O modo escuro continua correto em todas as colunas alteradas
- A visão mobile está coerente com a tabela — sem chip de categoria, sem cápsula de anexos, sem valor riscado
- `npx vite build` e o build do backend concluem sem erros novos
- **Após o merge:** nenhum registro em produção mantém o sufixo `(x/y)` no fim da descrição, e nenhum tem `parcelado` e `recorrente` simultaneamente verdadeiros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto. **As 13 decisões de coluna já estão fechadas** — não reabrir
- Seguir a regra de redesign do projeto: **remover o estilo antigo primeiro, depois aplicar o novo**, como etapas distintas. Nunca sobrepor estilo antigo com novo no mesmo elemento
- Sobre o `AGENT.md`: existe apenas na raiz e em `sistema financas/` (idênticos). **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md`. Usar apenas as partes genéricas (Drizzle para queries novas, legibilidade, não adicionar dependências que exijam Node > 22.17.0) e **ignorar a parte de multi-tenant**, que não corresponde a este projeto
- **Não executar os `UPDATE` de produção durante a implementação.** Eles pertencem à etapa 9, no `/finalizar`, com confirmação explícita do usuário
- Não alterar `.env`, regras de permissão ou a lógica da carteira compartilhada
- Manter as alterações focadas: não fazer refactor oportunista em código não relacionado
- O erro de tipo em `DespesasScreen.tsx:764` é pré-existente — reportá-lo, não confundi-lo com regressão
