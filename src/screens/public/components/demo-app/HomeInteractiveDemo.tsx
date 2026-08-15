import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useAppContext } from '../../../../context/AppContext';
import { ConfirmProvider } from '../../../../context/ConfirmContext';
import { AppShell, type AppSection } from '../../../../layout/AppShell';
import { FinanceDashboard } from '../../../finance/FinanceDashboard';
import { MovimentacoesScreen } from '../../../finance/MovimentacoesScreen';
import { ReservasScreen } from '../../../reservas/ReservasScreen';
import { RelatoriosScreen } from '../../../relatorios/RelatoriosScreen';
import { IncomeDialog } from '../../../finance/IncomeDialog';
import { ExpenseDialog } from '../../../finance/ExpenseDialog';
import { useFinanceDashboard } from '../../../../hooks/useFinanceDashboard';
import { DemoModeProvider } from '../../../../services/demo/demoModeContext';

const demoQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

function DemoAppContent() {
  const [section, setSection] = useState<AppSection>('painel');
  const { month, year, quickAction, setQuickAction } = useAppContext();
  const finance = useFinanceDashboard(month, year);

  const renderContent = () => {
    switch (section) {
      case 'painel': return <FinanceDashboard />;
      case 'movimentacoes': return <MovimentacoesScreen onManageReserves={() => setSection('reservas')} />;
      case 'reservas': return <ReservasScreen />;
      case 'relatorios': return <RelatoriosScreen />;
      default: return <FinanceDashboard />;
    }
  };

  return (
    <AppShell isDemoMode activeSection={section} onNavigate={setSection}>
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
    </AppShell>
  );
}

export function HomeInteractiveDemo() {
  return (
    <section aria-labelledby="demo-interativa-title" className="public-light-panel relative isolate border-b border-slate-200 bg-white py-12 sm:py-14 xl:py-16">
      <div className="mx-auto max-w-[1800px] px-5 sm:px-8 xl:px-10">
        <header className="mx-auto max-w-[1000px] text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.26em] text-site-accent">EXPERIMENTE AGORA</p>
          <h2 id="demo-interativa-title" className="mx-auto mt-4 max-w-[820px] text-[clamp(28px,2.8vw,44px)] font-semibold leading-[1.1] text-slate-950 text-balance">
            Use o sistema de verdade, com seus próprios dados.
          </h2>
          <p className="mx-auto mt-4 max-w-[680px] text-[15px] leading-relaxed text-slate-600">
            Lance uma despesa, uma receita, crie uma reserva e veja tudo refletir na hora. É uma
            demonstração — nada aqui é salvo.
          </p>
        </header>

        <div className="mt-8 overflow-hidden rounded-[24px] shadow-[0_0_28px_rgba(14,196,216,0.06),0_20px_60px_rgba(0,0,0,0.28)]">
          <QueryClientProvider client={demoQueryClient}>
            <DemoModeProvider>
              <ConfirmProvider>
                <AppProvider>
                  <DemoAppContent />
                </AppProvider>
              </ConfirmProvider>
            </DemoModeProvider>
          </QueryClientProvider>
        </div>
      </div>
    </section>
  );
}
