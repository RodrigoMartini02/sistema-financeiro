import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchNotice, removeTracking, saveTracking } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { TrackingStatus, TrackingView } from '../types';

// Acompanhamento do edital na conta. Depois de mudar: busca, edital,
// histórico e painel do Início são recarregados.

function useInvalidateTracking() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.notices }),
      queryClient.invalidateQueries({ queryKey: tendersQueryKeys.dashboard }),
    ]);
}

export interface SaveTrackingVariables {
  noticeId: number;
  status: TrackingStatus;
  /** Sem observação (undefined): mantém a gravada. */
  note?: string | null;
}

export function useSaveTracking() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTracking();
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
    onSuccess: invalidate,
  });
}

export function useRemoveTracking() {
  const invalidate = useInvalidateTracking();
  return useMutation<{ noticeId: number }, TendersApiError, number>({
    mutationFn: removeTracking,
    onSuccess: invalidate,
  });
}
