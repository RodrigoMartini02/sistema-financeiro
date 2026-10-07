import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AppProvider, useAppContext } from './context/AppContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { FirstAccessGuideProvider } from './context/FirstAccessGuideContext';
import { AboutPage } from './screens/public/AboutPage';
import { ContactPage } from './screens/public/ContactPage';
import { FinancePage } from './screens/public/FinancePage';
import { HomePage } from './screens/public/HomePage';
import { LegalPage } from './screens/public/LegalPage';
import { ProductsPage } from './screens/public/ProductsPage';
import { TendersPage } from './screens/public/TendersPage';
import { StorefrontPage } from './screens/public/storefront/StorefrontPage';
import { StorefrontCartPage } from './screens/public/storefront/StorefrontCartPage';
import { StorefrontCheckoutPage } from './screens/public/storefront/StorefrontCheckoutPage';
import { StorefrontOrderPage } from './screens/public/storefront/StorefrontOrderPage';
import { PublicLayout } from './screens/public/components/PublicLayout';
import { PublicSeo } from './screens/public/components/PublicSeo';
import { FinanceDashboard } from './screens/finance/FinanceDashboard';
import { MovimentacoesScreen } from './screens/finance/MovimentacoesScreen';
import { ReportsScreen } from './screens/reports/ReportsScreen';
import { ClientsScreen } from './screens/clients/ClientsScreen';
import { CONFIG_SCOPE_CLASS } from './ui/configTokens';
import { useAuthSession } from './hooks/useAuthSession';
import { ErrorState, LoadingState } from './ui/states';
import { AppShell } from './layout/AppShell';
import { CookieBanner } from './components/CookieBanner';
import { PlanExpiredGate } from './components/auth/PlanExpiredGate';
import { PremiumUpsell } from './components/PremiumUpsell';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { UpdatePwaBanner } from './components/UpdatePwaBanner';
import type { AppSection } from './layout/AppShell';
import type { ConfigItemId } from './layout/ConfigPanel';
import { IncomeDialog } from './screens/finance/income-dialog/IncomeDialog';
import { ExpenseDialog } from './screens/finance/expense-dialog/ExpenseDialog';
import { fetchPlanStatus } from './services/planosService';
import { trackPageView } from './services/analyticsService';
import { useOnboardingChecklist, type OnboardingTarget } from './hooks/useOnboardingChecklist';
import { OnboardingChecklistModal } from './components/OnboardingChecklistModal';
import { queryKeys } from './services/queryKeys';
import { useActiveAccount } from './hooks/useActiveAccount';
import { useOwnPermissions } from './hooks/useOwnPermissions';
import { EmptyState } from './ui/EmptyState';
import { resolveSection, visibleSections, type AccountType } from './utils/screenAccess';
import { hasPremiumFeatures, planGateReason } from './utils/planFeatures';
import { FINANCE_LOGIN_ADDRESS } from './utils/authOrigin';

/** Vitrine de uma loja (link novo ou antigo) e as páginas dela: são da empresa, não do FINGERENCE. */
function isStorefrontPath(pathname: string): boolean {
  return /^\/(loja|catalogo)\/[^/]+(\/.*)?$/.test(pathname);
}

/**
 * Partes do site do FINGERENCE que não entram na vitrine: SEO, contagem de
 * acessos, aviso de cookies e o convite para instalar o app.
 */
function MarketingSiteOnly({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return isStorefrontPath(pathname) ? null : <>{children}</>;
}

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
      <MarketingSiteOnly>
        <PublicPageTracker />
        <PublicSeo />
      </MarketingSiteOnly>
      <Routes>
        {/* Site da empresa (plano .plans/site-novo.md), dentro da moldura comum. */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          {/* A volta do login com Google chega em /index.html. */}
          <Route path="/index.html" element={<HomePage />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/produtos/financas" element={<FinancePage />} />
          <Route path="/produtos/licitacoes" element={<TendersPage />} />
          <Route path="/sobre" element={<AboutPage />} />
          <Route path="/contato" element={<ContactPage />} />
          <Route path="/termos" element={<LegalPage type="termos" />} />
          <Route path="/privacidade" element={<LegalPage type="privacidade" />} />
          <Route path="*" element={<HomePage />} />
        </Route>
        {/* Endereços antigos do site; na hospedagem, o ideal é o 301. */}
        <Route path="/funcionalidades/*" element={<Navigate to="/produtos/financas/" replace />} />
        <Route path="/planos/*" element={<Navigate to="/produtos/" replace />} />
        <Route path="/loja/:storefront" element={<StorefrontPage />} />
        <Route path="/loja/:storefront/sacola" element={<StorefrontCartPage />} />
        <Route path="/loja/:storefront/checkout" element={<StorefrontCheckoutPage />} />
        <Route path="/loja/:storefront/pedido/:pedidoId" element={<StorefrontOrderPage />} />
        {/* Link antigo da vitrine, com o código: continua abrindo a mesma loja. */}
        <Route path="/catalogo/:storefront" element={<StorefrontPage />} />
      </Routes>
      <MarketingSiteOnly>
        <CookieBanner />
        <InstallPwaBanner />
      </MarketingSiteOnly>
    </BrowserRouter>
  );
}

function AppContent() {
  const isAppRoute = window.location.pathname.endsWith('/app.html') || window.location.pathname.includes('app.html');
  const session = useAuthSession({ enabled: isAppRoute });
  const [section, setSection] = useState<AppSection>('movimentacoes');
  const [openConfigRequest, setOpenConfigRequest] = useState<{ token: number; item: ConfigItemId } | undefined>();
  const { quickAction, setQuickAction, fillViewport } = useAppContext();

  const planQuery = useQuery({
    queryKey: queryKeys.planStatus,
    queryFn: fetchPlanStatus,
    enabled: isAppRoute && !!session.user,
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
