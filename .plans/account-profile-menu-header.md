# Plano de Implementação: AccountProfileMenu no header (perfil ativo + conta do usuário)

## Origem

- Arquivo de especificação: `.md` colado pelo usuário na conversa (redesign "perfil ativo + conta do usuário no header"), com escopo reduzido definido interativamente
- Data do planejamento: `2026-08-31`
- Classificação: `frontend-only`

## Resumo

Consolidar a troca de perfil ativo e a identidade do usuário logado num único componente, `AccountProfileMenu`, exibido no canto superior direito do header do `AppShell` (projeto `sistema financas`). Ele substitui duas coisas que hoje vivem na sidebar: o `PerfilSwitcher` (que hoje é uma função definida inline dentro do próprio `AppShell.tsx`, não um arquivo separado) e o rodapé fixo de usuário (nome, e-mail, botão "Sair da conta"). O objetivo imediato é tornar o perfil ativo visível em qualquer tela — inclusive mobile, onde a sidebar fica escondida — e liberar espaço na sidebar, que hoje tem scroll apertado em Configurações.

Este plano é uma versão de escopo reduzido do documento original fornecido pelo usuário: as tarefas de modais de edição de conta ("Meus dados" e "Redefinir senha") e a remoção do item "Minha conta" de Configurações foram explicitamente excluídas a pedido do usuário, que pretende tratá-las em uma etapa futura separada.

## Escopo

### Dentro do escopo

- Criar `src/layout/AccountProfileMenu.tsx`, novo componente de menu no header.
- Criar `src/utils/document.ts` com `formatCNPJ` e `formatCPF` compartilhados (hoje só existe um `formatCNPJ` privado em `ClientesTab.tsx`).
- Migrar para o novo componente toda a lógica de seleção/persistência de perfil ativo hoje presente no `PerfilSwitcher` inline (`AppShell.tsx:77-141`), incluindo o `useEffect` que grava `perfilAtivoId/Nome/Tipo` no `localStorage` e recarrega a página quando não há perfil ativo definido ainda.
- Trigger do menu: avatar com iniciais do perfil ativo, duas linhas de texto (perfil ativo / usuário logado), chevron animado, estados fechado/aberto/hover conforme especificação visual.
- Dropdown com:
  - (a) Seção "Trocar perfil" — lista de `fetchPerfis()`, oculta inteiramente se houver apenas 1 perfil; cada linha com avatar, nome, documento formatado (se existir), badge de tipo (mapeamento visual `empresa`→"PJ", `pessoal`→"PF"), check no perfil ativo.
  - (b) Identidade do usuário logado — nome completo e e-mail, somente exibição, sem nenhuma ação de editar/abrir modal.
  - (d) "Sair" — sem modal de confirmação, atalho visual `⇧Q`, overlay "Encerrando a sessão…" durante a transição, chama `logout()` e `window.location.replace('/index.html')`.
- Acessibilidade: `aria-haspopup="menu"`, `aria-expanded`, dropdown com `role="menu"`, itens com `role="menuitem"`, navegação por setas ↑↓, `Enter` aciona, fecha em `Escape`/clique fora/navegação.
- Animação de entrada do dropdown (fade + `translateY(-6px)` → 0, 130ms ease) respeitando `prefers-reduced-motion` (padrão já usado no projeto em `globals.css`).
- Reutilizar `Z_DROPDOWN` de `src/ui/zIndex.ts`.
- Editar `AppShell.tsx`:
  - Remover a função `PerfilSwitcher` e seu uso na sidebar (bloco `{!isDemoMode && (<div className="pt-3"><PerfilSwitcher /></div>)}`).
  - Remover o bloco `{/* User footer */}` (avatar + nome + e-mail + botão "Sair da conta"), substituindo por uma faixa opcional discreta com versão do app (10.5px, `rgba(14,196,216,0.3)`, `border-top: 1px solid rgba(14,196,216,0.12)`, padding `12px 16px`).
  - Montar `<AccountProfileMenu />` no header, após o sino de notificações, separado por divisor vertical (`width: 1px; height: 24px; background: rgba(14,196,216,0.15); margin: 0 6px`).
  - Aumentar a altura do header de `h-14` (56px) para 64px; ajustar os dois cálculos de `fillViewport` (`h-[calc(100vh-56px)]` → `h-[calc(100vh-64px)]`, `h-[calc(100%-56px)]` → `h-[calc(100%-64px)]`).
  - Remover o avatar `lg:hidden` do header (papel substituído pelo novo bloco).
  - Modo demo (`isDemoMode`): renderizar o bloco visualmente idêntico, porém com dropdown/ações inertes — sem logout real, sem troca de perfil.
- Comportamento mobile: abaixo de 480px, trigger mostra só avatar + chevron (sem as duas linhas de texto); dropdown vira sheet ancorada à direita (`max-width: calc(100vw - 24px)`); alvos de toque com no mínimo 44px de altura.

### Fora do escopo

- Modal "Meus dados" (extração do formulário de conta de Configurações).
- Modal "Redefinir senha".
- Qualquer ação de editar dados/trocar senha a partir do novo dropdown.
- Remoção do item "Minha conta" de `CONFIG_SUBS` em Configurações — permanece exatamente como está hoje.
- Mudança do `configTab` padrão (`'conta'`) ou qualquer redirecionamento de compatibilidade `?tab=conta`.
- Toast/notificação visual ao trocar de perfil (projeto não tem sistema de toast; troca de perfil apenas fecha o menu e recarrega a página, como já ocorre hoje).
- Testes automatizados (projeto não possui suíte de testes nessa área).
- Qualquer alteração em `escalacao futebol` — este plano é específico de `sistema financas`.

## Leitura de contexto

- `/AGENT.md` (raiz do workspace) — regras de workflow, contexto multi-tenant/backend (não diretamente aplicável a este plano frontend-only, mas lido por completude).
- `sistema financas/AGENT.md` — idêntico ao da raiz nesta cópia; mesmas regras.
- `sistema financas/CLAUDE.md` — regra de workflow obrigatório `/planejar → aprovação → /implementar → /finalizar`.
- Não existe `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos dedicados neste projeto — a estrutura é `sistema financas/` (frontend+backend unificado) sem separação em subpastas `frontend/`/`backend/` na raiz do workspace.
- `.md` de especificação colado pelo usuário na conversa (não é um arquivo em disco).
- `sistema financas/src/layout/AppShell.tsx` — componente principal a alterar; contém o `PerfilSwitcher` inline e o rodapé de usuário.
- `sistema financas/src/services/configService.ts` — `fetchPerfis()`.
- `sistema financas/src/services/queryKeys.ts` — `queryKeys.perfis`.
- `sistema financas/src/types/config.ts` — `interface Perfil` (`tipo: 'pessoal' | 'empresa'`, `documento?: string | null`).
- `sistema financas/src/types/auth.ts` — `interface AuthUser`.
- `sistema financas/src/services/session.ts` — `logout()`.
- `sistema financas/src/ui/zIndex.ts` — `Z_DROPDOWN`, `Z_MOBILE_NAV_OVERLAY`, `Z_SYSTEM_OVERLAY`.
- `sistema financas/src/screens/config/ClientesTab.tsx` — `formatCNPJ` local (referência de formato, não será importado diretamente).
- `sistema financas/src/styles/globals.css` — uso existente de `@media (prefers-reduced-motion: reduce)`.

## Impacto por área

### Frontend

- Novo componente `src/layout/AccountProfileMenu.tsx` com estado local (`open`, navegação por teclado), consumindo `useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis })`.
- Novo util `src/utils/document.ts` (`formatCNPJ`, `formatCPF`), puro, sem dependências externas.
- Edição de `src/layout/AppShell.tsx`: remoção de código (função `PerfilSwitcher`, bloco de rodapé de usuário, avatar `lg:hidden`), inserção do novo componente no header, ajuste de altura do header e dos cálculos de `fillViewport`.
- Sem novas query keys — reaproveita `queryKeys.perfis` existente.
- Sem novos hooks de dados — reaproveita `fetchPerfis`, `logout`, `getActiveProfileId` (indiretamente via localStorage) já existentes.
- Estados de loading/error da lista de perfis: replicar o comportamento atual do `PerfilSwitcher` (que hoje não trata loading/error explicitamente além do `data ?? []`) — manter equivalente, sem introduzir novo tratamento não solicitado.
- Sem testes (não há suíte nessa área do projeto).

### Backend

Sem impacto esperado — nenhuma rota, service ou schema de backend é alterado. `fetchPerfis()` já consome `/perfis`, endpoint existente.

### Banco de dados

Sem impacto esperado. Nenhuma migration necessária.

### Infra/Deploy

Sem impacto esperado. Nenhuma env var, build ou configuração de deploy é alterada.

## Arquivos provavelmente afetados

- `sistema financas/src/layout/AccountProfileMenu.tsx` (novo)
- `sistema financas/src/utils/document.ts` (novo)
- `sistema financas/src/layout/AppShell.tsx` (edição)

## Estratégia de implementação

1. Criar `src/utils/document.ts` com `formatCNPJ(raw: string)` (extraindo o padrão já usado em `ClientesTab.tsx`) e `formatCPF(raw: string)` (novo, padrão `000.000.000-00`).
2. Criar `src/layout/AccountProfileMenu.tsx`:
   - Props: `user: AuthUser`, `isDemoMode: boolean`.
   - Buscar perfis com `useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis })`.
   - Replicar a lógica de perfil ativo do `PerfilSwitcher` atual (leitura de `localStorage.getItem('perfilAtivoId')`, fallback para `data[0]`, `useEffect` de auto-seleção com `window.location.reload()`, `select(id, nome, tipo)` que grava no `localStorage` e recarrega).
   - Construir trigger (avatar 34×34 com iniciais do perfil ativo, 2 linhas de texto truncadas, chevron) e dropdown (296px, posicionado `top: 60px; right: 18px`, `Z_DROPDOWN`, animação fade+translateY respeitando `prefers-reduced-motion`).
   - Seção "Trocar perfil": ocultar se `data.length <= 1`; renderizar linha por perfil com avatar, nome, documento formatado via `document.ts` (omitir linha se `!p.documento`), badge de tipo (mapear `'empresa'`→"PJ", `'pessoal'`→"PF"), check no ativo.
   - Seção identidade do usuário: avatar redondo, nome (`user.nome ?? user.name`), e-mail (`user.email`).
   - Seção "Sair": sem modal, overlay de transição local (`useState` de "encerrando sessão"), chama `logout()` + `window.location.replace('/index.html')`.
   - Fechamento: listener de clique fora, `Escape`, navegação por setas/Enter entre itens com `role="menuitem"`.
   - Modo demo: quando `isDemoMode`, renderizar a mesma moldura visual mas desabilitar abertura do dropdown/ações (sem query real de perfis, sem logout).
   - Breakpoint mobile (<480px): esconder as duas linhas de texto do trigger via CSS/Tailwind responsivo; dropdown com `max-width: calc(100vw - 24px)` e alvos de toque ≥44px.
3. Editar `AppShell.tsx`:
   - Remover a função `PerfilSwitcher` (linhas 77-141) e sua chamada na sidebar (linhas 282-287).
   - Remover o bloco "User footer" (linhas 407-425); no lugar, inserir a faixa discreta opcional de versão do app.
   - No header (dentro da `<div className="flex h-14 items-center...">`), após o botão de notificações (`Bell`), inserir o divisor vertical e `<AccountProfileMenu user={user} isDemoMode={isDemoMode} />`.
   - Trocar `h-14` por `h-16` (64px) no container do header; atualizar `h-[calc(100vh-56px)]` → `h-[calc(100vh-64px)]` e `h-[calc(100%-56px)]` → `h-[calc(100%-64px)]` no `<main>`.
   - Remover o `<div>` de avatar `lg:hidden` (linhas 493-495).
4. Validar visualmente: header em todas as seções, telas com `fillViewport` (calendário/similares), dropdown em desktop e mobile (<480px), modo demo, comportamento de logout com overlay, navegação por teclado.
5. Rodar `npm run lint`/`npm run typecheck`/`npm run build` no projeto `sistema financas` (ver comandos abaixo) e corrigir eventuais erros de tipo/lint antes de considerar concluído.

## Regras de negócio identificadas

- Perfil ativo é definido por `localStorage.perfilAtivoId`; se ausente ou não corresponder a nenhum perfil retornado por `fetchPerfis()`, o primeiro perfil da lista é adotado automaticamente e a página é recarregada para propagar o novo perfil ativo a todo o app (comportamento herdado do `PerfilSwitcher` atual, deve ser preservado).
- Trocar de perfil ativo grava `perfilAtivoId`, `perfilAtivoNome`, `perfilAtivoTipo` no `localStorage` e recarrega a página (`window.location.reload()`); não há chamada de API para "ativar" perfil no backend.
- `logout()` limpa token e todas as chaves de perfil ativo do storage; deve ser seguido de `window.location.replace('/index.html')`.
- Se houver apenas 1 perfil, a seção "Trocar perfil" inteira (incluindo label) é ocultada — o comportamento atual do `PerfilSwitcher` já é análogo (`if (data.length <= 1) return null`), mas no componente antigo isso oculta o switcher inteiro; no novo, deve ocultar apenas a seção, mantendo identidade do usuário e "Sair" visíveis mesmo com 1 perfil só.
- Documento do perfil (CNPJ/CPF) é opcional; quando ausente, a linha correspondente não deve ser renderizada (sem placeholder).

## Regras multi-tenant e segurança

Não aplicável diretamente — este é um projeto frontend single-tenant por sessão de usuário (não é o backend multi-prefeitura descrito no `AGENT.md` genérico). Ainda assim:
- O perfil ativo já é validado no backend em cada request via `getActiveProfileId()`/`perfil_id` (mecanismo existente, não alterado por este plano).
- Nenhuma chamada nova ao backend é introduzida; `fetchPerfis()` já é uma rota autenticada existente.
- O logout deve continuar limpando todas as chaves de sessão/perfil do `localStorage`/`sessionStorage`, sem alteração de comportamento.

## Validações necessárias

- Nenhum novo formulário é criado — não há novos campos de input/validação de payload neste escopo.
- `formatCNPJ`/`formatCPF` em `document.ts` devem lidar com strings vazias/undefined sem lançar erro (retornar string vazia ou o valor bruto quando não aplicável).

## Testes necessários

### Frontend

Nenhum — projeto não possui suíte de testes automatizados nessa área (confirmado com o usuário).

### Backend

Sem impacto.

### E2E

Nenhum solicitado.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npm run lint
npm run typecheck
npm run build
```

Validação manual obrigatória (UI):
- Abrir `http://localhost:5173` com backend unificado rodando (porta 3010).
- Testar troca de perfil (usuário com múltiplos perfis) e caso de perfil único.
- Testar logout (overlay de transição, redirecionamento).
- Testar responsividade abaixo de 480px (trigger compacto, dropdown como sheet).
- Testar navegação por teclado (Tab até o trigger, Enter para abrir, setas entre itens, Escape para fechar).
- Testar modo demo (dropdown/ações inertes, moldura visual idêntica).
- Conferir telas com `fillViewport` (ex. calendário) após aumento do header para 64px.

## Riscos e pontos de atenção

- Aumentar a altura do header de 56px para 64px afeta todas as telas que usam `fillViewport` (cálculo de altura via `calc()`); é preciso validar visualmente cada uma para garantir que não sobra nem falta espaço.
- A lógica de auto-seleção de perfil ativo (incluindo o `useEffect` que recarrega a página) precisa ser migrada com fidelidade total para o novo componente — qualquer divergência pode deixar o app sem perfil ativo definido ou causar loop de reload.
- `Perfil.tipo` no schema real é `'pessoal' | 'empresa'`, não `'PJ'/'PF'` como sugerido no documento original — o badge "PJ"/"PF" é puramente um mapeamento de exibição na UI, não deve alterar o tipo de dado em `types/config.ts`.
- Como não há sistema de toast no projeto, a troca de perfil permanece sem feedback visual imediato além do reload da página — mesmo comportamento de hoje, não uma regressão, mas também não a melhoria de UX sugerida no documento original.
- `formatCNPJ` já existe de forma duplicada/privada em `ClientesTab.tsx`; este plano cria uma versão compartilhada em `document.ts` mas não deve alterar `ClientesTab.tsx` — divergência entre as duas implementações deve ser evitada (mesmo algoritmo), mas a consolidação de `ClientesTab.tsx` para usar o util novo está fora de escopo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões pendentes (toast e formatação de documento) já foram resolvidas com o usuário e incorporadas ao plano.

## Critérios de aceite do plano

- O nome do perfil ativo está visível no header em todas as telas, desktop e mobile, sem precisar abrir o dropdown (exceto abaixo de 480px, onde a especificação do usuário permite reduzir a avatar+chevron).
- Trocar de perfil ativo funciona a partir de qualquer tela via um clique no dropdown, preservando o comportamento atual de persistência em `localStorage` e reload.
- "Sair" desconecta imediatamente, sem modal de confirmação, exibindo o overlay de transição.
- A sidebar não tem mais o rodapé de usuário nem o `PerfilSwitcher` antigo.
- O item "Minha conta" em Configurações permanece intacto e funcional, sem nenhuma alteração.
- Modo demo mantém a mesma moldura visual do app real, com o novo bloco presente porém com ações inertes.
- `npm run lint`, `npm run typecheck` e `npm run build` passam sem erros novos introduzidos por esta mudança.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto; o `.md` original do usuário cobre tarefas adicionais (modais de conta, remoção de "Minha conta") que estão explicitamente fora deste plano — não implementá-las.
- Seguir `/AGENT.md` e `sistema financas/CLAUDE.md` (sequência `/planejar → aprovação → /implementar → /finalizar`; nunca commitar/push sem passar por `/finalizar`).
- Não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste projeto — seguir os padrões de código já presentes em `AppShell.tsx` e demais componentes de `src/layout`, `src/ui`.
- Manter alterações pequenas e focadas exatamente no escopo acima; não remover "Minha conta" de Configurações, não criar modais, não adicionar sistema de toast.
- Preservar fielmente a lógica de perfil ativo (localStorage + reload) ao migrá-la do `PerfilSwitcher` para `AccountProfileMenu`.
- Nenhuma migration ou alteração de `.env` é necessária ou permitida neste plano.
