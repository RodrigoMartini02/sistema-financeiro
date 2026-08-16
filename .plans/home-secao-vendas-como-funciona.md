# Plano de Implementação: Evoluir seção "Como funciona" da Home para vender o produto

## Origem

- Arquivo de especificação: `docs/features/home-secao-vendas-como-funciona.md`
- Data do planejamento: `2026-08-15`
- Classificação: `frontend-only`

## Resumo

A Home pública já possui uma seção `HomeHowItWorksSection` com 4 passos interativos (timeline com
hover/click), cada um mostrando um mini-mockup do produto (perfil, transação, mês, relatório).
Essa seção é funcional/explicativa, não persuasiva. Este plano expande a seção para 6 passos —
adicionando "Criar categoria" e "Ver extrato/tabela", ações de alto uso hoje sem preview dedicado
— e reescreve o título/descrição de todos os 6 passos com foco em **benefício** (o que o usuário
ganha) em vez de descrição funcional (o que o passo faz). Micro-CTA por etapa fica fora de escopo
por decisão do usuário; o CTA único no final da seção ("Começar 15 dias grátis") é mantido.

## Escopo

### Dentro do escopo

- Reescrita de copy (`title`/`description`) dos 6 passos para foco em benefício.
- Criação de 2 novos componentes de preview (`CategoryPreview`, `LedgerPreview` ou nomes
  equivalentes), com dados fictícios fixos, seguindo o padrão visual dos 4 previews existentes
  (`ProfilePreview`, `TransactionPreview`, `MonthlyPreview`, `ReportPreview`).
- Recalibração do layout desktop (`cardClass`/`markerClass`, posicionamento absoluto `xl:`/`2xl:`)
  para acomodar 6 passos em vez de 4.
- Ajuste do tipo `StepId` de `1 | 2 | 3 | 4` para `1 | 2 | 3 | 4 | 5 | 6`.
- Ajuste do array `steps` (`StepConfig[]`) com os 2 novos itens.
- Teste visual de responsividade em mobile, tablet e desktop (`xl`/`2xl`), já que a timeline
  empilha verticalmente fora do breakpoint `xl:`.

### Fora do escopo

- Micro-CTA por etapa (adiado por decisão do usuário).
- Qualquer mudança em telas autenticadas/reais do sistema (`ExpenseDialog` e afins) — apenas os
  mockups estáticos da Home.
- Redesign do `ExpenseDialog.tsx` do sistema autenticado (tratado separadamente, fora deste plano).
- Mudanças no `HeroDashboardPreview.tsx` ou no bloco "VISÃO DO SISTEMA" em `HomePage.tsx`.
- Backend, banco de dados, endpoints, multi-tenant — não há impacto nessas áreas.

## Leitura de contexto

- `/AGENT.md` (raiz do projeto `sistema financas`) — lido. É majoritariamente voltado a
  backend/multi-tenant/Drizzle/PDFs; nenhuma regra dali se aplica diretamente a esta feature
  (frontend-only, sem banco de dados). Não existe `frontend/AGENT.md` nem `backend/AGENT.md`
  separados no projeto — apenas o `AGENT.md` único na raiz.
- `docs/features/home-secao-vendas-como-funciona.md` — arquivo de especificação da feature.
- `src/screens/public/components/HomeHowItWorksSection.tsx` — componente principal a alterar,
  lido por completo. Contém 4 `StepConfig` (perfil, transação, mês, relatório), 4 componentes de
  preview (`ProfilePreview`, `TransactionPreview`, `MonthlyPreview`, `ReportPreview`), timeline
  com markers clicáveis/hoveráveis e navegação por teclado (setas, Home, End).
- `src/screens/public/HomePage.tsx` — lido, confirma que `HomeHowItWorksSection` é renderizada
  entre `HomeBenefitsSection` e o bloco de avaliações, recebendo `onOpenRegister` como prop.
- `src/screens/public/components/HeroDashboardPreview.tsx` — identificado (não lido por completo),
  é o componente correspondente à imagem de referência trazida pelo usuário; fora de escopo deste
  plano.
- `.plans/` — inspecionado; já existem planos anteriores relacionados à landing pública
  (`landing-fingerence-redesign.md`, `landing-page-rebuild-conteudo.md`,
  `landing-page-nav-ctas-responsividade.md`), que podem conter contexto útil de design mas não
  foram lidos em detalhe por não serem necessários para fechar este plano.

## Impacto por área

### Frontend

- Editar `src/screens/public/components/HomeHowItWorksSection.tsx`:
  - Ampliar `StepId` para `1 | 2 | 3 | 4 | 5 | 6`.
  - Adicionar 2 novas entradas ao array `steps` (categoria e extrato/tabela), com `id`, `number`,
    `title`/`description` focados em benefício, `cardClass`/`markerClass` recalculados, e novo
    valor de `preview` (`'category'` e `'ledger'`, por exemplo).
  - Reescrever `title`/`description` dos 4 passos existentes para foco em benefício, mantendo o
    tom direto já usado na Home.
  - Criar `CategoryPreview` e `LedgerPreview` como novos componentes internos ao arquivo, seguindo
    o mesmo padrão estrutural/estilístico dos previews existentes (classes Tailwind, tokens de cor
    `site-accent`, `site-text`, etc.).
  - Atualizar a função `Preview` (dispatcher) para incluir os 2 novos tipos.
  - Recalcular `cardClass`/`markerClass` de todos os 6 passos para o layout desktop absoluto não
    sobrepor cards (hoje calibrado a dedo para 4 posições).
- Sem impacto em hooks, query keys, forms, ou chamadas de API — todos os dados dos previews são
  fictícios e fixos (comentário já existente no arquivo reforça isso: "Dados fictícios usados
  somente na demonstração pública do produto").
- Estados de loading/error/empty: não aplicável (sem dados dinâmicos).
- Testes: ver seção "Testes necessários".

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/public/components/HomeHowItWorksSection.tsx` (única edição de código esperada)

## Estratégia de implementação

1. Definir os textos finais (benefício) dos 6 passos:
   - Crie seu perfil
   - Registre seus movimentos (despesa/receita)
   - Criar categoria (novo)
   - Ver extrato/tabela (novo)
   - Acompanhe o mês
   - Analise seus resultados
2. Implementar `CategoryPreview` e `LedgerPreview`, reaproveitando padrões visuais já usados
   (cards com borda `rgba(74,153,173,0.20)`, fundo `rgba(11,43,54,0.52)`, ícones `lucide-react`).
3. Atualizar o array `steps` com os 6 itens e novo `StepId`.
4. Recalcular manualmente `cardClass`/`markerClass` para as 6 posições no layout `xl:`/`2xl:`
   absoluto, evitando sobreposição.
5. Atualizar a função `Preview` (dispatcher) para os 2 novos tipos.
6. Rodar a aplicação localmente (via skill `/run`) e validar visualmente:
   - Mobile (empilhado verticalmente)
   - Tablet
   - Desktop `xl:` e `2xl:` (posicionamento absoluto)
   - Navegação por teclado (setas, Home, End) continua funcionando com 6 passos
7. Revisar copy final com o usuário antes de considerar concluído.

## Regras de negócio identificadas

- Mockups devem usar exclusivamente dados fictícios fixos, nunca dados reais ou chamadas de API.
- Tom de comunicação: direto, sem jargão, reforçando ausência de complicação ("sem planilhas e
  sem complicação").
- Foco de copy em benefício/resultado para o usuário, não em descrição de funcionalidade.

## Regras multi-tenant e segurança

Não aplicável — feature é conteúdo estático de marketing na Home pública, sem leitura/escrita de
dados de tenant, sessão ou API.

## Validações necessárias

Não aplicável — não há formulários, inputs ou payloads nesta feature (mockups são estáticos).

## Testes necessários

### Frontend

- Verificação visual manual (via `/run`) em mobile, tablet, desktop `xl:` e `2xl:`.
- Verificar que navegação por teclado (setas, Enter, Home, End) continua funcionando com 6 steps.
- Verificar que `onOpenRegister` (CTA final) continua sendo chamado corretamente.

### Backend

Não aplicável.

### E2E

Não aplicável — não há fluxo crítico de negócio nem dados dinâmicos envolvidos.

## Comandos de validação sugeridos

```bash
npm run lint
npm run typecheck
npm run build
```

## Riscos e pontos de atenção

- Layout desktop usa posicionamento absoluto calibrado manualmente por passo (`cardClass`,
  `markerClass` com valores em `%`/`px` fixos). Expandir de 4 para 6 passos exige recalcular todos
  os valores — risco real de sobreposição de cards em telas grandes (`xl:`/`2xl:`) se não for
  testado visualmente antes de finalizar.
- Seção fica mais longa em mobile (6 cards empilhados) — pode aumentar o scroll necessário na Home
  e diluir o impacto de cada card.
- Sem impacto em staging/produção além do conteúdo visual da Home pública (sem risco de dados).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Decisões sobre número de passos (expandir para 6) e
micro-CTA (fora de escopo por ora) já foram confirmadas pelo usuário.

## Critérios de aceite do plano

- 6 passos exibidos corretamente em mobile, tablet e desktop (`xl`/`2xl`), sem sobreposição de
  cards no layout absoluto.
- Copy de cada um dos 6 passos comunica benefício, não apenas a ação/funcionalidade.
- Nenhum dado real ou chamada de API é usada nos previews (mantém padrão de dados fictícios
  fixos já estabelecido no arquivo).
- CTA final da seção ("Começar 15 dias grátis") continua funcionando via `onOpenRegister`.
- Navegação por teclado (setas, Enter/Espaço, Home, End) continua funcionando com 6 steps.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Editar apenas `src/screens/public/components/HomeHowItWorksSection.tsx` — não tocar em
  `HeroDashboardPreview.tsx`, `HomePage.tsx` ou qualquer tela autenticada.
- Seguir o padrão visual e estrutural já existente no arquivo (não introduzir nova arquitetura de
  componentes para os previews).
- Sem micro-CTA por etapa — manter apenas o CTA único já existente no final da seção.
- Validar visualmente com `/run` antes de considerar a implementação concluída, dado que é mudança
  de layout calibrado manualmente.
- Não executar migrations (não aplicável a este plano, mas reforçando por regra do projeto).
