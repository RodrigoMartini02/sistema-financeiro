import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { getLocalTodayIso } from '../../utils/date';
import { AgenciesCard, DeadlineLoadCard, FunnelCard, SphereCard, StatesCard } from '../components/DashboardBarCards';
import { DashboardCards, type ContractsIndicator } from '../components/DashboardCards';
import { ExpiringContractsCard } from '../components/DashboardContracts';
import { DashboardModalityCards } from '../components/DashboardModalityCards';
import { DashboardPublications } from '../components/DashboardPublications';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { useExpiringContracts } from '../hooks/useExpiringContracts';
import { fetchDashboard } from '../services/overviewService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { DashboardView, ExpiringContractsView } from '../types';
import { expiringHint } from '../utils/dashboard';
import { formatIsoDateTime } from '../utils/dates';

/** O indicador de contratos que vencem: o valor chega com a consulta do armazém, e até lá (ou se falhar) mostra o porquê. */
function contractsIndicator(contracts: { data: ExpiringContractsView | undefined; isPending: boolean; error: TendersApiError | null }): ContractsIndicator {
  if (contracts.data) return { value: contracts.data.within30Days, hint: expiringHint(contracts.data) };
  if (contracts.isPending) return { value: null, hint: 'Carregando…' };
  return { value: null, hint: isContractStoreUpdating(contracts.error) ? 'Contratos sendo atualizados' : 'Indisponível agora' };
}

/**
 * Dashboard (escopo, seção 9.4, e plano .plans/licitacoes-dashboard-gestao.md): só números e gráficos de quantidade.
 * Os contratos que vencem vêm de outra consulta, que lê o armazém: o Dashboard abre sem esperar por ela.
 */
export function DashboardScreen() {
  const dashboard = useQuery<DashboardView, TendersApiError>({ queryKey: tendersQueryKeys.dashboard, queryFn: fetchDashboard });
  const expiring = useExpiringContracts();

  if (dashboard.isPending) return <LoadingBlock label="Carregando o dashboard…" />;
  if (dashboard.isError) {
    return <LoadError title="Não foi possível carregar o dashboard" message={dashboard.error.message} onRetry={() => void dashboard.refetch()} retrying={dashboard.isFetching} />;
  }

  const view = dashboard.data;
  return (
    <section className="grid grid-cols-1 gap-4">
      <DashboardCards cards={view.cards} contracts={contractsIndicator(expiring)} todayIso={getLocalTodayIso()} />

      <section aria-labelledby="dashboard-modalities" className="grid grid-cols-1 gap-2">
        <h2 id="dashboard-modalities" className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Por modalidade
        </h2>
        <DashboardModalityCards modalities={view.modalities} days={view.publications.daily.map((point) => point.day)} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardPublications view={view} />
        </div>
        <FunnelCard funnel={view.funnel} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DeadlineLoadCard load={view.deadlineLoad} />
        <StatesCard openByState={view.openByState} />
        <SphereCard openBySphere={view.openBySphere} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AgenciesCard topAgencies={view.topAgencies} />
        <div className="lg:col-span-2">
          <ExpiringContractsCard query={expiring} />
        </div>
      </div>

      <p
        className={`flex items-center gap-1.5 text-xs ${
          view.lastRunFailed ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {view.lastRunFailed && <TriangleAlert size={14} aria-hidden="true" />}
        Última atualização dos dados: {view.lastUpdateAt ? formatIsoDateTime(view.lastUpdateAt) : 'ainda não houve coleta'}
        {view.lastRunFailed && ' · a última coleta falhou, e os dados podem estar desatualizados.'}
      </p>
    </section>
  );
}
