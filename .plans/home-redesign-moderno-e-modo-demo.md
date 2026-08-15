# Plano de Implementação: Redesign moderno da Home pública + modo demo funcional

## Origem

- Arquivo de especificação: `docs/features/home-redesign-moderno-e-modo-demo.md`
- Data do planejamento: `2026-08-15`
- Classificação: `frontend-only`

## Resumo

A Home pública foi considerada "simplória" pelo usuário. Este plano cobre duas frentes: (1) um
redesign visual completo da Home — hero, seção de benefícios, seção "Como funciona" e bloco de
avaliações — mantendo 100% a paleta de cores/identidade atual (tokens `site-*`/`brand-*` do
Tailwind), com animações de entrada via `framer-motion`; e (2) um modo demo interativo, acessado
por modal/overlay a partir da Home, onde o visitante usa versões mockadas (dados fake, sem
tocar no banco real) das telas mais usadas do sistema — registrar despesa, registrar receita,
criar categoria e visualizar extrato — sem precisar criar conta.

Este plano substitui o plano anterior `.plans/home-secao-vendas-como-funciona.md` (não
implementado, revertido), cujo escopo (só a seção "Como funciona") foi absorvido e ampliado aqui.

## Escopo

### Dentro do escopo

- Adicionar `framer-motion` como dependência (validar compatibilidade com Node `22.17.0` e React
  19 antes de instalar).
- Redesign visual de:
  - `SitePageHero` (tone light, usado na Home) + bloco "VISÃO DO SISTEMA" / `HeroDashboardPreview`
    em `HomePage.tsx`.
  - `HomeBenefitsSection` — reativar/redesenhar a decoração hoje desabilitada via `hidden`
    (`src/screens/public/components/HomeBenefitsSection.tsx:407`), adaptando cores para o tema
    claro da seção.
  - `HomeHowItWorksSection` — modernização visual (composição, espaçamento, tipografia),
    mantendo os 4 passos e mockups existentes como base.
  - Bloco de avaliações (inline em `HomePage.tsx`).
- Animações de entrada ao rolar (fade/slide sutil) aplicadas via `framer-motion` nas seções
  acima.
- Novo modal/overlay de "modo demo", acionado por um CTA na Home (ex. "Testar agora"), contendo
  navegação interna simulando o fluxo essencial do sistema:
  - Registrar despesa
  - Registrar receita
  - Criar categoria
  - Visualizar extrato/tabela de lançamentos
- Toda a camada de dados do modo demo é mockada no frontend com estado local (`useState`/similar)
  — nenhuma chamada a `apiRequest` ou ao backend real.

### Fora do escopo

- Mudança de paleta de cores ou tokens do Tailwind.
- Dashboard completo, reservas, relatórios e planos no modo demo.
- Conta demo persistida no banco de dados ou qualquer sessão pré-autenticada real.
- Redesign do `ExpenseDialog.tsx` do sistema autenticado (tratado em spec própria, fora deste
  plano).
- Mudanças em `SiteHeader` e `SiteFooter` (sem achados relevantes de design, não fazem parte do
  pedido).

## Leitura de contexto

- `/AGENT.md` (raiz do projeto) — lido. Majoritariamente backend/multi-tenant/Drizzle; sem
  impacto direto neste plano (frontend-only, sem banco de dados). Regra de dependências (checar
  `engines.node` antes de instalar pacote) se aplica à adição do `framer-motion`.
- `docs/features/home-redesign-moderno-e-modo-demo.md` — especificação desta feature.
- `src/screens/public/HomePage.tsx` — orquestração das seções da Home, lido por completo.
- `src/screens/public/components/SitePageHero.tsx` — lido por completo (tone light e dark).
- `src/screens/public/components/HeroDashboardPreview.tsx` — lido por completo; mockup de
  dashboard já rico (Recharts, sidebar simulada), serve de referência de qualidade visual para o
  restante da página.
- `src/screens/public/components/HomeBenefitsSection.tsx` — lido por completo; identificado bloco
  de decoração com `hidden` fixo nunca exibido.
- `src/screens/public/components/HomeHowItWorksSection.tsx` — lido por completo (já explorado em
  ciclo de planejamento anterior).
- `src/screens/public/components/SiteHeader.tsx` — lido parcialmente (nav funcional, sem achados
  relevantes de design).
- `tailwind.config.cjs` — lido por completo; confirma tokens de cor (`site.*`, `brand.*`) e
  ausência de `darkMode` via media query real (tom claro/escuro é manual por seção).
- `package.json` — confirmado que não há biblioteca de animação instalada atualmente.
- `src/App.tsx` — lido por completo para avaliar viabilidade do modo demo; confirma que as telas
  autenticadas reais dependem de `useAuthSession`, verificação de plano via API e hooks como
  `useFinanceDashboard` que batem no backend real — não há hoje nenhuma camada de mock existente
  reaproveitável, o modo demo precisa ser construído do zero com componentes próprios.

## Impacto por área

### Frontend

- **Dependência nova**: adicionar `framer-motion` ao `package.json`. Validar `engines.node`
  publicado antes de instalar; se exigir Node > `22.17.0`, escolher versão compatível ou parar e
  reportar o bloqueio (regra do `AGENT.md`).
- **Redesign visual** (sem lógica de dados, só composição/estilo/animação):
  - `SitePageHero`: revisar hierarquia visual, possível reforço de composição entre hero e
    `HeroDashboardPreview`.
  - `HomeBenefitsSection`: reativar decoração de fundo (remover/ajustar a classe `hidden`),
    adaptando cores do bloco (hoje pensado para tema escuro) ao fundo claro `#eef8f9` da seção.
  - `HomeHowItWorksSection`: modernização de composição/tipografia/espaçamento, preservando os 4
    passos e previews existentes.
  - Bloco de avaliações em `HomePage.tsx`: revisão visual leve.
  - Animações de entrada com `framer-motion` (`whileInView` ou equivalente) em todas as seções
    acima.
- **Modo demo (novo)**:
  - Novo componente de modal/overlay (ex. `src/screens/public/components/DemoModal.tsx`),
    acionado por CTA na Home.
  - Subcomponentes mockados para: formulário de despesa, formulário de receita, criação de
    categoria, tabela de extrato — todos com estado local em memória (React `useState`), sem
    `apiRequest`, sem persistência entre sessões.
  - Navegação interna simples entre essas 4 sub-telas dentro do modal (ex. tabs ou stepper).
  - Sem impacto em rotas do React Router — é um modal sobre a Home, não uma rota nova (`/demo`
    foi descartado pela decisão do usuário).
- Estados de loading/error/empty: não aplicável ao modo demo (dados sempre disponíveis
  localmente, sem chamadas assíncronas reais). Aplicável normalmente ao redesign visual apenas se
  alguma seção existente já depender de dados assíncronos (bloco de avaliações já usa
  `useQuery` — manter tratamento existente).
- Testes: ver seção "Testes necessários".

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado, além do aumento de bundle size pela nova dependência `framer-motion`
(monitorar no build; o projeto já acusa warning de chunk grande).

## Arquivos provavelmente afetados

- `package.json` / `package-lock.json` (nova dependência)
- `src/screens/public/components/SitePageHero.tsx`
- `src/screens/public/components/HeroDashboardPreview.tsx`
- `src/screens/public/components/HomeBenefitsSection.tsx`
- `src/screens/public/components/HomeHowItWorksSection.tsx`
- `src/screens/public/HomePage.tsx`
- Novo: `src/screens/public/components/DemoModal.tsx` (ou nome equivalente)
- Novos: subcomponentes mockados do modo demo (formulários, tabela), possivelmente em um novo
  diretório `src/screens/public/components/demo/`

## Estratégia de implementação

Implementação dividida em 2 sub-etapas sequenciais, com validação intermediária antes de avançar
para a etapa mais complexa.

### Etapa 1 — Redesign visual + animações

1. Instalar `framer-motion` (validar compatibilidade de engine antes).
2. Reativar e redesenhar a decoração de `HomeBenefitsSection` (remover `hidden`, ajustar cores
   para tema claro).
3. Revisar composição do hero (`SitePageHero` + `HeroDashboardPreview`/bloco "VISÃO DO SISTEMA").
4. Modernizar `HomeHowItWorksSection` (tipografia, espaçamento, composição — sem alterar a lógica
   de passos/preview já existente).
5. Revisar bloco de avaliações.
6. Aplicar animações de entrada (`framer-motion`, `whileInView`) em todas as seções acima.
7. Rodar build (`npx vite build`) e `npx tsc --noEmit`.
8. Validar visualmente com `/run` (usuário confere no navegador, dado que não há ferramenta de
   screenshot neste ambiente).

### Etapa 2 — Modo demo funcional

1. Definir estrutura do modal (`DemoModal`) e navegação interna entre as 4 sub-telas mockadas.
2. Implementar formulário mockado de despesa (estado local, sem API).
3. Implementar formulário mockado de receita (estado local, sem API).
4. Implementar criação de categoria mockada (estado local, sem API).
5. Implementar tabela/extrato mockado, refletindo os lançamentos feitos durante a sessão do modal
   (estado em memória, resetado ao fechar o modal).
6. Adicionar CTA na Home para abrir o modal (ex. "Testar agora").
7. Rodar build e typecheck novamente.
8. Validar visualmente com `/run`.

## Regras de negócio identificadas

- Modo demo nunca deve persistir dados nem se comunicar com o backend real — é puramente
  frontend/estado local.
- Paleta de cores e identidade visual (`site-*`, `brand-*`) devem ser preservadas integralmente.
- Tom de comunicação da Home deve seguir o já estabelecido (direto, sem jargão).

## Regras multi-tenant e segurança

Não aplicável — feature é conteúdo estático/interativo de marketing na Home pública, sem leitura
ou escrita de dados de tenant, sessão real ou API. O modo demo, por ser mock local, não introduz
superfície de ataque em dados reais.

## Validações necessárias

- Formulários mockados do modo demo não precisam de validação robusta de negócio (não persistem
  dados), mas devem ter validação básica de UX (campos obrigatórios, formato de valor) para
  parecerem críveis como demonstração do produto.

## Testes necessários

### Frontend

- Verificação visual manual (via `/run`) em mobile, tablet e desktop, para cada seção
  redesenhada.
- Verificar que animações de entrada não quebram acessibilidade (respeitar
  `prefers-reduced-motion` quando aplicável).
- Verificar navegação completa do modo demo: abrir modal, transitar entre as 4 sub-telas,
  registrar despesa/receita mockada, ver refletido no extrato mockado, fechar modal sem erros.
- Verificar que CTA final da Home ("Começar 15 dias grátis") continua funcionando normalmente.

### Backend

Não aplicável.

### E2E

Não aplicável — não há fluxo crítico de negócio nem dados reais envolvidos.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- `framer-motion` é dependência nova — validar `engines.node` antes de instalar; se incompatível,
  parar e reportar (regra do `AGENT.md`).
- Redesign da Home inteira de uma vez é mudança grande — risco de regressões de responsividade em
  alguma seção se não for testado em múltiplos breakpoints.
- O modal de modo demo é a peça de maior esforço técnico — várias sub-telas mockadas com estado
  compartilhado (lançamentos feitos devem refletir no extrato) exigem uma pequena "store" local
  dentro do componente (contexto React ou estado elevado), não apenas componentes isolados.
- Sem ferramenta de screenshot real neste ambiente de execução — toda validação visual final
  depende do usuário conferir no navegador via `/run`.
- Aumento de bundle size pela nova dependência — o build já acusa warning de chunk > 500kB;
  monitorar se `framer-motion` agrava isso de forma relevante.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Todas as decisões (abordagem do modo demo, telas
incluídas, escopo do redesign, biblioteca de animação, localização do modo demo) foram
confirmadas pelo usuário.

## Critérios de aceite do plano

- Home redesenhada (hero, benefícios, como funciona, avaliações) mantendo a paleta de cores
  atual, com animações de entrada funcionando ao rolar a página.
- Decoração da `HomeBenefitsSection` deixa de estar oculta (`hidden`) e passa a ser exibida,
  adaptada ao tema claro da seção.
- Modal de modo demo acessível a partir de um CTA na Home, permitindo registrar despesa, receita,
  criar categoria e visualizar extrato, tudo com dados mockados em estado local.
- Nenhuma chamada real a API/backend a partir do modo demo.
- Build (`vite build`) e typecheck (`tsc --noEmit`) passam sem erros.
- Usuário validou visualmente no navegador antes de considerar a implementação concluída.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Implementar em 2 sub-etapas sequenciais (redesign visual primeiro, modo demo depois), com
  checkpoint de validação visual do usuário entre elas antes de avançar para a etapa 2.
- Antes de instalar `framer-motion`, verificar a faixa `engines.node` publicada pelo pacote e
  confirmar compatibilidade com Node `22.17.0`, conforme regra do `AGENT.md`.
- Não alterar paleta de cores/tokens do Tailwind.
- Não criar rota nova (`/demo`) — o modo demo é modal/overlay dentro da Home.
- Não persistir nenhum dado do modo demo em backend/API real.
- Validar visualmente com `/run` antes de considerar cada etapa concluída, dado que não há
  ferramenta de screenshot automatizado neste ambiente.
- Manter alterações de cada etapa pequenas e revisáveis; evitar misturar redesign visual com
  lógica do modo demo no mesmo conjunto de mudanças.
