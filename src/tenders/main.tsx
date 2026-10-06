import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { TendersApp } from './TendersApp';
import { TENDERS_APP_BASE, appAddressFor } from './utils/modulePaths';
import '../styles/globals.css';

// Entrada do app de Licitações (tenders.html), servida em /licitacoes/app/*.
// `/licitacoes` abre o sistema: troca o endereço aqui, sem recarregar e sem 301.
const appAddress = appAddressFor(window.location);
if (appAddress) {
  window.history.replaceState(null, '', appAddress);
}

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
        <BrowserRouter basename={TENDERS_APP_BASE}>
          <TendersApp />
        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
