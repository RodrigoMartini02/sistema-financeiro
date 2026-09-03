# Plano de Implementação: Cards individuais no topo do Painel + correção de overflow

## Origem

- Arquivo de especificação: descrição textual do usuário (screenshots do Painel financeiro)
- Data do planejamento: 2026-09-02
- Classificação: `frontend-only`

## Resumo

Separar os 5 indicadores do topo do Painel financeiro (Saldo do período, Saldo anterior, Receitas, Despesas, Comprometimento) — hoje reunidos dentro de um único `<Card>` com divisórias internas — em 5 cards independentes, seguindo o mesmo padrão visual (borda, sombra, cantos arredondados) já usado pelos cards da seção "Análise do período" logo abaixo. A barra "Receitas x Despesas", hoje no rodapé desse mesmo card, é mantida exatamente como está — o usuário confirmou explicitamente que não quer removê-la, só separar os cards de indicadores.

Em paralelo, o usuário pediu uma revisão geral dos demais cards da seção "Análise do período" para garantir que nenhum conteúdo "toque as bordas" ou vaze do card. Essa revisão já foi feita nesta conversa, card por card: dos 6 cards analisados (Juros × Descontos, Composição das despesas, Saúde financeira, Receitas por origem, Forma de pagamento, Parcelas futuras), 5 usam apenas texto fixo do sistema (labels como "Receitas recebidas", nomes de mês) ou valores numéricos formatados — sem risco real de overflow, mesmo sem proteção explícita, porque o texto nunca vem de input livre do usuário. O único ponto de risco real confirmado está no componente compartilhado `DonutChart.tsx` (usado por "Receitas por origem" e "Forma de pagamento"): a legenda renderiza o nome da categoria de despesa ou da forma de pagamento — que é texto vindo diretamente de dado cadastrado pelo usuário — sem `truncate`/`min-w-0`, podendo estourar o alinhamento `justify-between` ou o próprio card quando o nome for longo.

## Escopo

### Dentro do escopo

- Extrair os 5 indicadores do topo (`FinanceDashboard.tsx`, hoje linhas 198-251) de dentro do card único para 5 `<Card>` independentes, com o mesmo padrão visual dos demais cards da tela
- Manter a barra "Receitas x Despesas" (hoje linhas 253-275) exatamente como está, sem nenhuma alteração de conteúdo, estrutura ou posição relativa (continua logo abaixo dos indicadores)
- Corrigir `DonutChart.tsx`: adicionar proteção contra nome de categoria/forma de pagamento longo na legenda (linha 53), com `title` (tooltip nativo) para consulta do nome completo
- Limpar o conflito de estilo no wrapper do gráfico (`DonutChart.tsx` linha 21: `width: SIZE` inline junto com classe `w-full`)
- Validação visual com dado real (nome de categoria longo) antes de considerar concluído

### Fora do escopo

- Qualquer mudança de dado ou cálculo exibido nos cards (valores, percentuais, lógica de negócio)
- Remoção ou alteração de conteúdo da barra "Receitas x Despesas"
- Mudanças em outras seções do Painel: "Série temporal" (Receitas × Despesas × Saldo), "Receitas × Despesas por mês", "Cascata do período", "Carteira de contratos", `MonthCategoriesOverview`
- Mudanças nos demais cards da seção "Análise do período" (Juros × Descontos, Composição das despesas, Saúde financeira, Parcelas futuras) — revisão já concluída, nenhum risco real encontrado neles

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto; não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados — projeto sem separação de pastas, coberto pelo CLAUDE.md único)
- `src/screens/finance/FinanceDashboard.tsx` (lido por completo na seção relevante, linhas 190-557)
- `src/screens/finance/charts/DonutChart.tsx` (lido por completo)
- `src/ui/card.tsx` (componente `Card` base reutilizado por toda a tela, referenciado mas não precisa de alteração)

## Impacto por área

### Frontend

**Telas:**
- `src/screens/finance/FinanceDashboard.tsx`: bloco dos 5 indicadores (linhas 198-251) reestruturado para 5 `<Card>` separados; barra Receitas×Despesas (linhas 253-275) preservada como bloco próprio logo abaixo, sem alteração interna
- `src/screens/finance/charts/DonutChart.tsx`: legenda (linha 53) recebe `truncate`/`min-w-0` no nome da categoria, com `title={s.name}` no elemento; wrapper (linha 21) tem o conflito `style={{width: SIZE}}` vs. `w-full` resolvido

**Componentes:** nenhum componente novo — reutiliza `Card` (`src/ui/card.tsx`) já usado em toda a tela

**Hooks/query keys:** sem alteração — os dados exibidos já vêm calculados no componente (`saldoFinal`, `saldoAnterior`, `receitas`, `despesas`, `txComprometimento`), a mudança é apenas de estrutura visual/DOM

**Estados de loading/error/empty:** sem alteração — o card único hoje não tem tratamento de loading/error próprio além do já existente na tela (`panoramaQ.error`, linha 190); os novos cards individuais herdam o mesmo comportamento, exibindo os valores já calculados (incluindo fallback `—` para comprometimento quando `receitas === 0`, linha 229)

### Backend

`Sem impacto esperado` — mudança puramente de apresentação no frontend, sem alteração de endpoint ou payload

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/charts/DonutChart.tsx`

## Estratégia de implementação

1. Em `FinanceDashboard.tsx`, extrair os 5 indicadores do card único (linhas 198-251) para 5 `<Card>` independentes:
   - "Saldo do período" (hoje bloco lateral com destaque, linhas 200-211)
   - "Saldo anterior" (linhas 214-217)
   - "Receitas" (linhas 218-221)
   - "Despesas" (linhas 222-225)
   - "Comprometimento" (linhas 226-249, incluindo a barra de progresso e o `FirstAccessGuideCard` associado)
   - Ajustar o grid para acomodar 5 cards de forma equilibrada em diferentes larguras de tela (mobile empilha, desktop distribui em linha), inspirado no grid já usado pela seção "Análise do período" (`grid gap-3.5 xl:grid-cols-3`), mas dimensionado para 5 itens mais estreitos
2. Manter a barra "Receitas x Despesas" (linhas 253-275) como um bloco (`<Card>` ou `<div>`, a definir mantendo a aparência atual) logo abaixo do novo grid de 5 cards, preservando 100% do conteúdo e estrutura interna atual
3. Preservar o `FirstAccessGuideCard` do card "Comprometimento" (linhas 238-248) funcionando exatamente como hoje, incluindo seu posicionamento relativo (`floating`, `placement="top"`, `align="right"`)
4. Em `DonutChart.tsx`, ajustar a legenda (linha 48-59): adicionar `min-w-0` ao `<li>` ou ao `<span>` do nome, `truncate` no `<span>` do nome da categoria, e `title={s.name}` para tooltip nativo com o nome completo
5. Em `DonutChart.tsx`, resolver o conflito de estilo do wrapper (linha 21): decidir entre manter só a classe `w-full`/`sm:w-auto` (removendo o `style` inline) ou manter só o `style` fixo (removendo `w-full`) — escolher a opção que preserva o comportamento visual atual do gráfico em todas as larguras de tela já testadas
6. Rodar `npx tsc --noEmit -p .` e `npx vite build`
7. Testar visualmente no navegador: conferir os 5 cards em desktop e mobile, conferir a barra Receitas×Despesas intacta, e simular (ou usar dado real, se existir) uma categoria de despesa ou forma de pagamento com nome longo para confirmar que o `DonutChart` não estoura mais

## Regras de negócio identificadas

Nenhuma regra de negócio nova — mudança é de apresentação visual, sem alteração de cálculo ou dado exibido.

## Regras multi-tenant e segurança

Não aplicável — projeto não tem dimensão multi-tenant; mudança é puramente visual em uma tela já protegida por autenticação existente, sem alteração de dado exposto.

## Validações necessárias

Nenhuma validação de input nova — não há formulário envolvido, apenas exibição de dados já calculados.

## Testes necessários

### Frontend

- Conferir visualmente os 5 novos cards em desktop, tablet e mobile (responsividade do grid)
- Conferir que a barra Receitas×Despesas permanece idêntica à atual (nenhuma mudança de conteúdo/posição)
- Conferir que o `FirstAccessGuideCard` do card "Comprometimento" continua aparecendo e se posicionando corretamente
- Conferir a legenda do `DonutChart` com um nome de categoria/forma de pagamento longo (usar dado real se existir na conta de teste, ou simular temporariamente para validar antes de reverter)
- Conferir que o comportamento de "Comprometimento: —" (quando `receitas === 0`) continua funcionando no novo card isolado

### Backend

Não aplicável — sem mudança de backend.

### E2E

Não aplicável para este ajuste visual pontual.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- Baixo risco geral — mudança isolada a uma tela e a um componente de gráfico compartilhado por apenas 2 cards da mesma tela
- O grid de 5 cards pode exigir ajuste fino (breakpoints) para ficar visualmente equilibrado em larguras intermediárias de tela — pode levar mais de uma iteração visual
- Ao mover o card "Comprometimento" para um card independente, garantir que o `FirstAccessGuideCard` associado (que hoje depende do posicionamento relativo do card pai) continue se posicionando corretamente

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Os 5 indicadores do topo aparecem como cards visualmente independentes, no mesmo padrão dos demais cards da tela
- A barra "Receitas x Despesas" permanece inalterada, na mesma posição relativa (logo abaixo dos indicadores)
- Nome de categoria de despesa ou forma de pagamento longo não estoura mais o card do `DonutChart` (trunca com reticências e mostra o nome completo via tooltip)
- `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhuma mudança de dado/cálculo introduzida

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Não alterar nada fora do escopo listado — em especial, não tocar na barra Receitas×Despesas nem nos demais cards da seção "Análise do período" além do `DonutChart`
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Validar visualmente no navegador antes de considerar a tarefa concluída, já que é uma mudança de UI
