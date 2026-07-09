# Plano de Implementação: Migração despesas.js → src/expenses.ts

## Origem

- Arquivo de especificação: `js/despesas.js`
- Data do planejamento: `2026-06-22`
- Classificação: `frontend-only`

## Resumo

Migrar `js/despesas.js` (4772 linhas, 20 módulos, ~105 funções) para `src/expenses.ts` em TypeScript, seguindo os padrões estabelecidos nas migrações anteriores (`main.ts`, `income.ts`, `reports.ts`). Cobre: renderização de grids, sistema de cards de lançamento, exclusão com opções (parcela/todas/recorrente), pagamento individual e em lote, filtros e ordenação, cálculos financeiros, movimentação de despesas, importação de extrato PDF e redimensionamento de colunas.

## Escopo

### Dentro do escopo

- Todos os 20 módulos do arquivo
- Renomeação de todas as funções para inglês
- Tipagem de todos os parâmetros, retornos e variáveis de módulo
- Atualização de `src/types/globals.d.ts` com os novos exports
- Manutenção da compatibilidade via `window.*` registrations

### Fora do escopo

- Refatoração de lógica — tradução fiel, sem alterar comportamento
- Telas HTML — Phase 3 planejada separadamente
- `configuracao.js` — migração independente planejada em `migrate-configuracao-to-settings.md`

## Leitura de contexto

- `/AGENT.md` — lido
- `js/despesas.js` — lido integralmente (4772 linhas)
- `src/types/globals.d.ts` — lido (globals existentes mapeados)
- `src/main.ts` — padrões de migração consultados
- `src/income.ts`, `src/reports.ts` — padrões de migração consultados

## Módulos mapeados

| Módulo | Linhas | Funções |
|---|---|---|
| Estado do módulo + constantes | 1–13, 3002 | 5 variáveis, `ERROS` const |
| Replicação de data | 24–31 | 1 |
| Inicialização de grids | 37–84 | 3 |
| Renderização de receitas | 86–242 | 3 |
| Eventos e filtros do grid | 244–418 | 5 |
| Renderização de despesas | 424–825 | 18 |
| Utilitários | 828–1038 | 10 |
| Sistema de cards | 1042–1799 | 32 |
| Salvamento API | 1805–2188 | 12 |
| Exclusão (simples/parcelada/recorrente) | 2194–2756 | 11 |
| Mover para próximo mês | 2763–2896 | 4 |
| Pagamento individual | 2902–3264 | 6 |
| Pagamento em lote | 3300–3583 | 6 |
| Filtros e ordenação | 3588–3762 | 13 |
| Cálculos e totalizações | 3884–4113 | 8 |
| Abas + view toggle | 4182–4219 | 2 |
| Categoria inline | 4130–4565 | 4 |
| Column resizer (IIFE → function) | 4272–4405 | 3 + 2 globals |
| PDF import (IIFE → function) | 4571–4772 | 7 |
| Window registrations | distribuído | ~55 exports |

## Impacto por área

### Frontend

- **Arquivo novo**: `src/expenses.ts`
- **Arquivo modificado**: `src/types/globals.d.ts` — adição de ~20 declarações `window`
- Todos os 20 módulos migrados com renomeação PT → EN
- Window registrations preservam os nomes PT para compatibilidade com HTML/JS não migrados

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/expenses.ts` (novo)
- `src/types/globals.d.ts` (atualização)

## Renomeação de funções (PT → EN)

```
calcularDataReplicada             → calcReplicatedDate
inicializarTabelaDespesasGrid     → initExpenseGridTable
inicializarTabelaReceitasGrid     → initIncomeGridTable
_aplicarVisibilidadeColunaEmpresa → _applyCompanyColumnVisibility
renderizarReceitas                → renderIncomes
criarLinhaReceitaGrid             → createIncomeGridRow
preencherCelulaAnexosReceita      → fillIncomeAttachmentCell
configurarEventosGrid             → setupGridEvents
configurarEventosFiltros          → setupFilterEvents
aplicarFiltrosToolbarDespesas     → applyToolbarFilters
limparFiltrosToolbarDespesas      → clearToolbarFilters
atualizarFiltrosExistentes        → updateExistingFilters
_renderProximoLote                → _renderNextBatch
renderizarDespesas                → renderExpenses
criarLinhaDespesaGrid             → createExpenseGridRow
preencherCelulasGrid              → fillGridCells
preencherCelulaCheckbox           → fillCheckboxCell
preencherCelulaNumero             → fillNumberCell
preencherCelulaDescricao          → fillDescriptionCell
preencherCelulaCategoria          → fillCategoryCell
preencherCelulaFormaPagamento     → fillPaymentMethodCell
preencherCelulaValor              → fillValueCell
preencherCelulaParcela            → fillInstallmentCell
preencherCelulaValorPago          → fillPaidValueCell
preencherCelulaStatus             → fillStatusCell
preencherCelulaDatas              → fillDatesCell
preencherCelulaAcoes              → fillActionsCell
configurarBotoesAcaoTemplate      → setupActionButtonsTemplate
configurarEventosDespesas         → setupExpenseEvents
encontrarDespesaPorId             → findExpenseById
encontrarDespesaPorIndice         → findExpenseByIndex
atualizarStatusDespesas           → updateExpenseStatuses
obterCategoriaLimpa               → getCleanCategory
criarBadgeStatus                  → createStatusBadge
obterClasseStatus                 → getStatusClass
obterDatasExibicao                → getDisplayDates
arredondarParaDuasCasas           → roundToTwo
atualizarBotaoLote                → updateBatchButton
preencherCelulaAnexos             → fillAttachmentsCell
_montarCardDespesa                → _buildExpenseCard
criarCard                         → createCard
atualizarBotoesRemoverCards       → updateRemoveCardButtons
adicionarCard                     → addCard
removerCard                       → removeCard
configurarEventosCard             → setupCardEvents
_hoje                             → _today
_calcVencimentoCartao             → _calcCardDueDate
selecionarPagamentoCard           → selectAccountPayment
selecionarPagamentoCartao         → selectCardPayment
popularCategoriasCard             → populateCategoryCard
popularCartoesCard                → populateCardsCard
popularTodosOsCards               → populateAllCards
calcularInfoCard                  → calcCardInfo
aplicarFavoritoCard               → applyFavoriteCard
atualizarEstrelasCard             → updateCardStars
salvarFavoritoCard                → saveFavoriteCard
abrirAnexosCard                   → openCardAttachments
atualizarAnexosVisuaisCard        → updateCardAttachmentsVisual
removerAnexoCard                  → removeCardAttachment
atualizarIndicadorMesCard         → updateCardMonthIndicator
coletarDadosCard                  → collectCardData
validarCard                       → validateCard
salvarTodasDespesas               → saveAllExpenses
processarReplicacaoDespesaCard    → processCardExpenseReplication
preencherCardEdicao               → fillEditCard
abrirModalNovaDespesa             → openNewExpenseModal
fecharModalLancamentoDespesas     → closeExpenseLaunchModal
resetarModalLancamento            → resetLaunchModal
limparParaNovaEntrada             → clearForNewEntry
configurarEventosModalLancamento  → setupLaunchModalEvents
salvarDespesaLocal                → saveExpenseLocal
recarregarDespesasDoMes           → reloadMonthExpenses
limparAposGravacao                → cleanupAfterSave
atualizarTodasParcelasGrupo       → updateAllInstallmentGroup
editarDespesa                     → editExpense
editarDespesaPorId                → editExpenseById
excluirDespesaPorId               → deleteExpenseById
abrirModalPagamentoPorId          → openPaymentModalById
moverParaProximoMesPorId          → moveToNextMonthById
abrirModalVisualizarAnexosDespesaPorId → openExpenseAttachmentsById
excluirApenasParcela              → deleteInstallmentOnly
excluirParcelaEFuturas            → deleteInstallmentAndFuture
excluirDespesa                    → deleteExpense
configurarModalExclusao           → setupDeleteModal
configurarBotoesExclusao          → setupDeleteButtons
configurarBotoesExclusaoSimples   → setupSimpleDeleteButtons
configurarBotoesExclusaoParcelada → setupInstallmentDeleteButtons
configurarBotoesExclusaoRecorrente → setupRecurringDeleteButtons
processarExclusao                 → processDelete
excluirDespesaLocal               → deleteExpenseLocal
excluirTodasParcelas              → deleteAllInstallments
excluirDespesaEmTodosMeses        → deleteExpenseAllMonths
excluirRecorrenteEFuturas         → deleteRecurringAndFuture
moverParaProximoMes               → moveToNextMonth
calcularProximoMes                → calcNextMonth
obterNomesMeses                   → getMonthNames
executarMovimentoDespesa          → executeExpenseMove
abrirModalPagamento               → openPaymentModal
preencherInfoDespesaPagamento     → fillPaymentInfo
calcularDiferencaPagamento        → calcPaymentDiff
configurarFormPagamento           → setupPaymentForm
_processarPagamentoDespesa        → _processExpensePayment
processarParcelasFuturas          → processFutureInstallments
pagarDespesasEmLote               → payExpensesBatch
configurarModalPagamentoLote      → setupBatchPaymentModal
configurarModalValoresPersonalizados → setupCustomValuesModal
processarValoresPersonalizados    → processCustomValues
processarPagamentoComData         → processPaymentWithDate
pagarLoteComValoresOriginais      → payBatchOriginalValues
obterOpcoesFormaPagamento         → getPaymentMethodOptions
criarFiltrosFormaPagamento        → createPaymentFilters
popularFiltroFormaPagamentoToolbar → populatePaymentFilterToolbar
obterCategoriasDoMes              → getMonthCategories
obterDespesaDaLinha               → getExpenseFromRow
limparFiltros                     → clearFilters
configurarEventoOrdenacao         → setupSortEvent
configurarEventoBotaoLimpar       → setupClearButton
aplicarOrdenacaoDespesas          → applyExpenseSort
obterValorDaColuna                → getColumnValue
compararDatas                     → compareDates
atualizarContadoresFiltro         → updateFilterCounters
calcularValorDespesaLinha         → calcRowValue
isParcelado                       → isInstallment
calcularJurosDespesa              → calcExpenseInterest
calcularEconomiaDespesa           → calcExpenseSavings
calcularTotalDespesas             → calcTotalExpenses
calcularTotalJuros                → calcTotalInterest
obterValorRealDespesa             → getRealExpenseValue
calcularTotalEconomias            → calcTotalSavings
calcularLimiteDisponivelCartao    → calcAvailableCardLimit
ativarAbasMes                     → activateMonthTabs
inicializarViewToggle             → initViewToggle
abrirModalNovaCategoriaInline     → openNewCategoryInline
toggleNovaCategoriaInline         → toggleInlineCategory
salvarCategoriaInline             → saveInlineCategory
inicializarCategoriaInline        → initInlineCategory
toggleTodasDespesas               → toggleAllExpenses
```

## Estratégia de implementação

1. Definir tipos locais: `ExpenseItem`, `CardFormData`, `DeletionResult`, `CardLimitResult`, `CardAttachment`, `BufferedArray<T>`
2. Declarar estado do módulo (buffers, observers, contadores, cardAnexosStore, cardCounter, valorOriginalDespesaPagamento)
3. Migrar utilitários (calcReplicatedDate, roundToTwo, helpers de data/valor)
4. Migrar inicialização de grids (initExpenseGridTable, initIncomeGridTable, _applyCompanyColumnVisibility)
5. Migrar renderização de receitas (renderIncomes, createIncomeGridRow, fillIncomeAttachmentCell)
6. Migrar eventos e filtros do grid (setupGridEvents, setupFilterEvents, applyToolbarFilters, clearToolbarFilters, updateExistingFilters)
7. Migrar renderização de despesas (_renderNextBatch, renderExpenses, createExpenseGridRow, fillGridCells + 12 fill* funcs, setupActionButtonsTemplate, setupExpenseEvents)
8. Migrar utilitários de busca e status (findExpenseById, findExpenseByIndex, updateExpenseStatuses, getCleanCategory, createStatusBadge, getStatusClass, getDisplayDates, updateBatchButton, fillAttachmentsCell)
9. Migrar sistema de cards (~32 funções: createCard → setupLaunchModalEvents)
10. Migrar salvamento via API (saveExpenseLocal, reloadMonthExpenses, cleanupAfterSave, updateAllInstallmentGroup, editExpense, editExpenseById, deleteExpenseById, openPaymentModalById, moveToNextMonthById, openExpenseAttachmentsById, deleteInstallmentOnly, deleteInstallmentAndFuture)
11. Migrar exclusão de despesas (deleteExpense → deleteRecurringAndFuture, 11 funções)
12. Migrar movimentação para próximo mês (moveToNextMonth, calcNextMonth, getMonthNames, executeExpenseMove)
13. Migrar pagamento individual (openPaymentModal → processFutureInstallments, 6 funções)
14. Migrar pagamento em lote (payExpensesBatch → payBatchOriginalValues, 6 funções)
15. Migrar filtros e ordenação (getPaymentMethodOptions → calcRowValue, 13 funções)
16. Migrar cálculos e totalizações (isInstallment → calcAvailableCardLimit, 8 funções)
17. Migrar abas, view toggle (activateMonthTabs, initViewToggle)
18. Migrar categoria inline (openNewCategoryInline → initInlineCategory, 4 funções) + toggleAllExpenses
19. Extrair column resizer IIFE → `initColumnResizer()` chamado no DOMContentLoaded
20. Extrair PDF import IIFE → `initPdfImport()` chamado no DOMContentLoaded
21. Window registrations block (~55 exports, preservando nomes PT)
22. Atualizar `src/types/globals.d.ts` com ~20 novas declarações
23. `npx tsc --noEmit` — zero erros obrigatório

## Regras de negócio identificadas

- Despesas de tipo `reserva` nunca aparecem na tabela do mês
- Ordenação padrão: ID decrescente (mais recente primeiro)
- Infinite scroll: lotes de 25 itens via IntersectionObserver
- Parcelamento: ao editar, atualiza todas as parcelas do grupo via `grupo_parcelamento_id`
- Recorrência: cria cópias nos próximos N meses (padrão 12 se `duracaoMeses = 0`)
- Limite de cartão: exclui despesas `recorrente`, `quitado` e `pago` do cálculo
- Pagamento em lote: um único re-render ao final (`skipRerender=true` por despesa)
- Exclusão de recorrente: busca até 3 anos à frente via API

## Regras multi-tenant e segurança

Sem impacto direto — este arquivo é 100% frontend, lê `perfil_id` de `window.getPerfilAtivo()` que já valida tenant. Requisições para a API incluem `Authorization: Bearer <token>`.

## Validações necessárias

- `validateCard`: descrição, categoria, forma de pagamento, cartão (se crédito), valor > 0, data compra, data vencimento
- `_processExpensePayment`: valorPago >= 0, estrutura do mês válida, despesa não já paga
- `saveExpenseLocal`: não executa replicação para edições, apenas para novas despesas recorrentes

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
```

## Riscos e pontos de atenção

1. **`_persistirFavorito` não definida em `despesas.js`** — chamada em `saveFavoriteCard`, vem de `configuracao.js` (ainda não migrado). Solução: declarar `window._persistirFavorito?: (catId: string, forma: string | null, cartaoId: number | null) => Promise<void>` em globals.d.ts e usar type guard.

2. **`NOMES_MESES` não declarado em `globals.d.ts`** — array de nomes de meses definido em `main.ts`. Solução: adicionar `NOMES_MESES?: string[]` ao Window interface.

3. **`_despesasBuffer._mes`/`._ano`/`._fechado` e `_receitasBuffer` com metadata** — TS não permite propriedades ad-hoc em arrays. Solução: criar `interface BufferedArray<T> extends Array<T> { _fechado?: boolean; _mes?: number; _ano?: number }`.

4. **`configurarEventosDespesas` adiciona `_despesasListener` ao `HTMLElement`** — cast necessário: `container as HTMLElement & { _despesasListener?: EventListener }`.

5. **`window.categoriasUsuario` tipado como `unknown[]`** — precisará de cast para `{ despesas: Category[]; receitas: Category[] }` nos locais de uso.

6. **Dois IIFEs com closure state** — column resizer (isResizing, currentTh, startX, startWidth) e PDF import (_transacoesExtrato) precisam encapsular estado em variáveis de módulo ou objetos internos da função.

7. **`dadosFinanceiros` acesso direto** — em muitos lugares sem `window.` prefix. Em TS usar `window.dadosFinanceiros` com cast para `FinancialStore` (mesmo tipo de main.ts).

## Perguntas em aberto

Nenhuma.

## Critérios de aceite do plano

- `src/expenses.ts` criado com todos os 20 módulos migrados
- Todos os nomes de funções em inglês
- Zero erros em `npx tsc --noEmit`
- Window registrations preservam nomes PT para compatibilidade
- `src/types/globals.d.ts` atualizado com todas as novas declarações

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Não executar migrations sem confirmação explícita
- Seguir `/AGENT.md`
- Padrão de window registration: `window.nomeEN = funcaoEN as unknown as typeof window.nomeEN`
- Padrão para calls opcionais: `if (typeof window.fn === 'function') window.fn(...)`
- `getToken()` importar de `./utils` (já exportado)
- `formatCurrency` importar de `./utils` e usar como `formatarMoeda` internamente
- `formatDate` importar de `./utils` e usar como `formatarData` internamente
- Manter `as unknown as T` para conversões de tipo incompatíveis
- `BufferedArray<T>` deve ser definida localmente, não em globals.d.ts

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
