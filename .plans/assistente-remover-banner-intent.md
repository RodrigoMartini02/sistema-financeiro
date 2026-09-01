# Plano de Implementação: Substituir banner de contexto por mensagem no chat do Assistente Financeiro

## Origem

- Arquivo de especificação: conversa com o usuário (feedback sobre a UX das opções iniciais do Assistente Financeiro)
- Data do planejamento: `2026-09-01`
- Classificação: `frontend-only`

## Resumo

Ao clicar em uma das opções iniciais do Assistente Financeiro ("Registrar despesa", "Registrar receita", "Fazer uma pergunta"), hoje aparece uma barra fixa acima do campo de digitação (`activeIntent`, `FinancialAssistant.tsx:934-949`) repetindo o rótulo e a descrição da opção escolhida, com um botão de fechar. Isso quebra a fluidez pretendida do chat, parecendo um banner de notificação em vez de parte da conversa.

Este plano remove essa barra e, no lugar, insere a escolha como uma mensagem no próprio histórico do chat — reaproveitando o estilo de bolha já existente para mensagens de "usuário" — sem alterar o comportamento funcional de `intentHint` (que continua sendo enviado ao backend com a próxima mensagem enviada).

## Escopo

### Dentro do escopo

- Remover o bloco de barra de contexto (`activeIntent`, linhas ~934-949 de `FinancialAssistant.tsx`).
- Ao clicar em uma das três opções iniciais (`selectIntent`), além de definir `intentHint` (comportamento já existente, mantido), adicionar uma nova mensagem ao histórico do chat (`setMessages`) com `role: 'user'`, reaproveitando o estilo de bolha de usuário já existente, com o texto do `label` da intenção (ex.: "Registrar despesa").
- Cada clique em uma opção adiciona uma nova mensagem ao histórico, sem remover ou substituir mensagens anteriores — se o usuário trocar de opção antes de enviar, o histórico mostra a sequência de escolhas.
- Manter o comportamento já existente de `intentHint`: enviado ao backend junto da próxima mensagem real do usuário (`sendFinancialCopilotMessage`), resetado após o envio.
- Manter o `composerPlaceholder` dinâmico (placeholder do campo de texto muda conforme a intenção ativa) — já funciona hoje e continua sendo o indicador de "qual intenção está ativa para a próxima mensagem".

### Fora do escopo

- Qualquer mudança na lógica de backend (`sendFinancialCopilotMessage`, rota do copiloto) — `intentHint` continua sendo enviado exatamente como hoje.
- Criar um novo tipo de mensagem "sistema" no `ChatRole` — a mensagem de intenção reaproveita o estilo de "usuário" já existente, conforme decisão do usuário.
- Alterar o conteúdo/textos das três opções iniciais (`INTENT_DETAILS`).
- Persistir essas mensagens de intenção na conversa salva no backend (avaliar se `sendFinancialCopilotMessage`/histórico de conversas já lida bem com mensagens locais que não passam pelo backend antes de decidir se isso precisa de tratamento — ver riscos).

## Leitura de contexto

- `/AGENT.md`, `sistema financas/CLAUDE.md` — sequência obrigatória `/planejar → aprovação → /implementar → /finalizar`.
- Não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- `src/components/financial-assistant/FinancialAssistant.tsx`:
  - `INTENT_DETAILS` (linhas 88-108) — rótulo/descrição/placeholder de cada intenção.
  - `selectIntent` (linhas 339-344) — função chamada ao clicar em uma opção inicial.
  - `activeIntent`/barra de contexto (linhas 313, 934-949) — bloco a remover.
  - Botões de opção inicial (`onClick={() => selectIntent(...)}`, linhas ~721, 729, 737).
  - Renderização de mensagens (`message.role === 'user'`, linhas 704-712) — estilo de bolha a reaproveitar.
  - `ChatMessage` interface (linhas 34-42) — estrutura de mensagem já usada.
  - `handleSend`/envio de mensagem (linhas ~395-419) — onde `intentHint` é enviado ao backend e resetado.

## Impacto por área

### Frontend

- `src/components/financial-assistant/FinancialAssistant.tsx`:
  - Remover o bloco JSX da barra de contexto (`activeIntent && (...)`, linhas 934-949).
  - Modificar `selectIntent` para, além de `setIntentHint(nextIntent)`, adicionar uma mensagem ao array `messages` com `role: 'user'` e `content` igual ao `label` da intenção (ex.: `INTENT_DETAILS[nextIntent].label`).
  - Gerar `id`/`createdAt` para a nova mensagem seguindo o mesmo padrão já usado em outras inserções de mensagem no componente (`newMessageId()`, `new Date().toISOString()`).
  - Nenhuma mudança de query key, hook ou service — a alteração é inteiramente de estado local do componente.
  - Sem novos estados de loading/error.
  - Sem testes automatizados nesta área do projeto (confirmado em investigações anteriores) — validação manual obrigatória.

### Backend

`Sem impacto esperado` — nenhuma rota ou contrato de API é alterado; `intentHint` continua sendo enviado da mesma forma.

### Banco de dados

`Sem impacto esperado`. Nenhuma migration necessária.

## Arquivos provavelmente afetados

- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx`

## Estratégia de implementação

1. Remover o bloco JSX da barra de contexto (`activeIntent`) do rodapé do chat.
2. Modificar `selectIntent` para inserir uma mensagem de usuário no histórico local (`messages`) com o rótulo da intenção escolhida, antes ou junto de `setIntentHint`.
3. Confirmar visualmente que `composerPlaceholder` continua mudando corretamente e que `intentHint` ainda é enviado ao backend na mensagem seguinte.
4. Rodar `npx tsc --noEmit` e `npm run build`.
5. Validação manual: clicar em cada uma das três opções iniciais, confirmar que a mensagem aparece no histórico como bolha de usuário, sem a barra antiga; trocar de opção múltiplas vezes antes de enviar e confirmar que o histórico acumula as escolhas; enviar uma mensagem real e confirmar que o comportamento do assistente (resposta considerando a intenção) continua correto.

## Regras de negócio identificadas

- `intentHint` continua sendo um valor efêmero: é definido ao clicar em uma opção, enviado com a próxima mensagem real do usuário, e resetado para `null` após o envio — nenhuma mudança nessa regra.
- A nova mensagem de intenção no histórico é puramente visual/local — não corresponde a uma mensagem real trocada com o backend, apenas registra a escolha do usuário na interface.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Mudança é puramente de interface, sem novos dados sensíveis ou chamadas de rede.

## Validações necessárias

Nenhuma validação de input nova — mudança de exibição e fluxo de interação local ao componente.

## Testes necessários

### Frontend

Não há suíte de testes automatizados nesta área do projeto — validação manual obrigatória, conforme detalhado no passo 5 da estratégia de implementação.

### Backend

`Sem impacto esperado`.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npx tsc --noEmit
npm run build
```

## Riscos e pontos de atenção

- A nova mensagem de intenção existe apenas no estado local do componente (array `messages` em memória) — se a conversa for recarregada a partir do histórico salvo no backend (`fetchFinancialCopilotConversation`) antes do envio da próxima mensagem real, essa mensagem de intenção pode desaparecer (já que não foi persistida). Isso é aceitável como comportamento esperado (a escolha de intenção é um estado transitório da sessão atual), mas vale confirmar visualmente que não há efeito colateral estranho ao trocar de conversa ou recarregar.
- Reaproveitar o estilo de bolha "usuário" para uma mensagem que não passou pelo backend pode, em teoria, gerar confusão se o histórico for comparado com o que está salvo no servidor — como a mensagem só aparece antes do primeiro envio real da conversa, o risco prático é baixo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões já confirmadas com o usuário (integrar como mensagem no chat, manter histórico acumulado ao trocar de opção, reaproveitar estilo de bolha do usuário).

## Critérios de aceite do plano

- A barra fixa de contexto (banner) não aparece mais acima do campo de digitação.
- Ao clicar em uma das três opções iniciais, uma mensagem com o rótulo da opção aparece no histórico do chat, no estilo de bolha de usuário.
- Trocar de opção antes de enviar acumula as mensagens no histórico, sem remover as anteriores.
- `intentHint` continua sendo enviado corretamente ao backend na mensagem seguinte, com o mesmo comportamento de hoje.
- O placeholder do campo de texto continua mudando conforme a intenção ativa.
- `npx tsc --noEmit` e `npm run build` passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/CLAUDE.md` (sequência `/planejar → aprovação → /implementar → /finalizar`).
- Não alterar nenhuma lógica de backend ou contrato de API — a mudança é inteiramente de interface.
- Não criar um novo tipo de `ChatRole` — reaproveitar o estilo de "usuário" já existente.
- Nenhuma migration ou alteração de `.env` é necessária ou permitida neste plano.
