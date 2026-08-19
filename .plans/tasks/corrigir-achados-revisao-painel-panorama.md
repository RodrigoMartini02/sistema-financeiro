# Corrigir achados da revisão de código do Painel financeiro (panorama)

## Contexto

Após implementar o filtro de período próprio do Painel financeiro (feature
`painel-panorama-financeiro`, já em produção), foi feita uma revisão de
código focada em correção e sobreposição/duplicação. Foram encontrados 4
pontos, todos de baixo a médio impacto, nenhum bloqueante. Este plano cobre a
correção dos 4.

## Achados a corrigir

### 1. Granularidade incorreta no modo "Todo o período"

Arquivo: `backend/src/routes/financial.ts` (endpoint `/panorama`, cálculo de
`granularidade`, por volta da linha 258-260).

Hoje, quando o filtro é "todo o período" (nenhum `de_mes`/`de_ano`/`ate_mes`/
`ate_ano` informado), `deChave` e `ateChave` ficam `null`, e a granularidade
da série cai direto em `'ano'` — mesmo que o histórico real do usuário caiba
em poucos meses (ex: usuário com só 3 meses de lançamentos veria 1 barra em
vez de 3 barras mensais no gráfico "Receitas × Despesas × Saldo").

Correção: quando `de`/`ate` não são informados, calcular a granularidade a
partir do intervalo real de dados do usuário (da primeira data com lançamento
até hoje), usando a mesma regra de corte já existente (≤24 meses = mês, senão
ano), em vez de assumir `'ano'` incondicionalmente.

### 2. Saldo anterior fixo em 0 no modo "tudo"

Arquivo: `backend/src/routes/financial.ts` (query `anteriorResult`, por volta
da linha 227-241).

Quando `deChave` é `null` (modo "todo o período"), o código resolve
`saldo_anterior` como `0` sem consultar nada, o que hoje está correto (não há
período anterior ao próprio início do histórico). Porém isso ignora
silenciosamente o campo `aporte_inicial` já existente no schema de perfis
(`backend/src/db/schema/profiles.ts`), que representa um saldo inicial
configurável por perfil. Se esse campo já for usado em algum lugar do sistema
como "ponto de partida" do saldo, o modo "tudo" do painel está sub-relatando
o saldo real.

Correção: verificar se `aporte_inicial` já é usado como saldo de abertura em
algum outro cálculo do sistema (ex: `fetchMonthBalance`, `meses.saldo_final`
do primeiro mês). Se for, incluir esse valor no `saldo_anterior` do modo
"tudo" também. Se não for usado em nenhum outro lugar do sistema hoje, apenas
documentar a decisão (não inventar um comportamento nunca implementado).

### 3. Query duplicada de `useBudgetOverview`

Arquivos: `src/screens/finance/FinanceDashboard.tsx` (linha ~72) e
`src/screens/finance/MonthCategoriesOverview.tsx` (linha ~25).

`FinanceDashboard` chama `useBudgetOverview(singleMonth?.mes ?? THIS_MONTH,
singleMonth?.ano ?? THIS_YEAR)` só para extrair `profileType` (usado no
subtítulo do cabeçalho). `MonthCategoriesOverview`, renderizado como filho
apenas quando `singleMonth` existe, chama `useBudgetOverview(month, year)`
de novo internamente com os mesmos parâmetros. React Query deduplica pela
query key idêntica, então não há requisição de rede duplicada — mas é uma
busca logicamente redundante, e o fallback `THIS_MONTH`/`THIS_YEAR` do pai
(usado quando `singleMonth` é `null`) é uma dependência frágil: só "funciona"
porque o filho nunca é renderizado nesse caso.

Correção: buscar `useBudgetOverview` uma única vez em `FinanceDashboard`
(mantendo o fallback de mês/ano corrente quando `singleMonth` é `null`, já
que o card de perfil precisa do dado mesmo fora de um mês único) e passar o
resultado já carregado como prop para `MonthCategoriesOverview`, em vez de
esse componente buscar de novo internamente.

### 4. Grid com buraco visual quando filtro não é um único mês

Arquivo: `src/screens/finance/FinanceDashboard.tsx` (seção "Análise do
período", grid `xl:grid-cols-3`, por volta da linha 279-554).

O card "Parcelas futuras" só é renderizado quando `singleMonth` existe.
Quando o filtro é "Ano corrente", "Todo o período" ou um intervalo, sobram 5
cards em vez de 6 numa grade de 3 colunas, deixando espaço vazio irregular na
última linha (2 posições vazias na 2ª linha).

Correção: ajustar o layout para que a ausência do card "Parcelas futuras" não
deixe buraco visual — por exemplo, reordenando os cards para que os
condicionais fiquem sempre ao final da grade, ou ajustando a contagem de
colunas dinamicamente conforme quantos cards estão de fato visíveis. Não
alterar o conteúdo/dado dos cards, apenas o arranjo visual.

## Fora de escopo

- Qualquer outra mudança no Painel financeiro além dos 4 pontos acima.
- Novos cards, gráficos ou filtros.
- Alterações em `escalacao futebol`.
- Migrations de schema (nenhuma é esperada para estas correções).
