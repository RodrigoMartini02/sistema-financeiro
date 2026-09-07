# Plano de Implementação: Corrigir valores nulos nas despesas

## Origem

- Descoberto durante validação visual da tabela de despesas readequada (plano `.plans/readequacao-tabela-despesas.md`)
- Sintoma relatado pelo usuário: card de limite do Mercado-Pago congelado em R$ 21,00 e barras em 0%, apesar de haver parcelas em aberto
- Data do planejamento: `2026-09-07`
- Classificação: `correção de dados + backend` (sem migration, sem frontend)

## Resumo

Preencher `valor_final` e `valor_original` a partir de `valor` nos registros históricos de despesas, eliminando a causa de somas subestimadas em todo o sistema. Complementarmente, incluir `valor` no fallback das 34 queries que hoje o omitem, como defesa contra o problema reaparecer em consultas futuras.

Este bug é **pré-existente** e não tem relação com a readequação visual da tabela — foi apenas revelado por ela, porque o card de limite ficou visualmente ao lado da tabela que mostra os valores corretos.

## Classificação e motivo

`correção de dados + backend`.

Nenhuma migration: nenhuma coluna é criada, alterada ou removida. O trabalho é um `UPDATE` de dados históricos mais o ajuste de expressões `COALESCE` em queries existentes. O frontend não é tocado — ele **já** trata as três colunas como equivalentes.

## Diagnóstico

### A causa

Das 549 despesas em produção, **540 têm `valor_final` nulo** e **286 têm `valor_original` nulo**. A coluna `valor` é a única sempre preenchida (549/549).

Queries que somam `COALESCE(valor_final, valor_original)` sem incluir `valor` perdem quase todos os registros.

### O padrão é temporal

| Colunas preenchidas | Registros | Período de criação |
|---|---|---|
| Só `valor` | 286 | jan–mar/2026 |
| `valor` + `valor_original` | 254 | jan–abr/2026 |
| Todas as três | 9 | jul–set/2026 |

### O código atual já está correto

[expenses.ts:417](../backend/src/routes/expenses.ts#L417) preenche `valor_final` com `valorFinalCalculado`, que nunca é nulo — `valor_original` é obrigatório na validação ([expenses.ts:361](../backend/src/routes/expenses.ts#L361)). As 9 despesas de julho em diante provam que o INSERT atual funciona.

**O problema é dado histórico**, de antes dessa correção. Não há bug ativo gravando nulos.

### Evidências de que copiar `valor` é seguro

Verificado em produção antes de propor:

- **Zero divergências**: onde `valor_final` existe, é igual a `valor`. Idem para `valor_original`
- **`valor` nunca é nulo, zero ou negativo** nas 549 despesas
- **Em parceladas, `valor` já guarda o valor da parcela**, não o total da compra. Exemplo: EMPRÉSTIMO 2x com `valor = 390.27` em cada uma das duas linhas. Não há risco de multiplicar totais
- **O frontend já trata as três como equivalentes**: [financeService.ts:70](../src/services/financeService.ts#L70) faz `valor_final ?? valor_original ?? valor`, com o comentário "sempre o valor daquela parcela/período"

## Impacto medido em produção

| Escopo | Cálculo atual | Correto | Faltando |
|---|---|---|---|
| **Total geral (ativas)** | R$ 48.869,48 | R$ 148.088,79 | **R$ 99.219,31** |

Por mês, meses inteiros somam nulo:

| Mês/2026 | Mostrado hoje | Real |
|---|---|---|
| Abril | R$ 5.237,78 | R$ 9.600,88 |
| Maio | *(nulo)* | R$ 2.958,88 |
| Junho | R$ 21,00 | R$ 2.243,21 |
| Julho | *(nulo)* | R$ 2.222,21 |
| Agosto | *(nulo)* | R$ 2.125,31 |
| Setembro | *(nulo)* | R$ 541,87 |
| Outubro | *(nulo)* | R$ 437,59 |

### Caso relatado pelo usuário

Cartão Mercado-Pago (id 6, limite R$ 11.200,00):

| | |
|---|---|
| Mostrado | R$ 21,00 |
| Real | **R$ 3.372,37** |
| Despesas em aberto | 28 — apenas 1 entrava na soma |
| Barra | 0% → deveria ser ~30% |

O cartão "Vale" em R$ 0,00 está **correto**: suas 5 despesas estão pagas.

## Escopo

### Dentro do escopo

- `UPDATE` preenchendo `valor_final` a partir de `valor` onde nulo (540 registros)
- `UPDATE` preenchendo `valor_original` a partir de `valor` onde nulo (286 registros)
- Incluir `valor` no fallback das queries que o omitem (34 ocorrências em 5 arquivos)
- Validar que o card de limite passa a exibir o valor real

### Fora do escopo

- Qualquer alteração de schema ou migration
- Alterar o INSERT de despesas — já está correto
- Alterar o frontend — já trata as três colunas como equivalentes
- Revisar a lógica de cálculo de `valorFinal` (juros, descontos, divisão de parcelas)
- Deduplicar as três colunas de valor no schema — é dívida técnica real, mas exige análise própria e tocaria muito mais código
- Corrigir queries de receitas, que não foram auditadas neste levantamento

## Leitura de contexto

- `CLAUDE.md` (raiz e projeto) — fluxo obrigatório e regra de nunca executar escrita em banco sem confirmação
- `AGENT.md` — apenas as partes genéricas; a seção multi-tenant não corresponde a este projeto
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- Arquivos inspecionados: `backend/src/services/cardLimitService.ts`, `backend/src/routes/expenses.ts`, `backend/src/routes/financial.ts`, `backend/src/routes/categories.ts`, `backend/src/routes/reserves.ts`, `backend/src/routes/accountMembers.ts`, `backend/src/routes/months.ts`, `src/services/financeService.ts`, `src/services/cardLimitsService.ts`

## Impacto por área

### Frontend

`Sem impacto esperado.` [financeService.ts:70](../src/services/financeService.ts#L70) já inclui `valor` no fallback — é por isso que a tabela de despesas mostra os valores corretos enquanto os totais e o card de limite não.

### Backend

Incluir `valor` como último termo do `COALESCE` nos pontos abaixo:

| Arquivo | Ocorrências | O que afeta |
|---|---|---|
| `routes/financial.ts` | **30** | Relatórios, gráficos, painel financeiro |
| `services/cardLimitService.ts` | 1 | Card de limite de cartão |
| `routes/categories.ts` | 1 | Totais por categoria |
| `routes/reserves.ts` | 1 | Reservas |
| `routes/accountMembers.ts` | 1 | Totais por membro da família |

**Já corretos, não tocar:** `routes/months.ts` (4 ocorrências já com `valor`).

Nenhuma alteração de rota, permissão, validação ou contrato de API. Apenas a expressão de soma.

### Banco de dados

**Sem alteração de schema. Nenhuma migration.**

Duas correções de dados:

| O quê | Registros |
|---|---|
| `valor_final = valor` onde `valor_final IS NULL` | 540 |
| `valor_original = valor` onde `valor_original IS NULL` | 286 |

Cuidados obrigatórios:

- Executar em transação com `ON_ERROR_STOP=1`
- Criar tabela de backup com os valores originais antes dos `UPDATE`
- `WHERE` restrito a linhas **nulas** — nunca sobrescrever valor existente
- Conferir dentro da transação antes do `COMMIT`
- Nenhum `UPDATE` sem `WHERE`

**Atenção: nenhuma escrita em banco deve ser executada sem confirmação explícita do usuário, pois o ambiente aponta para produção.**

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

**Backend:**

- `backend/src/routes/financial.ts`
- `backend/src/services/cardLimitService.ts`
- `backend/src/routes/categories.ts`
- `backend/src/routes/reserves.ts`
- `backend/src/routes/accountMembers.ts`

**Frontend:** nenhum.

**Banco:** sem migration; dois `UPDATE` de correção.

## Estratégia de implementação

**Etapa 1 — Correção de dados**

1. Rodar primeiro no banco **local** (`sistema_financas_dev`), que tem a mesma massa, e conferir o resultado
2. Conferência prévia em produção: contagem de afetados e ausência de casos-limite
3. Em transação:
   ```sql
   BEGIN;
   CREATE TABLE backup_valores_<data> AS
     SELECT id, valor, valor_original, valor_final FROM despesas
      WHERE valor_final IS NULL OR valor_original IS NULL;
   UPDATE despesas SET valor_final = valor WHERE valor_final IS NULL;
   UPDATE despesas SET valor_original = valor WHERE valor_original IS NULL;
   -- conferências antes do COMMIT
   COMMIT;
   ```
4. Validar: soma total deve ir de R$ 48.869,48 para R$ 148.088,79

**Etapa 2 — Defesa nas queries**

5. `cardLimitService.ts` — o caso que originou o relato
6. `categories.ts`, `reserves.ts`, `accountMembers.ts` — uma ocorrência cada
7. `financial.ts` — 30 ocorrências; conferir uma a uma, pois há variações com `valor_pago`

**Etapa 3 — Validação**

8. `npx vite build` e `npm run build` no backend
9. Conferir na tela: limite do Mercado-Pago em ~R$ 3.372,37 e barra em ~30%
10. Conferir totais mensais de maio a agosto, hoje nulos

## Regras de negócio identificadas

- `valor` é a fonte confiável: sempre preenchida, sem divergir das demais onde coexistem
- Em despesa parcelada, todas as três colunas guardam o valor **da parcela**, não o total da compra
- `valor_final` é derivado de `valor_original` pelo backend (juros, descontos, divisão de parcelas); onde ambos existem hoje, são iguais
- O limite de cartão soma despesas **não pagas** de qualquer mês — parceladas ocupam o limite desde a compra e liberam conforme cada parcela é paga, como uma fatura real
- Cartão com `tipo` nulo conta como crédito

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar.

- Nenhuma regra de visibilidade, permissão ou autorização é alterada
- `cardLimitService.ts` usa `resolveVisibleCardOwnerIds` (carteira compartilhada da família) — o filtro permanece intocado; muda apenas a expressão de soma
- Os `UPDATE` são restritos por `WHERE` a linhas com valor nulo

## Validações necessárias

- `valor` não pode ser nulo, zero ou negativo em nenhuma linha afetada (verificado: 0 casos)
- Após o `UPDATE`, nenhuma despesa pode ter `valor_final` ou `valor_original` nulos
- O total de despesas deve permanecer 549 — nenhuma linha criada ou removida
- Nenhuma linha com valor previamente preenchido pode ser alterada

## Testes necessários

### Backend

- Conferir que o card de limite retorna ~R$ 3.372,37 para o cartão 6
- Conferir que "Vale" segue em R$ 0,00 (despesas pagas)
- Conferir totais por categoria, reservas e totais por membro após a correção

### Frontend

- Verificar via `/run` o card de limite com barra proporcional
- Verificar os totais mensais de maio a agosto, hoje nulos
- Verificar que a tabela de despesas continua correta (já estava)

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
```

Validação funcional via `/run`, com o backend apontando para o banco local (`npm run dev` já usa `.env.dev`).

## Riscos e pontos de atenção

| Risco | Gravidade | Mitigação |
|---|---|---|
| `valor` ter semântica diferente em algum caso | Baixa | Verificado: zero divergências; parceladas guardam o valor da parcela |
| Sobrescrever valor editado pelo usuário | Baixa | `WHERE` restrito a linhas nulas |
| Erro em massa em produção | Média | Transação, backup, conferência antes do commit, teste prévio no local |
| Alguma das 30 ocorrências em `financial.ts` ter variação não prevista | Média | Conferir uma a uma; há formas com `valor_pago` no fallback |
| Receitas terem o mesmo problema | **Não avaliado** | Fora do escopo; auditar depois |

## Perguntas em aberto

- As **receitas** têm o mesmo padrão de colunas nulas? Não foi auditado — se tiverem, o mesmo tratamento se aplica
- Vale, em outra entrega, consolidar as três colunas de valor em uma só? É dívida técnica real, mas de escopo bem maior
- A tabela `backup_correcao_20260907` (da limpeza de descrições) segue em produção — apagar junto quando ambas as correções estiverem confirmadas?

## Critérios de aceite do plano

- Nenhuma despesa em produção com `valor_final` ou `valor_original` nulos
- Total de despesas permanece 549
- Nenhuma linha previamente preenchida foi alterada
- Card de limite do Mercado-Pago exibe ~R$ 3.372,37 com barra em ~30%
- Totais mensais de maio a agosto deixam de ser nulos
- As 34 ocorrências de `COALESCE` sem `valor` passam a incluí-lo
- `npx vite build` e o build do backend concluem sem erros novos
- O erro de tipo pré-existente em `DespesasScreen.tsx:814` continua sendo o único do `tsc`

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- **Rodar primeiro no banco local**, conferir, e só então propor produção
- **Não executar nenhum `UPDATE` em produção sem confirmação explícita do usuário no momento**
- Corrigir os dados antes do código: a Etapa 1 sozinha já resolve o sintoma; a Etapa 2 é defesa
- Em `financial.ts`, conferir cada uma das 30 ocorrências — há variações com `valor_pago` no fallback que devem ser preservadas
- Não tocar `months.ts`, que já está correto
- Não alterar `.env`, permissões ou a lógica da carteira compartilhada
- Manter as alterações focadas: sem refactor oportunista
