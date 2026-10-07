import { Route, Routes } from 'react-router-dom';
import { getToken } from '../services/session';
import { LoadingState } from '../ui/states';
import { TENDERS_LOGIN_ADDRESS } from '../utils/authOrigin';
import { useTenderAccess } from './hooks/useTenderAccess';
import { TendersShell } from './layout/TendersShell';
import { AdminAccountsScreen } from './screens/AdminAccountsScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { ExpiredScreen, GateErrorScreen, NoAccessScreen } from './screens/GateScreens';
import { HomeScreen } from './screens/HomeScreen';
import { NoticeScreen } from './screens/NoticeScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { SavedSearchesScreen } from './screens/SavedSearchesScreen';
import { SearchScreen } from './screens/SearchScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TrackingScreen } from './screens/TrackingScreen';
import { NETWORK_ERROR_MESSAGE } from './services/tendersApiError';
import { expiredInfoFrom, resolveGateState } from './utils/gateState';

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
    case 'noModule':
    case 'memberWithoutAccess':
      return <NoAccessScreen reason={state} />;
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
        <Route index element={<HomeScreen />} />
        <Route path="buscar" element={<SearchScreen />} />
        <Route path="editais/:id" element={<NoticeScreen />} />
        <Route path="buscas" element={<SavedSearchesScreen />} />
        <Route path="favoritos" element={<FavoritesScreen />} />
        <Route path="acompanhamento" element={<TrackingScreen />} />
        <Route path="notificacoes" element={<NotificationsScreen />} />
        <Route path="configuracoes" element={<SettingsScreen />} />
        <Route path="admin/contas" element={<AdminAccountsScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  );
}
