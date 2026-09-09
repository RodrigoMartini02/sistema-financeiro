# Plano de Implementação: Lançamento guiado no assistente financeiro

## Origem

- Arquivo de especificação: `.plans/tasks/assistente-lancamento-guiado.md`
- Data do planejamento: `2026-09-08`
- Classificação: `fullstack` (frontend + backend, **sem alteração de banco de dados**)

Motivo da classificação: o slot-filling exige uma máquina de estado no backend
(`financialCopilot` / `financialAssistant`) e botões de resposta rápida no
frontend (`FinancialAssistant.tsx`). Todos os campos necessários já existem nas
tabelas `despesas` e `receitas`, e `saveExpense` já os aceita — nenhuma
migration é necessária.

## Resumo

Transformar o lançamento de receitas e despesas de **tacada única** para
**conversa guiada campo a campo**.

Hoje o usuário fala, o backend extrai o que consegue por regex e devolve um
formulário editável para conferência. Passará a: extrair tudo o que a frase
permitir, **perguntar apenas os campos que ficaram vazios, um por vez, com
botões**, e só ao final abrir o card "Confira antes de salvar" já preenchido.

O fluxo deve cobrir **todos os campos do modal "Nova despesa"**, cada um sob a
mesma condição que a tela usa para exibi-lo.

## Decisões aplicadas

- **Decisão 1 — Fluxo:** guiado campo a campo com botões, e o card
  "Confira antes de salvar" já existente aparece **no final**, preenchido, como
  resumo. Atende ao item 6 da spec ("reaproveitar o bloco de resumo") sem
  descartar a edição inline atual.

- **Decisão 2 — Motor de extração:** manter a extração determinística por regex,
  que já cobre valor por extenso e data relativa, e acionar o LLM **apenas
  quando ela falhar**. Mantém custo baixo, preserva os testes existentes e não
  cria dependência de provider de IA ativo.

- **Decisão 3 — "Tipo de pagamento":** confirmado pelo usuário que
  "tipo de pagamento" e "forma de pagamento" são **o mesmo campo** — a spec
  duplicou sem querer. Campo único, com PIX / Dinheiro / Débito / Crédito,
  correspondendo a `forma_pagamento` no banco. Resolve a pendência do item 6.

- **Decisão 4 — Campos opcionais:** todos os campos do modal viram pergunta no
  chat, cada um apenas sob sua condição de exibição. Os opcionais
  (parcelas já pagas, dia da recorrência, preço à vista, NF) trazem botão
  `[Pular]`.

- **Decisão 5 — Crédito:** o chat segue **a tela**, não a spec. No crédito não
  pergunta "já foi paga" nem "valor pago", porque a despesa entra na fatura do
  cartão e quem paga é a fatura.

- **Decisão 6 — Só pergunta o que não entendeu:** o motor emite pergunta
  **somente para slot vazio**. Slot preenchido pela frase do usuário é pulado
  silenciosamente. Se a frase preencher todos os obrigatórios, o fluxo vai
  direto ao card de resumo, sem nenhuma pergunta além da confirmação da
  descrição.

## Escopo

### Dentro do escopo

- Máquina de estado de slot-filling no backend, com estado persistido na conversa
- Cobertura de **todos os campos do modal de despesa** (levantamento abaixo)
- Perguntas condicionais espelhando as condições de exibição da tela
- Botões de resposta rápida (`quickReplies`) alimentados pelas listas reais do banco
- Confirmação obrigatória da descrição; categoria sugerida pelo histórico
- Correção no meio do fluxo, descartando campos dependentes sem recomeçar
- Card de resumo existente reaproveitado como etapa final
- Tom de voz da spec (acolhedor nas pontas, seco no meio)
- LLM acionado apenas quando o regex falhar
- Testes de backend para o motor de slots

### Fora do escopo

- Migrations e mudanças de schema
- Criar categoria nova pelo chat (sugere a mais próxima; criação fica manual)
- Alterar o fluxo de consulta já existente
- Mudanças no `.env` ou em provider de IA
- Lote de despesas (o modal permite; o chat lança uma por vez)

## Leitura de contexto

Arquivos de contexto lidos:

- `/AGENT.md` (raiz) — regras globais, Node 22.17.0, Drizzle, multi-tenant
- `/sistema financas/AGENT.md` — mesmas regras, escopo do projeto
- `/CLAUDE.md` — workflow obrigatório planejar → aprovar → implementar → finalizar
- `.plans/tasks/assistente-lancamento-guiado.md` — especificação da feature
- **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos
  dedicados neste projeto; o `AGENT.md` da raiz cobre todo o repositório.

Planos anteriores relacionados, lidos para não replanejar o já decidido:

- `.plans/assistente-financeiro-conversacional.md` — MVP original do assistente
- `.plans/acolhimento-e-comandos-do-assistente.md` — origem do menu de 3 ações

Arquivos de código inspecionados:

- `src/components/financial-assistant/FinancialAssistant.tsx` (1029 linhas)
- `src/screens/assistant/AssistantPwaScreen.tsx`, `src/assistantMain.tsx`, `assistant.html`
- `src/screens/finance/ExpenseDialog.tsx`, `src/screens/finance/ExpenseForm.tsx` (1016 linhas)
- `src/services/financeService.ts`, `src/services/assistantService.ts`
- `src/types/financialAssistant.ts`, `src/types/financialCopilot.ts`
- `backend/src/services/financialCopilot.ts`, `financialAssistant.ts`, `copilotIntent.ts`
- `backend/src/services/aiProvider.ts`, `categoryAI.ts`
- `backend/src/routes/assistant.ts`, `backend/src/routes/expenses.ts`
- `backend/src/db/schema/expenses.ts`, `cards.ts`, `incomes.ts`

## Levantamento: campos do modal "Nova despesa"

Fonte: schema zod em `ExpenseForm.tsx:27-44` mais o JSX da tela.

| # | Campo | Label na tela | Obrigatório | Condição de exibição |
|---|---|---|---|---|
| 1 | `descricao` | Descrição * | sim | sempre |
| 2 | *anexos* | (clipe na descrição) | não | sempre |
| 3 | `categoria_id` | Categoria | não | sempre |
| 4 | `formaPagamento` | Forma de pagamento | sim | sempre |
| 5 | `cartao_id` | Cartão | não | crédito ou débito |
| 6 | `valor_original` | Valor da compra * | sim | sempre |
| 7 | `precoAVista` | Preço à vista | não | só em parcelado |
| 8 | `valor_pago` | Valor pago | não | **não**-crédito + pago |
| 9 | `dataCompra` | Data da compra | sim | sempre |
| 10 | `dataVencimentoManual` | Data do pagamento | não | sempre (calculada) |
| 11 | `pago` | "Assinale se a despesa já foi paga" | não | **só não-crédito** |
| 12 | `repeticao` | **Tipo de cobrança** | sim | sempre |
| 13 | `totalParcelas` | "N parcelas" | não | repeticao = parcelas |
| 14 | `parcelasJaPagas` | "já pagas" | não | repeticao = parcelas |
| 15 | `diaRecorrencia` | "Todo dia N de cada mês" | não | mensal + não-crédito |
| 16 | `numero_nf` | Número da NF | não | **só conta empresa** |
| 17 | `data_emissao_nf` | Data de emissão | não | só conta empresa |

### Divergências entre a tela e a spec

1. **"Tipo de cobrança" é o nome real** do que a spec tratou como dois campos
   separados (parcelamento e recorrência). É um radio de 3 opções mutuamente
   exclusivas — `nao` / `parcelas` / `mensal` — o que é melhor que a spec: uma
   pergunta em vez de duas, e impede o estado impossível "parcelado E
   recorrente".

2. **A spec erra ao mandar sempre perguntar "já foi paga".** Na tela o checkbox
   desaparece no crédito (`ExpenseForm.tsx:850`), assim como "Valor pago".
   O chat deve seguir a tela.

3. **Cinco campos não estavam na spec:** `parcelasJaPagas`, `diaRecorrencia`,
   `precoAVista`, `numero_nf`, `data_emissao_nf`.

4. **A "periodicidade" da recorrência não existe** como intervalo. O sistema
   só suporta mensal; o que se pergunta é o **dia do mês** (`diaRecorrencia`).

## Marcadores `{{...}}` da spec, resolvidos

| Marcador da spec | Origem real no sistema |
|---|---|
| `{{DATA_HOJE}}` | `getTodayIsoInTimezone()` em `backend/src/utils/date.ts` |
| `{{LISTA_CATEGORIAS}}` | `fetchCategorias()` / tabela `categorias`, apenas `ativo` |
| `{{LISTA_FORMAS_PAGAMENTO}}` | `pix`, `dinheiro`, `debito`, `credito` |
| `{{LISTA_TIPOS_PAGAMENTO}}` | **não existe** — é o mesmo que forma de pagamento |
| `{{LISTA_CARTOES}}` | tabela `cartoes`, `ativo`, filtrada por `tipo` |
| `{{MAPA_DESCRICAO_CATEGORIA}}` | `aprendizado_categoria` via `classifyCategory()` |

## Fluxo final — Despesa

Ordem espelhando o modal. **Cada passo só vira pergunta se o slot estiver
vazio** (Decisão 6).

1. **Descrição** — sempre confirma, mesmo quando extraída com clareza
2. **Categoria** — sugere pelo histórico e confirma; sem histórico, botões com as ativas
3. **Forma de pagamento** — botões: PIX / Dinheiro / Débito / Crédito
4. **Cartão** — só crédito/débito; havendo só um cadastrado, sugere em vez de listar
5. **Tipo de cobrança** — botões: Não repete / Parcelado / Recorrente
6. **Nº de parcelas** e **parcelas já pagas** — só se Parcelado
7. **Dia da recorrência** — só se Recorrente e não-crédito
8. **Valor** — rótulo conforme a cobrança: valor da compra / da parcela / mensal
9. **Preço à vista** — só se Parcelado, com `[Pular]`; alimenta o cálculo de juros embutido
10. **Já foi paga** — só se **não**-crédito
11. **Valor pago** — só se paga; sugere o valor da compra
12. **Data da compra** — assume hoje sem perguntar
13. **Vencimento** — só se não paga
14. **NF (número + emissão)** — só em conta empresa, com `[Pular]`

Despesa simples no PIX à vista: cerca de 6 perguntas.
Parcelada no crédito em conta empresa: até 14.
Frase completa (ex.: "mercado do mês, 200 no pix, hoje, pago"): apenas a
confirmação da descrição, e o card abre em seguida.

## Fluxo final — Receita

Descrição (sempre confirma) → valor → data. Nada além disso: a tabela
`receitas` não tem categoria nem forma de pagamento.

## Impacto por área

### Frontend

- `FinancialAssistant.tsx`:
  - renderizar `quickReplies` nas mensagens do assistente; clique envia a resposta
  - acrescentar ao card de resumo os campos hoje ausentes: cartão, tipo de
    cobrança, parcelas, parcelas já pagas, dia da recorrência, valor pago, NF
  - repassar todos eles no `saveExpense` (a função já os aceita)
  - mensagem de conclusão após salvar e reoferecer as três ações
- `types/financialCopilot.ts`: novo `mode: 'slot'`, campos `question` e `quickReplies`
- `types/financialAssistant.ts`: ampliar `FinancialAssistantDraft` com os campos novos
- Estados de loading/error já existem e devem ser preservados
- Query keys: nenhuma nova; `queryKeys.dashboard` e `queryKeys.copilotConversations`
  continuam sendo invalidadas após salvar

### Backend

- `assistantSlotFilling.ts` (novo): definição declarativa dos slots, condicionais,
  resolução do próximo slot e descarte de dependentes na correção
- `financialAssistant.ts`: expor os extratores por campo para uso do motor;
  ampliar o draft com os campos novos
- `financialCopilot.ts`: quando `intent === 'register'`, delegar ao motor de slots;
  devolver `mode: 'slot'` enquanto houver pendência, `mode: 'draft'` ao completar
- `routes/assistant.ts`: `asContext` precisa aceitar e validar os campos novos
- Listas de categorias e cartões carregadas por `conta_id`
- LLM apenas como fallback de extração

### Banco de dados

`Sem impacto esperado.`

Todos os campos já existem:

- `despesas`: `cartao_id`, `parcelado`, `numero_parcelas`, `parcela_atual`,
  `grupo_parcelamento_id`, `recorrente`, `valor_pago`, `valor_original`,
  `data_compra`, `data_vencimento`, `forma_pagamento`, `numero_nf`,
  `data_emissao_nf`, `anexos`
- `receitas`: `descricao`, `valor`, `data_recebimento`, `anexos`
- `copilot_mensagens.payload` (jsonb) já serve para guardar o estado dos slots

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado.` Nenhuma env var nova, nenhum job, nenhuma dependência
adicional.

## Arquivos provavelmente afetados

- `backend/src/services/assistantSlotFilling.ts` *(novo)*
- `backend/src/services/assistantSlotFilling.test.ts` *(novo)*
- `backend/src/services/financialCopilot.ts`
- `backend/src/services/financialAssistant.ts`
- `backend/src/routes/assistant.ts`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/types/financialCopilot.ts`
- `src/types/financialAssistant.ts`
- `src/services/assistantService.ts`

## Estratégia de implementação

1. **Motor de slots** (`assistantSlotFilling.ts`): definir declarativamente os
   slots de receita e despesa, com condição de aplicabilidade, obrigatoriedade e
   dependentes de cada um. Expor `proximoSlot(estado)` e
   `aplicarResposta(estado, slot, resposta)`.
2. **Parser por slot**: interpretar a resposta do usuário no contexto do slot
   ativo (sim/não, escolha de botão, valor, data, inteiro), reaproveitando os
   extratores já existentes em `financialAssistant.ts`.
3. **Estado na conversa**: persistir slots preenchidos e slot pendente no
   `payload` de `copilot_mensagens`, com fallback pelo `context` do request
   quando a tabela não existir (o código já trata o erro `42P01`).
4. **Orquestração** em `runFinancialCopilot`: com `intent === 'register'`,
   rodar a extração inicial da frase, preencher todos os slots possíveis e só
   então perguntar o primeiro vazio.
5. **Listas do banco**: carregar categorias e cartões ativos da conta para
   montar os botões, sempre filtrando por `conta_id`.
6. **LLM como fallback**: acionar a IA apenas quando o parser determinístico não
   resolver o slot ativo.
7. **Frontend — botões**: renderizar `quickReplies`, incluindo `[Pular]` nos
   opcionais e `[Corrigir]` / `[Trocar]` nas confirmações.
8. **Frontend — card completo**: exibir e permitir editar todos os campos novos,
   e repassá-los no `saveExpense`.
9. **Frontend — conclusão**: mensagem de sucesso e reoferta das três ações.
10. **Testes**: cobrir os casos listados na spec mais os derivados das decisões.

## Regras de negócio identificadas

- Nunca inventar dado: slot não resolvido vira pergunta
- Nunca gravar campo obrigatório em branco, nunca cair em "Outros" silenciosamente
- **Não perguntar o que já veio na frase** — exceto a descrição, sempre confirmada
- Uma pergunta por vez
- Listas fechadas viram botões, nunca texto digitado
- Só grava após a confirmação final no card
- Correção no meio atualiza o campo, descarta os dependentes e refaz só as
  perguntas que voltaram a ficar em aberto — nunca recomeça do zero
- Valor pago diferente do valor de compra é esperado (juros ou desconto) e a
  diferença deve ficar visível no resumo
- Despesa não paga: não pergunta valor pago; pergunta vencimento
- Despesa no crédito: não pergunta pago nem valor pago
- Categoria inexistente: sugere a mais próxima e pede confirmação
- Descrição ambígua: pedir o formato com vírgula, apenas quando ambíguo

## Regras multi-tenant e segurança

- A conta ativa vem de `resolveFinancialAccount(userId, accountId)`, nunca do
  corpo da requisição sem validação — padrão já usado em `financialCopilot.ts`
- Categorias e cartões das listas devem ser filtrados por `conta_id` e `ativo`
- Conta pessoal inclui registros com `conta_id` nulo; conta empresa não —
  seguir `accountExpenseCondition` / `accountIncomeCondition`
- O campo NF só deve ser oferecido em conta do tipo empresa
- Conversas e mensagens continuam isoladas por `userId` + `accountId`
- Nenhum dado de outra conta pode aparecer nos botões de resposta rápida

## Validações necessárias

- `descricao`: obrigatória, máx. 255 caracteres
- `valor_original`: obrigatório, maior que 0
- `formaPagamento`: um de `pix`, `dinheiro`, `debito`, `credito`
- `repeticao`: um de `nao`, `parcelas`, `mensal`
- `totalParcelas`: inteiro entre 2 e 360, só quando parcelado
- `parcelasJaPagas`: inteiro ≥ 0, nunca maior que `totalParcelas`
- `diaRecorrencia`: inteiro entre 1 e 31
- `cartao_id`: precisa pertencer à conta ativa e estar ativo
- `categoria_id`: precisa pertencer à conta ativa e estar ativa
- datas: formato ISO `YYYY-MM-DD`
- `numero_nf`: máx. 50 caracteres, só em conta empresa
- Mensagem do usuário: máx. 2.000 caracteres (limite já existente)

## Testes necessários

### Backend

- valor por extenso ("mil e duzentos", "quatrocentos")
- data relativa ("ontem", "hoje", "dia 5")
- categoria inexistente sugere a mais próxima, não grava "Outros"
- cartão parcelado preenche `parcelado`, `numero_parcelas` e `parcela_atual`
- despesa não paga pergunta vencimento e não pergunta valor pago
- correção no meio do fluxo descarta apenas os dependentes
- crédito não pergunta "já foi paga" nem "valor pago"
- frase completa não gera nenhuma pergunta além da confirmação da descrição
- slot preenchido pela frase é pulado
- conta empresa oferece NF; conta pessoal não
- listas de cartões e categorias não vazam entre contas

### Frontend

- `quickReplies` renderizam e o clique envia a resposta correta
- card de resumo exibe os campos novos e os repassa ao salvar
- botão `[Pular]` avança sem preencher o slot
- mensagem de conclusão reoferece as três ações

### E2E

- lançar despesa simples no PIX de ponta a ponta
- lançar despesa parcelada no crédito de ponta a ponta
- lançar receita de ponta a ponta

## Comandos de validação sugeridos

```bash
npm --prefix backend run test
npm --prefix backend run build
npm run build
```

Observação: o projeto não possui scripts `lint` nem `typecheck`; `build` do
backend é `tsc --noEmit`, que já cobre a verificação de tipos.

## Riscos e pontos de atenção

- **Fluxo longo:** até 14 perguntas no pior caso. Mitigado pela Decisão 6
  (só pergunta slot vazio) e pelo `[Pular]` nos opcionais.
- **Duplicação de regra de negócio:** as condicionais (crédito esconde pago,
  parcelas só em parcelado) passarão a existir na tela **e** no motor de slots.
  Risco real de divergirem com o tempo — considerar extrair para um módulo
  compartilhado, ou no mínimo documentar a correspondência.
- **Estado da conversa:** sem a tabela `copilot_mensagens` o slot-filling perde
  memória entre mensagens; o fallback via `context` é obrigatório.
- **Contrato frontend/backend:** `mode` ganha o valor `'slot'`; um PWA em cache
  antigo pode não reconhecê-lo. O `UpdatePwaBanner` já existe e mitiga.
- **Regressão no fluxo atual:** o card de tacada única é usado hoje; a mudança
  não pode quebrar quem já usa.
- **Multi-tenant:** listas de botões são a nova superfície de vazamento entre
  contas; filtrar sempre por `conta_id`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- for possível lançar uma despesa completa por conversa, uma pergunta por vez,
  com botões nas listas fechadas
- todos os 17 campos do modal forem alcançáveis pelo chat, cada um sob a mesma
  condição que a tela usa
- nenhuma pergunta for feita sobre dado que já veio na frase do usuário, exceto
  a confirmação da descrição
- despesa no crédito não perguntar "já foi paga" nem "valor pago"
- correção no meio do fluxo refizer apenas as perguntas afetadas
- o card de resumo aparecer preenchido ao final e nada for gravado sem confirmação
- os testes listados passarem e `npm --prefix backend run test`,
  `npm --prefix backend run build` e `npm run build` estiverem verdes

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária nesta feature.
- Seguir `/AGENT.md` da raiz (não existem AGENT.md de frontend/backend).
- Usar a API do Drizzle para qualquer query nova; filtrar sempre por conta.
- Reaproveitar o que já existe: menu de 3 ações, card de resumo, `classifyCategory`,
  extratores determinísticos, `saveExpense`. Não recriar nada disso.
- Manter alterações pequenas e focadas, na ordem da estratégia de implementação.
- Atualizar os testes conforme a seção "Testes necessários".
