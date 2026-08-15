# Task: Reaproveitar telas reais do sistema na Home com provedor de dados fake

## Contexto

Duas tentativas anteriores de trazer "o sistema" para a Home não atenderam ao que o usuário quer:

1. Uma primeira versão (`.plans/home-redesign-moderno-e-modo-demo.md`) propunha um modal com
   telas mockadas simples — descartada porque não era embutida na Home e não usava dados
   inseridos pelo próprio visitante.
2. Uma segunda versão (`.plans/home-sistema-interativo-embutido.md`, já implementada na branch
   `feat/R/home-redesign-moderno`) construiu componentes **próprios e simplificados**
   (`src/screens/public/components/demo-app/*`) inspirados visualmente nas telas reais, com um
   hook de estado local (`useDemoFinanceState`). O usuário rejeitou o resultado: "quero o sistema
   funcionando como ele é", não uma réplica.

O usuário quer as **telas reais do sistema autenticado** — os componentes que já existem em
produção (`src/screens/finance/FinanceDashboard.tsx`, `MovimentacoesScreen.tsx`,
`ExpenseDialog.tsx`, `IncomeDialog.tsx`) — rodando embutidas na Home, sem exigir login e sem
persistir nenhum dado. A pessoa deve poder interagir com o sistema de verdade (mesmos campos,
mesmo comportamento visual), inserindo seus próprios dados, sem nada ser salvo em banco.

## Investigação técnica já realizada

As 4 telas reais não têm um único ponto de acesso a dados — cada uma consome múltiplas fontes via
React Query (`useQuery`/`useMutation`), cada fonte vinda de uma função de service que internamente
chama `apiRequest` (`src/services/apiClient.ts`), que por sua vez faz `fetch` real contra a API
(`getApiUrl()`) usando token de `sessionStorage`/`localStorage`.

Mapeamento de todas as fontes de dados encontradas (por tela):

**`FinanceDashboard.tsx`** (614 linhas):
- `useFinanceDashboard(month, year)` (`src/hooks/useFinanceDashboard.ts`) — dashboard do mês
  (receitas, despesas, saldo), via `fetchFinanceDashboard`, `saveIncome`, `deleteIncome`,
  `saveExpense`, `deleteExpense` de `src/services/financeService.ts`.
- `fetchDashboardAnual(year)` (`financeService.ts`) — visão anual.
- `getContratosFaturamento(month + 1, year)` (`financeService.ts`) — contratos a faturar.
- `fetchParcelasFuturas(month, year, 3)` (`financeService.ts`) — parcelas futuras.

**`MovimentacoesScreen.tsx`** (353 linhas):
- `useFinanceDashboard(month, year)` (mesma fonte acima).
- `fetchDashboardAnual(year)` (`financeService.ts`).
- `fetchReservas` / `movimentar` (`src/services/reservasService.ts`).
- Chamada de `apiRequest` **direta dentro do componente** (não via service nomeado) para checar e
  alterar status de "mês fechado" (`GET /meses`, `POST /meses/{ano}/{mes}/fechar`) — recurso de
  fechamento contábil mensal, não faz sentido em uma demo sem histórico persistente.

**`ExpenseDialog.tsx`** (976 linhas):
- `fetchCategorias`, `fetchCartoes`, `saveCategoria` (`src/services/configService.ts`).
- `fetchExpenseSuggestions` (`src/services/expenseSuggestionsService.ts`) — autocomplete por
  descrição digitada.

**`IncomeDialog.tsx`** (837 linhas):
- `fetchRepresentantes` (`src/services/representantesService.ts`).
- `fetchIncomeTypes`, `saveIncomeType` (`src/services/incomeTypesService.ts`).
- `fetchContratosAtivos`, `fetchClientes`, `saveCliente` (`src/services/clientesService.ts`).
- `fetchIncomeSuggestions` (`src/services/incomeSuggestionsService.ts`).

Todas essas telas importam essas funções diretamente dos arquivos de service (ex.
`import { fetchCategorias, fetchCartoes } from '../../services/configService'`), não recebem os
dados via props — ou seja, não há hoje nenhum ponto de "injeção de dependência" pronto para trocar
a fonte de dados sem tocar nos imports de cada tela.

## Problema

Não existe hoje nenhuma camada de mock, modo sandbox ou abstração de fonte de dados nessas telas.
Elas estão desenhadas para um único cenário: usuário autenticado, API real, banco real. Rodá-las
sem tocar a API real exige, para cada uma das ~14 fontes de dados mapeadas acima, uma versão
alternativa que devolve/aceita dados em memória, mantendo a mesma assinatura de função (mesmos
tipos de entrada e retorno) para que o componente da tela não precise mudar sua lógica interna,
apenas a origem do dado.

## Objetivo

Fazer as 4 telas reais (`FinanceDashboard`, `MovimentacoesScreen`, `ExpenseDialog`, `IncomeDialog`)
rodarem embutidas na Home pública, sem autenticação, com todas as suas fontes de dados substituídas
por uma implementação que vive inteiramente em memória do navegador (sem `fetch`, sem
`apiRequest`, sem tocar `localStorage`/`sessionStorage` de sessão real), permitindo que o visitante
insira despesas, receitas, categorias, cartões, reservas etc. e veja tudo refletir entre as telas,
sem nenhuma persistência real.

## Decisão Técnica Desejada

- Criar, para cada um dos services reais consultados por essas telas, uma **versão "fake" com a
  mesma assinatura de função** (mesmo nome de função, mesmos tipos de parâmetro e retorno,
  definidos em `src/types/finance.ts` e arquivos de tipo correlatos), operando sobre um estado em
  memória compartilhado entre as 4 telas durante a sessão de demonstração.
- Definir um mecanismo de troca entre a implementação real e a fake — por exemplo, um contexto
  React (`DemoDataProvider`) que injeta as versões fake, e os componentes passam a importar de um
  módulo indireto (ex. um arquivo `financeService` que decide qual implementação usar com base em
  contexto) em vez de importar diretamente o service real. A abordagem exata de injeção deve ser
  decidida durante o planejamento, avaliando o menor número de mudanças possível nos arquivos das
  4 telas reais.
- Recursos que não fazem sentido em uma demo sem persistência (ex. fechamento de mês, faturamento
  de contrato) devem ter suas mutações fake apenas simulando sucesso (sem quebrar a UI), sem
  necessidade de replicar toda a regra de negócio real.
- A UI, textos, campos e comportamento visual das 4 telas **não devem ser alterados** — a única
  mudança é a origem dos dados.
- Deve haver um indicador visual permanente e claro de que aquilo é uma demonstração, sem persistir
  dados, sobreposto ou integrado à moldura real do app (`AppShell.tsx` ou versão adaptada dele para
  a Home, já que a versão autenticada tem elementos não aplicáveis como logout real).

## Escopo Funcional

### Dentro do escopo

- `FinanceDashboard.tsx`, `MovimentacoesScreen.tsx`, `ExpenseDialog.tsx`, `IncomeDialog.tsx`
  rodando com dados fake, embutidos na Home.
- Todas as ~14 fontes de dados mapeadas acima com implementação fake correspondente.
- Estado fake compartilhado entre as 4 telas dentro da mesma sessão de navegador (lançar uma
  despesa em `ExpenseDialog` deve refletir em `FinanceDashboard` e `MovimentacoesScreen`).
- Indicador visual de demonstração.
- Remoção da implementação anterior (`src/screens/public/components/demo-app/*`), já que foi
  rejeitada e será substituída por esta abordagem.

### Fora do escopo inicial

- Persistência real de qualquer dado.
- Autenticação real ou sessão real.
- Réplica de regras de negócio complexas que não têm efeito visível numa demo (ex. faturamento de
  contrato completo, geração de PDF de relatório real).
- Uso desta simulação em páginas públicas além da Home.
- Multi-perfil (Pessoal/Empresa) — avaliar se `PerfilSwitcher` (parte de `AppShell.tsx`) deve
  aparecer na versão de demonstração ou ser omitido.

## Requisitos de Frontend

- Criar módulo de dados fake para cada service consultado pelas 4 telas, com as mesmas assinaturas
  das funções reais.
- Definir mecanismo de injeção de dados fake sem alterar a lógica interna das 4 telas reais (ou
  com o mínimo de alteração possível, documentando cada mudança feita nelas).
- Garantir que nenhuma chamada real a `apiRequest`/`fetch` ocorra a partir do contexto de
  demonstração.
- Isolar qualquer leitura/escrita de `localStorage`/`sessionStorage` usada pelas telas reais (ex.
  `getActiveProfileId`, seleção de perfil ativo) para não colidir com uma sessão real do mesmo
  navegador.
- Adaptar ou reaproveitar `AppShell.tsx` como moldura, removendo/adaptando elementos não aplicáveis
  ao contexto de demonstração (logout real, notificações reais).
- Preservar responsividade e acessibilidade já existentes nas telas reais.

## Requisitos de Backend

Sem impacto backend identificado inicialmente. Nenhuma chamada real deve ocorrer a partir do
contexto de demonstração.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

- Garantir isolamento total entre o estado da demonstração e qualquer sessão real do mesmo
  navegador — nenhuma leitura ou escrita cruzada em `localStorage`/`sessionStorage` de sessão real.
- Garantir que nenhum dado inserido na demonstração seja enviado à API real, mesmo
  acidentalmente, caso alguma função de service real seja chamada por engano durante a
  implementação.

## Requisitos de Migração ou Compatibilidade

- A implementação anterior (`src/screens/public/components/demo-app/*`, já mesclada na branch
  `feat/R/home-redesign-moderno`) deve ser removida e substituída por esta abordagem.

## Requisitos de Testes

### Frontend

- Verificação manual de que as 4 telas carregam e funcionam sem chamadas reais à API
  (inspecionável via aba de rede do navegador).
- Verificação de que lançar despesa/receita em uma tela reflete corretamente nas outras.
- Verificação visual em mobile, tablet e desktop.

### Backend

Não aplicável.

### E2E

Não aplicável inicialmente.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/hooks/useFinanceDashboard.ts`
- `src/services/financeService.ts`, `configService.ts`, `expenseSuggestionsService.ts`,
  `representantesService.ts`, `incomeTypesService.ts`, `clientesService.ts`,
  `incomeSuggestionsService.ts`, `reservasService.ts` — origem das funções a mockar
- `src/layout/AppShell.tsx` — referência/possível reaproveitamento de moldura
- `src/screens/public/HomePage.tsx`
- A remover: `src/screens/public/components/demo-app/*` (implementação anterior rejeitada)
- Novo: módulo(s) de dados fake e mecanismo de injeção — caminho exato a definir no planejamento

### Backend

Não aplicável.

### Banco de Dados

Não aplicável.

## Critérios de Aceite

- As 4 telas reais (Dashboard, Movimentações, diálogo de despesa, diálogo de receita) funcionam
  embutidas na Home, com a mesma aparência e campos do sistema autenticado real.
- O visitante consegue inserir despesas, receitas e ver os dados refletidos entre as telas.
- Nenhuma requisição de rede é feita para a API real a partir do contexto de demonstração.
- Nenhuma leitura/escrita ocorre em `localStorage`/`sessionStorage` de forma que colida com uma
  sessão real do mesmo navegador.
- Indicador visual de demonstração está sempre presente.
- Build (`vite build`) e checagem de tipos (`tsc --noEmit`) passam sem erros.

## Perguntas Para o Planejamento

- Qual mecanismo de injeção de dados fake tem o menor custo de mudança nas 4 telas reais: contexto
  React que os services já verificam internamente, um "flag" de ambiente que o build usa para
  trocar o módulo de import, ou outra abordagem?
- `AppShell.tsx` deve ser reaproveitado diretamente (com adaptações) ou vale mais a pena uma versão
  simplificada própria só para a demonstração, dado que ele tem elementos como logout real e
  notificações via API que não fazem sentido no contexto sem sessão?
- Como tratar `PerfilSwitcher` (troca entre perfil Pessoal/Empresa) — a task de origem já definiu
  multi-perfil como fora de escopo, então deve ser omitido ou desabilitado na moldura?
- Recursos como fechamento de mês (`MovimentacoesScreen`) e faturamento de contrato
  (`FinanceDashboard`) devem ficar visíveis na UI (com ação fake que apenas simula sucesso) ou
  ocultos/desabilitados nesta demonstração?
- Anexos de arquivo (usados em despesas/receitas reais) devem ser suportados de alguma forma na
  versão fake, ou tratados como fora de escopo?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto).
- Inspecione as 4 telas reais e os ~14 services mapeados antes de propor a estratégia de injeção
  de dados fake — o objetivo é confirmar (ou refinar) o mapeamento já feito nesta task.
- Classifique a implementação como `frontend-only`, salvo se a investigação mostrar outro escopo.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não aplicável a esta task).
- Gere um plano em `.plans/` (este projeto usa `.plans/`, não `.portal/plans/`) com etapas
  pequenas, revisáveis e seguras — dado o tamanho desta feature, considere dividir a estratégia em
  sub-etapas com checkpoints de validação intermediária.
