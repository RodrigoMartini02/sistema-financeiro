# Feature: Compactar visualmente a demo interativa via escala

## Contexto

A demo interativa (`demo.html` + `src/demoMain.tsx`, isolada via iframe conforme
`docs/features/demo-isolamento-via-iframe.md`) reaproveita as telas reais do sistema
(`FinanceDashboard`, `MovimentacoesScreen`, `ExpenseDialog`, `IncomeDialog`, etc.), pensadas para
rodar em tela cheia no app autenticado real. Dentro do card da Home (680px de altura), o modal de
despesa/receita (`Dialog` com `size="xl"`, `max-w-[980px]`, `min-h-[560px]`) fica desproporcional
— maior que o espaço disponível, exigindo scroll interno visível mesmo com poucos campos.

## O que o usuário quer

Reduzir a escala visual de toda a demo (sidebar, telas, modais) proporcionalmente, para que o
conteúdo caiba melhor no espaço do card sem depender de scroll constante — usando
`transform: scale()` aplicado ao conteúdo dentro do documento `demo.html`, não editando o CSS
interno das telas reais.

## Decisão técnica já tomada

Aplicar `transform: scale(...)` no elemento raiz do conteúdo dentro de `demoMain.tsx` (ou no body
do `demo.html`), em vez de:
- Editar diretamente `ExpenseDialog.tsx`/`IncomeDialog.tsx` (telas reais, compartilhadas com o app
  autenticado — qualquer mudança ali afetaria produção).
- CSS scoped reduzindo fontes/paddings especificamente (mais trabalho, mais superfície de
  regressão visual campo a campo).

## Objetivo

Aplicar uma escala consistente a todo o conteúdo renderizado dentro de `demo.html`, de forma que a
demo (incluindo os modais de despesa/receita) fique visualmente compacta e proporcional ao espaço
do card na Home, sem alterar nenhuma linha das telas reais compartilhadas com o app autenticado.

## Escopo funcional

- `transform: scale(X)` (fator a definir/testar, ex. 0.8–0.85) aplicado ao container raiz dentro
  de `demoMain.tsx`.
- Ajustar as dimensões do container pai (`width`/`height` compensando a escala, já que
  `transform: scale` não redimensiona o espaço ocupado no layout — é necessário usar
  `transform-origin` e recalcular a "caixa" efetiva, ou envolver em um wrapper com dimensões
  ampliadas na proporção inversa da escala, para o conteúdo continuar preenchendo o iframe
  corretamente).
- Validar que interações (cliques, campos de formulário, scroll) continuam funcionando
  normalmente com o conteúdo escalado (o navegador ajusta automaticamente a área de clique
  conforme a escala CSS, mas deve ser testado).

## Fora do escopo

- Qualquer alteração em `ExpenseDialog.tsx`, `IncomeDialog.tsx`, `FinanceDashboard.tsx`,
  `MovimentacoesScreen.tsx` ou qualquer outra tela real.
- Mudanças na Home fora do tamanho/comportamento do card da demo.
- A seção de benefícios/venda pedida anteriormente (spec separada, ainda pendente).

## Observações para o /planejar

- Ler o estado atual de `src/demoMain.tsx` e `src/layout/AppShell.tsx` (já ajustado para
  `h-screen` no modo demo) antes de decidir onde aplicar a escala.
- Testar visualmente o fator de escala escolhido — não adivinhar um valor "correto" sem
  verificação, já que aplicar escala demais pode deixar o texto ilegível.
