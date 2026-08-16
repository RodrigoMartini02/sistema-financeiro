# Plano de Implementação: Sistema interativo embutido na Home

## Origem

- Arquivo de especificação: `.portal/tasks/interactive-demo-embedded-in-home.md`
- Data do planejamento: `2026-08-15`
- Classificação: `frontend-only`

## Resumo

A Home pública mostra o produto hoje através de blocos estáticos com dados fictícios fixos
(`HeroDashboardPreview`, `HomeBenefitsSection`, `HomeHowItWorksSection`). O usuário quer trazer o
próprio sistema para dentro da página: uma seção interativa embutida na Home, com a moldura visual
de um app real (sidebar + área de conteúdo, no espírito de `AppShell.tsx`), onde o visitante
insere os próprios dados — lança despesas e receitas, gerencia reservas, visualiza relatórios — e
vê tudo refletir em tempo real entre as telas. Nada é persistido: todo o estado vive em memória no
navegador e se perde ao recarregar a página. A simulação é pré-populada com 1-2 lançamentos de
exemplo editáveis/excluíveis, para não começar totalmente vazia, e exibe um indicador permanente
de "Demonstração".

Esta feature substitui e remove definitivamente `HomeBenefitsSection.tsx`,
`HomeHowItWorksSection.tsx` e `HeroDashboardPreview.tsx`.

## Escopo

### Dentro do escopo

- Hook de estado local único (`useDemoFinanceState` ou nome equivalente) compartilhado entre
  todas as telas da simulação: despesas, receitas, reservas, categorias pré-definidas, totais
  derivados. Pré-populado com 1-2 exemplos editáveis/excluíveis.
- Moldura da simulação: sidebar com Painel, Movimentações, Reservas, Relatórios (sem
  Configurações) + área de conteúdo trocável, inspirada visualmente em `src/layout/AppShell.tsx`
  (cores, formato de item de navegação, header simplificado).
- Tela **Painel**: totais (recebido, pago, saldo, pendente) calculados a partir do estado local da
  sessão.
- Tela **Movimentações**: formulário simplificado para lançar despesa (descrição, valor, data,
  categoria) e receita (descrição, valor, data), além de lista/extrato dos lançamentos da sessão,
  atualizada em tempo real.
- Tela **Reservas**: criar/gerenciar reservas simples (nome, valor-alvo, valor atual) com dados da
  sessão — totalmente funcional, não ilustrativa.
- Tela **Relatórios**: visualização (ex. gráfico por categoria, reaproveitando `recharts`, já
  usado no projeto) derivada dos lançamentos da sessão — totalmente funcional, não ilustrativa.
- Categorias pré-definidas fixas (ex. Moradia, Alimentação, Transporte, Lazer, Outros), sem tela
  de criação de categoria; incluir nota textual de que no sistema real as categorias são
  personalizáveis pelo usuário.
- Badge/indicador visual permanente de "Demonstração", sempre visível dentro da simulação.
- Atualizar `src/screens/public/HomePage.tsx`: remover o bloco "Visão do sistema" +
  `HeroDashboardPreview`, remover `HomeBenefitsSection` e `HomeHowItWorksSection`, inserir a nova
  seção interativa no lugar (logo após o hero).
- Excluir definitivamente os arquivos `HomeBenefitsSection.tsx`, `HomeHowItWorksSection.tsx` e
  `HeroDashboardPreview.tsx`.

### Fora do escopo

- Qualquer persistência real (banco de dados, API) dos dados inseridos na simulação.
- Autenticação real, conta demo persistida no banco, ou sessão real.
- Multi-perfil (Pessoal/Empresa) dentro da simulação.
- Seção de Configurações dentro da simulação.
- CTA de conversão embutido dentro da própria simulação (os CTAs já existentes no restante da
  Home são suficientes, por decisão do usuário).
- Tela de criação de categoria (categorias vêm pré-definidas e fixas).
- Exportação real de PDF em Relatórios (pode ter um botão ilustrativo/desabilitado, se fizer
  sentido visualmente).
- Redesign ou alteração do `ExpenseDialog.tsx`/`IncomeDialog.tsx`/`FinanceDashboard.tsx` reais do
  sistema autenticado.
- Uso da simulação em outras páginas públicas além da Home.

## Leitura de contexto

- `/AGENT.md` (raiz do projeto) — lido em ciclo de planejamento anterior desta mesma sessão.
  Majoritariamente backend/multi-tenant/Drizzle; sem impacto direto nesta feature
  frontend-only. Não existem `frontend/AGENT.md` nem `backend/AGENT.md` separados no projeto.
- `.portal/tasks/interactive-demo-embedded-in-home.md` — task de origem desta feature, gerada via
  skill `criar-task` a partir da conversa completa com o usuário.
- `src/screens/public/HomePage.tsx` — lido por completo (novamente, já modificado nesta sessão
  para incluir `ScrollReveal` na Etapa 1 anterior).
- `src/screens/public/components/HeroDashboardPreview.tsx` — lido por completo; será removido.
- `src/hooks/useFinanceDashboard.ts` — lido por completo; confirma acoplamento direto à API real
  via `financeService`, reforçando a decisão de não reaproveitar hooks/telas reais.
- `src/layout/AppShell.tsx` — lido por completo; referência visual para a moldura da simulação
  (cores `#0D2E3C`/`#0A2530`/`#0EC4D8`, formato de item de navegação com indicador de seção
  ativa, header com seletor de período).
- Tamanho das telas reais (`src/screens/finance/`): `ExpenseDialog.tsx` (976 linhas),
  `IncomeDialog.tsx` (837 linhas), `FinanceDashboard.tsx` (614 linhas),
  `MovimentacoesScreen.tsx` (353 linhas) — confirmado que são grandes e acoplados à API real,
  não reaproveitáveis diretamente; a simulação usa componentes próprios e mais simples.

## Impacto por área

### Frontend

- **Novo diretório** `src/screens/public/components/demo-app/` (ou nome equivalente) contendo:
  - Hook de estado local (`useDemoFinanceState`): gerencia despesas, receitas, reservas,
    categorias pré-definidas; expõe funções de adicionar/editar/remover; deriva totais.
  - Componente de moldura (sidebar + header + área de conteúdo trocável entre as 4 telas).
  - `PainelDemo`: totais e resumo.
  - `MovimentacoesDemo`: formulário de despesa/receita + extrato.
  - `ReservasDemo`: criar/gerenciar reservas.
  - `RelatoriosDemo`: gráfico por categoria via `recharts`.
- Atualizar `src/screens/public/HomePage.tsx`: remover imports e uso de `HomeBenefitsSection`,
  `HomeHowItWorksSection`, `HeroDashboardPreview` e do bloco "Visão do sistema"; inserir a nova
  seção interativa.
- Excluir `src/screens/public/components/HomeBenefitsSection.tsx`,
  `src/screens/public/components/HomeHowItWorksSection.tsx`,
  `src/screens/public/components/HeroDashboardPreview.tsx`.
- Reutilizar tokens visuais existentes (`site-*`, `brand-*`) e `framer-motion` (já instalado)
  quando fizer sentido para transições dentro da simulação.
- Sem uso de `useQuery`/`useMutation`/`apiRequest` dentro da simulação — todo o estado é local.
- Preservar acessibilidade básica dos formulários (labels, foco, navegação por teclado).
- Estados de loading/error/empty: não aplicável para a simulação em si (dados sempre disponíveis
  localmente); o painel/extrato deve ter um estado "vazio com CTA" tratado pela pré-população de
  exemplos (decisão já tomada — sempre há pelo menos 1-2 itens ao carregar).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado além de variação de bundle size pela nova seção (sem novas dependências —
`framer-motion` e `recharts` já estão instalados no projeto).

## Arquivos provavelmente afetados

- `src/screens/public/HomePage.tsx`
- Novo: `src/screens/public/components/demo-app/DemoAppShell.tsx` (ou nome equivalente)
- Novo: `src/screens/public/components/demo-app/useDemoFinanceState.ts`
- Novo: `src/screens/public/components/demo-app/PainelDemo.tsx`
- Novo: `src/screens/public/components/demo-app/MovimentacoesDemo.tsx`
- Novo: `src/screens/public/components/demo-app/ReservasDemo.tsx`
- Novo: `src/screens/public/components/demo-app/RelatoriosDemo.tsx`
- Removidos: `src/screens/public/components/HomeBenefitsSection.tsx`,
  `src/screens/public/components/HomeHowItWorksSection.tsx`,
  `src/screens/public/components/HeroDashboardPreview.tsx`

## Estratégia de implementação

1. Criar `useDemoFinanceState`: categorias pré-definidas fixas + 1-2 exemplos de despesa/receita
   pré-carregados (editáveis/excluíveis) + funções de adicionar/editar/remover despesa, receita,
   reserva + derivação de totais (recebido, pago, saldo, pendente).
2. Construir a moldura da simulação (sidebar com Painel/Movimentações/Reservas/Relatórios, header
   simplificado, badge "Demonstração" sempre visível), inspirada visualmente em `AppShell.tsx`.
3. Implementar tela Painel (consome o hook, mostra totais).
4. Implementar tela Movimentações (formulário de despesa/receita + extrato em tempo real).
5. Implementar tela Reservas (criar/gerenciar reservas simples).
6. Implementar tela Relatórios (gráfico por categoria com `recharts`, derivado dos lançamentos da
   sessão).
7. Integrar a moldura completa em `HomePage.tsx`, no lugar do bloco "Visão do sistema" +
   `HeroDashboardPreview`; remover `HomeBenefitsSection` e `HomeHowItWorksSection` do JSX.
8. Excluir definitivamente os 3 arquivos antigos (`HomeBenefitsSection.tsx`,
   `HomeHowItWorksSection.tsx`, `HeroDashboardPreview.tsx`).
9. Rodar `npx tsc --noEmit` e `npx vite build`.
10. Validar visualmente com o usuário via `/run` (sem ferramenta de screenshot neste ambiente).

## Regras de negócio identificadas

- Nenhum dado inserido na simulação deve ser persistido ou enviado à API real, sob nenhuma
  circunstância.
- A simulação deve deixar claro, de forma permanente e visível, que é uma demonstração.
- Categorias da simulação são fixas/pré-definidas; o sistema real permite personalização — isso
  deve ser comunicado textualmente na simulação, não deixado implícito.
- Estado da simulação é por sessão de navegador (perdido ao recarregar) — comportamento esperado
  e aceito pelo usuário, não é um bug a corrigir.

## Regras multi-tenant e segurança

Não aplicável — funcionalidade é conteúdo interativo de marketing na Home pública, sem leitura ou
escrita de dados de tenant, sessão real ou API. Ponto de atenção: garantir que nenhum componente
da simulação reaproveite acidentalmente `apiRequest` ou services que chamem a API real.

## Validações necessárias

- Formulários da simulação (despesa, receita, reserva) devem ter validação básica de UX (campos
  obrigatórios, formato de valor/data) para parecerem críveis, mesmo sem persistir dados.

## Testes necessários

### Frontend

- Verificação manual: lançar despesa/receita reflete no extrato e nos totais do painel em tempo
  real.
- Verificação manual: criar/editar reserva reflete corretamente no estado.
- Verificação manual: relatório (gráfico) reflete os lançamentos da sessão.
- Verificação manual: nenhuma requisição de rede é feita para a API real a partir da simulação
  (inspecionável via aba de rede do navegador).
- Verificação visual em mobile, tablet e desktop.
- Verificação de que o badge "Demonstração" está sempre visível dentro da simulação.

### Backend

Não aplicável.

### E2E

Não aplicável — funcionalidade de marketing/demonstração, sem fluxo de negócio real.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Escopo de engenharia significativamente maior que o previsto inicialmente na task de origem
  (que cobria só despesa/receita/categoria/extrato) — a decisão do usuário de incluir Reservas e
  Relatórios como telas totalmente funcionais torna esta a implementação mais substancial feita
  na Home até agora nesta série de mudanças.
- Risco de a simulação ficar difícil de manter se o estado compartilhado entre as 4 telas não for
  bem modularizado desde o início (hook único, bem tipado, com responsabilidades claras).
- Ao excluir definitivamente os 3 arquivos antigos, a versão anterior desse conteúdo só continua
  disponível via histórico do git (branch `feat/R/home-redesign-moderno` e commits anteriores em
  `main`) — não há mais os arquivos no working tree após esta implementação.
- Sem ferramenta de screenshot automatizado neste ambiente — toda validação visual final depende
  do usuário conferir no navegador via `/run`.
- `Reservas` e `Relatórios` na simulação precisam de lógica própria de derivação (ex. progresso de
  reserva, agregação por categoria no relatório) — atenção para não introduzir bugs de cálculo
  que passem despercebidos por não haver testes automatizados cobrindo isso.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Todas as decisões pendentes (destino dos arquivos
antigos, estado inicial da simulação, composição da sidebar, presença de CTA embutido, nível de
funcionalidade de Reservas/Relatórios) foram confirmadas pelo usuário.

## Critérios de aceite do plano

- As 4 telas da simulação (Painel, Movimentações, Reservas, Relatórios) funcionam de ponta a
  ponta com dados inseridos pelo próprio visitante, refletindo corretamente entre si (ex.
  lançamento em Movimentações aparece no Painel e em Relatórios).
- Nenhuma chamada de rede é feita para a API real a partir de qualquer componente da simulação.
- Badge "Demonstração" está sempre visível dentro da simulação.
- Simulação carrega pré-populada com 1-2 exemplos editáveis/excluíveis, nunca totalmente vazia.
- `HomeBenefitsSection.tsx`, `HomeHowItWorksSection.tsx` e `HeroDashboardPreview.tsx` não existem
  mais no projeto, e não há mais referências a eles em `HomePage.tsx`.
- Build (`vite build`) e checagem de tipos (`tsc --noEmit`) passam sem erros.
- Paleta de cores/identidade visual (`site-*`, `brand-*`) é preservada, com a moldura seguindo o
  estilo visual de `AppShell.tsx`.
- Usuário validou visualmente no navegador antes de considerar a implementação concluída.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Implementar em ordem: hook de estado → moldura → Painel → Movimentações → Reservas →
  Relatórios → integração em `HomePage.tsx` → exclusão dos arquivos antigos — para permitir
  checkpoints de validação intermediária se necessário.
- Não reaproveitar `ExpenseDialog.tsx`, `IncomeDialog.tsx`, `FinanceDashboard.tsx` ou
  `MovimentacoesScreen.tsx` reais — construir componentes próprios e mais simples para a
  simulação, inspirados visualmente neles.
- Não criar tela de criação de categoria — categorias são fixas/pré-definidas.
- Não adicionar CTA de conversão dentro da simulação.
- Não instalar novas dependências (`framer-motion` e `recharts` já estão disponíveis no projeto).
- Não persistir nenhum dado da simulação em backend/API real, em nenhuma circunstância.
- Excluir os 3 arquivos antigos apenas depois de confirmar que a nova seção está funcionando e
  integrada em `HomePage.tsx`.
- Validar visualmente com `/run` antes de considerar a implementação concluída, dado que não há
  ferramenta de screenshot automatizado neste ambiente.
