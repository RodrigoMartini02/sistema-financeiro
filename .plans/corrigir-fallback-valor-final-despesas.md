# Plano de Implementação: Corrigir fallback de valor_final em despesas legadas

## Origem

- Reportado pelo usuário via prints do Painel: card "Despesas", gráfico anual e "Parcelas futuras" mostrando R$ 0,00 apesar de haver despesas cadastradas com valores reais
- Data do planejamento: 2026-07-12
- Classificação: `backend + frontend + database`

## Resumo

Todas as 550 despesas atuais (dado migrado na consolidação de banco) têm `valor_final = NULL`. O frontend (`financeService.ts`) já cai para `valor_original` quando isso acontece, mas **3 consultas agregadas do backend somam `valor_final` direto no SQL, sem esse fallback** — por isso o card "Despesas", o gráfico anual e "Parcelas futuras" mostram 0, enquanto widgets que somam a lista completa no navegador (Perfil das despesas, Despesas por categoria, tela de Despesas) mostram o valor certo.

Investigação adicional revelou que **294 das 550 despesas têm `valor_final` E `valor_original` nulos ao mesmo tempo** — só a coluna `valor` nunca é nula em nenhuma das 550 linhas. Ou seja, o fallback de 2 níveis já usado no frontend (`valor_final ?? valor_original`) é insuficiente para essas 294 linhas; é preciso um terceiro nível (`valor`) tanto no backend quanto no frontend.

Confirmado via revisão de código: `POST`/`PUT /api/despesas` já gravam `valor_final` corretamente (com fallback para `valor_original`) em toda despesa criada/editada pelo app atual — este é um problema **exclusivo do dado legado migrado**, não afeta despesas novas.

## Escopo

### Dentro do escopo

- Backend: trocar `valor_final` por `COALESCE(valor_final, valor_original, valor)` em:
  - `backend/src/routes/financial.ts` (subquery de despesas da rota `/anual`)
  - `backend/src/routes/months.ts` (2 consultas idênticas de saldo mensal)
  - `backend/src/routes/expenses.ts` (rota `/parcelas-futuras`)
- Frontend: estender `expenseFromApi` em `src/services/financeService.ts` para cair em `valor` como terceiro nível de fallback; declarar `valor` no `RawExpense`.
- Backfill: `UPDATE despesas SET valor_final = COALESCE(valor_final, valor_original, valor) WHERE valor_final IS NULL` — mediante confirmação explícita separada.

### Fora do escopo

- Qualquer alteração em `POST`/`PUT /api/despesas` — já gravam `valor_final` corretamente, não precisam de mudança.
- Qualquer alteração em receitas — o problema é específico da coluna `valor_final` de despesas.
- Investigação de por que a migração/consolidação perdeu `valor_final` originalmente — fora do escopo desta correção pontual.

## Leitura de contexto

- `src/services/financeService.ts` (`expenseFromApi`, já lido integralmente)
- `backend/src/routes/months.ts`, `financial.ts`, `expenses.ts` (consultas agregadas identificadas)
- `backend/src/routes/expenses.ts` (`POST`/`PUT`, confirma que despesas novas já gravam `valor_final` corretamente)
- Consulta read-only em produção: 550/550 despesas com `valor_final` nulo; 294/550 também com `valor_original` nulo; 0/550 com as três colunas (`valor_final`, `valor_original`, `valor`) nulas simultaneamente

## Impacto por área

### Frontend

`src/services/financeService.ts`: `RawExpense` ganha campo opcional `valor?: string | number | null`; `expenseFromApi` passa a calcular `rawFinalDb` com `asNumber(r.valor_final ?? r.valor_original ?? r.valor)`.

### Backend

Três arquivos, quatro ocorrências, trocando `valor_final` por `COALESCE(valor_final, valor_original, valor)` (ou `COALESCE(valor_final, valor_original, valor) / numero_parcelas` onde há divisão por parcela):

- `financial.ts`: `SUM(valor_final)` → `SUM(COALESCE(valor_final, valor_original, valor))`
- `months.ts` (×2): dentro do `CASE WHEN ... THEN valor_final / numero_parcelas ELSE valor_final END`, trocar as duas referências a `valor_final`
- `expenses.ts` (`/parcelas-futuras`): dentro do `CASE WHEN ... THEN valor_final::float / NULLIF(numero_parcelas, 0) ELSE valor_final::float END`, trocar as duas referências

### Banco de dados

```sql
UPDATE despesas SET valor_final = COALESCE(valor_final, valor_original, valor) WHERE valor_final IS NULL;
```

Atenção: migrations/updates de dados não devem ser executados sem confirmação explícita do usuário, pois o ambiente atual é produção. Aplicação só ocorre após confirmação separada e explícita.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/routes/financial.ts`
- `backend/src/routes/months.ts`
- `backend/src/routes/expenses.ts`
- `src/services/financeService.ts`

## Estratégia de implementação

1. Atualizar as 4 consultas do backend com o `COALESCE` de 3 níveis.
2. Atualizar `expenseFromApi` no frontend com o mesmo fallback de 3 níveis.
3. Rodar `cd backend && npm run build` e `npx vite build`.
4. Aplicar o backfill contra produção mediante confirmação explícita separada.
5. Pedir para o usuário recarregar o Painel e confirmar que "Despesas", o gráfico anual e "Parcelas futuras" mostram valores corretos.

## Regras de negócio identificadas

Nenhuma nova — o valor "correto" de uma despesa legada, na ausência de `valor_final`, é `valor_original`, e na ausência deste, `valor`.

## Regras multi-tenant e segurança

Não aplicável — mudança de cálculo interna, sem alterar filtros de `usuario_id`/`perfil_id` já existentes nessas consultas.

## Validações necessárias

- Card "Despesas" do Painel reflete o mesmo total que "Perfil das despesas"/"OPEX" para o mesmo mês.
- Gráfico anual mostra a linha "Despesas" com valores reais, não mais achatada em zero.
- "Parcelas futuras" mostra valores reais para despesas parceladas com parcelas restantes.

## Testes necessários

### Backend

- Comparar o total retornado por `/api/meses/:ano/:mes/saldo` com a soma manual das despesas do mesmo mês antes/depois da correção.

### Frontend

- Conferir visualmente o Painel em um mês com despesas legadas (ex.: Março 2026) após o deploy.

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx vite build
```

## Riscos e pontos de atenção

- Risco baixo — `COALESCE` só amplia um fallback que já existia parcialmente; não muda o comportamento para despesas que já têm `valor_final` preenchido (a maioria das despesas novas, dado que `POST`/`PUT` já gravam corretamente).
- O backfill só atualiza linhas com `valor_final IS NULL`, nunca sobrescreve um valor já definido.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- As 4 consultas do backend usam `COALESCE(valor_final, valor_original, valor)`.
- `expenseFromApi` usa o mesmo fallback de 3 níveis.
- Backfill aplicado, zero despesas com `valor_final IS NULL` em produção.
- Builds de frontend e backend passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Confirmar explicitamente com o usuário antes de executar o backfill contra produção.
- Isolar o commit de qualquer alteração pendente não relacionada já presente no working tree.
