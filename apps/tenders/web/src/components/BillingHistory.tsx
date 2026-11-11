import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { Badge } from '@ui/components/badge';
import { EmptyState } from '@ui/components/EmptyState';
import { fetchBillingHistory } from '../services/billingService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { BillingHistory as BillingHistoryData } from '../types';
import { eventAmount, eventNote, eventTitle, groupBillingEvents, statusView } from '../utils/billingHistory';
import { formatIsoDateTime } from '../utils/dates';
import { LoadError, LoadingBlock } from './LoadStates';

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';

/**
 * Histórico de cobrança da assinatura (só o titular, dentro da aba Assinatura): pagamentos aprovados e recusados,
 * ativação e cancelamento da assinatura recorrente, agrupados por mês, do mais recente ao mais antigo. A conta em
 * cortesia não tem cobrança, e a lista vazia diz isso.
 */
export function BillingHistory({ accountId, courtesy }: { accountId: number; courtesy: boolean }) {
  const titleId = useId();
  const history = useQuery<BillingHistoryData, TendersApiError>({
    queryKey: tendersQueryKeys.billingHistory(accountId),
    queryFn: () => fetchBillingHistory(accountId),
  });

  return (
    <section aria-labelledby={titleId} className="grid grid-cols-1 gap-3">
      <h3 id={titleId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">Histórico de cobrança</h3>

      {history.isPending && <LoadingBlock label="Carregando o histórico…" />}
      {history.isError && (
        <LoadError
          title="Não foi possível carregar o histórico"
          message={history.error.message}
          onRetry={() => void history.refetch()}
          retrying={history.isFetching}
        />
      )}
      {history.isSuccess && history.data.events.length === 0 && (
        <EmptyState
          icon={Receipt}
          title={courtesy ? 'Cortesia: não há cobrança nesta conta.' : 'Nenhuma cobrança ainda.'}
          description={courtesy ? undefined : 'Os pagamentos e os cancelamentos da assinatura aparecem aqui.'}
        />
      )}
      {history.isSuccess &&
        groupBillingEvents(history.data.events).map((group) => (
          <div key={group.key} className="grid grid-cols-1 gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group.label}</h4>
            <ul className="grid grid-cols-1 gap-2">
              {group.events.map((event) => {
                const status = statusView(event.status);
                const amount = eventAmount(event);
                const note = eventNote(event);
                return (
                  <li key={event.id} className={`${CARD_CLASS} flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{eventTitle(event)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatIsoDateTime(event.occurredAt)}
                        {note ? ` · ${note}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {amount && <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{amount}</span>}
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </section>
  );
}
