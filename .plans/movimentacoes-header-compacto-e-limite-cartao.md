# Plano de Implementação: Cabeçalho compacto de Movimentações + reposicionar limite de cartão

## Origem

- Arquivo de especificação: descrição textual do usuário (screenshot + 4 pedidos de simplificação de UI)
- Data do planejamento: 2026-09-02
- Classificação: `frontend-only`

## Resumo

Simplificação estrutural do cabeçalho da tela de Movimentações (`src/screens/finance/MovimentacoesScreen.tsx`), reduzindo divs/wrappers duplicados entre os modos Lista e Calendário, removendo um aviso redundante, trocando o indicador textual de mês fechado por cor no botão, e adicionando um seletor de mês/ano direto (mini calendário) para não depender de clicar seta por seta. Em paralelo, a exibição de limite de cartão de crédito (implementada na sessão anterior dentro do card "Comprometimento") é movida para uma seção própria, mais discreta, abaixo da fileira de cards — sem virar um card novo isolado.

## Escopo

### Dentro do escopo

1. Remover o aviso "Despesas superam receitas em R$ X neste mês" (bloco condicional `saldoProjetado < 0 && !isCalendario`), sem substituto — a informação já é visível no card "Saldo projetado"
2. Unificar os dois layouts de cabeçalho hoje duplicados (`isCalendario` vs. não) em um único bloco compacto, com `flex flex-wrap` natural — sem título `<h2>Movimentações</h2>` (redundante, já visível no menu lateral), contendo: botão Fechar/Reabrir mês, novo seletor de mês/ano, toggle Lista/Calendário, e os botões de ação (Nova receita, Nova despesa, Movimentar reserva — ocultos no modo Planejamento, como já é hoje)
3. Novo componente `MonthYearPicker.tsx`: ao clicar no texto do mês/ano atual, abre um popover com grade de 12 meses do ano exibido + setas para trocar de ano dentro do próprio popover (sem limite pré-calculado nem chamada nova ao backend) — permite pular direto para qualquer mês. As setas `<`/`>` de navegação rápida (mês anterior/seguinte) são mantidas ao lado, fora do popover
4. Remover o texto/bolinha "Mês aberto"/"Mês fechado" de `CompactPeriodSelector.tsx` (ou incorporar a lógica ao novo componente, descontinuando o antigo se fizer sentido na implementação)
5. Botão "Fechar mês"/"Reabrir mês" ganha uma cor diferenciada quando o mês está fechado (via `className` sobre o `Button` existente, mesmo padrão já usado em "Nova receita"/"Nova despesa"), substituindo a necessidade do texto indicador separado
6. Mover a renderização de `CardLimitRow` (uma linha por cartão de crédito) para uma seção nova e compacta, posicionada entre a fileira dos 4 cards (Saldo atual, Despesas, Saldo projetado, Comprometimento) e o restante do conteúdo da tela — não dentro de nenhum card existente, não como um card novo isolado
7. Reverter a prop `children` de `MovementMetricCard.tsx` (fica sem nenhum uso após a mudança do item 6) e a integração atual dentro do card "Comprometimento"

### Fora do escopo

- Qualquer mudança na lógica de cálculo do limite de cartão (`cardLimitService.ts`, `cardLimitsService.ts`, rota `GET /api/cartoes/limites`) — já implementada e funcionando, este plano é só sobre onde/como exibir
- Qualquer mudança em `ExpenseDialog.tsx` (texto de limite disponível, já corrigido em plano anterior)
- Buscar "primeira data com lançamento" do backend para limitar o range de anos do novo seletor — decisão do usuário: não é necessário, o popover navega de ano livremente com suas próprias setas internas
- Mudanças em outras telas (Painel, Cartões, etc.)
- Mudanças no modo Calendário além da unificação do cabeçalho (a visão de calendário em si não muda)

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto; não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- `src/screens/finance/MovimentacoesScreen.tsx` (lido por completo — cabeçalho, aviso de saldo negativo, integração do limite de cartão)
- `src/screens/finance/CompactPeriodSelector.tsx` (lido por completo)
- `src/screens/finance/MovementMetricCard.tsx` (lido por completo, incluindo a prop `children` adicionada na sessão anterior)
- `src/screens/finance/CardLimitRow.tsx` (componente já existente, reaproveitado sem alteração)
- `src/screens/finance/DashboardPeriodFilter.tsx` (investigado como possível referência — descartado: é um filtro de range com texto livre `dd/mm/aaaa`, não uma grade de seleção de mês único; o novo seletor será um componente novo)
- `src/ui/button.tsx` (confirma suporte a `className` para sobrescrever estilo, padrão já usado em botões desta mesma tela)
- Confirmado por grep: `MovementMetricCard` e sua prop `children` são usados apenas em `MovimentacoesScreen.tsx`, exclusivamente pelo card "Comprometimento" — seguro remover sem efeito colateral em outro lugar

## Impacto por área

### Frontend

**Telas:**
- `src/screens/finance/MovimentacoesScreen.tsx`: remoção do aviso de saldo negativo; unificação dos dois blocos de cabeçalho em um só; nova seção de limite de cartão fora da fileira de cards; remoção da integração `children` no card Comprometimento

**Componentes:**
- Novo `src/screens/finance/MonthYearPicker.tsx`: popover de seleção direta de mês/ano (grade de 12 meses + navegação de ano interna), substituindo/absorvendo `CompactPeriodSelector.tsx`
- `src/screens/finance/MovementMetricCard.tsx`: remover a prop `children` (fica sem uso)
- `src/screens/finance/CardLimitRow.tsx`: sem alteração de código, só de posição de uso

**Hooks/query keys:** sem alteração — os dados (`cardLimits`, `mesFechado`, `month`/`year`) já existem e continuam vindo das mesmas queries

**Estados de loading/error/empty:** sem alteração de comportamento — a seção de limite de cartão continua não renderizando nada quando não há cartões de crédito ativos (mesmo comportamento já implementado)

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/MonthYearPicker.tsx` (novo)
- `src/screens/finance/CompactPeriodSelector.tsx` (removido ou substituído)
- `src/screens/finance/MovementMetricCard.tsx`

## Estratégia de implementação

1. Criar `MonthYearPicker.tsx`: botão com texto do mês/ano (abre popover ao clicar) + setas `<`/`>` de navegação rápida ao lado; dentro do popover, grade de 12 meses do ano em exibição + setas para trocar o ano do popover (independente do ano selecionado); ao clicar num mês, aplica a seleção e fecha o popover
2. Incorporar a cor de "mês fechado" ao próprio botão Fechar/Reabrir mês em `MovimentacoesScreen.tsx` (via `className`), removendo a necessidade do indicador textual
3. Remover `CompactPeriodSelector.tsx` (ou mantê-lo apenas se algo mais o usar — confirmar via grep antes de deletar) e substituir seu uso por `MonthYearPicker`
4. Remover o bloco do aviso "Despesas superam receitas"
5. Unificar os dois blocos de cabeçalho (`isCalendario` vs. não) em um único JSX compacto com `flex flex-wrap items-center gap-2`, sem `<h2>Movimentações</h2>`
6. Mover o bloco de `CardLimitRow` para fora do card Comprometimento, para uma nova `<div>` compacta entre a fileira de cards e o restante do conteúdo
7. Remover a prop `children` de `MovementMetricCard.tsx`
8. Rodar `npx tsc --noEmit -p .` e `npx vite build`
9. Testar visualmente: cabeçalho em modo Lista e Calendário, popover de mês/ano abrindo/fechando corretamente e navegando entre anos, cor do botão Fechar/Reabrir mês, seção de limite de cartão na nova posição, responsividade (`flex-wrap`) em tela estreita

## Regras de negócio identificadas

Nenhuma regra de negócio nova — mudança é de apresentação/organização visual, sem alterar nenhum cálculo ou dado exibido.

## Regras multi-tenant e segurança

Não aplicável — mudança puramente visual em tela já protegida por autenticação existente.

## Validações necessárias

Nenhuma validação de input nova — o popover de mês/ano só precisa garantir que a seleção sempre resulte em um mês/ano válido (0-11 / número), sem input livre de texto.

## Testes necessários

### Frontend

- Cabeçalho compacto renderiza corretamente em modo Lista e modo Calendário, sem duplicação de código entre os dois
- Popover de mês/ano abre ao clicar, mostra os 12 meses do ano corrente, permite trocar de ano dentro do popover, e aplica a seleção corretamente ao `month`/`year` da tela
- Setas `<`/`>` continuam navegando 1 mês por vez, independente do popover
- Botão Fechar/Reabrir mês muda de cor conforme `mesFechado`, sem mais o texto indicador separado
- Seção de limite de cartão aparece corretamente abaixo da fileira de 4 cards, sem cartões de crédito ativos não renderiza nada
- Aviso de saldo negativo não aparece mais em nenhum cenário

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

- Unificar os dois layouts de cabeçalho pode exigir ajuste fino de `flex-wrap`/`gap` para não ficar visualmente desequilibrado em telas médias (nem muito espremido, nem com quebra de linha feia)
- O popover de mês/ano precisa fechar corretamente ao clicar fora (mesmo padrão de outros popovers/dropdowns já existentes no projeto, ex.: `AccountMenu.tsx`) — reaproveitar esse padrão de "clique fora fecha" em vez de reinventar
- Confirmar, antes de deletar `CompactPeriodSelector.tsx`, que nenhuma outra tela o importa (grep já indicou uso restrito a esta tela, mas revalidar no momento da implementação)

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisão de range de anos já resolvida (popover com navegação de ano própria, sem busca de dado histórico).

## Critérios de aceite do plano

- Aviso de saldo negativo removido
- Cabeçalho de Movimentações em uma única estrutura compacta, sem duplicação entre modo Lista e Calendário, sem o título "Movimentações"
- Novo seletor de mês/ano funcional, permitindo pular direto para qualquer mês/ano sem clicar seta por seta
- Texto "Mês aberto/fechado" removido, substituído por cor no botão Fechar/Reabrir mês
- Limite de cartão exibido em seção própria, discreta, fora do card Comprometimento e sem ser um card novo isolado
- `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhuma mudança de dado/cálculo introduzida

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Priorizar simplificação estrutural real (menos wrappers/condicionais duplicadas) sobre apenas ajuste visual superficial, conforme pedido explícito do usuário ("eliminamos um monte de divs e limpamos o ambiente")
- Confirmar que `CompactPeriodSelector.tsx` não é usado em nenhum outro lugar antes de removê-lo
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados)
- Validar visualmente no navegador antes de considerar a tarefa concluída, já que é uma mudança de UI
