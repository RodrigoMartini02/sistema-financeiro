import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tendersQueryKeys } from '../services/queryKeys';
import {
  createSavedSearch,
  deleteSavedSearch,
  duplicateSavedSearch,
  patchSavedSearch,
  updateSavedSearch,
} from '../services/savedSearchesService';
import type { TendersApiError } from '../services/tendersApiError';
import type { SavedSearch, SavedSearchBody } from '../types';

// Buscas salvas. Depois de mudar: a lista, o painel do Início e os editais
// (o detalhe mostra as buscas que batem; a busca pela busca salva muda junto).

function useInvalidateSavedSearches() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.savedSearches }),
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.dashboard }),
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.notices }),
    ]);
}

/** Cria (sem `id`) ou altera a busca salva. */
export function useSaveSavedSearch() {
  const invalidate = useInvalidateSavedSearches();
  return useMutation<SavedSearch, TendersApiError, { id?: number; body: SavedSearchBody }>({
    mutationFn: ({ id, body }) => (id === undefined ? createSavedSearch(body) : updateSavedSearch(id, body)),
    onSuccess: invalidate,
  });
}

export interface PatchSavedSearchVariables {
  id: number;
  changes: { active?: boolean; notify?: boolean };
}

export function usePatchSavedSearch() {
  const invalidate = useInvalidateSavedSearches();
  return useMutation<SavedSearch, TendersApiError, PatchSavedSearchVariables>({
    mutationFn: ({ id, changes }) => patchSavedSearch(id, changes),
    onSettled: invalidate,
  });
}

export function useDeleteSavedSearch() {
  const invalidate = useInvalidateSavedSearches();
  return useMutation<{ id: number }, TendersApiError, number>({
    mutationFn: deleteSavedSearch,
    onSuccess: invalidate,
  });
}

export function useDuplicateSavedSearch() {
  const invalidate = useInvalidateSavedSearches();
  return useMutation<SavedSearch, TendersApiError, number>({
    mutationFn: duplicateSavedSearch,
    onSuccess: invalidate,
  });
}
