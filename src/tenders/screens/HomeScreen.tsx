import { useQuery } from '@tanstack/react-query';
import { MapPin, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { getLocalTodayIso } from '../../utils/date';
import { CountBars } from '../components/CountBars';
import { FunnelChart, UnreadNotifications } from '../components/DashboardActivity';
import { AgendaList, FavoritesList } from '../components/DashboardAgenda';
import { DashboardCards, type ContractsIndicator } from '../components/DashboardCards';
import { ExpiringContractsPanel } from '../components/DashboardContracts';
import { Panel, panelLinkClass } from '../components/DashboardPanel';
import { ContractSearchesSummary, SavedSearchesSummary } from '../components/DashboardSearches';
import { DashboardSetupGuide } from '../components/DashboardSetupGuide';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { useExpiringContracts } from '../hooks/useExpiringContracts';
import { fetchDashboard } from '../services/overviewService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { DashboardView, ExpiringContractsView } from '../types';
import { buildSetupGuide, expiringHint } from '../utils/dashboard';
import { formatIsoDateTime } from '../utils/dates';

/** O indicador de contratos que vencem: o valor chega com a consulta do armazém, e até lá (ou se falhar) mostra o porquê. */
function contractsIndicator(contracts: { data: ExpiringContractsView | undefined; isPending: boolean; error: TendersApiError | null }): ContractsIndicator {
  if (contracts.data) return { value: contracts.data.within30Days, hint: expiringHint(contracts.data) };
  if (contracts.isPending) return { value: null, hint: 'Carregando…' };
  return { value: null, hint: isContractStoreUpdating(contracts.error) ? 'Contratos sendo atualizados' : 'Indisponível agora' };
}

/**
 * Início (escopo, seção 9.4, e plano .plans/licitacoes-inicio-painel.md): indicadores, agenda de prazos, contratos que
 * vencem, funil, editais por UF, notificações, favoritos e buscas salvas. Os contratos que vencem vêm de outra consulta,
 * que lê o armazém: o Início abre sem esperar por ela.
 */
export function HomeScreen() {
  const dashboard = useQuery<DashboardView, TendersApiError>({ queryKey: tendersQueryKeys.dashboard, queryFn: fetchDashboard });
  const expiring = useExpiringContracts();

  if (dashboard.isPending) return <LoadingBlock label="Carregando o painel…" />;
  if (dashboard.isError) {
    return <LoadError title="Não foi possível carregar o painel" message={dashboard.error.message} onRetry={() => void dashboard.refetch()} retrying={dashboard.isFetching} />;
  }

  const view = dashboard.data;
  const todayIso = getLocalTodayIso();
  const setupGuide = buildSetupGuide(view.setup, view.contractSavedSearches.length > 0);
  return (
    <section className="grid grid-cols-1 gap-4">
      {setupGuide.show && <DashboardSetupGuide guide={setupGuide} />}

      <DashboardCards cards={view.cards} pipeline={view.pipeline} contracts={contractsIndicator(expiring)} todayIso={todayIso} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 content-start gap-4 lg:col-span-2">
          <Panel title="Agenda de prazos">
            <AgendaList notices={view.closingSoon} todayIso={todayIso} />
          </Panel>
          <Panel
            title="Contratos vencendo"
            action={
              <Link to="/contratos" className={panelLinkClass}>
                Ver contratos
              </Link>
            }
          >
            <ExpiringContractsPanel query={expiring} />
          </Panel>
          <Panel
            title="Favoritos com prazo aberto"
            action={
              <Link to="/favoritos" className={panelLinkClass}>
                Ver favoritos
              </Link>
            }
          >
            <FavoritesList notices={view.favorites} />
          </Panel>
        </div>
        <div className="grid grid-cols-1 content-start gap-4">
          <Panel
            title="Funil de acompanhamento"
            action={
              <Link to="/acompanhamento" className={panelLinkClass}>
                Ver quadro
              </Link>
            }
          >
            <FunnelChart funnel={view.funnel} />
          </Panel>
          <Panel
            title={view.notifications.unreadCount > 0 ? `Notificações não lidas (${view.notifications.unreadCount.toLocaleString('pt-BR')})` : 'Notificações não lidas'}
            action={
              <Link to="/notificacoes" className={panelLinkClass}>
                Ver todas
              </Link>
            }
          >
            <UnreadNotifications notifications={view.notifications} />
          </Panel>
          <Panel title="Editais abertos por UF">
            {view.openByState.length === 0 ? (
              <EmptyState icon={MapPin} title="Sem dados ainda." description="O gráfico usa os editais abertos das suas buscas salvas." />
            ) : (
              <CountBars label="Editais abertos por UF" items={view.openByState.map((item) => ({ key: item.state, label: item.state, count: item.count }))} />
            )}
          </Panel>
          <Panel
            title="Minhas buscas salvas"
            action={
              <Link to="/buscas" className={panelLinkClass}>
                Ver todas
              </Link>
            }
          >
            <SavedSearchesSummary searches={view.savedSearches} />
          </Panel>
          <Panel
            title="Minhas buscas de contratos"
            action={
              <Link to="/contratos" className={panelLinkClass}>
                Ver contratos
              </Link>
            }
          >
            <ContractSearchesSummary searches={view.contractSavedSearches} />
          </Panel>
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
