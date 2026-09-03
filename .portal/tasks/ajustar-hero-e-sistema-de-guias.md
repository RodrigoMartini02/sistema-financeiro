# Task: Ajustar opacidade do hero da Home, ocultar guias na demonstração e redesenhar navegação dos guias de primeiro acesso

## Contexto

O `sistema financas` tem uma home pública (`src/screens/public/HomePage.tsx`) com um hero visual (`SitePageHero.tsx` + `HeroLogoDecor.tsx`) e uma demonstração interativa embutida via iframe (`HomeInteractiveDemo.tsx` → `/demo.html` → `src/demoMain.tsx`), que roda o mesmo app React de produção em modo demo (`AppShell isDemoMode`).

O sistema logado tem um mecanismo de "guias de primeiro acesso": `FirstAccessGuideCard.tsx` (o balão visual, com posicionamento automático via `useLayoutEffect`), `FirstAccessGuideContext.tsx` (coordinator que decide qual guia mostrar por vez, com prioridade por módulo via `MODULE_PRIORITY`), e `useFirstAccessGuide.ts` (hook por tela/scope, que persiste dispensa em `localStorage` sob a chave `fingerence:first-access-guide:{scope}:{userScope}`).

Investigação já feita nesta conversa (não repetir):

- `src/screens/public/components/HeroLogoDecor.tsx:7` aplica `opacity-45 sm:opacity-55 lg:bg-[center_right] lg:opacity-90` na imagem de fundo do hero (`icons/home-hero-bg.png`, o "F" ciano). Só em telas `lg` (≥1024px) a imagem chega perto da opacidade total; em mobile/tablet ela fica entre 45% e 55%, o que o usuário percebeu como "imagem muito translúcida, com um branco muito forte por cima" logo no início da página.
- `src/hooks/useFirstAccessGuide.ts:36-61` decide visibilidade do guia (`isVisible`) checando apenas `localStorage` (dispensado ou não) e o coordinator (`isActive`). Não existe nenhuma checagem de `isDemoMode` — o flag existe em `AppShell` (`src/layout/AppShell.tsx`, prop `isDemoMode`) e é passado para o app quando rodando via `demoMain.tsx`, mas nunca chega ao hook de guias. Resultado confirmado: todo visitante da demonstração pública vê os balões de guia como se fosse um usuário novo do sistema real.
- `FirstAccessGuideCard.tsx` hoje só tem uma ação: um X (`onDismiss`) que marca aquele `scope` específico como dispensado para sempre em `localStorage`. Não existe "Próximo"/"Entendi" nem um controle de "não ver mais guias" (silenciar todos de uma vez). O posicionamento automático (flip top/bottom conforme espaço, clamping horizontal) já funciona bem e deve ser preservado.
- `FirstAccessGuideContext.tsx` já resolve concorrência entre guias elegíveis ao mesmo tempo, mostrando só um por vez segundo `MODULE_PRIORITY` (ex.: cartões/categorias/contas antes de despesas/receitas, que vêm antes de painel/relatórios). Essa lógica de priorização deve ser reaproveitada, não recriada.
- O usuário relatou que o primeiro guia de uma sequência "parece um modal, parecendo trabalho" — ainda não identifiquei exatamente qual guia/scope é esse; requer investigação adicional no planejamento (grep por `useFirstAccessGuide` com `floating` ausente ou renderização full-screen).

## Problema

Três problemas distintos, relatados juntos pelo usuário:

1. A imagem de destaque do hero da Home fica visivelmente lavada/translúcida em telas menores que `lg`, reduzindo o impacto visual da primeira impressão da página.
2. A demonstração pública (iframe rodando o app real) exibe os balões de guia de primeiro acesso, que fazem sentido para um usuário novo do sistema real mas são ruído numa demonstração de uso único — o visitante nunca retorna para "aprender" o sistema depois, então o guia não cumpre função ali.
3. O sistema de guias de primeiro acesso, no produto real, tem posicionamento a revisar, falta de navegação estruturada (Próximo/Entendi) e falta de uma forma discreta e única de desligar todos os guias — além de pelo menos um guia inicial com aparência de modal bloqueante em vez de balão flutuante leve.

## Objetivo

1. Ajustar a opacidade/composição do hero da Home para que a imagem fique mais viva nas telas onde hoje aparece esmaecida, mantendo equilíbrio com a legibilidade do texto sobreposto.
2. Impedir que qualquer guia de primeiro acesso apareça quando o app roda em modo demonstração (`isDemoMode`).
3. Redesenhar a experiência dos guias de primeiro acesso no produto real: posicionamento correto, ações padronizadas e discretas de avanço ("Próximo"/"Entendi") e de silenciamento total ("Não ver mais guias"), inspirado em padrões de mercado de product tours (ex.: Intercom, Userpilot, tours do Notion/Linear — tour sequencial com estado de progresso em vez de N balões independentes cada um com sua própria lógica de dispensa).

## Decisão Técnica Desejada

Para os itens 1 e 2, a direção já é clara e de baixo risco: ajuste de valores de opacidade/gradiente (item 1) e curto-circuito de visibilidade condicionado a `isDemoMode` (item 2) — não deve exigir redesenho arquitetural.

Para o item 3, o usuário pediu explicitamente uma "análise profunda" antes de qualquer decisão de arquitetura, e indicou preferência por métodos de mercado (product tours com progresso), mas não fechou a decisão entre:
- Evoluir o `FirstAccessGuideCard`/`FirstAccessGuideContext` atuais (adicionar ações e um estado de "tour" sobre a base já existente), versus
- Substituir por um componente de tour sequencial novo, com estado de passo (`passo N de M`) por grupo de guias.

Essa decisão deve ser levada ao usuário como pergunta de planejamento, com a opção de evolução incremental como recomendada (reaproveita o coordinator de prioridade já validado, menor risco de regressão nos guias existentes).

## Escopo Funcional

### Dentro do escopo

- Ajustar valores de opacidade (e possivelmente o gradiente escuro sobreposto) do `HeroLogoDecor.tsx` para os breakpoints mobile/tablet, mantendo o comportamento já bom em `lg`
- Impedir renderização dos guias de primeiro acesso quando o app roda em modo demonstração (`isDemoMode` em `AppShell`/`demoMain.tsx`)
- Adicionar ao balão de guia (`FirstAccessGuideCard`) ações discretas de "Próximo"/"Entendi" (avançar/confirmar) e "Não ver mais guias" (silenciar todos), sem perder o botão de fechar (X) individual já existente
- Revisar e corrigir o posicionamento dos balões onde necessário (a mapear na investigação do planejamento quais guias têm posicionamento problemático)
- Identificar e corrigir o guia específico que hoje aparece com aparência de modal bloqueante, migrando-o para o mesmo padrão visual flutuante-ancorado dos demais

### Fora do escopo inicial

- Qualquer mudança na imagem de fundo em si (`icons/home-hero-bg.png`) — só ajuste de opacidade/composição CSS ao redor dela
- Mudanças na lógica de negócio ou dados exibidos na demonstração — só supressão dos guias
- Redesenho visual do restante da Home ou de outras páginas públicas
- Analytics ou tracking de progresso de onboarding (quantos usuários completam o tour, etc.) — fora de escopo nesta rodada
- Tradução ou i18n dos textos dos guias

## Requisitos de Frontend

- `src/screens/public/components/HeroLogoDecor.tsx`: revisar valores de opacidade por breakpoint (`opacity-45 sm:opacity-55 lg:opacity-90`) e o gradiente linear escuro sobreposto, para que a imagem fique mais viva sem prejudicar a legibilidade do título/texto do hero
- `src/hooks/useFirstAccessGuide.ts`: incorporar uma checagem de modo demonstração (via contexto/prop a definir) para que `isVisible` retorne sempre `false` nesse modo, sem alterar o comportamento fora da demo
- `src/components/FirstAccessGuideCard.tsx`: adicionar suporte a ações estruturadas (ex.: reaproveitando a interface `FirstAccessGuideAction` já existente no arquivo, hoje declarada mas não usada nesse componente) para "Próximo/Entendi" e "Não ver mais guias", mantendo o comportamento de posicionamento automático já existente
- `src/context/FirstAccessGuideContext.tsx`: avaliar se a lógica de prioridade/coordenação precisa de ajuste para suportar navegação sequencial (passo N de M) dentro de um mesmo grupo de guias, ou se pode continuar como está
- Tratar o estado "não ver mais guias" de forma persistente (provavelmente `localStorage`, seguindo o padrão já usado pelo hook) e discreta na UI (não deve competir visualmente com a ação principal do balão)

## Requisitos de Backend

Sem impacto backend identificado inicialmente. Toda a lógica de guias e opacidade é client-side.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Não há dado sensível envolvido — mudanças são de apresentação visual e preferência local do usuário (armazenada em `localStorage` no próprio navegador).

## Requisitos de Migração ou Compatibilidade

- A chave de `localStorage` hoje usada (`fingerence:first-access-guide:{scope}:{userScope}`) deve continuar funcionando para usuários que já dispensaram guias individualmente — evitar que a mudança "resete" preferências já salvas, a menos que isso seja avaliado e aceito explicitamente no planejamento
- Se for introduzida uma chave nova para "não ver mais guias" (silenciamento global), definir como ela interage com as chaves de dispensa por `scope` já existentes (ex.: silenciar tudo deve ter precedência sobre qualquer scope individual ainda não dispensado)

## Requisitos de Testes

### Frontend

- Verificar visualmente a opacidade do hero da Home nos breakpoints mobile, tablet e desktop após o ajuste
- Verificar que nenhum guia de primeiro acesso aparece ao abrir a demonstração pública (`/demo.html`), em nenhuma tela navegável da demo
- Verificar que, no sistema real (fora da demo), os guias continuam aparecendo normalmente, respeitando a prioridade por módulo já existente
- Testar a ação "Próximo/Entendi" avançando corretamente entre guias/passos
- Testar a ação "Não ver mais guias" e confirmar que nenhum guia aparece novamente após acioná-la (persistência em `localStorage`)
- Testar que o guia antes identificado como "parecendo modal" agora usa o mesmo padrão visual flutuante dos demais

### Backend

Não aplicável.

### E2E

Não aplicável inicialmente.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/public/components/HeroLogoDecor.tsx`
- `src/hooks/useFirstAccessGuide.ts`
- `src/components/FirstAccessGuideCard.tsx`
- `src/context/FirstAccessGuideContext.tsx`
- `src/demoMain.tsx` (possível ponto de propagação do flag de modo demo, a confirmar no planejamento)
- Demais arquivos que chamam `useFirstAccessGuide` com guias cujo posicionamento ou aparência precisa de ajuste — a identificar durante o planejamento (grep por `useFirstAccessGuide(`)

### Backend

Não aplicável.

### Banco de Dados

Não aplicável.

## Critérios de Aceite

- A imagem do hero da Home aparece visivelmente mais viva em telas mobile e tablet, sem prejudicar a legibilidade do texto sobreposto
- Nenhum balão de guia de primeiro acesso aparece na demonstração pública, em nenhuma tela
- No sistema real, os balões de guia continuam funcionando normalmente (aparecem para usuários novos, respeitam a prioridade por módulo)
- Cada balão de guia oferece uma ação clara de avançar/confirmar ("Próximo"/"Entendi") e uma ação discreta de "Não ver mais guias"
- Acionar "Não ver mais guias" impede a exibição de qualquer guia dali em diante
- O guia identificado como "parecendo modal" passa a usar o mesmo padrão visual dos demais balões

## Perguntas Para o Planejamento

- Para o sistema de guias (item 3): evoluir o componente/contexto atuais incrementalmente (adicionar ações e estado de progresso sobre a base existente) ou substituir por um componente de tour sequencial novo? Recomendação: evolução incremental, por reaproveitar o coordinator de prioridade já validado e reduzir risco de regressão.
- Qual guia específico hoje aparece com aparência de modal bloqueante? Precisa ser localizado por grep/inspeção visual no início do planejamento.
- A ação "Não ver mais guias" deve ser global (silencia todo o sistema de uma vez) ou por grupo/módulo de guias?
- Existe uma lista fixa e conhecida de "quantos guias existem no total" para exibir "passo N de M", ou os guias são registrados dinamicamente conforme a tela é visitada (o que tornaria M variável/desconhecido de antemão)?
- Os valores de opacidade sugeridos (ex.: `opacity-70 sm:opacity-80`) devem ser validados visualmente com o usuário antes de fechar o plano, ou a IA tem liberdade para escolher valores durante a implementação, sujeitos a revisão?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `sistema financas/CLAUDE.md` (raiz do subprojeto) e `sistema financas/AGENT.md`; não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste subprojeto.
- Nota: o `AGENT.md` deste subprojeto descreve um contexto multi-tenant/multi-prefeitura genérico que não corresponde à realidade do projeto (confirmado em tasks anteriores desta mesma sessão — isolamento real é por `usuario_id`/conta, não por tenant). Ignorar as seções de multi-tenant/RLS desse arquivo ao planejar esta task.
- Esta task cobre 3 itens relacionados mas distintos em risco e complexidade (ajuste de opacidade é trivial; ocultar guias na demo é pequeno; redesenho de navegação dos guias é o item mais substancial). Avaliar no planejamento se faz sentido um único plano com etapas claramente separadas, ou dividir em plans menores — decisão a apresentar ao usuário na etapa de planejamento, não a assumir aqui.
- Resolver a pergunta sobre qual guia parece modal antes de finalizar o plano (inspeção de código/grep).
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não deveria ser necessário para esta task).
- Gere o(s) plano(s) em `.plans/` (padrão de pasta já usado neste subprojeto) com etapas pequenas, revisáveis e seguras.
