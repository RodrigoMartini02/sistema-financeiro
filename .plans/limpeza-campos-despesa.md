# Plano de Implementação: Limpeza dos campos de despesa

## Origem

- Solicitação do usuário: analisar colunas, rotas e API do cadastro de despesas, incluindo as ações da coluna Ações e o pagamento em lote, para manter apenas o que é usado — o módulo acumulou vários remendos
- Descoberto durante a correção dos valores nulos (`.plans/corrigir-valores-nulos-despesas.md`), que tratou o sintoma; este plano ataca a causa estrutural
- Data do planejamento: `2026-09-07`
- Classificação: `frontend + backend + database` (com migration destrutiva)

## Resumo

Remover o acúmulo de remendos no cadastro de despesas, deixando apenas os dois valores que o modal realmente oferece: **Valor da compra** (`valor_original`) e **Valor pago** (`valor_pago`).

Saem duas colunas que nenhum código lê, duas colunas de valor que são cópias uma da outra, uma coluna cuja interface nunca existiu, e um parâmetro de rota que nenhuma tela envia.

## Classificação e motivo

`frontend + backend + database`.

Banco: cinco colunas removidas por migration destrutiva. Backend: ~40 queries ajustadas e um parâmetro removido. Frontend: bloco OPEX/CAPEX do painel, campos do tipo `ExpenseFormValues` e o payload do assistente.

## Diagnóstico

Levantamento feito por leitura direta do schema em produção, das rotas e dos quatro caminhos de gravação.

### Grupo A — Colunas mortas

| Coluna | Registros preenchidos | Referências no código |
|---|---|---|
| `valor_total_com_juros` | 194 | **zero** em todo o repositório |
| `numero` | 422 | **zero** — as ocorrências de `numero` são da tabela `contratos` |

Nem o schema Drizzle ([backend/src/db/schema/expenses.ts](../backend/src/db/schema/expenses.ts)) as mapeia. São resíduo de código que não existe mais.

### Grupo B — Parâmetro inacessível

`settle_future` em `POST /:id/pay` ([expenses.ts:606](../backend/src/routes/expenses.ts#L606)) implementa "quitar todas as parcelas futuras" gravando `valor_pago = 0`. **Nenhuma tela envia esse parâmetro** — verificado em todo o `src/`. É código executável e inalcançável.

### Grupo C — Redundância de valor

Três colunas para um único dado:

| Coluna | Como é preenchida |
|---|---|
| `valor_original` | O que o usuário digita no modal |
| `valor_final` | Cópia de `valor_original` |
| `valor` | Cópia de `valor_final` — mesma variável, mesma query |

Confirmado nos **quatro** caminhos de gravação:

1. **Modal** — o schema do formulário ([ExpenseForm.tsx:29-30](../src/screens/finance/ExpenseForm.tsx#L29-L30)) tem apenas `valor_original` e `valor_pago`. `valor_final` não existe no form e nunca é montado no submit ([toFormValues:461-463](../src/screens/finance/ExpenseForm.tsx#L461-L463)), então `values.valor_final` é sempre `undefined` e o fallback em [financeService.ts:165](../src/services/financeService.ts#L165) sempre cai em `valorOriginal`
2. **Assistente financeiro** — [FinancialAssistant.tsx:560-561](../src/components/financial-assistant/FinancialAssistant.tsx#L560-L561) envia `valor_final: draft.amount`, mas com o **mesmo número** de `valor_original`. Redundância, não divergência
3. **Pagamento individual** — `POST /:id/pay` ([expenses.ts:611](../backend/src/routes/expenses.ts#L611)) atualiza apenas `pago`, `data_pagamento` e `valor_pago`. **Não toca `valor_final`**
4. **Pagamento em lote** — [BatchPaymentModal.tsx:55](../src/screens/finance/BatchPaymentModal.tsx#L55) chama a mesma rota `/pay`, comportamento idêntico

O backend não calcula `valor_final`: apenas escolhe entre o recebido e `valor_original` ([expenses.ts:388](../backend/src/routes/expenses.ts#L388)). Como o frontend nunca envia, é sempre cópia.

A coluna `valor` de despesas é lida **apenas** nos `COALESCE` corrigidos hoje e no `SELECT d.*`.

`valorFinalTotal` no frontend ([ExpenseForm.tsx:351](../src/screens/finance/ExpenseForm.tsx#L351)) só serve para comparar se o valor pago difere — não guarda nada exclusivo.

### Grupo D — Campo sem interface

`tipo_despesa` (OPEX/CAPEX): classificação contábil de empresa — OPEX é despesa de operação, CAPEX é investimento em bem durável. É conceito distinto de categoria (que diz *no que* se gastou).

Os 549 registros estão preenchidos, **todos com `'opex'`**, porque o formulário grava o valor fixo ([ExpenseForm.tsx:477](../src/screens/finance/ExpenseForm.tsx#L477)). Nenhuma tela permite escolher.

O painel financeiro **exibe** esses totais ([FinanceDashboard.tsx:440-452](../src/screens/finance/FinanceDashboard.tsx#L440-L452)), mostrando "OPEX R$ X" para 100% das despesas — um rótulo contábil que não distingue nada.

### Rotas — todas conferidas

| Rota | Situação |
|---|---|
| `GET /` · `GET /categories` · `GET /suggestions` | OK |
| `POST /` · `PUT /:id` · `DELETE /:id` | OK |
| `PUT /:id/cancelar` · `POST /:id/pay` · `POST /:id/mover` | OK (exceto `settle_future`) |
| `GET /parcelas-futuras` | OK |

### Ações da tabela — todas conferidas

| Ação | Rota | Toca `valor_final`? |
|---|---|---|
| Editar | `PUT /:id` | Grava cópia de `valor_original` |
| Marcar como pago | `POST /:id/pay` | **Não** |
| Mover mês | `POST /:id/mover` | Não |
| Cancelar | `PUT /:id/cancelar` | Não — só `status` |
| Excluir | `DELETE /:id` | — |

## Decisões aplicadas

- **Decisão 1 (alcance):** Grupos A + B + C + D — limpeza completa
- **Decisão 2 (coluna sobrevivente):** manter `valor_original` + `valor_pago`, removendo `valor` e `valor_final`. É o par que o modal oferece
- **Decisão 3 (execução):** tudo de uma vez, precedido de tabela de backup completa

## Escopo

### Dentro do escopo

- Remover as colunas `valor`, `valor_final`, `valor_total_com_juros`, `numero`, `tipo_despesa`
- Preencher `valor_original` onde estiver nulo, **antes** da remoção
- Ajustar ~40 queries para usar `valor_original` em vez do `COALESCE` de três termos
- Remover o parâmetro `settle_future` da rota `POST /:id/pay`
- Remover o bloco OPEX/CAPEX do painel financeiro
- Remover `tipo_despesa` e `valor_final` dos tipos, schema Drizzle e payloads
- Remover `valor_final` do payload do assistente financeiro
- Backup em tabela antes de qualquer remoção

### Fora do escopo

- **Receitas** — não auditadas; podem ter o mesmo padrão de colunas redundantes. Merece levantamento próprio
- Alterar a lógica de parcelamento, recorrência ou pagamento
- Alterar regras de permissão, visibilidade ou a carteira compartilhada da família
- Reescrever o modal de despesa
- Criar interface para OPEX/CAPEX — a decisão foi remover, não completar
- Remover as tabelas de backup criadas hoje (`backup_correcao_20260907`, `backup_valores_20260907`)

## Leitura de contexto

- `CLAUDE.md` (raiz e projeto) — fluxo obrigatório; nunca executar migration sem confirmação explícita
- `AGENT.md` — apenas as partes genéricas; a seção multi-tenant não corresponde a este projeto
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- Arquivos inspecionados: `backend/src/routes/expenses.ts`, `backend/src/routes/financial.ts`, `backend/src/db/schema/expenses.ts`, `backend/src/services/cardLimitService.ts`, `src/screens/finance/ExpenseForm.tsx`, `src/screens/finance/FinanceDashboard.tsx`, `src/screens/finance/BatchPaymentModal.tsx`, `src/components/financial-assistant/FinancialAssistant.tsx`, `src/services/financeService.ts`, `src/types/finance.ts`, `src/types/config.ts`
- Schema real de `despesas` lido diretamente de produção (31 colunas)

## Impacto por área

### Frontend

- **Painel financeiro** ([FinanceDashboard.tsx:440-452](../src/screens/finance/FinanceDashboard.tsx#L440-L452)): remover o bloco OPEX/CAPEX/"Sem class."
- **Assistente financeiro** ([FinancialAssistant.tsx:561](../src/components/financial-assistant/FinancialAssistant.tsx#L561)): remover `valor_final` do payload
- **Formulário** ([ExpenseForm.tsx:477](../src/screens/finance/ExpenseForm.tsx#L477)): remover `tipo_despesa: 'opex'` fixo
- **Tipos** (`src/types/finance.ts`, `src/types/config.ts`): remover `valor_final`, `tipoDespesa`, `tipo_despesa`, `opex`, `capex`. Avaliar `valorFinalTotal`, que passa a derivar de `valor_original`
- **Service** ([financeService.ts](../src/services/financeService.ts)): simplificar o mapeamento de valores e o payload
- **Demo** (`src/services/demo/`): ajustar o banco falso e o resolver para o novo formato

Sem mudança em query keys, hooks, estados de loading/error/empty ou acessibilidade.

### Backend

- **`financial.ts`**: ~32 ocorrências do `COALESCE` de valores; remover os agregados `opex` e `capex` e o campo correspondente na resposta
- **`expenses.ts`**: INSERT, UPDATE, `SELECT` de sugestões e projeção de parcelas futuras; remover `settle_future` e `tipo_despesa`
- **`cardLimitService.ts`**, **`categories.ts`**, **`reserves.ts`**, **`accountMembers.ts`**, **`months.ts`**: simplificar o `COALESCE`
- **Schema Drizzle** (`backend/src/db/schema/expenses.ts`): remover `finalAmount` e `tipoDespesa`

Nenhuma alteração de permissão, autorização ou regra de visibilidade. O filtro por `usuario_id` e o `resolveVisibleUserIds` permanecem intocados.

### Banco de dados

**Migration destrutiva.** Cinco colunas removidas de `despesas`:

`valor` · `valor_final` · `valor_total_com_juros` · `numero` · `tipo_despesa`

Precedida obrigatoriamente de:

1. Tabela de backup com todas as colunas afetadas
2. `UPDATE` preenchendo `valor_original` onde nulo (286 registros em produção), a partir de `valor` — **sem isso o dado se perde no `DROP`**

Atenção: `valor` é `NOT NULL` e está preenchida nas 549 despesas; `valor_original` é nula em 286. A ordem importa.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente pode estar apontando para produção.**

### Infra/Deploy

`Sem impacto esperado.` Nenhuma env var, job ou worker afetado. A ordem de deploy importa: código antes da migration.

## Arquivos provavelmente afetados

**Frontend:**

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/ExpenseForm.tsx`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/services/financeService.ts`
- `src/services/demo/fakeApiResolver.ts`, `src/services/demo/demoFakeDatabase.ts`
- `src/types/finance.ts`, `src/types/config.ts`

**Backend:**

- `backend/src/routes/expenses.ts`
- `backend/src/routes/financial.ts`
- `backend/src/routes/categories.ts`
- `backend/src/routes/reserves.ts`
- `backend/src/routes/accountMembers.ts`
- `backend/src/routes/months.ts`
- `backend/src/services/cardLimitService.ts`
- `backend/src/db/schema/expenses.ts`

**Banco:** nova migration em `backend/drizzle/`.

## Estratégia de implementação

**Etapa 1 — Backup**

1. Criar a tabela de backup, no local e em produção:
   ```sql
   CREATE TABLE backup_colunas_despesas_20260907 AS
     SELECT id, valor, valor_final, valor_total_com_juros, numero, tipo_despesa
       FROM despesas;
   ```

**Etapa 2 — Preservar o dado antes de remover**

2. `UPDATE despesas SET valor_original = valor WHERE valor_original IS NULL;`
3. Conferir: nenhuma despesa com `valor_original` nulo; total permanece 549

**Etapa 3 — Código: backend**

4. Substituir o `COALESCE` de valores por `valor_original` nos 6 arquivos
5. Remover `settle_future` da rota `/pay`
6. Remover `tipo_despesa` do INSERT, UPDATE e validações
7. Remover os agregados `opex`/`capex` de `financial.ts`
8. Atualizar o schema Drizzle

**Etapa 4 — Código: frontend**

9. Remover o bloco OPEX/CAPEX do painel
10. Remover `valor_final` do payload do assistente
11. Remover `tipo_despesa: 'opex'` do formulário
12. Limpar tipos e o service; ajustar `valorFinalTotal`
13. Ajustar o banco falso da demo

**Etapa 5 — Validação de código**

14. `npx vite build` e `npm run build` no backend
15. Auditoria por grep: nenhuma referência remanescente às colunas removidas
16. Testar no ambiente local: cadastro, edição, pagamento individual, pagamento em lote, cancelamento, card de limite

**Etapa 6 — Migration**

17. Rodar no **local** primeiro e validar
18. Com confirmação explícita, rodar em produção logo após o deploy do código

## Regras de negócio identificadas

- O cadastro de despesa opera com **dois valores**: o da compra (`valor_original`) e o efetivamente pago (`valor_pago`), este último apenas quando difere por juros ou desconto
- Em despesa parcelada, o valor gravado em cada linha é o **da parcela**, não o total da compra
- O rótulo do campo de valor muda conforme o tipo: "Valor da compra", "Valor da parcela", "Valor mensal" — mas é sempre o mesmo campo
- O limite de cartão soma despesas não pagas de qualquer mês; parceladas ocupam o limite desde a compra
- Cancelar mantém o registro no histórico e o tira dos cálculos; excluir remove de vez

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Verificado: nenhuma ocorrência de `tenant`/`prefeitura` em `backend/src/`.

- Nenhuma regra de visibilidade ou permissão é alterada
- Os filtros por `usuario_id`, `resolveVisibleUserIds` e `resolveVisibleCardOwnerIds` permanecem intocados
- Os `UPDATE` da Etapa 2 são restritos por `WHERE` a linhas nulas
- O backup precede qualquer operação destrutiva

## Validações necessárias

- Após a Etapa 2, nenhuma despesa pode ter `valor_original` nulo
- O total de despesas deve permanecer 549 em todas as etapas
- Nenhuma linha com `valor_original` já preenchido pode ser alterada
- Após a Etapa 5, nenhuma referência às colunas removidas deve restar no código
- O `SELECT d.*` deixa de retornar as colunas removidas — conferir se algum consumidor as espera

## Testes necessários

### Frontend

- Cadastrar despesa avulsa, parcelada e recorrente
- Editar despesa existente, conferindo que o valor carrega corretamente
- Marcar como pago com valor igual e com valor diferente (juros/desconto)
- Pagamento em lote
- Cancelar e excluir
- Card de limite de cartão com o valor correto
- Painel financeiro sem o bloco OPEX/CAPEX
- Assistente financeiro criando despesa
- Modo demo

### Backend

- Criar parcelada e conferir que as parcelas recebem o valor da parcela
- Conferir que a listagem retorna os valores corretos
- Conferir que os totais mensais batem com o esperado

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
```

Validação funcional via `/run`, com o backend apontando para o banco local (`npm run dev` usa `.env.dev`).

## Riscos e pontos de atenção

| Risco | Gravidade | Mitigação |
|---|---|---|
| **`DROP COLUMN` é irreversível** | **Alta** | Backup completo na Etapa 1; Etapa 2 preserva o dado em `valor_original` |
| Perder os 286 valores que só existem em `valor` | **Alta** | A Etapa 2 é obrigatória e precede o `DROP` |
| Query esquecida quebrar após a remoção | Média | Auditoria por grep + builds antes da migration |
| Janela entre deploy e migration | Média | Código primeiro; a migration logo após |
| `SELECT d.*` ter consumidor esperando as colunas | Média | Conferir na Etapa 5 |
| Modo demo divergir do formato real | Baixa | Ajustado na Etapa 4 |
| Receitas terem o mesmo problema | **Não avaliado** | Fora do escopo; auditar depois |

## Perguntas em aberto

- As **receitas** têm o mesmo padrão de colunas redundantes? Não foi auditado
- Existe algum relatório, export ou PDF que consuma `tipo_despesa` fora do painel? A busca não encontrou, mas vale conferir na implementação
- As tabelas de backup acumuladas (`backup_correcao_20260907`, `backup_valores_20260907`, e a nova) devem ser removidas depois de um período de confiança?

## Critérios de aceite do plano

- As cinco colunas foram removidas de `despesas` em produção
- Nenhuma despesa tem `valor_original` nulo
- O total permanece 549, sem linha criada ou perdida
- A tabela de backup existe e contém as 549 linhas com os valores originais
- Nenhuma referência às colunas removidas resta no código
- O parâmetro `settle_future` não existe mais na rota `/pay`
- O painel financeiro não exibe mais OPEX/CAPEX
- Cadastro, edição, pagamento individual, pagamento em lote, cancelamento e exclusão funcionam
- O card de limite exibe o valor correto
- `npx vite build` e o build do backend concluem sem erros novos
- O erro de tipo pré-existente em `DespesasScreen.tsx:814` continua sendo o único do `tsc`

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- **A Etapa 2 é obrigatória e não pode ser pulada**: sem ela, o `DROP` apaga os 286 valores que só existem em `valor`
- **Rodar tudo no banco local primeiro**, validar, e só então propor produção
- **Não executar a migration nem os `UPDATE` em produção sem confirmação explícita do usuário no momento**
- Ordem obrigatória: backup → preservar dado → código → validar → migration
- Não tocar em regras de permissão, visibilidade ou na carteira compartilhada
- Não alterar `.env`
- Manter as alterações focadas: sem refactor oportunista
- O erro de tipo em `DespesasScreen.tsx:814` é pré-existente — reportar, não confundir com regressão
