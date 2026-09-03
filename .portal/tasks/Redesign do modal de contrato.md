# Task: Redesign do modal de contrato

## Contexto

O sistema financeiro (`sistema financas`) possui um módulo de gestão de clientes em `src/screens/config/ClienteDetail.tsx`, que concentra todo o fluxo de contratos de um cliente. Dentro desse arquivo existe o componente `ContratoModal` (linha ~583), responsável por criar e editar contratos, e o componente auxiliar `ContratoForm` (linha ~38), responsável pelos campos de identificação/datas/reajuste/representante/observações usados dentro do modal.

O `ContratoModal` hoje:

- Usa o componente compartilhado `Dialog` (`src/ui/dialog.tsx`, tamanho `xxl`) e os tokens de formulário de `src/ui/dialogFormTokens.tsx` (`labelStyle`, `fieldInputStyle`, `cardStyle`, `chipStyle`).
- Renderiza duas colunas lado a lado: "Dados do contrato" (via `ContratoForm`) e "Valores" (cards-resumo de Valor mensal / Total anual / Faturando + blocos de Prestação de serviço, Implantação, Hora presencial e Hora remoto).
- Abre um sub-`Dialog` ("Discriminação de prestação de serviço") por cima, listando o catálogo de serviços com checkboxes de Contratado/Implantado/Faturando (componente `CatalogoServicoRow`, linha ~321).
- Renderiza `ContratoAnexos` (anexos de PDF do contrato) quando já existe um contrato salvo.
- Tem um footer com ações condicionais: Encerrar contrato / Registrar aditivo (abre `AditivoModal`, linha ~1124) / Cancelar / Salvar / Editar.
- Tem um modo somente leitura (`readOnly`) usado quando o contrato existe e não está em edição, alternando a apresentação de `ContratoForm` para blocos de texto estático.
- Usa `useFirstAccessGuide` em múltiplos pontos (reajuste, representante, implantação, horas, serviços, encerrar) para exibir cards de onboarding contextual (`FirstAccessGuideCard` + `firstAccessGuideMessages`).

O usuário forneceu um mockup visual (HTML/React de referência, gerado como artifact) propondo um redesign completo da aparência do modal, mantendo a mesma área de responsabilidade funcional (contrato + valores + discriminação de serviços + anexos + footer de ações), mas com um layout, tipografia, espaçamento e hierarquia visual diferentes do atual.

Arquivos já verificados e relevantes:

- `src/screens/config/ClienteDetail.tsx` — contém `ContratoForm`, `CatalogoServicoRow`, `ContratoAnexos`, `ContratoModal`, `AditivoModal`.
- `src/ui/dialog.tsx` — componente `Dialog` compartilhado (tamanhos `md`/`lg`/`xl`/`xxl`, `scrollBody`).
- `src/ui/dialogFormTokens.tsx` — tokens de estilo (`C`, `labelStyle`, `fieldInputStyle`, `cardStyle`, `chipStyle`) reutilizados por outros modais do sistema (ex.: `IncomeDialog.tsx`, `ExpenseDialog.tsx`).
- `src/services/clientesService.ts` — tipos e chamadas de API (`Contrato`, `ServicoContrato`, `ContratoAnexo`, `saveContrato`, `encerrarContrato`, `registrarAditivo`, `vincularServico`, `atualizarServicoContrato`, `desvincularServico`, `fetchContratoAnexos`, `uploadContratoAnexo`, `deleteContratoAnexo`).
- `src/screens/finance/formatters.ts` — `formatCurrency`, usado extensivamente no modal.

## Problema

O modal de contrato atual está funcional, mas seu layout (grid 2 colunas com `className` Tailwind misturado a blocos com `style` inline vindos de `dialogFormTokens`) não segue a proposta visual trazida no mockup. O usuário quer modernizar a aparência — hierarquia de header, espaçamento, cards de resumo, tabela de valores, footer fixo com resumo financeiro e sub-modal de serviços — sem perder nenhuma capacidade funcional já existente (edição inline, modo leitura, aditivo, encerramento, anexos, guias de onboarding).

Redesenhar "no meio" do componente atual, misturando estilos antigos (Tailwind classes + tokens de `dialogFormTokens`) com o novo padrão visual do mockup, tende a deixar código duplicado/conflitante (classes não usadas, estilos sobrepostos, cores antigas convivendo com novas). Isso já foi um problema identificado em redesigns anteriores no projeto.

## Objetivo

Redesenhar visualmente o `ContratoModal` (e seus subcomponentes internos `ContratoForm`, `CatalogoServicoRow`, sub-`Dialog` de serviços) para refletir o layout, tipografia e hierarquia visual do mockup fornecido pelo usuário, preservando 100% do comportamento funcional existente: criação, edição, modo leitura, reajuste, representante, valores (mensal/implantação/horas), discriminação de serviços, anexos, aditivo, encerramento e guias de onboarding contextual.

## Decisão Técnica Desejada

- Seguir o padrão de remover-então-aplicar: primeiro remover a estilização/markup antigo do trecho redesenhado (classes Tailwind e estilos inline conflitantes), depois aplicar o novo markup/estilo do mockup — como dois passos explícitos no plano, evitando código morto ou estilos sobrepostos.
- Reaproveitar os componentes de UI compartilhados existentes (`Dialog`, tokens de `dialogFormTokens.tsx`) sempre que o mockup não introduzir um padrão visual genuinamente novo — avaliar durante o planejamento se algum token de estilo novo do mockup deve ser promovido para `dialogFormTokens.tsx` (para reuso por outros modais) ou mantido local ao componente.
- Preservar a estrutura de dados e as chamadas de API existentes (`clientesService.ts`) sem alteração de contrato.
- Não deve haver introdução de nova biblioteca de UI/estilo — seguir o padrão já usado no projeto (Tailwind + tokens compartilhados) salvo indicação explícita do usuário durante o planejamento.

## Escopo Funcional

### Dentro do escopo

- Redesign visual do `ContratoModal`: header, seção "Dados do contrato", seção "Valores" (mensalidade, implantação, hora presencial, hora remoto), footer com resumo financeiro e ações.
- Redesign visual do sub-`Dialog` "Discriminação de prestação de serviço" (`CatalogoServicoRow` e sua listagem).
- Redesign visual do bloco de anexos (`ContratoAnexos`), na medida em que ele aparece integrado ao modal.
- Ajuste de layout responsivo/hierarquia conforme o mockup (ex.: grid de campos, chips de reajuste/representante, tabela de valores, cards de resumo no footer).
- Preservação de todos os estados existentes: novo contrato, edição, leitura, com/sem contrato ativo, com/sem representantes cadastrados, com/sem anexos.
- Preservação de todas as guias de onboarding (`useFirstAccessGuide`) já ancoradas nos campos afetados.

### Fora do escopo inicial

- Alterações em `AditivoModal` (fluxo de registrar aditivo) além do necessário para manter compatibilidade visual mínima com o novo modal — se o mockup não cobrir esse sub-fluxo, ele deve manter o visual atual nesta entrega.
- Alterações em `clientesService.ts` (contratos de API) ou no backend de contratos.
- Alterações em outras telas que também usam `dialogFormTokens.tsx` (ex.: `IncomeDialog.tsx`, `ExpenseDialog.tsx`), exceto se o planejamento identificar necessidade de promover um token novo — nesse caso, deve ser tratado como decisão explícita, não como efeito colateral.
- Mudança de regra de negócio (cálculos de total, saldo de horas, faturamento) — o redesign deve preservar os cálculos existentes tal como estão.
- Migração de dados ou schema de contrato.

## Requisitos de Frontend

- Reescrever o JSX/estilo do `ContratoModal`, `ContratoForm`, `CatalogoServicoRow` e do sub-modal de serviços conforme o mockup, mantendo os mesmos `props`, `state` e handlers já existentes (ou equivalentes, se o planejamento justificar simplificação).
- Manter uso do componente `Dialog` compartilhado (`src/ui/dialog.tsx`) para o modal principal e o sub-modal de serviços, respeitando `size` e `scrollBody` conforme necessário para o novo layout.
- Verificar se o novo layout do mockup exige ajuste no componente `Dialog` (ex.: novo tamanho, footer fixo diferente do padrão atual) — se sim, tratar como mudança explícita e documentar no plano, já que `Dialog` é compartilhado por outros modais do sistema.
- Preservar formatação de valores via `formatCurrency` (`src/screens/finance/formatters.ts`).
- Preservar comportamento dos toggles de serviço (Contratado/Implantado/Faturando) e da lógica de `pendingServicos` para contrato ainda não salvo.
- Preservar os pontos de ancoragem das guias de onboarding (`FirstAccessGuideCard`), ajustando apenas posicionamento visual se o novo layout exigir.

## Requisitos de Backend

Sem impacto backend identificado inicialmente. Nenhuma alteração de endpoint, contrato de API ou regra de negócio é esperada nesta task.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant; sem isolamento de tenant a considerar (single-tenant, uso pessoal do usuário). Não há dados sensíveis novos sendo expostos — a task é puramente visual, reutilizando os mesmos dados já buscados e exibidos pelo modal atual. Nenhuma alteração de permissão/autorização é esperada.

## Requisitos de Migração ou Compatibilidade

- Preservar os `props` de entrada do `ContratoModal` conforme usados pelo componente pai em `ClienteDetail.tsx` (`open`, `contrato`, `clienteId`, `representantes`, `isSaving`, `onSave`, `onClose`, `onEncerrar`, `onRegistrarAditivo`), a menos que o planejamento identifique necessidade de mudança e valide com o usuário.
- Preservar o shape de dados (`Parameters<typeof saveContrato>[0]`, `Map<number, number>` de `pendingServicos`) enviado em `onSave`.
- Código/identificadores novos criados durante a implementação devem seguir nomenclatura em inglês; nomes em português já existentes no arquivo (ex.: `contrato`, `valMensal`, `isEditing`) são tratados como legado e não precisam ser renomeados nesta task, salvo se o planejamento decidir renomear como parte do redesign.

## Requisitos de Testes

### Frontend

- Testar manualmente (via `/run`) os fluxos: criar novo contrato, editar contrato existente, cancelar edição, alternar modo leitura/edição, vincular/desvincular serviço no sub-modal, registrar aditivo, encerrar contrato, anexar/remover anexo.
- Verificar que os cálculos exibidos (Valor mensal, Total anual, Faturando, saldo de horas) continuam corretos após o redesign.
- Verificar responsividade do novo layout dentro dos tamanhos de `Dialog` suportados.

### Backend

Não aplicável — task não altera backend.

### E2E

Não aplicável inicialmente — validação manual via `/run` deve ser suficiente dado o escopo visual da task.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/config/ClienteDetail.tsx` (componentes `ContratoModal`, `ContratoForm`, `CatalogoServicoRow`, e possivelmente `ContratoAnexos`/`AditivoModal` se o planejamento identificar necessidade de ajuste de compatibilidade visual).
- `src/ui/dialogFormTokens.tsx` (somente se o planejamento decidir promover algum token novo do mockup para reuso compartilhado).
- `src/ui/dialog.tsx` (somente se o planejamento identificar necessidade de ajuste no componente `Dialog` compartilhado).

### Backend

Sem impacto — nenhum arquivo backend deve ser alterado nesta task.

### Banco de Dados

Sem impacto — nenhuma migration ou alteração de schema nesta task.

## Critérios de Aceite

- O `ContratoModal` reflete o layout, hierarquia visual e espaçamento propostos no mockup fornecido pelo usuário.
- Todos os fluxos funcionais existentes continuam operando sem regressão: criar contrato, editar contrato, modo leitura, reajuste, representante (inclusive criação inline), valores (mensal/implantação/horas), discriminação de serviços (vincular/desvincular/atualizar), anexos (upload/visualizar/remover), registrar aditivo, encerrar contrato.
- Não existe código morto, estilo duplicado ou classes/estilos conflitantes remanescentes do layout antigo nos trechos redesenhados (remoção precede aplicação do novo estilo, conforme decisão técnica).
- Guias de onboarding (`FirstAccessGuideCard`) continuam aparecendo nos pontos corretos do novo layout.
- Nenhuma alteração de contrato de API, cálculo de negócio ou schema de banco foi introduzida.
- Build/typecheck do frontend passa sem erros novos.

## Perguntas Para o Planejamento

- O mockup deve ser aplicado literalmente (incluindo textos/labels em português já usados, como "Nada consta", "IGPM", "IPCA") ou adaptado para manter 100% de paridade com os labels/campos atuais do `ContratoForm`?
- O componente `Dialog` compartilhado precisa de um novo tamanho/variante para acomodar o layout do mockup, ou os tamanhos existentes (`md`/`lg`/`xl`/`xxl`) são suficientes?
- O bloco de anexos (`ContratoAnexos`) deve ser redesenhado nesta mesma task ou tratado como fora de escopo, mantendo o visual atual dentro do novo modal?
- Existem outros modais do sistema (ex.: `IncomeDialog.tsx`, `ExpenseDialog.tsx`) que devem receber os mesmos tokens visuais novos nesta task, ou isso fica estritamente restrito ao modal de contrato?
- O `AditivoModal` deve acompanhar o redesign visual nesta entrega ou permanece com o visual atual?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz do repositório) e `/sistema financas/AGENT.md` (regras específicas deste projeto — prevalecem sobre a raiz para este módulo, incluindo a ausência de contexto multi-tenant real aqui apesar do texto genérico do AGENT.md da raiz).
- Inspecione `src/screens/config/ClienteDetail.tsx`, `src/ui/dialog.tsx` e `src/ui/dialogFormTokens.tsx` antes de escrever o plano.
- Trate o redesign como `frontend`.
- Estruture o plano em etapas pequenas, seguindo a decisão técnica de remover-então-aplicar (remover estilo/markup antigo do trecho afetado, depois aplicar o novo, como passos separados e revisáveis).
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não aplicável nesta task).
- Gere um plano em `.plans/` com etapas pequenas, revisáveis e seguras.
