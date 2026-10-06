import { Route, Routes } from 'react-router-dom';
import { getToken } from '../services/session';
import { LoadingState } from '../ui/states';
import { useTenderAccess } from './hooks/useTenderAccess';
import { TendersShell } from './layout/TendersShell';
import { GateErrorScreen, NoAccessScreen } from './screens/GateScreens';
import {
  NoticePlaceholderScreen,
  NotFoundScreen,
  PlaceholderScreen,
  SearchPlaceholderScreen,
  SettingsPlaceholderScreen,
} from './screens/PlaceholderScreens';
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
        <Route index element={<PlaceholderScreen title="Início" />} />
        <Route path="buscar" element={<SearchPlaceholderScreen />} />
        <Route path="editais/:id" element={<NoticePlaceholderScreen />} />
        <Route path="buscas" element={<PlaceholderScreen title="Buscas salvas" />} />
        <Route path="acompanhamento" element={<PlaceholderScreen title="Acompanhamento" />} />
        <Route path="notificacoes" element={<PlaceholderScreen title="Notificações" />} />
        <Route path="configuracoes" element={<SettingsPlaceholderScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  );
}
