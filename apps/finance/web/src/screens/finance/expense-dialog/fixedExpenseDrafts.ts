import type { Expense } from '../../../types/finance';
import type { ExpenseDraft } from './draftState';
import type { RuleContext } from './draftRules';

export function isFixedMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100;
}

export function initialFixedMonth(contextMonth: string | undefined, presetDate: string | undefined, today: string): string {
  return contextMonth && isFixedMonth(contextMonth) ? contextMonth : (presetDate ?? today).slice(0, 7);
}

/** Adiadas e previsões sem valor continuam na grade, sem entrar na gravação. */
export function readyToSave(draft: ExpenseDraft): boolean {
  return draft.forecastId === undefined || (!draft.deferred && !draft.deferError && Number.isFinite(draft.amountCents) && (draft.amountCents ?? 0) > 0);
}

export function contextForDraft(draft: ExpenseDraft, context: RuleContext): RuleContext {
  return draft.forecastId === undefined ? context : {
    ...context, editing: true, forecast: true, savedInterest: null, savedDueDate: draft.forecastDueDate,
  };
}

export function canCreateFixedFromExpense(expense: Expense): boolean {
  return expense.status !== 'prevista' && expense.status !== 'cancelada'
    && !expense.fixedExpenseId && !expense.parcelado && !expense.recorrente && !expense.invoiceOriginPaymentId;
}
