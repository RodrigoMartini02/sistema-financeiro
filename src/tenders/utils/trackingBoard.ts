import { TRACKING_STATUSES, type NoticeListItem, type TrackingStatus } from '../types';
import { DEFAULT_SEARCH_STATE, toApiQuery, withFilters } from './searchFilters';

// Quadro de Acompanhamento (escopo, seção 9.4): uma coluna por status, com os
// editais acompanhados pela conta, inclusive os já encerrados.

/** Até 100 editais por coluna (limite de uma página da API). */
export const BOARD_COLUMN_LIMIT = 100;

export type BoardColumns = Record<TrackingStatus, NoticeListItem[]>;

/** Query da API de uma coluna: o status, com encerrados e descartados, por prazo. */
export function trackingColumnQuery(status: TrackingStatus): string {
  return toApiQuery(
    withFilters(DEFAULT_SEARCH_STATE, {
      trackingStatuses: [status],
      hideDiscarded: false,
      openOnly: false,
      perPage: BOARD_COLUMN_LIMIT,
    }),
  );
}

function closesAtMs(notice: NoticeListItem): number | null {
  const time = notice.proposalClosesAt ? new Date(notice.proposalClosesAt).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

/**
 * Ordem da coluna: prazo à frente primeiro (o mais próximo no topo), depois
 * sem prazo e, por último, os encerrados (o mais recente primeiro).
 */
export function compareBoardNotices(now: Date): (a: NoticeListItem, b: NoticeListItem) => number {
  const nowMs = now.getTime();
  const group = (closesAt: number | null) => (closesAt === null ? 1 : closesAt > nowMs ? 0 : 2);
  return (a, b) => {
    const aClosesAt = closesAtMs(a);
    const bClosesAt = closesAtMs(b);
    const byGroup = group(aClosesAt) - group(bClosesAt);
    if (byGroup !== 0) return byGroup;
    if (aClosesAt === null || bClosesAt === null) return a.id - b.id;
    return aClosesAt > nowMs ? aClosesAt - bClosesAt : bClosesAt - aClosesAt;
  };
}

/**
 * Colunas do quadro a partir das buscas por status. As mudanças ainda em
 * gravação (`pendingMoves`, edital → status novo) já aparecem na coluna de
 * destino; um edital que veio em duas colunas (busca desatualizada) entra uma
 * vez só.
 */
export function buildBoardColumns(
  fetched: Partial<BoardColumns>,
  pendingMoves: Readonly<Record<number, TrackingStatus>>,
  now: Date,
): BoardColumns {
  const columns: BoardColumns = { ANALISAR: [], PARTICIPAR: [], DESCARTADO: [] };
  const placed = new Set<number>();
  for (const status of TRACKING_STATUSES) {
    for (const notice of fetched[status] ?? []) {
      if (placed.has(notice.id)) continue;
      placed.add(notice.id);
      const target = pendingMoves[notice.id] ?? status;
      columns[target].push(
        target === status ? notice : { ...notice, tracking: { status: target, updatedAt: notice.tracking?.updatedAt ?? null } },
      );
    }
  }
  const order = compareBoardNotices(now);
  for (const status of TRACKING_STATUSES) {
    columns[status].sort(order);
  }
  return columns;
}
