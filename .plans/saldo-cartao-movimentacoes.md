# Plano: conferir e corrigir o "Usado" do cartão (card de limite de Movimentações)

## Origem

- Bate-papo de 2026-10-19, depois do PR #3: "faça uma análise profunda do saldo de cartão de crédito que fica no card em movimentações, para ver se está contabilizando corretamente, despesas do mês, parcelamentos, e recorrência".
- Contexto anterior (PR #1, limite do cartão): o usuário via **R$ 5.656,87 usado no sistema contra R$ 2.915,75 no banco** (R$ 2.741,12 a mais), com o cadastro do cartão conferido. A causa nunca foi confirmada, porque não há acesso aos dados de produção.
- Data da análise: 2026-10-19
- Classificação: `backend + frontend`. **Sem migration prevista** (depende dos dados, ver "Dados a conferir").
- Situação: **achado B corrigido** (aprovado em 2026-10-19). O resto aguarda o resultado da consulta de produção e as decisões.

## Como o "Usado" é calculado hoje

`getCardLimitsForOwners` (`backend/src/services/cardLimitService.ts`) soma `valor_original` de toda despesa do cartão que está **em aberto** (não paga e ativa), de **qualquer mês**:

- **Forma de pagamento:** cartão `credito` conta crédito e lançamento sem forma; `ambos`, só crédito; sem tipo, tudo.
- **Conta:** a mesma do cartão.
- **Autor:** só as pessoas da visão. "Só eu" = o próprio usuário; "Família" = todos (`d.usuario_id = ANY(donos)`).
- **Recorrente em aberto:** só conta a partir do dia seguinte à data de compra (ou do vencimento, se não houver data de compra). O resto da série fica "agendado".
- **Disponível** = limite − usado. O número não depende do mês escolhido na tela.
- A mesma função alimenta o Painel e o "Limite disponível" do modal de despesa.
- **Pagar a fatura** (total, parcial ou parcelado) marca as compras do mês como pagas e libera o limite. O restante e as parcelas da renegociação entram como linhas novas em aberto.

## O que conferi

21 situações com os serviços reais (`createExpense`, `getCardLimitsForOwners`, `payCardInvoice`, `listCardInvoices`) num Postgres descartável, cartão de R$ 3.000, fecha dia 25 e vence dia 5, hoje = 19/10/2026. O "esperado" é o modelo do banco: a compra bloqueia o limite quando entra na fatura, o parcelado bloqueia o total, a recorrente bloqueia cobrança a cobrança, e o pagamento da fatura libera.

**Batem com o banco (15 de 21; as principais):**

| Situação | Usado |
| --- | ---: |
| 2 compras na fatura aberta (R$ 180,00 + R$ 70,50) | 250,50 |
| + compra de fatura anterior ainda em aberto | 500,50 |
| Parcelado 6x de R$ 200: bloqueia o total | 1.200,00 |
| Pagando a fatura da 1ª parcela: libera só ela | 1.000,00 |
| Parcelado 10x de R$ 150 com 3 pagas na grade | 1.050,00 |
| Assinatura de R$ 55,90 cobrada dia 05: só a cobrança de 05/10 em 19/10 | 55,90 |
| Dia seguinte à cobrança de 05/11 | 111,80 |
| Cartão "ambos": crédito R$ 60 + débito R$ 100 | 60,00 |
| Pago, pago em branco e cancelada: só a em aberto conta | 100,00 |
| Pagamento parcial de R$ 600 sobre R$ 1.000 com R$ 30 de juros | 430,00 |
| Fatura parcelada em 3x com R$ 80 de juros | 1.080,00 |

**Divergem do banco (6):** achados B a G abaixo.

## Achados

**A. Fatura paga só no banco continua somando (dado, não é erro de conta).** O sistema só libera o limite quando alguém registra o pagamento da fatura. Compra de fatura antiga, ou cobrança de assinatura de meses passados, que o banco já recebeu e o sistema não, fica como "vencida em aberto" e soma no Usado. Exemplo testado: assinatura de R$ 100 de janeiro a outubro, nenhuma fatura registrada → Usado R$ 1.000. **É a causa mais provável dos R$ 2.741,12**, ainda não confirmada. A tela de "Despesas vencidas" do PR #2 não ajuda aqui, porque deixa de fora o crédito com cartão (que se paga pela fatura).

**B. Compra de outra pessoa no cartão do titular não entra na visão "só eu" (erro de regra). Corrigido.** O limite filtra `d.usuario_id = ANY(donos)` e, em "só eu", `donos = [titular]`. Titular com R$ 200 e membro com R$ 120 no mesmo cartão: Usado R$ 200 (banco: R$ 320). Em "Família" e no "Pagar fatura" dá R$ 320. Só afeta cartão usado por mais de uma pessoa (família, colaboradores). Correção: a soma deixou de filtrar o autor (`cardLimitService.ts`); o isolamento continua vindo do filtro dos cartões. Teste de banco novo em `cardLimit.db.test.ts` (`npm --prefix backend run test:finance-db`); com o filtro de volta, o teste falha.

**C. Recorrente antiga sem data de compra só conta depois do vencimento da fatura (dado).** Cobrada em 10/10, com fatura vencendo em 05/11: o banco bloqueia o limite em 10/10, o sistema só a partir de 06/11. A migration 0082 completou as séries cuja primeira ocorrência tinha a data de compra; as demais continuam sem. Subconta.

**D. Lançamento no cartão com forma de pagamento fora do padrão fica de fora (dado).** Em cartão `credito` só entra forma crédito ou vazia. `dinheiro` (padrão antigo da coluna), `recorrente`, `cartao` etc. ficam de fora. Subconta.

**E. Compra única ou parcelada com data de compra no futuro soma já (regra).** Só a recorrente espera a data. Passagem para 03/11 lançada hoje: soma R$ 300 hoje; o banco só em 03/11. Sobreconta.

**F. "Pagar fatura" lista a cobrança recorrente que ainda não ocorreu (regra decidida no plano `recorrente-ano-e-contagem`).** Com uma assinatura que cobra dia 22 e hoje dia 19, a fatura mostra R$ 355 e o Usado R$ 300. Só aparece se a fatura for paga antes de fechar.

**G. A cobrança recorrente conta a partir do dia seguinte (regra decidida em 07/10).** O banco bloqueia no dia. Sem ação.

**H. O que só o banco tem:** anuidade, IOF, juros, seguro e compras não lançadas. O sistema não vê.

## Dados a conferir (produção, só leitura)

Consulta por pessoa (e-mail), em transação somente leitura, com 7 seções: o Usado por cartão; a composição por fatura e tipo; as faturas vencidas em aberto (total e maiores grupos); lançamentos fora do Usado por forma de pagamento; recorrentes sem data de compra; compras de outras pessoas no cartão; compras com data futura.

- **A** se confirma se a seção 3 somar perto de R$ 2.741,12.
- **C** e **D** só precisam de correção se as seções 5 e 4 mostrarem linhas.
- **B** só importa se a seção 6 mostrar linhas.

## Proposta (em ordem)

1. **Mostrar de que é feito o "Usado"** (backend + frontend, sem mexer na regra): `/cartoes/limites` passa a devolver a composição por fatura (mês do vencimento) e por tipo (únicas, parcelas, recorrentes, renegociação) e o total vencido em aberto. O card abre os detalhes e destaca "vencidas em aberto: R$ X". Resolve a dúvida "de onde vem esse número" e deixa a conferência com o banco fatura a fatura.
2. **Quitar as faturas vencidas em lote** (backend + frontend), no padrão do "Despesas vencidas": lista as faturas vencidas e em aberto por cartão e mês e paga no total as marcadas. Reaproveita `payCardInvoice`; endpoint novo em lote. A **data do pagamento** aparece e é editável (padrão: o vencimento da fatura), porque desde o PR #3 a despesa paga conta no mês da data do pagamento, e uma data errada desloca o caixa daquele mês.
3. **Cartão compartilhado** (backend, achado B) — **feito**: o Usado soma toda compra do cartão, de qualquer autor. O cartão já é filtrado pelas permissões, então não abre acesso novo, e os detalhes de quem comprou continuam onde estavam.
4. **Dados antigos** (achados C e D), conforme a consulta: migration com confirmação para completar a data de compra e normalizar a forma de pagamento, ou ajuste da regra (por exemplo, sem data de compra, contar a partir do fechamento da fatura). Decide com os números na mão.
5. **Compra com data futura** (achado E), decisão do usuário: contar só a partir da data da compra, como a recorrente, ou manter.

## Decisões

1. Aprovar os itens 1 e 2? (o 3 está feito)
2. Item 2: a data padrão do pagamento é o vencimento da fatura?
3. Item 5: compra única ou parcelada com data futura passa a contar só na data?

## Verificação

- Teste de banco novo (mesmo molde de `cashRegime.db.test.ts`, só com `FINANCE_DB_TESTS=1` e em banco local) com os cenários acima, incluindo o cartão compartilhado, a composição e o pagamento em lote.
- Rodar a consulta de produção antes e depois da correção de dados.
- Conferir na tela de Movimentações o card com a composição.

## Riscos e ordem

- **Caixa:** quitar faturas antigas grava `data_pagamento`; com a regra de caixa, o valor sai do mês do vencimento e vai para o mês do pagamento. A data visível e editável evita surpresa.
- **Dados reais:** as correções dos itens 4 e 5 dependem do que a consulta mostrar. Nenhuma migration roda sem confirmação.
- Itens 1 e 3 são independentes do 2 e podem ir juntos num PR; o 2 pode ir em outro.
- **Efeito do item 3:** a soma do Usado deixa de filtrar por pessoa, que era o único filtro com índice (`usuario_id`). Não existe índice em `despesas.cartao_id`, então a consulta varre a tabela. O volume é pequeno hoje; se pesar, um índice parcial em `cartao_id` (`WHERE cartao_id IS NOT NULL`) resolve, em outra rodada e com migration confirmada.
- Fora do escopo: anuidade, IOF e juros que só existem no banco; integração com o banco.
