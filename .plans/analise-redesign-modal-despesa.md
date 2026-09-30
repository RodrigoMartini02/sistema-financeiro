# Análise — Redesign do modal "Nova despesa" (mockup "Nova Despesa v2")

Levantamento do que muda para o modal chegar ao mockup, do que sai e do que já está morto hoje. Código lido em
2026-09-29 (igual ao `main`, que já tem o merge `e1792e83`). Complementa `.plans/inventario-modal-lancar-despesa.md`.
Nenhum arquivo de código foi alterado.

## 1. Entendimento

- Refazer o modal de lançar despesa no formato do mockup. O modal vira uma grade de linhas: a linha de entrada e o lote
  em linhas compactas. No topo fica a barra "Lançando em", com a forma de pagamento e o cartão. As escolhas abrem em
  popovers. Uma linha de resumo fica sob a despesa ativa, e o rodapé tem uma mensagem e um botão.
- Trazer as funções do mockup, inclusive as que não existem hoje:
  - grade de parcelas;
  - data real de pagamento;
  - valor total no parcelado;
  - teclado no autocomplete e Tab na sugestão de categoria;
  - Esc por camadas (primeiro o popover, depois o modal).
- Tirar tudo o que o modal novo não usar e o que já está morto. A versão antiga não fica convivendo com a nova (sem
  sobreposição), e não há caixas dentro de caixas (sem encaixotamento).
- Fora do escopo: o modal de receita, exceto os componentes que ele divide com a despesa (decisão 7).

## 2. Estrutura do mockup

- **Cabeçalho**: "Nova despesa · Registre uma saída financeira" e o botão de fechar (Esc).
- **Barra "Lançando em"**: uma pill com a forma de pagamento e o cartão, que vale para as próximas despesas. O popover
  tem PIX/Dinheiro/Débito/Crédito, os cartões compatíveis e "Limite disponível · fecha dia N, vence dia M".
- **Colunas da grade**: Descrição* · Categoria* · Cobrança · Valor* · Compra · Vencimento · ✓ Pago em · Valor pago ·
  📎 · +. Variações:
  - o rótulo do valor vira "Valor total" no parcelado e "Valor mensal" no recorrente;
  - no parcelado, "Pago em" e "Valor pago" viram o botão "Pagamento das parcelas", que abre a grade de parcelas.
- **Lote**: cabeçalho "No lote · N despesas · soma R$". Cada linha é editável ali mesmo, tem uma coluna "Pagamento" a
  mais e uma lixeira.
- **Resumo sob a linha ativa**, com:
  - status, vencimento e total;
  - badges: juros embutido, multa e juros, desconto, vencidas em aberto;
  - "Sugerida: X · Tab aceita" e "Última vez você pagou";
  - aviso de duplicata;
  - uma ajuda à direita.
- **Rodapé fixo**: uma mensagem (erro, duplicata ou orientação) e o botão "Registrar despesa" / "Salvar N despesas".
- **Durante e depois do salvamento**: overlay "Salvando despesas... i de n" e toast "✓ N despesas registradas".
  O modal continua aberto.

## 3. Mapa: hoje × mockup

| # | Área | Hoje | Mockup | Mudança |
|---|---|---|---|---|
| 1 | Layout | Cada despesa é um formulário de 3 blocos. No lote, cada item é um formulário completo, cada um num card | Grade com uma linha por despesa; o lote fica em linhas compactas | Refazer |
| 2 | Forma e cartão | Chips "Forma de pagamento" e "Cartão" em cada formulário; o limite mostra só "R$ X disponível" | Pill "Lançando em", que vale para as próximas. No lote, uma coluna "Pagamento" por linha. O limite mostra também os dias de fechamento e vencimento | Refazer |
| 3 | Autocomplete | Até 4 itens, só no clique. Enter com a lista aberta salva a despesa | ↑↓, Enter escolhe, Esc fecha. Mostra forma e valor. Escolher um item também traz o cartão | Refazer + backend (§7) |
| 4 | Sugestão de categoria | "Tab aceita" é só texto | Tab aplica a sugestão | Corrigir |
| 5 | Categoria | Recentes em lista. "Criar" abre uma caixa fora do seletor. O campo mostra só a sub. Opcional na prática | Recentes em chips, "criar" dentro do popover, campo "Pai › Sub", obrigatória | Refazer (o seletor é compartilhado com a receita) |
| 6 | Cobrança | 3 cartões de rádio e um card de guia | Popover com 3 opções | Refazer |
| 7 | Valor no parcelado | "Valor da parcela". "Sei o preço à vista" troca o campo e divide pelo nº de parcelas | "Valor total". Parcela = total ÷ n, com o resto na última, e cada uma é editável. "Sei o preço à vista" é um campo à parte, que só calcula o juros embutido | Regra nova + backend |
| 8 | Parcelas pagas | Nº de "já pagas": as primeiras N, sem data nem valor pago | Grade de parcelas: marca qualquer parcela, com data e valor pagos; mostra a situação de cada uma; tem "marcar vencidas como pagas"; avisa se a soma difere do total; mostra Total/Pago/Falta | Novo + backend |
| 9 | Reduzir o nº de parcelas | Encolhe o "já pagas" | Pede confirmação quando perderia ajustes ou pagamentos | Novo |
| 10 | Recorrente | "Todo dia N" (some no crédito) | Igual, com "· 12 ocorrências" | Igual |
| 11 | Datas | `input type=date`. "Data do pagamento" grava, na verdade, o vencimento | Texto dd/mm/aaaa com máscara e complemento ("5" vira 05/mês/ano). A coluna "Vencimento" mostra o valor calculado no placeholder. "Pago em" é a data real do pagamento | Refazer + gravar a `data_pagamento` real |
| 12 | Pago e valor pago | Checkbox "Assinale se a despesa já foi paga" + valor pago | ✓ e data na coluna "Pago em", mais a coluna "Valor pago" | Refazer |
| 13 | Anexos e NF | Clipe ao lado da categoria, com os chips embaixo. NF (PJ) num link recolhível | Popover por linha com a lista, "+ Anexar" e a dica de tipos. A NF (PJ) fica no mesmo popover | Refazer |
| 14 | Resumo | Faixa com status, vencimento e total. Badges, "última vez" e ajuda ficam em outros lugares | Tudo numa linha sob a despesa ativa | Refazer |
| 15 | Status | Pago · Agendado · Entra na fatura | Os mesmos, mais "Com vencidas" e "Em andamento" | Ampliar |
| 16 | Lote | Botão "+ Adicionar ao lote" no rodapé; itens "Despesa N" com um X | Botão "+" na linha de entrada e uma lixeira em cada linha | Refazer |
| 17 | Validação | Só "crédito exige cartão" funciona | Descrição, categoria e valor, mais o cartão no crédito. Campos com borda vermelha e o rodapé diz qual linha tem erro | Refazer |
| 18 | Esc | Fecha o modal até de dentro da busca de categoria | Fecha o popover; o modal só fecha depois | Corrigir |
| 19 | Rodapé | Aviso de duplicata, mensagem e 2 botões | Uma mensagem e 1 botão | Refazer |
| 20 | Depois de salvar | As telas fecham o modal | Continua aberto, limpo, com o toast | Decisão 4 |

A categoria volta a ser obrigatória. O mockup marca o campo com `*`, e essa já era a regra combinada em
`.plans/revisao-categorias-selecao-metas-painel.md:187`. Hoje a categoria fica opcional só porque a validação nunca roda.

## 4. Existe hoje e não está no mockup

| Item | Destino proposto |
|---|---|
| Seletor de conta (quem tem PF + PJ) | Decisão 3 |
| Modo edição ("Editar despesa") | Decisão 2 |
| Enter salva / Shift+Enter adiciona ao lote | Decisão 5 |
| Card de primeiro acesso "Tipo de cobrança" | Sai, com a mensagem dele |
| "+ Adicionar ao lote" no rodapé | Vira o "+" da linha |
| Campo "já pagas" | Substituído pela grade de parcelas |
| Botão X que limpa a categoria | Sai: clicar de novo na mesma categoria já desmarca (`CategoryFloatingSelect.tsx:116-119`) |
| Caixa de erro do salvamento (prop `error`) | Vai para a mensagem do rodapé |

## 5. Código morto e lixo (verificado no código)

1. As props `month` e `year` do `ExpenseDialog` são declaradas e nunca lidas (`ExpenseDialog.tsx:35-38`). As 5 telas as
   passam à toa.
2. O `validate()` do handle nunca é chamado (`ExpenseForm.tsx:75`, `:561`).
3. O schema zod e o `zodResolver` nunca executam: o salvamento não passa pelo `handleSubmit` nem pelo `trigger`. Por
   isso, as mensagens de erro de categoria e de valor nunca aparecem (`ExpenseForm.tsx:27-44`, `:165`, `:692-694`,
   `:834-836`).
4. `acIndex` só volta a -1; nada mais o altera (`ExpenseForm.tsx:261`, `:274`).
5. A mensagem "✓ Despesa registrada" do rodapé não aparece, porque as telas fecham o modal ao salvar
   (`ExpenseDialog.tsx:88`, `:194-195`, `:351-355`).
6. O comentário sobre o Enter no autocomplete está errado (`ExpenseDialog.tsx:215-219`).
7. `saveExpense(month, year, ...)` manda `mes` e `ano`, e o backend ignora os dois: ele os tira do vencimento
   (`financeService.ts:208`; `expenses.ts:414`, `:518`).
8. O campo `observacoes` de `ExpenseFormValues` não existe no modal, que sempre manda `null`. Na edição, o PUT apaga a
   observação que existir (`financeService.ts:209`; `expenses.ts:531`, `:545`). As tabelas continuam exibindo o campo.
9. `recorrente` e `recorrenciaMensal` são sempre iguais (`ExpenseForm.tsx:491-492`).
10. `valorFinalTotal` é uma cópia de `valorFinal`, usada só na edição do modal (`types/finance.ts:71`,
    `financeService.ts:83`).
11. `MoneyFieldSmall` e `numericInputStyle` só são usados pelo `ExpenseForm` (`dialogFormTokens.tsx:49-54`,
    `:229-247`).
12. A mensagem `despesasTogglesTipo` e o guia `despesas:toggles-tipo-v1` só existem aqui
    (`firstAccessGuideMessages.ts:17`, `ExpenseForm.tsx:147`).
13. `DuplicataInfo` só embrulha um `Expense`, sem uso próprio (`ExpenseForm.tsx:48`).
14. `formatBr` está repetido nos dois arquivos (`ExpenseDialog.tsx:13`, `ExpenseForm.tsx:52`).
15. Há cinco cópias do laço de gravação, com três comportamentos diferentes (`App.tsx:231`, `demoMain.tsx:57`,
    `DespesasScreen.tsx:529-535`, `CalendarView.tsx:220-226`, `LancamentosTable.tsx:435-441`).
16. A fiação de refs entre o pai e os formulários (`getValues`/`reset`/`focus`/`conferirCartao`/`onResumoChange`)
    existe só porque cada item do lote é um formulário com estado próprio. Ela some com o estado único do lote.
17. No `Dialog`, só este modal usa o `fixedHeight`, e ninguém usa o tamanho `xxl` (`dialog.tsx:19`, `:30`).
18. Há caixas aninhadas: o painel do topo, um card por item do lote, o card do "Tipo de cobrança" e a faixa do resumo
    (`ExpenseDialog.tsx:272-278`, `:309-316`; `ExpenseForm.tsx:921`, `:996-999`).

Relacionado, mas fora do escopo: o frontend não usa `categorias.forma_favorita` / `cartao_favorito_id` nem a rota
`PUT /categorias/:id/favorite` (`backend/src/routes/categories.ts:370-393`). O modal novo usa o histórico. Remover as
colunas pede migration, por isso fica só anotado.

## 6. Bugs do fluxo atual (lidos no código, não testados na tela)

1. **Editar uma parcela estraga o parcelamento.** A edição volta o nº de parcelas para 2 e não manda `parcela_atual`.
   O PUT grava `numero_parcelas = 2` e `parcela_atual = NULL`, e a linha perde o "3/10" (`ExpenseForm.tsx:383`;
   `financeService.ts:215`; `expenses.ts:532`, `:546`).
2. **Editar com lote.**
   - Em Despesas e Lançamentos, com mais de um item nenhum leva o id: a despesa editada não muda e vira uma cópia nova
     (`DespesasScreen.tsx:531`, `LancamentosTable.tsx:437`).
   - No Calendário, todos os itens levam o mesmo id e um sobrescreve o outro (`CalendarView.tsx:222`).
3. **Vencimento no dia 29 a 31, em parcelas e recorrência.** O backend soma meses com `setMonth` sem ajustar o dia: com
   vencimento em 31/01, a 2ª parcela vence em 03/03, mas fica gravada no mês de fevereiro (`expenses.ts:87-90`,
   `:160-162`). O "próxima vence" do modal tem o mesmo erro (`ExpenseForm.tsx:454-456`).
4. **Parcelas pagas no cadastro ficam sem data e sem valor pago**, porque o INSERT não grava essas colunas. A 1ª
   parcela pode ficar com `pago = false` e, ao mesmo tempo, data e valor pagos preenchidos (`expenses.ts:95`,
   `:120-126`, `:134-138` com `:416-424`).
5. **O autocomplete repete a mesma descrição.** O backend devolve linhas, não descrições distintas, então "Uber" pode
   aparecer 4 vezes. Ele também não filtra por conta nem por status (`expenses.ts:289-298`;
   `ExpenseForm.tsx:262-264`).
6. **Trocar de conta no modal mantém a categoria da outra conta.** Além disso, o limite do cartão vem da conta ativa, não
   da escolhida (`ExpenseForm.tsx:144`; `cardLimitsService.ts:12`).
7. **O progresso fica em "0 de N"** no atalho global e na demo: essas duas telas não avisam cada item salvo
   (`App.tsx:231`, `demoMain.tsx:57`).
8. Já listados no inventário (§13):
   - o Esc na busca de categoria fecha o modal (`dialog.tsx:36-41` + `CategoryFloatingSelect.tsx:81-83` +
     `ExpenseDialog.tsx:211-214`);
   - o Enter com o autocomplete aberto salva a despesa;
   - o Tab não aceita a sugestão;
   - a edição perde o cartão.

## 7. Backend

Não precisa de migration: cada parcela já é uma linha no banco, com valor, pago, data e valor pagos.

- **`POST /despesas` parcelado**:
  - recebe a lista de parcelas (valor, vencimento, paga, data paga, valor pago);
  - grava tudo de uma vez, com Drizzle (regra da AGENT.md);
  - o status de cada parcela vem da lista. A regra "vencida fora do crédito = paga" passa a valer só para despesa única
    e recorrente, porque o mockup deixa manter uma parcela vencida em aberto.
- **Datas**: um helper de "somar meses mantendo o dia no fim do mês", usado nas parcelas e na recorrência (corrige o
  bug 3).
- **Despesa única**: o frontend passa a mandar a data real do pagamento. A rota já aceita `data_pagamento`.
- **`PUT /despesas/:id` (edição)**: não sobrescreve `numero_parcelas`, `parcela_atual` e `observacoes` quando eles não
  vêm no corpo (bug 1 e item 8 da §5).
- **`GET /expenses/suggestions`**:
  - devolve descrições distintas, cada uma com o último valor, categoria, forma e cartão;
  - filtra por conta e por status ativa;
  - a duplicata no servidor depende da decisão 9.
- **Contrato único**: o caminho antigo (`total_parcelas` + `parcelas_ja_pagas`) sai depois que o assistente migrar. Um
  payload antigo, de quem ainda tem o PWA em cache, recebe 400 com "atualize o app" em vez de gravar só a 1ª parcela.
- **Teste unitário** do cálculo de parcelas: divisão, resto, dias 29 a 31 e fatura.

## 8. Outros pontos afetados

- **Assistente financeiro**: usa o mesmo `saveExpense`, com `total_parcelas` e `parcelasJaPagas`
  (`FinancialAssistant.tsx:994-1014`). Ver decisão 6.
- **Modo demo**: a API falsa trata o POST de despesas (`fakeApiResolver.ts:87-118`) e precisa acompanhar o contrato.
- **Componentes compartilhados com a receita**: `CategoryFloatingSelect`, `AttachmentSection`, `MoneyField` e `Dialog`.
  Ver decisão 7.
- **Telas que abrem o modal**: `App.tsx`, `demoMain.tsx`, `DespesasScreen.tsx`, `CalendarView.tsx` e
  `LancamentosTable.tsx` (props e laço de gravação).
- **Painel**: passa a receber data e valor pagos por parcela. Com isso, "pago em dia/atraso" e juros/descontos ficam
  corretos para parcelas quitadas no cadastro. Hoje elas contam como pagas em dia e sem juros
  (`painelCalculos.ts:214-249`).

## 9. Proposta de implementação (entrada para o /planejar)

Em duas fases, como combinado para redesigns.

**Fase 1 — Remover**:
- `ExpenseForm.tsx` inteiro e o miolo do `ExpenseDialog`;
- os itens da §5;
- os laços de gravação duplicados;
- o caminho antigo de parcelas no backend, junto com a entrada do contrato novo.

**Fase 2 — Aplicar**:
- **Estado**: um estado único do modal (linha de entrada + lote) num reducer. As linhas não usam `forwardRef` nem
  handles.
- **Lógica pura**, separada da tela: vencimento e fatura, divisão e ajuste de parcelas, status e resumo, validação e
  montagem do payload. A divisão de parcelas fica num lugar só, usada pelo modal e pelo assistente.
- **Componentes**: a casca do modal, a linha e os popovers (pagamento, categoria, cobrança, parcelas, anexos/NF).
- **Posição dos popovers**: fixa, como o `CategoryFloatingSelect` já faz. Um popover absoluto dentro do corpo rolável é
  cortado.
- **Gravação**: sequencial e com progresso, dentro do próprio modal. As telas só passam o id (na edição) e o que fazer
  depois.
- **Nomes**: em inglês, pela regra "English-Only Codebase" da AGENT.md. Os textos da tela continuam em português.
  `cardDueDate.ts` e `categorySuggestions.ts` também passam para inglês se forem reescritos.
- **Largura**: 1240px. Dá para reusar o `xxl`, que hoje ninguém usa.

## 10. Arquivos afetados (estimativa)

- **Removido**: `src/screens/finance/ExpenseForm.tsx`.
- **Refeito**: `src/screens/finance/ExpenseDialog.tsx`, mais os arquivos novos da linha, dos popovers e da lógica.
- **Alterados no frontend**:
  - `src/types/finance.ts`, `src/services/financeService.ts`, `src/hooks/useFinanceDashboard.ts`;
  - `src/services/expenseSuggestionsService.ts`, `src/utils/cardDueDate.ts`;
  - `src/ui/dialog.tsx`, `src/ui/dialogFormTokens.tsx`, `src/components/firstAccessGuideMessages.ts`;
  - as 5 telas da §8;
  - `src/components/financial-assistant/FinancialAssistant.tsx`, `src/services/demo/fakeApiResolver.ts`;
  - conforme a decisão 7, `src/ui/CategoryFloatingSelect.tsx` e `src/ui/AttachmentSection.tsx`.
- **Alterados no backend**: `backend/src/routes/expenses.ts`, `backend/src/utils/date.ts` e um teste novo.
- **Banco**: nenhuma migration.

## 11. Riscos

- **PWA em cache**: quem estiver com o app antigo aberto manda o payload antigo até atualizar. O 400 com mensagem evita
  gravar um parcelado pela metade.
- **Nova regra do parcelado**: o valor passa a ser o total, e quem está acostumado a digitar o valor da parcela vai
  estranhar. O rótulo "Valor total" e o resumo "Nx de R$ Y" deixam a conta visível.
- **Largura**: a grade do lote precisa de ~1240px. Abaixo disso, ver a decisão 1.

## 12. Decisões

### Respostas (2026-09-29)

- 1, 2 e 4 a 11: seguem a recomendação.
- **3: sem seletor de conta.** O modal lança sempre na conta ativa, e quem tem PF e PJ troca a conta pelo menu do
  cabeçalho (`AccountMenu.tsx:31` → `useActiveAccount.ts:38-44`, que recarrega o app). Consequências:
  - saem do `ExpenseDialog` a consulta de contas, o estado `contaId` e o efeito que volta para a conta ativa;
  - `isEmpresa` passa a vir da conta ativa;
  - o bug 6 (categoria de outra conta e limite da conta errada) deixa de existir;
  - o modal de receita continua com o seletor dele, que está fora deste escopo.

### Perguntas originais

1. **Celular**: o mockup é só desktop (1240px). Recomendação: abaixo de ~1024px, a mesma linha se reorganiza em blocos
   empilhados e os popovers abrem em largura cheia. Nada de um segundo formulário.
2. **Edição**: o mockup não mostra esse modo. Recomendação: o mesmo modal, com uma linha só.
   - Sem lote e sem o botão "+".
   - A cobrança fica só leitura ("Parcela 3/10", "Mensal"), sem a grade de parcelas.
   - O cartão já vem carregado.
   - O modal fecha ao salvar.
3. **Conta PF/PJ**: o mockup calcula a lista de contas, mas não mostra. Recomendação: manter, só para quem tem mais de
   uma conta, como um segundo item na barra "Lançando em". Trocar de conta limpa a categoria e o cartão que não
   existirem na outra.
4. **Depois de salvar**: hoje o modal fecha; no mockup, ele continua aberto e limpo, com o toast. Recomendação: seguir o
   mockup na "Nova despesa" e fechar na edição.
5. **Atalhos**: o mockup não tem. Recomendação: manter Enter = salvar e Shift+Enter = adicionar ao lote. Dentro do
   autocomplete e dos popovers, o Enter é deles.
6. **Assistente**: recomendação: migrar para o contrato novo sem mudar a tela dele. As "N já pagas" viram as N primeiras
   parcelas, pagas no vencimento. Assim o backend fica com um caminho só.
7. **Componentes compartilhados com a receita** (seletor de categoria e anexos): recomendação: evoluir os mesmos
   componentes, e a receita ganha o visual novo junto. Nada de uma cópia só para a despesa.
8. **Aparência**: recomendação:
   - os tokens do app (`C`), cujas cores batem quase 1:1 com as do mockup (#0891b2, #dbe6ec, #f2f9fb, #dcebf1);
   - a fonte Figtree do app (o mockup usa Nunito Sans);
   - o cabeçalho padrão dos modais.
9. **Duplicata**: hoje só compara com os meses que estão em cache na tela. Recomendação: checar no servidor, junto das
   sugestões.
10. **Inglês no contrato**: recomendação: passar para inglês também o corpo do POST/PUT de despesas, já que a rota vai
    ser refeita. Respostas e banco ficam como estão.
11. **Branch**: a `chore/R/remover-projeto-futebol` já está mergeada em `main`. Recomendação: uma branch nova,
    `feat/R/redesign-modal-despesa`, a partir de `main`.
