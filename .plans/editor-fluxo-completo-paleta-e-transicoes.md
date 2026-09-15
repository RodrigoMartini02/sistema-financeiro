# Editor de fluxo completo: paleta, edição de textos e transições gravadas

Substitui `.plans/canvas-editavel-transicoes-explicitas.md`, que cobria só
parte disto.

## Objetivo

Sair de um canvas que **mostra** o fluxo para um que **define** o fluxo:
arrastar campos da paleta para criar nós, editar textos e chips, ligar cada
resposta ao seu destino, e criar campos que não existem no banco.

## O que está errado hoje

**Desenho.** Chips são decoração dentro do card e setas são agrupadas
(`"Lançar despesa · Lançar receita"` numa linha só). Otimiza o traçado e
esconde a estrutura. Cada resposta precisa do seu ponto de saída.

**Fundo.** Não existe "para onde esta resposta vai". `nextQuestion` varre
`definition.ordem` e devolve o primeiro nó aplicável; o destino é *derivado*
das condições `aplicaQuando`. Por isso não dá para arrastar ligação — não há
onde gravá-la.

**Painel.** Somente leitura desde que foi criado.

## Decisões estruturais

### 1. Transições explícitas (formato v2)

`versaoFormato: 2`, `FlowNode` ganha:

```ts
interface FlowTransicao {
  /** Valor da resposta que leva a este destino, ou '*' para qualquer outra. */
  quando: string;
  /** Id do nó de destino, ou null para encerrar. */
  destino: string | null;
}
```

Resolução em `nextQuestion`:
1. transição com `quando` igual ao valor respondido → `destino`
2. transição com `quando: '*'` → esse destino
3. sem transição aplicável → varredura da `ordem` (comportamento atual)

O passo 3 é o que mantém fluxo v1 rodando igual. **`aplicaQuando` continua
sendo avaliada** mesmo seguindo transição explícita: uma ligação desenhada à
mão não pode levar a "qual cartão?" numa compra em dinheiro.

### 2. Id do nó separado do slot

O formato já tem `id` e `slot` separados, mas hoje eles coincidem. Para um
campo aparecer em dois pontos do fluxo (valor perguntado diferente no crédito
e no Pix), os ids passam a ser gerados (`amount-2`, `amount-3`).

Impacto: `nodeForSlot` devolve o primeiro nó daquele slot — usado em
`questionFor` (confirmações) e `dependentsOf`. Com repetição isso vira
ambíguo. Passa a receber o id quando o chamador o conhece, caindo no primeiro
como hoje quando não conhece.

### 3. Campos personalizados em `extras` (JSONB)

Campo novo **não** vira coluna. Uma migration agora adiciona `extras JSONB` em
`despesas` e `receitas`; depois disso campo novo é edição de fluxo.

```ts
interface FlowCampoPersonalizado {
  chave: string;                                   // 'fornecedor'
  rotulo: string;                                  // 'Fornecedor'
  tipo: 'texto' | 'numero' | 'data' | 'booleano' | 'lista';
}
```

Nó com `campoPersonalizado` em vez de `slot` grava em `extras[chave]`.

**Por que não gerar coluna por clique:** seria DDL em produção disparada por
interface. Um erro ali corrompe a tabela de lançamentos. Não será construído.

**Limite honesto:** campos em `extras` ficam gravados e visíveis no detalhe do
lançamento, mas **não** entram sozinhos em modal, listagens ou relatórios, que
leem colunas nomeadas. Levá-los para lá é trabalho por tela.

## Etapas

### A. Schema v2 (backend)

- `FlowTransicao`, `FlowCampoPersonalizado`
- `FlowNode`: `transicoes?`, e `slot` ou `campoPersonalizado` (exatamente um)
- `parseTransicao`: destino precisa ser id existente ou `null`; destino
  inexistente é descartado
- `parseCampoPersonalizado`: `chave` em `snake_case` (vira chave de JSON),
  tipo dentro da união
- `parseFlowDefinition` aceita `versaoFormato` 1 ou 2
- ids duplicados continuam sendo erro

### B. Migration `extras`

`ALTER TABLE despesas ADD COLUMN extras JSONB` e o mesmo em `receitas`.
Nullable, sem default — lançamento sem campo personalizado continua idêntico.

**Não executar sem confirmação explícita.** O banco pode estar em produção.

### C. Motor obedece o desenho

- `nextQuestion(draft, catalog, skipped, ultimaResposta?)` — parâmetro novo
  opcional, chamadas existentes seguem válidas
- rascunho ganha `extras: Record<string, unknown>`
- parser dos tipos personalizados reusa o que já existe (data, número,
  booleano) — sem parser novo por campo
- gravação: rota de despesa/receita persiste `extras` quando houver

### D. Nós com saída por resposta (canvas)

`PerguntaNode` ganha um `Handle` `source` por opção, `id` = valor da opção.
`toGraph` para de agrupar: uma aresta por opção, com `sourceHandle`. Arestas
vêm de `transicoes` quando existirem, e da derivação atual quando não — assim
fluxo v1 aparece desenhado certo antes de qualquer edição.

Remover o agrupamento `destinoPorOpcao` da abertura: foi a decisão errada.

### E. Paleta (painel da direita)

O painel passa a ter duas abas:

- **Campos** — os 14 slots conhecidos, arrastáveis para o canvas. Mostra quais
  já estão em uso (permitido repetir, mas o painel indica).
  Mais o botão "Campo personalizado", que abre nome + tipo.
- **Propriedades** — o que existe hoje, agora editável (etapa F).

Soltar no canvas cria o nó na posição, com id gerado e uma pergunta inicial
(`"Qual o/a {rotulo}?"`), e acrescenta à `ordem`.

### F. Edição de textos

No painel de propriedades, editável:
- texto de cada variante da pergunta
- label e valor de cada chip
- adicionar/remover chip
- `skippable`, `exigeConfirmacao`

**Valor do chip é livre, com aviso imediato.** `VALORES_ACEITOS` (já existe em
`flowValidation.ts`) roda enquanto se digita: valor fora da lista que o parser
entende mostra aviso na hora — senão só se descobre conversando, quando o
assistente responde "Não peguei essa parte".

### G. Edição no canvas (o "tipo Miro")

- `onConnect`: arrastar de um handle e soltar em outro nó grava a transição
  (`quando` = id do handle, `destino` = nó alvo)
- `onEdgesDelete` / reconectar: remove ou atualiza a transição
- `onNodesDelete`: remove o nó, sua entrada na `ordem` e **toda transição que
  apontava para ele** — senão sobra referência órfã

### H. Validação

Erros (travam Salvar):
- transição para nó inexistente
- nó sem slot e sem campo personalizado
- chave de campo personalizado duplicada

Avisos:
- ciclo entre transições (`A → B → A` trava a conversa)
- opção sem transição correspondente
- nó inalcançável a partir da abertura
- valor de chip fora de `VALORES_ACEITOS`

## Testes

Sobre os 136 atuais:

- **equivalência**: fluxo v1 sem transições produz a mesma sequência de
  perguntas, slot a slot — critério objetivo de não-regressão
- transição explícita tem precedência sobre a varredura
- `'*'` só vale quando nenhum valor específico bate
- destino cujas `aplicaQuando` não batem é pulado
- ciclo não trava o motor
- mesmo slot em dois nós: cada um com sua pergunta
- campo personalizado grava em `extras` com o tipo certo
- `parseTransicao` descarta destino inexistente
- `parseCampoPersonalizado` rejeita chave inválida

## Risco

**O maior até aqui.** Mexe no motor que conduz toda conversa de lançamento,
no schema do banco e no formato salvo — não só no editor restrito a um usuário.

Contenções:
- transições opcionais; sem elas o caminho é o de hoje
- suíte de equivalência como critério de não-regressão
- `aplicaQuando` preservada: desenho errado não gera pergunta impossível
- v1 continua válido, nenhum fluxo salvo quebra
- `extras` é nullable: lançamento sem campo personalizado é idêntico ao atual

Sugestão de ordem de entrega, para validar na tela antes de seguir:
**A+D+E+F** (editor completo, sem mexer no motor) → **C+G** (motor obedece o
desenho) → **B** (migration) + campos personalizados.

## Fora de escopo

- Fluxo de consulta desenhado (adiado por você)
- Campos de `extras` em modal, listagens e relatórios
- Coluna real por campo novo (migration escrita e revisada, nunca por clique)
