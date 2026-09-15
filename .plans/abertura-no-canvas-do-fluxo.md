# Desenhar a abertura do chat no canvas do fluxo

## Problema

A abertura (saudação + os três chips de intenção) já é dado editável: está no
`DEFAULT_FLOW_DEFINITION.abertura`, validada por `parseAbertura`, servida por
`GET /assistant-flows/abertura` e consumida pelo `FinancialAssistant`.

Mas o canvas não a desenha. `toGraph` mapeia apenas `definition.nos`, e
`definition.abertura` nunca é lida pelo editor. Na prática o fluxograma começa
em "Como você quer descrever esse lançamento?" — como se a conversa nascesse
no meio. Quem olha o desenho não vê o que o usuário encontra ao abrir o chat,
nem que **é a escolha da intenção que decide qual fluxo roda**.

## Decisão de projeto: a abertura NÃO vira um `FlowNode`

Tentador reaproveitar `PerguntaNode`, mas quebra:

- `parseNode` rejeita nó cujo `slot` não esteja em `KNOWN_SLOTS`
  (`assistantFlowSchema.ts:180`). "abertura" não é slot e nunca será — ela não
  preenche campo de lançamento, ela escolhe o fluxo.
- `validateFlow` assume que todo nó preenche slot (chips validados contra
  `VALORES_ACEITOS[node.slot]`, obrigatórios por tipo). Um nó sem slot geraria
  falso positivo.
- `definition.ordem` é a ordem de avaliação dos slots que o motor percorre.
  Meter "abertura" ali faria o motor procurar um nó inexistente.

Então: **nó visual sintético**, montado no `toGraph` a partir de
`definition.abertura`, com `type: 'abertura'` e componente próprio. Ele existe
no grafo do React Flow, não no `nos` do fluxo. O formato salvo não muda —
nada de migration, nada de `versaoFormato` novo.

## Etapas

### 1. `AberturaNode.tsx` (novo)

Componente visual da abertura. Distinto do `PerguntaNode` de propósito — é
outro tipo de coisa, e o desenho deve dizer isso:

- borda/acento em âmbar ou violeta (não ciano, que é a cor de pergunta de slot)
- ícone de início (`Play` ou `MessageCircleMore`)
- rótulo "INÍCIO DA CONVERSA"
- a saudação como texto principal
- os três labels das opções como chips
- **sem** `Handle` do tipo `target` — nada aponta para a abertura, ela é a raiz
- `Handle` `source` embaixo

### 2. `toGraph`: nó + arestas da abertura

Em `FluxoAssistenteTab.tsx`:

- se `definition.abertura` existir, empilhar o nó sintético com id reservado
  `__abertura__` e `position` vinda de `definition.abertura.posicao` (ver
  etapa 4), com fallback acima do tronco (ex.: `{ x: 0, y: -240 }`)
- uma aresta por opção, saindo de `__abertura__`:
  - `register_expense` → primeiro nó aplicável com `kind: 'expense'`
  - `register_income` → primeiro nó aplicável com `kind: 'income'`
  - `ask` → **sem destino**: a consulta não entra no preenchimento guiado, sai
    pela via de perguntas livres. Desenhar como aresta terminando num nó
    pequeno "consulta livre (fora do fluxo guiado)", senão a seta some e dá a
    impressão de caminho quebrado.
- rótulo de cada aresta = label da opção ("Lançar despesa", "Lançar receita")
- cor distinta das arestas de ramificação (ciano) e do tronco (cinza)

O destino de despesa/receita reaproveita `primeiroNoAplicavel` do
`flowBranches.ts`, que já sabe percorrer a `ordem` pulando os inaplicáveis —
basta exportá-la e chamar com `{ kind: 'expense' }` / `{ kind: 'income' }`.
Isso mostra concretamente por que receita pula categoria e forma de pagamento.

### 3. Painel de propriedades

Ao selecionar a abertura, `PainelPropriedades` recebe hoje um `FlowNode`.
Passa a tratar o caso da abertura: exibir saudação e as três opções
(label + fala de abertura + intenção). Somente leitura, como o resto do painel
é hoje.

### 4. Posição arrastável

`handleNodeDragStop` procura o nó em `definicao.nos` e não acharia
`__abertura__`. Tratar antes: se o id for `__abertura__`, gravar em
`definicao.abertura.posicao`.

Isso exige campo novo `posicao?: { x: number; y: number }` em `FlowAbertura`
— nos dois lados (`assistantFlowSchema.ts` e `assistantFlowService.ts`) — e
`parseAbertura` lendo-o com a mesma checagem de `x`/`y` numéricos que
`parseNode` já faz. Campo opcional: fluxo salvo sem ele cai no fallback.

### 5. Validação

Em `flowValidation.ts`, avisos novos (severidade `aviso`, não `erro` — fluxo
sem abertura ainda roda, cai no padrão):

- fluxo sem `abertura` → "o chat vai abrir com a saudação padrão"
- opção cuja intenção não leva a nenhum nó aplicável → seta para o vazio

Como `FlowIssue.nodeId` é `string | null`, usar `__abertura__` para o selo
aparecer no nó certo.

## Testes

Backend (`npm test`, hoje 130): `parseAbertura` preservando `posicao` válida,
descartando `posicao` malformada, e abertura sem `posicao` continuando válida.

Frontend não tem runner; garantia é `tsc --noEmit` + `vite build`.

## Risco

Baixo e contido no editor. O formato salvo ganha um campo opcional; o
`FinancialAssistant` não lê `posicao` e não muda de comportamento. O motor
(`AssistantFlowEngine`) não toca em `abertura` — continua percorrendo `ordem`
e `nos`. Nenhuma migration.

## Fora de escopo

- Editar os textos da abertura pelo painel (o painel é leitura em todo o
  editor; mudaria o escopo para "tornar o editor editável", outro trabalho)
- Desenhar o fluxo de consulta livre (adiado por você: "deixe consulta para
  depois")
- Etapa C (roteamento por resposta com `transicoes`, "Corrigir" como self-loop)
