# Plano de Implementação: Padronizar botões/toggles da barra de Movimentações (estilo outline clean)

## Origem

- Arquivo de especificação: pedido direto no chat (sem arquivo `.md` de feature)
- Data do planejamento: 2026-09-21
- Classificação: `frontend-only`

## Resumo

Os controles de ação/toggle na barra de ferramentas de Movimentações (Nova receita, Nova
despesa, Lista/Calendário, Lançamentos/Planejamento) usam hoje preenchimento sólido pesado
(botões verde/vermelho sólidos) ou cápsulas agrupadoras com fundo escuro no item ativo. O
usuário considerou esse visual confuso/pesado e pediu para padronizar todos esses controles
no estilo "clean/outline" já usado no botão "Excluir despesa" dos diálogos de confirmação:
pill com borda fina, fundo branco, texto na cor semântica da ação, sem preenchimento sólido.

## Escopo

### Dentro do escopo

- Criar tokens de estilo outline reutilizáveis em `src/ui/dialogFormTokens.tsx`, ao lado dos
  já existentes (`dangerButtonStyle`, `saveButtonStyle`), reaproveitando a paleta `C`.
- "Nova receita": trocar preenchimento sólido verde por outline verde (borda fina, texto
  verde, fundo branco), mesmo padrão visual do botão de excluir.
- "Nova despesa": trocar preenchimento sólido vermelho por outline vermelho (reutiliza
  `dangerButtonStyle` diretamente, já é exatamente esse padrão).
- `ViewModeToggle` (Lista/Calendário): remover a cápsula agrupadora com fundo sólido no
  ativo; cada opção vira uma pill separada, com estilo outline destacado quando ativa.
- `MovementSectionToggle` (Lançamentos/Planejamento): mesma mudança de estrutura e estilo.

### Fora do escopo

- `MonthYearPicker` — mantém o estilo atual (decisão do usuário).
- `LancamentosTable.tsx` (tabela em si, filtros, ordenação) — nenhuma alteração.
- Qualquer lógica de estado, dados, filtro ou comportamento.
- `OrdenarChip` e `MultiFilterPanel` — não fazem parte do pedido, mantidos como estão.
- Backend, banco de dados, migrations — sem impacto.

## Leitura de contexto

- `/AGENT.md` da raiz — não existe como arquivo dedicado separado de `frontend/`/`backend/`
  neste projeto; regras já cobertas pelo `CLAUDE.md` da raiz do workspace (fluxo obrigatório
  de planejar → aprovar → implementar → finalizar), considerado.
- `frontend/AGENT.md` / `backend/AGENT.md` — não existem como arquivos dedicados neste
  projeto (estrutura sem separação de pastas `frontend/`/`backend/` na raiz; o projeto já é
  o frontend, com `backend/` como subpasta própria sem `AGENT.md` dedicado encontrado).
- `src/context/ConfirmContext.tsx` — provider do diálogo de confirmação.
- `src/ui/ConfirmDialog.tsx` — usa `dangerButtonStyle`/`saveButtonStyle` de `dialogFormTokens`.
- `src/ui/dialogFormTokens.tsx` — fonte da paleta `C` e dos tokens de botão pill outline
  (`dangerButtonStyle`, linha 78-84) e sólido (`saveButtonStyle`, linha 65-70), além do
  padrão de chip ativo/inativo (`chipStyle`, linha 98-109) usado como referência para o
  estado ativo/inativo dos toggles.
- `src/ui/button.tsx` — componente `Button` genérico; confirmado que não tem variante
  outline colorida (só `primary`, `secondary`, `ghost`, `danger`, todos sólidos/neutros).
- `src/screens/finance/MovimentacoesScreen.tsx` — arquivo alvo principal: contém
  `ViewModeToggle`, `MovementSectionToggle` e os botões "Nova receita"/"Nova despesa".

## Impacto por área

### Frontend

- `src/ui/dialogFormTokens.tsx`: adicionar tokens de estilo pill outline reutilizáveis:
  - Reaproveitar `dangerButtonStyle` já existente para a ação de despesa (vermelho).
  - Criar `successOutlineButtonStyle` (verde, usando `C.success`/`C.successBorder`) para a
    ação de receita.
  - Criar `neutralOutlineButtonStyle` (ativo) e `neutralOutlineButtonOffStyle` (inativo)
    para os toggles Lista/Calendário e Lançamentos/Planejamento, seguindo o mesmo espírito
    de `chipStyle` mas como pills separadas (sem cápsula agrupadora).
- `src/screens/finance/MovimentacoesScreen.tsx`:
  - Trocar os `<Button>` de "Nova receita"/"Nova despesa" por `<button style={...}>` usando
    os novos tokens, mantendo ícone `<Plus>`, texto e handlers (`onClick`) inalterados.
  - Reescrever `ViewModeToggle`: remover a `div` cápsula com `border`+`bg-white`; cada opção
    (Lista, Calendário) vira um `<button>` independente com pill outline própria.
  - Reescrever `MovementSectionToggle`: mesma mudança (Lançamentos, Planejamento).
  - Nenhuma mudança de estado, props, dados ou comportamento — só marcação/estilo.
- Sem impacto em hooks, query keys, forms ou estados de loading/error/empty (não tocados).
- Sem testes de frontend específicos (projeto não tem suíte automatizada para UI).

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o
ambiente atual pode estar apontando para produção. (Não se aplica a este plano — nenhuma
migration envolvida.)

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `src/ui/dialogFormTokens.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`

## Estratégia de implementação

1. Em `src/ui/dialogFormTokens.tsx`, adicionar os novos tokens de estilo (`successOutlineButtonStyle`,
   `neutralOutlineButtonStyle`, `neutralOutlineButtonOffStyle`) ao lado dos existentes,
   reaproveitando a paleta `C` já definida no arquivo.
2. Em `MovimentacoesScreen.tsx`, importar os tokens necessários (`dangerButtonStyle` para
   despesa, `successOutlineButtonStyle` para receita, tokens neutros para os toggles).
3. Substituir os botões "Nova receita"/"Nova despesa" pelo novo estilo, preservando ícone,
   texto, `onClick` e a lógica de exibição do guia de primeiro acesso (`FirstAccessGuideCard`)
   já existente ao redor deles.
4. Reescrever `ViewModeToggle` e `MovementSectionToggle` para renderizar pills separadas
   (sem `div` cápsula agrupadora), com estado ativo/inativo usando os tokens neutros.
5. Rodar `npx tsc --noEmit` e `npx vite build` para validar que nada quebrou.
6. Resumir as mudanças e perguntar sobre envio para produção.

## Regras de negócio identificadas

Nenhuma — mudança puramente visual, sem regra de negócio envolvida.

## Regras multi-tenant e segurança

`Sem impacto esperado` — não há alteração de permissões, dados ou isolamento de conta.

## Validações necessárias

- Confirmar visualmente (responsabilidade do usuário, sem acesso a browser nesta sessão)
  que os botões e toggles renderizam com o novo estilo em light/dark mode.
- Confirmar que o `hover`/estado ativo dos toggles continua legível nos dois temas.

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

- Baixo risco técnico — mudança isolada de estilo/marcação, sem tocar em lógica, dados ou
  estado.
- Tokens de estilo são objetos `CSSProperties` inline (padrão já usado no projeto para
  diálogos), não classes Tailwind — manter consistência com esse padrão em vez de misturar
  com classes Tailwind no mesmo botão, para não gerar conflito de especificidade.
- Dark mode: os tokens atuais (`C.danger`, `C.success`, etc.) não têm variante dark
  definida — replicar o mesmo comportamento que `ConfirmDialog`/`dangerButtonStyle` já têm
  hoje (que também não trata dark mode separadamente), para não introduzir inconsistência
  nova nem tentar resolver um problema pré-existente fora de escopo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões fechadas nas respostas do usuário:
outline colorido para os botões de ação, pills separadas outline para os toggles,
`MonthYearPicker` fora do escopo.

## Critérios de aceite do plano

- "Nova receita" e "Nova despesa" renderizam como pill outline (borda fina, fundo branco,
  texto na cor semântica), sem preenchimento sólido.
- `ViewModeToggle` e `MovementSectionToggle` renderizam como pills separadas (sem cápsula
  agrupadora com fundo sólido no item ativo).
- `MonthYearPicker` permanece visualmente inalterado.
- `LancamentosTable.tsx` permanece sem nenhuma alteração.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não tocar em `LancamentosTable.tsx` nem em nenhuma lógica de filtro/dados.
- Reaproveitar `dangerButtonStyle` existente para despesa; criar apenas os tokens novos
  estritamente necessários (verde para receita, neutro para toggles).
- Seguir o padrão de objetos `CSSProperties` inline já usado em `dialogFormTokens.tsx`,
  não misturar com classes Tailwind nos mesmos elementos.
- Manter todos os handlers, ícones e textos existentes — mudança é só de estilo/marcação.
