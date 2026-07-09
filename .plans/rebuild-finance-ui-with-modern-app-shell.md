# Plano: Reconstruir UI financeira com React, Tailwind e lucide

## Origem

Task base: `.portal/tasks/rebuild-finance-ui-with-modern-app-shell.md`

Referência visual validada:

- `C:\Users\rodri\Music\portal contribuinte\frontend\src\modules\ged`

Arquivos de referência analisados:

- `frontend/src/modules/ged/pages/GedPage.tsx`
- `frontend/src/modules/ged/components/GedConsultaProcessosView.tsx`
- `frontend/src/modules/ged/components/GedDocumentsTable.tsx`
- `frontend/src/modules/ged/components/GedSaneamentoView.tsx`
- `frontend/src/modules/ged/modals/GedViewerModal.tsx`
- `frontend/src/index.css`
- `frontend/tailwind.config.js`

Arquivos do projeto financeiro considerados:

- `AGENT.md`
- `package.json`
- `vite.config.ts`
- `app.html`
- `index.html`
- `src/app.ts`
- `src/main.ts`
- `src/income.ts`
- `src/expenses.ts`
- `src/reports.ts`
- `src/settings.ts`
- `src/plans.ts`
- `src/theme.ts`
- `src/utils.ts`
- `js/`
- `css/`

Observação: `frontend/AGENT.md` e `backend/AGENT.md` não existem neste projeto.

## Decisões aplicadas

1. A nova arquitetura de UI será baseada em React, Tailwind e `lucide-react`, aproximando o projeto financeiro do padrão estrutural do módulo GED.
2. A primeira fase deve criar a base nova e já migrar a tela principal de meses, receitas e despesas.
3. A primeira fase inclui tudo no escopo visual inicial: login, landing e app autenticado.
4. A estratégia aprovada é substituir direto os contratos de UI antigos, ajustando o TypeScript junto, em vez de preservar temporariamente IDs e contratos DOM legados.

## Classificação

Implementação predominantemente `frontend-only`.

Backend e banco de dados não devem ser alterados nesta fase, salvo se a implementação comprovar necessidade real de ajuste de contrato. Nenhuma migration deve ser executada. O arquivo `.env` não deve ser alterado.

## Objetivo

Substituir o método atual de UI, baseado em HTML grande, CSS global fragmentado e manipulação direta de DOM, por uma nova aplicação frontend em React com Tailwind, componentes reutilizáveis e app shell administrativo.

A primeira entrega deve deixar a base moderna funcionando e já migrar os fluxos visuais principais:

- login;
- landing;
- app autenticado;
- navegação principal;
- meses;
- receitas;
- despesas;
- resumo financeiro da tela principal.

## Escopo da primeira fase

### Dentro do escopo

- Instalar e configurar React, React DOM, Tailwind e `lucide-react`, validando compatibilidade com Node `22.17.0`.
- Ajustar Vite para compilar entradas React/TSX.
- Criar nova raiz React para `index.html` e `app.html`, ou consolidar as entradas conforme a estrutura final definida na implementação.
- Criar app shell administrativo inspirado no GED:
  - sidebar;
  - topbar;
  - área principal;
  - navegação por seções;
  - layout responsivo.
- Criar sistema visual base:
  - tokens de cor;
  - escala de espaçamento;
  - tipografia;
  - radius;
  - sombras;
  - estados de foco, hover, disabled, loading e erro.
- Criar componentes UI reutilizáveis:
  - `Button`;
  - `IconButton`;
  - `Input`;
  - `Select`;
  - `Textarea`;
  - `Checkbox`;
  - `Switch`;
  - `Badge`;
  - `Card`;
  - `Dialog`;
  - `Drawer`;
  - `Tabs`;
  - `Table`;
  - `Toast`;
  - `EmptyState`;
  - `LoadingState`;
  - `ErrorState`;
  - `PageHeader`;
  - `Toolbar`;
  - `MetricCard`.
- Recriar login e landing no novo padrão visual.
- Recriar a tela principal autenticada com:
  - seleção de mês/ano;
  - painel de resumo financeiro;
  - listagem de receitas;
  - listagem de despesas;
  - ações principais de criar, editar, excluir e visualizar;
  - estados vazios e loading.
- Substituir os contratos antigos da tela migrada:
  - remover dependência de IDs antigos;
  - reduzir `getElementById`, `querySelector`, `innerHTML`, `classList` e `style.*`;
  - mover estado da tela para componentes/hooks React.
- Isolar ou remover CSS legado que conflitar com a nova base.
- Manter regras financeiras existentes, chamadas de API e validações funcionais.
- Rodar validações de build e, se possível, testes manuais guiados no navegador.

### Fora do escopo da primeira fase

- Reescrever regras de negócio financeiras.
- Refatorar backend por organização ou estilo.
- Alterar banco de dados.
- Executar migrations.
- Alterar `.env`.
- Reescrever relatórios completos, configurações, planos, pagamentos, notificações e avaliações além do necessário para não quebrar navegação.
- Alterar contratos de cobrança, Mercado Pago, PayPal ou PIX sem necessidade comprovada.
- Fazer uma troca visual parcial mantendo a tela principal antiga.

## Arquitetura alvo

### Estrutura sugerida

```txt
src/
  main.tsx
  App.tsx
  styles/
    globals.css
  ui/
    button.tsx
    icon-button.tsx
    input.tsx
    select.tsx
    badge.tsx
    card.tsx
    dialog.tsx
    table.tsx
    toast.tsx
    states.tsx
  layout/
    AppShell.tsx
    Sidebar.tsx
    Topbar.tsx
    PageHeader.tsx
  screens/
    public/
      LandingPage.tsx
      LoginPage.tsx
    finance/
      FinanceDashboard.tsx
      MonthSelector.tsx
      FinanceSummary.tsx
      IncomePanel.tsx
      ExpensePanel.tsx
  hooks/
    useFinanceDashboard.ts
    useAuthSession.ts
  services/
    financeService.ts
    authService.ts
  types/
    finance.ts
    auth.ts
```

Essa estrutura pode ser ajustada durante a implementação se o código atual indicar um ponto de integração mais seguro.

### Padrão visual

O visual deve seguir o espírito do GED:

- administrativo;
- claro;
- denso;
- escaneável;
- com headers objetivos;
- filtros compactos;
- tabelas/listas limpas;
- cards pequenos e úteis;
- ícones lucide em ações;
- modais operacionais;
- estados visuais consistentes.

Não copiar cegamente o GED. O sistema financeiro precisa de semântica própria para receitas, despesas, saldos, alertas, atrasos e totais.

## Etapas de implementação

### 1. Preparação técnica

- Conferir estado do repositório antes de editar.
- Validar `package.json`, `vite.config.ts`, `tsconfig.json` e entradas HTML atuais.
- Instalar dependências necessárias:
  - `react`;
  - `react-dom`;
  - `lucide-react`;
  - `tailwindcss`;
  - `postcss`;
  - `autoprefixer`;
  - tipos de React se necessário.
- Criar ou ajustar configuração do Tailwind.
- Criar CSS global importado pelo entrypoint React.
- Garantir que o build Vite reconhece `.tsx`.

### 2. Criar base React

- Criar `src/main.tsx`.
- Criar `src/App.tsx`.
- Criar roteamento simples interno ou controle de tela por estado, escolhendo a opção mais compatível com o projeto atual.
- Conectar `index.html` e `app.html` à nova raiz React.
- Remover dependência visual imediata dos CSS antigos nas áreas migradas.

### 3. Criar design system inicial

- Definir tokens Tailwind para:
  - cores neutras;
  - cores de receita;
  - cores de despesa;
  - cores de alerta;
  - cor primária;
  - radius;
  - sombra;
  - spacing.
- Criar componentes base pequenos, sem abstração excessiva.
- Garantir estados de foco acessíveis.
- Usar `lucide-react` em botões de ação e navegação.

### 4. Recriar login e landing

- Recriar `LoginPage` com o novo padrão visual.
- Recriar landing inicial sem aparência de página genérica.
- Preservar o fluxo de autenticação existente.
- Adaptar chamadas e validações atuais sem alterar backend.
- Validar redirecionamento para app autenticado.

### 5. Criar app shell autenticado

- Criar sidebar com navegação principal.
- Criar topbar com identidade da tela, ações rápidas e dados de sessão quando disponíveis.
- Criar área principal com largura e espaçamento consistentes.
- Garantir responsividade para desktop operacional e mobile funcional.
- Criar placeholders funcionais para seções ainda não migradas.

### 6. Migrar tela principal financeira

- Mapear no código atual os dados e funções usadas para:
  - meses;
  - receitas;
  - despesas;
  - totais;
  - filtros;
  - criação;
  - edição;
  - exclusão.
- Criar `FinanceDashboard`.
- Criar componentes de resumo, mês, receitas e despesas.
- Adaptar lógica de `src/main.ts`, `src/income.ts` e `src/expenses.ts` para serviços/hooks React.
- Substituir contratos DOM antigos da tela principal.
- Preservar comportamento funcional dos lançamentos financeiros.

### 7. Tratar legado e conflitos

- Remover imports ou links de CSS legado que afetem a nova tela.
- Isolar scripts antigos que não devem rodar contra a nova árvore React.
- Corrigir referências a arquivos deletados ou inconsistentes, como CSS/HTML/JS que não participem mais da nova UI.
- Manter temporariamente módulos não migrados apenas quando forem necessários para seções fora da primeira fase.

### 8. Validação

- Rodar build do projeto.
- Validar login.
- Validar landing.
- Validar abertura do app autenticado.
- Validar navegação principal.
- Validar tela de meses.
- Validar listagem de receitas.
- Validar listagem de despesas.
- Validar criação, edição e exclusão de receita.
- Validar criação, edição e exclusão de despesa.
- Validar responsividade em desktop e mobile.
- Validar que `.env` não foi alterado.
- Registrar qualquer fluxo crítico que ainda dependa de legado.

## Riscos principais

- O projeto atual tem muitos contratos implícitos via IDs, classes e manipulação direta de DOM.
- A escolha por substituir direto aumenta o risco de regressão funcional na tela principal.
- Módulos grandes como `expenses.ts`, `income.ts` e `main.ts` podem misturar regra de negócio, renderização e estado.
- CSS legado pode vazar para componentes React se não for isolado.
- Scripts legados podem tentar manipular elementos que não existem mais.
- Login, planos/pagamentos e relatórios podem ter dependências indiretas no layout antigo.

## Mitigações

- Migrar primeiro os fluxos escolhidos, mas validar cada ação crítica antes de remover partes antigas.
- Separar serviços de dados de componentes de UI.
- Criar componentes pequenos e explícitos.
- Evitar refatorações backend.
- Não alterar banco de dados.
- Não alterar `.env`.
- Rodar build cedo e com frequência.
- Conferir manualmente os fluxos financeiros principais após a migração.

## Critérios de aceite

- O projeto possui base React, Tailwind e `lucide-react` configurada.
- Login e landing foram recriados no novo padrão visual.
- App autenticado abre em novo app shell.
- Tela principal de meses, receitas e despesas funciona na nova UI.
- A tela principal não depende mais dos IDs/classes antigos como contrato de renderização.
- CSS legado não controla a aparência das áreas migradas.
- Fluxos de criar, editar e excluir receitas/despesas continuam funcionando.
- Build do frontend passa.
- `.env` permanece inalterado.
- Nenhuma migration foi executada.
- Alterações backend só existem se forem estritamente necessárias e justificadas.

## Comandos de validação previstos

```bash
npm run build
```

Se houver scripts de teste disponíveis ou adicionados durante a implementação, também validar com o comando correspondente antes de finalizar.

