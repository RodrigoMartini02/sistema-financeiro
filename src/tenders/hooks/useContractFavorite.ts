import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addContractFavorite, removeContractFavorite } from '../services/contractsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { ContractFavoriteView } from '../types';

// Favorito de contrato da pessoa logada. Depois de gravar, as buscas de
// contratos (a aba Contratos de Favoritos também) e o detalhe são recarregados.

export interface ToggleContractFavoriteVariables {
  contractId: number;
  /** Estado escolhido: true favorita, false tira dos favoritos. */
  favorite: boolean;
}

export function useToggleContractFavorite() {
  const queryClient = useQueryClient();
  return useMutation<ContractFavoriteView, TendersApiError, ToggleContractFavoriteVariables>({
    mutationFn: ({ contractId, favorite }) => (favorite ? addContractFavorite(contractId) : removeContractFavorite(contractId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.contracts }),
  });
}
