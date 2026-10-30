import type { Expense, FixedExpense, FixedExpenseCreateInput } from '../../../types/finance';
import { isoToBrDate } from '../../../utils/date';
import { addMonthsClamped } from '../../../utils/expenseSchedule';
import { toCents, toReais } from '../entry-dialog/cents';
import { buildUpdateInput, effectiveDueDate, type RuleContext } from './draftRules';
import { createDraft, draftFromExpense, type DraftErrors, type ExpenseDraft } from './draftState';

export interface FixedOccurrenceDraft {
  expense: Expense;
  month: string;
  draft: ExpenseDraft;
  selected: boolean;
  dirty?: boolean;
  errors?: DraftErrors;
  error?: string;
}

export function isFixedMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100;
}

/** O mês consultado não muda quando o usuário ajusta a compra ou o vencimento. */
export function initialFixedMonth(contextMonth: string | undefined, presetDate: string | undefined, today: string): string {
  if (contextMonth && isFixedMonth(contextMonth)) return contextMonth;
  return (presetDate ?? today).slice(0, 7);
}

/** Refetch reconcilia o mês consultado, preserva ajustes e não toca os demais meses. */
export function mergeFixedOccurrences(
  current: FixedOccurrenceDraft[], incoming: Expense[], month: string,
): FixedOccurrenceDraft[] {
  const stored = new Map(current.filter((item) => item.month === month).map((item) => [item.expense.id, item]));
  const unique = new Map(incoming.filter((expense) => expense.status === 'prevista').map((expense) => [expense.id, expense]));
  return [
    ...current.filter((item) => item.month !== month),
    ...[...unique.values()].map((expense): FixedOccurrenceDraft => {
      const previous = stored.get(expense.id);
      if (!previous) return { expense, month, draft: draftFromExpense(expense), selected: false };
      return {
        ...previous, expense,
        draft: previous.dirty ? previous.draft : { ...draftFromExpense(expense), key: previous.draft.key },
      };
    }),
  ];
}

/** A ação de confirmar alcança apenas linhas visíveis e explicitamente escolhidas. */
export function selectedFixedOccurrences(items: FixedOccurrenceDraft[], month: string): FixedOccurrenceDraft[] {
  return items.filter((item) => item.month === month && item.selected);
}

export function fixedDraftFromSource(source: FixedExpense): ExpenseDraft {
  return {
    ...createDraft({ paymentMethod: source.paymentMethod, cardId: source.cardId, purchaseDate: isoToBrDate(source.purchaseDate), purchaseDateTouched: true, paymentMethodTouched: true }),
    billingType: 'fixed', description: source.description, categoryId: source.categoryId,
    amountCents: toCents(source.amount), dueDate: isoToBrDate(source.dueDate),
  };
}

export function buildFixedExpenseInput(
  draft: ExpenseDraft, context: RuleContext, accountId: number | null, firstMonth: string, sourceExpenseId?: number,
): FixedExpenseCreateInput {
  const fields = buildUpdateInput(draft, { ...context, editing: true });
  let purchaseDate = fields.purchaseDate;
  let dueDate = fields.dueDate;
  // O formulário comum começa com a compra de hoje. Uma fixa iniciada em outro
  // mês precisa avançar apenas essa referência automática, sem reescrever as
  // datas que o usuário informou ou a referência de um lançamento existente.
  if (sourceExpenseId === undefined && !context.savedDueDate && !draft.dueDate.trim()
    && isFixedMonth(firstMonth) && dueDate.slice(0, 7) < firstMonth) {
    const offset = (Number(firstMonth.slice(0, 4)) - Number(dueDate.slice(0, 4))) * 12
      + Number(firstMonth.slice(5, 7)) - Number(dueDate.slice(5, 7));
    if (!draft.purchaseDateTouched) {
      purchaseDate = addMonthsClamped(purchaseDate, offset);
      dueDate = effectiveDueDate({ ...draft, purchaseDate: isoToBrDate(purchaseDate) }, context).date;
    } else if (draft.paymentMethod === 'credito' && draft.cardId !== null) {
      throw new Error('O vencimento calculado é anterior ao mês inicial. Confira as datas da primeira previsão: ajuste a compra ou informe o vencimento.');
    } else {
      dueDate = addMonthsClamped(dueDate, offset);
    }
  }
  return {
    accountId, description: fields.description, categoryId: fields.categoryId,
    amount: toReais(draft.amountCents ?? 0), paymentMethod: fields.paymentMethod,
    cardId: fields.cardId, purchaseDate,
    dueDate, firstMonth,
    ...(sourceExpenseId === undefined ? {} : { sourceExpenseId }),
  };
}

export function canCreateFixedFromExpense(expense: Expense): boolean {
  return expense.status !== 'prevista' && expense.status !== 'cancelada'
    && !expense.fixedExpenseId && !expense.parcelado && !expense.recorrente && !expense.invoiceOriginPaymentId;
}
