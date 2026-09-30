import { useEffect, useMemo, useReducer, useRef, type Dispatch, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Cartao, Categoria } from '../../../types/config';
import type { Expense, FinanceDashboardData } from '../../../types/finance';
import { getActiveAccountId } from '../../../services/apiClient';
import { fetchCardLimits } from '../../../services/cardLimitsService';
import { fetchCartoes, fetchCategorias, saveCategoria } from '../../../services/configService';
import { createExpense, updateExpense } from '../../../services/financeService';
import { invalidateExpenseQueries, queryKeys } from '../../../services/queryKeys';
import { Dialog } from '../../../ui/dialog';
import { C, dialogFooterStyle, saveButtonDisabledStyle, saveButtonStyle } from '../../../ui/dialogFormTokens';
import { getRecentCategoryIds } from '../../../utils/categorySuggestions';
import { getLocalTodayIso, isoToBrDate } from '../../../utils/date';
import { formatCurrency } from '../formatters';
import {
  EMPTY_FORM_MESSAGE, buildCreateInput, buildUpdateInput, cardForMethod, duplicateText, errorMessage, hasErrors,
  isDraftFilled, usesCard, validateDraft, type RuleContext,
} from './draftRules';
import {
  createDraft, dialogReducer, draftFromExpense, initialDialogState,
  type DialogAction, type DraftErrors, type DraftPatch, type ExpenseDraft,
} from './draftState';
import { ExpenseRow, amountLabel, type RowResources } from './ExpenseRow';
import { BATCH_GRID_CLASS, ENTRY_GRID_CLASS, SEPARATOR } from './fieldStyles';
import { PaymentMethodPopover, cardLimitText } from './PaymentMethodPopover';
import { useExpenseSuggestions, type DraftSuggestions } from './useExpenseSuggestions';

const TOAST_DURATION_MS = 2800;
const HEADER_CLASS = 'hidden lg:grid lg:gap-x-1.5 xl:gap-x-2';
const headerStyle = { fontSize: 11, fontWeight: 600, color: C.chipOffText };

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

function Required() {
  return <span style={{ color: C.danger }}>*</span>;
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

    const errors: Record<number, DraftErrors> = {};
    let firstMessage = '';
    state.batch.forEach((draft, index) => {
      const draftErrors = validateDraft(draft, context);
      if (!hasErrors(draftErrors)) return;
      errors[draft.key] = draftErrors;
      if (!firstMessage) firstMessage = `Despesa ${index + 1} do lote: ${errorMessage(draftErrors).toLowerCase()}`;
    });
    if (entryFilled) {
      const entryErrors = validateDraft(state.entry, context);
      if (hasErrors(entryErrors)) {
        errors[state.entry.key] = entryErrors;
        if (!firstMessage) firstMessage = errorMessage(entryErrors);
      }
    }
    if (firstMessage) {
      dispatch({ type: 'showErrors', errors, message: firstMessage });
      return;
    }

    // Uma por vez: cada despesa gravada sai do lote na hora, e uma falha para a
    // gravação com as restantes na tela (salvar de novo não duplica as gravadas).
    const accountId = getActiveAccountId();
    dispatch({ type: 'savingStarted', total: items.length });
    for (let index = 0; index < items.length; index++) {
      const draft = items[index]!;
      dispatch({ type: 'savingProgress', current: index + 1 });
      try {
        await createExpense(buildCreateInput(draft, context, accountId));
      } catch (error) {
        if (index > 0) invalidateExpenseQueries(qc);
        const message = error instanceof Error ? error.message : 'Não foi possível registrar a despesa.';
        // As gravadas antes dela já saíram: a que falhou é a 1ª do lote que sobrou.
        dispatch({ type: 'savingFailed', message: draft.key === state.entry.key ? message : `Despesa 1 do lote: ${message}` });
        return;
      }
      dispatch({ type: 'draftSaved', key: draft.key, nextEntry: nextEntry(state.entry) });
    }
    invalidateExpenseQueries(qc);
    dispatch({ type: 'savingFinished', toast: items.length > 1 ? `✓ ${items.length} despesas registradas` : '✓ Despesa registrada' });
  };

  const save = () => {
    if (state.saving) return;
    void (expense ? saveEdit(expense) : saveNew());
  };

  // Enter salva e Shift+Enter (na linha de entrada) adiciona ao lote. Dentro do
  // autocomplete e dos popovers, o Enter é deles.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== 'INPUT' || target.closest('[data-floating-panel]')) return;
    event.preventDefault();
    if (!event.shiftKey) save();
    else if (target.closest('[data-entry-row]')) addToBatch();
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
  const batchSum = state.batch.reduce((sum, draft) => sum + (draft.amountCents ?? 0), 0);

  let footerMessage = '';
  let footerColor = C.textSoft;
  if (state.footerError) {
    footerMessage = state.footerError;
    footerColor = C.danger;
  } else if (entryDuplicate) {
    footerMessage = entryDuplicate;
    footerColor = C.warn;
  } else if (!isEdit && toSaveCount === 0) {
    footerMessage = EMPTY_FORM_MESSAGE;
  } else if (state.batch.length > 0) {
    footerMessage = entryFilled ? 'A linha de cima também entra ao salvar.' : 'Revise o lote e salve.';
  } else if (!isEdit) {
    footerMessage = 'Enter registra · Shift+Enter adiciona ao lote';
  }

  const saveLabel = isEdit ? 'Salvar alterações' : toSaveCount > 1 ? `Salvar ${toSaveCount} despesas` : 'Registrar despesa';
  const editBillingLabel = expense
    ? expense.parcelado && expense.parcela ? `Parcela ${expense.parcela}` : expense.recorrente ? 'Mensal' : 'Não repete'
    : undefined;

  return (
    <Dialog
      open
      title={isEdit ? 'Editar despesa' : 'Nova despesa'}
      description="Registre uma saída financeira"
      onClose={requestClose}
      size="xxl"
      scrollBody={false}
    >
      <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={handleKeyDown}>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3.5 pt-3.5 xl:px-5">
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
            <div className={`${HEADER_CLASS} ${BATCH_GRID_CLASS}`} style={{ ...headerStyle, padding: '0 8px 6px' }}>
              <span>Descrição <Required /></span><span>Categoria <Required /></span><span>Pagamento</span><span>Cobrança</span>
              <span>Valor <Required /></span><span>Compra</span><span>Vencimento</span><span style={{ paddingLeft: 9 }}>Pago em</span>
              <span>Valor pago</span><span /><span />
            </div>
          ) : (
            <div className={`${HEADER_CLASS} ${ENTRY_GRID_CLASS}`} style={{ ...headerStyle, padding: '0 8px 6px' }}>
              <span>Descrição <Required /></span><span>Categoria <Required /></span><span>Cobrança</span>
              <span>{amountLabel(entry)} <Required /></span><span>Compra</span><span>{entryInstallments ? '1ª vence' : 'Vencimento'}</span>
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

          {state.batch.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '20px 8px 8px', borderBottom: `1px solid ${SEPARATOR}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>No lote</span>
                <span style={{ fontSize: 12, color: C.textSoft }}>{state.batch.length === 1 ? '1 despesa' : `${state.batch.length} despesas`}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textSoft }}>
                  soma <span style={{ fontVariantNumeric: 'tabular-nums', color: C.text, fontWeight: 600 }}>{formatCurrency(batchSum / 100)}</span>
                </span>
              </div>
              <div className={`${HEADER_CLASS} ${BATCH_GRID_CLASS}`} style={{ ...headerStyle, padding: '10px 8px 4px' }}>
                <span>Descrição</span><span>Categoria</span><span>Pagamento</span><span>Cobrança</span><span>Valor</span><span>Compra</span>
                <span>Vencimento</span><span style={{ paddingLeft: 9 }}>Pago em</span><span>Valor pago</span><span /><span />
              </div>
              <div className="flex flex-col gap-2 pt-2 lg:gap-0 lg:pt-0">
                {state.batch.map((draft) => (
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
                ))}
              </div>
            </>
          )}
        </div>

        <div style={dialogFooterStyle}>
          <span role={state.footerError ? 'alert' : undefined} style={{ flex: 1, minWidth: 0, fontSize: 12, color: footerColor }}>
            {footerMessage}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!!state.saving}
            style={toSaveCount > 0 ? saveButtonStyle : saveButtonDisabledStyle}
          >
            {saveLabel}
          </button>
        </div>

        {state.saving && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-white/85" role="status">
            <span style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>
              {state.saving.total > 1 ? `Salvando despesas... ${state.saving.current} de ${state.saving.total}` : 'Salvando despesa...'}
            </span>
            <div style={{ width: 200, height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((state.saving.current / state.saving.total) * 100)}%`, background: C.primary, transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {state.toast && (
          <div
            role="status"
            className="fixed bottom-7 left-1/2 z-50 flex h-[38px] -translate-x-1/2 items-center rounded-full px-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
            style={{ background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 500 }}
          >
            {state.toast}
          </div>
        )}
      </div>
    </Dialog>
  );
}
