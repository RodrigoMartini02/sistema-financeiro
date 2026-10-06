import type {
  FavoriteView,
  NoticeDetail,
  NoticeDetailList,
  NoticeFile,
  NoticeItem,
  NoticeSearchResult,
  TrackingHistoryEntry,
  TrackingInput,
  TrackingView,
} from '../types';
import { tendersRequest } from './tendersApi';

// Editais: busca, detalhe, itens e arquivos do PNCP, acompanhamento, histórico
// e favoritos.

/** `apiQuery`: parâmetros da API já montados (utils/searchFilters → `toApiQuery`). */
export function fetchNotices(apiQuery: string): Promise<NoticeSearchResult> {
  return tendersRequest<NoticeSearchResult>(apiQuery ? `/notices?${apiQuery}` : '/notices');
}

export function fetchNotice(id: number): Promise<NoticeDetail> {
  return tendersRequest<NoticeDetail>(`/notices/${id}`);
}

export function fetchNoticeItems(id: number): Promise<NoticeDetailList<NoticeItem>> {
  return tendersRequest<NoticeDetailList<NoticeItem>>(`/notices/${id}/items`);
}

export function fetchNoticeFiles(id: number): Promise<NoticeDetailList<NoticeFile>> {
  return tendersRequest<NoticeDetailList<NoticeFile>>(`/notices/${id}/files`);
}

/** Grava status e observação; a observação ausente apaga a gravada (a API troca as duas). */
export function saveTracking(id: number, input: TrackingInput): Promise<TrackingView> {
  return tendersRequest<TrackingView>(`/notices/${id}/tracking`, { method: 'PUT', body: JSON.stringify(input) });
}

export function removeTracking(id: number): Promise<{ noticeId: number }> {
  return tendersRequest<{ noticeId: number }>(`/notices/${id}/tracking`, { method: 'DELETE' });
}

export function fetchTrackingHistory(id: number): Promise<TrackingHistoryEntry[]> {
  return tendersRequest<TrackingHistoryEntry[]>(`/notices/${id}/history`);
}

/** Favorita para a pessoa logada; favoritar de novo não muda nada. */
export function addFavorite(id: number): Promise<FavoriteView> {
  return tendersRequest<FavoriteView>(`/notices/${id}/favorite`, { method: 'PUT' });
}

export function removeFavorite(id: number): Promise<FavoriteView> {
  return tendersRequest<FavoriteView>(`/notices/${id}/favorite`, { method: 'DELETE' });
}
