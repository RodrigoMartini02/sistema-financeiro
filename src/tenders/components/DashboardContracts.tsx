import type { UseQueryResult } from '@tanstack/react-query';
import { FileClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { ExpiringContract, ExpiringContractsView } from '../types';
import { contractPath } from '../utils/contractKey';
import { expiringBars } from '../utils/dashboard';
import { formatIsoDate } from '../utils/dates';
import { formatMoneyValue } from '../utils/money';
import { CountBars } from './CountBars';
import { panelLinkClass } from './DashboardPanel';
import { ContractsUpdating, LoadError, LoadingBlock } from './LoadStates';

function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return 'Vence hoje';
  return daysLeft === 1 ? 'Vence amanhã' : `Vence em ${daysLeft} dias`;
}

function ExpiringRow({ contract }: { contract: ExpiringContract }) {
  const place = [contract.agencyName, contract.state].filter(Boolean).join(' · ');
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <Link to={contractPath(contract.controlNumber)} className="group block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
        <p className="line-clamp-2 text-sm font-semibold text-slate-800 group-hover:text-brand-700 group-hover:underline dark:text-slate-100 dark:group-hover:text-brand-300">
          {contract.contractObject}
        </p>
        {place && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{place}</p>}
      </Link>
      <p className="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        <span className={`font-semibold ${contract.daysLeft <= 30 ? 'text-amber-700 dark:text-amber-300' : ''}`}>{daysLeftLabel(contract.daysLeft)}</span>
        {' · '}
        {formatIsoDate(contract.expiresOn)} · {formatMoneyValue(contract.globalValue)}
      </p>
    </li>
  );
}

function ExpiringBody({ view }: { view: ExpiringContractsView }) {
  if (view.sources.savedSearches === 0 && view.sources.favorites === 0) {
    return (
      <EmptyState
        icon={FileClock}
        title="Nenhuma busca de contratos ativa nem contrato favorito."
        description="Salve uma busca ou favorite contratos para ver aqui o que vence nos próximos 90 dias."
        action={
          <Link to="/contratos" className={panelLinkClass}>
            Ver contratos a vencer
          </Link>
        }
      />
    );
  }
  if (view.within90Days === 0) {
    return (
      <EmptyState
        icon={FileClock}
        title="Nenhum contrato seu vence nos próximos 90 dias."
        description="Considera as suas buscas de contratos ativas e os contratos favoritos."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4">
      <CountBars label="Contratos que vencem" labelSize="wide" items={expiringBars(view)} />
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {view.nearest.map((contract) => (
          <ExpiringRow key={contract.controlNumber} contract={contract} />
        ))}
      </ul>
    </div>
  );
}

/** Contratos que vencem em 30, 60 e 90 dias. A consulta lê o armazém, então carrega à parte e falha sozinha, sem derrubar o Início. */
export function ExpiringContractsPanel({ query }: { query: UseQueryResult<ExpiringContractsView, TendersApiError> }) {
  if (query.isPending) return <LoadingBlock label="Carregando os contratos…" />;
  if (query.isError) {
    if (isContractStoreUpdating(query.error)) {
      return <ContractsUpdating message={query.error.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
    }
    return <LoadError title="Não foi possível carregar os contratos" message={query.error.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <ExpiringBody view={query.data} />;
}
