# Plano de Implementação: Redesenhar aparência e ajustar funções do Assistente Financeiro (chat)

## Origem

- Arquivo de especificação: `.portal/tasks/redesenhar-assistente-financeiro-chat.md`
- Data do planejamento: `2026-08-17`
- Classificação: `frontend-only`

## Resumo

O `sistema financas` já possui um assistente financeiro de chat completo e funcional (`FinancialAssistant.tsx`, ~960 linhas) com backend robusto (extração de rascunho, nível de confiança, aviso de duplicidade, histórico de conversas, OCR/leitor PIX, ditado por voz). O usuário forneceu um mockup visual com aparência e alguns comportamentos de UI diferentes do implementado hoje. Esta implementação redesenha o componente para aproximar do mockup — header com menu ⋮ agrupado, seletor de tamanho de fonte persistido, separador de data com agrupamento real, cartão de anexo mais rico, indicador "digitando..." com pontinhos, cartão de rascunho em estilo "linha tocável" reaproveitando `Card`/`Badge` existentes, paleta de cor ajustada localmente, e layout unificado entre os modos `floating` e `standalone` — sem alterar nenhuma lógica de negócio, contrato de API ou arquivo de backend.

## Escopo

### Dentro do escopo

- Redesenhar o header do assistente: avatar, título, menu ⋮ (via `KebabMenu` estendido) agrupando "Conversas anteriores", "Nova conversa", "Abrir painel financeiro".
- Adicionar seletor de tamanho de fonte (Pequeno/Médio/Grande) dentro do menu do header, persistido em `localStorage`, aplicando escala visual à área de mensagens.
- Estender `src/ui/KebabMenu.tsx` com uma prop opcional (`footer?: ReactNode`) para acomodar o seletor de fonte, sem alterar o comportamento dos consumidores existentes.
- Adicionar `createdAt` a cada mensagem do chat (`ChatMessage`) e implementar agrupamento real por dia com separadores ("Hoje", "Ontem", data formatada).
- Redesenhar a bolha de anexo do usuário como cartão (ícone, nome, tamanho em KB, indicador de "enviado"), reaproveitando `Card` de `src/ui/`.
- Trocar o indicador de espera (`LoaderCircle` + texto) por 3 pontinhos animados + "digitando...".
- Redesenhar o cartão de confirmação de transação (draft) em estilo "linha tocável", reaproveitando `Card` (wrapper) e `Badge` (nível de confiança) de `src/ui/`, preservando os mesmos campos e handlers (`updateDraft`).
- Renomear/recolorir os botões de ação do cartão: "Confirmar R$ X" → "Sim, salvar R$ X" (verde), "Descartar rascunho" → "Não salvar", mantendo `handleSave`/`discardDraft` intactos.
- Ajustar a paleta de cor local ao `FinancialAssistant.tsx` (e novos subcomponentes), aproximando de `#0891b2`/`#0e7490`/`#0EC4D8`, sem criar token global nem tocar outras telas.
- Unificar as proporções/layout entre os modos `floating` e `standalone`, aplicando o redesign do mockup em ambos.
- Preservar 100% do comportamento funcional já existente: extração de rascunho, edição inline, aviso de duplicidade, confirmação explícita antes de salvar, histórico de conversas (listar/restaurar/excluir), nova conversa, upload de anexos, ditado por voz.

### Fora do escopo

- Qualquer alteração em backend: `routes/assistant.ts`, `financialAssistant.ts`, `financialCopilot.ts`, `copilotIntent.ts`, `ocrService.ts`, `pixReader.ts`, `aiProvider.ts`.
- Trocar o motor de extração de transação (regras vs. IA/LLM).
- Melhorar a qualidade do OCR/leitor de comprovantes — já reflete o comportamento real esperado pelo mockup, segundo confirmação do usuário.
- Persistir a preferência de tamanho de fonte no backend/perfil do usuário — fica em `localStorage` nesta entrega.
- Criar nova rota de navegação/entrypoint além dos dois já existentes (`floating` via bolha, `standalone` via `assistant.html`).
- Alterar schema do banco (`copilot.ts`, `aiSessions.ts`) ou qualquer migration.
- Criar token de cor global reaproveitável por outras telas — mudança de paleta fica local ao componente.

## Leitura de contexto

- `/AGENT.md` (raiz) — regras de workflow (`/planejar` → aprovação → `/implementar` → `/finalizar`), contexto multi-tenant/RLS que **não se aplica** a este subprojeto (o `sistema financas` não segue esse modelo, conforme observado na investigação).
- `sistema financas/AGENT.md` — mesmo conteúdo do AGENT.md raiz (regras de backend multi-tenant/Drizzle que não se aplicam a esta implementação frontend-only).
- `sistema financas/CLAUDE.md` e `CLAUDE.md` (raiz) — regra obrigatória de sequência `/planejar` → aprovação → `/implementar` → `/finalizar`, sem PR, merge direto em `main` após confirmação.
- `.portal/tasks/redesenhar-assistente-financeiro-chat.md` — especificação de entrada desta implementação.
- Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` dedicados dentro de `sistema financas`.
- Arquivos de código inspecionados: `FinancialAssistant.tsx`, `AssistantPwaScreen.tsx`, `assistantService.ts`, `financialAssistant.ts` (types), `financialCopilot.ts` (types), `backend/src/routes/assistant.ts`, `src/ui/KebabMenu.tsx`, `src/ui/badge.tsx`, `src/ui/card.tsx`, `src/ui/zIndex.ts`, `package.json`, `tsconfig.json`.

## Impacto por área

### Frontend

- **`src/ui/KebabMenu.tsx`**: adicionar prop opcional `footer?: ReactNode`, renderizado após a lista de `actions` dentro do dropdown existente. Comportamento atual (fechar ao clicar fora, `Z_DROPDOWN`, estilos) preservado; ausência de `footer` não muda nada para os consumidores atuais — **verificar todos os usos existentes de `KebabMenu` no projeto antes de alterar, para confirmar que a extensão é não-destrutiva**.
- **Novo: `src/components/financial-assistant/FontSizeSelector.tsx`**: componente pequeno com 3 opções (P/M/G), lê/grava `localStorage` (chave sugerida: `assistant:fontSize`), expõe valor e setter via prop callback para o componente pai aplicar a escala.
- **`src/components/financial-assistant/FinancialAssistant.tsx`** (principal):
  - Header: substituir botões soltos de histórico/nova conversa/painel por `KebabMenu` com essas 3 ações + `FontSizeSelector` no `footer`.
  - Tipo `ChatMessage`: adicionar campo `createdAt: string`, preenchido em todo `push` de mensagem nova e ao restaurar histórico (usar `message.createdAt` de `FinancialCopilotStoredMessage`, que já existe no tipo).
  - Nova função de agrupamento (`groupMessagesByDay` ou equivalente) inserindo separadores de data na renderização da lista.
  - Bolha de anexo do usuário: novo bloco em formato de cartão (ícone, nome, tamanho formatado em KB, indicador de "enviado"), usando `Card`.
  - Indicador de espera: substituir `LoaderCircle` por 3 pontinhos animados + texto "digitando...".
  - Cartão de rascunho: reestruturar com `Card` (wrapper) e `Badge` (badge de confiança), campos em estilo "linha tocável", preservando os mesmos `input`/`select`/checkbox e o handler `updateDraft`.
  - Botões do cartão: renomear textos e ajustar cor (verde para salvar), mantendo `handleSave`/`discardDraft`.
  - Paleta: substituir ocorrências de `#0C9EAF`/`#087B89` pela aproximação `#0891b2`/`#0e7490`/`#0EC4D8` dentro deste arquivo e dos novos subcomponentes.
  - Layout: unificar proporções entre os blocos condicionados por `isStandalone`, aplicando o layout do mockup aos dois modos.
  - Remover, seção por seção, o markup/classes antigos antes de aplicar os novos — sem sobreposição ou código morto remanescente.
- **Possíveis novos arquivos** (a confirmar durante a implementação, dado o tamanho do arquivo principal): `AttachmentCard.tsx`, `DraftReviewCard.tsx`, `DateSeparator.tsx` dentro de `src/components/financial-assistant/`.
- **`src/screens/assistant/AssistantPwaScreen.tsx`**: só é tocado se o wrapper `standalone` precisar de ajuste após a unificação de layout.
- Estados de loading/error/empty: preservar todos os já existentes (`isPreparing`, `isSaving`, `error`, estados vazios do histórico) — apenas o estilo visual do indicador de espera muda, não a lógica de exibição.
- Testes frontend: não há suíte de testes no projeto (`package.json` só tem `dev`/`build`/`preview`); validação será manual (ver seção de Testes).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/ui/KebabMenu.tsx`
- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx`
- `sistema financas/src/components/financial-assistant/FontSizeSelector.tsx` (novo)
- `sistema financas/src/components/financial-assistant/AttachmentCard.tsx` (novo, se extraído)
- `sistema financas/src/components/financial-assistant/DraftReviewCard.tsx` (novo, se extraído)
- `sistema financas/src/components/financial-assistant/DateSeparator.tsx` (novo, se extraído)
- `sistema financas/src/screens/assistant/AssistantPwaScreen.tsx` (condicional)

## Estratégia de implementação

1. Buscar todos os usos existentes de `KebabMenu` no projeto para confirmar que adicionar a prop `footer?: ReactNode` é seguro e não-destrutivo.
2. Estender `src/ui/KebabMenu.tsx` com a prop `footer`, renderizada após a lista de `actions`, sem alterar comportamento quando ausente.
3. Criar `FontSizeSelector.tsx`: 3 opções (P/M/G), leitura/escrita em `localStorage` (`assistant:fontSize`), callback para o pai aplicar a escala.
4. No `FinancialAssistant.tsx`, adicionar estado de tamanho de fonte inicializado a partir do `localStorage`, aplicar escala na área de mensagens.
5. Reescrever o header: avatar, título, `KebabMenu` com as 3 ações + `FontSizeSelector` como `footer`, removendo os botões soltos antigos (histórico/nova conversa/painel) e seu markup.
6. Adicionar `createdAt: string` ao tipo `ChatMessage`; preencher em todo `push` de mensagem nova (`new Date().toISOString()`) e ao restaurar histórico via `message.createdAt`.
7. Implementar função de agrupamento por dia e inserir separadores de data na renderização da lista de mensagens.
8. Redesenhar a bolha de anexo do usuário como cartão (`Card` + ícone + nome + tamanho em KB + indicador de enviado), substituindo a linha de texto simples atual.
9. Trocar o indicador de espera (`LoaderCircle` + "Consultando seus dados...") por 3 pontinhos animados + "digitando...".
10. Reestruturar o cartão de rascunho: envolver em `Card`, usar `Badge` para o nível de confiança, converter os campos para estilo "linha tocável" mantendo os mesmos `input`/`select`/checkbox e o handler `updateDraft` por trás.
11. Renomear e recolorir os botões de ação do cartão ("Sim, salvar R$ X" / "Não salvar"), mantendo `handleSave`/`discardDraft` sem alteração de lógica.
12. Substituir as ocorrências de cor (`#0C9EAF`/`#087B89`) pela nova paleta local (`#0891b2`/`#0e7490`/`#0EC4D8`) em todo o arquivo e novos subcomponentes.
13. Unificar as classes condicionadas por `isStandalone` para que o layout do mockup se aplique igualmente aos modos `floating` e `standalone`, ajustando `AssistantPwaScreen.tsx` se necessário.
14. Revisar cada seção alterada para remover markup/classes antigos remanescentes (sem código morto ou estilos sobrepostos).
15. Validar manualmente via `npm run dev` (ver seção de Testes) nos dois modos.
16. Rodar `npm run build` para validar tipos e build de produção.

## Regras de negócio identificadas

- Nada é salvo como receita/despesa sem confirmação explícita do usuário no cartão de rascunho (clique em "Sim, salvar").
- O nível de confiança da leitura (`draft.confidence`: `high`/`medium`/`low`) já determina o badge exibido — não deve ser recalculado ou alterado nesta implementação, apenas reestilizado.
- O aviso de possível duplicidade (`findDuplicate`) compara descrição normalizada, valor e data contra receitas/despesas do mês corrente antes de salvar — lógica preservada integralmente.
- O modo `floating` abre como bolha flutuante fechável; o modo `standalone` é sempre aberto (PWA de tela cheia) — essa diferença de abertura/fechamento é preservada mesmo com layout visual unificado.
- Upload de anexos limitado a 3 arquivos por mensagem, 10 MB cada, tipos aceitos (`application/pdf`, `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `text/plain`) — inalterado.

## Regras multi-tenant e segurança

- Este subprojeto não segue o modelo multi-prefeitura/RLS descrito nos `AGENT.md` de nível mais alto; o isolamento relevante aqui é por `perfil_id`, já tratado em `assistantService.ts` via `getActiveProfileId()`.
- Nenhuma query, chamada de API ou lógica de acesso a dados é criada ou alterada nesta implementação — o risco de vazamento entre perfis é baixo, pois o trabalho é puramente de apresentação sobre dados já buscados pelos hooks existentes (`useQuery`).
- Se algum subcomponente novo vier a manipular `conversationId`/`perfil_id` diretamente (não previsto no plano atual), isso deve ser sinalizado durante a implementação antes de prosseguir.

## Validações necessárias

- Nenhuma validação de formulário nova é introduzida — os campos do rascunho (`description`, `amount`, `date`/`dueDate`, `category`, `paymentMethod`, `paid`) continuam validados pelas mesmas regras de `handleSave` (descrição e valor obrigatórios, valor > 0, data obrigatória).
- Validar que a extensão de `KebabMenu` com `footer` não quebra tipagem TypeScript dos consumidores existentes (`strict: true`, `noUnusedLocals`, `noUnusedParameters` no `tsconfig.json`).

## Testes necessários

### Frontend

Não há suíte de testes automatizados no projeto. Validação manual via `npm run dev`, cobrindo nos dois modos (`floating` e `standalone`):

- Enviar mensagem de texto simples.
- Enviar mensagem com anexo (verificar novo cartão de anexo: ícone, nome, tamanho, indicador de enviado).
- Ver o cartão de rascunho aparecer após resposta com `mode: 'draft'`, badge de confiança correto.
- Editar cada campo do rascunho (tipo, descrição, valor, data, categoria, forma de pagamento, checkbox "já foi paga").
- Ver aviso de duplicidade quando aplicável.
- Salvar rascunho ("Sim, salvar R$ X") e confirmar que a receita/despesa é criada corretamente no dashboard.
- Descartar rascunho ("Não salvar").
- Abrir menu ⋮, testar cada ação: "Conversas anteriores" (abrir histórico, restaurar conversa, excluir conversa), "Nova conversa", "Abrir painel financeiro".
- Alternar tamanho de fonte (P/M/G) e confirmar persistência após recarregar a página.
- Verificar separador de data aparecendo corretamente ao ter mensagens de dias diferentes (pode exigir restaurar uma conversa antiga do histórico para validar agrupamento real).
- Testar ditado por voz (em navegador compatível).
- Verificar indicador "digitando..." durante espera de resposta.
- Conferir que o layout unificado funciona corretamente em telas largas (`floating`) e estreitas (`standalone`/mobile).

### Backend

Não aplicável — sem alteração de backend nesta implementação.

### E2E

Não aplicável — nenhuma suíte E2E identificada cobrindo o assistente.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas" run dev
```

Observação: o projeto não possui scripts `lint` ou `test` dedicados no `package.json`; `npm run build` executa o build de produção via Vite, o que inclui verificação de tipos TypeScript (`noEmit: true`, `strict: true` no `tsconfig.json`).

## Riscos e pontos de atenção

- Estender `KebabMenu.tsx` é uma mudança em componente compartilhado — mapear todos os consumidores existentes antes de alterar, para garantir que nenhum outro uso quebre.
- Ausência de testes automatizados de frontend — toda a validação depende de teste manual cuidadoso cobrindo os fluxos listados acima.
- Unificar layout `floating`/`standalone` pode exigir mais ajuste de responsividade do que o previsto inicialmente, já que hoje o `floating` é dimensionado como painel ancorado (`sm:bottom-5 sm:right-5 sm:h-[...] sm:w-[420px]`) e o mockup é um card fixo estilo mobile — testar cuidadosamente em viewport desktop.
- Arquivo principal já é grande (~960 linhas); mesmo extraindo subcomponentes, a superfície de revisão é considerável — recomendável revisar/implementar em partes menores e testar incrementalmente.
- Adicionar `createdAt` ao `ChatMessage` e implementar agrupamento por dia é a decisão mais "funcional" deste plano (não é puramente visual) — atenção redobrada para não introduzir bugs de fuso horário ou ordenação ao formatar/agrupar datas.
- Nenhum risco de vazamento multi-tenant identificado, dado que nenhuma query ou chamada de API é criada.
- Nenhum risco de migration ou schema.
- Ambiente pode estar apontando para produção mesmo sendo alteração apenas de frontend — validar visualmente com cautela antes de considerar a tarefa concluída, especialmente o fluxo de salvar rascunho (que grava dados reais).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões relevantes foram resolvidas durante o planejamento (paleta local, layout unificado, fonte persistida, agrupamento real de data, reuso de `Card`/`Badge`, OCR já reflete comportamento real, `KebabMenu` estendido com `footer`).

## Critérios de aceite do plano

- O header do assistente exibe avatar, título e um único botão de menu (⋮) agrupando "Conversas anteriores", "Nova conversa" e "Abrir painel financeiro", com seletor de tamanho de fonte no mesmo menu.
- O tamanho de fonte selecionado persiste após fechar/reabrir o assistente ou recarregar a página.
- A lista de mensagens exibe separadores de data reais (agrupamento por dia, não apenas "Hoje" fixo).
- Anexos enviados pelo usuário aparecem em formato de cartão com nome, tamanho e indicador de envio.
- O indicador de espera do assistente usa estilo "digitando..." com pontinhos animados.
- O cartão de confirmação de transação segue o estilo "linha tocável" do mockup, reaproveitando `Card`/`Badge` de `src/ui/`.
- Os botões de ação do cartão exibem "Sim, salvar [valor]" e "Não salvar", com o mesmo comportamento de salvar/descartar já existente.
- O layout visual é consistente entre os modos `floating` e `standalone`.
- Toda a lógica de negócio pré-existente continua funcionando sem regressão (checklist de testes manuais acima).
- Nenhum arquivo de backend é alterado.
- `KebabMenu.tsx` permanece funcional para todos os seus outros consumidores no projeto.
- Não sobra código morto ou estilos sobrepostos do markup antigo após o redesign.
- `npm run build` conclui sem erros de tipo ou build.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto da task original em `.portal/tasks/redesenhar-assistente-financeiro-chat.md`.
- Seguir a sequência do `CLAUDE.md` do projeto: implementar só após esta aprovação já concedida; ao final, `/finalizar` cuidará de commit + push + pergunta sobre merge em `main` (sem PR, merge direto).
- Não executar migrations — não deveriam ser necessárias nesta implementação, mas caso surja qualquer necessidade de schema, parar e reportar antes de prosseguir.
- Antes de tocar `KebabMenu.tsx`, buscar e revisar todos os seus consumidores atuais no projeto.
- Implementar em etapas pequenas e testáveis, na ordem da "Estratégia de implementação" acima, testando manualmente conforme cada seção é concluída, não só ao final.
- Ao remover markup/estilo antigo de cada seção, fazer isso como parte da mesma etapa que introduz o novo — não deixar para uma limpeza posterior.
- Rodar `npm --prefix "sistema financas" run build` ao final para validar tipos e build.
- Manter todas as strings visíveis ao usuário em português; nomes de novos componentes/variáveis em inglês, seguindo a convenção do projeto.
