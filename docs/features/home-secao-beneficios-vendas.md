# Feature: Seção de benefícios/venda na Home (separada da demo interativa)

## Contexto

A Home pública (`src/screens/public/HomePage.tsx`) hoje tem: Header → Hero (com indicador de
scroll) → `HomeInteractiveDemo` (seção com o sistema real embutido, sem persistência) → Avaliações
(condicional) → CTA final → Footer.

Nas rodadas anteriores de trabalho nesta Home, a antiga `HomeBenefitsSection.tsx` (cards de
benefício: "Seu mês sob controle", "Visibilidade real", "Perfis completamente separados") foi
removida junto com `HomeHowItWorksSection.tsx` e `HeroDashboardPreview.tsx`, sob a premissa de que
a nova seção interativa (`HomeInteractiveDemo`) substituiria o papel de "vender o produto" dessas
seções. O usuário identificou que isso foi um erro de escopo: a demo interativa prova que o
sistema funciona (gera confiança), mas não comunica sozinha os benefícios/proposta de valor do
produto — a Home ficou sem conteúdo de venda próprio, textual, que ajude a página "se vender
sozinha".

## O que o usuário quer

Uma seção de benefícios/conteúdo de venda **própria da Home**, não vinculada ou embutida dentro da
demo interativa — a demo continua sendo "mais uma parte da Home", não a página inteira.

Formato já decidido pelo usuário: **blocos simples de texto + ícone**, mais enxuto que os cards
antigos (que tinham mockups visuais embutidos dentro de cada card). Ou seja: ícone + título curto
+ 1-2 linhas de benefício, sem preview visual dentro do bloco.

## Objetivo

Adicionar uma seção de benefícios à Home, com 3-4 blocos (ícone + título + descrição curta),
focados em comunicar por que usar o produto — não descrevendo funcionalidades técnicas, mas o
resultado/benefício para quem usa (ex.: organização, controle, rapidez, clareza).

## Escopo funcional

- 3 a 4 blocos de benefício, cada um com: ícone, título curto, descrição de 1-2 linhas.
- Conteúdo é estático (sem dados dinâmicos/API).
- Não deve reintroduzir mockups visuais dentro dos blocos (decisão já tomada: mais enxuto que a
  versão antiga).

## Fora do escopo

- Qualquer alteração na seção interativa (`HomeInteractiveDemo`) — ela continua como está.
- Mudança de paleta de cores.
- Reintrodução de `HeroDashboardPreview` ou qualquer mockup visual estático.

## Observações para o /planejar

- Definir a posição exata dessa seção na Home (antes ou depois da demo interativa, ou em outro
  ponto) — não foi especificado pelo usuário ainda, deve ser levantado como decisão pendente.
- Avaliar se cabe reaproveitar algum padrão visual já existente no projeto (ex. `SectionIcon`,
  paleta de tons usada em `HomeBenefitsSection` antiga, disponível no histórico do git em
  `c02a9ad~1:src/screens/public/components/HomeBenefitsSection.tsx`) apenas como referência de
  estilo, não de estrutura (já que o formato pedido agora é mais simples).
- Sem impacto em backend/banco de dados — conteúdo estático de marketing.
