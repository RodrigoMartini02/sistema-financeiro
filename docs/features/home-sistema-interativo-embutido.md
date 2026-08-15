# Feature: Sistema interativo embutido na Home (demo sem persistência)

## Contexto

Esta spec substitui a anterior (`docs/features/home-redesign-moderno-e-modo-demo.md`, que gerou
o plano `.plans/home-redesign-moderno-e-modo-demo.md`). Desse plano, a Etapa 1 (redesign visual
com `framer-motion` e `ScrollReveal`) já foi implementada na branch `feat/R/home-redesign-moderno`
e validada visualmente pelo usuário — **mantém-se**. A Etapa 2 original (modal de modo demo com
telas mockadas simples) é descartada e substituída pelo escopo desta spec, que é maior e mais
ambicioso.

## O que o usuário quer (conversa completa)

O usuário considera a Home "simplória" mesmo após o redesign visual da Etapa 1. O que ele quer é
uma mudança estrutural: **trazer o próprio sistema para dentro da página**, para que o visitante
sinta que está usando o produto de verdade, não vendo prints ou mockups.

Detalhamento, capturado ao longo de várias trocas de clarificação:

1. Não é um modal que abre ao clicar em um botão — é uma seção **embutida diretamente na Home**,
   já visível, sem precisar de ação extra para "entrar" no modo demo.
2. Não é o sistema pré-populado com dados fake para o visitante só olhar — **a pessoa adiciona os
   próprios dados**. Ela digita "Aluguel, R$ 1.200", clica em salvar, e vê aquilo aparecer no
   extrato/dashboard na hora, como se fosse a conta dela.
3. O layout deve ser o **layout completo do app real** — sidebar com menu (Painel, Movimentações,
   Reservas, Relatórios etc., como já existe em miniatura hoje no `HeroDashboardPreview`) + área
   de conteúdo que troca ao navegar — não abas simples soltas.
4. **Nada é persistido de verdade.** Todo o estado (despesas, receitas, categorias criadas) vive
   em memória no navegador (ex. `useState`/`useReducer` local), sem chamadas a `apiRequest` ou ao
   backend real. Se a página recarregar, tudo se perde — isso é esperado e aceito pelo usuário.
5. É obrigatório deixar claro para o visitante que aquilo é uma demonstração (algum indicador
   visual permanente, ex. badge "Demonstração" ou texto equivalente), para não confundir com o
   sistema de produção real.

## Estrutura da Home resultante

Decisões já confirmadas pelo usuário nesta conversa:

- **Mantém**: Hero (`SitePageHero`), a nova seção interativa (substituindo "Visão do sistema"),
  bloco de avaliações/prova social, `SiteHeader`, `SiteFooter`.
- **Remove/substitui**: `HomeBenefitsSection` (cards "Seu mês sob controle" etc.) e
  `HomeHowItWorksSection` (timeline de 4 passos) — o papel de "mostrar o produto" passa a ser
  cumprido pela experiência interativa em si, não mais por cards estáticos explicando.
- A nova seção interativa fica posicionada onde hoje está o bloco "VISÃO DO SISTEMA" +
  `HeroDashboardPreview`, logo após o hero.

## Escopo funcional da simulação (fluxo essencial, decidido em ciclo de planejamento anterior)

- Lançar despesa (formulário completo: descrição, valor, data, categoria)
- Lançar receita (formulário completo: descrição, valor, data)
- Criar categoria (nome, usada nos seletores dos formulários acima)
- Visualizar extrato/lista de lançamentos (reflete em tempo real o que foi adicionado)
- Painel/dashboard simplificado refletindo os totais calculados a partir dos lançamentos da sessão
  (reaproveitando a essência visual do `HeroDashboardPreview` já existente, mas agora reagindo a
  dados reais da sessão do visitante, não mais estáticos)

Fora do escopo desta simulação: reservas, relatórios em PDF, configurações, planos/pagamento,
multi-perfil (Pessoal/Empresa) — a menos que decisão em `/planejar` amplie isso.

## Restrições técnicas já identificadas (de análise anterior, ainda válidas)

- Projeto não tem biblioteca de mock de API nem camada de dados fake reaproveitável hoje.
- As telas reais autenticadas (`FinanceDashboard`, `MovimentacoesScreen` em `src/App.tsx`) estão
  fortemente acopladas a hooks que batem na API real (`useFinanceDashboard`, `useAuthSession`,
  etc.) — não são reaproveitáveis diretamente sem adaptação. A decisão de arquitetura (construir
  componentes visuais próprios para a simulação vs. tentar desacoplar as telas reais de dados)
  fica para o `/planejar`.
- `framer-motion` já está instalado (Etapa 1) e pode ser reaproveitado para transições dentro da
  simulação, se fizer sentido.
- Paleta de cores/identidade visual (`site-*`, `brand-*`) deve continuar sendo respeitada.

## Fora do escopo

- Qualquer persistência real (banco de dados, API) dos dados inseridos na simulação.
- Autenticação real ou conta demo no banco.
- Redesign do `ExpenseDialog.tsx` real do sistema autenticado.
- Multi-perfil (Pessoal/Empresa) na simulação, reservas, relatórios, planos — a menos que
  decisão em `/planejar` amplie.

## Observações

- Sem impacto em backend/banco de dados — é frontend-only, com estado inteiramente local.
- Reforçar visualmente e/ou textualmente que é uma demonstração, para gerenciar expectativa do
  visitante e evitar confusão com o produto real.
