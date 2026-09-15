# Respostas como blocos independentes no canvas

## O problema

As respostas ainda estão desenhadas **dentro** do card da pergunta, como uma
lista de chips. Foi apontado três vezes e corrigido pela metade: em
`be29aed` elas ganharam um ponto de saída cada, mas continuaram dentro do
mesmo `<div>` da mensagem em `PerguntaNode.tsx`.

O card deve conter **só a mensagem**. Cada resposta é um bloco próprio no
canvas — independente, arrastável, com sua própria saída.

```
   ┌──────────────────────┐
   │ INÍCIO DA CONVERSA   │   card = só a mensagem
   │ Olá! O que vamos     │
   │ fazer hoje?          │
   └──┬────────┬───────┬──┘
      │        │       │
 ┌────▼───┐ ┌──▼────┐ ┌▼──────┐
 │Lançar  │ │Lançar │ │Consul-│   três blocos separados
 │despesa │ │receita│ │tar    │
 └────┬───┘ └──┬────┘ └───┬───┘
      │        │          │
   ┌──▼──┐  ┌──▼──┐   ┌───▼──┐
   │DESCR│  │DESCR│   │(fora)│
   └─────┘  └─────┘   └──────┘
```

## Seguir e retornar

Uma resposta pode **seguir** (avançar para a próxima pergunta) ou **retornar**
(voltar para uma anterior, ou para a própria pergunta).

"Corrigir" é o caso de retorno que já existe: o parser tem
`CORRECTION = ['corrigir', 'trocar', 'outro', ...]`
(`assistantSlotParser.ts:41`), que limpa o slot e repergunta. Hoje isso
acontece sem aparecer no desenho — a seta de volta não é desenhada.

O formato já suporta: `transicoes.destino` aceita qualquer id de nó, inclusive
um anterior ou o próprio. O que falta é **desenhar** e **deixar ligar**.

Distinção visual:
- **seguir** — seta para frente, ciano
- **retornar** — seta curva de volta, âmbar, para o olho distinguir na hora

## Modelo de dados

O bloco de resposta **não** é um `FlowNode`: ele não preenche slot, é uma
opção de um nó existente (`variante.opcoes[n]`). Vira nó sintético do canvas,
como já é feito com a abertura.

Id sintético: `<idDoNo>::<valorDaOpcao>`. Precisa de posição própria, então
`SlotOption` (backend) e `FlowOption` (frontend) ganham:

```ts
posicao?: { x: number; y: number };
```

Opcional e validada como a de `FlowNode` — posição malformada é descartada sem
derrubar a opção.

Sem posição gravada, o bloco cai num layout automático: em coluna abaixo do
card, espaçado, para um fluxo nunca editado já abrir legível.

## Etapas

### 1. `RespostaNode.tsx` (novo)

Bloco compacto: o label da resposta, handle `target` em cima (recebe do card
da pergunta) e handle `source` embaixo (vai para o destino).

Visual distinto do card de pergunta — menor, arredondado, cor da resposta.
Mostra o valor técnico em `title`, para conferir sem abrir o painel.

### 2. `PerguntaNode`: card só com a mensagem

Remover o bloco de chips de dentro do `<div className="px-3 py-2">`.

O card mantém **um** handle `source` embaixo, de onde saem as ligações para os
blocos de resposta. Os handles por opção somem do card — migram para os
blocos.

O mesmo em `AberturaNode`.

### 3. `toGraph`: gerar os blocos

Para cada nó com opções estáticas, emitir um `RespostaNode` por opção:
- posição de `opcao.posicao`, ou layout automático
- aresta card → bloco (cinza, sem rótulo: o rótulo é o próprio bloco)
- aresta bloco → destino, vinda de `transicoes` ou da derivação atual
- aresta de retorno (destino é nó anterior ou o próprio) em âmbar, curva

Opções de catálogo (`categorias`, `cartoes`) viram **um bloco tracejado só**,
não um por item: a lista muda por usuário e a cada cadastro, e todos os itens
levam ao mesmo destino — escolher um cartão ou outro preenche o campo, não
muda o caminho. Um bloco conta a história inteira sem poluir o canvas nem
fingir que "Nubank" faz parte do fluxo.

A variante de cartão único ("No cartão {primeiroCartaoNome}, certo?") tem
chips fixos e ganha blocos normais, com "Outro" como retorno.

### 4. Arrastar o bloco grava a posição

`handleNodeDragStop` passa a reconhecer o id sintético: separa
`<idDoNo>::<valor>`, acha a opção e grava `posicao` nela.

### 5. Painel edita a resposta selecionada

Clicar num bloco abre, no painel: texto do botão, valor enviado (com o aviso
de parser que já existe) e para onde leva — um select com as perguntas do
fluxo, marcando quais são retorno.

O painel da pergunta deixa de listar as opções: elas agora se editam pelos
próprios blocos.

### 6. Ligações arrastáveis

`onConnect` passa a tratar o id sintético: ligar de um bloco de resposta grava
a transição no nó dono, com `quando` = valor da opção. É o mesmo destino de
antes, só muda de onde a ligação parte.

Ligar **para trás** grava igual — o que muda é só a cor da seta.

### 7. Validação

- retorno que cria ciclo sem saída → aviso (`A → B → A` com ambos sempre
  aplicáveis trava a conversa)
- bloco de resposta sem destino → cai na varredura, sem aviso (é o padrão)

## Testes

Backend (139 atuais): `parseOption` preservando `posicao` válida, descartando
malformada, e opção sem posição seguindo válida.

Frontend não tem runner: `tsc --noEmit` + `vite build`.

## Risco

Baixo-médio, contido no editor. O motor não muda nesta etapa — continua
varrendo a ordem. O formato ganha um campo opcional em `opcoes`, que o motor
ignora (ele lê `label` e `value`).

Atenção: o canvas passa a ter bem mais nós (13 perguntas + ~20 respostas). O
layout automático precisa nascer legível, senão o desenho vira um emaranhado
— que é o problema que esta tela existe para resolver.

## Fora de escopo

- Motor obedecer transições (bloco seguinte, já planejado)
- Coluna `extras` e campos personalizados
- Fluxo de consulta desenhado
