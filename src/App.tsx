import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { FirstAccessGuideProvider } from './context/FirstAccessGuideContext';
import { HomePage } from './screens/public/HomePage';
import { FuncionalidadesPage } from './screens/public/FuncionalidadesPage';
import { SobrePage } from './screens/public/SobrePage';
import { PlanosPage } from './screens/public/PlanosPage';
import { ContatoPage } from './screens/public/ContatoPage';
import { LegalPage } from './screens/public/LegalPage';
import { PublicSeo } from './screens/public/components/PublicSeo';
import { FinanceDashboard } from './screens/finance/FinanceDashboard';
import { MovimentacoesScreen } from './screens/finance/MovimentacoesScreen';
import { ReservasScreen } from './screens/reservas/ReservasScreen';
import { RelatoriosScreen } from './screens/relatorios/RelatoriosScreen';
import { PlanosScreen } from './screens/planos/PlanosScreen';
import { ConfigScreen } from './screens/config/ConfigScreen';
import { useAuthSession } from './hooks/useAuthSession';
import { ErrorState, LoadingState } from './ui/states';
import { AppShell } from './layout/AppShell';
import { CookieBanner } from './components/CookieBanner';
import type { AppSection, ConfigTab } from './layout/AppShell';
import { IncomeDialog } from './screens/finance/IncomeDialog';
import { ExpenseDialog } from './screens/finance/ExpenseDialog';
import { useFinanceDashboard } from './hooks/useFinanceDashboard';
import { apiRequest } from './services/apiClient';
import { trackPageView } from './services/analyticsService';
import { useOnboardingChecklist } from './hooks/useOnboardingChecklist';
import { OnboardingChecklistModal } from './components/OnboardingChecklistModal';
import { queryKeys } from './services/queryKeys';

interface PlanoStatus {
  status: 'trial' | 'ativo' | 'expirado';
  plano_tipo: string | null;
  plano_expiracao: string | null;
  dias_restantes_trial: number | null;
}

function PlanExpiredGate({ trialExpired }: { trialExpired: boolean }) {
  const qc = useQueryClient();
  const title = trialExpired ? 'Período de teste encerrado' : 'Plano vencido';
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">Fingerence</p>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: queryKeys.planStatus })}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 transition"
          >
            Já paguei — verificar
          </button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <p className="mb-8 text-center text-sm text-slate-500">
          Seus dados estão preservados. Escolha um plano para continuar usando o Fingerence.
        </p>
        <PlanosScreen />
      </div>
    </div>
  );
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
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}

function AppContent() {
  const isAppRoute = window.location.pathname.endsWith('/app.html') || window.location.pathname.includes('app.html');
  const session = useAuthSession({ enabled: isAppRoute });
  const [section, setSection] = useState<AppSection>('movimentacoes');
  const [configTab, setConfigTab] = useState<ConfigTab>('conta');
  const { month, year, setMonth, quickAction, setQuickAction, fillViewport } = useAppContext();

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
  const finance = useFinanceDashboard(month, year, hasPlanAccess);
  const onboarding = useOnboardingChecklist(isAppRoute && !!session.user && hasPlanAccess);

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
    return <PlanExpiredGate trialExpired={!planQuery.data.plano_tipo} />;
  }

  const handleNavigate = (sec: AppSection, targetMonth?: number) => {
    setSection(sec);
    if (targetMonth !== undefined) setMonth(targetMonth);
  };

  const handleConfigTab = (tab: ConfigTab) => {
    setSection('configuracoes');
    setConfigTab(tab);
  };

  const renderContent = () => {
    switch (section) {
      case 'painel':        return <FinanceDashboard />;
      case 'movimentacoes': return <MovimentacoesScreen onManageReserves={() => handleNavigate('reservas')} />;
      case 'reservas':      return <ReservasScreen />;
      case 'relatorios':    return <RelatoriosScreen />;
      case 'planos':        return <PlanosScreen />;
      case 'configuracoes': return <ConfigScreen activeTab={configTab} onTabChange={setConfigTab} />;
    }
  };

  return (
    <AppShell
      user={session.user}
      activeSection={section}
      onNavigate={(s) => handleNavigate(s)}
      configTab={configTab}
      onConfigTab={handleConfigTab}
      fillViewport={section === 'movimentacoes' && fillViewport}
    >
      {renderContent()}

      <IncomeDialog
        open={quickAction === 'nova-receita'}
        month={month} year={year}
        isSaving={finance.saveIncome.isPending}
        error={finance.saveIncome.error?.message}
        onClose={() => setQuickAction('none')}
        onSave={async (values) => { await finance.saveIncome.mutateAsync({ values }); setQuickAction('none'); }}
      />
      <ExpenseDialog
        open={quickAction === 'nova-despesa'}
        month={month} year={year}
        isSaving={finance.saveExpense.isPending}
        error={finance.saveExpense.error?.message}
        onClose={() => setQuickAction('none')}
        onSave={async (items) => { for (const v of items) await finance.saveExpense.mutateAsync({ values: v }); setQuickAction('none'); }}
      />
      <OnboardingChecklistModal
        open={onboarding.isVisible}
        items={onboarding.items}
        onDismiss={onboarding.dismiss}
        onGoToTab={handleConfigTab}
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
        </FirstAccessGuideProvider>
      </ConfirmProvider>
    </AppProvider>
  );
}
