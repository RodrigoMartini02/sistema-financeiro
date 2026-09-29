# Task: Readequar guias de primeiro acesso órfãos após unificação de Movimentações

## Contexto

O sistema finanças possui um mecanismo de guias de uso self-service ("balões" de primeiro acesso/onboarding), implementado em `src/components/FirstAccessGuideCard.tsx`, com textos centralizados em `src/components/firstAccessGuideMessages.ts`, coordenação global de exibição em `src/context/FirstAccessGuideContext.tsx` e controle de dismissal por guia em `src/hooks/useFirstAccessGuide.ts`. O `FirstAccessGuideCard` é usado em ~49 pontos, em 20 arquivos de tela (Despesas, Receitas, Diálogos de lançamento, Dashboard, Relatórios, Planos, Meses, Reservas, abas de configuração).

O mecanismo de posicionamento em si (portal em `document.body` via `createPortal`, cálculo de coordenadas com `getBoundingClientRect`, escala de z-index centralizada em `src/ui/zIndex.ts`) foi corrigido e está funcionando corretamente desde os commits `f4c649b`, `30ebc97` e `92354e6` (05/08/2026), que resolveram cortes de overflow/z-index que existiam antes. Essa parte não precisa de retrabalho estrutural.

Em 08/08/2026 (commit `c202001`, "centraliza movimentações financeiras mensais"), foi introduzida a tela `src/screens/finance/MovimentacoesScreen.tsx`, que passou a ser o único ponto de navegação em `App.tsx` para a seção "Movimentações". Essa tela renderiza internamente:

```tsx
{aba === 'receitas'
  ? <ReceitasScreen embedded toolbarStart={movementTabs} />
  : <DespesasScreen embedded toolbarStart={movementTabs} />}
```
(`MovimentacoesScreen.tsx:257-258`)

Como consequência, `src/screens/despesas/DespesasScreen.tsx` e `src/screens/receitas/ReceitasScreen.tsx` são hoje **sempre** montadas com `embedded=true`. Não existe mais nenhum caminho no app que as monte com `embedded=false`.

## Problema

O header original dessas duas telas está condicionado a `embedded`:

- `DespesasScreen.tsx:354` — `<div className={embedded ? 'hidden' : 'flex flex-col gap-3'}>`
- `ReceitasScreen.tsx:192` — `<div className={embedded ? 'hidden' : 'flex flex-col gap-3'}>`

Como `embedded` é sempre `true` na prática, esse bloco está permanentemente com `display:none`. Dentro dele existem 3 guias de primeiro acesso que ficaram órfãos e nunca são vistos pelo usuário:

- `despesas:novo-v1` — `DespesasScreen.tsx:384-392`, mensagem `firstAccessGuideMessages.despesasNova`, associado ao botão "Nova despesa" do header oculto.
- `despesas:fechar-mes-v1` — `DespesasScreen.tsx:370-378`, mensagem `firstAccessGuideMessages.despesasFecharMes`, associado ao botão "Fechar mês"/"Reabrir mês" do header oculto.
- `receitas:novo-v1` — `ReceitasScreen.tsx` (mesmo padrão), mensagem `firstAccessGuideMessages.receitasNova`, associado ao botão "Nova receita" do header oculto.

Os botões equivalentes que o usuário efetivamente vê e usa hoje estão em `MovimentacoesScreen.tsx:194-218` ("Nova receita", "Nova despesa", "Fechar mês"/"Reabrir mês") e **não têm nenhum `FirstAccessGuideCard` associado** (confirmado: zero ocorrências de `FirstAccessGuideCard` em `MovimentacoesScreen.tsx`).

Efeito colateral potencialmente mais sério: os hooks `useFirstAccessGuide('despesas:novo-v1')`, `useFirstAccessGuide('despesas:fechar-mes-v1')` e `useFirstAccessGuide('receitas:novo-v1')` continuam sendo chamados nas telas ocultas, e o `register(scope)` do `FirstAccessGuideContext` acontece em `useEffect`, independentemente do JSX estar visível ou não. Como o contexto permite apenas **um guia visível por vez**, escolhido por prioridade de módulo (`MODULE_PRIORITY` em `FirstAccessGuideContext.tsx`, onde Despesas/Receitas são prioridade 3), esses 3 scopes fantasmas continuam disputando o slot único e podem estar suprimindo guias legítimos e visíveis de módulos com prioridade numérica maior (nível 4/5: painel do jogador — não, painel financeiro, meses, planos, relatórios) sem que o usuário jamais os veja, mesmo em telas onde a UI está tecnicamente correta.

Isso não é um bug de CSS/posicionamento (essa parte já foi corrigida em agosto) — é uma regressão de escopo introduzida pela feature de unificação de Movimentações, que "esqueceu" de levar os guias junto para o novo lugar onde os botões passaram a viver.

## Objetivo

Restaurar a visibilidade e utilidade dos guias de primeiro acesso relacionados a "Nova despesa", "Fechar mês" e "Nova receita", e eliminar a supressão silenciosa de outros guias causada pelo registro contínuo de scopes que nunca são exibidos. Aproveitar a revisão para confirmar visualmente que os demais ~46 usos de `FirstAccessGuideCard` no restante do sistema continuam se comportando corretamente após as correções de agosto.

## Decisão Técnica Desejada

A decisão entre as duas opções abaixo deve ser avaliada durante o planejamento, com preferência inicial pela opção (a) por preservar a orientação já escrita para o usuário sem perda de conteúdo:

- (a) Mover os 3 guias órfãos para os botões equivalentes em `MovimentacoesScreen.tsx` (que já existem visualmente, só não têm guia associado), reaproveitando as mensagens já existentes em `firstAccessGuideMessages.ts`.
- (b) Se, durante o planejamento, ficar claro que esses guias perderam sentido no novo fluxo unificado (ex: mensagem descreve um contexto que não existe mais em "Movimentações"), removê-los por completo — o que inclui remover a chamada do hook `useFirstAccessGuide` correspondente nas telas antigas, não apenas ocultar o JSX, para que o scope pare de ser registrado no `FirstAccessGuideContext`.

Em ambos os casos, garantir que nenhum scope continue sendo registrado no contexto global sem jamais ser exibido.

## Escopo Funcional

### Dentro do escopo

- Diagnosticar e corrigir os 3 guias órfãos (`despesas:novo-v1`, `despesas:fechar-mes-v1`, `receitas:novo-v1`).
- Garantir que nenhum guia continue "registrado" no `FirstAccessGuideContext` sem ter chance real de ser exibido ao usuário.
- Validar visualmente (rodando o app localmente) que os guias de prioridade 4/5 (painel financeiro, meses, planos, relatórios) aparecem normalmente após a correção, confirmando ou descartando a hipótese de supressão silenciosa.
- Validar visualmente os demais ~46 usos de `FirstAccessGuideCard` nas telas não afetadas por este bug (Diálogos de lançamento, Dashboard, Relatórios, Planos, Meses, Reservas, abas de configuração), já que essa validação visual completa ainda não foi feita após as correções de agosto.

### Fora do escopo inicial

- Retrabalho do mecanismo de posicionamento/portal/z-index do `FirstAccessGuideCard` — já está correto, não deve ser alterado estruturalmente.
- Redesign visual dos balões (cores, ícones, textos) fora do necessário para religar os 3 guias órfãos.
- Limpeza das `className`s vestigiais de posicionamento (absolute/top-full/z-[45]/mt-3) passadas para `FirstAccessGuideCard` em modo `floating`, que hoje são ignoradas pelo componente exceto para extração de largura via regex — mencionar como dívida técnica identificada, mas não obrigatório corrigir nesta task.
- Padronizar o `zIndex: 9000` inline de `FirstAccessGuideCard.tsx:102` para usar a constante `Z_GUIDE` de `src/ui/zIndex.ts` — mencionar como dívida técnica, opcional.
- Remover a prop `allowOverflow` de `Card` em `DespesasScreen`/`ReceitasScreen`/`MesesScreen` — pode ainda ser necessária para outros elementos (dropdowns/menus); não mexer sem investigação própria.
- Revisão dos `title="..."` nativos do HTML usados como micro-dica de acessibilidade em botões de ícone (ex: "Anexar comprovante") — é um problema de UX/acessibilidade separado do sistema de guias, não entra nesta task.

## Requisitos de Frontend

- Em `DespesasScreen.tsx` e `ReceitasScreen.tsx`: decidir e implementar o destino dos 3 guias órfãos conforme a Decisão Técnica acima. Se optar por mover, os novos pontos de ancoragem ficam em `MovimentacoesScreen.tsx:194-218`.
- Garantir que a chamada de `useFirstAccessGuide` para cada scope só exista no componente que efetivamente pode exibir o guia — não deixar hooks "residentes" em componentes cujo JSX está permanentemente oculto.
- Preservar o comportamento de dismissal já persistido em `localStorage` (chave no formato `fingerence:first-access-guide:<perfil>:<scope>`) — usuários que já dispensaram esses guias não devem tê-los reaparecendo por engano ao migrar o ponto de renderização, a menos que se decida trocar o nome do scope propositalmente.
- Sem impacto em `src/ui/dialog.tsx`, `src/ui/card.tsx` ou no mecanismo de portal do `FirstAccessGuideCard.tsx` — nenhuma mudança estrutural esperada nesses arquivos.

## Requisitos de Backend

Sem impacto backend identificado inicialmente. O sistema de guias é inteiramente client-side (estado em `localStorage` e contexto React).

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Sem impacto de segurança ou isolamento de dados identificado — mudança restrita à camada de apresentação de guias de uso (UI), sem leitura/escrita de dados de negócio. Não é necessário considerar isolamento multi-tenant nesta task, já que o sistema de guias não manipula dados de domínio, apenas texto estático e estado de dismissal local ao navegador do usuário.

## Requisitos de Migração ou Compatibilidade

- Se um scope for renomeado (ex: de `despesas:novo-v1` para um novo nome ligado a `MovimentacoesScreen`), usuários que já dispensaram o guia antigo verão o "novo" guia reaparecer uma vez, já que a chave de dismissal no `localStorage` é por nome de scope. Avaliar durante o planejamento se isso é aceitável ou se o scope deve manter o mesmo nome para preservar o estado de dismissal.
- Não deve haver impacto em dados persistidos no backend/banco.

## Requisitos de Testes

### Frontend

- Testar manualmente (navegador local, `npm run dev` na porta 5173) que os 3 guias religados aparecem corretamente nos botões de `MovimentacoesScreen.tsx` para um usuário que nunca os dispensou.
- Testar que, após dispensar um guia, ele não reaparece ao navegar entre abas/telas.
- Testar que os guias de prioridade 4/5 (painel financeiro, meses, planos, relatórios) aparecem normalmente, confirmando que não há mais supressão por scopes fantasmas.
- Validação visual manual dos ~46 outros usos de `FirstAccessGuideCard` não cobertos pelo bug, navegando pelas telas: Diálogos de lançamento (Income/Reserva/BatchPayment), Dashboard, Relatórios, Planos, Meses, Reservas, abas de configuração (Cartão, Categorias, Cliente, Clientes, Minha Conta, Perfis, Representantes, Serviços, Sócios, Usuários).

### Backend

Não aplicável — sem impacto backend.

### E2E

Não aplicável inicialmente — mudança é pequena e concentrada em poucos componentes de UI; validação manual no navegador é suficiente.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/despesas/DespesasScreen.tsx` (linhas 354-399, guias `despesas:novo-v1` e `despesas:fechar-mes-v1`)
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx` (linha 192 e guia `receitas:novo-v1`)
- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx` (linhas 194-218, pontos onde os guias precisam ser religados, se optar pela opção (a))
- `sistema financas/src/components/FirstAccessGuideCard.tsx` (referência, sem mudança estrutural esperada)
- `sistema financas/src/components/firstAccessGuideMessages.ts` (reaproveitar mensagens existentes; só editar se o texto precisar refletir o novo contexto de "Movimentações")
- `sistema financas/src/context/FirstAccessGuideContext.tsx` (referência para entender `MODULE_PRIORITY` e o mecanismo de registro; sem mudança estrutural esperada, a menos que a correção do registro fantasma exija ajuste aqui)
- `sistema financas/src/hooks/useFirstAccessGuide.ts` (referência)

### Backend

Sem impacto backend identificado inicialmente.

### Banco de Dados

Sem alteração de banco identificada inicialmente.

## Critérios de Aceite

- Os guias "Nova despesa", "Fechar mês" e "Nova receita" são visíveis para um usuário que ainda não os dispensou, ancorados nos botões reais que ele usa hoje em "Movimentações".
- Nenhum scope de guia é registrado no `FirstAccessGuideContext` sem ter uma chance real de ser exibido na tela.
- Guias de outros módulos (painel financeiro, meses, planos, relatórios) continuam aparecendo normalmente, sem supressão por scopes órfãos.
- Usuários que já haviam dispensado os guias antigos não veem uma reaparição indesejada (ou, se houver reaparição por causa de renomeação de scope, isso foi uma decisão consciente registrada no plano, não um acidente).
- Nenhuma mudança estrutural no mecanismo de portal/posicionamento/z-index do `FirstAccessGuideCard`.
- Os demais ~46 usos de `FirstAccessGuideCard` foram validados visualmente e continuam funcionando corretamente.
- Nomenclatura nova de código (se houver scope/prop novos) segue inglês.

## Perguntas Para o Planejamento

- Os 3 guias órfãos devem ser movidos para `MovimentacoesScreen.tsx` mantendo o mesmo nome de scope (preservando dismissals antigos) ou faz sentido renomear porque o contexto mudou (de tela dedicada para tela unificada com abas)?
- O texto das mensagens (`despesasNova`, `despesasFecharMes`, `receitasNova`) precisa ser ajustado para refletir a navegação por abas de `MovimentacoesScreen`, ou o texto atual já serve sem alteração?
- Existe algum motivo para os headers antigos (`embedded ? 'hidden' : ...`) ainda existirem no código, ou esse bloco morto inteiro (não só os guias) deveria ser removido como dívida técnica à parte?
- Há outros scopes de guia declarados no código que também não têm mais nenhum JSX correspondente renderizado (o agente de investigação citou `despesas:filtros-v1`, `despesas:pagar-selecionadas-v1`, `despesas:mover-mes-v1`, `despesas:lote-v1` como possivelmente não confirmados em uso — vale conferir durante o planejamento)?
- Ao confirmar supressão de guias de prioridade maior, qual é o comportamento esperado: se dois guias "empatam" em elegibilidade, o de maior prioridade numérica sempre vence, ou existe alguma ordem adicional (ex: ordem de registro) que precise ser considerada na correção?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz do workspace) e `sistema financas/AGENT.md`.
- Inspecione os arquivos citados antes de escrever o plano, especialmente `DespesasScreen.tsx`, `ReceitasScreen.tsx`, `MovimentacoesScreen.tsx`, `FirstAccessGuideContext.tsx` e `firstAccessGuideMessages.ts`, para confirmar linhas exatas antes de propor mudanças (o código pode ter mudado desde a investigação que gerou esta task).
- Classifique a implementação como `frontend`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não aplicável a esta task, mas mantendo a regra padrão).
- Gere um plano em `.plans/` (padrão deste workspace) com etapas pequenas, revisáveis e seguras.
