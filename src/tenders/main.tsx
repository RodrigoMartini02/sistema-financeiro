import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { TendersApp } from './TendersApp';
import { TENDERS_APP_BASE } from './utils/modulePaths';
import '../styles/globals.css';

// Entrada do app de Licitações (tenders.html), servida só em /licitacoes/app/*.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <ConfirmProvider>
          <BrowserRouter basename={TENDERS_APP_BASE}>
            <TendersApp />
          </BrowserRouter>
        </ConfirmProvider>
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
