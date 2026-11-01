# Plano: Padronização — Etapa 1 de 3 — Receitas fixas no lançamento

## Origem

- Task: [padronizar cobrança, edição e receitas fixas](tasks/padronizacao-cobranca-edicao-receitas-fixas.md).
- Classificação: **fullstack + database**.
- Data: **01/11/2026**, America/Sao_Paulo. Base: `main`, commit `5d73332f`.
- Este arquivo substitui a primeira parte do plano único criado com o Codex em 31/10/2026, dividido em três etapas por tamanho e risco:
  - **Etapa 1 (este plano)**: receitas fixas no lançamento, lote de previstas, Adiar, painel e limpeza.
  - Etapa 2: [menu de cobrança, rótulos e etiqueta de status](padronizacao-etapa-2-menu-cobranca-rotulos.md).
  - Etapa 3: [edição financeira de despesas](padronizacao-etapa-3-edicao-financeira-despesas.md).
- A divisão e a decisão do item "Reduzir e ampliar o Até" foram aprovadas pelo usuário em 01/11/2026 ("pode corrigir").
- Executar na ordem 1 → 2 → 3. Cada etapa fecha com testes e build verdes antes da seguinte.

## Estado atual do repositório (revisado em 01/11/2026)

O Codex deixou, **sem commit**, 56 arquivos modificados e 12 novos, cobrindo as três etapas. Revisão feita sobre esse estado:

- **Receitas fixas: bem avançada.** Migrations `0091` e `0092` escritas e **não executadas**; schema, `fixedIncomes.ts`, `incomeService.ts`, rotas, painel, lote, Adiar, demonstração e remoção dos fluxos antigos já existem.
- **Quebras encontradas** (corrigir nesta etapa):
  - `npm --prefix backend run build` falha em `installmentCount.ts:121` (comparação com `'credit-payment'`, valor que não existe em `InvoiceEditLock`).
  - `tsc` do frontend: `draftRules.ts:313` (`endMonth` aceita `null`), `IncomeDialog.tsx:437` (`C` não existe → `ReferenceError` quando há previstas no celular) e `fixedIncomesDemo.test.ts:39` (anexo sem `id`).
  - Testes: 3 no backend e 1 no frontend falham por causa da liberação precoce de "despesa paga vira parcelada" (pertence à etapa 3).
- **Defeito de regra**: reduzir o Até cancela previstas e ampliar de novo não as recria (conflito com o índice de competência); além disso a redução não cancela a comissão ligada.
- Os arquivos de despesas alterados pelo Codex misturam etapas 2 e 3 e **não podem ir no commit desta etapa** (ver "Separação do que não é desta etapa").

## Resumo

Receita fixa passa a ser definida no próprio lançamento (Não repete / Fixa, com Até mês/ano obrigatório e marcação Recebida), a subcategoria deixa de configurar fixa, as previstas aparecem na lista do lote com Adiar persistente e uma gravação final, e o painel usa as ocorrências reais em vez da projeção por categoria.

### Decisões confirmadas

- Receitas fixas definidas no lançamento e suas séries; limite escolhido pelo usuário; sem renovação anual separada.
- Marcar Recebida na nova fixa lança a ocorrência atual como recebida; desmarcada, a atual fica prevista. As próximas ficam sempre previstas.
- Previstas do mês contextual na lista do lote, a partir da data prevista (hoje BRT ou antes), com Adiar/Adiar todas persistentes e confirmação pelo botão final, no mesmo ID.
- Itens sem valor válido ficam pendentes (adiados) sem bloquear os válidos.
- **Reduzir e ampliar o Até (decidido em 01/11/2026):**
  - Reduzir o limite **apaga** as previstas futuras além do novo limite (nunca receberam dinheiro).
  - Excluir um mês manualmente continua **cancelando**, e o mês cancelado não volta ao ampliar.
  - Ampliar recria só os meses ausentes; recebidas, faturadas, passado e canceladas manuais ficam intactas.
  - Ao apagar uma prevista, a comissão ligada a ela é cancelada junto.

## Escopo

### Dentro do escopo

- Correção das quebras listadas acima e da regra de reduzir/ampliar o Até.
- Receita fixa no lançamento: `RepeatPopover` com Não repete/Fixa e `RepeatEndField` (Até mês/ano), Recebida na primeira ocorrência.
- Lote com previstas, Adiar/Adiar todas, falha parcial preservando rascunhos, conta travada na abertura do modal.
- Fonte `classificacoes_receita_fixas` como série por lançamento; vínculo `receitas.classificacao_fixa_id` / `fixa_competencia`; coluna `adiada`.
- Painel por ocorrências e vínculo de série; fixa/variável por lançamento.
- Remoção: configuração fixa/valor/dia da subcategoria, `PredictedIncomesStrip`, renovação anual de renda (rota, serviço, cliente), geração anual da rotina diária.
- Demonstração equivalente, `FinancialAssistant` com o contrato unificado, cancelamento/exclusão de ano/reset com a fonte.

### Fora do escopo desta etapa

- Qualquer mudança em despesas (menu, rótulos, edição) — etapas 2 e 3.
- Parcelamento de receitas; novos painéis; dependências/runtime; `.env`; configuração do Render.
- Executar migration, escrever em banco, stage, commit, push ou deploy sem autorização específica.

## Estratégia de implementação

### 1. Corrigir as quebras

- Tipos: aceitar `endMonth: string | null` no contrato do frontend (ou normalizar para `undefined`); dar `id` ao anexo do teste; definir/importar o que `IncomeDialog.tsx:437` chama de `C` (mesma fonte de cores do arquivo).
- Build do backend: resolve-se ao devolver `installmentCount.ts` ao comportamento da etapa 1 (ver "Separação"); o `'credit-payment'` só reaparece, com o tipo correto, na etapa 3.

### 2. Reduzir/ampliar o Até (`changeFixedIncomeEndMonth`)

- Reduzir: dentro da mesma transação e dos locks atuais (fonte → ocorrências), para cada `prevista` com data ≥ hoje e competência além do novo fim: cancelar a comissão ligada (`cancelLinkedCommission`) e **apagar** a linha. Comissão já paga numa prevista a apagar → recusar a redução com mensagem clara.
- `faturada`, `ativa` (recebida), passada e `cancelada` não são tocadas.
- Ampliar: gerar competências ausentes (`onConflictDoNothing` continua valendo para as canceladas manuais); manter o limite de 36 meses por vez e a criação de comissões mensais já existente (`createExtendedCommissions`).
- Conferir que o índice único fonte/competência continua incluindo canceladas (migração 0052).

### 3. Fonte, migrations e ordem de publicação

- `0091` (aditiva): colunas na fonte (`descricao`, `valor_bruto`, `data_referencia`, `primeira_competencia`, `mes_final`, `cliente_id`, `representante_id`, `ativa`), backfill conservador, `adiada` em `receitas`, índice de pendentes. **Antes do novo backend.**
- `0092`: remove `uq_classificacoes_receita_fixas_conta_usuario`. **Depois** de o novo backend substituir os escritores antigos.
- Sequência de produção: aplicar 0091 → publicar o código → conferir → aplicar 0092. Cada passo com autorização específica e destino verificado.
- Entre o deploy e a 0092, criar uma segunda fixa na mesma subcategoria/conta/pessoa falha: trocar a mensagem atual ("atualização em andamento") por texto claro e recuperável; erro de unicidade nunca conta como lançamento bem-sucedido.
- Antes de aplicar: reconferir numeração e o runner de migrations; validar o SQL da 0091 (tipos de `date + interval`, `generate_series`, backfill de fontes sem `ano_registrado`) em **cópia local descartável**, nunca no banco da raiz (`.env` = produção).
- Fontes antigas passam a terminar no último período já registrado (dezembro do ano registrado): consequência visível ao usuário; ampliar é pelo Até. Registrar no resumo final.

### 4. Itens menores de código

- Remover o comentário órfão ("Liga, altera ou desliga a receita fixa…") e a linha em branco de imports em `income-classifications.ts`.
- `receiveIncome` com `changes`: a data vem de `changes.receiptDate`; documentar e testar que o lote sempre a envia (a data padrão do servidor só vale sem `changes`).
- Conferir que confirmar uma `faturada` de contrato pelo lote não altera campos que pertencem ao contrato.

### 5. Separação do que não é desta etapa

O working tree mistura etapas. Antes de implementar, com autorização do usuário:

1. Salvar o diff atual dos arquivos de despesas em um patch fora do repositório (scratchpad) para reaproveitar nas etapas 2 e 3.
2. Devolver ao estado de `HEAD`, nesta etapa, o que é só de despesas: `backend/src/services/expenseInput.ts`, `backend/src/services/installmentCount.ts`, `src/utils/installmentCount.ts`, partes de `draftRules.ts`/`draftState.ts`/`ExpenseDialog.tsx` da edição de cobrança, `BillingPopover.tsx`, `ExpenseRow.tsx`, `expenseGrid.ts`, `PaymentMethodPopover.tsx`, `SummaryLine.tsx`, `entryTable.tsx`, `expenseStatus.tsx`.
3. Arquivos mistos (`types/finance.ts`, `ExpenseDialog.tsx`, `draftRules.ts`) separados por trechos: ficam aqui só os trechos de receita.
4. Isso elimina a liberação precoce de "despesa paga vira parcelada" e as quatro falhas de teste associadas.

## Arquivos afetados

- Backend: `db/schema/incomes.ts`, `db/schema/incomeClassifications.ts`, `routes/incomes.ts`, `routes/income-classifications.ts`, `routes/internal-jobs.ts`, `server.ts`, `services/incomeService.ts`, `incomeInput.ts`, `fixedIncomes.ts`, `fixedIncomeSchedule.ts`, `painelService.ts`, `painelCalculos.ts`, `yearService.ts`, `clearFinancialDataService.ts`, `commissionService.ts` (uso), migrations `0091` e `0092`; removidos: `routes/fixedIncomeRenewals.ts`, `services/fixedIncomeRenewal*.ts`.
- Frontend: `income-dialog/*` (`IncomeDialog`, `IncomeRow`, `RepeatPopover`, `incomeGrid`, `draftRules`, `draftState`), `entry-dialog/RepeatEndField.tsx` (novo, compartilhado com a etapa 2), `SeriesRenewalModal.tsx`, `ClassificacoesReceitaTab.tsx`, `AppShell.tsx`, `FinancialAssistant.tsx`, `LancamentosTable.tsx`, `CalendarView.tsx`, `useEntryFilters.ts`, `financeService.ts`, `fixedIncomesService.ts` (novo), `incomeClassificationsService.ts`, `queryKeys.ts`, `types/config.ts`, `types/finance.ts`, demonstração (`fakeApiResolver`, `demoFakeDatabase`, `panelDemo`, `fixedIncomesDemo.ts`); removido: `PredictedIncomesStrip.tsx`, `fixedIncomeRenewalsService.ts`.
- Testes: `income-dialog/draftRules.test.ts`, `fixedIncomesDemo.test.ts`, `painelCalculos.test.ts`, `incomeInput.test.ts`, `fixedIncomeSchedule.test.ts`, `clearFinancialDataService.db.test.ts`; novos para `fixedIncomes` (criar série, ampliar, reduzir, Adiar, confirmar com `changes`).

## Segurança, dados e multi-tenant

- Nenhuma escrita em banco nem alteração de `.env` durante a implementação; migrations só com autorização e alvo verificado.
- Conta, autor e permissão revalidados no servidor em toda operação nova; IDs/conta vindos do cliente não substituem a autorização.
- Valores em centavos; transações únicas; locks na ordem fonte → ocorrência; falha desfaz a operação inteira.
- Comissão, retenção, estoque, horas e contrato seguem suas regras; nenhuma segunda comissão na confirmação nem na ampliação além da regra mensal existente.
- Recebido e previsto separados: saldo e indicadores de recebido só com status recebida; Adiar e criação de prevista nunca aumentam o saldo.

## Validações

- `npm --prefix backend run build`, `npm run build`, `npm --prefix backend run build -- --project ../tsconfig.json` e `npx tsc --noEmit -p tsconfig.json`: todos sem erro (um por vez; memória do computador).
- `npm test` e `npm --prefix backend test` com `FINANCE_DB_TESTS`, `TENDERS_DB_TESTS`, `TENDERS_VOLUME_TESTS` desativados na execução normal: **0 falhas**.
- `test:finance-db` e validação das migrations somente em cópia local descartável e com autorização.
- Conferência visual desktop/celular, claro/escuro: Fixa/Até, Recebida, previstas no lote, Adiar, Adiar todas (inclusive o rótulo do celular), falha parcial.
- `git diff --check`; busca de referências aos caminhos removidos; `.env`, lockfiles, CI e Render fora do diff.

## Testes recomendados

- Nova fixa com Recebida marcada/desmarcada; limite no próprio mês, em outro ano e nos dias 29/30/31.
- Reduzir apaga só previstas futuras além do limite e cancela a comissão ligada; comissão paga bloqueia a redução; recebidas/faturadas/passado intactas.
- Reduzir e ampliar de novo recria os meses; mês excluído manualmente continua de fora.
- Ampliar não passa de 36 meses por vez e não reativa canceladas manuais.
- Adiar individual/todas, estado parcial, falha, reabertura e disputa com confirmação; item sem valor fica pendente sem bloquear os válidos.
- Confirmação pelo mesmo ID com valor/data alterados; duas confirmações concorrentes; refetch antigo.
- Fontes antigas com/sem ano registrado; réplicas manuais sem vínculo preservadas; duas séries na mesma subcategoria após a 0092.
- Painel com fixa e variável na mesma subcategoria, estimativa substituída pelo recebido; demonstração equivalente; cancelamento, exclusão de ano e reset sem recriar competências nem tocar dados de outra conta/pessoa.

## Riscos

- Aplicar a 0092 antes do código novo deixaria o código antigo escolher uma fonte arbitrária entre várias da mesma subcategoria.
- Apagar previsão sem cancelar a comissão deixaria despesa de comissão órfã (`receita_origem_id` é `ON DELETE SET NULL`).
- Fontes legadas com metadados incompletos; não presumir banco vazio nem ampliar prazos automaticamente.
- Código antigo de geração/salvamento ficando escondido depois de a interface sair.

## Critérios de aceite

- Fixa e Até configurados no lançamento; subcategoria sem configuração de fixa/valor/dia.
- Futuras previstas até o limite inclusivo, inclusive entre anos, com ajuste individual sem propagar valor.
- Previstas elegíveis do mês aparecem uma vez no lote; Adiar persiste; um botão final registra novas e confirma as previstas aptas no mesmo ID.
- Reduzir/ampliar o Até se comporta como decidido, sem comissão órfã.
- Painel respeita limite, série e separação previsto/recebido, sem duplicar ao confirmar.
- Fluxos antigos e código exclusivo removidos; contratos, comissões, estoque, horas, alertas e renovação mensal de despesas seguem funcionando.
- Builds e testes pertinentes passam; limitações reais registradas. Nada publicado sem autorização.

## Instruções para /implementar

- Ler `AGENT.md` e `CLAUDE.md`; reconferir `git status` antes de editar e não sobrescrever alterações locais.
- Executar primeiro "Separação do que não é desta etapa" (com autorização), depois as correções, depois os testes novos.
- Não executar migrations, seeds ou testes com escrita sem autorização e alvo verificado. Não alterar `.env`. Sem stage, commit, push ou deploy durante `/implementar`; `/finalizar` quando solicitado, com confirmação específica para produção.
- Etapas 2 e 3 só começam com esta fechada.

## Execução (01/11/2026, branch `feat/R/receitas-fixas-lancamento`)

Implementada e validada localmente; **nada commitado, nenhuma migration executada, nenhum banco tocado**.

- **Separação feita.** Backup completo em `c:\tmp\financas-codex\` (`codex-completo.patch`, `untracked/`, `despesas-etapas-2-3.patch`, `mistos-para-etapas-2-3.patch`, `LEIA-ME.txt`). Voltaram ao estado do commit: `expenseInput.ts`, `installmentCount.ts` (backend e frontend), `BillingPopover`, `ExpenseDialog`, `ExpenseRow`, `PaymentMethodPopover`, `expenseGrid`, `draftRules`/`draftState` de despesas, `entryTable`, `expenseStatus`, `useEntryFilters`, e os trechos de despesa de `LancamentosTable` e `types/finance.ts`.
- **Correções**: `C` indefinido no "Adiar todas", tipos (`endMonth`, anexo do teste), build do backend.
- **Regra do Até** (`fixedIncomeSchedule.planFixedIncomeEndChange` + `fixedIncomes.changeFixedIncomeEndMonth`): reduzir apaga as previstas futuras além do limite e cancela a comissão ligada (`cancelLinkedCommissions`, versão em lote); comissão paga recusa (409); ampliar recria só o que falta; exclusão à mão continua cancelando. **Acréscimo:** reduzir o limite para antes da própria ocorrência editada é recusado (nova mensagem), para não apagar a receita que está sendo editada ou confirmada.
- **Etiqueta de status do modal de receita** saiu aqui, porque a linha de resumo é compartilhada: `SummaryContent.status` ficou opcional e a pílula só aparece quando informada. As despesas continuavam mostrando a etiqueta até a etapa 2, que removeu o campo e a pílula de vez.
- **`repeatUntil` mantido só no servidor**, como compatibilidade de uma aba aberta com a versão antiga durante a publicação (vira a mesma série fixa, já recebida). Sem ele, a aba antiga gravaria uma receita sem as réplicas, sem avisar. Remover depois que a publicação estabilizar. Saiu do frontend e da demonstração.
- **Renomeado** `POST /incomes/fixas/processar` → `POST /incomes/contract-top-up` e `processarReceitasFixas` → `topUpContractIncomes`: só repõe mensalidades de contrato; a resposta passou a `{ contractIncomes }` e o app invalida as receitas quando alguma foi criada (antes o campo `registered` ficava sempre 0).
- **Código morto removido**: funções de geração anual e renovação em `fixedIncomeSchedule.ts` (e seus testes), `monthlyDatesUntil`, `dateInMonth`, `monthLabel`, `queryKeys.fixedIncomeRenewals`, tipos `FixedIncomeRenewal*`, a extensão de campos de `CatalogoEmArvore` (só a fixa por subcategoria usava), comentário e import órfãos em `income-classifications.ts`.
- **0091 ajustada** (nunca aplicada): intervalo escrito sem ambiguidade, `generate_series` em `timestamp` e `mes_final` nunca menor que o primeiro mês (evita violar o CHECK numa fonte sem ocorrências e com ano antigo). A 0092 não mudou.
- **Mensagem do conflito de unicidade** antes da 0092 reescrita ("Já existe uma receita fixa nesta categoria…").
- **Testes novos**: `fixedIncomeSchedule.test.ts` (reescrito), `incomeInput.test.ts` (fixa, Recebida, limite, Adiar, mês, confirmar com edição), `fixedIncomesDemo.test.ts` (reduzir/ampliar), `date.test.ts`. **Escritos e não executados:** `fixedIncomes.db.test.ts` (novo) e a extensão de `clearFinancialDataService.db.test.ts`; precisam do banco local com a 0091 aplicada.
- **Validação**: `npm --prefix backend run build`, `npx tsc --noEmit -p tsconfig.json` e `npm run build` sem erro; `npm --prefix backend test` 1003 passam, 0 falham, 1 ignorado (o mesmo de antes); `npm test` 480 passam, 0 falham; `git diff --check` limpo; nenhum arquivo de configuração alterado.
- **Pendente (precisa de autorização):** (1) `migrations:status -- --banco local` e `migrations:aplicar -- 0091 --banco local`; (2) `npm --prefix backend run test:finance-db`; (3) conferência visual desktop/celular, claro/escuro; (4) produção: 0091 → deploy → 0092, cada passo à parte.
