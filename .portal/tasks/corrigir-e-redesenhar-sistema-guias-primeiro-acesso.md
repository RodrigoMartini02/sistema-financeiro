# Task: Corrigir e redesenhar sistema de guias de primeiro acesso (balões de onboarding)

## Contexto

O projeto `sistema financas` possui um sistema de "guias de primeiro acesso" — balões/cards informativos que explicam funcionalidades para novos usuários — construído sobre três peças, sem nenhum Context/Provider central coordenando-as:

- `sistema financas/src/hooks/useFirstAccessGuide.ts` (linhas 41-58): hook que recebe um `scope` (string, ex.: `'cartoes:limite-v1'`) e retorna `{ isVisible, dismiss }`. Persiste em `localStorage` (chave `fingerence:first-access-guide:<perfilAtivoId>:<scope>`) se a guia já foi dispensada. Cada chamada é avaliada de forma **totalmente independente** — não há lógica de ordem, prioridade, fila ou exclusão mútua entre guias.
- `sistema financas/src/components/FirstAccessGuideCard.tsx` (linhas 33-77): componente apresentacional puro. Não define peso de fonte (`font-bold`/`font-semibold`) nem faz posicionamento próprio (sem portal, sem cálculo de colisão com viewport) — todo o `className` de posicionamento (`absolute`/`fixed`, `top-full`/`bottom-full`, `left-0`/`right-0`, `z-50`, `w-[min(...,calc(100vw-2rem))]`) é decidido individualmente em cada um dos ~60 call sites, copiado/colado.
- `sistema financas/src/components/firstAccessGuideMessages.ts`: 60+ mensagens em texto puro, sem marcação de negrito.

Existem **53 usos de `useFirstAccessGuide`** espalhados em 20 arquivos de tela (`sistema financas/src/screens/**`), cobrindo praticamente todos os módulos do sistema (painel, receitas, despesas, reservas, relatórios, meses, planos, categorias, cartões, perfis, usuários, clientes, representantes, sócios, serviços, minha conta).

Dois planos anteriores já tentaram endereçar partes deste problema:

- `.plans/guias-primeiro-acesso-cobertura-completa.md` (2026-08-04): expandiu a cobertura de guias para quase todas as telas. Reconhece explicitamente o risco de "fadiga de guia" (múltiplas guias aparecendo ao mesmo tempo), mas declara esse risco **fora de escopo**, deixando como observação para melhoria futura. Pela lista de scopes hoje presentes no código, este plano parece ter sido implementado.
- `.plans/correcao-posicionamento-baloes-guia.md` (2026-08-04, mesmo dia): diagnosticou com precisão os mesmos bugs de posicionamento e negrito que motivam esta nova task — mas a investigação atual confirmou que **pelo menos dois dos casos nominalmente citados pelo próprio plano como alvo de correção continuam presentes no código exatamente como estavam no diagnóstico**, indicando implementação incompleta. Esse plano também declara fora de escopo, desde o início, reescrever o componente para usar portal/engine de colisão com viewport — ou seja, mesmo 100% implementado, ele não resolveria estruturalmente o problema de overflow/z-index, apenas por ajustes pontuais de CSS caso a caso.

## Problema

O usuário relatou, usando o sistema em produção, quatro problemas visuais/funcionais e um problema de experiência:

### 1. Inconsistência de negrito
Alguns balões aparecem com texto em negrito, outros não. Causa técnica confirmada: o componente base (`FirstAccessGuideCard.tsx`) não define peso de fonte algum — o texto herda o peso do elemento pai mais próximo que o definir. Caso concreto confirmado: em `sistema financas/src/screens/despesas/DespesasScreen.tsx:589-608`, o balão do scope `despesas:lote-v1` é renderizado dentro de um `<th>` de tabela (`<th className="relative px-3 py-2.5 text-center">`), que tem `font-weight: bold` por padrão do navegador e é reforçado por `font-bold` explícito nas `<th>` vizinhas (linha 609+). Não há nenhum `font-normal` no card para neutralizar essa herança — é exatamente a lacuna que o plano anterior identificou como "reforço defensivo necessário" e que não foi aplicada.

### 2. Balões sobrepostos por outros elementos ("por baixo de dados do front")
Causa técnica: o projeto não tem uma escala de z-index centralizada — valores hardcoded e espalhados (`z-30`, `z-40`, `z-50`, `z-[9998]`, `z-[9999]`, `z-[100]`) sem tokens/constantes. A esmagadora maioria dos balões usa `z-50` fixo, o mesmo valor usado por dropdowns internos de modais (ex.: `sistema financas/src/ui/CategoryCombobox.tsx:99`) e outros elementos de UI. Quando um balão está dentro de um `Dialog` (que tem seu próprio contexto de empilhamento: overlay `z-50`, conteúdo `z-10` relativo, em `sistema financas/src/ui/dialog.tsx:27,33`), ele compete em pé de igualdade com outros elementos `z-50` do mesmo modal — o que fica visualmente por cima é decidido por ordem do DOM/stacking context, não por design.

### 3. Balões brigando pelo mesmo espaço (sobreposição entre si)
Causa técnica confirmada: não existe nenhuma exclusão mútua ou fila entre guias. Cada `useFirstAccessGuide` é avaliado isoladamente. Exemplos concretos onde múltiplas guias podem estar visíveis ao mesmo tempo, sem qualquer coordenação:
- `sistema financas/src/screens/despesas/DespesasScreen.tsx:363-386`: guias de `despesas:fechar-mes-v1` e `despesas:novo-v1` no mesmo header.
- `sistema financas/src/screens/finance/FinanceDashboard.tsx:55-56,207-217,263-273`: `painel:mes-v1` e `painel:comprometimento-v1` podem coexistir na mesma tela.
- `sistema financas/src/screens/config/ClienteDetail.tsx`: concentra sozinho 7 scopes diferentes (`clientes:reajuste-v1`, `clientes:representante-v1`, `clientes:servicos-vinculo-v1`, `clientes:implantacao-v1`, `clientes:horas-v1`, `clientes:encerrar-contrato-v1`, `clientes:gerar-previstas-v1`) — cenário mais extremo, todos podem aparecer juntos na primeira visita a um contrato.

### 4. Balões fora da área da tela
Dois bugs concretos e confirmados no código atual:
- **Corte por overflow**: em `DespesasScreen.tsx:589-608`, o balão `absolute` de `despesas:lote-v1` está dentro de um `<th>` cujo ancestral é `<div className="overflow-x-auto">` (linha 571) envolvendo uma tabela `table-fixed` com muitas colunas — em telas menores, o balão é cortado horizontalmente.
- **Wrapper `relative` ausente**: em `sistema financas/src/screens/finance/FinanceDashboard.tsx:197-218`, o `FirstAccessGuideCard` do scope `painel:mes-v1` (`className="absolute right-0 top-full ..."`) está fora da `<div className="relative">` que envolve o `MonthSelector` — ele é irmão dessa div, dentro de um container pai sem `relative`. Um `absolute` sem ancestral posicionado correto se posiciona relativo ao próximo ancestral posicionado mais acima na árvore, "escapando" do local esperado.
- Adicionalmente, o posicionamento é 100% estático via CSS (`right-0`/`left-0`/`top-full`), sem nenhuma lógica de flip/collision detection: botões-gatilho próximos da borda da viewport (comum em mobile, ou em telas com o sidebar fixo de `16rem` do `AppShell.tsx:427`) produzem balões que extrapolam a tela, porque a largura é "clampada" (`w-[min(XXrem,calc(100vw-2rem))]`) mas a posição/origem não é recalculada.

### 5. Ausência de ordem cronológica / trilha guiada de uso
O usuário descreveu o comportamento esperado nos moldes de onboarding self-service de produtos SaaS tradicionais: se o usuário vai cadastrar uma despesa mas ainda não tem nenhum cartão cadastrado, o sistema deveria guiá-lo primeiro a cadastrar um cartão, numa sequência lógica baseada no fluxo real de uso — não apresentar guias de forma desconexa, dependendo apenas de qual tela o usuário visita por acaso.

Causa técnica confirmada: a arquitetura atual não tem qualquer conceito de sequência, dependência ou prioridade entre guias. Cada scope aparece "se a tela for visitada e a guia nunca foi dispensada", sem relação nenhuma com outros scopes. Nada liga, por exemplo, `despesas:novo-v1` a `cartoes:novo-v1`. Essa lacuna nunca foi endereçada em nenhum dos dois planos anteriores — o plano de cobertura reconhece o problema geral de "fadiga de guia" mas declara fora de escopo.

## Objetivo

Corrigir os defeitos visuais/estruturais do sistema de guias atual (negrito, z-index, sobreposição, overflow) e evoluir a experiência para uma trilha de onboarding sequencial e priorizada, no estilo self-service tradicional: guiar o usuário através dos passos essenciais na ordem que faz sentido para o fluxo do produto (ex.: cadastrar cartão antes de cadastrar uma despesa que dependa de cartão), evitando bombardeio simultâneo de múltiplos balões.

## Decisão Técnica Desejada

- Definir uma escala de z-index centralizada (tokens/constantes reutilizáveis) que garanta que balões de guia tenham uma camada consistente e previsível em relação a modais, dropdowns, headers fixos e drawers — eliminando empates de `z-50` hoje espalhados sem hierarquia.
- Reforçar o componente base `FirstAccessGuideCard` com `font-normal` (ou equivalente) explícito, para que o peso do texto nunca dependa de herança do contexto onde é renderizado.
- Corrigir os dois bugs de posicionamento concretos identificados (overflow em `DespesasScreen.tsx`, wrapper `relative` ausente em `FinanceDashboard.tsx`) e varrer os demais ~50 call sites em busca do mesmo padrão de erro (ausência de ancestral `relative` correto, ou presença dentro de containers com `overflow-hidden`/`overflow-x-auto`).
- Avaliar se o posicionamento estático via CSS deve ser substituído por uma abordagem mais robusta com detecção de colisão com viewport (ex.: uma biblioteca de positioning como Floating UI, ou uma lógica própria simplificada), dado que ajustes pontuais de CSS já se mostraram insuficientes em uma tentativa anterior — esta decisão específica deve ser confirmada durante o planejamento, junto ao usuário, pesando esforço vs. benefício.
- Introduzir um mecanismo central de coordenação entre guias (fila/prioridade/exclusão mútua), possivelmente via um Context/Provider novo, que garanta no máximo uma guia visível por vez (ou por região da tela) e que suporte a ideia de trilha sequencial.
- Desenhar uma trilha de onboarding com ordem de prioridade entre os passos essenciais (ex.: cadastro de cartão antes de cadastro de despesa que referencie cartão), similar a onboarding self-service — os passos específicos a priorizar e como o sistema deve identificar/redirecionar o usuário devem ser detalhados durante o planejamento, com validação do usuário.

## Escopo Funcional

### Dentro do escopo

- Correção da inconsistência de negrito no componente base de guia.
- Definição e aplicação de uma escala de z-index consistente para os balões de guia frente a modais, dropdowns e outros elementos de UI.
- Correção dos bugs concretos de posicionamento (overflow cortando balão, wrapper `relative` ausente) já identificados, e varredura dos demais call sites em busca do mesmo padrão.
- Mecanismo de coordenação entre guias para evitar exibição simultânea de múltiplos balões na mesma tela/região.
- Desenho de uma ordem/prioridade lógica entre os passos de onboarding mais críticos (a começar pelo exemplo citado: cartão antes de despesa), sem necessariamente cobrir os 53 scopes existentes na primeira entrega.

### Fora do escopo inicial

- Reescrever todos os 53 usos de `useFirstAccessGuide` na mesma entrega — priorizar os fluxos mais críticos primeiro (a definir no planejamento).
- Adicionar novos scopes/guias de conteúdo que ainda não existem (isso já foi tratado pelo plano de cobertura anterior).
- Redesenho visual completo do card (cores, ícones, animações) além do necessário para resolver os problemas relatados.
- Sistema de analytics/telemetria sobre uso das guias.
- Testes E2E automatizados abrangentes, salvo se o planejamento identificar que são estritamente necessários para validar a trilha sequencial.

## Requisitos de Frontend

- Ajustar `sistema financas/src/components/FirstAccessGuideCard.tsx` para aplicar peso de fonte explícito e consistente.
- Ajustar/criar uma escala de z-index (arquivo de constantes ou tokens Tailwind) e aplicá-la nos ~60 call sites de balões, além dos elementos concorrentes relevantes (`sistema financas/src/ui/dialog.tsx`, `sistema financas/src/layout/AppShell.tsx`).
- Corrigir posicionamento em `sistema financas/src/screens/despesas/DespesasScreen.tsx:589-608` e `sistema financas/src/screens/finance/FinanceDashboard.tsx:197-218`, e varrer os demais 18 arquivos de tela listados no contexto em busca do mesmo padrão de erro.
- Avaliar e, se aprovado no planejamento, implementar mecanismo central de coordenação entre guias — possivelmente novo Context/Provider (`sistema financas/src/context/` já contém outros contexts como `ConfirmContext`, seguir o mesmo padrão).
- Implementar lógica de priorização/trilha para o cenário citado como exemplo (cartão antes de despesa) e para outros fluxos que o planejamento identificar como críticos.
- Preservar o mecanismo de persistência por `localStorage` já existente (dismiss por perfil), a menos que o planejamento identifique necessidade de mudança.

## Requisitos de Backend

Sem impacto backend identificado inicialmente — este é um sistema inteiramente client-side (hook + localStorage). Caso o planejamento decida que a trilha de onboarding precisa de estado persistido no servidor (ex.: para funcionar entre dispositivos), isso deve ser tratado como decisão explícita e registrada separadamente.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Não aplicável — projeto solo-dev, sem multi-tenancy. Sem impacto de segurança identificado; o sistema de guias não lida com dados sensíveis.

## Requisitos de Migração ou Compatibilidade

- Preservar as chaves de `localStorage` já usadas (`fingerence:first-access-guide:<perfilAtivoId>:<scope>`), para que usuários que já dispensaram guias não voltem a vê-las após a correção.
- Qualquer novo mecanismo de coordenação/trilha não deve quebrar o comportamento de `dismiss()` já esperado pelos usuários atuais.

## Requisitos de Testes

### Frontend

- Não aplicável inicialmente (sem testes automatizados de frontend identificados no projeto para este fluxo); validar por meio de build/typecheck e, conforme instrução do usuário nesta sessão, sem exigência de teste manual em tela nesta task — a menos que o planejamento decida o contrário dado o caráter visual do problema.

### Backend

- Não aplicável.

### E2E

- Não aplicável inicialmente.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/hooks/useFirstAccessGuide.ts`
- `sistema financas/src/components/FirstAccessGuideCard.tsx`
- `sistema financas/src/components/firstAccessGuideMessages.ts`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx` (linhas 197-202, 363-386, 589-608)
- `sistema financas/src/screens/finance/FinanceDashboard.tsx` (linhas 55-56, 197-218, 263-273)
- `sistema financas/src/screens/config/ClienteDetail.tsx` (7 scopes concentrados)
- `sistema financas/src/screens/config/CartaoTab.tsx` (linhas 40-42, 171)
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`, `sistema financas/src/screens/finance/IncomeDialog.tsx`
- `sistema financas/src/screens/reservas/ReservasScreen.tsx`, `sistema financas/src/screens/reservas/ReservaDialog.tsx`
- `sistema financas/src/screens/relatorios/RelatoriosScreen.tsx`
- `sistema financas/src/screens/meses/MesesScreen.tsx`
- `sistema financas/src/screens/planos/PlanosScreen.tsx`
- `sistema financas/src/screens/config/CategoriasTab.tsx`, `PerfisTab.tsx`, `UsuariosTab.tsx`, `ClientesTab.tsx`, `RepresentantesTab.tsx`, `SociosTab.tsx`, `ServicosTab.tsx`, `MinhaContaTab.tsx`
- `sistema financas/src/ui/dialog.tsx` (referência de z-index)
- `sistema financas/src/layout/AppShell.tsx` (referência de z-index)
- Possivelmente novo arquivo de contexto, ex.: `sistema financas/src/context/FirstAccessGuideContext.tsx` (a definir no planejamento)
- Possivelmente novo arquivo de constantes de z-index, ex.: `sistema financas/src/ui/zIndex.ts` (a definir no planejamento)

### Backend

- Sem impacto backend identificado inicialmente.

### Banco de Dados

- Sem alteração de banco identificada inicialmente.

## Critérios de Aceite

- Todos os balões de guia usam peso de fonte consistente, independentemente do contexto/elemento pai onde são renderizados.
- Balões de guia não ficam visualmente cobertos por dropdowns, modais ou outros elementos de UI em nenhum fluxo testado.
- Nunca mais de uma guia (ou de uma região coordenada) fica visível simultaneamente na mesma tela, evitando sobreposição entre balões.
- Balões não são cortados por `overflow` nem escapam da viewport em nenhum dos casos identificados (e demais casos varridos durante a implementação).
- Existe uma trilha de prioridade implementada para pelo menos o cenário citado como exemplo (cartão antes de despesa), com lógica clara e documentada de como o sistema decide qual guia mostrar primeiro.
- Os dois bugs de posicionamento concretos citados nesta task (`DespesasScreen.tsx`, `FinanceDashboard.tsx`) estão corrigidos e verificáveis no código.
- Nenhuma migration é executada como parte desta task.

## Perguntas Para o Planejamento

- Qual deve ser a extensão da correção de z-index: uma escala nova aplicada só aos balões de guia, ou uma revisão mais ampla de todos os `z-*` do app (dialogs, dropdowns, drawers, headers)?
- O mecanismo de coordenação entre guias deve ser um Context/Provider novo, um hook mais sofisticado, ou outra abordagem? Deve permitir "uma guia por tela" ou "uma guia por região da tela" (já que hoje várias guias em áreas distintas da mesma tela podem fazer sentido coexistir)?
- Vale a pena adotar uma biblioteca de positioning (ex.: Floating UI) para resolver definitivamente o problema de colisão com viewport, dado que a correção manual via CSS já falhou parcialmente numa tentativa anterior? Isso adicionaria uma nova dependência ao projeto.
- Além do exemplo citado (cartão antes de despesa), quais outros pares/sequências de dependência entre guias o usuário considera prioritários para a trilha de onboarding?
- A trilha de onboarding deve incluir algum tipo de redirecionamento ativo (ex.: navegar automaticamente para a tela de Cartões) ou apenas priorizar/atrasar a exibição da guia até que o pré-requisito seja cumprido, sem forçar navegação?
- Dado que existem 53 scopes hoje, a correção de posicionamento/z-index deve cobrir todos de uma vez, ou a primeira entrega deve focar nos casos já identificados como quebrados e nas telas de maior uso, deixando uma varredura completa para uma segunda etapa?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` e `sistema financas/AGENT.md`. Nota: ambos descrevem um contexto genérico "sistema multi-prefeitura, multi-tenant + RLS" que não corresponde a este projeto pessoal solo-dev — desconsiderar as seções de isolamento entre tenants/RLS, manter as práticas gerais aplicáveis (nomes claros, não mascarar erros, seguir padrões existentes, preferir soluções simples e auditáveis).
- Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` separados neste projeto.
- Leia também os dois planos anteriores relacionados antes de planejar, para não repetir diagnóstico já feito e para entender por que a implementação anterior ficou incompleta: `.plans/guias-primeiro-acesso-cobertura-completa.md` e `.plans/correcao-posicionamento-baloes-guia.md`.
- Inspecione os arquivos citados antes de escrever o plano, especialmente os dois bugs de posicionamento concretos já localizados (`DespesasScreen.tsx:589-608` e `FinanceDashboard.tsx:197-218`), e faça uma varredura adicional dos demais call sites para identificar o mesmo padrão de erro antes de propor a correção.
- Classifique a implementação como `frontend`.
- Considere dividir o plano em fases (ex.: fase 1 = correções pontuais de negrito/z-index/overflow nos casos já identificados; fase 2 = mecanismo de coordenação entre guias; fase 3 = trilha de onboarding sequencial), dado o tamanho do escopo (53 usos espalhados em 20 arquivos) — perguntar ao usuário se prefere um plano único ou fases separadas antes de finalizar.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento (inclusive não decidir sozinho por uma biblioteca de positioning — isso deve ser uma decisão explícita do usuário, registrada como pergunta em aberto).
- Não execute migrations (não aplicável aqui, mas mantido por padrão do projeto).
- Gere um plano em `.plans/` (padrão deste projeto, conforme `CLAUDE.md`) com etapas pequenas, revisáveis e seguras.
