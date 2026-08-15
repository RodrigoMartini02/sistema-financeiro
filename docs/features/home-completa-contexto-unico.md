# Feature: Home pública — visão completa e unificada

## Por que esta spec existe

As últimas rodadas de trabalho na Home trataram partes isoladamente (retoques visuais soltos,
depois um modal, depois uma réplica simplificada, depois a decisão técnica de usar telas reais) e
isso gerou resultado fragmentado: uma seção pode ficar ótima e as outras ficarem devendo, porque
foram pensadas em momentos diferentes, sem uma visão de conjunto. O usuário pediu explicitamente
para tratar a Home no **contexto completo**, não mais em pedaços.

Esta spec substitui/consolida as anteriores (`home-secao-vendas-como-funciona.md`,
`home-redesign-moderno-e-modo-demo.md`, `home-sistema-interativo-embutido.md`) e deve ser a
referência única daqui para frente.

## Estado atual real do código (verificado, não presumido)

Branch: `feat/R/home-redesign-moderno`, nada commitado ainda.

- `src/screens/public/HomePage.tsx` — já reflete: Header → Hero → `HomeInteractiveDemo` (seção
  interativa, ver abaixo) → Avaliações (condicional a dados da API) → Footer.
- `src/screens/public/components/SitePageHero.tsx` — **já tem** animação de entrada via
  `framer-motion` (fade + slide escalonado no label/título/descrição/linha decorativa),
  respeitando `prefers-reduced-motion`. Esta parte já está pronta e deve ser mantida como está,
  a menos que a nova spec de composição geral peça mudança de layout (não só animação).
- `src/screens/public/components/ScrollReveal.tsx` — helper de animação de entrada ao rolar
  (`framer-motion`, `whileInView`), já usado no bloco de avaliações. Reaproveitável para as demais
  seções novas.
- `src/screens/public/components/demo-app/*` — implementação da seção interativa **rejeitada
  pelo usuário** ("quero o sistema funcionando como ele é", não uma réplica). Precisa ser
  substituída pela abordagem de telas reais + dados fake (decisão técnica já validada em
  `.portal/tasks/real-screens-with-fake-data-provider-in-home.md`, ainda não implementada).
- `HeroDashboardPreview.tsx`, `HomeBenefitsSection.tsx`, `HomeHowItWorksSection.tsx` — já
  **excluídos** do projeto (decisão anterior do usuário), não devem voltar.
- `framer-motion` já está instalado no projeto — sem necessidade de nova dependência para
  animações.

## O que o usuário quer (visão consolidada de todas as trocas da conversa)

1. A Home precisa parecer **moderna e atrativa** como um todo — não é sobre uma seção isolada, é
   sobre a página inteira ter a mesma qualidade de composição, hierarquia visual e acabamento.
2. A peça central de prova/conversão é uma **seção interativa onde o sistema real roda embutido
   na Home**, sem login, sem persistência — usando os componentes reais do app
   (`FinanceDashboard`, `MovimentacoesScreen`, `ExpenseDialog`, `IncomeDialog`, dentro de
   `AppShell`), com dados fake resolvidos via interceptação em `apiRequest` (decisão técnica já
   validada, não deve ser reaberta — ver task de referência acima).
3. Manter a paleta de cores/identidade visual atual (tokens `site-*`/`brand-*`) — decisão já
   tomada anteriormente e reafirmada, sem indicação de mudança.
4. A experiência interativa por si só resolve **prova/confiança** ("o produto funciona de
   verdade"), mas não resolve sozinha a **percepção estética geral** — isso depende do resto da
   composição (hero, transições entre seções, prova social) ter o mesmo nível de cuidado.

## Objetivo desta rodada de planejamento

Definir e implementar a Home como uma peça única e coesa:

- Hero: já animado, avaliar se a composição (não só a animação) precisa de ajuste para dar mais
  destaque/contexto à seção interativa que vem logo a seguir.
- Seção interativa: substituir `demo-app/*` pela implementação de telas reais + `apiRequest`
  interceptado, exatamente conforme já decidido tecnicamente.
- Transição entre hero → seção interativa → avaliações → footer: pensar como um fluxo de leitura
  único (espaçamento, cor de fundo, animações consistentes entre as seções), não blocos
  desconectados.
- Seção de avaliações: já tem `ScrollReveal`; avaliar se cabe reforço visual para não parecer um
  apêndice depois do "prato principal" (a seção interativa).

## Fora do escopo

- Reabrir a decisão técnica de como a seção interativa busca dados (interceptação em
  `apiRequest`) — já validada, tratar como resolvida.
- Mudança de paleta de cores.
- Páginas públicas além da Home (`/funcionalidades`, `/sobre`, etc.).
- Qualquer persistência real ou autenticação real.

## Observações para o /planejar

- Esta spec é intencionalmente mais "visão geral" que as anteriores — o `/planejar` deve
  investigar o estado atual de cada seção (incluindo o que já foi validado como correto: hero
  animado, `ScrollReveal`, decisão técnica da seção interativa) e propor uma estratégia de
  implementação que trate a Home como conjunto, evitando repetir o padrão de "uma seção fica boa,
  as outras ficam devendo".
- Ler `.portal/tasks/real-screens-with-fake-data-provider-in-home.md` para o mapeamento técnico
  completo já feito da seção interativa (não refazer essa investigação).
