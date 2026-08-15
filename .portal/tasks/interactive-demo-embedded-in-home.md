# Task: Simulação interativa do sistema embutida na Home

## Contexto

O projeto é um sistema financeiro (Fingerence) com site público (Home, Funcionalidades, Planos,
Sobre, Contato) e aplicação autenticada (dashboard, movimentações, reservas, relatórios). A Home
pública (`src/screens/public/HomePage.tsx`) hoje apresenta o produto através de blocos estáticos:
um hero, um preview visual do dashboard (`HeroDashboardPreview.tsx`, dados fictícios fixos), uma
seção de benefícios com cards (`HomeBenefitsSection.tsx`) e uma seção "como funciona" com timeline
de 4 passos interativos por hover/click (`HomeHowItWorksSection.tsx`, também com previews de dados
fictícios fixos).

Uma primeira rodada de melhorias visuais já foi aplicada na Home (redesign com `framer-motion`
para animações de entrada ao rolar, reativação de uma decoração de fundo que estava oculta em
`HomeBenefitsSection.tsx`) e está na branch `feat/R/home-redesign-moderno`, ainda não mesclada.
Apesar disso, o usuário avalia que a Home continua "simplória" — o problema não é só visual, é que
a Home apenas *mostra* o produto (prints, mockups com dados fixos), sem deixar o visitante
*experimentar* de fato.

## Problema

Visitantes da Home não conseguem interagir com o sistema antes de criar conta. Os previews atuais
(`HeroDashboardPreview`, os mini-previews de `HomeHowItWorksSection`) usam dados fictícios fixos e
não reagem a nenhuma ação do visitante — são essencialmente imagens estáticas construídas com
componentes React. Isso limita a percepção de valor do produto e reduz o potencial de conversão,
já que a pessoa precisa "confiar" na promessa em vez de comprovar o funcionamento.

Adicionalmente, as telas reais do sistema autenticado (`FinanceDashboard.tsx` com 614 linhas,
`ExpenseDialog.tsx` com 976 linhas, `IncomeDialog.tsx` com 837 linhas, todas em
`src/screens/finance/`) são grandes e fortemente acopladas à API real via hooks como
`useFinanceDashboard` (`src/hooks/useFinanceDashboard.ts`), que usa `useQuery`/`useMutation` do
React Query apontando para `financeService`, que por sua vez chama a API real. Não existe hoje
nenhuma camada de mock ou modo sandbox nessas telas.

## Objetivo

Substituir a forma atual de "mostrar o produto" na Home por uma seção interativa embutida onde o
visitante usa uma simulação do sistema com a moldura visual de um app real (sidebar de navegação +
área de conteúdo trocável, no estilo do `AppShell.tsx` autenticado e do `HeroDashboardPreview.tsx`
atual), podendo inserir seus próprios dados (lançar despesa, lançar receita, criar categoria) e ver
tudo refletido em tempo real em um extrato e painel de totais — sem nenhuma persistência real.

## Decisão Técnica Desejada

- A simulação deve ficar **embutida diretamente na Home** (não em modal, não em página separada
  como `/demo` ou em `/funcionalidades`), substituindo o espaço hoje ocupado pelo bloco "Visão do
  sistema" + `HeroDashboardPreview`.
- Toda a interatividade deve rodar em **estado local no navegador** (ex. `useState`/`useReducer`
  em um hook próprio da simulação), sem chamar `apiRequest` nem qualquer endpoint real. O estado é
  perdido ao recarregar a página — isso é esperado.
- Não reaproveitar diretamente os componentes reais (`ExpenseDialog`, `IncomeDialog`,
  `FinanceDashboard`, `MovimentacoesScreen`) por serem grandes e acoplados à API real. A
  simulação deve ter componentes próprios, mais simples, com os campos essenciais, inspirados
  visualmente nos componentes reais e em `HeroDashboardPreview.tsx`.
- A moldura da simulação deve ter aparência de app real: sidebar/menu de navegação + área de
  conteúdo, no espírito do `AppShell.tsx` (autenticado) e do `HeroDashboardPreview.tsx` (já usado
  hoje na Home).
- Deve haver um indicador visual permanente e claro de que aquilo é uma demonstração (ex. badge
  "Demonstração"), para não confundir o visitante com o produto de produção real.
- `HomeBenefitsSection.tsx` e `HomeHowItWorksSection.tsx` deixam de ser usadas em
  `HomePage.tsx` (a task não determina se os arquivos são apagados ou apenas desconectados —
  ver "Perguntas Para o Planejamento").

## Escopo Funcional

### Dentro do escopo

- Lançar despesa: formulário simplificado (descrição, valor, data, categoria).
- Lançar receita: formulário simplificado (descrição, valor, data).
- Criar categoria: nome da categoria, disponível nos seletores dos formulários acima.
- Visualizar extrato/lista de lançamentos da sessão atual, atualizada em tempo real.
- Painel/resumo com totais (recebido, pago, saldo) calculados a partir do estado local da sessão.
- Indicador visual de "Demonstração" sempre visível dentro da simulação.
- Substituição do bloco "Visão do sistema" + `HeroDashboardPreview` pela nova seção interativa em
  `HomePage.tsx`.
- Remoção do uso de `HomeBenefitsSection` e `HomeHowItWorksSection` em `HomePage.tsx`.

### Fora do escopo inicial

- Persistência real (banco de dados, API) de qualquer dado inserido na simulação.
- Autenticação real, conta demo persistida no banco, ou qualquer sessão real.
- Multi-perfil (Pessoal/Empresa) dentro da simulação.
- Reservas, relatórios em PDF, configurações, planos/pagamento dentro da simulação.
- Redesign ou alteração do `ExpenseDialog.tsx`/`IncomeDialog.tsx` reais do sistema autenticado.
- Uso da simulação em outras páginas públicas (`/funcionalidades`, `/sobre`) — fica restrita à
  Home, por decisão já tomada com o usuário.
- Deleção definitiva dos arquivos `HomeBenefitsSection.tsx`, `HomeHowItWorksSection.tsx` e
  `HeroDashboardPreview.tsx` — decisão pendente, ver seção de perguntas.

## Requisitos de Frontend

- Novo hook de estado local (ex. `useDemoFinanceState`) gerenciando listas de despesas, receitas
  e categorias da sessão de demonstração, com funções para adicionar itens e derivar totais.
- Novos componentes de UI para a simulação: moldura (sidebar + área de conteúdo), formulário de
  despesa, formulário de receita, formulário de categoria, lista de extrato, painel de totais —
  todos consumindo o hook de estado local acima, sem `useQuery`/`useMutation` reais.
- Reutilizar tokens visuais existentes (`site-*`, `brand-*` do Tailwind) e, quando fizer sentido,
  `framer-motion` (já instalado no projeto) para transições dentro da simulação.
- Atualizar `src/screens/public/HomePage.tsx`: remover `HomeBenefitsSection`,
  `HomeHowItWorksSection` e o bloco atual "Visão do sistema" + `HeroDashboardPreview`; inserir a
  nova seção interativa no lugar.
- Preservar acessibilidade básica dos formulários da simulação (labels, foco, navegação por
  teclado), mesmo sendo uma demonstração.
- Preservar comportamento das seções mantidas da Home (hero, avaliações, header, footer).

## Requisitos de Backend

Sem impacto backend identificado inicialmente. A simulação não deve, em nenhuma hipótese, chamar
endpoints reais.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Não aplicável no sentido de tenant/prefeitura (este projeto usa `usuario_id`, não é o sistema
multi-prefeitura descrito no `AGENT.md` de backend genérico do monorepo). Ainda assim:

- Garantir que nenhum dado inserido na simulação seja enviado para a API real, mesmo
  acidentalmente (ex. reaproveitamento indevido de um service que faça `apiRequest`).
- Garantir que a simulação não exponha ou reutilize tokens de sessão reais.

## Requisitos de Migração ou Compatibilidade

Não aplicável — não há dados legados ou contratos de API envolvidos, é funcionalidade nova e
isolada do restante do sistema.

## Requisitos de Testes

### Frontend

- Verificação manual de que lançar despesa/receita reflete no extrato e nos totais do painel em
  tempo real.
- Verificação de que criar categoria reflete no seletor dos formulários.
- Verificação de que nenhuma chamada de rede é feita para a API real a partir da simulação
  (inspecionável via aba de rede do navegador durante validação manual).
- Verificação visual em mobile, tablet e desktop.

### Backend

Não aplicável.

### E2E

Não aplicável inicialmente — funcionalidade de marketing/demonstração, sem fluxo de negócio real
envolvido.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/public/HomePage.tsx` (remoção de seções antigas, inclusão da nova seção)
- `src/screens/public/components/HomeBenefitsSection.tsx` (deixa de ser referenciada em
  `HomePage.tsx`; destino final a identificar durante o planejamento)
- `src/screens/public/components/HomeHowItWorksSection.tsx` (idem)
- `src/screens/public/components/HeroDashboardPreview.tsx` (idem)
- Novo diretório para a simulação (ex. `src/screens/public/components/demo-app/`) — nomes exatos
  de arquivos a definir durante o planejamento
- Referência visual (sem alteração direta): `src/layout/AppShell.tsx` (estrutura de sidebar do
  app real autenticado)

### Backend

Não aplicável.

### Banco de Dados

Não aplicável.

## Critérios de Aceite

- A Home exibe a seção interativa de demonstração logo após o hero, sem necessidade de clique
  para revelá-la.
- O visitante consegue lançar uma despesa e uma receita preenchendo campos próprios, e vê o
  lançamento refletido na lista de extrato imediatamente.
- O visitante consegue criar uma categoria e usá-la ao lançar uma despesa.
- O painel de totais reflete corretamente os valores lançados durante a sessão.
- Nenhuma requisição de rede é feita para a API real a partir dos componentes da simulação.
- A simulação exibe um indicador visual permanente de que é uma demonstração.
- `HomeBenefitsSection` e `HomeHowItWorksSection` não são mais renderizadas em `HomePage.tsx`.
- Build (`vite build`) e checagem de tipos (`tsc --noEmit`) passam sem erros.
- Paleta de cores/identidade visual (`site-*`, `brand-*`) é preservada.

## Perguntas Para o Planejamento

- Os arquivos `HomeBenefitsSection.tsx`, `HomeHowItWorksSection.tsx` e `HeroDashboardPreview.tsx`
  devem ser apagados do projeto, ou apenas deixar de ser importados em `HomePage.tsx` (mantidos
  para eventual reuso futuro, ex. em `/funcionalidades`)?
- Quando a simulação carrega sem nenhum lançamento ainda feito pelo visitante, qual deve ser o
  estado vazio do painel/extrato — zerado com call-to-action incentivando o primeiro lançamento,
  ou pré-populado com 1-2 exemplos editáveis/excluíveis?
- A navegação da moldura da simulação (sidebar) deve incluir alguma seção adicional além de
  Painel/Despesas/Receitas/Categorias/Extrato, ou o escopo funcional já descrito é suficiente?
- Deve haver algum CTA (ex. "Criar minha conta") embutido dentro da própria simulação, ou o CTA de
  conversão continua sendo apenas o já existente no restante da Home?
- A seção interativa deve ter uma altura/formato fixo (ex. card grande com scroll interno) ou deve
  se expandir livremente conforme o conteúdo (ex. extrato crescendo com mais lançamentos)?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto — apenas
  o arquivo único na raiz, majoritariamente voltado a backend/multi-tenant, sem impacto direto
  nesta feature frontend-only).
- Inspecione os arquivos citados antes de escrever o plano, especialmente `HomePage.tsx`,
  `HeroDashboardPreview.tsx`, `AppShell.tsx` e o hook `useFinanceDashboard.ts` (para reforçar por
  que as telas reais não são diretamente reaproveitáveis).
- Classifique a implementação como `frontend-only`, salvo se a investigação mostrar outro escopo.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento (`framer-motion` já está instalado no projeto).
- Não execute migrations (não aplicável a esta task).
- Gere um plano em `.plans/` (este projeto usa `.plans/`, não `.portal/plans/`) com etapas
  pequenas, revisáveis e seguras.
