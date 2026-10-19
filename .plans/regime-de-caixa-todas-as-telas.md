# Plano: a mesma regra de caixa em todas as telas

## Origem

- Bate-papo de 2026-10-19, depois do PR #2 (`.plans/painel-resultado-regime-caixa.md`): "você analisou todos os impactos? dos registros até os gráficos do painel? cards de receitas e despesas em movimentações?".
- Data da análise: 2026-10-19
- Classificação: `backend + frontend`. **Sem migration.**
- Situação: **implementado na branch `claude/determined-pascal-wrve3a`** (aprovado pelo usuário em 2026-10-19, as três recomendações). Sem migration. Falta o merge e a conferência na tela, em produção, depois do deploy.

## Resumo

O PR #2 levou o Painel para o regime de caixa, mas as demais telas continuam por vencimento. Em produção, o mesmo dado hoje tem **duas respostas**. Além disso, achei uma segunda fonte do problema original, do lado da receita: confirmar uma receita prevista não muda a data dela, então um mês fechado ganha receita quando ela é confirmada depois.

## Prova (serviços reais contra um Postgres descartável com o schema atual)

Dados: E1 março, paga em 19/10 com 450 (valor 400); E2 setembro, em aberto, 200; E3 novembro, paga adiantada em 15/10, 300; E4 outubro, em aberto, 100; E5 fevereiro, paga no dia, 150. Receitas: R3 fevereiro 800 e R2 outubro 500 recebidas; R1 março 1.000 **prevista**. Hoje = 19/10/2026.

Despesa do mês, por tela:

| Tela | março | outubro | novembro |
| --- | ---: | ---: | ---: |
| Movimentações (cards), Relatórios, Assistente, Planejamento, Visão geral das contas | 450 | 100 | 300 |
| Painel (já em caixa) | 0 | 850 | 0 |

- **Painel × resto:** cinco telas dizem que outubro tem 100; o Painel diz 850. Dentro do próprio Painel, com o filtro "Todas as contas" marcado, o card "Todas as contas" (vencimento) diverge do "Resultado" (caixa).
- **Lista de Movimentações:** a conta de março, paga em outubro, aparece na lista de março; a de novembro, paga em outubro, na de novembro. O "Despesa paga" de outubro dá 0 apesar de R$ 750 pagos no mês, e o "Saldo atual" de outubro sai errado.
- **Receita:** confirmar R1 em 19/10 gravou `data_recebimento = 2026-03-10` e `mes = 2`. Março passou a ter +1.000 nas duas telas, e **todos os saldos acumulados seguintes subiram 1.000** (Movimentações: setembro 200 → 1.200; Painel: março 650 → 1.650).

## Causas

1. **Três "datas do lançamento" no código.** (a) As colunas `mes/ano`, que são o mês do vencimento: lista, saldo e cards de Movimentações, Planejamento e Copiloto. (b) `data_vencimento`/`data_recebimento` em faixas: Relatórios, Assistente, Visão geral das contas. (c) A data de caixa, só no Painel.
2. **`receiveIncome` não leva a data nem o mês para o dia do recebimento.** A tela só confirma, sem data; o servidor mantém a data prevista e não atualiza `mes/ano`.
3. **A lista do mês é por `mes/ano`** (`utils/ownerAndAccountWhere.ts`), então a despesa paga em outro mês fica no mês do vencimento.
4. **Soma duplicada no cliente:** "Despesa do mês" é somada na tela a partir da lista, enquanto "Resultado" e "Saldo anterior" vêm do servidor. Só batem enquanto a lista e o servidor usam a mesma regra.

## Regra única

- **Realizado** (despesa paga, receita recebida): conta no **dia do pagamento ou do recebimento**, pelo valor pago ou recebido. Nunca muda depois.
- **Pendente** (despesa em aberto): conta no mês do **vencimento**, até ser paga ou movida (decisão do PR #2).
- **Receita prevista ou faturada:** fora dos totais do que entrou, como hoje.
- **Saldo anterior** de um mês = tudo que contou antes dele, com a mesma regra. **Saldo atual** continua "saldo anterior + receitas − despesas pagas".
- A regra mora em **um lugar só** no backend (função e fragmentos SQL) e num espelho no frontend, com teste de paridade, como já é feito em `expenseCounting`.

## Inventário e o que muda

| Tela / função | Arquivo | Hoje | Passa a ser |
| --- | --- | --- | --- |
| Lista de despesas | `utils/ownerAndAccountWhere.ts` (`GET /expenses`) | `mes/ano` | mês de caixa (paga: pagamento; senão vencimento) |
| Lista de receitas | idem (`GET /incomes`) | `mes/ano` | igual, com `mes/ano` mantido pelo recebimento (ver Receita) |
| Cards, saldo anterior | `services/balanceService.ts` | `mes/ano` | data de caixa; receita pela `data_recebimento` |
| Calendário | `screens/finance/calendar/CalendarView.tsx` | `dataVencimento` | data de caixa |
| Ordenar por data | `LancamentosTable.tsx` | vencimento | data de caixa |
| Painel | `painelService.ts` / `painelCalculos.ts` | caixa | já está; usar a função única |
| Visão geral das contas | `routes/accountMembers.ts` | vencimento | data de caixa (despesa) |
| Relatórios e PDF | `services/reportService.ts`, `reportPdf.ts` | vencimento | data de caixa |
| Planejamento | `services/budgetService.ts` | `mes/ano` | data de caixa |
| Assistente | `services/assistantQueries.ts` (`expenseRange`, `countedExpenseRange`) | vencimento | data de caixa; as consultas de contas em aberto não mudam |
| Copiloto | `services/financialCopilot.ts` | `mes/ano` | data de caixa |
| Alertas e notificações | `expenseAlerts.ts` | vencimento | **não muda** (é aviso de vencimento) |

## Receita

- `receiveIncome` (`incomeService.ts`): grava `receiptDate` **e** `month/year`; sem data informada, usa a data prevista **só se ela for do mês atual**; senão, hoje. Assim nenhum recebimento cai sozinho num mês fechado.
- Tela: "Confirmar recebimento" (tabela e `PredictedIncomesStrip`) passa a abrir um diálogo pequeno com a **data do recebimento**, já preenchida pela mesma regra. Sem campo de valor (decisão anterior do plano da receita com bruto e líquido).
- Sem backfill: o banco não guardou quando as receitas antigas foram confirmadas.

## Frontend

- Função `cashDate` espelhada em `utils/` (com teste de paridade); calendário e ordenação a usam.
- A lista já traz as três datas na linha (compra, vencimento, pagamento), então a despesa de março paga em outubro aparece na lista de outubro com "Vencimento 20/03 · Pagamento 19/10".
- Limpeza: o comentário "Grid em vez de flex-wrap..." de `MovimentacoesScreen.tsx` ficou acima do `OverdueExpensesPrompt`, por engano meu no PR #2; volta para cima da faixa de limites dos cartões.

## Decisões

1. **Aplicar a mesma regra em Relatórios e Planejamento** (recomendado) ou manter os dois por vencimento? Manter deixa duas respostas para "quanto gastei em outubro".
2. **Confirmar recebimento com data** no diálogo (recomendado).
3. Confirmar o que o PR #2 já definiu: conta vencida e em aberto continua no mês do vencimento até ser paga ou movida; pagá-la ou movê-la tira a conta daquele mês. É o único caso em que um mês passado muda por ação de hoje, e é o que o usuário pediu com a lista de vencidas.

**Respostas (2026-10-19): sim às três.**

## Verificação

- **Quadro de aceite**, rodado com os serviços reais no banco descartável, antes e depois: as seis telas precisam dar os mesmos números. Esperado com o mesmo conjunto de dados e R1 confirmada em 19/10:

  | mês | saldo anterior | receitas | despesas | saldo final |
  | --- | ---: | ---: | ---: | ---: |
  | fevereiro | 0 | 800 | 150 | 650 |
  | março | 650 | 0 | 0 | 650 |
  | setembro | 650 | 0 | 200 | 450 |
  | outubro | 450 | 1.500 | 850 | 1.100 |
  | novembro | 1.100 | 0 | 0 | 1.100 |

- Testes novos: paridade `cashDate` frontend × backend; data padrão do recebimento; lista por mês de caixa; saldo anterior; receita confirmada em outro mês. Os testes de banco rodam só com variável de ambiente, como os de licitações.
- Resultado: ver "Implementação" abaixo.

## Riscos e ordem

- **Um único PR e um único deploy:** dividir deixaria telas divergentes em produção entre um deploy e outro.
- **Números históricos mudam uma vez:** meses com conta paga fora do mês do vencimento passam a mostrar o valor no mês do pagamento. Receitas confirmadas no passado continuam na data prevista.
- Conferência antes do deploy, só leitura, no banco de produção (queries no corpo da resposta): quantas despesas pagas fora do mês do vencimento, e se há receitas com `mes/ano` diferente da data.
- O índice `(usuario_id, mes, ano)` deixa de servir à lista; o volume por usuário é pequeno. Se pesar, índice por expressão em outra rodada.
- Fora do escopo: pagamento de fatura, limite do cartão, vencimento original (já no PR #2), tela de "receitas atrasadas a confirmar" (simétrica da lista de vencidas; fica como sugestão).

## Implementação (2026-10-19)

A regra mora em `backend/src/services/cashDate.ts` (`expenseCashDate`, `expenseCashDateSql`, `expenseCashDateColumn`, `monthRange`, `defaultReceiptDate`), com o espelho `src/utils/cashDate.ts` e testes de paridade nos dois lados.

- **Despesas por data de caixa:** lista (`utils/ownerAndAccountWhere.ts`, `routes/expenses.ts`), cards e saldo anterior (`balanceService.ts`), Painel (`painelCalculos.ts` usa a função única; `painelService.ts`, saldo anterior), Relatórios (`reportService.ts`), Planejamento (`budgetService.ts`), Copiloto (`financialCopilot.ts`), Assistente (`assistantQueries.ts`) e visão geral das contas.
- **Receita:** `receiveIncome` (`incomeService.ts`) grava data e `mes/ano` do recebimento; sem data informada vale a prevista se for do mês atual, senão hoje. A lista de receitas segue por `mes/ano`, que o recebimento passa a manter.
- **Frontend:** diálogo `ReceiptDateDialog.tsx` em "Confirmar recebimento" (tabela e faixa de previstas), calendário e ordenação pela data de caixa, comentário do `MovimentacoesScreen.tsx` de volta ao lugar, margem do modal de vencidas corrigida.

### Diferenças em relação ao plano

- A visão geral das contas saiu da rota para `services/accountsOverview.ts` (`loadAccountTotals`), para poder ser testada com o banco; as chaves da resposta não mudaram.
- Assistente: o resumo, os maiores gastos, a busca e os comparativos usam a data de caixa; **contas a pagar, recorrentes previstas e projeção de saldo ficam por vencimento**, porque falam do que ainda está em aberto.
- Alertas e notificações não mudaram (são aviso de vencimento). O "Mover para próximo mês" de uma conta na tabela continua somando um mês.

### Verificação

- Quadro de aceite com os serviços reais num Postgres descartável: Movimentações (cards e lista), Painel, Relatórios, Assistente, Planejamento e visão geral das contas dão os mesmos números nos cinco meses do quadro (fevereiro, março, setembro, outubro, novembro), batendo com a tabela acima.
- Teste de banco commitado, `npm --prefix backend run test:finance-db` (só com `FINANCE_DB_TESTS=1`, só em banco local, apaga o que cria): 5 testes. Conferido que pega o defeito antigo: com a data prevista mantida ao confirmar a receita falham 3, e com a despesa paga contando no vencimento falham 2.
- Rotas HTTP reais e a tela no navegador (Chromium) contra o banco descartável: lista, cards, calendário, diálogo da data de recebimento e modal de vencidas.
- Suítes: backend 501 de 507 (as 6 que falham só importam o banco e não têm `DATABASE_URL`, igual antes da mudança; com a variável os 6 arquivos passam, 54 de 54); frontend 304 de 304; `tsc --noEmit` nos dois; `vite build`.
- **Não verificado:** produção. Os dados reais não foram vistos; os números de meses passados mudam uma vez (ver riscos).

### Para o deploy

- Sem migration: pode ir direto, backend e site juntos (um deploy só, para as telas não divergirem).
- Depois do deploy, conferir na tela de produção: um mês fechado com conta paga em outro mês, e o saldo acumulado do Painel.
