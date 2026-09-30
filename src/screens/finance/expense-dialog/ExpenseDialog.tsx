import { useEffect, useMemo, useReducer, useRef, type Dispatch } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Cartao, Categoria } from '../../../types/config';
import type { Expense, FinanceDashboardData } from '../../../types/finance';
import { getActiveAccountId } from '../../../services/apiClient';
import { fetchCardLimits } from '../../../services/cardLimitsService';
import { fetchCartoes, fetchCategorias, saveCategoria } from '../../../services/configService';
import { createExpense, updateExpense } from '../../../services/financeService';
import { invalidateExpenseQueries, queryKeys } from '../../../services/queryKeys';
import { C } from '../../../ui/dialogFormTokens';
import { getRecentCategoryIds } from '../../../utils/categorySuggestions';
import { getLocalTodayIso, isoToBrDate } from '../../../utils/date';
import { collectBatchErrors, saveInOrder } from '../entry-dialog/batchState';
import { EntryDialogFrame, type FooterTone } from '../entry-dialog/EntryDialogFrame';
import { HEADER_GRID_CLASS } from '../entry-dialog/fieldStyles';
import { RequiredMark, columnHeaderStyle } from '../entry-dialog/GridParts';
import { duplicateText } from '../entry-dialog/SummaryLine';
import {
  EMPTY_FORM_MESSAGE, buildCreateInput, buildUpdateInput, cardForMethod, errorMessage, hasErrors,
  isDraftFilled, usesCard, validateDraft, type RuleContext,
} from './draftRules';
import {
  createDraft, dialogReducer, draftFromExpense, initialDialogState,
  type DialogAction, type DraftErrors, type DraftPatch, type ExpenseDraft,
} from './draftState';
import { ExpenseRow, amountLabel, type RowResources } from './ExpenseRow';
import { BATCH_GRID_CLASS, ENTRY_GRID_CLASS } from './expenseGrid';
import { PaymentMethodPopover, cardLimitText } from './PaymentMethodPopover';
import { useExpenseSuggestions, type DraftSuggestions } from './useExpenseSuggestions';

const TOAST_DURATION_MS = 2800;
const EXPENSE_NOUN = { singular: 'despesa', plural: 'despesas' };

interface ExpenseDialogProps {
  open: boolean;
  /** Despesa a editar; sem ela, o modal lança despesas novas. */
  expense?: Expense | null;
  /** Dia clicado no calendário (ISO): vira a data da compra, travada na linha de entrada. */
  presetDate?: string;
  onClose: () => void;
}

/**
 * Modal de despesa. Numa despesa nova: a linha de entrada, o lote e a barra
 * "Lançando em"; grava uma despesa por vez e continua aberto. Na edição: uma
 * linha só, e fecha ao salvar. Cada abertura começa do zero (o lote não
 * sobrevive ao fechar).
 */
export function ExpenseDialog({ open, expense, presetDate, onClose }: ExpenseDialogProps) {
  if (!open) return null;
  return <ExpenseDialogContent key={expense?.id ?? 'new'} expense={expense ?? null} presetDate={presetDate} onClose={onClose} />;
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
  onClose: () => void;
}

function ExpenseDialogContent({ expense, presetDate, onClose }: ExpenseDialogContentProps) {
  const qc = useQueryClient();
  const todayIso = useMemo(() => getLocalTodayIso(), []);
  const isEdit = expense !== null;
  const isCompany = localStorage.getItem('contaAtivaTipo') === 'empresa';
  const descriptionRef = useRef<HTMLInputElement>(null);

  const [state, dispatch] = useReducer(dialogReducer, null, () => initialDialogState(expense
    ? draftFromExpense(expense, todayIso)
    : createDraft({ paymentMethod: 'pix', cardId: null, purchaseDate: isoToBrDate(presetDate ?? todayIso), paymentMethodTouched: false }, todayIso)));

  const categoriesQuery = useQuery({ queryKey: queryKeys.categorias(), queryFn: () => fetchCategorias() });
  const cardsQuery = useQuery({ queryKey: queryKeys.cartoes(undefined, 'familia'), queryFn: () => fetchCartoes(undefined, 'familia') });
  const limitsQuery = useQuery({ queryKey: queryKeys.cardLimits(undefined, 'familia'), queryFn: () => fetchCardLimits('familia'), staleTime: 60_000 });

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
    editingInstallment: expense?.parcelado === true,
  }), [todayIso, cards, expense]);

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

  const createCategory = async (name: string): Promise<number> => {
    const created = await saveCategoria({ nome: name });
    qc.setQueryData<Categoria[]>(queryKeys.categorias(), (current) => [...(current ?? []), created]);
    void qc.invalidateQueries({ queryKey: ['categorias'] });
    return created.id;
  };

  const resources: RowResources = {
    context,
    categories,
    recentCategoryIds,
    categoryHistory,
    cardLimits: limitsQuery.data ?? [],
    isCompany,
    lockPurchaseDate: !isEdit && !!presetDate,
    createCategory,
  };

  const nextEntry = (from: ExpenseDraft) => createDraft({
    paymentMethod: from.paymentMethod,
    cardId: from.cardId,
    purchaseDate: from.purchaseDate,
    paymentMethodTouched: true,
  }, todayIso);

  const requestClose = () => {
    if (!state.saving) onClose();
  };

  const addToBatch = () => {
    if (isEdit || state.saving) return;
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
    dispatch({ type: 'savingStarted', total: 1 });
    try {
      await updateExpense(target.id, buildUpdateInput(state.entry, context));
      invalidateExpenseQueries(qc);
      onClose();
    } catch (error) {
      dispatch({ type: 'savingFailed', message: error instanceof Error ? error.message : 'Não foi possível salvar a despesa.' });
    }
  };

  const saveNew = async () => {
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
    if (state.saving) return;
    void (expense ? saveEdit(expense) : saveNew());
  };

  const rowHandlers = (key: number) => ({
    onUpdate: (patch: DraftPatch) => dispatch({ type: 'update', key, patch }),
    onSetInstallmentCount: (count: number, force: boolean) => dispatch({ type: 'setInstallmentCount', key, count, force }),
    onCancelInstallmentCount: () => dispatch({ type: 'cancelInstallmentCount' }),
    onFocus: () => dispatch({ type: 'setActive', key }),
  });
  const pendingCountFor = (key: number) => (state.pendingInstallmentCount?.key === key ? state.pendingInstallmentCount.count : null);

  const entry = state.entry;
  const entryInstallments = entry.billingType === 'installments';
  const entryFilled = isDraftFilled(entry);
  const toSaveCount = isEdit ? 1 : state.batch.length + (entryFilled ? 1 : 0);
  const entryDuplicate = entrySuggestions.duplicateCreatedAt ? duplicateText(entrySuggestions.duplicateCreatedAt) : null;
  const entryLimit = cardLimitText(entry, cards, resources.cardLimits);

  let footerMessage = '';
  let footerTone: FooterTone = 'neutral';
  if (state.footerError) {
    footerMessage = state.footerError;
    footerTone = 'danger';
  } else if (entryDuplicate) {
    footerMessage = entryDuplicate;
    footerTone = 'warning';
  } else if (!isEdit && toSaveCount === 0) {
    footerMessage = EMPTY_FORM_MESSAGE;
  } else if (state.batch.length > 0) {
    footerMessage = entryFilled ? 'A linha de cima também entra ao salvar.' : 'Revise o lote e salve.';
  } else if (!isEdit) {
    footerMessage = 'Enter registra · Shift+Enter adiciona ao lote';
  }

  const editBillingLabel = expense
    ? expense.parcelado && expense.parcela ? `Parcela ${expense.parcela}` : expense.recorrente ? 'Mensal' : 'Não repete'
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
        draft={entry}
        variant={isEdit ? 'edit' : 'entry'}
        resources={resources}
        errors={state.errors[entry.key]}
        showSummary
        suggestions={entrySuggestions}
        readOnlyBilling={editBillingLabel}
        pendingInstallmentCount={pendingCountFor(entry.key)}
        descriptionRef={descriptionRef}
        onAddToBatch={addToBatch}
        {...rowHandlers(entry.key)}
      />
    </>
  );

  const batch = state.batch.length > 0 ? {
    count: state.batch.length,
    sumCents: state.batch.reduce((sum, draft) => sum + (draft.amountCents ?? 0), 0),
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
      onAddToBatch={isEdit ? undefined : addToBatch}
      top={top}
      batch={batch}
      itemNoun={EXPENSE_NOUN}
      footerMessage={footerMessage}
      footerTone={footerTone}
      saveLabel={isEdit ? 'Salvar alterações' : toSaveCount > 1 ? `Salvar ${toSaveCount} despesas` : 'Registrar despesa'}
      canSave={toSaveCount > 0}
      saving={state.saving}
      toast={state.toast}
    />
  );
}
