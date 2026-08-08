# Plano de Implementação: PWA Mobile-First — Sistema Finanças

## Origem

- Arquivo de especificação: `.portal/tasks/pwa-mobile-first-sistema-financas.md`
- Data do planejamento: `2026-08-08`
- Classificação: `frontend-only`

## Resumo

Tornar as telas e fluxos principais do sistema finanças (navegação, lançamento de despesas/receitas, tabelas de Despesas/Receitas/Relatórios) usáveis em smartphone, via responsividade real (breakpoints Tailwind) — sem alterar a experiência desktop existente. Implementação em 4 etapas sequenciais dentro deste mesmo plano.

## Escopo

### Dentro do escopo

- `Dialog` e tokens de formulário compartilhados (`dialogFormTokens.tsx`) — fundação responsiva
- `MonthSelector`, header do `AppShell` (alvos de toque)
- `ExpenseDialog`, `IncomeDialog`, `PaymentModal`, `BatchPaymentModal` — grids colapsam em 1 coluna
- `DespesasScreen`, `ReceitasScreen`, `RelatoriosScreen` — versão em cards abaixo de `md` (768px), com menu kebab de ações
- Gráficos de pizza do Dashboard (ajuste de empilhamento em telas estreitas)

### Fora do escopo

- Backend/API, banco de dados, migrations
- Bottom navigation bar (mudança de arquitetura de navegação — fica para depois)
- Notificações push / service worker avançado / offline
- Publicação em lojas de app

## Leitura de contexto

- `AGENT.md` e `CLAUDE.md` da raiz de `sistema financas/` (regras de workflow seguidas; seção multi-tenant/RLS desconsiderada por não se aplicar a este domínio)
- `.portal/tasks/pwa-mobile-first-sistema-financas.md`
- Código lido: `AppShell.tsx`, `MonthSelector.tsx`, `ExpensePanel.tsx`, `DespesasScreen.tsx`, `ExpenseDialog.tsx`, `PaymentModal.tsx`, `dialog.tsx`, `dialogFormTokens.tsx`, `IncomeDialog.tsx`, `BatchPaymentModal.tsx`, `package.json`

## Impacto por área

### Frontend

Ver Estratégia de Implementação abaixo. Sem impacto em hooks de dados/query keys — só componentes de apresentação.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/ui/dialog.tsx`
- `src/ui/dialogFormTokens.tsx`
- `src/screens/finance/MonthSelector.tsx`
- `src/layout/AppShell.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/screens/finance/PaymentModal.tsx`
- `src/screens/finance/BatchPaymentModal.tsx`
- `src/screens/despesas/DespesasScreen.tsx` (+ novo componente de card, ex. `ExpenseCard.tsx`)
- `src/screens/receitas/ReceitasScreen.tsx` (+ novo componente de card, ex. `IncomeCard.tsx`)
- `src/screens/relatorios/RelatoriosScreen.tsx` (+ novo componente de card, ex. `ReportCard.tsx`)
- `src/screens/finance/FinanceDashboard.tsx` (ajuste leve nos gráficos de pizza)

## Estratégia de implementação

**Etapa 1 — Fundação responsiva**

1. `src/ui/dialog.tsx`: padding do header/body vira responsivo (`px-4 sm:px-[26px]`), preservando o bottom-sheet já existente.
2. `src/ui/dialogFormTokens.tsx`: `cardStyle` troca `margin: '0 26px 10px'` fixo por token responsivo equivalente (compatível com o novo padding do Dialog). `fieldInputStyle` permanece `width: 100%` (já correto). Inputs intencionalmente compactos (`smallInputStyle` 168px, `numericInputStyle` 76px) ficam como estão.

**Etapa 2 — Shell e navegação**

3. `src/screens/finance/MonthSelector.tsx`: abaixo de `sm`, pills de mês viram scroll horizontal com CSS snap (`overflow-x-auto snap-x snap-mandatory`), mantendo os mesmos botões — sem introduzir select nativo.
4. `src/layout/AppShell.tsx`: botões do header (hambúrguer, tema, notificações — hoje `h-8 w-8`) crescem para ~44px em mobile via classe responsiva, mantendo tamanho compacto em desktop (`lg:`).

**Etapa 3 — Formulários e diálogos**

5. `src/screens/finance/ExpenseDialog.tsx`: grids `1.35fr 1fr` (2x) e `repeat(4,1fr)`/`repeat(3,1fr)` colapsam para 1 coluna abaixo de `sm`; campo de valor (`width: 260`) vira `w-full max-w-[260px]`.
6. `src/screens/finance/IncomeDialog.tsx`: grid `1fr 168px` (linha 404) colapsa para 1 coluna em mobile, mesmo padrão do ExpenseDialog.
7. `src/screens/finance/PaymentModal.tsx`: grid `1fr 1fr` colapsa para 1 coluna em mobile.
8. `src/screens/finance/BatchPaymentModal.tsx`: herda automaticamente os ajustes de `dialog.tsx`/`dialogFormTokens.tsx` da Etapa 1; sem grids próprios a alterar.

**Etapa 4 — Tabelas em cards**

9. Criar componente de card por tela (nomenclatura final em inglês: `ExpenseCard.tsx`, `IncomeCard.tsx`, `ReportCard.tsx`), reaproveitando o padrão visual já existente em `ExpensePanel.tsx`.
10. `DespesasScreen.tsx`, `ReceitasScreen.tsx`, `RelatoriosScreen.tsx`: tabela atual fica `hidden md:block`; nova lista de cards fica `md:hidden`, breakpoint único de 768px para as 3 telas.
11. Ações de linha (3 botões colados hoje) viram menu kebab (⋮) no card mobile, abrindo as mesmas 3 ações; tabela desktop não muda.
12. Ajuste leve no empilhamento dos gráficos de pizza do `FinanceDashboard.tsx` em telas estreitas (`flex-col sm:flex-row` no container gráfico+legenda).

## Regras de negócio identificadas

Nenhuma regra de negócio financeira é alterada — mudança é puramente de apresentação/layout.

## Regras multi-tenant e segurança

Não aplicável — o "sistema financas" não é multi-tenant/multi-prefeitura (ver observação na task de origem sobre o `AGENT.md` genérico do projeto). Nenhuma alteração de permissão, visibilidade de dados ou origem de tenant está envolvida nesta mudança de puro layout/responsividade.

## Requisitos de Migração ou Compatibilidade

Nenhuma migração de dados é necessária. Compatibilidade com a experiência desktop atual deve ser preservada integralmente — as mudanças são responsivas (mobile-first como adição), não uma reescrita do layout desktop.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável a esta implementação, que não envolve banco de dados — mantido por padrão do processo.)

## Validações necessárias

Nenhuma validação de schema/input (zod) é alterada.

## Testes necessários

### Frontend

- Testes manuais em 320px, 375px, 414px e desktop (≥1024px) para: Dashboard, Despesas, Receitas, Relatórios, ExpenseDialog, IncomeDialog, PaymentModal, BatchPaymentModal.
- Conferir ausência de overflow horizontal em cada tela/diálogo.
- Conferir paridade de dados/ações entre tabela desktop e card mobile.
- Conferir que o menu kebab abre as 3 ações corretas e que nenhuma regressão ocorre em desktop (tabela continua com os 3 botões visíveis).

### Backend

Não aplicável — sem mudança de backend.

### E2E

Não aplicável — sem suíte de testes automatizados configurada no projeto (confirmado: `package.json` só tem `dev`/`build`/`preview`).

## Comandos de validação sugeridos

```bash
npm run build
```

Não há `lint`/`typecheck`/`test` configurados como scripts separados — `tsc` roda dentro do `vite build`.

## Riscos e pontos de atenção

- `dialog.tsx` e `dialogFormTokens.tsx` são compartilhados por múltiplos diálogos (`ExpenseDialog`, `IncomeDialog`, `PaymentModal`, `BatchPaymentModal`, `AttachmentPreviewDialog` e outros) — qualquer regressão na Etapa 1 se propaga para todos. Validar visualmente cada um após a Etapa 1.
- Sem testes automatizados: todo risco de regressão é coberto apenas por verificação manual.
- Escopo amplo (12 passos, ~12 arquivos + novos componentes) — implementação seguirá a ordem das 4 etapas, permitindo checkpoint visual entre elas mesmo dentro de uma única aprovação de plano.
- `ExpenseDialog.tsx` tem lógica de estado complexa (múltiplos `useEffect` interdependentes) — a Etapa 3 deve alterar apenas `style`/`className` de layout, sem tocar na lógica de formulário.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Nenhuma das telas/diálogos listados apresenta overflow horizontal entre 320px e 414px.
- Despesas, Receitas e Relatórios exibem cards empilhados em mobile com paridade de dados/ações em relação à tabela desktop.
- ExpenseDialog, IncomeDialog, PaymentModal e BatchPaymentModal exibem campos em 1 coluna em mobile, sem overflow.
- MonthSelector é legível e tocável com precisão em smartphone.
- Botões de ação no header e nas linhas/cards têm alvo de toque próximo de 44px, ou estão consolidados em menu kebab.
- Experiência desktop permanece visual e funcionalmente idêntica à atual.
- Build (`npm run build`) passa sem erros de TypeScript.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, seguido de `.portal/tasks/pwa-mobile-first-sistema-financas.md` para contexto adicional.
- Seguir `AGENT.md`/`CLAUDE.md` da raiz de `sistema financas/`, desconsiderando as seções multi-tenant/RLS.
- Implementar na ordem das 4 etapas; após cada etapa, é aceitável parar para checkpoint visual antes de seguir, mesmo sem nova aprovação formal de plano.
- Não alterar lógica de negócio, validações de schema (zod) ou chamadas de API — apenas layout/estilo/responsividade.
- Manter nomenclatura de arquivos/componentes novos em inglês (`ExpenseCard.tsx`, `IncomeCard.tsx`, `ReportCard.tsx`), mesmo que o restante do código-base use nomes em português (tratar como legado).
- Não executar migrations.
- Manter alterações pequenas e focadas por etapa.
