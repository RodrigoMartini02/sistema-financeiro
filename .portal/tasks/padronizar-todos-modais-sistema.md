# Task: Padronizar todos os modais do sistema no estilo aprovado (Despesa/Receita)

## Contexto

O projeto `sistema financas` teve recentemente dois modais redesenhados e aprovados pelo usuário como referência visual definitiva: `sistema financas/src/screens/finance/ExpenseDialog.tsx` (Nova/Editar despesa) e `sistema financas/src/screens/finance/IncomeDialog.tsx` (Nova/Editar receita, "seguindo padrão do ExpenseDialog", conforme commit `ff48776`).

Uma investigação completa do sistema de modais foi feita nesta sessão. Principais achados:

### O padrão aprovado não usa o componente `Dialog` genérico existente

`ExpenseDialog.tsx` e `IncomeDialog.tsx` **não importam** `sistema financas/src/ui/dialog.tsx` — cada um reimplementa do zero, inline, via CSS-in-JS (`style={{}}`):
- Overlay (`position: fixed, inset: 0`) e container do modal, com `zIndex: 50` **hardcoded numérico** (não usa a constante `Z_MODAL` de `sistema financas/src/ui/zIndex.ts`, que o resto do app usa corretamente).
- Um objeto de tokens de cor `const C = {...}` (hex codes: `primary: '#0891b2'`, `text: '#0f2b38'`, `border: '#e6eef3'`, etc.) — **duplicado quase identicamente em 3 lugares**: `ExpenseDialog.tsx:44-70`, `IncomeDialog.tsx:22-45` (faltando as chaves `danger*`, causando hex hardcoded solto em `IncomeDialog.tsx:538,558,566,890`), e uma terceira cópia parcial em `sistema financas/src/ui/CategoryFloatingSelect.tsx:6-15`.
- Um componente `MoneyField` (campo de valor monetário formatado) duplicado entre os dois arquivos.
- Estilos de card (`cardStyle`), painel secundário (`panelStyle`) e chip seletor (`chipStyle(...)`) — todos definidos localmente, sem compartilhamento.
- Tipografia própria: labels em uppercase `fontSize: 10.5px`, `letterSpacing: 0.09em`; valores monetários em `fontSize: 26px` tabular-nums; fonte declarada como `'Plus Jakarta Sans'`.
- Header com título+subtítulo e botão fechar circular (ícone `X`, 32px); footer fixo com borda superior e botão de ação principal (`background: C.primary`, sombra colorida).
- **Sem suporte a dark mode** — fundo sempre `#fff`.

### O componente `Dialog` genérico atual (`sistema financas/src/ui/dialog.tsx`)

Usado por **~16 outros modais** do sistema (ver lista completa abaixo). É Tailwind puro, com suporte nativo a dark mode (`dark:` classes), cores vindas do tema Tailwind (`slate-*`, `brand-*`), `rounded-[28px]`, usa corretamente a constante `Z_MODAL`. API: `{ open, title, description?, onClose, children, size?: 'md'|'lg'|'xl'|'xxl', scrollBody?: boolean }`. Fecha com Escape via `useEffect` central.

Os formulários dentro desse `Dialog` tipicamente usam `sistema financas/src/ui/form.tsx` (`Field`, `Input`, `Select`, `Textarea`, `ToggleRow`, `ToggleGroup`, `Checkbox`, `CardSelector`, `SectionDivider`) e `sistema financas/src/ui/button.tsx` (`Button`) — um vocabulário Tailwind coerente entre si, mas visualmente distinto do padrão aprovado (bordas mais arredondadas, paleta diferente, sem a tipografia de labels uppercase/letter-spacing largo do Expense/Income).

### Inventário dos ~16 modais que usam o `Dialog` genérico hoje

| Arquivo | Modal / Propósito |
|---|---|
| `sistema financas/src/ui/ConfirmDialog.tsx` | Confirmação genérica (excluir, ativar/desativar) — usado via `useConfirm()` em `src/context/ConfirmContext.tsx`, ponto central de confirmações do app |
| `sistema financas/src/ui/AttachmentPreviewDialog.tsx` | Visualizar anexos |
| `sistema financas/src/screens/finance/PaymentModal.tsx` | Confirmar pagamento de despesa |
| `sistema financas/src/screens/finance/BatchPaymentModal.tsx` | Pagamento em lote |
| `sistema financas/src/screens/reservas/ReservaDialog.tsx` | Criar/editar reserva + depósito/retirada |
| `sistema financas/src/screens/config/CategoriasTab.tsx` (`CategoriaDialog`) | Criar/editar categoria |
| `sistema financas/src/screens/config/UsuariosTab.tsx` (`UsuarioDialog`) | Criar/editar usuário |
| `sistema financas/src/screens/config/SociosTab.tsx` (`SocioDialog`) | Criar/editar sócio |
| `sistema financas/src/screens/config/ServicosTab.tsx` (`ServicoDialog`) | Criar/editar serviço |
| `sistema financas/src/screens/config/RepresentantesTab.tsx` | Criar/editar representante + comissões |
| `sistema financas/src/screens/config/PerfisTab.tsx` | Criar/editar perfil financeiro |
| `sistema financas/src/screens/config/ClientesTab.tsx` (`ClienteDialog`) | Criar/editar cliente |
| `sistema financas/src/screens/config/ClienteDetail.tsx` | Detalhe de cliente (contratos, serviços, anexos) |
| `sistema financas/src/screens/config/CartaoTab.tsx` (`CartaoDialog`) | Criar/editar cartão |
| `sistema financas/src/screens/planos/PlanosScreen.tsx` | Assinatura/gerenciamento de plano |

### Modais/overlays fora do escopo desta task

- `sistema financas/src/components/OnboardingChecklistModal.tsx` — já usa `Z_MODAL` corretamente, estilo próprio simples (ciano), recém-criado; avaliar durante o planejamento se deve migrar também ou ficar como está (é um guia, não um formulário de dados).
- `sistema financas/src/screens/public/TermosModal.tsx` e `sistema financas/src/screens/public/components/LoginModal.tsx` — pertencem à área pública/marketing do site (landing page), com sistema visual próprio e não relacionado ao app autenticado. Fora do escopo desta task.
- `sistema financas/src/layout/AppShell.tsx` — painéis laterais/drawers de navegação e notificações, não são modais de formulário. Fora do escopo desta task.

## Problema

O sistema hoje tem dois vocabulários visuais de modal coexistindo, sem nenhuma convergência: o padrão aprovado (Expense/Income), usado em apenas 2 lugares mas com paleta de cores já duplicada 3 vezes de forma divergente; e o padrão do `Dialog` genérico, usado em ~16 outros lugares, visualmente distinto. Isso gera inconsistência visual perceptível entre telas do mesmo sistema, dificulta manutenção (qualquer ajuste de estilo precisa ser replicado manualmente em múltiplos arquivos), e deixa a base de código com sobreposição de responsabilidades (dois "componentes" de modal fazendo a mesma coisa de formas diferentes).

## Objetivo

Unificar todo o sistema de modais do app autenticado em um único padrão visual — o aprovado em Expense/Income — através de um componente `Dialog` compartilhado e reescrito, eliminando a duplicação de paleta/tokens hoje espalhada pelo código, e migrando todos os modais listados (incluindo os dois originais) para consumir esse componente único.

## Decisão Técnica Desejada

- Criar um novo componente `Dialog` compartilhado que incorpore o vocabulário visual aprovado: paleta de cores (extraída do objeto `C` hoje duplicado), tipografia (labels uppercase com letter-spacing largo, valores monetários grandes, fontes/pesos usados), estrutura de header (título+subtítulo+botão fechar circular) e footer (borda superior, botão de ação primário com sombra colorida), `border-radius` e sombra do container, overlay com blur.
- Extrair para lugares compartilhados os elementos hoje duplicados: a paleta de cores (um único arquivo de tokens, não mais 3 cópias), o componente `MoneyField`, e os estilos de card/painel/chip (`cardStyle`, `panelStyle`, `chipStyle`) — reaproveitáveis por qualquer modal que precise desses padrões de campo.
- O novo componente `Dialog` compartilhado deve suportar dark mode (decisão confirmada com o usuário — o padrão atual do Expense/Income não tem, mas o novo componente deve ganhar uma variante escura equivalente, para não perder a cobertura que o `Dialog` genérico atual já oferece na maior parte do sistema).
- Usar a constante `Z_MODAL` de `sistema financas/src/ui/zIndex.ts` corretamente no novo componente (corrigindo o `zIndex: 50` hardcoded hoje presente no padrão aprovado).
- **Todos** os modais devem migrar para esse novo componente, incluindo `ExpenseDialog.tsx` e `IncomeDialog.tsx` (decisão confirmada com o usuário — eles também migram, eliminando de vez a duplicação de paleta na origem) e os ~16 modais listados no inventário acima.
- A implementação deve ser organizada em fases dentro do mesmo plano/task (decisão confirmada com o usuário — não dividir em tasks separadas):
  - Fase 1: criar o novo componente `Dialog` compartilhado (com os tokens/sub-componentes extraídos) e migrar `ExpenseDialog.tsx`/`IncomeDialog.tsx` para usá-lo, validando que o resultado visual é idêntico ao aprovado.
  - Fase 2 em diante: migrar os demais modais do inventário, agrupados de forma sensata (a critério do planejamento — ex.: por módulo, por complexidade, ou por padrão estrutural semelhante), preservando toda a lógica de negócio de cada um e trocando apenas a camada de apresentação/estrutura do modal.

## Escopo Funcional

### Dentro do escopo

- Criação do novo componente `Dialog` compartilhado com o vocabulário visual aprovado.
- Extração de tokens de cor, `MoneyField`, `cardStyle`/`panelStyle`/`chipStyle` para local(is) compartilhado(s), eliminando as duplicações identificadas.
- Migração de `ExpenseDialog.tsx` e `IncomeDialog.tsx` para o novo componente.
- Migração de todos os ~16 modais listados no inventário (seção "Inventário dos ~16 modais") para o novo componente.
- Correção do uso de z-index (usar `Z_MODAL` em vez de valor hardcoded).
- Suporte a dark mode no novo componente.

### Fora do escopo inicial

- `OnboardingChecklistModal.tsx`, `TermosModal.tsx`, `LoginModal.tsx`, drawers/painéis de `AppShell.tsx` — avaliar cada um durante o planejamento se cabe migração ou se permanecem fora (área pública/marketing e painéis de navegação têm propósito visual diferente de um formulário de dados).
- Qualquer alteração de regra de negócio, validação, endpoints ou comportamento funcional dos formulários existentes — esta task é estritamente sobre a camada de apresentação/estrutura visual do modal, preservando 100% do comportamento atual de cada formulário.
- Backend — nenhuma alteração esperada, é uma task inteiramente de frontend/UI.
- Migrations ou alterações de banco de dados.
- Remoção do componente `Dialog` atual antes de todos os consumidores serem migrados (deve ser removido apenas ao final, quando não houver mais nenhum uso).

## Requisitos de Frontend

- Novo componente de `Dialog` compartilhado (nome e localização exata a definir no planejamento — ex.: substituir `sistema financas/src/ui/dialog.tsx` no lugar, ou criar um novo arquivo e depreciar o antigo).
- Extração de tokens de cor para um módulo compartilhado (ex.: `sistema financas/src/ui/dialogTokens.ts` ou equivalente, a definir no planejamento).
- Extração/generalização de `MoneyField` para um componente reutilizável (hoje duplicado entre Expense e Income).
- Migração de cada um dos ~16 modais do inventário, preservando toda a lógica de estado, validação e chamadas de mutação/query já existentes — a mudança é estrutural/visual, não funcional.
- Migração de `ExpenseDialog.tsx`/`IncomeDialog.tsx` para consumir o novo componente compartilhado no lugar da estrutura inline atual.
- Garantir que nenhum modal migrado perca funcionalidade (ex.: `scrollBody` customizado usado por `ClienteDetail.tsx`/`PlanosScreen.tsx`, tamanhos diferentes por modal, guias de primeiro acesso `FirstAccessGuideCard` posicionados dentro de alguns modais).

## Requisitos de Backend

Sem impacto backend identificado — task estritamente de frontend/UI.

## Requisitos de Banco de Dados

Sem alteração de banco identificada.

## Requisitos de Segurança e Multi-Tenant

Não aplicável — projeto solo-dev sem multi-tenancy (conforme já registrado em tasks/planos anteriores deste mesmo projeto). Sem impacto de segurança — mudança puramente visual/estrutural.

## Requisitos de Migração ou Compatibilidade

- Nenhum dado é afetado — mudança é inteiramente de camada de apresentação.
- Durante a transição (migração em fases), é aceitável que parte dos modais já estejam no novo padrão e parte ainda no antigo, desde que cada modal individualmente continue funcional. Não é necessário migrar tudo em um único commit.
- O componente `Dialog` atual (`sistema financas/src/ui/dialog.tsx`) só deve ser removido depois que todos os seus consumidores tiverem migrado — até lá, os dois componentes coexistem.

## Requisitos de Testes

### Frontend

- Não aplicável inicialmente (sem testes automatizados de frontend identificados no projeto para este fluxo); validar por build/typecheck, conforme preferência já registrada pelo usuário de não exigir teste manual em tela nas últimas implementações — porém, dado o volume e o caráter visual desta task, o planejamento deve avaliar se validação manual é necessária pelo menos para os primeiros modais migrados (critério a decidir no planejamento).

### Backend

- Não aplicável.

### E2E

- Não aplicável.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/ui/dialog.tsx` (componente atual, a ser substituído/reescrito)
- Novo(s) arquivo(s) de componente/tokens compartilhados (a definir no planejamento)
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/finance/IncomeDialog.tsx`
- `sistema financas/src/ui/ConfirmDialog.tsx`
- `sistema financas/src/ui/AttachmentPreviewDialog.tsx`
- `sistema financas/src/screens/finance/PaymentModal.tsx`
- `sistema financas/src/screens/finance/BatchPaymentModal.tsx`
- `sistema financas/src/screens/reservas/ReservaDialog.tsx`
- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/screens/config/UsuariosTab.tsx`
- `sistema financas/src/screens/config/SociosTab.tsx`
- `sistema financas/src/screens/config/ServicosTab.tsx`
- `sistema financas/src/screens/config/RepresentantesTab.tsx`
- `sistema financas/src/screens/config/PerfisTab.tsx`
- `sistema financas/src/screens/config/ClientesTab.tsx`
- `sistema financas/src/screens/config/ClienteDetail.tsx`
- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/src/screens/planos/PlanosScreen.tsx`
- `sistema financas/src/ui/CategoryFloatingSelect.tsx` (terceira cópia da paleta, a unificar)

### Backend

- Sem impacto identificado.

### Banco de Dados

- Sem impacto identificado.

## Critérios de Aceite

- Existe um único componente `Dialog` compartilhado, com o vocabulário visual aprovado (cores, tipografia, header/footer, radius, sombra), usado por todos os modais do app autenticado.
- Não existe mais nenhuma duplicação do objeto de tokens de cor (`const C = {...}`) espalhada pelo código.
- `ExpenseDialog.tsx` e `IncomeDialog.tsx` usam o novo componente compartilhado, com resultado visual idêntico ao aprovado atualmente.
- Todos os ~16 modais do inventário usam o novo componente compartilhado, preservando 100% da funcionalidade/lógica de negócio existente.
- O novo componente usa `Z_MODAL` corretamente, sem z-index hardcoded.
- O novo componente suporta dark mode.
- O componente `Dialog` antigo é removido apenas após não ter mais nenhum consumidor.
- Build do frontend passa sem erros ao final de cada fase.

## Perguntas Para o Planejamento

- Qual deve ser o nome/localização exata do novo componente `Dialog` compartilhado — substitui `sistema financas/src/ui/dialog.tsx` no mesmo lugar, ou recebe um nome novo com o antigo depreciado gradualmente?
- Como agrupar os ~16 modais em fases/etapas de migração dentro do plano — por módulo (Config, Finance, Reservas), por complexidade (simples primeiro), ou outra lógica?
- O `OnboardingChecklistModal.tsx` deve ser migrado também, ou fica de fora por ser um guia (não um formulário de dados)?
- Componentes de campo hoje usados dentro do `Dialog` genérico (`Field`, `Input`, `Select` de `ui/form.tsx`) devem ser adaptados visualmente para o novo padrão (tipografia de labels, etc.), ou o novo `Dialog` compartilhado é "neutro" o suficiente para funcionar com os componentes de formulário já existentes sem alterá-los?
- Dado o volume de modais e a ausência de testes automatizados de UI, qual o nível de validação manual esperado durante a implementação — validar todos os ~18 modais um a um, ou uma amostra representativa por fase?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` e `sistema financas/AGENT.md`. Nota: ambos descrevem um contexto genérico "sistema multi-prefeitura, multi-tenant + RLS" que não corresponde a este projeto pessoal solo-dev — desconsiderar as seções de isolamento entre tenants/RLS, mantendo as práticas gerais aplicáveis (reutilizar componentes existentes, evitar duplicação, seguir padrões já estabelecidos).
- Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` separados neste projeto.
- Inspecione novamente, durante o planejamento, `ExpenseDialog.tsx`, `IncomeDialog.tsx`, `sistema financas/src/ui/dialog.tsx` e pelo menos 2-3 modais do inventário (um simples como `SocioDialog`, um complexo como `ClienteDetail.tsx`) antes de desenhar a API do novo componente compartilhado, para garantir que ele cubra os casos de uso reais (tamanhos variáveis, `scrollBody` customizado, guias de primeiro acesso posicionados dentro do modal, formulários com múltiplos submits/ações).
- Organizar o plano em fases claras, conforme decisão do usuário: Fase 1 (componente novo + migração de Expense/Income), fases seguintes (migração dos demais modais em grupos a definir).
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não aplicável, mas mantido por padrão do projeto).
- Gere um plano em `.plans/` (padrão deste projeto, conforme `CLAUDE.md`) com etapas pequenas, revisáveis e seguras — mesmo sendo um plano grande, cada fase/etapa deve ser implementável e validável de forma independente.
