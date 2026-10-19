# Plano de Implementação: Receita com valor bruto e líquido, e juros e taxas no painel

## Origem

- Arquivo de especificação: nenhum `.md` de entrada. A origem é o bate-papo de 2026-10-18 e 2026-10-19 (task 2 das três previstas em `.plans/catalogo-padrao-categorias-pf.md`) e a análise de código feita no planejamento.
- Data do planejamento: 2026-10-19
- Classificação: `frontend + backend + database`

## Resumo

A receita passa a ter dois valores obrigatórios: o **bruto** (o que era devido) e o **líquido** (o que entrou na conta). A coluna `valor` é renomeada para `valor_liquido`, e `valor_bruto`, que hoje só existe em receita de contrato com retenção, passa a existir em toda receita (nas antigas, igual ao líquido). A parte do bruto que não é líquido nem retenção de tributo é "juros e taxas": ela soma no painel ao lado dos juros das despesas, sem gerar despesa. O caso que motivou: empréstimo de R$ 1.000 com taxa de R$ 100 entra R$ 900 na conta e os R$ 100 aparecem como juros pagos.

Por que agora: a task 1 (catálogo de categorias) terminou, e a task 3 (cadastro de Empréstimo) vai criar receitas com bruto diferente do líquido.

## Decisões aplicadas

- **Decisão 1 (lançamento):** dois campos na própria linha, "Valor bruto" e "Valor líquido (entrou)". O líquido acompanha o bruto até ser editado.
- **Decisão 2 (confirmar recebimento):** o botão continua sem perguntar valor e usa os valores previstos. Quem recebeu diferente edita a receita.
- **Decisão 3 (renomeação):** em duas etapas, sem intervalo de erro. A primeira migration cria a coluna nova e uma ponte temporária no banco; o código final entra de uma vez; a segunda migration remove a ponte e a coluna antiga.
- Já decididas antes: a comissão continua sobre o valor líquido; renomear tudo de uma vez (banco `valor` para `valor_liquido`, Drizzle `amount` para `netAmount`, API); o aviso de cookies fica como está; a diferença conta como juros e taxas sem coluna nova (bruto menos líquido menos retenções).

## Escopo

### Dentro do escopo

- Migration em duas etapas (`0084c` e `0084d`): coluna `valor_liquido`, `valor_bruto` obrigatório, ponte temporária, garantia de bruto maior ou igual ao líquido.
- Backend: Drizzle (`netAmount`, `grossAmount` obrigatório), os 5 pontos que gravam receita, validação, retenção de contrato, leituras de valor (saldo, orçamento, assistente, copiloto, relatórios, clientes e contratos), SQL cru de `routes/incomes.ts` e `routes/accountMembers.ts`.
- Painel: função pura do juro da receita, totais e série do card, novo título e rótulos.
- Frontend: tipos e mapeamento da API, linha e edição do lançamento com os dois campos, calendário, assistente, dados da demo.
- Testes de validação, de cálculo do painel e das regras do rascunho; ensaio das migrations num Postgres em memória com a cópia de produção.

### Fora do escopo

- Despesas: `valor_juros_fatura` e a generalização para `valor_juros` (task 3).
- Cadastro de Empréstimo (task 3).
- Tela para digitar o valor ao confirmar o recebimento.
- Coluna nova de bruto em relatórios e exportações (usam o líquido).
- Mudança na regra de comissão.
- Licitações e qualquer arquivo da branch do outro chat.

## Leitura de contexto

- `/AGENT.md` da raiz: modelo de projeto multi-prefeitura com RLS, que **não vale** para este sistema. O isolamento aqui é por `usuario_id` e `conta_id`. Valem as regras de Drizzle para consulta nova, código novo em inglês e sem `any`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem** neste projeto.
- `.plans/catalogo-padrao-categorias-pf.md` e a memória do projeto (análise das tasks 2 e 3).
- Código lido: `backend/src/db/schema/incomes.ts`, `services/incomeService.ts`, `incomeInput.ts`, `contractRetentions.ts`, `contractIncomes.ts`, `fixedIncomes.ts`, `orders.ts`, `accountPartners.ts`, `painelService.ts`, `painelCalculos.ts`, `routes/incomes.ts`; `src/types/finance.ts`, `src/services/financeService.ts`, `src/screens/finance/income-dialog/*`, `src/screens/finance/painel/JurosDescontos.tsx`, `PredictedIncomesStrip.tsx`.

## Impacto por área

### Frontend

- **Tipos e API:** `Income.valor` passa a `valorLiquido`; `valorBruto` deixa de ser opcional. O mapeamento fica todo em `financeService.ts` (linhas da API para `Income`). Corpo de POST e PUT passa a `grossAmount` e `netAmount`.
- **Linha de lançamento** (`IncomeRow.tsx`, `incomeGrid.ts`): nova coluna, com "Valor bruto" e "Valor líquido (entrou)" lado a lado, nas grades pessoal e empresa e no layout do celular.
  - O líquido acompanha o bruto até a pessoa editá-lo. Em `draftState.ts`, o líquido vazio significa "acompanha o bruto".
  - Em contrato com retenção, só o bruto é digitado e o líquido é calculado (já existe `withholdingPreview` em `draftRules.ts`).
  - Mensagem de erro quando o líquido passa do bruto.
  - Na edição (`IncomeDialog.tsx`), os dois campos vêm preenchidos pelos valores gravados.
- **Receita fixa:** `fixedCategoryPatch` preenche o bruto, e o líquido acompanha.
- **Painel** (`JurosDescontos.tsx`, `painelFormat.ts`): título da seção "Quanto paguei de juros e taxas?", rótulo "Juros e taxas pagos" no lugar de "Juros pagos", e textos de estado vazio. A forma do dado do painel não muda: o juro da receita entra no mesmo total de `jurosDescontos`.
- **Outros pontos que leem o valor:** `CalendarView.tsx`, `PredictedIncomesStrip.tsx`, `FinancialAssistant.tsx` (assistente grava bruto igual ao líquido), lista de receitas, `services/demo/demoFakeDatabase.ts` e `fakeApiResolver.ts`. Depois de renomear o tipo, o `tsc` lista todos.
- **Estados:** a linha de entrada e o lote continuam com os mesmos estados de erro, carregamento e vazio.

### Backend

- **Schema** (`db/schema/incomes.ts`): `amount` vira `netAmount` (`valor_liquido`), `grossAmount` fica obrigatório (`valor_bruto`). `retencoes` continua opcional.
- **Gravação** (os 5 pontos que inserem receita): `incomeService` (lançamento e réplicas de "Repetir até"), `fixedIncomes` (previstas da receita fixa), `contractIncomes`, `orders` (vitrine) e `accountPartners` (capital dos sócios). Todos preenchem bruto e líquido. Quando não há desconto, os dois são iguais.
- **Sinal de retenção:** hoje `valor_bruto` não nulo quer dizer "tem retenção" (em `incomeService.updateIncome`, `amountColumns`, `contracts` e `contractViews`, com `coalesce(grossAmount, amount)`). Passa a valer `retencoes` não nulo, e os `coalesce` somem.
- **Validação** (`incomeInput.ts`): bruto e líquido obrigatórios, líquido maior que zero e menor ou igual ao bruto. Com retenção de contrato, o líquido é calculado e o enviado é ignorado. O `valor_recebido` opcional de `PUT /incomes/:id/receber` (que a interface não usa) ajusta o líquido e sobe o bruto se ficar menor.
- **Comissão** (`findCommissionRule` e `createCommissionExpense`): continua sobre o líquido.
- **Leituras de valor:** `balanceService`, `budgetService`, `financialCopilot`, `assistantQueries`, `reportService`, `clients`, `contracts`, `contractViews`, `contractIndicators`, `painelService`. Todas passam a ler o líquido.
- **SQL cru:** `routes/incomes.ts` (a listagem devolve `r.*`, então os campos da API passam a `valor_liquido` e `valor_bruto`) e `routes/accountMembers.ts` (soma de `valor`).
- **Painel** (`painelCalculos.ts`, `painelService.ts`):
  - `ReceitaPainel` ganha o bruto e o total de retenções.
  - Nova função pura `jurosDaReceita` calcula o maior entre zero e bruto menos líquido menos retenções, só nas receitas recebidas (`status` ativa), no mês do recebimento.
  - `agregarJurosDescontos` e a série passam a receber as receitas.
  - Os "juros a vencer" continuam só das despesas.
- **Permissões e isolamento:** nenhuma rota nova. Os filtros por `usuario_id` e `conta_id` existentes ficam como estão.

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

- **`0084c` (etapa 1, aditiva e segura com o código antigo no ar):**
  - cria `receitas.valor_liquido` e copia `valor` para ela;
  - preenche `valor_bruto` onde estiver vazio;
  - instala uma função e um gatilho `BEFORE INSERT OR UPDATE` que mantêm `valor` e `valor_liquido` iguais (o código antigo grava só `valor` e o novo só `valor_liquido`) e completam o bruto com o líquido.
- **`0084d` (etapa 2, depois do deploy do código final):**
  - remove o gatilho e a função;
  - copia qualquer sobra para `valor_liquido` e apaga a coluna `valor`;
  - torna `valor_liquido` e `valor_bruto` `NOT NULL`;
  - adiciona a garantia `valor_bruto >= valor_liquido`.
- **Numeração:** a letra mantém as duas migrations depois da `0084b` e antes das `0085` em diante, que a branch de Licitações reserva. Conferir o número livre na hora de criar. A ferramenta de migrations só recusa aplicar uma migration se houver outra de número menor pendente, então a ordem entre as duas branches não trava.
- **Volume:** 94 receitas da conta 17 e poucas de outras contas. Sem risco de tempo de bloqueio.
- **Banco local:** recebe as duas migrations também, na mesma ordem, com confirmação.

### Infra/Deploy

- Sem variável de ambiente nova.
- Ordem em produção: `0084c` (local e depois produção) → merge e deploy do código final → conferência → `0084d` (local e depois produção). O deploy é do site e do backend.
- Com a página aberta durante o deploy, é preciso recarregar: os nomes dos campos da API mudam.
- Escrita em produção só fora do auto mode e com aprovação de cada comando.

## Arquivos provavelmente afetados

- **Banco:** `backend/drizzle/0084c_*.sql`, `backend/drizzle/0084d_*.sql`, `backend/src/db/schema/incomes.ts`.
- **Backend:** `services/incomeService.ts`, `incomeInput.ts` (e `incomeInput.test.ts`), `contractRetentions.ts`, `contractIncomes.ts`, `contracts.ts`, `contractViews.ts`, `contractIndicators.ts`, `clients.ts`, `fixedIncomes.ts`, `orders.ts`, `accountPartners.ts`, `balanceService.ts`, `budgetService.ts`, `financialCopilot.ts`, `assistantQueries.ts`, `reportService.ts`, `painelService.ts`, `painelCalculos.ts` (e `painelCalculos.test.ts`), `routes/incomes.ts`, `routes/accountMembers.ts`.
- **Frontend:** `src/types/finance.ts`, `src/services/financeService.ts`, `src/screens/finance/income-dialog/` (`IncomeRow.tsx`, `IncomeDialog.tsx`, `draftRules.ts` e o teste, `draftState.ts`, `incomeGrid.ts`, `IncomeDetailsPopover.tsx`, `PredictedIncomesStrip.tsx`), `src/screens/finance/calendar/CalendarView.tsx`, `src/components/financial-assistant/FinancialAssistant.tsx`, `src/screens/finance/painel/JurosDescontos.tsx` e `painelFormat.ts`, `src/services/demo/demoFakeDatabase.ts` e `fakeApiResolver.ts`.
- **Fora do repositório (scripts descartáveis):** ensaio das migrations num Postgres em memória, a partir de `f2-conta17-scripts`.

## Estratégia de implementação

1. Criar a branch `feat/R/receita-bruto-liquido` a partir da `main` (no worktree).
2. Escrever as duas migrations e ensaiá-las num Postgres em memória com a cópia de produção. Cobrir: gravação no estilo antigo (só `valor`) e no novo (só `valor_liquido`), nulos plantados, `0084d` sem sobra, reaplicar. **Não aplicar nada ainda.**
3. Backend:
   - schema (`netAmount`, `grossAmount`);
   - `incomeInput` (validação) e função pura de valores, preservando `incomeAmounts` e as retenções;
   - os 5 pontos de gravação;
   - o novo sinal de retenção (`retencoes`), com os `coalesce` removidos;
   - leituras de valor e SQL cru;
   - `jurosDaReceita` e o painel.
4. Frontend: tipos e mapeamento, linha e edição com os dois campos, `draftState` e `draftRules`, calendário, assistente, demo e painel.
5. Conferir o SQL cru à mão com uma lista de buscas (`valor`, `r.valor`, `receitas`), porque o compilador não o cobre.
6. Rodar, um de cada vez: `tsc` e testes do backend; `tsc`, testes e `vite build` do frontend.
7. Pedir aprovação e aplicar a `0084c` no banco local e depois na produção (fora do auto mode).
8. `/finalizar` e merge: deploy do código final.
9. Conferir o deploy, aplicar a `0084d` (local e produção) com checagem de nulos, e conferir na tela.
10. Atualizar este plano (registro de andamento) e a memória.

## Regras de negócio identificadas

- Toda receita tem valor bruto e valor líquido, obrigatórios. Líquido é o que entrou na conta e é ele que vale em saldo, totais, orçamento e comissão.
- Juros e taxas da receita = bruto menos líquido menos retenções de tributo. Só conta receita recebida, no mês do recebimento, e **não** gera despesa.
- O total de juros e taxas pagos no painel soma os juros das despesas e o juro da receita.
- Receita antiga tem bruto igual ao líquido, então juros e taxas zero.
- Receita prevista (fixa ou "Repetir até") nasce com bruto e líquido, e a confirmação não muda os valores.
- Em contrato com retenção, o bruto é digitado e o líquido é calculado a partir dos percentuais do contrato.
- No lançamento, o líquido acompanha o bruto até ser editado, e nunca passa do bruto.

## Regras multi-tenant e segurança

- O projeto não é multi-tenant. O isolamento relevante é por usuário e conta, e as consultas existentes já filtram por `usuario_id` e `conta_id`. Nada novo precisa de filtro além do que as consultas alteradas já têm.
- A validação de bruto e líquido fica no backend. O cliente não é confiável.
- Não há dado sensível novo, rota nova nem permissão nova.
- Migrations e escrita em produção só com confirmação explícita, uma por vez, fora do auto mode.

## Validações necessárias

- `grossAmount` e `netAmount` obrigatórios, numéricos, maiores que zero, com duas casas e dentro do limite da coluna (`decimal(10,2)`); `netAmount` menor ou igual a `grossAmount`.
- Mensagens em português, no padrão do projeto: "Informe o valor bruto", "Informe o valor líquido", "O valor líquido não pode passar do bruto".
- Em contrato com retenção, o líquido enviado é ignorado e recalculado.
- `valor_recebido` da confirmação continua opcional e válido como líquido.

## Testes necessários

### Frontend

- `draftRules` e `draftState`: líquido acompanha o bruto, deixa de acompanhar depois de editado, recusa líquido maior que o bruto, e em contrato com retenção o líquido é calculado.
- A receita fixa preenche o bruto e o líquido acompanha.
- Mapeamento da API para `Income` com `valor_liquido` e `valor_bruto`.

### Backend

- `incomeInput`: obrigatoriedade e limites dos dois valores.
- Função pura de valores e retenção: com e sem retenção, arredondamento.
- `painelCalculos`: `jurosDaReceita` (sem desconto, com taxa, com retenção, previstas e canceladas ficam de fora), `agregarJurosDescontos` e a série.
- Receitas antigas (bruto igual ao líquido) dão juros zero.

### E2E

- Manual, na tela: lançar receita de R$ 1.000 bruto e R$ 900 líquido e ver R$ 100 em "Quanto paguei de juros e taxas?"; editar; receita fixa; contrato com retenção; calendário e lista.
- Ensaio no Postgres em memória das duas migrations, com a cópia de produção.

## Comandos de validação sugeridos

Rodar um de cada vez (o computador não tem arquivo de paginação) e, nos testes do backend, com `DATABASE_URL` de mentira:

```bash
npm --prefix backend test
npm --prefix backend run build
npm test
npx tsc --noEmit -p tsconfig.json
npx vite build
```

Status das migrations, só leitura: o wrapper de `f2-conta17-scripts/f2-aplicar-migracao.mts --status --banco local|producao` (o worktree não tem `.env`).

## Riscos e pontos de atenção

- **Ponte no banco:** o gatilho que mantém `valor` e `valor_liquido` iguais é a peça mais delicada. Mitigação: ensaio com dados de produção e remoção na `0084d`.
- **Páginas abertas:** quem estiver com o sistema aberto durante o deploy precisa recarregar, porque os campos da API mudam.
- **Visual temporário:** entre a `0084c` e o deploy, as telas de contrato do código antigo podem mostrar o bruto igual ao líquido nas receitas sem retenção. Dura minutos.
- **SQL cru:** o compilador não pega `routes/incomes.ts` e `routes/accountMembers.ts`. Conferir por busca.
- **Sinal de retenção:** trocar `valor_bruto` não nulo por `retencoes` não nulo precisa de teste nas receitas de contrato.
- **Duas branches no `receitas`:** a branch de Licitações também usa `receitas` em alguns pontos. Conferir conflitos no merge.
- **Valor no painel:** o total de juros e taxas muda de significado (passa a incluir receita), mas hoje todas as receitas têm bruto igual ao líquido, então os números atuais não mudam.

## Perguntas em aberto

Assumidas, ajustáveis na implementação:

- O painel de conta empresa usa o mesmo cálculo e o mesmo card.
- As receitas antigas ficam com juros e taxas zero.
- A garantia de bruto maior ou igual ao líquido entra na `0084d`.
- Texto exato do título e dos rótulos do card: "Quanto paguei de juros e taxas?" e "Juros e taxas pagos".

## Critérios de aceite do plano

- Toda receita nova e toda receita editada têm bruto e líquido, o líquido acompanha o bruto até ser editado, e nunca passa do bruto.
- Uma receita de R$ 1.000 bruto e R$ 900 líquido soma R$ 100 em "juros e taxas pagos" no mês do recebimento, sem criar despesa.
- Saldo, orçamento, totais e comissão continuam sobre o líquido; os números atuais da conta 17 não mudam.
- Contrato com retenção funciona como antes (bruto digitado, líquido calculado) e não soma juros.
- As duas migrations passam no ensaio e deixam o banco com `valor_liquido`, `valor_bruto` obrigatório, sem a coluna `valor` e sem gatilho.
- Nenhum ponto do código ou do SQL cru ainda lê a coluna antiga `valor` de receitas.
- Testes, `tsc` e `vite build` passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Trabalhar no worktree `C:\Users\rodri\Music\financas-catalogo-categorias`, em branch nova a partir da `main`. Não mexer na pasta principal nem no git dela: o outro chat (Licitações) trabalha lá.
- Não executar migrations sem confirmação explícita, uma por vez e em ordem. Na produção, só fora do auto mode e com `--confirmo`.
- Código novo em inglês (`netAmount`, `grossAmount`); os nomes das colunas do banco ficam em português.
- Renomear tudo de uma vez e apagar o antigo: sem camada sobreposta, exceto a ponte temporária do banco, que a `0084d` remove.
- Manter alterações pequenas e focadas, sem refatorar o que não for receita.
- Rodar build e testes um de cada vez.

## Registro de andamento

- **2026-10-19:** plano aprovado e salvo. Nada implementado.
- **2026-10-19, implementação feita no worktree (branch `feat/R/receita-bruto-liquido`, sem commit e SEM migration aplicada):** schema (`netAmount`, `grossAmount` obrigatório), `resolveIncomeAmounts` / `incomeValueColumns` / `sumWithholdings` em `contractRetentions.ts` (uma regra só; o sinal "tem retenção" passou a ser `retencoes`), validação (`grossAmount` e `netAmount`, líquido não passa do bruto), os 5 pontos de gravação, leituras de valor e o SQL cru de `accountMembers.ts`, `jurosDaReceita` e o painel (com filtro de despesa ligado, os juros e taxas da receita ficam fora), frontend com os dois campos na linha, tipos, calendário, assistente, demo e o texto do card. Duas migrations criadas e NÃO aplicadas: `0084c` (aditiva, com gatilho de ponte) e `0084d` (depois do deploy). Ensaio das duas num Postgres em memória com a cópia de produção: 17 verificações ok (código antigo e novo gravando, sobras, recusas do banco). Validações: backend `tsc` limpo e 530 testes; frontend `tsc` limpo, 298 testes e `vite build`. Diferenças em relação ao plano: a consulta de duplicata e as sugestões usam o valor bruto (o digitado); `contractViews` e `clients` continuam devolvendo `grossAmount` nulo sem retenção, para a tela de contrato não mudar. Limitação: na edição de uma receita de contrato com retenção, o campo líquido aparece editável mas o servidor recalcula pelo contrato. Falta: aprovação para aplicar a `0084c` (local e produção), `/finalizar` com merge e deploy, `0084d` e a conferência na tela.
- **2026-10-19, `0084c` aplicada** no banco local e na produção (aprovado por ele). Conferido em leitura: produção com 100 receitas, nenhuma sem valores, líquido igual ao valor antigo, soma R$ 200.508,59 nos dois, gatilho de ponte ativo; local com 54 receitas, também ok. Commit da implementação `540f240e` na branch `feat/R/receita-bruto-liquido`, com push. Falta: merge em main e deploy, `0084d` (local e produção) e a conferência na tela.
