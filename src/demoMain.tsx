import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useAppContext } from './context/AppContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { FirstAccessGuideProvider } from './context/FirstAccessGuideContext';
import { AppShell, type AppSection } from './layout/AppShell';
import { FinanceDashboard } from './screens/finance/FinanceDashboard';
import { MovimentacoesScreen } from './screens/finance/MovimentacoesScreen';
import { ReservasScreen } from './screens/reservas/ReservasScreen';
import { RelatoriosScreen } from './screens/relatorios/RelatoriosScreen';
import { IncomeDialog } from './screens/finance/IncomeDialog';
import { ExpenseDialog } from './screens/finance/ExpenseDialog';
import { useFinanceDashboard } from './hooks/useFinanceDashboard';
import './styles/globals.css';

const demoQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

function DemoAppContent() {
  const [section, setSection] = useState<AppSection>('movimentacoes');
  const now = new Date();
  const [month] = useState(now.getMonth());
  const [year] = useState(now.getFullYear());
  const { quickAction, setQuickAction } = useAppContext();
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

function DemoApp() {
  return (
    <QueryClientProvider client={demoQueryClient}>
      <ConfirmProvider>
        <FirstAccessGuideProvider>
          <AppProvider>
            <DemoAppContent />
          </AppProvider>
        </FirstAccessGuideProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>,
);
