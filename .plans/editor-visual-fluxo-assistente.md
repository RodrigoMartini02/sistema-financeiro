# Plano de Implementação: Editor Visual de Fluxo do Assistente Financeiro

## Origem

- Arquivo de especificação: conversa — usuário pediu tela de fluxograma para editar o fluxo do chat (2026-09-13)
- Data do planejamento: `2026-09-13`
- Classificação: `frontend + backend + database`

## Resumo

O fluxo de perguntas do assistente (registrar despesa/receita) está hardcoded em ~1.230 linhas de TypeScript. Cada ajuste na conversa exige editar código e fazer deploy. Além disso, o usuário relata que "o assistente se perde nas mensagens" e não tem como enxergar onde o fluxo quebra.

Este plano substitui o motor por um interpretador que lê o fluxo do banco, e adiciona um editor visual (React Flow) onde o fluxo é desenhado como um mapa mental: nós arrastáveis ligados por linhas, cada nó carregando a pergunta, os chips e as condições de saída.

Ao implantar, o fluxo atual aparece **já desenhado** na tela — migrado do código por uma migration de semeadura — para o usuário poder ajustar imediatamente.

## Descoberta crítica: existe uma suíte de 36 testes

`backend/src/services/assistantSlotFilling.test.ts` (355 linhas, 36 testes) documenta o comportamento atual em detalhe: "credito nao pergunta se ja foi paga nem valor pago", "em 3x tambem responde a quantidade de parcelas", "categoria inexistente nao vira palpite: sobe como pedido de criacao", "defaults completam data, cobranca e vencimento como o modal faz", etc.

**Esta suíte é o critério objetivo de aceite da migração.** O motor novo deve passar nos mesmos 36 testes, sem alteração nos testes. Sem esse portão, "não perder comportamento" seria apenas intenção.

## Escopo

### Dentro do escopo

**Fase 1 — Motor lendo do banco (sem tela)**
- Nova tabela `assistente_fluxos`: fluxo como JSON versionado, por usuário
- Migration que semeia o fluxo atual (13 slots, condições, chips) no formato novo
- Interpretador que substitui `SLOT_ORDER`, `buildQuestion`, `isSlotApplicable`, `SLOT_DEPENDENTS`
- Os 36 testes existentes continuam passando **sem alteração**
- Remoção do código antigo de ordem/perguntas (sem fallback duplicado — decisão do usuário)

**Fase 2 — Editor visual**
- Instalar `@xyflow/react` 12.11.6 (peerDeps React >=17, compatível com React 19.2.7 do projeto)
- Nova aba admin no `ConfigPanel` (mesmo padrão de visibilidade de "Integrações de IA", `isAdmin`)
- Canvas com nós arrastáveis, linhas curvas, zoom/pan
- Painel lateral de edição do nó selecionado: texto da pergunta, chips (label/valor), campo que preenche, flags
- Endpoints admin de leitura e escrita do fluxo
- Validação no canvas, marcando em vermelho: nó sem saída, ciclo, campo obrigatório inalcançável, dependência invertida (ex: cartão antes de forma de pagamento), chip cujo valor o parser não reconhece

**Fase 3 — Nós especiais**
- Os 7 comportamentos especiais viram nós configuráveis: semeadura, confirmação, sugestão de IA de categoria, criar categoria sob demanda, limpeza em cascata, defaults de fim de fluxo, resposta múltipla ("em 3x")

### Fora do escopo

- Fluxo de anexos/OCR (`createFinancialAssistantDraft`) — bypassa o slot engine completamente hoje (`financialCopilot.ts` L600-618) e continua igual
- Gravação de despesa/receita — o motor nunca gravou; segue no frontend (`FinancialAssistant.tsx handleSave`)
- Simulador de conversa dentro do editor — decisão explícita do usuário; a validação no canvas cobre os erros estruturais
- Multiusuário, permissões granulares, versionamento/rascunho-e-publicar — uso pessoal, rota de admin
- **Correção dos bugs latentes** — migrados como estão, ver seção própria
- Alteração no `intent hijack` (`financialCopilot.ts` L512-523), na validação `parseSlotSessionState` ou em `withCatalogScopedReferences` — continuam necessários e inalterados

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — mesma ressalva dos planos anteriores desta sessão: documentos genéricos multi-prefeitura/RLS que não correspondem à arquitetura real. Princípios aplicados: Drizzle para queries novas, sem `any`, validar entrada no backend, não mascarar erros, separar responsabilidades.
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Mapeamento completo do motor atual levantado por agente Explore nesta sessão, cobrindo: `assistantSlotFilling.ts` (408), `assistantSlotSession.ts` (385), `assistantSlotParser.ts` (440), `financialCopilot.ts` (663), `routes/assistant.ts`.
- Verificações diretas: `@xyflow/react` não instalado; React 19.2.7; padrão `isAdmin` já existe em `ConfigPanel.tsx` L83 e é usado pela aba `integracoes-ia` (L101); `requireAdmin` já usado em `routes/ai-integrations.ts`, `plans.ts`, `users.ts`; suíte de 36 testes em `assistantSlotFilling.test.ts`.

## Inventário dos 13 slots (a especificação que o formato novo deve representar)

Ordem em `SLOT_ORDER` (`assistantSlotFilling.ts` L154-168):

| # | slot | Pergunta | Chips (label→valor) | Confirmação | Pulável |
|---|---|---|---|---|---|
| 1 | `description` | preenchido: `Entendi que é "X", certo?` / vazio: `Como você quer descrever esse lançamento?` | Sim→sim, Corrigir→corrigir | quando preenchido | não |
| 2 | `category` | preenchido: `Categoria X, certo? Foi assim nas outras vezes.` / vazio: `E a categoria?` | Sim→sim, Trocar→corrigir / uma por categoria | quando preenchido | não |
| 3 | `paymentMethod` | `Como você pagou?` | PIX→pix, Dinheiro→dinheiro, Débito→debito, Crédito→credito | não | não |
| 4 | `cardId` | 1 cartão: `No cartão X, certo?` / vários: `Qual cartão?` | Sim→id, Outro→corrigir / nome→id | quando 1 cartão | não |
| 5 | `billingType` | `É uma cobrança única, parcelada ou recorrente?` | Não repete→nao, Parcelado→parcelas, Recorrente→mensal | não | não |
| 6 | `installments` | `Em quantas vezes?` | — | não | não |
| 7 | `paidInstallments` | `Quantas parcelas você já pagou?` | — | não | **sim** |
| 8 | `amount` | parcelas: `Qual o valor da parcela?` / mensal: `Qual o valor mensal?` / else: `Quanto foi?` | — | não | não |
| 9 | `paid` | `Já foi paga?` | Sim→sim, Não→nao | não | não |
| 10 | `amountPaid` | `Valor pago foram os mesmos R$ X?` / `Quanto você pagou?` | Sim→valor, Outro valor→corrigir | quando valor conhecido | não |
| 11 | `dueDate` | `Para quando é o vencimento?` | — | não | não |
| 12 | `invoiceNumber` | `Tem número de nota fiscal?` | — | não | **sim** |
| 13 | `invoiceDate` | `Qual a data de emissão da nota?` | — | não | **sim** |

Mais uma pergunta dinâmica fora de `buildQuestion`, gerada em `assistantSlotSession.ts` L334-347: `Não encontrei a categoria "X". Quer criar?` com chips Criar→sim, Escolher outra→nao.

`purchaseDate` existe como slot, tem pergunta e parser, mas está **fora** de `SLOT_ORDER` — inalcançável. O formato novo deve representá-lo como nó desconectado, preservando o estado atual.

O chip "Pular" é injetado no orquestrador (`financialCopilot.ts` L451-453), não no builder — o formato novo precisa decidir onde isso vive.

## Regras de aplicabilidade (`isSlotApplicable` L105-128)

- **income**: só `description`, `amount`, `purchaseDate` — a tabela `receitas` não tem as demais colunas
- `cardId`: só se `paymentMethod` for credito ou debito
- `installments` / `paidInstallments`: só se `billingType === 'parcelas'`
- `paid`: só se **não** for crédito (no crédito quem paga é a fatura)
- `amountPaid`: só se não-crédito **e** `paid === true`
- `dueDate`: só se `paid !== true` (note: `!== true`, então `null` também qualifica — no crédito, `paid` nunca é perguntado, logo `dueDate` **é** perguntado)
- `invoiceNumber` / `invoiceDate`: só em conta empresa

A aplicabilidade é avaliada a cada passagem, então responder `paymentMethod = credito` remove `paid`/`amountPaid` retroativamente, sem branch explícito. **O formato de fluxo precisa expressar isso** — não basta ligar nós em sequência.

## Limpeza em cascata (`SLOT_DEPENDENTS` L175-180)

```
paymentMethod → cardId, paid, amountPaid, dueDate
billingType   → installments, paidInstallments
paid          → amountPaid, dueDate
amount        → amountPaid
```

Dispara em `applySlotAnswer` (L249, L262, L290, L296, L300), sempre que esses slots são respondidos — mesmo que o valor não mude. Não dispara no caminho "corrigir". Não poda `skipped`/`confirmed`.

## Os 7 comportamentos especiais que o motor novo não pode perder

1. **Semeadura** (`seedDraftFromMessage` L394-440) — a primeira frase livre preenche vários slots de uma vez: valor (com âncora em verbo de gasto, senão "dois mercados" viraria valor 2), data, descrição (3 fallbacks + `cleanDescription` de 15 etapas), forma de pagamento, tipo de cobrança, parcelas, cartão, e `paid = true` para verbo no passado exceto no crédito
2. **Confirmação obrigatória** de `description` e `category` (`CONFIRMED_SLOTS` L74, `pendingConfirmations` L375-381) — rodam **antes** da próxima pergunta; sem isso, uma frase que preenche tudo salvaria descrição não confirmada
3. **Sugestão de categoria por IA** (`suggestCategory` L153-162) — consulta `aprendizado_categoria` via `classifyCategory`, e **valida contra o catálogo real** antes de sugerir; falha em silêncio (try/catch → null). Roda no início e de novo após confirmar nova descrição
4. **Criar categoria sob demanda** (L239-278) — única escrita no banco que o motor faz, só após "sim" explícito; injeta a categoria nova no catálogo em memória para valer no mesmo turno
5. **Limpeza em cascata** — ver seção acima
6. **Defaults de fim** (`applyDraftDefaults` L395-408) — data hoje, `billingType = nao`, crédito força `paid = false` e `amountPaid = null` (nessa ordem, antes da cópia de amountPaid), `dueDate = date`
7. **Resposta múltipla** — "em 3x" responde `billingType` e `installments` juntos (L263-265)

Outros pontos que precisam sobreviver: `MISUNDERSTOOD_PREFIX` (repete a pergunta, nunca chuta), voz envolvendo perguntas em `toSpeakableText`, `parseSlotSessionState` validando o estado que volta pela rede, `withCatalogScopedReferences` derrubando cartão/categoria de outra conta.

## Bugs latentes — migrados como estão (decisão do usuário)

Preservados intencionalmente para os 36 testes passarem sem alteração e a migração ser comparável 1:1. Correção fica para plano separado — assim dá para saber se uma mudança de comportamento veio de conserto ou de regressão.

- "pular" funciona em qualquer slot, inclusive obrigatórios (gera draft incompleto; `SlotSessionStep.complete` é calculado mas nunca lido pelo orquestrador)
- `boleto` é parseável mas não tem chip
- `amountPaid` não tem o fallback de número por extenso que `amount` tem
- `isSlotId` não valida contra a union
- `skipped`/`confirmed` nunca são podados quando a cascata invalida o campo
- `kind` não pode ser corrigido no meio da sessão
- `purchaseDate` inalcançável

## Impacto por área

### Banco de dados

Nova tabela `assistente_fluxos`:
- `id`, `usuario_id` (FK), `nome`, `fluxo` (JSONB — nós e arestas), `versao`, `ativo`, `data_criacao`, `data_atualizacao`
- Índice por `usuario_id`
- Migration de semeadura inserindo o fluxo atual traduzido para o formato novo

O JSONB guarda algo na forma `{ nodes: [...], edges: [...] }`, onde cada nó carrega tipo (pergunta / especial), o campo que preenche, texto, chips e flags; cada aresta carrega a condição de transição.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

### Backend

- `backend/src/db/schema/` — nova tabela
- Novo service interpretador — substitui `SLOT_ORDER`/`buildQuestion`/`isSlotApplicable`/`SLOT_DEPENDENTS` lendo do fluxo salvo
- `assistantSlotFilling.ts` — código de ordem/perguntas removido; tipos (`SlotId`, `SlotDraft`) provavelmente permanecem
- `assistantSlotSession.ts` — `buildStep` passa a consultar o interpretador
- `assistantSlotParser.ts` — **inalterado**: o parsing por slot não depende da ordem
- Novos endpoints admin (`authenticate` + `requireAdmin`, padrão de `ai-integrations.ts`): ler fluxo, salvar fluxo, e possivelmente restaurar o padrão
- Validação de fluxo no backend — não confiar na validação do canvas; fluxo malformado deve ser recusado com erro claro, nunca travar a conversa

### Frontend

- `package.json` — adicionar `@xyflow/react`
- `src/layout/ConfigPanel.tsx` — nova entrada admin-only (padrão da linha 101)
- Nova tela de editor: canvas, nós customizados, painel lateral de propriedades, validação visual
- Novo service + query keys para o fluxo
- Estados de loading/error/empty

### Infra/Deploy

Sem impacto esperado. Nenhuma env var nova. Atenção ao tamanho do bundle: o `AppShell` já passa de 870 kB e o React Flow é uma dependência considerável — vale carregar a tela do editor sob demanda (lazy), já que é admin-only.

## Arquivos provavelmente afetados

- `backend/src/db/schema/assistantFlows.ts` (novo)
- `backend/drizzle/00XX_assistente_fluxos.sql` (novo) + migration de semeadura
- `backend/src/services/assistantFlowEngine.ts` (novo — interpretador)
- `backend/src/services/assistantSlotFilling.ts` (redução drástica)
- `backend/src/services/assistantSlotSession.ts` (`buildStep`)
- `backend/src/routes/assistantFlows.ts` (novo) + registro em `server.ts`
- `src/screens/config/FluxoAssistenteTab.tsx` (novo)
- `src/services/assistantFlowService.ts` (novo)
- `src/services/queryKeys.ts`
- `src/layout/ConfigPanel.tsx`
- `package.json`

## Estratégia de implementação

**Fase 1 — Motor**
1. Modelar o formato JSON do fluxo (nós, arestas, condições) cobrindo os 13 slots + aplicabilidade + cascata
2. Criar schema Drizzle e migration da tabela
3. Escrever a migration de semeadura traduzindo o fluxo atual para o formato
4. Implementar o interpretador
5. Trocar `buildStep` para consultar o interpretador
6. **Portão: rodar os 36 testes.** Todos devem passar sem alteração no arquivo de teste
7. Remover o código antigo de ordem/perguntas

**Fase 2 — Editor**
8. Instalar `@xyflow/react`; conferir impacto no bundle
9. Endpoints admin de leitura/escrita, com validação de fluxo no backend
10. Aba admin + canvas renderizando o fluxo salvo
11. Painel de propriedades do nó
12. Salvar alterações
13. Validação visual (nó sem saída, ciclo, obrigatório inalcançável, dependência invertida, chip não reconhecido)

**Fase 3 — Nós especiais**
14. Representar os 7 comportamentos como nós configuráveis
15. Interpretador passa a executá-los a partir do fluxo
16. Rodar os 36 testes de novo

**Validação contínua:** `tsc --noEmit` (backend e frontend), `vite build`, e `npm test` no backend a cada fase.

## Regras de negócio identificadas

- O fluxo desenhado é a fonte de verdade; não há fallback para código
- Um fluxo por usuário; uso pessoal, admin-only
- O motor produz um draft e nunca grava despesa/receita — a gravação segue no frontend após confirmação
- Categoria trafega como **nome** (string) de ponta a ponta; vira id só no save do frontend
- Fluxo inválido não pode derrubar a conversa

## Regras multi-tenant e segurança

(Vocabulário real do projeto: "tenant" = conta/usuário, não prefeitura)

- Endpoints de fluxo exigem `authenticate` + `requireAdmin`
- O fluxo é filtrado por `usuario_id` do token, nunca por parâmetro do client
- **O fluxo salvo vira código executável do ponto de vista do motor.** A validação no backend precisa garantir que ele só possa preencher slots conhecidos e disparar ações previstas — nunca virar caminho para escrever valor arbitrário no draft. Isso é a mesma preocupação que `parseSlotSessionState` já documenta hoje
- `withCatalogScopedReferences` continua derrubando cartão/categoria de outra conta

## Validações necessárias

- Backend: fluxo bem formado (nós com id único, arestas apontando para nós existentes, slot de cada nó pertencente à union conhecida), tamanho máximo do JSON
- Frontend: validação visual, sem substituir a do backend

## Testes necessários

### Backend
- **Os 36 testes existentes de `assistantSlotFilling.test.ts` passando sem alteração** — critério principal
- Interpretador recusa fluxo malformado sem quebrar a conversa
- Fluxo semeado produz exatamente a mesma sequência de perguntas do motor antigo

### Frontend
- Canvas renderiza o fluxo semeado
- Editar um nó e salvar reflete na conversa real
- Validação acusa: nó sem saída, ciclo, obrigatório inalcançável, dependência invertida, chip não reconhecido

### E2E
- Conversa completa de despesa no crédito parcelado, comparando com o comportamento atual
- Conversa de receita (só descrição e valor)
- Editar o fluxo, salvar, e ver a mudança na conversa sem deploy

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" test
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- **Regressão silenciosa** — maior risco do plano. ~1.230 linhas substituídas, 7 comportamentos não-óbvios. Mitigação: os 36 testes como portão obrigatório em cada fase
- **Escopo grande** — o faseamento existe para permitir parar entre fases com o sistema funcionando
- **Fases 2 e 3 planejadas sobre formato inexistente** — o usuário optou por plano único; as fases posteriores estão descritas em intenção, e podem precisar de revisão quando a Fase 1 fixar o formato. Isso é esperado, não é falha do plano
- **Fluxo inválido derrubando o assistente** — o interpretador precisa falhar de forma segura
- **Bundle** — React Flow numa aba admin-only pede carregamento sob demanda
- **`purchaseDate` inalcançável** — precisa ser representado sem virar alcançável por acidente na migração
- Migrations exigem confirmação explícita antes de executar

## Perguntas em aberto

- **Onde vive o chip "Pular"** — hoje injetado no orquestrador, não no builder. Na Fase 1 pode continuar assim; se virar propriedade do nó na Fase 2, é uma mudança de formato. A decidir ao modelar o JSON
- **Fluxo por usuário ou global** — o plano assume por usuário (`usuario_id`), coerente com o uso pessoal. Se a intenção for um fluxo único do sistema, o schema muda. A confirmar antes da migration

## Critérios de aceite do plano

- Os 36 testes de `assistantSlotFilling.test.ts` passam sem alteração no arquivo de teste
- O fluxo semeado produz a mesma sequência de perguntas do motor atual, incluindo os bugs latentes
- O editor mostra o fluxo atual desenhado ao abrir pela primeira vez
- Editar um nó, salvar, e a conversa real refletir a mudança sem deploy
- A validação acusa os cinco tipos de erro estrutural listados
- `tsc --noEmit`, `vite build` e `npm test` passam

## Linha de base medida (2026-09-13)

`npm --prefix "sistema financas/backend" test` antes de qualquer alteração:

```
tests 106 | pass 106 | fail 0 | duration_ms 2333
```

A suíte inteira do backend está verde, não só os 36 do assistente. Qualquer
falha durante a migração é regressão introduzida, não defeito preexistente.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- **Linha de base já medida: 106/106 passando** (ver seção acima). Rodar a cada fase e comparar
- Não alterar o arquivo de teste — se um teste falhar, o motor novo é que está errado
- Não corrigir os bugs latentes; migrá-los como estão
- Resolver as duas perguntas em aberto antes de escrever a migration
- Não executar migrations sem confirmação explícita
- Não alterar `.env`
- Considerar parar entre fases para validar em uso real antes de seguir
- Não abrir PR sem instrução explícita — projeto vai direto para `main` via skill `finalizar`
