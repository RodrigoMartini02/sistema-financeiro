# Feature: Evoluir seção "Como funciona" da Home para vender o produto

## Contexto

A Home pública (`src/screens/public/HomePage.tsx`) já possui uma seção `HomeHowItWorksSection`
(`src/screens/public/components/HomeHowItWorksSection.tsx`) com 4 passos interativos (timeline
com hover/click), cada um mostrando um mini-mockup do produto:

1. Crie seu perfil (preview: seleção Pessoal/Empresa)
2. Registre seus movimentos (preview: formulário de receita/despesa)
3. Acompanhe o mês (preview: recebido/pago/pendente)
4. Analise seus resultados (preview: relatório por categoria + exportar PDF)

Essa seção é **funcional/explicativa** ("como usar o sistema"), não **persuasiva** ("por que você
precisa disso"). O usuário quer reforçar o caráter de venda dessa parte da Home, mantendo o
formato de mockup interativo do sistema em uso (não quer voltar a um dashboard estático).

Existe também `HeroDashboardPreview.tsx`, usado logo abaixo do hero, que mostra um preview do
dashboard resumo (a imagem de referência trazida pelo usuário na conversa corresponde a esse
componente).

## Problema a resolver

A seção atual comunica bem "como o produto funciona", mas não comunica claramente **o benefício**
de cada ação nem oferece um gancho de conversão (CTA) ao longo da seção — hoje só há 1 CTA
("Começar 15 dias grátis") no final de tudo.

## Comportamento esperado

Reforçar a seção `HomeHowItWorksSection` (ou seção equivalente) para vender o produto, mantendo
os mockups reais do sistema (registrar despesa, registrar receita, criar categoria, visualizar
tabela/extrato — ações mais usadas pelos usuários), mas com foco em benefício em vez de apenas
descrição funcional:

- Cada passo/aba deve comunicar um **benefício direto** (o resultado que o usuário ganha), não só
  a ação em si. Exemplo de direção: em vez de "Registre seus movimentos", algo como "Lance em
  segundos, sem esperar o extrato do banco".
- Avaliar inclusão de **micro-CTA por etapa** (ex.: "Experimente grátis"), sem poluir visualmente
  a seção atual.
- Avaliar se telas adicionais fazem sentido no fluxo existente: criar categoria e visualizar
  tabela/extrato são ações de alto uso que hoje não têm preview dedicado (os previews atuais são:
  perfil, transação, mês, relatório).
- Manter mockups como componentes com dados fictícios fixos (não puxar dados reais/API), seguindo
  o padrão já usado nos previews existentes (`ProfilePreview`, `TransactionPreview`,
  `MonthlyPreview`, `ReportPreview` dentro de `HomeHowItWorksSection.tsx`).

## Usuários afetados

Visitantes públicos (não autenticados) da Home — página de marketing/conversão, sem impacto em
usuários logados ou em dados reais.

## Telas afetadas

- Home pública (`/`), seção "Como funciona" (`HomeHowItWorksSection`) e possivelmente a seção
  logo acima (`HeroDashboardPreview` + bloco "VISÃO DO SISTEMA" em `HomePage.tsx`).

## Fora do escopo

- Qualquer mudança em telas autenticadas/reais do sistema (`ExpenseDialog` e afins) — apenas os
  mockups estáticos da Home.
- Redesign do `ExpenseDialog.tsx` do sistema autenticado (tratado separadamente).
- Dashboard resumo (`HeroDashboardPreview`) — mudanças ali só se o /planejar identificar que faz
  sentido consolidar as duas seções.

## Observações

- Não há impacto em backend, banco de dados ou multi-tenant — é conteúdo estático de marketing.
- Manter os textos em pt-BR, no tom já usado na Home (direto, "sem planilhas e sem complicação").
