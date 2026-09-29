# Task: Checklist de configuração inicial (onboarding sequencial) para novos usuários

## Contexto

O projeto `sistema financas` já possui um sistema de guias de primeiro acesso (`useFirstAccessGuide` + `FirstAccessGuideCard` + `firstAccessGuideMessages`, ver `sistema financas/src/hooks/useFirstAccessGuide.ts`, `sistema financas/src/components/FirstAccessGuideCard.tsx`), recém revisado em `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`: balões contextuais que aparecem ancorados a botões/campos específicos em cada tela, com um mecanismo central (`FirstAccessGuideContext`, `sistema financas/src/context/FirstAccessGuideContext.tsx`) que garante no máximo 1 balão visível por vez, priorizado por módulo (cadastros base → configuração da conta → lançamentos → visão consolidada → análise).

O fluxo de entrada no sistema hoje começa pela aba "Minha conta" (`ConfigScreen.tsx`, tab padrão `'conta'`), mas o dado ali (nome, e-mail, documento) normalmente já vem preenchido externamente (cadastro/contratação), então não é onde o usuário terá dúvidas reais.

O uso real do sistema, segundo o usuário, começa quando ele tenta cadastrar uma **despesa** ou **receita** — a ação principal do produto. É nesse momento que ele esbarra em pré-requisitos não óbvios (ex.: para lançar uma despesa parcelada no cartão, precisa existir ao menos um cartão cadastrado em `CartaoTab.tsx`) sem saber onde ir resolver isso, porque a navegação para "Cartões" fica em Configurações, uma área que ele não necessariamente associaria ao fluxo de lançar uma despesa.

## Problema

Os balões de guia contextuais (já existentes e recém corrigidos) explicam uma ação pontual quando o usuário já está na tela certa, mas não respondem a uma pergunta anterior e mais básica: "o que eu preciso ter configurado no sistema antes de começar a usar, e por quê?". Um usuário novo que vai direto para Despesas ou Receitas pode ficar bloqueado ou confuso sem saber que o pré-requisito (ex.: cadastrar um cartão) está em outra área do sistema, sem qualquer guia empurrando-o para lá.

Isso é uma lacuna diferente da já resolvida no plano anterior: não é sobre posicionamento/z-index/prioridade entre guias existentes, é sobre a ausência de uma visão geral e sequencial ("o que fazer primeiro, segundo, terceiro, e por quê") que produtos self-service tradicionalmente oferecem no primeiro contato com o sistema.

## Objetivo

Criar um checklist/guia de configuração inicial que apareça no primeiro acesso ao sistema, listando em ordem numérica os passos de configuração recomendados (ex.: "1. Cadastre um cartão — necessário para lançar despesas parceladas no cartão"), refletindo o progresso real do usuário (marcando cada item como concluído automaticamente conforme ele configura o que falta), e coexistindo com os balões contextuais já existentes — sem substituí-los.

## Decisão Técnica Desejada

- O checklist deve aparecer como uma janela/modal (ou painel) no primeiro acesso ao sistema, antes ou logo ao entrar na tela padrão inicial.
- Cada item do checklist deve ter: um rótulo curto da ação (ex.: "Cadastrar um cartão"), uma explicação do motivo/consequência (ex.: "necessário para lançar despesas parceladas no cartão"), e um estado de progresso (pendente/concluído) calculado a partir de dados reais do usuário — não uma marcação manual.
- A verificação de progresso deve reaproveitar os serviços de listagem já existentes no frontend (ex.: `fetchCartoes`, `fetchCategorias`, `fetchClientes`, em `sistema financas/src/services/configService.ts` e `sistema financas/src/services/clientesService.ts`) para checar se o usuário já tem ao menos 1 registro de cada tipo relevante, evitando criar endpoints novos quando os existentes já bastam.
- O checklist deve poder ser reaberto (não é obrigatório aparecer sozinho sempre) — a forma exata de reabertura (ex.: botão fixo, item de menu) deve ser decidida durante o planejamento.
- Deve coexistir com os balões de guia contextuais já existentes, sem duplicar ou remover nenhum deles.

## Escopo Funcional

### Dentro do escopo

- Um componente de checklist/modal de configuração inicial, exibido no primeiro acesso ao sistema.
- Itens do checklist cobrindo os pré-requisitos de configuração mais relevantes para o uso do sistema (a definir com precisão durante o planejamento, com base na investigação de quais cadastros são de fato pré-requisito para lançar despesas/receitas — ex.: cartão para despesas parceladas no cartão, categoria para lançamentos em geral, cliente para receitas vinculadas a contrato).
- Cálculo de progresso real por item, consultando os dados já cadastrados pelo usuário.
- Mecanismo de persistência de que o checklist já foi visto/dispensado (para não forçar reaparecimento a cada login), reaproveitando o padrão de persistência já usado pelo sistema de guias (`localStorage`, por perfil ativo).
- Uma forma de reabrir o checklist manualmente depois de dispensado.

### Fora do escopo inicial

- Redesenhar ou substituir os balões de guia contextuais já existentes e recém corrigidos.
- Bloquear ativamente o usuário de acessar Despesas/Receitas até que os pré-requisitos estejam completos — o checklist é informativo/norteador, não um gate de acesso (a menos que o planejamento, com validação do usuário, decida o contrário).
- Expandir o checklist para cobrir todos os módulos do sistema — foco nos pré-requisitos diretamente ligados a Despesas e Receitas, por serem o objetivo principal citado.
- Alterações de backend além de, se necessário, pequenos ajustes para expor contagem de registros de forma mais eficiente (a avaliar durante o planejamento; os endpoints de listagem já existentes podem ser suficientes).

## Requisitos de Frontend

- Novo componente de checklist/modal, exibido condicionalmente no primeiro acesso (local de montagem a definir — provavelmente próximo de onde hoje mora `FirstAccessGuideProvider`/`ConfirmProvider` em `sistema financas/src/App.tsx`, ou dentro do componente de layout `AppShell.tsx`).
- Lógica de verificação de progresso usando `useQuery` (React Query) sobre os serviços já existentes (`fetchCartoes`, `fetchCategorias`, `fetchClientes`), seguindo o padrão já usado no restante do projeto (loading/error/empty tratados).
- Navegação direta dos itens do checklist para a tela de configuração correspondente (ex.: clicar em "Cadastrar cartão" leva à aba Cartões em Configurações) — reaproveitar o mecanismo de navegação já existente entre `AppSection`/`ConfigTab` em `sistema financas/src/layout/AppShell.tsx` e `App.tsx`.
- Persistência de dispensa do checklist em `localStorage`, seguindo o padrão de `sistema financas/src/hooks/useFirstAccessGuide.ts` (chave por perfil ativo).

## Requisitos de Backend

Sem impacto backend identificado inicialmente — a verificação de progresso deve ser possível inteiramente a partir dos endpoints de listagem já existentes no frontend. Se durante o planejamento for identificado que algum endpoint de contagem dedicado traria ganho relevante de performance, isso deve ser registrado como decisão explícita, não assumido de antemão.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Não aplicável — projeto solo-dev sem multi-tenancy (conforme já registrado nas tasks/planos anteriores deste mesmo projeto). Sem dados sensíveis novos envolvidos.

## Requisitos de Migração ou Compatibilidade

- Não deve interferir no comportamento já existente dos balões de guia contextuais (`useFirstAccessGuide`, `FirstAccessGuideContext`) — ambos os mecanismos devem operar de forma independente e coexistente.
- Usuários que já usam o sistema há tempo (não são "novos") não devem ser incomodados por este checklist reaparecendo sem necessidade — a lógica de "primeiro acesso" deve considerar esse cenário (a forma exata de distinguir "novo" de "existente" deve ser decidida no planejamento: ex. checar se o usuário já tem qualquer lançamento, ou usar apenas o flag de dispensado em localStorage).

## Requisitos de Testes

### Frontend

- Não aplicável inicialmente (sem testes automatizados de frontend identificados no projeto para fluxos semelhantes); validar por build/typecheck.

### Backend

- Não aplicável.

### E2E

- Não aplicável.

## Arquivos Provavelmente Afetados

### Frontend

- Novo componente de checklist (nome e localização exata a definir no planejamento, ex.: `sistema financas/src/components/OnboardingChecklist.tsx`).
- `sistema financas/src/App.tsx` (montagem do checklist na árvore da aplicação).
- `sistema financas/src/layout/AppShell.tsx` (possível ponto de acesso para reabrir o checklist, e/ou navegação entre seções ao clicar em um item).
- `sistema financas/src/services/configService.ts`, `sistema financas/src/services/clientesService.ts` (reaproveitamento de `fetchCartoes`, `fetchCategorias`, `fetchClientes`).
- Possivelmente `sistema financas/src/hooks/` (novo hook de verificação de progresso, seguindo o padrão de `useFirstAccessGuide.ts`).

### Backend

- Sem impacto identificado inicialmente.

### Banco de Dados

- Sem impacto identificado inicialmente.

## Critérios de Aceite

- Um checklist de configuração inicial aparece no primeiro acesso ao sistema, com itens em ordem numérica.
- Cada item explica a ação e o motivo/consequência de forma direta (ex.: "Cadastre um cartão — necessário para despesas parceladas no cartão").
- O progresso de cada item reflete dados reais do usuário (ex.: item "cartão" aparece concluído assim que existe ao menos 1 cartão cadastrado), sem exigir marcação manual.
- O checklist pode ser dispensado e reaberto posteriormente.
- Usuários que já usam o sistema não são interrompidos por este checklist sem necessidade.
- Os balões de guia contextuais existentes continuam funcionando normalmente, sem duplicação de conteúdo com o checklist.
- Build do frontend passa sem erros.

## Perguntas Para o Planejamento

- Quais cadastros exatos devem entrar no checklist inicial, além do exemplo de cartão citado pelo usuário? (ex.: categoria, cliente — a confirmar quais são de fato pré-requisito direto para despesas/receitas, investigando `ExpenseDialog.tsx`/`IncomeDialog.tsx` para ver quais campos dependem de outro cadastro existir.)
- Onde exatamente o checklist deve ficar acessível para reabertura após dispensado (botão fixo no header, item na sidebar, outro local)?
- Como distinguir "usuário novo" de "usuário existente que nunca configurou tudo" para decidir quando o checklist deve aparecer automaticamente?
- O checklist deve reaparecer automaticamente enquanto houver itens pendentes (a cada login, até completar tudo), ou aparece só uma vez e depois só é acessível manualmente?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` e `sistema financas/AGENT.md`. Nota: ambos descrevem um contexto genérico "sistema multi-prefeitura, multi-tenant + RLS" que não corresponde a este projeto pessoal solo-dev — desconsiderar as seções de isolamento entre tenants/RLS ao planejar, mas manter as práticas gerais aplicáveis (nomes claros, validação no backend quando houver, seguir padrões existentes).
- Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` separados neste projeto.
- Leia também `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md` (plano já implementado) para entender a arquitetura atual do sistema de guias contextuais e garantir que o checklist novo não conflite nem duplique esse mecanismo.
- Inspecione `ExpenseDialog.tsx` e `IncomeDialog.tsx` durante o planejamento para confirmar quais campos realmente dependem de outro cadastro existir, antes de decidir a lista final de itens do checklist.
- Classifique a implementação como `frontend-only`, salvo se a investigação mostrar necessidade de backend.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere um plano em `.plans/` (padrão deste projeto, conforme `CLAUDE.md`) com etapas pequenas, revisáveis e seguras.
