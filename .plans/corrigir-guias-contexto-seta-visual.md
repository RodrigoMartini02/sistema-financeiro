# Corrigir guias de primeiro acesso por contexto e seta

## Contexto

A validacao visual local confirmou dois problemas:

- Na tela Movimentacoes, com usuario temporario em banco local, nenhum balao aparece no estado limpo, mesmo com os botoes `Nova receita`, `Nova despesa`, `Fechar mes` e `Movimentar reserva` visiveis. Ao dispensar manualmente escopos internos/ocultos, o guia de `Nova receita` aparece. Isso indica que guias montados fora do alvo visual sequestram o slot unico do coordenador.
- Quando o guia aparece, o balao fica abaixo do botao, mas a seta fica fixa perto da borda direita do balao. Na captura medida, ela ficou cerca de 31px a direita do centro do botao, o que deixa a indicacao pouco pontual.
- Abrindo o modal `Nova receita` fora da ordem, o modal aparece, mas nenhum guia local aparece. O slot segue preso em outro escopo.

## Objetivo

Fazer os guias aparecerem apenas quando o alvo visual daquele contexto existe, priorizando modais/telas abertas, e ajustar a seta para apontar ao centro do alvo sempre que possivel.

## Escopo

### 1. Coordenador de guias por camada

- Evoluir `FirstAccessGuideContext` para registrar guias com uma camada (`page` e `modal`).
- Adicionar uma camada/superficie ativa para modais abertos, de modo que guias da pagina de fundo nao aparecam enquanto o modal esta aberto.
- Manter a prioridade por modulo dentro da camada ativa.

### 2. Hook `useFirstAccessGuide`

- Manter `enabled`.
- Adicionar opcao `layer`.
- Retornar `isVisible` considerando escopo e camada.

### 3. Dialog/modal

- Registrar a superficie de modal aberto no componente `Dialog`.
- Atualizar guias dentro de modais com `enabled: open` e camada de modal, especialmente:
  - `IncomeDialog`
  - `BatchPaymentModal`
  - `ReservaDialog`
  - dialogs internos de configuracao com hooks de guia, quando aplicavel.

### 4. Telas embutidas em Movimentacoes

- Ajustar `ReceitasScreen` e `DespesasScreen` para registrar guias internos apenas quando as condicoes visuais usadas no render realmente podem mostrar o balao.
- Manter os guias principais nos botoes reais de `MovimentacoesScreen`.

### 5. Seta do balao

- Corrigir o lado da seta conforme a posicao real do balao.
- Calcular dinamicamente o deslocamento horizontal da seta em relacao ao centro do alvo.
- Clamp dentro do balao para evitar seta fora da borda.

## Fora do escopo

- Criar novos textos de guia.
- Alterar backend, banco, migrations ou `.env`.
- Refatorar layout geral das telas.
- Criar dados permanentes de teste alem do usuario temporario usado na validacao local.

## Validacao

- `npm run build`
- `git diff --check`
- Validacao visual com Playwright:
  - Movimentacoes estado limpo deve mostrar guia no botao real de `Nova receita`.
  - Seta deve apontar para o centro do alvo com diferenca pequena.
  - Ao abrir `Nova receita`, o guia local do modal deve aparecer e guias da pagina de fundo devem sumir.
  - Conferir desktop e uma largura mobile.
