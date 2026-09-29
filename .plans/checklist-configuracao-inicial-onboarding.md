# Plano de Implementação: Checklist de Configuração Inicial (Onboarding Sequencial)

## Origem

- Arquivo de especificação: `.portal/tasks/checklist-configuracao-inicial-onboarding.md`
- Data do planejamento: `2026-08-05`
- Classificação: `frontend-only`

## Resumo

Cria um modal de checklist de configuração inicial, exibido uma única vez no primeiro acesso ao sistema (sem ponto de reabertura manual — dispensa permanente por perfil, mesmo padrão dos balões de guia). Os itens do checklist variam conforme o tipo de conta ativa (Pessoa Física ou Pessoa Jurídica) e refletem progresso real, consultando os dados já cadastrados pelo usuário via endpoints existentes. O checklist coexiste com o sistema de guias contextuais (`FirstAccessGuideCard`) já corrigido em `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`, sem duplicá-lo ou substituí-lo.

Uma investigação prévia (via subagente, lendo `ExpenseDialog.tsx` e `IncomeDialog.tsx` por completo) revelou que **nenhum cadastro é tecnicamente bloqueante** para lançar despesa/receita — cartão, cliente, tipo de receita e representante são todos opcionais no schema de validação, e a maioria (categoria, tipo de receita, cliente) tem criação inline dentro do próprio modal de lançamento. Categorias, além disso, já vêm com seed automático por tipo de perfil (`ensureDefaultCategories`, `sistema financas/backend/src/services/defaultCategories.ts`). O único cadastro sem seed e sem atalho de criação inline no fluxo de despesa é **cartão** — mostra apenas um aviso textual "Nenhum cartão cadastrado" quando a forma de pagamento é crédito/débito, sem link direto para a tela de configuração.

## Escopo

### Dentro do escopo

- Modal de checklist de configuração inicial, exibido no primeiro acesso.
- Itens variando conforme tipo de conta ativa (PF/PJ), lidos de `localStorage.getItem('perfilAtivoTipo')` (mesmo padrão já usado em `AppShell.tsx`/`IncomeDialog.tsx` para `isEmpresa`).
- Cálculo de progresso real por item, consultando `fetchCartoes`, `fetchClientes`, `fetchRepresentantes` (endpoints já existentes).
- Navegação direta de cada item para a tela de configuração correspondente.
- Persistência de dismiss permanente em `localStorage`, por perfil ativo — sem ponto de reabertura manual em nenhum lugar da UI.

### Fora do escopo

- Qualquer ponto de reabertura manual do checklist (botão fixo, item de menu, aba em Configurações) — decisão explícita do usuário de que não deve existir.
- Bloquear ativamente o acesso a Despesas/Receitas até completar o checklist — é informativo, não um gate (confirmado pela investigação: nenhum cadastro é tecnicamente obrigatório).
- Alterar os balões de guia contextuais já existentes e recém corrigidos.
- Alterações de backend — todos os dados necessários já são expostos pelos endpoints de listagem existentes.
- Checagem de "usuário tem lançamento" como critério de exibição — decisão explícita do usuário de usar apenas o dismiss em `localStorage`, mesmo padrão simples do sistema de guias.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — ambos descrevem contexto genérico "multi-prefeitura, multi-tenant + RLS" que não se aplica a este projeto pessoal solo-dev; seções de tenant/RLS desconsideradas, mantidas as práticas gerais (nomes claros, seguir padrões existentes, React Query para server state).
- `.portal/tasks/checklist-configuracao-inicial-onboarding.md` (especificação de entrada).
- `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md` (arquitetura atual do sistema de guias contextuais, já implementado).
- `sistema financas/src/hooks/useFirstAccessGuide.ts` (padrão de persistência de dismiss em `localStorage` por perfil, a replicar).
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`, `sistema financas/src/screens/finance/IncomeDialog.tsx` (investigação completa de dependências reais entre cadastros e lançamentos).
- `sistema financas/backend/src/services/defaultCategories.ts` (confirmação de seed automático de categorias).
- `sistema financas/src/services/configService.ts` (`fetchCartoes`), `sistema financas/src/services/clientesService.ts` (`fetchClientes`), `sistema financas/src/services/representantesService.ts` (`fetchRepresentantes`).
- `sistema financas/src/App.tsx`, `sistema financas/src/layout/AppShell.tsx` (navegação entre `AppSection`/`ConfigTab`, ponto de montagem de Providers/modais globais).
- `sistema financas/src/ui/dialog.tsx` (componente `Dialog` reutilizável a seguir como base visual).

## Impacto por área

### Frontend

- Novo hook `sistema financas/src/hooks/useOnboardingChecklist.ts`: usa `useQuery` para `fetchCartoes`, `fetchClientes`, `fetchRepresentantes` (staleTime consistente com o resto do projeto, ex.: 60_000), lê `perfilAtivoTipo` do `localStorage` para decidir PF vs PJ, e monta a lista de itens:
  - **PF**: "Cadastrar um cartão" (concluído se `cartoes.length > 0`), "Criar categorias personalizadas" (opcional/informativo, concluído se existir alguma categoria além das padrão — ou simplesmente sempre marcado como disponível, dado o seed).
  - **PJ**: os mesmos dois itens acima, mais "Cadastrar um cliente" (concluído se `clientes.length > 0`) e "Cadastrar um representante" (concluído se `representantes.length > 0`, item claramente opcional/"só se for usar comissão").
  - Cada item expõe `{ id, label, description, done, targetSection, targetTab }`.
- Novo componente `sistema financas/src/components/OnboardingChecklistModal.tsx`: modal reaproveitando a base visual de `Dialog`/`FirstAccessGuideCard` (cores cyan já usadas no sistema de guias), lista numerada com ícone de check para itens concluídos, cada item clicável navegando via `onNavigate`/`onConfigTab`.
- Persistência de dismiss: nova chave em `localStorage`, ex. `fingerence:onboarding-checklist:<perfilAtivoId>`, seguindo exatamente o padrão de leitura/escrita já usado em `useFirstAccessGuide.ts` (não reaproveitar a mesma chave, para não conflitar com os scopes de guia existentes).
- `sistema financas/src/App.tsx`: montar o `OnboardingChecklistModal` condicionalmente (mostrado apenas se não dispensado), próximo de onde hoje ficam `ConfirmProvider`/`FirstAccessGuideProvider`.
- Tratamento de estados de loading/error das queries: se qualquer uma falhar, o item correspondente deve ficar em estado neutro (não marcado como concluído, mas sem quebrar o modal) — sem `ErrorState` bloqueante dentro do checklist.

### Backend

`Sem impacto esperado` — todos os dados necessários já são expostos pelos endpoints de listagem existentes (`/cartoes`, `/clientes`, `/representantes`).

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/hooks/useOnboardingChecklist.ts` (novo)
- `sistema financas/src/components/OnboardingChecklistModal.tsx` (novo)
- `sistema financas/src/App.tsx`

## Estratégia de implementação

1. Criar `useOnboardingChecklist.ts`: queries para cartões/clientes/representantes, leitura de `perfilAtivoTipo`, montagem da lista de itens por tipo de conta, lógica de dismiss/persistência em `localStorage`.
2. Criar `OnboardingChecklistModal.tsx`: UI do checklist numerado, com estado concluído/pendente por item, navegação ao clicar, botão de dispensar.
3. Montar o modal em `App.tsx`, condicionado a `!isDismissed`.
4. Rodar `npx vite build` para validar.

## Regras de negócio identificadas

- O checklist não bloqueia nenhuma ação do sistema — é puramente informativo/norteador.
- Itens variam conforme `perfilAtivoTipo` (PF vs PJ).
- Progresso de cada item é calculado a partir de dados reais (contagem de registros), nunca marcado manualmente pelo usuário.
- Dismiss é permanente por perfil, sem qualquer mecanismo de reabertura na interface.

## Regras multi-tenant e segurança

Não aplicável — projeto solo-dev sem multi-tenancy. Sem dados sensíveis novos expostos; o checklist apenas lê contagens de registros já acessíveis ao próprio usuário autenticado, via endpoints existentes que já aplicam a autorização padrão do sistema.

## Validações necessárias

Nenhuma validação de formulário nova — o checklist é somente leitura/navegação, sem inputs próprios.

## Testes necessários

### Frontend

- Não aplicável nesta implementação (sem testes automatizados de frontend identificados no projeto para fluxos semelhantes); validação por build/typecheck, conforme preferência já registrada pelo usuário de não exigir teste manual em tela.

### Backend

- Não aplicável.

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Se o usuário estiver no meio de outra ação ao logar pela primeira vez (ex.: acabou de trocar de perfil), o modal pode interromper o fluxo — mitigado pelo fato de aparecer só uma vez e nunca mais, conforme decisão do usuário.
- Sem ponto de reabertura manual: se o usuário dispensar acidentalmente, não há como vê-lo de novo — risco aceito explicitamente pelo usuário nesta decisão de planejamento.
- Categoria como item do checklist é parcialmente redundante, já que há seed automático — mantido como item secundário/informativo, não como pendência real, para não confundir o usuário com um item quase sempre já "concluído".

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (A dúvida sobre incluir "categoria" como item foi resolvida: mantida como item secundário/informativo em ambos os perfis, já que normalmente aparece concluída por causa do seed automático.)

## Critérios de aceite do plano

- O checklist aparece uma vez no primeiro acesso, com itens diferentes para conta PF e PJ.
- Cada item reflete corretamente o progresso real (cartão/cliente/representante cadastrados ou não).
- Clicar em um item navega para a tela de configuração correspondente.
- Dispensar o checklist impede que ele reapareça para aquele perfil, sem nenhum botão/local para reabri-lo manualmente.
- Os balões de guia contextuais existentes continuam funcionando sem alteração.
- Build do frontend passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir o padrão visual já validado do sistema de guias (`FirstAccessGuideCard`, cores cyan) para manter consistência visual no novo modal.
- Reaproveitar exatamente o padrão de persistência de `useFirstAccessGuide.ts` para o dismiss do checklist, mas com chave de `localStorage` distinta.
- Não criar nenhum ponto de reabertura manual do checklist — decisão explícita do usuário.
- Não alterar `firstAccessGuideMessages.ts` nem os call sites de `FirstAccessGuideCard` já corrigidos.
- Não executar migrations (não aplicável, mas mantido por padrão do projeto).
- Não realizar testes manuais em tela; validar apenas via build.
