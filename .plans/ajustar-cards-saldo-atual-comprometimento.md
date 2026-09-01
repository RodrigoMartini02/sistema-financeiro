# Plano de Implementação: Remover card Receitas e ajustar Saldo atual/Comprometimento

## Origem

- Arquivo de especificação: conversa com o usuário (feedback direto sobre os cards de Movimentações já implementados em `.plans/corrigir-cards-resumo-movimentacoes.md`)
- Data do planejamento: `2026-09-01`
- Classificação: `frontend-only`

## Resumo

Ajustes finos nos cards de resumo de Movimentações, feitos logo após a implementação anterior: remover o card "Receitas" (redundante, já que a receita do mês passa a compor visualmente o "Saldo atual"), pintar "Saldo atual" de verde (tom `income`), e recalcular "Comprometimento" como `Despesas ÷ Saldo atual` em vez de `Despesas ÷ Receitas do mês` — refletindo a ideia de que, uma vez fechado o mês anterior, o saldo herdado passa a fazer parte do caixa disponível do mês corrente junto com as novas receitas.

## Escopo

### Dentro do escopo

- Remover o `MovementMetricCard` de "Receitas" da grade em `MovimentacoesScreen.tsx`.
- Remover o estado `receitasSummary`, o `useState` correspondente, e a prop `onFilteredSummaryChange` passada a `<ReceitasScreen>` em `MovimentacoesScreen.tsx` (fica sem consumidor visual após a remoção do card).
- Reverter em `ReceitasScreen.tsx` a prop `onFilteredSummaryChange` e o `useEffect`/import associados, adicionados na implementação anterior — não removendo os filtros em si (`busca`), só a exposição do total filtrado ao pai.
- Trocar `tone="slate"` para `tone="income"` no card "Saldo atual".
- Recalcular `comprometimento = saldoAtual > 0 ? (despesas / saldoAtual) * 100 : 0` (usando `despesas`, que já reflete o total filtrado de Despesas quando um filtro estiver ativo, mantendo o comportamento já existente).
- Ajustar o grid de `md:grid-cols-3 xl:grid-cols-5` (5 cards) para `md:grid-cols-2 xl:grid-cols-4` (4 cards: Saldo atual, Despesas, Saldo projetado, Comprometimento).

### Fora do escopo

- Qualquer mudança na fórmula de "Saldo atual" ou "Saldo projetado" além do que já foi implementado (composição saldo herdado + receitas, aviso de mês anterior aberto).
- Qualquer mudança em `DespesasScreen.tsx` — a exposição de `despesasSummary` continua sendo usada pelo card "Despesas".
- Mudanças em `BudgetPanel.tsx` ou outras telas.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/CLAUDE.md` — sequência obrigatória `/planejar → aprovação → /implementar → /finalizar`.
- Não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- `.plans/corrigir-cards-resumo-movimentacoes.md` — plano anterior, implementado e já em produção, que introduziu a lógica de `receitasSummary`/`despesasSummary`/`saldoAtual`/`mesAnteriorFechado` sendo ajustada aqui.
- `src/screens/finance/MovimentacoesScreen.tsx` — arquivo principal a alterar.
- `src/screens/receitas/ReceitasScreen.tsx` — reversão pontual do plumbing adicionado na implementação anterior.
- `src/screens/finance/MovementMetricCard.tsx` — componente de card, prop `tone` já suporta `'income' | 'expense' | 'slate' | 'warning'`, sem mudança necessária nele.

## Impacto por área

### Frontend

- `MovimentacoesScreen.tsx`:
  - Remover `const [receitasSummary, setReceitasSummary] = useState<FilteredSummary | null>(null);`.
  - Remover a linha `const receitas = receitasSummary?.active ? receitasSummary.total : receitasMes;` (não é mais usada em nenhum card; `receitasMes` continua usada internamente para compor `saldoAtual`).
  - Remover o `MovementMetricCard` de "Receitas" do JSX.
  - Remover a prop `onFilteredSummaryChange={setReceitasSummary}` de `<ReceitasScreen>`.
  - Trocar `tone="slate"` por `tone="income"` no card "Saldo atual".
  - Alterar `comprometimento` para `saldoAtual > 0 ? (despesas / saldoAtual) * 100 : 0`.
  - Ajustar classe do grid de 5 para 4 colunas.
- `ReceitasScreen.tsx`:
  - Remover a prop `onFilteredSummaryChange` da interface `ReceitasScreenProps` e da assinatura da função.
  - Remover o import `type { FilteredSummary }` (torna-se não usado).
  - Remover o `useEffect` que disparava `onFilteredSummaryChange`.
  - Avaliar se o import de `useEffect` de `react` continua necessário no arquivo (remover se não houver outro uso).
- Sem impacto em `DespesasScreen.tsx` — `FilteredSummary` continua exportado de lá e usado por `despesasSummary`.
- Sem novos estados de loading/error.
- Sem testes automatizados nesta área do projeto (confirmado anteriormente).

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`. Nenhuma migration necessária.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. Em `MovimentacoesScreen.tsx`: remover estado/uso de `receitasSummary`, remover o card "Receitas" do JSX, remover a prop passada a `<ReceitasScreen>`, ajustar `tone` do "Saldo atual" e a fórmula de `comprometimento`, ajustar o grid para 4 colunas.
2. Em `ReceitasScreen.tsx`: reverter a prop `onFilteredSummaryChange`, o `useEffect` associado e o import de `FilteredSummary`; limpar import de `useEffect` se ficar sem uso.
3. Rodar `npx tsc --noEmit` e `npm run build`.
4. Validação manual: conferir grid com 4 cards, cor verde do "Saldo atual", e valor de Comprometimento recalculado (comparar manualmente `despesas / saldoAtual * 100`).

## Regras de negócio identificadas

- Uma vez que o mês anterior é fechado, o saldo resultante (positivo ou negativo) passa a integrar o caixa disponível do mês corrente, junto com as receitas que entrarem nesse mês — esse caixa total (`saldoAtual`) é a base para medir o quanto das despesas do mês já o compromete.
- "Comprometimento" deixa de ser "despesas como fração da receita do mês" e passa a ser "despesas como fração do caixa total disponível no mês".

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Mudança é puramente de composição visual/fórmula de exibição no frontend, sem novos dados expostos.

## Validações necessárias

Nenhuma validação de input nova — mudança de exibição e fórmula derivada de dados já carregados.

## Testes necessários

### Frontend

- Validação manual: grid com 4 cards (Saldo atual, Despesas, Saldo projetado, Comprometimento), sem o card "Receitas".
- Validação manual: "Saldo atual" exibido em verde.
- Validação manual: valor de "Comprometimento" bate com `despesas / saldoAtual * 100` (conferir com uma calculadora usando os valores exibidos nos outros cards).
- Validação manual: quando `saldoAtual` for `0` ou negativo, "Comprometimento" deve exibir `-` (mesmo tratamento de guarda contra divisão por zero/negativo já usado hoje para receitas).

### Backend

`Sem impacto esperado`.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npx tsc --noEmit
npm run build
```

## Riscos e pontos de atenção

- Ao mudar o divisor de "Comprometimento" de `receitasMes` para `saldoAtual`, o percentual exibido muda de significado — um "Comprometimento" de 100%+ passará a ocorrer sempre que as despesas superarem o caixa total disponível (saldo herdado + receita), não apenas quando superarem a receita do mês; isso é a mudança pretendida, mas é bom que o usuário saiba que o percentual pode ficar mais baixo em meses com saldo herdado alto, e mais alto (ou negativo/indefinido) em meses com saldo herdado negativo ou zerado.
- Quando `saldoAtual` for negativo (mês anterior fechado com saldo negativo e poucas receitas novas), a guarda `saldoAtual > 0` evita divisão por número negativo, exibindo `-` — mesmo padrão de guarda já usado hoje para `receitas > 0`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões já confirmadas com o usuário (fórmula do Comprometimento, remoção do plumbing órfão de receitas filtradas).

## Critérios de aceite do plano

- O card "Receitas" não aparece mais na grade de Movimentações.
- O card "Saldo atual" é exibido em verde (`tone="income"`).
- "Comprometimento" é calculado como `despesas / saldoAtual * 100`, com guarda para `saldoAtual <= 0`.
- A grade exibe 4 cards, com layout ajustado (sem coluna vazia ou desalinhamento).
- Nenhum código morto (estado, prop, import) relacionado ao total filtrado de receitas permanece em `MovimentacoesScreen.tsx`/`ReceitasScreen.tsx`.
- `npx tsc --noEmit` e `npm run build` passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/CLAUDE.md` (sequência `/planejar → aprovação → /implementar → /finalizar`).
- Este plano é um ajuste direto sobre a implementação de `.plans/corrigir-cards-resumo-movimentacoes.md`, já em produção — não reintroduzir nenhuma lógica removida ali.
- Nenhuma migration ou alteração de `.env` é necessária ou permitida neste plano.
