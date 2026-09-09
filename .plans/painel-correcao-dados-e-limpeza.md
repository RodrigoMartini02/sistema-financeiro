# Plano de Implementação: Correção de dados e limpeza do Painel Financeiro

## Origem

- Origem: varredura profunda pedida pelo usuário (banco → backend → API → painel),
  sem arquivo de especificação prévio
- Data do planejamento: `2026-09-09`
- Classificação: `frontend + backend + database`

Motivo da classificação: há bugs de exibição no frontend, rotas e schema
desalinhados no backend, e correções de índice e de dado no banco. As migrations
e scripts de dado ficam isolados na última fase, sob confirmação explícita.

## Resumo

Corrigir os achados da varredura do painel, agrupados por natureza e ordenados do
menor para o maior risco: primeiro o que só corrige o que a tela mostra, depois a
limpeza de código morto, o alinhamento do schema Drizzle ao banco real, e por
último o que escreve no banco.

O objetivo é entregar um painel com números corretos e sem resíduo, para servir de
base à reestruturação visual que o usuário fará em seguida.

## Descobertas da varredura que mudaram o escopo

### 1. Receita prevista — falso positivo

A varredura apontou que o painel poderia estar somando receita ainda não recebida,
já que soma `receitas.valor` sem distinguir. Investigando o fluxo, o sistema tem
quatro status e `'ativa'` significa **recebido**:

| Status | Rótulo na tela (`ReceitasScreen.tsx:32-41`) |
|---|---|
| `prevista` | Pendente |
| `faturada` | Faturado |
| `ativa` | **Recebido** |
| `cancelada` | — |

A rota de confirmação (`incomes.ts:256-262`) só promove para `'ativa'` quando o
dinheiro entra: `WHERE status IN ('prevista','faturada')` → `SET status = 'ativa'`.

Como o painel filtra `status = 'ativa'`, ele **já soma apenas receita recebida**.
A assimetria com despesas se explica: despesa pendente entra pelo `valor_original`
porque é compromisso assumido; receita prevista não entra porque ainda não é
dinheiro. Nada a corrigir — o achado sai como falso positivo.

### 2. `mes`/`ano` divergente — resíduo histórico, não produção contínua

O UPDATE de despesa já deriva mês/ano do vencimento (`expenses.ts:488`):

```ts
const { mes, ano } = getMonthYearFromIsoDate(data_vencimento as string);
```

Os 13 registros divergentes são resíduo de versões anteriores. É correção pontual
de dado, não mudança de fluxo.

### 3. `valor_pago` ausente — causa ainda ativa

A rota de pagamento aceita `valor_pago ?? null` (`expenses.ts:613`), então o
problema continua sendo produzido a cada pagamento sem valor informado.

## Decisões aplicadas

- **Decisão 1 — Receita prevista:** falso positivo, confirmado por investigação.
  Nenhuma alteração.
- **Decisão 2 — 13 registros divergentes:** corrigir, realinhando `mes`/`ano` à
  data real. Muda totais históricos em R$ 179,52 (ano de 2026).
- **Decisão 3 — 189 despesas sem `valor_pago`:** corrigir a rota **e** preencher o
  histórico com `valor_original`.

## Escopo

### Dentro do escopo

**Fase 1 — Exibição (frontend)**
- `Math.abs` no saldo do período → `formatCurrency`
- Comprometimento com cor por faixa
- Barra de receitas proporcional
- Cascata calculada sobre a lista completa de categorias

**Fase 2 — Limpeza**
- Remover `MetricCard.tsx` e `MonthSelector.tsx` (zero referências)
- Remover `fetchDashboardAnual` (sem consumidor)
- Remover rotas `/financial/selic` e `/financial/anual`
- Remover 3 classes CSS `.fingerence-how-*`
- Unificar a paleta duplicada entre `FinanceDashboard` e `memberColors`

**Fase 3 — Schema Drizzle (sem migration)**
- Declarar `status` em `despesas` e `receitas`
- Declarar `contrato_id` e `valor_comissao` em `receitas`

**Fase 4 — Backend (sem migration)**
- Rota de pagamento passa a gravar `valor_pago ?? valor_original`

**Fase 5 — Banco (confirmação explícita a cada passo)**
- Migration: índice de `status` em `despesas`
- Migration: índice para a expressão `(ano * 12 + mes)`
- Script: realinhar os 13 registros divergentes
- Script: preencher as 189 despesas sem `valor_pago`

### Fora do escopo

- Distinguir receita prevista de recebida (falso positivo)
- Reestruturação visual do painel — próxima etapa do usuário
- Gráficos novos
- Alteração do modelo de dados além das colunas já existentes

## Leitura de contexto

- `/AGENT.md` (raiz) — regras de banco, Drizzle, multi-tenant
- `/sistema financas/AGENT.md` — mesmas regras no escopo do projeto
- `/CLAUDE.md` — workflow obrigatório
- **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos
  dedicados; o `AGENT.md` da raiz cobre o repositório inteiro.

Código inspecionado:

- `src/screens/finance/FinanceDashboard.tsx` (837 linhas)
- `src/screens/finance/charts/*` (5 gráficos)
- `src/screens/finance/{MetricCard,MonthSelector,MonthCategoriesOverview}.tsx`
- `backend/src/routes/financial.ts` (endpoint `/panorama`)
- `backend/src/routes/expenses.ts`, `backend/src/routes/incomes.ts`
- `backend/src/db/schema/{expenses,incomes}.ts`
- `backend/drizzle/*.sql` (37 migrations)
- `src/styles/globals.css`
- Banco de desenvolvimento (`sistema_financas_dev`), via `information_schema`

## Impacto por área

### Frontend

`FinanceDashboard.tsx`:
- linha 325: `Math.abs(saldoFinal)` → `formatCurrency(saldoFinal)`
- linha 368: cor do comprometimento por faixa (≤70% verde, ≤100% âmbar, >100% vermelho)
- linha 397: barra de receitas proporcional a `healthBase`
- linhas 235-238: cascata sobre `data.porCategoria` completo, sem escala artificial
- linha 23: paleta importada de `memberColors`, não redeclarada

Remoções: `MetricCard.tsx`, `MonthSelector.tsx`, `fetchDashboardAnual` em
`financeService.ts`, 3 classes em `globals.css`.

Estados de loading/error/empty ficam como estão — já existem e funcionam.

### Backend

- `routes/financial.ts`: remover `GET /selic` e `GET /anual`
- `routes/expenses.ts`: rota de pagamento grava `valor_pago ?? valor_original`
- `db/schema/expenses.ts`: declarar `status`
- `db/schema/incomes.ts`: declarar `status`, `contrato_id`, `valor_comissao`

Nenhuma alteração em permissão, multi-tenant ou filtro de conta.

### Banco de dados

**Índices (migration nova):**
- `idx_despesas_status` — `despesas` é filtrada por `status` em toda query do
  painel e não tem índice; `receitas` já tem o equivalente
- índice para `(ano * 12 + mes)` — expressão usada no filtro de período, que os
  índices atuais não atendem

**Correções de dado (script, não migration):**
- 13 registros com `mes`/`ano` divergente da data
- 189 despesas pagas sem `valor_pago`

**Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção.**

O mesmo vale para os scripts de correção de dado, que escrevem em 202 linhas
reais.

### Infra/Deploy

`Sem impacto esperado.` Nenhuma env var, job ou build novo.

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MetricCard.tsx` *(remoção)*
- `src/screens/finance/MonthSelector.tsx` *(remoção)*
- `src/screens/finance/memberColors.ts`
- `src/services/financeService.ts`
- `src/styles/globals.css`
- `backend/src/routes/financial.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/db/schema/expenses.ts`
- `backend/src/db/schema/incomes.ts`
- `backend/drizzle/00XX_indices_painel.sql` *(novo, fase 5)*

## Estratégia de implementação

1. **Saldo com sinal** — trocar `Math.abs` por `formatCurrency`.
2. **Comprometimento por faixa** — cor derivada de `txComprometimento`.
3. **Barra de receitas proporcional** — mesma escala da barra de despesas.
4. **Cascata sobre lista completa** — usar `data.porCategoria`, remover `scale`.
5. **Remover código morto** — 2 componentes, 1 função de service, 2 rotas, 3 classes.
6. **Unificar paleta** — uma fonte só para as cores de gráfico.
7. **Alinhar schema Drizzle** — declarar as 4 colunas ausentes.
8. **Rota de pagamento** — gravar `valor_pago ?? valor_original`.
9. **PARAR e confirmar** antes de qualquer passo de banco.
10. **Migration de índices** — só após confirmação.
11. **Script dos 13 registros** — só após confirmação, com listagem prévia.
12. **Script das 189 despesas** — só após confirmação, com contagem prévia.

## Regras de negócio identificadas

- `receitas.status = 'ativa'` significa recebido; `prevista` e `faturada` não
  entram no total do painel — e é correto que não entrem
- Despesa pendente entra pelo `valor_original`: é compromisso assumido
- Despesa paga entra pelo `valor_pago`, com `valor_original` como fallback
- `mes`/`ano` sempre derivam da data de vencimento (despesa) ou recebimento (receita)
- Comprometimento acima de 100% significa que a renda não cobre as despesas

## Regras multi-tenant e segurança

- Nenhuma query nova; as existentes já filtram por `usuario_id` e `conta_id`
- Conta pessoal enxerga registros com `conta_id` nulo — comportamento preservado
- Os scripts de correção devem rodar sobre todos os usuários, sem escopo de conta:
  são correções estruturais de dado, não de negócio
- Remover `/financial/selic` e `/financial/anual` não afeta autorização: ambas
  já exigiam autenticação e nenhuma tela as consome

## Validações necessárias

- `saldoFinal` negativo deve renderizar com o sinal
- `txComprometimento` acima de 100 deve renderizar em vermelho
- Cascata: soma das categorias deve bater com o total de despesas sem escala
- Script dos 13: só altera onde `mes`/`ano` diverge da data, nunca o contrário
- Script das 189: só altera `pago = true AND valor_pago IS NULL`

## Testes necessários

### Backend

- rota de pagamento sem `valor_pago` no corpo grava `valor_original`
- rota de pagamento com `valor_pago` explícito preserva o valor informado
- schema Drizzle declara as mesmas colunas que o banco (comparação com
  `information_schema`)

### Frontend

Não há teste de UI no projeto. Verificação manual:
- saldo negativo com sinal
- comprometimento acima de 100% em vermelho
- cascata com valores reais por categoria

### E2E

- abrir o painel em período com déficit e conferir o saldo
- abrir em período com mais de 8 categorias e conferir a cascata

## Comandos de validação sugeridos

```bash
npm --prefix backend run test
npm --prefix backend run build
npm run build
```

## Riscos e pontos de atenção

- **Fase 5 escreve em 202 linhas de dados reais.** Nada roda sem confirmação
  explícita, passo a passo.
- **Totais históricos mudam:** R$ 179,52 no ano de 2026. Relatórios já emitidos
  deixam de bater com o painel.
- **Preencher `valor_pago` com `valor_original` assume que não houve juros nem
  desconto nessas 189 despesas.** É o que o `COALESCE` já presume na leitura, mas
  passa a ficar gravado — e deixa de ser distinguível depois.
- **Remover `/financial/anual` é irreversível sem o histórico.** Confirmei zero
  consumidores no repositório, mas não é possível descartar integração externa.
- O `.env` pode apontar para produção: conferir o alvo antes de qualquer script.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Saldo negativo aparece com o sinal, igual ao card "Saldo anterior"
- Comprometimento acima de 100% aparece em vermelho, coerente com a barra
- Barra de receitas é proporcional, não decorativa
- Cascata mostra o gasto real de cada categoria, e "Outras N" conta o total real
- Nenhum componente, função, rota ou classe CSS órfã no escopo revisado
- Schema Drizzle declara todas as colunas que o banco tem
- Rota de pagamento grava `valor_pago` em toda quitação
- Fases 1 a 4 não tocam o banco
- `npm --prefix backend run test`, `npm --prefix backend run build` e
  `npm run build` verdes

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Parar antes da Fase 5 e pedir confirmação explícita**, item por item.
- Não executar migrations nem scripts de dado sem confirmação.
- Antes de qualquer script, conferir para qual banco o `.env` aponta.
- Seguir `/AGENT.md` da raiz (não existem AGENT.md de frontend/backend).
- Usar a API do Drizzle em query nova; as queries do painel são SQL raw
  existente e não precisam ser reescritas.
- Manter as fases separadas em commits distintos: exibição, limpeza, schema,
  backend e banco resolvem problemas diferentes.
