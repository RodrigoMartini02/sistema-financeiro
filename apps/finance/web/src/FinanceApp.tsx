import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { AppProvider, useAppContext } from '@ui/context/AppContext';
import { ConfirmProvider } from '@ui/context/ConfirmContext';
import { FirstAccessGuideProvider } from '@ui/context/FirstAccessGuideContext';
import { FinanceDashboard } from './screens/finance/FinanceDashboard';
import { MovimentacoesScreen } from './screens/finance/MovimentacoesScreen';
import { ReportsScreen } from './screens/reports/ReportsScreen';
import { ClientsScreen } from './screens/clients/ClientsScreen';
import { CONFIG_SCOPE_CLASS } from '@ui/components/configTokens';
import { useAuthSession } from './hooks/useAuthSession';
import { ErrorState, LoadingState } from '@ui/components/states';
import { AppShell } from './layout/AppShell';
import { PlanExpiredGate } from './components/auth/PlanExpiredGate';
import { PremiumUpsell } from './components/PremiumUpsell';
import { UpdatePwaBanner } from '@ui/pwa/UpdatePwaBanner';
import type { AppSection } from './layout/AppShell';
import type { ConfigItemId } from './layout/ConfigPanel';
import { IncomeDialog } from './screens/finance/income-dialog/IncomeDialog';
import { ExpenseDialog } from './screens/finance/expense-dialog/ExpenseDialog';
import { fetchPlanStatus } from './services/planosService';
import { useOnboardingChecklist, type OnboardingTarget } from './hooks/useOnboardingChecklist';
import { OnboardingChecklistModal } from './components/OnboardingChecklistModal';
import { queryKeys } from './services/queryKeys';
import { useActiveAccount } from './hooks/useActiveAccount';
import { useOwnPermissions } from './hooks/useOwnPermissions';
import { EmptyState } from '@ui/components/EmptyState';
import { resolveSection, visibleSections, type AccountType } from './utils/screenAccess';
import { hasPremiumFeatures, planGateReason } from './utils/planFeatures';
import { FINANCE_LOGIN_ADDRESS } from './utils/authOrigin';

function AppContent() {
  const session = useAuthSession();
  const [section, setSection] = useState<AppSection>('movimentacoes');
  const [openConfigRequest, setOpenConfigRequest] = useState<{ token: number; item: ConfigItemId } | undefined>();
  const { quickAction, setQuickAction, quickActionMonth, fillViewport } = useAppContext();

  const planQuery = useQuery({
    queryKey: queryKeys.planStatus,
    queryFn: fetchPlanStatus,
    enabled: !!session.user,
    staleTime: 3 * 60 * 1000,
  });

  const hasPlanAccess = planQuery.data?.status === 'trial' || planQuery.data?.status === 'ativo';
  const premium = hasPremiumFeatures(planQuery.data);

  // Resolve a conta ativa (localStorage) antes de disparar qualquer busca de
  // saldo/dashboard. Sem isso, a primeira renderização após o login roda com
  // getActiveAccountId() === null (a conta ainda não foi persistida), e o
  // saldo do mês soma receitas/despesas de TODAS as contas do usuário juntas
  // — um bug de mistura entre contas, não de família. Este hook também
  // recarrega a página assim que grava a conta ativa pela primeira vez.
  const { activeAccount, contas: contasDoUsuario, isLoading: contasLoading, willReloadForAccountSwitch } =
    useActiveAccount({ enabled: !!session.user });
  // Resolvido quando a query terminou, não há uma troca de conta pendente
  // (que recarregaria a página), e ou já existe conta ativa, ou o usuário
  // simplesmente não tem nenhuma conta (nada a aguardar nesse caso).
  const activeAccountResolved =
    !contasLoading && !willReloadForAccountSwitch && (!!activeAccount || contasDoUsuario.length === 0);

  // O checklist ensina a montar a conta (categorias, cartões, clientes...):
  // é tarefa do titular, não de membro ou colaborador.
  const isOwner = session.user?.tipo === 'titular' || session.user?.tipo === 'admin';
  const onboarding = useOnboardingChecklist(
    !!session.user && hasPlanAccess && activeAccountResolved && isOwner,
  );

  // Tela mostrada: a escolhida, se a pessoa pode abri-la; senão a primeira
  // liberada (ver resolveSection). Enquanto as permissões carregam, nenhuma.
  const ownPermissions = useOwnPermissions({ enabled: !!session.user && hasPlanAccess });
  const accountType = localStorage.getItem('contaAtivaTipo') as AccountType | null;
  const shownSection = ownPermissions ? resolveSection(section, visibleSections(ownPermissions, accountType)) : undefined;

  // Sem sessão (ou com ela inválida), a entrada é a página de Finanças com o login aberto.
  if (!session.hasToken || session.isError) {
    window.location.replace(FINANCE_LOGIN_ADDRESS);
    return <LoadingState title="Redirecionando" description="Abrindo a entrada de acesso." />;
  }
  if (session.isLoading) return <LoadingState title="Carregando painel" description="Validando sua sessão." />;

  if (planQuery.isLoading) {
    return <LoadingState title="Carregando plano" description="Verificando seu acesso ao sistema." />;
  }
  if (planQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState title="Não foi possível verificar seu plano" description="Tente atualizar a página." />
      </div>
    );
  }
  const gateReason = planQuery.data ? planGateReason(planQuery.data) : null;
  if (planQuery.data && gateReason) {
    return <PlanExpiredGate planStatus={planQuery.data} reason={gateReason} />;
  }

  const handleNavigate = (sec: AppSection) => {
    setSection(sec);
  };

  const openSubscription = () => {
    setOpenConfigRequest((prev) => ({ token: (prev?.token ?? 0) + 1, item: 'assinatura' }));
  };

  const handleOnboardingGoTo = (target: OnboardingTarget) => {
    if (target.kind === 'clientes') {
      setSection('clientes');
      return;
    }
    setOpenConfigRequest((prev) => ({ token: (prev?.token ?? 0) + 1, item: target.item }));
  };

  const renderContent = () => {
    if (shownSection === undefined) return null;
    if (shownSection === null) {
      return (
        <EmptyState
          icon={Lock}
          title="Nenhuma tela liberada"
          description="Fale com o titular da conta para liberar o seu acesso."
        />
      );
    }
    switch (shownSection) {
      case 'painel':        return <FinanceDashboard />;
      case 'movimentacoes': return <MovimentacoesScreen />;
      case 'reports':       return <ReportsScreen />;
      // A seção usa os tokens das Configurações (`.config-scope`). Clientes e contratos são do Premium.
      case 'clientes':
        return premium
          ? <div className={CONFIG_SCOPE_CLASS}><ClientsScreen /></div>
          : (
            <PremiumUpsell
              description="Clientes, contratos e catálogo de serviços estão no plano Premium."
              onSubscribe={openSubscription}
            />
          );
    }
  };

  return (
    <AppShell
      user={session.user}
      activeSection={shownSection ?? section}
      onNavigate={(s) => handleNavigate(s)}
      openConfigRequest={openConfigRequest}
      fillViewport={shownSection === 'movimentacoes' && fillViewport}
    >
      {renderContent()}

      <IncomeDialog open={quickAction === 'nova-receita'} onClose={() => setQuickAction('none')} />
      <ExpenseDialog open={quickAction === 'nova-despesa'} initialMonth={quickActionMonth} onClose={() => setQuickAction('none')} />
      <OnboardingChecklistModal
        open={onboarding.isVisible}
        items={onboarding.items}
        onDismiss={onboarding.dismiss}
        onSilenceAll={onboarding.silenceAll}
        onGoToTarget={handleOnboardingGoTo}
      />
    </AppShell>
  );
}

/** App de Finanças (app.html): sessão, plano e as telas do sistema. */
export function FinanceApp() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <FirstAccessGuideProvider>
          <AppContent />
          <UpdatePwaBanner />
        </FirstAccessGuideProvider>
      </ConfirmProvider>
    </AppProvider>
  );
}
