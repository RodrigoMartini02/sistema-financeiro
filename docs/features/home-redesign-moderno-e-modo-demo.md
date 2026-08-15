# Feature: Redesign moderno da Home pública + modo demo funcional

## Contexto

Esta spec substitui/amplia a anterior (`docs/features/home-secao-vendas-como-funciona.md`,
que gerou o plano `.plans/home-secao-vendas-como-funciona.md` — não implementado, revertido).
O usuário considerou a Home "simplória" e quer algo "moderno e atrativo", mantendo a paleta de
cores/identidade visual atual (teal `#0EC4D8` sobre fundo escuro `#040E12` em algumas seções,
tema claro `#eef8f9`/branco em outras). Além do redesign visual, o usuário quer um **modo demo
funcional**: o visitante deve conseguir "usar o sistema de verdade" (dados fake, navegação real)
sem precisar criar conta.

## Estrutura atual da Home (mapeada em `src/screens/public/HomePage.tsx`)

1. `SiteHeader` (tone light) — nav fixo, funcional, sem achados relevantes de design.
2. `SitePageHero` (tone light) — hero raso: label + h1 + description + linha decorativa fina.
   Fundo `#eef8f9` com imagem de fundo (`home-hero-bg.png`) só visível em `lg:` (`opacity-.52`).
3. Bloco "VISÃO DO SISTEMA" (inline em `HomePage.tsx`) + `HeroDashboardPreview` — mockup de
   dashboard rico (sidebar simulada, gráfico Recharts real, cards de métricas), tema escuro
   dentro de um cartão arredondado. É o elemento visualmente mais forte da página hoje.
4. `HomeBenefitsSection` — 3 cards grandes (`MonthlyControlCard`, `VisibilityCard`,
   `ProfilesCard`) em tema escuro dentro de fundo claro. **Achado relevante**: o wrapper da seção
   tem um bloco de decoração (gradientes radiais, grid de linhas, círculos) que está com a classe
   `hidden` fixa (`src/screens/public/components/HomeBenefitsSection.tsx:407`) — ou seja, existe
   ornamentação pronta no código que nunca é exibida, deixando a seção com fundo liso sem textura.
5. `HomeHowItWorksSection` — timeline de 4 passos interativos (hover/click trocando preview),
   tema escuro, layout desktop com posicionamento absoluto calibrado manualmente por passo.
6. Bloco de avaliações (inline em `HomePage.tsx`) — grid de cards de depoimento, condicional a
   ter dados da API `/avaliacoes`.
7. `SiteFooter`.

## Paleta e tokens (não alterar, conforme decisão do usuário)

Definidos em `tailwind.config.cjs`:
- `site.bg` `#040E12`, `site.bgAlt` `#061419`, `site.text` `#EEF5F7`, `site.textSub` `#B2C4C8`,
  `site.textMuted` `#7A9099`, `site.accent` `#0EC4D8`.
- `brand.50`–`brand.900` (escala ciano/teal, usada no tema claro).
- Sem `darkMode` via media query — o "tema escuro" das seções é aplicado manualmente por seção
  (`tone="dark"` / `tone="light"` em componentes como `SitePageHero`, `SiteHeader`), não é um
  dark mode real do sistema operacional/usuário.

## Restrições técnicas identificadas

- **Sem biblioteca de animação instalada** (`package.json` não tem `framer-motion`, `gsap`,
  nem similar). Qualquer animação de entrada/scroll precisa ser CSS puro (`@keyframes` +
  `IntersectionObserver`) ou exigirá adicionar uma nova dependência — decisão que precisa
  aprovação explícita do usuário por ser mudança de dependência.
- **Arquitetura de auth**: o app autenticado (`FinanceDashboard`, `MovimentacoesScreen`, etc.,
  orquestrados em `src/App.tsx`) só renderiza quando a URL aponta para `app.html` (build/rota
  separada do site público) **e** há uma sessão válida (`useAuthSession`) **e** um plano ativo
  (`GET /planos/status`). As telas reais dependem de hooks como `useFinanceDashboard`, que batem
  na API real (`apiRequest`) — não há hoje nenhum modo "mock" ou sandbox nessas telas.
- Isso significa que o **modo demo funcional** (usar telas reais do app com dados fake, sem
  login) é uma feature de arquitetura não trivial: exige decidir entre (a) uma conta demo real
  persistida no banco com sessão fake/pré-autenticada, ou (b) uma camada de mock que substitua
  as chamadas de API dessas telas especificamente no modo demo. Ambas as abordagens têm
  implicações de segurança e escopo que precisam ser decididas antes de detalhar a estratégia de
  implementação — ver "Decisões pendentes".

## Problema a resolver

1. A Home tem elementos visuais bons isolados (o `HeroDashboardPreview`, por exemplo) mas a
   composição geral carece de hierarquia, movimento e "vida" — cards estáticos, sem animação de
   entrada, decoração desabilitada (`hidden`) em uma das seções, hero raso.
2. Não há forma do visitante interagir de verdade com o produto antes de criar conta — hoje só
   existem mockups/previews em miniatura.

## Comportamento esperado

### Parte 1 — Redesign visual (mantendo paleta atual)

- Modernizar hero: mais impacto visual, possivelmente reorganizando a relação entre o texto do
  hero e o `HeroDashboardPreview` (hoje são blocos separados e sequenciais).
- Reativar/redesenhar a decoração da `HomeBenefitsSection` (hoje `hidden`), adaptando as cores
  para o tema claro dessa seção (o bloco original foi escrito para tema escuro).
- Introduzir animações de entrada ao rolar a página (fade/slide sutil) nas seções, via CSS +
  `IntersectionObserver` — sem adicionar dependência nova, a menos que o usuário aprove.
- Revisar hierarquia tipográfica e espaçamento entre seções para dar mais respiro/impacto.
- Manter 100% a paleta de cores atual (`site-*`, `brand-*`) — sem novos tons.

### Parte 2 — Modo demo funcional

- Visitante consegue acessar uma versão do app real (telas de lançamento de despesa/receita,
  categorias, extrato, dashboard) com dados fake, sem criar conta.
- Detalhes técnicos de implementação (conta demo real vs. camada de mock) dependem de decisão do
  usuário — ver "Decisões pendentes" abaixo.

## Fora do escopo

- Mudança de paleta de cores/identidade visual.
- Qualquer alteração em dados reais de usuários existentes.
- Redesign do `ExpenseDialog.tsx` do sistema autenticado (tratado separadamente, spec própria já
  mencionada em memória do projeto).

## Decisões pendentes (a resolver no /planejar)

1. Escopo exato do redesign visual: todas as seções da Home, ou priorizar algumas primeiro
   (ex.: hero + benefícios, deixando "Como funciona" e avaliações para depois)?
2. Animações: aceitar implementação CSS-only (sem nova dependência) ou considerar adicionar uma
   lib como `framer-motion` para transições mais ricas?
3. Modo demo — abordagem técnica:
   - (a) Conta demo real persistida no banco, com sessão pré-autenticada especial (risco: dados
     fake podem se misturar com fluxos reais, precisa isolamento cuidadoso, ainda que não seja
     multi-tenant no sentido do `AGENT.md` de prefeituras);
   - (b) Camada de mock que intercepta chamadas de API nas telas reais quando em "modo demo"
     (mais isolado, mas exige mapear e mockar cada hook de dados usado nas telas incluídas na
     demo);
   - (c) Outra abordagem que o usuário prefira.
4. Modo demo — quais telas exatamente entram (só lançar despesa/receita + extrato + categorias,
   ou o dashboard completo também)?
5. Modo demo — onde ele vive: uma rota pública nova (ex. `/demo`) ou embutido na própria Home
   como um modal/iframe?

## Observações

- Não há impacto em backend/banco de dados para a Parte 1 (redesign visual).
- A Parte 2 (modo demo) pode ter impacto em backend dependendo da decisão pendente 3 — se for
  conta demo real, envolve considerações de dados e possivelmente uma rota/usuário especial no
  banco (sujeito a todas as regras de `AGENT.md` sobre migrations e confirmação explícita).
