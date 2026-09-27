# Plano de Implementação: Remover linha de resumo do cabeçalho do Painel

## Origem

- Arquivo de especificação: pedido direto do usuário (print do Painel financeiro)
- Data do planejamento: `2026-09-26`
- Classificação: `frontend-only`

## Resumo

Remover do cabeçalho do Painel financeiro o texto
"{período} · conta {tipo} · N lançamentos no período · dados de {primeira} até {última}".

## Escopo

### Dentro do escopo

- Remover o `<p>` de resumo do cabeçalho em `src/screens/finance/FinanceDashboard.tsx`.
- Remover, no mesmo arquivo, o que só servia a esse texto: `accountTypeLabel` e o import `formatDate`.

### Fora do escopo

- Backend, tipos, `financeService.ts` e `DashboardPeriodFilter.tsx` — ficam como estão (decisão do usuário: mexer só no texto do painel).
- `primeiraData` continua sendo usado no backend para definir a granularidade da série.
- Cards de alerta, título e filtros — permanecem.

## Arquivos afetados

- `sistema financas/src/screens/finance/FinanceDashboard.tsx`

## Critérios de aceite

- O texto de resumo não aparece mais no Painel.
- Título, filtros e cards continuam funcionando.
