import { Route, Routes } from 'react-router-dom';
import { getToken } from '../services/session';
import { LoadingState } from '../ui/states';
import { useTenderAccess } from './hooks/useTenderAccess';
import { TendersShell } from './layout/TendersShell';
import { AdminAccountsScreen } from './screens/AdminAccountsScreen';
import { GateErrorScreen, NoAccessScreen } from './screens/GateScreens';
import { HomeScreen } from './screens/HomeScreen';
import { NoticeScreen } from './screens/NoticeScreen';
import { NotFoundScreen, PlaceholderScreen, SettingsPlaceholderScreen } from './screens/PlaceholderScreens';
import { SavedSearchesScreen } from './screens/SavedSearchesScreen';
import { SearchScreen } from './screens/SearchScreen';
import { TendersLoginScreen } from './screens/TendersLoginScreen';
import { NETWORK_ERROR_MESSAGE } from './services/tendersApiError';
import { resolveGateState } from './utils/gateState';

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
      return <TendersLoginScreen />;
    case 'loading':
      return <LoadingState title="Abrindo Licitações" description="Conferindo o seu acesso." />;
    case 'noModule':
    case 'memberWithoutAccess':
      return <NoAccessScreen reason={state} />;
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
        <Route path="acompanhamento" element={<PlaceholderScreen title="Acompanhamento" />} />
        <Route path="notificacoes" element={<PlaceholderScreen title="Notificações" />} />
        <Route path="configuracoes" element={<SettingsPlaceholderScreen />} />
        <Route path="admin/contas" element={<AdminAccountsScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  );
}
