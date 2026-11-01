# Plano: Correções depois da entrega (receitas fixas e parcelamento)

## Origem

- Revisão do código entregue (etapas 1 a 3, `5d73332f..ca26c3d4`) e auditoria `/limpar`, em 01/11/2026. As decisões do usuário sobre cada item estão abaixo.
- Classificação: **backend** com um ajuste de comentário no frontend. **Sem migration**, sem `.env`, sem mudança de configuração.
- Depende do que já está em `main` (`e2837766`) e das migrations 0091 e 0092 aplicadas em produção.

## Decisões já tomadas pelo usuário

| Item | Decisão |
|---|---|
| 1. Lembrete de receita adiada | corrigir |
| 2. 409 indevido com `recorrente` nulo | corrigir |
| 3. Excluir ano mantém as fixas "canceladas" | **apagar de vez** |
| 4. Fixa com "Recebida" desmarcada baixa estoque e gera comissão na criação | **só ao receber** |
| 5. `repeatUntil` (compatibilidade com abas antigas) | remover |
| 6. Comentário "Repetir até" no assistente | corrigir |
| 7. Fallbacks de mês final e colunas quase órfãs | deixar |
| 8. Nomes em português em módulos legados | deixar |

## Decisões a confirmar (com o padrão que o plano adota)

- **D1 (item 5):** um corpo com `repeatUntil` não nulo (aba aberta antes da publicação) é **recusado com mensagem clara** ("recarregue a página"), em vez de ser ignorado. Ignorar faria a aba antiga gravar uma receita única sem as réplicas, sem avisar. Custa 3 linhas.
- **D2 (item 4):** só a ocorrência **original** com "Recebida" desmarcada espera o recebimento. As réplicas mensais com regra de comissão "mensal" continuam gerando a comissão na criação (comportamento anterior, não mexido).
- **D3 (item 3):** vale para as **receitas** fixas, como perguntado. As **despesas** fixas do ano continuam sendo canceladas: aquele caminho tem uma regra própria de concorrência (conversão em fixa durante a exclusão) e precisa de análise à parte.

## Escopo

### Dentro do escopo

**Parte A (baixo risco): itens 1, 2, 5 e 6.**

1. **Lembrete de receita adiada** (`backend/src/services/fixedIncomes.ts`, `sendFixedIncomeReminders`).
   - Extrair `listDueFixedIncomeReminders(today)` com a consulta, acrescentando `eq(incomes.deferred, false)`; o envio do push passa a usá-la.
   - Teste de banco (escrito, não executado): previsão de hoje adiada não entra, a não adiada entra.
2. **409 com `recorrente` nulo** (`backend/src/services/expenseService.ts:324`).
   - Extrair a comparação de `singleStillSame` para uma função pura em `installmentCount.ts` (`singleExpenseUnchanged(fresh, saved)`): `installment !== true`, mesmo grupo, `recurring`, `paid` e `installment` normalizados com `=== true` dos dois lados, mesmo `status` e mesma trava de fatura.
   - Testes unitários (rodam sem banco): nulo em `recurring`, `paid` e `installment` não recusa; mudar status, pagamento, grupo ou fatura recusa.
5. **Remover `repeatUntil`** (`incomeInput.ts`, `incomeService.ts`).
   - Sai o tipo `IncomeRepeatUntil`, `readRepeatUntil`, o campo `repeatUntil` e a derivação de `billingType`, `endMonth` e `received` a partir dele. `MAX_REPLICAS` fica (é o teto da Fixa); o comentário passa a falar de Fixa.
   - `received` sem valor informado: `true` na receita única, `false` na fixa (como hoje sem `repeatUntil`).
   - D1: `repeatUntil` não nulo no corpo → `RequestInputError('A tela está desatualizada: recarregue a página para lançar receitas fixas')`.
   - Testes: remover os de compatibilidade em `incomeInput.test.ts`; novo teste da recusa; ajustar a fixture de `fixedIncomes.db.test.ts`.
6. **Comentário do assistente** (`src/components/financial-assistant/FinancialAssistant.tsx:1141`): `// Limite no próprio mês da receita não gera série: fica única.`

**Parte B (muda comportamento): itens 3 e 4.**

3. **Excluir ano apaga as receitas fixas de vez** (`backend/src/services/yearService.ts`).
   - Na mesma transação, com as **fontes antes das ocorrências** (mesma ordem de `clearUserFinancialData`): devolver o estoque (já existe) → identificar as fontes das fixas do ano e travá-las (`FOR UPDATE`, por id) → apagar **todas** as receitas do ano (comuns e fixas, em qualquer situação) → apagar as fontes que ficaram **sem nenhuma receita** → despesas e registro do ano como hoje.
   - A FK `incomes.classificacao_fixa_id` é `ON DELETE SET NULL`: a fonte só é apagada depois de conferir que não sobrou ocorrência, para nunca soltar uma ocorrência da série. Fonte com ocorrências em outros anos fica, com o limite como está (ampliar o limite só cria meses depois do limite antigo, então não ressuscita o ano apagado).
   - Não muda: excluir **uma** ocorrência à mão continua cancelando; despesas fixas (D3).
   - Testes de banco (escritos, não executados): atualizar o teste "excluir um ano" (hoje espera `cancelada`; passa a esperar só as ocorrências de 2027) e acrescentar o caso da série inteira dentro do ano (a fonte some).
   - Conferir o texto do diálogo de "excluir ano" na tela e atualizá-lo se falar em "canceladas" (a busca no frontend não achou o texto; localizar na implementação).
4. **Fixa não recebida: estoque e comissão só ao receber** (`incomeService.ts`, `stock.ts`, `routes/incomes.ts`).
   - **Criação** (`billingType: 'fixed'` e `received: false`): não vende o produto e não cria a despesa de comissão da original. A linha continua guardando `productId`, `soldQuantity` e `commissionAmount`. Réplicas como hoje (D2).
   - **Recebimento** (`receiveIncome`), só para ocorrência fixa: (a) com `productId` e sem saída de estoque registrada, vende agora (o dono do catálogo é o dono da conta); (b) com `commissionAmount`, representante e nenhuma despesa de comissão ligada, cria a comissão pelo valor **recebido**, com a regra atual do representante (sem regra, zera `commissionAmount`). Idempotente: confere a saída e a despesa antes de criar.
   - Novo helper em `stock.ts` (`hasStockSale`) e o mesmo tratamento de `StockError` do POST no `/receber` (estoque insuficiente vira mensagem clara e a receita continua prevista).
   - Cancelar ou excluir a prevista que nunca recebeu: nada a devolver (`returnSoldStock` já ignora sem saída; `cancelLinkedCommission` sem despesa).
   - Testes de banco (escritos, não executados): criação sem efeitos; receber vende e gera a comissão uma vez só; receber de novo não duplica; cancelar não mexe no estoque.

### Fora do escopo

- Itens 7 e 8 (decididos: ficam como estão).
- Despesas fixas do ano (D3), réplicas mensais (D2), qualquer migration, tornar colunas NOT NULL.
- Executar os testes de banco (decisão B do usuário).

## Estratégia

1. **Ordem:** Parte A, depois Parte B. Sugestão: fechar a Parte A (`/finalizar`) antes de começar a B, para o risco da B ir sozinho para produção. Se preferir tudo junto, basta dizer.
2. **Tudo testável sem banco vai para teste unitário** (item 2 e o item 5); o que depende de SQL fica em teste de banco escrito.
3. Seguir o padrão de commits do projeto (inglês, `fix(finance)` / `refactor`), branch `fix/R/correcoes-pos-entrega` (uma por parte, se a B for separada).

## Arquivos afetados

- Backend: `services/fixedIncomes.ts`, `services/expenseService.ts`, `services/installmentCount.ts`, `services/incomeInput.ts`, `services/incomeService.ts`, `services/yearService.ts`, `services/stock.ts`, `routes/incomes.ts`.
- Frontend: `components/financial-assistant/FinancialAssistant.tsx` (comentário) e, se existir, o texto do diálogo de excluir ano.
- Testes: `installmentCount.test.ts`, `incomeInput.test.ts`, `fixedIncomes.db.test.ts`, `expenseInstallmentCount.db.test.ts` (se couber um caso de nulo).

## Validações

- `npx tsc --noEmit -p tsconfig.json`, `npm --prefix backend run build`, `npm run build` (um por vez) sem erro.
- `npm test` e `npm --prefix backend test` (testes de banco desligados): 0 falhas.
- `git diff --check` limpo; nenhum `.env`, migration ou banco tocado.
- **Teste manual depois do deploy** (a prova que falta para B): (3) lançar uma Fixa de nov/2026 a fev/2027 e excluir 2026: sobram só as de 2027; uma Fixa só dentro de 2026: some por inteiro, sem "cancelada"; (4) lançar uma Fixa com produto e "Recebida" desmarcada: estoque e comissão não mudam; receber pelo lote: o estoque baixa e a comissão aparece uma vez; cancelar uma prevista: nada muda; (5) a tela nova segue lançando fixa normalmente.

## Riscos

- Itens 3 e 4 mexem em dados, estoque e comissão sem teste de banco executado.
- Item 3 apaga receitas já recebidas do ano (é o sentido de "excluir o ano") e fontes sem ocorrência; não há volta.
- Item 4: estoque insuficiente na hora de receber impede a confirmação até o ajuste; a comissão da original passa a aparecer só no recebimento.
- Item 5: aba aberta antes da publicação recebe um erro claro em vez de gravar errado.

## Critérios de aceite

- Previsão adiada não gera lembrete; a não adiada gera.
- Despesa antiga com `recorrente` nulo parcela normalmente; o 409 só aparece quando algo mudou de fato.
- Excluir o ano não deixa receita fixa "cancelada" nem fonte vazia daquele ano, e não solta ocorrências de outros anos.
- Fixa com "Recebida" desmarcada não baixa estoque nem gera comissão na criação; ao receber, baixa e gera uma vez só.
- `repeatUntil` não existe mais no código, e um pedido com ele recebe a mensagem de recarregar a página.
- Builds e testes passam; limitações registradas.

## Instruções para /implementar

- Pré-requisito: aprovação deste plano e das decisões D1, D2 e D3. Ler `AGENT.md` e `CLAUDE.md`; reconferir `git status`.
- Ordem: Parte A (itens 1, 2, 5, 6), validar; depois Parte B (3, 4). Sem migrations, banco ou `.env`; sem stage, commit, push ou deploy durante `/implementar`.

## Execução — Parte A (01/11/2026, branch `fix/R/correcoes-pos-entrega`)

Implementada e validada localmente; **nada commitado**. Itens 1, 2, 5 e 6. A Parte B (itens 3 e 4) segue pendente.

- **Item 1:** `listDueFixedIncomeReminders(today)` em `fixedIncomes.ts` traz as previstas fixas de hoje com `deferred = false`; `sendFixedIncomeReminders` usa a consulta. Teste de banco novo em `fixedIncomes.db.test.ts` (escrito, **não executado**): a prevista de hoje entra, sai quando adiada e volta ao desfazer o Adiar.
- **Item 2:** `singleExpenseUnchanged(fresh, saved)` (pura, em `installmentCount.ts`) trata nulo em `recorrente`, `pago` e `parcelado` como falso dos dois lados; `singleStillSame` em `expenseService.ts` a usa. 4 testes novos em `installmentCount.test.ts` (rodam sem banco).
- **Item 5:** saíram `IncomeRepeatUntil`, `readRepeatUntil`, o campo `repeatUntil` e a derivação de `billingType`, `endMonth` e `received` em `incomeInput.ts` e `incomeService.ts`. `MAX_REPLICAS` ficou (teto da Fixa). Conforme D1, `repeatUntil` não nulo no corpo é recusado com "A tela está desatualizada: recarregue a página para lançar receitas fixas". Testes de compatibilidade trocados por um da recusa; fixture do teste de banco ajustada.
- **Item 6:** comentário do assistente (`FinancialAssistant.tsx`) agora diz "Limite no próprio mês da receita não gera série: ela fica única."
- **Acréscimo:** o cabeçalho de `fixedIncomes.db.test.ts` ainda dizia que o teste das duas séries "muda conforme a 0092"; desde a limpeza ele exige a 0092, e o texto foi corrigido.
- **Validação:** `tsc` do front e do backend sem erro; `npm run build` sem erro; `npm test` 499 passam, 0 falham; `npm --prefix backend test` 1021 passam, 0 falham, 1 ignorado; `tsc --noUnusedLocals` sem sobra nos arquivos editados; `git diff --check` limpo.
- **Observação:** numa rodada, `resourceBudget.test.ts` (coletor de Licitações) falhou com `ENOTEMPTY` ao limpar uma pasta temporária do Windows. Ele não foi tocado, passou 3 de 3 isolado e a suíte completa passou na repetição: é intermitente do ambiente.
- **Não executado:** testes de banco (decisão B do usuário).
