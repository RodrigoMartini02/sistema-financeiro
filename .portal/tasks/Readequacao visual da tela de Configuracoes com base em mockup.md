# Task: Readequação visual da tela de Configurações com base em mockup

## Contexto

A tela de Configurações do `sistema financas` é um drawer central (`src/layout/ConfigPanel.tsx`) com navegação lateral e conteúdo trocado por aba. Hoje existem 11 abas: Contas, Assinatura, Segurança, Categorias, Cartões, Catálogo de serviços, Representantes, Sócios, Membros da família (rótulo vira "Colaboradores" quando a conta ativa é PJ), Acessos e Integrações de IA. A visibilidade de cada aba é condicional por permissão/tipo de conta.

O usuário forneceu um mockup interativo (`Configuracoes Compacto.html`, componente `x-dc`/React standalone) propondo uma nova identidade visual para essa tela: sidebar agrupada por categoria, listagens mais compactas, modais padronizados e paleta unificada. O mockup usa dados fictícios (contas de exemplo, categorias de exemplo, cartões de exemplo).

**O mockup desenha 5 telas (Contas, Categorias, Cartões, Acessos, Assinatura) como amostra representativa do padrão, não como escopo fechado.** O usuário explicitou que essas telas servem de referência a ser seguida nas demais. O próprio mockup formaliza isso: telas não desenhadas caem em um estado genérico (`isOther`) cujo texto é a instrução — *"Mesma estrutura: barra de ações no topo, lista de 38-40px por linha"*. Portanto o padrão a extrair e replicar é:

1. **Cabeçalho da tela**: contador/resumo à esquerda ("3 contas ativas"), filtros/toggles no meio, botão de ação primária (pill cyan, ícone `+`) à direita.
2. **Banner informativo** opcional logo abaixo (âmbar `#fffbeb`/`#fde68a`/`#92400e` para avisos).
3. **Lista** de linhas de 38–40px: índice mono (`01`, `02`), avatar/badge opcional, nome, data, badges de status, chevron à direita.
4. **Modal**: header com título + X circular (`#f1f5f9`), corpo em campos com label uppercase pequena, footer com ação destrutiva à esquerda (outline vermelho) e "Salvar" (pill cyan) à direita.
5. **Paleta e tipografia** consistentes em toda tela.

Arquivos já verificados e relevantes:

- `src/layout/ConfigPanel.tsx` — componente raiz do drawer. Sidebar hoje é uma lista **plana** (sem agrupamento), usa classes Tailwind (`bg-brand-50`/`text-brand-700` no item ativo), não os tokens `C` de `dialogFormTokens.tsx`. Contém toda a lógica condicional de visibilidade das abas (`canViewAnalytics`, `isAdmin`, `isGestor`, `contaTipo !== 'pessoal'`).
- `src/ui/dialog.tsx` — componente `Dialog` genérico já usado por todos os modais de Configurações (`ContaDialog`, `CategoriaDialog`, `CartaoDialog`). Estrutura de header (título + botão X) e footer livre já é compatível em espírito com o mockup, mas o botão X atual (borda + fundo transparente) difere do mockup (círculo cinza sólido `#f1f5f9`).
- `src/ui/dialogFormTokens.tsx` — design system de tokens já existente: `const C = { primary: '#0891b2', primaryDark: '#0e7490', text: '#0f2b38', ... }`, `labelStyle`, `fieldInputStyle`, `cardStyle`, `chipStyle`, `MoneyField`, etc. **A paleta primária já bate com o mockup** (`#0891b2`/`#0e7490`), indicando que o mockup é evolução deste padrão, não substituição. Diferenças pontuais: `C.text` atual é `#0f2b38`, mockup usa `#0f172a`; `C.textMuted`/`textFaint` atuais (`#7b93a1`/`#8ba3b0`) vs. `#64748b` do mockup.
- `src/ui/ConfigListRow.tsx` — componente de linha de lista atual: Tailwind (`rounded-xl border shadow-sm px-5 py-4`), cards separados com `gap` entre eles, 3 `colorScheme` (`brand`/`red`/`green`). Usado por `ContasTab`. O mockup usa linhas mais compactas (38–40px), dentro de um container único com borda externa e divisórias internas entre linhas (modelo de tabela unificada), não cards soltos. O próprio mockup expõe essa escolha como toggle (`listStyle`: "Cards separados" | "Tabela"), sinalizando que é uma decisão de design ainda em aberto, não fechada.
- `src/screens/config/ContasTab.tsx` — usa `ConfigListRow` + Tailwind (`InfoBanner`, `ToggleGroup`, `EmptyState`). `ContaDialog` tem campos condicionais: **PF** (nome, CPF opcional, telefone, e-mail, data de nascimento) vs. **PJ** (razão social, nome fantasia, CNPJ, enquadramento com `CategoryPreview` de categorias pré-configuradas). Ambos os fluxos vivem no mesmo componente e no mesmo `<form>`.
- `src/screens/config/CategoriasTab.tsx` — árvore raiz+subcategoria, Tailwind, `colorScheme` `red` fixo (categorias são sempre "Despesas" hoje). Tela universal (não é PF nem PJ-específica).
- `src/screens/config/CartaoTab.tsx` — já usa os tokens `C` corretamente (`labelStyle`, `fieldInputStyle`, `cardStyle`), mas **não tem** o preview visual de cartão de crédito (retângulo com gradiente, últimos 4 dígitos, nome, validade, limite) que o mockup mostra tanto na listagem em grid quanto no formulário de edição (com preview ao vivo ao lado dos campos). Isso é funcionalidade nova, não apenas reestilo.
- `src/screens/config/AcessosTab.tsx` — já existe e já busca dados reais (`fetchAnalyticsOverview`, cards de Logins/Contas criadas/Usuários ativos, `ToggleGroup` de período 7/30/90 dias). O mockup mostra uma versão visualmente mais compacta dos mesmos KPIs, mais um banner de aviso amarelo adicional ("Estatísticas de login ainda não disponíveis...") que não existe hoje.
- `src/screens/config/SecurityTab.tsx` — tela real de troca de senha (força de senha, confirmação). É a **única tab que não tem forma de lista** — é um formulário. O padrão "barra de ações + lista" do mockup não se aplica diretamente; o que se aplica dela é a linguagem visual (tokens, tipografia, `cardStyle`, estilo de campo e de botão primário), já demonstrada nos formulários dentro dos modais desenhados no mockup.
- `src/screens/config/RepresentantesTab.tsx` — **já usa `ConfigListRow` + tokens `C`** (`labelStyle`, `fieldInputStyle`, `cardStyle`, `chipStyle`), mesmo padrão de `ContasTab`. Estrutura idêntica ao padrão do mockup: contador + botão "Novo representante", `InfoBanner`, lista de `ConfigListRow`, modal com footer Excluir/Salvar. Herda o novo visual automaticamente quando `ConfigListRow` e `Dialog` forem redesenhados.
- `src/screens/config/MembrosTab.tsx` — também **já usa `ConfigListRow` + tokens `C`** e ainda usa `ListToolbar` (`src/ui/ListToolbar.tsx`), outro componente compartilhado de barra de ações que precisa ser verificado no planejamento como peça do padrão de cabeçalho de tela.
- `src/screens/planos/PlanosScreen.tsx` — usado via prop `embedded` na aba Assinatura. Estrutura real não foi lida em profundidade; o mockup mostra layout de 2 cards lado a lado (Plus vs. Premium destacado) + card de plano ativo + cancelamento, mas não é garantido que bata com a implementação atual.
- `src/screens/config/RepresentantesTab.tsx`, `src/screens/config/SociosTab.tsx`, `src/screens/config/ServicosTab.tsx`/`CatalogoTab.tsx` — não lidos em profundidade; são específicas de conta PJ (`representantes`/`socios` só aparecem quando `contaTipo !== 'pessoal'` em `ConfigPanel.tsx`) ou de catálogo de serviços (usado também por `ClienteDetail.tsx`, fora do escopo desta task).
- `src/screens/config/MembrosTab.tsx` — universal, mas rótulo e possivelmente conteúdo mudam conforme `contaTipo` (Membros da família vs. Colaboradores).

## Problema

A tela de Configurações cresceu organicamente e hoje mistura dois padrões visuais: componentes com classes Tailwind soltas (`ConfigPanel`, `ConfigListRow`, `ContasTab`, `CategoriasTab`) e componentes já migrados para os tokens inline de `dialogFormTokens.tsx` (`CartaoTab`, os `Dialog`s de conta/categoria/cartão). Isso deixa a experiência inconsistente entre abas (cores, tamanhos de fonte, altura de linha, estilo de badge variam) e torna qualquer ajuste de paleta ou espaçamento mais arriscado, pois precisa ser replicado em dois sistemas de estilo diferentes.

Adicionalmente, a sidebar de navegação hoje é uma lista plana de 11 itens sem agrupamento, o que dificulta a leitura rápida em uma tela com tantas opções, e não comunica visualmente quais abas são específicas de PJ.

## Objetivo

Extrair do mockup `Configuracoes Compacto.html` o padrão visual de tela de Configurações (cabeçalho de ações, lista compacta, modal, paleta) e aplicá-lo a **todas** as abas da tela — não apenas às 5 desenhadas —, unificando tudo sob os tokens de `dialogFormTokens.tsx` e reorganizando a sidebar em grupos, em duas fases sequenciais: primeiro as áreas comuns a PF e as telas gerais, depois as áreas específicas de PJ.

A alavanca principal para isso são os **componentes compartilhados** (`ConfigListRow`, `Dialog`, `ListToolbar`, `InfoBanner`, `EmptyState`, tokens `C`): como a maioria das tabs já os consome, redesenhá-los propaga o padrão para telas que o mockup não desenhou, sem reescrever cada tab manualmente. O trabalho por tab deve ser o mínimo necessário depois disso.

## Decisão Técnica Desejada

Decisões já confirmadas pelo usuário durante a análise:

- **As 5 telas desenhadas no mockup são referência de padrão, não escopo.** O objetivo é que todas as abas de Configurações fiquem coerentes com esse padrão ao final das duas fases. Para telas não desenhadas, seguir a instrução que o próprio mockup dá no estado `isOther` ("mesma estrutura: barra de ações no topo, lista de 38-40px por linha") e a linguagem visual das telas desenhadas. Não pedir mockup adicional ao usuário para telas que se encaixam nesse padrão de lista.
- A implementação é **faseada em duas etapas sequenciais**, cada uma com seu próprio ciclo `/planejar` → aprovação → `/implementar` → `/finalizar`:
  - **Fase 1 — Base compartilhada + PF e Geral**: primeiro os componentes compartilhados que propagam o padrão (`ConfigListRow`, `Dialog`, `ListToolbar`, `InfoBanner`/`EmptyState` se necessário, tokens em `dialogFormTokens.tsx`), depois `ConfigPanel` (sidebar agrupada preservando a lógica de visibilidade condicional), e então as tabs PF/gerais: `ContasTab` (listagem + parte PF do formulário), `CategoriasTab`, `CartaoTab` (incluindo o preview visual de cartão, que é feature nova), `AcessosTab`, `SecurityTab` (aplicando a linguagem visual, já que não tem forma de lista) e a aba Assinatura/`PlanosScreen` (embedded).
  - **Fase 2 — PJ**: parte do formulário de `ContasTab` específica de Pessoa Jurídica (razão social, CNPJ, enquadramento, preview de categorias), `SociosTab`, `ServicosTab`/`CatalogoTab` (avaliar se o uso compartilhado com `ClienteDetail.tsx` exige tratamento à parte), `UsuariosTab`, `IntegracoesIaTab`, e ajustes remanescentes em `RepresentantesTab`/`MembrosTab` que não tenham sido resolvidos automaticamente pelo redesign dos componentes compartilhados na Fase 1.
- **Verificação obrigatória no início da Fase 2**: `RepresentantesTab` e `MembrosTab` já consomem `ConfigListRow` + tokens `C` e devem herdar o novo visual sem trabalho manual. A Fase 2 deve começar auditando visualmente todas as tabs não tocadas na Fase 1 para identificar o que realmente sobrou, em vez de assumir que cada uma precisa ser reescrita.
- Cada fase do plano de implementação deve seguir a regra de redesign do projeto: **remover o estilo/código antigo primeiro, depois aplicar o novo**, como duas etapas explícitas e distintas — nunca sobrepor Tailwind antigo com inline styles novos no mesmo componente.
- Unificar sob os tokens `C` de `dialogFormTokens.tsx` em vez de reintroduzir ou expandir classes Tailwind nos componentes tocados. Onde o mockup usa um tom que diverge do token atual (ex. `text`/`textMuted`/`textFaint`), a skill `planejar` deve decidir explicitamente entre ajustar o token global (impacto amplo, incluindo `ExpenseDialog`/`IncomeDialog`) ou usar um valor local só nesta tela — e registrar a escolha no plano.
- **Modelo de listagem: "Cards separados"** (decidido pelo usuário). Cada linha é um card com borda e sombra próprias, separados por `gap` — o mockup expunha isso como toggle (`listStyle`) e a opção escolhida é a que preserva o modelo que o sistema já usa hoje em `ConfigListRow`. O que muda é a compactação (linhas de 38–40px, tipografia e espaçamentos do mockup), não a estrutura de card separado. Isso reduz o risco da mudança em `ConfigListRow`, já que a estrutura externa permanece.
- **Tipografia: Figtree apenas na tela de Configurações** (decidido pelo usuário), mantendo `Plus Jakarta Sans` no resto do app. Consequência aceita conscientemente: Configurações terá tipografia distinta das demais telas. A skill `planejar` deve verificar como carregar Figtree (o mockup usa `@font-face` com woff2 embutido; no projeto real precisa entrar via Google Fonts ou arquivo local) e escopar a fonte ao container de Configurações sem vazar para o resto do app — atenção especial ao `Dialog.tsx`, que hoje aplica `fontFamily: "'Plus Jakarta Sans'..."` inline e é compartilhado com `ClienteDetail.tsx` fora de Configurações. JetBrains Mono (números/índices) precisa da mesma avaliação.
- **Telas não desenhadas no mockup: implementar direto seguindo o padrão** (decidido pelo usuário), sem gerar mockup intermediário para aprovação. A validação acontece na revisão via `/run` ao final de cada fase.
- Nenhuma migration de banco é esperada — esta é uma task de reestilo de frontend, mas duas peças (preview visual de cartão em `CartaoTab`, banner de aviso extra em `AcessosTab`) são adições de UI nova, não puro reestilo; não implicam mudança de schema, mas devem ser tratadas como escopo funcional adicional no plano, não como CSS.

## Escopo Funcional

### Dentro do escopo

**Fase 1 (Base compartilhada + PF e Geral):**
- Redesenhar `ConfigListRow.tsx` para o novo modelo de linha compacta (índice mono, avatar/badge, nome, data, badges de status, chevron), preservando os usos de `colorScheme` (`brand`/`red`/`green`) ou substituindo por um esquema equivalente. **Este é o componente de maior alavancagem**: é consumido por `ContasTab`, `RepresentantesTab`, `MembrosTab` e (em variante própria) `CategoriasTab`.
- Padronizar `Dialog.tsx` (botão X, espaçamentos) conforme mockup, mantendo a API atual (`size`, `scrollBody`, `description`) sem quebrar os consumidores existentes fora de Configurações (ex. `ClienteDetail.tsx` usa o mesmo `Dialog`).
- Avaliar e padronizar `ListToolbar.tsx` como o componente de "barra de ações no topo" do padrão (contador + filtros + botão primário), já usado por `MembrosTab` — e verificar quais tabs montam essa barra manualmente hoje (`ContasTab`, `RepresentantesTab`, `CategoriasTab` montam à mão) e poderiam convergir para ele.
- Estender `dialogFormTokens.tsx` com os tokens novos do padrão (linha de lista compacta, badge de status, preview de cartão), para que as tabs da Fase 2 tenham de onde consumir sem recriar estilos.
- Reestruturar `ConfigPanel.tsx`: sidebar agrupada por seção com headers, preservando toda a lógica condicional de visibilidade de itens hoje existente (`canViewAnalytics`, `isAdmin`, `isGestor`, `contaTipo`).
- Readequar `ContasTab.tsx`: listagem (toggle Ativas/Desativadas, banner de aviso, linhas) e a parte do formulário do `ContaDialog` comum/PF (avatar de logo, nome, CPF, telefone, e-mail, data de nascimento). A parte PJ do mesmo formulário fica visualmente como está até a Fase 2 (não pode ficar quebrada nem misturando estilos).
- Readequar `CategoriasTab.tsx` (listagem em árvore, `CategoriaDialog`).
- Readequar `CartaoTab.tsx`, incluindo a introdução do preview visual de cartão (grid de cards com gradiente, últimos 4 dígitos, nome, validade, limite; preview ao vivo no formulário do `CartaoDialog`).
- Readequar `AcessosTab.tsx` (cards de KPI, seletor de período, banner de aviso, listagem de últimas contas criadas).
- Readequar a aba Assinatura (`PlanosScreen` embedded) conforme o layout de 2 planos lado a lado do mockup, após investigação da estrutura real durante o `/planejar`.
- Readequar `SecurityTab.tsx` aplicando a linguagem visual do padrão (tokens, `cardStyle`, estilo de campo e de botão primário do mockup) — é formulário, não lista, então herda a linguagem visual sem herdar a estrutura "barra de ações + lista".

**Fase 2 (PJ e demais):**
- Auditar visualmente todas as tabs não tocadas na Fase 1 e listar o que de fato ficou pendente após a propagação dos componentes compartilhados.
- Readequar a parte PJ do formulário de `ContasTab.tsx`/`ContaDialog` (razão social, nome fantasia, CNPJ, enquadramento, `CategoryPreview`).
- Readequar `SociosTab.tsx`, `UsuariosTab.tsx`, `IntegracoesIaTab.tsx`.
- Readequar `ServicosTab.tsx`/`CatalogoTab.tsx` (avaliar acoplamento com `ClienteDetail.tsx`).
- Ajustes remanescentes em `RepresentantesTab.tsx` e `MembrosTab.tsx` (incluindo o rótulo/fluxo "Colaboradores" para PJ) que não tenham sido resolvidos pela Fase 1.

### Fora do escopo inicial

- Qualquer mudança de schema de banco de dados ou nova tabela.
- Alterações na lógica de negócio de autenticação, permissões (`isAdmin`/`isGestor`/`canViewAnalytics`), analytics ou faturamento — apenas a apresentação visual dessas telas.
- Redesign do `ClienteDetail.tsx`/`ContratoModal` (já tratado em tasks/plans próprios existentes em `.portal/`).
- Mudança de comportamento do `PlanosScreen` fora do modo `embedded` (uso standalone da tela de planos, se existir).
- Criação de testes automatizados novos além do já praticado no projeto (o projeto valida via `/run` manual, conforme observado nas tasks anteriores).

## Requisitos de Frontend

- Unificar estilo dos componentes tocados sob `dialogFormTokens.tsx` (`C`, `labelStyle`, `fieldInputStyle`, `cardStyle`), estendendo esse arquivo com novos tokens quando necessário (ex. token de linha de lista compacta, token de badge de status, token de preview de cartão) em vez de estilos ad hoc espalhados.
- Preservar a fonte de dados e as mutations (`useQuery`/`useMutation`) de cada tab exatamente como estão — esta task é de apresentação, não de dados, exceto pelas duas adições funcionais já identificadas (preview de cartão, banner extra em Acessos).
- Preservar os pontos de ancoragem de `FirstAccessGuideCard`/`useFirstAccessGuide` (guias de primeiro acesso) em todas as tabs tocadas — eles dependem de elementos e posições específicas do layout atual (ex. `enquadramentoGuide` em `ContasTab`, `desativarGuide`/`guideSubcategoria` em `CategoriasTab`, `limiteGuide`/`validadeGuide`/`fechamentoGuide` em `CartaoTab`).
- `ConfigListRow` precisa continuar suportando os 3 casos de uso reais (contas, categorias raiz, categorias filhas com indentação) sem forçar um componente genérico demais que perca a semântica de cada um.
- Fonte: o mockup usa Figtree (títulos/corpo) + JetBrains Mono (índices/documentos); verificar se essas fontes já estão carregadas no projeto (o `Dialog.tsx` atual usa `'Plus Jakarta Sans', system-ui, sans-serif`) e decidir no planejamento se a tela de Configurações passa a ter uma fonte diferente do resto do app ou se isso é ajustado globalmente.

## Requisitos de Backend

Sem impacto backend identificado inicialmente. Se o preview de cartão exigir normalizar dados que hoje não existem (ex. cor do cartão já existe via `COR_OPCOES`/`cartao.cor`, `numero_cartao`/`validade` já existem em `Cartao`), confirmar durante o planejamento se os campos necessários já estão disponíveis via `fetchCartoes`/`saveCartao` ou se algo precisa ser adicionado ao contrato da API.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant no sentido de organizações isoladas (uso pessoal do usuário, com conceito de "perfil"/tipo de conta PF vs. PJ via `contaTipo`). Esta task não deve alterar nenhuma lógica de autorização (`isAdmin`, `isGestor`, `canViewAnalytics`, filtro `contaTipo !== 'pessoal'`) — apenas reestilizar em torno dela. Ao reagrupar a sidebar, a skill `planejar` deve garantir que a lógica de visibilidade condicional (quais itens aparecem/somem e seus rótulos dinâmicos) seja preservada byte a byte em comportamento, apenas reorganizada visualmente em grupos.

## Requisitos de Migração ou Compatibilidade

- `Dialog.tsx` é componente compartilhado fora de Configurações (usado em `ClienteDetail.tsx` e possivelmente outros pontos do app) — qualquer mudança em sua API ou aparência default deve ser avaliada quanto ao impacto nesses outros usos, não só nas tabs de Configurações.
- `ConfigListRow.tsx` — se o novo modelo de linha mudar a assinatura de props, todos os 3 call sites (contas, categorias raiz, categorias filhas) precisam ser atualizados na mesma etapa do plano.
- Nomenclatura nova de código (novos componentes, novos tokens, novas props) deve seguir inglês; nomes em português já existentes no projeto (`ContasTab`, `CategoriaDialog`, etc.) são tratados como legado e não precisam ser renomeados por esta task.

## Requisitos de Testes

### Frontend

- Testar manualmente (via `/run`) cada tab tocada na Fase 1: Contas (listagem + criar/editar conta PF, toggle ativas/desativadas), Categorias (árvore, criar/editar/desativar categoria e subcategoria), Cartões (listagem em grid, preview visual, criar/editar cartão), Acessos (KPIs, troca de período), Assinatura (visual dos planos), Segurança (troca de senha).
- Testar manualmente a Fase 2: fluxo completo de criação/edição de conta PJ (incluindo enquadramento e preview de categorias), Representantes, Sócios, Catálogo de serviços, Membros/Colaboradores.
- Verificar que os `FirstAccessGuideCard` continuam aparecendo nas posições corretas após o redesign.
- Verificar responsividade do drawer (`Drawer` com `variant="centered"`) nas larguras que o app já suporta.

### Backend

Não aplicável — sem mudança de backend nesta task.

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend — Fase 1 (componentes compartilhados, maior alavancagem)

- `src/ui/ConfigListRow.tsx`
- `src/ui/dialog.tsx`
- `src/ui/dialogFormTokens.tsx`
- `src/ui/ListToolbar.tsx`
- `src/ui/InfoBanner.tsx`, `src/ui/EmptyState.tsx` (verificar necessidade)
- `src/layout/ConfigPanel.tsx`

### Frontend — Fase 1 (tabs PF/gerais)

- `src/screens/config/ContasTab.tsx` (parte comum/PF)
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/screens/config/AcessosTab.tsx`
- `src/screens/config/SecurityTab.tsx`
- `src/screens/planos/PlanosScreen.tsx` (uso embedded)

### Frontend — Fase 2

- `src/screens/config/ContasTab.tsx` (parte PJ)
- `src/screens/config/SociosTab.tsx`
- `src/screens/config/UsuariosTab.tsx`
- `src/screens/config/IntegracoesIaTab.tsx`
- `src/screens/config/ServicosTab.tsx` / `src/screens/config/CatalogoTab.tsx`
- `src/screens/config/RepresentantesTab.tsx`, `src/screens/config/MembrosTab.tsx` (apenas ajustes remanescentes — já consomem `ConfigListRow` + tokens `C`)

### Backend

Sem impacto backend identificado inicialmente.

### Banco de Dados

Sem alteração de banco identificada inicialmente.

## Critérios de Aceite

- Visual das telas tocadas em cada fase corresponde ao padrão extraído do mockup (barra de ações no topo, lista de 38–40px por linha, sidebar agrupada, paleta, tipografia, estilo de modal).
- **Ao final da Fase 2, todas as abas de Configurações seguem o mesmo padrão** — não apenas as 5 desenhadas no mockup. Nenhuma aba permanece com o visual antigo.
- Telas sem forma de lista (`SecurityTab`, e as demais que a auditoria da Fase 2 identificar) aplicam a linguagem visual do padrão (tokens, cards, campos, botões) mesmo sem a estrutura "barra de ações + lista".
- Nenhum componente tocado mistura Tailwind antigo com tokens novos simultaneamente — a remoção do estilo antigo acontece antes da aplicação do novo, como etapas distintas do plano de implementação.
- Toda a lógica de visibilidade condicional da sidebar (`canViewAnalytics`, `isAdmin`, `isGestor`, `contaTipo`) continua funcionando exatamente como hoje, apenas reorganizada em grupos visuais.
- Nenhuma regressão funcional nos fluxos de conta PJ, Representantes, Sócios, Catálogo de serviços e Membros/Colaboradores durante a Fase 1 (eles só são redesenhados na Fase 2, mas não podem quebrar por efeito colateral das mudanças da Fase 1 em componentes compartilhados como `Dialog` e `ConfigListRow`).
- `FirstAccessGuideCard`/`useFirstAccessGuide` continuam funcionando e ancorados corretamente em todas as tabs tocadas.
- Preview visual de cartão em `CartaoTab` reflete corretamente os dados reais do cartão (nome, últimos 4 dígitos, cor, validade, limite, tipo) tanto na listagem quanto no formulário.
- `npm run build` (frontend) conclui sem erros ao final de cada fase.
- Nenhuma alteração de código é feita sem passar pelo ciclo `/planejar` → aprovação explícita → `/implementar` → `/finalizar`, com um ciclo completo por fase.

## Perguntas Para o Planejamento

- Ajuste dos tokens de cor `C.text`/`C.textMuted`/`C.textFaint` em `dialogFormTokens.tsx`: mudar globalmente (afeta `ExpenseDialog`/`IncomeDialog` e outros consumidores) ou usar valores locais só nas telas de Configurações? **Nota**: como a fonte já será escopada só a Configurações, há precedente para escopar a cor também — avaliar consistência entre as duas decisões.
- Como escopar Figtree/JetBrains Mono apenas ao container de Configurações sem afetar `Dialog.tsx` quando ele é usado fora dessa tela (`ClienteDetail.tsx`)? O `Dialog` aplica `fontFamily` inline hoje, então a fonte da tela não "vaza" para ele automaticamente — provavelmente precisa de uma prop ou de um wrapper.
- `ListToolbar.tsx` deve virar o componente único de "barra de ações no topo" para todas as tabs (hoje `ContasTab`/`RepresentantesTab`/`CategoriasTab` montam essa barra à mão), ou o padrão fica só como convenção visual sem unificar o componente?
- O preview visual de cartão em `CartaoTab` deve usar as mesmas 8 cores predefinidas de `COR_OPCOES` já existentes, ou o mockup introduz uma paleta de swatches diferente que precisa ser reconciliada?
- Sobre a fonte: manter `'Plus Jakarta Sans'` (usado hoje em `Dialog.tsx`) ou migrar para Figtree/JetBrains Mono como no mockup? Se migrar, é só para a tela de Configurações ou é uma decisão de app inteiro (fora do escopo desta task)?
- O banner de aviso extra em `AcessosTab` ("Estatísticas de login ainda não disponíveis...") deve ser condicional (aparece só quando não há dados de login) ou fixo como no mockup?
- A ordem de execução dentro da Fase 1 tem alguma preferência (ex. começar pelos componentes de infraestrutura — `Dialog`, `ConfigListRow`, `ConfigPanel` — antes das tabs individuais, já que várias tabs dependem deles)?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz do monorepo) e `sistema financas/AGENT.md` (regras específicas deste projeto) e `CLAUDE.md` (regra de fluxo obrigatório `/planejar` → aprovação → `/implementar` → `/finalizar`, e a regra de redesign remove-then-apply).
- Inspecione `src/layout/ConfigPanel.tsx`, `src/ui/dialog.tsx`, `src/ui/dialogFormTokens.tsx`, `src/ui/ConfigListRow.tsx` e todas as tabs listadas em "Arquivos Provavelmente Afetados" antes de escrever qualquer plano.
- Trate esta task como duas entregas sequenciais: gerar primeiro o plano da **Fase 1 (PF e Geral)** apenas; o plano da Fase 2 só deve ser detalhado depois que a Fase 1 estiver implementada, revisada e finalizada (`/finalizar`), para incorporar aprendizados da primeira fase.
- Classifique a implementação como `frontend`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Resolva as "Perguntas Para o Planejamento" com o usuário antes de fechar o plano da Fase 1, especialmente a escolha do modelo de listagem (cards vs. tabela), pois ela define a estrutura de `ConfigListRow` da qual as demais tabs dependem.
- Gere o plano da Fase 1 em `.plans/`, com etapas pequenas e revisáveis, começando pelos componentes de infraestrutura compartilhada (`Dialog`, `dialogFormTokens`, `ConfigListRow`, `ConfigPanel`) antes das tabs individuais, e aplicando a regra remove-then-apply (remover estilo antigo, depois aplicar o novo) como etapas distintas dentro de cada componente/tab.
