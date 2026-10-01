import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '../../types/auth';
import { useAuthSession } from '../../hooks/useAuthSession';
import { apiRequest } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { setAuthOrigin } from '../../services/session';
import { ErrorState, LoadingState } from '../../ui/states';
import { LoginPage } from '../../screens/public/LoginPage';
import { PlanExpiredGate, type PlanoStatus } from './PlanExpiredGate';

interface AuthenticatedAppGateProps {
  children: (user: AuthUser) => ReactNode;
  sessionErrorFallback?: ReactNode;
}

export function AuthenticatedAppGate({ children, sessionErrorFallback }: AuthenticatedAppGateProps) {
  const session = useAuthSession();
  const planQuery = useQuery<PlanoStatus>({
    queryKey: queryKeys.planStatus,
    queryFn: async () => {
      const response = await apiRequest<PlanoStatus | { data?: PlanoStatus }>('/planos/status');
      return 'data' in response && response.data ? response.data : response as PlanoStatus;
    },
    enabled: !!session.user,
    staleTime: 3 * 60 * 1000,
  });

  useEffect(() => {
    if (!session.hasToken) {
      setAuthOrigin('assistant');
    }
  }, [session.hasToken]);

  if (!session.hasToken) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-sm">
          <LoginPage tone="light" />
        </div>
      </div>
    );
  }
  if (session.isLoading) {
    return <LoadingState title="Carregando painel" description="Validando sua sessao." />;
  }
  if (session.isError || !session.user) {
    return sessionErrorFallback ?? (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState title="Nao foi possivel validar sua sessao" description="Tente entrar novamente." />
      </div>
    );
  }
  if (planQuery.isLoading) {
    return <LoadingState title="Carregando plano" description="Verificando seu acesso ao sistema." />;
  }
  if (planQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState title="Nao foi possivel verificar seu plano" description="Tente atualizar a pagina." />
      </div>
    );
  }
  if (planQuery.data?.status === 'expirado') {
    return <PlanExpiredGate planStatus={planQuery.data} />;
  }

  return <>{children(session.user)}</>;
}
