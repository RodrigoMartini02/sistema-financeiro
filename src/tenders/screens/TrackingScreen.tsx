import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ClipboardList, Columns3, Table2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTelaDesktop } from '../../hooks/useTelaDesktop';
import { EmptyState } from '../../ui/EmptyState';
import { ToggleGroup } from '../../ui/form';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { TrackingBoard } from '../components/TrackingBoard';
import { TrackingTable } from '../components/TrackingTable';
import { useNoticeTrackingMove } from '../hooks/useNoticeTrackingMove';
import { useNow } from '../hooks/useNow';
import { useStoredPreference } from '../hooks/useStoredPreference';
import { fetchNotices } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import { TRACKING_STATUSES, type TrackingStatus } from '../types';
import { buildBoardColumns, trackingColumnQuery } from '../utils/trackingBoard';

// Acompanhamento (escopo, seção 9.4): o quadro da conta, com os editais em
// Analisar, Vou participar e Descartado, inclusive os já encerrados.

const VIEW_OPTIONS = ['quadro', 'tabela'] as const;

export function TrackingScreen() {
  const now = useNow();
  const isDesktop = useTelaDesktop();
  const [view, setView] = useStoredPreference('licitacoes.acompanhamento.visao', VIEW_OPTIONS, 'quadro');
  const columnQueries = useQueries({
    queries: TRACKING_STATUSES.map((status) => {
      const apiQuery = trackingColumnQuery(status);
      return { queryKey: tendersQueryKeys.noticeSearch(apiQuery), queryFn: () => fetchNotices(apiQuery) };
    }),
  });
  const { pendingMoves, movingIds, move, moveError, announcement } = useNoticeTrackingMove();

  const [analyzing, participating, discarded] = columnQueries;
  const columns = useMemo(
    () =>
      buildBoardColumns(
        { ANALISAR: analyzing?.data?.items, PARTICIPAR: participating?.data?.items, DESCARTADO: discarded?.data?.items },
        pendingMoves,
        now,
      ),
    [analyzing?.data, participating?.data, discarded?.data, pendingMoves, now],
  );
  const totals: Record<TrackingStatus, number | null> = {
    ANALISAR: analyzing?.data?.total ?? null,
    PARTICIPAR: participating?.data?.total ?? null,
    DESCARTADO: discarded?.data?.total ?? null,
  };
  const allNotices = TRACKING_STATUSES.flatMap((status) => columns[status]);
  const failed = columnQueries.find((query) => query.isError);
  const showTable = view === 'tabela' && isDesktop;

  let content;
  if (columnQueries.some((query) => query.isPending)) {
    content = <LoadingBlock label="Carregando o acompanhamento…" />;
  } else if (failed) {
    content = (
      <LoadError
        title="Não foi possível carregar o acompanhamento"
        message={failed.error?.message ?? 'Tente de novo em instantes.'}
        onRetry={() => columnQueries.forEach((query) => void query.refetch())}
        retrying={columnQueries.some((query) => query.isFetching)}
      />
    );
  } else if (allNotices.length === 0) {
    content = (
      <EmptyState
        icon={ClipboardList}
        title="Nenhum edital acompanhado ainda."
        description="Em Buscar, marque Analisar, Vou participar ou Descartar num edital para ele aparecer aqui."
        action={
          <Link to="/buscar" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Buscar editais
          </Link>
        }
      />
    );
  } else {
    content = showTable ? (
      <TrackingTable notices={allNotices} movingIds={movingIds} onMove={move} />
    ) : (
      <TrackingBoard columns={columns} totals={totals} movingIds={movingIds} onMove={move} />
    );
  }

  return (
    <section className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Editais acompanhados pela conta. {isDesktop && !showTable ? 'Arraste um card para mudar o status, ou use “Mover para…”.' : 'Use “Mover para…” para mudar o status.'}
        </p>
        {isDesktop && (
          <ToggleGroup
            value={view}
            onChange={(value) => setView(value === 'tabela' ? 'tabela' : 'quadro')}
            options={[
              { value: 'quadro', label: 'Quadro', icon: <Columns3 size={13} aria-hidden="true" /> },
              { value: 'tabela', label: 'Tabela', icon: <Table2 size={13} aria-hidden="true" /> },
            ]}
          />
        )}
      </div>
      {moveError && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {moveError}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {content}
    </section>
  );
}
