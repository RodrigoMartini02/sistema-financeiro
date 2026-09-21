# Plano de Implementação: Barra de Movimentações sempre completa + seletor de mês em pill

## Origem

- Arquivo de especificação: pedido direto no chat (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-21
- Classificação: `frontend-only`

## Resumo

Na barra de ferramentas de Movimentações, os controles "Nova receita", "Nova despesa",
`OrdenarChip` e `MultiFilterPanel` somem hoje quando o modo Calendário ou o modo
Planejamento estão ativos (`{!isCalendario && !isPlanning && (...)}`). O usuário quer que
nenhum controle desse menu fique oculto, independente da combinação de modos selecionada —
a barra permanece sempre completa. Além disso, o `MonthYearPicker` deve virar visualmente
uma pill arredondada, no mesmo padrão dos demais botões da barra (que já usam `rounded-full`
via os tokens `dangerButtonStyle`/`successOutlineButtonStyle`/`neutralOutlineButtonStyle`
implementados no plano anterior).

## Escopo

### Dentro do escopo

- Remover as condições `{!isCalendario && !isPlanning && (...)}` que escondem "Nova
  receita"/"Nova despesa" em `MovimentacoesScreen.tsx`.
- Remover a condição equivalente que esconde `OrdenarChip` + `MultiFilterPanel`.
- Esses 4 controles passam a renderizar sempre, em qualquer combinação de
  Lista/Calendário × Lançamentos/Planejamento.
- Em `MonthYearPicker.tsx`, trocar `rounded-lg` por `rounded-full` no container externo
  (linha 52), deixando-o com o mesmo arredondamento pill dos outros controles da barra.

### Fora do escopo

- Nenhuma mudança de comportamento funcional real dos botões — continuam chamando os
  mesmos handlers (`setQuickAction`, `setOrdenar`, `setFiltro*`). Em modo Calendário ou
  Planejamento eles ficam visíveis mas sem efeito na área de conteúdo abaixo, pois essas
  telas (`CalendarView`, `BudgetPanel`) não foram adaptadas para reagir a
  ordenação/filtro — isso não foi pedido.
- `CalendarSubViewToggle` (aparece só em modo Calendário) — inalterado.
- Dropdown interno de seleção de mês/ano do `MonthYearPicker` (grid de meses, navegação de
  ano) — inalterado, só o container externo muda de arredondamento.
- `LancamentosTable.tsx`, `BudgetPanel.tsx`, `CalendarView.tsx` — não tocados.

## Leitura de contexto

- `CLAUDE.md` da raiz do workspace — fluxo obrigatório de planejar → aprovar → implementar
  → finalizar, considerado; não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste
  projeto (estrutura sem essa separação de pastas na raiz).
- `src/screens/finance/MovimentacoesScreen.tsx` — arquivo alvo principal; já contém os
  tokens de estilo pill outline do plano anterior (`padronizar-botoes-toolbar-movimentacoes.md`),
  aplicados em "Nova receita"/"Nova despesa" e nos toggles.
- `src/screens/finance/MonthYearPicker.tsx` — confirmado container externo com
  `rounded-lg` na linha 52; dropdown interno usa `rounded-xl`, não precisa mudar.

## Impacto por área

### Frontend

- `src/screens/finance/MovimentacoesScreen.tsx`:
  - Remover a condição `{!isCalendario && !isPlanning && (...)}` ao redor do bloco com
    "Nova receita"/"Nova despesa" (e seus `FirstAccessGuideCard` associados).
  - Remover a condição `{!isCalendario && !isPlanning && (...)}` ao redor de `OrdenarChip`
    + `MultiFilterPanel`.
  - Nenhuma mudança de estado, props ou lógica de dados.
- `src/screens/finance/MonthYearPicker.tsx`:
  - Trocar `rounded-lg` por `rounded-full` no `className` do `div` container (linha 52).

Sem impacto em hooks, query keys, forms ou estados de loading/error/empty.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário — não se
aplica a este plano (nenhuma migration envolvida).

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/MonthYearPicker.tsx`

## Estratégia de implementação

1. Em `MovimentacoesScreen.tsx`, remover as duas condições `!isCalendario && !isPlanning`
   que hoje envolvem os blocos de botões de ação e de ordenação/filtro, mantendo o restante
   da marcação (ícones, handlers, guias de primeiro acesso) intacto.
2. Em `MonthYearPicker.tsx`, trocar `rounded-lg` por `rounded-full` no container externo.
3. Rodar `npx tsc --noEmit` e `npx vite build`.

## Regras de negócio identificadas

Nenhuma — mudança puramente de visibilidade/estilo, sem regra de negócio nova.

## Regras multi-tenant e segurança

`Sem impacto esperado`

## Validações necessárias

- Confirmar visualmente que a barra permanece com os 4 controles em Lista, Calendário,
  Lançamentos e Planejamento, em todas as combinações.
- Confirmar que o `MonthYearPicker` renderiza como pill sem cortar o texto do mês/ano nem
  quebrar o hover dos botões de navegação (setas).

## Testes necessários

### Frontend

- Validação manual visual (sem suíte automatizada de UI no projeto).

### Backend

`Sem impacto esperado`

### E2E

`Sem impacto esperado`

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Baixíssimo risco — mudança de condição de renderização e uma classe CSS.
- Em modo Calendário, "Nova receita"/"Nova despesa" continuam abrindo o mesmo formulário
  de sempre (comportamento inalterado); o usuário optou explicitamente por manter esses
  controles visíveis mesmo sem elos funcionais adicionais com a grade de calendário.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Nova receita, Nova despesa, Ordenar e Filtro aparecem sempre na barra, em qualquer
  combinação de Lista/Calendário × Lançamentos/Planejamento.
- `MonthYearPicker` renderiza com cantos totalmente arredondados (pill), igual aos demais
  controles da barra.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Mudança mínima e cirúrgica: só remover as duas condições de visibilidade e trocar uma
  classe de arredondamento — não tocar em mais nada.
