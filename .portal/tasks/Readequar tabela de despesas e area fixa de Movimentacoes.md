# Task: Readequar tabela de despesas e área fixa de Movimentações

## Contexto

A tabela de despesas vive em [DespesasScreen.tsx](../../src/screens/despesas/DespesasScreen.tsx) (871 linhas) e é renderizada dentro de [MovimentacoesScreen.tsx](../../src/screens/finance/MovimentacoesScreen.tsx) (390 linhas), que também exibe, acima dela, os cards de resumo e o card de limite de crédito.

Hoje a tabela tem **12 colunas**, sendo 3 condicionais:

| # | Coluna | O que apresenta hoje | Condicional |
|---|---|---|---|
| 1 | *(sem título)* | Checkbox de seleção | Só em despesa não paga |
| 2 | Descrição | Nome em **negrito** + observação abaixo | — |
| 3 | Tipo | Badge azul `1/4` e/ou badge roxo "Recorrente" | — |
| 4 | Vencimento | Data + linha "pago em DD/MM" quando paga | — |
| 5 | Data compra | Data ou `—` | — |
| 6 | Categoria | Nome em chip cinza `rounded-full` | — |
| 7 | Quem lançou | Nome completo do autor | Só com >1 autor no período |
| 8 | Pagamento | Forma + `· Nome do cartão` | — |
| 9 | Status | Badge colorido com ícone | — |
| 10 | Valor | Até **3 valores empilhados**, alinhado à direita | — |
| 11 | NF | Número da nota | Só conta empresa |
| 12 | Anexos | Clipe + número em cápsula cinza | — |
| 13 | Ações | 5 botões de ícone | — |

### Estado verificado do código

Todos os pontos abaixo foram confirmados por leitura direta, não por suposição:

- **Larguras atuais** ([DespesasScreen.tsx:586-598](../../src/screens/despesas/DespesasScreen.tsx#L586-L598)): `<colgroup>` com `table-fixed`. Descrição tem `180px` no `<col>` e ainda um `max-w-[200px]` na célula — duas definições concorrentes para a mesma coluna.
- **Padding das células**: `px-4 py-3` (checkbox usa `px-3 py-3`).
- **Alinhamento atual**: Valor e Ações à direita (`text-right`), Anexos e checkbox centralizados, o resto à esquerda.
- **Scroll**: [DespesasScreen.tsx:585](../../src/screens/despesas/DespesasScreen.tsx#L585) tem apenas `overflow-x-auto`. **Nada é fixo** — cabeçalho, filtros e totais rolam junto com a página.
- **`StatusBadge` e `TipoBadge` são exportados** de `DespesasScreen.tsx` (linhas 49 e 72) e **consumidos por [ExpenseCard.tsx](../../src/screens/despesas/ExpenseCard.tsx)** (linhas 5, 81, 83), que é a visão mobile (`md:hidden`). Alterá-los afeta as duas visões.
- **`TipoBadge` renderiza os dois badges** quando `parcela` e `recorrente` são ambos verdadeiros ([DespesasScreen.tsx:76-87](../../src/screens/despesas/DespesasScreen.tsx#L76-L87)) — não trata como estados exclusivos.
- **Sufixo `(1/4)` gravado no banco**: [expenses.ts:129](../../backend/src/routes/expenses.ts#L129) concatena `${descricao} (1/${totalInstallments})` na criação da parcelada. **Não é formatação de tela.**
- **Backend envia só o nome da categoria**: [expenses.ts:209](../../backend/src/routes/expenses.ts#L209) faz `c.nome AS categoria_nome`, sem a categoria-pai.
- **`parent_id` já existe** em [categories.ts:41](../../backend/src/db/schema/categories.ts#L41), e a rota de categorias **já faz o `LEFT JOIN categorias p ON c.parent_id = p.id`** ([categories.ts:78](../../backend/src/routes/categories.ts#L78)) — o padrão da hierarquia já existe no projeto e pode ser reaproveitado.
- **Cor de categoria é inútil hoje**: a coluna `cor` existe no banco e o backend aceita com default `#3498db`, mas **nenhuma tela oferece seleção de cor** — todas as categorias estão no mesmo azul.
- **Erro de tipo pré-existente** em `DespesasScreen.tsx:764` (`Property 'disabled' is missing`), **anterior a este trabalho**.

### Origem das decisões

Todas as decisões desta task foram tomadas pelo usuário em revisão **coluna por coluna**, cada uma confirmada individualmente. Não são propostas em aberto.

## Problema

Três problemas distintos, de naturezas diferentes:

**1. Dados inconsistentes no banco.** O sufixo `(x/y)` está gravado em 158 descrições, duplicando o que a coluna Tipo já mostra. E 12 registros têm `parcelado` e `recorrente` simultaneamente verdadeiros — estados que são conceitualmente exclusivos.

**2. Excesso de customização visual.** A tabela acumulou cápsulas (`rounded-full` com fundo e padding) em Categoria, Status e Anexos, ícones que não diferenciam nada (o mesmo relógio em "Atrasada" e "Em dia"), e três estilos diferentes para informação secundária: `text-slate-400` com tamanho herdado, `text-[11px] text-slate-400` e `text-[10px] text-green-600`. Cada variação é código a manter sem ganho de leitura.

**3. Densidade e espaço vertical.** A coluna Valor empilha até três números na mesma célula, repetindo o mesmo valor quando `valorOriginal` e `valorFinal` coincidem — o caso comum. As larguras não refletem o conteúdo real (Descrição tem espaço sobrando para no máximo 3 palavras). E como nada é fixo, rolar a lista faz perder o cabeçalho, os filtros e os totais de vista.

## Objetivo

Readequar a apresentação da tabela de despesas às 13 decisões de coluna já fechadas, padronizar o tratamento de informação secundária, redistribuir as larguras conforme o conteúdo real, tornar cabeçalho/filtros/totais fixos com scroll apenas no corpo, e compactar a área acima da tabela para liberar altura útil.

Duas correções de dados em produção acompanham a mudança, porque a apresentação nova depende de o dado estar correto.

## Decisão Técnica Desejada

### Por coluna

**1. Seleção (checkbox)** — Manter como está. Decisão consciente de não mexer, não omissão.

**2. Descrição** — Peso normal (hoje `font-semibold`). Parar de gravar o sufixo `(x/y)` em [expenses.ts:129](../../backend/src/routes/expenses.ts#L129) **e limpar as 158 descrições existentes**. A informação de parcela não se perde: a coluna Tipo já a mostra.

**3. Tipo** — Três estados **mutuamente exclusivos** (avulsa / parcelada / recorrente), com prioridade explícita: **parcelada vence** quando o dado vier inconsistente. Corrigir `recorrente = false` nos 12 registros afetados.

**4. Vencimento** — Só a data. A linha "pago em DD/MM" sai daqui.

**5. Data compra** — Manter como está.

**Nova coluna: Data pagamento** — A data, ou `—` quando não paga. Justificativa: **já existe filtro por data de pagamento** (hoje/semana/mês), mas o dado ficava como texto secundário dentro de Vencimento, sem ser ordenável nem visível de forma clara.

**6. Categoria** — Texto simples com hierarquia `Saúde › Farmácia`, **sem chip**. Na hierarquia, `Saúde ›` é informação secundária e `Farmácia` é a principal. **Não usar cor de categoria** — seria inútil, já que todas estão no mesmo azul padrão.

**7. Quem lançou** — Só o primeiro nome.

**8. Pagamento** — Manter o conteúdo (`Crédito · Nubank`), mas o nome do cartão passa a seguir o padrão único de informação secundária (hoje herda o tamanho em vez de declarar).

**9. Status** — Texto colorido, **sem cápsula e sem ícones**. Quatro estados:

| Estado | Cor |
|---|---|
| Pago | verde |
| Atrasada | vermelho |
| Em dia | âmbar |
| Cancelada | **cinza** (hoje vermelho) |

Cancelada muda para cinza porque não pede ação — o vermelho a confundia com "Atrasada", que exige providência. Contexto confirmado: cancelar mantém o registro no histórico e o tira dos cálculos (`status = 'ativa'`); excluir é para cadastro errado. São ações distintas e ambas existem.

**10. Valor** — **Um valor só**, colorido conforme o estado (as mesmas cores do Status). **Sem riscado.** A diferença aparece como linha secundária **apenas quando houver divergência**, no formato `+ R$ 5,00 juros`.

Os três valores de hoje são:

| Campo | Origem |
|---|---|
| `valorOriginal` | O que o usuário digitou no modal |
| `valorFinal` | **Calculado pelo backend** (juros, descontos, divisão de parcelas) |
| `valorPago` | O que saiu de fato ao marcar como pago |

Como `valorOriginal` e `valorFinal` coincidem na maioria dos casos, o `inicial R$ X` hoje repete o mesmo número. Em despesa parcelada, o valor da linha é o **da parcela**, não o total.

**11. NF** — Manter como está. O usuário está ciente de que a coluna não se manifesta no uso dele hoje (só conta pessoal ativa) e decidiu não ajustar no escuro.

**12. Anexos** — Clipe + número, **sem cápsula**. O clipe fica: diferente do relógio no Status, ele é o que identifica "anexo" — um número solto não comunicaria. Continua clicável, com realce no hover.

**13. Ações** — As cinco visíveis, só o estilo alinhado. A proposta de reduzir a "Editar + menu `⋯`" foi rejeitada. Os `title` que explicam o bloqueio ("Já pago", "Mês fechado") devem ser preservados.

**Ordem das colunas** — Manter a sequência atual. Foi perguntado se Tipo deveria vir antes de Descrição e a decisão foi manter.

### Transversais

- **Padrão único de informação secundária**: `text-[11px] text-slate-400` em toda a tabela, substituindo os três estilos atuais. O posicionamento continua conforme o caso: mesma linha quando complementa (`Crédito · Nubank`), linha abaixo quando é outra informação.
- **Alinhamento**: tudo centralizado, **incluindo valores e datas**. O usuário foi alertado de que valores à direita facilitam a comparação (casas decimais alinhadas) e ainda assim optou por centralizar tudo — decisão informada.
- **Larguras**: redistribuir completamente conforme o conteúdo real. Resolver a definição concorrente de Descrição (`<col>` 180px + `max-w-[200px]` na célula).
- **Linhas mais finas**: reduzir a altura ao máximo para caber mais despesas na tela (hoje `py-3`). **Ressalva**: colunas com informação secundária (Categoria com hierarquia, Valor com diferença, Descrição com observação) ocupam duas linhas naturalmente. Calibrar o padding para o caso comum de uma linha, **sem forçar altura fixa que cortaria conteúdo**.
- **Área fixa**: cabeçalho da tabela + filtros/toolbar + rodapé de totais fixos; **só o corpo da tabela rola**. Exige altura definida para a área da tabela e `sticky` no cabeçalho — hoje só existe `overflow-x-auto`.
- **Cards de resumo**: bem mais finos.
- **Limite de crédito**: layout vertical em vez de horizontal.

O objetivo dos dois últimos é liberar altura: a área fixa precisa ser compacta para o corpo rolável ter espaço útil.

## Escopo Funcional

### Dentro do escopo

- Ajustes de apresentação das 13 colunas da tabela de despesas, conforme decidido acima.
- Nova coluna "Data pagamento".
- Padrão único de informação secundária.
- Redistribuição de larguras, centralização e compactação das linhas.
- Cabeçalho, filtros e totais fixos com scroll apenas no corpo.
- Compactação dos cards de resumo e layout vertical do limite de crédito em `MovimentacoesScreen`.
- Backend: parar de concatenar `(x/y)` na descrição ao criar despesa parcelada.
- Backend: enviar o nome da categoria-pai junto de `categoria_nome`.
- Avaliar o impacto em `ExpenseCard` (mobile), já que consome `StatusBadge` e `TipoBadge`.
- Duas correções de dados em produção (158 descrições, 12 registros de tipo).

### Fora do escopo inicial

- **Tabela de receitas** — não foi revisada. O usuário chegou a levantar a possibilidade e retirou a pergunta. A mesma readequação provavelmente se aplica depois, como task própria.
- **Colunas redimensionáveis pelo usuário** e **seletor de quais colunas exibir** — ambos foram avaliados e adiados. A decisão foi ver primeiro se a tabela mais leve resolve o desconforto.
- **Reordenar as colunas** — decisão explícita de manter a sequência.
- **Seletor de cor de categoria** — seria feature nova em outra tela.
- **Redesign da visão mobile (`ExpenseCard`)** — só ajustar o que for consequência de `StatusBadge`/`TipoBadge`, não redesenhar.
- **Corrigir o erro de tipo pré-existente** em `DespesasScreen.tsx:764` — registrar, mas tratar separadamente.
- Alterar a lógica de cálculo de `valorFinal`, o fluxo de pagamento em lote ou as regras de cancelamento.

## Requisitos de Frontend

- Aplicar as decisões de coluna preservando o comportamento funcional: seleção em lote, ordenação, filtros, ações e abertura de anexos.
- `StatusBadge` e `TipoBadge` são compartilhados com `ExpenseCard` (mobile). Decidir no planejamento se a mudança vale para as duas visões ou se o mobile mantém o formato de badge — e registrar a escolha.
- `TipoBadge` precisa passar a tratar os três tipos como exclusivos, com parcelada tendo prioridade.
- A área fixa exige repensar a estrutura de altura do container. Verificar o impacto em telas menores e no modo escuro (a tabela tem variantes `dark:` em praticamente toda célula).
- Preservar as classes `dark:` ao reescrever os estilos — o sistema tem modo escuro ativo.
- Manter as três colunas condicionais funcionando (checkbox, "Quem lançou", NF): o `<colgroup>` precisa acompanhar a presença/ausência de cada uma.
- Nomenclatura de código novo em inglês; nomes em português existentes (`DespesasScreen`, `TipoBadge`) são legado e não devem ser renomeados nesta task.

## Requisitos de Backend

- Remover a concatenação do sufixo em [expenses.ts:129](../../backend/src/routes/expenses.ts#L129), sem alterar a gravação de `parcela_atual`/`numero_parcelas`, que continuam sendo a fonte da informação de parcela.
- Estender o `SELECT` de [expenses.ts:209](../../backend/src/routes/expenses.ts#L209) para enviar o nome da categoria-pai. O padrão do `LEFT JOIN categorias p ON c.parent_id = p.id` já existe em [categories.ts:78](../../backend/src/routes/categories.ts#L78) e deve ser reaproveitado em vez de inventar outro.
- Verificar se o filtro de despesas por descrição (busca) é afetado pela remoção do sufixo.
- Preservar o filtro por `usuario_id`/conta em qualquer query alterada, incluindo a visibilidade da carteira compartilhada da família recém-implementada.

## Requisitos de Banco de Dados

**Sem alteração de schema.** Nenhuma migration é necessária: `parent_id` já existe, e as colunas de valor e status não mudam.

Duas **correções de dados** em produção são necessárias:

| O quê | Volume | Natureza |
|---|---|---|
| Remover sufixo `(x/y)` das descrições | 158 registros | `UPDATE` de texto |
| Corrigir `recorrente = false` | 12 registros (Renner, Pratique) | `UPDATE` de booleano |

Ambas foram aprovadas pelo usuário durante a revisão, mas **exigem confirmação explícita no momento de executar**, conforme o `CLAUDE.md`. O banco pode estar apontando para produção.

Recomendações a considerar no planejamento:
- Fazer backup ou `SELECT` prévio dos registros afetados antes de qualquer `UPDATE`.
- Escrever o `UPDATE` das descrições de forma que remova **apenas** o sufixo no final da string, sem tocar em descrições que contenham parênteses legítimos no meio do texto.
- Executar as correções **antes** do deploy da apresentação nova, ou tratar o caso de dado ainda não corrigido.

## Requisitos de Segurança e Multi-Tenant

Projeto **não é multi-tenant**; sem isolamento de tenant a considerar.

Verificado: nenhuma ocorrência de `tenant`/`prefeitura` em `backend/src/`, nenhuma referência a Row Level Security nas migrations. O `AGENT.md` da raiz descreve um sistema multi-prefeitura com RLS que **não corresponde a este projeto** — é boilerplate desalinhado e não deve guiar decisões aqui.

O isolamento relevante é por `usuario_id` e conta, com a carteira compartilhada da família permitindo visibilidade entre membros conforme permissões (`acesso_lancamentos_familia`, `editar_lancamentos_familia`, `acesso_cartoes_familia`). Cuidados:

- Não alterar nenhuma regra de visibilidade ou permissão — esta task é de apresentação.
- A coluna "Quem lançou" expõe autoria entre membros; sua condicional atual (só aparece com mais de um autor) deve ser preservada.
- As correções de dados em produção devem ser restritas aos registros identificados, sem `UPDATE` sem `WHERE`.

## Requisitos de Migração ou Compatibilidade

- **Descrições já gravadas com sufixo**: enquanto a correção de dados não rodar, a tela mostrará o sufixo normalmente. Não é regressão — é o dado antigo. O código novo não deve tentar esconder o sufixo na exibição (foi descartada a opção de mascarar sem corrigir).
- **Registros com ambos os tipos**: a prioridade "parcelada vence" no `TipoBadge` já os exibe corretamente mesmo antes do `UPDATE`. A correção de dados evita que o erro reapareça em relatórios ou exports que não passem pela mesma prioridade.
- **`StatusBadge`/`TipoBadge` exportados**: qualquer mudança de assinatura exige atualizar `ExpenseCard` na mesma etapa.
- **Contrato da API**: o campo novo de categoria-pai é aditivo. Confirmar que o tipo `Expense` no frontend seja estendido, não alterado.

## Requisitos de Testes

### Frontend

- Conferir via `/run` cada coluna alterada, com despesas nos quatro estados (paga, atrasada, em dia, cancelada).
- Verificar despesa parcelada, recorrente e avulsa — confirmando que Tipo mostra um único estado.
- Verificar despesa com `valorPago` diferente de `valorFinal` (a linha secundária de diferença) e despesa sem diferença (um valor só).
- Verificar categoria com e sem pai (`Saúde › Farmácia` vs. `Farmácia`).
- Verificar as três colunas condicionais aparecendo e sumindo, com o `<colgroup>` acompanhando.
- Verificar o scroll: cabeçalho, filtros e totais fixos com o corpo rolando.
- Verificar modo escuro em todas as colunas alteradas.
- Verificar a visão mobile (`ExpenseCard`) após a mudança em `StatusBadge`/`TipoBadge`.

### Backend

- Criar uma despesa parcelada nova e confirmar que a descrição é gravada **sem** o sufixo, e que `parcela_atual`/`numero_parcelas` continuam corretos.
- Confirmar que a listagem retorna o nome da categoria-pai quando existe, e nulo quando a categoria é raiz.

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend

- [src/screens/despesas/DespesasScreen.tsx](../../src/screens/despesas/DespesasScreen.tsx) — tabela, `StatusBadge` (L49), `TipoBadge` (L72), `<colgroup>` (L586-598), células (L640-800)
- [src/screens/despesas/ExpenseCard.tsx](../../src/screens/despesas/ExpenseCard.tsx) — visão mobile, consome os dois badges
- [src/screens/finance/MovimentacoesScreen.tsx](../../src/screens/finance/MovimentacoesScreen.tsx) — cards de resumo, limite de crédito, área fixa
- Tipo `Expense` (arquivo a identificar no planejamento) — campo novo de categoria-pai

### Backend

- [backend/src/routes/expenses.ts](../../backend/src/routes/expenses.ts) — L129 (concatenação do sufixo), L209 (`SELECT` da categoria)
- [backend/src/routes/categories.ts](../../backend/src/routes/categories.ts) — apenas como referência do padrão de `LEFT JOIN` da hierarquia

### Banco de Dados

- Sem migration. Dois `UPDATE` de correção de dados, a executar com confirmação explícita.

## Critérios de Aceite

- Nenhuma coluna da tabela usa cápsula (`rounded-full` com fundo e padding) — Categoria, Status e Anexos passam a texto/ícone simples.
- Status não exibe ícones, e "Cancelada" aparece em cinza, não vermelho.
- Toda informação secundária da tabela usa `text-[11px] text-slate-400`; não restam ocorrências de `text-[10px]` nem de cor divergente para esse papel.
- A coluna Valor exibe **um único valor** no caso comum; a linha secundária de diferença aparece **apenas** quando `valorPago` difere de `valorFinal`.
- O valor não é mais riscado quando pago, e sua cor corresponde ao estado exibido em Status.
- Existe coluna "Data pagamento" própria, e a coluna Vencimento não contém mais a linha "pago em".
- Categoria exibe `Pai › Filha` quando há hierarquia, com o pai em estilo secundário.
- "Quem lançou" exibe apenas o primeiro nome.
- Uma despesa parcelada criada após a mudança tem a descrição gravada **sem** o sufixo `(x/y)`.
- Nenhum registro em produção mantém o sufixo `(x/y)` no fim da descrição.
- Nenhum registro em produção tem `parcelado` e `recorrente` simultaneamente verdadeiros.
- `TipoBadge` exibe um único estado por despesa, com parcelada tendo prioridade.
- Cabeçalho da tabela, filtros e rodapé de totais permanecem visíveis ao rolar a lista; apenas o corpo rola.
- Todas as células estão centralizadas, incluindo valores e datas.
- As larguras não têm definição concorrente entre `<colgroup>` e `max-w-*` na célula.
- As linhas estão mais compactas que `py-3`, e linhas com informação secundária não têm o conteúdo cortado.
- As três colunas condicionais continuam aparecendo e sumindo corretamente, com o `<colgroup>` correspondente.
- O modo escuro continua correto em todas as colunas alteradas.
- A visão mobile (`ExpenseCard`) continua funcional após a mudança nos badges compartilhados.
- `npx vite build` conclui sem erros novos (o erro pré-existente em `DespesasScreen.tsx:764` não conta como regressão, mas deve ser reportado).

## Perguntas Para o Planejamento

- `StatusBadge` e `TipoBadge` são compartilhados com `ExpenseCard` (mobile). A mudança para texto sem cápsula vale para as duas visões, ou o mobile mantém badges — onde o formato de card pode justificar tratamento diferente do da tabela?
- Como implementar a área fixa: `position: sticky` no `<thead>` com altura definida no container, ou reestruturar `MovimentacoesScreen` em um layout de altura total com região rolável? A segunda é mais robusta mas mexe mais na tela.
- A linha secundária de diferença em Valor (`+ R$ 5,00 juros`) deve distinguir juros de desconto no texto, ou basta o sinal (`+`/`−`)?
- Quando a categoria é raiz (sem pai), a coluna mostra só o nome — confirmado. Mas e quando a hierarquia tem mais de dois níveis, se isso for possível no modelo atual?
- A correção das 158 descrições deve rodar antes do deploy, ou o código novo precisa tolerar ambos os estados durante a janela entre uma coisa e outra?
- Com a compactação da área fixa (cards finos + limite vertical), qual altura útil sobra para o corpo da tabela nas resoluções que o usuário realmente usa?
- O erro de tipo pré-existente em `DespesasScreen.tsx:764` deve ser corrigido nesta entrega (já que o arquivo será mexido de qualquer forma) ou tratado como task separada?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada. **As 13 decisões de coluna já estão fechadas** — não reabrir como decisões pendentes.
- Leia o `CLAUDE.md` da raiz e do projeto (fluxo obrigatório `/planejar` → aprovação → `/implementar` → `/finalizar`, e a regra de redesign **remover o antigo primeiro, depois aplicar o novo** como etapas distintas).
- Sobre o `AGENT.md`: existe apenas na raiz e em `sistema financas/` (idênticos, 491 linhas). **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md`. O conteúdo descreve um sistema multi-prefeitura com RLS que não corresponde a este projeto — usar apenas as partes genéricas (Drizzle, legibilidade, não adicionar dependências que exijam Node > 22.17.0) e ignorar a parte de multi-tenant.
- Inspecione `DespesasScreen.tsx`, `ExpenseCard.tsx`, `MovimentacoesScreen.tsx` e `backend/src/routes/expenses.ts` antes de escrever o plano.
- Classifique a implementação como `frontend + backend + correção de dados` (sem migration).
- Trate as duas correções de dados como etapa explícita e separada, com `SELECT` de conferência antes de cada `UPDATE`, e **confirmação do usuário no momento de executar**.
- Não implemente código durante o planejamento.
- Não instale dependências.
- Não execute os `UPDATE` de produção sem confirmação explícita.
- Gere o plano em `.plans/` (convenção real deste projeto), com etapas pequenas e revisáveis.
