import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { getLocalTodayIso } from '../../utils/date';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { fetchCollectionRuns, fetchCollectionStatus } from '../services/settingsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { CollectionRun, CollectionRunStatus, CollectionStatus, Paginated } from '../types';
import {
  archiveSummaryLabel,
  backfillSummary,
  dailyCollectionSummary,
  federalSummary,
  runDurationLabel,
  runErrorLines,
  winnersDailySummary,
  winnersRowsLabel,
} from '../utils/collectionRuns';
import { formatIsoDate, formatIsoDateTime } from '../utils/dates';
import { LIST_PAGE_SIZE } from '../utils/infiniteList';
import { RUN_STATUS_LABELS, RUN_TYPE_LABELS } from '../utils/labels';
import { ListCard, ListCardLine } from './ListCard';
import { LoadError, LoadingBlock } from './LoadStates';
import { Pill, type PillTone } from './Pill';
import { VirtualCardList } from './VirtualCardList';

// Coleta (titular ou admin): última varredura, últimos lembretes de prazo, os
// contratos, os vencedores e os contratos federais (coleta diária ou ciclo e
// andamento da carga inicial de cada um), todos da rotina diária das 06:00, com o arquivo bruto de cada coleta,
// próxima execução prevista e o histórico das execuções, com totais e erros.

const STATUS_TONES: Record<CollectionRunStatus, PillTone> = {
  EXECUTANDO: 'brand',
  SUCESSO: 'success',
  PARCIAL: 'warning',
  FALHA: 'danger',
};

const SUMMARY_TYPES = ['VARREDURA', 'LEMBRETES'] as const;

const formatCount = (value: number | null) => (value === null ? '—' : value.toLocaleString('pt-BR'));

function RunStatusPill({ status }: { status: CollectionRunStatus }) {
  return <Pill tone={STATUS_TONES[status]}>{RUN_STATUS_LABELS[status]}</Pill>;
}

function RunErrors({ run }: { run: CollectionRun }) {
  const lines = runErrorLines(run);
  if (run.errorCount === 0) return <span>0</span>;
  if (lines.length === 0) return <span className="font-semibold text-red-600 dark:text-red-400">{formatCount(run.errorCount)}</span>;
  return (
    <details>
      <summary className="cursor-pointer font-semibold text-red-600 dark:text-red-400">{formatCount(run.errorCount)}</summary>
      <ul className="mt-1 grid max-w-md grid-cols-1 gap-0.5 text-left text-[11px] font-normal text-slate-600 dark:text-slate-300">
        {lines.map((line, index) => (
          <li key={index} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

const TERM_CLASS = 'text-slate-500 dark:text-slate-400';
const VALUE_CLASS = 'text-right tabular-nums text-slate-800 dark:text-slate-100';

function ContractsCard({ status }: { status: CollectionStatus }) {
  const daily = status.latestRuns.find((run) => run.type === 'CONTRATOS_DIARIA');
  const backfillRunning = status.latestRuns.some((run) => run.type === 'CONTRATOS_CARGA' && run.status === 'EXECUTANDO');
  const summary = backfillSummary(status.contracts.backfill);
  const backfillStatus = backfillRunning ? 'Carga em andamento' : summary.status;
  const dailySummary = daily ? dailyCollectionSummary(daily) : null;
  const archiveLabel = daily ? archiveSummaryLabel(daily) : null;
  const notes = [...(dailySummary?.notes ?? []), ...summary.notes];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Contratos</h3>
        {daily && <RunStatusPill status={daily.status} />}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className={TERM_CLASS}>Última coleta diária</dt>
        <dd className={VALUE_CLASS}>{daily ? formatIsoDateTime(daily.startedAt) : 'Ainda não rodou.'}</dd>
        {dailySummary?.period && (
          <>
            <dt className={TERM_CLASS}>Período lido</dt>
            <dd className={VALUE_CLASS}>{dailySummary.period}</dd>
          </>
        )}
        {daily && (
          <>
            <dt className={TERM_CLASS}>Lidos · novos · atualizados</dt>
            <dd className={VALUE_CLASS}>
              {formatCount(daily.recordsRead)} · {formatCount(daily.newCount)} · {formatCount(daily.updatedCount)}
            </dd>
          </>
        )}
        {archiveLabel && (
          <>
            <dt className={TERM_CLASS}>Arquivo bruto</dt>
            <dd className={VALUE_CLASS}>{archiveLabel}</dd>
          </>
        )}
        <dt className={TERM_CLASS}>Contratos na base</dt>
        <dd className={VALUE_CLASS}>{formatCount(status.contracts.contracts)}</dd>
        <dt className={TERM_CLASS}>
          Contratos vigentes na base{status.contracts.countedOn ? ` (em ${formatIsoDate(status.contracts.countedOn)})` : ''}
        </dt>
        <dd className={VALUE_CLASS}>{formatCount(status.contracts.activeContracts)}</dd>
        <dt className={TERM_CLASS}>Carga inicial</dt>
        <dd className={VALUE_CLASS}>
          {backfillStatus}
          {summary.progress ? ` · ${summary.progress}` : ''}
        </dd>
      </dl>
      {notes.length > 0 && (
        <ul className="mt-2 grid grid-cols-1 gap-0.5 text-xs text-slate-600 dark:text-slate-300">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        Próxima prevista: <strong className="tabular-nums">{formatIsoDateTime(status.nextRuns.CONTRATOS_DIARIA)}</strong>
      </p>
    </section>
  );
}

/**
 * Vencedores das licitações: a coleta diária e a carga inicial, no mesmo molde do bloco de contratos. Card próprio,
 * porque o status e a próxima execução são das execuções de vencedores. Sem nenhuma execução (as etapas só rodam
 * quando são ligadas na rotina), o card diz que ainda não rodou e não mostra próxima execução.
 */
function WinnersCard({ status }: { status: CollectionStatus }) {
  const daily = status.latestRuns.find((run) => run.type === 'VENCEDORES_DIARIA');
  const backfillRunning = status.latestRuns.some((run) => run.type === 'VENCEDORES_CARGA' && run.status === 'EXECUTANDO');
  const summary = backfillSummary(status.winners.backfill);
  const backfillStatus = backfillRunning ? 'Carga em andamento' : summary.status;
  const dailySummary = daily ? winnersDailySummary(daily) : null;
  const archiveLabel = daily ? archiveSummaryLabel(daily) : null;
  const notes = [...(dailySummary?.notes ?? []), ...summary.notes];
  const everRan = daily !== undefined || status.latestRuns.some((run) => run.type === 'VENCEDORES_CARGA');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Vencedores</h3>
        {daily && <RunStatusPill status={daily.status} />}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className={TERM_CLASS}>Última coleta diária</dt>
        <dd className={VALUE_CLASS}>{daily ? formatIsoDateTime(daily.startedAt) : 'Ainda não rodou.'}</dd>
        {dailySummary?.period && (
          <>
            <dt className={TERM_CLASS}>Período lido</dt>
            <dd className={VALUE_CLASS}>{dailySummary.period}</dd>
          </>
        )}
        {dailySummary?.sourceLastDay && (
          <>
            <dt className={TERM_CLASS}>Dado mais recente da fonte</dt>
            <dd className={VALUE_CLASS}>{formatIsoDate(dailySummary.sourceLastDay)}</dd>
          </>
        )}
        {daily && (
          <>
            <dt className={TERM_CLASS}>Lidos · novos · atualizados</dt>
            <dd className={VALUE_CLASS}>
              {formatCount(daily.recordsRead)} · {formatCount(daily.newCount)} · {formatCount(daily.updatedCount)}
            </dd>
          </>
        )}
        {archiveLabel && (
          <>
            <dt className={TERM_CLASS}>Arquivo bruto</dt>
            <dd className={VALUE_CLASS}>{archiveLabel}</dd>
          </>
        )}
        <dt className={TERM_CLASS}>Vencedores na base</dt>
        <dd className={VALUE_CLASS}>{winnersRowsLabel(status.winners.rows)}</dd>
        <dt className={TERM_CLASS}>Carga inicial</dt>
        <dd className={VALUE_CLASS}>
          {backfillStatus}
          {summary.progress ? ` · ${summary.progress}` : ''}
        </dd>
      </dl>
      {notes.length > 0 && (
        <ul className="mt-2 grid grid-cols-1 gap-0.5 text-xs text-slate-600 dark:text-slate-300">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {everRan && (
        <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          Próxima prevista: <strong className="tabular-nums">{formatIsoDateTime(status.nextRuns.VENCEDORES_DIARIA)}</strong>
        </p>
      )}
    </section>
  );
}

/**
 * Contratos federais: o ciclo semanal e a carga inicial por órgão, no mesmo molde dos outros blocos. A fonte pode ficar
 * semanas sem dado novo, e o card mostra até quando ela tem. Sem nenhuma execução (as etapas só rodam quando são
 * ligadas na rotina), diz que ainda não rodou e não mostra a próxima.
 */
function FederalCard({ status }: { status: CollectionStatus }) {
  const cycle = status.latestRuns.find((run) => run.type === 'FEDERAIS_CICLO');
  const load = status.latestRuns.find((run) => run.type === 'FEDERAIS_CARGA');
  const loadRunning = load?.status === 'EXECUTANDO';
  const summary = federalSummary(status.federal, getLocalTodayIso());
  const archiveLabel = cycle ? archiveSummaryLabel(cycle) : load ? archiveSummaryLabel(load) : null;
  const headline = cycle ?? load;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Contratos federais</h3>
        {headline && <RunStatusPill status={headline.status} />}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className={TERM_CLASS}>Último ciclo semanal</dt>
        <dd className={VALUE_CLASS}>{cycle ? formatIsoDateTime(cycle.startedAt) : 'Ainda não rodou.'}</dd>
        <dt className={TERM_CLASS}>Última carga</dt>
        <dd className={VALUE_CLASS}>{load ? formatIsoDateTime(load.startedAt) : 'Ainda não rodou.'}</dd>
        {cycle && (
          <>
            <dt className={TERM_CLASS}>Ciclo: lidos · novos · atualizados</dt>
            <dd className={VALUE_CLASS}>
              {formatCount(cycle.recordsRead)} · {formatCount(cycle.newCount)} · {formatCount(cycle.updatedCount)}
            </dd>
          </>
        )}
        {archiveLabel && (
          <>
            <dt className={TERM_CLASS}>Arquivo bruto</dt>
            <dd className={VALUE_CLASS}>{archiveLabel}</dd>
          </>
        )}
        <dt className={TERM_CLASS}>Órgãos com contrato na fonte</dt>
        <dd className={VALUE_CLASS}>
          {formatCount(status.federal.withData)}
          {status.federal.notMeasured > 0 ? ` · ${formatCount(status.federal.notMeasured)} ainda sem medida` : ''}
        </dd>
        <dt className={TERM_CLASS}>Carga inicial</dt>
        <dd className={VALUE_CLASS}>
          {loadRunning ? 'Carga em andamento' : summary.loadStatus}
          {summary.progress ? ` · ${summary.progress}` : ''}
        </dd>
        <dt className={TERM_CLASS}>Dados da fonte até</dt>
        <dd className={VALUE_CLASS}>{summary.sourceUntil ? formatIsoDate(summary.sourceUntil) : '—'}</dd>
      </dl>
      {summary.notes.length > 0 && (
        <ul className="mt-2 grid grid-cols-1 gap-0.5 text-xs text-slate-600 dark:text-slate-300">
          {summary.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {headline && (
        <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          Próxima prevista: <strong className="tabular-nums">{formatIsoDateTime(status.nextRuns.FEDERAIS_CICLO)}</strong>
        </p>
      )}
    </section>
  );
}

function StatusCards({ status }: { status: CollectionStatus }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SUMMARY_TYPES.map((type) => {
          const run = status.latestRuns.find((item) => item.type === type);
          const archiveLabel = run ? archiveSummaryLabel(run) : null;
          return (
            <section key={type} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{RUN_TYPE_LABELS[type]}</h3>
                {run && <RunStatusPill status={run.status} />}
              </div>
              {run ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-slate-500 dark:text-slate-400">Última execução</dt>
                  <dd className="text-right tabular-nums text-slate-800 dark:text-slate-100">{formatIsoDateTime(run.startedAt)}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Duração</dt>
                  <dd className="text-right tabular-nums text-slate-800 dark:text-slate-100">{runDurationLabel(run)}</dd>
                  {type === 'LEMBRETES' ? (
                    <>
                      <dt className="text-slate-500 dark:text-slate-400">Avisos de prazo gerados</dt>
                      <dd className="text-right tabular-nums text-slate-800 dark:text-slate-100">{formatCount(run.notificationCount)}</dd>
                    </>
                  ) : (
                    <>
                      <dt className="text-slate-500 dark:text-slate-400">Lidos · novos · atualizados</dt>
                      <dd className="text-right tabular-nums text-slate-800 dark:text-slate-100">
                        {formatCount(run.recordsRead)} · {formatCount(run.newCount)} · {formatCount(run.updatedCount)}
                      </dd>
                    </>
                  )}
                  {archiveLabel && (
                    <>
                      <dt className="text-slate-500 dark:text-slate-400">Arquivo bruto</dt>
                      <dd className="text-right tabular-nums text-slate-800 dark:text-slate-100">{archiveLabel}</dd>
                    </>
                  )}
                  <dt className="text-slate-500 dark:text-slate-400">Erros</dt>
                  <dd className={`text-right tabular-nums ${run.errorCount > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {formatCount(run.errorCount)}
                  </dd>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Ainda não rodou.</p>
              )}
              <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                Próxima prevista: <strong className="tabular-nums">{formatIsoDateTime(status.nextRuns[type])}</strong>
              </p>
            </section>
          );
        })}
        <ContractsCard status={status} />
        <WinnersCard status={status} />
        <FederalCard status={status} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {formatCount(status.totals.notices)} editais na base, {formatCount(status.totals.openNotices)} com prazo aberto.
      </p>
    </div>
  );
}

/** Identifica a execução na lista. */
const runKey = (run: CollectionRun) => run.id;

/** Uma execução da coleta: o tipo, o status, quando e quanto tempo, e os totais. */
function RunCard({ run }: { run: CollectionRun }) {
  return (
    <ListCard
      badges={<RunStatusPill status={run.status} />}
      title={RUN_TYPE_LABELS[run.type]}
      context={
        <ListCardLine>
          {formatIsoDateTime(run.startedAt)} · {runDurationLabel(run)}
        </ListCardLine>
      }
      metrics={[
        { label: 'Lidos', value: formatCount(run.recordsRead) },
        { label: 'Novos', value: formatCount(run.newCount) },
        { label: 'Atualizados', value: formatCount(run.updatedCount) },
        { label: 'Notificações', value: formatCount(run.notificationCount) },
        { label: 'Erros', value: <RunErrors run={run} /> },
      ]}
    />
  );
}

function RunsHistory() {
  const runs = useInfiniteList<CollectionRun, Paginated<CollectionRun>>({
    queryKey: tendersQueryKeys.collectionRuns,
    fetchPage: (page) => fetchCollectionRuns(page, LIST_PAGE_SIZE),
    getKey: runKey,
  });

  if (runs.isPending) return <LoadingBlock label="Carregando o histórico…" />;
  if (runs.error) {
    return <LoadError message={runs.error.message} onRetry={runs.reload} retrying={runs.isFetching} />;
  }
  if (runs.total === 0) {
    return <EmptyState icon={History} title="A coleta ainda não rodou." />;
  }

  return (
    <div className={`transition-opacity ${runs.isPlaceholderData ? 'opacity-60' : ''}`}>
      <VirtualCardList
        items={runs.items}
        getKey={runKey}
        renderItem={(run) => <RunCard run={run} />}
        total={runs.total}
        hasNextPage={runs.hasNextPage}
        isFetchingNextPage={runs.isFetchingNextPage}
        onLoadMore={runs.loadMore}
        nextPageError={runs.nextPageError}
        resetKey="runs"
        label="Execuções da coleta"
      />
    </div>
  );
}

export function CollectionPanel() {
  const status = useQuery<CollectionStatus, TendersApiError>({ queryKey: tendersQueryKeys.collectionStatus, queryFn: fetchCollectionStatus });

  return (
    <div className="grid grid-cols-1 gap-6">
      <section aria-label="Status da coleta" className="grid grid-cols-1 gap-3">
        {status.isPending ? (
          <LoadingBlock label="Carregando o status da coleta…" />
        ) : status.isError ? (
          <LoadError message={status.error.message} onRetry={() => void status.refetch()} retrying={status.isFetching} />
        ) : (
          <StatusCards status={status.data} />
        )}
      </section>
      <section aria-labelledby="historico-coleta" className="grid grid-cols-1 gap-3">
        <h3 id="historico-coleta" className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <History size={15} aria-hidden="true" />
          Histórico de execuções
        </h3>
        <RunsHistory />
      </section>
    </div>
  );
}
