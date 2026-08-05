# Plano de Implementação: Reestruturar o modal "Nova despesa" (ordem O QUÊ→COMO→QUANTO→QUANDO e valor por parcela)

## Origem

- Especificação: fornecida diretamente pelo usuário no chat (segunda versão do comportamento do modal, evolução da spec original em `.plans/tasks/redesign-modal-nova-despesa.md`)
- Data do planejamento: `2026-08-05`
- Classificação: `frontend + backend + database` (sem migration — mesmas colunas, mudança de semântica só para despesas criadas a partir do deploy desta mudança)

## Resumo

Reestruturar o modal `ExpenseDialog.tsx` (já reescrito nesta sessão com CSS fiel ao mockup, na branch `feat/R/redesign-modal-despesa`) para uma nova ordem de blocos — **O QUÊ** (descrição + categoria) → **COMO** (forma de pagamento → cartão → "isso se repete") → **QUANTO** (valor) → **QUANDO** (data, vencimento, status, juros/desconto) — e inverter o significado do campo Valor: hoje o usuário digita o TOTAL da compra e o sistema divide por N parcelas; a partir de agora o usuário digita o valor da PARCELA (ou mensal, ou pago, dependendo do tipo de repetição) e o total é só exibido como informação derivada. A lógica de juros/desconto sai do bloco de Valores (campo solto "+ Teve juros ou desconto") e passa a viver dentro do bloco de Data, condicionada à comparação entre a data informada e o vencimento derivado. Adiciona-se também um link opcional "sei o preço à vista" (só quando parcelado), puramente informativo. A detecção de duplicata passa a considerar também o número de parcelas.

## Escopo

### Dentro do escopo

- Reordenar os 4 blocos do modal: O QUÊ → COMO → QUANTO → QUANDO.
- Campo Valor com rótulo dinâmico conforme "isso se repete": "Valor pago" (não repete) / "Valor da parcela" (parcelas) / "Valor mensal" (mensal).
- Resumo ao lado do campo Valor quando `repeticao === 'parcelas'`: `Nx de R$ X · total R$ (X×N) · K pagas · próxima vence DD/MM` — total sempre derivado (parcela × N), nunca perguntado.
- Link opcional "sei o preço à vista" (só visível quando `repeticao === 'parcelas'`): abre campo de preço à vista; quando preenchido, calcula e exibe juros embutido (diferença entre preço à vista e total parcelado, em R$ e %); não é enviado ao backend, é puramente informativo no front.
- Remover o bloco "Valor final" / link "+ Teve juros ou desconto" solto do bloco de Valores (linhas 693-756 do arquivo atual).
- Nova lógica de juros/desconto dentro do bloco QUANDO, condicionada à comparação data informada × vencimento derivado:
  - Data posterior ao vencimento conhecido → abrir automaticamente a pergunta "Pago X dias após o vencimento — teve multa ou juros?" com campo de valor efetivo pago e diferença calculada em vermelho (+ R$ X de multa/juros).
  - Data anterior ao vencimento (ex.: boleto com data manual antecipada) → mesmo campo, mas como desconto por antecipação em verde (− R$ X de desconto).
  - Esse valor efetivo pago é o único lugar do modal que define `valor_final` a partir de agora ("um dado tem um endereço só").
- Regra de dependência entre blocos: nenhum bloco abaixo altera automaticamente um bloco acima; blocos acima continuam podendo influenciar os de baixo (ex.: bloco O QUÊ → sugestão de forma de pagamento no bloco COMO, já implementado, mantido).
- Duplicata: passar a incluir `total_parcelas` na comparação quando `repeticao === 'parcelas'`, para reduzir falso positivo entre compras parceladas diferentes que coincidem em valor de parcela.
- Backend `createFutureInstallments`: parar de dividir `valor_final`/`valor_original` por `totalInstallments` — usar o valor recebido diretamente como valor de cada parcela (o valor que chega do form já é o valor da parcela).
- Frontend `expenseFromApi` (`financeService.ts`): remover a divisão `rawFinalDb / numeroParcelas` aplicada hoje à primeira parcela de um grupo parcelado — o banco passa a gravar o valor da parcela diretamente, sem necessidade de dividir na leitura.

### Fora do escopo

- Qualquer correção retroativa de despesas parceladas já existentes no banco (decisão confirmada com o usuário: não mexer no histórico).
- Migration ou alteração de schema.
- Autocomplete de descrição, sugestão de categoria por palavra-chave, menu de categoria flutuante, painel de cartões, cálculo de vencimento de fatura, lote de lançamentos, atalhos de teclado — todos já implementados nesta sessão, mantidos como estão (só mudam de posição/bloco quando aplicável).
- Alterações em `CategoryFloatingSelect.tsx`, `cardDueDate.ts`, `expenseSuggestionsService.ts`, `queryKeys.ts`, `types/finance.ts`.
- Job agendado ou qualquer mudança relacionada a recorrência mensal além do reposicionamento de bloco.

## Leitura de contexto

- `sistema financas/CLAUDE.md`
- `.plans/redesign-modal-nova-despesa.md` (plano anterior desta mesma feature)
- `.plans/tasks/redesign-modal-nova-despesa.md` (task original)
- `src/screens/finance/ExpenseDialog.tsx` (lido na íntegra nesta rodada de planejamento)
- `backend/src/routes/expenses.ts` (lido na íntegra nesta rodada de planejamento)
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/services/expenseSuggestionsService.ts`
- `src/utils/cardDueDate.ts`
- `src/ui/CategoryFloatingSelect.tsx`

Observação: este projeto não tem `frontend/AGENT.md`/`backend/AGENT.md` separados, apenas o `CLAUDE.md` único de `sistema financas` (regras de autorização) e o `AGENT.md` de contexto técnico já lido em rodadas anteriores desta sessão.

## Impacto por área

### Frontend

- **`ExpenseDialog.tsx`**: reordenação estrutural dos blocos JSX (sem trocar o componente por múltiplos arquivos — mesma decisão do plano anterior, mitigar risco de regressão mantendo tudo num único arquivo já testado).
- **Schema `zod`**: `valor_original` passa a representar, semanticamente, "valor pago" ou "valor da parcela" ou "valor mensal" dependendo de `repeticao` — sem mudança de tipo, só de uso. Novo campo opcional `precoAVista` (número, não enviado ao backend, só para o cálculo informativo do link "sei o preço à vista"). Campo `valor_final` deixa de ser setado pelo link antigo "+ Teve juros ou desconto" (removido) e passa a ser setado exclusivamente pela nova lógica condicional no bloco QUANDO.
- **Estados novos**: `jurosDescontoAberto` (substitui `showValorFinal`, mas agora vive conceitualmente no bloco de data, aberto automaticamente quando a comparação de datas indicar diferença, e manualmente fechável/editável pelo usuário), `mostrarPrecoAVista` (controla exibição do campo de preço à vista).
- **Cálculo do total parcelado**: `valorPorParcela` deixa de ser calculado por divisão (`efetivoFinal / totalParcelas`) e passa a ser o próprio valor digitado; `totalDerivado = valorDigitado * totalParcelas` para exibição no resumo.
- **Cálculo de juros embutido (preço à vista)**: `jurosEmbutido = totalDerivado - precoAVista` (quando preenchido), exibido em R$ e como percentual (`jurosEmbutido / precoAVista * 100`).
- **Duplicata**: adicionar `total_parcelas` à comparação existente (linha ~459-476 do arquivo atual) quando `repeticao === 'parcelas'`.
- **`financeService.ts` — `expenseFromApi`**: remover a divisão `rawFinalDb / numeroParcelas` (linha 73-75); `valorFinal` passa a ser sempre `rawFinalDb` diretamente. Checar durante a implementação se há algum outro ponto do frontend (relatórios, exports) replicando essa mesma divisão antes de considerar a mudança completa.
- Estados de loading/error/empty: sem mudança em relação ao que já existe (autocomplete, sugestões, cartões já tratam esses casos).

### Backend

- **`createFutureInstallments`** (`expenses.ts:47-115`): remover a divisão `parseFloat(...) / totalInstallments` (linha 72) — usar `baseExpense['valor_final']`/`valor_original` diretamente como valor de cada parcela subsequente. A parcela-pai (linha 110-114, `UPDATE` que ajusta a primeira linha) não precisa de ajuste adicional de valor, pois já é gravada com o valor recebido no `INSERT` original de `POST /`.
- **`POST /api/expenses`**: nenhuma mudança de contrato de campos — o significado de `valor_original`/`valor_final` no payload muda inteiramente do lado do frontend antes do envio; o backend continua gravando o que recebe.
- **`createRecurringOccurrences`**: já usa `baseExpense['valor_original']`/`valor_final` diretamente sem dividir (linha 157-158) — nenhuma mudança necessária aqui.
- Nenhuma rota muda de contrato externo — `DespesasScreen.tsx`, dashboard e relatórios continuam consumindo o mesmo formato de resposta.

### Banco de dados

`Sem alteração de schema.` As colunas `valor_original`/`valor_final` já existem e continuam sendo usadas; muda apenas o que essas colunas representam para despesas parceladas criadas a partir desta mudança (valor da parcela, não mais o total). Despesas parceladas já existentes no banco continuam sendo lidas com a regra atual — não há distinção de "antes/depois" no schema, mas isso é consistente porque a leitura por linha (parcela individual) sempre correspondeu ao valor daquela linha; o único ponto que mudava de comportamento (divisão da primeira parcela) deixa de dividir, e como despesas novas passam a já gravar sem necessidade de divisão, o resultado composto (gravação nova + leitura nova) permanece correto.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Nenhuma é esperada para este plano.

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/backend/src/routes/expenses.ts`
- `sistema financas/src/services/financeService.ts`

## Estratégia de implementação

1. **Backend — `createFutureInstallments`**: remover a divisão por `totalInstallments`, usar o valor recebido diretamente por parcela. Confirmar que o caso de edição (`PUT /:id`) não depende dessa função (não depende — `PUT` não chama `createFutureInstallments`).
2. **Frontend — `financeService.ts`**: remover a divisão em `expenseFromApi`; checar (grep) se `valorFinal`/divisão por `numeroParcelas` aparece em outro lugar do frontend (relatórios, exports) antes de finalizar essa etapa.
3. **Frontend — `ExpenseDialog.tsx`**:
   a. Reordenar os blocos JSX para O QUÊ → COMO → QUANTO → QUANDO.
   b. Mover o chip group "Isso se repete?" para dentro do bloco COMO (junto com forma de pagamento e cartão).
   c. Ajustar rótulo do campo Valor dinamicamente conforme `repeticao`.
   d. Adicionar resumo de parcelamento ao lado do campo Valor (total derivado, não perguntado).
   e. Adicionar link "sei o preço à vista" com campo e cálculo de juros embutido, visível só quando `repeticao === 'parcelas'`.
   f. Remover o bloco "Valor final"/"+ Teve juros ou desconto" solto.
   g. Implementar a lógica condicional de juros/desconto dentro do bloco QUANDO, baseada na comparação entre `dataCompra`/`dataVencimentoManual` e o vencimento derivado.
   h. Atualizar `toFormValues` para refletir a nova origem de `valor_final` (vem do bloco de data, não mais do bloco de valores).
   i. Atualizar a checagem de duplicata para incluir `total_parcelas`.
4. **Validação manual no navegador**: testar os 3 modos de repetição (não repete, parcelas, mensal), crédito e não-crédito, link "sei o preço à vista", cenário de data posterior/anterior ao vencimento, edição de despesa existente (parcelada e não parcelada), lote.
5. **Comandos de validação finais**: lint, typecheck e build de frontend e backend.

## Regras de negócio identificadas

- Ordem fixa dos blocos: O QUÊ(1) → COMO(2) → QUANTO(3) → QUANDO(4); influência só de cima para baixo, nunca de baixo para cima.
- Campo Valor: significado depende de `repeticao` — "pago" (não repete), "parcela" (parcelas), "mensal" (todo mês). Total parcelado é sempre derivado (parcela × N), nunca perguntado.
- "Sei o preço à vista" é informativo apenas — não é enviado ao backend, não afeta `valor_final` salvo.
- Juros/desconto tem um único ponto de origem no modal: a comparação entre data informada e vencimento derivado, dentro do bloco QUANDO. Não pode existir mais de um campo de "valor efetivo" em blocos diferentes.
- Duplicata: mesma descrição + mesmo valor + mesma forma de pagamento nos últimos 7 dias, **e também mesmo número de parcelas quando `repeticao === 'parcelas'`**.
- Despesas parceladas antigas (criadas antes desta mudança) não são corrigidas retroativamente — decisão explícita do usuário.

## Regras multi-tenant e segurança

Projeto single-tenant (usuário autenticado via middleware `authenticate`, sem isolamento multi-prefeitura). Nenhuma query nova é criada neste plano (mudança é só na lógica de cálculo de valores, não em novas leituras/escritas de dados de terceiros). As queries existentes já filtram por `req.user!.id` e continuam assim. Nenhuma migration ou alteração de `.env` será feita.

## Validações necessárias

- Schema `zod`: novo campo opcional `precoAVista` (número, min 0), sem impacto nos campos obrigatórios existentes (`descricao`, `valor_original` continuam obrigatórios).
- Garantir que o campo de valor efetivo pago (juros/desconto) só é enviado como `valor_final` quando divergir do valor base — mesma regra de "opcional" já usada hoje, só realocada de bloco.
- Duplicata: comparação adicional de `total_parcelas` deve ser `undefined`-safe (não comparar quando `repeticao !== 'parcelas'`).

## Testes necessários

### Frontend

- Rótulo do campo Valor muda corretamente para os 3 modos de repetição.
- Resumo de parcelamento (`Nx de R$X · total R$Y · K pagas · próxima vence DD/MM`) calcula o total corretamente (parcela × N).
- Cálculo de juros embutido em "sei o preço à vista" (percentual e valor absoluto).
- Lógica condicional de juros/desconto: abre automaticamente quando data é posterior ao vencimento; funciona também quando é anterior (desconto).
- Duplicata considera `total_parcelas` quando aplicável e ignora quando `repeticao !== 'parcelas'`.

### Backend

- `createFutureInstallments`: parcelas geradas com o valor recebido diretamente (sem divisão), para diferentes combinações de N e K já pagas — ajustar testes existentes que hoje assumem divisão por N.

### E2E

`Não aplicável nesta entrega` — cobertura via validação manual dos fluxos críticos descritos na estratégia de implementação.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
```

(Confirmar nomes reais de scripts disponíveis em cada `package.json` antes de rodar.)

## Riscos e pontos de atenção

- Mudar o significado de `valor_original`/`valor_final` para despesas parceladas é uma mudança de contrato silenciosa (mesmas colunas, semântica nova) — só é segura porque gravação e leitura mudam juntas, no mesmo commit. Não fazer deploy parcial (backend sem frontend, ou vice-versa) para evitar período em que os dois lados discordam sobre o que a coluna significa.
- Despesas parceladas antigas continuam com o comportamento atual (não são tocadas) — usuário já confirmou que isso é aceitável.
- Remover a divisão em `expenseFromApi` pode afetar outros pontos do frontend que leem `Expense.valorFinal` para despesas parceladas (ex.: relatórios) — checar com grep antes de finalizar essa etapa.
- Reordenar blocos de um formulário já funcional tem risco de regressão em integrações internas (ex.: sugestão de forma de pagamento que hoje depende de `categoriaId`, que precisa continuar sendo lido do bloco O QUÊ mesmo estando visualmente antes do bloco COMO).
- Ambiente pode estar apontando para produção — nenhum comando destrutivo de banco será executado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as duas decisões que precisavam de confirmação (regra de dependência entre blocos e critério de duplicata) já foram esclarecidas com o usuário nesta sessão, e a decisão sobre despesas parceladas antigas foi confirmada durante este planejamento.

## Critérios de aceite do plano

- O modal exibe os blocos na ordem O QUÊ → COMO → QUANTO → QUANDO.
- O campo Valor muda de rótulo corretamente conforme o tipo de repetição, e o total parcelado é sempre calculado (nunca perguntado).
- O link "sei o preço à vista" aparece só quando parcelado, é opcional, e não altera o que é salvo.
- Não existe mais nenhum campo de "valor final"/juros/desconto fora do bloco QUANDO.
- A lógica de juros/desconto no bloco QUANDO reage corretamente a data posterior (multa/juros, vermelho) e anterior (desconto, verde) ao vencimento derivado.
- Duplicata considera número de parcelas quando aplicável.
- Despesas parceladas novas são gravadas e lidas com o valor da parcela direto, sem dupla divisão.
- Nenhuma despesa antiga é alterada retroativamente.
- Comandos de lint, typecheck e build (frontend e backend) passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com o plano anterior (`.plans/redesign-modal-nova-despesa.md`) para entender o que já existe e não deve ser recriado.
- Não executar migrations — nenhuma é esperada.
- Continuar na branch `feat/R/redesign-modal-despesa` (evolução incremental da mesma feature).
- Implementar backend primeiro (`createFutureInstallments`), depois `financeService.ts`, depois `ExpenseDialog.tsx`, para poder validar cada camada isoladamente.
- Ao reordenar blocos, preservar todos os `useEffect`/watchers existentes (autocomplete, sugestão de categoria, forma de pagamento/cartão sugeridos) — são independentes da posição visual do bloco, só a ordem JSX muda.
- Testar manualmente todos os fluxos listados em "Estratégia de implementação" passo 4 antes de considerar pronto.
- Este projeto não usa PR — ao final, seguir para `/finalizar`, que faz commit + push + merge direto em `main` após confirmação.
