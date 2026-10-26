import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addContractFavorite, removeContractFavorite } from '../services/contractsService';
import { invalidateGroupExceptLists, listDependsOnFavorites, patchCachedContract } from '../services/listCache';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { ContractFavoriteView } from '../types';

// Favorito de contrato da pessoa logada. Depois de gravar, o contrato muda nas
// listas em cache sem reler todas as páginas; o detalhe e a lista de favoritos
// são recarregados.

export interface ToggleContractFavoriteVariables {
  /** A chave do contrato (número de controle do PNCP). */
  contractKey: string;
  /** Estado escolhido: true favorita, false tira dos favoritos. */
  favorite: boolean;
}

export function useToggleContractFavorite() {
  const queryClient = useQueryClient();
  return useMutation<ContractFavoriteView, TendersApiError, ToggleContractFavoriteVariables>({
    mutationFn: ({ contractKey, favorite }) => (favorite ? addContractFavorite(contractKey) : removeContractFavorite(contractKey)),
    onSuccess: (view) => {
      patchCachedContract(queryClient, view.pncpControlNumber, (contract) => ({ ...contract, isFavorite: view.isFavorite }));
      return invalidateGroupExceptLists(queryClient, tendersQueryKeys.contracts, listDependsOnFavorites);
    },
  });
}
