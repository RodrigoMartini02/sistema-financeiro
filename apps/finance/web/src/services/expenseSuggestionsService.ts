import { apiRequest, getActiveAccountId } from './apiClient';
import { isPaymentMethod, type PaymentMethod } from '../types/finance';

export interface ExpenseSuggestionMatch {
  description: string;
  amount: number;
  categoryId: number | null;
  /** Como veio do histórico: pode ser uma forma antiga, fora das quatro atuais. */
  paymentMethod: string;
  cardId: number | null;
}

export interface ExpenseSuggestions {
  /** Até 4 descrições diferentes da conta ativa, cada uma com o lançamento mais recente. */
  matches: ExpenseSuggestionMatch[];
  /** Valor da última despesa com exatamente a mesma descrição. */
  lastAmount: number | null;
  /** Forma mais usada na categoria informada; sem ela, a mais usada na conta. */
  suggestedPaymentMethod: PaymentMethod | null;
  /** Cartão mais usado com cada forma. */
  preferredCardIds: { debito: number | null; credito: number | null };
}

export interface ExpenseSuggestionsQuery {
  description: string;
  categoryId: number | null;
}

export interface ExpenseDuplicateQuery {
  description: string;
  /** No parcelado, o valor da 1ª parcela. */
  amount: number;
  paymentMethod: PaymentMethod;
  /** Só no parcelado. */
  installmentCount: number | null;
  /** Na edição, a própria despesa não conta. */
  excludeId: number | null;
}

interface RawSuggestions {
  matches: ExpenseSuggestionMatch[];
  lastAmount: number | null;
  suggestedPaymentMethod: string | null;
  preferredCardIds: { debito: number | null; credito: number | null };
}

function withActiveAccount(params: URLSearchParams): URLSearchParams {
  const accountId = getActiveAccountId();
  if (accountId) params.set('account_id', String(accountId));
  return params;
}

/** Com a descrição vazia (ou com 1 letra), vêm só a forma e os cartões sugeridos. */
export async function fetchExpenseSuggestions(query: ExpenseSuggestionsQuery): Promise<ExpenseSuggestions> {
  const params = withActiveAccount(new URLSearchParams());
  if (query.description) params.set('description', query.description);
  if (query.categoryId) params.set('category_id', String(query.categoryId));

  const raw = await apiRequest<RawSuggestions | undefined>(`/expenses/suggestions?${params}`);
  return {
    matches: raw?.matches ?? [],
    lastAmount: raw?.lastAmount ?? null,
    suggestedPaymentMethod: raw?.suggestedPaymentMethod && isPaymentMethod(raw.suggestedPaymentMethod)
      ? raw.suggestedPaymentMethod
      : null,
    preferredCardIds: raw?.preferredCardIds ?? { debito: null, credito: null },
  };
}

/** Despesa igual lançada nos últimos 7 dias na conta ativa, ou null. */
export async function fetchExpenseDuplicate(query: ExpenseDuplicateQuery): Promise<{ createdAt: string } | null> {
  const params = withActiveAccount(new URLSearchParams({
    description: query.description,
    amount: query.amount.toFixed(2),
    payment_method: query.paymentMethod,
  }));
  if (query.installmentCount !== null) params.set('installment_count', String(query.installmentCount));
  if (query.excludeId !== null) params.set('exclude_id', String(query.excludeId));

  const raw = await apiRequest<{ duplicate: { createdAt: string } | null } | undefined>(`/expenses/duplicate?${params}`);
  return raw?.duplicate ?? null;
}
