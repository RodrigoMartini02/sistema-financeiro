# Plano de Implementação: Opacidade do hero, ocultar guias na demonstração e redesenhar navegação dos guias de primeiro acesso

## Origem

- Arquivo de especificação: `.portal/tasks/ajustar-hero-e-sistema-de-guias.md`
- Data do planejamento: 2026-09-02
- Classificação: `frontend-only`

## Resumo

Três blocos de trabalho relacionados a apresentação pública e onboarding do `sistema financas`:

1. A imagem de destaque do hero da Home (`home-hero-bg.png`) fica visivelmente esmaecida em telas menores que `lg` (opacidade 45%/55% vs. 90% em desktop) — ajustar para ficar mais viva, validando visualmente durante a implementação.
2. A demonstração pública (iframe rodando o app real em modo demo) exibe os balões de guia de primeiro acesso como se o visitante fosse um usuário novo do sistema real — devem ser completamente ocultados nesse modo.
3. O sistema de guias de primeiro acesso (`FirstAccessGuideCard`) não tem ações estruturadas de avanço ("Próximo"/"Entendi") nem um jeito de desativar todos os guias de uma vez ("Não ver mais guias"); e o `OnboardingChecklistModal` — identificado nesta investigação como o "modal que parece trabalho" mencionado pelo usuário — é um modal de verdade com overlay escuro cobrindo a tela toda, destoando do padrão leve e não-bloqueante dos demais guias.

## Escopo

### Dentro do escopo

- Ajustar valores de opacidade (e gradiente, se necessário) do `HeroLogoDecor.tsx` nos breakpoints mobile/tablet, validando visualmente durante a implementação até ficar equilibrado (sem valor fixo pré-aprovado — decisão do usuário)
- Propagar um flag de modo demonstração até `useFirstAccessGuide` e `useOnboardingChecklist`, fazendo ambos retornarem sempre não-visível nesse modo
- Adicionar ao `FirstAccessGuideCard` ações estruturadas: um botão principal "Entendi"/"Próximo" (reaproveitando a interface `FirstAccessGuideAction` já declarada no arquivo, hoje não usada) e uma ação discreta "Não ver mais guias"
- Adicionar ao `FirstAccessGuideContext`/fluxo de guias uma flag global de silenciamento, persistida em `localStorage`, que desativa todos os ~50 guias do sistema de uma vez quando acionada
- Converter `OnboardingChecklistModal` de modal bloqueante (overlay `fixed inset-0` + backdrop escuro) para um card ancorado/fixo discreto, no mesmo espírito visual do `FirstAccessGuideCard`, sem bloquear a interação com o resto da tela

### Fora do escopo

- Mudança na imagem de fundo em si (`icons/home-hero-bg.png`)
- Mudança na lógica de negócio da demonstração ou dos dados exibidos nela
- Redesenho visual de outras seções da Home ou de outras páginas públicas
- Analytics/tracking de progresso de onboarding
- Tradução/i18n dos textos dos guias
- Silenciamento por módulo/tela (decisão fechada: o "não ver mais guias" é sempre global)
- Criar um tour sequencial novo com estado "passo N de M" (decisão fechada: evoluir o componente/coordinator existentes, não substituir por arquitetura nova)

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto)
- `sistema financas/AGENT.md` — descreve contexto multi-tenant/multi-prefeitura genérico que não corresponde à realidade deste projeto (confirmado em investigação anterior desta mesma sessão: isolamento real é por `usuario_id`/conta, sem `tenantId`). Ignorado para este plano.
- Não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste subprojeto.
- `.portal/tasks/ajustar-hero-e-sistema-de-guias.md` (especificação de entrada)
- `src/screens/public/components/HeroLogoDecor.tsx` (lido por completo)
- `src/screens/public/components/SitePageHero.tsx` (lido por completo — confirma que a Home usa este hero com `tone` padrão `'dark'`)
- `src/hooks/useFirstAccessGuide.ts` (lido por completo)
- `src/context/FirstAccessGuideContext.tsx` (lido por completo — coordinator de prioridade por módulo já validado)
- `src/components/FirstAccessGuideCard.tsx` (lido por completo)
- `src/components/firstAccessGuideMessages.ts` (lido — confirma que todos os ~50 guias existentes são frases curtas, sem candidato a "modal" entre eles)
- `src/components/OnboardingChecklistModal.tsx` e `src/hooks/useOnboardingChecklist.ts` (lidos por completo — identificados como o modal bloqueante mencionado pelo usuário)
- `src/App.tsx` (confirma montagem do `OnboardingChecklistModal`, condicionado a `isAppRoute && !!session.user && hasPlanAccess`, sem checagem de modo demo — mas não é montado em `demoMain.tsx`, então hoje já não aparece na demo)
- `src/demoMain.tsx` (lido por completo — confirma `AppShell isDemoMode`, sem qualquer propagação desse flag para os guias)
- Grep de todos os ~50 usos de `useFirstAccessGuide(` e `FirstAccessGuideCard` no projeto — confirmado que todos usam `floating`, nenhum uso não-floating (descartando um guia individual como candidato ao "modal")

## Impacto por área

### Frontend

**Componentes/hooks:**
- `src/screens/public/components/HeroLogoDecor.tsx`: ajustar classes de opacidade (`opacity-45 sm:opacity-55` → valores mais altos) e possivelmente o gradiente linear escuro sobreposto, validando visualmente nos 3 breakpoints
- `src/context/FirstAccessGuideContext.tsx`: adicionar um flag de modo demo ao `FirstAccessGuideProvider` (prop, ex. `isDemoMode`) e uma flag/estado de silenciamento global (`silenceAll`, persistido em `localStorage`), expostos via `useFirstAccessGuideCoordinator`
- `src/hooks/useFirstAccessGuide.ts`: consumir o novo estado do contexto — `isVisible` deve ser `false` quando `isDemoMode` ou quando o silenciamento global estiver ativo, antes de qualquer outra checagem
- `src/hooks/useOnboardingChecklist.ts`: mesma lógica — `isVisible` deve considerar modo demo (ainda que hoje o modal não seja montado na demo, a checagem deixa o comportamento explícito e à prova de futuras integrações) e o silenciamento global
- `src/components/FirstAccessGuideCard.tsx`: adicionar suporte à prop `actions` (usando a interface `FirstAccessGuideAction` já existente) e um link/botão discreto de "Não ver mais guias" que aciona o silenciamento global do contexto
- `src/components/OnboardingChecklistModal.tsx`: remover o overlay `fixed inset-0` + backdrop; reestruturar como card fixo/ancorado (ex.: canto inferior direito ou mesmo padrão de posicionamento do `FirstAccessGuideCard`), sem bloquear cliques no restante da tela
- `src/demoMain.tsx` / `src/App.tsx`: passar o flag de modo demo ao `FirstAccessGuideProvider` (em `demoMain.tsx` como `true`, em `App.tsx` implicitamente `false`)

**Query keys/estados:** sem alteração — nenhuma mudança de dado de servidor, apenas estado local/`localStorage` e apresentação

**Testes:** ver seção "Testes necessários"

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/public/components/HeroLogoDecor.tsx`
- `src/context/FirstAccessGuideContext.tsx`
- `src/hooks/useFirstAccessGuide.ts`
- `src/hooks/useOnboardingChecklist.ts`
- `src/components/FirstAccessGuideCard.tsx`
- `src/components/OnboardingChecklistModal.tsx`
- `src/demoMain.tsx`
- `src/App.tsx`

## Estratégia de implementação

1. **Hero (item 1):** ajustar `HeroLogoDecor.tsx` — subir os valores de opacidade em mobile/`sm` (ex.: começar por algo como `opacity-70 sm:opacity-80`, ajustando conforme necessário), revisar se o gradiente escuro sobreposto precisa de ajuste para manter a legibilidade do texto; validar visualmente nos três breakpoints antes de seguir
2. **Flag de modo demo nos guias (item 2):** adicionar prop `isDemoMode` ao `FirstAccessGuideProvider` (`FirstAccessGuideContext.tsx`), expor via contexto; ajustar `useFirstAccessGuide` e `useOnboardingChecklist` para retornar `isVisible: false` quando esse flag estiver ativo; propagar `isDemoMode={true}` a partir de `demoMain.tsx`
3. **Silenciamento global (parte do item 3):** adicionar ao mesmo contexto um estado de "silenciado globalmente", lido/escrito em `localStorage` (nova chave, ex. `fingerence:first-access-guide:silenced-all`), com uma função `silenceAll()` exposta pelo coordinator; `useFirstAccessGuide` e `useOnboardingChecklist` devem checar esse estado antes de qualquer outra lógica de visibilidade
4. **Ações no balão (parte do item 3):** estender `FirstAccessGuideCard` para aceitar e renderizar `actions` (botão "Entendi"/"Próximo", reaproveitando `FirstAccessGuideAction`) e um link discreto de "Não ver mais guias" que chama `silenceAll()`; manter o `onDismiss` (X) individual como está, para continuar permitindo dispensar um guia específico sem silenciar todos
5. **Onboarding não-bloqueante (parte do item 3):** reestruturar `OnboardingChecklistModal.tsx` removendo o overlay de bloqueio (`fixed inset-0` + backdrop), transformando-o num card fixo discreto (mesmo padrão visual/posicional dos balões de guia), preservando a lista de itens e o comportamento de navegação (`onGoToTarget`)
6. Rodar `npx tsc --noEmit -p .` e `npx vite build`
7. Testar visualmente: hero nos 3 breakpoints; abrir a demonstração pública e confirmar que nenhum guia (nem o onboarding) aparece; no app real, confirmar que os guias aparecem normalmente com as novas ações; testar "Não ver mais guias" e confirmar que nenhum guia aparece mais depois, inclusive após reload; confirmar que o onboarding não bloqueia mais a tela

## Regras de negócio identificadas

Nenhuma regra de negócio nova — mudança é de apresentação visual e de comportamento de UI local (sem dado de servidor envolvido).

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Não há dado sensível envolvido — as mudanças afetam apenas apresentação e preferências armazenadas em `localStorage` no navegador do próprio usuário.

## Validações necessárias

Nenhuma validação de input nova. Garantir que a nova prop `actions` do `FirstAccessGuideCard` seja opcional, para não quebrar nenhum dos ~50 usos existentes que não a fornecem.

## Testes necessários

### Frontend

- Hero da Home aparece visivelmente mais vivo em mobile e tablet, mantendo legibilidade do texto sobreposto
- Nenhum balão de guia nem o onboarding aparece na demonstração pública (`/demo.html`), em nenhuma tela navegável
- No app real, os guias continuam aparecendo normalmente, respeitando a prioridade por módulo já existente no coordinator
- Botão "Entendi"/"Próximo" funciona nos guias que o recebem
- "Não ver mais guias" desativa todos os guias imediatamente e a preferência persiste após reload (via `localStorage`)
- `OnboardingChecklistModal` não bloqueia mais cliques no restante da tela e mantém a navegação para os itens (`onGoToTarget`) funcionando

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- Propagar `isDemoMode` ao `FirstAccessGuideProvider` precisa ser cuidadoso para não afetar o comportamento do app real (`App.tsx`) — testar ambos os fluxos após a mudança
- A nova prop `actions` no `FirstAccessGuideCard` deve ser estritamente aditiva/opcional, dado o volume de usos existentes (~50), para não introduzir regressão visual em nenhum guia já implementado
- Migrar `OnboardingChecklistModal` de modal bloqueante para card discreto muda a expectativa de atenção do usuário — validar visualmente se o card ainda comunica bem a mensagem "Vamos configurar seu sistema" sem o reforço do overlay
- Ajuste de opacidade do hero é subjetivo — like o próprio usuário validar visualmente antes de considerar concluído

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões foram fechadas nesta rodada de planejamento:
- Onboarding modal → converter para o mesmo padrão leve dos guias
- Arquitetura dos guias → evoluir o componente/coordinator existentes
- Silenciamento → global, não por módulo
- Valores de opacidade → ajustar e validar visualmente durante a implementação, sem valor fixo pré-aprovado

## Critérios de aceite do plano

- Imagem do hero da Home aparece mais viva em mobile e tablet, validada visualmente, sem prejudicar a legibilidade do texto
- Nenhum guia de primeiro acesso (balão ou onboarding) aparece na demonstração pública
- No app real, os guias continuam funcionando normalmente
- Balões de guia oferecem ação de avançar/confirmar quando aplicável, e uma ação discreta de "Não ver mais guias"
- Acionar "Não ver mais guias" desativa todos os guias do sistema, de forma persistente
- `OnboardingChecklistModal` deixa de bloquear a tela, adotando o padrão visual leve dos demais guias
- `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Nenhuma mudança de dado ou lógica de negócio introduzida

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Seguir `sistema financas/CLAUDE.md`
- Implementar os 3 blocos em sequência clara (hero → flag de demo → ações/silenciamento/onboarding), permitindo checkpoints de validação intermediários
- Atenção especial à compatibilidade aditiva da prop `actions` no `FirstAccessGuideCard`, dado o volume de usos existentes
- Validar visualmente no navegador antes de considerar a tarefa concluída, já que é uma mudança de UI e UX
