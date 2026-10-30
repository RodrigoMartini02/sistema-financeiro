import { useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Cartao, Categoria } from '../../../types/config';
import type { Expense, ExpenseUpdateScope, FinanceDashboardData } from '../../../types/finance';
import { useConfirm } from '../../../context/ConfirmContext';
import { useOwnPermissions } from '../../../hooks/useOwnPermissions';
import { getActiveAccountId } from '../../../services/apiClient';
import { fetchCardLimits } from '../../../services/cardLimitsService';
import { fetchCartoes, fetchCategorias, saveCategoria } from '../../../services/configService';
import { createExpense, fetchExpenseGroup, updateExpense } from '../../../services/financeService';
import { invalidateExpenseQueries, queryKeys } from '../../../services/queryKeys';
import { C, chipStyle, neutralOutlineButtonStyle, saveButtonStyle } from '../../../ui/dialogFormTokens';
import { confirmFixedExpense, createFixedExpense } from '../../../services/fixedExpensesService';
import { INVOICE_MESSAGES, invoiceEditLock, payInvoiceShortcut } from '../../../utils/cardInvoice';
import {
  cashPriceInterestNote, cashPriceInterestPreview, installmentScopeRows, openFollowingOccurrences, paidInstallmentsNote,
  seriesValueImpact, seriesValueNotes,
} from '../../../utils/expenseSeries';
import { embeddedInstallmentInterest } from '../../../utils/expenseValue';
import {
  MAX_INSTALLMENT_COUNT, canBecomeInstallments, installmentCountNotes, minimumInstallmentCount, previewInstallmentCount,
  previewSingleInstallments, purchaseInstallmentCount, reductionBlock, singleInstallmentsNotes,
} from '../../../utils/installmentCount';
import {
  createdCategoryId, getRecentCategoryIds, newCategoryFormValues, type NewCategoryRequest,
} from '../../../utils/categorySuggestions';
import { getLocalTodayIso, isoToBrDate } from '../../../utils/date';
import { canManageCatalog } from '../../../utils/screenAccess';
import { collectBatchErrors, saveInOrder } from '../entry-dialog/batchState';
import { EntryDialogFrame, type FooterTone } from '../entry-dialog/EntryDialogFrame';
import { HEADER_GRID_CLASS } from '../entry-dialog/fieldStyles';
import { RequiredMark, columnHeaderStyle } from '../entry-dialog/GridParts';
import { toReais } from '../entry-dialog/cents';
import { MoneyCell } from '../entry-dialog/MoneyCell';
import { duplicateText } from '../entry-dialog/SummaryLine';
import {
  EMPTY_FORM_MESSAGE, billingLockReason, buildCreateInput, buildUpdateInput, cardForMethod, effectiveDueDate, errorMessage, hasErrors,
  installmentsTotal, isDraftFilled, usesCard, validateDraft, type RuleContext,
} from './draftRules';
import {
  createDraft, dialogReducer, draftFromExpense, initialDialogState,
  type DialogAction, type DraftErrors, type DraftPatch, type ExpenseDraft,
} from './draftState';
import { ExpenseRow, amountLabel, type RowResources } from './ExpenseRow';
import { InstallmentCountField } from './InstallmentCountField';
import { BATCH_GRID_CLASS, ENTRY_GRID_CLASS } from './expenseGrid';
import { PaymentMethodPopover, cardLimitText } from './PaymentMethodPopover';
import { useExpenseSuggestions, type DraftSuggestions } from './useExpenseSuggestions';
import { FixedExpensesSection } from './FixedExpensesSection';
import { FixedExpenseManager } from './FixedExpenseManager';
import { buildFixedExpenseInput, canCreateFixedFromExpense, initialFixedMonth, isFixedMonth } from './fixedExpenseDrafts';

const TOAST_DURATION_MS = 2800;
const EXPENSE_NOUN = { singular: 'despesa', plural: 'despesas' };

/** Alcance da edição de uma parcela, na ordem do modal (plano .plans/recorrente-editar-proximas.md). */
const INSTALLMENT_SCOPE_OPTIONS: Array<{ scope: ExpenseUpdateScope; label: string }> = [
  { scope: 'this', label: 'Só esta' },
  { scope: 'following', label: 'Esta e as próximas' },
  { scope: 'all', label: 'Todas' },
];

interface ExpenseDialogProps {
  open: boolean;
  /** Despesa a editar; sem ela, o modal lança despesas novas. */
  expense?: Expense | null;
  /** Dia clicado no calendário (ISO): vira a data da compra, travada na linha de entrada. */
  presetDate?: string;
  /** Mês consultado na tela de origem, independente da data da compra. */
  initialMonth?: string;
  onClose: () => void;
  /**
   * Edição de uma despesa no crédito com cartão: o atalho "Pagar fatura". Quem abriu
   * o modal (a tela que tem o `InvoicePaymentModal`) fecha este e abre o da fatura,
   * no mês e no cartão informados. Sem a função, o atalho não aparece.
   */
  onPayInvoice?: (target: { invoiceMonth: string; cardId: number }) => void;
}

/**
 * Modal de despesa. Numa despesa nova: a linha de entrada, o lote e a barra
 * "Lançando em"; grava uma despesa por vez e continua aberto. Na edição: uma
 * linha só, e fecha ao salvar. Cada abertura começa do zero (o lote não
 * sobrevive ao fechar).
 */
export function ExpenseDialog({ open, expense, presetDate, initialMonth, onClose, onPayInvoice }: ExpenseDialogProps) {
  if (!open) return null;
  return (
    <ExpenseDialogContent
      key={`${expense?.id ?? 'new'}:${getActiveAccountId() ?? 'none'}`}
      expense={expense ?? null}
      presetDate={presetDate}
      initialMonth={initialMonth}
      onClose={onClose}
      onPayInvoice={onPayInvoice}
    />
  );
}

/** Enquanto a pessoa não mexe na forma, ela segue a sugestão do histórico (pela categoria, se houver). */
function useSuggestedPayment(
  draft: ExpenseDraft | null,
  { suggestions }: DraftSuggestions,
  cards: Cartao[],
  dispatch: Dispatch<DialogAction>,
) {
  const key = draft?.key;
  const untouched = draft !== null && !draft.paymentMethodTouched;
  const method = draft?.paymentMethod;
  const cardId = draft?.cardId ?? null;
  const suggested = suggestions?.suggestedPaymentMethod ?? null;
  const preferredCardIds = suggestions?.preferredCardIds;

  useEffect(() => {
    if (key === undefined || !untouched || !method) return;
    const nextMethod = suggested ?? method;
    const preferred = usesCard(nextMethod) ? preferredCardIds?.[nextMethod] ?? null : null;
    const nextCardId = cardForMethod(cards, nextMethod, cardId, preferred);
    if (nextMethod !== method || nextCardId !== cardId) {
      dispatch({ type: 'applySuggestion', key, patch: { paymentMethod: nextMethod, cardId: nextCardId } });
    }
  }, [key, untouched, method, cardId, suggested, preferredCardIds, cards, dispatch]);
}

interface ExpenseDialogContentProps {
  expense: Expense | null;
  presetDate?: string;
  initialMonth?: string;
  onClose: () => void;
  onPayInvoice?: ExpenseDialogProps['onPayInvoice'];
}

function ExpenseDialogContent({ expense, presetDate, initialMonth, onClose, onPayInvoice }: ExpenseDialogContentProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const todayIso = useMemo(() => getLocalTodayIso(), []);
  const [dialogAccountId] = useState(() => getActiveAccountId());
  const isEdit = expense !== null;
  const isForecast = expense?.status === 'prevista';
  const [fixedOpened, setFixedOpened] = useState(false);
  const [fixedVisible, setFixedVisible] = useState(false);
  const [fixedBusy, setFixedBusy] = useState(false);
  const [managerOpened, setManagerOpened] = useState(false);
  const [convertingToFixed, setConvertingToFixed] = useState(false);
  const [firstMonth, setFirstMonth] = useState(() => initialFixedMonth(initialMonth, expense?.dataVencimento ?? presetDate, todayIso));
  const pendingMonth = initialFixedMonth(initialMonth, presetDate, todayIso);
  const isCompany = localStorage.getItem('contaAtivaTipo') === 'empresa';
  const descriptionRef = useRef<HTMLInputElement>(null);

  const [state, dispatch] = useReducer(dialogReducer, null, () => initialDialogState(expense
    ? draftFromExpense(expense)
    : createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: isoToBrDate(presetDate ?? todayIso), purchaseDateTouched: !!presetDate, paymentMethodTouched: false })));

  const permissions = useOwnPermissions() ?? {};
  const categoriesQuery = useQuery({ queryKey: queryKeys.categorias(), queryFn: () => fetchCategorias() });
  const cardsQuery = useQuery({ queryKey: queryKeys.cartoes(undefined, 'familia'), queryFn: () => fetchCartoes(undefined, 'familia') });
  const limitsQuery = useQuery({ queryKey: queryKeys.cardLimits(undefined, 'familia'), queryFn: () => fetchCardLimits('familia'), staleTime: 60_000 });
  // Série da despesa em edição (mensal ou parcelado): quantas linhas a edição
  // também muda. O salvamento não depende dela; sem a lista, só some a contagem.
  const seriesGroupId = expense && (expense.recorrente || expense.parcelado) ? expense.grupoParcelamentoId ?? null : null;
  const seriesQuery = useQuery({
    queryKey: queryKeys.expenseGroup(seriesGroupId ?? -1),
    queryFn: () => fetchExpenseGroup(seriesGroupId!),
    enabled: seriesGroupId !== null,
  });
  const isInstallmentSeries = expense?.parcelado === true && seriesGroupId !== null;
  const [installmentScope, setInstallmentScope] = useState<ExpenseUpdateScope>('this');
  // O "À vista" da edição da parcelada: refaz o juros das parcelas abertas (só com "Todas"). Vazio não mexe no juros.
  const [seriesCashPriceCents, setSeriesCashPriceCents] = useState<number | null>(null);
  // Novo nº de parcelas na edição (nulo não muda). Na parcelada, o total da compra (só com "Todas"); na despesa única
  // em aberto, em quantas parcelas ela vira (1 = continua única).
  const [nextInstallmentCount, setNextInstallmentCount] = useState<number | null>(null);

  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((category) => category.ativo), [categoriesQuery.data]);
  // Na edição, o cartão da despesa continua na lista mesmo que hoje não esteja mais liberado.
  const cards = useMemo(() => {
    const active = (cardsQuery.data ?? []).filter((card) => card.ativo);
    if (expense?.cartaoId && !active.some((card) => card.id === expense.cartaoId)) {
      active.push({ id: expense.cartaoId, nome: expense.cartaoNome ?? 'Cartão atual', ativo: true, tipo: null });
    }
    return active;
  }, [cardsQuery.data, expense]);

  const context: RuleContext = useMemo(() => ({
    todayIso,
    cards,
    savedDueDate: expense?.dataVencimento,
    editing: expense !== null,
    forecast: isForecast,
    savedInterest: expense ? embeddedInstallmentInterest(expense) : null,
  }), [todayIso, cards, expense, isForecast]);

  // Histórico já carregado pelas telas (todos os meses em cache), para "Recentes" e a sugestão de categoria.
  const categoryHistory = useMemo(() => {
    const byId = new Map<number, Expense>();
    qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] })
      .forEach(([, data]) => data?.expenses.forEach((item) => byId.set(item.id, item)));
    return [...byId.values()].map((item) => ({ description: item.descricao, categoryId: item.categoriaId }));
  }, [qc]);
  const recentCategoryIds = useMemo(() => getRecentCategoryIds(categoryHistory, categories), [categoryHistory, categories]);

  const activeBatchDraft = state.batch.find((draft) => draft.key === state.activeKey) ?? null;
  const entrySuggestions = useExpenseSuggestions(state.entry, expense?.id ?? null);
  const activeSuggestions = useExpenseSuggestions(activeBatchDraft, null);
  useSuggestedPayment(state.entry, entrySuggestions, cards, dispatch);
  useSuggestedPayment(activeBatchDraft, activeSuggestions, cards, dispatch);

  // Linha de entrada nova (ao abrir, depois de adicionar ao lote e depois de salvar): foco na descrição.
  useEffect(() => {
    descriptionRef.current?.focus();
  }, [state.entry.key]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => dispatch({ type: 'toastExpired' }), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state.toast]);

  const createCategory = async (request: NewCategoryRequest): Promise<number> => {
    const { subcategories = [], ...created } = await saveCategoria(newCategoryFormValues(request));
    qc.setQueryData<Categoria[]>(queryKeys.categorias(), (current) => [...(current ?? []), created, ...subcategories]);
    void qc.invalidateQueries({ queryKey: ['categorias'] });
    return createdCategoryId(request, { ...created, subcategories });
  };

  const resources: RowResources = {
    context,
    categories,
    recentCategoryIds,
    categoryHistory,
    cardLimits: limitsQuery.data ?? [],
    isCompany,
    lockPurchaseDate: !isEdit && !!presetDate,
    createCategory: canManageCatalog(permissions, 'expenseCategories') ? createCategory : undefined,
  };

  const nextEntry = (from: ExpenseDraft) => createDraft({
    paymentMethod: from.paymentMethod,
    cardId: from.cardId,
    purchaseDate: from.purchaseDate,
    purchaseDateTouched: from.purchaseDateTouched,
    paymentMethodTouched: true,
  });

  const requestClose = () => {
    if (!state.saving && !fixedBusy) onClose();
  };

  const addToBatch = () => {
    if (isEdit || state.saving || fixedBusy) return;
    if (state.entry.billingType === 'fixed') {
      dispatch({ type: 'showErrors', errors: {}, message: 'Use “Salvar despesa fixa” para gerar as previsões. O lote de despesas comuns será preservado.' });
      return;
    }
    const errors = validateDraft(state.entry, context);
    if (hasErrors(errors)) {
      dispatch({ type: 'showErrors', errors: { ...state.errors, [state.entry.key]: errors }, message: errorMessage(errors) });
      return;
    }
    dispatch({ type: 'moveEntryToBatch', nextEntry: nextEntry(state.entry) });
  };

  const saveEdit = async (target: Expense) => {
    const errors = validateDraft(state.entry, context);
    if (hasErrors(errors)) {
      dispatch({ type: 'showErrors', errors: { [state.entry.key]: errors }, message: errorMessage(errors) });
      return;
    }
    // Reduzir o nº de parcelas apaga parcelas abertas: só com a confirmação da pessoa.
    if (countPreview?.kind === 'delete'
      && !(await confirm({
        title: 'Apagar parcelas?',
        message: installmentCountNotes(countPreview, entryAmount ?? 0, null).join(' '),
        confirmLabel: 'Apagar e salvar',
        variant: 'danger',
      }))) {
      return;
    }
    dispatch({ type: 'savingStarted', total: 1 });
    try {
      // No mensal, o servidor sempre leva a edição às próximas; no parcelado, vai o alcance escolhido.
      // O "À vista" e o nº de parcelas só vão com "Todas": são da compra inteira.
      await updateExpense(target.id, {
        ...buildUpdateInput(state.entry, context),
        ...(isInstallmentSeries ? { applyTo: installmentScope } : {}),
        ...(isInstallmentSeries && installmentScope === 'all' && seriesCashPriceCents !== null
          ? { cashPrice: toReais(seriesCashPriceCents) }
          : {}),
        ...(installmentCountToSend !== null ? { installmentCount: installmentCountToSend } : {}),
      });
      invalidateExpenseQueries(qc);
      onClose();
    } catch (error) {
      dispatch({ type: 'savingFailed', message: error instanceof Error ? error.message : 'Não foi possível salvar a despesa.' });
    }
  };

  const saveFixed = async () => {
    if (state.saving || fixedBusy) return;
    if (getActiveAccountId() !== dialogAccountId) {
      dispatch({ type: 'showErrors', errors: {}, message: 'A conta mudou. Feche e abra novamente o lançamento.' });
      return;
    }
    const errors = validateDraft(state.entry, { ...context, editing: true });
    if (hasErrors(errors) || !isFixedMonth(firstMonth) || getActiveAccountId() === null) {
      dispatch({ type: 'showErrors', errors: { [state.entry.key]: errors }, message: hasErrors(errors)
        ? errorMessage(errors) : getActiveAccountId() === null ? 'Selecione uma conta para cadastrar a fixa.' : 'Informe o mês inicial das previsões.' });
      return;
    }
    dispatch({ type: 'savingStarted', total: 1 });
    try {
      await createFixedExpense(buildFixedExpenseInput(state.entry, context, getActiveAccountId(), firstMonth, convertingToFixed ? expense?.id : undefined));
      invalidateExpenseQueries(qc);
      if (convertingToFixed) {
        onClose();
      } else {
        dispatch({ type: 'draftSaved', key: state.entry.key, nextEntry: nextEntry(state.entry) });
        dispatch({ type: 'savingFinished', toast: '✓ Despesa fixa salva. As previsões aguardam confirmação.' });
      }
    } catch (cause) {
      dispatch({ type: 'savingFailed', message: cause instanceof Error ? cause.message : 'Não foi possível salvar a despesa fixa.' });
    }
  };

  const confirmEditedForecast = async () => {
    if (!expense || !isForecast || state.saving || fixedBusy) return;
    if (getActiveAccountId() !== dialogAccountId) {
      dispatch({ type: 'showErrors', errors: {}, message: 'A conta mudou. Feche e abra novamente a previsão.' });
      return;
    }
    const errors = validateDraft(state.entry, context);
    if (hasErrors(errors)) { dispatch({ type: 'showErrors', errors: { [state.entry.key]: errors }, message: errorMessage(errors) }); return; }
    dispatch({ type: 'savingStarted', total: 1 });
    try {
      await confirmFixedExpense(expense.id, buildUpdateInput(state.entry, context));
      invalidateExpenseQueries(qc);
      onClose();
    } catch (cause) {
      dispatch({ type: 'savingFailed', message: cause instanceof Error ? cause.message : 'Não foi possível confirmar a previsão.' });
    }
  };

  const saveNew = async () => {
    if (state.entry.billingType === 'fixed') { await saveFixed(); return; }
    const entryFilled = isDraftFilled(state.entry);
    const items = entryFilled ? [...state.batch, state.entry] : state.batch;
    if (items.length === 0) {
      dispatch({ type: 'showErrors', errors: { [state.entry.key]: validateDraft(state.entry, context) }, message: EMPTY_FORM_MESSAGE });
      return;
    }
    const { errors, message } = collectBatchErrors<ExpenseDraft, DraftErrors>({
      batch: state.batch,
      entry: entryFilled ? state.entry : null,
      validate: (draft) => validateDraft(draft, context),
      hasErrors,
      describe: errorMessage,
      itemLabel: 'Despesa',
    });
    if (message) {
      dispatch({ type: 'showErrors', errors, message });
      return;
    }

    const accountId = getActiveAccountId();
    const result = await saveInOrder<ExpenseDraft, DraftErrors>({
      items,
      entryKey: state.entry.key,
      nextEntry: nextEntry(state.entry),
      save: (draft) => createExpense(buildCreateInput(draft, context, accountId)),
      dispatch,
      itemLabel: 'Despesa',
      fallbackMessage: 'Não foi possível registrar a despesa.',
    });
    if (result.saved > 0) invalidateExpenseQueries(qc);
    if (!result.failed) {
      dispatch({ type: 'savingFinished', toast: items.length > 1 ? `✓ ${items.length} despesas registradas` : '✓ Despesa registrada' });
    }
  };

  const save = () => {
    if (state.saving || fixedBusy) return;
    if (getActiveAccountId() !== dialogAccountId) {
      dispatch({ type: 'showErrors', errors: {}, message: 'A conta mudou. Feche e abra novamente o lançamento.' });
      return;
    }
    void (convertingToFixed ? saveFixed() : expense ? saveEdit(expense) : saveNew());
  };

  const rowHandlers = (key: number) => ({
    onUpdate: (patch: DraftPatch) => dispatch({ type: 'update', key, patch }),
    onSetInstallmentCount: (count: number, force: boolean) => dispatch({ type: 'setInstallmentCount', key, count, force }),
    onCancelInstallmentCount: () => dispatch({ type: 'cancelInstallmentCount' }),
    onFocus: () => dispatch({ type: 'setActive', key }),
  });
  const pendingCountFor = (key: number) => (state.pendingInstallmentCount?.key === key ? state.pendingInstallmentCount.count : null);

  const entry = state.entry;
  let displayedEntry = entry;
  let fixedDateError = '';
  if (entry.billingType === 'fixed' && !isEdit) {
    try {
      const preview = buildFixedExpenseInput(entry, context, dialogAccountId, firstMonth);
      displayedEntry = {
        ...entry,
        purchaseDate: isoToBrDate(preview.purchaseDate),
        dueDate: entry.dueDate || isoToBrDate(preview.dueDate),
      };
    } catch (cause) {
      fixedDateError = cause instanceof Error ? cause.message : 'Confira as datas da primeira previsão.';
    }
  }
  const entryInstallments = entry.billingType === 'installments';
  const entryFilled = isDraftFilled(entry);
  const toSaveCount = isEdit ? 1 : state.batch.length + (entryFilled ? 1 : 0);
  const entryDuplicate = entrySuggestions.duplicateCreatedAt ? duplicateText(entrySuggestions.duplicateCreatedAt) : null;
  const entryLimit = cardLimitText(entry, cards, resources.cardLimits);

  // Despesa ligada à fatura do cartão: a edição não mexe no que a fatura define.
  const lock = expense && !convertingToFixed && !isForecast ? invoiceEditLock(expense) : null;
  const invoiceLock = lock === null ? undefined : {
    reason: lock === 'credit-payment' ? INVOICE_MESSAGES.creditPayment : INVOICE_MESSAGES.lockedRow,
    locksValueAndMethod: lock !== 'credit-payment',
    locksDueDate: lock === 'invoice-item',
  };

  // No crédito com cartão o pagamento é pela fatura: o atalho abre o "Pagar fatura" no mês e no cartão da despesa.
  const invoiceShortcut = expense && !isForecast && !convertingToFixed && onPayInvoice ? payInvoiceShortcut(expense) : null;
  const payInvoiceAction = invoiceShortcut && onPayInvoice ? {
    label: invoiceShortcut.label,
    title: 'Fecha esta edição e abre o pagamento da fatura. O que não foi salvo aqui se perde.',
    onClick: () => {
      if (state.saving) return;
      onPayInvoice({ invoiceMonth: invoiceShortcut.invoiceMonth, cardId: invoiceShortcut.cardId });
    },
  } : null;

  let footerMessage = '';
  let footerTone: FooterTone = 'neutral';
  if (state.footerError) {
    footerMessage = state.footerError;
    footerTone = 'danger';
  } else if (fixedDateError) {
    footerMessage = fixedDateError;
    footerTone = 'danger';
  } else if (entry.billingType === 'fixed' || convertingToFixed) {
    footerMessage = convertingToFixed ? 'A despesa atual será preservada. As próximas ocorrências serão previstas até dezembro.' : 'Gera previsões até dezembro. Cada conta será confirmada quando você souber o valor.';
  } else if (isForecast) {
    footerMessage = 'Salvar alterações mantém a previsão. Use “Confirmar despesa” quando souber o valor da conta.';
  } else if (lock === 'invoice-item') {
    footerMessage = 'Paga pela fatura do cartão: valor, forma, cartão, vencimento e pagamento só mudam desfazendo o pagamento da fatura.';
  } else if (lock === 'generated') {
    footerMessage = 'Gerada pelo pagamento da fatura: valor, forma, cartão e pagamento só mudam desfazendo aquele pagamento.';
  } else if (lock === 'credit-payment') {
    footerMessage = 'No crédito com cartão, o pagamento é feito pela fatura ("Pagar fatura").';
  } else if (entryDuplicate) {
    footerMessage = entryDuplicate;
    footerTone = 'warning';
  } else if (!isEdit && toSaveCount === 0) {
    footerMessage = EMPTY_FORM_MESSAGE;
  } else if (state.batch.length > 0) {
    footerMessage = entryFilled ? 'A linha de cima também entra ao salvar.' : 'Revise o lote e salve.';
  } else if (!isEdit) {
    footerMessage = 'Enter registra · Shift+Enter adiciona ao lote';
  } else if (expense) {
    footerMessage = billingLockReason(expense);
  }

  const series = seriesQuery.data;
  const followingCount = expense && series ? openFollowingOccurrences(series, expense).length : 0;
  // A parcela editada entra na conta de cada alcance.
  const scopeCounts = expense && series && isInstallmentSeries
    ? {
        following: installmentScopeRows(series, expense, 'following').length + 1,
        all: installmentScopeRows(series, expense, 'all').length + 1,
      }
    : null;

  // As parcelas pagas do alcance escolhido: o servidor não muda o vencimento, a forma nem o cartão delas.
  const paidScopeNote = expense && series && isInstallmentSeries && installmentScope !== 'this'
    ? paidInstallmentsNote(installmentScopeRows(series, expense, installmentScope))
    : null;

  // O que o valor novo faz na série (total, pagas atingidas, limite do cartão) e a prévia do juros do "À vista".
  const entryAmount = state.entry.amountCents !== null ? state.entry.amountCents / 100 : null;
  const creditCard = state.entry.paymentMethod === 'credito' && state.entry.cardId !== null
    ? cards.find((card) => card.id === state.entry.cardId) ?? null
    : null;
  // Nº de parcelas: a parcelada ("Todas") muda o total da compra; a despesa única em aberto pode virar parcelada.
  const countEditable = expense !== null && series !== undefined && isInstallmentSeries && installmentScope === 'all' && lock !== 'generated';
  const countToday = expense && series && isInstallmentSeries ? purchaseInstallmentCount(series, expense) : null;
  const countMinimum = expense && series && isInstallmentSeries ? minimumInstallmentCount(series, expense) : 2;
  const countBlock = expense && series && isInstallmentSeries ? reductionBlock(series, expense) : null;
  const countShown = nextInstallmentCount ?? countToday ?? 2;
  const countPreview = countEditable && series && expense && entryAmount !== null && nextInstallmentCount !== null
    ? previewInstallmentCount(series, expense, nextInstallmentCount, entryAmount)
    : null;
  // A despesa ligada à fatura (paga por ela ou gerada por ela) já fica de fora em canBecomeInstallments; no crédito com cartão ela pode virar parcelada.
  const canSplitSingle = expense !== null && !expense.fixedExpenseId && !convertingToFixed && !isForecast && canBecomeInstallments(expense);
  const splitPreview = canSplitSingle && nextInstallmentCount !== null && entryAmount !== null
    ? previewSingleInstallments(effectiveDueDate(state.entry, context).date, nextInstallmentCount, entryAmount)
    : null;
  const installmentCountToSend = isInstallmentSeries ? (countPreview ? nextInstallmentCount : null) : (splitPreview ? nextInstallmentCount : null);
  const countCard = creditCard ? { name: creditCard.nome } : null;

  const valueNotes = expense && series && isInstallmentSeries && installmentScope !== 'this' && entryAmount !== null
    ? seriesValueNotesFor(seriesValueImpact(series, expense, installmentScope, entryAmount), countPreview ? null : creditCard)
    : [];
  const cashPriceNote = expense && series && isInstallmentSeries && installmentScope === 'all' && entryAmount !== null && seriesCashPriceCents !== null
    ? cashPriceInterestNote(cashPriceInterestPreview(series, expense, entryAmount, seriesCashPriceCents))
    : null;

  const recurringLabel = followingCount > 0 ? `Mensal · também nas próximas ${followingCount}` : 'Mensal';
  const editBillingLabel = convertingToFixed ? 'Fixa' : expense?.fixedExpenseId ? 'Fixa' : expense
    ? expense.parcelado && expense.parcela
      ? `Parcela ${expense.parcela}`
      : expense.recorrente ? recurringLabel : splitPreview ? `Parcelada em ${splitPreview.count}x` : 'Não repete'
    : undefined;

  const top = (
    <>
      {!isEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '0 8px 12px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.chipOffText }}>Lançando em</span>
          <PaymentMethodPopover
            variant="bar"
            draft={entry}
            cards={cards}
            cardLimits={resources.cardLimits}
            preferredCardIds={entrySuggestions.suggestions?.preferredCardIds ?? { debito: null, credito: null }}
            cardInvalid={!!state.errors[entry.key]?.card}
            onChange={(choice) => dispatch({ type: 'update', key: entry.key, patch: choice })}
          />
          {entryLimit && <span style={{ fontSize: 12, color: C.textSoft }}>{entryLimit}</span>}
          <button
            type="button" style={neutralOutlineButtonStyle} aria-expanded={fixedVisible} disabled={state.saving !== null || fixedBusy}
            onClick={() => { setFixedOpened(true); setFixedVisible((value) => !value); }}
          >
            ☆ Despesas fixas
          </button>
        </div>
      )}

      {isEdit && (
        <div data-independent-save className="flex flex-wrap items-center gap-2 px-2 pb-3">
          {isForecast && <button type="button" disabled={state.saving !== null || fixedBusy} style={saveButtonStyle} onClick={() => void confirmEditedForecast()}>Confirmar despesa</button>}
          {expense?.fixedExpenseId && <button type="button" disabled={state.saving !== null || fixedBusy} style={neutralOutlineButtonStyle} aria-expanded={managerOpened} onClick={() => setManagerOpened((value) => !value)}>Gerenciar fixa</button>}
          {expense && canCreateFixedFromExpense(expense) && <button type="button" disabled={state.saving !== null || fixedBusy} style={neutralOutlineButtonStyle} onClick={() => {
            setConvertingToFixed((value) => !value);
            setFirstMonth(expense.dataVencimento.slice(0, 7));
            setNextInstallmentCount(null);
          }}>{convertingToFixed ? 'Cancelar criação da fixa' : 'Tornar despesa fixa'}</button>}
        </div>
      )}

      {isEdit ? (
        <div className={`${HEADER_GRID_CLASS} ${BATCH_GRID_CLASS}`} style={{ ...columnHeaderStyle, padding: '0 8px 6px' }}>
          <span>Descrição <RequiredMark /></span><span>Categoria <RequiredMark /></span><span>Pagamento</span><span>Cobrança</span>
          <span>Valor <RequiredMark /></span><span>Compra</span><span>Vencimento</span><span style={{ paddingLeft: 9 }}>Pago em</span>
          <span>Valor pago</span><span /><span />
        </div>
      ) : (
        <div className={`${HEADER_GRID_CLASS} ${ENTRY_GRID_CLASS}`} style={{ ...columnHeaderStyle, padding: '0 8px 6px' }}>
          <span>Descrição <RequiredMark /></span><span>Categoria <RequiredMark /></span><span>Cobrança</span>
          <span>{amountLabel(entry)} <RequiredMark /></span><span>Compra</span><span>{entryInstallments ? '1ª vence' : 'Vencimento'}</span>
          {entryInstallments
            ? <span className="lg:col-span-2" style={{ paddingLeft: 9 }}>Pagamento das parcelas</span>
            : <><span style={{ paddingLeft: 9 }}>Pago em</span><span>Valor pago</span></>}
          <span /><span />
        </div>
      )}

      {/* A chave recria a linha a cada despesa nova: nenhum campo guarda o
          texto da anterior (o valor digitado seria gravado ao sair do campo). */}
      <ExpenseRow
        key={entry.key}
        draft={displayedEntry}
        variant={isEdit ? 'edit' : 'entry'}
        resources={resources}
        errors={state.errors[entry.key]}
        showSummary
        suggestions={entrySuggestions}
        readOnlyBilling={editBillingLabel}
        readOnlyBillingReason={expense ? billingLockReason(expense) : undefined}
        invoiceLock={invoiceLock}
        hidePayment={isForecast || convertingToFixed}
        payInvoiceAction={payInvoiceAction}
        creditOnlyPayment={expense?.recorrente === true}
        pendingInstallmentCount={pendingCountFor(entry.key)}
        descriptionRef={descriptionRef}
        onAddToBatch={addToBatch}
        {...rowHandlers(entry.key)}
      />

      {(entry.billingType === 'fixed' || convertingToFixed) && (
        <div data-independent-save className="flex flex-wrap items-center gap-3 px-2 pt-3 text-xs text-slate-500">
          <label className="flex items-center gap-2 font-medium text-slate-600 dark:text-slate-300">
            {convertingToFixed ? 'Mês da despesa atual' : 'Primeiro mês'}
            <input type="month" min="2000-01" max="2100-12" aria-label="Primeiro mês da despesa fixa" value={firstMonth} disabled={convertingToFixed || state.saving !== null}
              onChange={(event) => { if (isFixedMonth(event.target.value)) setFirstMonth(event.target.value); }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <span>{convertingToFixed ? 'Mantém esta despesa e gera somente os meses seguintes.' : `Gera previsões de ${firstMonth.slice(5)}/${firstMonth.slice(0, 4)} até dezembro.`}</span>
          {!convertingToFixed && <span>As datas são da primeira previsão. Datas automáticas anteriores ao mês inicial serão avançadas; as datas informadas serão preservadas.</span>}
        </div>
      )}

      {canSplitSingle && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 8px 0' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.chipOffText }}>Parcelar em</span>
            <InstallmentCountField
              label="Parcelar a despesa em quantas parcelas"
              value={nextInstallmentCount ?? 1}
              min={1}
              max={MAX_INSTALLMENT_COUNT}
              disabled={state.saving !== null}
              onChange={(count) => setNextInstallmentCount(count <= 1 ? null : count)}
            />
            <span style={{ fontSize: 12, color: C.textFaint }}>
              {nextInstallmentCount === null ? 'Em 1, a despesa continua única.' : 'parcelas, uma por mês.'}
            </span>
          </div>
          {splitPreview && singleInstallmentsNotes(splitPreview, entryAmount ?? 0, countCard).map((note) => (
            <p key={note} style={{ margin: 0, padding: '6px 8px 0', fontSize: 12, color: C.textSoft }}>{note}</p>
          ))}
        </>
      )}

      {isInstallmentSeries && (
        <>
          <div
            role="radiogroup"
            aria-label="Aplicar a edição a"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 8px 0' }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: C.chipOffText }}>Aplicar a</span>
            {INSTALLMENT_SCOPE_OPTIONS.map(({ scope, label }) => {
              const count = scope === 'this' ? null : scopeCounts?.[scope] ?? null;
              return (
                <button
                  key={scope}
                  type="button"
                  role="radio"
                  aria-checked={installmentScope === scope}
                  disabled={state.saving !== null}
                  onClick={() => setInstallmentScope(scope)}
                  style={chipStyle(installmentScope === scope, { h: 30 })}
                >
                  {label}{count !== null ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
          {paidScopeNote && <p style={{ margin: 0, padding: '6px 8px 0', fontSize: 12, color: C.textSoft }}>{paidScopeNote}</p>}
          {valueNotes.map((note) => (
            <p key={note} style={{ margin: 0, padding: '6px 8px 0', fontSize: 12, color: C.textSoft }}>{note}</p>
          ))}
          {installmentScope === 'all' && (
            <>
              {countEditable && (
                <>
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 8px 0' }}
                    title="Só entram ou saem parcelas em aberto: as pagas e as da fatura do cartão ficam."
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.chipOffText }}>Parcelas</span>
                    <InstallmentCountField
                      label="Número de parcelas da compra"
                      value={countShown}
                      min={countMinimum}
                      max={MAX_INSTALLMENT_COUNT}
                      disabled={state.saving !== null}
                      onChange={(count) => setNextInstallmentCount(count === countToday ? null : count)}
                    />
                    <span style={{ fontSize: 12, color: C.textFaint }}>
                      {countBlock && countShown <= countBlock.minimum
                        ? `Mínimo ${countBlock.minimum}: a parcela ${countBlock.minimum} ${countBlock.reason}.`
                        : 'Só entram ou saem parcelas em aberto.'}
                    </span>
                  </div>
                  {countPreview && entryAmount !== null && installmentCountNotes(countPreview, entryAmount, countCard).map((note) => (
                    <p key={note} style={{ margin: 0, padding: '6px 8px 0', fontSize: 12, color: C.textSoft }}>{note}</p>
                  ))}
                </>
              )}
              <div
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 8px 0' }}
                title="Valor sem juros. O que a soma das parcelas passa dele vira o juros das parcelas abertas."
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: C.chipOffText }}>
                  À vista <span style={{ fontWeight: 400, color: C.textFaint }}>(opcional)</span>
                </span>
                <div style={{ width: 120 }}>
                  <MoneyCell
                    label="Valor à vista"
                    valueCents={seriesCashPriceCents}
                    onChange={setSeriesCashPriceCents}
                    disabled={state.saving !== null}
                  />
                </div>
                <span style={{ fontSize: 12, color: C.textFaint }}>Em branco, o juros das parcelas não muda.</span>
              </div>
              {cashPriceNote && <p style={{ margin: 0, padding: '6px 8px 0', fontSize: 12, color: C.textSoft }}>{cashPriceNote}</p>}
            </>
          )}
        </>
      )}
    </>
  );

  const batch = state.batch.length > 0 ? {
    count: state.batch.length,
    // No parcelado, o total das parcelas (o valor da linha pode ser o de cada parcela).
    sumCents: state.batch.reduce((sum, draft) => (
      sum + (draft.billingType === 'installments' ? installmentsTotal(draft) : draft.amountCents ?? 0)
    ), 0),
    header: (
      <div className={`${HEADER_GRID_CLASS} ${BATCH_GRID_CLASS}`} style={{ ...columnHeaderStyle, padding: '10px 8px 4px' }}>
        <span>Descrição</span><span>Categoria</span><span>Pagamento</span><span>Cobrança</span><span>Valor</span><span>Compra</span>
        <span>Vencimento</span><span style={{ paddingLeft: 9 }}>Pago em</span><span>Valor pago</span><span /><span />
      </div>
    ),
    rows: state.batch.map((draft) => (
      <ExpenseRow
        key={draft.key}
        draft={draft}
        variant="batch"
        resources={resources}
        errors={state.errors[draft.key]}
        showSummary={draft.key === state.activeKey}
        suggestions={draft.key === state.activeKey ? activeSuggestions : null}
        pendingInstallmentCount={pendingCountFor(draft.key)}
        onRemove={() => dispatch({ type: 'removeFromBatch', key: draft.key })}
        {...rowHandlers(draft.key)}
      />
    )),
  } : null;

  return (
    <EntryDialogFrame
      title={isEdit ? 'Editar despesa' : 'Nova despesa'}
      description="Registre uma saída financeira"
      onRequestClose={requestClose}
      onSave={save}
      onAddToBatch={isEdit || entry.billingType === 'fixed' ? undefined : addToBatch}
      top={top}
      batch={batch}
      extraContent={<>
        {!isEdit && fixedOpened && <FixedExpensesSection initialMonth={pendingMonth} visible={fixedVisible} disabled={state.saving !== null} resources={resources} onBusyChange={setFixedBusy} />}
        {isEdit && managerOpened && expense?.fixedExpenseId && <FixedExpenseManager resources={resources} initialSourceId={expense.fixedExpenseId} disabled={state.saving !== null} onBusyChange={setFixedBusy} />}
      </>}
      itemNoun={EXPENSE_NOUN}
      footerMessage={footerMessage}
      footerTone={footerTone}
      saveLabel={entry.billingType === 'fixed' || convertingToFixed ? 'Salvar despesa fixa' : isEdit ? 'Salvar alterações' : toSaveCount > 1 ? `Salvar ${toSaveCount} despesas` : 'Registrar despesa'}
      canSave={toSaveCount > 0}
      saving={state.saving}
      toast={state.toast}
    />
  );
}

/** Os avisos do valor em série; sem mudança no valor não há aviso. O limite só aparece no crédito com cartão. */
function seriesValueNotesFor(impact: ReturnType<typeof seriesValueImpact>, card: Cartao | null): string[] {
  return impact ? seriesValueNotes(impact, card ? { name: card.nome } : null) : [];
}
