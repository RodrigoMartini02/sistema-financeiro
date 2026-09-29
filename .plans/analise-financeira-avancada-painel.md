# Plano de Implementação: Análise Financeira Avançada no Painel

## Origem

- Data do planejamento: `2026-07-10`
- Classificação: `fullstack` (frontend + backend, sem alteração de schema)

## Resumo

Adicionar ao `FinanceDashboard.tsx` já implementado:
1. **Banner "mês no vermelho"** — alerta visual quando `despesas > receitas`
2. **Nova seção "Análise de despesas"** entre o area chart e as categorias, com 3 cards lado a lado:
   - **Juros × Descontos** — calculado de `valorFinal - valorOriginal` dos expenses do mês
   - **Perfil das despesas** — fixas vs variáveis (recorrente) + OPEX vs CAPEX (tipo_despesa)
   - **Parcelas futuras** — próximos 3 meses comprometidos via novo endpoint backend

## Decisões Aplicadas

- **Decisão 1:** Incluir parcelas futuras com novo endpoint `GET /api/despesas/parcelas-futuras`
- **Decisão 2:** Nova seção dedicada "Análise de despesas" (3 cards) entre area chart e categorias

## Escopo

### Dentro do escopo

- Banner "mês no vermelho" — renderiza quando `saldoProjetado < 0`; some ao trocar de mês (sem estado persistente)
- Card **Juros × Descontos**: juros pagos + descontos obtidos do mês selecionado (client-side)
- Card **Perfil das despesas**: % fixas (recorrente=true) vs variáveis + breakdown OPEX/CAPEX/Sem classificação (client-side)
- Card **Parcelas futuras**: novo endpoint retornando total por mês dos próximos 3 meses
- Grid 3 colunas em telas grandes (xl:grid-cols-3), empilhado em mobile

### Fora do escopo

- Alertas por e-mail/push notification
- Histórico de tendências (N meses consecutivos em queda)
- Projeção de fluxo de caixa além de 3 meses
- Editar/pagar parcelas direto do card
- Qualquer alteração em outras telas (Receitas, Despesas, Contratos)

## Impacto por Área

### Frontend — `src/screens/finance/FinanceDashboard.tsx`

**Banner "mês no vermelho":**
- Posição: entre MonthSelector e os 5 KPI cards
- Condição: `saldoProjetado < 0` (calculado como `saldoAnterior + receitas - despesas`)
- Visual: fundo `bg-red-50`, borda `border-red-200`, ícone `AlertTriangle` da lucide-react
- Texto: `"Despesas superam receitas em {formatCurrency(Math.abs(saldoProjetado))} neste mês"`
- Sem botão dismiss — some automaticamente quando o mês muda ou o saldo fica positivo

**Nova seção "Análise de despesas"** (após o area chart, antes do grid categorias+origens):

**Card 1 — Juros × Descontos** (`useMemo` de `data.expenses`):
```ts
const juros = (data?.expenses ?? [])
  .filter(e => e.valorOriginal != null && e.valorFinal > (e.valorOriginal ?? 0))
  .reduce((s, e) => s + e.valorFinal - (e.valorOriginal ?? e.valorFinal), 0);

const descontos = (data?.expenses ?? [])
  .filter(e => e.valorOriginal != null && e.valorFinal < (e.valorOriginal ?? 0))
  .reduce((s, e) => s + ((e.valorOriginal ?? e.valorFinal) - e.valorFinal), 0);
```
Layout: dois itens verticais com ícone colorido, label e valor formatado.
Empty state: "Sem juros ou descontos registrados neste mês"

**Card 2 — Perfil das despesas** (`useMemo` de `data.expenses`):
```ts
const totalDesp = expenses.reduce((s, e) => s + e.valorFinal, 0);
const fixas = expenses.filter(e => e.recorrente).reduce(sum, 0);
const variaveis = totalDesp - fixas;
const opex = expenses.filter(e => e.tipoDespesa === 'opex').reduce(sum, 0);
const capex = expenses.filter(e => e.tipoDespesa === 'capex').reduce(sum, 0);
const semClass = totalDesp - opex - capex;
```
Layout: barra de progresso horizontal (fixas/variáveis) + 3 chips OPEX/CAPEX/Sem classificação abaixo.

**Card 3 — Parcelas futuras** (`useQuery`):
- Query key: `queryKeys.parcelasFuturas(month, year, 3)`
- Service: `fetchParcelasFuturas(mes, ano, meses=3)`
- Lista: até 3 linhas com `MONTH_NAMES[mes]` e `formatCurrency(total)`
- Linha de total: `Total comprometido: R$ X`
- Loading: skeleton simples
- Empty state: "Nenhuma parcela em aberto nos próximos meses"

**Layout final do painel (ordem de cima para baixo):**
```
Header + MonthSelector
[NOVO] Banner "mês no vermelho" (condicional, quando saldoProjetado < 0)
5 KPI cards
Contratos panel (condicional)
Area chart anual
[NOVA] grid gap-5 xl:grid-cols-3:
  Card Juros × Descontos
  Card Perfil das despesas
  Card Parcelas futuras
grid gap-5 xl:grid-cols-2:
  Despesas por categoria (existente)
  Receitas por origem (existente)
grid gap-5 xl:grid-cols-2:
  Saúde financeira (existente)
  Forma de pagamento (existente)
```

### Backend — `backend/src/routes/expenses.ts`

Novo endpoint adicionado antes do `export default router`:

```
GET /api/despesas/parcelas-futuras?mes=X&ano=Y&meses=3&perfil_id=Z
Authorization: Bearer token

Response: { success: true, data: Array<{ mes: number; ano: number; total: number }> }
```

Query SQL:
```sql
SELECT mes, ano,
  SUM(
    CASE WHEN parcela_atual = 1 AND numero_parcelas > 1
         THEN valor_final::float / NULLIF(numero_parcelas, 0)
         ELSE valor_final::float
    END
  ) AS total
FROM despesas
WHERE usuario_id = $1
  AND parcelado = true
  AND pago = false
  AND (ano * 12 + mes) > ($2 * 12 + $3)
  AND (ano * 12 + mes) <= ($2 * 12 + $3 + $4)
  AND ($5::int IS NULL OR perfil_id = $5 OR (perfil_id IS NULL AND EXISTS (
    SELECT 1 FROM perfis pf WHERE pf.id = $5 AND pf.tipo = 'pessoal' AND pf.usuario_id = $1
  )))
GROUP BY mes, ano
ORDER BY ano, mes
```
Parâmetros: `[$userId, $ano, $mes, $meses, $perfilId]`

Validações:
- `mes`: inteiro 0–11, obrigatório
- `ano`: inteiro 2000–2100, obrigatório
- `meses`: inteiro 1–12, default 3
- `perfil_id`: opcional
- `usuario_id`: sempre do token JWT

**Atenção sobre `parcela_atual = 1`:** A primeira linha de uma compra parcelada armazena `valor_final = total_da_compra`. Para os meses futuros, a linha de `parcela_atual = 1` costuma estar no mês da compra (passado ou atual). Para parcelas futuras, o esperado é encontrar apenas `parcela_atual > 1` com o valor por parcela já correto. O CASE garante que, se houver uma parcela_atual=1 em mês futuro (compra feita antecipada), o valor será dividido corretamente.

### Banco de dados

Sem alterações de schema. Sem migrations.

### Infra/Deploy

Sem impacto.

## Arquivos Provavelmente Afetados

- `src/screens/finance/FinanceDashboard.tsx` — banner + nova seção Análise (3 cards)
- `src/services/financeService.ts` — `fetchParcelasFuturas(mes, ano, meses)`
- `src/services/queryKeys.ts` — `parcelasFuturas(mes, ano, meses)`
- `backend/src/routes/expenses.ts` — `GET /parcelas-futuras`

## Estratégia de Implementação

1. `queryKeys.ts` — adicionar `parcelasFuturas: (mes, ano, meses) => [...]`
2. `financeService.ts` — adicionar `fetchParcelasFuturas` com `appendProfile`
3. `expenses.ts` backend — adicionar `GET /parcelas-futuras` com authenticate + query SQL
4. `FinanceDashboard.tsx`:
   a. Adicionar `useQuery` para parcelasFuturas
   b. Adicionar `useMemo` para juros, descontos, perfil (fixas/variáveis, opex/capex)
   c. Inserir banner "mês no vermelho" (condicional) entre MonthSelector e KPI cards
   d. Inserir seção grid 3 colunas com os 3 cards após o area chart
5. `npx vite build` + `npx tsc --noEmit` no backend

## Regras de Negócio Identificadas

- Juros: `valorFinal > valorOriginal` — diferença é custo financeiro
- Desconto: `valorFinal < valorOriginal` — diferença é economia
- `valorOriginal` pode ser null (despesas simples) — ignorar esses registros no cálculo
- Despesa fixa = `recorrente: true`; variável = `recorrente: false`
- OPEX/CAPEX identificados por `tipoDespesa: 'opex' | 'capex' | null`
- Parcelas futuras: despesas com `parcelado=true`, `pago=false`, em meses posteriores ao selecionado
- `mes` 0-indexed no banco (mesmo que no frontend)

## Regras Multi-tenant e Segurança

- Endpoint `/parcelas-futuras` filtra por `usuario_id = req.user!.id` (JWT)
- `perfil_id` opcional, mesmo padrão dos outros endpoints
- Nunca retornar dados de outros usuários

## Riscos e Pontos de Atenção

| Risco | Impacto | Mitigação |
|---|---|---|
| OPEX/CAPEX não preenchido pela maioria das despesas | Card Perfil com quase tudo em "Sem classificação" | Mostrar "Sem classificação" normalmente, não esconder o card |
| valorOriginal null na maioria das despesas comuns | Juros/descontos sempre zerados | Empty state explícito, não esconder o card |
| Lógica parcela_atual=1 com valor_final=total | Valor incorreto na query | CASE na SQL corrige; testar com despesa real parcelada |
| Banner "mês no vermelho" intrusivo | UX ruim | Tamanho compacto (py-2.5), não bloqueia o conteúdo abaixo |

## Perguntas em Aberto

- O backend usa `mes` 0-indexed no campo `despesas.mes`? (Confirmar na implementação — é provável que sim, como no restante do sistema)

## Critérios de Aceite

- [ ] Banner vermelho aparece quando despesas > receitas e some quando não
- [ ] Card Juros × Descontos exibe valores corretos (ou empty state)
- [ ] Card Perfil mostra % fixas/variáveis + chips OPEX/CAPEX
- [ ] Card Parcelas futuras lista os próximos 3 meses com totais
- [ ] Endpoint `/parcelas-futuras` retorna 401 sem token
- [ ] Endpoint filtra corretamente por usuario_id
- [ ] Seção de análise fica entre area chart e categorias
- [ ] Build frontend passa sem erros TS
- [ ] Backend typecheck passa sem erros

## Observações para a Skill Implementar

- Sem migrations — nenhuma alteração de schema
- `data.expenses` já está carregado via `useFinanceDashboard` — não criar nova query para os cálculos client-side
- O `saldoProjetado` já é calculado no componente — reutilizar para o banner
- `tipoDespesa` é mapeado como `(r.tipo_despesa as 'opex' | 'capex' | null)` em `expenseFromApi`
- `recorrente` é mapeado como `r.recorrente === true` em `expenseFromApi`
- `valorOriginal` é mapeado como `r.valor_original ? asNumber(r.valor_original) : null`
- Não alterar `.env`
- Não fazer commit sem solicitação do usuário
- Recharts já instalado — não instalar nada novo
