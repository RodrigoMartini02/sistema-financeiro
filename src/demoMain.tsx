import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useAppContext } from './context/AppContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { FirstAccessGuideProvider } from './context/FirstAccessGuideContext';
import { AppShell, type AppSection } from './layout/AppShell';
import { FinanceDashboard } from './screens/finance/FinanceDashboard';
import { MovimentacoesScreen } from './screens/finance/MovimentacoesScreen';
import { ReportsScreen } from './screens/reports/ReportsScreen';
import { IncomeDialog } from './screens/finance/IncomeDialog';
import { ExpenseDialog } from './screens/finance/expense-dialog/ExpenseDialog';
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
      case 'movimentacoes': return <MovimentacoesScreen />;
      case 'reports': return <ReportsScreen />;
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
        onSave={async (items) => { for (const v of items) await finance.saveIncome.mutateAsync({ values: v }); setQuickAction('none'); }}
      />
      <ExpenseDialog open={quickAction === 'nova-despesa'} onClose={() => setQuickAction('none')} />
    </AppShell>
  );
}

function DemoApp() {
  return (
    <QueryClientProvider client={demoQueryClient}>
      <ConfirmProvider>
        <FirstAccessGuideProvider isDemoMode>
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
