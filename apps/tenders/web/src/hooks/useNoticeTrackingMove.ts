import { useCallback, useMemo, useState } from 'react';
import type { NoticeListItem, TrackingStatus } from '../types';
import { TRACKING_STATUS_LABELS } from '../utils/labels';
import { useSaveTracking } from './useNoticeTracking';

/**
 * Mudança de status no Acompanhamento (arrastar ou "Mover para…"). Enquanto a
 * API grava, o card já aparece na coluna de destino (`pendingMoves`); com
 * erro, volta e a mensagem aparece. A observação gravada é mantida.
 */
export function useNoticeTrackingMove() {
  const { mutateAsync } = useSaveTracking();
  const [pendingMoves, setPendingMoves] = useState<Record<number, TrackingStatus>>({});
  const [moveError, setMoveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const move = useCallback(
    async (notice: NoticeListItem, status: TrackingStatus) => {
      if (notice.tracking?.status === status) return;
      setPendingMoves((moves) => ({ ...moves, [notice.id]: status }));
      setMoveError(null);
      try {
        await mutateAsync({ noticeId: notice.id, status });
        setAnnouncement(`Edital movido para ${TRACKING_STATUS_LABELS[status]}.`);
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Não foi possível mover o edital agora.');
      } finally {
        setPendingMoves(({ [notice.id]: _finished, ...rest }) => rest);
      }
    },
    [mutateAsync],
  );

  const movingIds = useMemo(() => new Set(Object.keys(pendingMoves).map(Number)), [pendingMoves]);
  return { pendingMoves, movingIds, move, moveError, announcement };
}
