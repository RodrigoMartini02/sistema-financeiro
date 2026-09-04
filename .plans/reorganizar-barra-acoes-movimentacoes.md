# Plano de Implementação: Reorganizar barra de ações de Movimentações

## Origem

- Arquivo de especificação: nenhum `.md` dedicado — escopo definido em conversa direta com o usuário, a partir de um print da barra de ações atual.
- Data do planejamento: `2026-09-04`
- Classificação: `frontend-only`

## Resumo

Reorganizar a barra de ações do topo de Movimentações: mover "Fechar/Reabrir mês" para dentro do grupo de ações à direita (junto de Nova receita/despesa/Reserva, visível só na visualização Lista), transformar "Movimentar reserva" em botão só-ícone com tooltip, e separar visualmente a barra em dois grupos — seletor de mês + toggle Lista/Calendário à esquerda, ações à direita — usando `justify-between`.

## Escopo

### Dentro do escopo

- Reestruturar o container `flex flex-wrap items-center gap-2` da barra de ações em dois grupos: esquerda (`MonthYearPicker` + `CalendarSubViewToggle` quando `isCalendario` + `ViewModeToggle` quando `!isPlanning`) e direita (Fechar/Reabrir mês, Nova receita, Nova despesa, Reserva), com `justify-between` no wrapper pai para empurrar o grupo da direita.
- Mover o bloco de "Fechar/Reabrir mês" (incluindo `FirstAccessGuideCard` e a mensagem de erro `mesActionError`) para dentro do grupo condicional `!isCalendario && !isPlanning`, posicionado imediatamente à esquerda do botão de Reserva, como primeiro item do grupo da direita.
- Transformar o botão "Movimentar reserva" em botão só-ícone: remover o texto filho, manter `icon={<PiggyBank size={15} />}`, adicionar `aria-label="Movimentar reserva"` e `title="Movimentar reserva"`, ajustar `className` para padding quadrado (ex.: `!px-2.5` ou equivalente) em vez do padding retangular padrão do `Button`.
- Preservar toda a lógica existente: first-access guides (`fecharMesGuide`, `novaReceitaGuide`, `novaDespesaGuide`, `reservaGuide`), estados de loading/disabled dos mutations, `mesActionError`, e os condicionais `isCalendario`/`isPlanning`/`isLista`.

### Fora do escopo

- Qualquer mudança de comportamento/lógica de negócio (fechamento de mês, criação de receita/despesa, movimentação de reserva).
- Mudanças em outras telas (Despesas, Receitas, Calendário, Planejamento) além do container do header em `MovimentacoesScreen.tsx`.
- Mudanças no componente `Button` genérico (`ui/button.tsx`) — ajuste de padding será feito via `className` local, não alterando o componente compartilhado.
- Alteração das mensagens/textos dos guias de primeiro acesso.

## Leitura de contexto

- `AGENT.md` (raiz de `sistema financas`) — lido; template genérico multi-tenant/backend sem regras específicas de UI aplicáveis a esta mudança.
- `CLAUDE.md` (raiz do workspace e raiz de `sistema financas`) — lido; regras de workflow obrigatório (`/planejar` → aprovação explícita → `/implementar` → `/finalizar`).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Arquivos do projeto inspecionados: `src/screens/finance/MovimentacoesScreen.tsx` (header/JSX completo, hooks, mutations), `src/ui/button.tsx`.

## Impacto por área

### Frontend

- **`src/screens/finance/MovimentacoesScreen.tsx`**: reestruturação do JSX do header (bloco da barra de ações, atualmente entre a abertura do `return` e o toggle de abas). Sem mudança de hooks, queries, mutations ou estado — puramente reorganização de markup/classes Tailwind.
- Sem impacto em hooks de dados, query keys ou services.
- Sem suíte de testes frontend automatizada identificada — validação manual via `/run`.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`

## Estratégia de implementação

1. Envolver o container `<div className="flex flex-wrap items-center gap-2">` em um wrapper com `justify-between`, criando dois grupos filhos: esquerdo e direito.
2. Grupo esquerdo: mover `MonthYearPicker` + `CalendarSubViewToggle` (condicional `isCalendario`) e o `ViewModeToggle` (condicional `!isPlanning`) para cá, mantendo os separadores visuais (`border-l`) apropriados entre eles.
3. Grupo direito: dentro do condicional existente `!isCalendario && !isPlanning`, adicionar o bloco de Fechar/Reabrir mês (com guide e `mesActionError`) como primeiro item, seguido de Nova receita, Nova despesa e Reserva, nessa ordem.
4. Ajustar o botão de Reserva: remover children de texto, adicionar `aria-label`/`title`, ajustar padding via `className` para ficar compacto/quadrado (mantendo altura consistente com os demais botões do grupo).
5. Revisar espaçamentos/`border-l` entre os itens do grupo direito para manter a separação visual coerente com o padrão atual (hoje cada bloco tinha `border-l border-slate-200 pl-2` entre si).
6. Rodar `/run` e validar visualmente: visualização Lista (grupo completo à direita, Fechar mês junto da Reserva com ícone só), visualização Calendário (grupo direito inteiro some, só sobra seletor de mês + toggle Lista/Calendário à esquerda), aba Planejamento (mesmo comportamento do Calendário), tooltip do botão de Reserva, dark mode, guides de primeiro acesso ainda aparecendo nas posições corretas (floating placement `top`/`align right` pode precisar de ajuste fino dependendo da nova posição).

## Regras de negócio identificadas

- Nenhuma nova regra de negócio — comportamento funcional idêntico ao atual, apenas reposicionamento visual.
- Confirmado com o usuário: o grupo de ações da direita (incluindo Fechar/Reabrir mês) passa a ser visível somente na visualização Lista, alinhado ao comportamento que Nova receita/despesa/Reserva já tinham.

## Regras multi-tenant e segurança

Não aplicável — mudança de UI/layout client-side, sem novos endpoints, queries ou dados sensíveis.

## Validações necessárias

- Confirmar que os `FirstAccessGuideCard` (floating, placement `top`, align `right`) continuam posicionados corretamente perto de cada botão após o reposicionamento — pode ser necessário ajustar `align`/`placement` do guia de Fechar mês já que ele muda de vizinhança.
- Confirmar que o botão de Reserva com padding ajustado mantém altura alinhada aos outros botões do grupo (não deve "pular" verticalmente).

## Testes necessários

### Frontend

- Validação manual: visualização Lista — ordem e agrupamento corretos (esquerda: seletor de mês + Lista/Calendário; direita: Fechar mês, Nova receita, Nova despesa, Reserva-ícone).
- Validação manual: visualização Calendário — grupo direito não aparece, layout não quebra.
- Validação manual: aba Planejamento — mesmo comportamento do Calendário.
- Validação manual: hover no botão de Reserva mostra tooltip "Movimentar reserva"; inspeção confirma `aria-label`.
- Validação manual: dark mode em todos os elementos tocados.
- Validação manual: guias de primeiro acesso (`fecharMesGuide`, `novaReceitaGuide`, `novaDespesaGuide`, `reservaGuide`) continuam abrindo nas posições corretas sem sobreposição.
- Validação manual: responsividade (`flex-wrap`) em telas estreitas — grupo direito não deve quebrar de forma estranha.

### Backend

`Sem impacto esperado`

### E2E

Não aplicável — sem suíte E2E identificada no projeto.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- Botão de Fechar/Reabrir mês deixa de aparecer em Calendário/Planejamento — mudança de comportamento visível, já validada e aprovada pelo usuário nesta conversa.
- Reposicionamento pode exigir ajuste fino de `align`/`placement` dos `FirstAccessGuideCard` para não sobrepor outros elementos, especialmente o guia de Fechar mês que muda de vizinhança.
- Botão só-ícone precisa de padding cuidadoso para não ficar desalinhado em altura com os botões vizinhos que têm texto.
- Nenhuma migration ou alteração de banco envolvida.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões pendentes já resolvidas com o usuário.

## Decisões aplicadas

- Decisão 1 (layout geral): esquerda = seletor de mês + toggle Lista/Calendário; direita = os 4 botões de ação.
- Decisão 2 (acessibilidade do botão de reserva): ícone + `aria-label` + `title` (tooltip nativo).
- Decisão 3 (visibilidade do Fechar mês): passa a ficar visível somente na visualização Lista, junto do resto do grupo da direita.

## Critérios de aceite do plano

- Na visualização Lista, a barra mostra: esquerda (seletor de mês + toggle Lista/Calendário), direita (Fechar/Reabrir mês, Nova receita, Nova despesa, Reserva-ícone-com-tooltip), com espaço entre os dois grupos.
- Em Calendário/Planejamento, a barra mostra apenas o grupo esquerdo (seletor de mês + toggle quando aplicável).
- O botão de Reserva exibe apenas o ícone `PiggyBank`, com tooltip "Movimentar reserva" ao hover e `aria-label` para acessibilidade.
- Nenhuma lógica de negócio, mutation, query ou first-access guide foi alterada em comportamento — apenas posição visual.
- `npm run build` passa sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — não há nenhuma nesta mudança.
- Manter alterações restritas a `MovimentacoesScreen.tsx`.
- Validar visualmente no navegador (via `/run`) antes de considerar concluído — é ajuste de UI que exige conferência visual.
- Prestar atenção especial ao reposicionamento dos `FirstAccessGuideCard` para não quebrar o placement visual.
