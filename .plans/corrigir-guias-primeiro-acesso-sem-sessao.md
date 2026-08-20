# Plano de Implementação: Corrigir sistema de guias de primeiro acesso (onboarding)

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, seguido de investigação read-only (leitura de código) do mecanismo de guias existente
- Data do planejamento: 2026-08-20
- Classificação: `frontend-only`

## Resumo

O usuário relatou que, ao cadastrar uma conta/CNPJ nova, nenhum guia de orientação apareceu — nem os balões pontuais em botões (ex: "Clique em Nova despesa para..."), nem o modal de checklist ("Vamos configurar seu sistema", que lista cadastros faltando como cartão/categoria/cliente). Esse é justamente o momento em que os guias deveriam aparecer com mais força.

Existem dois mecanismos de guia no frontend, ambos amarrados à mesma sessão frágil de "primeiro acesso":

1. **Balões pontuais** (`useFirstAccessGuide` + `FirstAccessGuideCard`, usados em 22 arquivos / 50 ocorrências) — cada balão tem um `scope` único e já tem dismiss persistente por usuário em `localStorage`, mas só fica elegível (`isVisible`) se `isFirstAccessGuidesSessionActive()` retornar `true`.
2. **Checklist modal** (`useOnboardingChecklist` + `OnboardingChecklistModal`) — já calcula corretamente quais recursos faltam (cartão, categoria, cliente, representante) a partir do estado real dos dados, e já tem dismiss persistente em `localStorage`, mas também só roda a query e fica visível se `isFirstAccessGuidesSessionActive()` for `true`.

`isFirstAccessGuidesSessionActive()` só retorna `true` dentro de uma janela gravada em `sessionStorage`, ativada em um único lugar do sistema: `LoginPage.tsx`, dentro de `handleRegister`. Como `sessionStorage` não sobrevive a fechar a aba/navegador, e nenhum outro fluxo (login normal, criar novo perfil/CNPJ, Google OAuth) reativa essa sessão, os guias ficam "cegos" na maioria das vezes. Além disso, `clearFirstAccessGuidesSession()` é chamada automaticamente dentro de `logout()`, que por sua vez roda sempre que qualquer requisição HTTP retorna 401 — apagando a sessão de guias precocemente mesmo dentro da janela "válida".

**Decisão confirmada com o usuário:** os guias não devem mais depender dessa janela de sessão temporal. Devem aparecer sempre que o usuário estiver na tela/contexto relevante e o recurso realmente estiver faltando (estado real dos dados) ou o balão pontual ainda não tiver sido visto — não baseado em "acabei de me cadastrar". O dismiss por item/usuário já existente em ambos os mecanismos (`localStorage`) é mantido, e é isso que evita o guia aparecer para sempre depois que o usuário já viu ou dispensou.

## Escopo

### Dentro do escopo

- Remover a dependência de `isFirstAccessGuidesSessionActive()`/`isFirstAccessActive` de `useFirstAccessGuide.ts`: `isVisible` passa a depender apenas de `enabled && !isDismissed && isActive(scope, layer)`
- Remover a mesma dependência de `useOnboardingChecklist.ts`: `canQuery`/`isVisible` passam a depender apenas de `enabled && !isDismissed`
- Preservar `getFirstAccessGuideUserScope()` (base das chaves de dismiss por usuário em ambos os hooks) — mover para um local não relacionado a sessão temporal
- Remover o código morto resultante: `src/services/firstAccessGuides.ts` (a parte de sessão: `FIRST_ACCESS_GUIDES_SESSION_KEY`, `startFirstAccessGuidesForUser`, `clearFirstAccessGuidesSession`, `isFirstAccessGuidesSessionActive`)
- Atualizar `LoginPage.tsx`: remover a chamada a `startFirstAccessGuidesForUser`/`clearFirstAccessGuidesSession` e o parâmetro `options.firstAccessGuides` de `saveSession`
- Atualizar `session.ts`: remover a chamada a `clearFirstAccessGuidesSession()` dentro de `logout()`

### Fora do escopo

- Qualquer bloqueio ou validação nova de formulário (ex: exigir cartão obrigatório) — não faz parte deste pedido
- Mudanças em `PerfisTab.tsx` — não são necessárias, pois o checklist já reage ao estado real dos dados (`perfilAtivoTipo`, queries de cartões/categorias/clientes) e vai aparecer naturalmente ao trocar para um perfil novo sem cadastros
- Mudanças no conteúdo/textos dos guias existentes (`firstAccessGuideMessages.ts`) — mantidos como estão
- Adicionar novos guias/scopes além dos já existentes
- Qualquer mudança no backend — mudança 100% frontend

## Leitura de contexto

- `/CLAUDE.md` e `/AGENT.md` (raiz do projeto "sistema financas") — regra de nunca codar sem aprovação
- `src/hooks/useFirstAccessGuide.ts` (lido integralmente)
- `src/hooks/useOnboardingChecklist.ts` (lido integralmente)
- `src/components/FirstAccessGuideCard.tsx` (lido integralmente — componente visual, sem mudança necessária)
- `src/components/OnboardingChecklistModal.tsx` (lido integralmente — componente visual, sem mudança necessária)
- `src/context/FirstAccessGuideContext.tsx` (lido integralmente — coordenador de prioridade entre guias, sem mudança necessária)
- `src/services/firstAccessGuides.ts` (lido integralmente)
- `src/screens/public/LoginPage.tsx` (lido: linhas 1-132 — `saveSession`, `handleLogin`, `handleRegister`, fluxo Google OAuth)
- `src/services/session.ts` (lido integralmente)
- `src/App.tsx` (lido: linhas 100-213 — onde `useOnboardingChecklist`/`FirstAccessGuideProvider`/`OnboardingChecklistModal` são montados; confirmado que `hasPlanAccess` não bloqueia indevidamente)
- Confirmado via grep: apenas 4 arquivos referenciam `firstAccessGuides`/`isFirstAccessGuidesSessionActive` no projeto (`useFirstAccessGuide.ts`, `useOnboardingChecklist.ts`, `LoginPage.tsx`, `session.ts`) — nenhuma referência adicional escondida
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados: não existem como arquivos separados neste projeto; só o `AGENT.md` da raiz, genérico e voltado a um contexto multi-tenant/prefeitura não totalmente aplicável aqui

## Impacto por área

### Frontend

- `src/hooks/useFirstAccessGuide.ts`: remover `isFirstAccessActive` (state + effect), simplificar `isVisible`
- `src/hooks/useOnboardingChecklist.ts`: remover `isFirstAccessActive` (state + effect), simplificar `canQuery`/`isVisible`
- `src/services/firstAccessGuides.ts`: remover as funções relacionadas a sessão temporal; manter (ou mover) `getFirstAccessGuideUserScope()`
- `src/screens/public/LoginPage.tsx`: simplificar `saveSession` (remove parâmetro `options`), ajustar chamadas em `handleLogin`/`handleRegister`/fluxo Google
- `src/services/session.ts`: `logout()` não chama mais `clearFirstAccessGuidesSession()`
- Sem mudança em query keys, schemas de dados ou contratos de API
- Sem mudança nos componentes visuais (`FirstAccessGuideCard`, `OnboardingChecklistModal`) nem no coordenador (`FirstAccessGuideContext`)

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/hooks/useFirstAccessGuide.ts`
- `src/hooks/useOnboardingChecklist.ts`
- `src/services/firstAccessGuides.ts` (simplificado — só a função de scope permanece, possivelmente movida)
- `src/screens/public/LoginPage.tsx`
- `src/services/session.ts`

## Estratégia de implementação

1. Em `useFirstAccessGuide.ts`: remover o state `isFirstAccessActive`, o `useEffect` que o sincroniza, e o import de `isFirstAccessGuidesSessionActive`; ajustar `isVisible` para `enabled && !isDismissed && isActive(scope, layer)`; ajustar o `useEffect` de registro para depender só de `isDismissed`/`enabled`
2. Em `useOnboardingChecklist.ts`: mesma remoção; `canQuery` passa a ser `enabled && !isDismissed`; `isVisible` retornado passa a ser `enabled && !isDismissed`
3. Decidir o destino de `getFirstAccessGuideUserScope()`: mover para dentro de um novo arquivo pequeno (ex: `src/services/userScope.ts`) ou para o topo de `useFirstAccessGuide.ts` como helper compartilhado — escolher o que exigir menos import cruzado, mantendo a mesma lógica (`user:{id}` a partir de `localStorage.dadosUsuarioLogado`/`usuarioAtual`)
4. Atualizar os imports em `useFirstAccessGuide.ts` e `useOnboardingChecklist.ts` para apontar para o novo local de `getFirstAccessGuideUserScope`
5. Deletar `src/services/firstAccessGuides.ts` (após mover a função de scope)
6. Em `LoginPage.tsx`: remover o import de `clearFirstAccessGuidesSession`/`startFirstAccessGuidesForUser`; simplificar `saveSession(token, usuario)` (sem `options`); ajustar as 3 chamadas (`handleLogin`, `handleRegister`, callback Google) para a nova assinatura
7. Em `session.ts`: remover o import e a chamada a `clearFirstAccessGuidesSession()` dentro de `logout()`
8. Rodar `npx tsc --noEmit` e `npx vite build`
9. Testar manualmente: logar em uma conta existente com cadastros incompletos (ex: sem cartão) e confirmar que o checklist modal aparece; navegar até uma tela com balão pontual (ex: Movimentações) e confirmar que ele aparece; dispensar um balão e um item do checklist, recarregar a página, e confirmar que ambos continuam ocultos (dismiss persistente funcionando)

## Regras de negócio identificadas

- Um guia (balão ou item de checklist) só deve ser exibido enquanto o recurso que ele descreve realmente estiver ausente e o usuário não o tiver dispensado — não há mais relação com "tempo desde o cadastro"
- O dismiss é definitivo por usuário/scope (ou por checklist inteiro), armazenado em `localStorage`, e sobrevive a reload/nova sessão de navegador

## Regras multi-tenant e segurança

Não aplicável — mudança isolada de lógica de exibição no frontend, sem impacto em dados, permissões ou chamadas de API sensíveis. O `getFirstAccessGuideUserScope()` já deriva o escopo do usuário logado localmente armazenado, sem introduzir nova superfície de acesso.

## Validações necessárias

Nenhuma validação de formulário nova — mudança de comportamento de exibição condicional.

## Testes necessários

### Frontend

- Login em conta existente com cartão/categoria/cliente já cadastrados: confirmar que o checklist não aparece (todos os itens `done`)
- Login em conta (nova ou existente) sem cartão cadastrado: confirmar que o checklist aparece com o item "Cadastrar um cartão" pendente
- Navegar até uma tela com balão pontual ainda não visto (ex: `despesas:novo-v1`): confirmar que o balão aparece
- Dispensar um balão pontual: confirmar que ele não aparece mais, mesmo após reload da página
- Dispensar o checklist inteiro: confirmar que ele não aparece mais, mesmo após reload
- Cadastrar o recurso faltante (ex: criar um cartão): confirmar que o item correspondente do checklist passa a `done`
- Confirmar que logout/login novamente não reativa guias já dispensados
- Confirmar que múltiplos guias elegíveis na mesma tela continuam respeitando a prioridade do coordenador (`FirstAccessGuideContext`), exibindo só um por vez

### Backend

Sem impacto esperado.

### E2E

Não aplicável inicialmente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Usuários com contas antigas que nunca cadastraram cartão/categoria/cliente (por escolha, não por serem novos) voltarão a ver o checklist modal até dispensarem manualmente — comportamento esperado pela mudança pedida, mas é uma mudança de UX perceptível para contas existentes
- Verificar se a remoção do parâmetro `options` de `saveSession` não quebra nenhuma chamada esquecida
- Baixo risco técnico geral — mudança de poucos arquivos, sem tocar em contratos de API, schema ou lógica de negócio de domínio

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões de escopo já confirmadas com o usuário.

## Critérios de aceite do plano

- Balões pontuais e o checklist modal aparecem sempre que o usuário estiver no contexto relevante e o item/recurso realmente estiver pendente, independente de quando a conta foi criada
- Dispensar um guia (balão ou item de checklist) continua ocultando-o permanentemente para aquele usuário
- Código relacionado à sessão temporal de "primeiro acesso" é removido sem deixar código morto
- `npx tsc --noEmit` e `npx vite build` passam sem erros
- Nenhuma outra funcionalidade é afetada

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Este plano substitui e invalida o escopo do plano anterior `.plans/onboarding-e-bloqueio-cartao-obrigatorio.md` (removido) — não implementar nenhum bloqueio/validação de cartão obrigatório
- Manter a mudança pequena e focada: remoção de um gate condicional, sem introduzir nova arquitetura
- Ao finalizar localmente, perguntar ao usuário se deseja seguir para `/finalizar`
