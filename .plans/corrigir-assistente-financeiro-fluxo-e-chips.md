# Plano de Implementação: Corrigir Fluxo do Assistente Financeiro e Redesenhar Chips Iniciais

## Origem

- Arquivo de especificação: conversa — bug relatado pelo usuário com screenshots, investigado via agente Explore (2026-09-13)
- Data do planejamento: `2026-09-13`
- Classificação: `backend + frontend`

## Resumo

O usuário relatou que o Assistente Financeiro (chat) "trava" no meio de um fluxo de lançamento, respondendo com uma mensagem genérica de ajuda sem relação com a conversa. Reproduzido via investigação de código (sem alteração):

1. **Bug do travamento** (prioridade alta): `runFinancialCopilot` (`backend/src/services/financialCopilot.ts`) classifica a intenção da mensagem (`inferDeterministicCopilotIntent`) **antes** de checar se existe uma sessão de preenchimento de slots (`slotState`/`pendingSlot`) ativa. Uma resposta curta como "sim" durante o fluxo de registro não bate com nenhum padrão de registro nem de pergunta, é classificada como `intent: 'help'`, e cai na mensagem genérica de fallback definida nas linhas 632-641 do mesmo arquivo — abandonando o fluxo de slots em andamento, que sabia exatamente qual pergunta estava pendente.

2. **Bug do valor/descrição malformada** (prioridade média): os extratores de valor em `financialAssistant.ts` (`extractAmountFromText`, `extractTrailingNumericAmount`) e `assistantSlotParser.ts` (`extractAmountBeforePaymentMethod`, `spokenAfterVerb` dentro de `seedDraftFromMessage`) exigem a grafia exata "reais" adjacente ao número. Com o typo "reias" na frase do usuário ("150 reias hoje no pix"), nenhum regex de valor casa — o valor nunca é extraído, e o número+typo ficam absorvidos na descrição. A função de limpeza (`cleanDescription`, `assistantSlotParser.ts:348-374`) remove corretamente "reais" mas não "reias" (linha 357-358), então o typo sobrevive até a mensagem de confirmação mostrada ao usuário ("Entendi que é 'mercado de reias'").

3. **Ajuste de UI dos chips iniciais**: o card de boas-vindas (`FinancialAssistant.tsx`, mensagem `'welcome'`) renderiza os botões de ação (`WELCOME_ACTIONS`, linhas 810-822) como botões grandes empilhados verticalmente com fundo preenchido — visualmente um formulário, não um chat. As respostas rápidas de cada pergunta do fluxo de slots (`quickReplies`, linhas 847-861) já usam um estilo de pill inline (`rounded-full`, `flex-wrap`), mais conversacional. O usuário quer que os chips iniciais sigam esse segundo padrão.

## Escopo

### Dentro do escopo

- `backend/src/services/financialCopilot.ts`: antes da chamada a `inferDeterministicCopilotIntent` (linha ~511), checar se `input.slotState?.pendingSlot` está ativo. Se estiver **e** a mensagem não parecer uma pergunta nova (reaproveitando a lógica de `isQuestion`), forçar `intent = 'register'` diretamente e seguir para `runSlotFlow`, sem passar pela classificação genérica.
- `backend/src/services/copilotIntent.ts`: exportar `isQuestion` (hoje função privada, linha 14-17) para reutilização em `financialCopilot.ts`.
- `backend/src/services/financialAssistant.ts` e `backend/src/services/assistantSlotParser.ts`: adicionar uma normalização pontual que trata a transposição de letras `reias→reais` antes de qualquer extração de valor/descrição, aplicada uma vez no início do pipeline (não um corretor ortográfico genérico — apenas essa variante comum e específica).
- `src/components/financial-assistant/FinancialAssistant.tsx`: restilizar os botões de `WELCOME_ACTIONS` (linhas 810-822) para o mesmo padrão visual de pill/chip inline usado em `quickReplies` (linhas 847-861) — `rounded-full`, `flex-wrap`, padding reduzido, em vez de `flex flex-col`/`w-full`/`rounded-lg`.

### Fora do escopo

- Correção ortográfica genérica ou uso de LLM/fuzzy-matching para tolerância a qualquer typo — apenas a variante específica `reias↔reais` identificada.
- Mudanças no fluxo de anexos/OCR (`createFinancialAssistantDraft`) — o bug é exclusivo do fluxo conversacional de slots (sem anexo).
- Mudanças em `assistantToolRunner.ts`/caminho de LLM para consultas — não relacionado aos bugs relatados.
- Testes automatizados novos — a investigação não encontrou suíte de testes existente para este módulo; criar uma do zero seria expandir escopo além do que foi pedido (a confirmar durante a implementação se algum teste mínimo faz sentido).
- Qualquer alteração em `assistantSlotFilling.ts` (ordem/definição dos slots) — não é a causa do bug.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — mesma ressalva de planos anteriores nesta sessão: documentos genéricos multi-prefeitura/RLS que não correspondem à arquitetura real deste projeto. Princípios de código aplicados: nomes claros, sem `any`, não mascarar erros, seguir padrões existentes.
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados dentro de `sistema financas/`.
- Investigação de código realizada via agente Explore nesta sessão, cobrindo: `backend/src/services/financialCopilot.ts` (654 linhas, lido integralmente na região relevante), `backend/src/services/copilotIntent.ts` (51 linhas, lido integralmente), `backend/src/services/assistantSlotSession.ts`, `backend/src/services/assistantSlotFilling.ts`, `backend/src/services/assistantSlotParser.ts` (lido nas regiões relevantes: `cleanDescription`, `seedDraftFromMessage`, `extractAmountBeforePaymentMethod`, conjunto `AFFIRMATIVE`/`NEGATIVE`), `backend/src/services/financialAssistant.ts` (lido nas regiões relevantes: `extractAmountFromText`, `extractDescription`, `inferKind`), `src/components/financial-assistant/FinancialAssistant.tsx` (lido nas regiões relevantes: renderização de mensagens, `WELCOME_ACTIONS`, `quickReplies`), `src/services/assistantService.ts`, `backend/src/routes/assistant.ts`.

## Impacto por área

### Frontend

- **`src/components/financial-assistant/FinancialAssistant.tsx`**:
  - Linhas 810-822: trocar as classes CSS dos botões de `WELCOME_ACTIONS` de `flex w-full items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-left text-sm font-semibold ...` para o padrão de `quickReplies` (linha 855): `rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold ...`.
  - Trocar o container de `flex flex-col gap-1.5` (linha 810) para `flex flex-wrap gap-1.5` (igual à linha 848), permitindo que os chips fiquem lado a lado quando couberem.
  - Preservar o ícone de cada ação (`icon` em `WELCOME_ACTIONS`) dentro do novo estilo compacto.
  - Ajustar o `max-w-[94%]` (linha 790, usado quando `showWelcomeActions` é true) se necessário — a um estilo mais compacto de chip, a largura extra pode não ser mais necessária, mas isso será avaliado durante a implementação para não quebrar o layout em telas estreitas.
- Nenhuma mudança de lógica de estado, apenas classes visuais.
- Nenhum novo endpoint ou query — o componente já consome `assistantService.ts` sem alteração de contrato.

### Backend

- **`backend/src/services/copilotIntent.ts`**: exportar `isQuestion` (remover o modificador implícito de privado, adicionar `export`).
- **`backend/src/services/financialCopilot.ts`**:
  - Antes da linha 511 (`let intent = inferDeterministicCopilotIntent(...)`), adicionar a checagem: se `input.slotState?.pendingSlot` existir e `!isQuestion(normalizeText(input.message))` for verdadeiro, definir `intent = 'register'` diretamente (pulando a chamada a `inferDeterministicCopilotIntent` nesse caminho, ou chamando-a apenas para log/consistência mas sobrescrevendo o resultado).
  - Deve continuar funcionando corretamente o caminho já existente onde `intentHint` está setado (primeira mensagem após clicar num chip) — a nova checagem é adicional, não substitui a lógica de `intentHint`.
- **`backend/src/services/financialAssistant.ts`** e **`backend/src/services/assistantSlotParser.ts`**:
  - Adicionar uma função de normalização (ex: `normalizeCommonTypos` ou incorporar em `normalizeAssistantInputText`/`normalize`) que substitui a sequência `reias` por `reais` (case-insensitive, word-boundary) antes de qualquer extração de valor ou descrição.
  - Aplicar essa normalização no ponto de entrada do texto do usuário (idealmente uma única vez, próximo a `normalizeAssistantInputText`, para que todos os extratores downstream se beneficiem sem precisar de mudança individual em cada regex).
- Nenhuma mudança de rota (`backend/src/routes/assistant.ts`) — o contrato de request/response permanece o mesmo.

### Banco de dados

`Sem impacto esperado` — nenhuma tabela, coluna ou migration envolvida.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/services/financialCopilot.ts`
- `sistema financas/backend/src/services/copilotIntent.ts`
- `sistema financas/backend/src/services/financialAssistant.ts`
- `sistema financas/backend/src/services/assistantSlotParser.ts`
- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx`

## Estratégia de implementação

1. **Backend — Bug 1 (prioridade alta)**:
   - Exportar `isQuestion` em `copilotIntent.ts`.
   - Em `financialCopilot.ts`, adicionar a checagem de `slotState` ativo antes da classificação de intenção, com a exceção de pergunta explícita.
   - Validar mentalmente/manualmente o cenário do bug relatado: "sim" após "Entendi que é X, certo?" deve ir para `runSlotFlow`.
2. **Backend — Bug 2 (prioridade média)**:
   - Implementar a normalização pontual `reias→reais`.
   - Aplicar no ponto de entrada do texto (antes de `extractAmountFromText`, `extractDescription`, `seedDraftFromMessage`, `cleanDescription`).
   - Validar mentalmente/manualmente que "150 reias hoje no pix" agora extrai `amount: 150` e não deixa "reias" na descrição.
3. **Frontend — ajuste de UI**:
   - Trocar as classes dos botões de `WELCOME_ACTIONS` para o padrão pill/chip.
   - Verificar visualmente (rodando o dev server) que o card de boas-vindas parece mais conversacional.
4. **Validação**:
   - Rodar `tsc --noEmit` no backend e no frontend.
   - Rodar `vite build` no frontend.
   - Testar manualmente o fluxo completo do assistente (subir backend + frontend, reproduzir a conversa do bug report) para confirmar que os dois bugs foram corrigidos.

## Regras de negócio identificadas

- Uma sessão de preenchimento de slots ativa (`pendingSlot` não nulo) deve ter prioridade sobre a classificação genérica de intenção, exceto quando a mensagem é claramente uma pergunta nova.
- O typo `reias` deve ser interpretado como `reais` em qualquer ponto do pipeline de extração de valor/descrição.
- Os chips iniciais do assistente devem ter a mesma linguagem visual das respostas rápidas do restante da conversa.

## Regras multi-tenant e segurança

Não aplicável a este plano — nenhuma query nova, nenhuma alteração de autorização ou dados entre contas/usuários. As correções são de lógica de conversação e estilo visual, sem tocar em `usuario_id`/`conta_id`/permissões.

## Validações necessárias

- Nenhuma validação de input nova é necessária — as correções operam sobre texto já recebido e validado pelas rotas existentes.

## Testes necessários

### Frontend

- Verificar visualmente que os chips iniciais aparecem como pills inline, consistentes com as respostas rápidas do resto da conversa.
- Confirmar que os três chips (Lançar despesa / Lançar receita / Consultar) continuam funcionalmente idênticos (mesmo `onClick`/`selectIntent`).

### Backend

- Reproduzir manualmente a conversa do bug report: "Lançar despesa" → "fiz compra no mercado de 150 reias hoje no pix" → confirmar que a descrição não vem com o typo (idealmente "mercado" ou similar, sem "reias") e que o valor é reconhecido como 150 → responder "sim" → confirmar que o fluxo continua pedindo a próxima informação pendente (categoria, forma de pagamento, etc.), sem cair na mensagem genérica de ajuda.
- Testar que uma pergunta legítima no meio do fluxo (ex: "quanto gastei esse mês?") ainda é respondida como consulta, não é engolida pelo slot pendente.

### E2E

- Fluxo completo: iniciar um lançamento de despesa por chat, responder a cada pergunta do slot flow (incluindo confirmações "sim"/"não"), até a despesa ser efetivamente registrada, sem cair no fallback genérico em nenhum momento.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- **Risco de regressão em consultas durante um fluxo ativo**: a exceção de "pergunta nova" depende de `isQuestion`, que é uma heurística baseada em palavras-chave (`quanto|qual|como|...`) e pontuação (`?`). Frases ambíguas podem ser mal classificadas em qualquer direção — isso já é uma limitação pré-existente do classificador, não introduzida por este plano, mas vale testar casos de borda.
- **Risco de nova regressão por generalização insuficiente**: corrigir apenas `reias→reais` deixa outras variações de typo (ex: "raeis", "raies") sem cobertura — isso é uma decisão consciente de escopo (evitar over-engineering de um corretor genérico), não um descuido.
- **Sem risco de dados**: nenhuma mudança de schema, nenhuma migration, nenhuma alteração de permissão.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — a decisão sobre pergunta-durante-fluxo já foi coletada e aplicada acima.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Uma resposta de confirmação ("sim"/"não") durante o fluxo de slots continua o registro corretamente, sem cair na mensagem genérica de ajuda.
- Uma pergunta legítima feita durante um fluxo ativo ainda é respondida como consulta.
- A frase "150 reias" (ou variações com esse typo específico) é interpretada corretamente como valor 150, sem deixar "reias" na descrição confirmada ao usuário.
- Os chips iniciais do assistente visualmente se parecem com as respostas rápidas do resto da conversa (pill/chip inline), não com um formulário.
- `tsc --noEmit` e `vite build`/`build` (backend) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Esta é uma demanda separada das features anteriores desta sessão (multiconta PJ, panorama geral, seletor de conta nos modais) — não misturar escopo.
- Não executar migrations — nenhuma é necessária.
- Não alterar `.env`.
- Manter as correções pequenas e cirúrgicas: Bug 1 e Bug 2 são mudanças pontuais em funções específicas, não refatorações do módulo do assistente.
- Não abrir PR sem instrução explícita do usuário — projeto vai direto para `main` via skill `finalizar`.
