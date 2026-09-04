# Plano de Implementação: Ocultar "Clientes" na sidebar para contas pessoais

## Origem

- Arquivo de especificação: nenhum `.md` dedicado — escopo definido em conversa direta com o usuário.
- Data do planejamento: `2026-09-04`
- Classificação: `frontend-only`

## Resumo

O item "Clientes" (grupo "Consultoria") aparece hoje na sidebar principal para todos os tipos de conta, sem filtro. É uma feature B2B (gestão de clientes/contratos), conceitualmente equivalente a "Representantes" e "Sócios", que já são ocultados para contas pessoais (PF) em `ConfigPanel.tsx`. Esta mudança aplica a mesma regra ao item "Clientes" da sidebar, ocultando-o (junto com o grupo "Consultoria", que hoje só contém esse item) quando a conta ativa for do tipo pessoal.

## Escopo

### Dentro do escopo

- Mover a leitura de `localStorage.getItem('contaAtivaTipo')` para dentro do componente `AppShell` (hoje `NAV_GROUPS` é um array estático definido fora do componente, sem acesso a esse valor em runtime).
- Filtrar o grupo "Consultoria" (item "Clientes") do array renderizado quando `contaTipo === 'pessoal'`, seguindo o padrão já usado em `ConfigPanel.tsx` (`contaTipo !== 'pessoal'`).

### Fora do escopo

- Qualquer mudança em `ConfigPanel.tsx`, `IncomeDialog.tsx` ou outros locais que já implementam esse gate corretamente.
- Mudança no onboarding (`useOnboardingChecklist.ts`) — já confirmado que o item "Cadastrar um cliente" já é condicionado a `isEmpresa`, sem inconsistência a corrigir.
- Tratamento de edge case de troca de conta em tempo real — confirmado com o usuário que `useActiveAccount.ts` já força `window.location.reload()` ao trocar de conta, o que reseta o estado de seção (`section`) para o padrão `'movimentacoes'`, eliminando o risco de ficar numa tela órfã.
- Qualquer alteração de backend/rotas/permissões relacionadas a clientes.

## Leitura de contexto

- `AGENT.md` e `CLAUDE.md` (raiz de `sistema financas`) — já lidos em conversas anteriores desta sessão; regras de workflow e ausência de `frontend/AGENT.md`/`backend/AGENT.md` dedicados já confirmadas.
- Arquivos inspecionados nesta investigação: `src/layout/AppShell.tsx` (NAV_GROUPS, render da sidebar), `src/layout/ConfigPanel.tsx` (padrão existente de filtro `contaTipo !== 'pessoal'` para representantes/sócios), `src/hooks/useActiveAccount.ts` (mecanismo de troca de conta e reload), `src/screens/finance/IncomeDialog.tsx` (padrão `isEmpresa`), `src/App.tsx` (estado inicial de `section`, fluxo de onboarding), `src/hooks/useOnboardingChecklist.ts` (confirmação de que o item de onboarding de clientes já é `isEmpresa`-gated).

## Impacto por área

### Frontend

- **`src/layout/AppShell.tsx`**: mover `NAV_GROUPS` para dentro do componente (ou criar uma versão filtrada calculada no render) lendo `localStorage.getItem('contaAtivaTipo')`, removendo o grupo "Consultoria" quando o valor for `'pessoal'`. Reaproveitar o padrão já usado no próprio arquivo antes de ser removido (filtro inline em `.map`) e em `ConfigPanel.tsx`.
- Sem impacto em hooks de dados, query keys ou services.
- Sem suíte de testes frontend automatizada identificada — validação manual via `/run`.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `sistema financas/src/layout/AppShell.tsx`

## Estratégia de implementação

1. Em `AppShell.tsx`, dentro do componente `AppShell` (onde `theme`, `notifOpen` etc. já são declarados), ler `const contaTipo = localStorage.getItem('contaAtivaTipo');`.
2. Calcular um array filtrado a partir de `NAV_GROUPS` (que permanece como constante estática fora do componente, definindo a estrutura completa), removendo o grupo "Consultoria" quando `contaTipo === 'pessoal'`.
3. Usar esse array filtrado no `.map` de renderização da sidebar, no lugar de `NAV_GROUPS` diretamente.
4. Rodar `npm run build` e validar manualmente: conta pessoal não mostra "Clientes"/"Consultoria" na sidebar; conta empresa continua mostrando normalmente.

## Regras de negócio identificadas

- "Clientes" é uma feature exclusiva de contas do tipo empresa (PJ), assim como "Representantes" e "Sócios" já são.
- Confirmado: o item de onboarding "Cadastrar um cliente" já respeita essa mesma regra (`isEmpresa`), sem necessidade de ajuste.

## Regras multi-tenant e segurança

Não aplicável — mudança de UI/navegação client-side, sem novos endpoints, queries ou dados sensíveis. Não substitui nem reforça controle de acesso no backend (se a rota/API de clientes não tiver seu próprio gate de tipo de conta no servidor, isso é uma questão pré-existente e separada, fora do escopo desta mudança puramente de navegação).

## Validações necessárias

- Confirmar visualmente que o grupo "Finanças" continua completo (Painel, Movimentações, Relatórios) independente do tipo de conta.
- Confirmar que a mudança não afeta o modo demo (`isDemoMode`), que já tem sua própria lógica de renderização da sidebar.

## Testes necessários

### Frontend

- Validação manual: conta ativa do tipo pessoal — sidebar não mostra grupo "Consultoria"/"Clientes".
- Validação manual: conta ativa do tipo empresa — sidebar mostra grupo "Consultoria"/"Clientes" normalmente.
- Validação manual: dark mode não é afetado (mudança é puramente condicional, sem alteração de estilo).

### Backend

`Sem impacto esperado`

### E2E

Não aplicável — sem suíte E2E identificada.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- Nenhum risco residual identificado — a troca de conta já força reload completo da página, o que reseta o estado de navegação para o padrão (`movimentacoes`), eliminando a possibilidade de o usuário ficar numa seção sem acesso via sidebar.
- Nenhuma migration ou alteração de banco envolvida.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisão já confirmada com o usuário.

## Critérios de aceite do plano

- Sidebar não exibe o grupo "Consultoria"/item "Clientes" quando a conta ativa for do tipo pessoal.
- Sidebar continua exibindo normalmente para contas do tipo empresa.
- `npm run build` passa sem erros.
- Nenhum outro comportamento da sidebar (grupo Finanças, item Configurações, modo demo) foi alterado.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — não há nenhuma nesta mudança.
- Manter alterações restritas a `AppShell.tsx`.
- Validar visualmente no navegador (via `/run`) trocando entre conta pessoal e conta empresa, se houver contas de ambos os tipos disponíveis para teste.
