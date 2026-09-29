# Plano de Implementação: Ramificações Visíveis no Fluxo do Assistente

## Origem

- Arquivo de especificação: conversa — usuário notou que os chips não mostram destino e que a abertura do chat está fora do fluxo (2026-09-14)
- Data do planejamento: `2026-09-14`
- Classificação: `frontend + backend`

## Resumo

O editor de fluxo entregue em `.plans/editor-visual-fluxo-assistente.md` desenha os nós numa coluna reta. Faltam as ramificações — e o usuário apontou duas, mais uma ausência:

1. **Ramificação por resposta** — o nó mostra os chips "Sim" e "Corrigir", mas não para onde cada um leva. O roteamento existe, hardcoded no parser.
2. **Ramificação por valor escolhido** — de "Como você pagou?" deveriam sair três caminhos (Pix, Crédito, Débito). A informação existe (`aplicaQuando` em 11 dos 13 nós), mas o canvas a reduz a um "se aplicável" tímido entre nós empilhados.
3. **A abertura do chat não está no fluxo** — saudação, os três chips ("Lançar despesa / Lançar receita / Consultar") e a fala de resposta de cada um são texto fixo no frontend (`INTENT_DETAILS`, `WELCOME_ACTIONS` em `FinancialAssistant.tsx` L96-126). O fluxo começa no meio, em "descrição", omitindo a bifurcação mais importante de todas.

O resultado é que o fluxograma não serve ao propósito para o qual foi pedido: enxergar onde a conversa desanda.

## O desenho pretendido

```
        [Olá! O que vamos fazer hoje?]
         │              │            │
  Lançar despesa  Lançar receita  Consultar
         │              │            │
  "Beleza! Me      "Boa! Me       (saída:
   conta o que      conta o que    via de
   você gastou"     recebeu"       consulta)
         │              │
     descrição      descrição
         │              │
     categoria        valor
         │              │
   [Como pagou?]      fim
    │    │    │
   Pix  Créd  Déb
    │    │    │
    │  cartão cartão
    └────┴────┘
         │
   tipo de cobrança → ...
```

## A descoberta que define a arquitetura

Lendo `applySlotAnswer` (`assistantSlotParser.ts` L175-343), cada ramo faz **duas coisas coladas**:

1. **Interpretar** o texto — "isso é um sim?", "isso é um valor?", "bate com alguma categoria?"
2. **Decidir** o desfecho — confirma, repergunta, pula, oferece criar

Apenas a segunda pode virar dado. A primeira precisa continuar em código: regex, números por extenso ("quatrocentos"), correspondência difusa de catálogo, `extractAmountFromText`. Expressar isso num fluxograma seria reinventar o parser numa linguagem pior.

**Proposta:** o parser continua interpretando e passa a devolver um **resultado nomeado**; o fluxo declara **para onde cada resultado leva**.

## Escopo

### Dentro do escopo

**Frente 1 — Abertura no fluxo**
- Saudação, os três chips de intenção e a fala de abertura de cada um viram nós editáveis
- Novo endpoint (ou extensão do existente) que entrega a abertura ao frontend
- `FinancialAssistant.tsx` passa a montar a mensagem inicial a partir do fluxo, com a abertura padrão como valor imediato enquanto o servidor responde
- Ramo "Consultar" vira nó terminal marcado como saída para a via de consulta

**Frente 2 — Ramificação por valor escolhido**
- O canvas deriva os ramos das condições `aplicaQuando` já existentes: de um nó com chips, uma seta por valor, indo ao primeiro nó aplicável naquele caso
- Rótulo da seta com o valor ("Pix", "Crédito", "Débito")
- Sem mudança de formato: a informação já está no fluxo

**Frente 3 — Ramificação por resposta**
- Formato v2: campo `transicoes` por nó, com destino `'proximo'` / `'mesmo'` / id específico
- `parseFlowDefinition` aceita v1 e v2, convertendo v1→v2 com as transições que reproduzem o comportamento atual
- `applySlotAnswer` devolve resultado nomeado (`afirmou`, `corrigiu`, `pulou`, `preencheu`, `naoEntendeu`)
- `advanceSlotSession` consulta o fluxo para o destino
- Nó de criação de categoria ("Não encontrei X. Quer criar?") vira nó visível
- Canvas desenha autoligação curva para destino `'mesmo'`
- Validação: ciclo sem saída, obrigatório inalcançável, destino inexistente

### Fora do escopo

- **Opções dinâmicas** (nomes de cartão, categorias) — adiado por decisão do usuário. O nó mostra que as opções vêm do cadastro e sai uma seta só, já que todas levam ao mesmo destino.
- **Fluxo de consulta** (resumo, categorias, vencimentos) — adiado. Vira nó terminal; a via de consulta usa LLM com ferramentas, não sequência de perguntas.
- Editar o texto das perguntas pela tela — segue pendente do plano anterior
- Mover a **interpretação** do texto para o fluxo — permanece em código, por arquitetura
- Corrigir bugs latentes conhecidos ("pular" em obrigatório, `boleto` sem chip, `kind` não corrigível)
- Fluxo de anexos/OCR, que bypassa o motor

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — mesma ressalva dos planos anteriores: genéricos multi-prefeitura/RLS, não correspondem à arquitetura real. Princípios aplicados: sem `any`, validar entrada, não mascarar erros, seguir padrões existentes.
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- `.plans/editor-visual-fluxo-assistente.md` — plano anterior, em `main`. Este fecha lacunas dele.
- Código lido: `assistantSlotParser.ts` (`applySlotAnswer` e desfechos), `assistantSlotSession.ts` (L341-383), `assistantFlowSchema.ts` (formato v1), `assistantFlowDefault.ts` (11 de 13 nós com `aplicaQuando`), `FluxoAssistenteTab.tsx` (`toGraph`), `FinancialAssistant.tsx` (L96-126, abertura fixa).
- Banco verificado: dev tem 1 linha `versaoFormato: 1`; produção tem a tabela vazia.

## Impacto por área

### Backend

- **`assistantFlowSchema.ts`**: tipo `FlowTransition`, `FlowNode.transicoes`, tipo de nó (pergunta / abertura / terminal); `parseFlowDefinition` aceita v1 e v2
- **`assistantFlowDefault.ts`**: fluxo padrão migra para v2, ganha os nós de abertura e o de criação de categoria
- **`assistantFlowEngine.ts`**: resolve o destino a partir do nó atual e do resultado
- **`assistantSlotParser.ts`**: `SlotParseResult` ganha o resultado nomeado
- **`assistantSlotSession.ts`**: consulta o motor para o destino; oferta de categoria deixa de ser inline
- **Endpoint da abertura**: entrega saudação e chips ao frontend

### Frontend

- **`FinancialAssistant.tsx`**: abertura vem do fluxo, com a padrão exibida de imediato e substituída quando o servidor responde
- **`FluxoAssistenteTab.tsx`**: `toGraph` gera arestas por transição e por valor, não por `ordem`
- **`PerguntaNode.tsx`**: handles de saída por resposta; visual próprio para nó de abertura e terminal
- **`flowValidation.ts`**: ciclo, inalcançável, destino inexistente
- **`assistantFlowService.ts`**: tipos do v2

### Banco de dados

`Sem alteração de estrutura` — `assistente_fluxos.definicao` é JSONB sem schema. Muda o conteúdo.

Dev tem uma linha em v1; a conversão na leitura resolve, e a primeira gravação persiste v2.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/services/assistantFlowSchema.ts`
- `backend/src/services/assistantFlowDefault.ts`
- `backend/src/services/assistantFlowEngine.ts`
- `backend/src/services/assistantSlotParser.ts`
- `backend/src/services/assistantSlotSession.ts`
- `backend/src/routes/assistantFlows.ts`
- `backend/src/services/assistantFlowEngine.test.ts`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/screens/config/fluxo/FluxoAssistenteTab.tsx`
- `src/screens/config/fluxo/PerguntaNode.tsx`
- `src/screens/config/fluxo/flowValidation.ts`
- `src/services/assistantFlowService.ts`

## Estratégia de implementação

**Etapa A — Ramificação por valor (só desenho, sem tocar no motor)**
1. `toGraph` deriva ramos das condições `aplicaQuando` existentes
2. Uma seta por valor de chip, rotulada, apontando ao primeiro nó aplicável
3. Validar visualmente que "Como pagou?" abre em três caminhos

Esta etapa é de baixo risco: nenhuma linha do motor muda, só a leitura do que já existe. Entrega o ganho visual mais imediato.

**Etapa B — Abertura no fluxo**
4. Nós de abertura no fluxo padrão (saudação, três chips, falas)
5. Endpoint entregando a abertura
6. `FinancialAssistant.tsx` consumindo, com padrão imediato e substituição

**Etapa C — Roteamento por resposta**
7. Formato v2 com `transicoes`, `parseFlowDefinition` aceitando v1 e v2
8. Resultado nomeado em `applySlotAnswer`, campos antigos derivados dele
9. Motor resolve o destino; `advanceSlotSession` consulta
10. **Portão: 130 testes**
11. Nó de criação de categoria visível
12. Canvas com autoligação e handles por resposta
13. Validações novas

**Portão final:** 130 testes, `tsc`, `vite build`.

## Regras de negócio identificadas

- A conversa começa na saudação, não na descrição
- Escolher "Lançar despesa" ou "Lançar receita" define o tipo do lançamento e o caminho
- "Consultar" sai do fluxo de preenchimento para a via de consulta
- Cada resposta possível tem destino declarado
- "Corrigir" e "Não" limpam o campo e voltam ao mesmo nó, na variante aberta
- "Pular" marca o slot e nunca mais pergunta
- Resposta não compreendida repete a pergunta com prefixo, sem gravar chute
- Categoria inexistente leva ao nó de criação, que só grava após "sim" explícito

## Os cinco casos que quebram o modelo simples

Precisam de teste individual **antes** de mexer no parser:

1. **"em 3x"** (L263-265) — preenche `billingType` **e** `installments` numa resposta. Uma transição, dois campos.
2. **`paidInstallments` negativo** (L277) — vira `0`, **não** pula.
3. **`invoiceNumber` negativo** (L330) — vira **pulo**, não valor vazio. Inverso do anterior.
4. **Chip "Sim" de `amountPaid`** (L306-313) — carrega `{amount}` renderizado, volta pelo parser e é lido por `extractAmountFromText`. Não é constante.
5. **Descrição aberta** (L212-216) — resposta livre vale inteira e já sai **confirmada**.

## Regras multi-tenant e segurança

(Vocabulário real: "tenant" = conta/usuário)

- Fluxo global, editável só pelo dono do sistema (CPF `08996441988`)
- `parseFlowDefinition` continua sendo a fronteira: destino inexistente, slot desconhecido ou definição malformada não chegam ao motor
- **Destino arbitrário é poder novo**: o fluxo passa a decidir a ordem de execução. A validação precisa impedir fluxo sem fim e lançamento sem campo obrigatório
- **A abertura passa a vir do servidor**: o texto exibido antes de qualquer autenticação de conteúdo precisa ser tratado como dado do sistema, não do usuário
- Falha ao carregar continua caindo no padrão, nunca deixando o assistente mudo

## Validações necessárias

- Backend: destino aponta para nó existente; `versaoFormato` reconhecido; transição com chave desconhecida ignorada
- Frontend: ciclo sem saída, obrigatório inalcançável a partir do primeiro nó, destino inexistente

## Testes necessários

### Backend
- **Os 130 testes existentes passando** — critério principal
- Fluxo v1 lido produz as mesmas perguntas de antes
- Cada um dos cinco casos especiais, individualmente
- Destino `'mesmo'` repergunta; `'proximo'` avança; id específico salta
- Definição com destino inexistente é recusada

### Frontend
- "Como pagou?" abre em três setas rotuladas
- Autoligação aparece no destino `'mesmo'`
- Abertura do chat exibe o padrão de imediato e troca pelo do fluxo
- Validação acusa ciclo e obrigatório inalcançável

### E2E
- Despesa no crédito: "Corrigir" na descrição volta à pergunta aberta; "Sim" avança
- Categoria inexistente leva ao nó de criação; recusar volta à pergunta
- Editar a saudação no editor muda o que o chat diz ao abrir

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" test
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- **Maior risco das features desta sessão.** O parser é a peça mais delicada do motor e desta vez é alterado — os planos anteriores o deixaram intacto de propósito. Os 130 testes são o único portão objetivo.
- **Os cinco casos especiais** são onde uma migração descuidada perde comportamento sem quebrar teste algum, se não houver teste para cada um.
- **A abertura sai do frontend**: hoje ela aparece instantânea e sem rede. Passar a depender do servidor introduz um caminho de falha onde não havia — mitigado pela exibição do padrão imediato.
- **Formato em produção**: tabela vazia hoje, mas abrir o editor antes do deploy semeia v1. A conversão precisa funcionar.
- **Duas fontes de ordem**: `ordem` (sequência) e `transicoes` (destino) podem divergir enquanto coexistirem.
- Nó de criação de categoria é a única escrita no banco que o motor faz — trazê-lo ao fluxo exige cuidado para não permitir criação sem "sim" explícito.

## Perguntas em aberto

- **`ordem` continua existindo em v2?** Se `destino: 'proximo'` precisa de uma sequência para saber qual é o próximo, `ordem` permanece necessária. A alternativa é todo destino ser explícito — mais verboso, sem ambiguidade. A decidir ao modelar o v2.
- **O tipo do lançamento (`kind`) passa a ser decidido pelo nó de abertura.** Hoje vem do `intentHint` ou de `inferKind` sobre a frase. Trazer a abertura ao fluxo pode tornar isso explícito, mas o caminho de quem digita direto sem clicar em chip precisa continuar funcionando.

## Critérios de aceite do plano

- Os 130 testes do backend passam
- Fluxo gravado em v1 continua produzindo a mesma conversa
- "Como você pagou?" aparece no canvas com três setas rotuladas
- "Corrigir" aparece como seta voltando ao próprio nó
- A saudação e os três chips de abertura aparecem como nós no desenho
- Editar a saudação no editor muda o que o chat diz
- Nó de criação de categoria aparece no desenho
- Validação acusa ciclo, obrigatório inalcançável e destino inexistente
- `tsc --noEmit` e `vite build` passam

## Observações para a skill implementar

- Usar este plano junto de `.plans/editor-visual-fluxo-assistente.md`
- **Rodar os 130 testes antes de começar** e a cada etapa
- Não alterar testes existentes para fazê-los passar — se um falhar, o roteamento novo é que está errado
- Escrever teste para cada um dos cinco casos especiais **antes** de mexer no parser
- Resolver as duas perguntas em aberto antes de escrever o schema v2
- **Fazer a Etapa A primeiro e parar para validação**: ela é só desenho, não toca no motor, e entrega o ganho visual imediato. O usuário pediu explicitamente para fazer a primeira etapa junto.
- Não corrigir bugs latentes; migrá-los como estão
- Não executar migrations sem confirmação explícita
- Não alterar `.env`
- Não abrir PR sem instrução explícita — projeto vai direto para `main` via skill `finalizar`
