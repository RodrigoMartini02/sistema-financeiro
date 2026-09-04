# Plano de Implementação: Mover Planos para Configurações + Padronizar Modais de Cobrança

## Origem

- Arquivo de especificação: nenhum `.md` de spec dedicado — escopo definido em conversa direta com o usuário.
- Data do planejamento: `2026-09-04`
- Classificação: `frontend-only`

## Resumo

A tela "Planos e cobrança" (`PlanosScreen`) hoje vive na sidebar principal como item de navegação de primeiro nível (grupo "Análise"), competindo por destaque com telas operacionais de uso diário (Painel, Movimentações, Relatórios). Por ser uma tela de configuração de conta/billing — acesso esporádico, não uso diário —, ela deve ser movida para dentro do drawer de Configurações (`ConfigPanel`), como mais uma aba ao lado de Contas, Segurança, Cartões, etc.

Ao mover a tela para dentro do drawer, os modais internos de pagamento (`PagamentoDialog`) e cancelamento (`CancelarDialog`) passam a abrir empilhados sobre o próprio drawer — reforçando a necessidade de garantir que esses modais sigam rigorosamente o padrão visual do componente `Dialog` do design system (mesma paleta/tokens usados por `ExpenseDialog`/`IncomeDialog`), sem divergências de estilo.

## Escopo

### Dentro do escopo

- Adicionar aba "Assinatura" ao `ConfigPanel`, renderizando `PlanosScreen` em modo compacto (sem header duplicado).
- Remover o item "Planos" da sidebar principal (grupo "Análise").
- Remover o grupo "Análise" da sidebar (fica com item único após a remoção); mover "Relatórios" para o grupo "Finanças".
- Adicionar prop `embedded?: boolean` ao `PlanosScreen` para ocultar o header interno quando usado dentro da aba de Configurações.
- Revisar `PagamentoDialog` e `CancelarDialog` para garantir aderência total aos tokens visuais (`C`, `labelStyle`, `fieldInputStyle`, `cardStyle`, `chipStyle`) de `dialogFormTokens`, comparando com um dialog de referência (`ExpenseDialog`/`IncomeDialog`).
- Validar visualmente que um `Dialog` (z-50) aberto por cima do `ConfigPanel` (Drawer `variant="centered"`, z-48) empilha corretamente, sem conflito visual.
- Manter suporte à navegação por URL (`?config=assinatura`), incluindo o novo item na lista `CONFIG_ITEM_IDS`.

### Fora do escopo

- Rota pública `/planos` (`PlanosPage.tsx`) — landing de marketing, não é tocada.
- `PlanExpiredGate` em `App.tsx` (tela de bloqueio em tela cheia quando plano expira/trial acaba) — continua usando `PlanosScreen` sem a prop `embedded`, comportamento atual preservado.
- Qualquer mudança de lógica de pagamento/backend (`/planos/*` endpoints).
- Refatoração de outros dialogs do sistema (`ExpenseDialog`, `IncomeDialog`, etc.) além de usá-los como referência de padrão.

## Leitura de contexto

- `AGENT.md` (raiz de `sistema financas`) — lido; é um template genérico voltado a backend multi-tenant/RLS que não se aplica diretamente a esta mudança (sem impacto em banco/tenant). Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto — a estrutura é `src/` (frontend) + `backend/` na raiz, sem AGENT.md próprio em nenhum dos dois.
- `CLAUDE.md` (raiz do workspace `Particular` e raiz de `sistema financas`) — lido; regras de workflow obrigatório (`/planejar` → aprovação explícita → `/implementar` → `/finalizar`).
- Arquivos do projeto inspecionados: `src/layout/AppShell.tsx`, `src/layout/ConfigPanel.tsx`, `src/screens/planos/PlanosScreen.tsx`, `src/ui/dialog.tsx`, `src/ui/drawer.tsx`, `src/ui/dialogFormTokens.tsx`, `src/ui/zIndex.ts`, `src/App.tsx`.

## Impacto por área

### Frontend

- **`src/layout/AppShell.tsx`**:
  - Remover `'planos'` do tipo `AppSection`.
  - Remover o grupo "Análise" de `NAV_GROUPS`; mover o item "Relatórios" para dentro do grupo "Finanças" (fica: Painel, Movimentações, Relatórios).
  - Remover a lógica de filtro `isDemoMode` que hoje exclui `'planos'` dos itens do grupo (fica órfã, já que o item deixa de existir na sidebar).
  - Adicionar `'assinatura'` ao array `CONFIG_ITEM_IDS` (usado para validar o parâmetro `?config=` da URL).

- **`src/layout/ConfigPanel.tsx`**:
  - Adicionar `'assinatura'` ao tipo `ConfigItemId`.
  - Adicionar entrada em `ITEMS` com ícone `Crown` (já usado em `PlanosScreen` para o status do plano) e label "Assinatura".
  - Renderizar `<PlanosScreen embedded />` quando `activeItem === 'assinatura'`.

- **`src/screens/planos/PlanosScreen.tsx`**:
  - Adicionar prop `embedded?: boolean` (default `false`).
  - Quando `embedded === true`: ocultar o bloco de header (título "Assinatura" / "Planos e cobrança" + botão "Atualizar status") e ajustar o wrapper externo para caber bem no espaço da aba (sem `max-w-4xl mx-auto` fixo, se necessário adaptar ao container do drawer).
  - Uso em `PlanExpiredGate` (`App.tsx`) permanece sem a prop — comportamento de tela cheia com header preservado.
  - Revisar `PagamentoDialog` e `CancelarDialog`: conferir que todo estilo inline usa os tokens de `dialogFormTokens` (`C`, `labelStyle`, `fieldInputStyle`, `cardStyle`, `chipStyle`), sem valores soltos divergentes, e comparar lado a lado com `ExpenseDialog`/`IncomeDialog` para paridade visual (raio, sombra, tipografia, espaçamento de header, botão de fechar).

- Sem impacto em hooks de dados, query keys (reaproveita `queryKeys.planStatus` já existente) ou services.
- Sem suíte de testes frontend automatizada identificada no projeto — validação será manual via `/run`.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `sistema financas/src/layout/AppShell.tsx`
- `sistema financas/src/layout/ConfigPanel.tsx`
- `sistema financas/src/screens/planos/PlanosScreen.tsx`

## Estratégia de implementação

1. Em `PlanosScreen.tsx`: adicionar prop `embedded?: boolean` (default `false`). Quando `true`, ocultar o bloco de header ("Assinatura" / "Planos e cobrança" + botão "Atualizar status") e ajustar o wrapper externo (`max-w-4xl mx-auto grid gap-6`) para caber bem dentro do espaço da aba do drawer. Uso em `PlanExpiredGate` permanece sem a prop (comportamento atual preservado).
2. Alinhar estilos de `PagamentoDialog`/`CancelarDialog` aos tokens de `dialogFormTokens`, conferindo contra um dialog de referência (`ExpenseDialog` ou `IncomeDialog`) para paridade visual exata.
3. Em `ConfigPanel.tsx`: adicionar `'assinatura'` ao `ConfigItemId`, adicionar item em `ITEMS` (ícone `Crown`), renderizar `<PlanosScreen embedded />` quando `activeItem === 'assinatura'`.
4. Em `AppShell.tsx`: remover `'planos'` de `AppSection`; remover o grupo "Análise" de `NAV_GROUPS`, movendo "Relatórios" para dentro do grupo "Finanças" (Painel, Movimentações, Relatórios); remover o filtro de `isDemoMode` para `planos` (fica órfão); adicionar `'assinatura'` a `CONFIG_ITEM_IDS`.
5. Rodar `/run` e validar manualmente: navegação sidebar → Configurações → aba Assinatura; abrir modal de pagamento e de cancelamento por cima do drawer; conferir dark mode; conferir fluxo de plano expirado (`PlanExpiredGate`) continua intacto; conferir grupo "Finanças" com 3 itens.

## Regras de negócio identificadas

- Usuário em modo demo (`isDemoMode`) nunca deve ver a aba de assinatura/planos — hoje já garantido porque `ConfigPanel` só é renderizado quando `!isDemoMode` em `AppShell.tsx`.
- Fluxo de bloqueio por plano expirado/trial encerrado (`PlanExpiredGate`) deve continuar funcionando exatamente como hoje, independente da tela normal de planos ter migrado de local na navegação.

## Regras multi-tenant e segurança

Não aplicável — mudança de UI/navegação client-side, sem novos endpoints, queries ou dados sensíveis envolvidos.

## Validações necessárias

- Confirmar que a navegação por URL (`?config=assinatura`) funciona corretamente (deep link e botão voltar do navegador via `popstate`).
- Confirmar que os botões "Assinar agora" / "Cancelar plano" dentro da aba continuam invalidando `queryKeys.planStatus` corretamente após ação.
- Confirmar que `Z_MODAL` (z-50) empilha visualmente acima de `Z_DRAWER` (z-48) sem necessidade de ajuste de código (já é o caso pela escala existente em `zIndex.ts`).

## Testes necessários

### Frontend

- Validação manual: navegação sidebar → Configurações → aba Assinatura carrega corretamente, com status do plano e cards.
- Validação manual: abrir/fechar `PagamentoDialog` e `CancelarDialog` de dentro do drawer — conferir empilhamento visual, fechamento via Esc, clique fora e botão X.
- Validação manual: comparação visual lado a lado entre `PagamentoDialog`/`CancelarDialog` e um dialog de referência (`ExpenseDialog`/`IncomeDialog`) para confirmar paridade de estilo.
- Validação manual: dark mode em todos os elementos tocados (sidebar, ConfigPanel, PlanosScreen embedded, dialogs).
- Validação manual: fluxo `PlanExpiredGate` (plano expirado/trial encerrado) continua exibindo a tela cheia normalmente, com header.
- Validação manual: grupo "Finanças" na sidebar exibe corretamente os 3 itens (Painel, Movimentações, Relatórios) e grupo "Análise" não existe mais.

### Backend

`Sem impacto esperado`

### E2E

Não aplicável — sem suíte E2E identificada no projeto.

## Comandos de validação sugeridos

```bash
npm run lint
npm run typecheck
npm run build
```

(nomes exatos de scripts a confirmar lendo `package.json` durante a implementação)

## Riscos e pontos de atenção

- `PlanosScreen` sendo reusada em dois contextos (standalone no `PlanExpiredGate` e embutida no drawer via `embedded`) exige cuidado para não duplicar cabeçalhos ou quebrar o layout em nenhum dos dois usos.
- Altura mínima do drawer (`ConfigPanel` usa `min-h-[420px]`) precisa acomodar bem os cards de planos (grid 2 colunas com conteúdo considerável) sem ficar espremido — avaliar durante validação manual.
- Nenhuma migration ou alteração de banco está envolvida nesta mudança.
- Mudança de navegação (remoção de item/grupo da sidebar) é visível a todos os usuários — validar cuidadosamente antes do `/finalizar` fazer merge direto em `main` (produção).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões pendentes já resolvidas com o usuário:

## Decisões aplicadas

- Decisão 1 (header duplicado): `PlanosScreen` recebe prop `embedded?: boolean` que oculta o header interno quando `true`; uso em `PlanExpiredGate` permanece sem a prop.
- Decisão 2 (grupo "Análise" órfão): grupo "Análise" é removido da sidebar; "Relatórios" migra para o grupo "Finanças".

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- O item "Planos" não existir mais na sidebar principal; o grupo "Finanças" contém Painel, Movimentações e Relatórios; o grupo "Análise" não existe mais.
- A aba "Assinatura" existir dentro do `ConfigPanel`, exibindo o conteúdo de `PlanosScreen` em modo `embedded`, sem header duplicado.
- `PagamentoDialog` e `CancelarDialog` estiverem visualmente indistinguíveis (em termos de raio, sombra, tipografia, espaçamento) de outros `Dialog`s de referência do sistema.
- Um `Dialog` aberto por cima do `ConfigPanel` empilhar corretamente, sem sobreposição quebrada ou conflito de z-index.
- `PlanExpiredGate` continuar funcionando exatamente como antes (tela cheia, com header, ao vencer trial/plano).
- Navegação por URL (`?config=assinatura`) funcionar corretamente.
- `npm run lint`, `npm run typecheck` e `npm run build` (ou equivalentes confirmados no `package.json`) passarem sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — não há nenhuma nesta mudança.
- Seguir `CLAUDE.md`/`AGENT.md` da raiz do projeto quanto ao workflow (`/implementar` só após este plano aprovado; `/finalizar` faz commit + push + merge direto em `main`, sem PR).
- Manter alterações pequenas e focadas nos 3 arquivos listados.
- Confirmar nomes exatos dos scripts de lint/typecheck/build lendo `package.json` antes de rodar validações.
- Validar manualmente no navegador (via `/run`) antes de considerar a tarefa concluída — este é um ajuste de UI/UX que exige conferência visual, não apenas type-check.
