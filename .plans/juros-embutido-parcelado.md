# Plano de Implementação: Juros embutido nas despesas parceladas (task 3)

## Origem

- Arquivo de especificação: nenhum. Origem: bate-papo de 2026-10-18 (task 3 prevista em `.plans/catalogo-padrao-categorias-pf.md`) e decisões do `/planejar` de 2026-10-19, registradas abaixo.
- Data do planejamento: `2026-10-19`
- Classificação: `frontend + backend + database`

## Decisões aplicadas

- **Decisão 1 (onde fica o cadastro de empréstimo):** não existe cadastro especial de empréstimo. Financiamento e empréstimo são despesa parcelada comum ("financiamento já cai em despesa"). A receita de um empréstimo pessoal é uma receita comum, com bruto e líquido (task 2). Ficam fora: botão "Novo empréstimo", diálogo próprio, rota de composição, vínculo `receita_origem_id` com as parcelas e cancelamento em cascata.
- **Decisão 2 (versão do cadastro):** simplificar o cadastro do Parcelado e gravar o juros embutido. Valor com chave visível Parcela | Total, valor à vista (opcional) sempre visível, sem as caixas "Sei o valor total" e "Sei o preço à vista" dentro do popover.

## Resumo

Hoje o Parcelado de "Nova despesa" já calcula o "juros embutido" a partir de "Sei o preço à vista" (`draftRules.ts`, `summarizeDraft`), mas só mostra um selo: nada é gravado e o backend não conhece o preço à vista. Por isso o painel "Quanto paguei de juros e taxas?" não conta o juros de financiamentos, empréstimos ou compras parceladas com juros.

Esta entrega:

1. Simplifica o cadastro do Parcelado (os valores ficam visíveis e consistentes).
2. Envia o valor à vista ao servidor, que calcula o juros embutido (soma das parcelas menos o à vista) e o divide por igual entre as parcelas, gravando em cada linha.
3. Faz o painel contar esse juros: na parcela paga, em "Juros e taxas pagos"; na parcela aberta, em "Juros a vencer".
4. Generaliza a coluna `despesas.valor_juros_fatura` para `despesas.valor_juros`, porque ela deixa de ser só da fatura (princípio "sem sobreposição": renomear o que existe, em vez de criar coluna paralela).

Exemplo: 12 parcelas de R$ 1.000,00 com valor à vista de R$ 10.000,00. Juros embutido R$ 2.000,00, gravado como 11 parcelas com R$ 166,66 e a última com R$ 166,74.

## Escopo

### Dentro do escopo

- Cadastro do Parcelado em "Nova despesa" (linha de entrada e lote): chave Parcela | Total visível, valor à vista (opcional) visível, popover Cobrança só com o número de parcelas, selo do juros atualizado.
- Servidor: `cashPrice` (valor à vista) na criação de parcelado, cálculo e divisão do juros, gravação em `valor_juros` de cada parcela.
- Painel: `jurosDaDespesa` com regra única, "Juros a vencer" incluindo o juros das parcelas abertas.
- Renomear `valor_juros_fatura` para `valor_juros` (banco, Drizzle `invoiceInterest` para `interest`, API, frontend, demo, testes), em duas migrations.
- Módulo comum para a divisão de parcelas e de juros (hoje `splitInstallments` está em `contractSchedule.ts` e `splitInterestWithinInstallments` é privada em `cardInvoiceRules.ts`).
- Testes e conferências.

### Fora do escopo

- Cadastro especial de empréstimo (botão, diálogo, rota, receita ligada às parcelas, cancelamento em cascata).
- Quebra do painel por origem (atraso, fatura, taxas de receita).
- Juros retroativo nas despesas antigas, inclusive os 42 empréstimos antigos da conta 17.
- Recalcular o juros guardado quando o valor de uma parcela é editado depois.
- Prévia de "% ao mês" no cadastro.
- Despesa única e recorrente: não têm à vista nem juros embutido.

## Leitura de contexto

- `CLAUDE.md` da raiz (sequência obrigatória, migrations e `.env` só com confirmação).
- `AGENT.md` da raiz (único arquivo de contexto; **não existem** `frontend/AGENT.md` nem `backend/AGENT.md`). O texto de multi-prefeitura/RLS dele é herdado de outro projeto: o Finanças isola por `usuario_id` e conta (`expenseBaseConditions`, `canWriteToAccount`), e nenhuma migration do repositório usa RLS. A regra de identificadores em inglês (UI em português) vale.
- Memória do projeto: `catalogo_categorias_pf.md` (decisões e achados da task 3), `receita_bruto_liquido.md` (padrão expandir/contrair com gatilho de ponte), `feedback_sem_sobreposicao.md`.
- Código lido: `expenseService.ts`, `expenseInput.ts`, `routes/expenses.ts`, `painelCalculos.ts`, `painelService.ts`, `cardInvoiceRules.ts`, `cardInvoiceService.ts`, `contractSchedule.ts`, `db/schema/expenses.ts`, `0081_pagamentos_fatura.sql`; no frontend `ExpenseRow.tsx`, `BillingPopover.tsx`, `InstallmentsPopover.tsx`, `ExpenseDialog.tsx`, `expenseGrid.ts`, `draftRules.ts`, `draftState.ts`, `cardInvoice.ts`, `JurosDescontos.tsx`, `fakeApiResolver.ts`.

## Impacto por área

### Frontend

- `BillingPopover.tsx`: remover as caixas "Sei o valor total" e "Sei o preço à vista" e o campo à vista de dentro do popover. Fica o seletor de cobrança e o número de parcelas (com a confirmação ao reduzir parcelas).
- `ExpenseRow.tsx`: no Parcelado, a célula Valor ganha a chave visível **Parcela | Total** (controla `amountIsTotal`, que continua existindo no rascunho) e o campo **À vista (opcional)** (`cashPriceCents`) fica sempre visível. O rótulo `amountLabel` deixa de depender de uma caixa escondida.
- **Layout (ponto de atenção):** as grades `ENTRY_GRID_CLASS` e `BATCH_GRID_CLASS` têm cabeçalho fixo (em `ExpenseDialog.tsx`) compartilhado com as linhas do lote, e cada linha é uma grade própria; uma trilha extra só no Parcelado desalinharia o lote. Na implementação, preferir **não criar trilha nova** (por exemplo, a célula Valor com duas linhas: valor com a chave e o à vista), ou, se criar, ajustar juntos o cabeçalho e as linhas do lote. Mostrar o resultado ao usuário (tela) antes do `/finalizar`.
- `draftState.ts`: remover `knowsCashPrice` (o à vista preenchido é o próprio sinal); manter `cashPriceCents` e `amountIsTotal`. `cardDraft.ts` (assistente) acompanha.
- `draftRules.ts`: o selo passa a usar `cashPriceCents` sem `knowsCashPrice` ("+ R$ X de juros (Y%) · conta em juros e taxas"); `buildCreateInput` envia `cashPrice` no parcelado quando preenchido; validação: à vista, se preenchido, maior que zero.
- `types/finance.ts`: `ExpenseCreateInput` (parcelado) ganha `cashPrice?: number | null`; `Expense.invoiceInterest` vira `interest`.
- `financeService.ts`: chave do JSON `valor_juros_fatura` vira `valor_juros`.
- Demo: `fakeApiResolver.ts` (linhas do parcelado com juros a partir de `cashPrice`; pagamento de fatura com `valor_juros`) e `demoFakeDatabase.ts`.
- `JurosDescontos.tsx`: só o comentário do "Juros a vencer" (hoje fala só da fatura); títulos e rótulos não mudam.
- Estados de loading/erro/vazio: nenhum novo (o diálogo já trata).

### Backend

- `expenseInput.ts`: no parcelado, ler `cashPrice` opcional (número finito, maior que zero, até `MAX_AMOUNT`; ausente vira `null`). Mensagem: "Valor à vista inválido".
- Módulo comum novo (nome em inglês, por exemplo `installmentSplit.ts`): `splitInstallments` e `splitInterestWithinInstallments` (exportada) e a função pura que calcula o juros por parcela a partir das parcelas e do à vista (juros = máximo entre 0 e soma das parcelas menos o à vista; dividido por igual, resto na última, sem passar do valor de cada parcela). `contractSchedule.ts` e `cardInvoiceRules.ts` passam a importar dele (sem reexportar).
- `expenseService.ts`: `buildRows`, no ramo `installments`, grava `interest` em cada linha (nulo quando for zero). Regra do servidor é a que vale; o selo da tela é prévia.
- `db/schema/expenses.ts`: `invoiceInterest` (`valor_juros_fatura`) vira `interest` (`valor_juros`); comentário do schema atualizado.
- `cardInvoiceRules.ts`, `cardInvoiceService.ts`: `invoiceInterest` vira `interest` (itens da fatura, linhas geradas, juros carregado); comportamento igual.
- `painelCalculos.ts`: `DespesaPainel.invoiceInterest` vira `interest`; `jurosDaDespesa` com regra única (ver Regras de negócio); `sumUpcomingInterest` e `descontoDaDespesa` seguem a coluna renomeada.
- `painelService.ts`: seleção e filtro `buscarJurosAVencer` usam `interest`.
- Rotas: nenhuma nova. `POST /expenses` já valida conta, categoria e cartão; `routes/expenses.ts` devolve `d.*`, então o JSON passa a trazer `valor_juros` (e `valor_juros_fatura` só entre as migrations, pela ponte).

### Banco de dados

Padrão expandir/contrair da task 2, com numeração por letras para ficar antes da 0085 das Licitações:

- `0084e_despesas_valor_juros_ponte.sql` (aditiva): `ADD COLUMN valor_juros DECIMAL(10,2)`, copia `valor_juros_fatura` para ela e cria o gatilho de ponte `BEFORE INSERT OR UPDATE` que mantém as duas colunas iguais (INSERT: preenche a que veio nula com a outra; UPDATE: copia a coluna que mudou comparando OLD e NEW). O código atual ignora a coluna nova e continua funcionando.
- `0084f_despesas_remove_valor_juros_fatura.sql` (depois do deploy do código novo): confere que as duas colunas são iguais em todas as linhas, remove o gatilho e a função e apaga `valor_juros_fatura`.
- Ensaio antes de aplicar: Postgres em memória (PGlite) com cópia das linhas de produção, como em `f5-ensaio.mts` da task 2 (cenários: cópia inicial, INSERT só pela coluna antiga, INSERT só pela nova, UPDATE de cada lado, soma de juros igual antes e depois, 0084f).
- Sem RLS no projeto; sem índice novo (a consulta de "Juros a vencer" já filtra pelas linhas não pagas do escopo).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem variável de ambiente nova.
- Ordem: `0084e` (local e produção, com o ok dele, fora do auto mode) → merge na `main` e deploy automático no Render → conferir que o backend e o site subiram → `0084f` (local e produção, com o ok dele).
- O worktree não tem `.env`: usar o wrapper `f2-aplicar-migracao.mts` em `f2-conta17-scripts` (lê os `.env` da pasta principal sem copiar), como na task 2. Manter essa pasta até a `0084f` ser aplicada.

## Arquivos provavelmente afetados

- Backend: `backend/src/services/expenseService.ts`, `expenseInput.ts`, `painelCalculos.ts`, `painelService.ts`, `cardInvoiceRules.ts`, `cardInvoiceService.ts`, `contractSchedule.ts`, `backend/src/db/schema/expenses.ts`, novo módulo comum (`installmentSplit.ts`).
- Banco: `backend/drizzle/0084e_…sql`, `0084f_…sql`.
- Frontend: `src/screens/finance/expense-dialog/BillingPopover.tsx`, `ExpenseRow.tsx`, `ExpenseDialog.tsx` (cabeçalho, se a grade mudar), `expenseGrid.ts`, `draftRules.ts`, `draftState.ts`; `src/components/financial-assistant/cardDraft.ts`; `src/types/finance.ts`; `src/services/financeService.ts`; `src/services/demo/fakeApiResolver.ts` e `demoFakeDatabase.ts`; `src/screens/finance/painel/JurosDescontos.tsx` (comentário).
- Testes: `expenseInput.test.ts`, `painelCalculos.test.ts`, `cardInvoiceRules.test.ts`, `contractSchedule.test.ts` (as funções movidas ganham teste no módulo novo), `src/screens/finance/expense-dialog/draftRules.test.ts`, `src/components/financial-assistant/cardDraft.test.ts`, `src/utils/cardInvoice.test.ts`.

## Estratégia de implementação

1. Criar a branch `feat/R/juros-embutido-parcelado` no worktree `C:\Users\rodri\Music\financas-catalogo-categorias` (hoje solto em `origin/main`; nunca deixá-lo na `main`). Conferir antes se `origin/main` mudou `cardInvoiceService.ts`, `painelCalculos.ts` ou o diálogo de despesa, e se a branch de Licitações mexeu em `despesas`.
2. Banco: escrever `0084e` e `0084f`, ensaiar no Postgres em memória e parar para pedir o ok da `0084e` (local, depois produção). **Não aplicar sem confirmação.**
3. Backend, regras puras: criar o módulo comum (mover `splitInstallments` e `splitInterestWithinInstallments`, com os testes existentes), a função do juros por parcela e a regra única de `jurosDaDespesa`; testes.
4. Backend, renomeação `invoiceInterest` para `interest` (schema, fatura, painel) sem mudar comportamento; os testes atuais da fatura e do painel devem continuar passando.
5. Backend, cadastro: `cashPrice` em `expenseInput.ts`; `buildRows` grava `interest` por parcela; testes.
6. Frontend: tipos e serviço (`valor_juros`, `cashPrice`); `draftState`/`draftRules` (sem `knowsCashPrice`, selo, envio, validação); `BillingPopover` enxuto; `ExpenseRow` com a chave Parcela | Total e o à vista visível; grades/cabeçalho conforme o layout escolhido; assistente (`cardDraft.ts`); demo; comentário do painel.
7. Rodar `tsc`, testes e `vite build` do frontend e do backend, um de cada vez (pouca memória virtual).
8. Mostrar ao usuário como ficou o cadastro (layout) antes de seguir para o `/finalizar`.
9. `/finalizar` (dele): commit, push, pergunta do merge; depois do deploy, `0084f` com o ok dele; conferência dele na tela (financiamento de 12 parcelas com à vista menor que o total).

## Regras de negócio identificadas

1. **Juros embutido** = máximo entre 0 e (soma das parcelas, com os ajustes, menos o valor à vista). Só no parcelado, e o à vista é opcional. À vista maior ou igual à soma não é erro: juros zero.
2. **Divisão:** por igual entre as parcelas, centavos que sobram na última, nenhuma parcela com juros maior que o próprio valor. Parcela com juros zero grava `null`.
3. **O servidor calcula e grava**; a tela só mostra a prévia (mesmo padrão de `utils/cardInvoice.ts`). O valor à vista em si não é guardado: ele é soma dos valores menos soma dos juros.
4. **Juros pago no painel**, para a parcela paga: `juros guardado × mínimo(pago, previsto) ÷ previsto`; fora da fatura, soma também o que passou do previsto (multa e juros de atraso, regra de hoje). Para linhas da fatura o resultado é igual ao de hoje (lá o pago nunca passa do previsto).
5. **Juros a vencer** = soma do juros guardado nas linhas ainda não pagas (de qualquer data), agora incluindo as parcelas de financiamentos.
6. **Desconto** (`descontoDaDespesa`): sem mudança.
7. **Cartão de crédito:** parcelado no cartão com à vista segue o mecanismo atual de juros carregado na renegociação da fatura (`carriedInterestCents`); coberto por teste.
8. Editar o valor de uma parcela depois não recalcula o juros guardado (fica o do cadastro).
9. Os 42 empréstimos antigos e qualquer despesa já gravada ficam sem juros guardado (não há retroativo).
10. Receita de empréstimo pessoal: receita comum, com bruto e líquido (a taxa de liberação já vira "juros e taxas" pela task 2).

## Regras multi-tenant e segurança

- O Finanças não é multi-prefeitura: o isolamento é por usuário e conta. A rota `POST /expenses` mantém as checagens atuais (`canWriteToAccount`, categoria permitida, cartão do usuário); `cashPrice` é validado no servidor, sem confiar na tela.
- As consultas do painel continuam com `expenseBaseConditions` (escopo e conta); nenhuma query nova sem filtro.
- Sem SQL raw novo na aplicação; o SQL cru fica só nas migrations.
- Nenhum dado sensível novo; mensagens de erro curtas ("Valor à vista inválido").
- Alterações de tabela: sem RLS no projeto (conferido nas migrations).

## Validações necessárias

- Servidor: `cashPrice` ausente ou `null` vale "sem à vista"; presente deve ser número finito, maior que zero e até `MAX_AMOUNT`; só é lido quando a cobrança é parcelada.
- Juros por parcela entre 0 e o valor da parcela; soma dos juros igual ao juros embutido (conferido em teste).
- Tela: à vista, se preenchido, maior que zero; o aviso "a soma das parcelas difere do total" continua; o selo só aparece quando a soma passa do à vista.
- Migrations: conferência de igualdade das colunas antes de apagar a antiga.

## Testes necessários

### Frontend

- `draftRules.test.ts`: selo de juros sem `knowsCashPrice`; `buildCreateInput` envia `cashPrice` só no parcelado e só preenchido; à vista inválido; chave Parcela/Total (`amountIsTotal`) com os cenários existentes.
- `cardDraft.test.ts` e `cardInvoice.test.ts` ajustados à renomeação e à remoção de `knowsCashPrice`.

### Backend

- Módulo comum: divisão igual com resto na última; juros por parcela (juros zero, à vista maior que a soma, parcelas ajustadas, nenhuma parcela com juros acima do valor); testes de `contractSchedule` e `cardInvoiceRules` continuam passando.
- `expenseInput.test.ts`: `cashPrice` válido, ausente, zero, negativo, texto, acima do limite.
- `painelCalculos.test.ts`: `jurosDaDespesa` (linha da fatura igual a hoje; parcela comum paga em dia, paga a mais, paga a menos, parcial; sem juros guardado) e `sumUpcomingInterest` com parcelas de financiamento.
- `cardInvoiceRules.test.ts`: renomeação sem mudar resultados.
- Migrations: ensaio em Postgres em memória (cenários acima) antes de pedir o ok.

### E2E

- Manual dele (tela): lançar financiamento de 12 parcelas de R$ 1.000,00 com à vista de R$ 10.000,00; conferir o selo, marcar uma parcela como paga e ver R$ 166,66 em "Juros e taxas pagos" e R$ 1.833,34 em "Juros a vencer" no painel; conferir que o pagamento de fatura do cartão continua igual.

## Comandos de validação sugeridos

Um de cada vez, por causa da memória virtual do computador:

```bash
npx tsc --noEmit
npm test
npx vite build

npm --prefix backend run build
npm --prefix backend test
```

No worktree (sem `.env`), os testes do backend rodam com `DATABASE_URL=postgres://nao:usa@127.0.0.1:1/nenhum` e `DOTENV_CONFIG_PATH=C:/nao/existe/.env`. Se o `tsc` falhar por memória: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`. Status das migrations antes de aplicar: `npm --prefix backend run migrations:status -- --banco local` e `--banco producao` (somente leitura).

## Riscos e pontos de atenção

- **Layout da linha de despesa:** cabeçalho fixo compartilhado com o lote; a solução do à vista precisa manter o alinhamento e caber no celular (ver Frontend).
- **Duas migrations em produção**, cada uma só com o ok dele e fora do auto mode. Entre elas, a ponte mantém o código velho e o novo funcionando; a `0084f` só depois do deploy confirmado.
- **Abas abertas com o site antigo:** depois da `0084f`, o JSON deixa de trazer `valor_juros_fatura`. O campo mapeado no frontend não é exibido em nenhuma tela (só em teste), então o efeito é nenhum; recarregar resolve.
- **Editar parcela depois** não recalcula o juros guardado: o juros fica o do cadastro (aceito nesta entrega).
- **Parcela paga com desconto** reduz o juros contado na mesma proporção e também conta como desconto (simplificação, igual à convenção da fatura).
- **Regra do painel mudou para todas as linhas com juros guardado**: cobrir com teste a equivalência para as linhas da fatura.
- **Outro chat no mesmo repositório (Licitações):** não tocar na pasta principal nem no git dela; conferir se a branch deles mexeu em `despesas` antes do merge. Numeração `0084e`/`0084f` fica antes das 0085+.
- Código recente em `main` (PR #1, limite do cartão) mexeu em `cardInvoiceService.ts`: partir de `origin/main` atualizado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. O desenho exato da célula Valor/À vista na grade é decidido na implementação, com preview para o usuário (ver Riscos).

## Critérios de aceite do plano

- No Parcelado de "Nova despesa", a chave Parcela | Total e o campo "À vista (opcional)" ficam visíveis; o popover Cobrança tem só o número de parcelas; as caixas "Sei…" não existem mais; o lote e o cabeçalho continuam alinhados.
- Com à vista menor que a soma das parcelas, o servidor grava `valor_juros` nas parcelas somando exatamente (soma das parcelas − à vista), por igual, centavos na última. Sem à vista (ou à vista maior ou igual à soma), nada é gravado.
- O painel soma o juros guardado das parcelas pagas em "Juros e taxas pagos" e das abertas em "Juros a vencer"; o pagamento de fatura do cartão e os juros dele continuam com os mesmos números de antes (testes atuais passam).
- Nenhum código lê `valor_juros_fatura`; `0084e` e `0084f` ensaiadas e aplicadas só com o ok dele; coluna antiga removida no fim.
- `tsc`, testes do frontend e do backend e `vite build` limpos.

## Observações para a skill implementar

- Usar este plano como fonte principal; não recomeçar a discussão (cadastro especial de empréstimo foi descartado pelo usuário).
- Não executar migrations sem confirmação explícita; produção só fora do auto mode, uma de cada vez e nomeada. Não copiar o `.env` de produção para o worktree.
- Seguir o `AGENT.md` da raiz: identificadores de código em inglês (textos da tela em português); colunas do banco mantêm nomes em português; Drizzle em queries novas; sem `any`.
- Manter alterações pequenas e focadas; remover o antigo ao substituir (`knowsCashPrice`, `valor_juros_fatura`); uma regra em um lugar só.
- O worktree nunca fica na `main`; nunca mexer no estado do git da pasta principal; `.portal/` e `GLOSSARIO.md` nunca entram em commit; nunca `git add .`.
- Rodar build e testes um de cada vez (pouca memória virtual).
- Mostrar o layout do cadastro ao usuário antes do `/finalizar`.
