# Task: Redesenhar aparência e ajustar funções do Assistente Financeiro (chat)

## Contexto

O `sistema financas` já possui um assistente financeiro de chat completo e funcional, tanto no frontend quanto no backend. Não se trata de um componente novo — é um redesign visual/UX de algo que já está em produção.

Frontend (componente principal, ~960 linhas):
- [`src/components/financial-assistant/FinancialAssistant.tsx`](sistema financas/src/components/financial-assistant/FinancialAssistant.tsx) — componente único que implementa header, menu de histórico, lista de mensagens, cartão de rascunho de lançamento (draft) e composer de mensagem. Suporta os modos `floating` (bolha flutuante + painel) e `standalone` (tela cheia via PWA).
- [`src/screens/assistant/AssistantPwaScreen.tsx`](sistema financas/src/screens/assistant/AssistantPwaScreen.tsx) — tela PWA standalone que apenas monta `FinancialAssistant mode="standalone"`.
- [`src/assistantMain.tsx`](sistema financas/src/assistantMain.tsx) + [`assistant.html`](sistema financas/assistant.html) — entrypoint Vite separado para essa PWA.
- [`src/services/assistantService.ts`](sistema financas/src/services/assistantService.ts) — chamadas HTTP para o backend do assistente.
- [`src/types/financialAssistant.ts`](sistema financas/src/types/financialAssistant.ts) e [`src/types/financialCopilot.ts`](sistema financas/src/types/financialCopilot.ts) — tipos do draft, da resposta do copiloto e do histórico de conversas.

Backend (já implementado e funcional):
- [`backend/src/routes/assistant.ts`](sistema financas/backend/src/routes/assistant.ts) — rotas `POST /assistant/financial-draft`, `POST /assistant/chat`, `GET /assistant/conversations`, `GET /assistant/conversations/:id`, `DELETE /assistant/conversations/:id`.
- `backend/src/services/financialAssistant.ts`, `financialCopilot.ts`, `copilotIntent.ts`, `ocrService.ts`, `pixReader.ts`, `aiProvider.ts` — engine de extração de rascunho, intenção de conversa, leitura de comprovantes/PIX e integração com IA.
- `backend/src/db/schema/copilot.ts`, `aiSessions.ts` — persistência de conversas e mensagens.

O usuário forneceu um mockup visual (HTML/React "bundled artifact") do assistente desejado, com aparência e alguns comportamentos diferentes do que está implementado hoje.

## Problema

A tela atual do assistente já cobre a maior parte da lógica de negócio prevista no mockup (extração de rascunho com nível de confiança, edição inline, aviso de duplicidade, confirmação explícita antes de salvar, anexos, histórico de conversas, ditado por voz). Porém a aparência visual e alguns detalhes de interação divergem do mockup fornecido, o que indica desalinhamento entre o design desejado (mais recente) e a implementação atual.

Comparação identificada entre o mockup e [`FinancialAssistant.tsx`](sistema financas/src/components/financial-assistant/FinancialAssistant.tsx):

| Elemento | Mockup | Implementação atual |
|---|---|---|
| Header | Avatar maior (62px), sem subtítulo, botão de menu (⋮) com dropdown | Avatar 40px, com subtítulo "Consultas e rascunhos para revisar", ícones de histórico/nova conversa/painel soltos no header (sem menu agrupado) |
| Menu de opções | Dropdown único (⋮) com "Conversas anteriores", "Nova conversa", "Abrir painel financeiro" + seletor de tamanho de fonte (P/M/G) | Botões separados fixos no header (histórico, nova conversa, abrir painel); não existe seletor de tamanho de fonte |
| Separador de data | Badge "Hoje" centralizado no topo da conversa | Não existe agrupamento/separador de data nas mensagens |
| Bolha de anexo do usuário | Cartão com ícone de arquivo, nome, tamanho em KB e ícone de "enviado/lido" (double check) | Nome do anexo listado como linha de texto simples com ícone `FileText`, sem tamanho nem indicador de status |
| Indicador "digitando" | 3 pontinhos animados + texto "digitando…" | Spinner (`LoaderCircle`) + texto "Consultando seus dados..." |
| Cartão de confirmação de transação | Cada campo (Tipo, Descrição, Valor, Data, Categoria, Pagamento) é uma linha "tocável" em estilo lista, com ícone de edição à direita | Campos já são inputs/selects editáveis diretamente, em grid, sem o estilo de "linha tocável" |
| Botões do cartão | "Sim, salvar R$ X" (verde) e "Não salvar" (secundário, borda) | "Confirmar R$ X" (ciano) e "Descartar rascunho" (borda) — mesma função, rótulos e cores diferentes |
| Badge de confiança | Mesmos 3 níveis (Leitura alta / Conferir / Dados parciais) | Já implementado de forma equivalente (`draft.confidence`) |
| Aviso de duplicidade | Mesma função | Já implementado (`findDuplicate` / `duplicateWarning`) |
| Composer | Botão de anexo (+), campo de texto, botão de microfone, botão de enviar | Equivalente já implementado (`Paperclip`, textarea, `Mic`/`Square`, `Send`) |
| Paleta de cores | Fundo do header `#0D2E3C`, destaque `#0891b2`/`#0EC4D8` | Header `#0D2E3C` (igual), destaque `#0C9EAF`/`#087B89` (próximo, mas não idêntico) |

## Objetivo

Ajustar a aparência (layout, espaçamento, paleta, componentes visuais) e um subconjunto de funções (menu agrupado com seletor de tamanho de fonte, separador de data, indicador de "digitando" com pontinhos, exibição de anexo com tamanho/status) do assistente financeiro existente para que fique alinhado ao mockup fornecido pelo usuário, preservando toda a lógica de negócio já implementada (extração de rascunho, confirmação explícita, aviso de duplicidade, histórico, voz, anexos).

## Decisão Técnica Desejada

Como já existe um componente funcional único (`FinancialAssistant.tsx`) cobrindo praticamente toda a lógica pedida, a direção esperada é:

- Tratar isso como redesign de UI sobre o componente existente, não como criação de tela nova.
- Remover/substituir o markup e classes Tailwind que representam o estilo antigo de cada seção antes de aplicar o novo estilo do mockup, evitando código morto ou sobreposto (regras do projeto: redesign = remover depois aplicar, como dois passos explícitos do plano).
- Avaliar durante o planejamento se algumas peças do mockup (menu ⋮ agrupado, seletor de tamanho de fonte, separador "Hoje") justificam extrair subcomponentes (ex.: `AssistantHeaderMenu`, `AssistantMessageBubble`) ou se cabem bem mantidas inline, dado o tamanho já grande do arquivo atual (~960 linhas).
- Preferência por não duplicar chamadas de API já existentes em `assistantService.ts` — a task é de UI/UX, não de contrato de dados.

## Escopo Funcional

### Dentro do escopo

- Redesenhar o header: avatar, título, e novo menu (⋮) agrupando "Conversas anteriores", "Nova conversa", "Abrir painel financeiro".
- Adicionar seletor de tamanho de fonte (Pequeno/Médio/Grande) dentro do menu do header, com efeito visual sobre a área de mensagens (equivalente ao `zoom`/escala do mockup).
- Adicionar separador de data (ex.: "Hoje") no topo da lista de mensagens.
- Redesenhar a bolha de anexo enviado pelo usuário para exibir ícone, nome, tamanho formatado (KB) e indicador visual de "enviado".
- Trocar o indicador de carregamento por um estilo de "digitando..." com pontinhos animados, mantendo o texto atual ou aproximando do mockup.
- Redesenhar o cartão de confirmação de transação para o estilo "linha tocável" do mockup (Tipo, Descrição, Valor, Data, e condicionalmente Categoria/Pagamento/checkbox "já foi paga"), preservando a edição dos mesmos campos que já existem hoje.
- Atualizar rótulos e cores dos botões de ação do cartão para "Sim, salvar [valor]" (verde) e "Não salvar" (secundário), mantendo o comportamento atual (`handleSave` / `discardDraft`).
- Ajustar paleta de cores para aproximar do mockup (`#0891b2`/`#0EC4D8`/`#7ffcff` vs. atual `#0C9EAF`/`#087B89`), decidindo durante o planejamento se a paleta muda globalmente ou só neste componente.
- Preservar 100% do comportamento funcional já existente: extração de rascunho, edição inline, aviso de duplicidade, confirmação explícita antes de salvar, histórico de conversas, upload de anexos, ditado por voz, modos `floating` e `standalone`.

### Fora do escopo inicial

- Qualquer alteração no backend (`routes/assistant.ts`, `financialAssistant.ts`, `financialCopilot.ts`, `copilotIntent.ts`, OCR/PIX reader, `aiProvider.ts`) — a task é de UI, o motor de extração já existe e não deve ser tocado.
- Trocar o motor de extração de transação (regras vs. IA/LLM) — já está implementado e fora do escopo deste redesign.
- Implementar OCR real caso não exista — o mockup mostra um anexo de PDF sendo "lido", mas o backend já tem `ocrService.ts`; qualquer lacuna de qualidade de OCR é assunto separado.
- Persistir a preferência de tamanho de fonte no backend/perfil do usuário (pode ficar como estado local/`localStorage` nesta primeira entrega, a menos que o planejamento decida o contrário).
- Criar nova rota de navegação/entrypoint — o assistente já é acessível via bolha flutuante (`floating`) e via PWA standalone (`assistant.html`); não criar uma terceira forma de acesso sem necessidade explícita.
- Alterar o schema do banco (`copilot.ts`, `aiSessions.ts`).

## Requisitos de Frontend

- Todas as alterações concentram-se em [`src/components/financial-assistant/FinancialAssistant.tsx`](sistema financas/src/components/financial-assistant/FinancialAssistant.tsx) e, se o planejamento decidir extrair subcomponentes, em novos arquivos dentro de `src/components/financial-assistant/`.
- Novo código/identificadores em inglês (ex.: `AssistantHeaderMenu`, `FontSizeOption`), seguindo a convenção do projeto; strings visíveis ao usuário continuam em português.
- Preservar a distinção entre modo `floating` (bolha + painel flutuante) e `standalone` (tela cheia da PWA) — o mockup mostra um layout único que se aproxima mais do `standalone`/mobile; confirmar no planejamento como isso se aplica ao modo `floating` em telas largas.
- Não remover nenhuma prop, hook (`useQuery`/`useQueryClient`) ou chamada de serviço existente sem substituição equivalente.
- Reaproveitar ícones já usados (`lucide-react`) sempre que possível; avaliar se novos ícones do mockup (ex.: menu de 3 pontos) já existem na lib antes de adicionar dependência nova.

## Requisitos de Backend

Sem impacto backend identificado inicialmente. A task não deve alterar rotas, services ou schema do assistente.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

## Requisitos de Segurança e Multi-Tenant

- Este projeto (`sistema financas`) não segue o modelo multi-prefeitura/RLS descrito nos `AGENT.md` de nível mais alto (esses arquivos parecem descrever outro contexto do monorepo); ainda assim, preservar o isolamento por `perfil_id` já usado em `assistantService.ts` (`getActiveProfileId()`) e nas rotas de conversas.
- Não expor dados de anexos ou conversas de um perfil para outro durante o redesign — nenhuma query ou chamada nova deve ser criada nesta task, então o risco é baixo, mas deve ser confirmado no planejamento caso subcomponentes novos manipulem `conversationId`/`perfil_id`.

## Requisitos de Migração ou Compatibilidade

- Preservar compatibilidade com os tipos já existentes (`FinancialAssistantDraft`, `FinancialCopilotResponse`, `FinancialCopilotStoredMessage`) — não alterar contratos de API.
- Preservar o comportamento de restauração automática da última conversa (`hasRestoredLatest`) e o funcionamento em ambos os entrypoints (`app.html` via bolha flutuante e `assistant.html` PWA standalone).

## Requisitos de Testes

### Frontend

- Testar manualmente os dois modos (`floating` e `standalone`) após o redesign, cobrindo: enviar mensagem de texto, enviar anexo, ver cartão de rascunho aparecer, editar campos do rascunho, salvar rascunho, descartar rascunho, abrir histórico, restaurar conversa antiga, excluir conversa, iniciar nova conversa, usar ditado por voz (quando suportado pelo navegador), alternar tamanho de fonte.
- Caso o projeto tenha testes de componente para esta área (verificar durante o planejamento), atualizar seletores/textos afetados pela mudança de rótulos e classes.

### Backend

Não aplicável — sem alteração de backend nesta task.

### E2E

- Não aplicável inicialmente, a menos que o planejamento identifique fluxo E2E já cobrindo o assistente.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx`
- Possíveis novos arquivos em `sistema financas/src/components/financial-assistant/` (a decidir no planejamento, ex.: subcomponentes de header/menu/bolha de mensagem)
- `sistema financas/src/screens/assistant/AssistantPwaScreen.tsx` (apenas se o redesign exigir ajuste no wrapper `standalone`)

### Backend

Sem impacto — não deve haver arquivos afetados no backend.

### Banco de Dados

Sem impacto.

## Critérios de Aceite

- O header do assistente exibe avatar, título e um único botão de menu (⋮) agrupando "Conversas anteriores", "Nova conversa" e "Abrir painel financeiro".
- O menu do header inclui seletor de tamanho de fonte (Pequeno/Médio/Grande) que altera visivelmente o tamanho do conteúdo da conversa.
- A lista de mensagens exibe um separador de data acima das mensagens do dia.
- Anexos enviados pelo usuário aparecem em formato de cartão com nome, tamanho e indicador de envio, análogo ao mockup.
- O indicador de espera do assistente usa o estilo "digitando..." com pontinhos, no lugar do spinner atual.
- O cartão de confirmação de transação segue o estilo "linha tocável" do mockup para Tipo, Descrição, Valor, Data (e Categoria/Pagamento/checkbox quando for despesa).
- Os botões de ação do cartão exibem "Sim, salvar [valor]" e "Não salvar", mantendo exatamente o comportamento atual de salvar/descartar o rascunho.
- Toda a lógica de negócio pré-existente continua funcionando sem regressão: extração de rascunho, edição de campos, aviso de duplicidade, salvar, descartar, histórico (listar/restaurar/excluir conversa), nova conversa, upload de anexo, ditado por voz, modos `floating` e `standalone`.
- Nenhum arquivo de backend é alterado.
- Não sobra código morto ou estilos sobrepostos do markup antigo do header/cartão de rascunho após o redesign.

## Perguntas Para o Planejamento

- A paleta de cores deve mudar apenas neste componente (`#0891b2`/`#0EC4D8` do mockup) ou deve alinhar com um design system/tokens de cor já usados em outras telas do `sistema financas`?
- O layout único do mockup (parece um card fixo ~440×800px, estilo mobile) deve virar o novo padrão também para o modo `floating` (painel flutuante no desktop), ou o `floating` mantém proporções próprias?
- A preferência de tamanho de fonte deve ser persistida (ex.: `localStorage`, ou vinculada ao perfil/usuário no backend) ou é aceitável que resete a cada sessão nesta primeira entrega?
- O separador de data deve agrupar mensagens reais por dia (lógica de agrupamento) ou é aceitável, nesta entrega, mostrar apenas "Hoje" fixo enquanto a conversa não tiver mensagens de dias anteriores?
- Existem outras telas do `sistema financas` reutilizando os componentes de UI genéricos (`src/ui/*`) que deveriam ser reaproveitados no redesign do cartão de rascunho (ex.: `card.tsx`, `badge.tsx`), em vez de manter estilos inline no `FinancialAssistant.tsx`?
- O upload de comprovante (PDF) exibido no mockup já reflete o comportamento real do `ocrService.ts`/`pixReader.ts`, ou há expectativa de melhoria na extração que ficaria fora desta task de UI?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz) e `sistema financas/AGENT.md`, além do `CLAUDE.md` do projeto (`sistema financas/CLAUDE.md` e o da raiz), antes de planejar.
- Inspecione [`FinancialAssistant.tsx`](sistema financas/src/components/financial-assistant/FinancialAssistant.tsx) por completo antes de propor a divisão em etapas — é um arquivo grande e a task depende de entender exatamente onde cada seção do mockup mapeia hoje.
- Classifique a implementação como `frontend`.
- Siga a regra do projeto de redesign em duas etapas explícitas no plano: (1) remover/isolar estilo e markup antigos de cada seção afetada, (2) aplicar o novo estilo/markup do mockup — sem deixar código morto ou sobreposto.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations (não deveriam ser necessárias nesta task).
- Gere um plano em `.plans/` (conforme o fluxo `/planejar` → `/implementar` → `/finalizar` definido no `CLAUDE.md` deste projeto) com etapas pequenas, revisáveis e seguras, considerando que o ambiente pode estar apontando para produção mesmo sendo uma alteração apenas de frontend.

---

**Arquivos considerados na elaboração desta task:** `AGENT.md` (raiz), `sistema financas/AGENT.md`, `sistema financas/CLAUDE.md`, `CLAUDE.md` (raiz), e inspeção direta de `FinancialAssistant.tsx`, `AssistantPwaScreen.tsx`, `assistantService.ts`, `financialAssistant.ts` (types), `financialCopilot.ts` (types) e `backend/src/routes/assistant.ts`. Não foi encontrado `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos dedicados dentro de `sistema financas` — o `AGENT.md` único em `sistema financas/AGENT.md` cobre backend/multi-tenant, mas não reflete com precisão a estrutura observada no frontend/backend deste subprojeto (que não parece multi-tenant por prefeitura); isso deve ser levado em conta com cautela durante o planejamento.
