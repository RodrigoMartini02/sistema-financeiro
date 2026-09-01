# Plano de Implementação: Redesign de Configurações e menu de conta

## Origem

- Spec trazido pelo usuário: "Redesign de Configurações e menu de conta" (documento completo, seções 1–10 + paleta + critérios de aceite).
- Data do planejamento: 2026-08-31.
- Classificação: `frontend + backend + database`.
- Decisões tomadas com o usuário antes deste plano (ver seção "Decisões e divergências do spec original").

## Resumo

Configurações deixa de ser uma tela cheia com submenu na sidebar e passa a abrir como um **drawer de 820px** sobre a tela atual, sem navegar e sem perder o estado da tela de fundo (filtro de mês, scroll, sem refetch). O menu de conta no header (`AccountProfileMenu.tsx`, já existente) ganha ajustes de destino (abrir o drawer já na aba certa) e mantém o resto do comportamento atual. Contratos passam a abrir em drawer também, no lugar do `Dialog xxl` atual — que hoje já empilha um segundo `Dialog` por cima (violação do princípio "nunca dois modais centralizados" que este redesign corrige).

## Decisões e divergências do spec original

O usuário aprovou o spec com as seguintes mudanças/decisões explícitas:

1. **Layout do drawer de Configurações**: o spec original (§2) descrevia um "hub" de cards clicáveis com duas abas internas (Conta / Negócio) — clicar num card trocava o conteúdo inteiro do drawer e um botão `‹` voltava ao hub. **O usuário descartou completamente esse modelo de abas.** Decisão final: **sidebar fixa única, estilo Claude/ChatGPT** — uma coluna de navegação sempre visível à esquerda dentro do drawer, listando todos os itens em uma lista só (sem divisão em "Conta" e "Negócio", sem abas, sem tela de hub, sem botão `‹`): Minha conta, Segurança, Perfis, Categorias, Cartões, Catálogo de serviços, Representantes, Sócios, Usuários. O conteúdo troca à direita ao clicar em cada item; a navegação nunca fica escondida. Isso substitui inteiramente §2.1/§2.2 do spec original — não existe conceito de "aba" neste redesign.
2. **Pré-requisito `perfil_id`** (item 10 do spec): **já implementado — Fase 0 removida.** Na implementação, verificação contra o código real (não só o arquivo de plano) mostrou que `backend/src/routes/clients.ts` e `contracts.ts` já filtram por `perfil_id` com fallback (`profileWhere`), a migration `backend/drizzle/0005_perfil_clientes.sql` já existe e já foi aplicada (commit `2891941 feat: amarrar clientes e contratos ao sistema de perfis`, já em `main`), e `clientesService.ts` já envia `perfil_id` em `saveCliente`/`saveContrato`. O arquivo `.plans/amarrar-perfil-clientes-contratos.md` estava desatualizado — o trabalho nele descrito já tinha sido feito antes deste plano ser escrito. Nenhuma ação necessária; a numeração das fases seguintes (1–8) permanece como estava, apenas sem a Fase 0.
3. **"Sessões ativas" (§3)**: **fora de escopo**. Não existe hoje tabela/rota de sessões de autenticação revogáveis no backend (o que existe é sessão de IA, sem relação), e o usuário confirmou que não pediu essa feature. O item de Segurança na sidebar traz apenas o formulário de senha com medidor de força; nenhuma menção a "sessões ativas" ou "Encerrar as outras" nesta rodada.
4. **Troca de perfil sem reload (§1, item "a")**: o spec pede que trocar de perfil não navegue e não refaça fetch do zero. Hoje `useActiveProfile.select()` (`src/hooks/useActiveProfile.ts:37-43`) faz `window.location.reload()`. **Decisão: manter o reload por enquanto.** Migrar para invalidação seletiva de queries exigiria mapear todo lugar que lê `getActiveProfileId()`/`localStorage` fora do React Query, o que é maior que o escopo visual deste redesign. O menu de conta usa o texto e comportamento visual do spec, mas o clique em um perfil inativo continua recarregando a página (divergência documentada, não é bug).
5. **Endereçamento por URL (§5, `?config=...`)**: **entra nesta rodada** (Fase 7, não é mais opcional). A área logada não usa `react-router` hoje — esta fase introduz sincronização manual de estado com `URLSearchParams` para o drawer de Configurações e o drawer de Contrato, sem adotar roteamento completo para o resto do app.
6. **Padronização de inputs (pedido adicional do usuário)**: hoje convivem dois sistemas — o padrão genérico do app (`src/ui/form.tsx`: `Input`/`Select`/`Textarea`, `h-10` = 40px, `rounded-2xl`, usado em Categorias, Cartões, Usuários, Representantes, Sócios, Minha conta) e um sistema próprio maior usado só no módulo de Clientes/Contratos (`src/ui/dialogFormTokens.tsx`: `fieldInputStyle` com `height: 54`, fonte 17px, mais `smallInputStyle`/`numericInputStyle` a 42px). **Decisão: adotar o padrão genérico de 40px como único padrão do app**, reduzindo os inputs de `ClienteDetail.tsx`/`ClientesTab.tsx` para o mesmo tamanho já usado no resto do sistema. Entra como **Fase 3.5**, aproveitando que esses arquivos já são tocados nas Fases 3–4.
7. **Reativar upload de foto de perfil (pedido adicional do usuário, reverte decisão do spec original)**: o spec original excluía upload de foto do escopo ("enquanto não existir, iniciais em todos os avatares"). Investigação confirmou que a feature **já existiu e foi perdida na migração de stack**, não removida por decisão deliberada: a rota `PUT /api/users/current/photo` (`backend/src/routes/users.ts:258-267`) e a coluna `photo`/`foto` (`backend/src/db/schema/users.ts:29`) já existem e funcionam; `UsuarioMe` em `usuariosService.ts:7` já declara `foto?: string | null`. O frontend React (pós-migração de julho/2026, commit `9739a73`) nunca implementou a UI. **Decisão: reativar como Fase 8 deste plano.**
   - **Correção de escopo pós-revisão do plano**: o tipo realmente usado pelo header/`AppShell`/`AccountProfileMenu` é `AuthUser` (`types/auth.ts`), populado por `useAuthSession` → `verifySession()` → `GET /api/auth/verify`. Essa rota (`backend/src/routes/auth.ts:244-281`) faz um `.select({ id, name, email, document, type, status })` **explícito, sem `photo`**, e monta a resposta `usuario` manualmente sem o campo — logo **isto não é puramente frontend**: é necessário adicionar `photo` ao select e ao payload de `/auth/verify` no backend para o dado chegar ao frontend. Por consistência, os payloads `usuario` de `/auth/login`, `/auth/register` e `/auth/google` (mesmo arquivo) também devem incluir `photo`, já que todos populam a mesma sessão em cache.
   - Armazenamento: base64 direto na coluna `text` existente, via `PUT /current/photo` (já aceita `{ foto: string }`) — sem infra nova de arquivos.
   - **Importante: a foto é do usuário logado, não do perfil.** Hoje `AccountProfileMenu.tsx` já distingue os dois — o avatar do *usuário* (`userInitial`, linha 108) e o avatar de cada *perfil* (`getInitials(p.nome)`, tipo Pessoal/PJ) são coisas diferentes, com iniciais próprias. A foto entra apenas onde hoje é avatar do **usuário**: bloco "usuário" no rodapé do popover (`AccountProfileMenu.tsx:214`) e, no trigger principal do header ("ícone na frente do nome"), sempre que ele estiver renderizando o avatar do usuário (linha 136: `activePerfil ? getInitials(activePerfil.nome) : userInitial` — a foto substitui apenas o ramo `userInitial`). A lista "Trocar perfil" continua mostrando iniciais de cada perfil (Pessoal/PJ), sem foto — perfis não têm dono de foto próprio.
   - Fallback automático para iniciais em qualquer lugar sem foto cadastrada.
   - Upload com recorte (crop) circular antes de salvar — usuário ajusta zoom/posição antes de confirmar.
   - Fora do PWA: comportamento não muda quando rodando como PWA instalado (nenhuma diferenciação especial a fazer).
8. **`ChangePasswordModal.tsx` fica como está, não é removido (correção de escopo pós-revisão)**: é usado em `AssistantHeaderMenu.tsx:189` (menu do assistente financeiro "Redefinir senha"), uma tela separada de `AppShell`/Configurações. O plano original tratava isso como risco a decidir na implementação; a decisão agora é explícita: o novo formulário de senha do `ConfigPanel` (Fase 3) é um componente novo, e `ChangePasswordModal` continua existindo e funcionando exatamente como hoje no assistente. Nenhuma tentativa de unificação nesta rodada.
9. **`Drawer` (Fase 1) precisa registrar presença em `FirstAccessGuideContext` (correção de escopo pós-revisão)**: `Dialog` hoje chama `useFirstAccessGuideSurface(GUIDE_LAYER_MODAL, open)` (`ui/dialog.tsx:31`) para pausar guias de "primeiro acesso" da tela de fundo enquanto ele está aberto. Sem o mesmo registro, um guia de onboarding da tela de fundo pode aparecer visualmente por cima do drawer. O `Drawer` deve chamar o mesmo hook com o mesmo `GUIDE_LAYER_MODAL` (ou um layer equivalente, se fizer sentido distinguir drawer de modal — a definir na implementação, mas nunca deixar de registrar).

## Escopo

### Dentro do escopo

- ~~Fase 0~~ — **já implementada**, ver "Decisões e divergências", item 2.
- **Fase 1** — componente `Drawer` novo (`src/ui/drawer.tsx`) + `Z_DRAWER` em `zIndex.ts`.
- **Fase 2** — `AccountProfileMenu.tsx`: itens "Minha conta", "Segurança", "Gerenciar perfis" abrem o drawer de Configurações já na aba/seção certa (hoje o menu não tem esses itens — só troca de perfil e logout).
- **Fase 3** — `ConfigPanel.tsx` novo: drawer com sidebar fixa única interna, substituindo `ConfigScreen.tsx` como tela cheia.
  - Sidebar única, sem abas: Minha conta, Segurança, Perfis, Categorias, Cartões, Catálogo de serviços, Representantes, Sócios, Usuários — nessa ordem, cada item reaproveitando as Tabs existentes (`MinhaContaTab` sem o form de senha embutido, formulário de senha novo, `PerfisTab`, `CategoriasTab`, `CartaoTab`, `ServicosTab`, `RepresentantesTab`, `SociosTab`, `UsuariosTab`) dentro do corpo do drawer, à direita da sidebar.
  - **Clientes sai de Configurações** e vira item próprio na sidebar principal (`AppSection`), como o spec pede (§2.3).
  - `Acessos` e `Integrações de IA` (permissões especiais, fora do spec) mantidos como estão hoje, listados na mesma sidebar única quando o usuário tem permissão (mesmas regras de visibilidade de hoje).
- **Fase 3.5** — Padronizar inputs: reduzir `src/ui/dialogFormTokens.tsx` (`fieldInputStyle`, `smallInputStyle`, `numericInputStyle`, `MoneyField`/`MoneyFieldSmall`) e os inline styles equivalentes em `ClienteDetail.tsx`/`ClientesTab.tsx` para o mesmo padrão de 40px (`h-10`) já usado em `src/ui/form.tsx`. Aplica-se a todos os campos de texto/data/select do módulo de Clientes/Contratos; `MoneyField` (valor grande, 26px) mantém destaque tipográfico só onde já é usado como valor principal de destaque (ex.: total do contrato), não como padrão de input comum.
- **Fase 4** — `ContratoModal`/`ContratoForm` (`ClienteDetail.tsx`) passam a abrir em `Drawer` de 820px no lugar do `Dialog size="xxl"`. O sub-modal de "Discriminação de prestação de serviço" (hoje um `Dialog` empilhado sobre outro `Dialog`) vira aba dentro do mesmo drawer, eliminando o empilhamento de dois modais centralizados. Anexos também viram aba.
- **Fase 5** — `AppShell.tsx`: remove submenu de Configurações da sidebar, adiciona item único "Configurações" que abre o drawer; ajusta altura do header conforme necessário; mantém `AccountProfileMenu` no lugar atual (já é o menu de conta do header).
- **Fase 6** — Mobile: drawer vira folha de largura cheia; sidebar interna do drawer também se adapta (lista colapsável ou topo, a definir na implementação); modo demo com drawer em leitura.
- **Fase 7** — Endereçamento por URL (`?config=item`, `?config=item&id=12`) para o drawer de Configurações e o drawer de Contrato, com reconstituição após F5 e fechamento de uma camada por vez via `Escape`/botão voltar do navegador.
- **Fase 8** — Reativar upload de foto de perfil: UI de upload com recorte circular no item "Minha conta" do `ConfigPanel`, usando a rota `PUT /api/users/current/photo` já existente; propagar `foto` para `AuthUser`/`types/auth.ts`; exibir a foto (com fallback para iniciais) em todo avatar circular do `AccountProfileMenu` (trigger, bloco usuário, lista de troca de perfil).

### Fora do escopo

- Sessões ativas / revogação de sessão (feature nova de backend, não pedida).
- Migração de troca de perfil para invalidação de queries sem reload.
- Qualquer mudança em `servicos` como catálogo compartilhado entre perfis (decisão já tomada no plano de `perfil_id`).
- Foto por *perfil* (empresa/pessoal) — cada perfil continua usando iniciais na lista "Trocar perfil"; só o avatar do usuário logado ganha foto.
- Qualquer tratamento diferenciado para o PWA — comportamento idêntico ao navegador comum.

## Leitura de contexto já realizada

- `src/layout/AppShell.tsx` (completo) — sidebar, `CONFIG_SUBS`, header, `NotificationPanel`.
- `src/layout/AccountProfileMenu.tsx` (completo) — já implementa quase todo o §1 do spec.
- `src/ui/dialog.tsx`, `src/ui/zIndex.ts` (completos).
- `src/screens/config/ConfigScreen.tsx`, `MinhaContaTab.tsx` (completos).
- `src/screens/config/ClienteDetail.tsx` (completo, 1470 linhas) — confirma que `ContratoModal` já empilha `Dialog` dentro de `Dialog` (linhas ~705 e ~946).
- `src/hooks/useActiveProfile.ts` (completo) — confirma uso de `window.location.reload()`.
- `src/components/financial-assistant/ChangePasswordModal.tsx` — segundo formulário de troca de senha já existente, duplicado com o de `MinhaContaTab`.
- `src/App.tsx` (completo) — confirma que a área logada **não usa `react-router`**, apenas `useState` local para `section`/`configTab`. Nenhum `useSearchParams` em uso na área logada.
- `src/services/configService.ts`, `queryKeys.ts` — padrão de `getActiveProfileId()` já usado em categorias/cartões.
- `.plans/amarrar-perfil-clientes-contratos.md` (completo) — **plano desatualizado, órfão**: o trabalho nele descrito já foi implementado (commit `2891941`), o arquivo só não foi removido/marcado como concluído na época.
- Backend (`backend/src`) — confirmado: nenhuma tabela/rota de sessões de autenticação revogáveis existe.

## Impacto por área

### Frontend

- Novo: `src/ui/drawer.tsx`, `src/layout/ConfigPanel.tsx` (substitui `ConfigScreen.tsx` como ponto de entrada; os arquivos de cada Tab existente são reaproveitados como estão, só muda o wrapper).
- Alterado: `src/layout/AppShell.tsx` (sidebar sem submenu, item único Configurações, `Clientes` promovido a `AppSection`), `src/layout/AccountProfileMenu.tsx` (itens que abrem o drawer no destino certo), `src/ui/zIndex.ts` (`Z_DRAWER`), `src/screens/config/ClienteDetail.tsx` (`ContratoModal` em `Drawer`), `src/App.tsx` (estado do drawer de config, nova seção `clientes` na sidebar).
- Removido/consolidado: `ConfigScreen.tsx` como tela de rota cheia; duplicidade entre `ChangePasswordModal.tsx` e o formulário de senha embutido em `MinhaContaTab.tsx` — unificar em um único formulário de senha (vive na aba Conta do novo drawer), reaproveitado pelo assistente financeiro se ele ainda precisar abrir esse fluxo.

### Backend

- Fase 8: `backend/src/routes/auth.ts` — incluir `photo` no `.select()` e no payload `usuario` das rotas `/verify` (obrigatório, é o que a sessão do frontend usa), `/login`, `/register` e `/google` (por consistência). Nenhuma migration nova (a coluna já existe). Fora desta fase, nenhuma outra alteração de backend (redesign é puramente frontend).

### Banco de dados

Nenhuma migration necessária — `clientes.perfil_id` e `users.photo` já existem em produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos prováveis afetados

- `src/ui/drawer.tsx` (novo, Fase 1)
- `src/ui/zIndex.ts` (Fase 1)
- `src/layout/AccountProfileMenu.tsx` (Fase 2)
- `src/layout/ConfigPanel.tsx` (novo, Fase 3)
- `src/ui/dialogFormTokens.tsx` (Fase 3.5)
- `src/screens/config/ClienteDetail.tsx` (Fase 3.5, Fase 4)
- `src/screens/config/ClientesTab.tsx` (Fase 3.5)
- `src/layout/AppShell.tsx`, `src/App.tsx` (Fase 5)
- `src/screens/config/ConfigScreen.tsx` (removido ao final da Fase 3, após `ConfigPanel.tsx` cobrir tudo)
- `src/types/auth.ts`, `src/services/usuariosService.ts`, `src/layout/AccountProfileMenu.tsx`, `backend/src/routes/auth.ts` (Fase 8 — reaproveita `PUT /api/users/current/photo` já existente; `auth.ts` precisa incluir `photo` no select/payload de `/verify` e demais rotas de sessão)

## Estratégia de implementação (fases sequenciais)

**Fase 1 — Componente Drawer**
1. Criar `src/ui/drawer.tsx`: ancorado à direita, 820px (variante `sm` 620px), overlay, header com título/subtítulo/botão fechar, corpo scrollável, rodapé opcional, animação de entrada/saída respeitando `prefers-reduced-motion`, foco preso e devolvido, `overflow:hidden` no body enquanto aberto.
2. Adicionar `Z_DRAWER` em `zIndex.ts`, entre `Z_DROPDOWN` e `Z_MODAL`.
3. Chamar `useFirstAccessGuideSurface(GUIDE_LAYER_MODAL, open)` (mesmo hook que `Dialog` já usa, `ui/dialog.tsx:31`) para pausar guias de primeiro acesso da tela de fundo enquanto o drawer está aberto — sem isso, um guia pode aparecer por cima do drawer.

**Fase 2 — Ajustes no menu de conta**
1. Em `AccountProfileMenu.tsx`, adicionar os itens "Minha conta", "Segurança", "Gerenciar perfis" que abrem o `ConfigPanel` (via callback/prop) já na seção correta.
2. Sem mudança na lógica de troca de perfil (mantém reload, por decisão already tomada).

**Fase 3 — ConfigPanel (drawer com sidebar fixa única)**
1. Criar `ConfigPanel.tsx`: `Drawer` de 820px com sidebar interna fixa à esquerda, lista única sem abas (Minha conta, Segurança, Perfis, Categorias, Cartões, Catálogo de serviços, Representantes, Sócios, Usuários, + Acessos/Integrações de IA quando aplicável), conteúdo à direita.
2. Reaproveitar as Tabs existentes como conteúdo de cada item da sidebar (sem reescrever a lógica interna delas).
3. Criar o novo formulário de senha com medidor de força (conforme §3 do spec, sem sessões ativas) como item próprio "Segurança" na sidebar, substituindo o form de senha hoje embutido em `MinhaContaTab`. **`ChangePasswordModal.tsx` não é removido**: é usado fora do fluxo de Configurações, em `AssistantHeaderMenu.tsx:189` (menu do assistente financeiro, tela separada do `AppShell`) — ver "Decisões e divergências", item 8.
4. Promover `Clientes` a item próprio da sidebar principal (`AppSection`), fora do drawer.
5. Remover `ConfigScreen.tsx` e o submenu de Configurações do `AppShell`.
6. Preservar as regras de visibilidade condicional já existentes em `CONFIG_SUBS`/`AppShell` (Representantes/Sócios ocultos para perfil `pessoal`; Acessos restrito por documento; Integrações de IA restrito a `master`).

**Fase 3.5 — Padronizar inputs (compactos)**
1. Em `dialogFormTokens.tsx`: reduzir `fieldInputStyle` de `height: 54`/`fontSize: 17` para o equivalente de `h-10` (40px)/`fontSize: 14`, alinhado ao `inputBase` de `form.tsx`; revisar `smallInputStyle`/`numericInputStyle` (hoje 42px) para o mesmo padrão.
2. Em `ClienteDetail.tsx`: atualizar os inline `height: 42/44/46` (campos do `ContratoForm`, `valuesInlineFieldStyle`, botões do rodapé) para 40px, reduzindo padding/gap proporcionalmente para não sobrar espaço vazio.
3. Em `ClientesTab.tsx`: aplicar o mesmo ajuste onde usar os tokens de `dialogFormTokens.tsx`.
4. Não alterar `MoneyField`/`MoneyFieldSmall` como destaque tipográfico (usados para valores grandes de contrato) — apenas os campos de texto/data/select comuns.
5. Build de frontend para conferir que nada quebrou visualmente (checagem manual no navegador, já que é mudança puramente visual).

**Fase 4 — Contrato em Drawer**
1. `ClienteDetail.tsx`: `ContratoModal` passa a usar `Drawer` (820px) em vez de `Dialog size="xxl"`.
2. "Discriminação de prestação de serviço" e "Anexos" viram abas dentro do mesmo drawer, eliminando o `Dialog` empilhado atual.
3. Profundidade máxima do fluxo: tela (Cliente) → drawer (Contrato) → modal pequeno só para registros de um serviço/lançamento pontual, se necessário.

**Fase 5 — AppShell**
1. Remover submenu de Configurações da sidebar; adicionar item único que abre o `ConfigPanel`.
2. Adicionar `Clientes` como item de primeira classe na sidebar.
3. Sem mudança no menu de conta do header (já está no lugar certo via `AccountProfileMenu`).

**Fase 6 — Mobile e modo demo**
1. Drawer em folha de largura cheia no mobile.
2. Grid da aba Negócio em 1 coluna abaixo de breakpoint.
3. Modo demo: `ConfigPanel` abre em leitura, sem salvar (mesmo padrão já usado em `AccountProfileMenu` com `isDemoMode`).

**Fase 7 — URL params**
1. Sincronizar a abertura do `ConfigPanel` com `?config=item` (ex.: `?config=usuarios`, `?config=seguranca`) via `URLSearchParams` manual (sem introduzir `react-router` na área logada) — ao montar, ler a query string e abrir o drawer/item correspondente; ao trocar de item ou fechar, atualizar a URL.
2. Sincronizar o modal de registro dentro de uma lista com `&id=12` (ex.: `?config=usuarios&id=12`), reconstituindo drawer + modal após F5.
3. `Escape` e o botão voltar do navegador fecham uma camada por vez, na mesma ordem (modal → drawer → nada), usando `history.pushState`/`popstate` para cada camada aberta.
4. Trocar de perfil com o drawer aberto fecha o drawer e limpa a query string (dado que hoje a troca de perfil já causa reload completo — a limpeza acontece naturalmente).

**Fase 8 — Reativar foto de perfil**
1. **Backend primeiro**: `backend/src/routes/auth.ts` — adicionar `photo: users.photo` ao `.select()` de `/verify` (linha ~247) e `photo: user.photo` ao payload `usuario` da resposta (linha ~267); replicar nos payloads `usuario` de `/login`, `/register` e `/google` para consistência. Build backend antes de seguir.
2. `types/auth.ts`: adicionar `foto?: string | null` a `AuthUser`.
3. `usuariosService.ts`: adicionar função `updateFoto(foto: string | null)` chamando `PUT /api/users/current/photo` (rota já existe, sem mudança de schema/rota necessária).
4. Novo componente de upload com recorte circular (avaliar lib leve de crop já compatível com o stack, ou crop manual via `<canvas>` para não adicionar dependência pesada) no item "Minha conta" do `ConfigPanel` (Fase 3): seleciona arquivo → editor de zoom/posição → confirma → gera base64 recortado → `updateFoto`.
5. `AccountProfileMenu.tsx`: trocar o ramo `userInitial` (linhas 108, 136, 214) por `<img>` quando `user.foto` existir, mantendo fallback para iniciais; nenhuma mudança nos ramos que já usam `getInitials(p.nome)`/`getInitials(activePerfil.nome)` (avatares de perfil continuam com iniciais).
6. Invalidar `queryKeys.session` (query de `useAuthSession`) após salvar/remover a foto, para o novo avatar refletir imediatamente sem reload de página inteira — não basta invalidar `['usuario-me']`, que é uma query separada (`fetchMe`, usada só em `MinhaContaTab`/`ConfigPanel`).
7. Botão para remover foto (`foto: null`), reaproveitando a mesma rota.

Comandos de validação ao final de cada fase de frontend:
```bash
npx vite build
```
Ao final das Fases 0 e 8 (mexem em backend):
```bash
cd backend && npm run build
```

## Regras de negócio identificadas

- `perfil_id` nulo em `clientes`/`contratos` cai no perfil `'pessoal'` do usuário (decisão já tomada no plano de origem).
- `servicos` (catálogo) permanece global, sem filtro de perfil.
- Nunca dois modais centralizados empilhados — corrige a violação já existente em `ContratoModal`.
- Nunca lista de cadastro em modal centralizado — todas as Tabs de cadastro vivem dentro do drawer, nunca em `Dialog`.
- Drawer nunca navega (não muda `AppSection`); fechar/abrir preserva a tela de fundo intacta.

## Regras multi-tenant e segurança

- Toda query de `clients.ts`/`contracts.ts` já filtra por `usuario_id` primeiro, com `perfil_id` como filtro adicional — nenhuma mudança necessária nesta rodada.
- Sem mudança de superfície de segurança nas fases 1–6 (puramente frontend/apresentação).

## Validações necessárias

- Fase 1: `Drawer` abre/fecha corretamente, foco preso, `Escape` fecha, overlay clica fora fecha.
- Fase 3: cada item da sidebar do `ConfigPanel` carrega a Tab correspondente sem regressão de funcionalidade (criar/editar/excluir em cada cadastro continua funcionando).
- Fase 4: abrir/fechar o drawer de Contrato preserva a lista de contratos e não perde o cliente selecionado; abas de Serviços/Anexos funcionam sem o `Dialog` empilhado antigo.
- Fase 8: `PUT /current/photo` grava e remove corretamente; avatar do usuário reflete a foto em todos os locais listados sem reload de página; avatares de perfil (Pessoal/PJ) continuam inalterados com iniciais.
- Todas as fases: abrir e fechar qualquer camada devolve a tela de fundo intacta (mesmo filtro de mês, mesmo scroll, sem refetch desnecessário).

## Testes necessários

### Frontend
- Abrir Configurações a partir do menu de conta (cada item: Minha conta, Segurança, Gerenciar perfis) e confirmar que abre na seção certa.
- Trocar entre itens da sidebar do drawer sem perder o estado da tela de fundo.
- Criar/editar um registro em cada Tab (Categorias, Cartões, Serviços, Representantes, Sócios, Usuários) dentro do novo drawer.
- Abrir um Contrato, navegar entre abas (Dados, Serviços, Anexos) sem que dois modais fiquem empilhados.
- Testar modo demo: drawer abre em leitura, nenhuma ação salva.
- Testar mobile: drawer em folha cheia, grid em 1 coluna.
- Enviar uma foto, recortar, salvar e confirmar que aparece no trigger do header e no bloco usuário do popover; remover a foto e confirmar volta às iniciais; confirmar que os avatares de perfil (Pessoal/PJ) na lista "Trocar perfil" não mudam.

### Backend (Fase 8)
- `PUT /api/users/current/photo` com `{ foto: "<base64>" }` e com `{ foto: null }` (remoção) — já implementado, apenas validar que segue funcionando ao integrar o frontend.

## Riscos e pontos de atenção

- Maior risco: **Fase 4** (Contrato em Drawer) — `ContratoModal` é o componente mais complexo do código lido (1470 linhas em `ClienteDetail.tsx`, múltiplas mutations, formulário de valores, catálogo de serviços). Migrar de `Dialog` para `Drawer` exige atenção a `scrollBody={false}` e ao layout de rodapé fixo que o `ContratoModal` já usa.
- **Fase 3** mexe em 6+ Tabs existentes só como wrapper — risco baixo de lógica, mas alto em volume de arquivos tocados; testar cada Tab individualmente após a migração de container.
- **Fase 3.5** é puramente visual (nenhuma lógica muda), mas `ClienteDetail.tsx` tem grids com `gridTemplateColumns` calculados a partir das alturas atuais (ex.: `valuesInlineFieldStyle`, `CatalogoServicoRow`) — reduzir a altura sem revisar o grid ao redor pode desalinhar colunas; conferir visualmente cada bloco após o ajuste.
- `ChangePasswordModal.tsx` permanece como componente independente (usado em `AssistantHeaderMenu.tsx`, fora de Configurações) — o novo formulário de senha do `ConfigPanel` é código novo, não uma extração/unificação; aceitar a duplicidade de UI de troca de senha entre os dois fluxos nesta rodada.
- `perfilTipo === 'pessoal'` hoje esconde Representantes/Sócios na sidebar (`AppShell.tsx:292-294`) — essa regra precisa ser preservada na sidebar do `ConfigPanel`.
- `Acessos` e `Integrações de IA` (permissões especiais por documento/tipo master) não estão no spec original — entram na mesma sidebar única, com a mesma visibilidade condicional de hoje (ver Fase 3, item 6).
- **Fase 7** introduz a primeira sincronização de estado com a URL na área logada, que hoje não tem nenhuma — risco de conflito se, no futuro, o app adotar `react-router` de verdade (a lógica manual desta fase precisaria ser substituída, não composta).
- **Fase 8**: base64 na coluna `text` infla o tamanho de qualquer resposta de API que inclua o usuário completo (`fetchMe`, sessão) — sem limite de tamanho de arquivo, uma foto grande pode deixar essas respostas pesadas; definir um limite de tamanho no frontend antes do upload (ex.: redimensionar/comprimir no canvas de recorte antes de gerar o base64 final) para não introduzir regressão de performance.
- **Fase 8**: escolha de lib de crop (se houver) precisa ser leve e compatível com o bundle atual (Vite); avaliar crop manual via `<canvas>` como alternativa sem nova dependência caso nenhuma lib leve se encaixe.
- **Fase 8** exige tocar backend (`backend/src/routes/auth.ts`) para incluir `photo` no select/payload de `/verify` (e `/login`, `/register`, `/google` por consistência) — sem isso, o campo `foto` no tipo `AuthUser` nunca chega preenchido ao frontend, mesmo com a rota `PUT /current/photo` funcionando. Rodar `cd backend && npm run build` como parte desta fase, não só no frontend.

## Perguntas em aberto

1. **Ordem de execução das fases** — aprova todas as fases de uma vez (eu implemento sequencialmente e aviso ao fim de cada uma), ou prefere aprovar fase a fase mesmo estando tudo num único plano?

## Critérios de aceite do plano

- [ ] A sidebar principal tem Clientes como item próprio; Configurações não tem mais submenu, abre o drawer.
- [ ] O drawer de Configurações tem sidebar fixa única (sem abas, sem tela de "hub") sempre visível, listando todos os itens de cadastro.
- [ ] Abrir/fechar Configurações ou Contrato devolve a tela de fundo intacta (mesmo filtro, mesmo scroll).
- [ ] Nenhuma lista de cadastro abre em modal centralizado.
- [ ] Nenhum fluxo empilha dois modais centralizados (corrige o `ContratoModal` atual).
- [ ] Contrato abre em drawer, com Serviços e Anexos como abas internas.
- [ ] Menu de conta abre o drawer já na seção certa (Minha conta, Segurança, Gerenciar perfis).
- [ ] Novo formulário de senha do `ConfigPanel`, com medidor de força, sem menção a "sessões ativas"; `ChangePasswordModal.tsx` continua funcionando normalmente no assistente financeiro, sem remoção.
- [ ] Modo demo mantém o drawer visualmente idêntico, com ações inertes.
- [ ] `?config=usuarios&id=12` reconstitui drawer e modal depois de um F5; `Escape` e o botão voltar fecham uma camada por vez.
- [ ] Inputs de Clientes/Contratos usam o mesmo tamanho (40px) do restante do app — nenhum campo de texto/data/select comum com 54px ou 46px sobrando.
- [ ] Usuário consegue enviar, recortar e salvar uma foto de perfil, e removê-la; o avatar do usuário (trigger do header e bloco usuário do popover) reflete a foto com fallback para iniciais; avatares de perfil (Pessoal/PJ) continuam com iniciais.
- [ ] `GET /api/auth/verify` retorna `photo` no payload `usuario`, e a sessão do frontend (`AuthUser`) reflete o campo sem precisar de `fetchMe` separado.
- [ ] Build de frontend (e backend na Fase 8) passam sem erros em cada fase.

## Observações para a skill implementar

- Seguir a ordem das fases; validar build ao final de cada uma antes de avançar para a próxima.
- Reaproveitar ao máximo a lógica das Tabs existentes (`CategoriasTab`, `CartaoTab`, etc.) — a mudança é de container/navegação, não de lógica de negócio interna de cada cadastro.
- `ChangePasswordModal.tsx` não deve ser removido nem alterado — é usado fora do fluxo de Configurações, em `AssistantHeaderMenu.tsx`.
