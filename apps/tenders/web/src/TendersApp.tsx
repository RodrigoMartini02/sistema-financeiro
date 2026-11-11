import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingState } from '@ui/components/states';
import { useTenderAccess } from './hooks/useTenderAccess';
import { TendersShell } from './layout/TendersShell';
import { AdminAccountsScreen } from './screens/AdminAccountsScreen';
import { CnpjScreen } from './screens/CnpjScreen';
import { CompetitorsScreen } from './screens/CompetitorsScreen';
import { ContractScreen } from './screens/ContractScreen';
import { ContractsScreen } from './screens/ContractsScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { ExpiredScreen, GateErrorScreen, NoAccessScreen } from './screens/GateScreens';
import { NoticeScreen } from './screens/NoticeScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { SavedSearchesScreen } from './screens/SavedSearchesScreen';
import { SearchScreen } from './screens/SearchScreen';
import { TrackingScreen } from './screens/TrackingScreen';
import { getToken } from './services/session';
import { NETWORK_ERROR_MESSAGE } from './services/tendersApiError';
import { expiredInfoFrom, resolveGateState } from './utils/gateState';
import { TENDERS_LOGIN_ADDRESS } from './utils/loginAddress';
import { settingsRouteTarget } from './utils/settings';

/** App de Licitações: entrada no módulo (sessão e acesso) e rotas dentro da moldura. */
export function TendersApp() {
  const hasToken = Boolean(getToken());
  const access = useTenderAccess(hasToken);
  const state = resolveGateState({
    hasToken: Boolean(getToken()),
    accessStatus: access.status,
    errorStatus: access.error?.status ?? null,
  });

  switch (state) {
    case 'login':
      // Sem sessão (ou com ela vencida), a entrada é a página de Licitações com o login aberto.
      window.location.replace(TENDERS_LOGIN_ADDRESS);
      return <LoadingState title="Redirecionando" description="Abrindo a entrada de acesso." />;
    case 'loading':
      return <LoadingState title="Abrindo Licitações" description="Conferindo o seu acesso." />;
    case 'memberWithoutAccess':
      return <NoAccessScreen />;
    case 'expired':
      return <ExpiredScreen info={expiredInfoFrom(access.error?.data)} message={access.error?.message ?? NETWORK_ERROR_MESSAGE} />;
    case 'error':
      return (
        <GateErrorScreen
          message={access.error?.message ?? NETWORK_ERROR_MESSAGE}
          onRetry={() => void access.refetch()}
          retrying={access.isFetching}
        />
      );
    case 'ready':
      break;
  }

  if (!access.data) {
    return null;
  }
  return (
    <Routes>
      <Route element={<TendersShell access={access.data} />}>
        <Route index element={<DashboardScreen />} />
        <Route path="buscar" element={<SearchScreen />} />
        <Route path="contratos" element={<ContractsScreen />} />
        <Route path="contratos/:chave" element={<ContractScreen />} />
        <Route path="concorrentes" element={<CompetitorsScreen />} />
        <Route path="cnpj/:cnpj" element={<CnpjScreen />} />
        <Route path="editais/:id" element={<NoticeScreen />} />
        <Route path="buscas" element={<SavedSearchesScreen />} />
        <Route path="favoritos" element={<FavoritesScreen />} />
        <Route path="acompanhamento" element={<TrackingScreen />} />
        {/* O Mercado Pago volta por aqui depois da cobrança: abre a página inicial com as Configurações em modal. */}
        <Route path="configuracoes" element={<Navigate to={settingsRouteTarget(access.data.permissions)} replace />} />
        <Route path="admin/contas" element={<AdminAccountsScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  );
}
