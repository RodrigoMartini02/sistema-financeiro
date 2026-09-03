# Plano de Implementação: Corrigir popover do seletor de mês + ajuste visual do cabeçalho de Movimentações

## Origem

- Origem: feedback do usuário sobre a implementação do plano `.plans/movimentacoes-header-compacto-e-limite-cartao.md` (já commitado e mergeado em `main`)
- Data do planejamento: 2026-09-02
- Classificação: `frontend-only`

## Resumo

Bug encontrado: o container do `MonthYearPicker` usa `overflow-hidden` (linha 52) só para arredondar as bordas dos 3 botões internos (seta esquerda, texto do mês, seta direita) — mas isso corta o popover da grade de meses, que é `absolute` e filho desse mesmo container. Resultado: o clique no texto do mês registra o estado `open = true`, mas o popover fica visualmente escondido pelo `overflow-hidden` do pai ("cliquei... não aparece nada de minicalendario"). Além disso, o texto do mês não tinha nenhuma pista visual (ícone, seta) de que era clicável, e o cabeçalho ficou com todos os controles numa única fileira sem agrupamento por função. Este plano corrige o bug do overflow e ajusta os dois pontos visuais, mantendo a estrutura compacta já aprovada.

## Escopo

### Dentro do escopo

1. **Correção do bug (prioridade):** `MonthYearPicker.tsx` — remover `overflow-hidden` do container pai (linha 52). Decisão do usuário: aceitar cantos internos quadrados nos botões de seta (sem reaplicar arredondamento via `rounded-l-lg`/`rounded-r-lg`) — solução mais simples
2. `MonthYearPicker.tsx`: adicionar um ícone de calendário (`Calendar`, de `lucide-react`) antes do texto do mês/ano, e um `ChevronDown` pequeno depois do texto (com rotação quando `open`), para indicar visualmente que é um seletor/dropdown clicável
3. `MovimentacoesScreen.tsx`: agrupar visualmente os controles do cabeçalho em blocos por função, separados por uma divisória fina (`border-l` com padding), na ordem já existente:
   - Grupo 1: botão Fechar/Reabrir mês
   - Grupo 2: seletor de mês/ano (`MonthYearPicker`) + `CalendarSubViewToggle` (quando calendário)
   - Grupo 3: toggle Lista/Calendário (`ViewModeToggle`)
   - Grupo 4: botões de ação (Nova receita, Nova despesa, Movimentar reserva) — quando aplicável

### Fora do escopo

- Qualquer mudança de lógica/dados (cálculos, queries, mutations)
- Mudança na ordem lógica dos grupos definida no plano anterior
- Mudança na grade de meses em si ou na navegação de ano dentro do popover (só a causa do popover não aparecer)
- Mudança na seção de limite de cartão

## Leitura de contexto

- `sistema financas/CLAUDE.md`
- `src/screens/finance/MonthYearPicker.tsx` (lido por completo)
- `src/screens/finance/MovimentacoesScreen.tsx` (lido por completo, cabeçalho já mapeado)

## Impacto por área

### Frontend

**Componentes:**
- `src/screens/finance/MonthYearPicker.tsx`: remover `overflow-hidden` do container pai (cantos internos ficam quadrados, decisão aceita); adicionar ícones `Calendar` (antes do texto) e `ChevronDown` (depois do texto, rotacionado quando `open`), sem alterar a lógica de abertura/fechamento do popover
- `src/screens/finance/MovimentacoesScreen.tsx`: envolver cada grupo de controles do cabeçalho em um wrapper com `border-l border-slate-200 dark:border-slate-700 pl-2` (exceto o primeiro grupo), mantendo o `flex flex-wrap items-center gap-2` externo

**Sem alteração:** hooks, query keys, estados de loading/error/empty, lógica de negócio

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `src/screens/finance/MonthYearPicker.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`

## Estratégia de implementação

1. Em `MonthYearPicker.tsx`: remover `overflow-hidden` da `div` container (linha 52) — sem substituir por outro tratamento de borda
2. Em `MonthYearPicker.tsx`: importar `Calendar` e `ChevronDown` de `lucide-react`; adicionar `<Calendar size={14} />` antes do texto do mês/ano (dentro do botão central) e `<ChevronDown size={13} />` depois do texto, com leve rotação (`rotate-180`) quando `open` para feedback de estado aberto/fechado
3. Em `MovimentacoesScreen.tsx`: agrupar os controles do cabeçalho em wrappers `<div className="flex items-center gap-2 border-l border-slate-200 pl-2 first:border-l-0 first:pl-0 dark:border-slate-700">` por grupo funcional (fechar mês | período+subview | toggle lista/calendário | ações)
4. Rodar `npx tsc --noEmit -p .` e `npx vite build`
5. Testar visualmente: popover do mini calendário abre e aparece corretamente (bug corrigido), ícone/seta aparecem no seletor, divisórias aparecem entre grupos sem quebrar o `flex-wrap` em tela estreita, dark mode ok

## Regras de negócio identificadas

Nenhuma — mudança puramente visual.

## Regras multi-tenant e segurança

Não aplicável.

## Validações necessárias

Nenhuma validação de input nova.

## Testes necessários

### Frontend

- Popover da grade de meses abre e é visível ao clicar no texto do mês/ano (bug corrigido)
- Ícone de calendário e seta aparecem no `MonthYearPicker`, seta gira quando popover abre
- Cantos internos dos botões de seta ficam quadrados (aceito, sem `overflow-hidden`) — checar que a borda externa do grupo ainda parece coesa
- Divisórias entre grupos aparecem corretamente em modo Lista e Calendário
- Layout não quebra em tela estreita (`flex-wrap` continua funcionando)

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- Divisórias (`border-l`) podem ficar estranhas quando um grupo quebra de linha no `flex-wrap` — usar `first:border-l-0` por grupo e testar em tela estreita
- Ícones adicionais no `MonthYearPicker` não podem aumentar demais a largura do botão a ponto de quebrar o layout compacto

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Popover da grade de meses aparece corretamente ao clicar (bug do `overflow-hidden` corrigido)
- Seletor de mês visualmente identificável como clicável (ícone de calendário + seta)
- Botões do cabeçalho agrupados visualmente por função, com separadores discretos
- `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhuma mudança de dado/lógica introduzida

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Seguir `sistema financas/CLAUDE.md`
- Mudança pequena e focada — não tocar em mais nada do cabeçalho além do indicado
