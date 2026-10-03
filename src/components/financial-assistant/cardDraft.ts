// Rascunho do card de despesa do assistente → rascunho do modal de despesa do
// desktop. O card valida e monta o que é gravado pelas mesmas regras do modal
// (draftRules): total dividido nas parcelas, vencimento calculado (fatura do
// cartão, dia do mês, data da compra), "Pago em" e parcelas pagas uma a uma.
// Sem React, para o teste rodar direto.
import type { Attachment, ExpenseCreateInput } from '../../types/finance';
import type { FinancialAssistantDraft } from '../../types/financialAssistant';
import { isoToBrDate } from '../../utils/date';
import { toCents, toReais } from '../../screens/finance/entry-dialog/cents';
import { MIN_INSTALLMENTS, type ExpenseDraft } from '../../screens/finance/expense-dialog/draftState';
import {
  buildCreateInput, effectiveDueDate, errorMessage, hasErrors, installmentAmounts, validateDraft, type RuleContext,
} from '../../screens/finance/expense-dialog/draftRules';

export interface CardCategory {
  id: number;
  nome: string;
}

const BILLING_TYPES = {
  nao: 'single',
  parcelas: 'installments',
  mensal: 'monthly',
} as const satisfies Record<NonNullable<FinancialAssistantDraft['billingType']>, ExpenseDraft['billingType']>;

export function normalizeComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** O card guarda a categoria pelo nome (é o que a frase diz); o modal, pelo id. */
export function categoryIdByName(categories: CardCategory[], name: string | null): number | null {
  if (!name) return null;
  const target = normalizeComparable(name);
  return categories.find((category) => normalizeComparable(category.nome) === target)?.id ?? null;
}

/**
 * Datas que o modal do desktop preenche sozinho: sem data na frase, a compra é
 * hoje; despesa paga (fora do parcelado) ganha "Pago em" com o dia da frase ou
 * hoje. O que veio da frase nunca é sobrescrito.
 */
export function fillExpenseDefaults(draft: FinancialAssistantDraft, todayIso: string): FinancialAssistantDraft {
  if (draft.kind !== 'expense') return draft;
  const date = draft.date ?? todayIso;
  const paidOutsideInstallments = draft.paid && draft.billingType !== 'parcelas';
  return {
    ...draft,
    date,
    paymentDate: draft.paymentDate ?? (paidOutsideInstallments ? date : null),
  };
}

function dayOfMonth(isoDate: string | null | undefined): number | null {
  return isoDate ? Number(isoDate.slice(8, 10)) : null;
}

/**
 * O rascunho do card no formato do modal: centavos e datas dd/mm/aaaa, como o
 * modal guarda. Vencimento vazio continua vazio — no modal isso quer dizer
 * "calculado".
 */
export function toExpenseDraft(
  draft: FinancialAssistantDraft,
  categories: CardCategory[],
  todayIso: string,
  attachments: Attachment[] = [],
): ExpenseDraft {
  const purchaseIso = draft.date ?? todayIso;
  return {
    key: 0,
    description: draft.description ?? '',
    categoryId: categoryIdByName(categories, draft.category),
    amountCents: draft.amount ? toCents(draft.amount) : null,
    billingType: BILLING_TYPES[draft.billingType ?? 'nao'],
    installmentCount: draft.installments ?? MIN_INSTALLMENTS,
    installmentAdjustments: {},
    installmentPayments: draft.installmentPayments ?? {},
    overdueDismissed: draft.overdueDismissed ?? false,
    knowsCashPrice: false,
    cashPriceCents: null,
    // Recorrente: o dia do vencimento digitado; sem ele, o da compra.
    recurrenceDay: dayOfMonth(draft.dueDate) ?? dayOfMonth(purchaseIso),
    purchaseDate: isoToBrDate(purchaseIso),
    dueDate: isoToBrDate(draft.dueDate),
    paid: draft.paid,
    paymentDate: isoToBrDate(draft.paymentDate),
    amountPaidCents: draft.amountPaid != null ? toCents(draft.amountPaid) : null,
    paymentMethod: draft.paymentMethod,
    cardId: draft.cardId ?? null,
    paymentMethodTouched: true,
    attachments,
    invoiceNumber: draft.invoiceNumber ?? '',
    invoiceDate: isoToBrDate(draft.invoiceDate),
  };
}

export type ExpenseSave = { ok: true; input: ExpenseCreateInput } | { ok: false; error: string };

/** Valida como o modal e devolve o que vai para a API, ou a mensagem do modal. */
export function buildExpenseSave(
  draft: FinancialAssistantDraft,
  options: { categories: CardCategory[]; context: RuleContext; accountId: number | null; attachments: Attachment[] },
): ExpenseSave {
  const expenseDraft = toExpenseDraft(draft, options.categories, options.context.todayIso, options.attachments);
  const errors = validateDraft(expenseDraft, options.context);
  if (hasErrors(errors)) return { ok: false, error: errorMessage(errors) };
  return { ok: true, input: buildCreateInput(expenseDraft, options.context, options.accountId) };
}

/**
 * Valor e vencimento que o aviso de duplicata compara com o que já foi
 * lançado: no parcelado, a primeira parcela (a linha gravada é a parcela).
 */
export function duplicateCheckKey(expenseDraft: ExpenseDraft, context: RuleContext): { amount: number; dueDate: string } | null {
  if (!expenseDraft.amountCents) return null;
  const amountCents = expenseDraft.billingType === 'installments'
    ? installmentAmounts(expenseDraft)[0]!
    : expenseDraft.amountCents;
  return { amount: toReais(amountCents), dueDate: effectiveDueDate(expenseDraft, context).date };
}
