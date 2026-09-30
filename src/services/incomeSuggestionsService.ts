import { apiRequest, getActiveAccountId } from './apiClient';

export interface IncomeSuggestionMatch {
  description: string;
  amount: number;
  client: string | null;
  categoryId: number | null;
}

export interface IncomeSuggestions {
  /** Até 4 descrições diferentes da conta ativa, cada uma com a receita mais recente. */
  matches: IncomeSuggestionMatch[];
  /** Valor da última receita com exatamente a mesma descrição. */
  lastAmount: number | null;
}

export interface IncomeSuggestionsQuery {
  description: string;
}

export interface IncomeDuplicateQuery {
  description: string;
  amount: number;
  client: string | null;
  /** Na edição, a própria receita não conta. */
  excludeId: number | null;
}

function withActiveAccount(params: URLSearchParams): URLSearchParams {
  const accountId = getActiveAccountId();
  if (accountId) params.set('account_id', String(accountId));
  return params;
}

export async function fetchIncomeSuggestions(query: IncomeSuggestionsQuery): Promise<IncomeSuggestions> {
  const params = withActiveAccount(new URLSearchParams());
  if (query.description) params.set('description', query.description);
  const raw = await apiRequest<IncomeSuggestions | undefined>(`/incomes/suggestions?${params}`);
  return { matches: raw?.matches ?? [], lastAmount: raw?.lastAmount ?? null };
}

/** Receita igual lançada nos últimos 7 dias na conta ativa, ou null. */
export async function fetchIncomeDuplicate(query: IncomeDuplicateQuery): Promise<{ createdAt: string } | null> {
  const params = withActiveAccount(new URLSearchParams({ description: query.description, amount: query.amount.toFixed(2) }));
  if (query.client) params.set('client', query.client);
  if (query.excludeId !== null) params.set('exclude_id', String(query.excludeId));
  const raw = await apiRequest<{ duplicate: { createdAt: string } | null } | undefined>(`/incomes/duplicate?${params}`);
  return raw?.duplicate ?? null;
}
