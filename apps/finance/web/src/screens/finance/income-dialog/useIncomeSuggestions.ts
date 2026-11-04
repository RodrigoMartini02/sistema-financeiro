import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getActiveAccountId } from '../../../services/apiClient';
import {
  fetchIncomeDuplicate, fetchIncomeSuggestions,
  type IncomeDuplicateQuery, type IncomeSuggestions, type IncomeSuggestionsQuery,
} from '../../../services/incomeSuggestionsService';
import { queryKeys } from '../../../services/queryKeys';
import { useDebouncedValue } from '../entry-dialog/useDebouncedValue';
import { incomeDuplicateQuery } from './draftRules';
import type { IncomeDraft } from './draftState';

const MIN_SEARCH_LENGTH = 2;

export interface IncomeDraftSuggestions {
  suggestions: IncomeSuggestions | undefined;
  /** Data (ISO) de uma receita igual lançada nos últimos 7 dias. */
  duplicateCreatedAt: string | null;
}

/** Sugestões do histórico (autocomplete e último valor) e a checagem de duplicata, para a receita com o resumo aberto. */
export function useIncomeSuggestions(draft: IncomeDraft | null, excludeId: number | null): IncomeDraftSuggestions {
  const accountId = getActiveAccountId();
  const typed = draft?.description.trim() ?? '';
  const description = useDebouncedValue(typed.length >= MIN_SEARCH_LENGTH ? typed : '');
  const suggestionsQuery: IncomeSuggestionsQuery = { description };
  const suggestions = useQuery({
    queryKey: queryKeys.incomeSuggestions(accountId, suggestionsQuery),
    queryFn: () => fetchIncomeSuggestions(suggestionsQuery),
    enabled: draft !== null && description !== '',
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // Serializada para a espera comparar valores, não objetos novos a cada render.
  const duplicateKey = useDebouncedValue(JSON.stringify(draft ? incomeDuplicateQuery(draft, excludeId) : null));
  const pendingDuplicate = JSON.parse(duplicateKey) as IncomeDuplicateQuery | null;
  const duplicate = useQuery({
    queryKey: queryKeys.incomeDuplicate(accountId, pendingDuplicate),
    queryFn: () => fetchIncomeDuplicate(pendingDuplicate!),
    enabled: pendingDuplicate !== null,
    staleTime: 30_000,
  });

  return {
    suggestions: draft && description ? suggestions.data : undefined,
    duplicateCreatedAt: pendingDuplicate ? duplicate.data?.createdAt ?? null : null,
  };
}
