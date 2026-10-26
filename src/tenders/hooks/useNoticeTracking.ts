import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateGroupExceptLists, listDependsOnTracking, patchCachedNotice } from '../services/listCache';
import { fetchNotice, removeTracking, saveTracking } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { NoticeTracking, TrackingStatus, TrackingView } from '../types';

// Acompanhamento do edital na conta. Depois de mudar: o edital muda nas listas
// em cache sem reler todas as páginas; edital, histórico, quadro e painel do
// Início são recarregados.

function useAfterTrackingChange() {
  const queryClient = useQueryClient();
  return (noticeId: number, tracking: NoticeTracking | null) => {
    patchCachedNotice(queryClient, noticeId, (notice) => ({ ...notice, tracking }));
    return Promise.all([
      invalidateGroupExceptLists(queryClient, tendersQueryKeys.notices, listDependsOnTracking),
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.dashboard }),
    ]);
  };
}

export interface SaveTrackingVariables {
  noticeId: number;
  status: TrackingStatus;
  /** Sem observação (undefined): mantém a gravada. */
  note?: string | null;
}

export function useSaveTracking() {
  const queryClient = useQueryClient();
  const afterChange = useAfterTrackingChange();
  return useMutation<TrackingView, TendersApiError, SaveTrackingVariables>({
    mutationFn: async ({ noticeId, status, note }) => {
      // A API grava status e observação juntos: a ação rápida lê a observação
      // atual do edital para não apagá-la.
      const keptNote =
        note !== undefined
          ? note
          : ((
              await queryClient.fetchQuery({
                queryKey: tendersQueryKeys.notice(noticeId),
                queryFn: () => fetchNotice(noticeId),
                staleTime: 0,
              })
            ).tracking?.note ?? null);
      return saveTracking(noticeId, { status, note: keptNote });
    },
    onSuccess: (view, { noticeId }) => afterChange(noticeId, { status: view.status, updatedAt: view.updatedAt }),
  });
}

export function useRemoveTracking() {
  const afterChange = useAfterTrackingChange();
  return useMutation<{ noticeId: number }, TendersApiError, number>({
    mutationFn: removeTracking,
    onSuccess: (_result, noticeId) => afterChange(noticeId, null),
  });
}
