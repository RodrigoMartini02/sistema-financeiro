import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addFavorite, removeFavorite } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { FavoriteView } from '../types';

// Favorito da pessoa logada. Depois de gravar, as buscas (a tela Favoritos
// também) e o edital são recarregados.

export interface ToggleFavoriteVariables {
  noticeId: number;
  /** Estado escolhido: true favorita, false tira dos favoritos. */
  favorite: boolean;
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation<FavoriteView, TendersApiError, ToggleFavoriteVariables>({
    mutationFn: ({ noticeId, favorite }) => (favorite ? addFavorite(noticeId) : removeFavorite(noticeId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.notices }),
  });
}
