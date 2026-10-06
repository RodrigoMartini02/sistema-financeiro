import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useTelaDesktop } from '../../hooks/useTelaDesktop';
import { EmptyState } from '../../ui/EmptyState';
import { fetchCollectionRuns, fetchCollectionStatus } from '../services/settingsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { CollectionRun, CollectionRunStatus, CollectionStatus, Paginated } from '../types';
import { runDurationLabel, runErrorLines } from '../utils/collectionRuns';
import { formatIsoDateTime } from '../utils/dates';
import { RUN_STATUS_LABELS, RUN_TYPE_LABELS } from '../utils/labels';
import { DEFAULT_PER_PAGE } from '../utils/searchFilters';
import { LoadError, LoadingBlock } from './LoadStates';
import { Pagination } from './Pagination';
import { Pill, type PillTone } from './Pill';

// Coleta (titular ou admin): última varredura e últimos lembretes de prazo
// (a rotina diária das 06:00), próxima execução prevista e o histórico das
// execuções, com totais e erros.

const STATUS_TONES: Record<CollectionRunStatus, PillTone> = {
  EXECUTANDO: 'brand',
  SUCESSO: 'success',
  PARCIAL: 'warning',
  FALHA: 'danger',
};

const SUMMARY_TYPES = ['VARREDURA', 'LEMBRETES'] as const;

const formatCount = (value: number) => value.toLocaleString('pt-BR');

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

function StatusCards({ status }: { status: CollectionStatus }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SUMMARY_TYPES.map((type) => {
          const run = status.latestRuns.find((item) => item.type === type);
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
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {formatCount(status.totals.notices)} editais na base, {formatCount(status.totals.openNotices)} com prazo aberto.
      </p>
    </div>
  );
}

function RunsHistory() {
  const isDesktop = useTelaDesktop();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const runs = useQuery<Paginated<CollectionRun>, TendersApiError>({
    queryKey: tendersQueryKeys.collectionRuns(page, perPage),
    queryFn: () => fetchCollectionRuns(page, perPage),
    placeholderData: keepPreviousData,
  });

  if (runs.isPending) return <LoadingBlock label="Carregando o histórico…" />;
  if (runs.isError) {
    return <LoadError message={runs.error.message} onRetry={() => void runs.refetch()} retrying={runs.isFetching} />;
  }
  if (runs.data.total === 0) {
    return <EmptyState icon={History} title="A coleta ainda não rodou." />;
  }

  const items = runs.data.items;
  return (
    <div className={`grid grid-cols-1 gap-3 transition-opacity ${runs.isPlaceholderData ? 'opacity-60' : ''}`}>
      {isDesktop ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2">Tipo</th>
                <th scope="col" className="px-3 py-2">Início</th>
                <th scope="col" className="px-3 py-2">Duração</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Lidos</th>
                <th scope="col" className="px-3 py-2 text-right">Novos</th>
                <th scope="col" className="px-3 py-2 text-right">Atualizados</th>
                <th scope="col" className="px-3 py-2 text-right">Notificações</th>
                <th scope="col" className="px-3 py-2 text-right">Erros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-700 dark:text-slate-200">
              {items.map((run) => (
                <tr key={run.id} className="align-top">
                  <td className="px-3 py-2 font-semibold">{RUN_TYPE_LABELS[run.type]}</td>
                  <td className="px-3 py-2 tabular-nums">{formatIsoDateTime(run.startedAt)}</td>
                  <td className="px-3 py-2 tabular-nums">{runDurationLabel(run)}</td>
                  <td className="px-3 py-2">
                    <RunStatusPill status={run.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCount(run.recordsRead)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCount(run.newCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCount(run.updatedCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCount(run.notificationCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <RunErrors run={run} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {items.map((run) => (
            <li key={run.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{RUN_TYPE_LABELS[run.type]}</span>
                <RunStatusPill status={run.status} />
              </div>
              <p className="mt-1 tabular-nums text-slate-500 dark:text-slate-400">
                {formatIsoDateTime(run.startedAt)} · {runDurationLabel(run)}
              </p>
              <p className="mt-1 tabular-nums text-slate-700 dark:text-slate-200">
                {formatCount(run.recordsRead)} lidos · {formatCount(run.newCount)} novos · {formatCount(run.updatedCount)} atualizados ·{' '}
                {formatCount(run.notificationCount)} notificações
              </p>
              <div className="mt-1 flex items-center gap-1 text-slate-700 dark:text-slate-200">
                Erros: <RunErrors run={run} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={runs.data.page}
        totalPages={runs.data.totalPages}
        total={runs.data.total}
        perPage={runs.data.perPage}
        onPage={setPage}
        onPerPage={(nextPerPage) => {
          setPerPage(nextPerPage);
          setPage(1);
        }}
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
