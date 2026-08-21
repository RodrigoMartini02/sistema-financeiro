import { useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '../../types/auth';
import { useAuthSession } from '../../hooks/useAuthSession';
import { apiRequest } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { setAuthOrigin } from '../../services/session';
import { ErrorState, LoadingState } from '../../ui/states';
import { PlanosScreen } from '../../screens/planos/PlanosScreen';
import { LoginPage } from '../../screens/public/LoginPage';

interface PlanoStatus {
  status: 'trial' | 'ativo' | 'expirado';
  plano_tipo: string | null;
  plano_expiracao: string | null;
  dias_restantes_trial: number | null;
}

interface AuthenticatedAppGateProps {
  children: (user: AuthUser) => ReactNode;
  sessionErrorFallback?: ReactNode;
}

function PlanExpiredGate({ trialExpired }: { trialExpired: boolean }) {
  const queryClient = useQueryClient();
  const title = trialExpired ? 'Periodo de teste encerrado' : 'Plano vencido';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">Fingerence</p>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          </div>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.planStatus })}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 transition hover:bg-slate-50"
          >
            Ja paguei - verificar
          </button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <p className="mb-8 text-center text-sm text-slate-500">
          Seus dados estao preservados. Escolha um plano para continuar usando o Fingerence.
        </p>
        <PlanosScreen />
      </div>
    </div>
  );
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
    return <PlanExpiredGate trialExpired={!planQuery.data.plano_tipo} />;
  }

  return <>{children(session.user)}</>;
}
