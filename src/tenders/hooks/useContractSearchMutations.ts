import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createContractSavedSearch,
  deleteContractSavedSearch,
  duplicateContractSavedSearch,
  patchContractSavedSearch,
  updateContractSavedSearch,
} from '../services/contractSearchesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { ContractSavedSearch, ContractSearchBody } from '../types';

// Buscas salvas de contratos. Depois de mudar: a lista e as buscas de contratos
// (a busca pela busca salva muda junto).

function useInvalidateContractSearches() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.contractSavedSearches }),
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.contracts }),
    ]);
}

/** Cria (sem `id`) ou altera a busca salva de contratos. */
export function useSaveContractSavedSearch() {
  const invalidate = useInvalidateContractSearches();
  return useMutation<ContractSavedSearch, TendersApiError, { id?: number; body: ContractSearchBody }>({
    mutationFn: ({ id, body }) => (id === undefined ? createContractSavedSearch(body) : updateContractSavedSearch(id, body)),
    onSuccess: invalidate,
  });
}

export interface PatchContractSavedSearchVariables {
  id: number;
  changes: { active?: boolean; notify?: boolean };
}

export function usePatchContractSavedSearch() {
  const invalidate = useInvalidateContractSearches();
  return useMutation<ContractSavedSearch, TendersApiError, PatchContractSavedSearchVariables>({
    mutationFn: ({ id, changes }) => patchContractSavedSearch(id, changes),
    onSettled: invalidate,
  });
}

export function useDeleteContractSavedSearch() {
  const invalidate = useInvalidateContractSearches();
  return useMutation<{ id: number }, TendersApiError, number>({
    mutationFn: deleteContractSavedSearch,
    onSuccess: invalidate,
  });
}

export function useDuplicateContractSavedSearch() {
  const invalidate = useInvalidateContractSearches();
  return useMutation<ContractSavedSearch, TendersApiError, number>({
    mutationFn: duplicateContractSavedSearch,
    onSuccess: invalidate,
  });
}
