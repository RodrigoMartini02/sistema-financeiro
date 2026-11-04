import type { UseQueryResult } from '@tanstack/react-query';
import { FileClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { ExpiringContractsView } from '../types';
import { expiringCategoryItems, expiringWindowItems } from '../utils/dashboard';
import { CountBars } from './CountBars';
import { DashboardCard, dashboardLinkClass } from './DashboardCard';
import { ContractsUpdating, LoadError, LoadingBlock } from './LoadStates';

function ExpiringBody({ view }: { view: ExpiringContractsView }) {
  if (view.sources.savedSearches === 0 && view.sources.favorites === 0) {
    return (
      <EmptyState
        icon={FileClock}
        title="Nenhuma busca de contratos ativa nem contrato favorito."
        description="Salve uma busca ou favorite contratos para ver aqui o que vence nos próximos 90 dias."
        action={
          <Link to="/contratos" className={dashboardLinkClass}>
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
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Por prazo</h3>
        <CountBars label="Contratos que vencem por prazo" labelSize="wide" items={expiringWindowItems(view)} />
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Por categoria, em até 90 dias</h3>
        <CountBars label="Contratos que vencem por categoria" labelSize="stacked" items={expiringCategoryItems(view.byCategory)} />
      </div>
    </div>
  );
}

function ExpiringContent({ query }: { query: UseQueryResult<ExpiringContractsView, TendersApiError> }) {
  if (query.isPending) return <LoadingBlock label="Carregando os contratos…" />;
  if (query.isError) {
    if (isContractStoreUpdating(query.error)) {
      return <ContractsUpdating message={query.error.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
    }
    return <LoadError title="Não foi possível carregar os contratos" message={query.error.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <ExpiringBody view={query.data} />;
}

/**
 * Contratos que vencem em 30, 60 e 90 dias e por categoria. A consulta lê o armazém, então carrega à parte e falha
 * sozinha, sem derrubar o resto do Dashboard.
 */
export function ExpiringContractsCard({ query }: { query: UseQueryResult<ExpiringContractsView, TendersApiError> }) {
  return (
    <DashboardCard
      title="Contratos que vencem"
      subtitle="Das suas buscas de contratos ativas e dos contratos favoritos"
      action={
        <Link to="/contratos" className={dashboardLinkClass}>
          Ver contratos
        </Link>
      }
      className="h-full"
    >
      <ExpiringContent query={query} />
    </DashboardCard>
  );
}
