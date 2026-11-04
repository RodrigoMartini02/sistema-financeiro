import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/form';
import { useRemoveTracking, useSaveTracking } from '../hooks/useNoticeTracking';
import { fetchTrackingHistory } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import { MAX_TRACKING_NOTE_LENGTH, TRACKING_STATUSES, type NoticeDetail, type TrackingHistoryEntry, type TrackingStatus } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { TRACKING_HISTORY_LABELS, TRACKING_STATUS_LABELS } from '../utils/labels';
import { LoadError, LoadingBlock } from './LoadStates';

// Aba Acompanhamento do detalhe: status, observação e histórico da conta.

function historyChange(entry: TrackingHistoryEntry): string {
  const next = TRACKING_HISTORY_LABELS[entry.newStatus];
  return entry.previousStatus ? `${TRACKING_HISTORY_LABELS[entry.previousStatus]} → ${next}` : next;
}

function TrackingHistory({ noticeId }: { noticeId: number }) {
  const history = useQuery<TrackingHistoryEntry[], TendersApiError>({
    queryKey: tendersQueryKeys.noticeHistory(noticeId),
    queryFn: () => fetchTrackingHistory(noticeId),
  });

  if (history.isPending) return <LoadingBlock label="Carregando o histórico…" />;
  if (history.isError) {
    return <LoadError message={history.error.message} onRetry={() => void history.refetch()} retrying={history.isFetching} />;
  }
  if (history.data.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Ninguém da conta acompanhou este edital ainda.</p>;
  }
  return (
    <ol className="grid grid-cols-1 gap-2">
      {history.data.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{historyChange(entry)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {entry.userName ?? 'Usuário removido'} · {formatIsoDateTime(entry.createdAt)}
          </p>
          {entry.note && <p className="mt-1 whitespace-pre-line text-xs text-slate-600 dark:text-slate-300">{entry.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export function NoticeTrackingTab({ notice }: { notice: NoticeDetail }) {
  const save = useSaveTracking();
  const remove = useRemoveTracking();
  const confirm = useConfirm();
  const savedStatus = notice.tracking?.status ?? null;
  const savedNote = notice.tracking?.note ?? '';
  const [status, setStatus] = useState<TrackingStatus | null>(savedStatus);
  const [note, setNote] = useState(savedNote);

  // Gravado de novo (aqui ou nas ações rápidas): o formulário acompanha.
  useEffect(() => {
    setStatus(savedStatus);
    setNote(savedNote);
  }, [savedStatus, savedNote]);

  const dirty = status !== savedStatus || note.trim() !== savedNote;
  const busy = save.isPending || remove.isPending;
  const error = save.error ?? remove.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!status || !dirty) return;
    save.mutate({ noticeId: notice.id, status, note: note.trim() || null });
  };

  const removeTracking = async () => {
    const confirmed = await confirm({
      title: 'Remover acompanhamento',
      message: 'O edital deixa de ser acompanhado pela conta. A observação sai junto; o histórico fica.',
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (confirmed) remove.mutate(notice.id);
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3">
        <div role="group" aria-label="Status do acompanhamento" className="flex flex-wrap gap-1.5">
          {TRACKING_STATUSES.map((option) => {
            const checked = status === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={checked}
                onClick={() => setStatus(option)}
                className={[
                  'h-9 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                  checked
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                ].join(' ')}
              >
                {TRACKING_STATUS_LABELS[option]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-1">
          <label htmlFor={`observacao-${notice.id}`} className="text-[11px] font-semibold text-[#64748b] dark:text-slate-400">
            Observação
          </label>
          <Textarea
            id={`observacao-${notice.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={MAX_TRACKING_NOTE_LENGTH}
            rows={4}
            placeholder="Ex.: pedir atestado de capacidade técnica; visita técnica até dia 10."
          />
          <p className="text-right text-[11px] text-slate-400">
            {note.length.toLocaleString('pt-BR')}/{MAX_TRACKING_NOTE_LENGTH.toLocaleString('pt-BR')}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
            {error.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={!status || !dirty || busy}>
            {save.isPending ? 'Salvando…' : 'Salvar acompanhamento'}
          </Button>
          {notice.tracking && (
            <button
              type="button"
              onClick={() => void removeTracking()}
              disabled={busy}
              className="h-9 rounded-xl px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              Remover acompanhamento
            </button>
          )}
          {notice.tracking?.updatedAt && (
            <span className="text-xs text-slate-500 dark:text-slate-400">Atualizado em {formatIsoDateTime(notice.tracking.updatedAt)}</span>
          )}
        </div>
      </form>

      <section aria-labelledby={`historico-${notice.id}`} className="grid grid-cols-1 gap-2">
        <h3 id={`historico-${notice.id}`} className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <History size={15} aria-hidden="true" />
          Histórico
        </h3>
        <TrackingHistory noticeId={notice.id} />
      </section>
    </div>
  );
}
