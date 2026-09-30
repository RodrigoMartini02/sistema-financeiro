import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getActiveAccountId } from '../../../services/apiClient';
import {
  fetchExpenseDuplicate, fetchExpenseSuggestions,
  type ExpenseDuplicateQuery, type ExpenseSuggestions, type ExpenseSuggestionsQuery,
} from '../../../services/expenseSuggestionsService';
import { queryKeys } from '../../../services/queryKeys';
import { useDebouncedValue } from '../entry-dialog/useDebouncedValue';
import { duplicateQuery } from './draftRules';
import type { ExpenseDraft } from './draftState';

const MIN_SEARCH_LENGTH = 2;

export interface DraftSuggestions {
  suggestions: ExpenseSuggestions | undefined;
  /** Data (ISO) de uma despesa igual lançada nos últimos 7 dias. */
  duplicateCreatedAt: string | null;
}

/**
 * Sugestões do histórico (autocomplete, forma e cartão preferidos, último valor)
 * e a checagem de duplicata no servidor, para a despesa com o resumo aberto.
 */
export function useExpenseSuggestions(draft: ExpenseDraft | null, excludeId: number | null): DraftSuggestions {
  const accountId = getActiveAccountId();
  const typed = draft?.description.trim() ?? '';
  const description = useDebouncedValue(typed.length >= MIN_SEARCH_LENGTH ? typed : '');
  const suggestionsQuery: ExpenseSuggestionsQuery = { description, categoryId: draft?.categoryId ?? null };
  const suggestions = useQuery({
    queryKey: queryKeys.expenseSuggestions(accountId, suggestionsQuery),
    queryFn: () => fetchExpenseSuggestions(suggestionsQuery),
    enabled: draft !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // Serializada para a espera comparar valores, não objetos novos a cada render.
  const duplicateKey = useDebouncedValue(JSON.stringify(draft ? duplicateQuery(draft, excludeId) : null));
  const pendingDuplicate = JSON.parse(duplicateKey) as ExpenseDuplicateQuery | null;
  const duplicate = useQuery({
    queryKey: queryKeys.expenseDuplicate(accountId, pendingDuplicate),
    queryFn: () => fetchExpenseDuplicate(pendingDuplicate!),
    enabled: pendingDuplicate !== null,
    staleTime: 30_000,
  });

  return {
    suggestions: draft ? suggestions.data : undefined,
    duplicateCreatedAt: pendingDuplicate ? duplicate.data?.createdAt ?? null : null,
  };
}
