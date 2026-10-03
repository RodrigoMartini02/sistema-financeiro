import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AppProvider, useAppContext } from './context/AppContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { FirstAccessGuideProvider } from './context/FirstAccessGuideContext';
import { HomePage } from './screens/public/HomePage';
import { FuncionalidadesPage } from './screens/public/FuncionalidadesPage';
import { SobrePage } from './screens/public/SobrePage';
import { PlanosPage } from './screens/public/PlanosPage';
import { ContatoPage } from './screens/public/ContatoPage';
import { LegalPage } from './screens/public/LegalPage';
import { CatalogoPublicoPage } from './screens/public/CatalogoPublicoPage';
import { PublicSeo } from './screens/public/components/PublicSeo';
import { FinanceDashboard } from './screens/finance/FinanceDashboard';
import { MovimentacoesScreen } from './screens/finance/MovimentacoesScreen';
import { ReportsScreen } from './screens/reports/ReportsScreen';
import { ClientesTab } from './screens/config/ClientesTab';

import { CONFIG_SCOPE_CLASS } from './ui/configTokens';
import { useAuthSession } from './hooks/useAuthSession';
import { ErrorState, LoadingState } from './ui/states';
import { AppShell } from './layout/AppShell';
import { CookieBanner } from './components/CookieBanner';
import { PlanExpiredGate, type PlanoStatus } from './components/auth/PlanExpiredGate';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { UpdatePwaBanner } from './components/UpdatePwaBanner';
import type { AppSection } from './layout/AppShell';
import type { ConfigItemId } from './layout/ConfigPanel';
import { IncomeDialog } from './screens/finance/income-dialog/IncomeDialog';
import { ExpenseDialog } from './screens/finance/expense-dialog/ExpenseDialog';
import { apiRequest } from './services/apiClient';
import { trackPageView } from './services/analyticsService';
import { useOnboardingChecklist, type OnboardingTarget } from './hooks/useOnboardingChecklist';
import { OnboardingChecklistModal } from './components/OnboardingChecklistModal';
import { queryKeys } from './services/queryKeys';
import { useActiveAccount } from './hooks/useActiveAccount';
import { useOwnPermissions } from './hooks/useOwnPermissions';
import { EmptyState } from './ui/EmptyState';
import { resolveSection, visibleSections, type AccountType } from './utils/screenAccess';

function PublicPageTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}
function PublicSite() {
  return (
    <BrowserRouter>
      <PublicPageTracker />
      <PublicSeo />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/index.html" element={<HomePage />} />
        <Route path="/funcionalidades" element={<FuncionalidadesPage />} />
        <Route path="/sobre" element={<SobrePage />} />
        <Route path="/planos" element={<PlanosPage />} />
        <Route path="/contato" element={<ContatoPage />} />
        <Route path="/termos" element={<LegalPage type="termos" />} />
        <Route path="/privacidade" element={<LegalPage type="privacidade" />} />
        <Route path="/catalogo/:contaId" element={<CatalogoPublicoPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <CookieBanner />
      <InstallPwaBanner />
    </BrowserRouter>
  );
}

function AppContent() {
  const isAppRoute = window.location.pathname.endsWith('/app.html') || window.location.pathname.includes('app.html');
  const session = useAuthSession({ enabled: isAppRoute });
  const [section, setSection] = useState<AppSection>('movimentacoes');
  const [openConfigRequest, setOpenConfigRequest] = useState<{ token: number; item: ConfigItemId } | undefined>();
  const { quickAction, setQuickAction, fillViewport } = useAppContext();

  const planQuery = useQuery<PlanoStatus>({
    queryKey: queryKeys.planStatus,
    queryFn: async () => {
      const r = await apiRequest<any>('/planos/status');
      return r.data ?? r;
    },
    enabled: isAppRoute && !!session.user,
    staleTime: 3 * 60 * 1000,
  });

  const hasPlanAccess = planQuery.data?.status === 'trial' || planQuery.data?.status === 'ativo';

  // Resolve a conta ativa (localStorage) antes de disparar qualquer busca de
  // saldo/dashboard. Sem isso, a primeira renderização após o login roda com
  // getActiveAccountId() === null (a conta ainda não foi persistida), e o
  // saldo do mês soma receitas/despesas de TODAS as contas do usuário juntas
  // — um bug de mistura entre contas, não de família. Este hook também
  // recarrega a página assim que grava a conta ativa pela primeira vez.
  const { activeAccount, contas: contasDoUsuario, isLoading: contasLoading, willReloadForAccountSwitch } =
    useActiveAccount({ enabled: isAppRoute && !!session.user });
  // Resolvido quando a query terminou, não há uma troca de conta pendente
  // (que recarregaria a página), e ou já existe conta ativa, ou o usuário
  // simplesmente não tem nenhuma conta (nada a aguardar nesse caso).
  const activeAccountResolved =
    !contasLoading && !willReloadForAccountSwitch && (!!activeAccount || contasDoUsuario.length === 0);

  // O checklist ensina a montar a conta (categorias, cartões, clientes...):
  // é tarefa do titular, não de membro ou colaborador.
  const isOwner = session.user?.tipo === 'titular' || session.user?.tipo === 'admin';
  const onboarding = useOnboardingChecklist(
    isAppRoute && !!session.user && hasPlanAccess && activeAccountResolved && isOwner,
  );

  // Tela mostrada: a escolhida, se a pessoa pode abri-la; senão a primeira
  // liberada (ver resolveSection). Enquanto as permissões carregam, nenhuma.
  const ownPermissions = useOwnPermissions({ enabled: isAppRoute && !!session.user && hasPlanAccess });
  const accountType = localStorage.getItem('contaAtivaTipo') as AccountType | null;
  const shownSection = ownPermissions ? resolveSection(section, visibleSections(ownPermissions, accountType)) : undefined;

  if (!isAppRoute) return <PublicSite />;
  if (!session.hasToken) {
    window.location.replace('/index.html');
    return <LoadingState title="Redirecionando" description="Abrindo a entrada de acesso." />;
  }
  if (session.isLoading) return <LoadingState title="Carregando painel" description="Validando sua sessão." />;
  if (session.isError) return <PublicSite />;

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
  if (planQuery.data?.status === 'expirado') {
    return <PlanExpiredGate planStatus={planQuery.data} />;
  }

  const handleNavigate = (sec: AppSection) => {
    setSection(sec);
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
      // ClientesTab também é usada dentro do ConfigPanel, que já aplica o
      // escopo. Aqui ela é tela própria da sidebar, fora do drawer, então
      // precisa declarar o escopo por conta própria — sem ele as variáveis
      // --cfg-* não resolvem e os componentes de Configurações perdem cor.
      case 'clientes':      return <div className={CONFIG_SCOPE_CLASS}><ClientesTab /></div>;
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
      <ExpenseDialog open={quickAction === 'nova-despesa'} onClose={() => setQuickAction('none')} />
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

export function App() {
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
