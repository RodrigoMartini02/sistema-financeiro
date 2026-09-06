# Plano de Implementação: Lote expansível e correções do mockup

## Origem

- Arquivo de especificação: solicitações do usuário no chat, com screenshot do modal mostrando a faixa de resumo sem total e o botão "Salvar 1 despesas"
- Data do planejamento: 2026-09-06
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Três correções no `ExpenseDialog`, todas de frontend:

1. As despesas do lote passam a ter todos os campos editáveis, via expansão de um item por vez.
2. A faixa de resumo deixa de aparecer pela metade quando há lote.
3. O rótulo do botão de salvar corrige plural e contagem.

Nenhum endpoint, coluna ou migration. O payload enviado ao backend não muda.

## Decisões aplicadas

- Decisão 1: **opção 2** — um item do lote expandido por vez, com todos os campos editáveis. Escolhida pelo usuário depois de confirmar que a expansão dá acesso a qualquer campo; a alternativa (todos os formulários abertos simultaneamente) foi descartada pelo risco de multiplicar o estado do formulário.
- Decisão 2: **opção 1** — a faixa de resumo descreve apenas a despesa em preenchimento, com rótulo explícito, e some quando o formulário está vazio. O total do lote permanece no cabeçalho da lista.

## Contexto: a entrega anterior estava errada

A implementação anterior (commit `9f7a7d3`) entregou a lista do lote com apenas descrição e valor editáveis na linha. O usuário havia pedido todos os campos. O escopo foi reduzido sem combinar, e o usuário precisou repetir o pedido tres vezes.

Este plano corrige isso.

## Escopo

### Dentro do escopo

- Linha compacta por despesa no lote (descricao, valor, categoria/forma como resumo).
- Clicar na linha expande o item no lugar, com o formulario completo: categoria, forma de pagamento, cartao, tipo de cobranca, parcelas, datas, valor pago, anexos e nota fiscal.
- Fechar devolve a despesa atualizada a mesma posicao da lista.
- Se houver despesa valida em preenchimento no formulario ao expandir um item, ela vai para o lote antes, para nada se perder.
- Faixa de resumo com rotulo explicito de que descreve a despesa em preenchimento; oculta quando o formulario esta vazio.
- Rotulo do botao de salvar com plural correto e contagem coerente.

### Fora do escopo

- Abordagem com todos os formularios do lote abertos ao mesmo tempo (decisao 1 descartou).
- `IncomeDialog` — nao possui fluxo de lote.
- Alteracao de backend, schema ou migration.
- Pendencias anteriores nao relacionadas: lancamentos de meses anteriores e tabela de receitas que nao atualiza.
- Correcao do historico do commit `228de50`.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `src/screens/finance/ExpenseDialog.tsx` (estado atual, ~1030 linhas)
- `src/ui/dialogFormTokens.tsx` (tokens e `MoneyField`)
- `src/ui/dialog.tsx` (`scrollBody={false}`, corpo rolavel proprio)
- `.plans/lote-despesas-editavel-e-rodape-receitas.md` (plano anterior, cuja entrega foi insuficiente)
- `.plans/reorganizar-modal-despesa.md` (plano do mockup, para conferir o que ficou pela metade)
- Nao existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositorio.

## Investigação: por que a opção 2 é viável

O `ExpenseDialog` tem hoje **um** formulario, com 15 estados locais, 15 `useWatch`, 11 `useMemo` e 12 `useEffect` amarrados a ele. Varios sao por despesa: `anexos`, `valorInputMode`, `nfAberta`, `acHidden`, `acIndex`, `categoriaSugestao`.

Abrir todos os itens do lote ao mesmo tempo exigiria multiplicar esse estado por N — refatoracao grande na tela mais usada do sistema.

Com um item expandido por vez, existe **um** `useForm` ativo em qualquer momento. A instancia unica apenas passa a apontar ora para a despesa em preenchimento, ora para o item aberto do lote. O estado nao e multiplicado.

As tres queries do dialog (`categorias`, `cartoes`, `cardLimits`) usam React Query com chave centralizada, entao ja sao cacheadas e compartilhadas — nao ha custo adicional de rede na expansao.

## Impacto por área

### Frontend

Arquivo unico: `src/screens/finance/ExpenseDialog.tsx`.

- Remover a edicao inline de descricao e valor na linha do lote (substituida pela expansao).
- Novo estado para o indice do item expandido (`null` quando nenhum esta aberto).
- Funcoes de abrir e fechar item, que movem valores entre o `useForm` e o `batch`.
- Extrair o corpo do formulario em um trecho reutilizavel, usado tanto pela despesa nova quanto pelo item expandido.
- Linha compacta clicavel, com acessibilidade (papel de botao, resposta a Enter e Espaco).
- Faixa de resumo: rotulo explicito e ocultacao quando vazia.
- Rotulo do botao de salvar: plural e contagem.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/ExpenseDialog.tsx`

## Estratégia de implementação

Segue a regra do projeto para redesign: remover antes de aplicar.

### Etapa 1 — remover

1. Remover a edicao inline de descricao e valor da linha do lote, e o handler `editarNoLote`.

### Etapa 2 — aplicar

2. Adicionar o estado do item expandido e as funcoes de abrir e fechar.
3. Extrair o corpo do formulario para reuso entre "nova despesa" e "item do lote".
4. Montar a linha compacta clicavel, com a expansao no lugar.
5. Corrigir a faixa de resumo (rotulo e ocultacao).
6. Corrigir o rotulo do botao de salvar.

## Regras de negócio identificadas

- Nada no lote foi salvo: a gravacao so acontece no submit, que envia `[...batch, despesa do formulario]`. Por isso todos os itens permanecem editaveis.
- Ao expandir um item, ele sai temporariamente da lista e ocupa o formulario; ao fechar, volta atualizado a mesma posicao.
- Se o formulario tiver uma despesa valida (descricao e valor preenchidos) quando o usuario expande um item do lote, essa despesa vai para o lote antes — nada e descartado.
- Se o formulario estiver incompleto, nao ha o que preservar: ele nao passa na validacao para virar item do lote.
- Um item expandido nao pode ser salvo em duplicidade: enquanto esta aberto, ele nao existe no `batch`.
- A faixa de resumo descreve a despesa em preenchimento, nao o lote.

## Regras multi-tenant e segurança

O projeto nao e multi-tenant por organizacao: o isolamento e por `usuario_id`, aplicado no backend. Esta alteracao e de apresentacao e estado local em memoria, e nao toca autenticacao, autorizacao nem filtro por usuario.

## Validações necessárias

- As validacoes do formulario (schema zod existente) passam a valer tambem para o item expandido, ja que ele ocupa o mesmo `useForm`.
- Fechar um item expandido com descricao ou valor invalidos deve ser tratado: ou impedir o fechamento, ou devolver o item ao lote com os valores anteriores. A implementacao deve escolher e registrar o comportamento.

## Testes necessários

### Frontend

Nao ha suite de teste de componente no projeto. Verificacao manual:

- Adicionar 3 despesas ao lote, expandir a segunda, alterar categoria e forma de pagamento, fechar e conferir que voltou na mesma posicao com os valores novos.
- Expandir um item com o formulario preenchido e conferir que a despesa em preenchimento foi para o lote, sem perda.
- Conferir que a despesa expandida nao e salva duas vezes.
- Conferir que anexos e categoria voltam junto ao expandir.
- Salvar o lote e conferir que todas as despesas foram gravadas com os valores editados.

### Backend

Suite existente deve continuar passando (23 testes). Nenhum teste novo: o backend nao muda.

### E2E

Nao aplicavel — projeto nao tem E2E configurado.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
cd backend && npm run build && npm test
```

Observacao: `src/screens/despesas/DespesasScreen.tsx:727` tem um erro de tipo pre-existente, nao relacionado a esta alteracao.

## Riscos e pontos de atenção

- **Medio-alto:** a etapa 3 mexe no corpo do formulario, que e a tela mais usada do sistema. `tsc` e build cobrem tipo, nao comportamento — a conferencia visual do usuario e necessaria antes do merge.
- **Medio:** abrir e fechar um item reinjeta valores no `useForm`. Anexos, categoria, cartao e configuracao de parcelas precisam voltar junto; um item nao pode ser salvo em duplicidade.
- **Medio:** o `useForm` passa a ter dois papeis (despesa nova e item do lote). Se o estado nao for limpo corretamente na transicao, valores de um item podem vazar para o proximo.
- **Baixo:** faixa de resumo e rotulo do botao sao apresentacao.

## Perguntas em aberto

- Qual o comportamento ao tentar fechar um item expandido com dados invalidos? A implementacao deve escolher entre impedir o fechamento ou restaurar os valores anteriores, e registrar a escolha no resumo final.

## Critérios de aceite do plano

- Clicar numa despesa do lote abre todos os campos dela, editaveis.
- Fechar devolve a despesa atualizada a mesma posicao da lista.
- Expandir um item com o formulario preenchido nao perde o que estava digitado.
- Nenhuma despesa e salva em duplicidade.
- A faixa de resumo nao aparece pela metade e deixa claro que descreve a despesa em preenchimento.
- O botao mostra "Salvar 1 despesa" no singular e conta corretamente.
- Nenhum residuo da edicao inline anterior permanece no arquivo.
- `tsc --noEmit`, `vite build` e os 23 testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir a ordem das duas etapas: remover antes de aplicar.
- Nao implementar a abordagem com todos os formularios abertos — a decisao 1 escolheu a expansao de um por vez.
- Nao alterar `IncomeDialog`.
- Reutilizar os tokens de `dialogFormTokens.tsx`; nao criar tokens novos.
- Preservar acessibilidade na linha clicavel (papel, foco, resposta a teclado).
- Nao executar migrations. Nao alterar `.env`.
- Manter o payload de `toFormValues` inalterado.
- Registrar no resumo final qual comportamento foi escolhido para o fechamento com dados invalidos.
