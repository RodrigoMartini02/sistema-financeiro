# Assistente: briga de espaço entre teclado, barra de digitar e conversa

## O problema

Com o teclado aberto, a barra de digitar e a conversa disputam espaço: o
rodapé some atrás do teclado, ou a conversa é empurrada para fora da tela.

## A causa

O container usa `h-[100dvh]` (`FinancialAssistant.tsx:791`), que é a altura da
**janela**. No Android e no iOS o teclado virtual **não altera a janela** — ele
encolhe apenas o `visualViewport`.

Ou seja: o teclado abre, o container continua com a altura cheia, e a parte de
baixo — justamente o rodapé com a barra de digitar — fica escondida atrás dele.

Existe um efeito que escuta `visualViewport.resize`
(`FinancialAssistant.tsx:421`), mas ele só faz `scrollIntoView` na última
mensagem. Isso reposiciona a conversa, não corrige a altura do container: o
rodapé continua fora da área visível.

Foi por isso que o ajuste anterior (trocar `min-h` por `h`) resolveu pela
metade — impediu o container de crescer, mas ele ainda não **encolhe** quando
o teclado aparece.

## A correção

O container passa a usar a altura do `visualViewport`, não a da janela.

1. `ref` no `<section>` e um estado com a altura visível
2. No `resize` e no `scroll` do `visualViewport`, gravar `viewport.height`
3. Aplicar como `style={{ height }}`, mantendo `100dvh` no CSS como fallback
   para quando a API não existir (desktop antigo, navegador sem suporte)

Com a altura certa, o `flex` já resolve o resto: o rodapé é `shrink-0`, a
conversa é `flex-1 overflow-y-auto`, e ela encolhe sozinha.

### Por que também escutar `scroll`

No iOS, o `visualViewport` desloca (`offsetTop`) quando o teclado abre e a
página rola por baixo. Sem reagir ao `scroll`, o container fica com a altura
certa mas na posição errada — a barra sobe ou desce alguns pixels.

### Só no modo standalone

O modo flutuante (`sm:`) tem altura própria e fica ancorado no canto: ali não
há briga com o teclado, e forçar a altura da viewport quebraria o
posicionamento. A correção vale para `isStandalone`, que é o app em tela cheia.

## Testes

Frontend não tem runner. Garantia por `tsc --noEmit`, `vite build` e teste na
tela: abrir o teclado com a conversa cheia e com o card aberto, conferindo que
a barra de digitar continua visível e a conversa rola por baixo dela.

## Risco

Baixo. Uma medida de altura aplicada a um container; nada de estado de
conversa, gravação ou rede.

Ponto de atenção: em desktop o `visualViewport.height` acompanha a janela
normalmente, então o comportamento não muda ali. Se a API não existir, o
`100dvh` do CSS continua valendo.

## Fora do escopo

- Redesenhar o rodapé ou o composer
- Mudar o card (acabou de ser ajustado)
- Comportamento do teclado no modo flutuante
