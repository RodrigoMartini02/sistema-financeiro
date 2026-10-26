import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateGroupExceptLists, listDependsOnFavorites, patchCachedNotice } from '../services/listCache';
import { addFavorite, removeFavorite } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { FavoriteView } from '../types';

// Favorito da pessoa logada. Depois de gravar, o edital muda nas listas em
// cache sem reler todas as páginas; o detalhe e a lista de favoritos são
// recarregados.

export interface ToggleFavoriteVariables {
  noticeId: number;
  /** Estado escolhido: true favorita, false tira dos favoritos. */
  favorite: boolean;
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation<FavoriteView, TendersApiError, ToggleFavoriteVariables>({
    mutationFn: ({ noticeId, favorite }) => (favorite ? addFavorite(noticeId) : removeFavorite(noticeId)),
    onSuccess: (view) => {
      patchCachedNotice(queryClient, view.noticeId, (notice) => ({ ...notice, isFavorite: view.isFavorite }));
      return invalidateGroupExceptLists(queryClient, tendersQueryKeys.notices, listDependsOnFavorites);
    },
  });
}
